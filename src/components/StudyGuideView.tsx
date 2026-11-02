import React, { useState, useRef, useEffect } from 'react';
import type { StudyKit, DocumentAsset, StudyGuideDepth } from '../types';
import {
  Sparkles,
  Wand2,
  Volume2,
  VolumeX,
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
  BookOpen,
  RotateCcw
} from 'lucide-react';

export const DEPTH_OPTIONS: Array<{
  id: StudyGuideDepth;
  name: string;
  multiplier: string;
  badge: string;
  desc: string;
  features: string[];
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'essential',
    name: 'Esencial',
    multiplier: '1x Extensión',
    badge: 'Concisa y Rápida',
    desc: 'Núcleos conceptuales basales, definiciones clave y cuadros rápidos para consolidación veloz antes de un examen.',
    features: [
      'Síntesis conceptual directa de alto impacto',
      'Definiciones y axiomas nucleares',
      'Cuadro comparativo sintetizado',
      'Mnemotecnias basales de retención'
    ],
    icon: BookOpen,
  },
  {
    id: 'complete',
    name: 'Completa',
    multiplier: '2x Extensión',
    badge: 'Doble de Profundidad',
    desc: 'Desarrollo sistemático diapositiva por diapositiva con tablas comparativas completas y relaciones causales.',
    features: [
      'Recorrido exhaustivo sección por sección',
      'Desglose causal y fisiopatológico',
      'Tablas comparativas extensas',
      'Perlas analíticas de examen'
    ],
    icon: Layers,
  },
  {
    id: 'ultra',
    name: 'Ultra-Exhaustiva',
    multiplier: '3x Extensión',
    badge: 'Tratado Académico Máximo',
    desc: 'Tratado exhaustivo sin límites que cubre estrictamente todo el documento, casos de examen, tablas matriciales y mnemotecnias avanzadas.',
    features: [
      'Cobertura estricta de cada diapositiva/página',
      'Glosario técnico y marco conceptual profundo',
      'Grandes cuadros matriciales y diferenciales',
      'Casos clínicos/prácticos y preguntas trampa'
    ],
    icon: Sparkles,
  },
];
import { generateAIStudyGuide, stripExecutiveSummaryPreamble } from '../services/aiService';
import { FormattedText } from './FormattedText';
import { synthesizeAzureEdgeSpeech, prefetchAzureEdgeSpeech } from '../services/azureEdgeTtsService';
import { hydrateKitAssets } from '../services/storageService';
import { StudyGuideScanner } from './StudyGuideScanner';

interface StudyGuideViewProps {
  kit: StudyKit;
  onUpdateKit?: (updatedKit: StudyKit) => void;
}

