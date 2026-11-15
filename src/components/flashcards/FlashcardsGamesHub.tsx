import React from 'react';
import { Copy, Layers, CheckSquare, Grid, MessageSquare } from 'lucide-react';
import { gameAudio } from './games/gameAudio';
import { useTheme } from '../../services/themeService';

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
  const { theme } = useTheme();

  return (
    <div className="w-full max-w-5xl mx-auto py-2 sm:py-3 px-2 sm:px-4 flex-1 flex flex-col justify-center animate-fadeIn">
      {/* 5-Game Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 sm:gap-4 max-w-4xl lg:max-w-5xl mx-auto w-full">
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
              className={`p-5 sm:p-6 rounded-2xl flex flex-col items-center justify-center text-center transition-transform active:scale-[0.97] duration-150 cursor-pointer group min-h-[175px] sm:min-h-[190px] relative overflow-hidden ${
                theme === 'kitty'
                  ? 'bg-white hover:bg-pink-50/50 border-2 border-pink-200 hover:border-pink-300 text-pink-950 shadow-[0_8px_30px_rgba(236,72,153,0.1)]'
                  : theme === 'light'
                  ? 'bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-900 shadow-md'
                  : 'bg-[#140e2b]/90 hover:bg-[#1f1542] border border-white/[0.12] hover:border-purple-400/50 shadow-xl text-white'
              }`}
              style={{
                boxShadow:
                  theme === 'kitty'
                    ? '0 8px 30px rgba(236, 72, 153, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.95)'
                    : theme === 'light'
                    ? '0 4px 16px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.95)'
                    : '0 8px 30px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
              }}
            >
              {/* Subtle top light highlight */}
              <div className={`absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent ${
                theme === 'kitty' ? 'via-pink-200/50' : theme === 'light' ? 'via-slate-200/50' : 'via-white/20'
              } to-transparent`} />

              {/* Game Icon */}
              <div className={`w-12 h-12 rounded-xl border flex items-center justify-center mb-3 group-hover:scale-110 transition-all duration-200 ${
                theme === 'kitty'
                  ? 'bg-pink-100/70 border-pink-200 text-pink-600 group-hover:text-pink-700'
                  : theme === 'light'
                  ? 'bg-slate-100 border-slate-200 text-slate-700 group-hover:text-indigo-600'
                  : 'bg-white/[0.04] border-white/[0.08] text-white group-hover:text-purple-300'
              }`}>
                <Icon className="w-6 h-6" />
              </div>

              {/* Title */}
              <h3 className={`text-lg sm:text-xl font-bold mb-1.5 tracking-tight transition-colors ${
                theme === 'kitty'
                  ? 'text-pink-950 font-black group-hover:text-pink-700'
                  : theme === 'light'
                  ? 'text-slate-900 font-bold group-hover:text-indigo-600'
                  : 'text-white group-hover:text-purple-200'
              }`}>
                {game.title}
              </h3>

              {/* Description */}
              <p className={`text-xs sm:text-[13px] leading-relaxed max-w-xs ${
                theme === 'kitty'
                  ? 'text-pink-800/80 font-medium'
                  : theme === 'light'
                  ? 'text-slate-600 font-normal'
                  : 'text-slate-300/80 font-normal'
              }`}>
                {game.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};
