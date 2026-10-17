import React, { useState, useEffect, useRef } from 'react';
import type { StudyKit, StudyMode, DeveloperSettings, User } from './types';
import { BookOpen, AlertCircle } from 'lucide-react';
import { authService } from './services/authService';
import { hydrateKitAssets } from './services/storageService';
import { googleDriveService, type DriveSyncState } from './services/googleDriveService';
import { resetAISettingsToDefault, saveAISettings, getAISettings } from './services/aiService';
import { Navbar } from './components/Navbar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { HomeView } from './components/HomeView';
import type { InputTab } from './components/CreateStudyKitView';

// Carga diferida (Lazy Loading) de vistas secundarias para arranque ultrarrápido
const SmartStudyView = React.lazy(() => import('./components/SmartStudyView').then(m => ({ default: m.SmartStudyView })));
const StudyGuideView = React.lazy(() => import('./components/StudyGuideView').then(m => ({ default: m.StudyGuideView })));
const ImagesGalleryView = React.lazy(() => import('./components/ImagesGalleryView').then(m => ({ default: m.ImagesGalleryView })));
const PodcastView = React.lazy(() => import('./components/PodcastView').then(m => ({ default: m.PodcastView })));
const AskTheaView = React.lazy(() => import('./components/AskTheaView').then(m => ({ default: m.AskTheaView })));
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

const STORAGE_CURRENT_KIT_KEY = 'thea_currentkit_id';

function isCorruptedKit(k: unknown): boolean {
  if (!k || typeof k !== 'object') return true;
  const kit = k as Partial<StudyKit>;
  if (!kit.id || typeof kit.id !== 'string') return true;
  if (!kit.title || typeof kit.title !== 'string') return true;
  if (!Array.isArray(kit.questions)) return true;
  if (kit.id.includes('digitallibrary.un.org') || kit.title.toLowerCase().includes('endstream')) {
    return true;
  }
  return false;
}

