import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { StudyKit, Question, StudyMode, DocumentAsset, ShortAnswerEvaluation, SmartStudyTypeFilters } from '../types';
import { authService } from '../services/authService';
import { googleDriveService } from '../services/googleDriveService';
import { getAssetById, safeLocalStorageSetItem } from '../services/storageService';
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  Plus,
  Play,
  TrendingUp,
  Volume2,
  Lightbulb,
  ShieldCheck,
  Trophy,
  Target,
  Award,
  AlertTriangle,
  History,
  Filter,
  Check,
  X,
  Shuffle,
  Loader2,
  FileSearch,
  Database,
  Image as ImageIcon,
  FileText,
  Settings,
  ThumbsUp,
  ThumbsDown,
  ArrowLeft,
  EyeOff,
  RotateCcw,
  BookOpen,
  FileCheck2,
  Home,
  ChevronDown,
  ZoomIn,
  CheckCheck,
} from 'lucide-react';
import { ImageZoomModal } from './ImageZoomModal';
import { TheaExplanationView } from './TheaExplanationView';
import { triggerThemeAwareConfetti as confetti } from '../utils/kittyConfetti';
import { useTheme } from '../services/themeService';
import {
  generateAIPedagogicalQuestions,
  generateSocraticReformulatedQuestion,
  generateTargetedPedagogicalQuestions,
  evaluateShortAnswer,
  parseCorrectIndex,
  parseCorrectIndices,
  enforceQuestionLengthLimit,
} from '../services/aiService';
import {
  createInitialSocraticProfile,
  updateSocraticProfileOnAnswer,
  resolveNextSocraticTarget,
  type SocraticSessionProfile
} from '../engine/socraticEngine';
import { FormattedText } from './FormattedText';
import { QuestionPrompt } from './QuestionPrompt';
import {
  MultipleChoiceRenderer,
  MultiSelectRenderer,
  MatchingRenderer,
  DragDropRenderer,
  TrueFalseRenderer,
  ShortAnswerRenderer,
} from './smart-study';
import { synthesizeAzureEdgeSpeech } from '../services/azureEdgeTtsService';

// ── Indicador Minimalista de Nivel de Dominio (Apple / Linear Studio) ──
const LevelIndicator: React.FC<{ currentLevel: number; onResetClick?: () => void }> = ({
  currentLevel,
  onResetClick,
}) => (
  <button
    type="button"
    onClick={onResetClick}
    title={`Nivel ${currentLevel}: ${currentLevel === 1 ? 'Fundamentos' : currentLevel === 2 ? 'Aplicación' : 'Dominio'} (clic para reiniciar progreso)`}
    className="active-press flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-white/20 hover:bg-white/[0.06] transition-colors cursor-pointer select-none text-xs tabular-nums"
  >
    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
      Nivel {currentLevel}
    </span>
    <div className="flex items-center gap-1">
      {[1, 2, 3].map(lvl => (
        <span
          key={lvl}
          className={`w-3.5 h-1.5 rounded-full transition-colors ${
            currentLevel >= lvl
              ? 'bg-rose-500 shadow-sm shadow-rose-950/40'
              : 'bg-white/[0.12]'
          }`}
        />
      ))}
    </div>
  </button>
);

export interface StudyHistoryItem {
  id: string;
  questionId: string;
  questionText: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  type: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
  timestamp: string;
  timestampEpoch?: number;
  attemptNumber?: number;
  level: number;
}

interface SmartStudyViewProps {
  kit: StudyKit;
  userId?: string | null;
  onUpdateKit?: (updatedKit: StudyKit) => void;
  onNavigate?: (mode: StudyMode) => void;
}

// Réplica exacta de Thea para la justificación (3 viñetas + ilustración médica con enlace a fuente)
export const GoogleSearchOverviewCard = TheaExplanationView;

/**
 * Limpia y estructura el texto de retroalimentación eliminando artefactos de prompts y formateando referencias
 */
