import React, { useState } from 'react';
import type { StudyKit, DocumentAsset } from '../types';
import {
  Image as ImageIcon,
  ZoomIn,
  Table as TableIcon
} from 'lucide-react';
import { ImageZoomModal } from './ImageZoomModal';

interface ImagesGalleryViewProps {
  kit: StudyKit;
}

export const ImagesGalleryView: React.FC<ImagesGalleryViewProps> = ({ kit }) => {
  const assets: DocumentAsset[] = kit.assets || [];
  const [selectedAsset, setSelectedAsset] = useState<DocumentAsset | null>(null);

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
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/40 flex items-center justify-center text-violet-400">
              <ImageIcon className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-3">
              <span>Imágenes del Documento</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 font-semibold">
                {assets.length} {assets.length === 1 ? 'activo extraído' : 'activos extraídos'}
              </span>
            </h1>
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

            return (
              <div
                key={asset.id || `asset-${index}`}
                onClick={() => setSelectedAsset(asset)}
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
                  ) : (
                    <div className="text-slate-500 flex flex-col items-center gap-1">
                      <ImageIcon className="w-8 h-8" />
                      <span className="text-[10px]">Sin previsualización</span>
                    </div>
                  )}

                  {/* Hover Overlay with Zoom Icon */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-9 h-9 rounded-full bg-violet-600/90 text-white flex items-center justify-center shadow-lg transform translate-y-1 group-hover:translate-y-0 transition-transform">
                      <ZoomIn className="w-4 h-4" />
                    </div>
                  </div>

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
                    <ZoomIn className="w-3 h-3" />
                    <span>Clic para ampliar</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Zoom Centrado */}
      {selectedAsset && (
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
