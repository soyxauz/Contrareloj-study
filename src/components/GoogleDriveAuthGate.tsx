import React, { useState, useEffect } from 'react';
import {
  Cloud,
  FolderSync,
  AlertCircle,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Share2,
} from 'lucide-react';
import { googleDriveService } from '../services/googleDriveService';
import { GeminiIcon } from './GeminiIcon';
import type { StudyKit, User as AppUser } from '../types';

interface GoogleDriveAuthGateProps {
  onAuthSuccess: (user: AppUser, kits: StudyKit[] | null) => void;
  pendingSharedFileId?: string | null;
  pendingSharedPayload?: string | null;
}

/**
 * Pantalla de Control de Acceso (Auth Gate) basada en Google Drive.
 * La aplicación ContraReloj+ solo puede utilizarse con la cuenta de Google Drive del usuario vinculada.
 * Diseño Emil Kowalski / Apple / Linear con microinteracciones a 120 FPS y Dark Glass con luz física superior.
 */
export const GoogleDriveAuthGate: React.FC<GoogleDriveAuthGateProps> = ({
  onAuthSuccess,
  pendingSharedFileId,
  pendingSharedPayload,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Pre-cargar Google Identity Services preventivamente para respuesta instantánea al clic
  useEffect(() => {
    googleDriveService.preloadGsi().catch(() => {});
  }, []);

  const handleConnect = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      // 1. Lanzar el popup nativo de Google GIS
      await googleDriveService.launchDirectAuthPopup();
      // 2. Iniciar sesión y sincronizar perfil y kits
      const res = await googleDriveService.loginAndSync(undefined, true);
      if (res.user) {
        onAuthSuccess(res.user, res.kits);
      }
    } catch (err: any) {
      console.warn('[GoogleDriveAuthGate] Error al conectar con Google Drive:', err);
      const isBlocked =
        err?.message === 'POPUP_BLOCKED' ||
        err?.type === 'popup_failed_to_open' ||
        String(err?.message || '').toLowerCase().includes('popup');
      if (isBlocked) {
        setErrorMessage(
          'El navegador bloqueó la ventana de Google. Por favor permite las ventanas emergentes (popups) en la barra de direcciones y reintenta.'
        );
      } else if (err?.message !== 'CLIENT_ID_MISSING') {
        setErrorMessage(err?.message || 'No se pudo completar el inicio de sesión con Google Drive.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-[#07050d] text-white overflow-y-auto select-none">
      {/* Luces de ambiente difusas de autor (Mesh Apple Style) */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[550px] h-[350px] bg-gradient-to-tr from-sky-600/15 via-indigo-600/15 to-purple-600/15 blur-[120px] pointer-events-none rounded-full" />
      <div className="absolute -bottom-20 left-1/3 w-[400px] h-[300px] bg-rose-600/10 blur-[140px] pointer-events-none rounded-full" />

      {/* Tarjeta Central Dark Glass */}
      <div className="relative w-full max-w-lg bg-[#0e0b16]/90 border border-white/[0.12] rounded-[32px] p-6 sm:p-10 shadow-[0_24px_80px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl text-center overflow-hidden animate-fadeIn">
        {/* Micro-borde de luz superior */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-[2px] bg-gradient-to-r from-transparent via-white/50 to-transparent pointer-events-none" />

        {/* Icono de Cabecera con Estrella Gemini y Nube Drive */}
        <div className="relative w-16 h-16 mx-auto mb-6 flex items-center justify-center">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-sky-500/25 via-indigo-500/25 to-pink-500/25 blur-lg" />
          <div className="relative w-16 h-16 rounded-2xl bg-white/[0.05] border border-white/15 flex items-center justify-center shadow-inner">
            <Cloud className="w-8 h-8 text-sky-400" />
            <div className="absolute -bottom-1 -right-1 p-1 rounded-lg bg-[#14040c] border border-white/20 shadow-sm">
              <GeminiIcon className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Título de Marca y Bienvenida */}
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
          ContraReloj+ Studio
        </h1>
        <p className="text-xs sm:text-sm text-slate-300 max-w-sm mx-auto leading-relaxed mb-6 font-normal">
          Inicia sesión con tu cuenta de Google Drive para acceder a tus kits de estudio, flashcards e inteligencia artificial.
        </p>

        {/* Banner de Kit Compartido Detectado si proviene de un enlace público */}
        {(pendingSharedFileId || pendingSharedPayload) && (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-br from-indigo-950/70 via-sky-950/50 to-purple-950/60 border border-sky-400/30 text-left shadow-[0_8px_24px_rgba(56,189,248,0.12)] animate-fadeIn">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-sky-500/20 border border-sky-400/30 text-sky-300 shrink-0">
                <Share2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-sky-200 tracking-tight flex items-center gap-1.5">
                  <span>Kit de Estudio Compartido Recibido</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-sky-400/20 text-sky-300 font-mono">
                    Acceso Invitado
                  </span>
                </h3>
                <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                  Has recibido un kit compartido listo para estudiar. Conecta tu cuenta de Google para importarlo automáticamente a tu biblioteca personal.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Pilares de Valor (Ventajas del almacenamiento en Google Drive) */}
        <div className="grid grid-cols-1 gap-2.5 mb-7 text-left">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.025] border border-white/[0.06]">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="text-xs">
              <span className="font-semibold text-white">Privacidad y Soberanía Total:</span>{' '}
              <span className="text-slate-400">Tus datos y apuntes se almacenan en tu propia unidad personal.</span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.025] border border-white/[0.06]">
            <FolderSync className="w-4 h-4 text-sky-400 shrink-0" />
            <div className="text-xs">
              <span className="font-semibold text-white">Sincronización Multi-Dispositivo:</span>{' '}
              <span className="text-slate-400">Continúa tu estudio desde cualquier computadora o móvil.</span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.025] border border-white/[0.06]">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="text-xs">
              <span className="font-semibold text-white">Respaldo Automático 0 Latencia:</span>{' '}
              <span className="text-slate-400">Flashcards, guías completas e imágenes siempre a salvo.</span>
            </div>
          </div>
        </div>

        {/* Mensaje de Error si existió problema con la conexión */}
        {errorMessage && (
          <div className="mb-6 p-3.5 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs text-left flex items-start gap-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Botón Principal de Inicio de Sesión con Google Drive */}
        <button
          type="button"
          onClick={handleConnect}
          disabled={isProcessing}
          aria-label="Iniciar sesión con Google Drive"
          className="group relative w-full py-3.5 px-6 rounded-2xl bg-white hover:bg-slate-100 text-zinc-950 font-bold text-sm shadow-[0_4px_24px_rgba(255,255,255,0.2),inset_0_1px_0_rgba(255,255,255,1)] flex items-center justify-center gap-3 cursor-pointer transition-[transform,background-color,box-shadow] duration-160 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.985] disabled:opacity-60 disabled:cursor-not-allowed select-none"
        >
          {isProcessing ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin text-zinc-950" />
              <span>Conectando con Google...</span>
            </>
          ) : (
            <>
              {/* Logo Oficial Multicolor de Google */}
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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

        {/* Nota al Pie */}
        <p className="text-[11px] text-slate-500 mt-4 leading-normal">
          ContraReloj+ requiere conexión con Google Drive para autorizar el uso de la aplicación y salvaguardar tus sesiones de estudio.
        </p>
      </div>
    </div>
  );
};
