import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Flashcard } from '../../../types';
import { ArrowLeft, CheckSquare, RotateCcw, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';
import { gameAudio } from './gameAudio';
import { cleanConceptDefinition, cleanConceptTerm, maskTermInDefinition } from '../flashcardSanitizer';
import { FormattedText } from '../../FormattedText';

interface DefinitionBuilderGameProps {
  flashcards: Flashcard[];
  onBack: () => void;
  onGameComplete?: (score: number, termsMastered: string[]) => void;
}

interface BlankToken {
  index: number;
  word: string;
  isBlank: boolean;
  userWord: string | null;
}

const TOTAL_ROUNDS = 6;
const STOP_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'en', 'a', 'al', 'con', 'por', 'para', 'sin', 'sobre', 'entre',
  'y', 'e', 'o', 'u', 'que', 'se', 'su', 'sus', 'es', 'son', 'fue', 'eran',
]);

const cleanWord = (w: string) => w.replace(/[.,;:()¿?¡!]/g, '').trim();

const getCardTerm = (c: Flashcard): string => cleanConceptTerm(c.term || (c as any).frontText || '');
const getCardDef = (c: Flashcard): string => cleanConceptDefinition(c.definition || (c as any).backText || '');

export const DefinitionBuilderGame: React.FC<DefinitionBuilderGameProps> = ({
  flashcards,
  onBack,
  onGameComplete,
}) => {
  const [currentRound, setCurrentRound] = useState(0); // 0 to TOTAL_ROUNDS - 1
  const [score, setScore] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [masteredTerms, setMasteredTerms] = useState<string[]>([]);

  // Round specific state
  const [currentCard, setCurrentCard] = useState<Flashcard | null>(null);
  const [tokens, setTokens] = useState<BlankToken[]>([]);
  const [wordBank, setWordBank] = useState<{ id: string; word: string; isUsed: boolean }[]>([]);
  const [activeBlankIndex, setActiveBlankIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'idle' | 'correct' | 'wrong'>('idle');

  // Filter valid flashcards prioritizing rich, contextual definitions (>= 7 words)
  const validCards = useMemo(() => {
    const rich = flashcards.filter(f => {
      const def = getCardDef(f);
      return def && def.split(/\s+/).length >= 7;
    });
    if (rich.length >= 3) return rich;

    return flashcards.filter(f => {
      const def = getCardDef(f);
      return def && def.split(/\s+/).length >= 4;
    });
  }, [flashcards]);

  // Set up a round with pedagogical scaffolding (never consecutive blanks, rich anchor context)
  const setupRound = useCallback((roundIdx: number, usedIds: Set<string>) => {
    const pool = validCards.filter(c => !usedIds.has(c.id));
    const target = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : validCards[roundIdx % validCards.length];
    if (!target) return;

    setCurrentCard(target);
    const rawDef = getCardDef(target);
    const def = maskTermInDefinition(getCardTerm(target), rawDef);
    const rawWords = def.split(/\s+/).filter(Boolean);
    const totalWords = rawWords.length;

    // Determine target blank count: maximum 20-25% of words, never leaving the sentence without context
    let targetBlankCount = 1;
    if (totalWords >= 14) {
      targetBlankCount = 3;
    } else if (totalWords >= 8) {
      targetBlankCount = 2;
    } else {
      targetBlankCount = 1;
    }

    // Identify candidate positions to convert to blanks (exclude stop words, pure numbers, and very short words)
    const eligibleIndices: number[] = [];
    rawWords.forEach((w, idx) => {
      const cw = cleanWord(w).toLowerCase();
      if (cw.length >= 4 && !STOP_WORDS.has(cw) && !/^\d+$/.test(cw)) {
        eligibleIndices.push(idx);
      }
    });

    if (eligibleIndices.length === 0) {
      rawWords.forEach((w, idx) => {
        if (cleanWord(w).length >= 4 && !/^\d+$/.test(cleanWord(w))) {
          eligibleIndices.push(idx);
        }
      });
    }

    // Pick blanks ensuring:
    // 1. Strictly NO consecutive blanks (every blank must have surrounding visible words)
    // 2. The first word is kept visible in short sentences (< 10 words) as an anchor
    const shuffledEligible = [...eligibleIndices].sort(() => Math.random() - 0.5);
    const chosenBlankIndices = new Set<number>();

    for (const idx of shuffledEligible) {
      if (chosenBlankIndices.size >= targetBlankCount) break;

      // Rule: strictly no consecutive blanks
      if (chosenBlankIndices.has(idx - 1) || chosenBlankIndices.has(idx + 1)) {
        continue;
      }

      // Keep first word as anchor in shorter sentences
      if (idx === 0 && totalWords < 10 && chosenBlankIndices.size === 0 && eligibleIndices.some(c => c > 0)) {
        continue;
      }

      chosenBlankIndices.add(idx);
    }

    // Fallback: if none chosen, pick one non-first candidate or middle
    if (chosenBlankIndices.size === 0 && eligibleIndices.length > 0) {
      const nonFirst = eligibleIndices.find(idx => idx > 0);
      chosenBlankIndices.add(nonFirst !== undefined ? nonFirst : eligibleIndices[0]);
    }

    const parsedTokens: BlankToken[] = rawWords.map((rawWord, idx) => {
      const isBlank = chosenBlankIndices.has(idx);
      return {
        index: idx,
        word: rawWord,
        isBlank,
        userWord: null,
      };
    });

    // Gather correct words for the blanks
    const correctWords: string[] = [];
    parsedTokens.forEach(t => {
      if (t.isBlank) {
        correctWords.push(cleanWord(t.word));
      }
    });

    // Gather 4-6 balanced distractor words from other flashcard definitions
    const otherDefs = validCards
      .filter(c => c.id !== target.id)
      .map(c => getCardDef(c))
      .join(' ')
      .split(/\s+/)
      .map(cleanWord)
      .filter(w => w.length >= 4 && !STOP_WORDS.has(w.toLowerCase()) && !/^\d+$/.test(w));

    const uniqueDistractors = Array.from(new Set(otherDefs))
      .filter(w => !correctWords.some(cw => cw.toLowerCase() === w.toLowerCase()))
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(6, Math.max(4, 7 - correctWords.length)));

    // Combined word bank of 6 to 8 chips (clean, focused, not overwhelming)
    const bankItems = [...correctWords, ...uniqueDistractors]
      .sort(() => Math.random() - 0.5)
      .map((w, idx) => ({
        id: `chip-${idx}-${w}`,
        word: w,
        isUsed: false,
      }));

    setTokens(parsedTokens);
    setWordBank(bankItems);
    setFeedback('idle');

    // Default active blank is the first one
    const firstBlank = parsedTokens.findIndex(t => t.isBlank);
    setActiveBlankIndex(firstBlank !== -1 ? firstBlank : null);
  }, [validCards]);

  useEffect(() => {
    if (validCards.length > 0) {
      setupRound(0, new Set());
    }
  }, [setupRound, validCards]);

  // Click on chip from bank
  const handleBankChipClick = (chip: { id: string; word: string; isUsed: boolean }) => {
    if (chip.isUsed || feedback === 'correct') return;

    gameAudio.playTap();

    // Determine target blank slot: either activeBlankIndex if empty, or next available empty blank
    let targetIdx = activeBlankIndex;
    if (targetIdx === null || !tokens[targetIdx] || !tokens[targetIdx].isBlank || tokens[targetIdx].userWord !== null) {
      targetIdx = tokens.findIndex(t => t.isBlank && t.userWord === null);
    }

    if (targetIdx === -1) return; // All blanks full

    const newTokens = [...tokens];
    newTokens[targetIdx] = {
      ...newTokens[targetIdx],
      userWord: chip.word,
    };

    const newBank = wordBank.map(b => b.id === chip.id ? { ...b, isUsed: true } : b);

    setTokens(newTokens);
    setWordBank(newBank);

    // Find next empty blank to auto-focus
    const nextBlank = newTokens.findIndex((t, i) => i > targetIdx! && t.isBlank && t.userWord === null);
    const anyNext = nextBlank !== -1 ? nextBlank : newTokens.findIndex(t => t.isBlank && t.userWord === null);
    setActiveBlankIndex(anyNext !== -1 ? anyNext : null);

    // Check if all blanks filled
    const allFilled = newTokens.every(t => !t.isBlank || t.userWord !== null);
    if (allFilled) {
      validateRound(newTokens);
    }
  };

  // Click on a filled blank to return it to the bank
  const handleBlankClick = (tokenIndex: number) => {
    const token = tokens[tokenIndex];
    if (!token.isBlank || feedback === 'correct') return;

    if (token.userWord) {
      gameAudio.playTap();
      // Free chip in bank
      const newBank = [...wordBank];
      const usedChip = newBank.find(b => b.word.toLowerCase() === token.userWord?.toLowerCase() && b.isUsed);
      if (usedChip) {
        usedChip.isUsed = false;
      }

      const newTokens = [...tokens];
      newTokens[tokenIndex] = {
        ...newTokens[tokenIndex],
        userWord: null,
      };

      setTokens(newTokens);
      setWordBank(newBank);
      setActiveBlankIndex(tokenIndex);
      setFeedback('idle');
    } else {
      setActiveBlankIndex(tokenIndex);
    }
  };

  // Validate the completed sentence
  const validateRound = (currentTokens: BlankToken[]) => {
    let allCorrect = true;
    currentTokens.forEach(t => {
      if (t.isBlank) {
        const expected = cleanWord(t.word).toLowerCase();
        const actual = (t.userWord || '').toLowerCase();
        if (expected !== actual) {
          allCorrect = false;
        }
      }
    });

    if (allCorrect) {
      gameAudio.playSuccess();
      setFeedback('correct');

      const nextMultiplier = multiplier + 1;
      const pointsEarned = 100 * multiplier;
      const newScore = score + pointsEarned;
      setScore(newScore);
      setMultiplier(nextMultiplier);

      if (currentCard) {
        setMasteredTerms(prev => [...prev, getCardTerm(currentCard)]);
      }

      // Progress to next round after delay
      setTimeout(() => {
        if (currentRound + 1 >= TOTAL_ROUNDS) {
          setGameOver(true);
          confetti({
            particleCount: 130,
            spread: 80,
            origin: { y: 0.6 },
          });
          if (onGameComplete) {
            onGameComplete(newScore + 300, masteredTerms);
          }
        } else {
          const nextR = currentRound + 1;
          setCurrentRound(nextR);
          setupRound(nextR, new Set(masteredTerms));
        }
      }, 900);
    } else {
      gameAudio.playError();
      setFeedback('wrong');
      setMultiplier(1); // Reset multiplier on error
    }
  };

  const handleRestart = () => {
    gameAudio.playTap();
    setCurrentRound(0);
    setScore(0);
    setMultiplier(1);
    setGameOver(false);
    setMasteredTerms([]);
    setupRound(0, new Set());
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-4 sm:py-6 animate-fadeIn text-slate-100">
      {/* Top Header Bar matching Screenshot 6 */}
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
          <CheckSquare className="w-5 h-5 text-indigo-400" />
          <span>Constructor de Definiciones</span>
        </div>

        <div className="w-24" /> {/* Spacer to center title */}
      </div>

      {/* Main Card Frame */}
      <div className="rounded-3xl bg-[#140e2b]/95 border border-white/[0.12] p-6 sm:p-10 shadow-2xl relative">
        {/* Top bar inside container: Puntuación & Round Indicator */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/[0.08] tabular-nums">
          <div className="flex items-center gap-2 font-extrabold text-base sm:text-lg text-emerald-400">
            <span>Puntuación:</span>
            <span>{score}</span>
            <span className="text-emerald-300 font-bold ml-0.5">({`×${multiplier}`})</span>
          </div>

          <div className="text-slate-400 font-semibold text-sm">
            <strong className="text-white">{currentRound + 1}</strong>/{TOTAL_ROUNDS}
          </div>
        </div>

        {/* Target Term in centered bold purple/lavender matching Screenshot 6 */}
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#c084fc] tracking-tight">
            {currentCard ? <FormattedText text={getCardTerm(currentCard)} inlineOnly /> : 'Cargando...'}
          </h2>
        </div>

        {/* Definition Sentence with Blanks */}
        <div className={`p-6 sm:p-8 rounded-2xl bg-[#0e0920]/90 border transition-all duration-200 shadow-inner mb-10 leading-loose text-base sm:text-lg flex flex-wrap items-center gap-x-2 gap-y-3.5 ${
          feedback === 'correct'
            ? 'border-emerald-500/50 shadow-emerald-500/10'
            : feedback === 'wrong'
            ? 'border-rose-500/50 shadow-rose-500/10 animate-shake'
            : 'border-white/[0.1]'
        }`}>
          {tokens.map((token, idx) => {
            if (!token.isBlank) {
              return (
                <span key={idx} className="text-slate-200 font-normal">
                  {token.word}
                </span>
              );
            }

            const isFilled = token.userWord !== null;
            const isActive = activeBlankIndex === idx;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleBlankClick(idx)}
                className={`inline-flex items-center justify-center min-w-[85px] h-9 px-3.5 rounded-xl border font-semibold text-sm transition-all duration-150 cursor-pointer ${
                  isFilled
                    ? feedback === 'correct'
                      ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200'
                      : feedback === 'wrong'
                      ? 'bg-rose-600/30 border-rose-400 text-rose-200'
                      : 'bg-[#3b1d60] border-purple-400/60 text-purple-100 hover:bg-[#4a2478]'
                    : isActive
                    ? 'bg-[#291745] border-purple-400 text-purple-300 ring-2 ring-purple-400/40'
                    : 'bg-[#201338] border-dashed border-purple-500/40 text-purple-400/60 hover:border-purple-400'
                }`}
              >
                {isFilled ? token.userWord : '____'}
              </button>
            );
          })}
        </div>

        {/* Word Chips Bank matching Screenshot 6 */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 max-w-3xl mx-auto">
          {wordBank.map(chip => (
            <button
              key={chip.id}
              type="button"
              disabled={chip.isUsed || feedback === 'correct'}
              onClick={() => handleBankChipClick(chip)}
              className={`px-4 py-2 rounded-full border text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer active-press ${
                chip.isUsed
                  ? 'opacity-25 bg-white/[0.02] border-white/[0.05] text-slate-500 cursor-not-allowed pointer-events-none'
                  : 'bg-[#1e153b] hover:bg-[#2b1e54] border-white/[0.12] text-slate-200 hover:text-white hover:border-purple-400/50 shadow-sm'
              }`}
            >
              {chip.word}
            </button>
          ))}
        </div>

        {/* Wrong Feedback Hint */}
        {feedback === 'wrong' && (
          <div className="mt-6 text-center text-xs sm:text-sm text-rose-300 font-medium animate-fadeIn">
            Algunos espacios no son correctos. Haz clic en una palabra colocada para regresarla al banco y probar otra.
          </div>
        )}
      </div>

      {/* Game Over / Victory Modal */}
      {gameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-[#140e2b] border border-white/[0.12] shadow-2xl text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center mb-4 text-emerald-400">
              <Trophy className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">¡Definiciones Completadas!</h3>
            <p className="text-sm text-slate-300 mb-6">
              Completaste exitosamente las 6 rondas de reconstrucción léxica.
            </p>

            <div className="w-full py-4 px-6 rounded-2xl bg-white/[0.04] border border-white/[0.08] mb-6 flex justify-around tabular-nums">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-0.5">Puntuación Final</span>
                <span className="text-2xl font-extrabold text-emerald-400">{score}</span>
              </div>
              <div className="w-px bg-white/10" />
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-0.5">Términos Dominados</span>
                <span className="text-2xl font-extrabold text-purple-300">{masteredTerms.length}</span>
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
