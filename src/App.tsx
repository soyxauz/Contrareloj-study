import React, { useState, useEffect, useRef } from 'react';
import type { StudyKit, StudyMode, DeveloperSettings, User } from './types';
import { BookOpen, AlertCircle } from 'lucide-react';
import { authService } from './services/authService';
import {
  hydrateKitAssets,
  isCorruptedKit,
  requestPersistentStorage,
  mergeKitsByUpdatedAt,
  recordDeletedKitId,
  recordDeletedKitIds,
  purgeAssetMemoryCache,
  stripAssetDataUrlsFromKit,
  cleanOrphanAssetsFromIndexedDB,
  safeLocalStorageSetItem,
} from './services/storageService';
import { purgeImageCleanerCache } from './utils/imageCleaner';
import { recoverAndPurgeCorruptedKeys } from './utils/storageKeys';
import { revokeAllAzureAudioUrls } from './services/azureEdgeTtsService';
import { revokeAllPodcastAudioUrls, savePodcastSettings } from './services/geminiAudioService';
import { googleDriveService } from './services/googleDriveService';
import { resetAISettingsToDefault, saveAISettings, getAISettings } from './services/aiService';
import { Navbar } from './components/Navbar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { HomeView } from './components/HomeView';
import type { InputTab } from './components/CreateStudyKitView';
import { restoreCustomMateriasAsync } from './services/materiaService';
import { initUltraLightSmoothScroll, resetUltraLightSmoothScroll } from './utils/smoothScroll';
import { useTheme, initTheme } from './services/themeService';

// Carga diferida (Lazy Loading) de vistas secundarias para arranque ultrarrápido
const SmartStudyView = React.lazy(() => import('./components/SmartStudyView').then(m => ({ default: m.SmartStudyView })));
const StudyGuideView = React.lazy(() => import('./components/StudyGuideView').then(m => ({ default: m.StudyGuideView })));
const ImagesGalleryView = React.lazy(() => import('./components/ImagesGalleryView').then(m => ({ default: m.ImagesGalleryView })));
const PodcastView = React.lazy(() => import('./components/PodcastView').then(m => ({ default: m.PodcastView })));
const AskTheaView = React.lazy(() => import('./components/AskTheaView').then(m => ({ default: m.AskTheaView })));
const OralLessonView = React.lazy(() => import('./components/OralLessonView').then(m => ({ default: m.OralLessonView })));
const PracticeTestView = React.lazy(() => import('./components/PracticeTestView').then(m => ({ default: m.PracticeTestView })));
const FlashcardsView = React.lazy(() => import('./components/FlashcardsView').then(m => ({ default: m.FlashcardsView })));
const AnalyticsView = React.lazy(() => import('./components/AnalyticsView').then(m => ({ default: m.AnalyticsView })));
const CreateStudyKitView = React.lazy(() => import('./components/CreateStudyKitView').then(m => ({ default: m.CreateStudyKitView })));
const AISettingsModal = React.lazy(() => import('./components/AISettingsModal').then(m => ({ default: m.AISettingsModal })));
const AuthModal = React.lazy(() => import('./components/AuthModal').then(m => ({ default: m.AuthModal })));
const GoogleDriveModal = React.lazy(() => import('./components/GoogleDriveModal').then(m => ({ default: m.GoogleDriveModal })));

const ViewLoadingFallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center py-24 min-h-[400px]">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin" />
      <span className="text-xs text-slate-400 font-medium">Cargando módulo de estudio...</span>
    </div>
  </div>
);

interface ErrorBoundaryProps {
  onReset: () => void;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ViewErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ViewErrorBoundary] Error capturado en vista:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-md mx-auto px-6 py-24 text-center animate-fadeIn">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
            <BookOpen className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Se produjo un problema al cargar esta vista</h3>
          <p className="text-sm text-slate-400 mb-6">
            Tus datos y progresos están a salvo. Puedes regresar a la pantalla principal para reabrir el kit.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              this.props.onReset();
            }}
            className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-all cursor-pointer shadow-lg shadow-violet-900/30"
          >
            Volver al Inicio
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const STORAGE_CURRENT_KIT_KEY = 'thea_currentkit_id';

interface AppHistoryState {
  mode: StudyMode;
  kitId?: string | null;
  modal?: 'ai' | 'auth' | 'drive' | null;
}

