import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Flashcard } from '../../../types';
import { ArrowLeft, CheckSquare, RotateCcw, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';
import { gameAudio } from './gameAudio';
import { cleanConceptDefinition, cleanConceptTerm, maskTermInDefinition } from '../flashcardSanitizer';
import { FormattedText } from '../../FormattedText';
import { useTheme } from '../../../services/themeService';

interface DefinitionBuilderGameProps {
  flashcards: Flashcard[];
  onBack: () => void;
  onGameComplete?: (score: number, termsMastered: string[]) => void;
}

interface BlankToken {
  index: number;
  word: string;
  isBlank: boolean;
  userWord: string | null;
}

const TOTAL_ROUNDS = 6;
const STOP_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'en', 'a', 'al', 'con', 'por', 'para', 'sin', 'sobre', 'entre',
  'y', 'e', 'o', 'u', 'que', 'se', 'su', 'sus', 'es', 'son', 'fue', 'eran',
]);

// Diccionario de alta confusión médica y biológica (antónimos, dianas funcionales, direcciones e iones)
const CONFUSION_PAIRS: Record<string, string[]> = {
  // Canales, Receptores, Transportadores y Estructuras
  canales: ['receptores', 'transportadores', 'bombas', 'poros', 'complejos'],
  canal: ['receptor', 'transportador', 'poro', 'complejo'],
  receptores: ['canales', 'transportadores', 'ligandos', 'moduladores'],
  receptor: ['canal', 'transportador', 'ligando', 'modulador'],
  transportadores: ['canales', 'receptores', 'bombas', 'transportadores'],
  transportador: ['canal', 'receptor', 'poro', 'portador'],
  bombas: ['canales', 'transportadores', 'receptores'],
  bomba: ['canal', 'transportador', 'receptor'],
  subunidades: ['cadenas', 'dominios', 'porciones', 'complejos'],
  subunidad: ['cadena', 'dominio', 'porción'],
  enzima: ['hormona', 'proteína', 'coenzima', 'sustrato'],
  enzimas: ['hormonas', 'proteínas', 'coenzimas', 'sustratos'],
  hormona: ['enzima', 'neurotransmisor', 'péptido', 'proteína'],
  hormonas: ['enzimas', 'neurotransmisores', 'péptidos', 'proteínas'],

  // Acciones y Verbos en 3ra persona singular (-e / -a)
  cierra: ['abre', 'bloquea', 'inactiva', 'estimula', 'activa'],
  abre: ['cierra', 'bloquea', 'activa', 'despolariza'],
  inhibe: ['estimula', 'activa', 'promueve', 'induce', 'aumenta'],
  estimula: ['inhibe', 'bloquea', 'suprime', 'reduce', 'detiene'],
  activa: ['inactiva', 'bloquea', 'inhibe', 'degrada', 'fosforila'],
  inactiva: ['activa', 'fosforila', 'estimula', 'induce'],
  bloquea: ['activa', 'estimula', 'abre', 'facilita', 'promueve'],
  aumenta: ['disminuye', 'reduce', 'mantiene', 'neutraliza'],
  disminuye: ['aumenta', 'incrementa', 'potencia', 'eleva'],
  reduce: ['aumenta', 'incrementa', 'potencia', 'mantiene'],
  incrementa: ['reduce', 'disminuye', 'inhibe'],
  secreta: ['absorbe', 'almacena', 'capta', 'degrada', 'sintetiza'],
  libera: ['retiene', 'almacena', 'capta', 'fija'],
  degrada: ['sintetiza', 'produce', 'fosforila', 'almacena'],
  sintetiza: ['degrada', 'hidroliza', 'metaboliza', 'libera'],
  promueve: ['inhibe', 'limita', 'bloquea', 'dificulta'],
  induce: ['previene', 'bloquea', 'suprime', 'reprime'],
  previene: ['induce', 'facilita', 'promueve'],
  fosforila: ['desfosforila', 'inactiva', 'degrada', 'metaboliza'],
  transloca: ['degrada', 'internaliza', 'recicla', 'fija'],
  une: ['separa', 'disocia', 'libera', 'degrada'],
  unión: ['disociación', 'separación', 'liberación', 'escisión'],

  // Localizaciones y Direcciones Biológicas
  intracelular: ['extracelular', 'mitocondrial', 'citosólico', 'nuclear', 'plasmático'],
  extracelular: ['intracelular', 'intersticial', 'citosólico', 'plasmático'],
  intracelulares: ['extracelulares', 'mitocondriales', 'citosólicos'],
  extracelulares: ['intracelulares', 'intersticiales', 'citosólicos'],
  citosólico: ['mitocondrial', 'nuclear', 'membranal', 'extracelular'],
  citosólica: ['mitocondrial', 'nuclear', 'membranal', 'extracelular'],
  mitocondrial: ['citosólico', 'nuclear', 'lisosomal', 'intracelular'],
  mitocondriales: ['citosólicos', 'nucleares', 'lisosomales'],
  hepática: ['muscular', 'renal', 'pancreática', 'adiposa'],
  hepático: ['muscular', 'renal', 'pancreático', 'adiposo'],
  hepáticas: ['musculares', 'renales', 'pancreáticas', 'adiposas'],
  muscular: ['hepática', 'adiposa', 'renal', 'pancreática'],
  musculares: ['hepáticas', 'adiposas', 'renales'],
  adiposa: ['hepática', 'muscular', 'endotelial'],
  adiposo: ['hepático', 'muscular', 'endotelial'],
  renal: ['hepática', 'pancreática', 'gástrica'],
  renales: ['hepáticas', 'pancreáticas', 'gástricas'],
  proximal: ['distal', 'medial', 'intermedio'],
  distal: ['proximal', 'medial', 'apical'],
  apical: ['basolateral', 'basal', 'luminal'],
  basolateral: ['apical', 'luminal', 'basal'],

  // Modificadores y Propiedades Farmacológicas
  dependiente: ['independiente', 'mediado', 'asociado', 'regulado'],
  independiente: ['dependiente', 'mediado', 'regulado'],
  dependientes: ['independientes', 'mediados', 'regulados'],
  independientes: ['dependientes', 'mediados', 'regulados'],
  sensibles: ['resistentes', 'insensibles', 'específicos'],
  sensible: ['resistente', 'insensible', 'específico'],
  resistentes: ['sensibles', 'susceptibles', 'específicos'],
  resistente: ['sensible', 'susceptible', 'específico'],
  agonista: ['antagonista', 'inhibidor', 'modulador', 'bloqueador'],
  antagonista: ['agonista', 'modulador', 'activador'],
  agonistas: ['antagonistas', 'inhibidores', 'bloqueadores'],
  antagonistas: ['agonistas', 'moduladores', 'activadores'],
  rápida: ['lenta', 'prolongada', 'intermedia', 'ultrarrápida'],
  rápido: ['lento', 'prolongado', 'intermedio', 'ultrarrápido'],
  ultrarrápida: ['intermedia', 'prolongada', 'lenta'],
  ultrarrápido: ['intermedio', 'prolongado', 'lento'],
  prolongada: ['rápida', 'intermedia', 'corta', 'ultrarrápida'],
  prolongado: ['rápido', 'intermedio', 'corto', 'ultrarrápido'],
  intermedia: ['rápida', 'prolongada', 'ultrarrápida'],
  lenta: ['rápida', 'inmediata', 'precoz'],
  primera: ['segunda', 'tercera', 'última'],
  segunda: ['primera', 'tercera'],

  // Sustancias e Iones Clave
  potasio: ['sodio', 'calcio', 'cloro', 'magnesio'],
  sodio: ['potasio', 'calcio', 'cloro'],
  calcio: ['potasio', 'sodio', 'magnesio'],
  glucosa: ['glucógeno', 'insulina', 'lactato', 'fructosa'],
  insulina: ['glucagón', 'somatostatina', 'amilina', 'cortisol'],
  glucagón: ['insulina', 'adrenalina', 'somatostatina'],
  glucogénesis: ['gluconeogénesis', 'glucogenólisis', 'glucólisis'],
  gluconeogénesis: ['glucogenólisis', 'glucogénesis', 'glucólisis'],
  glucogenólisis: ['gluconeogénesis', 'glucogénesis', 'glucólisis'],
  glucólisis: ['gluconeogénesis', 'glucogénesis', 'lipólisis'],

  // Sustantivos médicos terminados en -ción / -miento
  secreción: ['captación', 'producción', 'absorción', 'degradación', 'liberación'],
  captación: ['secreción', 'producción', 'excreción', 'liberación'],
  producción: ['degradación', 'captación', 'secreción', 'síntesis'],
  degradación: ['síntesis', 'producción', 'captación', 'activación'],
  absorción: ['secreción', 'excreción', 'eliminación'],
  translocación: ['fosforilación', 'activación', 'degradación', 'migración'],
  fosforilación: ['desfosforilación', 'translocación', 'metilación', 'activación'],
  proliferación: ['apoptosis', 'diferenciación', 'migración'],
  apoptosis: ['necrosis', 'proliferación', 'supervivencia'],
  almacenamiento: ['liberación', 'consumo', 'utilización'],
};