export const App: React.FC = () => {
  // User Authentication State
  const [currentUser, setCurrentUser] = useState<User | null>(() => authService.getCurrentUser());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showGoogleDriveModal, setShowGoogleDriveModal] = useState(false);
  const [driveSyncState, setDriveSyncState] = useState<DriveSyncState>(() => googleDriveService.getState());
  const isLoggingOutRef = useRef(false);

  useEffect(() => {
    const unsubscribe = googleDriveService.subscribe((state) => {
      setDriveSyncState(state);
    });
    return unsubscribe;
  }, []);

  // Restauración de sesión persistente triple (IndexedDB / Cookie 1 año / LocalStorage)
  useEffect(() => {
    authService.restorePersistentSession().then((restoredUser) => {
      if (restoredUser && !currentUser) {
        setCurrentUser(restoredUser);
        const userKits = authService.getUserKits(restoredUser.id);
        const cleanKits = userKits.filter(k => !isCorruptedKit(k));
        setKits(cleanKits);
        if (cleanKits.length > 0 && !currentKit) {
          setCurrentKit(cleanKits[0]);
        }
      }
    });
  }, []);

  // Load kits from authService: si no hay usuario autenticado, inicia completamente vacío
  const [kits, setKits] = useState<StudyKit[]>(() => {
    if (!currentUser) return [];
    const userKits = authService.getUserKits(currentUser.id);
    const cleanKits = userKits.filter(k => !isCorruptedKit(k));
    return cleanKits;
  });

  // Load current kit from LocalStorage or pick first clean kit
  const [currentKit, setCurrentKit] = useState<StudyKit | null>(() => {
    const savedCurrentId = localStorage.getItem(STORAGE_CURRENT_KIT_KEY);
    if (savedCurrentId) {
      const found = kits.find(k => k.id === savedCurrentId && !isCorruptedKit(k));
      if (found) return found;
    }
    const cleanFirst = kits.find(k => !isCorruptedKit(k));
    if (cleanFirst) {
      localStorage.setItem(STORAGE_CURRENT_KIT_KEY, cleanFirst.id);
      return cleanFirst;
    }
    return null;
  });

  const [currentMode, setCurrentMode] = useState<StudyMode>('home');
  const [createInitialTab, setCreateInitialTab] = useState<InputTab>('topic');
  const [showAIModal, setShowAIModal] = useState(false);

  const handleNavigate = (mode: StudyMode, initialTab?: InputTab) => {
    if (initialTab) {
      setCreateInitialTab(initialTab);
    }
    handleSelectMode(mode);
  };

  const handleSelectMode = (mode: StudyMode) => {
    if (mode === 'images' && currentKit) {
      const hasMissing =
        currentKit.assets?.some(a => !a.dataUrl) ||
        currentKit.questions?.some(q => q.sourceAsset && !q.sourceAsset.dataUrl);

      if (hasMissing) {
        hydrateKitAssets(currentKit)
          .then(hydrated => {
            setCurrentKit(hydrated);
            setKits(prev => prev.map(k => (k.id === hydrated.id ? hydrated : k)));
          })
          .catch(() => {});
      }
    }
    setCurrentMode(mode);
  };

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
    localStorage.setItem('thea_developersettings', JSON.stringify(permanentSettings));
  }, []);

  // Sync Study Kits for current user (protegido contra sobreescritura al cerrar sesión)
  useEffect(() => {
    if (isLoggingOutRef.current) return;
    if (!currentUser) return;
    try {
      authService.saveUserKits(currentUser.id, kits);
    } catch (e) {
      console.error('Error al guardar Study Kits:', e);
    }
  }, [kits, currentUser]);

  // Sincronización automática al inicio desde Google Drive (con renovación silenciosa si es necesario)
  useEffect(() => {
    if (!currentUser) return;
    if (googleDriveService.isLinked() || googleDriveService.getValidAccessToken()) {
      googleDriveService.autoSyncOnStartup(currentUser.id).then((pulled) => {
        if (pulled && Array.isArray(pulled) && pulled.length > 0) {
          const clean = pulled.filter(k => !isCorruptedKit(k));
          if (clean.length > 0) {
            setKits(clean);
            if (!currentKit) setCurrentKit(clean[0]);
          }
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('thea_ai_settings_changed'));
        }
      }).catch(err => {
        console.warn('[App] Error al sincronizar inicio desde Google Drive:', err);
      });
    }
  }, [currentUser?.id]);

  // Respaldo en segundo plano hacia Google Drive con debounce de 800ms
  useEffect(() => {
    if (isLoggingOutRef.current) return;
    if (!currentUser || !googleDriveService.getValidAccessToken()) return;
    const timer = setTimeout(() => {
      googleDriveService.pushToDrive(currentUser.id, kits).catch((err) => {
        console.warn('[App] Error en sincronización en segundo plano con Google Drive:', err);
      });
    }, 800);

    return () => clearTimeout(timer);
  }, [kits, currentUser]);

  // Respaldo en segundo plano del progreso de Smart Study hacia Google Drive en tiempo real
  useEffect(() => {
    if (!currentUser) return;
    let debounceTimer: any = null;

    const handleSessionSaved = () => {
      if (isLoggingOutRef.current) return;
      if (!googleDriveService.getValidAccessToken()) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        googleDriveService.pushProgressToDrive(currentUser.id).catch((err) => {
          console.warn('[App] Error al sincronizar progreso de Smart Study en Google Drive:', err);
        });
      }, 2500);
    };

    window.addEventListener('thea_session_saved', handleSessionSaved);
    return () => {
      clearTimeout(debounceTimer);
      window.removeEventListener('thea_session_saved', handleSessionSaved);
    };
  }, [currentUser]);

  // Sync Current Kit ID to LocalStorage
  useEffect(() => {
    if (currentKit && !isCorruptedKit(currentKit)) {
      localStorage.setItem(STORAGE_CURRENT_KIT_KEY, currentKit.id);
    } else if (!currentKit) {
      localStorage.removeItem(STORAGE_CURRENT_KIT_KEY);
    }
  }, [currentKit]);

  // Hidratar activos desde IndexedDB si algun dataUrl fue aligerado de LocalStorage o descargado desde Drive
  useEffect(() => {
    const checkAndHydrate = (kitToHydrate: StudyKit | null) => {
      if (!kitToHydrate) return;
      const hasStrippedAssets =
        kitToHydrate.assets?.some(a => !a.dataUrl) ||
        kitToHydrate.questions?.some(q => q.sourceAsset && !q.sourceAsset.dataUrl);

      if (hasStrippedAssets) {
        hydrateKitAssets(kitToHydrate)
          .then(hydrated => {
            setCurrentKit(hydrated);
            setKits(prev => prev.map(k => (k.id === hydrated.id ? hydrated : k)));
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
        localStorage.setItem(STORAGE_CURRENT_KIT_KEY, clean.id);
      } else {
        setCurrentKit(null);
        localStorage.removeItem(STORAGE_CURRENT_KIT_KEY);
      }
    }
  }, [currentKit, kits]);

  const handleAuthSuccess = (user: User, syncedKits?: StudyKit[] | null) => {
    isLoggingOutRef.current = false;
    setCurrentUser(user);

    // 1. Restaurar ajustes de IA asociados a esta cuenta
    const userAISettings = authService.getUserAISettings(user.id);
    const currentSettings = getAISettings();
    if (userAISettings && userAISettings.apiKey && userAISettings.apiKey.trim().length > 0) {
      saveAISettings(userAISettings);
    } else if (currentSettings.apiKey && currentSettings.apiKey.trim().length > 0) {
      authService.saveUserAISettings(user.id, currentSettings);
    }

    // 2. Si ya vinieron kits sincronizados directamente de Google Drive (login con Google)
    if (syncedKits && Array.isArray(syncedKits) && syncedKits.length > 0) {
      const cleanPulled = syncedKits.filter(k => !isCorruptedKit(k));
      if (cleanPulled.length > 0) {
        setKits(cleanPulled);
        authService.saveUserKits(user.id, cleanPulled);
        const firstPulled = cleanPulled[0] || null;
        setCurrentKit(firstPulled);
        if (firstPulled) {
          localStorage.setItem(STORAGE_CURRENT_KIT_KEY, firstPulled.id);
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('thea_ai_settings_changed'));
        }
        return;
      }
    }

    // 3. Restaurar kits del usuario guardados localmente
    const userKits = authService.getUserKits(user.id);
    const clean = userKits.filter(k => !isCorruptedKit(k));
    setKits(clean);
    const first = clean[0] || null;
    setCurrentKit(first);
    if (first) {
      localStorage.setItem(STORAGE_CURRENT_KIT_KEY, first.id);
    } else {
      localStorage.removeItem(STORAGE_CURRENT_KIT_KEY);
    }

    // 4. Sincronizar con Google Drive para recuperar todo el progreso en la nube
    if (googleDriveService.isLinked() || googleDriveService.getValidAccessToken()) {
      googleDriveService.autoSyncOnStartup(user.id).then((pulled) => {
        if (pulled && Array.isArray(pulled) && pulled.length > 0) {
          const cleanPulled = pulled.filter(k => !isCorruptedKit(k));
          if (cleanPulled.length > 0) {
            setKits(cleanPulled);
            const firstPulled = cleanPulled[0] || null;
            setCurrentKit(firstPulled);
            if (firstPulled) {
              localStorage.setItem(STORAGE_CURRENT_KIT_KEY, firstPulled.id);
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
      const res = await googleDriveService.loginAndSync();
      if (res.kits) {
        const clean = res.kits.filter(k => !isCorruptedKit(k));
        if (clean.length > 0) {
          setKits(clean);
          if (!currentKit) setCurrentKit(clean[0]);
        }
      }
    } catch (err) {
      console.error('Error al reconectar Google Drive:', err);
    }
  };

  const handleLogout = () => {
    isLoggingOutRef.current = true;
    try {
      googleDriveService.disconnect();
      authService.logout();
      resetAISettingsToDefault();
      setCurrentUser(null);
      setKits([]);
      setCurrentKit(null);
      localStorage.removeItem(STORAGE_CURRENT_KIT_KEY);
      localStorage.setItem('thea_guest_kits', JSON.stringify([]));
      localStorage.removeItem('thea_study_kits_v2');
      setCurrentMode('home');
    } finally {
      setTimeout(() => {
        isLoggingOutRef.current = false;
      }, 400);
    }
  };

  const handleSelectKit = (kit: StudyKit) => {
    if (!kit || isCorruptedKit(kit)) return;
    setCurrentKit(kit);
    localStorage.setItem(STORAGE_CURRENT_KIT_KEY, kit.id);
  };

  const handleKitCreated = (newKit: StudyKit) => {
    const updated = [newKit, ...kits.filter(k => k.id !== newKit.id)];
    setKits(updated);
    setCurrentKit(newKit);
    localStorage.setItem(STORAGE_CURRENT_KIT_KEY, newKit.id);
    try {
      authService.saveUserKits(currentUser ? currentUser.id : null, updated);
    } catch (e) {
      console.error('Error al guardar Study Kits:', e);
    }
    if (currentUser) {
      googleDriveService.pushKitImmediately(currentUser.id, newKit, updated).catch((err) => {
        console.warn('[App] Error en pushKitImmediately:', err);
      });
    }
    setCurrentMode('smart-study');
  };

  const handleUpdateKit = (updatedKit: StudyKit) => {
    setCurrentKit(updatedKit);
    setKits(prev => {
      const next = prev.map(k => (k.id === updatedKit.id ? updatedKit : k));
      try {
        authService.saveUserKits(currentUser ? currentUser.id : null, next);
      } catch (e) {
        console.error('Error al guardar Study Kits tras actualizar:', e);
      }
      return next;
    });
  };

  const handleDeleteKit = (kitId: string) => {
    const updated = kits.filter(k => k.id !== kitId);
    setKits(updated);
    try {
      authService.saveUserKits(currentUser ? currentUser.id : null, updated);
    } catch (e) {
      console.error('Error al guardar Study Kits tras eliminar:', e);
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
    const idSet = new Set(kitIds);
    const updated = kits.filter(k => !idSet.has(k.id));
    setKits(updated);
    try {
      authService.saveUserKits(currentUser ? currentUser.id : null, updated);
    } catch (e) {
      console.error('Error al guardar Study Kits tras eliminar en lote:', e);
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
    const updated = kits.map(k => {
      if (idSet.has(k.id)) {
        return { ...k, category: newCategory };
      }
      return k;
    });
    setKits(updated);
    if (currentKit && idSet.has(currentKit.id)) {
      setCurrentKit(prev => (prev ? { ...prev, category: newCategory } : prev));
    }
    try {
      authService.saveUserKits(currentUser ? currentUser.id : null, updated);
    } catch (e) {
      console.error('Error al guardar Study Kits tras cambiar materia en lote:', e);
    }
  };

  // Whether to show the full navbar with mode tabs (hide on home & create, or when no kit exists)
  const showModeTabs = currentMode !== 'home' && currentMode !== 'create' && currentKit !== null;

  return (
    <div className="min-h-screen bg-thea-bg text-slate-100 flex flex-col selection:bg-violet-600 selection:text-white">
      {/* Navigation */}
      <Navbar
        kits={kits}
        currentKit={currentKit}
        onSelectKit={handleSelectKit}
        currentMode={currentMode}
        onSelectMode={handleSelectMode}
        onOpenAISettings={() => setShowAIModal(true)}
        onOpenGoogleDrive={() => setShowGoogleDriveModal(true)}
        showModeTabs={showModeTabs}
        currentUser={currentUser}
        onOpenAuth={() => setShowAuthModal(true)}
        onLogout={handleLogout}
      />

      {/* Reconnect Google Drive Discrete Banner */}
      {currentUser && driveSyncState.status === 'needs_reauth' && (
        <div className="bg-amber-950/80 border-b border-amber-500/40 px-4 py-2.5 text-xs text-amber-200 flex items-center justify-between gap-3 animate-fadeIn">
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
      <main className="flex-1 pb-24 md:pb-8">
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
            userId={currentUser?.id || null}
            onOpenAISettings={() => setShowAIModal(true)}
            onOpenAuth={() => setShowAuthModal(true)}
          />
        )}
        {currentMode === 'create' && (
          <React.Suspense fallback={<ViewLoadingFallback />}>
            <CreateStudyKitView
              onKitCreated={handleKitCreated}
              initialTab={createInitialTab}
              onOpenAISettings={() => setShowAIModal(true)}
            />
          </React.Suspense>
        )}

        {currentKit ? (
          <React.Suspense fallback={<ViewLoadingFallback />}>
            {currentMode === 'smart-study' && (
              <SmartStudyView
                key={currentKit.id}
                kit={currentKit}
                userId={currentUser?.id || null}
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
            {currentMode === 'ask-thea' && <AskTheaView key={currentKit.id} kit={currentKit} />}
            {currentMode === 'tests' && <PracticeTestView key={currentKit.id} kit={currentKit} />}
            {currentMode === 'flashcards' && (
              <FlashcardsView key={currentKit.id} kit={currentKit} onUpdateKit={handleUpdateKit} />
            )}
            {currentMode === 'analytics' && (
              <AnalyticsView
                currentKit={currentKit}
                kits={kits}
                onSelectKit={handleSelectKit}
                userId={currentUser?.id || null}
                onNavigateToSmartStudy={(kit) => {
                  handleSelectKit(kit);
                  setCurrentMode('smart-study');
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
                Todos los kits han sido eliminados. Crea un nuevo kit para acceder a las herramientas de estudio.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => setCurrentMode('create')}
                  className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-all cursor-pointer shadow-lg shadow-violet-900/30"
                >
                  Crear Study Kit
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
      </main>

      {/* AI / Ollama Engine Settings Modal */}
      {showAIModal && (
        <React.Suspense fallback={null}>
          <AISettingsModal
            isOpen={showAIModal}
            onClose={() => setShowAIModal(false)}
          />
        </React.Suspense>
      )}

      {/* User Login & Registration Modal */}
      {showAuthModal && (
        <React.Suspense fallback={null}>
          <AuthModal
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onAuthSuccess={handleAuthSuccess}
            onOpenGoogleDriveSetup={() => setShowGoogleDriveModal(true)}
          />
        </React.Suspense>
      )}

      {/* Google Drive Cloud Sync Modal */}
      {showGoogleDriveModal && (
        <React.Suspense fallback={null}>
          <GoogleDriveModal
            isOpen={showGoogleDriveModal}
            onClose={() => setShowGoogleDriveModal(false)}
            currentUser={currentUser}
            kits={kits}
            onAuthSuccess={handleAuthSuccess}
            onKitsSynced={(syncedKits) => {
              const clean = syncedKits.filter(k => !isCorruptedKit(k));
              if (clean.length > 0) {
                setKits(clean);
                setCurrentKit(clean[0]);
              }
            }}
            onLogout={handleLogout}
          />
        </React.Suspense>
      )}

      {/* Footer (hidden on small screens to prioritize clean mobile viewport) */}
      <footer className="hidden md:block py-6 border-t border-thea-border text-center text-xs text-slate-500">
        <p>
          Contrareloj Study • Plataforma de Aprendizaje Adaptativo con Inteligencia Pedagógica y RAG
        </p>
      </footer>

      {/* Mobile Bottom Navigation Bar (Thumb ergonomic) */}
      <MobileBottomNav
        currentMode={currentMode}
        onSelectMode={(mode) => handleNavigate(mode)}
        onOpenAISettings={() => setShowAIModal(true)}
        onOpenAuth={() => setShowAuthModal(true)}
        onOpenGoogleDrive={() => setShowGoogleDriveModal(true)}
        currentUser={currentUser}
        currentKit={currentKit}
      />
    </div>
  );
};

export default App;
