import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Flashcard } from '../../../types';
import { ArrowLeft, Grid, RotateCcw, Trophy, Delete } from 'lucide-react';
import confetti from 'canvas-confetti';
import { gameAudio } from './gameAudio';
import { cleanConceptDefinition, cleanConceptTerm } from '../flashcardSanitizer';
import { FormattedText } from '../../FormattedText';

interface TermBuilderGameProps {
  flashcards: Flashcard[];
  onBack: () => void;
  onGameComplete?: (score: number, termsMastered: string[]) => void;
}

interface SyllableTile {
  id: string;
  text: string;
  isUsed: boolean;
  isTargetPart: boolean;
  orderIndex: number; // Order in the target word if part of it, -1 otherwise
}

const getCardTerm = (c: Flashcard): string => cleanConceptTerm(c.term || (c as any).frontText || '');
const getCardDef = (c: Flashcard): string => cleanConceptDefinition(c.definition || (c as any).backText || '');

// Splits a term into 2-3 char syllable-like chunks
const splitIntoSyllables = (term: string): string[] => {
  const clean = term.trim();
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    // If space, group with next or keep space
    if (clean[i] === ' ') {
      chunks.push(' ');
      i++;
      continue;
    }
    // Chunks of 2 to 3 chars
    const remaining = clean.length - i;
    const len = remaining <= 4 ? remaining : (remaining % 3 === 0 ? 3 : 2);
    chunks.push(clean.substring(i, i + len).toUpperCase());
    i += len;
  }
  return chunks.filter(c => c !== ' ' && c.length > 0);
};

