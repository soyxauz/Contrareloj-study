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
} from 'lucide-react';
import { generateAIFlashcards, generateAdditionalAIFlashcards } from '../services/aiService';
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

  const currentCard = cards[currentIdx % (cards.length || 1)];

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
            <span>Flashcards & Juegos Thea</span>
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
              {/* CARA FRONTAL (TÉRMINO CLAVE) */}
              <div className="card-face rounded-3xl bg-gradient-to-tr from-[#140e2e] via-[#1a123d] to-[#25184f] border-2 border-[#332263] group-hover:border-violet-500/70 transition-all p-8 sm:p-14 shadow-2xl flex flex-col items-center justify-between text-center">
                <div className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-widest text-violet-300/80">
                  <span>TÉRMINO CLAVE</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-900/40 border border-violet-500/30 text-violet-300">
                    Frente
                  </span>
                </div>

                <div className="max-w-2xl w-full flex items-center justify-center my-auto py-4">
                  <div className={`text-white text-center w-full ${termTypographyClasses}`}>
                    <FormattedText text={currentCard.term} inlineOnly={true} className="whitespace-pre-line" />
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400 group-hover:text-amber-300 transition-colors font-medium">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Haz clic para voltear y ver la definición</span>
                </div>
              </div>

              {/* CARA POSTERIOR (DEFINICIÓN & CONCEPTO) */}
              <div className="card-face card-back rounded-3xl bg-gradient-to-tr from-[#121933] via-[#152347] to-[#1e3366] border-2 border-indigo-500/60 group-hover:border-indigo-400 transition-all p-8 sm:p-14 shadow-2xl flex flex-col items-center justify-between text-center">
                <div className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-widest text-indigo-300/80">
                  <span>DEFINICIÓN & CONCEPTO DIDÁCTICO</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-900/40 border border-indigo-500/30 text-indigo-300">
                    Reverso
                  </span>
                </div>

                <div className="max-w-2xl w-full flex items-center justify-center my-auto py-4">
                  <div className={`text-center w-full ${definitionTypographyClasses}`}>
                    <FormattedText text={currentCard.definition} inlineOnly={true} className="whitespace-pre-line" />
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400 group-hover:text-amber-300 transition-colors font-medium">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Haz clic para volver a ver el término</span>
                </div>
              </div>
            </div>
          </div>

          {/* Navegación y Evaluación de Dominio */}
          <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
            <button
              type="button"
              onClick={handlePrevCard}
              className="p-3.5 rounded-2xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-slate-300 hover:text-white transition-all cursor-pointer shadow-md flex items-center gap-1.5 text-xs font-bold active:scale-95"
              title="Tarjeta anterior"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Anterior</span>
            </button>

            {/* Botones de Evaluación */}
            <div className="flex items-center gap-2.5 sm:gap-3 flex-1 justify-center max-w-md">
              <button
                type="button"
                onClick={() => handleUpdateMastery('to-learn')}
                className="flex-1 py-3 px-3 rounded-2xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/40 text-rose-200 font-bold text-xs sm:text-sm transition-all text-center cursor-pointer shadow-md hover:scale-[1.02] active:scale-95"
              >
                Aún no la sé
              </button>
              <button
                type="button"
                onClick={() => handleUpdateMastery('known')}
                className="flex-1 py-3 px-3 rounded-2xl bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/40 text-amber-200 font-bold text-xs sm:text-sm transition-all text-center cursor-pointer shadow-md hover:scale-[1.02] active:scale-95"
              >
                La conozco
              </button>
              <button
                type="button"
                onClick={() => handleUpdateMastery('mastered')}
                className="flex-1 py-3 px-3 rounded-2xl bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-200 font-bold text-xs sm:text-sm transition-all text-center cursor-pointer shadow-md hover:scale-[1.02] active:scale-95"
              >
                ¡Dominada!
              </button>
            </div>

            <button
              type="button"
              onClick={handleNextCard}
              className="p-3.5 rounded-2xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-slate-300 hover:text-white transition-all cursor-pointer shadow-md flex items-center gap-1.5 text-xs font-bold active:scale-95"
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
    </div>
  );
};
