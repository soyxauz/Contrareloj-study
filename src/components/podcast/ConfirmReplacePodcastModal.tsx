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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/85 animate-fadeIn">
      <div className="bg-[#0e0b16] border border-white/10 rounded-2xl sm:rounded-3xl p-5 sm:p-7 max-w-md w-full shadow-2xl text-center space-y-4 relative mb-14 sm:mb-0">
        <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/10 text-zinc-300 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6 text-rose-400" />
        </div>
        <div>
          <h4 className="text-lg font-bold text-white mb-2 tracking-tight">
            ¿Reemplazar y generar nuevo episodio?
          </h4>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Se eliminará el episodio de podcast actual y todo su audio precalculado para generar un nuevo episodio con formato{' '}
            <span className="text-zinc-200 font-bold">{formatTitle}</span> y duración{' '}
            <span className="text-zinc-200 font-bold">{durationSubtitle}</span>.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-zinc-300 hover:text-white transition-colors cursor-pointer active:scale-95"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-lg active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Sí, reemplazar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
