import React, { useState, useEffect, useMemo } from 'react';
import {
  Cloud,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  LogOut,
  FolderSync,
  User,
  Key,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from 'lucide-react';
import { googleDriveService, type DriveSyncState } from '../services/googleDriveService';
import { validateGoogleClientId } from '../utils/validation';
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
  const [clientIdInput, setClientIdInput] = useState<string>(() => googleDriveService.getClientId());
  const [clientSecretInput, setClientSecretInput] = useState<string>(() => googleDriveService.getClientSecret());
  const [showConfig, setShowConfig] = useState<boolean>(() => !googleDriveService.hasClientId());
  const [isSavedKey, setIsSavedKey] = useState(false);

  useEffect(() => {
    const unsubscribe = googleDriveService.subscribe((state) => {
      setSyncState(state);
    });
    return unsubscribe;
  }, []);

  const clientIdValidation = useMemo(() => {
    return validateGoogleClientId(clientIdInput, false);
  }, [clientIdInput]);

  const handleSaveCredentials = () => {
    if (!clientIdValidation.isValid) return;
    googleDriveService.setClientId(clientIdInput.trim());
    googleDriveService.setClientSecret(clientSecretInput.trim());
    setIsSavedKey(true);
    setTimeout(() => setIsSavedKey(false), 2000);
  };

  if (!isOpen) return null;

  const handleConnect = async () => {
    if (!googleDriveService.hasClientId()) {
      if (!clientIdValidation.isValid) {
        setNoticeMessage(clientIdValidation.error || 'Debes ingresar un Client ID de Google OAuth válido.');
        setShowConfig(true);
        return;
      }
      googleDriveService.setClientId(clientIdInput.trim());
    }
    if (clientSecretInput.trim() && !googleDriveService.getClientSecret()) {
      googleDriveService.setClientSecret(clientSecretInput.trim());
    }

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
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-400">Persistencia de sesión:</span>
                {syncState.hasRefreshToken ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Permanente (Refresh Token)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-700/40 text-slate-300 border border-slate-600/40">
                    <span>Estándar (1 hora)</span>
                  </span>
                )}
              </div>
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
              disabled={isProcessing || (!googleDriveService.hasClientId() && !clientIdValidation.isValid)}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-emerald-600 hover:from-violet-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-lg shadow-violet-900/30 flex items-center justify-center gap-2.5 cursor-pointer transition-all"
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

        {/* Client ID & Secret Configuration Section */}
        <div className="bg-thea-surfaceLight/40 border border-thea-border/80 rounded-2xl p-4 space-y-3 mb-3">
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="w-full flex items-center justify-between text-left text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-emerald-400" />
              <span>Configuración OAuth y Sesión Permanente</span>
              {googleDriveService.hasClientId() && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {syncState.hasRefreshToken ? 'Permanente' : 'Activo'}
                </span>
              )}
            </div>
            {showConfig ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {showConfig && (
            <div className="pt-2 border-t border-thea-border/60 space-y-3 animate-fadeIn">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Google Client ID</label>
                <input
                  type="text"
                  value={clientIdInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setClientIdInput(val);
                    const valid = validateGoogleClientId(val);
                    if (valid.isValid) {
                      googleDriveService.setClientId(val.trim());
                    }
                  }}
                  placeholder="123456789-ejemplo.apps.googleusercontent.com"
                  className={`w-full px-3 py-2 rounded-xl bg-thea-bg border text-white text-xs font-mono focus:outline-none transition-colors ${
                    clientIdInput.trim() && !clientIdValidation.isValid
                      ? 'border-rose-500 focus:border-rose-500'
                      : 'border-thea-border focus:border-emerald-500'
                  }`}
                />
                {clientIdInput.trim() && !clientIdValidation.isValid && (
                  <p className="mt-1.5 text-[11px] text-rose-400 font-medium flex items-center gap-1.5 animate-fadeIn">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                    <span>{clientIdValidation.error}</span>
                  </p>
                )}
                {clientIdValidation.isValid && (
                  <p className="mt-1.5 text-[11px] text-emerald-400 font-medium flex items-center gap-1.5 animate-fadeIn">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                    <span>Formato de Client ID válido.</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Google Client Secret <span className="text-[10px] text-slate-400 font-normal">(Opcional, habilita Refresh Token permanente)</span>
                </label>
                <input
                  type="password"
                  value={clientSecretInput}
                  onChange={(e) => setClientSecretInput(e.target.value)}
                  placeholder="GOCSPX-ejemploClaveSecretaGoogle"
                  className="w-full px-3 py-2 rounded-xl bg-thea-bg border border-thea-border focus:border-emerald-500 text-white text-xs font-mono focus:outline-none transition-colors"
                />
                <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                  Permite renovar sesiones de servidor a servidor sin interrupciones por meses. También puede configurarse en el archivo .env o en Vercel como GOOGLE_CLIENT_SECRET.
                </p>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleSaveCredentials}
                  disabled={!clientIdValidation.isValid}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-300 text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSavedKey ? 'Credenciales guardadas' : 'Guardar Credenciales'}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  </div>
  );
};
