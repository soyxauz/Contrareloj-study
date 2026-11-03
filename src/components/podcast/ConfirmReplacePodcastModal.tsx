import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useTheme } from '../../services/themeService';

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
  const { theme } = useTheme();
  if (!show || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 animate-modal-backdrop">
      <div className={`border rounded-2xl sm:rounded-3xl p-5 sm:p-7 max-w-md w-full shadow-2xl text-center space-y-4 relative animate-modal-card ${
        theme === 'dark'
          ? 'bg-[#0e0b16] border-white/10 text-white'
          : theme === 'kitty'
          ? 'bg-white border-pink-200 text-zinc-950 shadow-pink-200/30'
          : 'bg-white border-slate-200 text-zinc-950 shadow-slate-200/50'
      }`}>
        <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center mx-auto ${
          theme === 'dark' ? 'bg-white/[0.04] border-white/10 text-zinc-300' : 'bg-rose-50 border-rose-200 text-rose-600'
        }`}>
          <AlertTriangle className="w-6 h-6 text-rose-500" />
        </div>
        <div>
          <h4 className={`text-lg font-bold mb-2 tracking-tight ${
            theme === 'dark' ? 'text-white' : 'text-zinc-950'
          }`}>
            ¿Reemplazar y generar nuevo episodio?
          </h4>
          <p className={`text-xs leading-relaxed ${
            theme === 'dark' ? 'text-zinc-400' : 'text-slate-600'
          }`}>
            Se eliminará el episodio de podcast actual y todo su audio precalculado para generar un nuevo episodio con formato{' '}
            <span className={`font-bold ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-950'}`}>{formatTitle}</span> y duración{' '}
            <span className={`font-bold ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-950'}`}>{durationSubtitle}</span>.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 py-2.5 px-4 rounded-xl border text-xs font-semibold transition-colors cursor-pointer active:scale-95 ${
              theme === 'dark'
                ? 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-zinc-300 hover:text-white'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
            }`}
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
    </div>,
    document.body
  );
};
