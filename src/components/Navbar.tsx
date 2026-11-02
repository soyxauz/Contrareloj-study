import React, { useMemo, useState, useEffect } from 'react';
import type { StudyKit, StudyMode, User } from '../types';
import { calculateRealStreak } from '../services/statsService';
import { authService } from '../services/authService';
import { googleDriveService, type DriveSyncState } from '../services/googleDriveService';
import {
  Flame,
  BookOpen,
  Brain,
  Headphones,
  MessageSquareText,
  FileCheck2,
  Layers,
  BarChart3,
  Home,
  Plus,
  Bot,
  User as UserIcon,
  LogOut,
  Image as ImageIcon,
  Cloud,
  RefreshCw,
  Mic,
} from 'lucide-react';

interface NavbarProps {
  kits: StudyKit[];
  currentKit: StudyKit | null;
  onSelectKit?: (kit: StudyKit) => void;
  currentMode: StudyMode;
  onSelectMode: (mode: StudyMode) => void;
  onOpenAISettings: () => void;
  onOpenGoogleDrive: () => void;
  showModeTabs: boolean;
  currentUser: User | null;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  kits,
  currentKit,
  currentMode,
  onSelectMode,
  onOpenAISettings,
  onOpenGoogleDrive,
  showModeTabs,
  currentUser,
  onOpenAuth,
  onLogout,
}) => {
  const [driveState, setDriveState] = useState<DriveSyncState>(() => googleDriveService.getState());

  useEffect(() => {
    return googleDriveService.subscribe((state) => {
      setDriveState(state);
    });
  }, []);
  const [navStatsVersion, setNavStatsVersion] = useState(0);

  useEffect(() => {
    const onSessionSaved = () => setNavStatsVersion(v => v + 1);
    window.addEventListener('thea_session_saved', onSessionSaved);
    window.addEventListener('thea_flashcard_saved', onSessionSaved);
    window.addEventListener('thea_progress_synced', onSessionSaved);
    return () => {
      window.removeEventListener('thea_session_saved', onSessionSaved);
      window.removeEventListener('thea_flashcard_saved', onSessionSaved);
      window.removeEventListener('thea_progress_synced', onSessionSaved);
    };
  }, []);

  const realStreak = useMemo(() => {
    const sessions = kits.map(k => authService.getSmartStudySession(currentUser?.id || null, k.id));
    return calculateRealStreak(sessions);
  }, [kits, currentUser, navStatsVersion]);
  const modes: { id: StudyMode; label: string; icon: React.ReactNode }[] = [
    { id: 'smart-study', label: 'Smart Study', icon: <Brain className="w-4 h-4" /> },
    { id: 'study-guide', label: 'Guía de Estudio', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'images', label: 'Imágenes', icon: <ImageIcon className="w-4 h-4" /> },
    { id: 'podcast', label: 'Review Podcast', icon: <Headphones className="w-4 h-4" /> },
    { id: 'ask-thea', label: 'Chat Tutor', icon: <MessageSquareText className="w-4 h-4" /> },
    { id: 'oral-lesson', label: 'Lección Oral', icon: <Mic className="w-4 h-4" /> },
    { id: 'tests', label: 'Exámenes & Tests', icon: <FileCheck2 className="w-4 h-4" /> },
    { id: 'flashcards', label: 'Flashcards', icon: <Layers className="w-4 h-4" /> },
    { id: 'analytics', label: 'Analíticas', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#0d0408]/95 border-b border-white/[0.06] shadow-sm">
      {/* Top Brand & Status Bar */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left Side: Logo & Minimal Wordmark */}
        <div className="flex items-center gap-2 sm:gap-5 min-w-0 shrink-0">
          <div className="flex items-center gap-2.5 cursor-pointer shrink-0" onClick={() => onSelectMode('home')}>
            <div className="w-7 h-7 rounded-lg bg-white/[0.08] border border-white/10 flex items-center justify-center font-semibold text-xs text-white shrink-0 tracking-tight shadow-sm">
              C
            </div>
            <div className="flex items-center whitespace-nowrap">
              <span className="text-sm sm:text-base font-semibold tracking-tight text-white">Contrareloj</span>
              <span className="ml-1 text-xs text-slate-400 font-normal">Study</span>
            </div>
          </div>
        </div>

        {/* Right Badges & Controls */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Navigation Actions */}
          <div className="hidden md:flex items-center gap-1.5">
            {/* Create Kit Button */}
            <button
              onClick={() => onSelectMode('create')}
              title="Crear nuevo Study Kit"
              className={`active-press flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                currentMode === 'create'
                  ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 hover:text-white'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Crear Kit</span>
            </button>

            {/* Home Button */}
            <button
              onClick={() => onSelectMode('home')}
              title="Inicio"
              className={`active-press p-1.5 rounded-lg border transition-colors cursor-pointer ${
                currentMode === 'home'
                  ? 'bg-white/[0.12] text-white border-white/20'
                  : 'bg-transparent text-slate-400 hover:text-white hover:bg-white/[0.04] border-transparent'
              }`}
            >
              <Home className="w-4 h-4" />
            </button>
          </div>

          {/* Subtle Divider */}
          <div className="hidden md:block h-4 w-px bg-white/[0.08] mx-1" />

          {/* Streak Indicator */}
          <div
            title={`Racha de estudio: ${realStreak} ${realStreak === 1 ? 'día consecutivo' : 'días consecutivos'}`}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-slate-400 font-medium tabular-nums"
          >
            <Flame className="w-3.5 h-3.5 text-amber-500/80 shrink-0" />
            <span className="text-slate-200">{realStreak}</span>
          </div>

          {/* Google Drive Cloud Sync */}
          <button
            onClick={onOpenGoogleDrive}
            title={
              driveState.status === 'needs_reauth'
                ? 'Sesión de Google Drive expirada - Clic para reconectar en 1 clic'
                : driveState.userEmail
                ? `Google Drive sincronizado (${driveState.userEmail})`
                : 'Conectar Google Drive para respaldo en la nube'
            }
            className={`active-press flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer shrink-0 ${
              driveState.userEmail
                ? 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-slate-300 hover:text-white'
                : 'bg-transparent hover:bg-white/[0.04] border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {driveState.status === 'syncing' ? (
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
            ) : (
              <Cloud className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span className="hidden sm:inline">Drive</span>
            {driveState.userEmail && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/90 shadow-sm" />
            )}
          </button>

          {/* AI Engine */}
          <button
            onClick={onOpenAISettings}
            title="Configuración de IA (Ollama Cloud / API)"
            className="active-press hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
          >
            <Bot className="w-3.5 h-3.5 text-slate-400" />
            <span>IA Engine</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/90 shadow-sm" />
          </button>

          {/* User Profile */}
          <div className="hidden md:flex items-center gap-1.5 ml-1">
            <div className="h-4 w-px bg-white/[0.08] mr-1" />
            {currentUser ? (
              <div className="flex items-center gap-1">
                <div
                  title={`Conectado como @${currentUser.username}`}
                  className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-slate-300"
                >
                  <div className="w-5 h-5 rounded-full bg-white/[0.12] border border-white/10 flex items-center justify-center text-[10px] font-semibold text-white">
                    {currentUser.displayName.charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden md:inline max-w-[90px] truncate">{currentUser.displayName}</span>
                </div>
                <button
                  onClick={onLogout}
                  title="Cerrar Sesión"
                  className="active-press p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                title="Iniciar Sesión o Crear Cuenta"
                className="active-press flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-zinc-950 font-medium text-xs hover:bg-zinc-200 transition-colors shadow-sm cursor-pointer"
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span>Ingresar</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs — only visible in study modes */}
      {showModeTabs && (
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-2 sm:py-2.5 scrollbar-none border-t border-thea-border/40 text-xs sm:text-sm font-medium touch-pan-x">
          {modes.map(mode => {
            const active = currentMode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => onSelectMode(mode.id)}
                className={`active-press flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl transition-[transform,background-color,color] whitespace-nowrap text-xs sm:text-sm cursor-pointer ${
                  active
                    ? 'bg-violet-600 text-white font-semibold shadow-md shadow-violet-900/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-thea-surface'
                }`}
              >
                {mode.icon}
                <span>{mode.label}</span>
                {mode.id === 'images' && currentKit?.assets && currentKit.assets.length > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold tabular-nums ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                    }`}
                  >
                    {currentKit.assets.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};