export const App: React.FC = () => {
  // User Authentication State
  const [currentUser, setCurrentUser] = useState<User | null>(() => authService.getCurrentUser());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showGoogleDriveModal, setShowGoogleDriveModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [driveNeedsReauth, setDriveNeedsReauth] = useState<boolean>(() => googleDriveService.getState().status === 'needs_reauth');
  const isLoggingOutRef = useRef(false);
  const isHydratedRef = useRef(false);
  const isStartupHydrationRef = useRef(true);

  useEffect(() => {
    const unsubscribe = googleDriveService.subscribe((state) => {
      const needs = state.status === 'needs_reauth';
      setDriveNeedsReauth(prev => prev !== needs ? needs : prev);
    });
    return unsubscribe;
  }, []);

  // Motor de scroll inercial suave ultraligero (0 dependencias, 0% CPU en reposo)
  useEffect(() => {
    return initUltraLightSmoothScroll();
  }, []);

  // Pre-carga diferida en reposo absoluto (evita robar ciclos de CPU durante el primer scroll de arranque)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => {
          import('./components/AISettingsModal');
          import('./components/AuthModal');
          import('./components/GoogleDriveModal');
        });
      } else {
        import('./components/AISettingsModal');
        import('./components/AuthModal');
        import('./components/GoogleDriveModal');
      }
    }, 6000);
    return () => clearTimeout(timer);
  }, []);

  // Carga inicial robusta de kits (para usuario autenticado o sesión de invitado con kits de fábrica garantizados)
  const [kits, setKits] = useState<StudyKit[]>(() => {
    const initialUserId = authService.getCurrentUser()?.id || null;
    const initialKits = authService.getUserKits(initialUserId).filter(k => !isCorruptedKit(k)).map(stripAssetDataUrlsFromKit);
    const savedCurrentId = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_CURRENT_KIT_KEY) : null;
    if (savedCurrentId) {
      if (['bio-respiration', 'cs-algorithms', 'cs-algo'].includes(savedCurrentId)) {
        try { localStorage.removeItem(STORAGE_CURRENT_KIT_KEY); } catch {}
      } else {
        const activeIdx = initialKits.findIndex(k => k.id === savedCurrentId);
        if (activeIdx > 0) {
          const active = initialKits[activeIdx];
          const rest = initialKits.filter((_, i) => i !== activeIdx);
          return [active, ...rest];
        }
      }
    }
    return initialKits;
  });

  // Selección inicial del kit activo
  const [currentKit, setCurrentKit] = useState<StudyKit | null>(() => {
    const savedCurrentId = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_CURRENT_KIT_KEY) : null;
    if (savedCurrentId) {
      if (['bio-respiration', 'cs-algorithms', 'cs-algo'].includes(savedCurrentId)) {
        try { localStorage.removeItem(STORAGE_CURRENT_KIT_KEY); } catch {}
      } else {
        const found = kits.find(k => k.id === savedCurrentId && !isCorruptedKit(k));
        if (found) return stripAssetDataUrlsFromKit(found);
      }
    }
    const cleanFirst = kits.find(k => !isCorruptedKit(k));
    if (cleanFirst) {
      safeLocalStorageSetItem(STORAGE_CURRENT_KIT_KEY, cleanFirst.id);
      return stripAssetDataUrlsFromKit(cleanFirst);
    }
    return null;
  });

  // Restauración de sesión persistente triple y recuperación asíncrona de kits desde IndexedDB
  useEffect(() => {
    let isCancelled = false;

    // Purga y recuperacion de claves corruptas en LocalStorage
    recoverAndPurgeCorruptedKeys();

    // 1. Recuperar kits y materias inmediatamente desde IndexedDB sin esperar la sesión
    const initialUserId = currentUser ? currentUser.id : authService.getCurrentUser()?.id || null;
    authService.restoreUserKitsAsync(initialUserId).then((recoveredKits) => {
      if (isCancelled) return;
      const cleanKits = recoveredKits.filter(k => !isCorruptedKit(k));
      if (cleanKits.length > 0) {
        const cleanStrippedKits = cleanKits.map(stripAssetDataUrlsFromKit);
        setKits(prev => {
          const merged = mergeKitsByUpdatedAt(prev, cleanStrippedKits);
          isHydratedRef.current = true;
          const savedCurrentId = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_CURRENT_KIT_KEY) : null;
          if (savedCurrentId) {
            const activeIdx = merged.findIndex(k => k.id === savedCurrentId);
            if (activeIdx > 0) {
              const active = merged[activeIdx];
              const rest = merged.filter((_, i) => i !== activeIdx);
              return [active, ...rest];
            }
          }
          return merged;
        });
        setCurrentKit(prev => {
          const savedCurrentId = localStorage.getItem(STORAGE_CURRENT_KIT_KEY);
          const targetId = prev ? prev.id : savedCurrentId;
          const fullKit = cleanKits.find(k => k.id === targetId);

          if (fullKit) {
            const stripped = stripAssetDataUrlsFromKit(fullKit);
            if (!prev) return stripped;
            const fullTime = stripped.updatedAt || 0;
            const prevTime = prev.updatedAt || 0;
            if (
              fullTime >= prevTime ||
              (stripped.questions?.length || 0) > (prev.questions?.length || 0) ||
              (stripped.flashcards?.length || 0) > (prev.flashcards?.length || 0) ||
              (stripped.archivedFlashcards?.length || 0) > (prev.archivedFlashcards?.length || 0)
            ) {
              return stripped;
            }
          }

          if (!prev) {
            const selected = fullKit ? stripAssetDataUrlsFromKit(fullKit) : cleanStrippedKits[0];
            if (selected) {
              safeLocalStorageSetItem(STORAGE_CURRENT_KIT_KEY, selected.id);
            }
            return selected;
          }
          return prev;
        });
        setTimeout(() => {
          isStartupHydrationRef.current = false;
        }, 1200);
      } else {
        isHydratedRef.current = true;
        setTimeout(() => {
          isStartupHydrationRef.current = false;
        }, 1200);
      }
    });

    restoreCustomMateriasAsync(initialUserId).catch(() => {});

    // Restauración universal e inmediata de sesiones de estudio y flashcards desde IndexedDB
    authService.restoreAllSessionsFromIndexedDB().catch(() => {});

    // 2. Restauración de sesión persistente en paralelo si el usuario no estaba cargado
    authService.restorePersistentSession().then(async (restoredUser) => {
      if (isCancelled) return;
      if (restoredUser && (!currentUser || currentUser.id !== restoredUser.id)) {
        setCurrentUser(restoredUser);
        const secondKits = await authService.restoreUserKitsAsync(restoredUser.id);
        if (isCancelled) return;
        const cleanKits = secondKits.filter(k => !isCorruptedKit(k));
        if (cleanKits.length > 0) {
          setKits(prev => mergeKitsByUpdatedAt(prev, cleanKits.map(stripAssetDataUrlsFromKit)));
        }
        authService.restoreAllSessionsFromIndexedDB().catch(() => {});
        if (googleDriveService.isLinked()) {
          googleDriveService.autoSyncOnStartup(restoredUser.id).catch(() => {});
        }
      }
      setTimeout(() => {
        isStartupHydrationRef.current = false;
      }, 1200);
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  // Solicitud de persistencia inmutable al navegador
  useEffect(() => {
    requestPersistentStorage().then((persisted) => {
      if (persisted) {
        console.log('[App] Almacenamiento persistente garantizado.');
      }
    });
  }, []);

  // Garbage Collection silencioso de activos huérfanos en IndexedDB
  useEffect(() => {
    if (kits && kits.length > 0 && isHydratedRef.current) {
      const timer = setTimeout(() => {
        cleanOrphanAssetsFromIndexedDB(kits).catch(() => {});
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [kits?.length]);


  // Volcado de seguridad (Safety Flush) ante pagehide o cambio de pestaña
  useEffect(() => {
    const handleSafetyFlush = () => {
      try {
        const activeUser = authService.getCurrentUser();
        const userId = activeUser ? activeUser.id : null;
        if (kits && kits.length > 0) {
          authService.flushKitsSync(userId, kits);
          if (userId) {
            googleDriveService.flushAutoSync(userId, kits);
          }
        }
      } catch (e) {
        console.warn('[App] Error en safety flush:', e);
      }
    };

    window.addEventListener('pagehide', handleSafetyFlush);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleSafetyFlush();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', handleSafetyFlush);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [kits]);

  const [currentMode, setCurrentMode] = useState<StudyMode>('home');
  const prevModeRef = useRef<StudyMode>(currentMode);
  const { theme } = useTheme();

  useEffect(() => {
    initTheme();
  }, []);

  // Reset sereno de scroll únicamente al cambiar de pantalla (nunca en el montaje inicial del arranque)
  useEffect(() => {
    if (prevModeRef.current !== currentMode) {
      prevModeRef.current = currentMode;
      resetUltraLightSmoothScroll(0);
    }
  }, [currentMode]);

  // Bloqueo estricto del scroll de la página de fondo mientras haya modales abiertos
  useEffect(() => {
    if (showAIModal || showAuthModal || showGoogleDriveModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showAIModal, showAuthModal, showGoogleDriveModal]);
  const [createInitialTab, setCreateInitialTab] = useState<InputTab>('topic');

  // Modales sincronizados con el historial del navegador para permitir volver atrás
  const handleOpenAIModal = () => {
    setShowAIModal(true);
    window.history.pushState({
      mode: currentMode,
      kitId: currentKit?.id || null,
      modal: 'ai',
    }, '');
  };

  const handleCloseAIModal = () => {
    if (window.history.state?.modal === 'ai') {
      window.history.back();
    } else {
      setShowAIModal(false);
    }
  };

  const handleOpenAuthModal = () => {
    setShowAuthModal(true);
    window.history.pushState({
      mode: currentMode,
      kitId: currentKit?.id || null,
      modal: 'auth',
    }, '');
  };

  const handleCloseAuthModal = () => {
    if (window.history.state?.modal === 'auth') {
      window.history.back();
    } else {
      setShowAuthModal(false);
    }
  };

  const handleOpenGoogleDriveModal = () => {
    setShowGoogleDriveModal(true);
    window.history.pushState({
      mode: currentMode,
      kitId: currentKit?.id || null,
      modal: 'drive',
    }, '');
  };

  const handleCloseGoogleDriveModal = () => {
    if (window.history.state?.modal === 'drive') {
      window.history.back();
    } else {
      setShowGoogleDriveModal(false);
    }
  };

  const handleSelectMode = (mode: StudyMode, pushToHistory = true) => {
    // Forzar guardado en Drive al cambiar de modo si había cambios pendientes
    if (currentUser?.id) {
      googleDriveService.flushAutoSync(currentUser.id, kits);
    }
    // Revocar activamente audios en memoria al cambiar de vista o de sección de estudio
    if (mode !== currentMode) {
      revokeAllAzureAudioUrls();
      revokeAllPodcastAudioUrls();

      // Si se sale de ImagesGalleryView, liberar inmediatamente todos los activos pesados de la RAM
      if (mode !== 'images') {
        purgeAssetMemoryCache();
        purgeImageCleanerCache();
        setKits(prev => prev.map(stripAssetDataUrlsFromKit));
        setCurrentKit(prev => (prev ? stripAssetDataUrlsFromKit(prev) : prev));
      }
    }

    // Hidratar activos completos únicamente cuando el usuario entra explícitamente a la Galería de Imágenes
    if (mode === 'images' && currentKit) {
      const hasMissing = currentKit.assets?.some(a => !a.dataUrl);

      if (hasMissing) {
        hydrateKitAssets(currentKit)
          .then(hydrated => {
            setCurrentKit(hydrated);
          })
          .catch(() => {});
      }
    }
    setCurrentMode(mode);
    if (pushToHistory) {
      if (mode !== currentMode || window.history.state?.mode !== mode) {
        window.history.pushState({
          mode,
          kitId: currentKit?.id || null,
          modal: null,
        }, '');
      }
    }
  };

  const handleNavigate = (mode: StudyMode, initialTab?: InputTab) => {
    if (initialTab) {
      setCreateInitialTab(initialTab);
    }
    handleSelectMode(mode, true);
  };

  // Integración completa con botones Atrás y Adelante del navegador (HTML5 History API)
  useEffect(() => {
    const initialState: AppHistoryState = {
      mode: currentMode,
      kitId: currentKit?.id || null,
      modal: null,
    };
    if (!window.history.state) {
      window.history.replaceState(initialState, '');
    }

    const handlePopState = (e: PopStateEvent) => {
      const state = e.state as AppHistoryState | null;
      if (!state) {
        setShowAIModal(false);
        setShowAuthModal(false);
        setShowGoogleDriveModal(false);
        setCurrentMode('home');
        return;
      }

      // Sincronizar modales
      setShowAIModal(state.modal === 'ai');
      setShowAuthModal(state.modal === 'auth');
      setShowGoogleDriveModal(state.modal === 'drive');

      // Sincronizar kit seleccionado
      if (state.kitId) {
        setKits(prevKits => {
          const match = prevKits.find(k => k.id === state.kitId);
          if (match) {
            setCurrentKit(match);
            safeLocalStorageSetItem(STORAGE_CURRENT_KIT_KEY, match.id);
          }
          return prevKits;
        });
      }

      // Sincronizar modo sin duplicar entrada en el historial
      if (state.mode) {
        handleSelectMode(state.mode, false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Detención inmediata de podcast al salir de la pestaña o cambiar de sección en la app
  useEffect(() => {
    if (currentMode !== 'podcast') {
      window.dispatchEvent(new CustomEvent('thea_podcast_stop_request'));
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch (_) {}
      }
    }
  }, [currentMode]);

  // Ajustes de plataforma permanentemente desbloqueados
  useEffect(() => {
    const permanentSettings: DeveloperSettings = {
      serverHasTheaPlus: true,
      unlimitedQuestions: true,
      unlockedSmartEdit: true,
      unlockedPodcast: true,
      unlockedAskThea: true,
      userProgressionLevel: 'Expert',
      forceExplanationImages: true,
      bypassPaywall: true,
    };
    safeLocalStorageSetItem('thea_developersettings', JSON.stringify(permanentSettings));
  }, []);

  // Sync Study Kits (protegido contra sobreescritura destructiva y bucles de guardado en arranque)
  useEffect(() => {
    if (isLoggingOutRef.current) return;
    if (!isHydratedRef.current || isStartupHydrationRef.current) return;
    try {
      if (kits && kits.length > 0) {
        authService.saveUserKits(currentUser ? currentUser.id : null, kits);
      }
    } catch (e) {
      console.error('Error al guardar Study Kits:', e);
    }
  }, [kits, currentUser]);

  // Sincronización automática diferida al inicio desde Google Drive (evita bloquear los primeros 3.5s de interacción)
  useEffect(() => {
    if (!currentUser) return;
    if (!googleDriveService.isLinked() && !googleDriveService.getValidAccessToken()) return;

    const timer = setTimeout(() => {
      googleDriveService.autoSyncOnStartup(currentUser.id).then((pulled) => {
        if (pulled && Array.isArray(pulled) && pulled.length > 0) {
          const clean = pulled.filter(k => !isCorruptedKit(k));
          if (clean.length > 0) {
            setKits(prev => mergeKitsByUpdatedAt(prev, clean));
            setCurrentKit(prev => {
              if (!prev) return clean[0];
              const match = clean.find(k => k.id === prev.id);
              if (match) {
                return mergeKitsByUpdatedAt([prev], [match])[0] || prev;
              }
              return prev;
            });
          }
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('thea_ai_settings_changed'));
        }
      }).catch(err => {
        console.warn('[App] Error al sincronizar inicio desde Google Drive:', err);
      });
    }, 3500);

    return () => clearTimeout(timer);
  }, [currentUser?.id]);

  const startupGracePeriodRef = useRef(Date.now() + 10000); // 10s de gracia inicial para no saturar la red con subidas

  // Respaldo en segundo plano hacia Google Drive con debounce de 8000ms
  useEffect(() => {
    if (isLoggingOutRef.current) return;
    if (!currentUser) return;
    if (!googleDriveService.isLinked() && !googleDriveService.getValidAccessToken()) return;
    const currentSyncStatus = googleDriveService.getState().status;
    if (currentSyncStatus === 'needs_reauth' || currentSyncStatus === 'error') return;
    if (!isHydratedRef.current) return;
    if (Date.now() < startupGracePeriodRef.current) return;

    googleDriveService.scheduleAutoSync(currentUser.id, kits, 8000);
  }, [kits, currentUser]);

  // Respaldo en segundo plano del progreso de Smart Study y Flashcards hacia Google Drive en tiempo real
  useEffect(() => {
    if (!currentUser) return;
    let debounceTimer: any = null;
    let hasPendingPush = false;
    let lastPullTime = 0;

    const flushPush = () => {
      if (!hasPendingPush) return;
      hasPendingPush = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (isLoggingOutRef.current) return;
      if (!googleDriveService.isLinked() && !googleDriveService.getValidAccessToken()) return;

      googleDriveService.pushProgressToDrive(currentUser.id).catch((err) => {
        console.warn('[App] Error al sincronizar progreso en Google Drive:', err);
      });
    };

    const handleProgressSaved = () => {
      if (isLoggingOutRef.current) return;
      if (!googleDriveService.isLinked() && !googleDriveService.getValidAccessToken()) return;

      hasPendingPush = true;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        flushPush();
      }, 3500);
    };

    // Al regresar a la pestaña o cambiar de ventana (ej. tras estudiar en otra PC), comprobar y fusionar novedades
    const handleTabFocus = () => {
      if (isLoggingOutRef.current) return;
      if (document.visibilityState === 'hidden') {
        flushPush();
        return;
      }
      const now = Date.now();
      if (now - lastPullTime > 15000) {
        lastPullTime = now;
        if (googleDriveService.isLinked() || googleDriveService.getValidAccessToken()) {
          googleDriveService.pullProgressFromDrive(currentUser.id).catch(() => {});
        }
      }
    };

    window.addEventListener('thea_session_saved', handleProgressSaved);
    window.addEventListener('thea_flashcard_saved', handleProgressSaved);
    window.addEventListener('visibilitychange', handleTabFocus);
    window.addEventListener('pagehide', flushPush);
    window.addEventListener('beforeunload', flushPush);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      flushPush();
      window.removeEventListener('thea_session_saved', handleProgressSaved);
      window.removeEventListener('thea_flashcard_saved', handleProgressSaved);
      window.removeEventListener('visibilitychange', handleTabFocus);
      window.removeEventListener('pagehide', flushPush);
      window.removeEventListener('beforeunload', flushPush);
    };
  }, [currentUser]);

  // Sync Current Kit ID to LocalStorage
  useEffect(() => {
    if (currentKit && !isCorruptedKit(currentKit)) {
      safeLocalStorageSetItem(STORAGE_CURRENT_KIT_KEY, currentKit.id);
    } else if (!currentKit) {
      localStorage.removeItem(STORAGE_CURRENT_KIT_KEY);
    }
  }, [currentKit]);

  // Hidratar activos desde IndexedDB únicamente cuando la vista activa es la Galería de Imágenes
  useEffect(() => {
    if (currentMode !== 'images') return;
    const checkAndHydrate = (kitToHydrate: StudyKit | null) => {
      if (!kitToHydrate) return;
      const hasStrippedAssets =
        kitToHydrate.assets?.some(a => !a.dataUrl) ||
        kitToHydrate.questions?.some(q => q.sourceAsset && !q.sourceAsset.dataUrl);

      if (hasStrippedAssets) {
        hydrateKitAssets(kitToHydrate)
          .then(hydrated => {
            const countBefore = (kitToHydrate.assets?.filter(a => !!a.dataUrl).length || 0) +
              (kitToHydrate.questions?.filter(q => !!q.sourceAsset?.dataUrl).length || 0);
            const countAfter = (hydrated.assets?.filter(a => !!a.dataUrl).length || 0) +
              (hydrated.questions?.filter(q => !!q.sourceAsset?.dataUrl).length || 0);

            if (countAfter > countBefore) {
              setCurrentKit(hydrated);
            }
          })
          .catch(err => {
            console.warn('[App] Error al hidratar activos desde IndexedDB:', err);
          });
      }
    };

    checkAndHydrate(currentKit);

    const handleAssetsSynced = () => {
      setCurrentKit(prev => {
        checkAndHydrate(prev);
        return prev;
      });
    };

    window.addEventListener('thea_assets_synced', handleAssetsSynced);
    return () => {
      window.removeEventListener('thea_assets_synced', handleAssetsSynced);
    };
  }, [currentKit?.id]);

  // Safety check: ensure currentKit is never corrupted
  useEffect(() => {
    if (currentKit && isCorruptedKit(currentKit)) {
      const clean = kits.find(k => !isCorruptedKit(k));
      if (clean) {
        setCurrentKit(clean);
        safeLocalStorageSetItem(STORAGE_CURRENT_KIT_KEY, clean.id);
      } else {
        setCurrentKit(null);
        localStorage.removeItem(STORAGE_CURRENT_KIT_KEY);
      }
    }
  }, [currentKit, kits]);

  const handleAuthSuccess = (user: User, syncedKits?: StudyKit[] | null) => {
    isLoggingOutRef.current = false;
    setCurrentUser(user);

    // 0. Borrado total e inmediato de datos de invitado (aislamiento estricto)
    authService.clearGuestData();

    // 1. Restaurar ajustes de IA asociados a esta cuenta
    const userAISettings = authService.getUserAISettings(user.id);
    const currentSettings = getAISettings();
    const userHasAiKey = Boolean(
      (userAISettings?.apiKey && userAISettings.apiKey.trim().length > 0) ||
      (userAISettings?.geminiApiKey && userAISettings.geminiApiKey.trim().length > 0)
    );
    const currentHasAiKey = Boolean(
      (currentSettings.apiKey && currentSettings.apiKey.trim().length > 0) ||
      (currentSettings.geminiApiKey && currentSettings.geminiApiKey.trim().length > 0)
    );

    if (userAISettings && userHasAiKey) {
      saveAISettings(userAISettings);
      if (userAISettings.geminiApiKey?.trim()) {
        safeLocalStorageSetItem('contrareloj_gemini_api_key', userAISettings.geminiApiKey.trim());
      }
    } else if (currentHasAiKey) {
      authService.saveUserAISettings(user.id, currentSettings);
    }

    // 1.1 Restaurar ajustes de Podcast asociados a esta cuenta
    const userPodcastSettings = authService.getUserPodcastSettings(user.id);
    if (userPodcastSettings) {
      savePodcastSettings(userPodcastSettings);
    }

    // 2. Si ya vinieron kits sincronizados directamente de Google Drive (login con Google)
    if (syncedKits && Array.isArray(syncedKits) && syncedKits.length > 0) {
      const cleanPulled = syncedKits.filter(k => !isCorruptedKit(k));
      if (cleanPulled.length > 0) {
        const strippedPulled = cleanPulled.map(stripAssetDataUrlsFromKit);
        setKits(prev => mergeKitsByUpdatedAt(prev, strippedPulled));
        authService.saveUserKits(user.id, strippedPulled);
        const firstPulled = strippedPulled[0] || null;
        setCurrentKit(firstPulled);
        if (firstPulled) {
          safeLocalStorageSetItem(STORAGE_CURRENT_KIT_KEY, firstPulled.id);
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('thea_ai_settings_changed'));
        }
        return;
      }
    }

    // 3. Restaurar kits del usuario guardados localmente
    const userKits = authService.getUserKits(user.id);
    const clean = userKits.filter(k => !isCorruptedKit(k)).map(stripAssetDataUrlsFromKit);
    setKits(clean);
    const first = clean[0] || null;
    setCurrentKit(first);
    if (first) {
      safeLocalStorageSetItem(STORAGE_CURRENT_KIT_KEY, first.id);
    } else {
      localStorage.removeItem(STORAGE_CURRENT_KIT_KEY);
    }

    // 4. Sincronizar con Google Drive para recuperar todo el progreso en la nube
    if (googleDriveService.isLinked() || googleDriveService.getValidAccessToken()) {
      googleDriveService.autoSyncOnStartup(user.id).then((pulled) => {
        if (pulled && Array.isArray(pulled) && pulled.length > 0) {
          const cleanPulled = pulled.filter(k => !isCorruptedKit(k));
          if (cleanPulled.length > 0) {
            const strippedPulled = cleanPulled.map(stripAssetDataUrlsFromKit);
            setKits(prev => mergeKitsByUpdatedAt(prev, strippedPulled));
            const firstPulled = strippedPulled[0] || null;
            setCurrentKit(prev => prev || firstPulled);
            if (firstPulled) {
              safeLocalStorageSetItem(STORAGE_CURRENT_KIT_KEY, firstPulled.id);
            }
          }
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('thea_ai_settings_changed'));
        }
      }).catch(err => {
        console.warn('[App] Error al sincronizar desde Google Drive tras login:', err);
      });
    }
  };

  const handleReconnectDrive = async () => {
    try {
      if (googleDriveService.getRefreshToken()) {
        const silentToken = await googleDriveService.attemptSilentTokenRefresh();
        if (silentToken) {
          setDriveNeedsReauth(false);
          const res = await googleDriveService.pullFromDrive(currentUser?.id || '');
          if (res && res.length > 0) {
            const clean = res.filter(k => !isCorruptedKit(k));
            setKits(prev => mergeKitsByUpdatedAt(prev, clean.map(stripAssetDataUrlsFromKit)));
          }
          return;
        }
      }
      const res = await googleDriveService.loginAndSync(undefined, true);
      if (res.kits) {
        const clean = res.kits.filter(k => !isCorruptedKit(k));
        if (clean.length > 0) {
          setKits(prev => mergeKitsByUpdatedAt(prev, clean.map(stripAssetDataUrlsFromKit)));
          if (!currentKit) setCurrentKit(stripAssetDataUrlsFromKit(clean[0]));
        }
      }
      setDriveNeedsReauth(false);
    } catch (err) {
      console.error('Error al reconectar Google Drive:', err);
    }
  };

  const handleLogout = () => {
    isLoggingOutRef.current = true;
    try {
      googleDriveService.disconnect();
      authService.logout();
      authService.clearGuestData();
      resetAISettingsToDefault();
      setCurrentUser(null);
      // Al cerrar sesión, cargar los kits limpios de fábrica para invitado en lugar de dejar la pantalla vacía
      const guestKits = authService.getUserKits(null).filter(k => !isCorruptedKit(k)).map(stripAssetDataUrlsFromKit);
      setKits(guestKits);
      const first = guestKits[0] || null;
      setCurrentKit(first);
      if (first) {
        safeLocalStorageSetItem(STORAGE_CURRENT_KIT_KEY, first.id);
      } else {
        localStorage.removeItem(STORAGE_CURRENT_KIT_KEY);
      }
      setCurrentMode('home');
    } finally {
      setTimeout(() => {
        isLoggingOutRef.current = false;
      }, 400);
    }
  };

  const handleSelectKit = (kit: StudyKit, pushToHistory = false) => {
    if (!kit || isCorruptedKit(kit)) return;

    if (currentKit && currentKit.id !== kit.id) {
      purgeAssetMemoryCache();
      purgeImageCleanerCache();
      revokeAllAzureAudioUrls();
      revokeAllPodcastAudioUrls();
    }

    const fullKit = kits.find(k => k.id === kit.id);
    const bestKit = (fullKit && (fullKit.questions?.length || 0) > (kit.questions?.length || 0)) ? fullKit : kit;
    const strippedBest = stripAssetDataUrlsFromKit(bestKit);
    setCurrentKit(strippedBest);
    safeLocalStorageSetItem(STORAGE_CURRENT_KIT_KEY, bestKit.id);

    // Mover siempre el kit seleccionado al principio de la lista
    setKits(prev => {
      const activeIdx = prev.findIndex(k => k.id === bestKit.id);
      if (activeIdx <= 0) return prev;
      const target = prev[activeIdx];
      const reordered = [target, ...prev.filter((_, i) => i !== activeIdx)];
      return reordered;
    });

    if (pushToHistory && currentKit?.id !== bestKit.id) {
      window.history.pushState({
        mode: currentMode,
        kitId: bestKit.id,
        modal: null,
      }, '');
    }
  };

  const handleKitCreated = (newKit: StudyKit) => {
    const kitWithTime: StudyKit = {
      ...newKit,
      updatedAt: Date.now(),
    };
    const strippedKit = stripAssetDataUrlsFromKit(kitWithTime);
    const updated = [strippedKit, ...kits.filter(k => k.id !== kitWithTime.id)];
    setKits(updated);
    setCurrentKit(strippedKit);
    safeLocalStorageSetItem(STORAGE_CURRENT_KIT_KEY, kitWithTime.id);
    try {
      authService.saveUserKits(currentUser ? currentUser.id : null, updated);
      authService.saveUserKitsAsync(currentUser ? currentUser.id : null, updated).catch(() => {});
    } catch (e) {
      console.error('Error al guardar Study Kits:', e);
    }
    if (currentUser) {
      googleDriveService.pushKitImmediately(currentUser.id, kitWithTime, updated).catch((err) => {
        console.warn('[App] Error en pushKitImmediately:', err);
      });
    }
    handleSelectMode('smart-study', true);
  };

  const handleUpdateKit = (updatedKit: StudyKit) => {
    const kitWithTime: StudyKit = {
      ...updatedKit,
      updatedAt: Date.now(),
    };
    const strippedKit = stripAssetDataUrlsFromKit(kitWithTime);
    setCurrentKit(strippedKit);
    try {
      safeLocalStorageSetItem(STORAGE_CURRENT_KIT_KEY, kitWithTime.id);
    } catch {}

    // Actualizar kit en la colección sin reordenar innecesariamente si ya es el kit activo
    let updated: StudyKit[];
    if (kits.length > 0 && kits[0].id === kitWithTime.id) {
      updated = [strippedKit, ...kits.slice(1)];
    } else {
      const rest = kits.filter(k => k.id !== kitWithTime.id);
      updated = [strippedKit, ...rest];
    }
    setKits(updated);

    const userId = currentUser ? currentUser.id : null;
    try {
      authService.saveUserKits(userId, updated);
    } catch (e) {
      console.error('Error al persistir Study Kits tras actualizar:', e);
    }

    try {
      if (userId) {
        googleDriveService.scheduleAutoSync(userId, updated, 7000);
      }
    } catch (e) {
      console.error('Error al programar sincronización de Study Kits tras actualizar:', e);
    }
  };

  const handleDeleteKit = (kitId: string) => {
    recordDeletedKitId(kitId);
    authService.removeFlashcardProgress(currentUser ? currentUser.id : null, kitId);
    const updated = kits.filter(k => k.id !== kitId);
    setKits(updated);
    try {
      authService.saveUserKits(currentUser ? currentUser.id : null, updated);
      authService.saveUserKitsAsync(currentUser ? currentUser.id : null, updated).catch(() => {});
    } catch (e) {
      console.error('Error al guardar Study Kits tras eliminar:', e);
    }
    if (currentUser) {
      googleDriveService.pushToDrive(currentUser.id, updated).catch(() => {});
    }
    if (currentKit?.id === kitId) {
      if (updated.length > 0) {
        handleSelectKit(updated[0]);
      } else {
        setCurrentKit(null);
        localStorage.removeItem(STORAGE_CURRENT_KIT_KEY);
        setCurrentMode('home');
      }
    }
  };

  const handleDeleteKitsBatch = (kitIds: string[]) => {
    recordDeletedKitIds(kitIds);
    const idSet = new Set(kitIds);
    const updated = kits.filter(k => !idSet.has(k.id));
    setKits(updated);
    try {
      authService.saveUserKits(currentUser ? currentUser.id : null, updated);
      authService.saveUserKitsAsync(currentUser ? currentUser.id : null, updated).catch(() => {});
    } catch (e) {
      console.error('Error al guardar Study Kits tras eliminar en lote:', e);
    }
    if (currentUser) {
      googleDriveService.pushToDrive(currentUser.id, updated).catch(() => {});
    }
    if (currentKit && idSet.has(currentKit.id)) {
      if (updated.length > 0) {
        handleSelectKit(updated[0]);
      } else {
        setCurrentKit(null);
        localStorage.removeItem(STORAGE_CURRENT_KIT_KEY);
        setCurrentMode('home');
      }
    }
  };

  const handleChangeCategoryBatch = (kitIds: string[], newCategory: string) => {
    const idSet = new Set(kitIds);
    const now = Date.now();
    const updated = kits.map(k => {
      if (idSet.has(k.id)) {
        return { ...k, category: newCategory, updatedAt: now };
      }
      return k;
    });
    setKits(updated);
    if (currentKit && idSet.has(currentKit.id)) {
      setCurrentKit(prev => (prev ? { ...prev, category: newCategory, updatedAt: now } : prev));
    }
    try {
      authService.saveUserKits(currentUser ? currentUser.id : null, updated);
      authService.saveUserKitsAsync(currentUser ? currentUser.id : null, updated).catch(() => {});
    } catch (e) {
      console.error('Error al guardar Study Kits tras cambiar materia en lote:', e);
    }
  };

  // Whether to show the full navbar with mode tabs (hide on home & create, or when no kit exists)
  const showModeTabs = currentMode !== 'home' && currentMode !== 'create' && currentKit !== null;

  // Study modes designed to fit 100% within the viewport height without outer page scroll
  const isScreenFittingMode = currentMode === 'podcast' || currentMode === 'ask-thea' || currentMode === 'oral-lesson' || currentMode === 'flashcards';

  return (
    <div className={`min-h-screen bg-thea-bg flex flex-col selection:bg-violet-600 selection:text-white ${
      theme === 'dark' ? 'text-slate-100' : 'text-zinc-950'
    } ${
      isScreenFittingMode ? 'h-screen max-h-screen overflow-hidden' : ''
    }`}>
      {/* Navigation */}
      <Navbar
        kits={kits}
        currentKit={currentKit}
        onSelectKit={handleSelectKit}
        currentMode={currentMode}
        onSelectMode={handleSelectMode}
        onOpenAISettings={handleOpenAIModal}
        onOpenGoogleDrive={handleOpenGoogleDriveModal}
        showModeTabs={showModeTabs}
        currentUser={currentUser}
        onOpenAuth={handleOpenAuthModal}
        onLogout={handleLogout}
      />


      {/* Reconnect Google Drive Discrete Banner */}
      {currentUser && driveNeedsReauth && (

        <div className="bg-amber-950/80 border-b border-amber-500/40 px-4 py-2.5 text-xs text-amber-200 flex items-center justify-between gap-3 animate-fadeIn shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Tu cuenta de Google Drive requiere renovar autorización para mantener la sincronización activa.</span>
          </div>
          <button
            type="button"
            onClick={handleReconnectDrive}
            className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shrink-0 cursor-pointer shadow-sm transition-all active:scale-95"
          >
            Reconectar en 1 clic
          </button>
        </div>
      )}

      {/* Main Mode View */}
      <main className={`flex-1 ${isScreenFittingMode ? 'min-h-0 overflow-hidden flex flex-col p-0' : 'pb-24 md:pb-8'}`}>
        <ViewErrorBoundary onReset={() => setCurrentMode('home')}>
        {currentMode === 'home' && (
          <HomeView
            kits={kits}
            currentKit={currentKit}
            onSelectKit={handleSelectKit}
            onNavigate={handleNavigate}
            onDeleteKit={handleDeleteKit}
            onUpdateKit={handleUpdateKit}
            onDeleteKitsBatch={handleDeleteKitsBatch}
            onChangeCategoryBatch={handleChangeCategoryBatch}
            userId={currentUser?.id || authService.getCurrentUser()?.id || null}
            onOpenAISettings={handleOpenAIModal}
            onOpenAuth={handleOpenAuthModal}
          />
        )}
        {currentMode === 'create' && (
          <React.Suspense fallback={<ViewLoadingFallback />}>
            <CreateStudyKitView
              onKitCreated={handleKitCreated}
              initialTab={createInitialTab}
              onOpenAISettings={handleOpenAIModal}
              userId={currentUser?.id || authService.getCurrentUser()?.id || null}
            />
          </React.Suspense>
        )}

        {currentKit ? (
          <React.Suspense fallback={<ViewLoadingFallback />}>
            {currentMode === 'smart-study' && (
              <SmartStudyView
                key={currentKit.id}
                kit={currentKit}
                userId={currentUser?.id || authService.getCurrentUser()?.id || null}
                onUpdateKit={handleUpdateKit}
                onNavigate={handleNavigate}
              />
            )}
            {currentMode === 'study-guide' && (
              <StudyGuideView key={currentKit.id} kit={currentKit} onUpdateKit={handleUpdateKit} />
            )}
            {currentMode === 'images' && (
              <ImagesGalleryView key={currentKit.id} kit={currentKit} onUpdateKit={handleUpdateKit} />
            )}
            {currentMode === 'podcast' && (
              <PodcastView key={currentKit.id} kit={currentKit} onUpdateKit={handleUpdateKit} />
            )}
            {currentMode === 'ask-thea' && (
              <AskTheaView
                key={currentKit.id}
                kit={currentKit}
                onOpenAISettings={handleOpenAIModal}
                onNavigateToOral={() => setCurrentMode('oral-lesson')}
              />
            )}
            {currentMode === 'oral-lesson' && (
              <OralLessonView
                key={currentKit.id}
                kit={currentKit}
                onOpenAISettings={handleOpenAIModal}
                onNavigateToChat={() => setCurrentMode('ask-thea')}
              />
            )}
            {currentMode === 'tests' && <PracticeTestView key={currentKit.id} kit={currentKit} />}
            {currentMode === 'flashcards' && (
              <FlashcardsView
                key={currentKit.id}
                kit={currentKit}
                userId={currentUser?.id || authService.getCurrentUser()?.id || null}
                onUpdateKit={handleUpdateKit}
              />
            )}
            {currentMode === 'analytics' && (
              <AnalyticsView
                currentKit={currentKit}
                kits={kits}
                onSelectKit={handleSelectKit}
                userId={currentUser?.id || authService.getCurrentUser()?.id || null}
                onNavigateToSmartStudy={(kit) => {
                  handleSelectKit(kit);
                  handleSelectMode('smart-study', true);
                }}
              />
            )}
          </React.Suspense>
        ) : (
          currentMode !== 'home' && currentMode !== 'create' && (
            <div className="max-w-md mx-auto px-6 py-24 text-center animate-fadeIn">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
                <BookOpen className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">No hay ningún Study Kit activo</h3>
              <p className="text-sm text-slate-400 mb-6">
                No tienes ningún kit de estudio seleccionado. Crea un nuevo Study Kit o regresa al inicio para comenzar.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => setCurrentMode('create')}
                  className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-all cursor-pointer shadow-lg shadow-violet-900/30 active:scale-95"
                >
                  Crear Study Kit
                </button>
                <button
                  onClick={() => setCurrentMode('home')}
                  className="px-5 py-2.5 rounded-xl bg-thea-surface border border-thea-border text-slate-300 hover:text-white text-sm font-semibold transition-all cursor-pointer active:scale-95"
                >
                  Volver al Inicio
                </button>
                <button
                  onClick={() => setCurrentMode('home')}
                  className="px-5 py-2.5 rounded-xl bg-thea-surface border border-thea-border text-slate-300 hover:text-white text-sm font-semibold transition-all cursor-pointer"
                >
                  Ir al Inicio
                </button>
              </div>
            </div>
          )
        )}
        </ViewErrorBoundary>
      </main>

      {/* AI / Ollama Engine Settings Modal */}
      {showAIModal && (
        <React.Suspense fallback={null}>
          <AISettingsModal
            isOpen={showAIModal}
            onClose={handleCloseAIModal}
          />
        </React.Suspense>
      )}

      {/* User Login & Registration Modal */}
      {showAuthModal && (
        <React.Suspense fallback={null}>
          <AuthModal
            isOpen={showAuthModal}
            onClose={handleCloseAuthModal}
            onAuthSuccess={handleAuthSuccess}
            onOpenGoogleDriveSetup={handleOpenGoogleDriveModal}
          />
        </React.Suspense>
      )}

      {/* Google Drive Cloud Sync Modal */}
      {showGoogleDriveModal && (
        <React.Suspense fallback={null}>
          <GoogleDriveModal
            isOpen={showGoogleDriveModal}
            onClose={handleCloseGoogleDriveModal}
            currentUser={currentUser}
            kits={kits}
            onAuthSuccess={handleAuthSuccess}
            onKitsSynced={(syncedKits) => {
              const clean = syncedKits.filter(k => !isCorruptedKit(k));
              if (clean.length > 0) {
                setKits(prev => mergeKitsByUpdatedAt(prev, clean));
                setCurrentKit(prev => {
                  if (!prev) return clean[0];
                  const match = clean.find(k => k.id === prev.id);
                  return match ? mergeKitsByUpdatedAt([prev], [match])[0] : clean[0];
                });
              }
            }}
            onLogout={handleLogout}
          />
        </React.Suspense>
      )}

      {/* Footer (hidden on small screens to prioritize clean mobile viewport) */}
      <footer className="hidden md:block py-6 border-t border-thea-border text-center text-xs text-slate-500">
        <p>
          {theme === 'kitty' ? 'Kitty Study' : 'Contrareloj Study'} • Plataforma de Aprendizaje Adaptativo con Inteligencia Pedagógica y RAG
        </p>
      </footer>

      {/* Mobile Bottom Navigation Bar (Thumb ergonomic) */}
      <MobileBottomNav
        currentMode={currentMode}
        onSelectMode={(mode) => handleNavigate(mode)}
        onOpenAISettings={handleOpenAIModal}
        onOpenAuth={handleOpenAuthModal}
        onOpenGoogleDrive={handleOpenGoogleDriveModal}
        currentUser={currentUser}
        currentKit={currentKit}
      />
    </div>
  );
};

export default App;
