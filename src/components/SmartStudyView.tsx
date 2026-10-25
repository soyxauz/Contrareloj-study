import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { StudyKit, Question, StudyMode, DocumentAsset, ShortAnswerEvaluation, SmartStudyTypeFilters } from '../types';
import { authService } from '../services/authService';
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  Sparkles,
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
import confetti from 'canvas-confetti';
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
  ImageLabelingRenderer,
  TrueFalseRenderer,
  ShortAnswerRenderer,
} from './smart-study';
import { synthesizeAzureEdgeSpeech } from '../services/azureEdgeTtsService';

// ── 4-Pointed Sparkle Star for Level Indicators (Nivel 1, 2, 3) ────────────
const SparkleStar: React.FC<{ active: boolean; levelNum: number; onClick?: () => void }> = ({
  active,
  levelNum,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    title={`Nivel ${levelNum}: ${levelNum === 1 ? 'Fundamentos' : levelNum === 2 ? 'Aplicación' : 'Dominio'} • Clic para reiniciar progreso`}
    className={`p-0.5 transition-all transform hover:scale-115 cursor-pointer ${
      active
        ? 'text-[#c0a6df] drop-shadow-[0_0_8px_rgba(192,166,223,0.5)]'
        : 'text-[#35255c] hover:text-[#523d85]'
    }`}
  >
    <svg
      className="w-5 h-5 sm:w-6 sm:h-6"
      viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={active ? '1' : '1.5'}
    >
      <path d="M12 2C12 7.5 7.5 12 2 12C7.5 12 12 16.5 12 22C12 16.5 16.5 12 22 12C16.5 12 12 7.5 12 2Z" />
    </svg>
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

export const SmartStudyView: React.FC<SmartStudyViewProps> = ({ kit, userId, onUpdateKit, onNavigate }) => {
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
  const [history, setHistory] = useState<StudyHistoryItem[]>(() => (savedSession?.history || []).slice(0, 25));
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
  const [selectedMultiIndices, setSelectedMultiIndices] = useState<number[]>(wasPreviouslyAnswered ? [] : (savedSession?.selectedMultiIndices || []));
  const [activeMatchingTerm, setActiveMatchingTerm] = useState<string | null>(null);
  const [matchingPairsMap, setMatchingPairsMap] = useState<Record<string, string>>(wasPreviouslyAnswered ? {} : (savedSession?.matchingPairsMap || {}));
  const [matchingChecked, setMatchingChecked] = useState(wasPreviouslyAnswered ? false : (savedSession?.matchingChecked || false));
  const [placedChips, setPlacedChips] = useState<(string | null)[]>(wasPreviouslyAnswered ? [] : (savedSession?.placedChips || []));
  const [draggedChip, setDraggedChip] = useState<string | null>(null);
  const [dragDropChecked, setDragDropChecked] = useState(wasPreviouslyAnswered ? false : (savedSession?.dragDropChecked || false));
  const [placedImageLabels, setPlacedImageLabels] = useState<Record<string, string>>(wasPreviouslyAnswered ? {} : ((savedSession as any)?.placedImageLabels || {}));
  const [activeLabelChip, setActiveLabelChip] = useState<string | null>(null);
  const [imageLabelChecked, setImageLabelChecked] = useState(wasPreviouslyAnswered ? false : ((savedSession as any)?.imageLabelChecked || false));

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
        localStorage.setItem(`thea_study_type_filters_${kit.id}`, JSON.stringify(next));
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
  const answeredQuestionIdsRef = useRef<Set<string>>(
    new Set(savedSession?.history?.map((h: any) => h.questionId) || [])
  );
  const completedSocraticIdsRef = useRef<Set<string>>(new Set());
  const seenQuestionIdsRef = useRef<Set<string>>(
    new Set([
      ...((savedSession as any)?.seenQuestionIds || []),
      ...(savedSession?.currentQuestionId ? [savedSession.currentQuestionId] : [])
    ])
  );

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
    const allInDiff = kit.questions.filter(q => (q.difficulty || 'easy') === targetDiff);

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
          setPlacedImageLabels({});
          setActiveLabelChip(null);
          setImageLabelChecked(false);
          setShortAnswerInput('');
          setShortAnswerEvalResult(null);
          setIsManuallyOverridden(false);
          setIsAnswered(false);
          setIsCurrentCorrect(null);
          setFeedbackGiven(null);
          setCurrentIndex(0);

          // Guardar síncronamente en memoria de sesión
          authService.saveSmartStudySession(userId || null, kit.id, {
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
            activeTab,
            history: history.slice(0, 25),
            historyFilter,
            historyLevelFilter,
            questionsAnsweredTotal,
            totalErrorsReinforced,
            socraticProfile,
            revealedQuestionIds,
            seenQuestionIds: Array.from(seenQuestionIdsRef.current).slice(-100),
            lastUpdated: Date.now(),
            shuffleSeed: 1,
          } as any);

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
      setPlacedImageLabels({});
      setActiveLabelChip(null);
      setImageLabelChecked(false);
      setShortAnswerInput('');
      setShortAnswerEvalResult(null);
      setIsManuallyOverridden(false);
      setIsAnswered(false);
      setIsCurrentCorrect(null);
      setFeedbackGiven(null);
      setCurrentIndex(0);

      // Guardar síncronamente en memoria de sesión
      authService.saveSmartStudySession(userId || null, kit.id, {
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
        activeTab,
        history: history.slice(0, 25),
        historyFilter,
        historyLevelFilter,
        questionsAnsweredTotal,
        totalErrorsReinforced,
        socraticProfile,
        revealedQuestionIds,
        seenQuestionIds: Array.from(seenQuestionIdsRef.current).slice(-100),
        lastUpdated: Date.now(),
        shuffleSeed: 1,
      } as any);

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
        authService.saveSmartStudySession(userId || null, kit.id, {
          currentIndex: 0,
          level,
          activePracticeLevel: targetLevel,
          currentQuestionId: generated[0].id,
          currentQuestion: generated[0],
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
          activeTab,
          history: history.slice(0, 25),
          historyFilter,
          historyLevelFilter,
          questionsAnsweredTotal,
          totalErrorsReinforced,
          socraticProfile,
          revealedQuestionIds,
          lastUpdated: Date.now(),
          shuffleSeed: 1,
        } as any);

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
    if (t === 'matching' || t === 'drag-drop' || t === 'image-labeling') return 'practical';
    return 'multipleChoice';
  }, []);

  const adaptQuestionToCategory = useCallback((baseQ: Question, targetCat: keyof SmartStudyTypeFilters): Question => {
    if (!baseQ) return baseQ;
    if (getCategoryForQuestion(baseQ) === targetCat) return baseQ;

    if (targetCat === 'shortAnswer') {
      const correctOpt = baseQ.options && baseQ.correctIndex !== undefined
        ? baseQ.options[baseQ.correctIndex]
        : undefined;
      return {
        ...baseQ,
        id: baseQ.id.startsWith('sa-') ? baseQ.id : `sa-${baseQ.id}`,
        type: 'short-answer',
        idealAnswer: baseQ.idealAnswer || correctOpt || baseQ.explanation,
        keyPoints: baseQ.keyPoints || (correctOpt ? correctOpt.split(' ').filter(w => w.length > 4) : undefined),
        rubric: baseQ.rubric || 'Respuesta concisa que sintetice con exactitud el concepto evaluado.',
        acceptableAnswers: baseQ.acceptableAnswers || (correctOpt ? [correctOpt] : undefined),
      };
    }

    if (targetCat === 'trueFalse') {
      return {
        ...baseQ,
        id: baseQ.id.startsWith('tf-') ? baseQ.id : `tf-${baseQ.id}`,
        type: 'true-false',
        options: ['Verdadero', 'Falso'],
        correctIndex: 0,
      };
    }

    if (targetCat === 'multipleChoice') {
      return {
        ...baseQ,
        id: baseQ.id.startsWith('mc-') ? baseQ.id : `mc-${baseQ.id}`,
        type: 'multiple-choice',
        options: baseQ.options && baseQ.options.length >= 2
          ? baseQ.options
          : ['Opción A fundamentada', 'Opción B plausible', 'Opción C alternativa', 'Opción D alternativa'],
        correctIndex: baseQ.correctIndex ?? 0,
      };
    }

    return baseQ;
  }, [getCategoryForQuestion]);

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
          !answeredQuestionIdsRef.current.has(candidate.id) &&
          getCategoryForQuestion(candidate) === targetCat &&
          isFalseConceptQuestion(candidate)
        ) {
          return candidate;
        }
      }
    }

    // Prioridad 1: Buscar una pregunta no respondida de este nivel que coincida con el tipo deseado
    // Si NO se pidió concepto falso, priorizar una que NO sea de concepto falso para mantener variedad afirmativa
    for (const i of shuffledIndices) {
      const candidate = pool[i];
      if (
        candidate.id !== excludeQuestionId &&
        !answeredQuestionIdsRef.current.has(candidate.id) &&
        getCategoryForQuestion(candidate) === targetCat &&
        (!shouldPreferFalseConcept ? !isFalseConceptQuestion(candidate) : true)
      ) {
        return candidate;
      }
    }

    // Prioridad 1b: Si no había afirmativa de ese tipo, aceptar cualquier pregunta no respondida del tipo deseado
    for (const i of shuffledIndices) {
      const candidate = pool[i];
      if (
        candidate.id !== excludeQuestionId &&
        !answeredQuestionIdsRef.current.has(candidate.id) &&
        getCategoryForQuestion(candidate) === targetCat
      ) {
        return candidate;
      }
    }

    // Prioridad 2: Buscar cualquier no respondida del nivel y adaptarla al formato seleccionado
    for (const i of shuffledIndices) {
      const candidate = pool[i];
      if (candidate.id !== excludeQuestionId && !answeredQuestionIdsRef.current.has(candidate.id)) {
        return adaptQuestionToCategory(candidate, targetCat);
      }
    }

    // Prioridad 3: Si ya se respondieron todas las del nivel, elegir al azar una del pool y adaptarla
    for (const i of shuffledIndices) {
      const candidate = pool[i];
      if (candidate.id !== excludeQuestionId) {
        return adaptQuestionToCategory(candidate, targetCat);
      }
    }

    // Prioridad 4: En kit general
    const randomKitQ = kit.questions[Math.floor(Math.random() * kit.questions.length)] || kit.questions[0];
    return adaptQuestionToCategory(randomKitQ, targetCat);
  }, [kit.questions, socraticProfile, typeFilters, getCategoryForQuestion, adaptQuestionToCategory, isFalseConceptQuestion]);

  // Pregunta activa fijada en estado: NUNCA cambia por efectos secundarios en segundo plano
  const [currentQuestion, setCurrentQuestion] = useState<Question>(() => {
    if (savedSession?.errorQueue && savedSession.errorQueue.length > 0 && savedSession.isReinforcementMode) {
      return savedSession.errorQueue[0];
    }

    const wasAnswered = Boolean(savedSession?.isAnswered);

    // Caso 1: La pregunta NO estaba respondida previamente.
    // Preservar exactamente la misma pregunta para que el usuario pueda continuar respondiendo justo donde se quedó.
    if (!wasAnswered) {
      if (savedSession?.currentQuestion && savedSession.currentQuestion.id) {
        return savedSession.currentQuestion;
      }
      if (savedSession?.currentQuestionId && kit.questions && kit.questions.length > 0) {
        let found = kit.questions.find(q => q.id === savedSession.currentQuestionId);
        if (!found) {
          const rawId = savedSession.currentQuestionId.replace(/^(tf-|sa-|mc-)/, '');
          found = kit.questions.find(q => q.id === rawId);
          if (found) {
            const prefix = savedSession.currentQuestionId.startsWith('tf-')
              ? 'trueFalse'
              : savedSession.currentQuestionId.startsWith('sa-')
              ? 'shortAnswer'
              : savedSession.currentQuestionId.startsWith('mc-')
              ? 'multipleChoice'
              : null;
            if (prefix) {
              return adaptQuestionToCategory(found, prefix as any);
            }
          }
        }
        if (found) {
          return found;
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
    const prevQId = savedSession?.currentQuestion?.id || savedSession?.currentQuestionId;

    // Caso 2: Si ya estaba respondida y conocemos la pregunta previa, avanzar automáticamente a la siguiente pregunta del nivel
    if (wasAnswered && prevQId) {
      const nextQ = resolveNextQuestion(
        practiceLevel,
        (savedSession?.currentIndex || 0) + 1,
        false,
        [],
        prevQId
      );
      if (nextQ) {
        return nextQ;
      }
    }

    const targetDiff = practiceLevel === 1 ? 'easy' : practiceLevel === 2 ? 'medium' : 'hard';
    const pool = kit.questions.filter(q => (q.difficulty || 'easy') === targetDiff);
    const finalPool = pool.length > 0 ? pool : kit.questions;
    const activeCategories: (keyof SmartStudyTypeFilters)[] = (
      ['multipleChoice', 'shortAnswer', 'trueFalse', 'practical'] as (keyof SmartStudyTypeFilters)[]
    ).filter(cat => typeFilters[cat]);
    const safeActiveCategories = activeCategories.length > 0 ? activeCategories : (['multipleChoice'] as (keyof SmartStudyTypeFilters)[]);

    // Aleatorio puro desde el primer segundo: barajar todo el banco y tipos sin restricciones
    const randomCat = safeActiveCategories[Math.floor(Math.random() * safeActiveCategories.length)];
    const randomIdx = Math.floor(Math.random() * finalPool.length);
    const raw = finalPool[randomIdx] || kit.questions[0];
    return adaptQuestionToCategory(raw, randomCat) || raw || kit.questions[0];
  });

  // Hidratar pregunta activa si el kit llega asíncronamente con preguntas completas
  useEffect(() => {
    if (kit.questions && kit.questions.length > 0) {
      if (!currentQuestion || currentQuestion.id === 'thea-placeholder-loading') {
        if (savedSession?.currentQuestion && savedSession.currentQuestion.id) {
          setCurrentQuestion(savedSession.currentQuestion);
          return;
        }
        if (savedSession?.currentQuestionId) {
          let found = kit.questions.find(q => q.id === savedSession.currentQuestionId);
          if (!found) {
            const rawId = savedSession.currentQuestionId.replace(/^(tf-|sa-|mc-)/, '');
            found = kit.questions.find(q => q.id === rawId);
          }
          if (found) {
            setCurrentQuestion(found);
            return;
          }
        }
        const practiceLevel = activePracticeLevel || level || 1;
        const targetDiff = practiceLevel === 1 ? 'easy' : practiceLevel === 2 ? 'medium' : 'hard';
        const pool = kit.questions.filter(q => (q.difficulty || 'easy') === targetDiff);
        const finalPool = pool.length > 0 ? pool : kit.questions;
        const first = finalPool[0] || kit.questions[0];
        if (first) {
          setCurrentQuestion(first);
        }
      }
    }
  }, [kit.questions, currentQuestion?.id, activePracticeLevel, level]);

  const currentQ: Question = currentQuestion;

  // Regla estricta para adjuntar imágenes a las preguntas individuales
  const isImageStrictlyNecessary = (q: Question): boolean => {
    if (!q || !q.sourceAsset || !q.sourceAsset.dataUrl) return false;
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
    return baseType;
  }, [currentQ?.type, effectiveTemplateSentence, effectiveBlanksCorrect]);

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

  // Guard against initial mount wiping restored question state
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
    setPlacedImageLabels({});
    setActiveLabelChip(null);
    setImageLabelChecked(false);
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

  // Referencia actualizada al último estado de sesión para persistencia garantizada al desmontar la vista
  const latestSessionRef = useRef<any>(null);
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
    history: history.slice(0, 25),
    historyFilter,
    historyLevelFilter,
    questionsAnsweredTotal,
    totalErrorsReinforced,
    socraticProfile,
    revealedQuestionIds,
    seenQuestionIds: Array.from(seenQuestionIdsRef.current).slice(-100),
    lastUpdated: Date.now(),
    shuffleSeed,
  };

  // Guardado garantizado al salir o desmontar de Smart Study a otra sección
  useEffect(() => {
    return () => {
      if (latestSessionRef.current && kit?.id) {
        authService.saveSmartStudySession(userId || null, kit.id, latestSessionRef.current);
      }
    };
  }, [userId, kit?.id]);

  // ── Auto-Save Session Memory (Guarda el instante exacto por kit y usuario) ──
  useEffect(() => {
    authService.saveSmartStudySession(userId || null, kit.id, {
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
      history: history.slice(0, 25),
      historyFilter,
      historyLevelFilter,
      questionsAnsweredTotal,
      totalErrorsReinforced,
      socraticProfile,
      revealedQuestionIds,
      seenQuestionIds: Array.from(seenQuestionIdsRef.current).slice(-100),
      lastUpdated: Date.now(),
      shuffleSeed,
    } as any);
  }, [
    userId,
    kit.id,
    currentIndex,
    level,
    activePracticeLevel,
    currentQ?.id,
    currentQ,
    shortAnswerInput,
    currentLevelCorrect,
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
    history,
    historyFilter,
    historyLevelFilter,
    questionsAnsweredTotal,
    totalErrorsReinforced,
    socraticProfile,
    revealedQuestionIds,
    shuffleSeed,
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

  // Historial filtrado para visualización
  const filteredHistory = useMemo(() => {
    return history.filter(item => {
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
  }, [history, historyFilter, historyLevelFilter]);

  // ── Evaluation Helpers ───────────────────────────────────────────────────

  const markQuestionResult = (
    correct: boolean,
    userAnswerText: string,
    correctAnswerText: string
  ) => {
    setIsAnswered(true);
    setIsCurrentCorrect(correct);
    setQuestionsAnsweredTotal(prev => prev + 1);

    // Guardar en el Historial de Preguntas
    const historyItem: StudyHistoryItem = {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      questionId: currentQ.id,
      questionText: currentQ.question,
      topic: currentQ.topic || 'Conceptos Clave',
      difficulty: currentQ.difficulty || 'easy',
      type: qType,
      userAnswer: userAnswerText,
      correctAnswer: correctAnswerText,
      isCorrect: correct,
      explanation: currentQ.explanation || 'Respuesta fundamentada en el material de estudio analizado.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      level,
    };
    setHistory(prev => [historyItem, ...prev].slice(0, 25));

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

    if (isReinforcementMode) {
      // En modo refuerzo: registrar estadística de refuerzo sin modificar errorQueue aquí.
      // errorQueue solo avanza en handleNext cuando el estudiante pulsa 'Siguiente pregunta'.
      if (correct) {
        setTotalErrorsReinforced(prev => prev + 1);
      }
    } else {
      // En modo normal:
      if (correct) {
        // Los errores nunca disminuyen la barra de progreso; sólo las respuestas correctas suman +1
        // Si la pregunta fue revelada previamente en el Banco de Preguntas, NO suma porcentaje de avance
        if (!isCurrentQRevealed) {
          const prevCount = levelCorrectCounts[level] ?? levelCorrectCount ?? 0;
          const newCount = Math.min(levelTarget, prevCount + 1);
          setLevelCorrectCounts(prev => ({
            ...prev,
            [level]: newCount,
          }));
          setLevelCorrectCount(newCount);

          // Si alcanzó la meta de 25 aciertos (100%) con este acierto
          if (newCount >= levelTarget) {
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 }
            });
          }
        }
      } else {
        // Encolar pregunta fallada para la ronda de refuerzo obligatoria
        setErrorQueue(prev => {
          if (prev.some(q => q.id === currentQ.id)) return prev;
          return [...prev, currentQ];
        });
      }
    }
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
    setHistory(prev =>
      prev.map(item =>
        item.questionId === currentQ.id ? { ...item, isCorrect: true } : item
      )
    );

    // Remover de la cola de fallos de refuerzo
    setErrorQueue(prev => prev.filter(q => q.id !== currentQ.id));

    // Si no está en refuerzo y no estaba revelada, sumar avance
    if (!isReinforcementMode && !isCurrentQRevealed) {
      const prevCount = levelCorrectCounts[level] ?? levelCorrectCount ?? 0;
      const newCount = Math.min(levelTarget, prevCount + 1);
      setLevelCorrectCounts(prev => ({
        ...prev,
        [level]: newCount,
      }));
      setLevelCorrectCount(newCount);

      if (newCount >= levelTarget) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
      }
    } else if (isReinforcementMode) {
      setTotalErrorsReinforced(prev => prev + 1);
    }
  };

  // 1. Multiple Choice & True/False Selection
  const handleSelectSingleOption = (index: number) => {
    if (isAnswered) return;
    setSelectedOption(index);
    const correct = index === safeCorrectIndex;

    const userAns = safeOptions[index] || `Opción ${index + 1}`;
    const correctAns = safeOptions[safeCorrectIndex] || 'Opción correcta';

    markQuestionResult(correct, userAns, correctAns);
  };

  // 2. Multi-Select Toggle & Submit
  const handleToggleMultiIndex = (index: number) => {
    if (isAnswered) return;
    setSelectedMultiIndices(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const handleCheckMultiSelect = () => {
    if (isAnswered || selectedMultiIndices.length === 0) return;
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
    if (matchingPairsMap[term]) {
      // Already paired: unpair
      const newMap = { ...matchingPairsMap };
      delete newMap[term];
      setMatchingPairsMap(newMap);
      setActiveMatchingTerm(null);
      return;
    }
    setActiveMatchingTerm(term);
  };

  const handleDefClick = (def: string) => {
    if (isAnswered || !activeMatchingTerm) return;
    // Check if definition is already paired to another term
    const newMap = { ...matchingPairsMap };
    for (const [t, d] of Object.entries(newMap)) {
      if (d === def) delete newMap[t];
    }
    newMap[activeMatchingTerm] = def;
    setMatchingPairsMap(newMap);
    setActiveMatchingTerm(null);
  };

  const handleCheckMatching = () => {
    if (isAnswered || !currentQ.matchingPairs) return;
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
    const newPlaced = [...placedChips];
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
  };

  const handleRemovePlacedChip = (slotIdx: number) => {
    if (isAnswered) return;
    const newPlaced = [...placedChips];
    newPlaced[slotIdx] = null;
    setPlacedChips(newPlaced);
  };

  const handleCheckDragDrop = () => {
    if (isAnswered || effectiveBlanksCorrect.length === 0) return;
    setDragDropChecked(true);
    const correctBlanks = effectiveBlanksCorrect;
    const allCorrect = placedChips.every((chip, idx) => {
      if (!chip) return false;
      return chip.trim().toLowerCase() === correctBlanks[idx]?.trim().toLowerCase();
    });

    const userAns = placedChips
      .map((chip, idx) => `[${idx + 1}] ${chip || '___'}`)
      .join(' , ');

    const correctAns = correctBlanks
      .map((blank, idx) => `[${idx + 1}] ${blank}`)
      .join(' , ');

    markQuestionResult(allCorrect, userAns, correctAns);
  };

  // 5. Image & Diagram Hotspot Labeling Handlers
  const handlePlaceImageLabel = (hotspotId: string, label: string) => {
    if (isAnswered) return;
    setPlacedImageLabels(prev => ({ ...prev, [hotspotId]: label }));
    setActiveLabelChip(null);
  };

  const handleRemoveImageLabel = (hotspotId: string) => {
    if (isAnswered) return;
    setPlacedImageLabels(prev => {
      const copy = { ...prev };
      delete copy[hotspotId];
      return copy;
    });
  };

  const handleCheckImageLabel = () => {
    if (isAnswered || !currentQ.imageHotspots) return;
    setImageLabelChecked(true);
    const hotspots = currentQ.imageHotspots;
    const allCorrect = hotspots.every(
      h => placedImageLabels[h.id]?.trim().toLowerCase() === h.label.trim().toLowerCase()
    );

    const userAns = hotspots.map(h => `${h.hint || h.id}: ${placedImageLabels[h.id] || '(vacío)'}`).join(' • ');
    const correctAns = hotspots.map(h => `${h.hint || h.id}: ${h.label}`).join(' • ');

    if (allCorrect) {
      confetti({ particleCount: 75, spread: 60, origin: { y: 0.6 } });
    }
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
      correctAns = effectiveBlanksCorrect.map((b, idx) => `[${idx + 1}] ${b}`).join(' , ');
      setPlacedChips([...effectiveBlanksCorrect]);
      setDragDropChecked(true);
    } else if (qType === 'image-labeling' && currentQ.imageHotspots) {
      correctAns = currentQ.imageHotspots.map(h => `${h.id}: ${h.label}`).join(' | ');
      const solution: Record<string, string> = {};
      currentQ.imageHotspots.forEach(h => { solution[h.id] = h.label; });
      setPlacedImageLabels(solution);
      setImageLabelChecked(true);
    } else {
      correctAns = safeOptions[safeCorrectIndex] || 'Opción señalada en verde';
    }

    markQuestionResult(false, 'Pregunta saltada', correctAns);
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

    // Registrar ID en el conjunto de preguntas respondidas
    answeredQuestionIdsRef.current.add(currentQ.id);

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
          setErrorQueue(remainingQueue);
          if (remainingQueue.length === 0) {
            setIsReinforcementMode(false);
            const nextIdx = currentIndex + 1;
            setCurrentIndex(nextIdx);
            nextQ = resolveNextQuestion(activePracticeLevel, nextIdx, false, [], currentQ.id);
            checkAndPrefetchQuestions(activePracticeLevel, nextIdx);
          } else {
            nextQ = remainingQueue[0];
          }
        } else {
          // Si falló en refuerzo, rotar la pregunta al final de la cola para volver a intentarla
          const rotated = [...errorQueue.slice(1), errorQueue[0]];
          setErrorQueue(rotated);
          nextQ = rotated[0];
        }
      } else {
        // Avance normal a la siguiente pregunta del nivel actual
        const nextIdx = currentIndex + 1;
        setCurrentIndex(nextIdx);
        nextQ = resolveNextQuestion(activePracticeLevel, nextIdx, false, [], currentQ.id);
        checkAndPrefetchQuestions(activePracticeLevel, nextIdx);
      }

    // Salvaguarda final: NUNCA permitir que nextQ sea la misma pregunta actual si el kit tiene más preguntas
    if (nextQ && nextQ.id === currentQ.id && kit.questions.length > 1) {
      const alt = kit.questions.find(q => q.id !== currentQ.id && !answeredQuestionIdsRef.current.has(q.id))
        || kit.questions.find(q => q.id !== currentQ.id);
      if (alt) {
        nextQ = alt;
      }
    }

    // Actualizar de forma explícita y controlada la pregunta mostrada
    if (nextQ) {
      setCurrentQuestion(nextQ);
      lastQId.current = nextQ.id;
      authService.saveSmartStudySession(userId || null, kit.id, {
        ...savedSession,
        currentIndex: currentIndex + 1,
        level,
        activePracticeLevel,
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
        lastUpdated: Date.now(),
      } as any);
    }

    // 3. Limpieza DIRECTA e INCONDICIONAL de todos los estados para que NUNCA quede bloqueada
    setSelectedOption(null);
    setSelectedMultiIndices([]);
    setActiveMatchingTerm(null);
    setMatchingPairsMap({});
    setMatchingChecked(false);
    setDragDropChecked(false);
    const nextBlanksCount = (nextQ?.blanksCorrect && nextQ.blanksCorrect.length > 0)
      ? nextQ.blanksCorrect.length
      : (nextQ?.templateSentence?.match(/\{\d+\}/g)?.length || nextQ?.question?.match(/\{\d+\}/g)?.length || 0);
    setPlacedChips(nextBlanksCount > 0 ? new Array(nextBlanksCount).fill(null) : []);
    setPlacedImageLabels({});
    setActiveLabelChip(null);
    setImageLabelChecked(false);
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
    setPlacedImageLabels({});
    setActiveLabelChip(null);
    setImageLabelChecked(false);
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

    // Actualizar almacenamiento manteniendo las respuestas previas en Historial
    const currentSession = authService.getSmartStudySession(userId || null, kit.id);
    if (currentSession) {
      authService.saveSmartStudySession(userId || null, kit.id, {
        ...currentSession,
        level: 1,
        activePracticeLevel: 1,
        currentQuestionId: firstQ?.id,
        currentQuestion: firstQ,
        levelCorrectCount: 0,
        levelCorrectCounts: { 1: 0, 2: 0, 3: 0 },
        currentIndex: 0,
        errorQueue: [],
        isReinforcementMode: false,
        isAnswered: false,
        isCurrentCorrect: null,
      });
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
      setCurrentQuestion(nextQ);
      lastQId.current = nextQ.id;
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
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-violet-600 hover:from-amber-400 hover:to-violet-500 text-slate-950 font-extrabold text-base shadow-xl shadow-amber-900/30 transition-all transform hover:-translate-y-0.5 cursor-pointer"
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
              className="px-8 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold transition-all cursor-pointer shadow-md"
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
          <div className="flex items-center justify-between pb-4 border-b border-[#261c47] flex-wrap gap-3">
            <button
              onClick={() => setActiveTab('practice')}
              className="px-5 py-2.5 rounded-full bg-[#d5c7ee] hover:bg-[#e4d8fb] text-[#1b113b] font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver a la Pregunta</span>
            </button>
            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-violet-400" />
              <span>Historial de Preguntas</span>
            </h3>
          </div>
          {/* Métricas del Historial */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30">
              <span className="text-xs text-emerald-400 block mb-1 font-medium">Aciertos</span>
              <span className="text-2xl font-black text-emerald-400">
                {history.filter(h => h.isCorrect).length}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/30">
              <span className="text-xs text-rose-400 block mb-1 font-medium">Fallos / A Reforzar</span>
              <span className="text-2xl font-black text-rose-400">
                {history.filter(h => !h.isCorrect).length}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30">
              <span className="text-xs text-amber-400 block mb-1 font-medium">Tasa de Acierto</span>
              <span className="text-2xl font-black text-amber-400">
                {history.length > 0
                  ? Math.round((history.filter(h => h.isCorrect).length / history.length) * 100)
                  : 0}%
              </span>
            </div>
          </div>

          {/* Filtros de Historial */}
          <div className="p-4 rounded-2xl bg-thea-surface border border-thea-border flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 mr-1">
                <Filter className="w-3.5 h-3.5" />
                Filtrar:
              </span>
              <button
                onClick={() => setHistoryFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  historyFilter === 'all'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-thea-surfaceLight text-slate-400 hover:text-white'
                }`}
              >
                Todas
              </button>
              <button
                onClick={() => setHistoryFilter('correct')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  historyFilter === 'correct'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-thea-surfaceLight text-slate-400 hover:text-white'
                }`}
              >
                Aciertos
              </button>
              <button
                onClick={() => setHistoryFilter('incorrect')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
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
                      <span className="text-xs font-bold text-white">
                        Pregunta #{idx + 1}
                      </span>
                      <span className="text-xs text-slate-500">• {item.timestamp}</span>
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
                  <div className="text-base mb-4 leading-relaxed">
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
                  {expandedHistoryQuestions.has(item.questionId) && (
                    <div className="p-4 rounded-2xl bg-thea-surfaceLight/60 border border-thea-border/80 text-xs sm:text-sm text-slate-300 animate-fadeIn space-y-2 mt-2">
                      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                        <span className="font-bold text-amber-400 flex items-center gap-1.5 text-xs">
                          <Lightbulb className="w-3.5 h-3.5" />
                          Explicación Conceptual:
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              const matchedQ = kit.questions.find(q => q.id === item.questionId);
                              setModalChunk({
                                id: matchedQ?.sourceChunkId,
                                text: matchedQ?.sourceChunkText || kit.chunks?.find(c => c.id === matchedQ?.sourceChunkId)?.text || item.explanation,
                                pageOrSlide: matchedQ?.sourcePageOrSlide,
                                asset: matchedQ?.sourceAsset,
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
                            onClick={() => handleReadAloud(item.explanation)}
                            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-thea-surfaceLight transition-colors"
                            title="Escuchar explicación"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {(() => {
                        const matchedQ = kit.questions.find(q => q.id === item.questionId);
                        if (!matchedQ) return null;
                        return (
                          <div className="my-2">
                            <TheaExplanationView
                              question={matchedQ}
                              kitAssets={kit.assets || []}
                              onZoomImage={(asset) => setZoomAsset(asset)}
                            />
                          </div>
                        );
                      })()}
                      <div className="leading-relaxed text-slate-300">
                        <FormattedText text={item.explanation.replace(/### Búsqueda en Google:[\s\S]*?(?=\*\*Fundamentación|\n\n[A-Z]|\n\n$|$)/i, '').trim() || item.explanation} />
                      </div>
                    </div>
                  )}
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
            <div className="flex-1 max-w-xl h-7 sm:h-8 rounded-full bg-[#20183d] border border-[#2d2156] p-1 flex items-center relative overflow-hidden">
              <div
                className="h-full rounded-full bg-[#700065] transition-all duration-500 shadow-sm"
                style={{ width: `${Math.max(6, Math.min(100, Math.round((currentLevelCorrect / levelTarget) * 100)))}%` }}
              />
              <span className="absolute left-4 text-xs font-bold text-white tracking-wide select-none drop-shadow-sm">
                Nivel {level}: {Math.min(100, Math.round((currentLevelCorrect / levelTarget) * 100))}%
              </span>
            </div>

            {/* Right: 3 Sparkle Stars + Settings Gear */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <div className="flex items-center gap-1 sm:gap-1.5">
                <SparkleStar active={level >= 1} levelNum={1} onClick={() => setShowResetConfirmModal(true)} />
                <SparkleStar active={level >= 2} levelNum={2} onClick={() => setShowResetConfirmModal(true)} />
                <SparkleStar active={level >= 3} levelNum={3} onClick={() => setShowResetConfirmModal(true)} />
              </div>

              <button
                type="button"
                onClick={() => setShowConfigDrawer(true)}
                title="Calibrar Dificultad y Enfoque Temático"
                className="p-1 text-slate-300 hover:text-white transition-all transform hover:rotate-45 cursor-pointer ml-1"
              >
                <Settings className="w-5 h-5 sm:w-6 sm:h-6 text-slate-200" />
              </button>
            </div>
          </div>

          {/* Divider Line */}
          <div className="w-full h-px bg-[#261c47] my-6 sm:my-8" />

          {/* Notificación de Nivel Completado / Subida de Nivel */}
          {levelUpBanner && (
            <div className="mb-4 p-3.5 rounded-2xl bg-gradient-to-r from-violet-900/90 to-purple-900/90 border border-violet-500/50 text-xs sm:text-sm text-violet-100 flex items-center justify-between shadow-xl animate-fadeIn">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
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
            <div className="p-10 sm:p-16 rounded-3xl bg-[#181138]/90 border border-amber-500/40 flex flex-col items-center justify-center text-center animate-fadeIn my-4 shadow-2xl">
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
            <div className="mb-6 p-4 rounded-2xl bg-[#181138]/80 border border-violet-500/30 overflow-hidden">
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
              {currentQ.sourceAsset.dataUrl && (
                <div
                  onClick={() => setZoomAsset(currentQ.sourceAsset || null)}
                  className="rounded-xl overflow-hidden bg-white border border-slate-200 flex items-center justify-center p-2 mb-2 max-h-72 cursor-pointer hover:border-violet-500/60 transition-colors group relative"
                  title="Clic para ampliar y hacer zoom interactivo"
                >
                  <img
                    src={currentQ.sourceAsset.dataUrl}
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
            className="text-xl sm:text-2xl mb-6 sm:mb-8 leading-snug"
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


        {/* 5. IMAGE & DIAGRAM LABELING RENDERER */}
        {qType === 'image-labeling' && (
          <ImageLabelingRenderer
            diagramTitle={currentQ.diagramTitle}
            imageUrl={currentQ.sourceAsset?.dataUrl || kit.assets?.[0]?.dataUrl}
            topic={currentQ.topic}
            explanation={currentQ.explanation}
            imageHotspots={currentQ.imageHotspots}
            imageWordBank={currentQ.imageWordBank}
            placedImageLabels={placedImageLabels}
            imageLabelChecked={imageLabelChecked}
            activeLabelChip={activeLabelChip}
            isAnswered={isAnswered}
            onPlaceImageLabel={handlePlaceImageLabel}
            onRemoveImageLabel={handleRemoveImageLabel}
            onSetActiveLabelChip={setActiveLabelChip}
            onCheckImageLabel={handleCheckImageLabel}
          />
        )}

        {/* 6. TRUE / FALSE RENDERER */}
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
            onInputChange={setShortAnswerInput}
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
                  <p className="font-extrabold text-sm sm:text-base text-white">
                    {isManuallyOverridden
                      ? '¡Respuesta Reclasificada! (¡Tenía razón!)'
                      : isCurrentCorrect
                      ? '¡Respuesta Correcta!'
                      : 'Respuesta Incorrecta'}
                  </p>

                  {isCurrentCorrect ? (
                    <p className="text-xs sm:text-sm text-emerald-200/90 mt-1">
                      {qType === 'matching' && correctMatchingFormula
                        ? `Has emparejado todos los conceptos con exactitud: ${correctMatchingFormula}.`
                        : 'Tu respuesta coincide conceptualmente con la solución esperada.'}
                    </p>
                  ) : (
                    <div className="text-xs sm:text-sm text-slate-200 mt-1.5 space-y-2">
                      {qType === 'matching' && correctMatchingFormula && (
                        <div className="text-xs text-rose-300">
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

        {/* ── ACTION ROW: HISTORIAL DE PREGUNTAS + THUMBS UP / DOWN (ESTILO THEA) ────── */}
        <div className="flex items-center justify-between gap-3 mb-5 sm:mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className="px-4 sm:px-5 py-2 rounded-full bg-[#d5c7ee] hover:bg-[#e4d8fb] text-[#1b113b] font-bold text-xs sm:text-sm transition-all shadow-sm hover:shadow cursor-pointer flex items-center gap-2 active:scale-95 min-h-[40px]"
          >
            <span>Historial de preguntas</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFeedbackGiven(feedbackGiven === 'up' ? null : 'up')}
              title="Pregunta clara y de alta calidad"
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-md transform hover:scale-105 active:scale-95 ${
                feedbackGiven === 'up'
                  ? 'bg-[#22c55e] text-white ring-2 ring-emerald-300'
                  : 'bg-[#22c55e] hover:bg-[#16a34a] text-white'
              }`}
            >
              <ThumbsUp className="w-4 h-4 fill-current" />
            </button>
            <button
              type="button"
              onClick={() => setFeedbackGiven(feedbackGiven === 'down' ? null : 'down')}
              title="Reportar pregunta o redacción confusa"
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-md transform hover:scale-105 active:scale-95 ${
                feedbackGiven === 'down'
                  ? 'bg-[#ef4444] text-white ring-2 ring-rose-300'
                  : 'bg-[#ef4444] hover:bg-[#dc2626] text-white'
              }`}
            >
              <ThumbsDown className="w-4 h-4 fill-current" />
            </button>
          </div>
        </div>

        {/* ── CENTERED "SIGUIENTE PREGUNTA" / "SALTAR PREGUNTA" BUTTON (ESTILO THEA) ── */}
        <div className="flex justify-center mb-6 sm:mb-8">
          <button
            type="button"
            onClick={handleNext}
            disabled={isAdvancing}
            className={`w-full sm:w-auto justify-center px-8 py-2.5 rounded-full font-bold text-sm sm:text-base shadow-md transition-all transform hover:scale-[1.02] active:scale-95 flex items-center gap-2 cursor-pointer min-h-[44px] ${
              isAdvancing ? 'opacity-70 pointer-events-none cursor-not-allowed' : ''
            } ${
              currentLevelCorrect >= levelTarget
                ? 'bg-gradient-to-r from-amber-400 via-amber-300 to-violet-300 hover:from-amber-300 hover:to-violet-200 text-slate-950 font-extrabold shadow-amber-500/25 ring-2 ring-amber-400/50'
                : 'bg-[#bba7ea] hover:bg-[#cbbaef] text-[#1b113b]'
            }`}
          >
            <span>
              {currentLevelCorrect >= levelTarget
                ? (level < 3 ? `Avanzar al Nivel ${level + 1}` : 'Finalizar Kit (Dominio Total)')
                : (isAnswered ? 'Siguiente pregunta' : 'Saltar pregunta')}
            </span>
            {currentLevelCorrect >= levelTarget && (
              <ArrowRight className="w-5 h-5 stroke-[2.5]" />
            )}
          </button>
        </div>

        {/* ── JUSTIFICACIÓN EXACTA DE THEA (VISIBLE AUTOMÁTICAMENTE AL RESPONDER) ─ */}
        {isAnswered && (
          <div
            ref={explanationRef}
            className="mt-6 pt-5 border-t border-[#261c47]/70 animate-fadeIn"
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
        className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn"
        onClick={(e) => {
          if (e.target === e.currentTarget) setShowSourceModal(false);
        }}
      >
        <div className="bg-thea-surface border border-violet-500/40 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative overflow-hidden max-h-[90vh] flex flex-col">
          {/* Modal Header */}
          <div className="flex items-center justify-between pb-4 border-b border-thea-border/80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-violet-600/20 border border-violet-500/40 flex items-center justify-center text-violet-400">
                <FileSearch className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  Fragmento de Origen (RAG)
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 uppercase tracking-wider">
                    Contexto Cerrado
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Evidencia documental para garantizar fidelidad académica y evitar alucinaciones
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowSourceModal(false)}
              className="w-8 h-8 rounded-xl bg-thea-surfaceLight border border-thea-border flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="py-4 space-y-4 overflow-y-auto flex-1 pr-1">
            {/* Metadata badges */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="px-3 py-1 rounded-lg bg-thea-surfaceLight border border-thea-border text-slate-300 font-medium">
                Fragmento: <strong>#{modalChunk.id || '1'}</strong>
              </span>
              {modalChunk.pageOrSlide && (
                <span className="px-3 py-1 rounded-lg bg-violet-950/60 border border-violet-500/40 text-violet-300 font-medium">
                  Ubicación: <strong>Página o Diapositiva {modalChunk.pageOrSlide}</strong>
                </span>
              )}
              <span className="px-3 py-1 rounded-lg bg-thea-surfaceLight border border-thea-border text-slate-400 flex items-center gap-1">
                <Database className="w-3.5 h-3.5 text-amber-400" />
                Índice Vectorial Local
              </span>
            </div>

            {/* Verbatim Quote */}
            <div className="bg-thea-bg rounded-2xl p-5 border border-thea-border/80 relative">
              <div className="text-slate-400 text-xs uppercase font-extrabold tracking-wider mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-violet-400" />
                Cita exacta del documento fuente:
              </div>
              <div className="text-sm text-slate-200 leading-relaxed border-l-2 border-violet-500 pl-4 py-1 italic bg-violet-950/10 rounded-r-xl">
                <FormattedText text={modalChunk.text || 'Contenido del fragmento analizado en el material original.'} />
              </div>
            </div>

            {/* Multimodal Asset if available */}
            {modalChunk.asset && (
              <div className="p-4 rounded-2xl bg-thea-surfaceLight border border-thea-border/80">
                <span className="text-xs font-bold text-slate-300 block mb-2 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
                  Activo multimodal vinculado: {modalChunk.asset.caption || 'Figura del documento'}
                </span>
                {modalChunk.asset.dataUrl && (
                  <div
                    onClick={() => setZoomAsset(modalChunk.asset)}
                    className="rounded-xl overflow-hidden bg-white border border-slate-200 flex items-center justify-center p-2 max-h-60 cursor-pointer hover:border-violet-500/80 transition-colors group relative"
                    title="Clic para ampliar con zoom interactivo"
                  >
                    <img
                      src={modalChunk.asset.dataUrl}
                      alt={modalChunk.asset.caption || 'Gráfico'}
                      className="max-h-56 object-contain rounded-lg group-hover:scale-[1.02] transition-transform duration-200"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <div className="w-8 h-8 rounded-full bg-violet-600/90 text-white flex items-center justify-center shadow-lg transform translate-y-1 group-hover:translate-y-0 transition-transform">
                        <ZoomIn className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-4 text-xs text-emerald-200 leading-relaxed flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <p>
                <strong>Garantía de Fidelidad RAG:</strong> La pregunta, la respuesta correcta y las retroalimentaciones de descarte fueron contrastadas rigurosamente contra este segmento del documento, asegurando coherencia y anclaje total.
              </p>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-thea-border/80 flex justify-end">
            <button
              onClick={() => setShowSourceModal(false)}
              className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
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
  {showConfigDrawer && (
    <div className="fixed inset-0 z-50 overflow-hidden animate-fadeIn">
      {/* Backdrop */}
      <div
        onClick={() => !isGeneratingTargeted && setShowConfigDrawer(false)}
        className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
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
                    setShuffleSeed((prev: number) => prev + 1);
                    setCurrentIndex(0);
                    const q = resolveNextQuestion(activePracticeLevel, 0, false, [], currentQ.id);
                    setCurrentQuestion(q);
                    lastQId.current = q.id;
                    setSelectedOption(null);
                    setSelectedMultiIndices([]);
                    setIsAnswered(false);
                    setIsCurrentCorrect(null);
                    setShortAnswerInput('');
                    authService.saveSmartStudySession(userId || null, kit.id, {
                      ...savedSession,
                      currentIndex: 0,
                      currentQuestionId: q.id,
                      currentQuestion: q,
                      selectedOption: null,
                      selectedMultiIndices: [],
                      isAnswered: false,
                      isCurrentCorrect: null,
                      shortAnswerInput: '',
                      lastUpdated: Date.now(),
                    } as any);
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
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span>+10 IA ({levelLabels[level].title})</span>
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
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Generar y Evaluar Ahora</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )}

  {/* ── MODAL DE CONFIRMACIÓN PARA REINICIAR PROGRESO DESDE LOS ROMBOS ── */}
  {showResetConfirmModal &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
        onClick={(e) => {
          if (e.target === e.currentTarget) setShowResetConfirmModal(false);
        }}
      >
        <div className="bg-[#181138] border border-violet-500/40 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative text-center">
          <button
            type="button"
            onClick={() => setShowResetConfirmModal(false)}
            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border transition-colors cursor-pointer"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto mb-4 text-amber-400 shadow-inner">
            <RotateCcw className="w-7 h-7" />
          </div>

          <h3 className="text-lg sm:text-xl font-bold text-white mb-2 leading-snug">
            ¿Deseas reiniciar el progreso de SmartStudy de este kit?
          </h3>

          <p className="text-xs sm:text-sm text-slate-300 bg-thea-surface/80 border border-thea-border/80 rounded-xl p-3.5 mb-6 leading-relaxed">
            El avance volverá al <strong>Nivel 1 (0%)</strong> y se reiniciará el avance de preguntas activas de este kit. Las respuestas que ya contestaste se conservarán en tu pestaña de Historial para revisión.
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowResetConfirmModal(false)}
              className="flex-1 py-3 px-4 rounded-xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-slate-300 font-bold text-xs sm:text-sm transition-all cursor-pointer"
            >
              No
            </button>
            <button
              type="button"
              onClick={handleResetProgress}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-amber-900/30 transition-all cursor-pointer"
            >
              Sí, reiniciar de 0
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
</div>
  );
};

