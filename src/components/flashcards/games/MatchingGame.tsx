import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Flashcard } from '../../../types';
import { ArrowLeft, Copy, RotateCcw, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';
import { gameAudio } from './gameAudio';
import { cleanConceptDefinition, cleanConceptTerm, maskTermInDefinition } from '../flashcardSanitizer';
import { FormattedText } from '../../FormattedText';

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
  const [items, setItems] = useState<MatchCardItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [evaluatingPair, setEvaluatingPair] = useState<{ id1: string; id2: string; isCorrect: boolean } | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [gameWon, setGameWon] = useState(false);

  const timerRef = useRef<any>(null);

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
    setElapsedSeconds(0);
    setGameWon(false);
  }, [validCards]);

  useEffect(() => {
    startNewGame();
  }, [startNewGame]);

  // Timer loop
  useEffect(() => {
    if (gameWon || items.length === 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setElapsedSeconds(prev => +(prev + 0.1).toFixed(1));
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameWon, items]);

  // Real-time score calculation (REA Thea formula)
  const currentScore = useMemo(() => {
    return Math.max(0, Math.round(1000 - (100 / Math.LN2) * Math.log(1 + elapsedSeconds / 10) - mistakes * 45));
  }, [elapsedSeconds, mistakes]);

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

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins > 0 ? `${mins}m ` : ''}${secs}s`;
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-3 sm:py-6 animate-fadeIn text-slate-100">
      {/* Top Header Bar matching Screenshot 2 & Thea */}
      <div className="flex items-center justify-between mb-8 pb-3">
        <button
          type="button"
          onClick={() => {
            gameAudio.playTap();
            onBack();
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#2a243d]/70 hover:bg-[#383152] border border-white/[0.12] text-xs font-semibold text-slate-200 transition-transform active:scale-[0.98] duration-150 cursor-pointer shadow-sm"
        >
          <ArrowLeft className="w-4 h-4 text-slate-300" />
          <span>Regresar a juegos</span>
        </button>

        <div className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-white">
          <Copy className="w-5 h-5 text-indigo-400" />
          <span>Coincidencias</span>
        </div>

        <div className="flex items-center gap-4 text-xs font-semibold tabular-nums">
          <span className="text-slate-400">
            Tiempo: <strong className="text-white">{formatTimer(elapsedSeconds)}</strong>
          </span>
          <span className="px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.1] text-indigo-200 font-bold">
            Puntos: <strong className="text-white ml-1">{currentScore}</strong>
          </span>
        </div>
      </div>

      {/* Grid of Matching Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
        {items.map(item => {
          const isSelected = selectedId === item.id;
          const isEvaluating = evaluatingPair?.id1 === item.id || evaluatingPair?.id2 === item.id;
          const isCorrectPair = isEvaluating && evaluatingPair?.isCorrect;
          const isWrongPair = isEvaluating && !evaluatingPair?.isCorrect;

          let cardStyle = 'bg-[#181033]/90 hover:bg-[#23174a] border-white/[0.09] text-slate-100 hover:border-purple-400/50';

          if (item.isMatched) {
            cardStyle = 'opacity-0 scale-95 pointer-events-none';
          } else if (isCorrectPair) {
            cardStyle = 'bg-emerald-600/40 border-emerald-400 text-emerald-100 shadow-[0_0_15px_rgba(16,185,129,0.3)] scale-[1.02]';
          } else if (isWrongPair) {
            cardStyle = 'bg-rose-600/40 border-rose-400 text-rose-100 shadow-[0_0_15px_rgba(244,63,94,0.3)] animate-shake';
          } else if (isSelected) {
            cardStyle = 'bg-[#29174d] border-purple-400 text-white ring-2 ring-purple-400/50 scale-[1.02] shadow-lg';
          }

          return (
            <button
              key={item.id}
              type="button"
              disabled={item.isMatched || evaluatingPair !== null}
              onClick={() => handleItemClick(item)}
              className={`p-3.5 sm:p-5 rounded-2xl border min-h-[135px] sm:min-h-[145px] flex items-center justify-center text-center transition-all duration-200 cursor-pointer shadow-md ${cardStyle}`}
            >
              <div className={`font-semibold leading-relaxed w-full flex items-center justify-center ${
                item.type === 'term'
                  ? 'text-sm sm:text-base text-purple-200 font-bold'
                  : (item.text.length > 90
                      ? 'text-xs text-slate-200 font-normal leading-snug'
                      : 'text-xs sm:text-sm text-slate-200 font-normal leading-normal')
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
                <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-0.5">Tiempo</span>
                <span className="text-2xl font-extrabold text-white">{formatTimer(elapsedSeconds)}</span>
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
