import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Flashcard } from '../../../types';
import { ArrowLeft, Copy, RotateCcw, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';
import { gameAudio } from './gameAudio';
import { cleanConceptDefinition, cleanConceptTerm, maskTermInDefinition } from '../flashcardSanitizer';
import { FormattedText } from '../../FormattedText';
import { useTheme } from '../../../services/themeService';

interface MatchingGameProps {
  flashcards: Flashcard[];
  onBack: () => void;
  onGameComplete?: (score: number, termsMastered: string[]) => void;
}

interface MatchCardItem {
  id: string; // unique item id
  cardId: string; // flashcard id
  type: 'term' | 'definition';
  text: string;
  isMatched: boolean;
}

const getCardTerm = (c: Flashcard): string => cleanConceptTerm(c.term || (c as any).frontText || '');
const getCardDef = (c: Flashcard): string => cleanConceptDefinition(c.definition || (c as any).backText || '');

export const MatchingGame: React.FC<MatchingGameProps> = ({
  flashcards,
  onBack,
  onGameComplete,
}) => {
  const { theme } = useTheme();
  const [items, setItems] = useState<MatchCardItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [evaluatingPair, setEvaluatingPair] = useState<{ id1: string; id2: string; isCorrect: boolean } | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [gameWon, setGameWon] = useState(false);

  // Pool of valid flashcards (pick 6 pairs for 12 cards, optimal for focus)
  const validCards = useMemo(() => {
    return flashcards
      .filter(f => getCardTerm(f).trim().length > 0 && getCardDef(f).trim().length > 0)
      .slice(0, 6);
  }, [flashcards]);

  // Start new matching round
  const startNewGame = useCallback(() => {
    if (validCards.length === 0) return;

    const list: MatchCardItem[] = [];
    validCards.forEach(c => {
      list.push({
        id: `term-${c.id}`,
        cardId: c.id,
        type: 'term',
        text: getCardTerm(c),
        isMatched: false,
      });
      list.push({
        id: `def-${c.id}`,
        cardId: c.id,
        type: 'definition',
        text: maskTermInDefinition(getCardTerm(c), getCardDef(c)),
        isMatched: false,
      });
    });

    const shuffled = list.sort(() => Math.random() - 0.5);
    setItems(shuffled);
    setSelectedId(null);
    setEvaluatingPair(null);
    setMistakes(0);
    setGameWon(false);
  }, [validCards]);

  useEffect(() => {
    startNewGame();
  }, [startNewGame]);

  // Puntuación en tiempo real: se maneja por equivocaciones, NUNCA por tiempo
  // Inicia en 1000 pts y se descuenta penalización únicamente al equivocarse
  const currentScore = useMemo(() => {
    return Math.max(0, 1000 - mistakes * 100);
  }, [mistakes]);

  // Handle card click
  const handleItemClick = (item: MatchCardItem) => {
    if (item.isMatched || evaluatingPair !== null || gameWon) return;

    // If clicking same card, unselect
    if (selectedId === item.id) {
      setSelectedId(null);
      return;
    }

    gameAudio.playTap();

    if (!selectedId) {
      // First card chosen
      setSelectedId(item.id);
      return;
    }

    // Second card chosen
    const firstItem = items.find(i => i.id === selectedId);
    if (!firstItem) {
      setSelectedId(item.id);
      return;
    }

    // Check if match
    const isMatch = firstItem.cardId === item.cardId && firstItem.type !== item.type;

    if (isMatch) {
      gameAudio.playSuccess();
      setEvaluatingPair({ id1: firstItem.id, id2: item.id, isCorrect: true });

      setTimeout(() => {
        const nextItems = items.map(i => {
          if (i.id === firstItem.id || i.id === item.id) {
            return { ...i, isMatched: true };
          }
          return i;
        });

        setItems(nextItems);
        setSelectedId(null);
        setEvaluatingPair(null);

        // Check if all matched
        const allDone = nextItems.every(i => i.isMatched);
        if (allDone) {
          setGameWon(true);
          confetti({
            particleCount: 120,
            spread: 75,
            origin: { y: 0.6 },
          });
          if (onGameComplete) {
            onGameComplete(currentScore, validCards.map(getCardTerm));
          }
        }
      }, 350);
    } else {
      // Mismatch
      gameAudio.playError();
      setMistakes(prev => prev + 1);
      setEvaluatingPair({ id1: firstItem.id, id2: item.id, isCorrect: false });

      setTimeout(() => {
        setSelectedId(null);
        setEvaluatingPair(null);
      }, 600);
    }
  };

  return (
    <div className={`w-full max-w-5xl mx-auto px-3 sm:px-6 py-2 sm:py-3 flex-1 flex flex-col justify-center animate-fadeIn ${
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
              ? 'bg-white hover:bg-pink-50 border border-pink-200 text-pink-700'
              : theme === 'light'
              ? 'bg-white hover:bg-slate-100 border border-slate-200 text-slate-700'
              : 'bg-[#2a243d]/70 hover:bg-[#383152] border border-white/[0.12] text-slate-200'
          }`}
        >
          <ArrowLeft className={`w-4 h-4 ${theme === 'kitty' ? 'text-pink-600' : theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`} />
          <span>Regresar a juegos</span>
        </button>

        <div className={`flex items-center gap-2.5 text-base sm:text-lg font-bold tracking-tight ${
          theme === 'kitty' ? 'text-pink-950 font-black' : theme === 'light' ? 'text-slate-900 font-bold' : 'text-white'
        }`}>
          <Copy className={`w-5 h-5 ${theme === 'kitty' ? 'text-pink-600' : 'text-indigo-400'}`} />
          <span>Coincidencias</span>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3 text-xs font-semibold tabular-nums">
          <span className={`px-3 py-1.5 rounded-full border ${
            theme === 'kitty'
              ? 'bg-pink-50 border-pink-200 text-pink-700'
              : theme === 'light'
              ? 'bg-slate-100 border-slate-200 text-slate-600'
              : 'bg-white/[0.05] border border-white/[0.1] text-slate-300'
          }`}>
            Fallos: <strong className="text-rose-500 ml-1">{mistakes}</strong>
          </span>
          <span className={`px-3.5 py-1.5 rounded-full border font-bold shadow-sm ${
            theme === 'kitty'
              ? 'bg-pink-500/15 border-pink-300 text-pink-700'
              : theme === 'light'
              ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
              : 'bg-indigo-500/15 border border-indigo-400/30 text-indigo-200'
          }`}>
            Puntos: <strong className={theme === 'kitty' ? 'text-pink-950 font-black ml-1' : theme === 'light' ? 'text-slate-900 ml-1' : 'text-white ml-1'}>{currentScore}</strong>
          </span>
        </div>
      </div>

      {/* Grid of Matching Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3 max-w-4xl lg:max-w-5xl mx-auto w-full">
        {items.map(item => {
          const isSelected = selectedId === item.id;
          const isEvaluating = evaluatingPair?.id1 === item.id || evaluatingPair?.id2 === item.id;
          const isCorrectPair = isEvaluating && evaluatingPair?.isCorrect;
          const isWrongPair = isEvaluating && !evaluatingPair?.isCorrect;
          const isTerm = item.type === 'term';

          let cardStyle = '';
          if (theme === 'kitty') {
            cardStyle = isTerm
              ? 'bg-pink-100 hover:bg-pink-200/80 border-2 border-pink-300 hover:border-pink-400 text-pink-950 shadow-sm'
              : 'bg-white hover:bg-pink-50/60 border border-pink-200 hover:border-pink-300 text-pink-900 shadow-sm';
          } else if (theme === 'light') {
            cardStyle = isTerm
              ? 'bg-indigo-50 hover:bg-indigo-100 border-2 border-indigo-200 hover:border-indigo-300 text-indigo-950 shadow-sm'
              : 'bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-800 shadow-sm';
          } else {
            cardStyle = isTerm
              ? 'bg-[#220715]/95 hover:bg-[#320a1f] border-[#9f1239]/50 hover:border-[#f43f5e]/80 text-[#ffe4e6] shadow-[0_8px_24px_-4px_rgba(159,18,57,0.3),inset_0_1px_0_rgba(255,180,200,0.18)]'
              : 'bg-[#130d26]/95 hover:bg-[#1c1438] border-white/[0.1] hover:border-purple-400/50 text-slate-200 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)]';
          }

          if (item.isMatched) {
            cardStyle = 'opacity-0 scale-95 pointer-events-none';
          } else if (isCorrectPair) {
            cardStyle = 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-800 dark:text-emerald-100 shadow-[0_0_15px_rgba(16,185,129,0.3)] scale-[1.02]';
          } else if (isWrongPair) {
            cardStyle = 'bg-rose-500/20 border-2 border-rose-500 text-rose-800 dark:text-rose-100 shadow-[0_0_15px_rgba(244,63,94,0.3)] animate-shake';
          } else if (isSelected) {
            if (theme === 'kitty') {
              cardStyle = isTerm
                ? 'bg-pink-200 border-2 border-pink-600 text-pink-950 ring-2 ring-pink-400 shadow-lg scale-[1.02]'
                : 'bg-pink-100 border-2 border-pink-500 text-pink-950 ring-2 ring-pink-300 shadow-lg scale-[1.02]';
            } else if (theme === 'light') {
              cardStyle = isTerm
                ? 'bg-indigo-100 border-2 border-indigo-600 text-indigo-950 ring-2 ring-indigo-400 shadow-lg scale-[1.02]'
                : 'bg-slate-100 border-2 border-slate-600 text-slate-900 ring-2 ring-slate-300 shadow-lg scale-[1.02]';
            } else {
              cardStyle = isTerm
                ? 'bg-[#3d0b23] border-[#f43f5e] text-white ring-2 ring-[#f43f5e]/70 shadow-[0_0_25px_rgba(244,63,94,0.45)] scale-[1.02]'
                : 'bg-[#271545] border-purple-400 text-white ring-2 ring-purple-400/60 shadow-[0_0_25px_rgba(168,85,247,0.4)] scale-[1.02]';
            }
          }

          return (
            <button
              key={item.id}
              type="button"
              disabled={item.isMatched || evaluatingPair !== null}
              onClick={() => handleItemClick(item)}
              className={`p-2.5 sm:p-3.5 rounded-2xl border min-h-[96px] sm:min-h-[108px] lg:min-h-[114px] flex items-center justify-center text-center transition-[transform,background-color,border-color,box-shadow,opacity] duration-200 active:scale-[0.98] cursor-pointer shadow-md ${cardStyle}`}
            >
              <div className={`font-semibold leading-snug w-full flex items-center justify-center ${
                isTerm
                  ? (theme === 'kitty' ? 'text-sm sm:text-[15px] text-pink-950 font-black' : theme === 'light' ? 'text-sm sm:text-[15px] text-indigo-950 font-black' : 'text-sm sm:text-[15px] text-[#fecdd3] font-black tracking-tight drop-shadow-sm')
                  : (item.text.length > 90
                      ? (theme === 'kitty' ? 'text-[11.5px] sm:text-xs text-pink-900 font-medium' : theme === 'light' ? 'text-[11.5px] sm:text-xs text-slate-700 font-medium' : 'text-[11.5px] sm:text-xs text-slate-200 font-medium leading-tight')
                      : (theme === 'kitty' ? 'text-xs sm:text-[13px] text-pink-900 font-medium' : theme === 'light' ? 'text-xs sm:text-[13px] text-slate-700 font-medium' : 'text-xs sm:text-[13px] text-slate-200 font-medium leading-snug'))
              }`}>
                <FormattedText text={item.text} inlineOnly />
              </div>
            </button>
          );
        })}
      </div>

      {/* Game Won Modal */}
      {gameWon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-[#140e2b] border border-white/[0.12] shadow-2xl text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center mb-4 text-emerald-400">
              <Trophy className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">¡Excelente Memoria!</h3>
            <p className="text-sm text-slate-300 mb-6">
              Emparejaste todos los términos con sus definiciones correspondientes.
            </p>

            <div className="w-full py-4 px-6 rounded-2xl bg-white/[0.04] border border-white/[0.08] mb-6 flex justify-around tabular-nums">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-0.5">Puntuación</span>
                <span className="text-2xl font-extrabold text-emerald-400">{currentScore}</span>
              </div>
              <div className="w-px bg-white/10" />
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-0.5">Fallos</span>
                <span className="text-2xl font-extrabold text-rose-300">{mistakes}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={startNewGame}
                className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition-transform active:scale-[0.98] duration-150 cursor-pointer shadow-lg shadow-indigo-600/30"
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
                className="flex-1 py-3 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-slate-200 font-bold text-sm transition-transform active:scale-[0.98] duration-150 cursor-pointer"
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
