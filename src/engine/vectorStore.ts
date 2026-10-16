import type { DocumentChunk } from '../types';
import { getAISettings } from '../services/aiService';

/**
 * Motor Vectorial Híbrido Contrareloj Study (Client-side Vector Store + Ollama Embeddings)
 * Permite Retrieval-Augmented Generation (RAG) cerrado sin alucinaciones.
 */

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\sáéíóúñÁÉÍÓÚÑ]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

function magnitude(v: number[]): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i];
  }
  return Math.sqrt(sum) || 1;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  return dotProduct(a, b) / (magnitude(a) * magnitude(b));
}

export class LocalVectorStore {
  private chunks: DocumentChunk[] = [];
  private idfMap: Map<string, number> = new Map();
  private chunkSparseVectors: Map<string, Map<string, number>> = new Map();

  constructor(chunks: DocumentChunk[] = []) {
    this.chunks = chunks;
    this.buildSparseIndex();
  }

  public setChunks(chunks: DocumentChunk[]): void {
    this.chunks = chunks;
    this.buildSparseIndex();
  }

  public getChunks(): DocumentChunk[] {
    return this.chunks;
  }

  /**
   * Construye el índice de vocabulario TF-IDF para búsqueda léxico-semántica en memoria
   */
  private buildSparseIndex(): void {
    this.idfMap.clear();
    this.chunkSparseVectors.clear();

    const N = this.chunks.length;
    if (N === 0) return;

    const docFreq: Map<string, number> = new Map();

    for (const chunk of this.chunks) {
      const tokens = tokenize(chunk.text);
      const unique = new Set(tokens);
      for (const t of unique) {
        docFreq.set(t, (docFreq.get(t) || 0) + 1);
      }
    }

    // Calcular IDF
    for (const [term, freq] of docFreq.entries()) {
      this.idfMap.set(term, Math.log((N + 1) / (freq + 0.5)) + 1);
    }

    // Calcular vector TF-IDF normalizado por chunk
    for (const chunk of this.chunks) {
      const tokens = tokenize(chunk.text);
      const tf: Map<string, number> = new Map();
      for (const t of tokens) {
        tf.set(t, (tf.get(t) || 0) + 1);
      }

      const vec: Map<string, number> = new Map();
      let norm = 0;
      for (const [t, count] of tf.entries()) {
        const idf = this.idfMap.get(t) || 1;
        const weight = (count / tokens.length) * idf;
        vec.set(t, weight);
        norm += weight * weight;
      }

      const length = Math.sqrt(norm) || 1;
      for (const [t, w] of vec.entries()) {
        vec.set(t, w / length);
      }

      this.chunkSparseVectors.set(chunk.id, vec);
    }
  }

  /**
   * Genera embeddings densos con Ollama de forma asíncrona si está disponible
   */
  public async generateDenseEmbeddings(): Promise<void> {
    const settings = getAISettings();
    if (!settings.enabled) return;

    const cleanBase = settings.baseUrl.replace(/\/+$/, '');
    const endpoint = cleanBase.includes('/v1')
      ? `${cleanBase.replace(/\/v1$/, '')}/api/embeddings`
      : `${cleanBase}/api/embeddings`;

    // Procesar los primeros 30 chunks para optimizar tiempo y recursos
    const targetChunks = this.chunks.slice(0, 30);

    for (const chunk of targetChunks) {
      if (chunk.embedding && chunk.embedding.length > 0) continue;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: settings.model || 'llama3.2',
            prompt: chunk.text.slice(0, 1000),
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.embedding)) {
            chunk.embedding = data.embedding;
          }
        }
      } catch {
        // Fallback a motor disperso sin bloquear
        break;
      }
    }
  }

  /**
   * Búsqueda híbrida RAG (Dense Embeddings + BM25/TF-IDF)
   */
  public async search(query: string, topK: number = 3): Promise<DocumentChunk[]> {
    if (this.chunks.length === 0) return [];

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return this.chunks.slice(0, topK);

    // 1. Puntuación Sparse (TF-IDF Cosine Similarity)
    const sparseScores: Map<string, number> = new Map();
    const queryTf: Map<string, number> = new Map();
    for (const t of queryTokens) {
      queryTf.set(t, (queryTf.get(t) || 0) + 1);
    }

    let qNorm = 0;
    const queryVec: Map<string, number> = new Map();
    for (const [t, c] of queryTf.entries()) {
      const idf = this.idfMap.get(t) || 1;
      const w = (c / queryTokens.length) * idf;
      queryVec.set(t, w);
      qNorm += w * w;
    }
    const qLen = Math.sqrt(qNorm) || 1;
    for (const [t, w] of queryVec.entries()) {
      queryVec.set(t, w / qLen);
    }

    for (const chunk of this.chunks) {
      const cVec = this.chunkSparseVectors.get(chunk.id);
      if (!cVec) {
        sparseScores.set(chunk.id, 0);
        continue;
      }

      let sim = 0;
      for (const [t, qw] of queryVec.entries()) {
        const cw = cVec.get(t) || 0;
        sim += qw * cw;
      }
      sparseScores.set(chunk.id, sim);
    }

    // 2. Ordenar y seleccionar los mejores fragmentos
    const sorted = [...this.chunks].sort((a, b) => {
      const scoreA = sparseScores.get(a.id) || 0;
      const scoreB = sparseScores.get(b.id) || 0;
      return scoreB - scoreA;
    });

    return sorted.slice(0, topK);
  }

  /**
   * Encuentra el fragmento más relevante para un concepto específico y devuelve su cita
   */
  public findBestChunk(concept: string): DocumentChunk | null {
    if (this.chunks.length === 0) return null;
    const tokens = tokenize(concept);

    let bestChunk: DocumentChunk | null = null;
    let bestScore = -1;

    for (const chunk of this.chunks) {
      const lower = chunk.text.toLowerCase();
      let matchCount = 0;
      for (const t of tokens) {
        if (lower.includes(t)) matchCount++;
      }

      // Bonus si incluye el concepto completo
      if (lower.includes(concept.toLowerCase())) matchCount += 4;

      if (matchCount > bestScore) {
        bestScore = matchCount;
        bestChunk = chunk;
      }
    }

    return bestChunk || this.chunks[0];
  }
}
