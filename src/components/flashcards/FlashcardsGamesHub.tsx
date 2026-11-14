import React from 'react';
import { Copy, Layers, CheckSquare, Grid, MessageSquare } from 'lucide-react';
import { gameAudio } from './games/gameAudio';

export type GameId = 'matching' | 'stacker' | 'definition-builder' | 'term-builder' | 'guess-the-term';

interface FlashcardsGamesHubProps {
  onSelectGame: (gameId: GameId) => void;
  cardCount: number;
}

interface GameCardDef {
  id: GameId;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const GAMES: GameCardDef[] = [
  {
    id: 'matching',
    title: 'Coincidencias',
    description: 'Empareja pares de términos y definiciones',
    icon: Copy,
  },
  {
    id: 'stacker',
    title: 'Apilador',
    description: 'Empareja el término para apilar y construir tu torre',
    icon: Layers,
  },
  {
    id: 'definition-builder',
    title: 'Constructor de Definiciones',
    description: 'Completa los espacios en blanco para completar las definiciones de los términos',
    icon: CheckSquare,
  },
  {
    id: 'term-builder',
    title: 'Constructor de Términos',
    description: 'Encuentra términos en la cuadrícula antes de que se acabe el tiempo',
    icon: Grid,
  },
  {
    id: 'guess-the-term',
    title: 'Adivina el Término',
    description: 'Chatea con la IA para deducir el término secreto',
    icon: MessageSquare,
  },
];

export const FlashcardsGamesHub: React.FC<FlashcardsGamesHubProps> = ({
  onSelectGame,
  cardCount: _cardCount,
}) => {
  return (
    <div className="w-full max-w-6xl mx-auto py-4 px-2 sm:px-4 animate-fadeIn">
      {/* 5-Game Grid matching Screenshot 2 (No RPG) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 sm:gap-6">
        {GAMES.map(game => {
          const Icon = game.icon;

          return (
            <button
              key={game.id}
              type="button"
              onClick={() => {
                gameAudio.playTap();
                onSelectGame(game.id);
              }}
              className="p-8 sm:p-10 rounded-3xl bg-[#140e2b]/90 hover:bg-[#1f1542] border border-white/[0.12] hover:border-purple-400/50 shadow-xl flex flex-col items-center justify-center text-center transition-transform active:scale-[0.97] duration-150 cursor-pointer group min-h-[260px] relative overflow-hidden"
              style={{
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
              }}
            >
              {/* Subtle top light highlight */}
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

              {/* Game Icon */}
              <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-6 text-white group-hover:text-purple-300 group-hover:scale-110 transition-all duration-200">
                <Icon className="w-9 h-9" />
              </div>

              {/* Title */}
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2.5 tracking-tight group-hover:text-purple-200 transition-colors">
                {game.title}
              </h3>

              {/* Description */}
              <p className="text-xs sm:text-sm text-slate-300/80 leading-relaxed max-w-xs font-normal">
                {game.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};
