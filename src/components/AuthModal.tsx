import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../services/themeService';
import type { User, StudyKit } from '../types';
import { authService } from '../services/authService';
import { googleDriveService } from '../services/googleDriveService';
import {
  User as UserIcon,
  Lock,
  LogIn,
  UserPlus,
  X,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: User, syncedKits?: StudyKit[] | null) => void;
  onOpenGoogleDriveSetup?: () => void;
  initialMode?: 'login' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
  onOpenGoogleDriveSetup,
  initialMode = 'login',
}) => {
  const { theme } = useTheme();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setError(null);
    if (!googleDriveService.hasClientId()) {
      if (onOpenGoogleDriveSetup) {
        onClose();
        onOpenGoogleDriveSetup();
      } else {
        setError('Por favor configura primero tu Google Client ID.');
      }
      return;
    }

    setIsGoogleLoading(true);
    try {
      const res = await googleDriveService.loginAndSync((fastUser, fastKits) => {
        onAuthSuccess(fastUser, fastKits);
        onClose();
      }, true);
      if (res.user) {
        onAuthSuccess(res.user, res.kits);
        onClose();
      }
    } catch (err: any) {
      if (err?.message === 'CLIENT_ID_MISSING') {
        if (onOpenGoogleDriveSetup) {
          onClose();
          onOpenGoogleDriveSetup();
        }
      } else {
        const msg = String(err?.message || '');
        if (msg === 'POPUP_BLOCKED' || msg.toLowerCase().includes('popup')) {
          setError('El navegador bloqueó la ventana emergente de Google. Permite las ventanas emergentes en la barra de direcciones de tu navegador para continuar.');
        } else {
          setError(msg || 'Error al iniciar sesión con Google.');
        }
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (mode === 'register') {
        const res = await authService.register(username, password, displayName);
        if (res.success && res.user) {
          onAuthSuccess(res.user);
          onClose();
        } else {
          setError(res.error || 'No se pudo crear la cuenta.');
        }
      } else {
        const res = await authService.login(username, password);
        if (res.success && res.user) {
          onAuthSuccess(res.user);
          onClose();
        } else {
          setError(res.error || 'Credenciales incorrectas.');
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Error inesperado durante la autenticación.');
    } finally {
      setIsLoading(false);
    }
  };

  const appName = theme === 'kitty' ? 'Kitty Study' : 'Contrareloj Study';

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 animate-modal-backdrop">
      <div className={`w-full max-w-md border rounded-2xl sm:rounded-3xl shadow-2xl relative overflow-hidden max-h-[90vh] sm:max-h-[92vh] flex flex-col animate-modal-card ${
        theme === 'dark'
          ? 'bg-[#0e0b16] border-white/10 text-white'
          : 'thea-glass-modal text-zinc-950'
      }`}>
        {/* Close button */}
        <button
          onClick={onClose}
          className={`absolute top-4 right-4 p-2 rounded-xl transition-colors duration-150 cursor-pointer active:scale-95 z-10 ${
            theme === 'dark'
              ? 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
              : 'text-slate-500 hover:text-zinc-950 hover:bg-slate-100'
          }`}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex-1 min-h-0 overflow-y-auto modal-smooth-scroll overscroll-contain p-5 sm:p-8">
          {/* Header */}
        <div className="text-center mb-6">
          <div className={`w-12 h-12 mx-auto rounded-2xl border flex items-center justify-center mb-3 shadow-sm ${
            theme === 'kitty'
              ? 'bg-pink-100 border-pink-200 text-pink-600'
              : theme === 'light'
              ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
              : 'bg-white/[0.04] border-white/10 text-zinc-200'
          }`}>
            {mode === 'login' ? <LogIn className="w-6 h-6" /> : <UserPlus className="w-6 h-6" />}
          </div>
          <h2 className={`text-xl font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-zinc-950'}`}>
            {mode === 'login' ? `Iniciar Sesión en ${appName}` : `Crear Cuenta en ${appName}`}
          </h2>
          <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-zinc-400' : 'text-slate-500'}`}>
            {mode === 'login'
              ? 'Accede a tus kits, memoria de estudio y progreso guardado'
              : 'Guarda todos tus Study Kits con memoria exacta de tu avance'}
          </p>
        </div>

        {/* Google Sign-in button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isGoogleLoading || isLoading}
          className={`w-full py-2.5 px-4 rounded-xl border font-semibold text-xs shadow-sm transition-all flex items-center justify-center gap-2.5 mb-4 cursor-pointer disabled:opacity-40 active:scale-95 ${
            theme === 'dark'
              ? 'bg-white/[0.04] hover:bg-white/[0.08] border-white/15 text-white'
              : theme === 'kitty'
              ? 'bg-pink-50 hover:bg-pink-100 border-pink-200 text-pink-950'
              : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
          }`}
        >
          {isGoogleLoading ? (
            <span>Conectando con Google...</span>
          ) : (
            <>
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continuar con Google Drive</span>
            </>
          )}
        </button>

        {/* Divider */}
        <div className="relative flex py-1 items-center mb-4">
          <div className="flex-grow border-t border-thea-border"></div>
          <span className="flex-shrink mx-3 text-[11px] text-slate-500 uppercase tracking-wider">o con cuenta local</span>
          <div className="flex-grow border-t border-thea-border"></div>
        </div>

        {/* Tab switcher */}
        <div className={`flex rounded-xl p-1 mb-6 border ${
          theme === 'dark'
            ? 'bg-white/[0.025] border-white/[0.08]'
            : theme === 'kitty'
            ? 'bg-pink-50 border-pink-200'
            : 'bg-slate-100 border-slate-200'
        }`}>
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all active:scale-95 cursor-pointer ${
              mode === 'login'
                ? theme === 'dark'
                  ? 'bg-white/10 text-white border border-white/10 shadow-sm'
                  : theme === 'kitty'
                  ? 'bg-white text-pink-950 border border-pink-200 shadow-sm'
                  : 'bg-white text-zinc-950 border border-slate-200 shadow-sm'
                : theme === 'dark'
                ? 'text-zinc-400 hover:text-white'
                : 'text-slate-500 hover:text-zinc-950'
            }`}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all active:scale-95 cursor-pointer ${
              mode === 'register'
                ? theme === 'dark'
                  ? 'bg-white/10 text-white border border-white/10 shadow-sm'
                  : theme === 'kitty'
                  ? 'bg-white text-pink-950 border border-pink-200 shadow-sm'
                  : 'bg-white text-zinc-950 border border-slate-200 shadow-sm'
                : theme === 'dark'
                ? 'text-zinc-400 hover:text-white'
                : 'text-slate-500 hover:text-zinc-950'
            }`}
          >
            Crear Cuenta
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700 font-bold'}`}>
                Nombre o Alias
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ej: Sofía Martínez"
                  className={`w-full border rounded-xl py-2.5 pl-10 pr-4 text-base md:text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all ${
                    theme === 'dark'
                      ? 'bg-thea-bg border-thea-border text-white'
                      : theme === 'kitty'
                      ? 'bg-pink-50/50 border-pink-200 text-zinc-950'
                      : 'bg-slate-50 border-slate-200 text-zinc-950'
                  }`}
                />
              </div>
            </div>
          )}

          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700 font-bold'}`}>
              Nombre de Usuario
            </label>
            <div className="relative">
              <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="usuario_estudio"
                className={`w-full border rounded-xl py-2.5 pl-10 pr-4 text-base md:text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all lowercase ${
                  theme === 'dark'
                    ? 'bg-thea-bg border-thea-border text-white'
                    : theme === 'kitty'
                    ? 'bg-pink-50/50 border-pink-200 text-zinc-950'
                    : 'bg-slate-50 border-slate-200 text-zinc-950'
                }`}
              />
            </div>
          </div>

          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700 font-bold'}`}>
              Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full border rounded-xl py-2.5 pl-10 pr-10 text-base md:text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all ${
                  theme === 'dark'
                    ? 'bg-thea-bg border-thea-border text-white'
                    : theme === 'kitty'
                    ? 'bg-pink-50/50 border-pink-200 text-zinc-950'
                    : 'bg-slate-50 border-slate-200 text-zinc-950'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={`absolute right-3 top-1/2 -translate-y-1/2 ${theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-zinc-950'}`}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {mode === 'register' && (
              <span className="text-[10px] text-slate-500 mt-1 block">
                Mínimo 4 caracteres. Se guardará de forma segura y encriptada en tu dispositivo.
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={`active-press w-full py-3 rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer disabled:opacity-50 ${
              theme === 'kitty'
                ? 'bg-pink-500 hover:bg-pink-600 text-white shadow-pink-500/25'
                : theme === 'light'
                ? 'bg-zinc-950 hover:bg-zinc-800 text-white shadow-zinc-950/20'
                : 'bg-white hover:bg-zinc-200 text-zinc-950 shadow-lg'
            }`}
          >
            {isLoading ? (
              <span>Procesando...</span>
            ) : mode === 'login' ? (
              <>
                <LogIn className="w-4 h-4" />
                <span>Iniciar Sesión</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Crear Cuenta y Guardar</span>
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="mt-5 text-center">
          <p className="text-xs text-slate-500 flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Memoria total en tiempo real de preguntas y kits</span>
          </p>
        </div>
      </div>
    </div>
  </div>,
    document.body
  );
};
