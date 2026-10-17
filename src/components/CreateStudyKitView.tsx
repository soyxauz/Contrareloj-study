import React, { useState, useRef } from 'react';
import type { StudyKit, DocumentAsset } from '../types';
import {
  FileText,
  Upload,
  Globe,
  Sparkles,
  Loader2,
  CheckCircle2,
  BookOpen,
  Brain,
  Layers,
  Headphones,
  AlertCircle,
  X,
  MessageSquareText,
  FileCheck2,
  Info,
  Compass,
  Search,
  Image as ImageIcon,
  RotateCcw,
  Settings,
} from 'lucide-react';

const YoutubeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);
import {
  processContentAsync,
  extractFromYouTube,
  extractFromURL,
  extractFromFile,
  sanitizeExtractedText,
} from '../engine/contentProcessor';
import type { ProcessedContent } from '../engine/contentProcessor';
import { researchTopicAndGenerateKit, hasPersonalApiKey, getAISettings } from '../services/aiService';

export type InputTab = 'topic' | 'text' | 'file' | 'link' | 'youtube';
type CreationPhase = 'input' | 'processing' | 'success' | 'error';

interface CreateStudyKitViewProps {
  onKitCreated: (kit: StudyKit) => void;
  initialTab?: InputTab;
  onOpenAISettings?: () => void;
}

const SUGGESTED_TOPICS = [
  'Resistencia bacteriana a antibióticos',
  'Contratos mercantiles y responsabilidad civil',
  'Mecánica cuántica y superposición',
  'Ciclo de Krebs y fosforilación oxidativa',
  'Estructura del proceso penal acusatorio',
  'Algoritmos de búsqueda y complejidad Big-O',
  'Neurotransmisores y sinapsis neuronal',
];

import { getStoredCustomMaterias } from '../services/materiaService';

const DEFAULT_FOCUS_AREAS = [
  'General',
];

const TABS: { id: InputTab; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'topic', label: 'Crear por Tema', icon: <Compass className="w-5 h-5 text-amber-400" />, description: 'Investigación con evidencia científica generada desde cero con IA' },
  { id: 'text', label: 'Texto / Notas', icon: <FileText className="w-5 h-5" />, description: 'Pega tus apuntes, notas o cualquier texto' },
  { id: 'file', label: 'Archivos (Hasta 3)', icon: <Upload className="w-5 h-5" />, description: 'Word, PowerPoint, Excel, OpenDocument, EPUB, PDF, HTML, Imágenes, TXT o CSV' },
  { id: 'link', label: 'Enlace Web', icon: <Globe className="w-5 h-5" />, description: 'Lector web inteligente sin anuncios ni restricciones CORS' },
  { id: 'youtube', label: 'YouTube', icon: <YoutubeIcon className="w-5 h-5 text-red-500" />, description: 'Extrae contenido de un video de YouTube' },
];

