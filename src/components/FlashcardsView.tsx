import React, { useState, useEffect } from 'react';
import type { StudyKit, Flashcard } from '../types';
import {
  Layers,
  Gamepad2,
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
  Timer,
  Trophy,
  Flame,
  RotateCcw,
  ArrowLeft,
} from 'lucide-react';
import {
  generateAIFlashcards,
  generateAdditionalAIFlashcards,
  generateTargetedAIFlashcards,
} from '../services/aiService';
import { FormattedText } from './FormattedText';

interface FlashcardsViewProps {
  kit: StudyKit;
  onUpdateKit?: (updatedKit: StudyKit) => void;
}

export const FlashcardsView: React.FC<FlashcardsViewProps> = ({ kit, onUpdateKit }) => {
  const [cards, setCards] = useState<Flashcard[]>(kit.flashcards || []);
  const [archivedCards, setArchivedCards] = useState<Flashcard[]>(kit.archivedFlashcards || []);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [gameMode, setGameMode] = useState<'study' | 'matching'>('study');
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

  // Term Matching Game State (Modo Dinámico sin Scroll estilo Duolingo/Quizlet)
  const [matchDeck, setMatchDeck] = useState<Flashcard[]>([]);
  const [activeTerms, setActiveTerms] = useState<{ id: string; term: string }[]>([]);
  const [activeDefs, setActiveDefs] = useState<{ id: string; definition: string }[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const [selectedDef, setSelectedDef] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [wrongPair, setWrongPair] = useState<{ termId: string; defId: string } | null>(null);
  const [correctPair, setCorrectPair] = useState<string | null>(null);
  const [timerSeconds, setTimerSeconds] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [streak, setStreak] = useState<number>(0);
  const [bestStreak, setBestStreak] = useState<number>(0);
  const [mistakesCount, setMistakesCount] = useState<number>(0);
  const [isGameComplete, setIsGameComplete] = useState<boolean>(false);
  const [bestTime, setBestTime] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem(`thea_match_best_${kit.id}`);
      return saved ? parseFloat(saved) : null;
    } catch {
      return null;
    }
  });

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
    setCards(prev => {
      const updated = prev.map((c, i) => (i === currentIdx ? { ...c, mastery } : c));
      if (onUpdateKit) {
        onUpdateKit({ ...kit, flashcards: updated, archivedFlashcards: archivedCards });
      }
      return updated;
    });
    setIsFlipped(false);
    setCurrentIdx(prev => (prev + 1) % cards.length);
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

  // Cronómetro de alta precisión en segundos con decimales
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTimerRunning && !isGameComplete && gameMode === 'matching') {
      const startMs = Date.now() - timerSeconds * 1000;
      interval = setInterval(() => {
        setTimerSeconds(+((Date.now() - startMs) / 1000).toFixed(1));
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, isGameComplete, gameMode]);

  const formatMatchTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const tenths = Math.floor((secs % 1) * 10);
    return `${m > 0 ? `${m}m ` : ''}${s < 10 && m > 0 ? '0' : ''}${s}.${tenths}s`;
  };

  // Inicializar o reiniciar partida de Match (4 pares activos a la vez)
  const startNewMatchGame = () => {
    if (cards.length === 0) return;
    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    setMatchDeck(shuffled);
    const initialBatch = shuffled.slice(0, Math.min(4, shuffled.length));

    const terms = [...initialBatch]
      .map(c => ({ id: c.id, term: c.term }))
      .sort(() => Math.random() - 0.5);

    const defs = [...initialBatch]
      .map(c => ({ id: c.id, definition: c.definition }))
      .sort(() => Math.random() - 0.5);

    setActiveTerms(terms);
    setActiveDefs(defs);
    setMatchedIds([]);
    setSelectedTerm(null);
    setSelectedDef(null);
    setWrongPair(null);
    setCorrectPair(null);
    setTimerSeconds(0);
    setIsTimerRunning(true);
    setStreak(0);
    setBestStreak(0);
    setMistakesCount(0);
    setIsGameComplete(false);
  };

  // Auto-iniciar si entra a matching y no hay tarjetas activas
  useEffect(() => {
    if (gameMode === 'matching' && activeTerms.length === 0 && cards.length > 0 && !isGameComplete) {
      startNewMatchGame();
    }
  }, [gameMode, cards.length]);

  const handleTermClick = (id: string) => {
    if (isGameComplete || correctPair || wrongPair) return;
    if (selectedTerm === id) {
      setSelectedTerm(null);
      return;
    }
    setSelectedTerm(id);
    if (selectedDef) {
      evaluateMatch(id, selectedDef);
    }
  };

  const handleDefClick = (id: string) => {
    if (isGameComplete || correctPair || wrongPair) return;
    if (selectedDef === id) {
      setSelectedDef(null);
      return;
    }
    setSelectedDef(id);
    if (selectedTerm) {
      evaluateMatch(selectedTerm, id);
    }
  };

  const evaluateMatch = (termId: string, defId: string) => {
    if (termId === defId) {
      // Par correcto: feedback visual y sonoro inmediato
      setCorrectPair(termId);
      playAudioFeedback('correct');
      setStreak(prev => {
        const next = prev + 1;
        setBestStreak(b => Math.max(b, next));
        return next;
      });

      setTimeout(() => {
        const nextMatched = [...matchedIds, termId];
        setMatchedIds(nextMatched);

        const isFinished = nextMatched.length === cards.length;
        if (isFinished) {
          setIsTimerRunning(false);
          setIsGameComplete(true);
          playAudioFeedback('victory');

          try {
            const savedBest = localStorage.getItem(`thea_match_best_${kit.id}`);
            const currentBest = savedBest ? parseFloat(savedBest) : null;
            if (!currentBest || timerSeconds < currentBest) {
              localStorage.setItem(`thea_match_best_${kit.id}`, timerSeconds.toString());
              setBestTime(timerSeconds);
            }
          } catch {
            // Manejo silencioso de localStorage
          }
        } else {
          // Reposición sin mover los demás elementos
          const currentlyActiveIds = new Set(activeTerms.map(t => t.id));
          const matchedSet = new Set(nextMatched);
          const nextCard = matchDeck.find(c => !currentlyActiveIds.has(c.id) && !matchedSet.has(c.id));

          if (nextCard) {
            setActiveTerms(prev => prev.map(t => t.id === termId ? { id: nextCard.id, term: nextCard.term } : t));
            setActiveDefs(prev => prev.map(d => d.id === termId ? { id: nextCard.id, definition: nextCard.definition } : d));
          } else {
            setActiveTerms(prev => prev.filter(t => t.id !== termId));
            setActiveDefs(prev => prev.filter(d => d.id !== termId));
          }
        }

        setSelectedTerm(null);
        setSelectedDef(null);
        setCorrectPair(null);
      }, 320);
    } else {
      // Par incorrecto: shake y penalización
      setWrongPair({ termId, defId });
      playAudioFeedback('wrong');
      setStreak(0);
      setMistakesCount(m => m + 1);

      setTimeout(() => {
        setSelectedTerm(null);
        setSelectedDef(null);
        setWrongPair(null);
      }, 450);
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

  if (gameMode === 'matching') {
    return (
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2 sm:py-3 h-[calc(100vh-4.5rem)] max-h-[860px] flex flex-col justify-between select-none overflow-hidden animate-fadeIn relative">
        {/* Cabecera del Juego: Botón Salir, Título, Cronómetro, Racha, Récord y Reiniciar */}
        <div className="flex items-center justify-between gap-2 sm:gap-4 shrink-0 pb-2 border-b border-thea-border/80">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => {
                setGameMode('study');
                setIsTimerRunning(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-xs font-bold text-slate-300 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95"
              title="Volver a la vista de estudio de Flashcards"
            >
              <ArrowLeft className="w-4 h-4 text-violet-400" />
              <span className="hidden sm:inline">Volver a Flashcards</span>
            </button>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-1.5">
                <Gamepad2 className="w-5 h-5 text-amber-400" />
                <span>Match Contrareloj</span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Cronómetro Digital */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#20183d] border border-violet-500/40 text-violet-200 font-mono text-xs sm:text-sm font-extrabold shadow-inner">
              <Timer className="w-4 h-4 text-violet-400" />
              <span>{formatMatchTime(timerSeconds)}</span>
            </div>

            {/* Racha de Aciertos */}
            <div
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-extrabold transition-all ${
                streak > 1
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 ring-1 ring-amber-400/40 animate-pulse'
                  : 'bg-thea-surface border-thea-border text-slate-400'
              }`}
              title="Racha de emparejamientos seguidos sin fallos"
            >
              <Flame className={`w-3.5 h-3.5 ${streak > 1 ? 'fill-amber-400 text-amber-400' : 'text-slate-500'}`} />
              <span>{streak}x</span>
            </div>

            {/* Mejor Récord */}
            {bestTime !== null && (
              <div
                className="hidden md:flex items-center gap-1 text-xs font-bold text-amber-300 bg-amber-950/40 border border-amber-500/30 px-2.5 py-1.5 rounded-xl"
                title="Tu mejor récord personal en este kit"
              >
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span>{formatMatchTime(bestTime)}</span>
              </div>
            )}

            {/* Reiniciar Partida */}
            <button
              type="button"
              onClick={startNewMatchGame}
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border hover:border-violet-500/40 text-xs font-bold text-slate-300 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95 flex items-center gap-1"
              title="Reiniciar y barajar de nuevo"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400 hover:rotate-180 transition-transform" />
              <span className="hidden lg:inline">Reiniciar</span>
            </button>
          </div>
        </div>

        {/* Barra de Progreso del Mazo */}
        <div className="shrink-0 my-1.5">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-1 px-0.5">
            <span>Progreso del Mazo</span>
            <span className="text-violet-300">
              {matchedIds.length} / {cards.length} pares completados ({cards.length > 0 ? Math.round((matchedIds.length / cards.length) * 100) : 0}%)
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[#1b1435] overflow-hidden border border-violet-900/30">
            <div
              className="h-full bg-gradient-to-r from-violet-600 via-indigo-500 to-emerald-400 transition-all duration-300 rounded-full"
              style={{ width: `${cards.length > 0 ? Math.min(100, Math.round((matchedIds.length / cards.length) * 100)) : 0}%` }}
            />
          </div>
        </div>

        {/* Tablero de Juego (2 Columnas Simétricas ajustadas a la altura de la ventana, sin scroll) */}
        {cards.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-300">
              <Layers className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-white">No hay tarjetas disponibles</h3>
            <p className="text-xs text-slate-400 max-w-sm">Genera tarjetas primero en el Modo Flashcards para poder jugar a emparejar conceptos.</p>
            <button
              type="button"
              onClick={() => setGameMode('study')}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs cursor-pointer shadow-lg transition-all"
            >
              Ir a Modo Flashcards
            </button>
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-2 gap-2.5 sm:gap-4 my-1.5">
            {/* Columna Izquierda: Conceptos */}
            <div className="flex flex-col h-full min-h-0">
              <div className="flex items-center justify-between pb-1 px-1 shrink-0">
                <span className="text-[11px] sm:text-xs font-bold text-violet-300 uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-violet-400" />
                  Conceptos ({activeTerms.length})
                </span>
                <span className="text-[10px] text-slate-400 font-medium">Toca para seleccionar</span>
              </div>
              <div className="flex-1 min-h-0 grid grid-rows-4 gap-2 sm:gap-2.5 h-[calc(100%-1.75rem)]">
                {activeTerms.map(item => {
                  const isSelected = selectedTerm === item.id;
                  const isWrong = wrongPair?.termId === item.id;
                  const isCorrect = correctPair === item.id;

                  let cardStyle = 'border-thea-border/80 bg-[#181138]/85 hover:border-violet-500/60 hover:bg-[#20174a] text-slate-200';
                  if (isSelected) cardStyle = 'border-amber-400 bg-amber-400/20 text-amber-200 ring-2 ring-amber-400/60 shadow-lg shadow-amber-500/20 scale-[1.01]';
                  if (isCorrect) cardStyle = 'border-emerald-400 bg-emerald-950/80 text-emerald-200 ring-2 ring-emerald-400 scale-[1.02] animate-cardCorrect';
                  if (isWrong) cardStyle = 'border-rose-500 bg-rose-950/80 text-rose-200 ring-2 ring-rose-500 animate-cardError';

                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={Boolean(correctPair)}
                      onClick={() => handleTermClick(item.id)}
                      className={`w-full h-full min-h-0 p-2 sm:p-3 rounded-2xl border transition-all duration-150 flex items-center justify-center text-center cursor-pointer select-none shadow-sm ${cardStyle}`}
                    >
                      <span className="font-extrabold text-xs sm:text-sm md:text-base leading-snug line-clamp-3 sm:line-clamp-4">
                        <FormattedText text={item.term} inlineOnly={true} />
                      </span>
                    </button>
                  );
                })}
                {/* Slots vacíos de soporte para mantener cuadrícula fija cuando se agota la baraja */}
                {Array.from({ length: Math.max(0, 4 - activeTerms.length) }).map((_, i) => (
                  <div
                    key={`placeholder-term-${i}`}
                    className="w-full h-full min-h-0 rounded-2xl border border-dashed border-violet-900/20 bg-violet-950/5 opacity-20 pointer-events-none"
                  />
                ))}
              </div>
            </div>

            {/* Columna Derecha: Definiciones */}
            <div className="flex flex-col h-full min-h-0">
              <div className="flex items-center justify-between pb-1 px-1 shrink-0">
                <span className="text-[11px] sm:text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-purple-400" />
                  Definiciones ({activeDefs.length})
                </span>
                <span className="text-[10px] text-slate-400 font-medium">Empareja el concepto</span>
              </div>
              <div className="flex-1 min-h-0 grid grid-rows-4 gap-2 sm:gap-2.5 h-[calc(100%-1.75rem)]">
                {activeDefs.map(item => {
                  const isSelected = selectedDef === item.id;
                  const isWrong = wrongPair?.defId === item.id;
                  const isCorrect = correctPair === item.id;

                  let cardStyle = 'border-thea-border/80 bg-[#181138]/85 hover:border-purple-500/60 hover:bg-[#20174a] text-slate-200';
                  if (isSelected) cardStyle = 'border-amber-400 bg-amber-400/20 text-amber-200 ring-2 ring-amber-400/60 shadow-lg shadow-amber-500/20 scale-[1.01]';
                  if (isCorrect) cardStyle = 'border-emerald-400 bg-emerald-950/80 text-emerald-200 ring-2 ring-emerald-400 scale-[1.02] animate-cardCorrect';
                  if (isWrong) cardStyle = 'border-rose-500 bg-rose-950/80 text-rose-200 ring-2 ring-rose-500 animate-cardError';

                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={Boolean(correctPair)}
                      onClick={() => handleDefClick(item.id)}
                      title={item.definition}
                      className={`w-full h-full min-h-0 p-2 sm:p-3 rounded-2xl border transition-all duration-150 flex items-center justify-center text-center cursor-pointer select-none shadow-sm ${cardStyle}`}
                    >
                      <span className="font-medium text-[11px] sm:text-xs md:text-sm leading-snug sm:leading-relaxed text-slate-200 line-clamp-4 sm:line-clamp-5">
                        <FormattedText text={item.definition} inlineOnly={true} />
                      </span>
                    </button>
                  );
                })}
                {/* Slots vacíos de soporte para mantener cuadrícula fija cuando se agota la baraja */}
                {Array.from({ length: Math.max(0, 4 - activeDefs.length) }).map((_, i) => (
                  <div
                    key={`placeholder-def-${i}`}
                    className="w-full h-full min-h-0 rounded-2xl border border-dashed border-purple-900/20 bg-purple-950/5 opacity-20 pointer-events-none"
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Barra Inferior: Guía y Contador de Fallos */}
        <div className="shrink-0 pt-2 border-t border-thea-border/60 flex items-center justify-between text-[11px] text-slate-400 px-1">
          <span className="truncate mr-2">
            Toca un concepto y su definición. Los pares acertados desaparecen y se reponen automáticamente hasta agotar el mazo.
          </span>
          <span className="shrink-0 font-bold text-slate-400">
            Fallos: <span className={mistakesCount > 0 ? 'text-rose-400' : 'text-slate-400'}>{mistakesCount}</span>
          </span>
        </div>

        {/* Modal de Victoria (Fin del Juego) */}
        {isGameComplete && (
          <div className="absolute inset-0 z-30 bg-[#0f0a21]/95 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
            <div className="max-w-md w-full bg-[#181138] border border-emerald-500/40 rounded-3xl p-6 sm:p-8 text-center shadow-2xl relative overflow-hidden animate-feedbackPop">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center mx-auto mb-4 text-emerald-300 shadow-lg shadow-emerald-500/10">
                <Trophy className="w-8 h-8 animate-iconPop" />
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-white mb-1">
                ¡Baraja Completada!
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 mb-6">
                Has emparejado todos los conceptos y definiciones con éxito.
              </p>

              {/* Grid de Métricas */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
                <div className="p-3 rounded-2xl bg-violet-950/40 border border-violet-500/30">
                  <span className="text-[10px] uppercase font-bold text-violet-300 block mb-1">
                    Tiempo
                  </span>
                  <span className="text-base sm:text-lg font-black text-white">
                    {formatMatchTime(timerSeconds)}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-500/30">
                  <span className="text-[10px] uppercase font-bold text-amber-300 block mb-1">
                    Mejor Racha
                  </span>
                  <span className="text-base sm:text-lg font-black text-amber-300 flex items-center justify-center gap-0.5">
                    <Flame className="w-4 h-4 fill-amber-400 text-amber-400" />
                    {bestStreak}x
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-emerald-950/40 border border-emerald-500/30">
                  <span className="text-[10px] uppercase font-bold text-emerald-300 block mb-1">
                    Precisión
                  </span>
                  <span className="text-base sm:text-lg font-black text-emerald-300">
                    {Math.round((cards.length / Math.max(cards.length, cards.length + mistakesCount)) * 100)}%
                  </span>
                </div>
              </div>

              {bestTime !== null && timerSeconds <= bestTime && (
                <div className="mb-6 py-2 px-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>¡Nuevo Récord Personal!</span>
                </div>
              )}

              {/* Botones de Acción */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={startNewMatchGame}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs sm:text-sm shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Jugar Otra Vez</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGameMode('study');
                    setIsTimerRunning(false);
                  }}
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
            <span>Flashcards & Juegos Contrareloj Study</span>
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
              setGameMode('matching');
              startNewMatchGame();
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/40 text-xs font-bold text-violet-200 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <Gamepad2 className="w-4 h-4 text-amber-400" />
            <span>Jugar Match</span>
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
