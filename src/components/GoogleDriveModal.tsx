import React, { useState, useEffect } from 'react';
import {
  Cloud,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  LogOut,
  FolderSync,
  User,
  ShieldCheck,
} from 'lucide-react';
import { googleDriveService, type DriveSyncState } from '../services/googleDriveService';
import { authService } from '../services/authService';
import type { StudyKit, User as AppUser } from '../types';

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AppUser | null;
  kits: StudyKit[];
  onAuthSuccess?: (user: AppUser) => void;
  onKitsSynced?: (kits: StudyKit[]) => void;
  onLogout?: () => void;
}

export const GoogleDriveModal: React.FC<GoogleDriveModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  kits,
  onAuthSuccess,
  onKitsSynced,
  onLogout,
}) => {
  const [syncState, setSyncState] = useState<DriveSyncState>(() => googleDriveService.getState());
  const [isProcessing, setIsProcessing] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = googleDriveService.subscribe((state) => {
      setSyncState(state);
    });
    return unsubscribe;
  }, []);

  if (!isOpen) return null;

  const handleConnect = async () => {
    setIsProcessing(true);
    setNoticeMessage(null);
    try {
      const res = await googleDriveService.loginAndSync();
      if (res.user && onAuthSuccess) {
        onAuthSuccess(res.user);
      }
      if (res.kits && onKitsSynced) {
        onKitsSynced(res.kits);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('thea_ai_settings_changed'));
      }
      setNoticeMessage('Conexión con Google Drive establecida y datos sincronizados.');
    } catch (err: any) {
      setNoticeMessage(err?.message || 'Error al conectar con Google Drive.');
    } finally {
      setIsProcessing(false);
    }
  };

  const hasToken = Boolean(googleDriveService.getValidAccessToken());
  const isConnected = !!syncState.userEmail;
  const isExpired = isConnected && (!hasToken || syncState.status === 'needs_reauth');

  const handleManualSync = async () => {
    // Si el token expiro o se requiere reautenticacion, iniciar flujo OAuth de Google directamente
    if (!googleDriveService.getValidAccessToken() || syncState.status === 'needs_reauth') {
      await handleConnect();
      return;
    }

    const effectiveUserId = currentUser?.id || (syncState.userEmail ? `usr_g_${syncState.userEmail}` : null);
    if (!effectiveUserId) {
      setNoticeMessage('Debes iniciar sesión para sincronizar datos con la nube.');
      return;
    }
    setIsProcessing(true);
    setNoticeMessage(null);
    try {
      // 1. Descargamos y fusionamos todo lo existente en Drive (kits, sesiones, materias de todas las PCs)
      const pulled = await googleDriveService.pullFromDrive(effectiveUserId);
      const unifiedKits = (pulled && pulled.length > 0)
        ? pulled
        : (authService.getUserKits(effectiveUserId) || kits);

      if (pulled && onKitsSynced) {
        onKitsSynced(pulled);
      }
      // 2. Respaldamos el estado consolidado completo hacia Drive
      await googleDriveService.pushToDrive(effectiveUserId, unifiedKits);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('thea_ai_settings_changed'));
        window.dispatchEvent(new CustomEvent('thea_progress_synced', { detail: { userId: effectiveUserId } }));
      }
      setNoticeMessage('Sincronización bidireccional completada con éxito.');
    } catch (err: any) {
      console.error('Error durante la sincronización manual:', err);
      setNoticeMessage('Error al sincronizar con Google Drive.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDisconnect = () => {
    if (window.confirm('¿Deseas cerrar sesión de tu cuenta? Tu progreso se mantendrá respaldado y seguro en tu cuenta.')) {
      if (onLogout) {
        onLogout();
      } else {
        googleDriveService.disconnect();
      }
      setNoticeMessage('Sesión cerrada correctamente.');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-lg bg-[#0e0b16] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.08)] relative overflow-hidden max-h-[90vh] sm:max-h-[92vh] flex flex-col">
        {/* Mobile Pull Handle */}
        <div className="w-12 h-1.5 bg-slate-600/70 rounded-full mx-auto mb-2 sm:hidden shrink-0" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="active-press absolute top-4 sm:top-5 right-4 sm:right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] border border-transparent hover:border-white/10 transition-all cursor-pointer z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Scrollable Content Container */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Modal Header */}
          <div className="text-center mb-4 sm:mb-6">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white mb-3 shadow-md">
              <Cloud className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">Google Drive Cloud Sync</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
              Guarda tus usuarios, kits de estudio e imágenes en tu propia unidad para acceder desde cualquier equipo.
            </p>
          </div>

        {/* Error or Notice Banners */}
        {syncState.errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span className="flex-1">{syncState.errorMessage}</span>
          </div>
        )}

        {noticeMessage && (
          <div className="mb-4 p-3 rounded-xl bg-white/[0.04] border border-white/15 text-zinc-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span className="flex-1">{noticeMessage}</span>
          </div>
        )}

        {isExpired && !syncState.errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span className="flex-1">Tu sesión de Google Drive ha expirado. Haz clic en &quot;Reconectar y Sincronizar&quot; para renovar el acceso.</span>
          </div>
        )}

        {/* Connection State Card */}
        {isConnected ? (
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 mb-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {syncState.avatarUrl ? (
                  <img
                    src={syncState.avatarUrl}
                    alt={syncState.userName || 'Usuario'}
                    className="w-10 h-10 rounded-full border border-white/20"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-white/[0.08] border border-white/15 flex items-center justify-center text-white">
                    <User className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <span>{syncState.userName || 'Usuario de Google'}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${isExpired ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <span>{syncState.userEmail}</span>
                    {isExpired && (
                      <span className="text-[10px] text-amber-400 font-semibold">(Sesión expirada)</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={handleDisconnect}
                title="Desconectar cuenta"
                className="active-press p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] border border-white/[0.08] transition-colors text-xs cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            <div className="pt-2 border-t border-white/[0.06] text-xs text-slate-300 space-y-1">
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-400">Persistencia de sesión:</span>
                {syncState.hasRefreshToken ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-white/[0.06] text-zinc-200 border border-white/10">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Permanente (Refresh Token)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-white/[0.04] text-slate-400 border border-white/[0.08]">
                    <span>Estándar (1 hora)</span>
                  </span>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Carpeta remota en Drive:</span>
                <span className="font-mono text-zinc-300">TheaPlus_CloudData</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Subcarpeta de imágenes:</span>
                <span className="font-mono text-zinc-300">TheaPlus_CloudData/assets</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Última sincronización:</span>
                <span className="text-slate-200 tabular-nums">
                  {syncState.lastSyncTime
                    ? new Date(syncState.lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : 'Reciente'}
                </span>
              </div>
            </div>

            <button
              onClick={handleManualSync}
              disabled={isProcessing}
              className="active-press w-full mt-2 py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs shadow-md flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
              <span>
                {isProcessing
                  ? (isExpired ? 'Reconectando con Google...' : 'Sincronizando con Google Drive...')
                  : (isExpired ? 'Reconectar y Sincronizar' : 'Sincronizar Ahora')}
              </span>
            </button>
          </div>
        ) : (
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 mb-5 text-center">
            <div className="text-xs text-slate-300 mb-3 leading-relaxed">
              Conecta tu cuenta de Google para respaldar y sincronizar automáticamente cada vez que crees o edites kits.
            </div>

            <button
              onClick={handleConnect}
              disabled={isProcessing}
              className="active-press w-full py-3 px-4 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs shadow-lg flex items-center justify-center gap-2.5 cursor-pointer transition-colors disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Conectando con Google...</span>
                </>
              ) : (
                <>
                  <FolderSync className="w-4 h-4" />
                  <span>Continuar con Google Drive</span>
                </>
              )}
            </button>
          </div>
        )}

      </div>
    </div>
  </div>
  );
};