export const CreateStudyKitView: React.FC<CreateStudyKitViewProps> = ({
  onKitCreated,
  initialTab = 'topic',
  onOpenAISettings
}) => {
  const [activeTab, setActiveTab] = useState<InputTab>(initialTab);

  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const [phase, setPhase] = useState<CreationPhase>('input');
  const [title, setTitle] = useState('');
  const [isTitleManuallyEdited, setIsTitleManuallyEdited] = useState(false);
  const [description, setDescription] = useState('');

  const focusAreas = React.useMemo(() => {
    const custom = getStoredCustomMaterias().map(m => m.name);
    return Array.from(new Set([...DEFAULT_FOCUS_AREAS, ...custom]));
  }, []);

  const aiSettings = getAISettings();
  const isLocalAI = Boolean(aiSettings.baseUrl?.includes('localhost') || aiSettings.baseUrl?.includes('127.0.0.1'));
  const hasKey = hasPersonalApiKey();
  const isAIReady = hasKey || isLocalAI;

  // Tab-specific inputs
  const [topicQuery, setTopicQuery] = useState('');
  const [topicFocus, setTopicFocus] = useState('General');
  const [textInput, setTextInput] = useState('');
  const [youtubeURL, setYoutubeURL] = useState('');
  const [linkURL, setLinkURL] = useState('');
  const [uploadedMaterials, setUploadedMaterials] = useState<{
    id: string;
    file: File;
    text: string;
    assets: DocumentAsset[];
    title: string;
    size: number;
  }[]>([]);
  const [isExtractingFile, setIsExtractingFile] = useState(false);
  const [fileExtractError, setFileExtractError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Results
  const [result, setResult] = useState<ProcessedContent | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Processing animation
  const [processStep, setProcessStep] = useState('');

  const currentTab = React.useMemo(() => TABS.find(t => t.id === activeTab), [activeTab]);

  const corpusStats = React.useMemo(() => {
    let totalChars = 0;
    let totalAssets = 0;
    for (let i = 0; i < uploadedMaterials.length; i++) {
      totalChars += uploadedMaterials[i].text.length;
      totalAssets += uploadedMaterials[i].assets.length;
    }
    const estimatedQuestions = Math.max(1, Math.floor(totalChars / 400));
    return { totalChars, totalAssets, estimatedQuestions };
  }, [uploadedMaterials]);

  const handleCreate = async () => {
    if (!isAIReady) {
      if (onOpenAISettings) {
        onOpenAISettings();
      }
      setErrorMessage('Debes configurar una clave de API personal (Groq, Gemini, DeepSeek o local) para generar nuevos kits de estudio.');
      setPhase('error');
      return;
    }

    setPhase('processing');
    setErrorMessage('');

    try {
      let rawText = '';
      let autoTitle = title;
      let assetsToUse: DocumentAsset[] = [];

      // Step 1: Extract / Research content based on tab
      if (activeTab === 'topic') {
        if (!topicQuery.trim()) throw new Error('Ingresa el tema que deseas investigar para generar el Study Kit.');
        setProcessStep('Buscando literatura y evidencia científica abierta...');
        const researched = await researchTopicAndGenerateKit(topicQuery, topicFocus);
        rawText = researched.text;
        if (!autoTitle) autoTitle = researched.title;
        if (!description) {
          setDescription(`Dossier de estudio basado en evidencia científica sobre "${autoTitle}".`);
        }
      } else if (activeTab === 'text') {
        setProcessStep('Procesando apuntes y notas...');
        await delay(300);
        if (!textInput.trim()) throw new Error('Escribe o pega tu material de estudio en el campo de texto.');
        rawText = textInput;
        if (!autoTitle) autoTitle = textInput.split('\n')[0].slice(0, 60) || 'Mi Material de Estudio';
      } else if (activeTab === 'youtube') {
        setProcessStep('Extrayendo transcripción del video...');
        await delay(300);
        if (!youtubeURL.trim()) throw new Error('Pega la URL del video de YouTube.');
        const yt = await extractFromYouTube(youtubeURL);
        rawText = yt.text;
        if (!autoTitle) autoTitle = yt.title;
      } else if (activeTab === 'file') {
        setProcessStep('Extrayendo y unificando contenido de los materiales subidos...');
        await delay(300);
        if (uploadedMaterials.length === 0) throw new Error('Selecciona al menos un archivo para subir a este kit.');
        
        rawText = uploadedMaterials
          .map((m, idx) => `=== MATERIAL DE ESTUDIO ${idx + 1}: ${m.title} (${m.file.name}) ===\n\n${m.text}`)
          .join('\n\n\n');
        // Unificar y etiquetar exhaustivamente los activos de cada material importado
        const allAssets = uploadedMaterials.flatMap(m =>
          m.assets.map(a => {
            const isTagged = a.caption && a.caption.includes(m.file.name);
            const newCaption = isTagged
              ? a.caption
              : `[${m.file.name}] ${a.caption || `Figura #${a.pageOrSlide || 1}`}`;
            return {
              ...a,
              caption: newCaption,
              contextNearby: a.contextNearby || `Material: ${m.file.name}`,
            };
          })
        );

        // Deduplicar imágenes solo si coinciden exactamente en longitud y muestras de contenido
        const seenSignatures = new Set<string>();
        assetsToUse = allAssets.filter(a => {
          if (!a.dataUrl) return true;
          const len = a.dataUrl.length;
          const sig = `${len}:${a.dataUrl.slice(Math.floor(len / 2), Math.floor(len / 2) + 40)}:${a.dataUrl.slice(-40)}`;
          if (seenSignatures.has(sig)) return false;
          seenSignatures.add(sig);
          return true;
        });

        if (!autoTitle && uploadedMaterials[0]) {
          autoTitle = uploadedMaterials.length === 1
            ? uploadedMaterials[0].title
            : `${uploadedMaterials[0].title} y ${uploadedMaterials.length - 1} más`;
        }
      } else if (activeTab === 'link') {
        setProcessStep('Rastreando y leyendo página web con Jina AI...');
        await delay(300);
        if (!linkURL.trim()) throw new Error('Pega la URL de la página web.');
        const urlData = await extractFromURL(linkURL);
        rawText = urlData.text;
        if (!autoTitle) autoTitle = urlData.title;
      }

      // Step 2: Generate questions
      setProcessStep('Analizando núcleos pedagógicos y formulando preguntas con sentido...');
      await delay(500);

      // Process questions with AI Pedagogical Engine, Multimodal RAG and AI Classification
      const processed = await processContentAsync(
        rawText,
        autoTitle,
        description || undefined,
        assetsToUse,
        (step) => setProcessStep(step),
        isTitleManuallyEdited
      );

      if (uploadedMaterials.length > 0) {
        processed.kit.sourceMaterials = uploadedMaterials.map(m => ({
          id: m.id,
          name: m.file.name,
          size: m.size,
          type: m.file.type,
          rawText: sanitizeExtractedText(m.text),
        }));
      }

      if (activeTab === 'topic' && topicFocus) {
        processed.kit.category = topicFocus;
      }

      setResult(processed);
      setPhase('success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ocurrió un error inesperado al procesar el contenido.';
      setErrorMessage(msg);
      setPhase('error');
    }
  };

  const handleProcessFileSelection = async (files: FileList | File[] | File) => {
    const filesArray: File[] = files instanceof File ? [files] : Array.from(files);
    if (filesArray.length === 0) return;

    const currentCount = uploadedMaterials.length;
    if (currentCount >= 3) {
      setFileExtractError('Ya has alcanzado el límite máximo de 3 archivos para este Study Kit. Elimina alguno si deseas reemplazarlo.');
      return;
    }

    const availableSlots = 3 - currentCount;
    const filesToProcess = filesArray.slice(0, availableSlots);
    if (filesArray.length > availableSlots) {
      setFileExtractError(`Solo se procesaron los primeros ${availableSlots} archivo(s) para no exceder el límite máximo de 3 archivos por kit.`);
    } else {
      setFileExtractError('');
    }

    setIsExtractingFile(true);
    try {
      const extractedItems = await Promise.all(
        filesToProcess.map(async (file, idx) => {
          const data = await extractFromFile(file);
          return {
            id: `mat-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
            file,
            text: data.text,
            assets: data.assets || [],
            title: data.title || file.name.replace(/\.[^/.]+$/, ''),
            size: file.size,
          };
        })
      );

      setUploadedMaterials(prev => {
        const next = [...prev, ...extractedItems].slice(0, 3);
        if (!isTitleManuallyEdited && next.length > 0) {
          setTitle(next[0].title);
        }
        return next;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar el archivo.';
      setFileExtractError(msg);
    } finally {
      setIsExtractingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveMaterial = (id: string) => {
    setUploadedMaterials(prev => prev.filter(m => m.id !== id));
  };

  const handleUseKit = () => {
    if (result) {
      onKitCreated(result.kit);
    }
  };

  const handleReset = () => {
    setPhase('input');
    setResult(null);
    setErrorMessage('');
    setProcessStep('');
    setTitle('');
    setIsTitleManuallyEdited(false);
    setDescription('');
    setTopicQuery('');
    setTopicFocus('General');
    setTextInput('');
    setYoutubeURL('');
    setLinkURL('');
    setUploadedMaterials([]);
    setFileExtractError('');
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setActiveTab('file');
      handleProcessFileSelection(e.dataTransfer.files);
    }
  };

  const canCreate =
    (activeTab === 'topic' && topicQuery.trim().length >= 3) ||
    (activeTab === 'text' && textInput.trim().length > 20) ||
    (activeTab === 'youtube' && youtubeURL.trim().length > 10) ||
    (activeTab === 'file' && uploadedMaterials.length > 0 && !isExtractingFile) ||
    (activeTab === 'link' && linkURL.trim().length > 10);

  // ── PROCESSING VIEW ──────────────────────────────────
  if (phase === 'processing') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 flex flex-col items-center justify-center gap-6 animate-fadeIn">
        <div className="relative">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-amber-400 p-[3px] shadow-2xl shadow-violet-900/40">
            <div className="w-full h-full bg-thea-bg rounded-[21px] flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
            </div>
          </div>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center shadow-lg animate-pulse">
            <Sparkles className="w-4 h-4 text-slate-950" />
          </div>
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-white">Creando tu Study Kit...</h2>
          <p className="text-violet-300 font-medium">{processStep}</p>
          <div className="w-64 h-1.5 rounded-full bg-thea-surface mt-4 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-violet-500 to-amber-400 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        </div>

        <p className="text-slate-500 text-xs mt-8">
          Contrareloj Study analiza fuentes científicas y genera evaluaciones con sentido lógico y pedagógico
        </p>
      </div>
    );
  }

  // ── SUCCESS VIEW ──────────────────────────────────
  if (phase === 'success' && result) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12 animate-fadeIn">
        {/* Success Header */}
        <div className="text-center space-y-4 mb-10">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-xl shadow-emerald-900/30">
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">¡Study Kit Creado!</h2>
          <p className="text-slate-400">
            &quot;{result.kit.title}&quot; está listo para estudiar
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard icon={<Brain className="w-5 h-5 text-violet-400" />} value={result.stats.questionsGenerated} label="Preguntas" />
          <StatCard icon={<Layers className="w-5 h-5 text-amber-400" />} value={result.stats.flashcardsGenerated > 0 ? result.stats.flashcardsGenerated : 'Bajo demanda'} label="Flashcards" />
          <StatCard icon={<BookOpen className="w-5 h-5 text-emerald-400" />} value={result.stats.keyTermsExtracted} label="Términos Clave" />
          <StatCard icon={<Headphones className="w-5 h-5 text-rose-400" />} value={result.kit.podcast ? result.kit.podcast.dialogue.length : 'Bajo demanda'} label="Diálogos Podcast" />
        </div>

        {/* Kit Details */}
        <div className="bg-thea-surface border border-thea-border rounded-2xl p-6 mb-8 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-violet-950/70 border border-violet-500/40 text-violet-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Materia Clasificada por IA: {result.kit.category}
            </span>
            <span className="text-xs text-slate-400">
              {result.stats.inputCharacters.toLocaleString()} caracteres procesados
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${result.kit.color} flex items-center justify-center text-white shadow-md shrink-0`}>
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base sm:text-lg">{result.kit.title}</h3>
              <p className="text-xs text-slate-400">Tema central decidido automáticamente en base al contenido</p>
            </div>
          </div>
        </div>

        {/* Included Features */}
        <div className="bg-thea-surface/50 border border-thea-border/50 rounded-2xl p-5 mb-8">
          <h4 className="text-sm font-semibold text-slate-300 mb-3">Contenido generado incluido:</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <FeatureItem icon={<Brain className="w-4 h-4 text-violet-400" />} text="Smart Study con preguntas adaptativas" />
            <FeatureItem icon={<BookOpen className="w-4 h-4 text-emerald-400" />} text="Guía de estudio completa en Markdown" />
            <FeatureItem icon={<Headphones className="w-4 h-4 text-rose-400" />} text="Podcast de repaso con 2 hosts" />
            <FeatureItem icon={<MessageSquareText className="w-4 h-4 text-amber-400" />} text="Tutor IA para resolución de dudas" />
            <FeatureItem icon={<FileCheck2 className="w-4 h-4 text-sky-400" />} text="Exámenes de práctica configurables" />
            <FeatureItem icon={<Layers className="w-4 h-4 text-fuchsia-400" />} text="Flashcards con tracking de dominio" />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleUseKit}
            className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-base transition-all shadow-lg shadow-violet-900/30 flex items-center justify-center gap-2"
          >
            <Sparkles className="w-5 h-5" />
            Empezar a Estudiar
          </button>
          <button
            onClick={handleReset}
            className="px-6 py-3.5 rounded-xl bg-thea-surface border border-thea-border text-slate-300 hover:text-white hover:bg-thea-surfaceLight transition-all font-medium"
          >
            Crear Otro
          </button>
        </div>
      </div>
    );
  }

  // ── ERROR VIEW ──────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 flex flex-col items-center justify-center gap-6 animate-fadeIn">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-red-600 to-rose-500 flex items-center justify-center shadow-xl shadow-red-900/30">
          <AlertCircle className="w-10 h-10 text-white" />
        </div>
        <div className="text-center space-y-3">
          <h2 className="text-xl font-bold text-white">Error de Conexión con el Motor de IA</h2>
          <div className="text-left bg-red-950/40 border border-red-500/30 rounded-2xl p-4 text-xs font-mono text-red-200 max-w-lg mx-auto whitespace-pre-line leading-relaxed">
            {errorMessage}
          </div>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Las evaluaciones de Contrareloj Study son generadas de forma exclusivamente coherente por IA, sin utilizar preguntas mecánicas ni distractores sintéticos al azar.
          </p>
          <div className="p-3 bg-violet-950/30 border border-violet-500/30 rounded-xl text-xs text-violet-200 max-w-md mx-auto">
            Puedes reintentar con el motor del servidor o pulsar en <strong>&quot;Configurar IA&quot;</strong> si deseas utilizar tu propia clave de API personal (Google Gemini, Groq, OpenAI, DeepSeek u Ollama local).
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md mt-2">
          {onOpenAISettings && (
            <button
              onClick={onOpenAISettings}
              className="flex-1 py-3 px-5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-sm transition-all shadow-lg shadow-violet-900/30 flex items-center justify-center gap-2"
            >
              <Settings className="w-4 h-4 text-amber-400" />
              Configurar IA
            </button>
          )}
          <button
            onClick={() => handleCreate()}
            className="flex-1 py-3 px-5 rounded-xl bg-thea-surface border border-violet-500/40 text-violet-300 hover:text-white hover:bg-violet-950/40 transition-all font-semibold text-sm flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reintentar con IA
          </button>
        </div>

        <button
          onClick={() => setPhase('input')}
          className="text-xs text-slate-400 hover:text-white underline underline-offset-4 transition-colors"
        >
          Volver a editar material
        </button>
      </div>
    );
  }

  // ── INPUT VIEW (main) ──────────────────────────────────
  return (
    <div
      className="max-w-3xl mx-auto px-4 sm:px-6 py-8 animate-fadeIn"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleFileDrop}
    >
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-950/80 border border-violet-500/30 text-violet-300 text-xs font-semibold mb-4">
          <Sparkles className="w-3.5 h-3.5 animate-pulse text-amber-400" />
          INVESTIGACIÓN CIENTÍFICA ACTIVA
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
          Crear Study Kit
        </h1>
        <p className="text-slate-400 text-sm max-w-lg mx-auto">
          Ingresa un tema para investigar en internet con base científica, o sube tus archivos Word, PowerPoint, PDF, XML, notas o enlaces.
        </p>
      </div>

      {/* Tab Selector */}
      <div className="flex sm:grid sm:grid-cols-5 gap-2 mb-6 overflow-x-auto pb-1 scrollbar-none touch-pan-x">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center justify-center gap-2 p-3 sm:p-3.5 rounded-xl border transition-all shrink-0 min-w-[105px] sm:min-w-0 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-violet-600/20 border-violet-500 text-violet-300 shadow-lg shadow-violet-900/20'
                : 'bg-thea-surface border-thea-border text-slate-400 hover:text-slate-200 hover:bg-thea-surfaceLight'
            }`}
          >
            {tab.icon}
            <span className="text-xs font-semibold text-center leading-tight">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-thea-surface border border-thea-border rounded-2xl p-6 mb-6">
        <p className="text-xs text-slate-500 mb-4 flex items-center gap-1.5">
          {currentTab?.icon}
          {currentTab?.description}
        </p>

        {/* TOPIC TAB */}
        {activeTab === 'topic' && (
          <div className="space-y-5">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-amber-400" />
              <input
                type="text"
                value={topicQuery}
                onChange={(e) => setTopicQuery(e.target.value)}
                placeholder="Escribe el tema a investigar (ej. Resistencia bacteriana a antibióticos, Contratos civiles...)"
                className="w-full bg-thea-bg border border-thea-border rounded-xl py-3.5 pl-12 pr-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {topicQuery && (
                <button
                  onClick={() => setTopicQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Focus Area Selection */}
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-2">
                Área de Enfoque Académico:
              </label>
              <div className="flex flex-wrap gap-2">
                {focusAreas.map(area => (
                  <button
                    key={area}
                    type="button"
                    onClick={() => setTopicFocus(area)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      topicFocus === area
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-thea-bg border-thea-border text-slate-400 hover:text-slate-200 hover:bg-thea-surfaceLight'
                    }`}
                  >
                    {area}
                  </button>
                ))}
              </div>
            </div>

            {/* Suggested topics pills */}
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                Temas sugeridos con alta evidencia:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_TOPICS.map((sug, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setTopicQuery(sug);
                      if (sug.includes('antibióticos') || sug.includes('Krebs') || sug.includes('neuronal')) {
                        setTopicFocus('Ciencias Médicas');
                      } else if (sug.includes('contratos') || sug.includes('penal')) {
                        setTopicFocus('Derecho');
                      } else if (sug.includes('cuántica')) {
                        setTopicFocus('Ciencias Básicas');
                      } else if (sug.includes('Algoritmos')) {
                        setTopicFocus('Ingeniería / Tecnología');
                      }
                    }}
                    className="px-2.5 py-1 rounded-md bg-thea-bg border border-thea-border/80 text-[11px] text-slate-400 hover:text-white hover:border-violet-500 transition-colors text-left"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>

            {/* Evidence Callout */}
            <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3.5 flex items-start gap-2.5">
              <Compass className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200/90 leading-relaxed">
                <strong className="text-amber-300 font-semibold">Investigación Basada en Evidencia:</strong> Contrareloj Study consulta
                artículos y fuentes de conocimiento abierto verificadas, analiza los mecanismos reales del tema y sintetiza preguntas con sentido lógico y retroalimentación pedagógica.
              </p>
            </div>
          </div>
        )}

        {/* TEXT TAB */}
        {activeTab === 'text' && (
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Pega aquí tus apuntes, notas de clase, texto del libro, resumen, o cualquier contenido de estudio...&#10;&#10;Tip: Cuanto más contenido proporciones, más preguntas y flashcards se generarán. Mínimo recomendado: 200 caracteres."
            className="w-full h-64 bg-thea-bg border border-thea-border rounded-xl p-4 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-y font-mono"
          />
        )}

        {/* YOUTUBE TAB */}
        {activeTab === 'youtube' && (
          <div className="space-y-4">
            <div className="relative">
              <YoutubeIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" />
              <input
                type="url"
                value={youtubeURL}
                onChange={(e) => setYoutubeURL(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full bg-thea-bg border border-thea-border rounded-xl py-3.5 pl-12 pr-4 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div className="bg-thea-bg/50 rounded-xl p-4 border border-thea-border/50 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500">
                <strong className="text-slate-400">Consejo:</strong> Si la transcripción automática no está disponible,
                copia las notas o subtítulos del video y pégalos en la pestaña &quot;Texto / Notas&quot;.
              </p>
            </div>
          </div>
        )}

        {/* FILE TAB (MAXIMO 3 ARCHIVOS) */}
        {activeTab === 'file' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-violet-400" />
                Materiales de estudio ({uploadedMaterials.length} de 3 máx.)
              </span>
              <span className="text-[11px] text-slate-400">
                Puedes combinar de 1 a 3 archivos (PDF, Imágenes, Word, PPTX, TXT)
              </span>
            </div>

            {/* Lista de materiales cargados */}
            {uploadedMaterials.length > 0 && (
              <div className="space-y-3">
                {uploadedMaterials.map((mat, idx) => (
                  <div
                    key={mat.id}
                    className="p-4 rounded-2xl bg-thea-bg/90 border border-thea-border/80 flex items-center justify-between gap-4 shadow-sm"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center shrink-0 text-violet-300 font-bold text-xs">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{mat.file.name}</p>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 flex-wrap">
                          <span>{(mat.size / 1024).toFixed(1)} KB</span>
                          <span>•</span>
                          <span className="text-emerald-400 font-medium">{mat.text.length.toLocaleString()} caracteres</span>
                          {mat.assets.length > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-violet-300 flex items-center gap-1">
                                <ImageIcon className="w-3 h-3 text-violet-400" />
                                {mat.assets.length} visual{mat.assets.length !== 1 ? 'es' : ''}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveMaterial(mat.id)}
                      className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-950/40 hover:text-red-300 text-xs font-bold transition-colors cursor-pointer shrink-0"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Zona para agregar archivos (maximo 3 archivos) */}
            {uploadedMaterials.length >= 3 ? (
              <div className="border border-violet-500/40 bg-violet-950/20 rounded-xl p-6 text-center space-y-2">
                <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mx-auto text-violet-300">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                </div>
                <p className="text-sm font-semibold text-white">
                  Límite de 3 archivos alcanzado (3 de 3)
                </p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Cada archivo ha sido analizado separando texto e imágenes. Para añadir o reemplazar un archivo, elimina alguno de la lista superior.
                </p>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-thea-border rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-violet-500 hover:bg-violet-950/10 transition-all group"
              >
                {isExtractingFile ? (
                  <div className="text-center space-y-2">
                    <Loader2 className="w-8 h-8 text-violet-400 animate-spin mx-auto" />
                    <p className="text-sm font-semibold text-violet-300 animate-pulse">
                      Extrayendo y separando texto e imágenes de los archivos...
                    </p>
                  </div>
                ) : (
                  <div className="text-center space-y-2">
                    <Upload className="w-10 h-10 text-slate-500 mx-auto group-hover:text-violet-400 transition-colors" />
                    <div>
                      <p className="text-sm font-semibold text-slate-300 group-hover:text-white transition-colors">
                        {uploadedMaterials.length === 0
                          ? 'Haz clic o arrastra tus archivos aquí (1 a 3 archivos)'
                          : `+ Añadir otro archivo (${uploadedMaterials.length} de 3 cargados)`}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        PDF, Word (.docx, .doc), PowerPoint (.pptx, .ppt), Excel (.xlsx), OpenDocument (.odt, .odp), EPUB, HTML, Imágenes, TXT, Markdown, CSV
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Error display if file extraction fails */}
            {fileExtractError && (
              <div className="bg-red-950/30 border border-red-500/40 rounded-xl p-4 text-xs text-red-200 whitespace-pre-line space-y-2">
                <div className="flex items-center gap-2 font-bold text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Atención con este archivo</span>
                </div>
                <p>{fileExtractError}</p>
              </div>
            )}

            {/* Resumen del corpus combinado */}
            {uploadedMaterials.length > 0 && (
              <div className="bg-thea-bg/80 border border-emerald-500/30 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Corpus integrado listo ({corpusStats.totalChars.toLocaleString()} caracteres totales)
                  </span>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span>
                      {corpusStats.totalAssets} activos visuales combinados
                    </span>
                    <span>•</span>
                    <span>
                      ~{corpusStats.estimatedQuestions} preguntas estimadas
                    </span>
                  </div>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xlsm,.xls,.odt,.odp,.ods,.epub,.html,.htm,.txt,.xml,.csv,.json,.md,.rtf,.text,.png,.jpg,.jpeg,.webp,.svg,.gif,.bmp,.avif,.tiff,image/*"
              className="hidden"
              disabled={uploadedMaterials.length >= 3}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleProcessFileSelection(e.target.files);
                }
              }}
            />
          </div>
        )}

        {/* LINK TAB */}
        {activeTab === 'link' && (
          <div className="space-y-4">
            <div className="relative">
              <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-400" />
              <input
                type="url"
                value={linkURL}
                onChange={(e) => setLinkURL(e.target.value)}
                placeholder="https://ejemplo.com/articulo-de-estudio o https://es.wikipedia.org/wiki/..."
                className="w-full bg-thea-bg border border-thea-border rounded-xl py-3.5 pl-12 pr-4 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div className="bg-thea-bg/50 rounded-xl p-4 border border-thea-border/50 flex items-start gap-2.5">
              <Globe className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500">
                <strong className="text-slate-400">Lector Web Potenciado con Jina AI:</strong> Funciona con Wikipedia, artículos científicos,
                blogs y páginas web públicas. Elimina menús, barras laterales y publicidad automáticamente.
              </p>
            </div>
          </div>
        )}

        {/* Character count for text tab */}
        {activeTab === 'text' && textInput.length > 0 && (
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className={textInput.length > 200 ? 'text-emerald-400' : 'text-amber-400'}>
              {textInput.length.toLocaleString()} caracteres
              {textInput.length < 200 && ' (mínimo recomendado: 200)'}
            </span>
            <span className="text-slate-500">
              ~{Math.max(1, Math.floor(textInput.length / 500))} preguntas estimadas
            </span>
          </div>
        )}
      </div>


      {/* Title & Description (collapsible advanced) */}
      <div className="bg-thea-surface border border-thea-border rounded-2xl p-6 mb-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <FileText className="w-4 h-4 text-violet-400" />
          Detalles del Kit <span className="text-xs text-slate-500 font-normal">(opcional)</span>
        </h3>
        <input
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setIsTitleManuallyEdited(true);
          }}
          placeholder="Título del Study Kit (la IA decidirá el tema automáticamente si se deja vacío)"
          className="w-full bg-thea-bg border border-thea-border rounded-xl py-3 px-4 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción breve (ej: Capítulo 5 del libro de Biología)"
          className="w-full bg-thea-bg border border-thea-border rounded-xl py-3 px-4 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      {/* Alerta si inicia de 0 sin clave API configurada */}
      {!isAIReady && (
        <div className="mb-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3.5 text-left">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <div className="font-bold text-amber-200 text-sm">
              Clave de API personal requerida
            </div>
            <p className="text-amber-300/80 mt-1 leading-relaxed">
              Para generar nuevos Study Kits con IA debes ingresar tu clave de API personal (Groq, Google Gemini, DeepSeek u OpenAI) o conectar un Ollama local.
            </p>
            {onOpenAISettings && (
              <button
                type="button"
                onClick={onOpenAISettings}
                className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 font-semibold cursor-pointer transition-colors shadow-sm"
              >
                <Settings className="w-3.5 h-3.5 text-amber-400" />
                <span>Configurar API Key</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Create Button */}
      <button
        onClick={handleCreate}
        disabled={!canCreate}
        className={`w-full py-4 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-3 ${
          canCreate
            ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-xl shadow-violet-900/30 cursor-pointer'
            : 'bg-thea-surface border border-thea-border text-slate-600 cursor-not-allowed'
        }`}
      >
        <Sparkles className="w-5 h-5" />
        Crear Study Kit con Contrareloj Study
      </button>

      {/* Info Footer */}
      <p className="text-center text-xs text-slate-600 mt-4">
        Todo se procesa localmente en tu navegador — sin subir nada a servidores externos
      </p>
    </div>
  );
};

// ── Helper Components ──────────────────────────────────

const StatCard: React.FC<{ icon: React.ReactNode; value: number | string; label: string }> = ({ icon, value, label }) => (
  <div className="bg-thea-surface border border-thea-border rounded-xl p-4 flex flex-col items-center gap-2">
    {icon}
    <span className="text-xl sm:text-2xl font-bold text-white text-center">{value}</span>
    <span className="text-xs text-slate-400">{label}</span>
  </div>
);

const FeatureItem: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="flex items-center gap-2 text-slate-300 text-xs py-1">
    <span className="shrink-0">{icon}</span>
    <span>{text}</span>
  </div>
);

// Utility
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
