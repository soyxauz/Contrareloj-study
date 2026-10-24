import { googleDriveService } from '../services/googleDriveService';
import React, { useState, useEffect } from 'react';
import type { StudyKit, Flashcard, GuessWhoCase, GuessWhoClue } from '../types';
import {
  Layers,
  Sparkles,
  Loader2,
  Type,
  PlusCircle,
  RefreshCw,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Settings,
  X,
  Target,
  HelpCircle,
  BookOpen,
  Trophy,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  Lock,
  Unlock,
  Star,
  Award,
  Check,
} from 'lucide-react';
import {
  generateAIFlashcards,
  generateAdditionalAIFlashcards,
  generateTargetedAIFlashcards,
  generateAIGuessWhoCases,
} from '../services/aiService';
import { FormattedText } from './FormattedText';

interface CaseHistoryItem {
  term: string;
  score: number;
  stars: number;
  cluesUsed: number;
  mistakes: number;
}

const maskTermInText = (text: string, term: string): string => {
  if (!text || !term) return text;
  const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let masked = text.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '[Entidad Oculta]');

  const stopWords = new Set([
    'para', 'como', 'entre', 'sobre', 'desde', 'hacia', 'hasta', 'segun', 'donde', 'quien', 'cada',
    'este', 'esta', 'estos', 'estas', 'aquel', 'aquella', 'con', 'sin', 'por', 'del', 'los', 'las', 'una', 'uno'
  ]);
  const words = term.split(/[\s,.-]+/).filter(w => w.length > 4 && !stopWords.has(w.toLowerCase()));
  if (words.length > 1) {
    words.forEach(w => {
      const escW = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      masked = masked.replace(new RegExp(`\\b${escW}\\b`, 'gi'), '[***]');
    });
  }
  return masked;
};

const isQuestionOrSentence = (text: string): boolean => {
  if (!text) return true;
  const t = text.trim();
  // Signos de interrogacion o exclamacion
  if (/[?¿!¡]/.test(t)) return true;
  // Palabras interrogativas o imperativas tipicas de preguntas
  if (/^(¿|qué|que|cuál|cual|cuáles|cuales|cómo|como|por qué|porque|cuándo|cuando|dónde|donde|quién|quien|defina|describa|explique|mencione|indique|señale|calcule|en qué|en que|a qué|a que)\b/i.test(t)) {
    return true;
  }
  // Puntuacion terminal de enunciado o formula larga
  if (/[:.]$/.test(t)) return true;
  // Mas de 5 palabras o mas de 45 caracteres NO es una opcion corta
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 5 || t.length > 45) return true;

  return false;
};

const cleanToShortConcept = (rawText: string): string => {
  if (!rawText) return '';
  let cleaned = rawText.trim();

  // Eliminar signos de pregunta/exclamacion
  cleaned = cleaned.replace(/[¿?¡!]/g, '').trim();

  // Eliminar frases de inicio de pregunta
  cleaned = cleaned.replace(
    /^(qué es|que es|cuál es|cual es|cuáles son|cuales son|en qué consiste|en que consiste|cómo se define|como se define|a qué se refiere|a que se refiere|defina|definición de|definicion de|describa|explique|mencione|indique|señale|concepto de)\s+(el|la|los|las|un|una|unos|unas)?\s*/i,
    ''
  ).trim();

  // Eliminar articulos iniciales residuales
  cleaned = cleaned.replace(/^(el|la|los|las|un|una)\s+/i, '').trim();

  // Eliminar dos puntos o puntos finales
  cleaned = cleaned.replace(/[:.]+$/, '').trim();

  // Si tiene comillas, extraer lo que esta dentro de las comillas
  const quoted = cleaned.match(/["'«»]([^"'«»]+)["'«»]/);
  if (quoted && quoted[1].trim().length > 2) {
    cleaned = quoted[1].trim();
  }

  // Cortar a maximo 4 palabras si sigue siendo largo
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length > 4) {
    cleaned = words.slice(0, 4).join(' ');
  }

  if (cleaned.length > 40) {
    cleaned = cleaned.slice(0, 40).trim();
  }

  if (!cleaned) return '';

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const isGarbageOrPlaceholderOption = (text: string): boolean => {
  if (!text) return true;
  const t = text.trim().toLowerCase();
  // Placeholders directos tipo Opción A, B, C, D o Choice
  if (/^(opci[oó]n|alternativa|respuesta|inciso|item|choice)\b/i.test(t)) return true;
  if (/^(opci[oó]n|alternativa|respuesta)\s+[a-d0-9]/i.test(t)) return true;
  if (/^(verdadero|falso|true|false|todas las anteriores|ninguna de las anteriores|ambas|n\/a)$/i.test(t)) return true;
  // Frases o comodines artificiales vacíos
  if (/^(principio de|mecanismo principal|factor estructural|criterio diagn[oó]stico|patr[oó]n funcional|elemento central|concepto clave|entidad clave)/i.test(t)) return true;
  if (/^(pregunta \d+|caso \d+|ejemplo \d+|tema \d+|definici[oó]n \d+)/i.test(t)) return true;
  if (t.length < 3 || t.length > 45) return true;
  return false;
};

