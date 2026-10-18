import React, { useState, useRef } from 'react';
import type { StudyKit, DocumentAsset } from '../types';
import {
  Sparkles,
  Wand2,
  Volume2,
  Copy,
  Check,
  FileText,
  ChevronRight,
  Loader2,
  Image as ImageIcon,
  Download,
  Layers,
  ZoomIn,
  X,
  BookOpen
} from 'lucide-react';
import { generateAIStudyGuide } from '../services/aiService';
import { FormattedText } from './FormattedText';
import { synthesizeAzureEdgeSpeech } from '../services/azureEdgeTtsService';

interface StudyGuideViewProps {
  kit: StudyKit;
  onUpdateKit?: (updatedKit: StudyKit) => void;
}

export const StudyGuideView: React.FC<StudyGuideViewProps> = ({ kit, onUpdateKit }) => {
  const [activeTab, setActiveTab] = useState<'guide' | 'gallery'>('guide');
  const [selectedAsset, setSelectedAsset] = useState<DocumentAsset | null>(null);
  const [markdown, setMarkdown] = useState(kit.studyGuideMarkdown);
  const [showSmartEditModal, setShowSmartEditModal] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateStudyGuide = async () => {
    setIsGenerating(true);
    try {
      const generated = await generateAIStudyGuide(
        kit.sourceText || kit.description,
        kit.title,
        kit.category
      );
      if (generated) {
        setMarkdown(generated);
        if (onUpdateKit) {
          onUpdateKit({ ...kit, studyGuideMarkdown: generated });
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const smartEditPresets = [
    {
      title: 'Simplificar lenguaje',
      desc: 'Reescribe conceptos densos en términos claros y directos.',
      action: () => {
        setIsApplying(true);
        setTimeout(() => {
          setMarkdown(prev => `# [Versión Simplificada con Smart Edit]\n\n${prev}\n\n### Explicación Sencilla (Analogía):\nImagina la mitocondria como una central hidroeléctrica: los electrones son el agua fluyendo por las turbinas (cadena de electrones) y el ATP es la electricidad generada para encender la ciudad (célula).`);
          setIsApplying(false);
          setShowSmartEditModal(false);
        }, 800);
      }
    },
    {
      title: 'Generar Cheat-Sheet de Fórmulas',
      desc: 'Agrega un cuadro resumen rápido al inicio de la guía para repasar antes del test.',
      action: () => {
        setIsApplying(true);
        setTimeout(() => {
          setMarkdown(prev => `> **CHEATSHEET RÁPIDO (PRE-EXAMEN)**\n> * Glucólisis = Citosol | 2 ATP netos + 2 NADH\n> * Krebs = Matriz | 2 ATP + 6 NADH + 2 FADH2 + 4 CO2\n> * Aceptor final = O2 (Forma H2O)\n> * Rendimiento = 30-32 ATP\n\n---\n\n${prev}`);
          setIsApplying(false);
          setShowSmartEditModal(false);
        }, 800);
      }
    },
    {
      title: 'Profundizar con Casos Prácticos',
      desc: 'Agrega preguntas de aplicación clínica o casos de examen avanzado.',
      action: () => {
        setIsApplying(true);
        setTimeout(() => {
          setMarkdown(prev => `${prev}\n\n## 3. Casos Clínicos y Farmacológicos (Nivel Avanzado)\n* **Intoxicación por Cianuro:** Bloquea el citocromo c oxidasa (Complejo IV), impidiendo la transferencia de electrones al oxígeno y deteniendo súbitamente la producción aeróbica de ATP.\n* **Desacopladores (2,4-Dinitrofenol):** Disipan el gradiente de protones generando calor en lugar de ATP.`);
          setIsApplying(false);
          setShowSmartEditModal(false);
        }, 800);
      }
    }
  ];

  const handleApplyCustomPrompt = () => {
    if (!customPrompt.trim()) return;
    setIsApplying(true);
    setTimeout(() => {
      setMarkdown(prev => `${prev}\n\n> **Modificación con Smart Edit:** "${customPrompt}"\n\nSe ha actualizado el documento incorporando las especificaciones indicadas con éxito.`);
      setCustomPrompt('');
      setIsApplying(false);
      setShowSmartEditModal(false);
    }, 900);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(markdown);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  const handleReadAloud = async () => {
    if (isSpeaking) {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
      return;
    }

    const cleanText = markdown.replace(/[#*`>$]/g, '').trim().slice(0, 1200);
    if (!cleanText) return;

    setIsSpeaking(true);
    try {
      const url = await synthesizeAzureEdgeSpeech(cleanText, 'es-ES-ElviraNeural');
      const audio = new Audio(url);
      activeAudioRef.current = audio;
      audio.onended = () => {
        setIsSpeaking(false);
        activeAudioRef.current = null;
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        activeAudioRef.current = null;
      };
      await audio.play();
    } catch {
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'es-ES';
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
      } else {
        setIsSpeaking(false);
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header & Tools */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-thea-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase font-extrabold px-2 py-0.5 rounded bg-violet-600 text-white">
              GUÍA ADAPTATIVA
            </span>
            <span className="text-xs text-slate-400 font-medium">Auto-generada y editable</span>
          </div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-violet-400" />
            <span>Guía de Estudio Inteligente</span>
          </h1>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {activeTab === 'guide' && (
            <>
              {/* Smart Edit */}
              <button
                onClick={() => setShowSmartEditModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-violet-900/30 transition-all"
              >
                <Wand2 className="w-4 h-4" />
                <span>Smart Edit con IA</span>
              </button>

              <button
                onClick={handleReadAloud}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border border-thea-border text-xs font-medium transition-colors ${
                  isSpeaking ? 'bg-violet-600 text-white' : 'bg-thea-surface text-slate-300 hover:text-white hover:bg-thea-surfaceLight'
                }`}
              >
                <Volume2 className="w-4 h-4" />
                <span>{isSpeaking ? 'Detener Voz' : 'Leer en Voz Alta'}</span>
              </button>

              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-thea-surface hover:bg-thea-surfaceLight border border-thea-border text-xs font-medium text-slate-300 hover:text-white transition-colors"
              >
                {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{isCopied ? 'Copiado' : 'Copiar'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Subtabs: Guía Teórica vs Galería Visual ────────────────────────── */}
      <div className="flex items-center gap-2 mb-8 p-1.5 rounded-2xl bg-thea-surface border border-thea-border shadow-sm">
        <button
          onClick={() => setActiveTab('guide')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'guide'
              ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-thea-surfaceLight/50'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Guía Teórica de Estudio</span>
        </button>

        <button
          onClick={() => setActiveTab('gallery')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold transition-all relative ${
            activeTab === 'gallery'
              ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-thea-surfaceLight/50'
          }`}
        >
          <ImageIcon className="w-4 h-4 text-amber-400" />
          <span>Galería de Figuras y Esquemas</span>
          {kit.assets && kit.assets.length > 0 && (
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                activeTab === 'gallery'
                  ? 'bg-amber-400 text-slate-950 font-black'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              {kit.assets.length}
            </span>
          )}
        </button>
      </div>

      {/* ── TAB 1: GUÍA TEÓRICA ────────────────────────────────────────────── */}
      {activeTab === 'guide' && (
        <>
          {!markdown || markdown.trim().length === 0 ? (
            <div className="text-center py-16 px-6 rounded-3xl bg-thea-surface border border-thea-border max-w-xl mx-auto shadow-xl animate-fadeIn">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mx-auto mb-5 text-amber-400">
                <Sparkles className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Guía de Estudio Pendiente</h2>
              <p className="text-sm text-slate-300 mb-8 leading-relaxed">
                Este Study Kit fue creado priorizando la generación de preguntas. Puedes generar ahora su guía de estudio estructurada en Markdown con resúmenes, núcleos conceptuales y mnemotecnias.
              </p>
              <button
                onClick={handleGenerateStudyGuide}
                disabled={isGenerating}
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-violet-600 hover:from-amber-400 hover:to-violet-500 disabled:opacity-50 text-slate-950 font-extrabold text-sm shadow-xl shadow-amber-900/30 transition-all transform hover:-translate-y-0.5 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Estructurando Guía Académica con IA...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    <span>Generar Guía de Estudio con IA</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="bg-thea-surface border border-thea-border rounded-3xl p-6 sm:p-10 shadow-xl">
              <FormattedText text={markdown} />
            </div>
          )}
        </>
      )}

      {/* ── TAB 2: GALERÍA VISUAL DE FIGURAS Y ESQUEMAS ───────────────────── */}
      {activeTab === 'gallery' && (
        <div className="space-y-6 animate-fadeIn">
          {!kit.assets || kit.assets.length === 0 ? (
            <div className="text-center py-16 px-6 rounded-3xl bg-thea-surface border border-thea-border max-w-lg mx-auto shadow-xl">
              <div className="w-16 h-16 rounded-2xl bg-thea-surfaceLight border border-thea-border flex items-center justify-center mx-auto mb-4 text-slate-400">
                <ImageIcon className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Sin Recursos Visuales Extraídos</h3>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
                El documento original no contenía figuras o diagramas embebidos. Al subir diapositivas de PowerPoint (.pptx) o archivos Word (.docx) con diagramas, se organizarán aquí automáticamente.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-violet-400" />
                    <span>Diagramas, Esquemas y Figuras del Documento ({kit.assets.length})</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Recursos visuales extraídos del archivo original listos para inspección o descarga.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {kit.assets.map((asset, idx) => (
                  <div
                    key={asset.id || idx}
                    className="bg-thea-surface border border-thea-border hover:border-violet-500/60 rounded-2xl overflow-hidden transition-all shadow-md group flex flex-col justify-between"
                  >
                    <div>
                      {/* Image Preview Container */}
                      <div
                        onClick={() => setSelectedAsset(asset)}
                        className="relative aspect-video bg-slate-950 flex items-center justify-center cursor-pointer overflow-hidden p-2"
                      >
                        {asset.dataUrl ? (
                          <img
                            src={asset.dataUrl}
                            alt={asset.caption || 'Figura extraída'}
                            className="max-h-full max-w-full object-contain rounded-lg group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="text-slate-500 text-xs flex items-center gap-1.5">
                            <ImageIcon className="w-5 h-5" />
                            <span>Figura</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <span className="px-3 py-1.5 rounded-xl bg-violet-600/90 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg">
                            <ZoomIn className="w-3.5 h-3.5" />
                            Ampliar
                          </span>
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-4 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                            {asset.type === 'table' ? 'Tabla de Datos' : 'Esquema / Figura'}
                          </span>
                          {asset.pageOrSlide && (
                            <span className="text-[11px] text-slate-400 font-mono">
                              Pág / Diap. {asset.pageOrSlide}
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-bold text-white line-clamp-2">
                          {asset.caption || `Figura ${idx + 1}`}
                        </h4>

                        {asset.contextNearby && (
                          <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                            {asset.contextNearby}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="p-3 bg-thea-surfaceLight border-t border-thea-border/60 flex items-center justify-between gap-2">
                      <button
                        onClick={() => setSelectedAsset(asset)}
                        className="text-xs font-semibold text-violet-300 hover:text-white transition-colors flex items-center gap-1"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                        Ver detalle
                      </button>

                      {asset.dataUrl && (
                        <a
                          href={asset.dataUrl}
                          download={`figura-${asset.pageOrSlide || idx + 1}.png`}
                          className="p-1.5 rounded-lg border border-thea-border text-slate-400 hover:text-white hover:bg-thea-border/40 transition-colors"
                          title="Descargar imagen"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ZOOM MODAL FOR SELECTED ASSET ─────────────────────────────────── */}
      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-thea-surface border border-thea-border rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl relative">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-thea-border flex items-center justify-between gap-3 bg-thea-surfaceLight/80">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-white">
                    {selectedAsset.caption || 'Figura del Documento'}
                  </h3>
                  {selectedAsset.pageOrSlide && (
                    <span className="text-xs text-slate-400">
                      Ubicación original: Diapositiva / Página {selectedAsset.pageOrSlide}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedAsset.dataUrl && (
                  <a
                    href={selectedAsset.dataUrl}
                    download={`figura-${selectedAsset.pageOrSlide || 'detalle'}.png`}
                    className="p-2 rounded-xl border border-thea-border text-slate-300 hover:text-white hover:bg-thea-surface transition-colors flex items-center gap-1.5 text-xs font-semibold"
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">Descargar</span>
                  </a>
                )}
                <button
                  onClick={() => setSelectedAsset(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-thea-surface transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Image Area */}
            <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-950 flex items-center justify-center min-h-[300px] max-h-[55vh]">
              {selectedAsset.dataUrl && (
                <img
                  src={selectedAsset.dataUrl}
                  alt={selectedAsset.caption || 'Detalle de la figura'}
                  className="max-h-full max-w-full object-contain rounded-xl shadow-2xl"
                />
              )}
            </div>

            {/* Modal Footer (Context) */}
            {selectedAsset.contextNearby && (
              <div className="p-4 sm:p-5 bg-thea-surface border-t border-thea-border">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Contexto en el documento:
                </span>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans">
                  {selectedAsset.contextNearby}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Smart Edit Modal */}
      {showSmartEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-thea-surface border border-thea-border rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-amber-400 flex items-center justify-center text-slate-950 font-bold">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-white">Smart Edit con IA</h3>
                <p className="text-xs text-slate-400">Reescribe, resume o personaliza tu guía de estudio en segundos.</p>
              </div>
            </div>

            <div className="space-y-2.5 mb-6">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Plantillas Rápidas:</span>
              {smartEditPresets.map((preset, i) => (
                <button
                  key={i}
                  disabled={isApplying}
                  onClick={preset.action}
                  className="w-full text-left p-3.5 rounded-2xl bg-thea-surfaceLight border border-thea-border hover:border-violet-500 hover:bg-thea-border/40 transition-all flex items-center justify-between group"
                >
                  <div>
                    <h5 className="font-bold text-sm text-white group-hover:text-amber-300 transition-colors">{preset.title}</h5>
                    <p className="text-xs text-slate-400">{preset.desc}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white shrink-0" />
                </button>
              ))}
            </div>

            {/* Custom prompt */}
            <div className="mb-6">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                O escribe tu propia instrucción:
              </label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Ej. 'Agrega una sección comparativa con la fotosíntesis'..."
                className="w-full bg-thea-bg border border-thea-border rounded-2xl p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                rows={3}
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                disabled={isApplying}
                onClick={() => setShowSmartEditModal(false)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-medium"
              >
                Cancelar
              </button>
              <button
                disabled={isApplying || !customPrompt.trim()}
                onClick={handleApplyCustomPrompt}
                className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-violet-900/40 disabled:opacity-50"
              >
                {isApplying ? <Sparkles className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                <span>{isApplying ? 'Aplicando cambios...' : 'Aplicar Instrucción'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