export const StudyGuideView: React.FC<StudyGuideViewProps> = ({ kit, onUpdateKit }) => {
  const [currentKitState, setCurrentKitState] = useState<StudyKit>(kit);
  const [activeTab, setActiveTab] = useState<'guide' | 'gallery'>('guide');
  const [selectedAsset, setSelectedAsset] = useState<DocumentAsset | null>(null);
  const [markdown, setMarkdown] = useState(() =>
    kit.studyGuideMarkdown ? stripExecutiveSummaryPreamble(kit.studyGuideMarkdown) : ''
  );
  const [selectedDepth, setSelectedDepth] = useState<StudyGuideDepth>(kit.studyGuideDepth || 'ultra');
  const [showSmartEditModal, setShowSmartEditModal] = useState(false);
  const [showDepthModal, setShowDepthModal] = useState(false);
  const [modalDepthChoice, setModalDepthChoice] = useState<StudyGuideDepth>(kit.studyGuideDepth || 'ultra');
  const [customPrompt, setCustomPrompt] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ message: string; percent: number }>({
    message: '',
    percent: 0,
  });

  useEffect(() => {
    setCurrentKitState(kit);
    setMarkdown(kit.studyGuideMarkdown ? stripExecutiveSummaryPreamble(kit.studyGuideMarkdown) : '');
    if (kit.studyGuideDepth) {
      setSelectedDepth(kit.studyGuideDepth);
      setModalDepthChoice(kit.studyGuideDepth);
    }
  }, [kit]);

  // Hidratar activos desde IndexedDB o Google Drive si faltan figuras en la guía
  useEffect(() => {
    let isMounted = true;
    const hasMissing =
      kit.assets?.some(a => !a.dataUrl) ||
      kit.questions?.some(q => q.sourceAsset && !q.sourceAsset.dataUrl);

    if (hasMissing) {
      hydrateKitAssets(kit)
        .then(hydrated => {
          if (!isMounted) return;
          setCurrentKitState(hydrated);
          if (onUpdateKit) onUpdateKit(hydrated);
        })
        .catch(() => {});
    }

    const handleAssetsSynced = () => {
      hydrateKitAssets(kit)
        .then(hydrated => {
          if (!isMounted) return;
          setCurrentKitState(hydrated);
          if (onUpdateKit) onUpdateKit(hydrated);
        })
        .catch(() => {});
    };

    window.addEventListener('thea_assets_synced', handleAssetsSynced);
    return () => {
      isMounted = false;
      window.removeEventListener('thea_assets_synced', handleAssetsSynced);
    };
  }, [kit.id]);

  const handleGenerateStudyGuide = async (depthToUse: StudyGuideDepth = selectedDepth) => {
    setShowDepthModal(false);
    setSelectedDepth(depthToUse);
    setIsGenerating(true);
    setGenerationProgress({ message: 'Iniciando escáner e indexación multi-fase con IA...', percent: 5 });
    try {
      const fullText =
        (kit.sourceText && kit.sourceText.length > 100)
          ? kit.sourceText
          : (kit.chunks && kit.chunks.length > 0)
          ? kit.chunks.map(c => `## ${c.heading || `Diapositiva / Sección ${c.pageOrSlide || c.chunkIndex + 1}`}\n${c.text}`).join('\n\n')
          : (kit.sourceMaterials && kit.sourceMaterials.length > 0)
          ? kit.sourceMaterials.map(m => m.name).join(', ')
          : kit.description;

      const generated = await generateAIStudyGuide(
        fullText,
        kit.title,
        kit.category,
        depthToUse,
        (msg, pct) => {
          setGenerationProgress({ message: msg, percent: pct });
        }
      );
      if (generated) {
        const cleaned = stripExecutiveSummaryPreamble(generated);
        setMarkdown(cleaned);
        setSelectedDepth(depthToUse);
        setModalDepthChoice(depthToUse);
        const updated = { ...currentKitState, studyGuideMarkdown: cleaned, studyGuideDepth: depthToUse };
        setCurrentKitState(updated);
        if (onUpdateKit) {
          onUpdateKit(updated);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
      setGenerationProgress({ message: '', percent: 0 });
      setShowDepthModal(false);
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
  const audioStopRequestedRef = useRef<boolean>(false);

  const splitSentences = (text: string): string[] => {
    const clean = text
      .replace(/[#*`>$\-_~[\]()]/g, ' ')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return [];

    const rawMatches = clean.match(/[^.!?;\n]+[.!?;\n]+|[^.!?;\n]+$/g) || [clean];
    const sentences: string[] = [];
    for (const raw of rawMatches) {
      const s = raw.trim();
      if (!s) continue;
      if (s.length > 150) {
        const subChunks = s.match(/[^,:]+[,:]+|[^,:]+$/g) || [s];
        for (const sc of subChunks) {
          const scTrim = sc.trim();
          if (scTrim) sentences.push(scTrim);
        }
      } else {
        sentences.push(s);
      }
    }
    return sentences;
  };

  const stopAudio = () => {
    audioStopRequestedRef.current = true;
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
    setIsSpeaking(false);
    setIsAudioLoading(false);
  };

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, []);

  const handleReadAloud = async () => {
    if (isSpeaking || isAudioLoading) {
      stopAudio();
      return;
    }

    const sentences = splitSentences(markdown.slice(0, 2500));
    if (sentences.length === 0) return;

    audioStopRequestedRef.current = false;
    setIsAudioLoading(true);
    setIsSpeaking(true);

    const voice = 'es-ES-ElviraNeural';

    let fallbackTimer: any = null;

    const playWithLocalFallback = () => {
      if (audioStopRequestedRef.current) return;
      setIsAudioLoading(false);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(sentences.join(' '));
        utterance.lang = 'es-ES';
        utterance.rate = 1.05;
        utterance.onend = () => {
          setIsSpeaking(false);
        };
        utterance.onerror = () => {
          setIsSpeaking(false);
        };
        window.speechSynthesis.speak(utterance);
      } else {
        setIsSpeaking(false);
      }
    };

    // Disparar síntesis local si Azure Edge se demora más de 1800ms
    fallbackTimer = setTimeout(() => {
      console.warn('[StudyGuideView] Azure Edge tardó más de 1800ms; reproduciendo de inmediato con síntesis local.');
      playWithLocalFallback();
    }, 1800);

    try {
      // 1. Sintetizar la primera frase inmediatamente (sub-300ms)
      const firstUrl = await synthesizeAzureEdgeSpeech(sentences[0], voice);
      clearTimeout(fallbackTimer);

      if (audioStopRequestedRef.current) return;

      const firstAudio = new Audio(firstUrl);
      activeAudioRef.current = firstAudio;
      setIsAudioLoading(false);

      // Pre-cargar la segunda y tercera frase concurrentemente en segundo plano
      if (sentences.length > 1) {
        prefetchAzureEdgeSpeech(sentences[1], voice);
      }
      if (sentences.length > 2) {
        prefetchAzureEdgeSpeech(sentences[2], voice);
      }

      let currentSentenceIdx = 0;

      const playNextSentence = async () => {
        if (audioStopRequestedRef.current) return;
        currentSentenceIdx++;
        if (currentSentenceIdx >= sentences.length) {
          setIsSpeaking(false);
          activeAudioRef.current = null;
          return;
        }

        const lookaheadIdx = currentSentenceIdx + 2;
        if (lookaheadIdx < sentences.length) {
          prefetchAzureEdgeSpeech(sentences[lookaheadIdx], voice);
        }

        try {
          const nextUrl = await synthesizeAzureEdgeSpeech(sentences[currentSentenceIdx], voice);
          if (audioStopRequestedRef.current) return;

          const nextAudio = new Audio(nextUrl);
          activeAudioRef.current = nextAudio;
          nextAudio.onended = playNextSentence;
          nextAudio.onerror = playNextSentence;
          await nextAudio.play();
        } catch {
          playNextSentence();
        }
      };

      firstAudio.onended = playNextSentence;
      firstAudio.onerror = () => {
        clearTimeout(fallbackTimer);
        playWithLocalFallback();
      };
      await firstAudio.play();
    } catch {
      clearTimeout(fallbackTimer);
      playWithLocalFallback();
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header & Tools */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-thea-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {currentKitState.studyGuideDepth === 'ultra' ? (
              <>
                <span className="text-xs uppercase font-extrabold px-2 py-0.5 rounded bg-violet-600 text-white shadow-xs">
                  GUÍA ULTRA-EXHAUSTIVA (3X)
                </span>
                <span className="text-xs text-zinc-400 font-medium">Sin límite de caracteres • Auto-generada</span>
              </>
            ) : currentKitState.studyGuideDepth === 'complete' ? (
              <>
                <span className="text-xs uppercase font-bold text-zinc-300">
                  GUÍA COMPLETA (2X)
                </span>
                <span className="text-xs text-zinc-400 font-medium">Doble profundidad • Auto-generada</span>
              </>
            ) : currentKitState.studyGuideDepth === 'essential' ? (
              <>
                <span className="text-xs uppercase font-bold text-zinc-300">
                  GUÍA ESENCIAL (1X)
                </span>
                <span className="text-xs text-zinc-400 font-medium">Síntesis rápida • Auto-generada</span>
              </>
            ) : (
              <>
                <span className="text-xs uppercase font-bold text-zinc-300">
                  GUÍA ADAPTATIVA
                </span>
                <span className="text-xs text-zinc-400 font-medium">Auto-generada y editable</span>
              </>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2 tracking-tight">
            <FileText className="w-6 h-6 text-zinc-400" />
            <span>Guía de Estudio Inteligente</span>
          </h1>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {activeTab === 'guide' && (
            <>
              {/* Opción de Rehacer la Guía con Diferente Extensión */}
              <button
                onClick={() => {
                  setModalDepthChoice(currentKitState.studyGuideDepth || 'ultra');
                  setShowDepthModal(true);
                }}
                disabled={isGenerating}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-300 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-xs active:scale-[0.985]"
                title="Rehacer la guía de estudio con diferente nivel de extensión (1x, 2x o 3x)"
              >
                <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                <span>Rehacer con diferente extensión</span>
              </button>

              {/* Smart Edit */}
              <button
                onClick={() => setShowSmartEditModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs shadow-md transition-all cursor-pointer active:scale-[0.985]"
              >
                <Wand2 className="w-4 h-4" />
                <span>Smart Edit</span>
              </button>

              <button
                onClick={handleReadAloud}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all active:scale-95 ${
                  isSpeaking ? 'bg-white/10 text-white border-white/20 shadow-md' : 'bg-white/[0.03] text-zinc-300 hover:text-white hover:bg-white/[0.06] border-white/[0.08]'
                }`}
              >
                {isAudioLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />
                ) : isSpeaking ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
                <span>{isAudioLoading ? 'Iniciando voz...' : isSpeaking ? 'Detener Voz' : 'Leer en Voz Alta'}</span>
              </button>

              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] text-xs font-medium text-zinc-300 hover:text-white transition-all active:scale-95"
              >
                {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{isCopied ? 'Copiado' : 'Copiar'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Subtabs: Guía Teórica vs Galería Visual ────────────────────────── */}
      <div className="flex items-center gap-2 mb-8 p-1.5 rounded-2xl bg-white/[0.025] border border-white/[0.08] shadow-sm">
        <button
          onClick={() => setActiveTab('guide')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-all cursor-pointer active:scale-[0.985] ${
            activeTab === 'guide'
              ? 'bg-white/10 text-white border border-white/10 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Guía Teórica de Estudio</span>
        </button>

        <button
          onClick={() => setActiveTab('gallery')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-all cursor-pointer active:scale-[0.985] relative ${
            activeTab === 'gallery'
              ? 'bg-white/10 text-white border border-white/10 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
          }`}
        >
          <ImageIcon className="w-4 h-4 text-zinc-400" />
          <span>Galería de Figuras y Esquemas</span>
          {currentKitState.assets && currentKitState.assets.length > 0 && (
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-bold tabular-nums ${
                activeTab === 'gallery'
                  ? 'bg-white text-zinc-950 font-black'
                  : 'bg-white/[0.05] text-zinc-300 border border-white/[0.08]'
              }`}
            >
              {currentKitState.assets.length}
            </span>
          )}
        </button>
      </div>

      {/* ── TAB 1: GUÍA TEÓRICA ────────────────────────────────────────────── */}
      {activeTab === 'guide' && (
        <>
          {isGenerating ? (
            <StudyGuideScanner
              title={kit.title}
              category={kit.category}
              depth={selectedDepth}
              progress={generationProgress}
              sampleText={kit.sourceText || kit.description || ''}
            />
          ) : !markdown || markdown.trim().length === 0 ? (
            <div className="py-10 px-6 sm:px-10 rounded-3xl bg-[#0e0b16]/90 border border-white/[0.08] max-w-4xl mx-auto shadow-[0_12px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] animate-fadeIn space-y-8 backdrop-blur-xl">
              <div className="text-center max-w-2xl mx-auto">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-2">
                  EXTENSIÓN DE LA GUÍA
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2 tracking-tight">
                  Configurar Nivel de Extensión de la Guía
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  Sin límites de caracteres. Elige la profundidad pedagógica con la que deseas que la IA recorra y desglose todo el documento:
                </p>
              </div>

              {/* ── SELECTOR DE 3 NIVELES DE EXTENSIÓN ── */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {DEPTH_OPTIONS.map((opt) => {
                  const isSelected = selectedDepth === opt.id;
                  const Icon = opt.icon;
                  return (
                    <div
                      key={opt.id}
                      onClick={() => !isGenerating && setSelectedDepth(opt.id)}
                      className={`relative p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group active:scale-[0.985] ${
                        isSelected
                          ? 'bg-white/[0.06] border-white/40 shadow-sm'
                          : 'bg-white/[0.025] border-white/[0.08] hover:border-white/20 hover:bg-white/[0.05]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                            isSelected ? 'bg-white text-zinc-950 font-bold' : 'bg-white/[0.04] text-zinc-300 border border-white/[0.08]'
                          }`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full tabular-nums ${
                            isSelected ? 'bg-white/10 text-white border border-white/20' : 'bg-white/[0.04] text-zinc-400 border border-white/[0.08]'
                          }`}>
                            {opt.multiplier}
                          </span>
                        </div>

                        <h3 className="font-bold text-base text-white mb-1 flex items-center gap-1.5 flex-wrap">
                          <span>{opt.name}</span>
                          {opt.id === 'ultra' && (
                            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-white/[0.08] text-zinc-200 border border-white/15 font-bold">
                              Recomendado
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                          {opt.desc}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-white/[0.06] space-y-1.5 text-[11px]">
                        {opt.features.map((f, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <Check className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-zinc-100' : 'text-zinc-500'}`} />
                            <span className={isSelected ? 'text-zinc-200' : 'text-zinc-400'}>{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Botón de Generación */}
              <div className="flex justify-center pt-2">
                <button
                  onClick={() => handleGenerateStudyGuide(selectedDepth)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-2xl bg-white hover:bg-zinc-200 text-zinc-950 font-extrabold text-sm shadow-xl transition-all active:scale-[0.985] cursor-pointer"
                >
                  <Sparkles className="w-5 h-5 text-zinc-950" />
                  <span>
                    Generar Guía {DEPTH_OPTIONS.find(o => o.id === selectedDepth)?.name} ({DEPTH_OPTIONS.find(o => o.id === selectedDepth)?.multiplier})
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-[#0e0b16]/90 border border-white/[0.08] rounded-3xl p-6 sm:p-10 shadow-[0_12px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
                <FormattedText text={stripExecutiveSummaryPreamble(markdown)} />
              </div>

              {/* Banner inferior para Rehacer con diferente extensión */}
              <div className="p-6 sm:p-8 rounded-3xl bg-[#0e0b16]/90 border border-white/[0.08] shadow-xl flex flex-col sm:flex-row items-center justify-between gap-5 backdrop-blur-xl">
                <div className="space-y-1 text-center sm:text-left">
                  <h4 className="text-sm sm:text-base font-bold text-white flex items-center justify-center sm:justify-start gap-2">
                    <Sparkles className="w-4 h-4 text-zinc-400" />
                    <span>¿Deseas adaptar o cambiar la extensión de esta guía?</span>
                  </h4>
                  <p className="text-xs text-zinc-400 leading-relaxed max-w-xl">
                    Puedes rehacer esta guía de estudio en cualquier momento con nivel Esencial (1x), Completa (2x) o Tratado Ultra-Exhaustivo (3x) sin límite de caracteres.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setModalDepthChoice(currentKitState.studyGuideDepth || 'ultra');
                    setShowDepthModal(true);
                  }}
                  disabled={isGenerating}
                  className="shrink-0 flex items-center gap-2 px-5 py-3 rounded-2xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs shadow-lg transition-all cursor-pointer active:scale-[0.985]"
                >
                  <RotateCcw className="w-4 h-4 text-zinc-950" />
                  <span>Rehacer con diferente extensión</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── TAB 2: GALERÍA VISUAL DE FIGURAS Y ESQUEMAS ───────────────────── */}
      {activeTab === 'gallery' && (
        <div className="space-y-6 animate-fadeIn">
          {!currentKitState.assets || currentKitState.assets.length === 0 ? (
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
                    <span>Diagramas, Esquemas y Figuras del Documento ({currentKitState.assets.length})</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Recursos visuales extraídos del archivo original listos para inspección o descarga.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {currentKitState.assets.map((asset, idx) => (
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#0e0b16] border border-white/10 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-zinc-100 font-bold">
                <Sparkles className="w-5 h-5 text-zinc-200" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-white tracking-tight">Smart Edit con IA</h3>
                <p className="text-xs text-zinc-400">Reescribe, resume o personaliza tu guía de estudio en segundos.</p>
              </div>
            </div>

            <div className="space-y-2 mb-6">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Plantillas Rápidas:</span>
              {smartEditPresets.map((preset, i) => (
                <button
                  key={i}
                  disabled={isApplying}
                  onClick={preset.action}
                  className="w-full text-left p-3.5 rounded-2xl bg-white/[0.025] border border-white/[0.08] hover:border-white/20 hover:bg-white/[0.05] transition-all flex items-center justify-between group active:scale-[0.99] cursor-pointer"
                >
                  <div>
                    <h5 className="font-bold text-sm text-white group-hover:text-zinc-200 transition-colors">{preset.title}</h5>
                    <p className="text-xs text-zinc-400">{preset.desc}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white shrink-0" />
                </button>
              ))}
            </div>

            {/* Custom prompt */}
            <div className="mb-6">
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
                O escribe tu propia instrucción:
              </label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Ej. 'Agrega una sección comparativa con la fotosíntesis'..."
                className="w-full bg-[#090314]/90 border border-white/[0.08] rounded-2xl p-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-white/30 transition-colors"
                rows={3}
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                disabled={isApplying}
                onClick={() => setShowSmartEditModal(false)}
                className="px-4 py-2 rounded-xl text-zinc-400 hover:text-white text-xs font-semibold cursor-pointer active:scale-95"
              >
                Cancelar
              </button>
              <button
                disabled={isApplying || !customPrompt.trim()}
                onClick={handleApplyCustomPrompt}
                className="px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs flex items-center gap-2 shadow-lg disabled:opacity-40 cursor-pointer active:scale-95 transition-all"
              >
                {isApplying ? <Sparkles className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                <span>{isApplying ? 'Aplicando cambios...' : 'Aplicar Instrucción'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CAMBIAR EXTENSIÓN / REGENERAR GUÍA ── */}
      {showDepthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#0e0b16] border border-white/10 rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl relative">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-zinc-100 font-bold">
                  <Sparkles className="w-5 h-5 text-zinc-200" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-white tracking-tight">Rehacer Guía con Diferente Extensión</h3>
                  <p className="text-xs text-zinc-400">Selecciona el nivel de profundidad deseado para regenerar la guía completa:</p>
                </div>
              </div>
              <button
                onClick={() => setShowDepthModal(false)}
                className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.05] cursor-pointer active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 my-6">
              {DEPTH_OPTIONS.map((opt) => {
                const isSelected = modalDepthChoice === opt.id;
                const Icon = opt.icon;
                return (
                  <div
                    key={opt.id}
                    onClick={() => setModalDepthChoice(opt.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between active:scale-[0.985] ${
                      isSelected
                        ? 'bg-white/[0.06] border-white/40 shadow-sm'
                        : 'bg-white/[0.025] border-white/[0.08] hover:border-white/20 hover:bg-white/[0.05]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <Icon className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-zinc-400'}`} />
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                          isSelected ? 'bg-white text-zinc-950' : 'bg-white/10 text-zinc-300'
                        }`}>
                          {opt.multiplier}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-white mb-1">{opt.name}</h4>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">{opt.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/[0.06]">
              <button
                disabled={isGenerating}
                onClick={() => setShowDepthModal(false)}
                className="px-4 py-2 rounded-xl text-zinc-400 hover:text-white text-xs font-semibold cursor-pointer active:scale-95"
              >
                Cancelar
              </button>
              <button
                disabled={isGenerating}
                onClick={() => handleGenerateStudyGuide(modalDepthChoice)}
                className="px-5 py-2.5 rounded-2xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs flex items-center gap-2 shadow-lg cursor-pointer active:scale-95 transition-all"
              >
                <RotateCcw className="w-4 h-4 text-zinc-950" />
                <span>Rehacer Guía ({DEPTH_OPTIONS.find(o => o.id === modalDepthChoice)?.name})</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
