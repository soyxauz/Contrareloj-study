import React, { useState, useEffect } from 'react';
import type { StudyKit, DocumentAsset } from '../types';
import {
  Image as ImageIcon,
  ZoomIn,
  Table as TableIcon,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { ImageZoomModal } from './ImageZoomModal';
import { getAssetsMap, getAssetById } from '../services/storageService';
import { googleDriveService } from '../services/googleDriveService';
import { useTheme } from '../services/themeService';
import { cleanImageBlackBackground } from '../utils/imageCleaner';

interface ImagesGalleryViewProps {
  kit: StudyKit;
  onUpdateKit?: (updatedKit: StudyKit) => void;
}

export const ImagesGalleryView: React.FC<ImagesGalleryViewProps> = ({ kit }) => {
  const { theme } = useTheme();
  const [assets, setAssets] = useState<DocumentAsset[]>(() => kit.assets || []);
  const [selectedAsset, setSelectedAsset] = useState<DocumentAsset | null>(null);
  const [loadingAssetIds, setLoadingAssetIds] = useState<Set<string>>(new Set());
  const [isHydrating, setIsHydrating] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ completed: number; total: number } | null>(null);

  // Paginación eficiente para mantener el uso de memoria bajo control (máximo 12 imágenes en DOM a la vez)
  const PAGE_SIZE = 12;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(assets.length / PAGE_SIZE));
  const visibleAssets = assets.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Mantener activos sincronizados y resetear página cuando cambia el kit
  useEffect(() => {
    setAssets(kit.assets || []);
    setCurrentPage(1);
  }, [kit.id, kit.assets]);

  // Garantizar fondo blanco puro (#ffffff) eliminando fondos negros de transparencia JPEG
  useEffect(() => {
    let isMounted = true;
    const sanitize = async () => {
      const rawAssets = kit.assets || [];
      let changed = false;
      const sanitized = await Promise.all(
        rawAssets.map(async (a) => {
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
        setAssets(sanitized);
      }
    };
    sanitize();
    return () => {
      isMounted = false;
    };
  }, [kit.id, kit.assets]);

  // Carga individual e inmediata para una imagen específica al pulsar sobre ella
  const loadSingleAsset = async (assetId: string) => {
    if (!assetId || loadingAssetIds.has(assetId)) return;

    setLoadingAssetIds(prev => new Set(prev).add(assetId));

    try {
      // 1. Consultar IndexedDB local
      const local = await getAssetById(assetId);
      if (local?.dataUrl) {
        const updated = assets.map(a => (a.id === assetId ? { ...a, dataUrl: local.dataUrl } : a));
        setAssets(updated);
        return;
      }

      // 2. Descargar prioritariamente desde Google Drive con reintentos
      const driveMap = await googleDriveService.prioritizeAssetsDownload([assetId]);
      if (driveMap.has(assetId)) {
        const downloaded = driveMap.get(assetId)!;
        const updated = assets.map(a => (a.id === assetId ? { ...a, dataUrl: downloaded.dataUrl } : a));
        setAssets(updated);
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
    setLoadingAssetIds(new Set(missingIds));
    setIsHydrating(true);

    try {
      // 1. Consultar IndexedDB local primero
      const localMap = await getAssetsMap(missingIds);
      let updatedAssets = assets.map(a => {
        if (!a.dataUrl && localMap.has(a.id)) {
          return { ...a, dataUrl: localMap.get(a.id)!.dataUrl };
        }
        return a;
      });

      setAssets(updatedAssets);

      const stillMissing = updatedAssets
        .slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
        .filter(a => !a.dataUrl && a.id);
      const stillMissingIds = stillMissing.map(a => a.id);
      setLoadingAssetIds(new Set(stillMissingIds));

      // 2. Si todavía faltan imágenes en la página actual, descargarlas desde Google Drive
      if (stillMissingIds.length > 0) {
        setSyncProgress({ completed: 0, total: stillMissingIds.length });
        const driveMap = await googleDriveService.prioritizeAssetsDownload(
          stillMissingIds,
          (done, total) => setSyncProgress({ completed: done, total })
        );
        if (driveMap.size > 0) {
          updatedAssets = updatedAssets.map(a => {
            if (!a.dataUrl && driveMap.has(a.id)) {
              return { ...a, dataUrl: driveMap.get(a.id)!.dataUrl };
            }
            return a;
          });
          setAssets(updatedAssets);
        }
      }
    } catch (err) {
      console.warn('[ImagesGalleryView] Error al cargar activos de página:', err);
    } finally {
      setLoadingAssetIds(new Set());
      setIsHydrating(false);
      setSyncProgress(null);
    }
  };

  // Ejecutar carga de imágenes al montar, cambiar kit o cambiar de página
  useEffect(() => {
    loadMissingAssetsForCurrentPage();
  }, [kit.id, currentPage]);

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

  const currentIndex = selectedAsset
    ? assets.findIndex((a) => a.id === selectedAsset.id || a.dataUrl === selectedAsset.dataUrl)
    : -1;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < assets.length - 1;

  const handlePrev = () => {
    if (hasPrev) {
      setSelectedAsset(assets[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      setSelectedAsset(assets[currentIndex + 1]);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
      {/* View Header */}
      <div className={`mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b ${
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
                {assets.length} {assets.length === 1 ? 'activo extraído' : 'activos extraídos'}
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

            {!isHydrating && assets.some(a => !a.dataUrl) && (
              <button
                type="button"
                onClick={() => loadMissingAssetsForCurrentPage()}
                className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  theme === 'kitty'
                    ? 'bg-pink-100 hover:bg-pink-200 text-pink-800 border-pink-300'
                    : theme === 'light'
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                    : 'bg-violet-600/30 hover:bg-violet-600 text-violet-200 border-violet-500/40'
                }`}
              >
                <RefreshCw className="w-3 h-3" />
                <span>Cargar imágenes faltantes</span>
              </button>
            )}
          </div>
          <p className={`text-xs sm:text-sm max-w-2xl ${
            theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
          }`}>
            Todas las figuras, diagramas, esquemas y tablas extraídos de &quot;{kit.title}&quot;.
          </p>
        </div>
      </div>

      {/* Empty State */}
      {assets.length === 0 ? (
        <div className={`max-w-xl mx-auto my-12 p-8 rounded-3xl border text-center space-y-4 shadow-xl ${
          theme === 'dark'
            ? 'bg-[#0e0b16]/95 border-white/[0.08] text-white'
            : theme === 'kitty'
            ? 'bg-white border-pink-200 text-zinc-950 shadow-pink-200/30'
            : 'bg-white border-slate-200 text-zinc-950 shadow-slate-200/50'
        }`}>
          <div className="w-16 h-16 mx-auto rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-zinc-500">
            <ImageIcon className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white tracking-tight">No hay imágenes en este kit</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Las figuras, diagramas y tablas se extraen automáticamente de archivos PDF, Word (DOCX) y presentaciones PowerPoint (PPTX) que contienen recursos visuales.
            </p>
          </div>
          <p className="text-[11px] text-zinc-500">
            Si subes un archivo con esquemas o gráficos, aparecerán organizados y listos para consulta aquí.
          </p>
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
                  className={`group border rounded-2xl overflow-hidden transition-[transform,border-color,box-shadow] duration-200 cursor-pointer flex flex-col hover:scale-[1.015] active:scale-[0.985] ${
                    theme === 'dark'
                      ? 'bg-[#0e0b16]/95 border-white/[0.08] hover:border-white/25 hover:shadow-2xl'
                      : theme === 'kitty'
                      ? 'bg-white border-pink-200 hover:border-pink-300 shadow-sm shadow-pink-100/50 hover:shadow-md'
                      : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md'
                  }`}
                >
                  {/* Image Box - Pure White Background in all themes per user request */}
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
                    <span className={`absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-md border tabular-nums ${
                      theme === 'dark'
                        ? 'bg-black/85 border-white/10 text-zinc-200'
                        : theme === 'kitty'
                        ? 'bg-white/95 border-pink-200 text-pink-700 shadow-xs'
                        : 'bg-white/95 border-slate-200 text-slate-800 shadow-xs'
                    }`}>
                      {pageInfo}
                    </span>

                    {/* Type Badge */}
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border flex items-center gap-1 absolute top-2 right-2 ${
                      theme === 'dark'
                        ? 'bg-white/[0.08] border-white/15 text-zinc-300'
                        : theme === 'kitty'
                        ? 'bg-white/95 border-pink-200 text-pink-700 shadow-xs'
                        : 'bg-white/95 border-slate-200 text-slate-700 shadow-xs'
                    }`}>
                      {isImage ? <ImageIcon className="w-3 h-3" /> : <TableIcon className="w-3 h-3" />}
                      <span>{isImage ? 'Figura' : 'Tabla'}</span>
                    </span>
                  </div>

                  {/* Caption Footer */}
                  <div className="p-3.5 flex-1 flex flex-col justify-between">
                    <p className={`text-xs font-medium line-clamp-2 leading-relaxed ${
                      theme === 'dark' ? 'text-zinc-300' : 'text-zinc-800'
                    }`}>
                      {asset.caption || `Figura ${globalIndex + 1} extraída del material`}
                    </p>
                    <span className={`text-[10px] mt-2 font-semibold flex items-center gap-1 ${
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
                Página {currentPage} de {totalPages} ({assets.length} figuras totales)
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

      {/* Modal de Zoom Centrado */}
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
          totalCount={assets.length}
        />
      )}
    </div>
  );
};
