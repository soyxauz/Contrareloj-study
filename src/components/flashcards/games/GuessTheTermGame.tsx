import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Flashcard } from '../../../types';
import {
  ArrowLeft,
  MessageSquare,
  Send,
  Eye,
  EyeOff,
  RotateCcw,
  Trophy,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { gameAudio } from './gameAudio';
import { cleanConceptDefinition, cleanConceptTerm, maskTermInDefinition } from '../flashcardSanitizer';
import { FormattedText } from '../../FormattedText';

interface GuessTheTermGameProps {
  flashcards: Flashcard[];
  onBack: () => void;
  onGameComplete?: (score: number, termsMastered: string[]) => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
}

const MAX_QUESTIONS = 8;

const getCardTerm = (c: Flashcard): string => cleanConceptTerm(c.term || (c as any).frontText || '');
const getCardDef = (c: Flashcard): string => cleanConceptDefinition(c.definition || (c as any).backText || '');

export const GuessTheTermGame: React.FC<GuessTheTermGameProps> = ({
  flashcards,
  onBack,
  onGameComplete,
}) => {
  const [targetCard, setTargetCard] = useState<Flashcard | null>(null);
  const [showDefinitions, setShowDefinitions] = useState(false);
  const [eliminatedIds, setEliminatedIds] = useState<Set<string>>(new Set());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [questionsUsed, setQuestionsUsed] = useState(0);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isSelectingAnswer, setIsSelectingAnswer] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [surrendered, setSurrendered] = useState(false);
  const [score, setScore] = useState(0);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Pool of candidate cards (minimum 9, up to 15 cards for the 3-col grid)
  const candidateCards = useMemo(() => {
    return flashcards
      .filter(f => getCardTerm(f).trim().length > 0)
      .slice(0, 15);
  }, [flashcards]);

  // Start new round
  const startNewGame = useCallback(() => {
    if (candidateCards.length === 0) return;
    const target = candidateCards[Math.floor(Math.random() * candidateCards.length)];
    setTargetCard(target);
    setEliminatedIds(new Set());
    setChatMessages([
      {
        id: 'msg-init',
        sender: 'ai',
        text: '¡Hola! He elegido un término secreto del tablero. Hazme preguntas de sí o no para descartar opciones y adivinar cuál es.',
      },
    ]);
    setInputQuestion('');
    setQuestionsUsed(0);
    setIsAiThinking(false);
    setIsSelectingAnswer(false);
    setGameOver(false);
    setGameWon(false);
    setSurrendered(false);
    setScore(0);
  }, [candidateCards]);

  useEffect(() => {
    startNewGame();
  }, [startNewGame]);

  // Auto scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isAiThinking]);

  // Toggle eye elimination for a card
  const toggleCardElimination = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    gameAudio.playTap();
    setEliminatedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Evaluate user question with smart semantic heuristic
  const evaluateQuestion = async (question: string, target: Flashcard, currentQCount: number): Promise<string> => {
    const term = getCardTerm(target);
    const def = getCardDef(target);

    // High performance local semantic heuristic
    const qLower = question.toLowerCase();
    const targetText = `${term} ${def}`.toLowerCase();

    // Check keywords
    const isAnti = /anti|inmune|anticuerpo|globulina|linfocito|leucocito|célula|celula/i.test(targetText);
    const isPregnancy = /embarazo|gesta|fetal|placenta|trofoblasto|aborto|maternal/i.test(targetText);
    const isVascular = /trombo|coagul|sangre|vascular|plaqueta|vaso|arteria|venoso/i.test(targetText);

    if (qLower.includes('embarazo') || qLower.includes('fetal') || qLower.includes('placenta') || qLower.includes('madre')) {
      return isPregnancy ? 'Sí, tiene una relación directa con el embarazo y la gestación.' : 'No, no está relacionado primordialmente con el embarazo.';
    }

    if (qLower.includes('anticuerpo') || qLower.includes('inmune') || qLower.includes('defensa')) {
      return isAnti ? 'Sí, forma parte del sistema inmunitario o de la respuesta de anticuerpos.' : 'No, no es un anticuerpo.';
    }

    if (qLower.includes('coagul') || qLower.includes('trombo') || qLower.includes('sangre')) {
      return isVascular ? 'Sí, incide en los mecanismos vasculares o de coagulación.' : 'No, no incide en la coagulación.';
    }

    // Direct word overlap
    const qTokens = qLower.replace(/[¿?¡!,.]/g, '').split(/\s+/).filter(w => w.length > 4);
    const hasOverlap = qTokens.some(tok => targetText.includes(tok));

    if (hasOverlap) {
      return currentQCount >= 4
        ? 'Sí. Además, juega un rol determinante en los criterios clínicos evaluados.'
        : 'Sí, está estrechamente relacionado con ese aspecto.';
    }

    return currentQCount >= 4
      ? 'No. Concéntrate en el mecanismo biológico o celular principal.'
      : 'No, no corresponde con esa característica.';
  };

  // Handle submit question
  const handleSendQuestion = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = inputQuestion.trim();
    if (!q || isAiThinking || !targetCard || questionsUsed >= MAX_QUESTIONS || gameOver) return;

    gameAudio.playTap();
    const newCount = questionsUsed + 1;
    setQuestionsUsed(newCount);
    setInputQuestion('');

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: q,
    };

    setChatMessages(prev => [...prev, userMsg]);
    setIsAiThinking(true);

    try {
      const aiReply = await evaluateQuestion(q, targetCard, newCount);
      setChatMessages(prev => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: aiReply,
        },
      ]);
      gameAudio.playTap();
    } catch {
      setChatMessages(prev => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: 'Sí, está estrechamente relacionado con ese concepto.',
        },
      ]);
    } finally {
      setIsAiThinking(false);
    }
  };

  // Handle card selection (guess)
  const handleSelectCard = (card: Flashcard) => {
    if (gameOver || !targetCard) return;

    const chosenTerm = getCardTerm(card);
    const targetTerm = getCardTerm(targetCard);

    if (chosenTerm.toLowerCase().trim() === targetTerm.toLowerCase().trim()) {
      // Correct guess!
      gameAudio.playSuccess();
      const points = Math.max(300, (MAX_QUESTIONS - questionsUsed) * 150);
      setScore(points);
      setGameWon(true);
      setGameOver(true);
      confetti({
        particleCount: 130,
        spread: 80,
        origin: { y: 0.6 },
      });
      if (onGameComplete) {
        onGameComplete(points, [targetTerm]);
      }
    } else {
      // Wrong guess
      gameAudio.playError();
      // Strike card out
      setEliminatedIds(prev => new Set(prev).add(card.id));
      setChatMessages(prev => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          sender: 'ai',
          text: `Esa no es la respuesta correcta (${chosenTerm}). ¡Sigue indagando o descarta más opciones!`,
        },
      ]);
    }
  };

  // Surrender
  const handleSurrender = () => {
    if (gameOver || !targetCard) return;
    gameAudio.playError();
    setSurrendered(true);
    setGameOver(true);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-3 sm:py-6 animate-fadeIn text-slate-100">
      {/* Top Header Bar matching Screenshot 4 */}
      <div className="flex items-center justify-between mb-6 pb-2">
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
          <MessageSquare className="w-5 h-5 text-indigo-400" />
          <span>Adivina el Término</span>
        </div>

        <div className="w-24" /> {/* Spacer */}
      </div>

      {/* Main Grid: Left Chat Panel (4 cols) | Right Candidates Board (8 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: AI Chat & Action Buttons */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <p className="text-sm text-slate-300 font-medium leading-relaxed">
            Haz preguntas de sí o no en el chat para deducir el término secreto.
          </p>

          {/* Chat Box Container */}
          <div className="rounded-3xl bg-[#140e2b]/95 border border-white/[0.12] p-4 flex flex-col h-[380px] shadow-2xl relative">
            {/* Scrollable messages history */}
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1.5 custom-scrollbar">
              {chatMessages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-none shadow-sm'
                      : 'bg-[#221644] border border-white/[0.08] text-purple-100 rounded-bl-none shadow-sm'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}

              {isAiThinking && (
                <div className="flex justify-start">
                  <div className="bg-[#221644] border border-white/[0.08] text-purple-200 rounded-2xl rounded-bl-none px-3.5 py-2 text-xs flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                    <span>Analizando características...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Questions Counter */}
            <div className="text-[11px] font-semibold text-slate-400 py-2 border-t border-white/[0.08] tabular-nums">
              Has utilizado <strong className="text-white">{questionsUsed}</strong> de {MAX_QUESTIONS} preguntas
            </div>

            {/* Text Input Row */}
            <form onSubmit={handleSendQuestion} className="relative flex items-center">
              <input
                type="text"
                value={inputQuestion}
                onChange={e => setInputQuestion(e.target.value)}
                placeholder="¿Está relacionado con...?"
                disabled={isAiThinking || questionsUsed >= MAX_QUESTIONS || gameOver}
                className="w-full bg-[#0d081e] border border-white/[0.12] focus:border-indigo-400 rounded-2xl pl-3.5 pr-11 py-2.5 text-base md:text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={!inputQuestion.trim() || isAiThinking || questionsUsed >= MAX_QUESTIONS || gameOver}
                className="absolute right-1.5 p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>

          {/* Action Buttons: Rendirse & Elegir respuesta */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSurrender}
              disabled={gameOver}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[#2a243d]/70 hover:bg-[#383152] border border-white/[0.1] text-slate-300 text-xs sm:text-sm font-semibold transition-transform active:scale-[0.98] duration-150 cursor-pointer text-center"
            >
              Rendirse
            </button>

            <button
              type="button"
              onClick={() => setIsSelectingAnswer(!isSelectingAnswer)}
              disabled={gameOver}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all active:scale-[0.98] duration-150 cursor-pointer text-center shadow-md ${
                isSelectingAnswer
                  ? 'bg-purple-500 text-white ring-2 ring-purple-300 animate-pulse'
                  : 'bg-[#d8b4fe] hover:bg-[#c084fc] text-[#1e1338]'
              }`}
            >
              {isSelectingAnswer ? 'Haz clic en el término' : 'Elegir respuesta'}
            </button>
          </div>
        </div>

        {/* Right Column: Candidate Cards Board (8 cols) matching Screenshot 4 */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {/* Top Bar: Términos Title & Definiciones Toggle */}
          <div className="flex items-center justify-between pb-1">
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Términos
            </h3>

            <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-300">
              <span>Definiciones</span>
              <button
                type="button"
                onClick={() => {
                  gameAudio.playTap();
                  setShowDefinitions(!showDefinitions);
                }}
                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer p-0.5 ${
                  showDefinitions ? 'bg-indigo-600' : 'bg-slate-700'
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  showDefinitions ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>
          </div>

          {/* 3-column scrollable grid of Candidate Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 max-h-[560px] overflow-y-auto pr-1.5 custom-scrollbar">
            {candidateCards.map(card => {
              const isEliminated = eliminatedIds.has(card.id);
              const cardTerm = getCardTerm(card);
              const cardDef = getCardDef(card);

              return (
                <div
                  key={card.id}
                  onClick={() => handleSelectCard(card)}
                  className={`p-4 sm:p-5 rounded-2xl border min-h-[110px] flex flex-col justify-between relative transition-all duration-150 cursor-pointer shadow-md ${
                    isEliminated
                      ? 'bg-[#120c24]/50 border-white/[0.04] opacity-35 text-slate-500 line-through'
                      : isSelectingAnswer
                      ? 'bg-[#221644] border-purple-400 hover:scale-[1.02] text-white shadow-purple-500/20 ring-1 ring-purple-400'
                      : 'bg-[#181033]/90 hover:bg-[#23174a] border-white/[0.09] text-slate-100 hover:border-purple-400/50'
                  }`}
                >
                  {/* Eye Toggle Elimination Button in Top Right */}
                  <button
                    type="button"
                    title={isEliminated ? 'Reactivar opción' : 'Descartar opción'}
                    onClick={(e) => toggleCardElimination(card.id, e)}
                    className="absolute top-2.5 right-2.5 p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/[0.1] transition-colors cursor-pointer"
                  >
                    {isEliminated ? <EyeOff className="w-4 h-4 text-rose-400" /> : <Eye className="w-4 h-4" />}
                  </button>

                  {/* Card Content: Term or Definition */}
                  <div className="pr-6 mt-1 flex items-center justify-center flex-1 text-center w-full">
                    <div className={`font-semibold leading-snug w-full ${showDefinitions ? 'text-xs text-slate-200 font-normal max-h-[140px] overflow-y-auto custom-scrollbar' : 'text-sm sm:text-base text-slate-100'}`}>
                      <FormattedText text={showDefinitions ? maskTermInDefinition(cardTerm, cardDef) : cardTerm} inlineOnly />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Game Over / Victory Modal */}
      {gameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-[#140e2b] border border-white/[0.12] shadow-2xl text-center flex flex-col items-center">
            {gameWon ? (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center mb-4 text-emerald-400">
                  <Trophy className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">¡Adivinaste el Término!</h3>
                <p className="text-sm text-slate-300 mb-6">
                  Descifraste que el término secreto era <strong className="text-purple-300 font-bold">{targetCard ? getCardTerm(targetCard) : ''}</strong> en {questionsUsed} preguntas.
                </p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-rose-500/20 border border-rose-400/40 flex items-center justify-center mb-4 text-rose-400">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">
                  {surrendered ? 'Te Has Rendido' : 'Ronda Terminada'}
                </h3>
                <p className="text-sm text-slate-300 mb-6">
                  {surrendered
                    ? 'Has decidido rendirte en esta ronda. El término secreto era:'
                    : 'Se acabaron las oportunidades. El término secreto era:'}{' '}
                  <strong className="text-purple-300 font-bold">{targetCard ? getCardTerm(targetCard) : ''}</strong>.
                </p>
              </>
            )}

            <div className="w-full py-4 px-6 rounded-2xl bg-white/[0.04] border border-white/[0.08] mb-6 flex justify-around tabular-nums">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-0.5">Puntuación</span>
                <span className="text-2xl font-extrabold text-emerald-400">{gameWon ? score : 0}</span>
              </div>
              <div className="w-px bg-white/10" />
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-0.5">Preguntas Usadas</span>
                <span className="text-2xl font-extrabold text-purple-300">{questionsUsed}/{MAX_QUESTIONS}</span>
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
