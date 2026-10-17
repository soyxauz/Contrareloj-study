import React, { useState } from 'react';
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

  // Term Matching Game State
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const [selectedDef, setSelectedDef] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);

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

  const handleMatchingClick = (id: string, type: 'term' | 'def') => {
    if (type === 'term') {
      setSelectedTerm(id);
      if (selectedDef) {
        if (id === selectedDef) {
          setMatchedIds(prev => [...prev, id]);
        }
        setSelectedTerm(null);
        setSelectedDef(null);
      }
    } else {
      setSelectedDef(id);
      if (selectedTerm) {
        if (id === selectedTerm) {
          setMatchedIds(prev => [...prev, id]);
        }
        setSelectedTerm(null);
        setSelectedDef(null);
      }
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
              setGameMode(gameMode === 'study' ? 'matching' : 'study');
              setMatchedIds([]);
              setSelectedTerm(null);
              setSelectedDef(null);
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-xs font-bold text-amber-300 hover:text-amber-200 transition-colors cursor-pointer"
          >
            <Gamepad2 className="w-4 h-4" />
            <span>{gameMode === 'study' ? 'Jugar Match' : 'Modo Flashcards'}</span>
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
      ) : (
        /* Term Matching Game */
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-violet-950/30 border border-violet-500/30 text-xs sm:text-sm text-violet-200">
            <strong>Reglas del Juego:</strong> Selecciona un término de la izquierda y haz match con su definición correspondiente a la derecha lo más rápido posible.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Terms Column */}
            <div className="space-y-3">
              <span className="text-sm font-bold text-slate-300 uppercase tracking-wider block mb-2">Términos:</span>
              {cards.map(c => {
                const isMatched = matchedIds.includes(c.id);
                const isSelected = selectedTerm === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={isMatched}
                    onClick={() => handleMatchingClick(c.id, 'term')}
                    className={`w-full p-4 sm:p-5 rounded-2xl border text-left text-base sm:text-lg font-bold transition-all cursor-pointer ${
                      isMatched
                        ? 'opacity-30 border-emerald-500/30 bg-emerald-950/20 text-emerald-300 line-through'
                        : isSelected
                        ? 'border-amber-400 bg-amber-400/20 text-amber-300 ring-2 ring-amber-400'
                        : 'border-thea-border bg-thea-surface hover:border-violet-500 text-white'
                    }`}
                  >
                    <FormattedText text={c.term} inlineOnly={true} />
                  </button>
                );
              })}
            </div>

            {/* Definitions Column */}
            <div className="space-y-3">
              <span className="text-sm font-bold text-slate-300 uppercase tracking-wider block mb-2">Definiciones:</span>
              {[...cards].reverse().map(c => {
                const isMatched = matchedIds.includes(c.id);
                const isSelected = selectedDef === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={isMatched}
                    onClick={() => handleMatchingClick(c.id, 'def')}
                    className={`w-full p-4 sm:p-5 rounded-2xl border text-left text-sm sm:text-base font-medium leading-relaxed transition-all cursor-pointer ${
                      isMatched
                        ? 'opacity-30 border-emerald-500/30 bg-emerald-950/20 text-emerald-300 line-through'
                        : isSelected
                        ? 'border-amber-400 bg-amber-400/20 text-amber-300 ring-2 ring-amber-400'
                        : 'border-thea-border bg-thea-surface hover:border-violet-500 text-slate-200'
                    }`}
                  >
                    <FormattedText text={c.definition} inlineOnly={true} />
                  </button>
                );
              })}
            </div>
          </div>

          {matchedIds.length === cards.length && (
            <div className="p-6 rounded-3xl bg-emerald-950/30 border border-emerald-500/40 text-center animate-fadeIn">
              <h4 className="text-xl font-bold text-emerald-300 mb-1">¡Perfecto! Todos los pares completados</h4>
              <p className="text-xs sm:text-sm text-slate-300 mb-4">Has emparejado todas las flashcards con éxito.</p>
              <button
                type="button"
                onClick={() => setMatchedIds([])}
                className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm cursor-pointer shadow-lg"
              >
                Jugar de Nuevo
              </button>
            </div>
          )}
        </div>
      )}

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
