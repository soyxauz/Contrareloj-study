import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Flashcard } from '../../../types';
import { Layers, ArrowLeft, RotateCcw, Trophy, AlertCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { gameAudio } from './gameAudio';
import { cleanConceptDefinition, cleanConceptTerm } from '../flashcardSanitizer';
import { FormattedText } from '../../FormattedText';

interface StackerGameProps {
  flashcards: Flashcard[];
  onBack: () => void;
  onGameComplete?: (score: number, termsMastered: string[]) => void;
}

interface Block {
  leftPercent: number; // 0 to 100
  widthPercent: number; // e.g. 50
  color: string;
}

const TOTAL_LEVELS = 8;
const BLOCK_COLORS = [
  '#2563eb', // Azul base (como el screenshot)
  '#c084fc', // Lavanda claro
  '#a855f7', // Púrpura medio
  '#e9d5ff', // Grisáceo / lila suave
  '#818cf8', // Índigo pastel
  '#c084fc', // Lavanda
  '#9333ea', // Violeta intenso
  '#38bdf8', // Celeste cian
];

const getCardTerm = (c: Flashcard): string => cleanConceptTerm(c.term || (c as any).frontText || '');
const getCardDef = (c: Flashcard): string => cleanConceptDefinition(c.definition || (c as any).backText || '');

export const StackerGame: React.FC<StackerGameProps> = ({
  flashcards,
  onBack,
  onGameComplete,
}) => {
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [masteredTerms, setMasteredTerms] = useState<string[]>([]);

  // Stack of placed blocks - start with blue base platform matching screenshot
  const [stackedBlocks, setStackedBlocks] = useState<Block[]>([
    { leftPercent: 15, widthPercent: 55, color: '#0072f5' }, // Base platform
  ]);

  // Current sliding block
  const [slidingLeft, setSlidingLeft] = useState(15);
  const [slidingWidth, setSlidingWidth] = useState(38);
  const [isSliding, setIsSliding] = useState(true);
  const directionRef = useRef<1 | -1>(1);
  const speedRef = useRef(0.48); // percent per frame
  const animFrameRef = useRef<number | null>(null);

  // Question selection for current level
  const [currentCard, setCurrentCard] = useState<Flashcard | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<'correct' | 'wrong' | null>(null);
  const usedCardIdsRef = useRef<Set<string>>(new Set());

  // Prepare a turn
  const loadQuestionForLevel = useCallback((usedCardIds: Set<string>) => {
    if (flashcards.length === 0) return;
    const available = flashcards.filter(f => !usedCardIds.has(f.id));
    const pool = available.length > 0 ? available : flashcards;
    const target = pool[Math.floor(Math.random() * pool.length)];

    // Get 3 distractors
    const distractors = flashcards
      .filter(f => f.id !== target.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map(f => getCardTerm(f));

    // Shuffle options
    const targetTerm = getCardTerm(target);
    const allOpts = Array.from(new Set([targetTerm, ...distractors])).sort(() => Math.random() - 0.5);

    setCurrentCard(target);
    setOptions(allOpts);
    setSelectedOption(null);
    setFeedbackStatus(null);
    setIsSliding(true);
  }, [flashcards]);

  // Start initial game
  useEffect(() => {
    usedCardIdsRef.current = new Set();
    loadQuestionForLevel(usedCardIdsRef.current);
  }, [loadQuestionForLevel]);

  // Sliding block animation loop
  useEffect(() => {
    if (!isSliding || gameOver || gameWon) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const animate = () => {
      setSlidingLeft(prev => {
        let next = prev + directionRef.current * speedRef.current;
        const maxLeft = 100 - slidingWidth;

        if (next >= maxLeft) {
          next = maxLeft;
          directionRef.current = -1;
        } else if (next <= 0) {
          next = 0;
          directionRef.current = 1;
        }
        return next;
      });

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isSliding, gameOver, gameWon, slidingWidth]);

  // Handle term selection
  const handleOptionClick = (term: string) => {
    if (!currentCard || feedbackStatus !== null || gameOver || gameWon) return;

    setSelectedOption(term);
    const currentTerm = getCardTerm(currentCard);
    const isCorrect = term.trim().toLowerCase() === currentTerm.trim().toLowerCase();

    if (isCorrect) {
      gameAudio.playBlockDrop();
      setIsSliding(false);
      setFeedbackStatus('correct');

      // Calculate overlap with the block directly below
      const prevBlock = stackedBlocks[stackedBlocks.length - 1];
      const prevLeft = prevBlock.leftPercent;
      const prevRight = prevBlock.leftPercent + prevBlock.widthPercent;

      const currentRight = slidingLeft + slidingWidth;

      const overlapLeft = Math.max(slidingLeft, prevLeft);
      const overlapRight = Math.min(currentRight, prevRight);
      const overlapWidth = overlapRight - overlapLeft;

      if (overlapWidth > 5) {
        // Success: block lands securely
        const nextColor = BLOCK_COLORS[(stackedBlocks.length) % BLOCK_COLORS.length];
        const newBlock: Block = {
          leftPercent: overlapLeft,
          widthPercent: overlapWidth,
          color: nextColor,
        };

        const newStack = [...stackedBlocks, newBlock];
        setStackedBlocks(newStack);

        const newScore = score + Math.round(overlapWidth * 12);
        setScore(newScore);

        const newMastered = [...masteredTerms, currentTerm];
        setMasteredTerms(newMastered);

        if (newStack.length >= TOTAL_LEVELS) {
          // Won game
          setTimeout(() => {
            gameAudio.playSuccess();
            setGameWon(true);
            confetti({
              particleCount: 120,
              spread: 70,
              origin: { y: 0.6 },
            });
            if (onGameComplete) {
              onGameComplete(newScore + 500, newMastered);
            }
          }, 600);
        } else {
          // Prepare next level
          setTimeout(() => {
            usedCardIdsRef.current.add(currentCard.id);
            setSlidingWidth(overlapWidth); // New sliding block matches previous overlap
            speedRef.current = Math.min(0.9, speedRef.current + 0.06); // Accelerate slightly
            loadQuestionForLevel(usedCardIdsRef.current);
          }, 700);
        }
      } else {
        // Block missed completely or overlap too small
        gameAudio.playError();
        setGameOver(true);
      }
    } else {
      // Wrong term selected
      gameAudio.playError();
      setFeedbackStatus('wrong');
      setIsSliding(false);

      setTimeout(() => {
        setGameOver(true);
      }, 700);
    }
  };

  const handleRestart = () => {
    gameAudio.playTap();
    setScore(0);
    setGameOver(false);
    setGameWon(false);
    setStackedBlocks([{ leftPercent: 15, widthPercent: 55, color: '#0072f5' }]);
    setSlidingLeft(15);
    setSlidingWidth(38);
    speedRef.current = 0.48;
    directionRef.current = 1;
    setMasteredTerms([]);
    usedCardIdsRef.current = new Set();
    loadQuestionForLevel(usedCardIdsRef.current);
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-3 sm:py-6 animate-fadeIn text-slate-100">
      {/* Top Header Bar matching Screenshot 3 */}
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
          <Layers className="w-5 h-5 text-indigo-400" />
          <span>Apilador</span>
        </div>

        <div className="flex items-center gap-4 text-xs font-semibold tabular-nums">
          <span className="text-slate-400 hidden sm:inline">
            Nivel: <strong className="text-white">{stackedBlocks.length - 1}/{TOTAL_LEVELS - 1}</strong>
          </span>
          <span className="px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.1] text-indigo-200 font-bold">
            Puntos: <strong className="text-white ml-1">{score}</strong>
          </span>
        </div>
      </div>

      {/* Main Game Arena */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Column: Tower Visualizer (5 cols) */}
        <div className="lg:col-span-5 h-[420px] rounded-3xl bg-[#0d091e]/85 border border-white/[0.08] p-6 relative flex flex-col justify-end overflow-hidden shadow-2xl backdrop-blur-sm">
          {/* Background horizontal guideline marks */}
          <div className="absolute inset-0 flex flex-col justify-between py-8 px-6 pointer-events-none opacity-25">
            {Array.from({ length: TOTAL_LEVELS }).map((_, i) => (
              <div key={i} className="w-full h-px border-b border-dashed border-slate-400" />
            ))}
          </div>

          {/* Tower blocks container */}
          <div className="w-full h-[320px] relative flex flex-col-reverse justify-start">
            {/* Base platform line */}
            <div className="w-full h-0.5 bg-white/20 rounded-full mb-1" />

            {/* Stacked blocks */}
            {stackedBlocks.map((b, idx) => (
              <div
                key={idx}
                className="h-9 rounded-xl border border-white/25 transition-transform duration-200 shadow-lg mb-1.5 relative"
                style={{
                  left: `${b.leftPercent}%`,
                  width: `${b.widthPercent}%`,
                  backgroundColor: b.color,
                }}
              />
            ))}

            {/* Sliding block (active turn) */}
            {isSliding && !gameOver && !gameWon && (
              <div
                className="h-9 rounded-xl border-2 border-white/80 shadow-[0_0_15px_rgba(255,255,255,0.3)] mb-1.5 absolute transition-none"
                style={{
                  bottom: `${stackedBlocks.length * 42}px`,
                  left: `${slidingLeft}%`,
                  width: `${slidingWidth}%`,
                  backgroundColor: BLOCK_COLORS[stackedBlocks.length % BLOCK_COLORS.length],
                }}
              />
            )}
          </div>
        </div>

        {/* Right Column: Definition & 2x2 Options (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          {/* Definition Prompt Box matching Screenshot 3 */}
          <div className="p-6 rounded-2xl bg-[#140e2b]/90 border border-white/[0.12] backdrop-blur-md shadow-xl min-h-[120px] flex items-center">
            <div className="text-base sm:text-lg text-slate-100 leading-relaxed font-normal">
              <FormattedText text={currentCard ? getCardDef(currentCard) : 'Cargando definición de la tarjeta...'} inlineOnly />
            </div>
          </div>

          {/* 2x2 Grid of Term Options matching Screenshot 3 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {options.map((opt, i) => {
              const isSelected = selectedOption === opt;
              let btnClass = 'bg-[#181136]/90 border-white/[0.09] text-slate-100 hover:border-indigo-400/50 hover:bg-[#231a4a]';

              if (isSelected && feedbackStatus === 'correct') {
                btnClass = 'bg-emerald-600/40 border-emerald-400 text-emerald-100 shadow-[0_0_15px_rgba(16,185,129,0.3)]';
              } else if (isSelected && feedbackStatus === 'wrong') {
                btnClass = 'bg-rose-600/40 border-rose-400 text-rose-100 shadow-[0_0_15px_rgba(244,63,94,0.3)]';
              }

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleOptionClick(opt)}
                  disabled={feedbackStatus !== null || gameOver || gameWon}
                  className={`p-5 rounded-2xl border text-left font-semibold text-sm sm:text-base min-h-[85px] flex items-center justify-start transition-transform active:scale-[0.985] duration-150 cursor-pointer shadow-md ${btnClass}`}
                >
                  <span className="leading-snug break-words">
                    <FormattedText text={opt} inlineOnly />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Game Over / Victory Modal */}
      {(gameOver || gameWon) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-[#140e2b] border border-white/[0.12] shadow-2xl text-center flex flex-col items-center">
            {gameWon ? (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center mb-4 text-emerald-400">
                  <Trophy className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">¡Torre Completada!</h3>
                <p className="text-sm text-slate-300 mb-6">
                  Lograste apilar la torre hasta la cima con éxito absoluto.
                </p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-rose-500/20 border border-rose-400/40 flex items-center justify-center mb-4 text-rose-400">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">La Torre se Cayó</h3>
                <p className="text-sm text-slate-300 mb-6">
                  {feedbackStatus === 'wrong'
                    ? 'Elegiste el término incorrecto para esa definición.'
                    : 'El bloque oscilante perdió el equilibrio y cayó.'}
                </p>
              </>
            )}

            <div className="w-full py-4 px-6 rounded-2xl bg-white/[0.04] border border-white/[0.08] mb-6 flex justify-around tabular-nums">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-0.5">Puntuación</span>
                <span className="text-2xl font-extrabold text-white">{score}</span>
              </div>
              <div className="w-px bg-white/10" />
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-0.5">Nivel Final</span>
                <span className="text-2xl font-extrabold text-indigo-300">{stackedBlocks.length - 1}</span>
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
