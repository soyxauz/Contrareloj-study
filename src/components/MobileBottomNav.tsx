import React from 'react';
import type { StudyKit, StudyMode, User } from '../types';
import {
  Home,
  Brain,
  Plus,
  Bot,
  User as UserIcon,
  Cloud,
} from 'lucide-react';
import { googleDriveService } from '../services/googleDriveService';
import { useTheme } from '../services/themeService';

interface MobileBottomNavProps {
  currentMode: StudyMode;
  onSelectMode: (mode: StudyMode) => void;
  onOpenAISettings: () => void;
  onOpenAuth: () => void;
  onOpenGoogleDrive: () => void;
  currentUser: User | null;
  currentKit: StudyKit | null;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentMode,
  onSelectMode,
  onOpenAISettings,
  onOpenAuth,
  onOpenGoogleDrive,
  currentUser,
  currentKit,
}) => {
  const { theme } = useTheme();
  const isDriveConnected = !!googleDriveService.getState().userEmail;
  const activeDotClass = theme === 'kitty' ? 'bg-pink-500' : theme === 'light' ? 'bg-rose-600' : 'bg-white';
  const activeTabText = theme === 'dark' ? 'text-white font-semibold' : theme === 'kitty' ? 'text-pink-950 font-semibold' : 'text-zinc-950 font-semibold';
  const idleTabText = theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : theme === 'kitty' ? 'text-pink-700/80 hover:text-pink-950' : 'text-slate-600 hover:text-zinc-950';

  const isStudyActive = [
    'smart-study',
    'study-guide',
    'images',
    'podcast',
    'ask-thea',
    'oral-lesson',
    'tests',
    'flashcards',
    'analytics',
  ].includes(currentMode);

  return (
    <nav
      aria-label="Navegación Móvil Principal"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-thea-surface/98 border-t border-thea-border px-2 py-1.5 shadow-[0_-8px_24px_rgba(0,0,0,0.15)] backdrop-blur-md thea-glass-chrome safe-area-pb"
    >
      <div className="flex items-center justify-around max-w-md mx-auto">
        {/* 1. Inicio */}
        <button
          type="button"
          onClick={() => onSelectMode('home')}
          className={`flex flex-col items-center justify-center flex-1 min-h-[46px] py-1 transition-[transform,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-95 ${
            currentMode === 'home' ? activeTabText : idleTabText
          }`}
        >
          <div className="relative">
            <Home className="w-5 h-5" />
            {currentMode === 'home' && (
              <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full shadow-sm ${activeDotClass}`} />
            )}
          </div>
          <span className="text-[10px] mt-1 tracking-tight">Inicio</span>
        </button>

        {/* 2. Estudiar */}
        <button
          type="button"
          onClick={() => {
            if (currentKit) {
              onSelectMode('smart-study');
            } else {
              onSelectMode('home');
            }
          }}
          className={`flex flex-col items-center justify-center flex-1 min-h-[46px] py-1 transition-[transform,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-95 ${
            isStudyActive ? activeTabText : idleTabText
          }`}
        >
          <div className="relative">
            <Brain className="w-5 h-5" />
            {isStudyActive && (
              <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full shadow-sm ${activeDotClass}`} />
            )}
          </div>
          <span className="text-[10px] mt-1 tracking-tight">Estudiar</span>
        </button>

        {/* 3. Botón Central Destacado: Crear Kit */}
        <div className="flex flex-col items-center justify-center flex-1 -mt-4">
          <button
            type="button"
            onClick={() => onSelectMode('create')}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-95 cursor-pointer ${
              theme === 'kitty'
                ? 'bg-pink-500 hover:bg-pink-600 text-white shadow-pink-500/30'
                : theme === 'light'
                ? 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-slate-900/20'
                : currentMode === 'create'
                ? 'bg-zinc-100 text-zinc-950 ring-2 ring-white/50 scale-105'
                : 'bg-white hover:bg-zinc-200 text-zinc-950 hover:scale-105'
            }`}
            title="Crear nuevo Study Kit"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>
          <span className={`text-[9px] mt-1 font-medium tracking-tight ${
            theme === 'dark' ? 'text-slate-300' : theme === 'kitty' ? 'text-pink-900' : 'text-zinc-800'
          }`}>
            Crear
          </span>
        </div>

        {/* 4. Motor de IA */}
        <button
          type="button"
          onClick={onOpenAISettings}
          className={`flex flex-col items-center justify-center flex-1 min-h-[46px] py-1 transition-[transform,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-95 ${idleTabText}`}
          title="Motor de Inteligencia Artificial"
        >
          <div className="relative">
            <Bot className="w-5 h-5" />
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/90 shadow-sm absolute -top-0.5 -right-0.5" />
          </div>
          <span className="text-[10px] mt-1 tracking-tight">IA Engine</span>
        </button>

        {/* 5. Perfil / Google Drive */}
        <button
          type="button"
          onClick={() => {
            if (currentUser) {
              onOpenGoogleDrive();
            } else {
              onOpenAuth();
            }
          }}
          className={`flex flex-col items-center justify-center flex-1 min-h-[46px] py-1 transition-[transform,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-95 ${idleTabText}`}
          title={currentUser ? 'Cuenta y Google Drive' : 'Iniciar Sesión'}
        >
          <div className="relative">
            {currentUser ? (
              <div className={`w-5 h-5 rounded-lg border flex items-center justify-center text-[10px] font-semibold shadow-sm ${
                theme === 'dark'
                  ? 'bg-white/[0.12] border-white/10 text-white'
                  : theme === 'kitty'
                  ? 'bg-pink-100 border-pink-200 text-pink-700'
                  : 'bg-slate-200/80 border-slate-300 text-zinc-900'
              }`}>
                {currentUser.displayName.charAt(0).toUpperCase()}
              </div>
            ) : (
              <UserIcon className="w-5 h-5" />
            )}
            {isDriveConnected && (
              <span className={`absolute -bottom-0.5 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border flex items-center justify-center ${
                theme === 'dark' ? 'border-[#0a0712]' : 'border-white'
              }`}>
                <Cloud className="w-1.5 h-1.5 text-white" />
              </span>
            )}
          </div>
          <span className="text-[10px] mt-1 tracking-tight truncate max-w-[50px]">
            {currentUser ? 'Cuenta' : 'Ingresar'}
          </span>
        </button>
      </div>
    </nav>
  );
};
