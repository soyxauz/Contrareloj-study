import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Flashcard } from '../../../types';
import { ArrowLeft, Grid, RotateCcw, Trophy, Delete } from 'lucide-react';
import confetti from 'canvas-confetti';
import { gameAudio } from './gameAudio';
import { cleanConceptDefinition, cleanConceptTerm, maskTermInDefinition } from '../flashcardSanitizer';
import { FormattedText } from '../../FormattedText';
import { useTheme } from '../../../services/themeService';

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
  const { theme } = useTheme();
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [hintsRemaining, setHintsRemaining] = useState(3);
  const [gameOver, setGameOver] = useState(false);
  const [termsCompleted, setTermsCompleted] = useState<string[]>([]);

  // Referencias para evitar cierres obsoletos (stale closures) en el temporizador
  const scoreRef = useRef(0);
  scoreRef.current = score;
  const termsCompletedRef = useRef<string[]>([]);
  termsCompletedRef.current = termsCompleted;
  const onGameCompleteRef = useRef(onGameComplete);
  onGameCompleteRef.current = onGameComplete;

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
          if (scoreRef.current > 100) {
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 },
            });
          }
          if (onGameCompleteRef.current) {
            onGameCompleteRef.current(scoreRef.current, termsCompletedRef.current);
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
      const points = 150;
      const newScore = score + points;
      setScore(newScore);

      const targetTerm = getCardTerm(currentCard);
      const newCompleted = [...termsCompleted, targetTerm];
      setTermsCompleted(newCompleted);

      setTimeout(() => {
        loadNewTerm(new Set(newCompleted));
      }, 500);
    } else if (assembledStr.length >= targetStr.length && assembledStr !== targetStr) {
      // Wrong term assembled: penalizar puntuación por equivocación
      gameAudio.playError();
      setScore(prev => Math.max(0, prev - 40));
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
    <div className={`w-full max-w-4xl mx-auto px-4 py-3 sm:py-6 animate-fadeIn ${
      theme === 'kitty' ? 'text-pink-950' : theme === 'light' ? 'text-slate-900' : 'text-slate-100'
    }`}>
      {/* Top Header Bar */}
      <div className="flex items-center justify-between mb-8 pb-3">
        <button
          type="button"
          onClick={() => {
            gameAudio.playTap();
            onBack();
          }}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-transform active:scale-[0.98] duration-150 cursor-pointer shadow-sm ${
            theme === 'kitty'
              ? 'bg-white hover:bg-pink-50 border border-pink-200 text-pink-900 shadow-xs'
              : theme === 'light'
              ? 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 shadow-xs'
              : 'bg-[#2a243d]/70 hover:bg-[#383152] border border-white/[0.12] text-slate-200'
          }`}
        >
          <ArrowLeft className={`w-4 h-4 ${theme === 'kitty' ? 'text-pink-500' : theme === 'light' ? 'text-slate-500' : 'text-slate-300'}`} />
          <span>Regresar a juegos</span>
        </button>

        <div className={`flex items-center gap-2.5 text-lg font-bold tracking-tight ${
          theme === 'kitty' ? 'text-pink-950 font-black' : theme === 'light' ? 'text-slate-900 font-black' : 'text-white'
        }`}>
          <Grid className={`w-5 h-5 ${theme === 'kitty' ? 'text-pink-600' : theme === 'light' ? 'text-indigo-600' : 'text-indigo-400'}`} />
          <span>Constructor de Términos</span>
        </div>

        <div className="w-24" /> {/* Spacer */}
      </div>

      {/* Stats Bar Container */}
      <div className={`rounded-2xl border px-6 py-4 flex items-center justify-between mb-8 shadow-xl tabular-nums ${
        theme === 'kitty'
          ? 'bg-white border-pink-200 text-pink-950 shadow-pink-200/40'
          : theme === 'light'
          ? 'bg-white border-slate-200 text-slate-900 shadow-md'
          : 'bg-[#140e2b]/95 border-white/[0.12] text-white'
      }`}>
        {/* Score */}
        <div className={`text-xl sm:text-2xl font-black ${theme === 'kitty' ? 'text-pink-950' : 'text-white'}`}>
          {score}
        </div>

        {/* Timer */}
        <div className={`text-xl sm:text-2xl font-black ${
          timeLeft <= 10
            ? 'text-rose-500 animate-pulse'
            : theme === 'kitty'
            ? 'text-pink-800'
            : theme === 'light'
            ? 'text-slate-800'
            : 'text-slate-100'
        }`}>
          {timeLeft}s
        </div>

        {/* Hint Button */}
        <button
          type="button"
          onClick={handleUseHint}
          disabled={hintsRemaining <= 0 || gameOver}
          className={`px-4 py-1.5 rounded-full disabled:opacity-40 border text-xs sm:text-sm font-bold transition-all duration-150 cursor-pointer shadow-sm active-press ${
            theme === 'kitty'
              ? 'bg-pink-100 hover:bg-pink-200/80 border-pink-300 text-pink-900 shadow-xs'
              : theme === 'light'
              ? 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-900 shadow-xs'
              : 'bg-[#3b2766] hover:bg-[#4b3382] border border-purple-400/30 text-purple-200'
          }`}
        >
          Usar pista ({hintsRemaining})
        </button>
      </div>

      {/* Target Definition Prompt */}
      <div className="text-center mb-5 max-w-2xl mx-auto">
        <div className={`text-base sm:text-lg font-normal leading-relaxed ${
          theme === 'kitty' ? 'text-pink-950 font-medium' : theme === 'light' ? 'text-slate-800' : 'text-slate-100'
        }`}>
          <FormattedText text={currentCard ? maskTermInDefinition(getCardTerm(currentCard), getCardDef(currentCard)) : 'Cargando definición...'} inlineOnly />
        </div>
        <p className={`text-xs sm:text-sm italic mt-2.5 ${
          theme === 'kitty' ? 'text-pink-600' : theme === 'light' ? 'text-slate-500' : 'text-slate-400'
        }`}>
          Haz clic en las sílabas para escribir el término correspondiente
        </p>
      </div>

      {/* Word Builder Bar showing assembled syllables with cursor */}
      <div className="flex items-center justify-center gap-3 mb-8">
        <div className={`min-w-[280px] sm:min-w-[420px] max-w-xl h-14 px-6 rounded-2xl border flex items-center justify-between shadow-inner transition-all duration-200 ${
          shakeBuilder
            ? 'border-rose-500 animate-shake'
            : theme === 'kitty'
            ? 'bg-pink-50/70 border-pink-300 shadow-[0_0_15px_rgba(236,72,153,0.15)]'
            : theme === 'light'
            ? 'bg-slate-50 border-slate-300 shadow-sm'
            : 'bg-[#0f0a24] border-purple-400/40 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
        }`}>
          <div className={`flex items-center gap-1 font-mono text-lg sm:text-xl font-bold tracking-wider overflow-x-auto py-1 ${
            theme === 'kitty' ? 'text-pink-950 font-black' : theme === 'light' ? 'text-slate-900 font-bold' : 'text-purple-200'
          }`}>
            {assembledDisplay || <span className={`font-normal text-sm ${theme === 'kitty' ? 'text-pink-400' : theme === 'light' ? 'text-slate-400' : 'text-purple-400/40'}`}>Construye el término aquí...</span>}
            <span className={`inline-block w-2.5 h-6 animate-pulse ml-0.5 rounded-sm ${theme === 'kitty' ? 'bg-pink-500' : theme === 'light' ? 'bg-indigo-600' : 'bg-purple-400'}`} />
          </div>

          {assembledTokens.length > 0 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleRemoveLast}
                title="Borrar última sílaba"
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  theme === 'kitty'
                    ? 'bg-pink-200/60 hover:bg-pink-200 text-pink-700'
                    : theme === 'light'
                    ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 hover:text-white'
                }`}
              >
                <Delete className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                title="Limpiar todo"
                className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-rose-500/20 text-rose-500 hover:bg-rose-500/30 transition-colors cursor-pointer"
              >
                Limpiar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4x4 Grid of 16 Syllable Tiles */}
      <div className="grid grid-cols-4 gap-3 sm:gap-4 max-w-md mx-auto mb-8">
        {tiles.map((tile) => {
          const isHighlighted = highlightedTileId === tile.id;

          let tileClass = '';
          if (tile.isUsed) {
            tileClass = 'opacity-20 pointer-events-none cursor-not-allowed';
          } else if (isHighlighted) {
            tileClass = theme === 'kitty'
              ? 'bg-pink-200 border-pink-500 text-pink-950 ring-4 ring-pink-300 shadow-lg animate-pulse'
              : 'bg-purple-600/40 border-purple-300 text-white ring-4 ring-purple-400/60 shadow-[0_0_20px_rgba(168,85,247,0.5)] animate-pulse';
          } else if (theme === 'kitty') {
            tileClass = 'bg-white hover:bg-pink-50 border-pink-200 hover:border-pink-300 text-pink-950 shadow-xs';
          } else if (theme === 'light') {
            tileClass = 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-800 shadow-xs';
          } else {
            tileClass = 'bg-[#180f33]/90 hover:bg-[#26174d] border-white/[0.12] text-slate-100 hover:text-white hover:border-purple-400/60';
          }

          return (
            <button
              key={tile.id}
              type="button"
              disabled={tile.isUsed || gameOver}
              onClick={() => handleTileClick(tile)}
              className={`h-16 sm:h-20 rounded-2xl border font-bold text-sm sm:text-base tracking-wider flex items-center justify-center transition-all duration-150 cursor-pointer active-press shadow-md ${tileClass}`}
            >
              <span>{tile.text}</span>
            </button>
          );
        })}
      </div>

      {/* Game Over Modal */}
      {gameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className={`w-full max-w-md p-6 sm:p-8 rounded-3xl border shadow-2xl text-center flex flex-col items-center ${
            theme === 'kitty'
              ? 'bg-white border-pink-200 text-pink-950 shadow-pink-200/50'
              : theme === 'light'
              ? 'bg-white border-slate-200 text-slate-900 shadow-slate-200/50'
              : 'bg-[#140e2b] border-white/[0.12] text-white'
          }`}>
            <div className={`w-16 h-16 rounded-full border flex items-center justify-center mb-4 ${
              theme === 'kitty'
                ? 'bg-indigo-100 border-indigo-300 text-indigo-600'
                : 'bg-indigo-500/20 border-indigo-400/40 text-indigo-400'
            }`}>
              <Trophy className="w-8 h-8" />
            </div>
            <h3 className={`text-2xl font-bold mb-2 tracking-tight ${
              theme === 'kitty' ? 'text-pink-950 font-black' : theme === 'light' ? 'text-slate-900 font-black' : 'text-white'
            }`}>¡Tiempo Agotado!</h3>
            <p className={`text-sm mb-6 ${
              theme === 'kitty' ? 'text-pink-800/80' : theme === 'light' ? 'text-slate-600' : 'text-slate-300'
            }`}>
              Has puesto a prueba tu velocidad de descomposición léxica.
            </p>

            <div className={`w-full py-4 px-6 rounded-2xl border mb-6 flex justify-around tabular-nums ${
              theme === 'kitty'
                ? 'bg-pink-50/70 border-pink-200'
                : theme === 'light'
                ? 'bg-slate-50 border-slate-200'
                : 'bg-white/[0.04] border-white/[0.08]'
            }`}>
              <div>
                <span className={`text-[11px] uppercase tracking-wider block mb-0.5 ${
                  theme === 'kitty' ? 'text-pink-600' : theme === 'light' ? 'text-slate-500' : 'text-slate-400'
                }`}>Puntuación</span>
                <span className={`text-2xl font-extrabold ${theme === 'kitty' ? 'text-pink-950' : 'text-white'}`}>{score}</span>
              </div>
              <div className={`w-px ${theme === 'kitty' ? 'bg-pink-200' : theme === 'light' ? 'bg-slate-200' : 'bg-white/10'}`} />
              <div>
                <span className={`text-[11px] uppercase tracking-wider block mb-0.5 ${
                  theme === 'kitty' ? 'text-pink-600' : theme === 'light' ? 'text-slate-500' : 'text-slate-400'
                }`}>Términos Hechos</span>
                <span className={`text-2xl font-extrabold ${theme === 'kitty' ? 'text-pink-700' : 'text-indigo-300'}`}>{termsCompleted.length}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={handleRestart}
                className={`flex-1 py-3 px-4 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-transform active:scale-[0.98] duration-150 cursor-pointer shadow-lg ${
                  theme === 'kitty'
                    ? 'bg-pink-500 hover:bg-pink-600 shadow-pink-500/30'
                    : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30'
                }`}
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
                className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-transform active:scale-[0.98] duration-150 cursor-pointer border ${
                  theme === 'kitty'
                    ? 'bg-pink-100 hover:bg-pink-200 border-pink-200 text-pink-900'
                    : theme === 'light'
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.1] text-slate-200'
                }`}
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