const parseExplanationDetails = (rawText: string) => {
  if (!rawText) return { main: '', reference: null };

  // 1. Quitar artefactos de descarte no aplicable o búsqueda en google
  let clean = rawText
    .replace(/\*\*Descarte:\*\*[\s\S]*?(?=\*\*|$)/gi, '')
    .replace(/### Búsqueda en Google:[\s\S]*?(?=\*\*|$)/gi, '')
    .trim();

  // 2. Extraer referencia entre comillas si existe
  const refMatch = clean.match(/\*\*Referencia(?:\s+en\s+el\s+texto)?:\*\*\s*["“']?([^"”'\n]+)["”']?/i);
  let main = clean;
  let reference: string | null = null;

  if (refMatch) {
    reference = refMatch[1].trim();
    main = clean.slice(0, refMatch.index).trim();
  }

  // Quitar prefijos redundantes
  main = main.replace(/^La respuesta esperada era:\s*/i, '').trim();

  return { main, reference };
};

/**
 * Normaliza y sanea la estructura de una pregunta para garantizar integridad pedagógica:
 * 1. Si la pregunta tiene un prefijo mutado ('tf-', 'mc-', 'sa-'), recupera la pregunta original del kit si existe.
 * 2. Si la pregunta está marcada como 'true-false' o tiene opciones ['Verdadero', 'Falso'], pero su enunciado
 *    contiene fórmulas de selección múltiple (ej. 'cuál de los siguientes', 'selecciona', 'indica la opción'):
 *    - Si aún conserva 3 o más opciones reales, la restaura como 'multiple-choice'.
 *    - Si solo tiene ['Verdadero', 'Falso'], reestructura el enunciado a una afirmación conceptual declarativa
 *      para que la evaluación de Verdadero/Falso tenga coherencia gramatical y didáctica.
 */
function sanitizeQuestionStructure(q: Question, allKitQuestions?: Question[]): Question {
  if (!q) return q;

  // 1. Recuperar del kit original si tenía un id mutado artificialmente (ej. tf-*, mc-*, sa-*)
  if (allKitQuestions && allKitQuestions.length > 0 && /^(tf-|sa-|mc-)/.test(q.id)) {
    const rawId = q.id.replace(/^(tf-|sa-|mc-)/, '');
    const original = allKitQuestions.find(item => item.id === rawId);
    if (original && Array.isArray(original.options) && original.options.length >= 3) {
      return { ...original };
    }
  }

  const promptText = q.question || '';
  const isSelectionPrompt = /\b(cu[aá]l(es)? de (las|los)|selecciona|indica|señala (la|el|cu[aá]l)|de las siguientes|de los siguientes|de las alternativas|todas las siguientes)\b/i.test(promptText);

  // 2. Si tiene 3 o más opciones reales y estaba erróneamente tipada como true-false, restaurarla a multiple-choice
  if (Array.isArray(q.options) && q.options.length >= 3) {
    if (q.type === 'true-false') {
      return {
        ...q,
        type: 'multiple-choice',
      };
    }
    return q;
  }

  // 3. Si solo tiene opciones ['Verdadero', 'Falso'] pero el enunciado pide seleccionar opciones
  const isTFOptions = Array.isArray(q.options) &&
    q.options.length === 2 &&
    q.options.some(o => /verdadero/i.test(o)) &&
    q.options.some(o => /falso/i.test(o));

  if ((q.type === 'true-false' || isTFOptions) && isSelectionPrompt) {
    let assertion = '';
    if (q.idealAnswer && q.idealAnswer.trim().length > 10 && !/\bcu[aá]l\b/i.test(q.idealAnswer)) {
      assertion = q.idealAnswer.trim();
    } else if (q.explanation) {
      const cleanExpl = q.explanation
        .replace(/### Búsqueda en Google:[\s\S]*?(?=\*\*Fundamentación|\n\n[A-Z]|\n\n$|$)/i, '')
        .replace(/^[*\s]*(Verdadero|Falso|Opción [A-D]|Justificación|Fundamentación):?\s*/i, '')
        .trim();
      const firstSentence = cleanExpl.split(/\.\s+/)[0]?.trim();
      if (firstSentence && firstSentence.length > 12) {
        assertion = firstSentence.endsWith('.') ? firstSentence : `${firstSentence}.`;
      }
    }

    if (assertion) {
      const topicTag = q.topic ? ` sobre **${q.topic}**` : '';
      return {
        ...q,
        type: 'true-false',
        question: `Evalúa la veracidad de la siguiente proposición conceptual${topicTag}:\n\n«${assertion}»`,
        options: ['Verdadero', 'Falso'],
        correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
      };
    }
  }

  // 4. Si la pregunta es de tipo 'image-labeling', contiene etiquetas o instrucciones de arrastrar cuadros, convertirla inmediatamente a matching conceptual o multiple-choice desprendiendo cualquier foto o activo de imagen
  const isDiagramOrLabeling =
    q.type === 'image-labeling' ||
    Boolean((q as any).imageHotspots) ||
    Boolean((q as any).etiquetas_diagrama) ||
    Boolean((q as any).imageWordBank) ||
    Boolean((q as any).diagramTitle) ||
    /cuadro de texto del banco|punto correspondiente del esquema|etapas del algoritmo|diabetes tipo 2|esquema de terapia/i.test(q.question || '');

  if (isDiagramOrLabeling) {
    const { imageHotspots, diagramTitle, imageWordBank, sourceAsset, etiquetas_diagrama, ...restQ } = q as any;
    const hotspots = imageHotspots || etiquetas_diagrama;
    let cleanQuestionText = (restQ.question || '')
      .replace(/Arrastra o selecciona un cuadro de texto del banco inferior y col[oó]calo en el punto correspondiente del esquema:?/gi, '')
      .replace(/Ubica las etapas del algoritmo terap[eé]utico para la diabetes tipo 2 seg[uú]n la ADA\/EASD:?/gi, '¿Cuáles son las etapas escalonadas del algoritmo terapéutico para la diabetes tipo 2 según la ADA/EASD?')
      .replace(/Esquema de Terapia Escalonada DM2:?/gi, '')
      .trim();

    if (Array.isArray(hotspots) && hotspots.length >= 2) {
      return {
        ...restQ,
        type: 'matching',
        question: cleanQuestionText || (diagramTitle ? `Empareja las etapas o componentes del esquema (${diagramTitle}):` : 'Empareja los conceptos correspondientes:'),
        matchingPairs: hotspots.map((h: any, i: number) => ({
          term: h.label || h.termino || `Elemento ${i + 1}`,
          definition: h.hint || h.pista || h.definicion || `Fase o etapa ${i + 1}`,
        })),
        sourceAsset: undefined,
      };
    }
    return {
      ...restQ,
      type: 'multiple-choice',
      question: cleanQuestionText || restQ.question || 'Selecciona la opción correcta:',
      options: Array.isArray(restQ.options) && restQ.options.length >= 2 ? restQ.options : ['Opción A', 'Opción B', 'Opción C', 'Opción D'],
      correctIndex: typeof restQ.correctIndex === 'number' ? restQ.correctIndex : 0,
      sourceAsset: undefined,
    };
  }

  // 5. Desprender activos de páginas escaneadas de libros que no son diagramas puros
  if (q.sourceAsset) {
    const caption = (q.sourceAsset.caption || '').toLowerCase();
    const isBookPageScan =
      caption.includes('capítulo') ||
      caption.includes('capitulo') ||
      caption.includes('página') ||
      caption.includes('pagina') ||
      caption.includes('texto') ||
      caption.includes('documento') ||
      caption.includes('sección') ||
      caption.includes('seccion') ||
      caption.includes('metabolismo') ||
      caption.includes('fármaco') ||
      caption.includes('farmaco') ||
      (q.sourceAsset as any).type === 'page';
    if (isBookPageScan) {
      return {
        ...q,
        sourceAsset: undefined,
      };
    }
  }

  return q;
}

const normalizeQId = (id: string): string => (!id ? '' : id.replace(/^(?:tf-|sa-|mc-|dd-|drag-drop-)/, ''));

export const SmartStudyView: React.FC<SmartStudyViewProps> = ({ kit, userId, onUpdateKit, onNavigate }) => {
  // Conversion automatica de preguntas obsoletas de tipo 'image-labeling' a formato conceptual
  useEffect(() => {
    const needsConversion = kit?.questions?.some(q =>
      q.type === 'image-labeling' ||
      Boolean((q as any).imageHotspots) ||
      Boolean((q as any).etiquetas_diagrama) ||
      Boolean((q as any).imageWordBank) ||
      Boolean((q as any).diagramTitle)
    );
    if (needsConversion) {
      const converted = kit.questions.map(q => sanitizeQuestionStructure(q, kit.questions));
      const changed = converted.some((q, idx) => {
        const orig = kit.questions[idx];
        return q.type !== orig.type || q.question !== orig.question;
      });
      if (changed && onUpdateKit) {
        onUpdateKit({
          ...kit,
          questions: converted,
        });
      }
    }
  }, [kit?.id]);

  // ── Session Restoration (Memoria Total en Tiempo Real) ────────────────────
  const savedSession = useMemo(() => {
    return authService.getSmartStudySession(userId || null, kit.id);
  }, [userId, kit.id]);

  // ── Socratic Engine & Active Recall State ─────────────────────────────────
  const [socraticProfile, setSocraticProfile] = useState<SocraticSessionProfile>(() => {
    if ((savedSession as any)?.socraticProfile) {
      return (savedSession as any).socraticProfile;
    }
    return createInitialSocraticProfile(kit.id, kit.questions);
  });

  // ── Mode Switcher & Historial State ──────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'practice' | 'history'>(savedSession?.activeTab || 'practice');
  const [history, setHistory] = useState<StudyHistoryItem[]>(() => {
    const raw = (savedSession?.history || []).slice(0, 50);
    const getEpoch = (item: any): number => {
      if (typeof item?.timestampEpoch === 'number' && !isNaN(item.timestampEpoch)) return item.timestampEpoch;
      const match = (item?.id || '').match(/^hist-(\d+)/);
      if (match && match[1]) {
        const val = parseInt(match[1], 10);
        if (!isNaN(val)) return val;
      }
      return 0;
    };

    const hydrated = raw.map(item => {
      const cleanQId = (item.questionId || '').replace(/^(tf-|sa-|mc-|dd-|drag-drop-)/, '');
      const matchedQ = kit.questions.find(q => q.id === item.questionId || q.id === cleanQId);
      const matchedCorrect = matchedQ?.options && matchedQ.correctIndex !== undefined
        ? matchedQ.options[matchedQ.correctIndex]
        : matchedQ?.idealAnswer || item.correctAnswer || 'Respuesta verificada';
      const epoch = getEpoch(item);

      return {
        ...item,
        timestampEpoch: item.timestampEpoch || (epoch > 0 ? epoch : undefined),
        questionText: item.questionText || matchedQ?.question || 'Pregunta de evaluación',
        explanation: item.explanation || matchedQ?.explanation || 'Respuesta fundamentada en el material de estudio analizado.',
        correctAnswer: item.correctAnswer || matchedCorrect,
        userAnswer: item.userAnswer || (item.isCorrect ? matchedCorrect : 'Respuesta errónea previa'),
      };
    });

    // Ordenar estrictamente de forma descendente (pregunta más reciente al principio)
    hydrated.sort((a, b) => {
      const epA = getEpoch(a);
      const epB = getEpoch(b);
      if (epA !== epB) return epB - epA;
      if (typeof b.attemptNumber === 'number' && typeof a.attemptNumber === 'number') {
        return b.attemptNumber - a.attemptNumber;
      }
      return 0;
    });

    // Asignar attemptNumber cronológico (1 para la más antigua, N para la más reciente) a registros que no lo tengan
    const totalCount = Math.max(savedSession?.questionsAnsweredTotal || 0, hydrated.length);
    return hydrated.map((item, idx) => ({
      ...item,
      attemptNumber: item.attemptNumber || Math.max(1, totalCount - idx),
    }));
  });
  const [historyFilter, setHistoryFilter] = useState<'all' | 'correct' | 'incorrect'>(savedSession?.historyFilter || 'all');
  const [historyLevelFilter, setHistoryLevelFilter] = useState<number | 'all'>(savedSession?.historyLevelFilter || 'all');
  const [shuffleSeed, setShuffleSeed] = useState<number>(savedSession?.lastUpdated ? (savedSession as any).shuffleSeed || 1 : 1);

  // ── Progression State ────────────────────────────────────────────────────
  const [level, setLevel] = useState<1 | 2 | 3>((savedSession?.level as 1 | 2 | 3) || 1);
  const [levelCorrectCounts, setLevelCorrectCounts] = useState<Record<1 | 2 | 3, number>>(() => {
    if ((savedSession as any)?.levelCorrectCounts) {
      return (savedSession as any).levelCorrectCounts;
    }
    const currentLvl = (savedSession?.level as 1 | 2 | 3) || 1;
    const currentCnt = savedSession?.levelCorrectCount || 0;
    return {
      1: currentLvl === 1 ? currentCnt : (currentLvl > 1 ? 25 : 0),
      2: currentLvl === 2 ? currentCnt : (currentLvl > 2 ? 25 : 0),
      3: currentLvl === 3 ? currentCnt : 0,
    };
  });
  const [levelCorrectCount, setLevelCorrectCount] = useState(savedSession?.levelCorrectCount || 0); // Target: 25
  const levelTarget = 25;
  const currentLevelCorrect = levelCorrectCounts[level] ?? levelCorrectCount ?? 0;
  const [levelUpBanner, setLevelUpBanner] = useState<string>('');

  // Queue of questions answered incorrectly in this level
  const [errorQueue, setErrorQueue] = useState<Question[]>(savedSession?.errorQueue || []);
  const [isReinforcementMode, setIsReinforcementMode] = useState(savedSession?.isReinforcementMode || false);
  const [showLevelCompleteModal, setShowLevelCompleteModal] = useState(false);
  const [allCompleted, setAllCompleted] = useState(false);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);

  // Auto-desvanecer banner de nivel completado
  useEffect(() => {
    if (!levelUpBanner) return;
    const timer = setTimeout(() => {
      setLevelUpBanner('');
    }, 4500);
    return () => clearTimeout(timer);
  }, [levelUpBanner]);

  // Bloqueo de scroll y cierre con Escape para el modal de confirmación de reinicio
  useEffect(() => {
    if (!showResetConfirmModal) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowResetConfirmModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showResetConfirmModal]);

  // Global question tracking (unlimited banner)
  const [questionsAnsweredTotal, setQuestionsAnsweredTotal] = useState(savedSession?.questionsAnsweredTotal || 0);
  const [totalErrorsReinforced, setTotalErrorsReinforced] = useState(savedSession?.totalErrorsReinforced || 0);

  // Question iteration
  const wasPreviouslyAnswered = Boolean(savedSession?.isAnswered);
  const [currentIndex, setCurrentIndex] = useState(() => {
    return (savedSession?.currentIndex || 0) + (wasPreviouslyAnswered ? 1 : 0);
  });
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCurrentCorrect, setIsCurrentCorrect] = useState<boolean | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isGeneratingMore, setIsGeneratingMore] = useState(false);

  // ── Preguntas Reveladas Previamente en Banco ────────────────────────────
  const [revealedQuestionIds, setRevealedQuestionIds] = useState<string[]>(() => {
    return authService.getRevealedQuestionIds(userId || null, kit.id);
  });

  useEffect(() => {
    setRevealedQuestionIds(authService.getRevealedQuestionIds(userId || null, kit.id));
  }, [userId, kit.id]);

  // ── Interactive Question Type States ────────────────────────────────────
  const [selectedOption, setSelectedOption] = useState<number | null>(wasPreviouslyAnswered ? null : (savedSession?.selectedOption ?? null));
  const [selectedMultiIndices, setSelectedMultiIndices] = useState<number[]>(() => {
    if (wasPreviouslyAnswered || !Array.isArray(savedSession?.selectedMultiIndices)) return [];
    return savedSession.selectedMultiIndices.filter(
      (idx): idx is number => typeof idx === 'number' && Number.isInteger(idx) && idx >= 0
    );
  });
  const [activeMatchingTerm, setActiveMatchingTerm] = useState<string | null>(null);
  const [matchingPairsMap, setMatchingPairsMap] = useState<Record<string, string>>(wasPreviouslyAnswered ? {} : (savedSession?.matchingPairsMap || {}));
  const [matchingChecked, setMatchingChecked] = useState(wasPreviouslyAnswered ? false : (savedSession?.matchingChecked || false));
  const [placedChips, setPlacedChips] = useState<(string | null)[]>(wasPreviouslyAnswered ? [] : (savedSession?.placedChips || []));
  const [draggedChip, setDraggedChip] = useState<string | null>(null);
  const [dragDropChecked, setDragDropChecked] = useState(wasPreviouslyAnswered ? false : (savedSession?.dragDropChecked || false));
  const { theme } = useTheme();

  // ── RAG Evidence Modal State ───────────────────────────────────────────
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [modalChunk, setModalChunk] = useState<{
    id?: string;
    text?: string;
    pageOrSlide?: number;
    asset?: any;
  } | null>(null);
  const [zoomAsset, setZoomAsset] = useState<DocumentAsset | null>(null);
  const [generateMoreError, setGenerateMoreError] = useState<string>('');

  // ── Calibración Pedagógica & Preguntas Dirigidas (Tuerca) ───────────────
  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [activePracticeLevel, setActivePracticeLevel] = useState<1 | 2 | 3>(() => {
    return ((savedSession as any)?.activePracticeLevel as 1 | 2 | 3) || (savedSession?.level as 1 | 2 | 3) || 1;
  });
  const [targetLevel, setTargetLevel] = useState<1 | 2 | 3>(() => activePracticeLevel);
  const [targetTopic, setTargetTopic] = useState('');
  const targetCount = 10;
  const [isGeneratingTargeted, setIsGeneratingTargeted] = useState(false);
  const [isSwitchingDifficulty, setIsSwitchingDifficulty] = useState(false);
  const [switchingDiffMessage, setSwitchingDiffMessage] = useState('');
  const [targetSuccessNotice, setTargetSuccessNotice] = useState('');
  const [targetErrorNotice, setTargetErrorNotice] = useState('');

  // ── Filtros de Tipos de Pregunta (Tuerca) ──────────────────────────────
  const [typeFilters, setTypeFilters] = useState<SmartStudyTypeFilters>(() => {
    try {
      const saved = localStorage.getItem(`thea_study_type_filters_${kit.id}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          multipleChoice: true,
          trueFalse: true,
          practical: true,
          shortAnswer: Boolean(parsed.shortAnswer),
        };
      }
    } catch {}
    return {
      multipleChoice: true,
      shortAnswer: false, // Apagada por defecto al inicio; el usuario decide si prenderla
      trueFalse: true,
      practical: true,
    };
  });

  const toggleTypeFilter = (key: keyof SmartStudyTypeFilters) => {
    setTypeFilters(prev => {
      const next: SmartStudyTypeFilters = {
        multipleChoice: true,
        trueFalse: true,
        practical: true,
        shortAnswer: key === 'shortAnswer' ? !prev.shortAnswer : prev.shortAnswer,
      };
      try {
        safeLocalStorageSetItem(`thea_study_type_filters_${kit.id}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Referencia para barajado inteligente de categorías (evita rachas monótonas consecutivas)
  const recentCategoriesRef = useRef<(keyof SmartStudyTypeFilters)[]>([]);

  // ── Respuestas Abiertas Cortas (Short Answer) ──────────────────────────
  const [shortAnswerInput, setShortAnswerInput] = useState<string>(wasPreviouslyAnswered ? '' : (savedSession?.shortAnswerInput || ''));
  const [isEvaluatingShortAnswer, setIsEvaluatingShortAnswer] = useState<boolean>(false);
  const [shortAnswerEvalResult, setShortAnswerEvalResult] = useState<ShortAnswerEvaluation | null>(null);
  const [isManuallyOverridden, setIsManuallyOverridden] = useState<boolean>(false);

  // ── Feedback y Navegación de Explicación ─────────────────────────────────
  const [feedbackGiven, setFeedbackGiven] = useState<'up' | 'down' | null>(null);
  const explanationRef = useRef<HTMLDivElement>(null);

  // Candados de seguridad anti-doble clic y proteccion al avanzar preguntas
  const lastQuestionLoadTimeRef = useRef<number>(Date.now());
  const isAdvancingRef = useRef<boolean>(false);
  const [isAdvancing, setIsAdvancing] = useState<boolean>(false);

  // ── Justificaciones desplegables bajo demanda (Historial) ───
  const [expandedHistoryQuestions, setExpandedHistoryQuestions] = useState<Set<string>>(new Set());

  const toggleHistoryJustification = (questionId: string) => {
    setExpandedHistoryQuestions(prev => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  };

  // ── Tracking de Preguntas Respondidas y Vistas (para rotación dinámica y generación) ──
  const answeredQuestionIdsRef = useRef<Set<string>>((() => {
    const ids = new Set<string>();
    const sessionAnswered = (savedSession as any)?.answeredQuestionIds;
    if (Array.isArray(sessionAnswered)) {
      sessionAnswered.forEach((id: string) => {
        if (id) {
          ids.add(id);
          ids.add(normalizeQId(id));
        }
      });
    }
    const sessionResetAt = (savedSession as any)?.resetAt || 0;
    if (Array.isArray(savedSession?.history)) {
      savedSession.history.forEach((h: any) => {
        if (h?.questionId) {
          const hEpoch = typeof h.timestampEpoch === 'number' ? h.timestampEpoch : 0;
          if (sessionResetAt > 0 && hEpoch > 0 && hEpoch < sessionResetAt) return;
          if (sessionResetAt > 0 && hEpoch === 0 && Array.isArray(sessionAnswered) && sessionAnswered.length === 0) return;
          ids.add(h.questionId);
          ids.add(normalizeQId(h.questionId));
        }
      });
    }
    if (savedSession?.isAnswered) {
      const lastId = savedSession.currentQuestion?.id || savedSession.currentQuestionId;
      if (lastId) {
        ids.add(lastId);
        ids.add(normalizeQId(lastId));
      }
    }
    return ids;
  })());

  const isQuestionAnswered = useCallback((qId: string): boolean => {
    if (!qId) return false;
    return answeredQuestionIdsRef.current.has(qId) || answeredQuestionIdsRef.current.has(normalizeQId(qId));
  }, []);

  const markQuestionAsAnswered = useCallback((qId: string) => {
    if (!qId) return;
    answeredQuestionIdsRef.current.add(qId);
    answeredQuestionIdsRef.current.add(normalizeQId(qId));
  }, []);

  const completedSocraticIdsRef = useRef<Set<string>>(new Set());
  const seenQuestionIdsRef = useRef<Set<string>>(
    new Set([
      ...((savedSession as any)?.seenQuestionIds || []),
      ...(savedSession?.currentQuestionId ? [savedSession.currentQuestionId] : [])
    ])
  );

  // Referencias y helpers de persistencia inmediata e hidratación segura
  const latestSessionRef = useRef<any>(null);
  const autoSaveTimerRef = useRef<any>(null);
  const resetAtRef = useRef<number>((savedSession as any)?.resetAt || 0);
  const sessionTimestampRef = useRef<number>(savedSession?.lastUpdated || 0);
  const hasMountedSaveCycleRef = useRef(false);
  const hasPendingLocalChangeRef = useRef(false);
  const hasUnflushedDriveSyncRef = useRef(false);
  const lastSavedSignatureRef = useRef<string>('');
  const hasUserInteractedRef = useRef(false);
  const pendingIdbHydrationRef = useRef(!savedSession);
  const persistedActiveQIdRef = useRef<string | null | undefined>(undefined);
  const skipNextQuestionResetRef = useRef(false);

  const buildSessionSignature = useCallback((snap: {
    kitId: string;
    currentIndex: number;
    level: number;
    activePracticeLevel: number;
    currentQuestionId?: string;
    isAnswered: boolean;
    isCurrentCorrect: boolean | null;
    levelCorrectCount: number;
    questionsAnsweredTotal: number;
    errorQueueLength: number;
    isReinforcementMode: boolean;
    answeredCount: number;
    revealedCount: number;
    selectedOption: number | null;
    selectedMultiIndices: number[];
    matchingPairsMap: Record<string, string>;
    matchingChecked: boolean;
    placedChips: (string | null)[];
    dragDropChecked: boolean;
    shortAnswerInput: string;
    activeTab: 'practice' | 'history';
    historyFilter: 'all' | 'correct' | 'incorrect';
    historyLevelFilter: number | 'all';
    shuffleSeed: number;
  }) => {
    const multiSig = [...(snap.selectedMultiIndices || [])].sort((a, b) => a - b).join(',');
    const matchSig = snap.matchingPairsMap
      ? Object.keys(snap.matchingPairsMap).sort().map(k => `${k}:${snap.matchingPairsMap[k]}`).join(';')
      : '';
    const chipsSig = Array.isArray(snap.placedChips) ? snap.placedChips.map(c => c ?? '').join(',') : '';
    return [
      snap.kitId,
      snap.currentIndex,
      snap.level,
      snap.activePracticeLevel,
      snap.currentQuestionId || '',
      snap.isAnswered ? '1' : '0',
      snap.isCurrentCorrect === null ? 'n' : String(snap.isCurrentCorrect),
      snap.levelCorrectCount,
      snap.questionsAnsweredTotal,
      snap.errorQueueLength,
      snap.isReinforcementMode ? '1' : '0',
      snap.answeredCount,
      snap.revealedCount,
      snap.selectedOption ?? 'n',
      multiSig,
      matchSig,
      snap.matchingChecked ? '1' : '0',
      chipsSig,
      snap.dragDropChecked ? '1' : '0',
      snap.shortAnswerInput || '',
      snap.activeTab,
      snap.historyFilter,
      String(snap.historyLevelFilter),
      snap.shuffleSeed,
    ].join('|');
  }, []);

  const persistSessionSnapshot = useCallback((
    overrides?: Record<string, any>,
    options?: { source?: 'local' | 'initial_pin' }
  ) => {
    if (!kit?.id || !latestSessionRef.current) return;
    const merged = overrides ? { ...latestSessionRef.current, ...overrides } : { ...latestSessionRef.current };
    if (!merged.currentQuestionId || merged.currentQuestionId === 'thea-placeholder-loading') return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    const source = options?.source || 'local';
    const savedAt = typeof overrides?.lastUpdated === 'number' ? overrides.lastUpdated : Date.now();
    merged.lastUpdated = savedAt;
    sessionTimestampRef.current = savedAt;
    latestSessionRef.current = merged;
    hasPendingLocalChangeRef.current = false;
    if (source !== 'initial_pin') {
      hasUnflushedDriveSyncRef.current = true;
    }
    persistedActiveQIdRef.current = merged.currentQuestionId;

    lastSavedSignatureRef.current = buildSessionSignature({
      kitId: kit.id,
      currentIndex: merged.currentIndex ?? 0,
      level: merged.level ?? 1,
      activePracticeLevel: merged.activePracticeLevel ?? merged.level ?? 1,
      currentQuestionId: merged.currentQuestionId,
      isAnswered: Boolean(merged.isAnswered),
      isCurrentCorrect: merged.isCurrentCorrect ?? null,
      levelCorrectCount: merged.levelCorrectCount ?? 0,
      questionsAnsweredTotal: merged.questionsAnsweredTotal ?? 0,
      errorQueueLength: Array.isArray(merged.errorQueue) ? merged.errorQueue.length : 0,
      isReinforcementMode: Boolean(merged.isReinforcementMode),
      answeredCount: answeredQuestionIdsRef.current.size,
      revealedCount: Array.isArray(merged.revealedQuestionIds) ? merged.revealedQuestionIds.length : revealedQuestionIds.length,
      selectedOption: merged.selectedOption ?? null,
      selectedMultiIndices: merged.selectedMultiIndices || [],
      matchingPairsMap: merged.matchingPairsMap || {},
      matchingChecked: Boolean(merged.matchingChecked),
      placedChips: merged.placedChips || [],
      dragDropChecked: Boolean(merged.dragDropChecked),
      shortAnswerInput: merged.shortAnswerInput || '',
      activeTab: merged.activeTab || 'practice',
      historyFilter: merged.historyFilter || 'all',
      historyLevelFilter: merged.historyLevelFilter ?? 'all',
      shuffleSeed: merged.shuffleSeed || 1,
    });

    authService.saveSmartStudySession(userId || null, kit.id, merged, { source });
  }, [kit?.id, userId, buildSessionSignature, revealedQuestionIds.length]);

  const handleSelectDifficulty = async (selectedLvl: 1 | 2 | 3) => {
    if (isSwitchingDifficulty || isGeneratingTargeted) return;

    setTargetLevel(selectedLvl);
    setActivePracticeLevel(selectedLvl);
    setTargetErrorNotice('');
    setTargetSuccessNotice('');

    // Marcar la pregunta actual como vista antes de conmutar
    if (currentQ?.id) {
      seenQuestionIdsRef.current.add(currentQ.id);
    }

    const targetDiff: 'easy' | 'medium' | 'hard' = selectedLvl === 1 ? 'easy' : selectedLvl === 2 ? 'medium' : 'hard';
    const allInDiff = kit.questions.filter(q => q.type !== 'image-labeling' && (q.difficulty || 'easy') === targetDiff);

    // Conjunto de preguntas ya consumidas (respondidas o vistas)
    const consumedIds = new Set([
      ...Array.from(answeredQuestionIdsRef.current),
      ...Array.from(seenQuestionIdsRef.current),
    ]);

    // Preguntas de este nivel que aún no han sido vistas ni respondidas, y distintas a la actual
    let availableInDiff = allInDiff.filter(q => !consumedIds.has(q.id) && q.id !== currentQ?.id);

    // Si quedan menos de 7 preguntas disponibles en esta dificultad -> Generar tanda de 10 con IA
    if (availableInDiff.length < 7 || allInDiff.length < 7) {
      setIsSwitchingDifficulty(true);
      setSwitchingDiffMessage(
        `Generando tanda completa de 10 preguntas de Nivel ${selectedLvl} con IA...`
      );

      try {
        let generated: Question[] = [];
        if (targetTopic && targetTopic.trim()) {
          generated = await generateTargetedPedagogicalQuestions(
            kit.sourceText || kit.description,
            targetTopic,
            selectedLvl,
            10,
            kit.chunks
          );
        } else {
          generated = await generateAIPedagogicalQuestions(
            kit.sourceText || kit.description,
            10,
            targetDiff,
            kit.chunks
          );
        }

        if (generated && generated.length > 0) {
          const marked = generated.map(q => ({
            ...q,
            difficulty: targetDiff,
          }));

          const existingIds = new Set(kit.questions.map(q => q.id));
          const fresh = marked.filter(q => !existingIds.has(q.id));
          const updatedKitQuestions = [...kit.questions, ...fresh];

          if (onUpdateKit) {
            onUpdateKit({
              ...kit,
              questions: updatedKitQuestions,
            });
          }

          const firstQ = fresh[0] || marked[0];
          hasUserInteractedRef.current = true;
          seenQuestionIdsRef.current.add(firstQ.id);
          setCurrentQuestion(firstQ);
          lastQId.current = firstQ.id;

          // Limpieza de respuestas activas
          setSelectedOption(null);
          setSelectedMultiIndices([]);
          setActiveMatchingTerm(null);
          setMatchingPairsMap({});
          setMatchingChecked(false);
          setPlacedChips([]);
          setDragDropChecked(false);
          setShortAnswerInput('');
          setShortAnswerEvalResult(null);
          setIsManuallyOverridden(false);
          setIsAnswered(false);
          setIsCurrentCorrect(null);
          setFeedbackGiven(null);
          setCurrentIndex(0);

          // Guardar síncronamente en memoria de sesión
          persistSessionSnapshot({
            currentIndex: 0,
            level,
            activePracticeLevel: selectedLvl,
            currentQuestionId: firstQ.id,
            currentQuestion: firstQ,
            levelCorrectCount: currentLevelCorrect,
            levelCorrectCounts,
            errorQueue: [],
            isReinforcementMode: false,
            selectedOption: null,
            selectedMultiIndices: [],
            matchingPairsMap: {},
            matchingChecked: false,
            placedChips: [],
            dragDropChecked: false,
            isAnswered: false,
            isCurrentCorrect: null,
            shortAnswerInput: '',
            activeTab,
            history: history.slice(0, 50),
            historyFilter,
            historyLevelFilter,
            questionsAnsweredTotal,
            totalErrorsReinforced,
            socraticProfile,
            revealedQuestionIds,
            seenQuestionIds: Array.from(seenQuestionIdsRef.current).slice(-100),
            shuffleSeed: 1,
          });

          setTargetSuccessNotice(
            `Se generaron ${fresh.length} preguntas de Nivel ${selectedLvl}. Pregunta activa actualizada.`
          );
          setTimeout(() => {
            setShowConfigDrawer(false);
            setTargetSuccessNotice('');
          }, 1200);
        } else {
          // Si la IA no generó, pero hay disponibles en el banco, rotar a la siguiente
          if (availableInDiff.length === 0) {
            seenQuestionIdsRef.current.clear();
            availableInDiff = allInDiff.filter(q => q.id !== currentQ?.id);
          }
          const fallbackQ = availableInDiff[Math.floor(Math.random() * availableInDiff.length)] || allInDiff[0];
          if (fallbackQ) {
            seenQuestionIdsRef.current.add(fallbackQ.id);
            setCurrentQuestion(fallbackQ);
            lastQId.current = fallbackQ.id;
            setSelectedOption(null);
            setSelectedMultiIndices([]);
            setIsAnswered(false);
            setIsCurrentCorrect(null);
          }
          setTimeout(() => setShowConfigDrawer(false), 300);
        }
      } catch (err) {
        console.error('Error al generar preguntas de dificultad:', err);
        const msg = err instanceof Error ? err.message : 'Error al conectar con el servicio de IA.';
        setTargetErrorNotice(msg);
        if (availableInDiff.length === 0) {
          seenQuestionIdsRef.current.clear();
          availableInDiff = allInDiff.filter(q => q.id !== currentQ?.id);
        }
        const fallbackQ = availableInDiff[Math.floor(Math.random() * availableInDiff.length)] || allInDiff[0];
        if (fallbackQ) {
          seenQuestionIdsRef.current.add(fallbackQ.id);
          setCurrentQuestion(fallbackQ);
          lastQId.current = fallbackQ.id;
          setSelectedOption(null);
          setSelectedMultiIndices([]);
          setIsAnswered(false);
          setIsCurrentCorrect(null);
        }
      } finally {
        setIsSwitchingDifficulty(false);
        setSwitchingDiffMessage('');
      }
    } else {
      // El banco tiene 7 o más preguntas disponibles en esta dificultad: tomar una aleatoria no vista
      const nextQ = availableInDiff[Math.floor(Math.random() * availableInDiff.length)] || availableInDiff[0];
      hasUserInteractedRef.current = true;
      seenQuestionIdsRef.current.add(nextQ.id);
      setCurrentQuestion(nextQ);
      lastQId.current = nextQ.id;

      // Limpieza de respuestas activas
      setSelectedOption(null);
      setSelectedMultiIndices([]);
      setActiveMatchingTerm(null);
      setMatchingPairsMap({});
      setMatchingChecked(false);
      setPlacedChips([]);
      setDragDropChecked(false);
      setShortAnswerInput('');
      setShortAnswerEvalResult(null);
      setIsManuallyOverridden(false);
      setIsAnswered(false);
      setIsCurrentCorrect(null);
      setFeedbackGiven(null);
      setCurrentIndex(0);

      // Guardar síncronamente en memoria de sesión
      persistSessionSnapshot({
        currentIndex: 0,
        level,
        activePracticeLevel: selectedLvl,
        currentQuestionId: nextQ.id,
        currentQuestion: nextQ,
        levelCorrectCount: currentLevelCorrect,
        levelCorrectCounts,
        errorQueue: [],
        isReinforcementMode: false,
        selectedOption: null,
        selectedMultiIndices: [],
        matchingPairsMap: {},
        matchingChecked: false,
        placedChips: [],
        dragDropChecked: false,
        isAnswered: false,
        isCurrentCorrect: null,
        shortAnswerInput: '',
        activeTab,
        history: history.slice(0, 50),
        historyFilter,
        historyLevelFilter,
        questionsAnsweredTotal,
        totalErrorsReinforced,
        socraticProfile,
        revealedQuestionIds,
        seenQuestionIds: Array.from(seenQuestionIdsRef.current).slice(-100),
        shuffleSeed: 1,
      });

      // Cerrar el cajón suavemente para mostrar la nueva pregunta de inmediato
      setTimeout(() => setShowConfigDrawer(false), 300);
    }
  };

  const handleGenerateTargetedQuestions = async () => {
    if (isGeneratingTargeted) return;
    setIsGeneratingTargeted(true);
    setTargetErrorNotice('');
    setTargetSuccessNotice('');

    try {
      const generated = await generateTargetedPedagogicalQuestions(
        kit.sourceText || kit.description,
        targetTopic,
        targetLevel,
        targetCount,
        kit.chunks
      );

      if (generated.length > 0) {
        // Se preserva el nivel de progreso real ganado sin alterarlo por la dificultad de práctica
        setActivePracticeLevel(targetLevel);
        setShuffleSeed(1);
        setCurrentIndex(0);
        setIsReinforcementMode(false);
        setSelectedOption(null);
        setSelectedMultiIndices([]);
        setIsAnswered(false);
        setIsCurrentCorrect(null);
        const randomTargetedQ = generated[Math.floor(Math.random() * generated.length)] || generated[0];
        hasUserInteractedRef.current = true;
        setCurrentQuestion(randomTargetedQ);
        lastQId.current = randomTargetedQ.id;

        const updatedQuestions = [...generated, ...kit.questions];
        if (onUpdateKit) {
          onUpdateKit({
            ...kit,
            questions: updatedQuestions,
          });
        }

        // Guardar de inmediato en la sesión activa para persistencia total al cambiar de pestaña
        persistSessionSnapshot({
          currentIndex: 0,
          level,
          activePracticeLevel: targetLevel,
          currentQuestionId: randomTargetedQ.id,
          currentQuestion: randomTargetedQ,
          levelCorrectCount: currentLevelCorrect,
          levelCorrectCounts,
          errorQueue: [],
          isReinforcementMode: false,
          selectedOption: null,
          selectedMultiIndices: [],
          matchingPairsMap: {},
          matchingChecked: false,
          placedChips: [],
          dragDropChecked: false,
          isAnswered: false,
          isCurrentCorrect: null,
          shortAnswerInput: '',
          activeTab,
          history: history.slice(0, 50),
          historyFilter,
          historyLevelFilter,
          questionsAnsweredTotal,
          totalErrorsReinforced,
          socraticProfile,
          revealedQuestionIds,
          shuffleSeed: 1,
        });

        setTargetSuccessNotice(
          `Se generaron ${generated.length} preguntas de Nivel ${targetLevel} ${targetTopic.trim() ? `sobre "${targetTopic.trim()}"` : ''} listas para responder.`
        );

        setTimeout(() => {
          setShowConfigDrawer(false);
          setTargetSuccessNotice('');
        }, 1500);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al generar preguntas calibradas.';
      setTargetErrorNotice(msg);
    } finally {
      setIsGeneratingTargeted(false);
    }
  };

  const handleGenerateMoreQuestions = async () => {
    if (isGeneratingMore) return;
    setIsGeneratingMore(true);
    setGenerateMoreError('');
    try {
      const targetDiff = level === 1 ? 'easy' : level === 2 ? 'medium' : 'hard';
      const newQuestions = await generateAIPedagogicalQuestions(
        kit.sourceText || kit.description,
        5,
        targetDiff,
        kit.chunks
      );
      if (newQuestions.length > 0 && onUpdateKit) {
        const existingIds = new Set(kit.questions.map(q => q.id));
        const fresh = newQuestions.filter(q => !existingIds.has(q.id));
        if (fresh.length > 0) {
          onUpdateKit({
            ...kit,
            questions: [...kit.questions, ...fresh],
          });
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No fue posible generar más preguntas con IA.';
      setGenerateMoreError(msg);
      setTimeout(() => setGenerateMoreError(''), 8000);
    } finally {
      setIsGeneratingMore(false);
    }
  };

  // ── Generación Continua de Preguntas IA (Prefetching predictivo mientras avanzas) ──
  const isAutoGeneratingRef = useRef(false);

  // Helper para identificar preguntas de detección de concepto falso, afirmación falsa o impostor
  const isFalseConceptQuestion = useCallback((q?: Question | null): boolean => {
    if (!q?.question) return false;
    return /\b(falsa|falso|falsas|incorrecta|incorrecto|incorrectas|equivocado|equivocada|equivocados|excepto|no corresponde|no pertenecen|no pertenece)\b/i.test(q.question);
  }, []);

  const checkAndPrefetchQuestions = useCallback(async (activeLevel: 1 | 2 | 3, activeIndex: number) => {
    if (isAutoGeneratingRef.current) return;

    const targetDiff = activeLevel === 1 ? 'easy' : activeLevel === 2 ? 'medium' : 'hard';
    const currentPool = kit.questions.filter(q => q.difficulty === targetDiff);
    const remainingAhead = currentPool.length - (activeIndex + 1);

    // Prefetch continuo equilibrado cuando quedan 3 o menos preguntas por delante en este nivel o el banco inicial tiene menos de 8
    if (remainingAhead <= 3 || currentPool.length < 8) {
      isAutoGeneratingRef.current = true;
      setIsGeneratingMore(true);

      try {
        const generated = await generateAIPedagogicalQuestions(
          kit.sourceText || kit.description,
          5,
          targetDiff,
          kit.chunks
        );

        if (generated.length > 0 && onUpdateKit) {
          const existingIds = new Set(kit.questions.map(q => q.id));
          const fresh = generated.filter(q => !existingIds.has(q.id));
          if (fresh.length > 0) {
            onUpdateKit({
              ...kit,
              questions: [...kit.questions, ...fresh], // Siempre adjuntar al final para mantener el orden
            });
          }
        }
      } catch (err) {
        console.warn('[SmartStudy Continuous Stream] Error en generación en segundo plano:', err);
      } finally {
        isAutoGeneratingRef.current = false;
        setIsGeneratingMore(false);
      }
    }
  }, [kit, onUpdateKit, isFalseConceptQuestion]);

  // Disparar verificación y generación continua al cambiar de nivel o avanzar índice
  useEffect(() => {
    checkAndPrefetchQuestions(activePracticeLevel, currentIndex);
  }, [activePracticeLevel, currentIndex, checkAndPrefetchQuestions]);

  // ── Socratic Active Recall & Question Selection Logic ─────────────────────

  // Categorización y adaptación de preguntas para distribución proporcional
  const getCategoryForQuestion = useCallback((q: Question): keyof SmartStudyTypeFilters => {
    const t = q.type || 'multiple-choice';
    if (t === 'short-answer') return 'shortAnswer';
    if (t === 'true-false') return 'trueFalse';
    if (t === 'matching' || t === 'drag-drop') return 'practical';
    return 'multipleChoice';
  }, []);

  const adaptQuestionToCategory = useCallback((baseQ: Question, _targetCat: keyof SmartStudyTypeFilters): Question => {
    if (!baseQ) return baseQ;
    return sanitizeQuestionStructure(baseQ, kit.questions);
  }, [kit.questions]);

  // Helper determinista para resolver la siguiente pregunta al avanzar sin repeticiones inmediatas
  const resolveNextQuestion = useCallback((
    targetLevel: 1 | 2 | 3,
    targetIndex: number,
    inReinforcement: boolean,
    queue: Question[],
    excludeQuestionId?: string
  ): Question => {
    if (inReinforcement && queue.length > 0) {
      return queue[0];
    }

    // Comprobar si hay una intervención socrática lista que no sea la actual ni haya sido ya completada
    const socraticTarget = resolveNextSocraticTarget(socraticProfile, targetIndex);
    if (
      socraticTarget &&
      socraticTarget.reformulatedQuestion &&
      socraticTarget.reformulatedQuestion.id !== excludeQuestionId &&
      !completedSocraticIdsRef.current.has(socraticTarget.reformulatedQuestion.id)
    ) {
      return socraticTarget.reformulatedQuestion;
    }

    // Distribución aleatoria inteligente (shuffle no repetitivo) entre los formatos activos (tuerca)
    const activeCategories: (keyof SmartStudyTypeFilters)[] = (
      ['multipleChoice', 'shortAnswer', 'trueFalse', 'practical'] as (keyof SmartStudyTypeFilters)[]
    ).filter(cat => typeFilters[cat]);
    const safeActiveCategories = activeCategories.length > 0 ? activeCategories : (['multipleChoice'] as (keyof SmartStudyTypeFilters)[]);

    // Barajado inteligente: mezclar formatos para una secuencia impredecible y estimulante sin rachas monótonas
    let targetCat: keyof SmartStudyTypeFilters;
    if (safeActiveCategories.length === 1) {
      targetCat = safeActiveCategories[0];
    } else {
      const recent = recentCategoriesRef.current;
      const lastCat = recent[recent.length - 1];
      const nonConsecutive = safeActiveCategories.filter(c => c !== lastCat);
      const candidatesToPick = nonConsecutive.length > 0 ? nonConsecutive : safeActiveCategories;
      targetCat = candidatesToPick[Math.floor(Math.random() * candidatesToPick.length)];
    }
    recentCategoriesRef.current = [...recentCategoriesRef.current.slice(-5), targetCat];

    const targetDiff = targetLevel === 1 ? 'easy' : targetLevel === 2 ? 'medium' : 'hard';
    const levelQuestions = kit.questions.filter(q => (q.difficulty || 'easy') === targetDiff);
    const pool = levelQuestions.length > 0 ? levelQuestions : kit.questions;

    // Frecuencia moderada y aleatoria de afirmaciones falsas (~15% - 20%): solo ocasionalmente y de forma impredecible
    const shouldPreferFalseConcept = (targetCat === 'multipleChoice') && (Math.random() < 0.18);

    // Shuffle de índices para exploración aleatoria impredecible del banco disponible
    const shuffledIndices = Array.from({ length: pool.length }, (_, i) => i).sort(() => Math.random() - 0.5);

    if (shouldPreferFalseConcept) {
      for (const i of shuffledIndices) {
        const candidate = pool[i];
        if (
          candidate.id !== excludeQuestionId &&
          !isQuestionAnswered(candidate.id) &&
          getCategoryForQuestion(candidate) === targetCat &&
          isFalseConceptQuestion(candidate)
        ) {
          return sanitizeQuestionStructure(candidate, kit.questions);
        }
      }
    }

    // Prioridad 1: Buscar una pregunta no respondida de este nivel que coincida con el tipo deseado
    // Si NO se pidió concepto falso, priorizar una que NO sea de concepto falso para mantener variedad afirmativa
    for (const i of shuffledIndices) {
      const candidate = pool[i];
      if (
        candidate.id !== excludeQuestionId &&
        !isQuestionAnswered(candidate.id) &&
        getCategoryForQuestion(candidate) === targetCat &&
        (!shouldPreferFalseConcept ? !isFalseConceptQuestion(candidate) : true)
      ) {
        return sanitizeQuestionStructure(candidate, kit.questions);
      }
    }

    // Prioridad 1b: Si no había afirmativa de ese tipo, aceptar cualquier pregunta no respondida del tipo deseado
    for (const i of shuffledIndices) {
      const candidate = pool[i];
      if (
        candidate.id !== excludeQuestionId &&
        !isQuestionAnswered(candidate.id) &&
        getCategoryForQuestion(candidate) === targetCat
      ) {
        return sanitizeQuestionStructure(candidate, kit.questions);
      }
    }

    // Si targetCat era 'trueFalse' y el nivel carece de preguntas nativas de Verdadero/Falso:
    // Disparar en segundo plano la generación predictiva para incorporar preguntas legítimas de V/F al kit
    if (targetCat === 'trueFalse' && !pool.some(q => getCategoryForQuestion(q) === 'trueFalse')) {
      checkAndPrefetchQuestions(targetLevel, targetIndex);
    }

    // Prioridad 2: Buscar cualquier no respondida del nivel que coincida con ALGUNA de las categorías activas
    for (const i of shuffledIndices) {
      const candidate = pool[i];
      if (
        candidate.id !== excludeQuestionId &&
        !isQuestionAnswered(candidate.id) &&
        safeActiveCategories.includes(getCategoryForQuestion(candidate))
      ) {
        return sanitizeQuestionStructure(candidate, kit.questions);
      }
    }

    // Prioridad 2b: Buscar cualquier no respondida del nivel
    for (const i of shuffledIndices) {
      const candidate = pool[i];
      if (candidate.id !== excludeQuestionId && !isQuestionAnswered(candidate.id)) {
        return sanitizeQuestionStructure(candidate, kit.questions);
      }
    }

    // Prioridad 3: Si ya se respondieron todas las del nivel, activar prefetch IA y buscar en otros niveles preguntas no respondidas
    checkAndPrefetchQuestions(targetLevel, targetIndex);
    const unansInKit = kit.questions.find(q => q.id !== excludeQuestionId && !isQuestionAnswered(q.id));
    if (unansInKit) {
      return sanitizeQuestionStructure(unansInKit, kit.questions);
    }

    // Prioridad 4: Si absolutamente todas las preguntas del kit han sido respondidas, elegir la del pool distinta a la excluida
    for (const i of shuffledIndices) {
      const candidate = pool[i];
      if (candidate.id !== excludeQuestionId) {
        return sanitizeQuestionStructure(candidate, kit.questions);
      }
    }

    // Prioridad 5: En kit general
    const randomKitQ = kit.questions.find(q => q.id !== excludeQuestionId) || kit.questions[0];
    return sanitizeQuestionStructure(randomKitQ, kit.questions);
  }, [kit.questions, socraticProfile, typeFilters, getCategoryForQuestion, adaptQuestionToCategory, isFalseConceptQuestion, checkAndPrefetchQuestions]);

  // Pregunta activa fijada en estado: NUNCA cambia por efectos secundarios en segundo plano
  const [currentQuestion, setCurrentQuestion] = useState<Question>(() => {
    if (savedSession?.errorQueue && savedSession.errorQueue.length > 0 && savedSession.isReinforcementMode) {
      return sanitizeQuestionStructure(savedSession.errorQueue[0], kit.questions);
    }

    const wasAnswered = Boolean(savedSession?.isAnswered);
    const prevQId = savedSession?.currentQuestion?.id || savedSession?.currentQuestionId;

    // Caso 1: La pregunta NO estaba respondida previamente.
    // Preservar exactamente la misma pregunta para que el usuario pueda continuar respondiendo justo donde se quedó,
    // incluso si el kit ya dio una vuelta al banco o tiene historial previo.
    if (!wasAnswered && prevQId && prevQId !== 'thea-placeholder-loading') {
      if (savedSession?.currentQuestion && savedSession.currentQuestion.id) {
        const currQ = savedSession.currentQuestion;
        const rawId = normalizeQId(currQ.id);
        const found = kit.questions?.find(q => q.id === currQ.id) || kit.questions?.find(q => q.id === rawId);
        return sanitizeQuestionStructure(found || currQ, kit.questions);
      }
      if (savedSession?.currentQuestionId && kit.questions && kit.questions.length > 0) {
        const rawId = normalizeQId(savedSession.currentQuestionId);
        const found = kit.questions.find(q => q.id === savedSession.currentQuestionId) || kit.questions.find(q => q.id === rawId);
        if (found) {
          return sanitizeQuestionStructure(found, kit.questions);
        }
      }
    }

    if (!kit.questions || kit.questions.length === 0) {
      return {
        id: 'thea-placeholder-loading',
        question: 'Cargando preguntas del kit...',
        options: ['Opción A', 'Opción B', 'Opción C', 'Opción D'],
        correctIndex: 0,
        explanation: 'Preparando el kit de estudio.',
        difficulty: 'easy',
        topic: 'General',
        type: 'multiple-choice',
      };
    }

    const practiceLevel = (savedSession as any)?.activePracticeLevel || (savedSession?.level as 1 | 2 | 3) || 1;

    // Caso 2: Si ya estaba respondida (o ya está registrada en answeredQuestionIds), avanzar automáticamente a una nueva pregunta no respondida
    const nextQ = resolveNextQuestion(
      practiceLevel,
      (savedSession?.currentIndex || 0) + (wasAnswered ? 1 : 0),
      false,
      [],
      prevQId
    );
    if (nextQ && nextQ.id !== 'thea-placeholder-loading') {
      return sanitizeQuestionStructure(nextQ, kit.questions);
    }

    const targetDiff = practiceLevel === 1 ? 'easy' : practiceLevel === 2 ? 'medium' : 'hard';
    const pool = kit.questions.filter(q => (q.difficulty || 'easy') === targetDiff);
    const finalPool = pool.length > 0 ? pool : kit.questions;
    const activeCategories: (keyof SmartStudyTypeFilters)[] = (
      ['multipleChoice', 'shortAnswer', 'trueFalse', 'practical'] as (keyof SmartStudyTypeFilters)[]
    ).filter(cat => typeFilters[cat]);
    const safeActiveCategories = activeCategories.length > 0 ? activeCategories : (['multipleChoice'] as (keyof SmartStudyTypeFilters)[]);

    // Aleatorio puro no respondido desde el primer segundo
    const unansPool = finalPool.filter(q => !isQuestionAnswered(q.id));
    const candidatePool = unansPool.length > 0 ? unansPool : finalPool;
    const randomCat = safeActiveCategories[Math.floor(Math.random() * safeActiveCategories.length)];
    const matchingCatQ = candidatePool.find(q => getCategoryForQuestion(q) === randomCat);
    const raw = matchingCatQ || candidatePool[Math.floor(Math.random() * candidatePool.length)] || kit.questions[0];
    return sanitizeQuestionStructure(raw, kit.questions);
  });

  // Hidratar pregunta activa si el kit llega asíncronamente con preguntas completas
  useEffect(() => {
    if (kit.questions && kit.questions.length > 0) {
      if (!currentQuestion || currentQuestion.id === 'thea-placeholder-loading') {
        const wasAnswered = Boolean(savedSession?.isAnswered);
        const prevQId = savedSession?.currentQuestion?.id || savedSession?.currentQuestionId;

        if (!wasAnswered && prevQId && prevQId !== 'thea-placeholder-loading') {
          if (savedSession?.currentQuestion && savedSession.currentQuestion.id) {
            const currQ = savedSession.currentQuestion;
            const rawId = normalizeQId(currQ.id);
            const matched = kit.questions.find(q => q.id === currQ.id) || kit.questions.find(q => q.id === rawId) || currQ;
            skipNextQuestionResetRef.current = true;
            setCurrentQuestion(sanitizeQuestionStructure(matched, kit.questions));
            return;
          }
          if (savedSession?.currentQuestionId) {
            const rawId = normalizeQId(savedSession.currentQuestionId);
            const found = kit.questions.find(q => q.id === savedSession.currentQuestionId) || kit.questions.find(q => q.id === rawId);
            if (found) {
              skipNextQuestionResetRef.current = true;
              setCurrentQuestion(sanitizeQuestionStructure(found, kit.questions));
              return;
            }
          }
        }

        const practiceLevel = activePracticeLevel || level || 1;
        const nextQ = resolveNextQuestion(practiceLevel, currentIndex, false, [], prevQId);
        if (nextQ && nextQ.id !== 'thea-placeholder-loading') {
          setCurrentQuestion(sanitizeQuestionStructure(nextQ, kit.questions));
          return;
        }

        const targetDiff = practiceLevel === 1 ? 'easy' : practiceLevel === 2 ? 'medium' : 'hard';
        const pool = kit.questions.filter(q => q.type !== 'image-labeling' && (q.difficulty || 'easy') === targetDiff);
        const finalPool = pool.length > 0 ? pool : kit.questions.filter(q => q.type !== 'image-labeling');
        const unans = finalPool.find(q => !isQuestionAnswered(q.id));
        const first = unans || finalPool[0] || kit.questions[0];
        if (first) {
          setCurrentQuestion(sanitizeQuestionStructure(first, kit.questions));
        }
      }
    }
  }, [kit.questions, currentQuestion?.id, activePracticeLevel, level]);

  // Si la pregunta actual restaurada o cargada era de tipo image-labeling o esquema con etiquetas, sanitizar de inmediato
  useEffect(() => {
    if (currentQuestion) {
      const isBad =
        currentQuestion.type === 'image-labeling' ||
        Boolean((currentQuestion as any).imageHotspots) ||
        Boolean((currentQuestion as any).etiquetas_diagrama) ||
        Boolean((currentQuestion as any).imageWordBank) ||
        Boolean((currentQuestion as any).diagramTitle) ||
        /cuadro de texto del banco|punto correspondiente del esquema|etapas del algoritmo|diabetes tipo 2|esquema de terapia/i.test(currentQuestion.question || '') ||
        Boolean(currentQuestion.sourceAsset && (
          (currentQuestion.sourceAsset.caption || '').toLowerCase().includes('capítulo') ||
          (currentQuestion.sourceAsset.caption || '').toLowerCase().includes('capitulo') ||
          (currentQuestion.sourceAsset.caption || '').toLowerCase().includes('sección') ||
          (currentQuestion.sourceAsset.caption || '').toLowerCase().includes('seccion') ||
          (currentQuestion.sourceAsset.caption || '').toLowerCase().includes('metabolismo') ||
          (currentQuestion.sourceAsset.caption || '').toLowerCase().includes('fármaco') ||
          (currentQuestion.sourceAsset.caption || '').toLowerCase().includes('farmaco') ||
          (currentQuestion.sourceAsset.caption || '').toLowerCase().includes('página') ||
          (currentQuestion.sourceAsset.caption || '').toLowerCase().includes('pagina') ||
          (currentQuestion.sourceAsset as any).type === 'page'
        ));
      if (isBad) {
        setCurrentQuestion(sanitizeQuestionStructure(currentQuestion, kit.questions));
      }
    }
  }, [currentQuestion?.id, currentQuestion?.type, kit.questions]);

  const currentQ: Question = currentQuestion;

  // Carga bajo demanda ultra-ligera de imagen especifica si la pregunta actual la requiere (cero consumo de RAM en kits)
  const [activeAssetDataUrl, setActiveAssetDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    if (currentQ?.sourceAsset?.id && !currentQ.sourceAsset.dataUrl) {
      getAssetById(currentQ.sourceAsset.id).then(a => {
        if (!isCancelled && a?.dataUrl) {
          setActiveAssetDataUrl(a.dataUrl);
        }
      }).catch(() => {});
    } else {
      setActiveAssetDataUrl(currentQ?.sourceAsset?.dataUrl || null);
    }
    return () => { isCancelled = true; };
  }, [currentQ?.id, currentQ?.sourceAsset?.id, currentQ?.sourceAsset?.dataUrl]);

  // Regla estricta para adjuntar imágenes a las preguntas individuales
  const isImageStrictlyNecessary = (q: Question): boolean => {
    if (!q || !q.sourceAsset) return false;
    const hasData = Boolean(activeAssetDataUrl || q.sourceAsset.dataUrl || q.sourceAsset.id);
    if (!hasData) return false;

    // Descartar fotos de páginas escaneadas o capturas de texto de libros (no son diagramas conceptuales nítidos)
    const caption = (q.sourceAsset.caption || '').toLowerCase();
    const isBookPageScan =
      caption.includes('capítulo') ||
      caption.includes('capitulo') ||
      caption.includes('página') ||
      caption.includes('pagina') ||
      caption.includes('texto') ||
      caption.includes('documento') ||
      caption.includes('sección') ||
      caption.includes('seccion') ||
      caption.includes('metabolismo') ||
      caption.includes('fármaco') ||
      caption.includes('farmaco') ||
      (q.sourceAsset as any).type === 'page' ||
      /p[aá]g|secci[oó]n|cap[ií]tulo|doc/i.test(caption);
    if (isBookPageScan) return false;

    // Si la pregunta es sobre algoritmo o esquema de texto de libro, nunca adjuntar imagen de página
    if (/cuadro de texto del banco|punto correspondiente del esquema|etapas del algoritmo|diabetes tipo 2|esquema de terapia/i.test(q.question || '')) {
      return false;
    }

    const combined = ((q.question || '') + ' ' + (q.explanation || '')).toLowerCase();
    return /\b(según el esquema|en la figura|observa la imagen|en el gráfico|diagrama adjunto|tabla adjunta|en la tabla|en la imagen|como se muestra en la figura|ilustrado en el esquema)\b/i.test(combined);
  };

  const isCurrentQRevealed = useMemo(() => {
    if (!currentQ?.id) return false;
    return revealedQuestionIds.includes(currentQ.id);
  }, [currentQ?.id, revealedQuestionIds]);

  // ── Drag & Drop Resiliency & Normalized State ─────────────────────────────
  const effectiveTemplateSentence = useMemo(() => {
    if (currentQ?.templateSentence && /\{\d+\}/.test(currentQ.templateSentence)) {
      return currentQ.templateSentence;
    }
    if (currentQ?.question && /\{\d+\}/.test(currentQ.question)) {
      return currentQ.question;
    }
    return currentQ?.templateSentence || undefined;
  }, [currentQ?.templateSentence, currentQ?.question]);

  const effectiveBlanksCorrect = useMemo(() => {
    if (Array.isArray(currentQ?.blanksCorrect) && currentQ.blanksCorrect.length > 0) {
      return currentQ.blanksCorrect.map(b => String(b).trim());
    }
    if (effectiveTemplateSentence) {
      const slotMatches = effectiveTemplateSentence.match(/\{\d+\}/g);
      if (slotMatches && currentQ?.wordBank && currentQ.wordBank.length >= slotMatches.length) {
        return currentQ.wordBank.slice(0, slotMatches.length);
      }
    }
    return currentQ?.blanksCorrect || [];
  }, [currentQ?.blanksCorrect, effectiveTemplateSentence, currentQ?.wordBank]);

  const effectiveWordBank = useMemo(() => {
    const bank = Array.isArray(currentQ?.wordBank) ? [...currentQ.wordBank] : [];
    effectiveBlanksCorrect.forEach(b => {
      if (b && !bank.some(item => item.toLowerCase() === b.toLowerCase())) {
        bank.push(b);
      }
    });
    // Añadir distractores adicionales para garantizar desafío pedagógico
    const defaultDistractors = ['primario', 'secundario', 'crónico', 'agudo', 'sistémico', 'local', 'benigno', 'patológico'];
    for (const dist of defaultDistractors) {
      if (bank.length >= effectiveBlanksCorrect.length + 2) break;
      if (!bank.includes(dist)) bank.push(dist);
    }
    return bank;
  }, [currentQ?.wordBank, effectiveBlanksCorrect]);

  const qType = useMemo(() => {
    const baseType = currentQ?.type || 'multiple-choice';
    if (baseType === 'drag-drop') return 'drag-drop';
    if (effectiveTemplateSentence && /\{\d+\}/.test(effectiveTemplateSentence) && effectiveBlanksCorrect.length > 0) {
      return 'drag-drop';
    }
    if (baseType === 'true-false' && Array.isArray(currentQ?.options) && currentQ.options.length >= 3) {
      return 'multiple-choice';
    }
    return baseType;
  }, [currentQ?.type, currentQ?.options, effectiveTemplateSentence, effectiveBlanksCorrect]);

  // ── Distribución Equitativa y Aleatoria de Opciones (Misma probabilidad del 25% para cada opción) ──
  const { safeOptions, safeCorrectIndex, safeCorrectIndices } = useMemo(() => {
    if (!currentQ) {
      return {
        safeOptions: ['Opción A', 'Opción B', 'Opción C', 'Opción D'],
        safeCorrectIndex: 0,
        safeCorrectIndices: [0],
      };
    }

    if (qType === 'true-false') {
      const opts = ['Verdadero', 'Falso'];
      const cIdx = parseCorrectIndex(currentQ.correctIndex, opts, 'true-false');
      return {
        safeOptions: opts,
        safeCorrectIndex: cIdx,
        safeCorrectIndices: [cIdx],
      };
    }

    // 1. Obtener opciones base de la pregunta
    let baseOptions: string[] = [];
    if (currentQ.options && Array.isArray(currentQ.options) && currentQ.options.length >= 2) {
      baseOptions = [...currentQ.options];
    } else {
      baseOptions = [
        'Postulado conforme con el marco teórico analizado',
        'Interpretación inconsistente con los hechos descritos',
        'Principio secundario aplicable solo en supuestos atípicos',
        'Concepto no contemplado en el material de estudio'
      ];
    }

    while (baseOptions.length < 4) {
      baseOptions.push(`Alternativa adicional ${baseOptions.length + 1}`);
    }

    // 2. Determinar índice original de respuesta correcta
    const rawCorrectIdx = parseCorrectIndex(currentQ.correctIndex, baseOptions, qType);
    const rawCorrectIndices = parseCorrectIndices(currentQ.correctIndices, baseOptions);

    if (qType === 'multi-select') {
      const items = baseOptions.map((opt, origIdx) => ({
        text: opt,
        isCorrect: rawCorrectIndices.includes(origIdx),
      }));

      const seedStr = currentQ.id || 'default_seed';
      const shuffled = [...items].sort((a, b) => {
        const hashA = (seedStr + a.text).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const hashB = (seedStr + b.text).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        return (hashA % 100) - (hashB % 100);
      });

      const newOpts = shuffled.map(s => s.text);
      const newIndices = shuffled
        .map((s, idx) => (s.isCorrect ? idx : -1))
        .filter(idx => idx !== -1);

      return {
        safeOptions: newOpts,
        safeCorrectIndex: newIndices[0] ?? 0,
        safeCorrectIndices: newIndices.length > 0 ? newIndices : [0],
      };
    }

    // 3. Para OPCIÓN MÚLTIPLE:
    // Asignar aleatoriamente la respuesta correcta a CUALQUIERA de las 4 opciones con EXACTAMENTE 25% de probabilidad
    const correctOptionText = baseOptions[rawCorrectIdx] || baseOptions[0];
    const distractorTexts = baseOptions.filter((_, idx) => idx !== rawCorrectIdx);

    // Hash determinista uniforme por pregunta para que sea estable en cada render de esa pregunta
    // pero con distribución matemática equitativa del 25% entre los 4 slots (0, 1, 2, 3)
    let targetSlot = 0;
    if (currentQ.id) {
      let hash = 0;
      const key = `thea_slot_dist_${currentQ.id}_${kit?.id || 'default'}`;
      for (let i = 0; i < key.length; i++) {
        hash = (hash << 5) - hash + key.charCodeAt(i);
        hash |= 0;
      }
      targetSlot = Math.abs(hash) % 4; // 0, 1, 2, 3 con idéntica probabilidad del 25%
    } else {
      targetSlot = Math.floor(Math.random() * 4);
    }

    const finalOptions: string[] = new Array(4);
    finalOptions[targetSlot] = correctOptionText;

    let distractorIdx = 0;
    for (let slot = 0; slot < 4; slot++) {
      if (slot !== targetSlot) {
        finalOptions[slot] = distractorTexts[distractorIdx] || `Alternativa ${slot + 1}`;
        distractorIdx++;
      }
    }

    return {
      safeOptions: finalOptions,
      safeCorrectIndex: targetSlot,
      safeCorrectIndices: [targetSlot],
    };
  }, [currentQ?.id, currentQ?.options, currentQ?.correctIndex, currentQ?.correctIndices, qType, kit?.id]);

  // Guard against initial mount or placeholder/IDB hydration wiping restored question state
  const isFirstMount = useRef(true);
  const lastQId = useRef(currentQ?.id || '');

  useEffect(() => {
    if (!currentQ) return;

    if (isFirstMount.current) {
      isFirstMount.current = false;
      lastQId.current = currentQ?.id || '';
      lastQuestionLoadTimeRef.current = Date.now();
      return;
    }

    if (skipNextQuestionResetRef.current) {
      skipNextQuestionResetRef.current = false;
      lastQId.current = currentQ?.id || '';
      lastQuestionLoadTimeRef.current = Date.now();
      if (currentQ?.id && currentQ.id !== 'thea-placeholder-loading') {
        seenQuestionIdsRef.current.add(currentQ.id);
      }
      return;
    }

    if (
      lastQId.current === 'thea-placeholder-loading' &&
      currentQ?.id &&
      currentQ.id !== 'thea-placeholder-loading'
    ) {
      lastQId.current = currentQ.id;
      lastQuestionLoadTimeRef.current = Date.now();
      seenQuestionIdsRef.current.add(currentQ.id);
      return;
    }

    // Si el ID de la pregunta no cambio, no resetear para preservar respuestas en curso
    if (lastQId.current === currentQ?.id) {
      return;
    }

    lastQId.current = currentQ?.id || '';
    lastQuestionLoadTimeRef.current = Date.now();

    if (currentQ?.id) {
      seenQuestionIdsRef.current.add(currentQ.id);
    }
    setSelectedOption(null);
    setSelectedMultiIndices([]);
    setActiveMatchingTerm(null);
    setMatchingPairsMap({});
    setMatchingChecked(false);
    setDragDropChecked(false);
    setShortAnswerInput('');
    setShortAnswerEvalResult(null);
    setIsManuallyOverridden(false);

    if (effectiveBlanksCorrect.length > 0) {
      setPlacedChips(new Array(effectiveBlanksCorrect.length).fill(null));
    } else {
      setPlacedChips([]);
    }

    setIsAnswered(false);
    setIsCurrentCorrect(null);
  }, [currentQ?.id, effectiveBlanksCorrect.length]);

  const initialSavedQId = savedSession?.currentQuestion?.id || savedSession?.currentQuestionId || '';
  const didResumeSavedUnanswered = Boolean(
    savedSession &&
    !savedSession.isAnswered &&
    initialSavedQId &&
    initialSavedQId !== 'thea-placeholder-loading' &&
    currentQ?.id &&
    (currentQ.id === initialSavedQId || normalizeQId(currentQ.id) === normalizeQId(initialSavedQId))
  );
  if (persistedActiveQIdRef.current === undefined) {
    persistedActiveQIdRef.current = didResumeSavedUnanswered ? currentQ.id : null;
  }

  const currentSessionSignature = buildSessionSignature({
    kitId: kit.id,
    currentIndex,
    level,
    activePracticeLevel,
    currentQuestionId: currentQ?.id,
    isAnswered,
    isCurrentCorrect,
    levelCorrectCount: currentLevelCorrect,
    questionsAnsweredTotal,
    errorQueueLength: errorQueue.length,
    isReinforcementMode,
    answeredCount: answeredQuestionIdsRef.current.size,
    revealedCount: revealedQuestionIds.length,
    selectedOption,
    selectedMultiIndices,
    matchingPairsMap,
    matchingChecked,
    placedChips,
    dragDropChecked,
    shortAnswerInput,
    activeTab,
    historyFilter,
    historyLevelFilter,
    shuffleSeed,
  });

  latestSessionRef.current = {
    currentIndex,
    level,
    activePracticeLevel,
    currentQuestionId: currentQ?.id,
    currentQuestion: currentQ,
    shortAnswerInput,
    levelCorrectCount: currentLevelCorrect,
    levelCorrectCounts,
    errorQueue,
    isReinforcementMode,
    selectedOption,
    selectedMultiIndices,
    matchingPairsMap,
    matchingChecked,
    placedChips,
    dragDropChecked,
    isAnswered,
    isCurrentCorrect,
    activeTab,
    history: history.slice(0, 50),
    historyFilter,
    historyLevelFilter,
    questionsAnsweredTotal,
    totalErrorsReinforced,
    socraticProfile,
    revealedQuestionIds,
    seenQuestionIds: Array.from(seenQuestionIdsRef.current).slice(-100),
    answeredQuestionIds: Array.from(answeredQuestionIdsRef.current),
    lastUpdated: sessionTimestampRef.current || Date.now(),
    ...(resetAtRef.current > 0 ? { resetAt: resetAtRef.current } : {}),
    shuffleSeed,
  };

  // Hidratar sesión desde IndexedDB si localStorage aún no la tenía o estaba desactualizado
  useEffect(() => {
    let isCancelled = false;
    pendingIdbHydrationRef.current = !savedSession;

    authService.restoreSmartStudySessionAsync(userId || null, kit.id).then((idbSession) => {
      pendingIdbHydrationRef.current = false;
      if (isCancelled || hasUserInteractedRef.current) return;

      const currentSavedAt = sessionTimestampRef.current || 0;
      const shouldHydrate = Boolean(
        idbSession &&
        (!savedSession || (idbSession.lastUpdated || 0) > currentSavedAt)
      );

      if (shouldHydrate && idbSession) {
        const restoredResetAt = (idbSession as any).resetAt || 0;
        if (restoredResetAt > 0) {
          resetAtRef.current = restoredResetAt;
        }
        const restoredAnswered = new Set<string>();
        const idbAns = (idbSession as any).answeredQuestionIds;
        if (Array.isArray(idbAns)) {
          idbAns.forEach((id: string) => {
            if (id) {
              restoredAnswered.add(id);
              restoredAnswered.add(normalizeQId(id));
            }
          });
        }
        if (Array.isArray(idbSession.history)) {
          idbSession.history.forEach((h: any) => {
            if (h?.questionId) {
              const hEpoch = typeof h.timestampEpoch === 'number' ? h.timestampEpoch : 0;
              if (restoredResetAt > 0 && hEpoch > 0 && hEpoch < restoredResetAt) return;
              if (restoredResetAt > 0 && hEpoch === 0 && Array.isArray(idbAns) && idbAns.length === 0) return;
              restoredAnswered.add(h.questionId);
              restoredAnswered.add(normalizeQId(h.questionId));
            }
          });
        }
        if (idbSession.isAnswered) {
          const lastAnsQId = idbSession.currentQuestion?.id || idbSession.currentQuestionId;
          if (lastAnsQId) {
            restoredAnswered.add(lastAnsQId);
            restoredAnswered.add(normalizeQId(lastAnsQId));
          }
        }
        answeredQuestionIdsRef.current = restoredAnswered;

        if (Array.isArray((idbSession as any).seenQuestionIds) || idbSession.currentQuestionId) {
          seenQuestionIdsRef.current = new Set([
            ...((idbSession as any).seenQuestionIds || []),
            ...(idbSession.currentQuestionId ? [idbSession.currentQuestionId] : []),
          ]);
        }

        const rLevel = (idbSession.level as 1 | 2 | 3) || 1;
        const rActiveLevel = ((idbSession as any).activePracticeLevel as 1 | 2 | 3) || rLevel;
        const rCounts = (idbSession as any).levelCorrectCounts || {
          1: rLevel === 1 ? (idbSession.levelCorrectCount || 0) : (rLevel > 1 ? 25 : 0),
          2: rLevel === 2 ? (idbSession.levelCorrectCount || 0) : (rLevel > 2 ? 25 : 0),
          3: rLevel === 3 ? (idbSession.levelCorrectCount || 0) : 0,
        };
        const rSeed = (idbSession as any).shuffleSeed || 1;
        const rErrorQ = idbSession.errorQueue || [];
        const rReinforce = Boolean(idbSession.isReinforcementMode);

        setActiveTab(idbSession.activeTab || 'practice');
        setHistory((idbSession.history || []).slice(0, 50));
        setHistoryFilter(idbSession.historyFilter || 'all');
        setHistoryLevelFilter(idbSession.historyLevelFilter ?? 'all');
        setShuffleSeed(rSeed);
        setLevel(rLevel);
        setLevelCorrectCounts(rCounts);
        setLevelCorrectCount(idbSession.levelCorrectCount || 0);
        setActivePracticeLevel(rActiveLevel);
        setTargetLevel(rActiveLevel);
        setErrorQueue(rErrorQ);
        setIsReinforcementMode(rReinforce);
        setQuestionsAnsweredTotal(idbSession.questionsAnsweredTotal || 0);
        setTotalErrorsReinforced(idbSession.totalErrorsReinforced || 0);
        if ((idbSession as any).socraticProfile) {
          setSocraticProfile((idbSession as any).socraticProfile);
        }

        const wasIdbAnswered = Boolean(idbSession.isAnswered);
        const idbQId = idbSession.currentQuestion?.id || idbSession.currentQuestionId;
        let resolvedQ: Question | null = null;
        if (!wasIdbAnswered && idbQId && idbQId !== 'thea-placeholder-loading') {
          if (idbSession.currentQuestion && idbSession.currentQuestion.id) {
            const rawId = normalizeQId(idbSession.currentQuestion.id);
            const matched = kit.questions?.find(q => q.id === idbSession.currentQuestion?.id) || kit.questions?.find(q => q.id === rawId);
            resolvedQ = sanitizeQuestionStructure(matched || idbSession.currentQuestion, kit.questions);
          } else if (kit.questions && kit.questions.length > 0) {
            const rawId = normalizeQId(idbQId);
            const found = kit.questions.find(q => q.id === idbQId) || kit.questions.find(q => q.id === rawId);
            if (found) resolvedQ = sanitizeQuestionStructure(found, kit.questions);
          }
        }

        if (resolvedQ && !wasIdbAnswered) {
          const restoredMulti = Array.isArray(idbSession.selectedMultiIndices)
            ? idbSession.selectedMultiIndices.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0)
            : [];
          const restoredIdx = idbSession.currentIndex || 0;
          skipNextQuestionResetRef.current = true;
          setCurrentQuestion(resolvedQ);
          lastQId.current = resolvedQ.id;
          setCurrentIndex(restoredIdx);
          setSelectedOption(idbSession.selectedOption ?? null);
          setSelectedMultiIndices(restoredMulti);
          setMatchingPairsMap(idbSession.matchingPairsMap || {});
          setMatchingChecked(Boolean(idbSession.matchingChecked));
          setPlacedChips(idbSession.placedChips || []);
          setDragDropChecked(Boolean(idbSession.dragDropChecked));
          setShortAnswerInput(idbSession.shortAnswerInput || '');
          setIsAnswered(false);
          setIsCurrentCorrect(null);

          sessionTimestampRef.current = idbSession.lastUpdated || Date.now();
          persistedActiveQIdRef.current = resolvedQ.id;
          hasPendingLocalChangeRef.current = false;
          lastSavedSignatureRef.current = buildSessionSignature({
            kitId: kit.id,
            currentIndex: restoredIdx,
            level: rLevel,
            activePracticeLevel: rActiveLevel,
            currentQuestionId: resolvedQ.id,
            isAnswered: false,
            isCurrentCorrect: null,
            levelCorrectCount: rCounts[rLevel] ?? idbSession.levelCorrectCount ?? 0,
            questionsAnsweredTotal: idbSession.questionsAnsweredTotal || 0,
            errorQueueLength: rErrorQ.length,
            isReinforcementMode: rReinforce,
            answeredCount: restoredAnswered.size,
            revealedCount: revealedQuestionIds.length,
            selectedOption: idbSession.selectedOption ?? null,
            selectedMultiIndices: restoredMulti,
            matchingPairsMap: idbSession.matchingPairsMap || {},
            matchingChecked: Boolean(idbSession.matchingChecked),
            placedChips: idbSession.placedChips || [],
            dragDropChecked: Boolean(idbSession.dragDropChecked),
            shortAnswerInput: idbSession.shortAnswerInput || '',
            activeTab: idbSession.activeTab || 'practice',
            historyFilter: idbSession.historyFilter || 'all',
            historyLevelFilter: idbSession.historyLevelFilter ?? 'all',
            shuffleSeed: rSeed,
          });
        } else if (wasIdbAnswered && kit.questions && kit.questions.length > 0) {
          const nextIdx = (idbSession.currentIndex || 0) + 1;
          const nextUnans = sanitizeQuestionStructure(
            resolveNextQuestion(rActiveLevel, nextIdx, rReinforce, rErrorQ, idbQId),
            kit.questions
          );
          if (nextUnans && nextUnans.id !== 'thea-placeholder-loading') {
            skipNextQuestionResetRef.current = true;
            setCurrentQuestion(nextUnans);
            lastQId.current = nextUnans.id;
            setCurrentIndex(nextIdx);
            setSelectedOption(null);
            setSelectedMultiIndices([]);
            setMatchingPairsMap({});
            setMatchingChecked(false);
            setPlacedChips([]);
            setDragDropChecked(false);
            setShortAnswerInput('');
            setIsAnswered(false);
            setIsCurrentCorrect(null);
            persistSessionSnapshot({
              currentIndex: nextIdx,
              level: rLevel,
              activePracticeLevel: rActiveLevel,
              currentQuestionId: nextUnans.id,
              currentQuestion: nextUnans,
              selectedOption: null,
              selectedMultiIndices: [],
              matchingPairsMap: {},
              matchingChecked: false,
              placedChips: [],
              dragDropChecked: false,
              isAnswered: false,
              isCurrentCorrect: null,
              shortAnswerInput: '',
              levelCorrectCount: rCounts[rLevel] ?? idbSession.levelCorrectCount ?? 0,
              levelCorrectCounts: rCounts,
              errorQueue: rErrorQ,
              isReinforcementMode: rReinforce,
              history: (idbSession.history || []).slice(0, 50),
              questionsAnsweredTotal: idbSession.questionsAnsweredTotal || 0,
              totalErrorsReinforced: idbSession.totalErrorsReinforced || 0,
              answeredQuestionIds: Array.from(restoredAnswered),
              shuffleSeed: rSeed,
            }, { source: 'initial_pin' });
          }
        }
        return;
      }

      // Si no había sesión previa en LocalStorage ni IndexedDB, persistir la pregunta inicial para que no cambie al salir o recargar
      const curSnap = latestSessionRef.current;
      if (
        !savedSession &&
        curSnap?.currentQuestionId &&
        curSnap.currentQuestionId !== 'thea-placeholder-loading' &&
        persistedActiveQIdRef.current !== curSnap.currentQuestionId
      ) {
        persistSessionSnapshot(undefined, { source: 'initial_pin' });
      }
    }).catch(() => {
      pendingIdbHydrationRef.current = false;
    });

    return () => {
      isCancelled = true;
    };
  }, [userId, kit.id]);

  // Guardado garantizado al salir, ocultar pestaña o cerrar el navegador/página
  useEffect(() => {
    const flushSessionBeforeExit = () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      const snapshot = latestSessionRef.current;
      const hasValidQuestion = Boolean(
        snapshot?.currentQuestionId && snapshot.currentQuestionId !== 'thea-placeholder-loading'
      );
      if (
        snapshot &&
        kit?.id &&
        hasValidQuestion &&
        (hasPendingLocalChangeRef.current || (!pendingIdbHydrationRef.current && persistedActiveQIdRef.current !== snapshot.currentQuestionId))
      ) {
        const hadPendingUserChange = hasPendingLocalChangeRef.current;
        hasPendingLocalChangeRef.current = false;
        const savedAt = Date.now();
        snapshot.lastUpdated = savedAt;
        sessionTimestampRef.current = savedAt;
        persistedActiveQIdRef.current = snapshot.currentQuestionId;
        authService.saveSmartStudySession(userId || null, kit.id, snapshot, {
          source: hadPendingUserChange ? 'local' : 'initial_pin',
        });
      }
      if (hasUnflushedDriveSyncRef.current && userId && (googleDriveService.isLinked() || googleDriveService.getValidAccessToken())) {
        hasUnflushedDriveSyncRef.current = false;
        googleDriveService.flushProgressSync(userId);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushSessionBeforeExit();
      }
    };

    window.addEventListener('pagehide', flushSessionBeforeExit);
    window.addEventListener('beforeunload', flushSessionBeforeExit);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', flushSessionBeforeExit);
      window.removeEventListener('beforeunload', flushSessionBeforeExit);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushSessionBeforeExit();
    };
  }, [userId, kit?.id]);

  // ── Auto-Save Session Memory (debounce corto de 250ms + fijado inmediato de pregunta activa sin guardar) ──
  useEffect(() => {
    if (!kit?.questions || kit.questions.length === 0 || !currentQ || currentQ.id === 'thea-placeholder-loading') {
      return;
    }
    if (!hasMountedSaveCycleRef.current) {
      hasMountedSaveCycleRef.current = true;
      lastSavedSignatureRef.current = currentSessionSignature;
      if (!pendingIdbHydrationRef.current && persistedActiveQIdRef.current !== currentQ.id) {
        persistSessionSnapshot(undefined, { source: 'initial_pin' });
      }
      return;
    }
    if (currentSessionSignature === lastSavedSignatureRef.current) {
      if (!pendingIdbHydrationRef.current && persistedActiveQIdRef.current !== currentQ.id) {
        persistSessionSnapshot(undefined, { source: 'initial_pin' });
      }
      return;
    }
    lastSavedSignatureRef.current = currentSessionSignature;
    sessionTimestampRef.current = Date.now();
    hasPendingLocalChangeRef.current = true;
    hasUnflushedDriveSyncRef.current = true;
    if (latestSessionRef.current) {
      latestSessionRef.current.lastUpdated = sessionTimestampRef.current;
    }
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      if (kit?.id && latestSessionRef.current && latestSessionRef.current.currentQuestionId !== 'thea-placeholder-loading') {
        hasPendingLocalChangeRef.current = false;
        persistedActiveQIdRef.current = latestSessionRef.current.currentQuestionId;
        authService.saveSmartStudySession(userId || null, kit.id, latestSessionRef.current);
      }
    }, 250);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [
    userId,
    kit.id,
    kit.questions?.length,
    currentIndex,
    level,
    activePracticeLevel,
    currentQ?.id,
    currentLevelCorrect,
    isAnswered,
    isCurrentCorrect,
    questionsAnsweredTotal,
    totalErrorsReinforced,
    revealedQuestionIds,
    selectedOption,
    selectedMultiIndices,
    matchingPairsMap,
    matchingChecked,
    placedChips,
    dragDropChecked,
    shortAnswerInput,
    activeTab,
    historyFilter,
    historyLevelFilter,
    shuffleSeed,
    currentSessionSignature,
    persistSessionSnapshot,
  ]);

  // Shuffled matching definitions with guaranteed derangement (never side-by-side with original term)
  const shuffledDefinitions = useMemo(() => {
    if (!currentQ?.matchingPairs || currentQ.matchingPairs.length === 0) return [];
    const pairs = currentQ.matchingPairs;
    if (pairs.length === 1) return [pairs[0].definition];

    const originalDefs = pairs.map(p => p.definition);
    const n = originalDefs.length;

    // PRNG determinista basado en el ID de la pregunta, kit y shuffleSeed
    let hash = 0;
    const seedKey = `thea_derange_${currentQ?.id || 'default'}_${kit?.id || 'default'}_${shuffleSeed}`;
    for (let i = 0; i < seedKey.length; i++) {
      hash = (hash << 5) - hash + seedKey.charCodeAt(i);
      hash |= 0;
    }

    const nextRand = () => {
      hash = (hash * 9301 + 49297) % 233280;
      return (Math.abs(hash) % 10000) / 10000;
    };

    // Intentos de Fisher-Yates buscando desordenamiento completo (derangement)
    let candidates = [...originalDefs];
    for (let attempt = 0; attempt < 40; attempt++) {
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(nextRand() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      // Verificar que NINGUNA definición quede en su misma fila horizontal que el concepto original
      const isFullDerangement = candidates.every((def, idx) => def !== originalDefs[idx]);
      if (isFullDerangement) {
        return candidates;
      }
    }

    // Salvaguarda matemática absoluta: rotación cíclica garantizada (desplazamiento >= 1)
    // Para cualquier n >= 2, un desplazamiento de 1 a n-1 nunca deja un elemento en su índice original
    const shift = 1 + (Math.abs(hash) % (n - 1));
    return originalDefs.map((_, i) => originalDefs[(i + shift) % n]);
  }, [currentQ?.id, currentQ?.matchingPairs, kit?.id, shuffleSeed]);

  // Fórmula compacta de emparejamientos correctos (ej: "1:3, 2:1, 3:2")
  const correctMatchingFormula = useMemo(() => {
    if (!currentQ?.matchingPairs || currentQ.matchingPairs.length === 0) return '';
    return currentQ.matchingPairs.map((p, leftIdx) => {
      const rightIdx = shuffledDefinitions.findIndex(d => d === p.definition);
      return `${leftIdx + 1}:${rightIdx >= 0 ? rightIdx + 1 : '?'}`;
    }).join(', ');
  }, [currentQ?.matchingPairs, shuffledDefinitions]);

  // Historial filtrado para visualización, estrictamente ordenado de forma descendente (última pregunta respondida arriba)
  const filteredHistory = useMemo(() => {
    const getEpoch = (item: StudyHistoryItem): number => {
      if (typeof item.timestampEpoch === 'number' && !isNaN(item.timestampEpoch)) return item.timestampEpoch;
      const match = (item.id || '').match(/^hist-(\d+)/);
      if (match && match[1]) {
        const val = parseInt(match[1], 10);
        if (!isNaN(val)) return val;
      }
      return 0;
    };

    const list = history.filter(item => {
      const matchesStatus =
        historyFilter === 'all'
          ? true
          : historyFilter === 'correct'
          ? item.isCorrect
          : !item.isCorrect;

      const matchesLevel =
        historyLevelFilter === 'all' ? true : item.level === historyLevelFilter;

      return matchesStatus && matchesLevel;
    });

    // Orden descendente estricto: la última pregunta respondida arriba de todo
    return [...list].sort((a, b) => {
      const epA = getEpoch(a);
      const epB = getEpoch(b);
      if (epA !== epB) return epB - epA;
      if (typeof b.attemptNumber === 'number' && typeof a.attemptNumber === 'number') {
        return b.attemptNumber - a.attemptNumber;
      }
      return 0;
    });
  }, [history, historyFilter, historyLevelFilter]);

  // ── Evaluation Helpers ───────────────────────────────────────────────────

  const markQuestionResult = (
    correct: boolean,
    userAnswerText: string,
    correctAnswerText: string,
    overrideSelectedOption?: number | null
  ) => {
    setIsAnswered(true);
    setIsCurrentCorrect(correct);
    const nextQuestionsAnsweredTotal = questionsAnsweredTotal + 1;
    setQuestionsAnsweredTotal(nextQuestionsAnsweredTotal);

    const nowEpoch = Date.now();
    // Guardar en el Historial de Preguntas
    const historyItem: StudyHistoryItem = {
      id: `hist-${nowEpoch}-${Math.random().toString(36).slice(2, 6)}`,
      questionId: currentQ.id,
      questionText: currentQ.question,
      topic: currentQ.topic || 'Conceptos Clave',
      difficulty: currentQ.difficulty || 'easy',
      type: qType,
      userAnswer: userAnswerText,
      correctAnswer: correctAnswerText,
      isCorrect: correct,
      explanation: currentQ.explanation || 'Respuesta fundamentada en el material de estudio analizado.',
      timestamp: new Date(nowEpoch).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestampEpoch: nowEpoch,
      attemptNumber: nextQuestionsAnsweredTotal,
      level,
    };
    const nextHistory = [historyItem, ...history].slice(0, 50);
    setHistory(nextHistory);

    // Actualizar motor socrático adaptativo y Active Recall
    const { updatedProfile, interventionScheduled } = updateSocraticProfileOnAnswer(
      socraticProfile,
      currentQ,
      correct,
      userAnswerText,
      currentIndex
    );
    setSocraticProfile(updatedProfile);

    if (interventionScheduled) {
      // Disparar generación socrática en segundo plano con IA para preparar la pregunta reformulada
      const failedQ = currentQ;
      generateSocraticReformulatedQuestion(
        interventionScheduled.concept,
        failedQ,
        userAnswerText,
        kit.chunks?.find(c => c.id === failedQ.sourceChunkId)?.text
      ).then(reformulated => {
        setSocraticProfile(prev => {
          const nextInts = prev.interventions.map(item => {
            if (item.id === interventionScheduled.id) {
              return { ...item, reformulatedQuestion: reformulated, status: 'ready' as const };
            }
            return item;
          });
          return { ...prev, interventions: nextInts };
        });
      }).catch(err => {
        console.warn('[SmartStudy Socratic Recall] Error generando reformulación con IA:', err);
      });
    }

    let nextLevelCorrectCount = currentLevelCorrect;
    let nextLevelCorrectCounts = { ...levelCorrectCounts };
    let nextTotalErrorsReinforced = totalErrorsReinforced;
    let nextErrorQueue = errorQueue;

    if (isReinforcementMode) {
      // En modo refuerzo: registrar estadística de refuerzo sin modificar errorQueue aquí.
      // errorQueue solo avanza en handleNext cuando el estudiante pulsa 'Siguiente pregunta'.
      if (correct) {
        nextTotalErrorsReinforced = totalErrorsReinforced + 1;
        setTotalErrorsReinforced(nextTotalErrorsReinforced);
      }
    } else {
      // En modo normal:
      if (correct) {
        // Los errores nunca disminuyen la barra de progreso; sólo las respuestas correctas suman +1
        // Si la pregunta fue revelada previamente en el Banco de Preguntas, NO suma porcentaje de avance
        if (!isCurrentQRevealed) {
          const prevCount = levelCorrectCounts[level] ?? levelCorrectCount ?? 0;
          nextLevelCorrectCount = Math.min(levelTarget, prevCount + 1);
          nextLevelCorrectCounts = {
            ...levelCorrectCounts,
            [level]: nextLevelCorrectCount,
          };
          setLevelCorrectCounts(nextLevelCorrectCounts);
          setLevelCorrectCount(nextLevelCorrectCount);

          // Si alcanzó la meta de 25 aciertos (100%) con este acierto
          if (nextLevelCorrectCount >= levelTarget) {
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 }
            });
          }
        }
      } else {
        // Encolar pregunta fallada para la ronda de refuerzo obligatoria
        if (!errorQueue.some(q => q.id === currentQ.id)) {
          nextErrorQueue = [...errorQueue, currentQ];
          setErrorQueue(nextErrorQueue);
        }
      }
    }

    // Registrar permanentemente la pregunta respondida para evitar repeticiones futuras
    if (currentQ?.id) {
      markQuestionAsAnswered(currentQ.id);
    }

    hasUserInteractedRef.current = true;
    // PERSISTENCIA SÍNCRONA INMEDIATA:
    // Guarda el progreso en este milisegundo exacto en LocalStorage e IndexedDB,
    // y despacha el evento 'thea_session_saved' para que si el estudiante sale inmediatamente
    // a la pantalla principal (HomeView), la barra y porcentaje del libro reflejen el acierto al 100%.
    persistSessionSnapshot({
      currentIndex,
      level,
      activePracticeLevel,
      currentQuestionId: currentQ?.id,
      currentQuestion: currentQ,
      shortAnswerInput,
      levelCorrectCount: nextLevelCorrectCount,
      levelCorrectCounts: nextLevelCorrectCounts,
      errorQueue: nextErrorQueue,
      isReinforcementMode,
      selectedOption: overrideSelectedOption !== undefined ? overrideSelectedOption : selectedOption,
      selectedMultiIndices,
      matchingPairsMap,
      matchingChecked,
      placedChips,
      dragDropChecked,
      isAnswered: true,
      isCurrentCorrect: correct,
      activeTab,
      history: nextHistory,
      historyFilter,
      historyLevelFilter,
      questionsAnsweredTotal: nextQuestionsAnsweredTotal,
      totalErrorsReinforced: nextTotalErrorsReinforced,
      socraticProfile: updatedProfile,
      revealedQuestionIds,
      seenQuestionIds: Array.from(seenQuestionIdsRef.current).slice(-100),
      answeredQuestionIds: Array.from(answeredQuestionIdsRef.current),
      shuffleSeed,
    });
  };

  // ── Manejadores de Preguntas Abiertas Cortas (Short Answer) ───────────────
  const handleSubmitShortAnswer = async () => {
    if (isAnswered || !shortAnswerInput.trim() || isEvaluatingShortAnswer) return;
    setIsEvaluatingShortAnswer(true);

    try {
      const ideal =
        currentQ.idealAnswer ||
        (currentQ.options ? currentQ.options[currentQ.correctIndex ?? 0] : currentQ.explanation) ||
        'Respuesta modelo del profesor';

      const evalResult = await evaluateShortAnswer(
        shortAnswerInput,
        ideal,
        currentQ.question,
        currentQ.rubric,
        currentQ.acceptableAnswers
      );
      setShortAnswerEvalResult(evalResult);

      if (evalResult.isCorrect) {
        confetti({ particleCount: 75, spread: 60, origin: { y: 0.6 } });
      }

      markQuestionResult(evalResult.isCorrect, shortAnswerInput.trim(), ideal);
    } catch (err) {
      console.warn('[handleSubmitShortAnswer] Error evaluando respuesta con IA:', err);
      markQuestionResult(true, shortAnswerInput.trim(), currentQ.idealAnswer || currentQ.explanation);
    } finally {
      setIsEvaluatingShortAnswer(false);
    }
  };

  // ── "¡Tenía razón!" (Thea iWasRight Override) ────────────────────────────
  const handleIWasRight = () => {
    if (!isAnswered || isCurrentCorrect) return;

    setIsCurrentCorrect(true);
    setIsManuallyOverridden(true);

    // Actualizar el historial para que quede registrada como correcta
    const nextHistory = history.map(item =>
      item.questionId === currentQ.id ? { ...item, isCorrect: true } : item
    );
    setHistory(nextHistory);

    // Remover de la cola de fallos de refuerzo
    const nextErrorQueue = errorQueue.filter(q => q.id !== currentQ.id);
    setErrorQueue(nextErrorQueue);

    let nextCount = currentLevelCorrect;
    let nextCounts = { ...levelCorrectCounts };
    let nextTotalErrorsReinforced = totalErrorsReinforced;

    // Si no está en refuerzo y no estaba revelada, sumar avance
    if (!isReinforcementMode && !isCurrentQRevealed) {
      const prevCount = levelCorrectCounts[level] ?? levelCorrectCount ?? 0;
      nextCount = Math.min(levelTarget, prevCount + 1);
      nextCounts = {
        ...levelCorrectCounts,
        [level]: nextCount,
      };
      setLevelCorrectCounts(nextCounts);
      setLevelCorrectCount(nextCount);

      if (nextCount >= levelTarget) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
      }
    } else if (isReinforcementMode) {
      nextTotalErrorsReinforced = totalErrorsReinforced + 1;
      setTotalErrorsReinforced(nextTotalErrorsReinforced);
    }

    hasUserInteractedRef.current = true;
    persistSessionSnapshot({
      currentIndex,
      level,
      activePracticeLevel,
      currentQuestionId: currentQ?.id,
      currentQuestion: currentQ,
      isAnswered: true,
      isCurrentCorrect: true,
      levelCorrectCount: nextCount,
      levelCorrectCounts: nextCounts,
      errorQueue: nextErrorQueue,
      totalErrorsReinforced: nextTotalErrorsReinforced,
      history: nextHistory,
    });
  };

  // 1. Multiple Choice & True/False Selection
  const handleSelectSingleOption = (index: number) => {
    if (isAnswered) return;
    hasUserInteractedRef.current = true;
    setSelectedOption(index);
    const correct = index === safeCorrectIndex;

    const userAns = safeOptions[index] || `Opción ${index + 1}`;
    const correctAns = safeOptions[safeCorrectIndex] || 'Opción correcta';

    markQuestionResult(correct, userAns, correctAns, index);
  };

  // 2. Multi-Select Toggle & Submit
  const handleToggleMultiIndex = (index: number) => {
    if (isAnswered) return;
    hasUserInteractedRef.current = true;
    const baseIndices: number[] = Array.isArray(latestSessionRef.current?.selectedMultiIndices)
      ? latestSessionRef.current.selectedMultiIndices
      : selectedMultiIndices;
    const nextIndices = baseIndices.includes(index)
      ? baseIndices.filter(i => i !== index)
      : [...baseIndices, index];
    setSelectedMultiIndices(nextIndices);
    persistSessionSnapshot({ selectedMultiIndices: nextIndices });
  };

  const handleCheckMultiSelect = () => {
    if (isAnswered || selectedMultiIndices.length === 0) return;
    hasUserInteractedRef.current = true;
    const target = safeCorrectIndices;
    const isExactMatch =
      selectedMultiIndices.length === target.length &&
      selectedMultiIndices.every(idx => target.includes(idx));

    const userAns = selectedMultiIndices
      .slice()
      .sort((a, b) => a - b)
      .map(i => safeOptions[i] || `Opción ${i + 1}`)
      .join(' • ');

    const correctAns = target
      .slice()
      .sort((a, b) => a - b)
      .map(i => safeOptions[i] || `Opción ${i + 1}`)
      .join(' • ');

    markQuestionResult(isExactMatch, userAns, correctAns);
  };

  // 3. Matching Pair Click
  const handleTermClick = (term: string) => {
    if (isAnswered) return;
    hasUserInteractedRef.current = true;
    const currentMap: Record<string, string> = latestSessionRef.current?.matchingPairsMap || matchingPairsMap;
    if (currentMap[term]) {
      // Already paired: unpair
      const newMap = { ...currentMap };
      delete newMap[term];
      setMatchingPairsMap(newMap);
      setActiveMatchingTerm(null);
      persistSessionSnapshot({ matchingPairsMap: newMap });
      return;
    }
    setActiveMatchingTerm(term);
  };

  const handleDefClick = (def: string) => {
    if (isAnswered || !activeMatchingTerm) return;
    hasUserInteractedRef.current = true;
    // Check if definition is already paired to another term
    const currentMap: Record<string, string> = latestSessionRef.current?.matchingPairsMap || matchingPairsMap;
    const newMap = { ...currentMap };
    for (const [t, d] of Object.entries(newMap)) {
      if (d === def) delete newMap[t];
    }
    newMap[activeMatchingTerm] = def;
    setMatchingPairsMap(newMap);
    setActiveMatchingTerm(null);
    persistSessionSnapshot({ matchingPairsMap: newMap });
  };

  const handleCheckMatching = () => {
    if (isAnswered || !currentQ.matchingPairs) return;
    hasUserInteractedRef.current = true;
    setMatchingChecked(true);
    const pairs = currentQ.matchingPairs;
    const allCorrect = pairs.every(p => matchingPairsMap[p.term] === p.definition);

    const userPairingsFormula = pairs.map((p, leftIdx) => {
      const pairedDef = matchingPairsMap[p.term];
      const rightIdx = shuffledDefinitions.findIndex(d => d === pairedDef);
      return rightIdx >= 0 ? `${leftIdx + 1}:${rightIdx + 1}` : `${leftIdx + 1}:-`;
    }).join(', ');

    const userAns = `Tus uniones: ${userPairingsFormula}`;
    const correctAns = `Emparejamientos: ${correctMatchingFormula}`;

    markQuestionResult(allCorrect, userAns, correctAns);
  };

  // 4. Drag & Drop / Word bank
  const handlePlaceChip = (chip: string, targetSlot?: number) => {
    if (isAnswered) return;
    hasUserInteractedRef.current = true;
    const currentPlaced: (string | null)[] = Array.isArray(latestSessionRef.current?.placedChips)
      ? latestSessionRef.current.placedChips
      : placedChips;
    const newPlaced = [...currentPlaced];
    while (newPlaced.length < effectiveBlanksCorrect.length) {
      newPlaced.push(null);
    }
    if (targetSlot !== undefined) {
      newPlaced[targetSlot] = chip;
    } else {
      // Place in first empty slot
      const firstEmpty = newPlaced.findIndex(c => c === null);
      if (firstEmpty !== -1) {
        newPlaced[firstEmpty] = chip;
      }
    }
    setPlacedChips(newPlaced);
    persistSessionSnapshot({ placedChips: newPlaced });
  };

  const handleRemovePlacedChip = (slotIdx: number) => {
    if (isAnswered) return;
    hasUserInteractedRef.current = true;
    const currentPlaced: (string | null)[] = Array.isArray(latestSessionRef.current?.placedChips)
      ? latestSessionRef.current.placedChips
      : placedChips;
    const newPlaced = [...currentPlaced];
    newPlaced[slotIdx] = null;
    setPlacedChips(newPlaced);
    persistSessionSnapshot({ placedChips: newPlaced });
  };

  const handleCheckDragDrop = () => {
    if (isAnswered || effectiveBlanksCorrect.length === 0) return;
    hasUserInteractedRef.current = true;
    setDragDropChecked(true);
    const correctBlanks = effectiveBlanksCorrect;
    const allCorrect = placedChips.every((chip, idx) => {
      if (!chip) return false;
      return chip.trim().toLowerCase() === correctBlanks[idx]?.trim().toLowerCase();
    });

    const userAns = placedChips
      .map((chip, idx) => `[${idx + 1}] ${chip || '___'}`)
      .join(' , ');

    // Reconstruir la oración completa con las palabras correctas
    let completedSentence = effectiveTemplateSentence || '';
    correctBlanks.forEach((blank, idx) => {
      completedSentence = completedSentence.replace(new RegExp(`\\{${idx}\\}`, 'g'), blank);
    });

    const correctAns = completedSentence || correctBlanks
      .map((blank, idx) => `[${idx + 1}] ${blank}`)
      .join(' , ');

    markQuestionResult(allCorrect, userAns, correctAns);
  };

  // ── Progression Check & Next Question ────────────────────────────────────

  const handleSkipQuestion = () => {
    if (isAnswered) return;

    // Bloqueo de seguridad: Evitar salto accidental si la pregunta acaba de cargarse (<650ms) o esta avanzando
    if (Date.now() - lastQuestionLoadTimeRef.current < 650 || isAdvancingRef.current) {
      return;
    }

    let correctAns = 'Respuesta correcta';
    if (qType === 'short-answer') {
      correctAns = currentQ.idealAnswer || currentQ.explanation;
    } else if (qType === 'true-false') {
      correctAns = safeCorrectIndex === 0 ? 'Verdadero' : 'Falso';
    } else if (qType === 'multi-select') {
      correctAns = safeCorrectIndices.map(i => safeOptions[i] || `Opción ${i + 1}`).join(' • ');
      setSelectedMultiIndices(safeCorrectIndices);
    } else if (qType === 'matching' && currentQ.matchingPairs) {
      correctAns = `Emparejamientos: ${correctMatchingFormula}`;
      const solution: Record<string, string> = {};
      currentQ.matchingPairs.forEach(p => { solution[p.term] = p.definition; });
      setMatchingPairsMap(solution);
      setMatchingChecked(true);
    } else if (qType === 'drag-drop' && effectiveBlanksCorrect.length > 0) {
      let completedSentence = effectiveTemplateSentence || '';
      effectiveBlanksCorrect.forEach((blank, idx) => {
        completedSentence = completedSentence.replace(new RegExp(`\\{${idx}\\}`, 'g'), blank);
      });
      correctAns = completedSentence || effectiveBlanksCorrect.map((b, idx) => `[${idx + 1}] ${b}`).join(' , ');
      setPlacedChips([...effectiveBlanksCorrect]);
      setDragDropChecked(true);
    } else {
      correctAns = safeOptions[safeCorrectIndex] || 'Opción señalada en verde';
    }

    markQuestionResult(false, 'Pregunta saltada', correctAns);
  };

  /** Reinicia únicamente los estados locales de respuesta al cambiar o avanzar de pregunta. */
  const resetQuestionAnswerState = (targetQ?: Question | null) => {
    setSelectedOption(null);
    setSelectedMultiIndices([]);
    setActiveMatchingTerm(null);
    setMatchingPairsMap({});
    setMatchingChecked(false);
    setDragDropChecked(false);
    const nextBlanksCount = (targetQ?.blanksCorrect && targetQ.blanksCorrect.length > 0)
      ? targetQ.blanksCorrect.length
      : (targetQ?.templateSentence?.match(/\{\d+\}/g)?.length || targetQ?.question?.match(/\{\d+\}/g)?.length || 0);
    setPlacedChips(nextBlanksCount > 0 ? new Array(nextBlanksCount).fill(null) : []);
    setShortAnswerInput('');
    setShortAnswerEvalResult(null);
    setIsManuallyOverridden(false);
    setIsAnswered(false);
    setIsCurrentCorrect(null);
    setFeedbackGiven(null);

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  /** Persiste de forma atómica y síncrona la transición a la siguiente pregunta o nivel. */
  const commitTransitionSession = (
    nextQ: Question,
    overrides: {
      currentIndex: number;
      level: 1 | 2 | 3;
      activePracticeLevel: 1 | 2 | 3;
      levelCorrectCount: number;
      errorQueue: Question[];
      isReinforcementMode: boolean;
      answeredQuestionIds: string[];
    }
  ) => {
    hasUserInteractedRef.current = true;
    setCurrentQuestion(nextQ);
    lastQId.current = nextQ.id;

    persistSessionSnapshot({
      currentIndex: overrides.currentIndex,
      level: overrides.level,
      activePracticeLevel: overrides.activePracticeLevel,
      currentQuestionId: nextQ.id,
      currentQuestion: nextQ,
      selectedOption: null,
      selectedMultiIndices: [],
      matchingPairsMap: {},
      matchingChecked: false,
      placedChips: [],
      dragDropChecked: false,
      isAnswered: false,
      isCurrentCorrect: null,
      shortAnswerInput: '',
      levelCorrectCount: overrides.levelCorrectCount,
      levelCorrectCounts,
      errorQueue: overrides.errorQueue,
      isReinforcementMode: overrides.isReinforcementMode,
      history: history.slice(0, 50),
      questionsAnsweredTotal,
      totalErrorsReinforced,
      answeredQuestionIds: overrides.answeredQuestionIds,
    });
  };

  const handleNext = () => {
    if (isAdvancingRef.current) return;

    // Si la pregunta aún no está respondida y se pulsa el botón "Saltar pregunta", responderla automáticamente
    if (!isAnswered) {
      // Evitar salto accidental por doble clic rápido residual al avanzar
      if (Date.now() - lastQuestionLoadTimeRef.current < 650) {
        return;
      }
      handleSkipQuestion();
      return;
    }

    // Activar candado de avance para prevenir dobles ejecuciones
    isAdvancingRef.current = true;
    setIsAdvancing(true);
    lastQuestionLoadTimeRef.current = Date.now();
    setTimeout(() => {
      isAdvancingRef.current = false;
      setIsAdvancing(false);
    }, 600);

    let nextQ: Question = currentQ;
    let nextSavedLevel = level;
    let nextSavedActiveLevel = activePracticeLevel;
    let nextSavedCount = currentLevelCorrect;
    let nextSavedIndex = currentIndex;
    let nextSavedErrorQueue = errorQueue;
    let nextSavedReinforcement = isReinforcementMode;

    // Registrar ID en el conjunto de preguntas respondidas
    markQuestionAsAnswered(currentQ.id);

      // 1. Si la pregunta que acaba de responderse era una intervención socrática, marcarla completada
      if (currentQ?.isSocraticReformulation) {
        completedSocraticIdsRef.current.add(currentQ.id);
        setSocraticProfile(prev => ({
          ...prev,
          interventions: prev.interventions.map(i => {
            if (
              (i.reformulatedQuestion && i.reformulatedQuestion.id === currentQ.id) ||
              i.originalQuestionId === currentQ.originalFailedQuestionId ||
              i.concept === currentQ.topic
            ) {
              return { ...i, status: 'completed' as const };
            }
            return i;
          }),
        }));
      }

      // 2. Manejo de avance: Si se completó el objetivo del nivel actual (25 aciertos / 100%)
      if (currentLevelCorrect >= levelTarget) {
        if (level < 3) {
          const nextLevel = (level + 1) as 1 | 2 | 3;
          const nextCount = levelCorrectCounts[nextLevel] ?? 0;
          nextSavedLevel = nextLevel;
          nextSavedActiveLevel = nextLevel;
          nextSavedCount = nextCount;
          nextSavedIndex = 0;
          nextSavedErrorQueue = [];
          nextSavedReinforcement = false;

          setLevel(nextLevel);
          setActivePracticeLevel(nextLevel);
          setTargetLevel(nextLevel);
          setLevelCorrectCount(nextCount);
          setErrorQueue([]);
          setIsReinforcementMode(false);
          setCurrentIndex(0);

          answeredQuestionIdsRef.current.clear();
          completedSocraticIdsRef.current.clear();

          confetti({
            particleCount: 120,
            spread: 80,
            origin: { y: 0.6 }
          });

          setLevelUpBanner(`¡Nivel ${level} Completado con Éxito! Iniciando ${levelLabels[nextLevel].title}`);

          nextQ = resolveNextQuestion(nextLevel, 0, false, []);
          checkAndPrefetchQuestions(nextLevel, 0);
        } else {
          // Nivel 3 completado: Dominio total
          confetti({
            particleCount: 150,
            spread: 90,
            origin: { y: 0.5 }
          });
          setShowLevelCompleteModal(true);
          return;
        }
      } else if (isReinforcementMode && errorQueue.length > 0) {
        if (isCurrentCorrect) {
          // Remueve la pregunta superada de la cola de refuerzo
          const remainingQueue = errorQueue.slice(1);
          nextSavedErrorQueue = remainingQueue;
          setErrorQueue(remainingQueue);
          if (remainingQueue.length === 0) {
            nextSavedReinforcement = false;
            const nextIdx = currentIndex + 1;
            nextSavedIndex = nextIdx;
            setIsReinforcementMode(false);
            setCurrentIndex(nextIdx);
            nextQ = resolveNextQuestion(activePracticeLevel, nextIdx, false, [], currentQ.id);
            checkAndPrefetchQuestions(activePracticeLevel, nextIdx);
          } else {
            nextQ = remainingQueue[0];
          }
        } else {
          // Si falló en refuerzo, rotar la pregunta al final de la cola para volver a intentarla
          const rotated = [...errorQueue.slice(1), errorQueue[0]];
          nextSavedErrorQueue = rotated;
          setErrorQueue(rotated);
          nextQ = rotated[0];
        }
      } else {
        // Avance normal a la siguiente pregunta del nivel actual
        const nextIdx = currentIndex + 1;
        nextSavedIndex = nextIdx;
        setCurrentIndex(nextIdx);
        nextQ = resolveNextQuestion(activePracticeLevel, nextIdx, false, [], currentQ.id);
        checkAndPrefetchQuestions(activePracticeLevel, nextIdx);
      }

    // Salvaguarda final: NUNCA permitir que nextQ sea la misma pregunta actual si el kit tiene más preguntas
    if (nextQ && nextQ.id === currentQ.id && kit.questions.length > 1) {
      const alt = kit.questions.find(q => q.id !== currentQ.id && !isQuestionAnswered(q.id))
        || kit.questions.find(q => q.id !== currentQ.id);
      if (alt) {
        nextQ = alt;
      }
    }

    // Actualizar de forma explícita y controlada la pregunta mostrada
    if (nextQ) {
      commitTransitionSession(nextQ, {
        currentIndex: nextSavedIndex,
        level: nextSavedLevel,
        activePracticeLevel: nextSavedActiveLevel,
        levelCorrectCount: nextSavedCount,
        errorQueue: nextSavedErrorQueue,
        isReinforcementMode: nextSavedReinforcement,
        answeredQuestionIds: Array.from(answeredQuestionIdsRef.current),
      });
    }

    // 3. Limpieza DIRECTA e INCONDICIONAL de todos los estados para que NUNCA quede bloqueada
    resetQuestionAnswerState(nextQ);
  };

  const handleResetProgress = () => {
    setLevel(1);
    setActivePracticeLevel(1);
    setTargetLevel(1);
    setLevelCorrectCount(0);
    setLevelCorrectCounts({ 1: 0, 2: 0, 3: 0 });
    setErrorQueue([]);
    setIsReinforcementMode(false);
    setCurrentIndex(0);
    setAllCompleted(false);
    setShowLevelCompleteModal(false);
    setShowResetConfirmModal(false);
    setLevelUpBanner('');

    answeredQuestionIdsRef.current.clear();
    completedSocraticIdsRef.current.clear();

    const firstQ = resolveNextQuestion(1, 0, false, []);
    setCurrentQuestion(firstQ);
    lastQId.current = firstQ.id;

    // Limpieza incondicional de respuestas activas
    setSelectedOption(null);
    setSelectedMultiIndices([]);
    setActiveMatchingTerm(null);
    setMatchingPairsMap({});
    setMatchingChecked(false);
    setPlacedChips([]);
    setDragDropChecked(false);
    setShortAnswerInput('');
    setShortAnswerEvalResult(null);
    setIsManuallyOverridden(false);
    setIsAnswered(false);
    setIsCurrentCorrect(null);
    setFeedbackGiven(null);

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }

    // Actualizar almacenamiento manteniendo las respuestas previas en Historial y marcando resetAt explícito para sync multi-dispositivo
    hasUserInteractedRef.current = true;
    const now = Date.now();
    resetAtRef.current = now;
    const currentSession = authService.getSmartStudySession(userId || null, kit.id) || latestSessionRef.current;
    if (currentSession) {
      persistSessionSnapshot({
        ...currentSession,
        level: 1 as const,
        activePracticeLevel: 1 as const,
        currentQuestionId: firstQ?.id,
        currentQuestion: firstQ,
        selectedOption: null,
        selectedMultiIndices: [],
        matchingPairsMap: {},
        matchingChecked: false,
        placedChips: [],
        dragDropChecked: false,
        shortAnswerInput: '',
        levelCorrectCount: 0,
        levelCorrectCounts: { 1: 0, 2: 0, 3: 0 },
        currentIndex: 0,
        errorQueue: [],
        answeredQuestionIds: [],
        completedSocraticIds: [],
        isReinforcementMode: false,
        isAnswered: false,
        isCurrentCorrect: null,
        lastUpdated: now,
        resetAt: now,
      });
      if (userId && (googleDriveService.isLinked() || googleDriveService.getValidAccessToken())) {
        googleDriveService.scheduleProgressSync(userId, 0);
      }
    }
  };

  const handleAdvanceToNextLevel = () => {
    setShowLevelCompleteModal(false);
    if (level < 3) {
      const nextLevel = (level + 1) as 1 | 2 | 3;
      const nextCount = levelCorrectCounts[nextLevel] ?? 0;
      setLevel(nextLevel);
      setActivePracticeLevel(nextLevel);
      setTargetLevel(nextLevel);
      setLevelCorrectCount(nextCount);
      setErrorQueue([]);
      setIsReinforcementMode(false);
      setCurrentIndex(0);

      answeredQuestionIdsRef.current.clear();
      completedSocraticIdsRef.current.clear();

      const nextQ = resolveNextQuestion(nextLevel, 0, false, []);
      resetQuestionAnswerState(nextQ);
      if (nextQ) {
        commitTransitionSession(nextQ, {
          currentIndex: 0,
          level: nextLevel,
          activePracticeLevel: nextLevel,
          levelCorrectCount: nextCount,
          errorQueue: [],
          isReinforcementMode: false,
          answeredQuestionIds: [],
        });
      }
      checkAndPrefetchQuestions(nextLevel, 0);
    } else {
      setAllCompleted(true);
    }
  };

  const activeReadAloudAudioRef = useRef<HTMLAudioElement | null>(null);

  // Text-to-speech helper con voz Azure Neural de alta fidelidad
  const handleReadAloud = async (text: string) => {
    if (isSpeaking) {
      if (activeReadAloudAudioRef.current) {
        activeReadAloudAudioRef.current.pause();
        activeReadAloudAudioRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);
    try {
      const url = await synthesizeAzureEdgeSpeech(text, 'es-ES-ElviraNeural');
      const audio = new Audio(url);
      activeReadAloudAudioRef.current = audio;
      audio.onended = () => {
        setIsSpeaking(false);
        activeReadAloudAudioRef.current = null;
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        activeReadAloudAudioRef.current = null;
      };
      await audio.play();
    } catch (e) {
      console.warn('[SmartStudy] Fallo en Azure Neural, usando voz local:', e);
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'es-ES';
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
      } else {
        setIsSpeaking(false);
      }
    }
  };

  const levelLabels: Record<number, { title: string; badge: string; color: string; icon: React.ReactNode }> = {
    1: { title: 'Nivel 1: Fundamentos', badge: 'Principiante', color: 'from-emerald-500 to-teal-600', icon: <ShieldCheck className="w-5 h-5 text-emerald-400" /> },
    2: { title: 'Nivel 2: Aplicación y Relaciones', badge: 'Intermedio', color: 'from-blue-500 to-indigo-600', icon: <Target className="w-5 h-5 text-blue-400" /> },
    3: { title: 'Nivel 3: Dominio Crítico', badge: 'Experto', color: 'from-purple-500 to-amber-600', icon: <Award className="w-5 h-5 text-amber-400" /> },
  };

  // ── Render Level Complete Celebration Modal ──────────────────────────────
  if (showLevelCompleteModal) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center animate-fadeIn">
        <div className="bg-thea-surface rounded-3xl border border-amber-500/40 p-8 sm:p-12 shadow-2xl relative overflow-hidden">
          <div className="w-20 h-20 rounded-3xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto mb-6 text-amber-400">
            <Trophy className="w-10 h-10 animate-bounce" />
          </div>

          <span className="text-xs font-bold uppercase tracking-widest text-amber-400 px-3 py-1 rounded-full bg-amber-950/60 border border-amber-500/30">
            ¡Nivel {level} Superado!
          </span>

          <h2 className="text-2xl sm:text-4xl font-extrabold text-white mt-4 mb-3">
            {level === 3 ? '¡Felicidades! Has Dominado los 3 Niveles del Kit' : `¡Completaste ${levelLabels[level].title}!`}
          </h2>

          <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto mb-8 leading-relaxed">
            {level === 3
              ? 'Has respondido con éxito las preguntas requeridas de los 3 niveles y superado todas las rondas de refuerzo socrático. Has consolidado el dominio total de este kit de estudio.'
              : 'Has respondido con éxito las 25 preguntas requeridas y superado todas las rondas de refuerzo de este nivel. Tu comprensión conceptual está consolidada.'}
          </p>

          <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-8 text-left">
            <div className="p-4 rounded-2xl bg-thea-surfaceLight border border-thea-border">
              <span className="text-xs text-slate-400 block mb-1">Aciertos Meta</span>
              <span className="text-xl font-bold text-white">25 / 25</span>
            </div>
            <div className="p-4 rounded-2xl bg-thea-surfaceLight border border-thea-border">
              <span className="text-xs text-slate-400 block mb-1">Reforzadas</span>
              <span className="text-xl font-bold text-emerald-400">+{totalErrorsReinforced}</span>
            </div>
            <div className="p-4 rounded-2xl bg-thea-surfaceLight border border-thea-border">
              <span className="text-xs text-slate-400 block mb-1">Precisión Final</span>
              <span className="text-xl font-bold text-amber-400">100%</span>
            </div>
          </div>

          {level === 3 ? (
            <div className="space-y-4 pt-2 border-t border-thea-border/80">
              <span className="text-xs uppercase tracking-wider font-extrabold text-amber-400 block mb-2">
                ¿Qué deseas hacer a continuación?
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl mx-auto">
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('flashcards')}
                  className="p-4 rounded-2xl bg-thea-surfaceLight hover:bg-violet-900/30 border border-thea-border hover:border-violet-500/50 text-left transition-all cursor-pointer group shadow-md"
                >
                  <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 mb-3 group-hover:scale-110 transition-transform">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-bold text-white block mb-1">Ir a Flashcards</span>
                  <span className="text-xs text-slate-400 block leading-tight">Repasar tarjetas de memoria activa</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('tests')}
                  className="p-4 rounded-2xl bg-thea-surfaceLight hover:bg-amber-900/30 border border-thea-border hover:border-amber-500/50 text-left transition-all cursor-pointer group shadow-md"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3 group-hover:scale-110 transition-transform">
                    <FileCheck2 className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-bold text-white block mb-1">Dar un Examen Final</span>
                  <span className="text-xs text-slate-400 block leading-tight">Evaluación simulada cronometrada</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('home')}
                  className="p-4 rounded-2xl bg-thea-surfaceLight hover:bg-emerald-900/30 border border-thea-border hover:border-emerald-500/50 text-left transition-all cursor-pointer group shadow-md"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3 group-hover:scale-110 transition-transform">
                    <Home className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-bold text-white block mb-1">Cerrar el Kit</span>
                  <span className="text-xs text-slate-400 block leading-tight">Volver al inicio con todos mis kits</span>
                </button>
              </div>

              <div className="pt-3">
                <button
                  type="button"
                  onClick={handleResetProgress}
                  className="text-xs text-slate-400 hover:text-white underline underline-offset-4 transition-colors cursor-pointer"
                >
                  O reiniciar SmartStudy desde el Nivel 1 (0%)
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleAdvanceToNextLevel}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-extrabold text-base shadow-xl shadow-rose-950/40 transition-transform duration-160 hover:-translate-y-0.5 cursor-pointer active:scale-95"
            >
              <span>Avanzar al Nivel {level + 1}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Render All Levels Mastered ───────────────────────────────────────────
  if (allCompleted) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center animate-fadeIn">
        <div className="bg-thea-surface rounded-3xl border border-emerald-500/40 p-8 sm:p-12 shadow-2xl">
          <div className="w-20 h-20 rounded-3xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto mb-6 text-emerald-400">
            <Award className="w-10 h-10" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            ¡Maestría Total del Material!
          </h2>
          <p className="text-slate-300 text-base max-w-lg mx-auto mb-8">
            Has completado los 3 niveles de aprendizaje activo (75 preguntas acertadas) sin dejar dudas pendientes.
          </p>

          <div className="space-y-4">
            <span className="text-xs uppercase tracking-wider font-extrabold text-emerald-400 block mb-2">
              ¿Qué deseas hacer a continuación?
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl mx-auto mb-6">
              <button
                type="button"
                onClick={() => onNavigate && onNavigate('flashcards')}
                className="p-4 rounded-2xl bg-thea-surfaceLight hover:bg-violet-900/30 border border-thea-border hover:border-violet-500/50 text-left transition-all cursor-pointer group shadow-md"
              >
                <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 mb-3 group-hover:scale-110 transition-transform">
                  <BookOpen className="w-5 h-5" />
                </div>
                <span className="text-sm font-bold text-white block mb-1">Ir a Flashcards</span>
                <span className="text-xs text-slate-400 block leading-tight">Repasar tarjetas de memoria</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate && onNavigate('tests')}
                className="p-4 rounded-2xl bg-thea-surfaceLight hover:bg-amber-900/30 border border-thea-border hover:border-amber-500/50 text-left transition-all cursor-pointer group shadow-md"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3 group-hover:scale-110 transition-transform">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <span className="text-sm font-bold text-white block mb-1">Dar un Examen Final</span>
                <span className="text-xs text-slate-400 block leading-tight">Evaluación simulada cronometrada</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate && onNavigate('home')}
                className="p-4 rounded-2xl bg-thea-surfaceLight hover:bg-emerald-900/30 border border-thea-border hover:border-emerald-500/50 text-left transition-all cursor-pointer group shadow-md"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3 group-hover:scale-110 transition-transform">
                  <Home className="w-5 h-5" />
                </div>
                <span className="text-sm font-bold text-white block mb-1">Cerrar el Kit</span>
                <span className="text-xs text-slate-400 block leading-tight">Volver al inicio con todos mis kits</span>
              </button>
            </div>

            <button
              onClick={handleResetProgress}
              className="px-8 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold transition-all cursor-pointer shadow-md shadow-rose-950/30 active:scale-95"
            >
              Reiniciar Progreso de SmartStudy a 0%
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Salvaguarda: si el kit aún no tiene preguntas disponibles o se están cargando
  if (!kit.questions || kit.questions.length === 0 || !currentQ || currentQ.id === 'thea-placeholder-loading') {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center animate-fadeIn">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
          <BookOpen className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Cargando preguntas del kit...</h3>
        <p className="text-sm text-slate-400 mb-6">
          Estamos preparando los contenidos interactivos de este kit de estudio.
        </p>
        <button
          onClick={() => onNavigate && onNavigate('home')}
          className="px-5 py-2.5 rounded-xl bg-thea-surface border border-thea-border text-slate-300 hover:text-white text-sm font-semibold transition-all cursor-pointer"
        >
          Volver al Inicio
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
      {activeTab === 'history' ? (
        <div className="space-y-6 animate-fadeIn">
          {/* Header de Historial con botón de retorno a la práctica */}
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] flex-wrap gap-3">
            <button
              onClick={() => setActiveTab('practice')}
              className="active-press px-4 sm:px-5 py-2 rounded-xl bg-white text-zinc-950 font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors duration-150 cursor-pointer shadow-md hover:bg-zinc-200"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver a la Pregunta</span>
            </button>
            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-slate-400" />
              <span>Historial de Preguntas</span>
            </h3>
          </div>
          {/* Métricas del Historial */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
            <div className="p-4 rounded-2xl bg-white/[0.025] border border-white/[0.08]">
              <span className="text-xs text-slate-400 block mb-1 font-medium">Aciertos</span>
              <span className="text-2xl font-bold text-white tabular-nums">
                {history.filter(h => h.isCorrect).length}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.025] border border-white/[0.08]">
              <span className="text-xs text-slate-400 block mb-1 font-medium">Fallos / A Reforzar</span>
              <span className="text-2xl font-bold text-white tabular-nums">
                {history.filter(h => !h.isCorrect).length}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.025] border border-white/[0.08]">
              <span className="text-xs text-slate-400 block mb-1 font-medium">Tasa de Acierto</span>
              <span className="text-2xl font-bold text-white tabular-nums">
                {history.length > 0
                  ? Math.round((history.filter(h => h.isCorrect).length / history.length) * 100)
                  : 0}%
              </span>
            </div>
          </div>

          {/* Filtros de Historial */}
          <div className="p-4 rounded-2xl bg-white/[0.025] border border-white/[0.08] flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 mr-1">
                <Filter className="w-3.5 h-3.5" />
                Filtrar:
              </span>
              <button
                onClick={() => setHistoryFilter('all')}
                className={`active-press px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors duration-150 border tabular-nums ${
                  historyFilter === 'all'
                    ? 'bg-white/[0.12] text-white border-white/25 shadow-sm'
                    : 'bg-white/[0.03] text-slate-400 border-white/[0.08] hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                Todas
              </button>
              <button
                onClick={() => setHistoryFilter('correct')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors duration-150 ${
                  historyFilter === 'correct'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-thea-surfaceLight text-slate-400 hover:text-white'
                }`}
              >
                Aciertos
              </button>
              <button
                onClick={() => setHistoryFilter('incorrect')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors duration-150 ${
                  historyFilter === 'incorrect'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-thea-surfaceLight text-slate-400 hover:text-white'
                }`}
              >
                Fallos
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Nivel:</span>
              <select
                value={historyLevelFilter}
                onChange={e =>
                  setHistoryLevelFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="bg-thea-surfaceLight border border-thea-border text-slate-200 text-xs rounded-xl px-2.5 py-1.5 outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="all">Todos los Niveles</option>
                <option value="1">Nivel 1 (Fácil)</option>
                <option value="2">Nivel 2 (Intermedio)</option>
                <option value="3">Nivel 3 (Difícil)</option>
              </select>
            </div>
          </div>

          {/* Listado de Preguntas Respondidas */}
          {filteredHistory.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-3xl bg-thea-surface border border-thea-border">
              <History className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-white mb-1">
                {history.length === 0
                  ? 'Aún no has respondido preguntas en esta sesión'
                  : 'No hay preguntas con los filtros seleccionados'}
              </h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
                {history.length === 0
                  ? 'Entra en el Modo Práctica para resolver preguntas. Cada respuesta, su corrección y la explicación pedagógica quedarán guardadas aquí.'
                  : 'Prueba cambiando los filtros seleccionados arriba para revisar otras respuestas.'}
              </p>
              <button
                onClick={() => setActiveTab('practice')}
                className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm inline-flex items-center gap-2 transition-all shadow-md"
              >
                <Target className="w-4 h-4" />
                <span>Volver al Modo Práctica</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredHistory.map((item, idx) => (
                <div
                  key={item.id}
                  className={`p-6 rounded-3xl border transition-all ${
                    item.isCorrect
                      ? 'bg-thea-surface border-emerald-500/30 hover:border-emerald-500/50'
                      : 'bg-thea-surface border-rose-500/30 hover:border-rose-500/50'
                  }`}
                >
                  {/* Fila superior de metadatos */}
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold ${
                          item.isCorrect
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        }`}
                      >
                        {item.isCorrect ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                      </span>
                      <span className="text-xs font-bold text-white tabular-nums">
                        Pregunta #{item.attemptNumber ?? Math.max(1, (questionsAnsweredTotal || filteredHistory.length) - idx)}
                      </span>
                      <span className="text-xs text-slate-500 tabular-nums">• {item.timestamp}</span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-thea-surfaceLight border border-thea-border text-slate-300 font-medium">
                        {item.topic}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-950/60 border border-violet-500/30 text-violet-300 font-semibold">
                        Nivel {item.level} ({item.difficulty === 'easy' ? 'Fácil' : item.difficulty === 'medium' ? 'Intermedio' : 'Difícil'})
                      </span>
                    </div>
                  </div>

                  {/* Enunciado de la Pregunta */}
                  <div className="text-[15px] sm:text-[17px] mb-4 leading-relaxed">
                    <QuestionPrompt text={item.questionText} topic={item.topic} />
                  </div>

                  {/* Comparativa: Tu Respuesta vs Respuesta Correcta */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                    <div
                      className={`p-4 rounded-2xl border ${
                        item.isCorrect
                          ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                          : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                      }`}
                    >
                      <span className="text-xs uppercase tracking-wider font-extrabold block mb-1 opacity-80 flex items-center gap-1.5">
                        {item.isCorrect ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-rose-400" />
                        )}
                        Tu Respuesta:
                      </span>
                      <div className="text-sm font-semibold">
                        <FormattedText text={item.userAnswer} inlineOnly={true} />
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl border bg-emerald-950/20 border-emerald-500/30 text-emerald-300">
                      <span className="text-xs uppercase tracking-wider font-extrabold block mb-1 opacity-80 flex items-center gap-1.5 text-emerald-400">
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Respuesta Correcta:
                      </span>
                      <div className="text-sm font-semibold text-emerald-100">
                        <FormattedText text={item.correctAnswer} inlineOnly={true} />
                      </div>
                    </div>
                  </div>

                  {/* Botón para desplegar / ocultar Justificación */}
                  <div className="pt-1 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => toggleHistoryJustification(item.questionId)}
                      className={`px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer ${
                        expandedHistoryQuestions.has(item.questionId)
                          ? 'bg-violet-600 text-white hover:bg-violet-500 ring-1 ring-violet-400/50 shadow-violet-900/30'
                          : 'bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 text-violet-300 border border-violet-500/30'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-400" />
                      <span>{expandedHistoryQuestions.has(item.questionId) ? 'Ocultar Justificación' : 'Justificación'}</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${
                          expandedHistoryQuestions.has(item.questionId) ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  </div>

                  {/* Explicación Pedagógica (solo visible al pulsar Justificación) */}
                  {expandedHistoryQuestions.has(item.questionId) && (() => {
                    const cleanQId = (item.questionId || '').replace(/^(tf-|sa-|mc-|dd-|drag-drop-)/, '');
                    const matchedQ: Question = kit.questions.find(q => q.id === item.questionId || q.id === cleanQId) || {
                      id: item.questionId,
                      question: item.questionText || 'Concepto evaluado',
                      difficulty: item.difficulty || 'easy',
                      topic: item.topic || 'General',
                      explanation: item.explanation || 'Respuesta fundamentada en el material de estudio analizado.',
                      options: [item.correctAnswer || 'Respuesta verificada'],
                      correctIndex: 0,
                    };

                    const effectiveExplanation = item.explanation || matchedQ.explanation || 'Respuesta fundamentada en el material de estudio analizado.';
                    const explanationQuestion: Question = matchedQ.explanation
                      ? matchedQ
                      : { ...matchedQ, explanation: effectiveExplanation };

                    return (
                      <div className="p-4 rounded-2xl bg-thea-surfaceLight/60 border border-thea-border/80 text-xs sm:text-sm text-slate-300 animate-fadeIn space-y-2 mt-2">
                        <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                          <span className="font-bold text-amber-400 flex items-center gap-1.5 text-xs">
                            <Lightbulb className="w-3.5 h-3.5" />
                            Explicación Conceptual:
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setModalChunk({
                                  id: matchedQ.sourceChunkId,
                                  text: matchedQ.sourceChunkText || kit.chunks?.find(c => c.id === matchedQ.sourceChunkId)?.text || effectiveExplanation,
                                  pageOrSlide: matchedQ.sourcePageOrSlide,
                                  asset: matchedQ.sourceAsset,
                                });
                                setShowSourceModal(true);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-violet-950/60 border border-violet-500/40 text-violet-300 hover:text-white hover:bg-violet-600/40 transition-colors text-xs flex items-center gap-1 cursor-pointer"
                              title="Ver fragmento original del documento (RAG)"
                            >
                              <FileSearch className="w-3.5 h-3.5 text-violet-400" />
                              <span>Fragmento RAG</span>
                            </button>
                            <button
                              onClick={() => handleReadAloud(effectiveExplanation)}
                              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-thea-surfaceLight transition-colors"
                              title="Escuchar explicación"
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="my-2">
                          <TheaExplanationView
                            question={explanationQuestion}
                            kitAssets={kit.assets || []}
                            onZoomImage={(asset) => setZoomAsset(asset)}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── MODO PRÁCTICA ACTIVA (DISTRIBUCIÓN PREMIUM SEGÚN CAPTURA) ───────── */
        <div className="animate-fadeIn">
          {/* ── TOP BAR: PROGRESS PILL + 3 SPARKLE STARS + SETTINGS ─── */}
          <div className="flex items-center justify-between gap-3 sm:gap-6">
            {/* Pill Progress Bar: Nivel {level}: {pct}% */}
            <div className="flex-1 max-w-xl h-7 sm:h-8 rounded-full bg-white/[0.04] border border-white/[0.08] p-1 flex items-center relative overflow-hidden shadow-inner">
              <div
                className="h-full rounded-full bg-gradient-to-r from-rose-700 via-rose-600 to-rose-500 transition-[width] duration-300 ease-out shadow-sm"
                style={{ width: `${Math.max(6, Math.min(100, Math.round((currentLevelCorrect / levelTarget) * 100)))}%` }}
              />
              <span className="absolute left-4 text-xs font-semibold text-white tracking-wide select-none drop-shadow-sm tabular-nums">
                Nivel {level}: {Math.min(100, Math.round((currentLevelCorrect / levelTarget) * 100))}%
              </span>
            </div>

            {/* Right: 3 Sparkle Stars + Settings Gear */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <LevelIndicator currentLevel={level} onResetClick={() => setShowResetConfirmModal(true)} />

              <button
                type="button"
                onClick={() => setShowConfigDrawer(true)}
                title="Calibrar Dificultad y Enfoque Temático"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer ml-1 active-press"
              >
                <Settings className="w-5 h-5 text-slate-300" />
              </button>
            </div>
          </div>

          {/* Divider Line */}
          <div className="w-full h-px bg-white/[0.06] my-6 sm:my-8" />

          {/* Notificación de Nivel Completado / Subida de Nivel */}
          {levelUpBanner && (
            <div className="mb-4 p-3.5 rounded-2xl bg-gradient-to-r from-violet-900/90 to-purple-900/90 border border-violet-500/50 text-xs sm:text-sm text-violet-100 flex items-center justify-between shadow-xl animate-fadeIn">
              <div className="flex items-center gap-2.5">
                <TrendingUp className="w-4 h-4 text-rose-300 shrink-0" />
                <span className="font-extrabold">{levelUpBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setLevelUpBanner('')}
                className="text-violet-300 hover:text-white p-1 rounded-lg hover:bg-violet-800/40 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {generateMoreError && (
            <div className="mb-4 p-2.5 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-200 flex items-center justify-between animate-fadeIn">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{generateMoreError}</span>
              </div>
              <button onClick={() => setGenerateMoreError('')} className="text-slate-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {isSwitchingDifficulty ? (
            <div className="p-10 sm:p-16 rounded-3xl bg-[#200814]/90 border border-amber-500/40 flex flex-col items-center justify-center text-center animate-fadeIn my-4 shadow-2xl">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center mb-5 shadow-lg shadow-amber-500/10">
                <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
              </div>
              <h3 className="text-lg sm:text-xl font-extrabold text-white mb-2">
                Generando preguntas de Nivel {activePracticeLevel} con IA...
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 max-w-md leading-relaxed">
                {switchingDiffMessage || 'Ampliando el banco a un mínimo de 7 preguntas para este nivel de exigencia pedagógica.'}
              </p>
            </div>
          ) : (
            <>
              {/* Visual Diagram/Asset if strictly necessary */}
          {isImageStrictlyNecessary(currentQ) && currentQ.sourceAsset && (
            <div className="mb-6 p-4 rounded-2xl bg-[#200814]/80 border border-violet-500/30 overflow-hidden">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <span className="text-xs font-bold text-violet-300 flex items-center gap-1.5 uppercase tracking-wider">
                  <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
                  {currentQ.sourceAsset.type === 'image' ? 'Figura / Diagrama de Referencia' : 'Tabla de Datos'}
                </span>
                <div className="flex items-center gap-2">
                  {currentQ.sourcePageOrSlide && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-thea-bg border border-thea-border text-slate-300">
                      Diapositiva / Pág. {currentQ.sourcePageOrSlide}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setModalChunk({
                        id: currentQ.sourceChunkId,
                        text: currentQ.sourceChunkText || kit.chunks?.find(c => c.id === currentQ.sourceChunkId)?.text || currentQ.explanation,
                        pageOrSlide: currentQ.sourcePageOrSlide,
                        asset: currentQ.sourceAsset,
                      });
                      setShowSourceModal(true);
                    }}
                    className="text-[11px] px-2.5 py-0.5 rounded-lg bg-violet-950/60 border border-violet-500/40 text-violet-300 hover:text-white hover:bg-violet-600/40 transition-colors flex items-center gap-1 cursor-pointer"
                    title="Ver fragmento original del documento (RAG)"
                  >
                    <FileSearch className="w-3 h-3 text-violet-400" />
                    <span>Ver cita RAG</span>
                  </button>
                </div>
              </div>
              {(activeAssetDataUrl || currentQ.sourceAsset.dataUrl) && (
                <div
                  onClick={() => setZoomAsset(currentQ.sourceAsset ? { ...currentQ.sourceAsset, dataUrl: activeAssetDataUrl || currentQ.sourceAsset.dataUrl } : null)}
                  className="rounded-xl overflow-hidden bg-white border border-slate-200 flex items-center justify-center p-2 mb-2 max-h-72 cursor-pointer hover:border-violet-500/60 transition-colors group relative"
                  title="Clic para ampliar y hacer zoom interactivo"
                >
                  <img
                    src={activeAssetDataUrl || currentQ.sourceAsset.dataUrl}
                    alt={currentQ.sourceAsset.caption || 'Activo del documento'}
                    className="max-h-64 object-contain rounded-lg group-hover:scale-[1.02] transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                    <div className="w-9 h-9 rounded-full bg-violet-600/90 text-white flex items-center justify-center shadow-lg transform translate-y-1 group-hover:translate-y-0 transition-transform">
                      <ZoomIn className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              )}
              {currentQ.sourceAsset.caption && (
                <p className="text-xs text-slate-400 italic text-center">
                  {currentQ.sourceAsset.caption}
                </p>
              )}
            </div>
          )}

          {/* Badge de advertencia si la pregunta fue revelada previamente en el Banco de Preguntas */}
          {isCurrentQRevealed && (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-semibold mb-4 animate-fadeIn">
              <EyeOff className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Pregunta revelada previamente (no suma avance al progreso)</span>
            </div>
          )}

          {/* Badge de advertencia para preguntas de detección de concepto falso / impostor */}
          {(qType === 'multiple-choice' || qType === 'multi-select') && isFalseConceptQuestion(currentQ) && (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-bold mb-4 animate-fadeIn">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>Atención: Selecciona el concepto EQUIVOCADO o la afirmación FALSA</span>
            </div>
          )}

          {/* Question Title */}
          <QuestionPrompt
            as="h2"
            text={
              qType === 'drag-drop' && (/\{\d+\}/.test(currentQ.question) || !currentQ.question || currentQ.question === effectiveTemplateSentence)
                ? (currentQ.topic
                    ? `Completa los espacios en blanco sobre **${currentQ.topic}**:`
                    : 'Completa los espacios en blanco del siguiente enunciado:')
                : enforceQuestionLengthLimit(currentQ.question)
            }
            topic={currentQ.topic}
            className="text-lg sm:text-[21px] tracking-tight mb-6 sm:mb-8 leading-snug"
          />

          {/* ── QUESTION TYPE RENDERERS ────────────────────────────────────── */}

          {/* 1. MULTIPLE CHOICE RENDERER */}
          {qType === 'multiple-choice' && (
            <MultipleChoiceRenderer
              safeOptions={safeOptions}
              safeCorrectIndex={safeCorrectIndex}
              selectedOption={selectedOption}
              isAnswered={isAnswered}
              onSelectOption={handleSelectSingleOption}
            />
          )}

          {/* 2. MULTI-SELECT RENDERER */}
          {qType === 'multi-select' && (
            <MultiSelectRenderer
              safeOptions={safeOptions}
              safeCorrectIndices={safeCorrectIndices}
              selectedMultiIndices={selectedMultiIndices}
              isAnswered={isAnswered}
              onToggleIndex={handleToggleMultiIndex}
              onCheckSelection={handleCheckMultiSelect}
            />
          )}

        {/* 3. MATCHING (CONCEPT PAIRING) RENDERER */}
        {qType === 'matching' && currentQ.matchingPairs && (
          <MatchingRenderer
            matchingPairs={currentQ.matchingPairs}
            shuffledDefinitions={shuffledDefinitions}
            matchingPairsMap={matchingPairsMap}
            matchingChecked={matchingChecked}
            activeMatchingTerm={activeMatchingTerm}
            correctMatchingFormula={correctMatchingFormula}
            isAnswered={isAnswered}
            onTermClick={handleTermClick}
            onDefClick={handleDefClick}
            onCheckMatching={handleCheckMatching}
          />
        )}

        {/* 4. DRAG & DROP / WORD BANK RENDERER */}
        {qType === 'drag-drop' && effectiveTemplateSentence && effectiveBlanksCorrect.length > 0 && (
          <DragDropRenderer
            effectiveTemplateSentence={effectiveTemplateSentence}
            effectiveBlanksCorrect={effectiveBlanksCorrect}
            effectiveWordBank={effectiveWordBank}
            placedChips={placedChips}
            dragDropChecked={dragDropChecked}
            isAnswered={isAnswered}
            draggedChip={draggedChip}
            onSetDraggedChip={setDraggedChip}
            onPlaceChip={handlePlaceChip}
            onRemovePlacedChip={handleRemovePlacedChip}
            onCheckDragDrop={handleCheckDragDrop}
          />
        )}


        {/* 5. TRUE / FALSE RENDERER */}
        {qType === 'true-false' && (
          <TrueFalseRenderer
            selectedOption={selectedOption}
            safeCorrectIndex={safeCorrectIndex}
            isAnswered={isAnswered}
            onSelectOption={handleSelectSingleOption}
          />
        )}

        {/* 7. SHORT ANSWER RENDERER */}
        {qType === 'short-answer' && (
          <ShortAnswerRenderer
            shortAnswerInput={shortAnswerInput}
            isAnswered={isAnswered}
            isEvaluatingShortAnswer={isEvaluatingShortAnswer}
            shortAnswerEvalResult={shortAnswerEvalResult}
            idealAnswerOrExplanation={currentQ.idealAnswer || currentQ.explanation}
            onInputChange={(val: string) => {
              hasUserInteractedRef.current = true;
              hasPendingLocalChangeRef.current = true;
              if (latestSessionRef.current) {
                latestSessionRef.current = {
                  ...latestSessionRef.current,
                  shortAnswerInput: val,
                };
              }
              setShortAnswerInput(val);
            }}
            onSubmit={handleSubmitShortAnswer}
          />
        )}

        {/* ── ESTADO INMEDIATO DE LA RESPUESTA PARA PREGUNTAS ABIERTAS Y EMPAREJAMIENTO ─── */}
        {isAnswered && (qType === 'short-answer' || qType === 'matching') && (() => {
          const rawFeedback = currentQ.idealAnswer || currentQ.explanation || '';
          const parsedFeedback = parseExplanationDetails(rawFeedback);

          return (
            <div className={`p-4 sm:p-5 rounded-2xl mb-6 flex items-start justify-between gap-4 border shadow-lg animate-feedbackPop ${
              isCurrentCorrect
                ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-200 ring-1 ring-emerald-500/40'
                : 'bg-rose-950/70 border-rose-500/60 text-rose-200 ring-1 ring-rose-500/40'
            }`}>
              <div className="flex items-start gap-3.5 flex-1 min-w-0">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-bold mt-0.5 ${
                  isCurrentCorrect ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'
                }`}>
                  {isCurrentCorrect ? <Check className="w-5 h-5 stroke-[3]" /> : <X className="w-5 h-5 stroke-[3]" />}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-extrabold text-[15px] sm:text-[17px] text-white">
                    {isManuallyOverridden
                      ? '¡Respuesta Reclasificada! (¡Tenía razón!)'
                      : isCurrentCorrect
                      ? '¡Respuesta Correcta!'
                      : 'Respuesta Incorrecta'}
                  </p>

                  {isCurrentCorrect ? (
                    <p className="text-[13px] sm:text-[15px] text-emerald-200/90 mt-1">
                      {qType === 'matching' && correctMatchingFormula
                        ? `Has emparejado todos los conceptos con exactitud: ${correctMatchingFormula}.`
                        : 'Tu respuesta coincide conceptualmente con la solución esperada.'}
                    </p>
                  ) : (
                    <div className="text-[13px] sm:text-[15px] text-slate-200 mt-1.5 space-y-2">
                      {qType === 'matching' && correctMatchingFormula && (
                        <div className="text-[13px] text-rose-300">
                          <span className="font-semibold opacity-90">Emparejamientos correctos: </span>
                          <span className="text-white font-bold">{correctMatchingFormula}</span>
                        </div>
                      )}

                      {parsedFeedback.main && (
                        <div className="leading-relaxed text-slate-200">
                          <span className="font-bold text-rose-300 mr-1.5">
                            {qType === 'matching' ? 'Fundamento esperado:' : 'La respuesta esperada era:'}
                          </span>
                          <FormattedText text={parsedFeedback.main} inlineOnly={true} />
                        </div>
                      )}

                      {parsedFeedback.reference && (
                        <div className="text-xs text-rose-200/95 bg-black/30 rounded-xl px-3 py-2 border-l-2 border-rose-400 flex items-start gap-2">
                          <BookOpen className="w-3.5 h-3.5 text-rose-300 shrink-0 mt-0.5" />
                          <div className="leading-normal">
                            <span className="font-semibold text-rose-300 mr-1.5">Referencia en el texto:</span>
                            <span className="italic opacity-90">&quot;{parsedFeedback.reference}&quot;</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {!isCurrentCorrect && (
                <button
                  type="button"
                  onClick={handleIWasRight}
                  className="px-4 py-2 rounded-full font-bold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer shrink-0 active:scale-95 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 whitespace-nowrap mt-0.5"
                  title="Si consideras que tu respuesta era válida o la IA fue demasiado estricta, haz clic para marcarla como correcta"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-amber-300" />
                  <span>¡Tenía razón!</span>
                </button>
              )}
            </div>
          );
        })()}

        {/* ── ACTION ROW: HISTORIAL DE PREGUNTAS + THUMBS UP / DOWN (ESTILO LINEAR / RAYCAST) ────── */}
        <div className="flex items-center justify-between gap-3 mb-5 sm:mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className="active-press px-4 sm:px-5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/15 text-slate-300 hover:text-white font-medium text-xs sm:text-sm transition-colors shadow-sm flex items-center gap-2 min-h-[40px] cursor-pointer"
          >
            <History className="w-4 h-4 text-slate-400" />
            <span>Historial de preguntas</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFeedbackGiven(feedbackGiven === 'up' ? null : 'up')}
              title="Pregunta clara y de alta calidad"
              className={`active-press w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer border ${
                feedbackGiven === 'up'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-slate-400 hover:text-slate-200'
              }`}
            >
              <ThumbsUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setFeedbackGiven(feedbackGiven === 'down' ? null : 'down')}
              title="Reportar pregunta o redacción confusa"
              className={`active-press w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer border ${
                feedbackGiven === 'down'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-slate-400 hover:text-slate-200'
              }`}
            >
              <ThumbsDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── CENTERED "SIGUIENTE PREGUNTA" / "SALTAR PREGUNTA" BUTTON (ESTILO LINEAR STUDIO) ── */}
        <div className="flex justify-center mb-6 sm:mb-8">
          <button
            type="button"
            onClick={handleNext}
            disabled={isAdvancing}
            className={`active-press w-full sm:w-auto justify-center px-8 py-3 rounded-2xl font-bold text-sm sm:text-base shadow-lg transition-colors duration-150 flex items-center gap-2.5 cursor-pointer min-h-[46px] ${
              isAdvancing ? 'opacity-70 pointer-events-none cursor-not-allowed' : ''
            } ${
              currentLevelCorrect >= levelTarget
                ? 'bg-gradient-to-r from-amber-400 to-amber-300 text-zinc-950 shadow-amber-500/20 font-extrabold hover:from-amber-300 hover:to-amber-200'
                : theme === 'dark'
                ? 'bg-white hover:bg-zinc-200 text-zinc-950 shadow-black/40'
                : theme === 'kitty'
                ? 'bg-pink-500 hover:bg-pink-600 text-white shadow-pink-500/25'
                : 'thea-glass-card thea-glass-pill-hover border text-zinc-950'
            }`}
          >
            <span>
              {currentLevelCorrect >= levelTarget
                ? (level < 3 ? `Avanzar al Nivel ${level + 1}` : 'Finalizar Kit (Dominio Total)')
                : (isAnswered ? 'Siguiente pregunta' : 'Saltar pregunta')}
            </span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* ── JUSTIFICACIÓN EXACTA DE THEA (VISIBLE AUTOMÁTICAMENTE AL RESPONDER) ─ */}
        {isAnswered && (
          <div
            ref={explanationRef}
            className="mt-6 pt-5 border-t border-white/[0.08] animate-fadeIn"
          >
            {/* Barra de utilidades secundaria sutil (escuchar audio / ver fuente RAG) */}
            <div className="flex items-center justify-end gap-2 mb-3">
              <button
                onClick={() => {
                  setModalChunk({
                    id: currentQ.sourceChunkId,
                    text: currentQ.sourceChunkText || kit.chunks?.find(c => c.id === currentQ.sourceChunkId)?.text || currentQ.explanation,
                    pageOrSlide: currentQ.sourcePageOrSlide,
                    asset: currentQ.sourceAsset,
                  });
                  setShowSourceModal(true);
                }}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Ver fragmento original del documento"
              >
                <FileSearch className="w-3.5 h-3.5 text-violet-400" />
                <span>Fragmento RAG</span>
              </button>
              <button
                onClick={() => handleReadAloud(currentQ.explanation)}
                className={`p-1.5 rounded-lg border border-white/10 text-xs flex items-center transition-colors cursor-pointer ${
                  isSpeaking ? 'bg-violet-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                }`}
                title="Escuchar explicación con voz neural"
              >
                <Volume2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Componente réplica exacta Thea: 3 viñetas limpias + imagen con Crédito: Enlace a la fuente */}
            <TheaExplanationView
              question={currentQ}
              kitAssets={kit.assets || []}
              onZoomImage={(asset) => setZoomAsset(asset)}
            />
          </div>
        )}
            </>
          )}
        </div>
      )}

  {/* ── RAG EVIDENCE MODAL (CONTEXTO CERRADO) ────────────────────────── */}
  {showSourceModal && modalChunk && typeof document !== 'undefined' &&
    createPortal(
      <div
        className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/70 animate-fadeIn"
        onClick={(e) => {
          if (e.target === e.currentTarget) setShowSourceModal(false);
        }}
      >
        <div className={`rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative overflow-hidden max-h-[90vh] flex flex-col border ${
          theme === 'dark'
            ? 'bg-thea-surface border-violet-500/40 text-white'
            : theme === 'kitty'
            ? 'bg-white border-pink-200 text-zinc-950 shadow-pink-200/50'
            : 'bg-white border-slate-200 text-zinc-950 shadow-slate-200/60'
        }`}>
          {/* Modal Header */}
          <div className={`flex items-center justify-between pb-4 border-b ${
            theme === 'dark' ? 'border-thea-border/80' : theme === 'kitty' ? 'border-pink-100' : 'border-slate-100'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
                theme === 'dark'
                  ? 'bg-violet-600/20 border-violet-500/40 text-violet-400'
                  : theme === 'kitty'
                  ? 'bg-pink-100 border-pink-200 text-pink-600'
                  : 'bg-rose-50 border-rose-200 text-rose-600'
              }`}>
                <FileSearch className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-base sm:text-lg font-bold flex items-center gap-2 ${
                  theme === 'dark' ? 'text-white' : 'text-zinc-950'
                }`}>
                  Fragmento de Origen (RAG)
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                    theme === 'dark'
                      ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                      : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  }`}>
                    Contexto Cerrado
                  </span>
                </h3>
                <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                  Evidencia documental para garantizar fidelidad académica y evitar alucinaciones
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowSourceModal(false)}
              className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                theme === 'dark'
                  ? 'bg-thea-surfaceLight border-thea-border text-slate-400 hover:text-white'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-zinc-950 hover:bg-slate-200'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="py-4 space-y-4 overflow-y-auto flex-1 pr-1">
            {/* Metadata badges */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className={`px-3 py-1 rounded-lg border font-medium ${
                theme === 'dark'
                  ? 'bg-thea-surfaceLight border-thea-border text-slate-300'
                  : theme === 'kitty'
                  ? 'bg-pink-50 border-pink-200 text-pink-800'
                  : 'bg-slate-100 border-slate-200 text-slate-700'
              }`}>
                Fragmento: <strong>#{modalChunk.id || '1'}</strong>
              </span>
              {modalChunk.pageOrSlide && (
                <span className={`px-3 py-1 rounded-lg border font-medium ${
                  theme === 'dark'
                    ? 'bg-violet-950/60 border-violet-500/40 text-violet-300'
                    : theme === 'kitty'
                    ? 'bg-pink-100 border-pink-200 text-pink-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  Ubicación: <strong>Página o Diapositiva {modalChunk.pageOrSlide}</strong>
                </span>
              )}
              <span className={`px-3 py-1 rounded-lg border flex items-center gap-1 ${
                theme === 'dark'
                  ? 'bg-thea-surfaceLight border-thea-border text-slate-400'
                  : theme === 'kitty'
                  ? 'bg-pink-50 border-pink-200 text-pink-700'
                  : 'bg-slate-100 border-slate-200 text-slate-600'
              }`}>
                <Database className="w-3.5 h-3.5 text-amber-500" />
                Índice Vectorial Local
              </span>
            </div>

            {/* Verbatim Quote */}
            <div className={`rounded-2xl p-5 border relative ${
              theme === 'dark'
                ? 'bg-thea-bg border-thea-border/80 text-slate-200'
                : theme === 'kitty'
                ? 'bg-pink-50/40 border-pink-200 text-zinc-950'
                : 'bg-slate-50 border-slate-200 text-zinc-950'
            }`}>
              <div className={`text-xs uppercase font-extrabold tracking-wider mb-2 flex items-center gap-1.5 ${
                theme === 'dark' ? 'text-slate-400' : 'text-slate-600'
              }`}>
                <FileText className={`w-3.5 h-3.5 ${theme === 'kitty' ? 'text-pink-500' : theme === 'light' ? 'text-rose-600' : 'text-violet-400'}`} />
                Cita exacta del documento fuente:
              </div>
              <div className={`text-sm leading-relaxed pl-4 py-1.5 italic rounded-r-xl border-l-4 ${
                theme === 'dark'
                  ? 'border-violet-500 text-slate-200 bg-violet-950/10'
                  : theme === 'kitty'
                  ? 'border-pink-500 text-zinc-950 bg-pink-100/50'
                  : 'border-rose-500 text-zinc-950 bg-rose-50/50'
              }`}>
                <FormattedText text={modalChunk.text || 'Contenido del fragmento analizado en el material original.'} />
              </div>
            </div>

            {/* Multimodal Asset if available */}
            {modalChunk.asset && (
              <div className={`p-4 rounded-2xl border ${
                theme === 'dark'
                  ? 'bg-thea-surfaceLight border-thea-border/80'
                  : theme === 'kitty'
                  ? 'bg-pink-50/40 border-pink-200'
                  : 'bg-slate-50 border-slate-200'
              }`}>
                <span className={`text-xs font-bold block mb-2 flex items-center gap-1.5 ${
                  theme === 'dark' ? 'text-slate-300' : 'text-zinc-900'
                }`}>
                  <ImageIcon className={`w-3.5 h-3.5 ${theme === 'kitty' ? 'text-pink-500' : theme === 'light' ? 'text-rose-600' : 'text-violet-400'}`} />
                  Activo multimodal vinculado: {modalChunk.asset.caption || 'Figura del documento'}
                </span>
                {modalChunk.asset.dataUrl && (
                  <div
                    onClick={() => setZoomAsset(modalChunk.asset)}
                    className="rounded-xl overflow-hidden bg-white border border-slate-200 flex items-center justify-center p-2 max-h-60 cursor-pointer hover:border-rose-500/80 transition-colors group relative"
                    title="Clic para ampliar con zoom interactivo"
                  >
                    <img
                      src={modalChunk.asset.dataUrl}
                      alt={modalChunk.asset.caption || 'Gráfico'}
                      className="max-h-56 object-contain rounded-lg group-hover:scale-[1.02] transition-transform duration-200 bg-white"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <div className="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg transform translate-y-1 group-hover:translate-y-0 transition-transform">
                        <ZoomIn className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className={`border rounded-2xl p-4 text-xs leading-relaxed flex items-start gap-2.5 ${
              theme === 'dark'
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`}>
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <p>
                <strong>Garantía de Fidelidad RAG:</strong> La pregunta, la respuesta correcta y las retroalimentaciones de descarte fueron contrastadas rigurosamente contra este segmento del documento, asegurando coherencia y anclaje total.
              </p>
            </div>
          </div>

          {/* Modal Footer */}
          <div className={`pt-4 border-t flex justify-end ${
            theme === 'dark' ? 'border-thea-border/80' : 'border-slate-200'
          }`}>
            <button
              onClick={() => setShowSourceModal(false)}
              className={`px-5 py-2 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer ${
                theme === 'kitty'
                  ? 'bg-pink-500 hover:bg-pink-600 text-white shadow-pink-500/30'
                  : theme === 'light'
                  ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/25'
                  : 'bg-violet-600 hover:bg-violet-500 text-white'
              }`}
            >
              Cerrar Fragmento
            </button>
          </div>
        </div>
      </div>,
      document.body
    )
  }

  {/* ── MODAL DE ZOOM CENTRADO PARA IMÁGENES ─────────────────────────── */}
  {zoomAsset && zoomAsset.dataUrl && (
    <ImageZoomModal
      isOpen={Boolean(zoomAsset)}
      onClose={() => setZoomAsset(null)}
      imageUrl={zoomAsset.dataUrl}
      title={zoomAsset.type === 'image' ? 'Figura del Documento' : 'Tabla de Datos'}
      subtitle={zoomAsset.pageOrSlide ? `Página o Diapositiva ${zoomAsset.pageOrSlide}` : undefined}
      caption={zoomAsset.caption}
    />
  )}

  {/* ── LATERAL SLIDE-OVER DRAWER: CALIBRACIÓN PEDAGÓGICA Y DIFICULTAD ──────── */}
  {showConfigDrawer && typeof document !== 'undefined' && createPortal(
    <div className="fixed inset-0 z-50 overflow-hidden animate-fadeIn">
      {/* Backdrop */}
      <div
        onClick={() => !isGeneratingTargeted && setShowConfigDrawer(false)}
        className="fixed inset-0 bg-black/80 transition-opacity"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
        <div className="w-screen max-w-md bg-thea-surface border-l border-thea-border shadow-2xl flex flex-col justify-between">
          {/* Drawer Header */}
          <div className="p-6 border-b border-thea-border/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  Calibración Pedagógica
                </h3>
                <p className="text-xs text-slate-400">
                  Ajuste de nivel de exigencia y enfoque temático
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowConfigDrawer(false)}
              disabled={isGeneratingTargeted}
              className="w-8 h-8 rounded-xl bg-thea-surfaceLight border border-thea-border flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Content */}
          <div className="p-6 space-y-6 overflow-y-auto flex-1">
            {/* 1. Selector de Nivel */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Nivel de Dificultad Académica
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectDifficulty(1)}
                  disabled={isSwitchingDifficulty || isGeneratingTargeted}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer disabled:opacity-50 ${
                    targetLevel === 1
                      ? 'bg-emerald-950/50 border-emerald-500 text-white shadow-md ring-1 ring-emerald-500/40'
                      : 'bg-thea-surfaceLight border-thea-border text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] uppercase font-bold text-emerald-400">Nivel 1</span>
                    {isSwitchingDifficulty && targetLevel === 1 && (
                      <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                    )}
                  </div>
                  <span className="text-xs font-bold block">Fundamentos</span>
                  <span className="text-[10px] text-slate-400 block mt-1">Retención directa</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectDifficulty(2)}
                  disabled={isSwitchingDifficulty || isGeneratingTargeted}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer disabled:opacity-50 ${
                    targetLevel === 2
                      ? 'bg-blue-950/50 border-blue-500 text-white shadow-md ring-1 ring-blue-500/40'
                      : 'bg-thea-surfaceLight border-thea-border text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] uppercase font-bold text-blue-400">Nivel 2</span>
                    {isSwitchingDifficulty && targetLevel === 2 && (
                      <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                    )}
                  </div>
                  <span className="text-xs font-bold block">Aplicación</span>
                  <span className="text-[10px] text-slate-400 block mt-1">Casos y causas</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectDifficulty(3)}
                  disabled={isSwitchingDifficulty || isGeneratingTargeted}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative disabled:opacity-50 ${
                    targetLevel === 3
                      ? 'bg-purple-950/60 border-amber-400 text-white shadow-md ring-1 ring-amber-400/50'
                      : 'bg-thea-surfaceLight border-thea-border text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] uppercase font-bold text-amber-400">Nivel 3</span>
                    {isSwitchingDifficulty && targetLevel === 3 && (
                      <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                    )}
                  </div>
                  <span className="text-xs font-bold block">Máximo</span>
                  <span className="text-[10px] text-amber-300/80 block mt-1">Opciones Similares</span>
                </button>
              </div>
            </div>

            {/* 2. Cuadro de Texto de Tema Concreto */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Tema Concreto del Documento
                </label>
                <span className="text-[11px] text-slate-500">Opcional</span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={targetTopic}
                  onChange={e => setTargetTopic(e.target.value)}
                  placeholder="Ej: Mecanismo de acción, Diagnóstico diferencial, Artículos..."
                  className="w-full px-4 py-3 rounded-2xl bg-thea-surfaceLight border border-thea-border text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-500/80 transition-colors"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                Indica sobre qué sección, concepto o capítulo específico del archivo deseas enfocar las preguntas. Si lo dejas en blanco, se evaluará el contenido general de mayor relevancia.
              </p>
            </div>

            {/* 3. Interruptor de Preguntas Abiertas */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Preguntas Abiertas
                </label>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${
                  typeFilters.shortAnswer
                    ? 'text-violet-300 bg-violet-500/20 border-violet-500/40'
                    : 'text-slate-400 bg-slate-800/80 border-slate-700'
                }`}>
                  {typeFilters.shortAnswer ? 'Activadas' : 'Apagadas'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Smart Study incluye automáticamente opción múltiple, verdadero o falso y ejercicios prácticos. Activa este interruptor si deseas responder preguntas redactadas con tus propias palabras con evaluación semántica de IA.
              </p>

              <div className="bg-thea-surfaceLight/60 p-3.5 rounded-2xl border border-thea-border">
                <div className="flex items-center justify-between py-1">
                  <div className="pr-3">
                    <span className="text-xs font-bold text-white block">Preguntas Abiertas Cortas</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Escribe tu respuesta y la IA evalúa la similitud conceptual</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleTypeFilter('shortAnswer')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      typeFilters.shortAnswer ? 'bg-violet-600' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                        typeFilters.shortAnswer ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Acciones Rápidas de Sesión */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Acciones Rápidas de Sesión
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    hasUserInteractedRef.current = true;
                    const nextSeed = shuffleSeed + 1;
                    setShuffleSeed(nextSeed);
                    setCurrentIndex(0);
                    const q = resolveNextQuestion(activePracticeLevel, 0, false, [], currentQ.id);
                    setCurrentQuestion(q);
                    lastQId.current = q.id;
                    setSelectedOption(null);
                    setSelectedMultiIndices([]);
                    setActiveMatchingTerm(null);
                    setMatchingPairsMap({});
                    setMatchingChecked(false);
                    setPlacedChips([]);
                    setDragDropChecked(false);
                    setIsAnswered(false);
                    setIsCurrentCorrect(null);
                    setShortAnswerInput('');
                    persistSessionSnapshot({
                      currentIndex: 0,
                      currentQuestionId: q.id,
                      currentQuestion: q,
                      selectedOption: null,
                      selectedMultiIndices: [],
                      matchingPairsMap: {},
                      matchingChecked: false,
                      placedChips: [],
                      dragDropChecked: false,
                      isAnswered: false,
                      isCurrentCorrect: null,
                      shortAnswerInput: '',
                      levelCorrectCount: currentLevelCorrect,
                      levelCorrectCounts,
                      errorQueue,
                      isReinforcementMode,
                      history: history.slice(0, 50),
                      questionsAnsweredTotal,
                      totalErrorsReinforced,
                      shuffleSeed: nextSeed,
                    });
                    setShowConfigDrawer(false);
                  }}
                  className="p-3 rounded-2xl border border-thea-border bg-thea-surfaceLight text-slate-300 hover:text-white hover:border-violet-500/50 flex items-center justify-center gap-2 text-xs font-bold cursor-pointer transition-all active:scale-95"
                >
                  <Shuffle className="w-4 h-4 text-violet-400" />
                  <span>Barajar Preguntas</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleGenerateMoreQuestions();
                  }}
                  disabled={isGeneratingMore}
                  className="p-3 rounded-2xl border border-thea-border bg-thea-surfaceLight text-slate-300 hover:text-white hover:border-violet-500/50 flex items-center justify-center gap-2 text-xs font-bold cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                >
                  {isGeneratingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                      <span>Generando...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>+10 Preguntas ({levelLabels[level].title})</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowConfigDrawer(false);
                    setShowResetConfirmModal(true);
                  }}
                  className="col-span-2 p-3 rounded-2xl border border-rose-500/30 bg-rose-950/20 text-rose-300 hover:text-white hover:bg-rose-900/30 flex items-center justify-center gap-2 text-xs font-bold cursor-pointer transition-all active:scale-95"
                >
                  <RotateCcw className="w-4 h-4 text-rose-400" />
                  <span>Reiniciar Progreso de Estudio a Cero</span>
                </button>
              </div>
            </div>

            {/* Notificaciones y Errores */}
            {targetErrorNotice && (
              <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200 flex items-start gap-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">{targetErrorNotice}</p>
              </div>
            )}

            {targetSuccessNotice && (
              <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200 flex items-start gap-2 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed font-semibold">{targetSuccessNotice}</p>
              </div>
            )}
          </div>

          {/* Drawer Footer / CTA */}
          <div className="p-6 border-t border-thea-border/80 bg-thea-surfaceLight/30 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowConfigDrawer(false)}
              disabled={isGeneratingTargeted}
              className="px-4 py-2.5 rounded-xl border border-thea-border text-xs font-bold text-slate-400 hover:text-white hover:bg-thea-surfaceLight transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleGenerateTargetedQuestions}
              disabled={isGeneratingTargeted}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700/90 border border-slate-700 hover:border-slate-600 text-white font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer disabled:opacity-60 active:scale-[0.99]"
            >
              {isGeneratingTargeted ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                  <span>Generando Preguntas con IA...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Generar y Evaluar Ahora</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )}

  {/* ── MODAL DE CONFIRMACIÓN PARA REINICIAR PROGRESO DESDE LOS ROMBOS ── */}
  {showResetConfirmModal &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 animate-fadeIn select-none"
        onClick={(e) => {
          if (e.target === e.currentTarget) setShowResetConfirmModal(false);
        }}
      >
        <div className="relative w-full max-w-md bg-[#14040c] border border-rose-500/25 rounded-[28px] p-6 sm:p-7 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.05),inset_0_1px_0_rgba(255,255,255,0.12)] text-center overflow-hidden will-change-transform">
          {/* Resplandor ambiental de autor en el borde superior */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-20 bg-rose-500/10 blur-2xl pointer-events-none rounded-full" />

          {/* Botón de cierre minimalista */}
          <button
            type="button"
            onClick={() => setShowResetConfirmModal(false)}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] transition-colors cursor-pointer active:scale-95 z-10"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Emblema refinado de reinicio con anillo de micro-luz */}
          <div className="relative mx-auto mb-3.5 w-12 h-12 flex items-center justify-center">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-rose-500/20 to-amber-500/10 border border-rose-500/30 shadow-[0_0_20px_-2px_rgba(244,63,94,0.3)]" />
            <div className="relative w-9 h-9 rounded-xl bg-[#200512] border border-white/10 flex items-center justify-center text-rose-300 shadow-inner">
              <RotateCcw className="w-4.5 h-4.5" />
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-950/60 border border-rose-500/30 text-[10px] font-bold uppercase tracking-wider text-rose-300 mb-2">
            Restablecer Avance
          </span>

          <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug mb-3">
            ¿Deseas reiniciar tu progreso en este kit?
          </h3>

          {/* Tarjeta estructurada de impacto y telemetría */}
          <div className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-3.5 sm:p-4 mb-6 text-left space-y-2.5 shadow-inner">
            <div className="flex items-start gap-2.5 text-xs text-slate-300">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0 shadow-[0_0_6px_rgba(244,63,94,0.9)]" />
              <p className="leading-relaxed">
                El avance activo volverá a <span className="font-semibold text-white tabular-nums">Nivel 1 (0%)</span> y se reactivarán las preguntas del kit.
              </p>
            </div>
            <div className="flex items-start gap-2.5 text-xs text-slate-300 pt-2 border-t border-white/[0.04]">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
              <p className="leading-relaxed">
                <span className="font-semibold text-emerald-300">Historial protegido:</span> Tus respuestas contestadas se conservarán intactas para tu revisión.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowResetConfirmModal(false)}
              className="flex-1 py-2.5 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.02] border border-white/10 text-slate-300 hover:text-white font-medium text-xs sm:text-sm transition-transform duration-140 active:scale-[0.98] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleResetProgress}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 via-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-semibold text-xs sm:text-sm shadow-[0_4px_16px_rgba(225,29,72,0.35),inset_0_1px_0_rgba(255,255,255,0.22)] transition-transform duration-140 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>Sí, reiniciar de 0</span>
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
</div>
  );
};