const cleanWord = (w: string) => w.replace(/[.,;:()¿?¡!]/g, '').trim();

// Puntuación de idoneidad para convertir una palabra en hueco clave y confuso
const scoreCandidateWord = (word: string): number => {
  const cw = cleanWord(word).toLowerCase();
  if (STOP_WORDS.has(cw) || cw.length < 4 || /^\d+$/.test(cw)) return -1;

  let score = 1;
  // Palabras con pares de confusión médicos definidos (máxima prioridad)
  if (CONFUSION_PAIRS[cw]) score += 14;
  for (const list of Object.values(CONFUSION_PAIRS)) {
    if (list.includes(cw)) {
      score += 10;
      break;
    }
  }

  // Verbos de acción o sufijos biológicos determinantes
  if (/(?:e|a|ar|ir|er|ando|endo)$/.test(cw) && cw.length >= 5) score += 3;
  if (/(?:ción|sión|miento|idad|ismo)$/.test(cw)) score += 4;
  if (/(?:ales|ores|antes|entes|icos|icas)$/.test(cw)) score += 5;

  return score;
};

// Generación de distractores que comparten categoría gramatical y crean duda genuina
const getSmartDistractors = (
  rawWord: string,
  kitVocabulary: string[],
  alreadyUsed: Set<string>
): string[] => {
  const cleanTarget = cleanWord(rawWord);
  const lowerTarget = cleanTarget.toLowerCase();
  const distractors: string[] = [];

  const addCandidate = (cand: string) => {
    const cleanCand = cleanWord(cand);
    const lowerCand = cleanCand.toLowerCase();
    if (!lowerCand || lowerCand === lowerTarget || alreadyUsed.has(lowerCand)) return;

    // Respetar mayúscula inicial si la palabra original estaba al inicio de frase
    const formatted = cleanTarget[0] === cleanTarget[0].toUpperCase() && cleanTarget.length > 1
      ? cleanCand.charAt(0).toUpperCase() + cleanCand.slice(1).toLowerCase()
      : cleanCand.toLowerCase();

    distractors.push(formatted);
    alreadyUsed.add(lowerCand);
  };

  // 1. Coincidencia directa en CONFUSION_PAIRS
  if (CONFUSION_PAIRS[lowerTarget]) {
    const candidates = [...CONFUSION_PAIRS[lowerTarget]].sort(() => Math.random() - 0.5);
    candidates.forEach(addCandidate);
  }

  // 2. Búsqueda inversa en los valores de CONFUSION_PAIRS
  if (distractors.length < 3) {
    for (const [key, values] of Object.entries(CONFUSION_PAIRS)) {
      if (values.includes(lowerTarget)) {
        addCandidate(key);
        [...values].sort(() => Math.random() - 0.5).forEach(addCandidate);
      }
    }
  }

  // 3. Concordancia morfológica / gramatical estricta con el vocabulario del kit
  if (distractors.length < 3) {
    const isPlural = lowerTarget.endsWith('s') || lowerTarget.endsWith('es');
    const endsWithCion = lowerTarget.endsWith('ción') || lowerTarget.endsWith('cion');
    const endsWithIca = lowerTarget.endsWith('ica') || lowerTarget.endsWith('ico');
    const endsWithTe = lowerTarget.endsWith('te') || lowerTarget.endsWith('tes');

    const grammaticalMatches = kitVocabulary.filter(w => {
      const lw = cleanWord(w).toLowerCase();
      if (lw.length < 4 || lw === lowerTarget || STOP_WORDS.has(lw) || /^\d+$/.test(lw)) return false;
      if (isPlural && !(lw.endsWith('s') || lw.endsWith('es'))) return false;
      if (!isPlural && (lw.endsWith('s') || lw.endsWith('es'))) return false;
      if (endsWithCion && !lw.endsWith('ción') && !lw.endsWith('cion')) return false;
      if (endsWithIca && !lw.endsWith('ica') && !lw.endsWith('ico')) return false;
      if (endsWithTe && !lw.endsWith('te') && !lw.endsWith('tes')) return false;
      return true;
    }).sort(() => Math.random() - 0.5);

    grammaticalMatches.forEach(addCandidate);
  }

  return distractors.slice(0, 3);
};

