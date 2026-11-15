import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { StudyKit, DocumentAsset } from '../types';
import {
  Image as ImageIcon,
  ZoomIn,
  Table as TableIcon,
  Loader2,
  RefreshCw,
  Trash2,
  Filter,
  Eye,
  CheckCircle2
} from 'lucide-react';
import { GeminiIcon } from './GeminiIcon';
import { ImageZoomModal } from './ImageZoomModal';
import { getAssetsMap, getAssetById, saveAssetsToIndexedDB } from '../services/storageService';
import { googleDriveService } from '../services/googleDriveService';
import { useTheme } from '../services/themeService';
import { cleanImageBlackBackground } from '../utils/imageCleaner';
import {
  classifyDocumentAsset,
  type ImageClassificationResult
} from '../utils/imageClassifier';

interface ImagesGalleryViewProps {
  kit: StudyKit;
  onUpdateKit?: (updatedKit: StudyKit) => void;
}

type FilterMode = 'pedagogical' | 'all' | 'high_res';

export const ImagesGalleryView: React.FC<ImagesGalleryViewProps> = ({ kit, onUpdateKit }) => {
  const { theme } = useTheme();
  const [assets, setAssets] = useState<DocumentAsset[]>(() => kit.assets || []);
  const [selectedAsset, setSelectedAsset] = useState<DocumentAsset | null>(null);
  const [loadingAssetIds, setLoadingAssetIds] = useState<Set<string>>(new Set());
  const [isHydrating, setIsHydrating] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ completed: number; total: number } | null>(null);

  // Modo de filtrado: 'pedagogical' (default recomendado), 'all' (todo), 'high_res' (≥400px)
  const [filterMode, setFilterMode] = useState<FilterMode>('pedagogical');
  const [classificationMap, setClassificationMap] = useState<Map<string, ImageClassificationResult>>(new Map());
  const [notification, setNotification] = useState<string | null>(null);

  // Paginación eficiente para mantener el uso de memoria bajo control (máximo 12 imágenes en DOM a la vez)
  const PAGE_SIZE = 12;
  const [currentPage, setCurrentPage] = useState(1);
  const prevKitIdRef = useRef(kit.id);

  // Mantener activos sincronizados preservando estrictamente las dataUrl ya cargadas en memoria
  useEffect(() => {
    const isNewKit = kit.id !== prevKitIdRef.current;
    prevKitIdRef.current = kit.id;

    if (isNewKit) {
      setAssets(kit.assets || []);
      setCurrentPage(1);
    } else {
      // Mismo kit: actualización (ej. tras depurar elementos de diseño o eliminar).
      // PRESERVAR rigurosamente las dataUrl hidratadas en RAM para evitar que vuelvan a 'Sin previsualización'
      setAssets(prev => {
        const incoming = kit.assets || [];
        const prevMap = new Map(prev.map(a => [a.id, a]));
        return incoming.map(inc => {
          const existing = prevMap.get(inc.id);
          if (existing?.dataUrl && !inc.dataUrl) {
            return { ...inc, dataUrl: existing.dataUrl };
          }
          return inc;
        });
      });
      // Asegurarse de que la página actual no desborde si el número total se redujo
      setCurrentPage(prevPage => {
        const total = Math.max(1, Math.ceil((kit.assets?.length || 0) / PAGE_SIZE));
        return prevPage > total ? total : prevPage;
      });
    }
  }, [kit.id, kit.assets]);

  // Clasificación continua y asíncrona de activos documentales (detectar fondos planos, banners y logos de licencia)
  useEffect(() => {
    let isMounted = true;

    const runClassification = async () => {
      let hasUpdates = false;
      const nextMap = new Map(classificationMap);

      for (const asset of assets) {
        const existing = nextMap.get(asset.id);
        if (!existing || existing.pending) {
          const res = await classifyDocumentAsset(asset);
          if (!isMounted) return;
          if (!res.pending || !existing) {
            nextMap.set(asset.id, res);
            hasUpdates = true;
          }
        }
      }

      if (isMounted && hasUpdates) {
        setClassificationMap(nextMap);
      }
    };

    runClassification();

    return () => {
      isMounted = false;
    };
  }, [assets]);

  // Cantidad de elementos de diseño/plantilla clasificados
  const decorativeCount = useMemo(() => {
    return assets.filter(a => {
      const info = classificationMap.get(a.id);
      return a.isDecorative === true || info?.isDecorative === true;
    }).length;
  }, [assets, classificationMap]);

  // Activos resultantes según el filtro activo
  const filteredAssets = useMemo(() => {
    if (filterMode === 'all') return assets;

    return assets.filter(a => {
      const info = classificationMap.get(a.id);
      const isDecorative = a.isDecorative === true || info?.isDecorative === true;

      if (filterMode === 'pedagogical') {
        return !isDecorative;
      }

      if (filterMode === 'high_res') {
        const w = a.width || info?.width || 0;
        const h = a.height || info?.height || 0;
        return !isDecorative && w >= 400 && h >= 400;
      }

      return true;
    });
  }, [assets, classificationMap, filterMode]);

  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / PAGE_SIZE));
  const visibleAssets = filteredAssets.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Garantizar fondo blanco puro (#ffffff) eliminando fondos negros de transparencia JPEG solo en la página visible
  useEffect(() => {
    let isMounted = true;
    const sanitize = async () => {
      let changed = false;
      const sanitizedVisible = await Promise.all(
        visibleAssets.map(async (a) => {
          if (a.dataUrl && a.dataUrl.startsWith('data:image')) {
            const cleaned = await cleanImageBlackBackground(a.dataUrl);
            if (cleaned !== a.dataUrl) {
              changed = true;
              return { ...a, dataUrl: cleaned };
            }
          }
          return a;
        })
      );
      if (isMounted && changed) {
        setAssets(prev => {
          const map = new Map(sanitizedVisible.map(a => [a.id, a]));
          return prev.map(a => map.get(a.id) || a);
        });
      }
    };
    sanitize();
    return () => {
      isMounted = false;
    };
  }, [currentPage, visibleAssets.length]);

  // Carga individual e inmediata para una imagen específica al pulsar sobre ella
  const loadSingleAsset = async (assetId: string) => {
    if (!assetId || loadingAssetIds.has(assetId)) return;

    setLoadingAssetIds(prev => new Set(prev).add(assetId));

    try {
      // 1. Consultar IndexedDB local
      const local = await getAssetById(assetId);
      if (local?.dataUrl) {
        setAssets(prev => prev.map(a => (a.id === assetId ? { ...a, dataUrl: local.dataUrl } : a)));
        return;
      }

      // 2. Descargar prioritariamente desde Google Drive con reintentos y guardar en IndexedDB
      const driveMap = await googleDriveService.prioritizeAssetsDownload([assetId]);
      if (driveMap.has(assetId)) {
        const downloaded = driveMap.get(assetId)!;
        try {
          await saveAssetsToIndexedDB([downloaded]);
        } catch {}
        setAssets(prev => prev.map(a => (a.id === assetId ? { ...a, dataUrl: downloaded.dataUrl } : a)));
        return;
      }
    } catch (err) {
      console.warn(`[ImagesGalleryView] Error al cargar activo individual ${assetId}:`, err);
    } finally {
      setLoadingAssetIds(prev => {
        const next = new Set(prev);
        next.delete(assetId);
        return next;
      });
    }
  };

  // Carga e hidratación bajo demanda exclusivamente para las imágenes de la página visible
  const loadMissingAssetsForCurrentPage = async (pageItems: DocumentAsset[] = visibleAssets) => {
    const missing = pageItems.filter(a => !a.dataUrl && a.id);
    if (missing.length === 0) return;

    const missingIds = missing.map(a => a.id);
    setLoadingAssetIds(prev => new Set([...prev, ...missingIds]));
    setIsHydrating(true);

    try {
      // 1. Consultar IndexedDB local primero
      const localMap = await getAssetsMap(missingIds);
      if (localMap.size > 0) {
        setAssets(prev =>
          prev.map(a => {
            if (!a.dataUrl && localMap.has(a.id) && localMap.get(a.id)?.dataUrl) {
              return { ...a, dataUrl: localMap.get(a.id)!.dataUrl };
            }
            return a;
          })
        );
      }

      // 2. Detectar cuáles realmente siguen sin dataUrl (no solo por estar en localMap, sino porque tengan datos binarios válidos)
      const stillMissingIds = missingIds.filter(id => !localMap.has(id) || !localMap.get(id)?.dataUrl);

      // 3. Descargar inmediatamente de Google Drive las que falten y persistir en IndexedDB
      if (stillMissingIds.length > 0) {
        setSyncProgress({ completed: 0, total: stillMissingIds.length });
        const driveMap = await googleDriveService.prioritizeAssetsDownload(
          stillMissingIds,
          (done, total) => setSyncProgress({ completed: done, total })
        );
        if (driveMap.size > 0) {
          const downloaded = Array.from(driveMap.values());
          try {
            await saveAssetsToIndexedDB(downloaded);
          } catch {}
          setAssets(prev =>
            prev.map(a => {
              if (!a.dataUrl && driveMap.has(a.id)) {
                return { ...a, dataUrl: driveMap.get(a.id)!.dataUrl };
              }
              return a;
            })
          );
        }
      }
    } catch (err) {
      console.warn('[ImagesGalleryView] Error al cargar activos de página:', err);
    } finally {
      setLoadingAssetIds(prev => {
        const next = new Set(prev);
        missingIds.forEach(id => next.delete(id));
        return next;
      });
      setIsHydrating(false);
      setSyncProgress(null);
    }
  };

  // Clave representativa de las imágenes visibles en pantalla para re-hidratación inmediata
  const visibleIdsKey = useMemo(() => visibleAssets.map(a => a.id).join(','), [visibleAssets]);

  // Ejecutar carga de imágenes al montar, cambiar kit, filtro, página o cambiar las figuras visibles
  useEffect(() => {
    loadMissingAssetsForCurrentPage(visibleAssets);
  }, [kit.id, currentPage, filterMode, visibleIdsKey]);

  // Reaccionar inmediatamente cuando la sincronización en segundo plano guarda nuevas imágenes
  useEffect(() => {
    const handleAssetsSynced = async () => {
      const missing = assets.filter(a => !a.dataUrl && a.id);
      if (missing.length === 0) return;
      const localMap = await getAssetsMap(missing.map(a => a.id));
      if (localMap.size > 0) {
        setAssets(prev =>
          prev.map(a => {
            if (!a.dataUrl && localMap.has(a.id)) {
              return { ...a, dataUrl: localMap.get(a.id)!.dataUrl };
            }
            return a;
          })
        );
      }
    };

    window.addEventListener('thea_assets_synced', handleAssetsSynced);
    return () => {
      window.removeEventListener('thea_assets_synced', handleAssetsSynced);
    };
  }, [assets]);

  // Eliminación individual de un activo del Study Kit
  const handleDeleteAsset = (assetId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated = assets.filter(a => a.id !== assetId);
    setAssets(updated);
    if (onUpdateKit) {
      onUpdateKit({
        ...kit,
        assets: updated,
      });
    }
    showNotification('Figura eliminada del material de estudio');
  };

  // Purgar permanentemente todos los adornos y elementos de plantilla detectados
  const handlePurgeDecorativeAssets = () => {
    const cleanAssets = assets.filter(a => {
      const info = classificationMap.get(a.id);
      return !(a.isDecorative === true || info?.isDecorative === true);
    });
    const purgedCount = assets.length - cleanAssets.length;
    setAssets(cleanAssets);
    if (onUpdateKit) {
      onUpdateKit({
        ...kit,
        assets: cleanAssets,
      });
    }
    showNotification(`Se purgaron ${purgedCount} imágenes de diseño del kit`);

    // Inmediatamente rehidratar los nuevos elementos que ahora ocupan la página visible
    setTimeout(() => {
      const newVisible = cleanAssets.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
      loadMissingAssetsForCurrentPage(newVisible);
    }, 50);
  };

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(prev => (prev === msg ? null : prev));
    }, 3500);
  };

  const currentIndex = selectedAsset
    ? filteredAssets.findIndex((a) => a.id === selectedAsset.id || a.dataUrl === selectedAsset.dataUrl)
    : -1;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < filteredAssets.length - 1;

  const handlePrev = () => {
    if (hasPrev) {
      setSelectedAsset(filteredAssets[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      setSelectedAsset(filteredAssets[currentIndex + 1]);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-[99999] bg-zinc-900/95 text-white border border-white/10 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 backdrop-blur-xl animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{notification}</span>
        </div>
      )}

      {/* View Header */}
      <div className={`mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b ${
        theme === 'dark' ? 'border-thea-border/60' : theme === 'kitty' ? 'border-pink-200' : 'border-slate-200'
      }`}>
        <div>
          <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${
              theme === 'kitty'
                ? 'bg-pink-100 border-pink-200 text-pink-600'
                : theme === 'light'
                ? 'bg-rose-50 border-rose-200 text-rose-600'
                : 'bg-violet-600/20 border-violet-500/40 text-violet-400'
            }`}>
              <ImageIcon className="w-5 h-5" />
            </div>
            <h1 className={`text-xl sm:text-2xl font-bold flex items-center gap-3 ${
              theme === 'dark' ? 'text-white' : 'text-zinc-950'
            }`}>
              <span>Imágenes del Documento</span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold tabular-nums border ${
                theme === 'kitty'
                  ? 'bg-pink-100 text-pink-700 border-pink-200'
                  : theme === 'light'
                  ? 'bg-slate-100 text-slate-700 border-slate-200'
                  : 'bg-violet-500/20 text-violet-300 border-violet-500/30'
              }`}>
                {filteredAssets.length} {filteredAssets.length === 1 ? 'figura' : 'figuras'}
                {decorativeCount > 0 && filterMode === 'pedagogical' && (
                  <span className="opacity-75 font-normal ml-1">({decorativeCount} de diseño ocultadas)</span>
                )}
              </span>
            </h1>

            {isHydrating && (
              <span className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold flex items-center gap-1.5 animate-pulse ${
                theme === 'dark'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-amber-100 text-amber-900 border-amber-200'
              }`}>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>
                  {syncProgress
                    ? `Restaurando imágenes (${syncProgress.completed}/${syncProgress.total})...`
                    : 'Cargando imágenes de Google Drive...'}
                </span>
              </span>
            )}
          </div>
          <p className={`text-xs sm:text-sm max-w-2xl ${
            theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
          }`}>
            Todas las figuras, diagramas, esquemas y tablas extraídos de &quot;{kit.title}&quot;.
          </p>
        </div>

        {/* Toolbar de Filtro y Limpieza */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`p-1 rounded-xl border flex items-center gap-1 ${
            theme === 'dark'
              ? 'bg-[#120d24]/90 border-white/[0.08]'
              : theme === 'kitty'
              ? 'bg-pink-50 border-pink-200'
              : 'bg-slate-100 border-slate-200'
          }`}>
            <button
              type="button"
              onClick={() => {
                setFilterMode('pedagogical');
                setCurrentPage(1);
              }}
              title="Mostrar solo diagramas y figuras pedagógicas (sin adornos ni logos)"
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-transform duration-150 cursor-pointer active:scale-95 flex items-center gap-1.5 ${
                filterMode === 'pedagogical'
                  ? theme === 'dark'
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                    : theme === 'kitty'
                    ? 'bg-pink-500 text-white shadow-md shadow-pink-500/30'
                    : 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Diagramas ({assets.length - decorativeCount})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilterMode('all');
                setCurrentPage(1);
              }}
              title="Mostrar todas las imágenes del documento incluyendo elementos de plantilla"
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-transform duration-150 cursor-pointer active:scale-95 flex items-center gap-1.5 ${
                filterMode === 'all'
                  ? theme === 'dark'
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                    : theme === 'kitty'
                    ? 'bg-pink-500 text-white shadow-md shadow-pink-500/30'
                    : 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Todas ({assets.length})</span>
            </button>
          </div>

          {/* Botón Purgar Adornos (solo visible si existen elementos decorativos) */}
          {decorativeCount > 0 && onUpdateKit && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`¿Deseas purgar permanentemente ${decorativeCount} imágenes de diseño/plantilla de este Study Kit?`)) {
                  handlePurgeDecorativeAssets();
                }
              }}
              title="Eliminar permanentemente los fondos planos, logos de licencia y banners de plantilla"
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-transform duration-150 cursor-pointer active:scale-95 flex items-center gap-1.5 border shadow-sm ${
                theme === 'dark'
                  ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
              }`}
            >
              <GeminiIcon className="w-3.5 h-3.5" variant="gradient" />
              <span>Limpiar {decorativeCount} adornos</span>
            </button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {filteredAssets.length === 0 ? (
        <div className={`max-w-xl mx-auto my-12 p-8 rounded-3xl border text-center space-y-4 shadow-xl ${
          theme === 'dark'
            ? 'bg-[#0e0b16]/95 border-white/[0.08] text-white'
            : 'thea-glass-card text-zinc-950'
        }`}>
          <div className="w-16 h-16 mx-auto rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-zinc-500">
            <ImageIcon className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white tracking-tight">
              {filterMode === 'pedagogical' && assets.length > 0
                ? 'Solo se detectaron elementos decorativos de diseño'
                : 'No hay imágenes en este kit'}
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {filterMode === 'pedagogical' && assets.length > 0
                ? 'Las imágenes extraídas corresponden a fondos planos o adornos de plantilla. Puedes pulsar "Ver todas" para examinarlas.'
                : 'Las figuras, diagramas y tablas se extraen automáticamente de archivos PDF, Word (DOCX) y presentaciones PowerPoint (PPTX) que contienen recursos visuales.'}
            </p>
          </div>
          {filterMode === 'pedagogical' && assets.length > 0 && (
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className="px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-500 transition-transform active:scale-95 cursor-pointer shadow-lg"
            >
              Mostrar todas las imágenes ({assets.length})
            </button>
          )}
        </div>
      ) : (
        /* Image Grid */
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {visibleAssets.map((asset, index) => {
              const globalIndex = ((currentPage - 1) * PAGE_SIZE) + index;
              const isImage = asset.type === 'image';
              const pageInfo = asset.pageOrSlide ? `Pág. / Diapositiva ${asset.pageOrSlide}` : `Elemento #${globalIndex + 1}`;
              const isAssetLoading = loadingAssetIds.has(asset.id);
              const classInfo = classificationMap.get(asset.id);
              const isDec = asset.isDecorative === true || classInfo?.isDecorative === true;

              return (
                <div
                  key={asset.id || `asset-${globalIndex}`}
                  onClick={() => {
                    if (asset.dataUrl) {
                      setSelectedAsset(asset);
                    } else {
                      loadSingleAsset(asset.id);
                    }
                  }}
                  className={`group relative border rounded-2xl overflow-hidden transition-[transform,border-color,box-shadow] duration-200 cursor-pointer flex flex-col hover:scale-[1.015] active:scale-[0.985] ${
                    theme === 'dark'
                      ? 'bg-[#0e0b16]/95 border-white/[0.08] hover:border-white/25 hover:shadow-2xl'
                      : 'thea-glass-card thea-glass-pill-hover text-zinc-950'
                  }`}
                >
                  {/* Image Box - Pure White Background in all themes */}
                  <div className="relative aspect-video overflow-hidden flex items-center justify-center p-2 border-b bg-white border-slate-200">
                    {asset.dataUrl ? (
                      <img
                        src={asset.dataUrl}
                        alt={asset.caption || 'Figura del documento'}
                        className="w-full h-full object-contain rounded-lg group-hover:scale-105 transition-transform duration-300 bg-white"
                        loading="lazy"
                      />
                    ) : isAssetLoading ? (
                      <div className="flex flex-col items-center justify-center gap-2 p-4 text-zinc-300 animate-pulse">
                        <Loader2 className="w-6 h-6 animate-spin text-zinc-300" />
                        <span className="text-[10px] font-medium text-zinc-400">Cargando desde Drive...</span>
                      </div>
                    ) : (
                      <div className="text-zinc-500 flex flex-col items-center gap-1.5 p-2 text-center">
                        <ImageIcon className="w-7 h-7 opacity-40" />
                        <span className="text-[10px]">Sin previsualización</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            loadSingleAsset(asset.id);
                          }}
                          className={`text-[9px] px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer ${
                            theme === 'dark' ? 'bg-white/[0.05] text-zinc-300 hover:bg-white/10 hover:text-white' : 'bg-slate-200/70 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                          <span>Cargar</span>
                        </button>
                      </div>
                    )}

                    {/* Hover Overlay with Zoom Icon */}
                    {asset.dataUrl && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-9 h-9 rounded-full bg-white text-zinc-950 flex items-center justify-center shadow-lg transform translate-y-1 group-hover:translate-y-0 transition-transform">
                          <ZoomIn className="w-4 h-4" />
                        </div>
                      </div>
                    )}

                    {/* Page/Slide Badge */}
                    <span className={`absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-md border tabular-nums z-10 ${
                      theme === 'dark'
                        ? 'bg-black/85 border-white/10 text-zinc-200'
                        : theme === 'kitty'
                        ? 'bg-white/95 border-pink-200 text-pink-700 shadow-xs'
                        : 'bg-white/95 border-slate-200 text-slate-800 shadow-xs'
                    }`}>
                      {pageInfo}
                    </span>

                    {/* Badges Derecha: Tipo + Badge de Diseño si corresponde */}
                    <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                      {isDec && filterMode === 'all' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500 text-zinc-950 shadow-sm">
                          Diseño
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                        theme === 'dark'
                          ? 'bg-black/85 border-white/10 text-zinc-300'
                          : theme === 'kitty'
                          ? 'bg-white/95 border-pink-200 text-pink-700 shadow-xs'
                          : 'bg-white/95 border-slate-200 text-slate-700 shadow-xs'
                      }`}>
                        {isImage ? <ImageIcon className="w-3 h-3" /> : <TableIcon className="w-3 h-3" />}
                        <span>{isImage ? 'Figura' : 'Tabla'}</span>
                      </span>
                    </div>

                    {/* Botón de Papelera Rápida para Eliminar Imagen Individual */}
                    {onUpdateKit && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm('¿Deseas quitar esta figura de tu Study Kit?')) {
                            handleDeleteAsset(asset.id, e);
                          }
                        }}
                        title="Eliminar figura del kit"
                        className="absolute bottom-2 right-2 z-10 p-1.5 rounded-lg bg-black/75 hover:bg-rose-600 text-zinc-300 hover:text-white border border-white/20 transition-transform duration-150 active:scale-90 cursor-pointer opacity-0 group-hover:opacity-100 shadow-md"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Caption Footer */}
                  <div className="p-3.5 flex-1 flex flex-col justify-between">
                    <p className={`text-xs font-medium line-clamp-2 leading-relaxed ${
                      theme === 'dark' ? 'text-zinc-300' : 'text-zinc-800'
                    }`}>
                      {asset.caption || `Figura ${globalIndex + 1} extraída del material`}
                    </p>
                    <div className="mt-2.5 flex items-center justify-between text-[10px]">
                      <span className={`font-semibold flex items-center gap-1 ${
                        theme === 'dark' ? 'text-zinc-400' : theme === 'kitty' ? 'text-pink-600' : 'text-slate-500'
                      }`}>
                        {asset.dataUrl ? (
                          <>
                            <ZoomIn className="w-3 h-3" />
                            <span>Clic para ampliar</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3 h-3" />
                            <span>Clic para cargar</span>
                          </>
                        )}
                      </span>

                      {/* Dimensiones en píxeles si están disponibles */}
                      {(classInfo?.width || asset.width) && (
                        <span className="text-[10px] text-zinc-500 font-mono tabular-nums">
                          {asset.width || classInfo?.width}x{asset.height || classInfo?.height} px
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Paginador optimizado a 120 FPS sin lag en memoria */}
          {totalPages > 1 && (
            <div className={`flex items-center justify-between p-4 rounded-2xl border ${
              theme === 'dark'
                ? 'bg-white/[0.02] border-white/[0.08]'
                : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="text-xs text-zinc-400 font-medium tabular-nums">
                Página {currentPage} de {totalPages} ({filteredAssets.length} figuras visibles)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => {
                    setCurrentPage(p => Math.max(1, p - 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-transform duration-150 active:scale-[0.97] cursor-pointer disabled:opacity-30 disabled:pointer-events-none ${
                    theme === 'dark'
                      ? 'bg-white/[0.08] text-white hover:bg-white/[0.14] border border-white/[0.1]'
                      : 'bg-white text-slate-800 hover:bg-slate-100 border border-slate-200 shadow-xs'
                  }`}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => {
                    setCurrentPage(p => Math.min(totalPages, p + 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-transform duration-150 active:scale-[0.97] cursor-pointer disabled:opacity-30 disabled:pointer-events-none ${
                    theme === 'dark'
                      ? 'bg-white/[0.08] text-white hover:bg-white/[0.14] border border-white/[0.1]'
                      : 'bg-white text-slate-800 hover:bg-slate-100 border border-slate-200 shadow-xs'
                  }`}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de Zoom Centrado con Soporte de Eliminación */}
      {selectedAsset && selectedAsset.dataUrl && (
        <ImageZoomModal
          isOpen={Boolean(selectedAsset)}
          onClose={() => setSelectedAsset(null)}
          imageUrl={selectedAsset.dataUrl || ''}
          title={selectedAsset.type === 'image' ? 'Figura del Documento' : 'Tabla de Datos'}
          subtitle={selectedAsset.pageOrSlide ? `Página o Diapositiva ${selectedAsset.pageOrSlide}` : undefined}
          caption={selectedAsset.caption}
          onPrev={hasPrev ? handlePrev : undefined}
          onNext={hasNext ? handleNext : undefined}
          hasPrev={hasPrev}
          hasNext={hasNext}
          currentIndex={currentIndex >= 0 ? currentIndex : undefined}
          totalCount={filteredAssets.length}
          onDelete={onUpdateKit ? () => handleDeleteAsset(selectedAsset.id) : undefined}
        />
      )}
    </div>
  );
};
