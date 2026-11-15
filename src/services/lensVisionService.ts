import { getAISettings, queryAICompletion } from './aiService';

export interface VisionAnalysisContext {
  title?: string;
  subtitle?: string;
  caption?: string;
  totalFigures?: number;
}

export type LensTab = 'overview' | 'ocr' | 'exam';

/**
 * Obtiene la mejor clave o proveedor de visión disponible
 */
function getGeminiApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  const localKey =
    localStorage.getItem('contrareloj_gemini_api_key') ||
    localStorage.getItem('thea_gemini_api_key') ||
    getAISettings().geminiApiKey;
  return localKey && localKey.trim().length > 0 ? localKey.trim() : null;
}

function getGroqApiKey(): string | null {
  const settings = getAISettings();
  const key = settings.groqApiKey || settings.apiKey;
  return key && key.trim().length > 0 ? key.trim() : null;
}

/**
 * Llama a la API de Google Gemini (2.0 Flash / 1.5 Flash) directamente para análisis multimodal nativo
 */
async function callGeminiVision(
  base64Png: string,
  prompt: string,
  geminiKey: string
): Promise<string> {
  const cleanBase64 = base64Png.replace(/^data:image\/\w+;base64,/, '');
  const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];

  let lastError: Error | null = null;
  for (const model of models) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: 'image/png',
                    data: cleanBase64,
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1200,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const candidateText =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        data.candidates?.[0]?.text;

      if (candidateText && candidateText.trim().length > 0) {
        return candidateText.trim();
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`[LensVision] Error con modelo ${model}:`, err.message);
    }
  }

  throw lastError || new Error('No se pudo obtener respuesta de Gemini Vision.');
}

/**
 * Llama a la API de Groq con modelos de visión (llama-3.2-11b-vision-preview)
 */
async function callGroqVision(
  dataUrl: string,
  prompt: string,
  groqKey: string
): Promise<string> {
  const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.2-11b-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 1200,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq Vision ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('Groq Vision no devolvió contenido.');
  }
  return text.trim();
}

/**
 * Construye el prompt según el tipo de solicitud
 */
function buildPrompt(
  tab: LensTab,
  userQuery?: string,
  context?: VisionAnalysisContext
): string {
  const contextStr = context?.caption || context?.title
    ? `\nContexto del material de estudio: "${context.title || ''}${context.caption ? ` — ${context.caption}` : ''}"\n`
    : '';

  if (userQuery && userQuery.trim().length > 0) {
    return `Eres un tutor y asistente académico experto en análisis visual de figuras de estudio.${contextStr}
El estudiante ha seleccionado un recorte de la figura y pregunta lo siguiente:
"${userQuery.trim()}"

Instrucciones:
- Responde directamente a la duda del estudiante con precisión, rigor científico y claridad pedagógica.
- Si hay variables, fórmulas o valores en el recorte relevantes a la respuesta, nómbralos explícitamente en KaTeX ($...$).
- Sé conciso y estructurado.`;
  }

  if (tab === 'ocr') {
    return `Eres un extractor óptico (OCR) y analista de diagramas para estudiantes de ciencias y medicina.${contextStr}
Analiza detenidamente este recorte de figura:
1. **Texto y Etiquetas**: Transcribe todo el texto legible presente en la selección con su jerarquía.
2. **Fórmulas y Notación Matemática**: Si contiene fórmulas, ecuaciones o proporciones, transcríbelas rigurosamente en formato KaTeX/LaTeX encerradas entre signos de dólar ($...$ o $$...$$).
3. **Valores Numéricos y Unidades**: Lista los valores, umbrales, porcentajes o unidades de medida observados.
4. Si el texto o diagrama no tiene letras o números legibles, describe brevemente la forma o trazo visual detectado.`;
  }

  if (tab === 'exam') {
    return `Eres un examinador universitario y especialista pedagógico.${contextStr}
Basándote en los conceptos, relaciones, gráficos o mecanismos observados en este recorte de figura:
Genera exactamente **2 preguntas de examen tipo opción múltiple** con formato de alto rendimiento:

Para cada pregunta:
**Pregunta [N]:** [Enunciado clínico/académico basado en la interpretación de la figura]
- A) [Opción A]
- B) [Opción B]
- C) [Opción C]
- D) [Opción D]
**Respuesta correcta:** [Letra]
**Justificación:** [Explicación concisa y rigurosa de por qué esa opción es correcta según lo representado en la imagen].`;
  }

  // Por defecto: 'overview' (Visión General estilo Google Lens)
  return `Eres un profesor titular y tutor de aprendizaje visual interactivo.${contextStr}
Analiza minuciosamente el recorte de figura que el estudiante acaba de encuadrar:

Estructura tu respuesta con el siguiente formato profesional en Markdown:
### ✦ Visión General
Explica en 1 o 2 párrafos qué muestra este recorte: el concepto o fenómeno central que describe y su importancia.

### Puntos Clave y Mecanismos
- Explica los componentes, direcciones de flechas, ejes, capas o curvas visibles.
- Si hay fórmulas (como Ley de Laplace, curvas de tensión, etc.), explica qué significa cada variable en formato KaTeX ($...$).

### Clave para el Examen
Una regla mnemotécnica o conclusión rápida que el estudiante debe memorizar sobre este gráfico.`;
}

/**
 * Analiza un recorte de imagen con IA
 */
export async function analyzeImageSelection(
  croppedDataUrl: string,
  tab: LensTab = 'overview',
  userQuery?: string,
  context?: VisionAnalysisContext
): Promise<string> {
  const prompt = buildPrompt(tab, userQuery, context);

  // 1. Probar Google Gemini Multimodal si hay clave
  const geminiKey = getGeminiApiKey();
  if (geminiKey) {
    try {
      return await callGeminiVision(croppedDataUrl, prompt, geminiKey);
    } catch (err: any) {
      console.warn('[LensVision] Fallo en Gemini Vision, intentando respaldo...', err);
    }
  }

  // 2. Probar Groq Vision si hay clave
  const groqKey = getGroqApiKey();
  if (groqKey) {
    try {
      return await callGroqVision(croppedDataUrl, prompt, groqKey);
    } catch (err: any) {
      console.warn('[LensVision] Fallo en Groq Vision, intentando modelo general...', err);
    }
  }

  // 3. Fallback inteligente usando el motor general de IA de la app
  const fallbackPrompt = `${prompt}\n(Nota: Si la visión multimodal directa no está activa, deduce la explicación a partir del contexto del documento: ${context?.title || ''} ${context?.caption || ''}).`;
  try {
    const text = await queryAICompletion([
      {
        role: 'system',
        content:
          'Eres un tutor académico de excelencia especializado en razonamiento científico, fisiología, diagramas y preparación de exámenes.',
      },
      {
        role: 'user',
        content: fallbackPrompt,
      },
    ]);
    return text;
  } catch (err: any) {
    throw new Error(
      `No se pudo analizar el área seleccionada: ${err.message || 'Verifica tu clave de API en Configuración de IA'}`
    );
  }
}
