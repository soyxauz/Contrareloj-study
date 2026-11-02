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
  const isDriveConnected = !!googleDriveService.getState().userEmail;

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
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-thea-surface/98 border-t border-thea-border px-2 py-1.5 shadow-[0_-8px_24px_rgba(0,0,0,0.15)] backdrop-blur-md safe-area-pb"
    >
      <div className="flex items-center justify-around max-w-md mx-auto">
        {/* 1. Inicio */}
        <button
          type="button"
          onClick={() => onSelectMode('home')}
          className={`flex flex-col items-center justify-center flex-1 min-h-[46px] py-1 transition-all active:scale-95 ${
            currentMode === 'home'
              ? 'text-white font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <Home className="w-5 h-5" />
            {currentMode === 'home' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
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
          className={`flex flex-col items-center justify-center flex-1 min-h-[46px] py-1 transition-all active:scale-95 ${
            isStudyActive
              ? 'text-white font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <Brain className="w-5 h-5" />
            {isStudyActive && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
            )}
          </div>
          <span className="text-[10px] mt-1 tracking-tight">Estudiar</span>
        </button>

        {/* 3. Botón Central Destacado: Crear Kit */}
        <div className="flex flex-col items-center justify-center flex-1 -mt-4">
          <button
            type="button"
            onClick={() => onSelectMode('create')}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl transition-transform active:scale-95 cursor-pointer ${
              currentMode === 'create'
                ? 'bg-zinc-100 text-zinc-950 ring-2 ring-white/50 scale-105'
                : 'bg-white hover:bg-zinc-200 text-zinc-950 hover:scale-105'
            }`}
            title="Crear nuevo Study Kit"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>
          <span className="text-[9px] mt-1 font-medium text-slate-300 tracking-tight">
            Crear
          </span>
        </div>

        {/* 4. Motor de IA */}
        <button
          type="button"
          onClick={onOpenAISettings}
          className="flex flex-col items-center justify-center flex-1 min-h-[46px] py-1 text-slate-400 hover:text-slate-200 transition-all active:scale-95"
          title="Motor de Inteligencia Artificial"
        >
          <div className="relative">
            <Bot className="w-5 h-5 text-slate-400" />
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
          className="flex flex-col items-center justify-center flex-1 min-h-[46px] py-1 text-slate-400 hover:text-slate-200 transition-all active:scale-95"
          title={currentUser ? 'Cuenta y Google Drive' : 'Iniciar Sesión'}
        >
          <div className="relative">
            {currentUser ? (
              <div className="w-5 h-5 rounded-lg bg-white/[0.12] border border-white/10 flex items-center justify-center text-[10px] font-semibold text-white shadow-sm">
                {currentUser.displayName.charAt(0).toUpperCase()}
              </div>
            ) : (
              <UserIcon className="w-5 h-5 text-slate-300" />
            )}
            {isDriveConnected && (
              <span className="absolute -bottom-0.5 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-[#0a0712] flex items-center justify-center">
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