const getCardTerm = (c: Flashcard): string => cleanConceptTerm(c.term || (c as any).frontText || '');
const getCardDef = (c: Flashcard): string => cleanConceptDefinition(c.definition || (c as any).backText || '');

export const DefinitionBuilderGame: React.FC<DefinitionBuilderGameProps> = ({
  flashcards,
  onBack,
  onGameComplete,
}) => {
  const { theme } = useTheme();
  const [currentRound, setCurrentRound] = useState(0); // 0 to TOTAL_ROUNDS - 1
  const [score, setScore] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [masteredTerms, setMasteredTerms] = useState<string[]>([]);

  // Round specific state
  const [currentCard, setCurrentCard] = useState<Flashcard | null>(null);
  const [tokens, setTokens] = useState<BlankToken[]>([]);
  const [wordBank, setWordBank] = useState<{ id: string; word: string; isUsed: boolean }[]>([]);
  const [activeBlankIndex, setActiveBlankIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'idle' | 'correct' | 'wrong'>('idle');

  // Filter valid flashcards prioritizing rich, contextual definitions (>= 7 words)
  const validCards = useMemo(() => {
    const rich = flashcards.filter(f => {
      const def = getCardDef(f);
      return def && def.split(/\s+/).length >= 7;
    });
    if (rich.length >= 3) return rich;

    return flashcards.filter(f => {
      const def = getCardDef(f);
      return def && def.split(/\s+/).length >= 4;
    });
  }, [flashcards]);

  // Set up a round with pedagogical scaffolding (never consecutive blanks, rich anchor context)
  const setupRound = useCallback((roundIdx: number, usedIds: Set<string>) => {
    const pool = validCards.filter(c => !usedIds.has(c.id));
    const target = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : validCards[roundIdx % validCards.length];
    if (!target) return;

    setCurrentCard(target);
    const rawDef = getCardDef(target);
    const def = maskTermInDefinition(getCardTerm(target), rawDef);
    const rawWords = def.split(/\s+/).filter(Boolean);
    const totalWords = rawWords.length;

    // Determine target blank count: maximum 20-25% of words, never leaving the sentence without context
    let targetBlankCount = 1;
    if (totalWords >= 14) {
      targetBlankCount = 3;
    } else if (totalWords >= 8) {
      targetBlankCount = 2;
    } else {
      targetBlankCount = 1;
    }

    // Kit vocabulary for contextual distractor matching
    const kitVocabulary = validCards
      .flatMap(c => getCardDef(c).split(/\s+/))
      .map(cleanWord)
      .filter(w => w.length >= 4 && !STOP_WORDS.has(w.toLowerCase()) && !/^\d+$/.test(w));

    // Score and rank all candidate words by clinical/conceptual relevance and confusion potential
    const scoredCandidates = rawWords
      .map((w, idx) => ({ idx, word: w, score: scoreCandidateWord(w) }))
      .filter(c => c.score > 0);

    // Sort descending by score, adding small random factor to vary between rounds of the same card
    scoredCandidates.sort((a, b) => (b.score + Math.random() * 2) - (a.score + Math.random() * 2));

    const chosenBlankIndices = new Set<number>();
    for (const cand of scoredCandidates) {
      if (chosenBlankIndices.size >= targetBlankCount) break;

      // Rule 1: strictly NO consecutive blanks
      if (chosenBlankIndices.has(cand.idx - 1) || chosenBlankIndices.has(cand.idx + 1)) {
        continue;
      }

      // Rule 2: keep first word as visible anchor in short sentences (< 10 words) if alternatives exist
      if (cand.idx === 0 && totalWords < 10 && chosenBlankIndices.size === 0 && scoredCandidates.some(c => c.idx > 0)) {
        continue;
      }

      chosenBlankIndices.add(cand.idx);
    }

    // Fallback if none qualified
    if (chosenBlankIndices.size === 0 && rawWords.length > 0) {
      const mid = Math.floor(rawWords.length / 2);
      chosenBlankIndices.add(mid);
    }

    const parsedTokens: BlankToken[] = rawWords.map((rawWord, idx) => {
      const isBlank = chosenBlankIndices.has(idx);
      return {
        index: idx,
        word: rawWord,
        isBlank,
        userWord: null,
      };
    });

    // Gather correct words for the blanks
    const correctWords: string[] = [];
    parsedTokens.forEach(t => {
      if (t.isBlank) {
        correctWords.push(cleanWord(t.word));
      }
    });

    // Generate high-confusion, grammatically matched distractors tailored for EACH blank
    const alreadyUsed = new Set<string>(correctWords.map(w => w.toLowerCase()));
    const smartDistractors: string[] = [];

    correctWords.forEach(correctW => {
      const tailored = getSmartDistractors(correctW, kitVocabulary, alreadyUsed);
      // Seleccionar 2 competidores directos de alta confusión por cada hueco
      tailored.slice(0, 2).forEach(d => smartDistractors.push(d));
    });

    // Asegurar un total equilibrado de 3 a 6 distractores (banco total de 6 a 9 chips)
    const targetDistractorCount = Math.max(3, Math.min(6, correctWords.length * 2));
    if (smartDistractors.length < targetDistractorCount) {
      const fallbackCandidates = kitVocabulary
        .filter(w => !alreadyUsed.has(w.toLowerCase()))
        .sort(() => Math.random() - 0.5);

      for (const cand of fallbackCandidates) {
        if (smartDistractors.length >= targetDistractorCount) break;
        smartDistractors.push(cand.toLowerCase());
        alreadyUsed.add(cand.toLowerCase());
      }
    }

    // Combined word bank of 5 to 7 chips (focused, challenging, highly plausible)
    const bankItems = [...correctWords, ...smartDistractors]
      .sort(() => Math.random() - 0.5)
      .map((w, idx) => ({
        id: `chip-${idx}-${w}`,
        word: w,
        isUsed: false,
      }));

    setTokens(parsedTokens);
    setWordBank(bankItems);
    setFeedback('idle');

    // Default active blank is the first one
    const firstBlank = parsedTokens.findIndex(t => t.isBlank);
    setActiveBlankIndex(firstBlank !== -1 ? firstBlank : null);
  }, [validCards]);

  useEffect(() => {
    if (validCards.length > 0) {
      setupRound(0, new Set());
    }
  }, [setupRound, validCards]);

  // Click on chip from bank
  const handleBankChipClick = (chip: { id: string; word: string; isUsed: boolean }) => {
    if (chip.isUsed || feedback === 'correct') return;

    gameAudio.playTap();

    // Determine target blank slot: either activeBlankIndex if empty, or next available empty blank
    let targetIdx = activeBlankIndex;
    if (targetIdx === null || !tokens[targetIdx] || !tokens[targetIdx].isBlank || tokens[targetIdx].userWord !== null) {
      targetIdx = tokens.findIndex(t => t.isBlank && t.userWord === null);
    }

    if (targetIdx === -1) return; // All blanks full

    const newTokens = [...tokens];
    newTokens[targetIdx] = {
      ...newTokens[targetIdx],
      userWord: chip.word,
    };

    const newBank = wordBank.map(b => b.id === chip.id ? { ...b, isUsed: true } : b);

    setTokens(newTokens);
    setWordBank(newBank);

    // Find next empty blank to auto-focus
    const nextBlank = newTokens.findIndex((t, i) => i > targetIdx! && t.isBlank && t.userWord === null);
    const anyNext = nextBlank !== -1 ? nextBlank : newTokens.findIndex(t => t.isBlank && t.userWord === null);
    setActiveBlankIndex(anyNext !== -1 ? anyNext : null);

    // Check if all blanks filled
    const allFilled = newTokens.every(t => !t.isBlank || t.userWord !== null);
    if (allFilled) {
      validateRound(newTokens);
    }
  };

  // Click on a filled blank to return it to the bank
  const handleBlankClick = (tokenIndex: number) => {
    const token = tokens[tokenIndex];
    if (!token.isBlank || feedback === 'correct') return;

    if (token.userWord) {
      gameAudio.playTap();
      // Free chip in bank
      const newBank = [...wordBank];
      const usedChip = newBank.find(b => b.word.toLowerCase() === token.userWord?.toLowerCase() && b.isUsed);
      if (usedChip) {
        usedChip.isUsed = false;
      }

      const newTokens = [...tokens];
      newTokens[tokenIndex] = {
        ...newTokens[tokenIndex],
        userWord: null,
      };

      setTokens(newTokens);
      setWordBank(newBank);
      setActiveBlankIndex(tokenIndex);
      setFeedback('idle');
    } else {
      setActiveBlankIndex(tokenIndex);
    }
  };

  // Validate the completed sentence
  const validateRound = (currentTokens: BlankToken[]) => {
    let allCorrect = true;
    currentTokens.forEach(t => {
      if (t.isBlank) {
        const expected = cleanWord(t.word).toLowerCase();
        const actual = (t.userWord || '').toLowerCase();
        if (expected !== actual) {
          allCorrect = false;
        }
      }
    });

    if (allCorrect) {
      gameAudio.playSuccess();
      setFeedback('correct');

      const nextMultiplier = multiplier + 1;
      const pointsEarned = 100 * multiplier;
      const newScore = score + pointsEarned;
      setScore(newScore);
      setMultiplier(nextMultiplier);

      const currentTerm = currentCard ? getCardTerm(currentCard) : '';
      const updatedMastered = currentTerm ? [...masteredTerms, currentTerm] : masteredTerms;
      if (currentTerm) {
        setMasteredTerms(updatedMastered);
      }

      // Progress to next round after delay
      setTimeout(() => {
        if (currentRound + 1 >= TOTAL_ROUNDS) {
          setGameOver(true);
          confetti({
            particleCount: 130,
            spread: 80,
            origin: { y: 0.6 },
          });
          if (onGameComplete) {
            onGameComplete(newScore + 300, updatedMastered);
          }
        } else {
          const nextR = currentRound + 1;
          setCurrentRound(nextR);
          setupRound(nextR, new Set(updatedMastered));
        }
      }, 900);
    } else {
      gameAudio.playError();
      setFeedback('wrong');
      setMultiplier(1); // Reset multiplier on error
      setScore(prev => Math.max(0, prev - 30)); // Penalización por equivocación
    }
  };

  const handleRestart = () => {
    gameAudio.playTap();
    setCurrentRound(0);
    setScore(0);
    setMultiplier(1);
    setGameOver(false);
    setMasteredTerms([]);
    setupRound(0, new Set());
  };

  return (
    <div className={`w-full max-w-4xl mx-auto px-3 sm:px-6 py-2 sm:py-3 flex-1 flex flex-col justify-center animate-fadeIn ${
      theme === 'kitty' ? 'text-pink-950' : theme === 'light' ? 'text-slate-900' : 'text-slate-100'
    }`}>
      {/* Top Header Bar */}
      <div className="flex items-center justify-between mb-3 sm:mb-4 pb-2">
        <button
          type="button"
          onClick={() => {
            gameAudio.playTap();
            onBack();
          }}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-transform active:scale-[0.98] duration-150 cursor-pointer shadow-sm ${
            theme === 'kitty'
              ? 'bg-white hover:bg-pink-50 border border-pink-200 text-pink-900 shadow-xs'
              : theme === 'light'
              ? 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 shadow-xs'
              : 'bg-[#2a243d]/70 hover:bg-[#383152] border border-white/[0.12] text-slate-200'
          }`}
        >
          <ArrowLeft className={`w-4 h-4 ${theme === 'kitty' ? 'text-pink-500' : theme === 'light' ? 'text-slate-500' : 'text-slate-300'}`} />
          <span>Regresar a juegos</span>
        </button>

        <div className={`flex items-center gap-2.5 text-base sm:text-lg font-bold tracking-tight ${
          theme === 'kitty' ? 'text-pink-950 font-black' : theme === 'light' ? 'text-slate-900 font-black' : 'text-white'
        }`}>
          <CheckSquare className={`w-5 h-5 ${theme === 'kitty' ? 'text-pink-600' : theme === 'light' ? 'text-indigo-600' : 'text-indigo-400'}`} />
          <span>Constructor de Definiciones</span>
        </div>

        <div className="w-20" /> {/* Spacer to center title */}
      </div>

      {/* Main Card Frame */}
      <div className={`rounded-2xl border p-4 sm:p-6 shadow-2xl relative ${
        theme === 'kitty'
          ? 'bg-white border-pink-200 text-pink-950 shadow-[0_8px_30px_rgba(236,72,153,0.1)]'
          : theme === 'light'
          ? 'bg-white border-slate-200 text-slate-900 shadow-md'
          : 'bg-[#140e2b]/95 border-white/[0.12] text-white'
      }`}>
        {/* Top bar inside container: Puntuación & Round Indicator */}
        <div className={`flex items-center justify-between mb-4 pb-2.5 border-b tabular-nums ${
          theme === 'kitty' ? 'border-pink-200/70' : theme === 'light' ? 'border-slate-200' : 'border-white/[0.08]'
        }`}>
          <div className={`flex items-center gap-2 font-extrabold text-base sm:text-lg ${
            theme === 'kitty' ? 'text-emerald-700' : theme === 'light' ? 'text-emerald-700' : 'text-emerald-400'
          }`}>
            <span>Puntuación:</span>
            <span>{score}</span>
            <span className={`font-bold ml-0.5 ${
              theme === 'kitty' ? 'text-emerald-600' : theme === 'light' ? 'text-emerald-600' : 'text-emerald-300'
            }`}>({`×${multiplier}`})</span>
          </div>

          <div className={`font-semibold text-sm ${
            theme === 'kitty' ? 'text-pink-600' : theme === 'light' ? 'text-slate-500' : 'text-slate-400'
          }`}>
            <strong className={theme === 'kitty' ? 'text-pink-950 font-bold' : theme === 'light' ? 'text-slate-900 font-bold' : 'text-white'}>{currentRound + 1}</strong>/{TOTAL_ROUNDS}
          </div>
        </div>

        {/* Target Term in centered bold */}
        <div className="text-center mb-4 sm:mb-5">
          <h2 className={`text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight ${
            theme === 'kitty' ? 'text-pink-950 font-black' : theme === 'light' ? 'text-slate-950 font-black' : 'text-[#fecdd3] drop-shadow-sm'
          }`}>
            {currentCard ? <FormattedText text={getCardTerm(currentCard)} inlineOnly /> : 'Cargando...'}
          </h2>
        </div>

        {/* Definition Sentence with Blanks */}
        <div className={`p-4 sm:p-6 rounded-2xl border transition-all duration-200 shadow-inner mb-5 sm:mb-6 leading-relaxed text-sm sm:text-base flex flex-wrap items-center gap-x-2 gap-y-2.5 ${
          feedback === 'correct'
            ? theme === 'kitty'
              ? 'bg-emerald-50/80 border-emerald-300'
              : theme === 'light'
              ? 'bg-emerald-50 border-emerald-300'
              : 'bg-[#0e0920]/90 border-emerald-500/50 shadow-emerald-500/10'
            : feedback === 'wrong'
            ? theme === 'kitty'
              ? 'bg-rose-50/80 border-rose-300 animate-shake'
              : theme === 'light'
              ? 'bg-rose-50 border-rose-300 animate-shake'
              : 'bg-[#0e0920]/90 border-rose-500/50 shadow-rose-500/10 animate-shake'
            : theme === 'kitty'
            ? 'bg-pink-50/60 border-pink-200'
            : theme === 'light'
            ? 'bg-slate-50 border-slate-200'
            : 'bg-[#0e0920]/90 border-white/[0.1]'
        }`}>
          {tokens.map((token, idx) => {
            if (!token.isBlank) {
              return (
                <span key={idx} className={theme === 'kitty' ? 'text-pink-950 font-medium' : theme === 'light' ? 'text-slate-800' : 'text-slate-200 font-normal'}>
                  {token.word}
                </span>
              );
            }

            const isFilled = token.userWord !== null;
            const isActive = activeBlankIndex === idx;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleBlankClick(idx)}
                className={`inline-flex items-center justify-center min-w-[85px] h-9 px-3.5 rounded-xl border font-semibold text-sm transition-all duration-150 cursor-pointer ${
                  isFilled
                    ? feedback === 'correct'
                      ? 'bg-emerald-600/30 border-emerald-400 text-emerald-900 dark:text-emerald-200'
                      : feedback === 'wrong'
                      ? 'bg-rose-600/30 border-rose-400 text-rose-900 dark:text-rose-200'
                      : theme === 'kitty'
                      ? 'bg-pink-200 border-pink-400 text-pink-950 font-bold hover:bg-pink-300/80 shadow-xs'
                      : theme === 'light'
                      ? 'bg-indigo-100 border-indigo-300 text-indigo-950 font-bold hover:bg-indigo-200 shadow-xs'
                      : 'bg-[#3b1d60] border-purple-400/60 text-purple-100 hover:bg-[#4a2478]'
                    : isActive
                    ? theme === 'kitty'
                      ? 'bg-white border-2 border-pink-500 text-pink-500 ring-2 ring-pink-300'
                      : theme === 'light'
                      ? 'bg-white border-2 border-indigo-500 text-indigo-500 ring-2 ring-indigo-200'
                      : 'bg-[#291745] border-purple-400 text-purple-300 ring-2 ring-purple-400/40'
                    : theme === 'kitty'
                    ? 'bg-white/80 border-dashed border-pink-300 text-pink-400 hover:border-pink-400'
                    : theme === 'light'
                    ? 'bg-white/80 border-dashed border-slate-300 text-slate-400 hover:border-slate-400'
                    : 'bg-[#201338] border-dashed border-purple-500/40 text-purple-400/60 hover:border-purple-400'
                }`}
              >
                {isFilled ? token.userWord : '____'}
              </button>
            );
          })}
        </div>

        {/* Word Chips Bank */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 max-w-3xl mx-auto">
          {wordBank.map(chip => (
            <button
              key={chip.id}
              type="button"
              disabled={chip.isUsed || feedback === 'correct'}
              onClick={() => handleBankChipClick(chip)}
              className={`px-4 py-2 rounded-full border text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer active-press ${
                chip.isUsed
                  ? 'opacity-25 pointer-events-none scale-95'
                  : theme === 'kitty'
                  ? 'bg-white hover:bg-pink-100/70 border-pink-200 hover:border-pink-300 text-pink-900 shadow-xs'
                  : theme === 'light'
                  ? 'bg-white hover:bg-slate-100 border-slate-200 hover:border-slate-300 text-slate-800 shadow-xs'
                  : 'bg-[#1e153b] hover:bg-[#2b1e54] border-white/[0.12] text-slate-200 hover:text-white hover:border-purple-400/50 shadow-sm'
              }`}
            >
              {chip.word}
            </button>
          ))}
        </div>

        {/* Wrong Feedback Hint */}
        {feedback === 'wrong' && (
          <div className="mt-6 text-center text-xs sm:text-sm text-rose-500 dark:text-rose-300 font-medium animate-fadeIn">
            Algunos espacios no son correctos. Haz clic en una palabra colocada para regresarla al banco y probar otra.
          </div>
        )}
      </div>

      {/* Game Over / Victory Modal */}
      {gameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className={`w-full max-w-md p-6 sm:p-8 rounded-3xl border shadow-2xl text-center flex flex-col items-center ${
            theme === 'kitty'
              ? 'bg-white border-pink-200 text-pink-950 shadow-pink-200/50'
              : theme === 'light'
              ? 'bg-white border-slate-200 text-slate-900 shadow-slate-200/50'
              : 'bg-[#140e2b] border-white/[0.12] text-white'
          }`}>
            <div className={`w-16 h-16 rounded-full border flex items-center justify-center mb-4 ${
              theme === 'kitty'
                ? 'bg-emerald-100 border-emerald-300 text-emerald-600'
                : 'bg-emerald-500/20 border-emerald-400/40 text-emerald-400'
            }`}>
              <Trophy className="w-8 h-8" />
            </div>
            <h3 className={`text-2xl font-bold mb-2 tracking-tight ${
              theme === 'kitty' ? 'text-pink-950 font-black' : theme === 'light' ? 'text-slate-900 font-black' : 'text-white'
            }`}>¡Definiciones Completadas!</h3>
            <p className={`text-sm mb-6 ${
              theme === 'kitty' ? 'text-pink-800/80' : theme === 'light' ? 'text-slate-600' : 'text-slate-300'
            }`}>
              Completaste exitosamente las 6 rondas de reconstrucción léxica.
            </p>

            <div className={`w-full py-4 px-6 rounded-2xl border mb-6 flex justify-around tabular-nums ${
              theme === 'kitty'
                ? 'bg-pink-50/70 border-pink-200'
                : theme === 'light'
                ? 'bg-slate-50 border-slate-200'
                : 'bg-white/[0.04] border-white/[0.08]'
            }`}>
              <div>
                <span className={`text-[11px] uppercase tracking-wider block mb-0.5 ${
                  theme === 'kitty' ? 'text-pink-600' : theme === 'light' ? 'text-slate-500' : 'text-slate-400'
                }`}>Puntuación Final</span>
                <span className={`text-2xl font-extrabold ${
                  theme === 'kitty' ? 'text-emerald-700' : 'text-emerald-400'
                }`}>{score}</span>
              </div>
              <div className={`w-px ${theme === 'kitty' ? 'bg-pink-200' : theme === 'light' ? 'bg-slate-200' : 'bg-white/10'}`} />
              <div>
                <span className={`text-[11px] uppercase tracking-wider block mb-0.5 ${
                  theme === 'kitty' ? 'text-pink-600' : theme === 'light' ? 'text-slate-500' : 'text-slate-400'
                }`}>Términos Dominados</span>
                <span className={`text-2xl font-extrabold ${
                  theme === 'kitty' ? 'text-pink-700' : 'text-purple-300'
                }`}>{masteredTerms.length}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={handleRestart}
                className={`flex-1 py-3 px-4 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-transform active:scale-[0.98] duration-150 cursor-pointer shadow-lg ${
                  theme === 'kitty'
                    ? 'bg-pink-500 hover:bg-pink-600 shadow-pink-500/30'
                    : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30'
                }`}
              >
                <RotateCcw className="w-4 h-4" />
                <span>Jugar de nuevo</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  gameAudio.playTap();
                  onBack();
                }}
                className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-transform active:scale-[0.98] duration-150 cursor-pointer border ${
                  theme === 'kitty'
                    ? 'bg-pink-100 hover:bg-pink-200 border-pink-200 text-pink-900'
                    : theme === 'light'
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.1] text-slate-200'
                }`}
              >
                Regresar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