export const TermBuilderGame: React.FC<TermBuilderGameProps> = ({
  flashcards,
  onBack,
  onGameComplete,
}) => {
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [hintsRemaining, setHintsRemaining] = useState(3);
  const [gameOver, setGameOver] = useState(false);
  const [termsCompleted, setTermsCompleted] = useState<string[]>([]);

  // Current term state
  const [currentCard, setCurrentCard] = useState<Flashcard | null>(null);
  const [tiles, setTiles] = useState<SyllableTile[]>([]);
  const [assembledTokens, setAssembledTokens] = useState<{ id: string; text: string }[]>([]);
  const [highlightedTileId, setHighlightedTileId] = useState<string | null>(null);
  const [shakeBuilder, setShakeBuilder] = useState(false);
  const timerIntervalRef = useRef<any>(null);

  // Pool of valid terms
  const validCards = useMemo(() => {
    return flashcards.filter(f => {
      const term = getCardTerm(f);
      return term && term.length >= 3;
    });
  }, [flashcards]);

  // Load a new term puzzle
  const loadNewTerm = useCallback((usedIds: Set<string>) => {
    const available = validCards.filter(c => !usedIds.has(c.id));
    const pool = available.length > 0 ? available : validCards;
    if (pool.length === 0) return;

    const target = pool[Math.floor(Math.random() * pool.length)];
    setCurrentCard(target);
    setAssembledTokens([]);
    setHighlightedTileId(null);

    const targetTerm = getCardTerm(target);
    const targetSyllables = splitIntoSyllables(targetTerm);

    // Extract other syllables from remaining cards to fill up to 16 tiles (4x4)
    const otherSyllables: string[] = [];
    validCards.forEach(c => {
      if (c.id !== target.id) {
        otherSyllables.push(...splitIntoSyllables(getCardTerm(c)));
      }
    });

    const fillerPool = Array.from(new Set(otherSyllables))
      .filter(s => !targetSyllables.includes(s))
      .sort(() => Math.random() - 0.5);

    const neededFillerCount = Math.max(0, 16 - targetSyllables.length);
    const selectedFillers = fillerPool.slice(0, neededFillerCount);

    // Combine and shuffle to 16 tiles
    const rawTiles: SyllableTile[] = [];

    targetSyllables.forEach((s, idx) => {
      rawTiles.push({
        id: `target-${idx}-${s}`,
        text: s,
        isUsed: false,
        isTargetPart: true,
        orderIndex: idx,
      });
    });

    selectedFillers.forEach((s, idx) => {
      rawTiles.push({
        id: `filler-${idx}-${s}`,
        text: s,
        isUsed: false,
        isTargetPart: false,
        orderIndex: -1,
      });
    });

    // Fill remaining if needed
    while (rawTiles.length < 16) {
      const fallback = ['DE', 'BIO', 'PRO', 'TER', 'GEN', 'RE', 'AC', 'IN'][rawTiles.length % 8];
      rawTiles.push({
        id: `gen-${rawTiles.length}`,
        text: fallback,
        isUsed: false,
        isTargetPart: false,
        orderIndex: -1,
      });
    }

    const shuffled = rawTiles.sort(() => Math.random() - 0.5);
    setTiles(shuffled);
  }, [validCards]);

  // Initialize game
  useEffect(() => {
    if (validCards.length > 0) {
      loadNewTerm(new Set());
    }
  }, [loadNewTerm, validCards]);

  // 60s countdown timer
  useEffect(() => {
    if (gameOver) return;

    timerIntervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current);
          setGameOver(true);
          if (score > 100) {
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 },
            });
          }
          if (onGameComplete) {
            onGameComplete(score, termsCompleted);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [gameOver]);

  // Handle tile click
  const handleTileClick = (tile: SyllableTile) => {
    if (tile.isUsed || gameOver || !currentCard) return;

    gameAudio.playTap();

    // Mark tile used
    setTiles(prev => prev.map(t => t.id === tile.id ? { ...t, isUsed: true } : t));

    // Append to assembled
    const newAssembled = [...assembledTokens, { id: tile.id, text: tile.text }];
    setAssembledTokens(newAssembled);
    setHighlightedTileId(null);

    // Check if matches target term
    const assembledStr = newAssembled.map(t => t.text).join('').replace(/[\s-]/g, '').toUpperCase();
    const targetStr = getCardTerm(currentCard).replace(/[\s-]/g, '').toUpperCase();

    if (assembledStr === targetStr) {
      // Victory for this term!
      gameAudio.playSuccess();
      const points = 100 + Math.round(timeLeft * 1.5);
      const newScore = score + points;
      setScore(newScore);

      const targetTerm = getCardTerm(currentCard);
      const newCompleted = [...termsCompleted, targetTerm];
      setTermsCompleted(newCompleted);

      setTimeout(() => {
        loadNewTerm(new Set(newCompleted));
      }, 500);
    } else if (assembledStr.length >= targetStr.length && assembledStr !== targetStr) {
      // Wrong term assembled
      gameAudio.playError();
      setShakeBuilder(true);
      setTimeout(() => setShakeBuilder(false), 500);
    }
  };

  // Remove the last assembled syllable
  const handleRemoveLast = () => {
    if (assembledTokens.length === 0 || gameOver) return;
    gameAudio.playTap();

    const lastToken = assembledTokens[assembledTokens.length - 1];
    setAssembledTokens(prev => prev.slice(0, prev.length - 1));

    // Re-enable that tile
    setTiles(prev => prev.map(t => t.id === lastToken.id ? { ...t, isUsed: false } : t));
  };

  // Clear all assembled syllables
  const handleClearAll = () => {
    if (assembledTokens.length === 0 || gameOver) return;
    gameAudio.playTap();

    const usedIds = new Set(assembledTokens.map(t => t.id));
    setTiles(prev => prev.map(t => usedIds.has(t.id) ? { ...t, isUsed: false } : t));
    setAssembledTokens([]);
  };

  // Use hint
  const handleUseHint = () => {
    if (hintsRemaining <= 0 || gameOver || !currentCard) return;

    gameAudio.playHint();
    setHintsRemaining(prev => prev - 1);

    // Find a tile that matches the next target syllable and is not yet used
    const remainingTargetTiles = tiles.filter(t => t.isTargetPart && !t.isUsed);
    if (remainingTargetTiles.length > 0) {
      // Pick the next by lowest orderIndex
      remainingTargetTiles.sort((a, b) => a.orderIndex - b.orderIndex);
      const best = remainingTargetTiles[0];
      setHighlightedTileId(best.id);

      // Auto-clear highlight after 3 seconds
      setTimeout(() => {
        setHighlightedTileId(null);
      }, 3000);
    }
  };

  const handleRestart = () => {
    gameAudio.playTap();
    setScore(0);
    setTimeLeft(60);
    setHintsRemaining(3);
    setGameOver(false);
    setTermsCompleted([]);
    loadNewTerm(new Set());
  };

  const assembledDisplay = assembledTokens.map(t => t.text).join('');

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-3 sm:py-6 animate-fadeIn text-slate-100">
      {/* Top Header Bar matching Screenshot 5 */}
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
          <Grid className="w-5 h-5 text-indigo-400" />
          <span>Constructor de Términos</span>
        </div>

        <div className="w-24" /> {/* Spacer */}
      </div>

      {/* Stats Bar Container matching Screenshot 5 */}
      <div className="rounded-2xl bg-[#140e2b]/95 border border-white/[0.12] px-6 py-4 flex items-center justify-between mb-8 shadow-xl tabular-nums">
        {/* Score */}
        <div className="text-xl sm:text-2xl font-black text-white">
          {score}
        </div>

        {/* Timer */}
        <div className={`text-xl sm:text-2xl font-black ${timeLeft <= 10 ? 'text-rose-400 animate-pulse' : 'text-slate-100'}`}>
          {timeLeft}s
        </div>

        {/* Hint Button */}
        <button
          type="button"
          onClick={handleUseHint}
          disabled={hintsRemaining <= 0 || gameOver}
          className="px-4 py-1.5 rounded-full bg-[#3b2766] hover:bg-[#4b3382] disabled:opacity-40 border border-purple-400/30 text-purple-200 text-xs sm:text-sm font-bold transition-all duration-150 cursor-pointer shadow-sm active-press"
        >
          Usar pista ({hintsRemaining})
        </button>
      </div>

      {/* Target Definition Prompt */}
      <div className="text-center mb-5 max-w-2xl mx-auto">
        <div className="text-base sm:text-lg text-slate-100 font-normal leading-relaxed">
          <FormattedText text={currentCard ? getCardDef(currentCard) : 'Cargando definición...'} inlineOnly />
        </div>
        <p className="text-xs sm:text-sm text-slate-400 italic mt-2.5">
          Haz clic en las sílabas para escribir el término correspondiente
        </p>
      </div>

      {/* Word Builder Bar showing assembled syllables with cursor */}
      <div className="flex items-center justify-center gap-3 mb-8">
        <div className={`min-w-[280px] sm:min-w-[420px] max-w-xl h-14 px-6 rounded-2xl bg-[#0f0a24] border flex items-center justify-between shadow-inner transition-all duration-200 ${
          shakeBuilder ? 'border-rose-500 animate-shake' : 'border-purple-400/40 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
        }`}>
          <div className="flex items-center gap-1 font-mono text-lg sm:text-xl font-bold tracking-wider text-purple-200 overflow-x-auto py-1">
            {assembledDisplay || <span className="text-purple-400/40 font-normal text-sm">Construye el término aquí...</span>}
            <span className="inline-block w-2.5 h-6 bg-purple-400 animate-pulse ml-0.5 rounded-sm" />
          </div>

          {assembledTokens.length > 0 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleRemoveLast}
                title="Borrar última sílaba"
                className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <Delete className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                title="Limpiar todo"
                className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors cursor-pointer"
              >
                Limpiar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4x4 Grid of 16 Syllable Tiles matching Screenshot 5 */}
      <div className="grid grid-cols-4 gap-3 sm:gap-4 max-w-md mx-auto mb-8">
        {tiles.map((tile) => {
          const isHighlighted = highlightedTileId === tile.id;

          return (
            <button
              key={tile.id}
              type="button"
              disabled={tile.isUsed || gameOver}
              onClick={() => handleTileClick(tile)}
              className={`h-16 sm:h-20 rounded-2xl border font-bold text-sm sm:text-base tracking-wider flex items-center justify-center transition-all duration-150 cursor-pointer active-press shadow-md ${
                tile.isUsed
                  ? 'opacity-20 bg-white/[0.02] border-white/[0.04] text-slate-600 cursor-not-allowed pointer-events-none'
                  : isHighlighted
                  ? 'bg-purple-600/40 border-purple-300 text-white ring-4 ring-purple-400/60 shadow-[0_0_20px_rgba(168,85,247,0.5)] animate-pulse'
                  : 'bg-[#180f33]/90 hover:bg-[#26174d] border-white/[0.12] text-slate-100 hover:text-white hover:border-purple-400/60'
              }`}
            >
              <span>{tile.text}</span>
            </button>
          );
        })}
      </div>

      {/* Game Over Modal */}
      {gameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-[#140e2b] border border-white/[0.12] shadow-2xl text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center mb-4 text-indigo-400">
              <Trophy className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">¡Tiempo Agotado!</h3>
            <p className="text-sm text-slate-300 mb-6">
              Has puesto a prueba tu velocidad de descomposición léxica.
            </p>

            <div className="w-full py-4 px-6 rounded-2xl bg-white/[0.04] border border-white/[0.08] mb-6 flex justify-around tabular-nums">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-0.5">Puntuación</span>
                <span className="text-2xl font-extrabold text-white">{score}</span>
              </div>
              <div className="w-px bg-white/10" />
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-0.5">Términos Hechos</span>
                <span className="text-2xl font-extrabold text-indigo-300">{termsCompleted.length}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={handleRestart}
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
