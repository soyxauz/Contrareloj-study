import React, { useState, useEffect } from 'react';
import {
  Cloud,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Key,
  X,
  LogOut,
  FolderSync,
  HelpCircle,
  User,
} from 'lucide-react';
import { googleDriveService, type DriveSyncState } from '../services/googleDriveService';
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
  const [clientId, setClientId] = useState<string>(() => googleDriveService.getClientId());
  const [showConfig, setShowConfig] = useState<boolean>(() => !googleDriveService.hasClientId());
  const [isProcessing, setIsProcessing] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = googleDriveService.subscribe((state) => {
      setSyncState(state);
    });
    return unsubscribe;
  }, []);

  if (!isOpen) return null;

  const handleSaveClientId = (e: React.FormEvent) => {
    e.preventDefault();
    googleDriveService.setClientId(clientId);
    setNoticeMessage('Client ID guardado correctamente.');
    if (clientId.trim().length > 0) {
      setShowConfig(false);
    }
  };

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
      if (err?.message === 'CLIENT_ID_MISSING') {
        setShowConfig(true);
      }
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

    const effectiveUserId = currentUser?.id || (syncState.userEmail ? `usr_g_${syncState.userEmail}` : 'guest');
    setIsProcessing(true);
    setNoticeMessage(null);
    try {
      // Primero descargamos actualizaciones remotas (incluyendo thea_ai_settings.json)
      const pulled = await googleDriveService.pullFromDrive(effectiveUserId);
      if (pulled && onKitsSynced) {
        onKitsSynced(pulled);
      }
      // Luego respaldamos el estado actual
      await googleDriveService.pushToDrive(effectiveUserId, kits);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('thea_ai_settings_changed'));
      }
      setNoticeMessage('Sincronización bidireccional completada con éxito.');
    } catch (err: any) {
      console.error('Error durante la sincronización manual:', err);
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
      <div className="w-full max-w-lg bg-thea-surface border-t sm:border border-thea-border rounded-t-3xl sm:rounded-3xl p-5 sm:p-8 shadow-2xl relative overflow-hidden max-h-[90vh] sm:max-h-[92vh] flex flex-col">
        {/* Mobile Pull Handle */}
        <div className="w-12 h-1.5 bg-slate-600/70 rounded-full mx-auto mb-2 sm:hidden shrink-0" />

        {/* Glow accent */}
        <div className="absolute -top-24 -right-24 w-52 h-52 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-52 h-52 bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 sm:top-5 right-4 sm:right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-thea-surfaceLight border border-transparent hover:border-thea-border transition-all cursor-pointer z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Scrollable Content Container */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Modal Header */}
          <div className="text-center mb-4 sm:mb-6">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-indigo-600 flex items-center justify-center text-white mb-3 shadow-lg shadow-emerald-900/30">
              <Cloud className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-white">Google Drive Cloud Sync</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Guarda tus usuarios, kits de estudio e imágenes en tu propia unidad para acceder desde cualquier equipo.
            </p>
          </div>

        {/* Error or Notice Banners */}
        {syncState.errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span className="flex-1">{syncState.errorMessage}</span>
          </div>
        )}

        {noticeMessage && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span className="flex-1">{noticeMessage}</span>
          </div>
        )}

        {isExpired && !syncState.errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span className="flex-1">Tu sesión de Google Drive ha expirado. Haz clic en &quot;Reconectar y Sincronizar&quot; para renovar el acceso.</span>
          </div>
        )}

        {/* Connection State Card */}
        {isConnected ? (
          <div className="bg-thea-surfaceLight/80 border border-thea-border rounded-2xl p-4 mb-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {syncState.avatarUrl ? (
                  <img
                    src={syncState.avatarUrl}
                    alt={syncState.userName || 'Usuario'}
                    className="w-10 h-10 rounded-full border border-emerald-500/40"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300">
                    <User className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>{syncState.userName || 'Usuario de Google'}</span>
                    <span className={`w-2 h-2 rounded-full ${isExpired ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
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
                className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 border border-transparent hover:border-rose-500/30 transition-all text-xs"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            <div className="pt-2 border-t border-thea-border/60 text-xs text-slate-300 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Carpeta remota en Drive:</span>
                <span className="font-mono text-emerald-300">TheaPlus_CloudData</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Subcarpeta de imágenes:</span>
                <span className="font-mono text-violet-300">TheaPlus_CloudData/assets</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Última sincronización:</span>
                <span className="text-slate-200">
                  {syncState.lastSyncTime
                    ? new Date(syncState.lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : 'Reciente'}
                </span>
              </div>
            </div>

            <button
              onClick={handleManualSync}
              disabled={isProcessing}
              className={`w-full mt-2 py-2.5 px-4 rounded-xl ${
                isExpired
                  ? 'bg-gradient-to-r from-violet-600 via-indigo-600 to-emerald-600 hover:from-violet-500 hover:to-emerald-500'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500'
              } disabled:opacity-50 text-white font-semibold text-xs shadow-md shadow-emerald-900/30 flex items-center justify-center gap-2 cursor-pointer transition-all`}
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
          <div className="bg-thea-surfaceLight/60 border border-thea-border rounded-2xl p-4 mb-5 text-center">
            <div className="text-xs text-slate-300 mb-3">
              Conecta tu cuenta de Google para respaldar y sincronizar automáticamente cada vez que crees o edites kits.
            </div>

            <button
              onClick={handleConnect}
              disabled={isProcessing}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-emerald-600 hover:from-violet-500 hover:to-emerald-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-violet-900/30 flex items-center justify-center gap-2.5 cursor-pointer transition-all"
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

        {/* Client ID Configuration Section */}
        <div className="border-t border-thea-border pt-4">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Key className="w-3.5 h-3.5 text-violet-400" />
              <span>{showConfig ? 'Ocultar configuración de Client ID' : 'Configurar Client ID de Google Cloud'}</span>
            </button>
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors"
            >
              <span>Consola Google Cloud</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {showConfig && (
            <div className="bg-thea-bg/90 border border-thea-border rounded-xl p-3.5 text-xs space-y-3 mt-2">
              <form onSubmit={handleSaveClientId} className="space-y-2.5">
                <label className="block text-[11px] font-semibold text-slate-300">
                  Google OAuth 2.0 Web Client ID
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="xxxx-xxxx.apps.googleusercontent.com"
                    className="flex-1 bg-thea-surface border border-thea-border rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-semibold text-xs transition-colors shrink-0 cursor-pointer"
                  >
                    Guardar
                  </button>
                </div>
              </form>

              {/* Instructions list */}
              <div className="pt-2 border-t border-thea-border/40 text-[11px] text-slate-400 space-y-1.5">
                <div className="font-semibold text-slate-300 flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5 text-violet-400" />
                  <span>Pasos para obtener tu Client ID gratis:</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 pl-1 text-slate-400">
                  <li>Crea o selecciona un proyecto en Google Cloud Console.</li>
                  <li>Habilita la API de <strong>Google Drive API</strong> en la Biblioteca.</li>
                  <li>En Credenciales, crea un <strong>ID de cliente de OAuth (Aplicación Web)</strong>.</li>
                  <li>
                    En 'Orígenes de JavaScript autorizados', agrega:{' '}
                    <code className="text-violet-300 bg-violet-950/60 px-1 py-0.5 rounded">
                      {typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'}
                    </code>
                  </li>
                  <li>Pega el Client ID arriba y pulsa Guardar.</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
  );
};
