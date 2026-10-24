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

interface ImagesGalleryViewProps {
  kit: StudyKit;
  onUpdateKit?: (updatedKit: StudyKit) => void;
}

export const ImagesGalleryView: React.FC<ImagesGalleryViewProps> = ({ kit, onUpdateKit }) => {
  const [assets, setAssets] = useState<DocumentAsset[]>(() => kit.assets || []);
  const [selectedAsset, setSelectedAsset] = useState<DocumentAsset | null>(null);
  const [loadingAssetIds, setLoadingAssetIds] = useState<Set<string>>(new Set());
  const [isHydrating, setIsHydrating] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ completed: number; total: number } | null>(null);

  // Mantener activos sincronizados cuando cambia el kit
  useEffect(() => {
    setAssets(kit.assets || []);
  }, [kit.id, kit.assets]);

  // Carga individual e inmediata para una imagen específica al pulsar sobre ella
  const loadSingleAsset = async (assetId: string) => {
    if (!assetId || loadingAssetIds.has(assetId)) return;

    setLoadingAssetIds(prev => new Set(prev).add(assetId));

    try {
      // 1. Consultar IndexedDB local
      const local = await getAssetById(assetId);
      if (local?.dataUrl) {
        const updated = (kit.assets || assets).map(a => (a.id === assetId ? { ...a, dataUrl: local.dataUrl } : a));
        setAssets(updated);
        if (onUpdateKit) {
          onUpdateKit({
            ...kit,
            assets: updated,
          });
        }
        return;
      }

      // 2. Descargar prioritariamente desde Google Drive con reintentos
      const driveMap = await googleDriveService.prioritizeAssetsDownload([assetId]);
      if (driveMap.has(assetId)) {
        const downloaded = driveMap.get(assetId)!;
        const updated = (kit.assets || assets).map(a => (a.id === assetId ? { ...a, dataUrl: downloaded.dataUrl } : a));
        setAssets(updated);
        if (onUpdateKit) {
          onUpdateKit({
            ...kit,
            assets: updated,
          });
        }
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

  // Carga e hidratación proactiva e inmediata de activos faltantes en lotes inteligentes
  const loadMissingAssets = async () => {
    const currentList = kit.assets || [];
    const missing = currentList.filter(a => !a.dataUrl && a.id);
    if (missing.length === 0) return;

    const missingIds = missing.map(a => a.id);
    setLoadingAssetIds(new Set(missingIds));
    setIsHydrating(true);

    try {
      // 1. Consultar IndexedDB local primero
      const localMap = await getAssetsMap(missingIds);
      let updatedAssets = currentList.map(a => {
        if (!a.dataUrl && localMap.has(a.id)) {
          return { ...a, dataUrl: localMap.get(a.id)!.dataUrl };
        }
        return a;
      });

      // Actualizar vista con lo disponible en memoria/IndexedDB
      setAssets(updatedAssets);

      const stillMissing = updatedAssets.filter(a => !a.dataUrl && a.id);
      const stillMissingIds = stillMissing.map(a => a.id);
      setLoadingAssetIds(new Set(stillMissingIds));

      // 2. Si todavía faltan imágenes, descargarlas en lotes paralelos de 6 desde Google Drive
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

      // 3. Notificar al componente padre si se restauraron activos para actualizar currentKit
      const anyRestored = updatedAssets.some((a, idx) => a.dataUrl && !currentList[idx]?.dataUrl);
      if (anyRestored && onUpdateKit) {
        onUpdateKit({
          ...kit,
          assets: updatedAssets,
        });
      }
    } catch (err) {
      console.warn('[ImagesGalleryView] Error al cargar activos faltantes:', err);
    } finally {
      setLoadingAssetIds(new Set());
      setIsHydrating(false);
      setSyncProgress(null);
    }
  };

  // Ejecutar carga inmediata al montar la vista o cambiar de kit
  useEffect(() => {
    loadMissingAssets();
  }, [kit.id]);

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
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-thea-border/60">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
            <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/40 flex items-center justify-center text-violet-400">
              <ImageIcon className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-3">
              <span>Imágenes del Documento</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 font-semibold">
                {assets.length} {assets.length === 1 ? 'activo extraído' : 'activos extraídos'}
              </span>
            </h1>

            {isHydrating && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold flex items-center gap-1.5 animate-pulse">
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
                onClick={loadMissingAssets}
                className="text-xs px-2.5 py-0.5 rounded-full bg-violet-600/30 hover:bg-violet-600 text-violet-200 border border-violet-500/40 font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Cargar imágenes faltantes</span>
              </button>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
            Todas las figuras, diagramas, esquemas y tablas extraídos de &quot;{kit.title}&quot;.
          </p>
        </div>
      </div>

      {/* Empty State */}
      {assets.length === 0 ? (
        <div className="max-w-xl mx-auto my-12 p-8 rounded-3xl bg-thea-surface border border-thea-border text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-thea-surfaceLight border border-thea-border flex items-center justify-center text-slate-500">
            <ImageIcon className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">No hay imágenes en este kit</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Las figuras, diagramas y tablas se extraen automáticamente de archivos PDF, Word (DOCX) y presentaciones PowerPoint (PPTX) que contienen recursos visuales.
            </p>
          </div>
          <p className="text-[11px] text-slate-500">
            Si subes un archivo con esquemas o gráficos, aparecerán organizados y listos para consulta aquí.
          </p>
        </div>
      ) : (
        /* Image Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {assets.map((asset, index) => {
            const isImage = asset.type === 'image';
            const pageInfo = asset.pageOrSlide ? `Pág. / Diapositiva ${asset.pageOrSlide}` : `Elemento #${index + 1}`;
            const isAssetLoading = loadingAssetIds.has(asset.id);

            return (
              <div
                key={asset.id || `asset-${index}`}
                onClick={() => {
                  if (asset.dataUrl) {
                    setSelectedAsset(asset);
                  } else {
                    loadSingleAsset(asset.id);
                  }
                }}
                className="group bg-thea-surface border border-thea-border rounded-2xl overflow-hidden hover:border-violet-500/50 hover:shadow-xl hover:shadow-violet-950/20 transition-all cursor-pointer flex flex-col"
              >
                {/* Image Box */}
                <div className="relative aspect-video bg-black/40 overflow-hidden flex items-center justify-center p-2 border-b border-thea-border/40">
                  {asset.dataUrl ? (
                    <img
                      src={asset.dataUrl}
                      alt={asset.caption || 'Figura del documento'}
                      className="w-full h-full object-contain rounded-lg group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : isAssetLoading ? (
                    <div className="flex flex-col items-center justify-center gap-2 p-4 text-violet-400 animate-pulse">
                      <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
                      <span className="text-[10px] font-medium text-slate-300">Cargando desde Drive...</span>
                    </div>
                  ) : (
                    <div className="text-slate-500 flex flex-col items-center gap-1.5 p-2 text-center">
                      <ImageIcon className="w-7 h-7 opacity-40" />
                      <span className="text-[10px]">Sin previsualización</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          loadSingleAsset(asset.id);
                        }}
                        className="text-[9px] px-2 py-0.5 rounded bg-violet-600/30 text-violet-300 hover:bg-violet-600 hover:text-white transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                        <span>Cargar</span>
                      </button>
                    </div>
                  )}

                  {/* Hover Overlay with Zoom Icon */}
                  {asset.dataUrl && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-9 h-9 rounded-full bg-violet-600/90 text-white flex items-center justify-center shadow-lg transform translate-y-1 group-hover:translate-y-0 transition-transform">
                        <ZoomIn className="w-4 h-4" />
                      </div>
                    </div>
                  )}

                  {/* Page/Slide Badge */}
                  <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-sm border border-white/10 text-slate-200">
                    {pageInfo}
                  </span>

                  {/* Type Badge */}
                  <span className="absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-violet-950/80 border border-violet-500/40 text-violet-300 flex items-center gap-1">
                    {isImage ? <ImageIcon className="w-3 h-3" /> : <TableIcon className="w-3 h-3" />}
                    <span>{isImage ? 'Figura' : 'Tabla'}</span>
                  </span>
                </div>

                {/* Caption Footer */}
                <div className="p-3.5 flex-1 flex flex-col justify-between">
                  <p className="text-xs text-slate-300 font-medium line-clamp-2 leading-relaxed">
                    {asset.caption || `Figura ${index + 1} extraída del material`}
                  </p>
                  <span className="text-[10px] text-violet-400 mt-2 font-semibold flex items-center gap-1">
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
