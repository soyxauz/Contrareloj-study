import type { DeveloperSettings } from '../types';
import { ShieldCheck, Cpu, Code2, X } from 'lucide-react';

interface DeveloperSettingsModalProps {
  settings: DeveloperSettings;
  onUpdate: (newSettings: DeveloperSettings) => void;
  onClose: () => void;
  onResetKits?: () => void;
}

export const DeveloperSettingsModal: React.FC<DeveloperSettingsModalProps> = ({
  settings,
  onUpdate,
  onClose,
  onResetKits
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-thea-surface border border-thea-border rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-thea-surfaceLight transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-amber-500 flex items-center justify-center text-white">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-white">Ingeniería Inversa & Entitlements</h3>
            <p className="text-xs text-slate-400">Banderas extraídas de <code>Experiments-DF9zfxEH.js</code></p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-violet-500/10 border border-violet-500/20 text-xs text-violet-200 mb-6 flex items-start gap-2.5">
          <ShieldCheck className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
          <p>
            Todas las funciones y herramientas se encuentran habilitadas y disponibles en <strong>Contrareloj Study</strong>.
          </p>
        </div>

        {/* Feature Switches */}
        <div className="space-y-3 mb-6">
          {[
            {
              key: 'serverHasTheaPlus',
              label: 'Funciones Avanzadas (Full Access)',
              desc: 'Habilita todos los componentes y estilos avanzados sin restricciones.'
            },
            {
              key: 'unlimitedQuestions',
              label: 'Preguntas Ilimitadas (Smart Study)',
              desc: 'Elimina el paywall de fin de cuota diaria de preguntas.'
            },
            {
              key: 'unlockedSmartEdit',
              label: 'Smart Edit con IA en Guías',
              desc: 'Permite reescritura, resúmenes y prompts personalizados.'
            },
            {
              key: 'unlockedPodcast',
              label: 'Review Podcast Generator',
              desc: 'Permite sintetizar apuntes en episodios de audio sin límites.'
            },
            {
              key: 'unlockedAskThea',
              label: 'Tutor IA Interactivo',
              desc: 'Chatbot contextual activo sin restricciones.'
            }
          ].map(item => {
            const val = (settings as any)[item.key];
            return (
              <div
                key={item.key}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-thea-surfaceLight border border-thea-border"
              >
                <div>
                  <h5 className="font-bold text-xs sm:text-sm text-white">{item.label}</h5>
                  <p className="text-[11px] text-slate-400">{item.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onUpdate({ ...settings, [item.key]: !val })}
                  className={`w-12 h-6 rounded-full transition-colors p-1 flex items-center ${
                    val ? 'bg-gradient-to-r from-amber-400 to-rose-500 justify-end' : 'bg-slate-700 justify-start'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow-md" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Technical Provenance Note */}
        <div className="text-[11px] text-slate-500 border-t border-thea-border/60 pt-4 flex items-center gap-1.5">
          <Code2 className="w-3.5 h-3.5 text-violet-400" />
          <span>Storage Key local: <code>thea_developersettings</code></span>
        </div>

        <div className="mt-6 flex items-center justify-between">
          {onResetKits && (
            <button
              type="button"
              onClick={onResetKits}
              className="px-4 py-2.5 rounded-xl border border-rose-500/30 text-rose-300 hover:bg-rose-950/30 font-medium text-xs transition-colors"
            >
              Restablecer Kits Iniciales
            </button>
          )}
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs ml-auto"
          >
            Guardar & Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