const buildGuessWhoCases = (
  deck: Flashcard[],
  kit: StudyKit
): GuessWhoCase[] => {
  if (!deck || deck.length === 0) return [];

  // Banco de conceptos cortos puros del kit
  const shortConceptsBank: string[] = [];
  const seenConcepts = new Set<string>();

  const registerConcept = (concept: string) => {
    if (!concept || isGarbageOrPlaceholderOption(concept)) return;
    const cleaned = cleanToShortConcept(concept);
    if (
      cleaned &&
      !isGarbageOrPlaceholderOption(cleaned) &&
      !isQuestionOrSentence(cleaned) &&
      cleaned.length >= 3 &&
      cleaned.length <= 40
    ) {
      const key = cleaned.toLowerCase();
      if (!seenConcepts.has(key)) {
        seenConcepts.add(key);
        shortConceptsBank.push(cleaned);
      }
    }
  };

  // 1. Recolectar conceptos directos de todas las flashcards (activas y archivadas)
  const allCards = [...deck, ...(kit.archivedFlashcards || [])];
  allCards.forEach(card => {
    if (card.term) registerConcept(card.term);
    if (card.type === 'question' && card.definition) {
      const defWords = card.definition.trim().split(/\s+/);
      if (defWords.length <= 4 && !isQuestionOrSentence(card.definition)) {
        registerConcept(card.definition);
      }
    }
  });

  // 2. Recolectar de los temas (topics), parejas de match y opciones válidas de las preguntas
  if (kit.questions && Array.isArray(kit.questions)) {
    kit.questions.forEach(q => {
      if (q.topic) registerConcept(q.topic);
      if (q.matchingPairs) {
        q.matchingPairs.forEach(p => registerConcept(p.term));
      }
      if (q.blanksCorrect) {
        q.blanksCorrect.forEach(b => registerConcept(b));
      }
      if (q.wordBank) {
        q.wordBank.forEach(w => registerConcept(w));
      }
      if (Array.isArray(q.options)) {
        q.options.forEach(opt => {
          if (!isGarbageOrPlaceholderOption(opt) && !isQuestionOrSentence(opt)) {
            registerConcept(opt);
          }
        });
      }
    });
  }

  // 3. Recolectar del texto fuente y fragmentos (chunks) términos técnicos destacados
  const sourceToScan = (kit.sourceText || '') + ' ' + (kit.chunks?.map(c => c.text).join(' ') || '');
  if (sourceToScan.trim()) {
    const boldMatches = sourceToScan.match(/\*\*([^*]{3,40})\*\*/g);
    if (boldMatches) {
      boldMatches.forEach(bm => {
        const raw = bm.replace(/\*\*/g, '').trim();
        registerConcept(raw);
      });
    }

    const capMatches = sourceToScan.match(/\b[A-ZÁÉÍÓÚ][a-záéíóúñ]{3,}(?:\s+(?:de|del|en|la|el|y|o)\s+|\s+)[A-ZÁÉÍÓÚ][a-záéíóúñ]{3,}\b/g);
    if (capMatches) {
      capMatches.slice(0, 40).forEach(cm => registerConcept(cm));
    }
  }

  // 4. Si el kit tiene muy pocos conceptos, alimentar con terminología real según la disciplina
  const categoryStr = (kit.category || kit.title || '').toLowerCase();
  let domainFallbacks: string[] = [];
  if (/neuro|cerebr|encef|medul|nervi/i.test(categoryStr)) {
    domainFallbacks = [
      'Tracto espinotalámico', 'Corteza motora primaria', 'Cerebelo', 'Tronco encefálico',
      'Fascículo grácil', 'Vía piramidal', 'Neurona motora inferior', 'Sinapsis química',
      'Lóbulo frontal', 'Núcleo caudado', 'Médula espinal', 'Reflejo osteotendinoso'
    ];
  } else if (/medic|salud|farmac|fisiolog|patolog|clinic/i.test(categoryStr)) {
    domainFallbacks = [
      'Receptor celular', 'Canal iónico', 'Neurotransmisor', 'Membrana plasmática',
      'Fosforilación oxidativa', 'Bomba de sodio-potasio', 'Enzima catalítica', 'Homeostasis'
    ];
  } else if (/derech|jurid|legal|ley|penal|constituc/i.test(categoryStr)) {
    domainFallbacks = [
      'Debido proceso', 'Presunción de inocencia', 'Jurisdicción ordinaria', 'Cosa juzgada',
      'Principio de legalidad', 'Responsabilidad civil', 'Sujeto procesal', 'Recurso de apelación'
    ];
  } else {
    const words = sourceToScan.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ\s]/g, ' ').split(/\s+/).filter(w => w.length > 5);
    const uniqueWords = Array.from(new Set(words)).slice(0, 10).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    domainFallbacks = uniqueWords.filter(w => !isGarbageOrPlaceholderOption(w));
  }
  domainFallbacks.forEach(fb => registerConcept(fb));

  // Priorizar tarjetas que sean conceptos (no preguntas)
  const nonQuestionCards = deck.filter(c => c.type !== 'question' && !isQuestionOrSentence(c.term));
  const candidatePool = nonQuestionCards.length >= 3 ? nonQuestionCards : deck;

  // Seleccionar hasta 5 tarjetas representativas
  const candidates = [...candidatePool]
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(5, candidatePool.length));

  return candidates.map((card, idx) => {
    let targetConcept = cleanToShortConcept(card.term);
    if (!targetConcept || isQuestionOrSentence(targetConcept) || isGarbageOrPlaceholderOption(targetConcept)) {
      targetConcept = cleanToShortConcept(card.term) || shortConceptsBank[idx % shortConceptsBank.length] || 'Entidad Clave';
    }

    const rawDef = (card.definition || '').trim();
    const maskedDef = maskTermInText(rawDef, targetConcept);

    // Fragmentos y preguntas asociadas para enriquecer pistas
    const relatedChunk = kit.chunks?.find(c =>
      c.text.toLowerCase().includes(targetConcept.toLowerCase())
    )?.text || card.sourceChunkText || '';

    const relatedQ = kit.questions?.find(q =>
      (q.topic && q.topic.toLowerCase() === targetConcept.toLowerCase()) ||
      (q.explanation && q.explanation.toLowerCase().includes(targetConcept.toLowerCase()))
    );

    // Separar la definición en oraciones
    const defSentences = rawDef
      .split(/(?<=[.?!;])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 6);

    // ── PISTA 1: Contexto, Clasificación y Localización (100 pts, 3★) ──────────
    // Específica y única para cada tarjeta (PROHIBIDO plantilla genérica)
    let clue1Text = '';
    const firstSentence = defSentences[0] || rawDef;

    if (firstSentence) {
      const openingClauseMatch = firstSentence.match(/^([^,;:]+(?:que|cuyo|cuya|responsable de|encargad[oa] de|donde|situad[oa] en|ubicad[oa] en)[^,;:]+)/i);
      const openingNature = openingClauseMatch ? openingClauseMatch[1].trim() : firstSentence;
      clue1Text = `Categoría y localización general: ${maskTermInText(openingNature, targetConcept)}.`;
    } else {
      clue1Text = `Categoría y ámbito funcional: Elemento estructural clave evaluado en ${kit.category || kit.title}.`;
    }

    // ── PISTA 2: Mecanismo de Acción o Proceso Funcional (75 pts, 2★) ──────────
    let clue2Text = '';
    const functionSentence = defSentences.find((s, sIdx) =>
      sIdx > 0 && /función|mecanismo|opera|actúa|encargad|conduce|regula|controla|transporta|estimula|inhibe|sintetiza|genera|participa|transmite|ejecuta|conecta|desciende|asciende/i.test(s)
    );

    if (functionSentence) {
      clue2Text = `Mecanismo de acción o rol funcional: ${maskTermInText(functionSentence, targetConcept)}`;
    } else if (defSentences.length >= 2) {
      clue2Text = `Mecanismo y principio operativo: ${maskTermInText(defSentences[1], targetConcept)}`;
    } else {
      const chunkSentences = relatedChunk.split(/(?<=[.?!;])\s+/).filter(s => s.length > 10);
      const chunkFunc = chunkSentences.find(s =>
        s.toLowerCase().includes(targetConcept.toLowerCase()) &&
        /función|mecanismo|actúa|permite|produce|regula|desciende|inerva|conecta/i.test(s)
      );
      if (chunkFunc) {
        clue2Text = `Mecanismo operativo: ${maskTermInText(chunkFunc, targetConcept)}`;
      } else {
        const words = maskedDef.split(' ');
        const midStart = Math.floor(words.length / 3);
        const midEnd = Math.floor((words.length * 2) / 3);
        const slice = words.slice(midStart, Math.max(midStart + 6, midEnd)).join(' ');
        clue2Text = `Mecanismo y proceso funcional: ...${slice}...`;
      }
    }

    // ── PISTA 3: Signo Patognomónico, Hallazgo Distintivo o Criterio Clave (50 pts, 1★) ─
    let clue3Text = '';
    if (relatedQ?.explanation) {
      const expSentences = relatedQ.explanation.split(/(?<=[.?!;])\s+/).filter(s => s.length > 8);
      const hallmarkSentence = expSentences.find(s =>
        /signo|patognomónico|distintivo|característic|lesión|clínic|decusación|hallazgo|específic|reflejo|diferencial|criterio|prueba|babinski|síndrome/i.test(s)
      );
      if (hallmarkSentence) {
        clue3Text = `Signo patognomónico o rasgo distintivo: ${maskTermInText(hallmarkSentence, targetConcept)}`;
      }
    }

    if (!clue3Text) {
      const distinctSentence = defSentences.find((s, sIdx) =>
        sIdx > 1 || /signo|patognomónico|distintiv|característic|lesión|decusación|hallazgo|criterio|específic|típic|causa/i.test(s)
      );
      if (distinctSentence && distinctSentence !== defSentences[0]) {
        clue3Text = `Rasgo distintivo característico: ${maskTermInText(distinctSentence, targetConcept)}`;
      } else if (defSentences.length >= 3) {
        clue3Text = `Criterio o rasgo clave: ${maskTermInText(defSentences[2], targetConcept)}`;
      } else {
        const words = maskedDef.split(' ');
        const half = Math.ceil(words.length / 2);
        clue3Text = `Hallazgo o rasgo distintivo: ...${words.slice(half).join(' ')}`;
      }
    }

    // ── PISTA 4: Dato Definitorio Revelador (25 pts, 1★) ──────────────────────
    const clue4Text = `Dato definitorio concluyente: ${maskedDef}`;

    const clues: GuessWhoClue[] = [
      {
        level: 1,
        title: 'Pista 1: Contexto y Dominio',
        badge: 'Generalidad',
        text: clue1Text,
        unlockedScore: 100,
        stars: 3,
      },
      {
        level: 2,
        title: 'Pista 2: Mecanismo o Causa',
        badge: 'Funcionamiento',
        text: clue2Text,
        unlockedScore: 75,
        stars: 2,
      },
      {
        level: 3,
        title: 'Pista 3: Signo Patognomónico',
        badge: 'Rasgo Clave',
        text: clue3Text,
        unlockedScore: 50,
        stars: 1,
      },
      {
        level: 4,
        title: 'Pista 4: Definición Reveladora',
        badge: 'Definición',
        text: clue4Text,
        unlockedScore: 25,
        stars: 1,
      },
    ];

    // ── OPCIONES CANDIDATAS Y DISTRACTORES ─────────────────────────────────────
    const targetKey = targetConcept.toLowerCase();
    const availableDistractors = shortConceptsBank
      .filter(concept =>
        concept.toLowerCase() !== targetKey &&
        !isGarbageOrPlaceholderOption(concept) &&
        !isQuestionOrSentence(concept)
      )
      .sort(() => Math.random() - 0.5);

    const distractors: string[] = [];
    for (const d of availableDistractors) {
      if (distractors.length < 3 && !distractors.includes(d)) {
        distractors.push(d);
      }
    }

    let fallbackIdx = 0;
    while (distractors.length < 3 && fallbackIdx < domainFallbacks.length) {
      const fb = domainFallbacks[fallbackIdx];
      if (fb && !distractors.includes(fb) && fb.toLowerCase() !== targetKey && !isGarbageOrPlaceholderOption(fb)) {
        distractors.push(fb);
      }
      fallbackIdx++;
    }

    const options = [targetConcept, ...distractors].sort(() => Math.random() - 0.5);

    return {
      id: card.id || `guess-case-${idx}`,
      targetTerm: targetConcept,
      fullDefinition: card.definition,
      clues,
      options,
    };
  });
};

