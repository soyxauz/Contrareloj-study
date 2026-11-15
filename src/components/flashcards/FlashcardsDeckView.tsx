import React, { useState, useEffect, useCallback } from 'react';
import type { Flashcard } from '../../types';
import {
  ChevronLeft,
  ChevronRight,
  Shuffle,
  CheckCircle2,
} from 'lucide-react';
import { gameAudio } from './games/gameAudio';
import { cleanConceptDefinition, cleanConceptTerm } from './flashcardSanitizer';
import { FormattedText } from '../FormattedText';
import { useTheme } from '../../services/themeService';

interface FlashcardsDeckViewProps {
  cards: Flashcard[];
  onUpdateMastery: (cardId: string, mastery: 'to-learn' | 'known' | 'mastered') => void;
}

const getCardTerm = (c: Flashcard): string => cleanConceptTerm(c.term || (c as any).frontText || '');
const getCardDef = (c: Flashcard): string => cleanConceptDefinition(c.definition || (c as any).backText || '');

export const FlashcardsDeckView: React.FC<FlashcardsDeckViewProps> = ({
  cards,
  onUpdateMastery,
}) => {
  const { theme } = useTheme();
  const [deck, setDeck] = useState<Flashcard[]>(cards);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    setDeck(cards);
  }, [cards]);

  const currentCard = deck[currentIdx] || null;

  const handleFlip = useCallback(() => {
    gameAudio.playTap();
    setIsFlipped(prev => !prev);
  }, []);

  const handlePrev = useCallback(() => {
    if (currentIdx > 0) {
      gameAudio.playTap();
      setIsFlipped(false);
      setCurrentIdx(prev => prev - 1);
    }
  }, [currentIdx]);

  const handleNext = useCallback(() => {
    if (currentIdx < deck.length - 1) {
      gameAudio.playTap();
      setIsFlipped(false);
      setCurrentIdx(prev => prev + 1);
    }
  }, [currentIdx, deck.length]);

  const handleShuffle = () => {
    gameAudio.playTap();
    const shuffled = [...deck].sort(() => Math.random() - 0.5);
    setDeck(shuffled);
    setCurrentIdx(0);
    setIsFlipped(false);
  };

  const handleSetMastery = (level: 'to-learn' | 'known' | 'mastered') => {
    if (!currentCard) return;
    if (level === 'mastered') gameAudio.playSuccess();
    else gameAudio.playTap();

    onUpdateMastery(currentCard.id, level);

    // Auto advance to next card after brief moment
    if (currentIdx < deck.length - 1) {
      setTimeout(() => {
        handleNext();
      }, 250);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleFlip();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFlip, handleNext, handlePrev]);

  if (deck.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        No hay tarjetas disponibles en este mazo.
      </div>
    );
  }

  const masteredCount = deck.filter(c => c.mastery === 'mastered').length;

  return (
    <div className={`w-full max-w-3xl mx-auto py-1 sm:py-2 px-2 sm:px-4 flex-1 flex flex-col items-center justify-center animate-fadeIn ${
      theme === 'kitty' ? 'text-pink-950' : theme === 'light' ? 'text-slate-900' : 'text-slate-100'
    }`}>
      {/* Top Stats & Progress Bar */}
      <div className={`w-full max-w-2xl flex items-center justify-between mb-2 text-xs font-semibold tabular-nums ${
        theme === 'kitty' ? 'text-pink-800' : theme === 'light' ? 'text-slate-600' : 'text-slate-400'
      }`}>
        <div>
          Tarjeta <strong className={`text-sm ${
            theme === 'kitty' ? 'text-pink-950 font-black' : theme === 'light' ? 'text-slate-950 font-black' : 'text-white'
          }`}>{currentIdx + 1}</strong> de {deck.length}
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-emerald-500 dark:text-emerald-400 font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{masteredCount} dominadas</span>
          </span>
          <button
            type="button"
            onClick={handleShuffle}
            title="Rebarajar tarjetas"
            className={`p-1.5 rounded-lg transition-colors cursor-pointer active:scale-95 ${
              theme === 'kitty'
                ? 'bg-pink-100/70 hover:bg-pink-200 text-pink-700'
                : theme === 'light'
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                : 'bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white'
            }`}
          >
            <Shuffle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress Line */}
      <div className={`w-full max-w-2xl h-1.5 rounded-full overflow-hidden mb-3.5 ${
        theme === 'kitty' ? 'bg-pink-100' : theme === 'light' ? 'bg-slate-200' : 'bg-white/[0.08]'
      }`}>
        <div
          className={`h-full transition-all duration-200 ${
            theme === 'kitty'
              ? 'bg-gradient-to-r from-pink-400 to-rose-500'
              : 'bg-gradient-to-r from-purple-500 to-indigo-500'
          }`}
          style={{ width: `${((currentIdx + 1) / deck.length) * 100}%` }}
        />
      </div>

      {/* ── AUTÉNTICA PERSPECTIVA 3D QUE VOLTEA LA TARJETA SUAVEMENTE ── */}
      <div className="perspective-card w-full max-w-2xl h-[250px] sm:h-[280px] md:h-[300px] max-h-[46vh]">
        <div
          onClick={handleFlip}
          className={`card-inner ${isFlipped ? 'is-flipped' : ''} cursor-pointer select-none group h-full rounded-3xl relative`}
        >
          {/* CARA FRONTAL (TÉRMINO O CONCEPTO) */}
          <div
            className={`card-face rounded-3xl border p-5 sm:p-8 shadow-2xl flex flex-col justify-between select-none ${
              theme === 'kitty'
                ? 'bg-white hover:bg-pink-50/30 border-2 border-pink-200 hover:border-pink-300 text-pink-950 shadow-[0_12px_40px_rgba(236,72,153,0.12)]'
                : theme === 'light'
                ? 'bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-900 shadow-xl'
                : 'bg-[#140e2b]/95 hover:bg-[#191136] border-white/[0.12] hover:border-purple-400/40 text-white'
            }`}
            style={{
              boxShadow:
                theme === 'kitty'
                  ? '0 12px 40px rgba(236, 72, 153, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.95)'
                  : theme === 'light'
                  ? '0 8px 30px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.95)'
                  : '0 12px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            }}
          >
            {/* Top hint tag */}
            <div className={`flex items-center justify-between text-xs font-bold uppercase tracking-wider ${
              theme === 'kitty' ? 'text-pink-600' : theme === 'light' ? 'text-indigo-600' : 'text-purple-300/80'
            }`}>
              <span>Concepto</span>
              <span className={`font-normal lowercase text-[11px] transition-colors ${
                theme === 'kitty' ? 'text-pink-400 group-hover:text-pink-600' : theme === 'light' ? 'text-slate-400 group-hover:text-slate-600' : 'text-slate-500 group-hover:text-slate-400'
              }`}>
                clic o espacio para voltear
              </span>
            </div>

            {/* Card Main Term */}
            <div className="my-auto text-center py-3 overflow-y-auto max-h-[28vh]">
              <div className={`text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight leading-relaxed ${
                theme === 'kitty' ? 'text-pink-950 font-black' : theme === 'light' ? 'text-slate-950 font-black' : 'text-white'
              }`}>
                <FormattedText text={currentCard ? getCardTerm(currentCard) : ''} inlineOnly />
              </div>
            </div>

            {/* Current mastery status badge */}
            <div className="flex items-center justify-center">
              <span className={`text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                currentCard?.mastery === 'mastered'
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
                  : currentCard?.mastery === 'known'
                  ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30'
                  : theme === 'kitty'
                  ? 'bg-pink-100 text-pink-700 border border-pink-200'
                  : theme === 'light'
                  ? 'bg-slate-100 text-slate-600 border border-slate-200'
                  : 'bg-slate-700/40 text-slate-400 border border-white/[0.08]'
              }`}>
                {currentCard?.mastery === 'mastered'
                  ? 'Dominada'
                  : currentCard?.mastery === 'known'
                  ? 'En Repaso'
                  : 'Por Aprender'}
              </span>
            </div>
          </div>

          {/* CARA TRASERA (DEFINICIÓN) */}
          <div
            className={`card-face card-back rounded-3xl border p-5 sm:p-8 shadow-2xl flex flex-col justify-between select-none ${
              theme === 'kitty'
                ? 'bg-white hover:bg-pink-50/30 border-2 border-pink-200 hover:border-pink-300 text-pink-950 shadow-[0_12px_40px_rgba(236,72,153,0.12)]'
                : theme === 'light'
                ? 'bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-900 shadow-xl'
                : 'bg-[#16102c]/95 hover:bg-[#1b1338] border-white/[0.12] hover:border-purple-400/40 text-white'
            }`}
            style={{
              boxShadow:
                theme === 'kitty'
                  ? '0 12px 40px rgba(236, 72, 153, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.95)'
                  : theme === 'light'
                  ? '0 8px 30px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.95)'
                  : '0 12px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            }}
          >
            {/* Top hint tag */}
            <div className={`flex items-center justify-between text-xs font-bold uppercase tracking-wider ${
              theme === 'kitty' ? 'text-pink-600' : theme === 'light' ? 'text-indigo-600' : 'text-purple-300/80'
            }`}>
              <span>Definición</span>
              <span className={`font-normal lowercase text-[11px] transition-colors ${
                theme === 'kitty' ? 'text-pink-400 group-hover:text-pink-600' : theme === 'light' ? 'text-slate-400 group-hover:text-slate-600' : 'text-slate-500 group-hover:text-slate-400'
              }`}>
                clic o espacio para voltear
              </span>
            </div>

            {/* Card Main Definition */}
            <div className="my-auto text-center py-4 overflow-y-auto max-h-[28vh]">
              <div className={`text-sm sm:text-base md:text-lg font-normal leading-relaxed ${
                theme === 'kitty' ? 'text-pink-900 font-medium' : theme === 'light' ? 'text-slate-700 font-normal' : 'text-slate-200 font-normal'
              }`}>
                <FormattedText text={currentCard ? getCardDef(currentCard) : ''} inlineOnly />
              </div>
            </div>

            {/* Current mastery status badge */}
            <div className="flex items-center justify-center">
              <span className={`text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                currentCard?.mastery === 'mastered'
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
                  : currentCard?.mastery === 'known'
                  ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30'
                  : theme === 'kitty'
                  ? 'bg-pink-100 text-pink-700 border border-pink-200'
                  : theme === 'light'
                  ? 'bg-slate-100 text-slate-600 border border-slate-200'
                  : 'bg-slate-700/40 text-slate-400 border border-white/[0.08]'
              }`}>
                {currentCard?.mastery === 'mastered'
                  ? 'Dominada'
                  : currentCard?.mastery === 'known'
                  ? 'En Repaso'
                  : 'Por Aprender'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation & Mastery Controls */}
      <div className="w-full max-w-2xl mt-3 sm:mt-4 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3">
        {/* Prev Card */}
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentIdx === 0}
          className={`p-3 rounded-2xl disabled:opacity-30 border transition-all cursor-pointer disabled:cursor-not-allowed shadow-md active:scale-95 ${
            theme === 'kitty'
              ? 'bg-white hover:bg-pink-50 border-pink-200 text-pink-700 hover:text-pink-900'
              : theme === 'light'
              ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 hover:text-slate-900'
              : 'bg-[#1b1338] hover:bg-[#261b4f] border-white/[0.1] text-slate-200 hover:text-white'
          }`}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* 3 Spaced Repetition Buttons */}
        <div className="flex items-center gap-2.5 flex-1 justify-center w-full sm:w-auto">
          <button
            type="button"
            onClick={() => handleSetMastery('to-learn')}
            className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl border text-xs font-bold transition-transform duration-150 active:scale-[0.97] cursor-pointer shadow-sm ${
              currentCard?.mastery === 'to-learn'
                ? theme === 'kitty'
                  ? 'bg-pink-200/80 border-pink-400 text-pink-900'
                  : 'bg-slate-700/60 border-slate-500 text-white'
                : theme === 'kitty'
                ? 'bg-white/90 hover:bg-pink-50 border-pink-200 text-pink-800'
                : theme === 'light'
                ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                : 'bg-[#1b1338] hover:bg-[#261b4f] border-white/[0.08] text-slate-300'
            }`}
          >
            Por Aprender
          </button>

          <button
            type="button"
            onClick={() => handleSetMastery('known')}
            className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl border text-xs font-bold transition-transform duration-150 active:scale-[0.97] cursor-pointer shadow-sm ${
              currentCard?.mastery === 'known'
                ? 'bg-amber-500/20 border-amber-400 text-amber-700 dark:text-amber-200'
                : theme === 'kitty'
                ? 'bg-white/90 hover:bg-pink-50 border-pink-200 text-pink-800'
                : theme === 'light'
                ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                : 'bg-[#1b1338] hover:bg-[#261b4f] border-white/[0.08] text-slate-300'
            }`}
          >
            Lo Sé
          </button>

          <button
            type="button"
            onClick={() => handleSetMastery('mastered')}
            className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl border text-xs font-bold transition-transform duration-150 active:scale-[0.97] cursor-pointer shadow-sm ${
              currentCard?.mastery === 'mastered'
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-700 dark:text-emerald-200'
                : theme === 'kitty'
                ? 'bg-white/90 hover:bg-pink-50 border-pink-200 text-pink-800'
                : theme === 'light'
                ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                : 'bg-[#1b1338] hover:bg-[#261b4f] border-white/[0.08] text-slate-300'
            }`}
          >
            Dominado
          </button>
        </div>

        {/* Next Card */}
        <button
          type="button"
          onClick={handleNext}
          disabled={currentIdx === deck.length - 1}
          className={`p-3 rounded-2xl disabled:opacity-30 border transition-all cursor-pointer disabled:cursor-not-allowed shadow-md active:scale-95 ${
            theme === 'kitty'
              ? 'bg-white hover:bg-pink-50 border-pink-200 text-pink-700 hover:text-pink-900'
              : theme === 'light'
              ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 hover:text-slate-900'
              : 'bg-[#1b1338] hover:bg-[#261b4f] border-white/[0.1] text-slate-200 hover:text-white'
          }`}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
