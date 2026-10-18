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
  const realStreak = useMemo(() => {
    const sessions = kits.map(k => authService.getSmartStudySession(currentUser?.id || null, k.id));
    return calculateRealStreak(sessions);
  }, [kits, currentUser]);
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
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-thea-bg/85 border-b border-thea-border">
      {/* Top Brand & Status Bar */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left Side: Logo & Kit Selector */}
        <div className="flex items-center gap-2 sm:gap-5 min-w-0 shrink-0">
          {/* Logo — goes to Home */}
          <div className="flex items-center gap-2 sm:gap-2.5 cursor-pointer shrink-0" onClick={() => onSelectMode('home')}>
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-amber-400 p-[2px] flex items-center justify-center shadow-lg shadow-violet-900/30 shrink-0">
              <div className="w-full h-full bg-thea-bg rounded-[9px] sm:rounded-[10px] flex items-center justify-center font-bold text-base sm:text-lg text-white">
                C
              </div>
            </div>
            <div className="flex items-center whitespace-nowrap">
              <span className="text-lg sm:text-xl font-bold tracking-tight text-white">Contrareloj</span>
              <span className="ml-1 text-sm sm:text-base font-semibold text-violet-400">Study</span>
            </div>
          </div>
        </div>

        {/* Right Badges & Controls with separated logical sections */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Group 1: Navigation Actions (Desktop only, mobile uses bottom bar) */}
          <div className="hidden md:flex items-center gap-2">
            {/* Create Kit Button */}
            <button
              onClick={() => onSelectMode('create')}
              title="Crear nuevo Study Kit"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                currentMode === 'create'
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-900/30'
                  : 'bg-thea-surface border border-thea-border text-violet-300 hover:bg-violet-600/20 hover:border-violet-500/40'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Crear Kit</span>
            </button>

            {/* Home Button */}
            <button
              onClick={() => onSelectMode('home')}
              title="Inicio"
              className={`p-2 rounded-xl border transition-colors ${
                currentMode === 'home'
                  ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-900/30'
                  : 'bg-thea-surface border border-thea-border text-slate-400 hover:text-white hover:bg-thea-surfaceLight'
              }`}
            >
              <Home className="w-4 h-4" />
            </button>
          </div>

          {/* Subtle Divider (Desktop only) */}
          <div className="hidden md:block h-5 w-px bg-thea-border/80" />

          {/* Group 2: Status & Streaks */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Streak indicator real */}
            <div
              title={`Racha de estudio: ${realStreak} ${realStreak === 1 ? 'día consecutivo' : 'días consecutivos'}`}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-thea-surface border border-thea-border text-xs text-orange-400 font-semibold shrink-0"
            >
              <Flame className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-orange-500 text-orange-500" />
              <span>{realStreak}</span>
            </div>
          </div>

          {/* Group 3: Cloud & AI Engine */}
          <div className="flex items-center gap-1 sm:gap-2">
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
              className={`flex items-center gap-1.5 px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-xl border transition-all text-xs font-semibold shadow-sm cursor-pointer shrink-0 ${
                driveState.status === 'syncing'
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                  : driveState.status === 'needs_reauth'
                  ? 'bg-amber-950/40 border-amber-500/50 text-amber-300 hover:border-amber-400'
                  : driveState.userEmail
                  ? 'bg-emerald-950/30 hover:bg-emerald-900/40 border-emerald-500/40 text-emerald-300 hover:text-white'
                  : 'bg-thea-surface hover:bg-thea-surfaceLight border-thea-border text-slate-300 hover:text-white'
              }`}
            >
              {driveState.status === 'syncing' ? (
                <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
              ) : (
                <Cloud
                  className={`w-3.5 h-3.5 ${
                    driveState.status === 'needs_reauth'
                      ? 'text-amber-400'
                      : driveState.userEmail
                      ? 'text-emerald-400'
                      : 'text-slate-400'
                  }`}
                />
              )}
              <span className="hidden sm:inline">Drive</span>
              {driveState.userEmail && (
                <span
                  className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
                    driveState.status === 'needs_reauth'
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-emerald-400'
                  }`}
                />
              )}
            </button>

            {/* AI Engine (desktop header, on mobile available in bottom bar) */}
            <button
              onClick={onOpenAISettings}
              title="Configuración de IA (Ollama Cloud / API)"
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-950/40 hover:bg-violet-900/50 border border-violet-500/40 text-violet-300 hover:text-white transition-all text-xs font-semibold shadow-sm cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5 text-violet-400" />
              <span>IA Engine</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </button>
          </div>

          {/* Group 4: User Profile & Inspector (Desktop only, mobile uses bottom navigation bar) */}
          <div className="hidden md:flex items-center gap-2">
            {/* Subtle Divider */}
            <div className="h-5 w-px bg-thea-border/80 mr-1" />
            {currentUser ? (
              <div className="flex items-center gap-1.5">
                <div
                  title={`Conectado como @${currentUser.username}`}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-violet-600/20 border border-violet-500/40 text-violet-200 text-xs font-semibold"
                >
                  <div className="w-5 h-5 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                    {currentUser.displayName.charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden md:inline max-w-[90px] truncate">{currentUser.displayName}</span>
                </div>
                <button
                  onClick={onLogout}
                  title="Cerrar Sesión"
                  className="p-1.5 rounded-xl bg-thea-surface hover:bg-rose-950/40 border border-thea-border hover:border-rose-500/40 text-slate-400 hover:text-rose-400 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                title="Iniciar Sesión o Crear Cuenta"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-violet-600/30 to-indigo-600/30 hover:from-violet-600 hover:to-indigo-600 border border-violet-500/50 text-white transition-all text-xs font-semibold shadow-sm cursor-pointer"
              >
                <UserIcon className="w-3.5 h-3.5 text-violet-300" />
                <span>Mi Cuenta</span>
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
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl transition-all whitespace-nowrap text-xs sm:text-sm ${
                  active
                    ? 'bg-violet-600 text-white font-semibold shadow-md shadow-violet-900/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-thea-surface'
                }`}
              >
                {mode.icon}
                <span>{mode.label}</span>
                {mode.id === 'images' && currentKit?.assets && currentKit.assets.length > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
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
