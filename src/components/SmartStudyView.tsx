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
  Compass,
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
  ChevronUp,
  ZoomIn,
  CheckCheck,
  Send,
} from 'lucide-react';
import { ImageZoomModal } from './ImageZoomModal';
import confetti from 'canvas-confetti';
import {
  generateAIPedagogicalQuestions,
  generateSocraticReformulatedQuestion,
  generateTargetedPedagogicalQuestions,
  generateFalseConceptQuestions,
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
  const [currentIndex, setCurrentIndex] = useState(savedSession?.currentIndex || 0);
  const [isAnswered, setIsAnswered] = useState(savedSession?.isAnswered || false);
  const [isCurrentCorrect, setIsCurrentCorrect] = useState<boolean | null>(savedSession?.isCurrentCorrect ?? null);
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
  const [selectedOption, setSelectedOption] = useState<number | null>(savedSession?.selectedOption ?? null);
  const [selectedMultiIndices, setSelectedMultiIndices] = useState<number[]>(savedSession?.selectedMultiIndices || []);
  const [activeMatchingTerm, setActiveMatchingTerm] = useState<string | null>(null);
  const [matchingPairsMap, setMatchingPairsMap] = useState<Record<string, string>>(savedSession?.matchingPairsMap || {});
  const [matchingChecked, setMatchingChecked] = useState(savedSession?.matchingChecked || false);
  const [placedChips, setPlacedChips] = useState<(string | null)[]>(savedSession?.placedChips || []);
  const [draggedChip, setDraggedChip] = useState<string | null>(null);
  const [dragDropChecked, setDragDropChecked] = useState(savedSession?.dragDropChecked || false);
  const [placedImageLabels, setPlacedImageLabels] = useState<Record<string, string>>((savedSession as any)?.placedImageLabels || {});
  const [activeLabelChip, setActiveLabelChip] = useState<string | null>(null);
  const [imageLabelChecked, setImageLabelChecked] = useState((savedSession as any)?.imageLabelChecked || false);

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

  // ── Respuestas Abiertas Cortas (Short Answer) ──────────────────────────
  const [shortAnswerInput, setShortAnswerInput] = useState<string>('');
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

  // ── Justificaciones desplegables bajo demanda (Smart Study e Historial) ───
  const [showJustification, setShowJustification] = useState<boolean>(false);
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
          const fallbackQ = availableInDiff[0] || allInDiff[0];
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
        const fallbackQ = availableInDiff[0] || allInDiff[0];
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
      // El banco tiene 7 o más preguntas disponibles en esta dificultad: tomar la siguiente no vista
      const nextQ = availableInDiff[0];
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
        setCurrentQuestion(generated[0]);
        lastQId.current = generated[0].id;

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

    // Detección de escasez de preguntas de concepto falso / afirmación falsa en el pool activo
    const falseConceptCount = currentPool.filter(isFalseConceptQuestion).length;
    const needsFalseConcepts = falseConceptCount < 2;

    // Si quedan 3 o menos preguntas por delante en este nivel, o el banco inicial tiene menos de 8, O faltan preguntas de afirmación falsa
    if (remainingAhead <= 3 || currentPool.length < 8 || needsFalseConcepts) {
      isAutoGeneratingRef.current = true;
      setIsGeneratingMore(true);

      try {
        let generated: Question[] = [];
        if (needsFalseConcepts) {
          // Inyectar lote especializado de conceptos falsos/equivocados
          generated = await generateFalseConceptQuestions(
            kit.sourceText || kit.description,
            kit.title,
            kit.category,
            targetDiff,
            6,
            kit.chunks
          );
        } else {
          generated = await generateAIPedagogicalQuestions(
            kit.sourceText || kit.description,
            5,
            targetDiff,
            kit.chunks
          );
        }

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

    // Distribución estrictamente proporcional entre los formatos activos en los interruptores (tuerca)
    const activeCategories: (keyof SmartStudyTypeFilters)[] = (
      ['multipleChoice', 'shortAnswer', 'trueFalse', 'practical'] as (keyof SmartStudyTypeFilters)[]
    ).filter(cat => typeFilters[cat]);
    const safeActiveCategories = activeCategories.length > 0 ? activeCategories : (['multipleChoice'] as (keyof SmartStudyTypeFilters)[]);
    const targetCat = safeActiveCategories[targetIndex % safeActiveCategories.length];

    const targetDiff = targetLevel === 1 ? 'easy' : targetLevel === 2 ? 'medium' : 'hard';
    const levelQuestions = kit.questions.filter(q => (q.difficulty || 'easy') === targetDiff);
    const pool = levelQuestions.length > 0 ? levelQuestions : kit.questions;

    // Posición base de la pregunta actual para avanzar secuencialmente hacia adelante
    const currentPos = pool.findIndex(q => q.id === excludeQuestionId);
    const baseIndex = currentPos >= 0 ? currentPos : 0;

    // Regla de frecuencia: 1 de cada 2 o 3 preguntas de opción múltiple (~35%-40%) prioriza conceptos falsos o equivocados
    const shouldPreferFalseConcept = (targetCat === 'multipleChoice') && (targetIndex % 3 === 1 || targetIndex % 3 === 2);

    if (shouldPreferFalseConcept) {
      for (let i = 1; i <= pool.length; i++) {
        const candidate = pool[(baseIndex + i) % pool.length];
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

    // Prioridad 1: Buscar hacia adelante la siguiente pregunta no respondida de este nivel que coincida con el tipo
    for (let i = 1; i <= pool.length; i++) {
      const candidate = pool[(baseIndex + i) % pool.length];
      if (
        candidate.id !== excludeQuestionId &&
        !answeredQuestionIdsRef.current.has(candidate.id) &&
        getCategoryForQuestion(candidate) === targetCat
      ) {
        return candidate;
      }
    }

    // Prioridad 2: Buscar cualquier no respondida y adaptarla al formato proporcional seleccionado
    for (let i = 1; i <= pool.length; i++) {
      const candidate = pool[(baseIndex + i) % pool.length];
      if (candidate.id !== excludeQuestionId && !answeredQuestionIdsRef.current.has(candidate.id)) {
        return adaptQuestionToCategory(candidate, targetCat);
      }
    }

    // Prioridad 3: Si ya se respondieron todas las del nivel, avanzar a la siguiente del pool y adaptarla
    for (let i = 1; i <= pool.length; i++) {
      const candidate = pool[(baseIndex + i) % pool.length];
      if (candidate.id !== excludeQuestionId) {
        return adaptQuestionToCategory(candidate, targetCat);
      }
    }

    // Prioridad 4: En kit general
    const currentKitPos = kit.questions.findIndex(q => q.id === excludeQuestionId);
    const baseKitIndex = currentKitPos >= 0 ? currentKitPos : 0;
    for (let i = 1; i <= kit.questions.length; i++) {
      const candidate = kit.questions[(baseKitIndex + i) % kit.questions.length];
      if (candidate.id !== excludeQuestionId) {
        return adaptQuestionToCategory(candidate, targetCat);
      }
    }

    return adaptQuestionToCategory(kit.questions[0], targetCat);
  }, [kit.questions, socraticProfile, typeFilters, getCategoryForQuestion, adaptQuestionToCategory]);

  // Pregunta activa fijada en estado: NUNCA cambia por efectos secundarios en segundo plano
  const [currentQuestion, setCurrentQuestion] = useState<Question>(() => {
    if (savedSession?.errorQueue && savedSession.errorQueue.length > 0 && savedSession.isReinforcementMode) {
      return savedSession.errorQueue[0];
    }
    // Si hay una pregunta guardada en la sesión que aún exista en el kit, restaurarla con máxima fidelidad
    if (savedSession?.currentQuestionId) {
      const found = kit.questions.find(q => q.id === savedSession.currentQuestionId);
      if (found) {
        return found;
      }
    }
    const initialIndex = savedSession?.currentIndex || 0;
    const practiceLevel = (savedSession as any)?.activePracticeLevel || (savedSession?.level as 1 | 2 | 3) || 1;
    const targetDiff = practiceLevel === 1 ? 'easy' : practiceLevel === 2 ? 'medium' : 'hard';
    const pool = kit.questions.filter(q => (q.difficulty || 'easy') === targetDiff);
    const finalPool = pool.length > 0 ? pool : kit.questions;
    const activeCategories: (keyof SmartStudyTypeFilters)[] = (
      ['multipleChoice', 'shortAnswer', 'trueFalse', 'practical'] as (keyof SmartStudyTypeFilters)[]
    ).filter(cat => typeFilters[cat]);
    const safeActiveCategories = activeCategories.length > 0 ? activeCategories : (['multipleChoice'] as (keyof SmartStudyTypeFilters)[]);
    const targetCat = safeActiveCategories[initialIndex % safeActiveCategories.length];
    const raw = finalPool[initialIndex % finalPool.length] || kit.questions[0];
    return adaptQuestionToCategory(raw, targetCat);
  });

  const currentQ: Question = currentQuestion;

  // Resetear la justificación al cambiar de pregunta
  useEffect(() => {
    setShowJustification(false);
  }, [currentQ?.id]);

  // Regla estricta para adjuntar imágenes a las preguntas individuales
  const isImageStrictlyNecessary = (q: Question): boolean => {
    if (!q.sourceAsset || !q.sourceAsset.dataUrl) return false;
    const combined = (q.question + ' ' + (q.explanation || '')).toLowerCase();
    return /\b(según el esquema|en la figura|observa la imagen|en el gráfico|diagrama adjunto|tabla adjunta|en la tabla|en la imagen|como se muestra en la figura|ilustrado en el esquema)\b/i.test(combined);
  };

  const isCurrentQRevealed = useMemo(() => {
    if (!currentQ) return false;
    return revealedQuestionIds.includes(currentQ.id);
  }, [currentQ, revealedQuestionIds]);

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
      const key = `thea_slot_dist_${currentQ.id}_${kit.id}`;
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
  }, [currentQ.id, currentQ.options, currentQ.correctIndex, currentQ.correctIndices, qType, kit.id]);

  // Guard against initial mount wiping restored question state
  const isFirstMount = useRef(true);
  const lastQId = useRef(currentQ?.id || '');

  useEffect(() => {
    if (!currentQ) return;

    if (isFirstMount.current) {
      isFirstMount.current = false;
      lastQId.current = currentQ.id;
      lastQuestionLoadTimeRef.current = Date.now();
      return;
    }

    // Si el ID de la pregunta no cambio, no resetear para preservar respuestas en curso
    if (lastQId.current === currentQ.id) {
      return;
    }

    lastQId.current = currentQ.id;
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
    setShowJustification(false);
  }, [currentQ.id, effectiveBlanksCorrect.length]);

  // ── Auto-Save Session Memory (Guarda el instante exacto por kit y usuario) ──
  useEffect(() => {
    authService.saveSmartStudySession(userId || null, kit.id, {
      currentIndex,
      level,
      activePracticeLevel,
      currentQuestionId: currentQ?.id,
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
    if (!currentQ.matchingPairs || currentQ.matchingPairs.length === 0) return [];
    const pairs = currentQ.matchingPairs;
    if (pairs.length === 1) return [pairs[0].definition];

    const originalDefs = pairs.map(p => p.definition);
    const n = originalDefs.length;

    // PRNG determinista basado en el ID de la pregunta, kit y shuffleSeed
    let hash = 0;
    const seedKey = `thea_derange_${currentQ.id}_${kit.id}_${shuffleSeed}`;
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
  }, [currentQ.id, currentQ.matchingPairs, kit.id, shuffleSeed]);

  // Fórmula compacta de emparejamientos correctos (ej: "1:3, 2:1, 3:2")
  const correctMatchingFormula = useMemo(() => {
    if (!currentQ.matchingPairs || currentQ.matchingPairs.length === 0) return '';
    return currentQ.matchingPairs.map((p, leftIdx) => {
      const rightIdx = shuffledDefinitions.findIndex(d => d === p.definition);
      return `${leftIdx + 1}:${rightIdx >= 0 ? rightIdx + 1 : '?'}`;
    }).join(', ');
  }, [currentQ.matchingPairs, shuffledDefinitions]);

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
    }

    // 3. Limpieza DIRECTA e INCONDICIONAL de todos los estados para que NUNCA quede bloqueada
    setSelectedOption(null);
    setSelectedMultiIndices([]);
    setActiveMatchingTerm(null);
    setMatchingPairsMap({});
    setMatchingChecked(false);
    setDragDropChecked(false);
    setShowJustification(false);
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

  // Text-to-speech helper
  const handleReadAloud = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
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
                      <div className="leading-relaxed text-slate-300">
                        <FormattedText text={item.explanation} />
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
                  className="rounded-xl overflow-hidden bg-black/40 border border-thea-border/60 flex items-center justify-center p-2 mb-2 max-h-72 cursor-pointer hover:border-violet-500/60 transition-colors group relative"
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

          {/* 1. MULTIPLE CHOICE RENDERER (2x2 GRID ACCORDING TO SCREENSHOT) */}
          {qType === 'multiple-choice' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 mb-6 sm:mb-8">
              {safeOptions.map((option, idx) => {
                const isSelected = selectedOption === idx;
                const isCorrect = idx === safeCorrectIndex;

                let cardClasses = 'bg-[#181138]/90 border border-[#2b2053] hover:border-violet-500/50 hover:bg-[#20174a] text-slate-200 active:scale-[0.985]';
                let badgeClasses = 'bg-[#2f1f58] text-[#cbb8e8]';

                if (isAnswered) {
                  if (isCorrect) {
                    cardClasses = 'border-2 border-emerald-400 bg-[#10252b]/95 text-white shadow-[0_0_24px_rgba(52,211,153,0.4)] ring-1 ring-emerald-400/50 animate-cardCorrect';
                    badgeClasses = 'bg-[#4ade80] text-[#0f291e] scale-105';
                  } else if (isSelected) {
                    cardClasses = 'border-2 border-rose-500 bg-rose-950/60 text-rose-100 shadow-[0_0_22px_rgba(244,63,94,0.35)] ring-1 ring-rose-500/50 animate-cardError';
                    badgeClasses = 'bg-[#f87171] text-white scale-105';
                  } else {
                    cardClasses = 'border-[#221742]/50 bg-[#120a2a]/50 text-slate-500 opacity-40';
                    badgeClasses = 'bg-[#22173f] text-slate-600';
                  }
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={isAnswered}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSelectSingleOption(idx);
                    }}
                    className={`w-full text-left p-4 sm:p-5 rounded-2xl transition-all duration-150 ease-out flex items-center gap-3.5 sm:gap-4 group cursor-pointer ${cardClasses}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm shrink-0 transition-all duration-150 ${badgeClasses}`}>
                      {isAnswered && isCorrect ? (
                        <Check className="w-4 h-4 stroke-[3]" />
                      ) : isAnswered && isSelected ? (
                        <X className="w-4 h-4 stroke-[3]" />
                      ) : (
                        <span>{idx + 1}</span>
                      )}
                    </div>
                    <span className="font-medium text-sm sm:text-base leading-snug flex-1">
                      <FormattedText text={option} inlineOnly={true} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}

        {/* 2. MULTI-SELECT RENDERER */}
        {qType === 'multi-select' && (
          <div className="space-y-4 mb-8">
            <p className="text-xs text-slate-400 font-medium">
              Selecciona una o más respuestas válidas y presiona "Comprobar Selección":
            </p>
            <div className="space-y-3">
              {safeOptions.map((option, idx) => {
                const isSelected = selectedMultiIndices.includes(idx);
                const isCorrect = safeCorrectIndices.includes(idx);

                let optionStyles = 'border-thea-border bg-thea-surfaceLight/50 hover:bg-thea-surfaceLight text-slate-200';
                if (isSelected && !isAnswered) {
                  optionStyles = 'border-violet-500 bg-violet-950/30 text-white ring-1 ring-violet-500';
                }
                if (isAnswered) {
                  if (isCorrect && isSelected) {
                    optionStyles = 'border-emerald-500 bg-emerald-950/40 text-emerald-200 ring-1 ring-emerald-500 animate-cardCorrect';
                  } else if (!isCorrect && isSelected) {
                    optionStyles = 'border-rose-500 bg-rose-950/40 text-rose-200 ring-1 ring-rose-500 animate-cardError';
                  } else if (isCorrect && !isSelected) {
                    optionStyles = 'border-amber-500 bg-amber-950/30 text-amber-200 ring-1 ring-amber-500/60';
                  } else {
                    optionStyles = 'border-thea-border/40 text-slate-500 opacity-40';
                  }
                }

                return (
                  <button
                    key={idx}
                    disabled={isAnswered}
                    onClick={() => handleToggleMultiIndex(idx)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all duration-150 ease-out flex items-center justify-between ${optionStyles}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                        isSelected ? 'bg-violet-600 border-violet-500 text-white' : 'border-slate-500 bg-thea-surface'
                      }`}>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                      <span className="text-sm font-medium">
                        <FormattedText text={option} inlineOnly={true} />
                      </span>
                    </div>

                    {isAnswered && isCorrect && isSelected && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    )}
                    {isAnswered && !isCorrect && isSelected && (
                      <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {!isAnswered && (
              <button
                disabled={selectedMultiIndices.length === 0}
                onClick={handleCheckMultiSelect}
                className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold text-sm shadow-md transition-all"
              >
                Comprobar Selección ({selectedMultiIndices.length} seleccionada{selectedMultiIndices.length !== 1 ? 's' : ''})
              </button>
            )}
          </div>
        )}

        {/* 3. MATCHING (CONCEPT PAIRING) RENDERER */}
        {qType === 'matching' && currentQ.matchingPairs && (
          <div className="space-y-6 mb-8">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-slate-300 font-medium">
                Haz clic en un concepto numerado de la izquierda y luego en su definición correspondiente a la derecha:
              </p>
              {matchingChecked && (
                <span className="text-xs font-bold text-violet-300 bg-violet-950/70 px-3 py-1 rounded-full border border-violet-500/40">
                  Solución: {correctMatchingFormula}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* Left Column: Terms */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-violet-300 uppercase tracking-wider block">
                    Conceptos ({currentQ.matchingPairs.length})
                  </span>
                  <span className="text-[11px] text-slate-400">Paso 1: Selecciona concepto</span>
                </div>
                {currentQ.matchingPairs.map((pair, leftIdx) => {
                  const leftNum = leftIdx + 1;
                  const isPaired = Boolean(matchingPairsMap[pair.term]);
                  const isActive = activeMatchingTerm === pair.term;
                  const pairedDef = matchingPairsMap[pair.term];
                  const pairedRightIdx = shuffledDefinitions.findIndex(d => d === pairedDef);
                  const pairedRightNum = pairedRightIdx >= 0 ? pairedRightIdx + 1 : null;

                  const correctRightIdx = shuffledDefinitions.findIndex(d => d === pair.definition);
                  const correctRightNum = correctRightIdx >= 0 ? correctRightIdx + 1 : null;
                  const isMatchCorrect = matchingChecked && isPaired && matchingPairsMap[pair.term] === pair.definition;

                  let borderStyles = 'border-thea-border bg-thea-surfaceLight/40 hover:border-violet-500/60';
                  if (isActive) borderStyles = 'border-violet-400 bg-violet-950/50 ring-2 ring-violet-500 shadow-md';
                  if (isPaired && !matchingChecked) borderStyles = 'border-indigo-500/60 bg-indigo-950/30';
                  if (matchingChecked) {
                    borderStyles = isMatchCorrect
                      ? 'border-emerald-500 bg-emerald-950/30 animate-cardCorrect'
                      : 'border-rose-500 bg-rose-950/30 animate-cardError';
                  }

                  return (
                    <button
                      key={leftIdx}
                      type="button"
                      disabled={isAnswered}
                      onClick={() => handleTermClick(pair.term)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all duration-150 ease-out flex items-center justify-between gap-3 cursor-pointer ${borderStyles}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 h-7 rounded-xl bg-violet-600/30 border border-violet-500/40 text-violet-200 font-extrabold text-xs flex items-center justify-center shrink-0">
                          {leftNum}
                        </span>
                        <span className="font-semibold text-sm text-white truncate sm:text-wrap">
                          <FormattedText text={pair.term} inlineOnly={true} />
                        </span>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        {!matchingChecked && isPaired && pairedRightNum && (
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/40">
                            Unido con [{pairedRightNum}]
                          </span>
                        )}

                        {matchingChecked && (
                          isMatchCorrect ? (
                            <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 flex items-center gap-1">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                              {leftNum}:{correctRightNum} (Correcto)
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-500/30 text-rose-300 border border-rose-400/40 flex items-center gap-1">
                              <X className="w-3.5 h-3.5 stroke-[3]" />
                              Tu: {pairedRightNum ? `${leftNum}:${pairedRightNum}` : 'Sin unión'} • Iba con {leftNum}:{correctRightNum}
                            </span>
                          )
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Right Column: Definitions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-purple-300 uppercase tracking-wider block">
                    Definiciones / Roles ({shuffledDefinitions.length})
                  </span>
                  <span className="text-[11px] text-slate-400">Paso 2: Empareja con definición</span>
                </div>
                {shuffledDefinitions.map((def, rightIdx) => {
                  const rightNum = rightIdx + 1;
                  const pairedTerm = Object.keys(matchingPairsMap).find(t => matchingPairsMap[t] === def);
                  const pairedLeftIdx = pairedTerm
                    ? currentQ.matchingPairs?.findIndex(p => p.term === pairedTerm) ?? -1
                    : -1;
                  const pairedLeftNum = pairedLeftIdx >= 0 ? pairedLeftIdx + 1 : null;

                  const correctPair = currentQ.matchingPairs?.find(p => p.definition === def);
                  const correctLeftIdx = correctPair
                    ? currentQ.matchingPairs?.findIndex(p => p.term === correctPair.term) ?? -1
                    : -1;
                  const correctLeftNum = correctLeftIdx >= 0 ? correctLeftIdx + 1 : null;

                  const isMatchCorrect = matchingChecked && pairedTerm && correctPair?.term === pairedTerm;

                  let borderStyles = 'border-thea-border bg-thea-surfaceLight/40 hover:border-violet-500/60';
                  if (pairedTerm && !matchingChecked) borderStyles = 'border-indigo-500/60 bg-indigo-950/30';
                  if (matchingChecked) {
                    borderStyles = isMatchCorrect
                      ? 'border-emerald-500 bg-emerald-950/30 animate-cardCorrect'
                      : 'border-rose-500 bg-rose-950/30 animate-cardError';
                  }

                  return (
                    <button
                      key={rightIdx}
                      type="button"
                      disabled={isAnswered}
                      onClick={() => handleDefClick(def)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all duration-150 ease-out flex items-start justify-between gap-3 cursor-pointer ${borderStyles}`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="w-7 h-7 rounded-xl bg-purple-600/30 border border-purple-500/40 text-purple-200 font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                          {rightNum}
                        </span>
                        <span className="text-xs text-slate-200 leading-relaxed">
                          <FormattedText text={def} inlineOnly={true} />
                        </span>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        {!matchingChecked && pairedLeftNum && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-600/40 text-violet-200 border border-violet-400/30 shrink-0">
                            Unido a [{pairedLeftNum}]
                          </span>
                        )}

                        {matchingChecked && (
                          isMatchCorrect ? (
                            <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 shrink-0 flex items-center gap-1">
                              <Check className="w-3 h-3 stroke-[3]" />
                              {pairedLeftNum}:{rightNum}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-500/30 text-rose-300 border border-rose-400/40 shrink-0 flex items-center gap-1">
                              Iba con [{correctLeftNum}]
                            </span>
                          )
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {!isAnswered && (
              <button
                type="button"
                disabled={Object.keys(matchingPairsMap).length < (currentQ.matchingPairs?.length || 4)}
                onClick={handleCheckMatching}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 text-white font-extrabold text-sm shadow-lg shadow-violet-900/30 transition-all cursor-pointer"
              >
                Comprobar Emparejamientos ({Object.keys(matchingPairsMap).length}/{currentQ.matchingPairs?.length || 4})
              </button>
            )}
          </div>
        )}

        {/* 4. DRAG & DROP / WORD BANK RENDERER */}
        {qType === 'drag-drop' && effectiveTemplateSentence && effectiveBlanksCorrect.length > 0 && (
          <div className="space-y-6 mb-8">
            <p className="text-xs text-slate-300 font-medium">
              Haz clic o arrastra las fichas de abajo para rellenar los espacios correspondientes:
            </p>

            {/* Template sentence with interactive slots */}
            <div className="p-5 sm:p-6 rounded-2xl bg-thea-surfaceLight/70 border border-thea-border text-base sm:text-lg leading-loose text-slate-100 shadow-inner">
              {effectiveTemplateSentence.split(/(\{\d+\})/).map((part, pIdx) => {
                const match = part.match(/\{(\d+)\}/);
                if (match) {
                  const slotIdx = parseInt(match[1], 10);
                  const placed = placedChips[slotIdx];
                  const isCorrectSlot = dragDropChecked && placed?.trim().toLowerCase() === effectiveBlanksCorrect?.[slotIdx]?.trim().toLowerCase();

                  let slotBorder = 'border-dashed border-violet-400/80 bg-violet-950/30 text-violet-300';
                  if (placed) slotBorder = 'border-solid border-violet-500 bg-violet-600/30 text-white font-bold';
                  if (dragDropChecked) {
                    slotBorder = isCorrectSlot ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200 animate-cardCorrect' : 'border-rose-500 bg-rose-950/40 text-rose-200 animate-cardError';
                  }

                  return (
                    <button
                      key={pIdx}
                      type="button"
                      disabled={isAnswered}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedChip) handlePlaceChip(draggedChip, slotIdx);
                      }}
                      onClick={() => placed && handleRemovePlacedChip(slotIdx)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 mx-1.5 rounded-xl border text-sm transition-all duration-150 ease-out cursor-pointer ${slotBorder}`}
                    >
                      <span>{placed || `[ Espacio ${slotIdx + 1} ]`}</span>
                      {placed && !isAnswered && <X className="w-3 h-3 text-slate-400 hover:text-white" />}
                    </button>
                  );
                }
                return <span key={pIdx}>{part}</span>;
              })}
            </div>

            {/* Word Bank */}
            <div>
              <span className="text-xs font-bold text-violet-300 uppercase tracking-wider block mb-2.5">
                Banco de Fichas ({effectiveWordBank.length}):
              </span>
              <div className="flex flex-wrap gap-2.5">
                {effectiveWordBank.map((chip, cIdx) => {
                  const isUsed = placedChips.includes(chip);
                  return (
                    <button
                      key={cIdx}
                      disabled={isAnswered || isUsed}
                      draggable={!isAnswered && !isUsed}
                      onDragStart={() => setDraggedChip(chip)}
                      onDragEnd={() => setDraggedChip(null)}
                      onClick={() => handlePlaceChip(chip)}
                      className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer ${
                        isUsed
                          ? 'opacity-30 border-thea-border bg-thea-surfaceLight text-slate-600 line-through'
                          : 'border-thea-border bg-thea-surfaceLight text-slate-200 hover:border-violet-500 hover:text-white hover:bg-violet-950/40 active:scale-95'
                      }`}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>
            </div>

            {!isAnswered && (
              <button
                disabled={placedChips.some(c => c === null) || placedChips.length < effectiveBlanksCorrect.length}
                onClick={handleCheckDragDrop}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 text-white font-extrabold text-sm shadow-lg shadow-violet-900/30 transition-all cursor-pointer"
              >
                Comprobar Respuestas
              </button>
            )}
          </div>
        )}


        {/* 6. IMAGE & DIAGRAM LABELING (MOVER CUADROS DE TEXTO EN IMAGEN O DIAGRAMA) */}
        {qType === 'image-labeling' && (
          <div className="space-y-6 mb-8">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-slate-400 font-medium">
                Arrastra o selecciona un cuadro de texto del banco inferior y colócalo en el punto correspondiente del esquema:
              </p>
              {currentQ.diagramTitle && (
                <span className="text-xs font-bold text-violet-300 px-2.5 py-1 rounded-lg bg-violet-950/40 border border-violet-500/30">
                  {currentQ.diagramTitle}
                </span>
              )}
            </div>

            {/* Canvas contenedor de la imagen o esquema pedagógico */}
            <div className="relative w-full rounded-2xl bg-gradient-to-br from-slate-950 via-thea-surface to-slate-900 border border-thea-border overflow-hidden min-h-[300px] sm:min-h-[360px] p-4 flex items-center justify-center shadow-inner select-none">
              {(currentQ.sourceAsset?.dataUrl || kit.assets?.[0]?.dataUrl) ? (
                <img
                  src={currentQ.sourceAsset?.dataUrl || kit.assets?.[0]?.dataUrl}
                  alt={currentQ.diagramTitle || 'Diagrama de estudio'}
                  className="max-h-80 object-contain mx-auto rounded-xl opacity-90"
                />
              ) : (
                <div className="w-full h-72 rounded-xl border border-dashed border-violet-500/30 bg-violet-950/15 flex flex-col items-center justify-center p-6 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-violet-600/20 border border-violet-500/40 flex items-center justify-center text-violet-300 mb-1">
                    <Compass className="w-6 h-6" />
                  </div>
                  <span className="text-sm font-bold text-slate-200">
                    {currentQ.diagramTitle || currentQ.topic}
                  </span>
                  <span className="text-xs text-slate-400 max-w-sm">
                    Ubica los cuadros de texto en las posiciones esquemáticas del diagrama.
                  </span>
                </div>
              )}

              {/* Hotspots interactivos ubicados sobre el lienzo */}
              {(currentQ.imageHotspots || [
                { id: 'pin-1', label: currentQ.topic, xPercent: 30, yPercent: 35, hint: 'Fase 1' },
                { id: 'pin-2', label: currentQ.explanation.slice(0, 20), xPercent: 70, yPercent: 65, hint: 'Fase 2' }
              ]).map((hotspot, hIdx) => {
                const placed = placedImageLabels[hotspot.id];
                const isCorrect = imageLabelChecked && placed?.trim().toLowerCase() === hotspot.label.trim().toLowerCase();

                let pinStyles = 'bg-violet-950/90 border-violet-400 text-violet-200 hover:border-violet-300 hover:scale-105';
                if (placed && !imageLabelChecked) {
                  pinStyles = 'bg-indigo-600 text-white border-white shadow-lg shadow-indigo-900/50';
                }
                if (imageLabelChecked) {
                  pinStyles = isCorrect
                    ? 'bg-emerald-900/90 border-emerald-400 text-emerald-200 shadow-emerald-950/50'
                    : 'bg-rose-900/90 border-rose-400 text-rose-200 shadow-rose-950/50';
                }

                return (
                  <div
                    key={hotspot.id}
                    style={{
                      left: `${Math.min(85, Math.max(12, hotspot.xPercent))}%`,
                      top: `${Math.min(85, Math.max(12, hotspot.yPercent))}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    onClick={() => {
                      if (activeLabelChip) {
                        handlePlaceImageLabel(hotspot.id, activeLabelChip);
                      } else if (placed) {
                        handleRemoveImageLabel(hotspot.id);
                      }
                    }}
                    className={`absolute z-20 px-3 py-1.5 rounded-xl border backdrop-blur-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md max-w-[200px] truncate ${pinStyles}`}
                    title={placed ? 'Clic para retirar cuadro' : (activeLabelChip ? `Colocar "${activeLabelChip}" aquí` : 'Toca una ficha de abajo para colocarla aquí')}
                  >
                    <span className="w-4 h-4 rounded-full bg-black/40 text-[10px] flex items-center justify-center shrink-0">
                      {hIdx + 1}
                    </span>
                    <span className="truncate">
                      {placed || (activeLabelChip ? 'Toca para ubicar' : (hotspot.hint || `Punto ${hIdx + 1}`))}
                    </span>
                    {placed && !isAnswered && (
                      <X className="w-3 h-3 text-slate-300 hover:text-white shrink-0 ml-0.5" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Banco de Fichas / Cuadros de texto para mover */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  Banco de Cuadros de Texto:
                </span>
                {activeLabelChip && (
                  <span className="text-xs text-amber-300 font-medium">
                    Ficha activa: <strong>{activeLabelChip}</strong> (toca un punto en la imagen)
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2.5">
                {(currentQ.imageWordBank || currentQ.imageHotspots?.map(h => h.label) || []).map((term, tIdx) => {
                  const isUsed = Object.values(placedImageLabels).includes(term);
                  const isSelected = activeLabelChip === term;

                  return (
                    <button
                      key={tIdx}
                      type="button"
                      disabled={isAnswered || isUsed}
                      onClick={() => setActiveLabelChip(isSelected ? null : term)}
                      className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                        isUsed
                          ? 'opacity-30 border-thea-border bg-thea-surfaceLight text-slate-600 line-through'
                          : isSelected
                          ? 'border-amber-400 bg-amber-950/50 text-amber-200 ring-2 ring-amber-400 shadow-md scale-105'
                          : 'border-thea-border bg-thea-surfaceLight text-slate-200 hover:border-violet-500 hover:text-white hover:bg-violet-950/40 active:scale-95'
                      }`}
                    >
                      <span>{term}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {!isAnswered && (
              <button
                type="button"
                disabled={
                  (currentQ.imageHotspots?.length || 2) > Object.keys(placedImageLabels).length
                }
                onClick={handleCheckImageLabel}
                className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold text-sm shadow-md transition-all cursor-pointer"
              >
                Comprobar Ubicaciones ({Object.keys(placedImageLabels).length}/{currentQ.imageHotspots?.length || 2})
              </button>
            )}
          </div>
        )}

        {/* 6. TRUE / FALSE RENDERER (CUADROS VISUALES CON ICONOS CENTRALES) */}
        {qType === 'true-false' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
            {['Verdadero', 'Falso'].map((label, idx) => {
              const isSelected = selectedOption === idx;
              const isCorrect = idx === safeCorrectIndex;
              const isVerdadero = idx === 0;

              let cardClasses = 'bg-[#181138]/90 border border-[#2b2053] hover:border-violet-500/60 hover:bg-[#20174a] text-slate-200 hover:scale-[1.02] active:scale-98';
              let iconClasses = isVerdadero ? 'text-emerald-400' : 'text-rose-400';
              let iconBgClasses = isVerdadero ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30';

              if (isAnswered) {
                if (isCorrect) {
                  cardClasses = 'border-2 border-emerald-400 bg-[#10252b]/95 text-white shadow-[0_0_24px_rgba(52,211,153,0.4)] ring-2 ring-emerald-400/50 animate-cardCorrect';
                  iconClasses = 'text-emerald-300';
                  iconBgClasses = 'bg-emerald-500/25 border-emerald-400 scale-105';
                } else if (isSelected) {
                  cardClasses = 'border-2 border-rose-500 bg-rose-950/60 text-rose-100 shadow-[0_0_22px_rgba(244,63,94,0.35)] ring-2 ring-rose-500/50 animate-cardError';
                  iconClasses = 'text-rose-300';
                  iconBgClasses = 'bg-rose-500/25 border-rose-400 scale-105';
                } else {
                  cardClasses = 'border-[#221742]/50 bg-[#120a2a]/40 text-slate-500 opacity-40';
                  iconClasses = 'text-slate-600';
                  iconBgClasses = 'bg-slate-800/30 border-slate-700/30';
                }
              }

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isAnswered}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelectSingleOption(idx);
                  }}
                  className={`w-full py-8 sm:py-10 px-6 rounded-3xl transition-all duration-150 ease-out flex flex-col items-center justify-center gap-3 cursor-pointer shadow-lg ${cardClasses}`}
                >
                  <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center transition-all ${iconBgClasses}`}>
                    {isVerdadero ? (
                      <Check className={`w-7 h-7 stroke-[2.5] ${iconClasses}`} />
                    ) : (
                      <X className={`w-7 h-7 stroke-[2.5] ${iconClasses}`} />
                    )}
                  </div>
                  <span className="font-bold text-lg sm:text-xl tracking-wide">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* 7. SHORT ANSWER (PREGUNTAS ABIERTAS CORTAS) RENDERER */}
        {qType === 'short-answer' && (
          <div className="space-y-4 mb-6 sm:mb-8">
            <div className="p-5 rounded-3xl bg-thea-surfaceLight/60 border border-thea-border space-y-3.5 shadow-md">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Escribe tu respuesta analítica / técnica:
                </label>
                <span className="text-[11px] font-semibold text-violet-300 bg-violet-950/60 px-2.5 py-0.5 rounded-full border border-violet-500/30">
                  Respuesta Abierta Corta
                </span>
              </div>
              <textarea
                rows={3}
                disabled={isAnswered || isEvaluatingShortAnswer}
                value={shortAnswerInput}
                onChange={e => setShortAnswerInput(e.target.value)}
                placeholder="Escribe una respuesta fundamentada de 1 a 4 líneas. La IA evaluará la similitud conceptual y los puntos clave con la respuesta modelo..."
                className="w-full bg-thea-bg border border-thea-border rounded-2xl p-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all resize-y disabled:opacity-60"
              />
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{shortAnswerInput.trim().split(/\s+/).filter(Boolean).length} palabras</span>
                {!isAnswered && (
                  <button
                    type="button"
                    disabled={!shortAnswerInput.trim() || isEvaluatingShortAnswer}
                    onClick={handleSubmitShortAnswer}
                    className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer flex items-center gap-2 active:scale-95"
                  >
                    {isEvaluatingShortAnswer ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                        <span>Evaluando con IA...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Comprobar Respuesta</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Desglose de Evaluación de IA */}
            {isAnswered && shortAnswerEvalResult && (
              <div className="p-4 sm:p-5 rounded-2xl bg-violet-950/20 border border-violet-500/30 text-xs space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Similitud Conceptual con el Modelo:</span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
                      shortAnswerEvalResult.similarity >= 65
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}
                  >
                    {shortAnswerEvalResult.similarity}% de coincidencia
                  </span>
                </div>
                <p className="text-violet-200 leading-relaxed">
                  <strong className="text-white">Diagnóstico de la IA:</strong> {shortAnswerEvalResult.feedback}
                </p>
                <div className="p-3 rounded-xl bg-thea-surface border border-thea-border space-y-1">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 block">
                    Respuesta modelo de referencia:
                  </span>
                  <span className="text-slate-200 font-medium">
                    {currentQ.idealAnswer || currentQ.explanation}
                  </span>
                </div>
                {shortAnswerEvalResult.keyPointsCovered.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-400">Puntos cubiertos:</span>
                    {shortAnswerEvalResult.keyPointsCovered.map((kp, kIdx) => (
                      <span
                        key={kIdx}
                        className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px]"
                      >
                        {kp}
                      </span>
                    ))}
                  </div>
                )}
                {shortAnswerEvalResult.keyPointsMissed.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-400">Puntos que faltaron:</span>
                    {shortAnswerEvalResult.keyPointsMissed.map((kp, kIdx) => (
                      <span
                        key={kIdx}
                        className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border-rose-500/30 text-[10px]"
                      >
                        {kp}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ESTADO INMEDIATO DE LA RESPUESTA (CORRECTA / INCORRECTA) ─── */}
        {isAnswered && (
          <div className={`p-4 sm:p-5 rounded-2xl mb-6 flex items-center justify-between gap-3 border shadow-lg animate-feedbackPop ${
            isCurrentCorrect
              ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-200 ring-1 ring-emerald-500/40 shadow-emerald-950/40'
              : 'bg-rose-950/70 border-rose-500/60 text-rose-200 ring-1 ring-rose-500/40 shadow-rose-950/40'
          }`}>
            <div className="flex items-center gap-3.5">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold shadow-md animate-iconPop ${
                isCurrentCorrect ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'
              }`}>
                {isCurrentCorrect ? <Check className="w-5 h-5 sm:w-6 sm:h-6 stroke-[3]" /> : <X className="w-5 h-5 sm:w-6 sm:h-6 stroke-[3]" />}
              </div>
              <div>
                <p className="font-extrabold text-sm sm:text-base text-white flex items-center gap-2 flex-wrap">
                  <span>
                    {isManuallyOverridden
                      ? '¡Respuesta Reclasificada! (¡Tenía razón!)'
                      : isCurrentCorrect
                      ? '¡Respuesta Correcta!'
                      : 'Respuesta Incorrecta'}
                  </span>
                  {isCurrentCorrect && isCurrentQRevealed && (
                    <span className="text-[11px] font-bold text-amber-300 bg-amber-950/70 px-2.5 py-0.5 rounded-full border border-amber-500/40">
                      (No suma avance: revelada en banco)
                    </span>
                  )}
                </p>
                <p className="text-xs sm:text-sm opacity-95 mt-0.5">
                  {isCurrentCorrect
                    ? (isCurrentQRevealed
                        ? 'Has respondido correctamente. Esta pregunta fue revelada previamente en el Banco de Preguntas, por lo que no suma porcentaje al avance.'
                        : qType === 'matching'
                        ? `Has emparejado todos los conceptos con exactitud: ${correctMatchingFormula}.`
                        : qType === 'short-answer'
                        ? 'Tu respuesta coincide conceptualmente con la solución esperada.'
                        : 'Has identificado con exactitud el concepto del texto.')
                    : (qType === 'matching'
                        ? `Los emparejamientos correctos eran: ${correctMatchingFormula}`
                        : qType === 'short-answer'
                        ? `La respuesta esperada era: ${currentQ.idealAnswer || currentQ.explanation}`
                        : `La respuesta correcta es: ${
                            qType === 'true-false'
                              ? (safeCorrectIndex === 0 ? 'Verdadero' : 'Falso')
                              : qType === 'multi-select'
                              ? safeCorrectIndices.map(i => safeOptions[i] || `Opción ${i + 1}`).join(' • ')
                              : qType === 'drag-drop'
                              ? (effectiveBlanksCorrect.length > 0 ? effectiveBlanksCorrect.map((b, i) => `[${i + 1}] ${b}`).join(', ') : '')
                              : (safeOptions[safeCorrectIndex] || 'la opción correcta')
                          }`)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isCurrentCorrect && (
                <button
                  type="button"
                  onClick={handleIWasRight}
                  className="px-3.5 py-1.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-md cursor-pointer shrink-0 active:scale-95 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300"
                  title="Si consideras que tu respuesta era válida o la IA fue demasiado estricta, haz clic para marcarla como correcta"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-amber-300" />
                  <span>¡Tenía razón!</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowJustification(prev => !prev);
                  if (!showJustification) {
                    setTimeout(() => {
                      explanationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }, 50);
                  }
                }}
                className={`px-3.5 py-1.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-md cursor-pointer shrink-0 active:scale-95 ${
                  showJustification
                    ? 'bg-violet-600 hover:bg-violet-500 text-white ring-2 ring-violet-400/50 shadow-violet-900/40'
                    : 'bg-black/50 hover:bg-black/70 border border-white/20 text-white hover:border-violet-400'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-amber-300" />
                <span>{showJustification ? 'Ocultar Justificación' : 'Justificación'}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showJustification ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>
        )}

        {/* ── ACTION ROW: HISTORIAL DE PREGUNTAS + THUMBS UP / DOWN ────── */}
        <div className="flex items-center justify-between gap-3 mb-6 sm:mb-8">
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className="px-4 sm:px-5 py-2.5 rounded-full bg-[#d5c7ee] hover:bg-[#e4d8fb] text-[#1b113b] font-bold text-xs sm:text-sm transition-all shadow-sm hover:shadow cursor-pointer flex items-center gap-2 active:scale-95 min-h-[44px]"
          >
            <span>Historial de preguntas</span>
          </button>

          <div className="flex items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              onClick={() => setFeedbackGiven(feedbackGiven === 'up' ? null : 'up')}
              title="Pregunta clara y de alta calidad"
              className={`w-11 h-11 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-md transform hover:scale-110 active:scale-90 ${
                feedbackGiven === 'up'
                  ? 'bg-[#22c55e] text-white ring-2 ring-emerald-300 scale-105'
                  : 'bg-[#4ade80] hover:bg-[#22c55e] text-[#0f291e]'
              }`}
            >
              <ThumbsUp className="w-4 h-4 fill-current" />
            </button>
            <button
              type="button"
              onClick={() => setFeedbackGiven(feedbackGiven === 'down' ? null : 'down')}
              title="Reportar pregunta o redacción confusa"
              className={`w-11 h-11 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-md transform hover:scale-110 active:scale-90 ${
                feedbackGiven === 'down'
                  ? 'bg-[#ef4444] text-white ring-2 ring-rose-300 scale-105'
                  : 'bg-[#f87171] hover:bg-[#ef4444] text-[#3b0d0d]'
              }`}
            >
              <ThumbsDown className="w-4 h-4 fill-current" />
            </button>
          </div>
        </div>

        {/* ── CENTERED "SIGUIENTE PREGUNTA" / "SALTAR PREGUNTA" / "AVANZAR AL NIVEL" BUTTON ── */}
        <div className="flex justify-center mb-6 sm:mb-8">
          <button
            type="button"
            onClick={handleNext}
            disabled={isAdvancing}
            className={`w-full sm:w-auto justify-center px-8 py-3.5 rounded-full font-bold text-sm sm:text-base shadow-lg transition-all transform hover:scale-[1.03] active:scale-95 flex items-center gap-2 cursor-pointer min-h-[48px] ${
              isAdvancing ? 'opacity-70 pointer-events-none cursor-not-allowed' : ''
            } ${
              currentLevelCorrect >= levelTarget
                ? 'bg-gradient-to-r from-amber-400 via-amber-300 to-violet-300 hover:from-amber-300 hover:to-violet-200 text-slate-950 font-extrabold shadow-amber-500/25 ring-2 ring-amber-400/50'
                : 'bg-[#c8b6e2] hover:bg-[#d9caf2] text-[#1a1038]'
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

        {/* ── BOTÓN JUSTIFICACIÓN (VISIBLE TRAS RESPONDER SI AÚN NO ESTÁ ABIERTA) ── */}
        {isAnswered && !showJustification && (
          <div className="flex justify-center -mt-2 sm:-mt-4 mb-6 sm:mb-8 animate-fadeIn">
            <button
              type="button"
              onClick={() => {
                setShowJustification(true);
                setTimeout(() => {
                  explanationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 50);
              }}
              className="w-full sm:w-auto justify-center px-6 py-3 rounded-full bg-[#20183f] hover:bg-[#2b2054] border border-violet-500/40 hover:border-violet-400 text-violet-200 hover:text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer min-h-[44px]"
            >
              <FileText className="w-4 h-4 text-amber-400" />
              <span>Justificación</span>
              <ChevronDown className="w-4 h-4 text-violet-400" />
            </button>
          </div>
        )}

        {/* ── EXPLICACIÓN DETALLADA (SOLO SI SE PRESIONA EL BOTÓN JUSTIFICACIÓN) ─ */}
        {isAnswered && showJustification && (
          <div
            ref={explanationRef}
            className="mt-8 pt-6 border-t border-[#261c47] animate-fadeIn space-y-4"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  isCurrentCorrect ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                }`}>
                  {isCurrentCorrect ? <Check className="w-4 h-4 stroke-[3]" /> : <X className="w-4 h-4 stroke-[3]" />}
                </div>
                <h3 className="font-bold text-base text-white">
                  {isCurrentCorrect ? '¡Respuesta Correcta! Fundamento Conceptual:' : 'Respuesta Incorrecta: Análisis del Concepto y Descarte:'}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowJustification(false)}
                  className="px-3 py-1.5 rounded-xl bg-thea-surfaceLight border border-thea-border/80 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-500 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Ocultar Justificación"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Ocultar</span>
                </button>
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
                  className="px-3 py-1.5 rounded-xl bg-violet-950/80 border border-violet-500/40 text-violet-300 hover:text-white hover:bg-violet-600/40 transition-all text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <FileSearch className="w-3.5 h-3.5 text-violet-400" />
                  <span>Fragmento RAG Original</span>
                </button>
                <button
                  onClick={() => handleReadAloud(currentQ.explanation)}
                  className={`p-2 rounded-xl border border-thea-border text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isSpeaking ? 'bg-violet-600 text-white' : 'bg-thea-surfaceLight text-slate-400 hover:text-white'
                  }`}
                  title="Escuchar explicación"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl bg-[#181138]/90 border border-[#2e2258] text-slate-200 text-sm sm:text-base leading-relaxed shadow-lg">
              <FormattedText text={currentQ.explanation} />
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400 px-1">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>
                Contexto cerrado RAG: sustentado en {currentQ.sourcePageOrSlide ? `Pág./Diapositiva ${currentQ.sourcePageOrSlide}` : 'el documento fuente original'}
              </span>
            </div>
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
                    className="rounded-xl overflow-hidden bg-black/40 border border-thea-border/60 flex items-center justify-center p-2 max-h-60 cursor-pointer hover:border-violet-500/80 transition-colors group relative"
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

