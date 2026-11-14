import React, { useState, useRef, useCallback } from 'react';
import type { StudyKit, Flashcard } from '../types';
import { authService } from '../services/authService';
import { googleDriveService } from '../services/googleDriveService';
import { Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { generateAdditionalAIFlashcards } from '../services/aiService';

// Subcomponents
import { FlashcardsListView } from './flashcards/FlashcardsListView';
import { FlashcardsDeckView } from './flashcards/FlashcardsDeckView';
import { FlashcardsGamesHub, type GameId } from './flashcards/FlashcardsGamesHub';
import { MatchingGame } from './flashcards/games/MatchingGame';
import { StackerGame } from './flashcards/games/StackerGame';
import { DefinitionBuilderGame } from './flashcards/games/DefinitionBuilderGame';
import { TermBuilderGame } from './flashcards/games/TermBuilderGame';
import { GuessTheTermGame } from './flashcards/games/GuessTheTermGame';
import { gameAudio } from './flashcards/games/gameAudio';

interface FlashcardsViewProps {
  kit: StudyKit;
  userId?: string | null;
  onUpdateKit?: (updatedKit: StudyKit) => void;
}

type MainTab = 'lista' | 'mazo' | 'juegos';

const getCardTerm = (c: Flashcard): string => c.term || (c as any).frontText || '';

export const FlashcardsView: React.FC<FlashcardsViewProps> = ({
  kit,
  userId = null,
  onUpdateKit,
}) => {
  // Load persisted progress
  const savedProgress = authService.getFlashcardProgress(userId, kit.id);

  const getCardMastery = (card: Flashcard, map?: Record<string, 'to-learn' | 'known' | 'mastered'> | null): 'to-learn' | 'known' | 'mastered' => {
    if (!map) return card.mastery || 'to-learn';
    const cleanTerm = (card.term || '').trim();
    const cleanLower = cleanTerm.toLowerCase();
    return (
      (card.id && map[card.id]) ||
      (card.term && map[card.term]) ||
      (cleanTerm && map[cleanTerm]) ||
      (cleanLower && map[cleanLower]) ||
      card.mastery ||
      'to-learn'
    );
  };

  const [cards, setCards] = useState<Flashcard[]>(() => {
    let rawCards = (kit.flashcards && Array.isArray(kit.flashcards) && kit.flashcards.length > 0)
      ? kit.flashcards
      : (savedProgress?.cards && savedProgress.cards.length > 0 ? savedProgress.cards : []);

    // Si el kit no tiene flashcards pregeneradas, derivar automáticamente del banco de preguntas y pares del kit
    if (rawCards.length === 0 && kit.questions && kit.questions.length > 0) {
      const extracted: Flashcard[] = [];
      const seen = new Set<string>();

      kit.questions.forEach(q => {
        if (q.matchingPairs && Array.isArray(q.matchingPairs)) {
          q.matchingPairs.forEach(p => {
            const t = p.term?.trim();
            const d = p.definition?.trim();
            if (t && d && t.length >= 3 && d.length >= 5 && !seen.has(t.toLowerCase())) {
              seen.add(t.toLowerCase());
              extracted.push({
                id: `card-auto-${extracted.length}-${Math.random().toString(36).substring(2, 6)}`,
                term: t,
                definition: d,
                mastery: 'to-learn',
                type: 'concept',
              });
            }
          });
        }
        if (q.topic && q.explanation && !seen.has(q.topic.toLowerCase()) && q.topic.length >= 3 && q.topic.length <= 45) {
          const cleanExpl = q.explanation.replace(/^[•\s*-]+/, '').trim();
          if (cleanExpl.length >= 15) {
            seen.add(q.topic.toLowerCase());
            extracted.push({
              id: `card-auto-${extracted.length}-${Math.random().toString(36).substring(2, 6)}`,
              term: q.topic.trim(),
              definition: cleanExpl.length > 160 ? cleanExpl.slice(0, 160) + '...' : cleanExpl,
              mastery: 'to-learn',
              type: 'concept',
            });
          }
        }
      });

      if (extracted.length > 0) {
        rawCards = extracted.slice(0, 27);
      }
    }

    const map = savedProgress?.masteryMap;
    return rawCards.map(c => ({
      ...c,
      mastery: getCardMastery(c, map),
    }));
  });

  const [archivedCards] = useState<Flashcard[]>(() => {
    if (savedProgress?.archivedCards && savedProgress.archivedCards.length > 0) {
      return savedProgress.archivedCards;
    }
    if (kit.archivedFlashcards && Array.isArray(kit.archivedFlashcards) && kit.archivedFlashcards.length > 0) {
      return kit.archivedFlashcards;
    }
    return [];
  });

  // Active top tab: 'lista' | 'mazo' | 'juegos'
  const [activeTab, setActiveTab] = useState<MainTab>('lista');
  const [activeGame, setActiveGame] = useState<GameId | null>(null);

  // AI Generation states
  const [isGeneratingMore, setIsGeneratingMore] = useState(false);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  const masteryMapRef = useRef<Record<string, 'to-learn' | 'known' | 'mastered'>>(
    savedProgress?.masteryMap ? { ...savedProgress.masteryMap } : {}
  );

  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  const kitRef = useRef(kit);
  kitRef.current = kit;

  const onUpdateKitRef = useRef(onUpdateKit);
  onUpdateKitRef.current = onUpdateKit;

  const showNotification = (msg: string) => {
    setStatusNotification(msg);
    setTimeout(() => {
      setStatusNotification(null);
    }, 4000);
  };

  // Sync helper
  const persistChanges = useCallback((nextCards: Flashcard[], nextArchived: Flashcard[] = archivedCards) => {
    const map: Record<string, 'to-learn' | 'known' | 'mastered'> = { ...masteryMapRef.current };
    nextCards.forEach(c => {
      if (c.id) map[c.id] = c.mastery || 'to-learn';
      if (c.term) map[c.term] = c.mastery || 'to-learn';
    });

    authService.saveFlashcardProgress(userId, kit.id, {
      version: 1,
      updatedAt: Date.now(),
      kitId: kit.id,
      cards: nextCards,
      archivedCards: nextArchived,
      masteryMap: map,
      currentIdx: 0,
    });

    if (onUpdateKitRef.current) {
      onUpdateKitRef.current({
        ...kitRef.current,
        flashcards: nextCards,
        archivedFlashcards: nextArchived,
      });
    }

    // Flush Drive sync in background
    googleDriveService.flushAllPendingSyncs(userId || undefined);
  }, [archivedCards, kit.id, userId]);

  // Handle Add Card from List View
  const handleAddCard = (term: string, definition: string) => {
    const newCard: Flashcard = {
      id: `card-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      term,
      definition,
      mastery: 'to-learn',
      type: 'concept',
    };

    const nextCards = [newCard, ...cards];
    setCards(nextCards);
    persistChanges(nextCards);
    showNotification(`Se agregó "${term}" al mazo.`);
  };

  // Handle Edit Card from List View
  const handleEditCard = (cardId: string, term: string, definition: string) => {
    const nextCards = cards.map(c => {
      if (c.id === cardId) {
        return { ...c, term, definition };
      }
      return c;
    });

    setCards(nextCards);
    persistChanges(nextCards);
    showNotification(`Tarjeta actualizada.`);
  };

  // Handle Delete Card from List View
  const handleDeleteCard = (cardId: string) => {
    const nextCards = cards.filter(c => c.id !== cardId);
    setCards(nextCards);
    persistChanges(nextCards);
    showNotification(`Tarjeta eliminada.`);
  };

  // Handle Mastery Update from Deck View
  const handleUpdateMastery = (cardId: string, mastery: 'to-learn' | 'known' | 'mastered') => {
    masteryMapRef.current[cardId] = mastery;
    const nextCards = cards.map(c => {
      if (c.id === cardId) {
        masteryMapRef.current[c.term] = mastery;
        return { ...c, mastery };
      }
      return c;
    });

    setCards(nextCards);
    persistChanges(nextCards);
  };

  // Handle Game Victory / Mastery Bonus
  const handleGameVictory = (score: number, termsMastered: string[]) => {
    if (termsMastered.length === 0) return;

    const termSet = new Set(termsMastered.map(t => t.toLowerCase().trim()));
    const nextCards = cards.map(c => {
      const t = getCardTerm(c).toLowerCase().trim();
      if (termSet.has(t)) {
        masteryMapRef.current[c.id] = 'mastered';
        masteryMapRef.current[c.term] = 'mastered';
        return { ...c, mastery: 'mastered' as const };
      }
      return c;
    });

    setCards(nextCards);
    persistChanges(nextCards);
    showNotification(`¡Partida finalizada! +${score} pts y ${termsMastered.length} términos dominados.`);
  };

  // Generate more AI Flashcards button
  const handleAddMoreFlashcards = async () => {
    setIsGeneratingMore(true);
    try {
      const existingTerms = [...cards.map(getCardTerm), ...archivedCards.map(getCardTerm)];
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
        persistChanges(nextCards);
        showNotification(`¡Éxito! Se añadieron ${additional.length} flashcards generadas con IA.`);
      }
    } catch (e) {
      console.error(e);
      showNotification('Error al generar más flashcards con IA.');
    } finally {
      setIsGeneratingMore(false);
    }
  };

  // If currently playing a game, render only the active game (with its own top back button)
  if (activeTab === 'juegos' && activeGame) {
    if (activeGame === 'matching') {
      return (
        <MatchingGame
          flashcards={cards}
          onBack={() => setActiveGame(null)}
          onGameComplete={handleGameVictory}
        />
      );
    }
    if (activeGame === 'stacker') {
      return (
        <StackerGame
          flashcards={cards}
          onBack={() => setActiveGame(null)}
          onGameComplete={handleGameVictory}
        />
      );
    }
    if (activeGame === 'definition-builder') {
      return (
        <DefinitionBuilderGame
          flashcards={cards}
          onBack={() => setActiveGame(null)}
          onGameComplete={handleGameVictory}
        />
      );
    }
    if (activeGame === 'term-builder') {
      return (
        <TermBuilderGame
          flashcards={cards}
          onBack={() => setActiveGame(null)}
          onGameComplete={handleGameVictory}
        />
      );
    }
    if (activeGame === 'guess-the-term') {
      return (
        <GuessTheTermGame
          flashcards={cards}
          onBack={() => setActiveGame(null)}
          onGameComplete={handleGameVictory}
        />
      );
    }
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-4 sm:py-6 pb-28 md:pb-16 animate-fadeIn">
      {/* Top Navigation Tabs Header matching Screenshot 1 */}
      <div className="flex items-center justify-between mb-8 pb-3 border-b border-white/[0.08]">
        {/* Pills Toggle: Lista | Mazo | Juegos */}
        <div className="inline-flex items-center gap-1.5 p-1 rounded-full bg-white/[0.04] border border-white/[0.1]">
          <button
            type="button"
            onClick={() => {
              gameAudio.playTap();
              setActiveTab('lista');
              setActiveGame(null);
            }}
            className={`px-5 py-1.5 rounded-full text-xs font-bold transition-all duration-150 cursor-pointer ${
              activeTab === 'lista'
                ? 'bg-transparent text-white border border-white/80 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Lista
          </button>

          <button
            type="button"
            onClick={() => {
              gameAudio.playTap();
              setActiveTab('mazo');
              setActiveGame(null);
            }}
            className={`px-5 py-1.5 rounded-full text-xs font-bold transition-all duration-150 cursor-pointer ${
              activeTab === 'mazo'
                ? 'bg-transparent text-white border border-white/80 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Mazo
          </button>

          <button
            type="button"
            onClick={() => {
              gameAudio.playTap();
              setActiveTab('juegos');
              setActiveGame(null);
            }}
            className={`px-5 py-1.5 rounded-full text-xs font-bold transition-all duration-150 cursor-pointer ${
              activeTab === 'juegos'
                ? 'bg-transparent text-white border border-white/80 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Juegos
          </button>
        </div>

        {/* Generate more with IA button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAddMoreFlashcards}
            disabled={isGeneratingMore}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-xs font-bold text-purple-200 hover:text-white transition-all cursor-pointer shadow-sm active-press"
          >
            {isGeneratingMore ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Generando...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                <span>+ 10 con IA</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Floating Status Notification */}
      {statusNotification && (
        <div className="fixed bottom-6 right-6 z-50 animate-fadeIn">
          <div className="px-4 py-3 rounded-2xl bg-[#1f1542] border border-purple-400/50 shadow-2xl text-xs font-bold text-white flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{statusNotification}</span>
          </div>
        </div>
      )}

      {/* View Content based on activeTab */}
      {activeTab === 'lista' && (
        <FlashcardsListView
          cards={cards}
          onAddCard={handleAddCard}
          onEditCard={handleEditCard}
          onDeleteCard={handleDeleteCard}
        />
      )}

      {activeTab === 'mazo' && (
        <FlashcardsDeckView
          cards={cards}
          onUpdateMastery={handleUpdateMastery}
        />
      )}

      {activeTab === 'juegos' && (
        <FlashcardsGamesHub
          onSelectGame={(gameId) => setActiveGame(gameId)}
          cardCount={cards.length}
        />
      )}
    </div>
  );
};
