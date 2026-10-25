import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

export interface ConfirmReplacePodcastModalProps {
  show: boolean;
  formatTitle: string;
  durationSubtitle: string;
  onClose: () => void;
  onConfirm: () => void;
}

export const ConfirmReplacePodcastModal: React.FC<ConfirmReplacePodcastModalProps> = ({
  show,
  formatTitle,
  durationSubtitle,
  onClose,
  onConfirm,
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-thea-surface border border-rose-500/40 rounded-2xl sm:rounded-3xl p-5 sm:p-7 max-w-md w-full shadow-2xl text-center space-y-4 relative mb-14 sm:mb-0">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <div>
          <h4 className="text-lg font-bold text-white mb-2">
            ¿Reemplazar y generar nuevo episodio?
          </h4>
          <p className="text-xs text-slate-300 leading-relaxed">
            Se eliminará el episodio de podcast actual y todo su audio precalculado para generar un nuevo episodio con formato{' '}
            <span className="text-amber-300 font-bold">{formatTitle}</span> y duración{' '}
            <span className="text-violet-300 font-bold">{durationSubtitle}</span>.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border border-thea-border text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-slate-950 text-xs font-black transition-all shadow-lg shadow-rose-950/40 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Sí, reemplazar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