interface FlashcardsViewProps {
  kit: StudyKit;
  onUpdateKit?: (updatedKit: StudyKit) => void;
}

export const FlashcardsView: React.FC<FlashcardsViewProps> = ({ kit, onUpdateKit }) => {
  const [cards, setCards] = useState<Flashcard[]>(kit.flashcards || []);
  const [archivedCards, setArchivedCards] = useState<Flashcard[]>(kit.archivedFlashcards || []);

  // Sincronizar estado cuando el kit se actualiza o restaura desde IndexedDB / Drive
  useEffect(() => {
    if (kit.flashcards && Array.isArray(kit.flashcards)) {
      setCards(kit.flashcards);
    }
    if (kit.archivedFlashcards && Array.isArray(kit.archivedFlashcards)) {
      setArchivedCards(kit.archivedFlashcards);
    }
  }, [kit.id, kit.updatedAt]);

  // Al salir de la pantalla de flashcards, forzar guardado inmediato en Drive de cambios agrupados
  useEffect(() => {
    return () => {
      googleDriveService.flushAutoSync();
    };
  }, []);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [gameMode, setGameMode] = useState<'study' | 'guess-who'>('study');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAddingMore, setIsAddingMore] = useState(false);
  const [isSwappingMastered, setIsSwappingMastered] = useState(false);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);
  const [textSize, setTextSize] = useState<'medium' | 'large' | 'huge'>('large');

  // Estados para calibración de enfoque (Tuerca)
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [focusTopic, setFocusTopic] = useState('');
  const [focusRatio, setFocusRatio] = useState<'mixed-70-30' | 'only-questions' | 'only-concepts'>('mixed-70-30');
  const [targetCount, setTargetCount] = useState<number>(10);
  const [isGeneratingTargeted, setIsGeneratingTargeted] = useState(false);

  // Estados del juego Adivina Quien / Pistas Progresivas
  const [guessWhoCases, setGuessWhoCases] = useState<GuessWhoCase[]>([]);
  const [currentCaseIdx, setCurrentCaseIdx] = useState<number>(0);
  const [revealedCluesCount, setRevealedCluesCount] = useState<number>(1);
  const [selectedGuessOption, setSelectedGuessOption] = useState<string | null>(null);
  const [wrongOptions, setWrongOptions] = useState<string[]>([]);
  const [isCaseSolved, setIsCaseSolved] = useState<boolean>(false);
  const [caseScoreEarned, setCaseScoreEarned] = useState<number>(0);
  const [caseStarsEarned, setCaseStarsEarned] = useState<number>(0);
  const [totalScore, setTotalScore] = useState<number>(0);
  const [totalStars, setTotalStars] = useState<number>(0);
  const [isGameFinished, setIsGameFinished] = useState<boolean>(false);
  const [casesHistory, setCasesHistory] = useState<CaseHistoryItem[]>([]);

  const showNotification = (msg: string) => {
    setStatusNotification(msg);
    setTimeout(() => {
      setStatusNotification(null);
    }, 4000);
  };

  const handleGenerateFlashcards = async () => {
    setIsGenerating(true);
    try {
      const generated = await generateAIFlashcards(
        kit.sourceText || kit.description,
        kit.title,
        kit.category
      );
      if (generated.length > 0) {
        setCards(generated);
        if (onUpdateKit) {
          onUpdateKit({ ...kit, flashcards: generated });
        }
        showNotification(`Se generaron ${generated.length} flashcards.`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  // Botón: Aumentar cantidad de flashcards (+10 nuevas)
  const handleAddMoreFlashcards = async () => {
    setIsAddingMore(true);
    try {
      const existingTerms = [...cards.map(c => c.term), ...archivedCards.map(c => c.term)];
      const source = kit.sourceText || kit.description;
      const additional = await generateAdditionalAIFlashcards(
        source,
        kit.title,
        kit.category,
        existingTerms,
        10
      );

      if (additional.length > 0) {
        const nextCards = [...cards, ...additional];
        setCards(nextCards);
        if (onUpdateKit) {
          onUpdateKit({ ...kit, flashcards: nextCards, archivedFlashcards: archivedCards });
        }
        showNotification(`¡Éxito! Se añadieron ${additional.length} flashcards adicionales al kit.`);
      }
    } catch (e) {
      console.error(e);
      showNotification('Error al generar más flashcards.');
    } finally {
      setIsAddingMore(false);
    }
  };

  // Botón: Cambiar las flashcards memorizadas por unas nuevas
  const handleSwapMasteredFlashcards = async () => {
    const mastered = cards.filter(c => c.mastery === 'mastered');
    if (mastered.length === 0) {
      showNotification('Aún no tienes flashcards marcadas como "¡Dominada!". Marca al menos una para renovarla.');
      return;
    }

    setIsSwappingMastered(true);
    try {
      const remainingUnmastered = cards.filter(c => c.mastery !== 'mastered');
      const newlyArchived = [...archivedCards, ...mastered];
      const existingTerms = [...remainingUnmastered.map(c => c.term), ...newlyArchived.map(c => c.term)];

      const source = kit.sourceText || kit.description;
      // Generar lote de 10 flashcards frescas no vistas
      const freshBatch = await generateAdditionalAIFlashcards(
        source,
        kit.title,
        kit.category,
        existingTerms,
        10
      );

      const nextCards = [...remainingUnmastered, ...freshBatch];
      setCards(nextCards);
      setArchivedCards(newlyArchived);
      setCurrentIdx(0);
      setIsFlipped(false);

      if (onUpdateKit) {
        onUpdateKit({
          ...kit,
          flashcards: nextCards,
          archivedFlashcards: newlyArchived,
        });
      }

      showNotification(`Se archivaron ${mastered.length} flashcards dominadas y se incorporaron ${freshBatch.length} nuevas para continuar tu estudio.`);
    } catch (e) {
      console.error(e);
      showNotification('Error al renovar las flashcards dominadas.');
    } finally {
      setIsSwappingMastered(false);
    }
  };

  // Generar lote calibrado según el enfoque de la tuerca
  const handleGenerateCalibratedFlashcards = async () => {
    setIsGeneratingTargeted(true);
    try {
      const existingTerms = [...cards.map(c => c.term), ...archivedCards.map(c => c.term)];
      const source = kit.sourceText || kit.description;
      const freshBatch = await generateTargetedAIFlashcards(
        source,
        kit.title,
        kit.category,
        {
          focusTopic: focusTopic.trim() || undefined,
          styleRatio: focusRatio,
          count: targetCount,
          existingTerms,
        }
      );

      if (freshBatch.length > 0) {
        // Regla: Añadir SIEMPRE a la baraja existente sin borrar las anteriores
        const nextCards = [...cards, ...freshBatch];
        setCards(nextCards);
        if (onUpdateKit) {
          onUpdateKit({
            ...kit,
            flashcards: nextCards,
            archivedFlashcards: archivedCards,
          });
        }
        setShowConfigModal(false);
        showNotification(`¡Éxito! Se añadieron ${freshBatch.length} flashcards calibradas a la baraja.`);
      } else {
        showNotification('No se pudieron generar nuevas flashcards para ese criterio.');
      }
    } catch (e) {
      console.error(e);
      showNotification('Error al generar las flashcards calibradas.');
    } finally {
      setIsGeneratingTargeted(false);
    }
  };

  const currentCard = cards[currentIdx % (cards.length || 1)];
  const isQuestionCard =
    currentCard?.type === 'question' ||
    Boolean(currentCard?.term && /^\s*¿|\?\s*$/.test(currentCard.term));

  const handleUpdateMastery = (mastery: 'to-learn' | 'known' | 'mastered') => {
    if (!cards || cards.length === 0) return;
    const targetIdx = currentIdx % cards.length;
    const updated = cards.map((c, i) => (i === targetIdx ? { ...c, mastery } : c));
    setCards(updated);
    setIsFlipped(false);
    setCurrentIdx(prev => (prev + 1) % cards.length);

    if (onUpdateKit) {
      onUpdateKit({ ...kit, flashcards: updated, archivedFlashcards: archivedCards });
    }
  };

  const handlePrevCard = () => {
    setIsFlipped(false);
    setCurrentIdx(prev => (prev - 1 + cards.length) % cards.length);
  };

  const handleNextCard = () => {
    setIsFlipped(false);
    setCurrentIdx(prev => (prev + 1) % cards.length);
  };

  // Retroalimentación auditiva sintetizada con Web Audio API (cero dependencias externas)
  const playAudioFeedback = (type: 'correct' | 'wrong' | 'victory') => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      if (type === 'correct') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
      } else if (type === 'wrong') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.setValueAtTime(180, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.14, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
      } else if (type === 'victory') {
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);
          gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.25);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + i * 0.08 + 0.25);
        });
      }
    } catch {
      // AudioContext no disponible o bloqueado - ignorar silenciosamente
    }
  };

  // Inicializar o reiniciar partida de Adivina Quien (hasta 5 casos progresivos)
  const startNewGuessWhoGame = async () => {
    if (cards.length === 0) return;
    const initialCases = buildGuessWhoCases(cards, kit);
    setGuessWhoCases(initialCases);
    setCurrentCaseIdx(0);
    setRevealedCluesCount(1);
    setSelectedGuessOption(null);
    setWrongOptions([]);
    setIsCaseSolved(false);
    setCaseScoreEarned(0);
    setCaseStarsEarned(0);
    setTotalScore(0);
    setTotalStars(0);
    setIsGameFinished(false);
    setCasesHistory([]);

    // Enriquecimiento en segundo plano con IA si está habilitada
    try {
      const targetCards = initialCases.map(c => ({
        id: c.id,
        term: c.targetTerm,
        definition: c.fullDefinition,
      }));
      const allAvailableTerms = cards.map(c => c.term);
      const aiCases = await generateAIGuessWhoCases(
        kit.sourceText || kit.description,
        kit.title,
        kit.category,
        targetCards,
        allAvailableTerms
      );
      if (aiCases && aiCases.length > 0) {
        setGuessWhoCases(prev => {
          if (prev.length === 0) return aiCases;
          return prev.map((pCase, pIdx) => {
            if (pIdx < currentCaseIdx || (pIdx === currentCaseIdx && (revealedCluesCount > 1 || wrongOptions.length > 0 || isCaseSolved))) {
              return pCase;
            }
            return aiCases[pIdx] || pCase;
          });
        });
      }
    } catch {
      // Si la IA no está disponible, los casos locales ya están perfectamente calibrados
    }
  };

  // Auto-iniciar si entra al modo Adivina Quien y no hay casos cargados
  useEffect(() => {
    if (gameMode === 'guess-who' && guessWhoCases.length === 0 && cards.length > 0 && !isGameFinished) {
      startNewGuessWhoGame();
    }
  }, [gameMode, cards.length]);

  // Revelar la siguiente pista disponible
  const handleRevealNextClue = () => {
    if (isCaseSolved || revealedCluesCount >= 4) return;
    setRevealedCluesCount(prev => Math.min(4, prev + 1));
    playAudioFeedback('correct');
  };

  // Seleccionar una opción candidata
  const handleSelectGuessOption = (option: string) => {
    if (isCaseSolved || wrongOptions.includes(option)) return;
    const currentCase = guessWhoCases[currentCaseIdx];
    if (!currentCase) return;

    if (option === currentCase.targetTerm) {
      // Deducción correcta
      const baseScores = [100, 75, 50, 25];
      const baseStars = [3, 2, 1, 1];
      const clueIdx = Math.max(0, Math.min(3, revealedCluesCount - 1));
      const baseScore = baseScores[clueIdx];
      const stars = baseStars[clueIdx];

      // Penalización de 10 pts por cada intento fallido previo en este caso
      const penalty = wrongOptions.length * 10;
      const finalScore = Math.max(10, baseScore - penalty);

      setIsCaseSolved(true);
      setSelectedGuessOption(option);
      setCaseScoreEarned(finalScore);
      setCaseStarsEarned(stars);
      setTotalScore(prev => prev + finalScore);
      setTotalStars(prev => prev + stars);

      setCasesHistory(prev => [
        ...prev,
        {
          term: currentCase.targetTerm,
          score: finalScore,
          stars,
          cluesUsed: revealedCluesCount,
          mistakes: wrongOptions.length,
        },
      ]);

      playAudioFeedback('correct');
    } else {
      // Deducción errónea: penalización visual y sonora, deshabilita la opción
      setWrongOptions(prev => [...prev, option]);
      playAudioFeedback('wrong');
    }
  };

  // Avanzar al siguiente caso o finalizar partida
  const handleNextCase = () => {
    if (currentCaseIdx + 1 < guessWhoCases.length) {
      setCurrentCaseIdx(prev => prev + 1);
      setRevealedCluesCount(1);
      setSelectedGuessOption(null);
      setWrongOptions([]);
      setIsCaseSolved(false);
      setCaseScoreEarned(0);
      setCaseStarsEarned(0);
    } else {
      setIsGameFinished(true);
      playAudioFeedback('victory');
    }
  };

  // Clases tipográficas responsivas y ampliadas según el selector de tamaño
  const termTypographyClasses = {
    medium: 'text-2xl sm:text-4xl md:text-5xl font-black leading-tight',
    large: 'text-3xl sm:text-5xl md:text-6xl font-black leading-tight tracking-tight drop-shadow-sm',
    huge: 'text-4xl sm:text-6xl md:text-7xl font-black leading-none tracking-tight drop-shadow-md',
  }[textSize];

  const definitionTypographyClasses = {
    medium: 'text-lg sm:text-xl md:text-2xl font-medium leading-relaxed',
    large: 'text-xl sm:text-2xl md:text-3xl font-medium leading-relaxed text-slate-100',
    huge: 'text-2xl sm:text-3xl md:text-4xl font-semibold leading-relaxed text-slate-50',
  }[textSize];

  if (gameMode === 'guess-who') {
    const currentCase = guessWhoCases[currentCaseIdx];

    return (
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2 sm:py-3 h-[calc(100vh-4.5rem)] max-h-[860px] flex flex-col justify-between select-none overflow-hidden animate-fadeIn relative">
        {/* Cabecera del Juego: Botón Salir, Título, Contador de Casos, Marcador y Reiniciar */}
        <div className="flex items-center justify-between gap-2 sm:gap-4 shrink-0 pb-2 border-b border-thea-border/80">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setGameMode('study')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-xs font-bold text-slate-300 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95"
              title="Volver a la vista de estudio de Flashcards"
            >
              <ArrowLeft className="w-4 h-4 text-violet-400" />
              <span className="hidden sm:inline">Volver a Flashcards</span>
            </button>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-1.5">
                <HelpCircle className="w-5 h-5 text-amber-400" />
                <span>Adivina Quién • Pistas Progresivas</span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Indicador de Caso */}
            {guessWhoCases.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#20183d] border border-violet-500/40 text-violet-200 font-mono text-xs font-extrabold shadow-inner">
                <Layers className="w-3.5 h-3.5 text-violet-400" />
                <span>Caso {currentCaseIdx + 1} de {guessWhoCases.length}</span>
              </div>
            )}

            {/* Puntuación Acumulada */}
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-extrabold shadow-sm">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>{totalScore} pts</span>
            </div>

            {/* Estrellas Acumuladas */}
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-violet-600/20 border border-violet-500/40 text-violet-300 text-xs font-extrabold shadow-sm">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>{totalStars}</span>
            </div>

            {/* Reiniciar Partida */}
            <button
              type="button"
              onClick={startNewGuessWhoGame}
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border hover:border-violet-500/40 text-xs font-bold text-slate-300 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95 flex items-center gap-1"
              title="Reiniciar y barajar nuevos casos"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400 hover:rotate-180 transition-transform" />
              <span className="hidden lg:inline">Reiniciar</span>
            </button>
          </div>
        </div>

        {cards.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-300">
              <Layers className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-white">No hay tarjetas disponibles</h3>
            <p className="text-xs text-slate-400 max-w-sm">Genera tarjetas primero en el Modo Flashcards para poder jugar a Adivina Quién con pistas progresivas.</p>
            <button
              type="button"
              onClick={() => setGameMode('study')}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs cursor-pointer shadow-lg transition-all"
            >
              Ir a Modo Flashcards
            </button>
          </div>
        ) : !currentCase ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          </div>
        ) : (
          <>
            {/* Barra de Progreso de Casos */}
            <div className="shrink-0 my-1">
              <div className="flex items-center gap-1.5">
                {guessWhoCases.map((c, idx) => {
                  const isDone = idx < currentCaseIdx || (idx === currentCaseIdx && isCaseSolved);
                  const isCurrent = idx === currentCaseIdx && !isCaseSolved;
                  return (
                    <div
                      key={c.id}
                      className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                        isDone
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                          : isCurrent
                          ? 'bg-amber-400 animate-pulse'
                          : 'bg-violet-950/60 border border-violet-900/40'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Tarjeta Central: Entidad Misteriosa */}
            <div className="shrink-0 my-1.5">
              {!isCaseSolved ? (
                <div className="h-24 sm:h-26 rounded-2xl border border-violet-500/40 bg-gradient-to-r from-[#19103c] via-[#21164e] to-[#160d33] p-3 sm:p-4 flex items-center justify-between shadow-lg relative overflow-hidden">
                  <div className="flex items-center gap-3 sm:gap-4 z-10">
                    <div className="w-12 h-12 rounded-2xl bg-violet-600/30 border border-violet-400/40 flex items-center justify-center text-violet-300 shadow-inner">
                      <HelpCircle className="w-6 h-6 text-amber-400 animate-pulse" />
                    </div>
                    <div>
                      <span className="text-[10px] sm:text-xs uppercase font-extrabold tracking-wider text-violet-300 block">
                        Entidad Oculta • Deducción en Proceso
                      </span>
                      <h3 className="text-base sm:text-lg font-black text-white">
                        ¿Quién es esta entidad misteriosa?
                      </h3>
                      <p className="text-[11px] text-slate-300">
                        {wrongOptions.length > 0
                          ? `Has tenido ${wrongOptions.length} intento(s) fallido(s) (-${wrongOptions.length * 10} pts). Puedes arriesgar otra opción o pedir más pistas.`
                          : 'Arriesga una opción candidata o desbloquea pistas progresivas para acotar tu deducción.'}
                      </p>
                    </div>
                  </div>

                  <div className="hidden sm:flex flex-col items-end z-10 shrink-0">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Recompensa actual</span>
                    <span className="text-lg font-black text-amber-300">
                      {currentCase.clues[revealedCluesCount - 1]?.unlockedScore || 100} pts
                    </span>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3.5 h-3.5 ${
                            i < (currentCase.clues[revealedCluesCount - 1]?.stars || 1)
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-600'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-24 sm:h-26 rounded-2xl border-2 border-emerald-400 bg-gradient-to-r from-emerald-950/90 via-[#0e2920] to-teal-950/90 p-3 sm:p-4 flex items-center justify-between shadow-[0_0_25px_rgba(52,211,153,0.3)] animate-cardCorrect">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center text-emerald-300">
                      <Trophy className="w-6 h-6 text-emerald-300 animate-iconPop" />
                    </div>
                    <div>
                      <span className="text-[10px] sm:text-xs uppercase font-extrabold tracking-wider text-emerald-300 block">
                        ¡Deducción Acertada!
                      </span>
                      <h3 className="text-lg sm:text-xl md:text-2xl font-black text-white drop-shadow">
                        <FormattedText text={currentCase.targetTerm} inlineOnly={true} />
                      </h3>
                      <p className="text-[11px] text-emerald-200">
                        Resuelto usando {revealedCluesCount} de 4 pistas {wrongOptions.length > 0 ? `con ${wrongOptions.length} fallo(s)` : 'sin fallos'}.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-base sm:text-xl font-black text-emerald-300">
                      +{caseScoreEarned} pts
                    </span>
                    <div className="flex items-center gap-1 mt-0.5">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${
                            i < caseStarsEarned ? 'fill-amber-400 text-amber-400' : 'text-slate-700'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Tablero Central: Cuadrícula 2x2 de Pistas Progresivas */}
            <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5 my-1.5">
              {currentCase.clues.map((clue) => {
                const isUnlocked = clue.level <= revealedCluesCount;
                const isNextToUnlock = clue.level === revealedCluesCount + 1 && !isCaseSolved;

                if (isUnlocked) {
                  return (
                    <div
                      key={clue.level}
                      className="h-full min-h-0 rounded-2xl border border-violet-500/40 bg-[#181138]/95 p-2.5 sm:p-3 flex flex-col justify-between shadow-sm animate-fadeIn"
                    >
                      <div className="flex items-center justify-between pb-1 border-b border-violet-900/40 shrink-0">
                        <span className="text-[11px] font-extrabold text-violet-300 flex items-center gap-1.5 uppercase tracking-wide">
                          {clue.level === 1 && <BookOpen className="w-3.5 h-3.5 text-violet-400" />}
                          {clue.level === 2 && <Layers className="w-3.5 h-3.5 text-indigo-400" />}
                          {clue.level === 3 && <Target className="w-3.5 h-3.5 text-amber-400" />}
                          {clue.level === 4 && <Sparkles className="w-3.5 h-3.5 text-emerald-400" />}
                          {clue.title}
                        </span>
                        <span className="text-[10px] font-bold text-amber-300 bg-amber-950/40 border border-amber-500/30 px-1.5 py-0.5 rounded-md">
                          {clue.unlockedScore} pts ({clue.stars}★)
                        </span>
                      </div>
                      <div className="flex-1 min-h-0 flex items-center pt-1.5">
                        <p className="text-xs sm:text-[13px] leading-snug sm:leading-relaxed text-slate-200 line-clamp-4">
                          <FormattedText text={clue.text} inlineOnly={true} />
                        </p>
                      </div>
                    </div>
                  );
                }

                if (isNextToUnlock) {
                  return (
                    <button
                      key={clue.level}
                      type="button"
                      onClick={handleRevealNextClue}
                      className="h-full min-h-0 rounded-2xl border-2 border-dashed border-violet-500/50 bg-violet-950/20 hover:bg-violet-900/30 hover:border-violet-400 p-2.5 sm:p-3 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-[0.98] group"
                    >
                      <Unlock className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform mb-1" />
                      <span className="text-xs sm:text-sm font-extrabold text-white">
                        Desbloquear {clue.title}
                      </span>
                      <span className="text-[10px] text-violet-300 mt-0.5">
                        La recompensa pasará a {clue.unlockedScore} pts ({clue.stars}★)
                      </span>
                    </button>
                  );
                }

                return (
                  <div
                    key={clue.level}
                    className="h-full min-h-0 rounded-2xl border border-violet-900/30 bg-[#120a2a]/50 p-2.5 sm:p-3 flex flex-col items-center justify-center text-center opacity-40 select-none"
                  >
                    <Lock className="w-4 h-4 text-slate-500 mb-1" />
                    <span className="text-xs font-bold text-slate-400">{clue.title}</span>
                    <span className="text-[10px] text-slate-500">Bloqueada ({clue.unlockedScore} pts)</span>
                  </div>
                );
              })}
            </div>

            {/* Grid 2x2 Inferior de Opciones Candidatas */}
            <div className="shrink-0 grid grid-cols-2 gap-2 sm:gap-2.5 my-1.5">
              {currentCase.options.map((option, idx) => {
                const isWrong = wrongOptions.includes(option);
                const isCorrect = isCaseSolved && option === currentCase.targetTerm;
                const isChosenWinner = selectedGuessOption === option;

                let btnStyle = 'border-thea-border/80 bg-[#181138]/90 hover:border-violet-500/60 hover:bg-[#20174a] text-slate-200 cursor-pointer active:scale-[0.99]';
                if (isWrong) {
                  btnStyle = 'border-rose-900/60 bg-rose-950/30 text-rose-300/60 line-through opacity-50 cursor-not-allowed';
                }
                if (isCorrect || isChosenWinner) {
                  btnStyle = 'border-emerald-400 bg-emerald-950/90 text-emerald-200 ring-2 ring-emerald-400 font-extrabold shadow-md';
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={isCaseSolved || isWrong}
                    onClick={() => handleSelectGuessOption(option)}
                    className={`p-2.5 sm:p-3 rounded-2xl border transition-all duration-150 flex items-center justify-center text-center shadow-sm min-h-[50px] sm:min-h-[56px] ${btnStyle}`}
                  >
                    {isCorrect && <Check className="w-4 h-4 text-emerald-400 mr-1.5 shrink-0" />}
                    <span className="text-xs sm:text-sm font-bold line-clamp-2 leading-snug">
                      <FormattedText text={option} inlineOnly={true} />
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Barra Inferior: Botón de Siguiente Caso o Guía */}
            <div className="shrink-0 pt-1.5 border-t border-thea-border/60 flex items-center justify-between text-[11px] text-slate-400 px-1">
              {isCaseSolved ? (
                <button
                  type="button"
                  onClick={handleNextCase}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
                >
                  <span>
                    {currentCaseIdx + 1 < guessWhoCases.length
                      ? 'Continuar al Siguiente Caso'
                      : 'Ver Resultados Finales de la Partida'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <div className="w-full flex items-center justify-between">
                  <span className="truncate mr-2">
                    Toca una opción para adivinar. Si fallas se tachará (-10 pts) y podrás seguir deduciendo.
                  </span>
                  <span className="shrink-0 font-bold text-slate-400">
                    Fallos en caso: <span className={wrongOptions.length > 0 ? 'text-rose-400' : 'text-slate-400'}>{wrongOptions.length}</span>
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Modal de Victoria Final (5 casos completados) */}
        {isGameFinished && (
          <div className="absolute inset-0 z-30 bg-[#0f0a21]/95 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
            <div className="max-w-md w-full bg-[#181138] border border-emerald-500/40 rounded-3xl p-6 sm:p-7 text-center shadow-2xl relative overflow-hidden animate-feedbackPop">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center mx-auto mb-3 text-emerald-300 shadow-lg shadow-emerald-500/10">
                <Trophy className="w-8 h-8 animate-iconPop" />
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-white mb-1">
                ¡Partida de Deducción Completada!
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 mb-5">
                Has resuelto los {guessWhoCases.length} casos de estudio con razonamiento progresivo.
              </p>

              {/* Grid de Métricas */}
              <div className="grid grid-cols-2 gap-2.5 mb-5">
                <div className="p-3 rounded-2xl bg-violet-950/40 border border-violet-500/30">
                  <span className="text-[10px] uppercase font-bold text-violet-300 block mb-0.5">
                    Puntos Obtenidos
                  </span>
                  <span className="text-lg sm:text-xl font-black text-white">
                    {totalScore} / {guessWhoCases.length * 100}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-500/30">
                  <span className="text-[10px] uppercase font-bold text-amber-300 block mb-0.5">
                    Estrellas Totales
                  </span>
                  <span className="text-lg sm:text-xl font-black text-amber-300 flex items-center justify-center gap-1">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    {totalStars} / {guessWhoCases.length * 3}
                  </span>
                </div>
              </div>

              {/* Desglose de Casos */}
              <div className="max-h-36 overflow-y-auto pr-1 space-y-1.5 mb-5 text-left">
                {casesHistory.map((item, i) => (
                  <div
                    key={i}
                    className="p-2 rounded-xl bg-violet-950/20 border border-violet-900/30 flex items-center justify-between text-xs"
                  >
                    <div className="truncate mr-2">
                      <span className="font-bold text-slate-200">#{i + 1} {item.term}</span>
                      <span className="text-[10px] text-slate-400 block">
                        Pistas: {item.cluesUsed} • Errores: {item.mistakes}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-emerald-300">+{item.score} pts</span>
                      <div className="flex items-center">
                        {Array.from({ length: item.stars }).map((_, s) => (
                          <Star key={s} className="w-3 h-3 fill-amber-400 text-amber-400" />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Botones de Acción */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={startNewGuessWhoGame}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs sm:text-sm shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Jugar Nueva Partida</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGameMode('study')}
                  className="flex-1 py-3 px-4 rounded-xl bg-thea-surfaceLight hover:bg-thea-surface border border-thea-border text-slate-200 hover:text-white font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <span>Volver a Flashcards</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-thea-border">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs uppercase font-extrabold px-2 py-0.5 rounded bg-violet-600/30 text-violet-300 border border-violet-500/30">
              REPETICIÓN ESPACIADA
            </span>
            <span className="text-xs text-slate-400 font-medium">
              {cards.length} tarjetas activas
              {archivedCards.length > 0 && ` • ${archivedCards.length} dominadas archivadas`}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Layers className="w-6 h-6 text-violet-400" />
            <span>Flashcards & Adivina Quién</span>
          </h1>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Selector de Tamaño de Letra */}
          <div className="flex items-center bg-thea-surface border border-thea-border rounded-xl p-1 text-xs">
            <span className="px-2 text-slate-400 flex items-center gap-1 font-semibold text-[11px]">
              <Type className="w-3.5 h-3.5 text-amber-400" />
              Letra:
            </span>
            <button
              type="button"
              onClick={() => setTextSize('medium')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                textSize === 'medium' ? 'bg-amber-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
              title="Tamaño Mediano"
            >
              M
            </button>
            <button
              type="button"
              onClick={() => setTextSize('large')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                textSize === 'large' ? 'bg-amber-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
              title="Tamaño Grande (Predeterminado)"
            >
              G
            </button>
            <button
              type="button"
              onClick={() => setTextSize('huge')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                textSize === 'huge' ? 'bg-amber-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
              title="Tamaño Extra Grande"
            >
              XG
            </button>
          </div>

          {/* Botón de Calibración / Tuerca de Enfoque */}
          <button
            type="button"
            onClick={() => setShowConfigModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border hover:border-violet-500/60 text-xs font-bold text-slate-200 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95 group"
            title="Calibrar enfoque y proporción de las flashcards"
          >
            <Settings className="w-4 h-4 text-violet-400 group-hover:rotate-45 transition-transform" />
            <span className="hidden sm:inline">Enfoque</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setGameMode('guess-who');
              startNewGuessWhoGame();
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/40 text-xs font-bold text-violet-200 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <HelpCircle className="w-4 h-4 text-amber-400" />
            <span>Adivina Quién</span>
          </button>
        </div>
      </div>

      {/* Notificación de estado */}
      {statusNotification && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs sm:text-sm flex items-center gap-3 animate-fadeIn shadow-lg">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{statusNotification}</span>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="text-center py-16 px-6 rounded-3xl bg-thea-surface border border-thea-border max-w-xl mx-auto shadow-xl animate-fadeIn">
          <div className="w-16 h-16 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mx-auto mb-5 text-violet-400">
            <Sparkles className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Fichas de Estudio Pendientes</h2>
          <p className="text-sm text-slate-300 mb-8 leading-relaxed">
            Este Study Kit fue creado de forma rápida centrada en preguntas. Puedes generar ahora sus tarjetas de memoria interactivas con repetición espaciada utilizando la IA.
          </p>
          <button
            type="button"
            onClick={handleGenerateFlashcards}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-sm shadow-xl shadow-violet-900/40 transition-all transform hover:-translate-y-0.5 cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Extrayendo Conceptos y Generando Fichas con IA...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Generar Flashcards con IA</span>
              </>
            )}
          </button>
        </div>
      ) : gameMode === 'study' ? (
        <div className="space-y-6">
          {/* Card Counter, Progress Badges & Management Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-sm text-slate-300">
            <div className="flex items-center gap-3">
              <span className="font-bold text-white">Tarjeta {currentIdx + 1} de {cards.length}</span>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-medium">
                  Por aprender: {cards.filter(c => c.mastery === 'to-learn').length}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-amber-950 text-amber-300 font-medium">
                  Conocidas: {cards.filter(c => c.mastery === 'known').length}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 font-medium">
                  Dominadas: {cards.filter(c => c.mastery === 'mastered').length}
                </span>
              </div>
            </div>

            {/* Acciones para aumentar baraja o renovar memorizadas */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleAddMoreFlashcards}
                disabled={isAddingMore}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-950/60 hover:bg-violet-900/80 border border-violet-500/40 text-violet-200 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-95"
                title="Generar y sumar 10 nuevas tarjetas a este kit"
              >
                {isAddingMore ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-300" />
                ) : (
                  <PlusCircle className="w-3.5 h-3.5 text-violet-400" />
                )}
                <span>+10 Flashcards</span>
              </button>

              <button
                type="button"
                onClick={handleSwapMasteredFlashcards}
                disabled={isSwappingMastered || cards.filter(c => c.mastery === 'mastered').length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/60 hover:bg-amber-900/80 border border-amber-500/40 text-amber-200 text-xs font-bold transition-all disabled:opacity-40 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-95"
                title="Archivar las flashcards dominadas y traer una baraja de 10 nuevas no vistas"
              >
                {isSwappingMastered ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>Renovar Dominadas ({cards.filter(c => c.mastery === 'mastered').length})</span>
              </button>
            </div>
          </div>

          {/* ── INTERACTIVE 3D PERSPECTIVE FLIP CARD ── */}
          <div className="perspective-card w-full min-h-[380px] sm:min-h-[440px]">
            <div
              onClick={() => setIsFlipped(!isFlipped)}
              className={`card-inner ${isFlipped ? 'is-flipped' : ''} cursor-pointer select-none group min-h-[380px] sm:min-h-[440px] rounded-3xl`}
            >
              {/* CARA FRONTAL (TÉRMINO O PREGUNTA CONCRETA) */}
              <div className={`card-face rounded-3xl transition-all p-8 sm:p-14 shadow-2xl flex flex-col items-center justify-between text-center border-2 ${
                isQuestionCard
                  ? 'bg-gradient-to-tr from-[#0a182a] via-[#10243e] to-[#163659] border-cyan-500/50 group-hover:border-cyan-400'
                  : 'bg-gradient-to-tr from-[#140e2e] via-[#1a123d] to-[#25184f] border-[#332263] group-hover:border-violet-500/70'
              }`}>
                <div className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-widest">
                  {isQuestionCard ? (
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 font-extrabold text-[11px] shadow-sm">
                      <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                      PREGUNTA CONCRETA
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-950/80 border border-violet-500/50 text-violet-300 font-extrabold text-[11px] shadow-sm">
                      <BookOpen className="w-3.5 h-3.5 text-violet-400" />
                      TÉRMINO CLAVE
                    </span>
                  )}
                  <span className={`text-[11px] px-2.5 py-0.5 rounded-full border ${
                    isQuestionCard
                      ? 'bg-cyan-900/40 border-cyan-500/30 text-cyan-300'
                      : 'bg-violet-900/40 border-violet-500/30 text-violet-300'
                  }`}>
                    Frente
                  </span>
                </div>

                <div className="max-w-2xl w-full flex items-center justify-center my-auto py-4">
                  <div className={`text-white text-center w-full ${termTypographyClasses}`}>
                    <FormattedText text={currentCard.term} inlineOnly={true} className="whitespace-pre-line" />
                  </div>
                </div>

                <div className={`flex items-center gap-2 text-xs sm:text-sm font-medium transition-colors ${
                  isQuestionCard
                    ? 'text-cyan-300/80 group-hover:text-cyan-200'
                    : 'text-slate-400 group-hover:text-amber-300'
                }`}>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>
                    {isQuestionCard
                      ? 'Haz clic para voltear y ver la respuesta'
                      : 'Haz clic para voltear y ver la definición'}
                  </span>
                </div>
              </div>

              {/* CARA POSTERIOR (DEFINICIÓN O RESPUESTA) */}
              <div className={`card-face card-back rounded-3xl transition-all p-8 sm:p-14 shadow-2xl flex flex-col items-center justify-between text-center border-2 ${
                isQuestionCard
                  ? 'bg-gradient-to-tr from-[#0a1f33] via-[#0f2c47] to-[#15426b] border-sky-500/60 group-hover:border-sky-400'
                  : 'bg-gradient-to-tr from-[#121933] via-[#152347] to-[#1e3366] border-indigo-500/60 group-hover:border-indigo-400'
              }`}>
                <div className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-widest">
                  {isQuestionCard ? (
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-950/80 border border-sky-500/50 text-sky-300 font-extrabold text-[11px] shadow-sm">
                      RESPUESTA CONCISA
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-500/50 text-indigo-300 font-extrabold text-[11px] shadow-sm">
                      DEFINICIÓN & CONCEPTO
                    </span>
                  )}
                  <span className={`text-[11px] px-2.5 py-0.5 rounded-full border ${
                    isQuestionCard
                      ? 'bg-sky-900/40 border-sky-500/30 text-sky-300'
                      : 'bg-indigo-900/40 border-indigo-500/30 text-indigo-300'
                  }`}>
                    Reverso
                  </span>
                </div>

                <div className="max-w-2xl w-full flex items-center justify-center my-auto py-4">
                  <div className={`text-center w-full ${definitionTypographyClasses}`}>
                    <FormattedText text={currentCard.definition} inlineOnly={true} className="whitespace-pre-line" />
                  </div>
                </div>

                <div className={`flex items-center gap-2 text-xs sm:text-sm font-medium transition-colors ${
                  isQuestionCard
                    ? 'text-sky-300/80 group-hover:text-cyan-200'
                    : 'text-slate-400 group-hover:text-amber-300'
                }`}>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>
                    {isQuestionCard
                      ? 'Haz clic para volver a ver la pregunta'
                      : 'Haz clic para volver a ver el término'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Navegación y Evaluación de Dominio */}
          <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
            <button
              type="button"
              onClick={handlePrevCard}
              className="p-3 sm:p-3.5 min-h-[44px] min-w-[44px] rounded-2xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-slate-300 hover:text-white transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5 text-xs font-bold active:scale-95"
              title="Tarjeta anterior"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Anterior</span>
            </button>

            {/* Botones de Evaluación */}
            <div className="flex items-center gap-2 sm:gap-3 flex-1 justify-center max-w-md">
              <button
                type="button"
                onClick={() => handleUpdateMastery('to-learn')}
                className="flex-1 py-3 px-2 sm:px-3 min-h-[44px] rounded-2xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/40 text-rose-200 font-bold text-xs sm:text-sm transition-all text-center cursor-pointer shadow-md hover:scale-[1.02] active:scale-95 flex items-center justify-center"
              >
                Aún no la sé
              </button>
              <button
                type="button"
                onClick={() => handleUpdateMastery('known')}
                className="flex-1 py-3 px-2 sm:px-3 min-h-[44px] rounded-2xl bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/40 text-amber-200 font-bold text-xs sm:text-sm transition-all text-center cursor-pointer shadow-md hover:scale-[1.02] active:scale-95 flex items-center justify-center"
              >
                La conozco
              </button>
              <button
                type="button"
                onClick={() => handleUpdateMastery('mastered')}
                className="flex-1 py-3 px-2 sm:px-3 min-h-[44px] rounded-2xl bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-200 font-bold text-xs sm:text-sm transition-all text-center cursor-pointer shadow-md hover:scale-[1.02] active:scale-95 flex items-center justify-center"
              >
                ¡Dominada!
              </button>
            </div>

            <button
              type="button"
              onClick={handleNextCard}
              className="p-3 sm:p-3.5 min-h-[44px] min-w-[44px] rounded-2xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-slate-300 hover:text-white transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5 text-xs font-bold active:scale-95"
              title="Siguiente tarjeta"
            >
              <span className="hidden sm:inline">Siguiente</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : null}

      {/* Modal de Calibración de Enfoque de Flashcards (Tuerca) */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-thea-surface border border-thea-border rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl relative overflow-hidden">
            {/* Cabecera del Modal */}
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Calibrar Enfoque de Flashcards</h3>
                  <p className="text-xs text-slate-400">
                    Ajusta el tema específico y la proporción de términos vs preguntas
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="p-1.5 rounded-xl hover:bg-thea-surfaceLight text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulario */}
            <div className="space-y-5">
              {/* Campo 1: Subtema o Enfoque Temático */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Subtema o Enfoque Específico (Opcional)
                </label>
                <div className="relative">
                  <Target className="w-4 h-4 text-violet-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={focusTopic}
                    onChange={e => setFocusTopic(e.target.value)}
                    placeholder="Ej. Mecanismo de acción, fórmulas, casos clínicos o tema particular..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-thea-border text-white text-xs sm:text-sm placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Si se deja en blanco, la IA extraerá los puntos más relevantes de todo el documento.
                </p>
              </div>

              {/* Campo 2: Proporción de Formato */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Proporción de Formato
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFocusRatio('mixed-70-30')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      focusRatio === 'mixed-70-30'
                        ? 'border-violet-500 bg-violet-600/20 text-white ring-1 ring-violet-500'
                        : 'border-thea-border bg-slate-900/50 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-xs font-extrabold block text-violet-300 mb-1">
                      70% Términos / 30% Preguntas
                    </span>
                    <span className="text-[11px] leading-tight text-slate-400">
                      Balance didáctico óptimo para memorización.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFocusRatio('only-questions')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      focusRatio === 'only-questions'
                        ? 'border-cyan-500 bg-cyan-600/20 text-white ring-1 ring-cyan-500'
                        : 'border-thea-border bg-slate-900/50 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-xs font-extrabold block text-cyan-300 mb-1">
                      100% Preguntas Cortas
                    </span>
                    <span className="text-[11px] leading-tight text-slate-400">
                      Preguntas sumamente directas con respuestas concisas.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFocusRatio('only-concepts')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      focusRatio === 'only-concepts'
                        ? 'border-amber-500 bg-amber-600/20 text-white ring-1 ring-amber-500'
                        : 'border-thea-border bg-slate-900/50 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-xs font-extrabold block text-amber-300 mb-1">
                      100% Términos Clave
                    </span>
                    <span className="text-[11px] leading-tight text-slate-400">
                      Concepto o vocablo al frente y definición al reverso.
                    </span>
                  </button>
                </div>
              </div>

              {/* Campo 3: Cantidad de tarjetas */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Cantidad de Nuevas Tarjetas
                </label>
                <div className="flex items-center gap-2">
                  {[8, 10, 12, 16].map(num => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setTargetCount(num)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        targetCount === num
                          ? 'border-violet-500 bg-violet-600 text-white shadow-md'
                          : 'border-thea-border bg-slate-900/50 text-slate-400 hover:text-white'
                      }`}
                    >
                      {num} tarjetas
                    </button>
                  ))}
                </div>
              </div>

              {/* Información sobre la suma a la baraja */}
              <div className="p-3 rounded-xl bg-violet-950/30 border border-violet-500/20 text-[11px] text-violet-200/90 leading-relaxed">
                <strong>Nota:</strong> Las nuevas tarjetas generadas se sumarán directamente a tu baraja actual sin eliminar las existentes ni resetear tu progreso.
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-thea-border">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  disabled={isGeneratingTargeted}
                  className="px-4 py-2.5 rounded-xl border border-thea-border text-xs font-bold text-slate-400 hover:text-white hover:bg-thea-surfaceLight transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleGenerateCalibratedFlashcards}
                  disabled={isGeneratingTargeted}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-violet-900/40 transition-all cursor-pointer"
                >
                  {isGeneratingTargeted ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generando {targetCount} Tarjetas con IA...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Generar y Añadir a la Baraja</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
