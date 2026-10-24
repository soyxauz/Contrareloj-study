import React from 'react';
import { createPortal } from 'react-dom';
import type { StudyKit, StudyMode } from '../types';
import {
  Sparkles,
  Plus,
  Brain,
  BookOpen,
  Headphones,
  RotateCcw,
  Layers,
  MessageSquareText,
  FileCheck2,
  BarChart3,
  ArrowRight,
  Flame,
  Trophy,
  Zap,
  FileText,
  Upload,
  Globe,
  Trash2,
  Microscope,
  Binary,
  Compass,
  Image as ImageIcon,
  Filter,
  Scale,
  Dna,
  Stethoscope,
  Atom,
  FlaskConical,
  Cpu,
  TrendingUp,
  Landmark,
  GraduationCap,
  Pill,
  Calculator,
  HeartPulse,
  Germ,
  Virus,
  Bone,
  Eye,
  Droplets,
  Syringe,
  Wind,
  CloudRain,
  Leaf,
  X,
  MoreVertical,
  FolderEdit,
  FolderInput,
  Check,
  CheckSquare,
  AlertTriangle,
  Edit3,
  Hospital,
  Lock,
  Key,
  LogIn,
  Mic,
} from 'lucide-react';
import type { InputTab } from './CreateStudyKitView';
import { isAIWorking } from '../services/aiService';
import { getGlobalRealStats, getBookRealStats } from '../services/statsService';
import {
  OPAQUE_DARK_PALETTES,
  getMateriaTheme,
  getAllAvailableMaterias,
  addCustomMateria,
  updateCustomMateria,
  deleteCustomMateria,
} from '../services/materiaService';

const YoutubeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

/**
 * Ilustración vectorial plana y estilizada de hospital / medicina
 * Recrea exactamente la silueta ilustrativa de la referencia con torre redondeada,
 * cruz médica y puerta arqueada, adaptándose automáticamente al color de acento de la materia.
 */
const HospitalIllustration: React.FC<{ className?: string }> = ({ className = "w-28 h-28" }) => {
  const maskId = React.useId();
  return (
    <svg
      viewBox="0 0 100 95"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
    >
      <defs>
        <mask id={maskId}>
          {/* Base blanca sólida */}
          <rect width="100" height="95" fill="white" />
          {/* Cruz médica central transparente */}
          <rect x="46" y="24" width="8" height="22" rx="2.5" fill="black" />
          <rect x="39" y="31" width="22" height="8" rx="2.5" fill="black" />
          {/* Puerta arqueada central transparente */}
          <rect x="42" y="74" width="16" height="22" rx="8" fill="black" />
          {/* Muescas / ventanas en el ala izquierda */}
          <rect x="1" y="47" width="16" height="7" rx="3.5" fill="black" />
          <rect x="1" y="65" width="16" height="7" rx="3.5" fill="black" />
          {/* Muescas / ventanas en el ala derecha */}
          <rect x="83" y="47" width="16" height="7" rx="3.5" fill="black" />
          <rect x="83" y="65" width="16" height="7" rx="3.5" fill="black" />
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        {/* Ala izquierda con hombro redondeado */}
        <rect x="5" y="32" width="31" height="63" rx="11" />
        {/* Ala derecha con hombro redondeado */}
        <rect x="64" y="32" width="31" height="63" rx="11" />
        {/* Torre central redondeada */}
        <rect x="29" y="8" width="42" height="87" rx="15" />
      </g>
    </svg>
  );
};

/**
 * Ilustración vectorial plana y estilizada del aparato respiratorio / pulmones.
 * Mantiene la armonía visual de las marcas de agua con trazo redondeado y relleno sutil.
 */
const LungsIllustration: React.FC<{ className?: string; style?: React.CSSProperties }> = ({
  className = "w-28 h-28",
  style,
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    {/* Tráquea y anillos cartilaginosos */}
    <path d="M12 2v6" />
    <path d="M10 4h4" />
    <path d="M10 6.5h4" />
    {/* Ramas bronquiales principales */}
    <path d="M12 8l-3 3" />
    <path d="M12 8l3 3" />
    {/* Pulmón derecho */}
    <path
      d="M9 11C6.2 11 3.8 13.2 3.8 16.5C3.8 19.8 6 21.5 8.5 21.5C10.6 21.5 11.5 20.2 11.8 18.8L12 11z"
      className="fill-current/25"
    />
    {/* Pulmón izquierdo con escotadura cardíaca */}
    <path
      d="M15 11C17.8 11 20.2 13.2 20.2 16.5C20.2 19.8 18 21.5 15.5 21.5C13.4 21.5 12.5 20.2 12.2 18.8L12 11z"
      className="fill-current/25"
    />
    {/* Ramificaciones bronquiales internas */}
    <path d="M7.8 15.2l-2 1.8" />
    <path d="M16.2 15.2l2 1.8" />
  </svg>
);

interface HomeViewProps {
  kits: StudyKit[];
  currentKit: StudyKit | null;
  onSelectKit: (kit: StudyKit) => void;
  onNavigate: (mode: StudyMode, initialTab?: InputTab) => void;
  onDeleteKit?: (kitId: string) => void;
  onUpdateKit?: (kit: StudyKit) => void;
  userId?: string | null;
  onOpenAISettings?: () => void;
  onOpenAuth?: () => void;
  onDeleteKitsBatch?: (kitIds: string[]) => void;
  onChangeCategoryBatch?: (kitIds: string[], newCategory: string) => void;
  onResetDefaultKits?: () => void;
}

const QUICK_ACTIONS: { id: StudyMode; label: string; desc: string; icon: React.ReactNode; gradient: string }[] = [
  { id: 'smart-study', label: 'Smart Study', desc: 'Preguntas adaptativas con IA', icon: <Brain className="w-6 h-6" />, gradient: 'from-violet-600 to-purple-700' },
  { id: 'study-guide', label: 'Guía de Estudio', desc: 'Resúmenes inteligentes', icon: <BookOpen className="w-6 h-6" />, gradient: 'from-blue-600 to-indigo-700' },
  { id: 'images', label: 'Imágenes', desc: 'Figuras, tablas y diagramas', icon: <ImageIcon className="w-6 h-6" />, gradient: 'from-fuchsia-600 to-pink-700' },
  { id: 'podcast', label: 'Review Podcast', desc: 'Repaso en audio con 2 hosts', icon: <Headphones className="w-6 h-6" />, gradient: 'from-rose-600 to-pink-700' },
  { id: 'flashcards', label: 'Flashcards', desc: 'Memorización con repetición espaciada', icon: <Layers className="w-6 h-6" />, gradient: 'from-amber-500 to-orange-600' },
  { id: 'ask-thea', label: 'Chat Tutor', desc: 'Consultas y dudas por escrito', icon: <MessageSquareText className="w-6 h-6" />, gradient: 'from-cyan-500 to-teal-600' },
  { id: 'oral-lesson', label: 'Lección Oral', desc: 'Práctica oral interactiva con Groq (Voz)', icon: <Mic className="w-6 h-6" />, gradient: 'from-violet-600 to-indigo-600' },
  { id: 'tests', label: 'Exámenes', desc: 'Tests cronometrados personalizables', icon: <FileCheck2 className="w-6 h-6" />, gradient: 'from-emerald-600 to-green-700' },
];

const INPUT_SOURCES: {
  tab: InputTab;
  icon: React.ReactNode;
  label: string;
  hoverStyle: string;
}[] = [
  { tab: 'topic', icon: <Compass className="w-4 h-4 text-amber-400" />, label: 'Investigar Tema', hoverStyle: 'hover:border-amber-500/80 hover:text-amber-200 hover:bg-amber-950/30' },
  { tab: 'text', icon: <FileText className="w-4 h-4 text-violet-400" />, label: 'Texto / Notas', hoverStyle: 'hover:border-violet-500/80 hover:text-violet-200 hover:bg-violet-950/30' },
  { tab: 'youtube', icon: <YoutubeIcon className="w-4 h-4 text-red-500" />, label: 'YouTube', hoverStyle: 'hover:border-red-500/80 hover:text-red-200 hover:bg-red-950/30' },
  { tab: 'file', icon: <Upload className="w-4 h-4 text-emerald-400" />, label: 'Archivos', hoverStyle: 'hover:border-emerald-500/80 hover:text-emerald-200 hover:bg-emerald-950/30' },
  { tab: 'link', icon: <Globe className="w-4 h-4 text-sky-400" />, label: 'Enlaces Web', hoverStyle: 'hover:border-sky-500/80 hover:text-sky-200 hover:bg-sky-950/30' },
];

export const HomeView: React.FC<HomeViewProps> = ({
  kits,
  currentKit,
  onSelectKit,
  onNavigate,
  onDeleteKit,
  onUpdateKit,
  userId = null,
  onOpenAISettings,
  onOpenAuth,
  onDeleteKitsBatch,
  onChangeCategoryBatch,
  onResetDefaultKits,
}) => {
  const [isAIActive, setIsAIActive] = React.useState<boolean>(isAIWorking);

  React.useEffect(() => {
    const handleSettingsChange = () => {
      setIsAIActive(isAIWorking());
    };
    window.addEventListener('thea_ai_settings_changed', handleSettingsChange);
    window.addEventListener('storage', handleSettingsChange);
    return () => {
      window.removeEventListener('thea_ai_settings_changed', handleSettingsChange);
      window.removeEventListener('storage', handleSettingsChange);
    };
  }, []);

  const [selectedMateria, setSelectedMateria] = React.useState<string>('all');
  const [materiaVersion, setMateriaVersion] = React.useState<number>(0);
  const [showMateriaManagerModal, setShowMateriaManagerModal] = React.useState<boolean>(false);
  const [reassignKitModal, setReassignKitModal] = React.useState<StudyKit | null>(null);
  const [kitMenuOpenId, setKitMenuOpenId] = React.useState<string | null>(null);

  // Sincronizacion de temas de materias en tiempo real desde IndexedDB y Google Drive
  React.useEffect(() => {
    const handleMateriasUpdated = () => {
      setMateriaVersion(v => v + 1);
    };
    window.addEventListener('thea_materias_updated', handleMateriasUpdated);
    return () => {
      window.removeEventListener('thea_materias_updated', handleMateriasUpdated);
    };
  }, []);

  // Estados y funciones de Selección y Operaciones en Lote
  const [isSelectionMode, setIsSelectionMode] = React.useState<boolean>(false);
  const [selectedKitIds, setSelectedKitIds] = React.useState<Set<string>>(new Set());
  const [showBatchMateriaModal, setShowBatchMateriaModal] = React.useState<boolean>(false);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = React.useState<boolean>(false);
  const [batchSelectedMateria, setBatchSelectedMateria] = React.useState<string>('');
  const [batchNewMateriaName, setBatchNewMateriaName] = React.useState<string>('');

  const toggleKitSelection = (kitId: string) => {
    setSelectedKitIds(prev => {
      const next = new Set(prev);
      if (next.has(kitId)) {
        next.delete(kitId);
      } else {
        next.add(kitId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedKitIds.size === filteredKits.length && filteredKits.length > 0) {
      setSelectedKitIds(new Set());
    } else {
      setSelectedKitIds(new Set(filteredKits.map(k => k.id)));
    }
  };

  const handleConfirmBatchDelete = () => {
    if (selectedKitIds.size === 0) return;
    const ids = Array.from(selectedKitIds);
    if (onDeleteKitsBatch) {
      onDeleteKitsBatch(ids);
    } else if (onDeleteKit) {
      ids.forEach(id => onDeleteKit(id));
    }
    setSelectedKitIds(new Set());
    setIsSelectionMode(false);
    setShowBatchDeleteModal(false);
  };

  const handleConfirmBatchMateria = () => {
    const targetMateria = (batchNewMateriaName.trim() || batchSelectedMateria).trim();
    if (!targetMateria || selectedKitIds.size === 0) return;

    if (batchNewMateriaName.trim()) {
      addCustomMateria(targetMateria, undefined, userId);
      setMateriaVersion(v => v + 1);
    }

    const ids = Array.from(selectedKitIds);
    if (onChangeCategoryBatch) {
      onChangeCategoryBatch(ids, targetMateria);
    } else if (onUpdateKit) {
      const idSet = new Set(ids);
      kits.forEach(k => {
        if (idSet.has(k.id)) {
          onUpdateKit({ ...k, category: targetMateria });
        }
      });
    }

    setSelectedKitIds(new Set());
    setIsSelectionMode(false);
    setShowBatchMateriaModal(false);
    setBatchNewMateriaName('');
    setBatchSelectedMateria('');
  };

  const [selectedActionForKit, setSelectedActionForKit] = React.useState<{
    id: StudyMode;
    label: string;
    desc: string;
    icon: React.ReactNode;
    gradient: string;
  } | null>(null);

  // Cerrar menu desplegable de tarjeta al presionar Escape o hacer clic fuera
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedActionForKit(null);
        setKitMenuOpenId(null);
        setShowMateriaManagerModal(false);
        setReassignKitModal(null);
        setShowBatchMateriaModal(false);
        setShowBatchDeleteModal(false);
        setIsSelectionMode(false);
        setSelectedKitIds(new Set());
      }
    };
    const handleClickOutside = () => {
      setKitMenuOpenId(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    if (kitMenuOpenId) {
      window.addEventListener('click', handleClickOutside);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClickOutside);
    };
  }, [kitMenuOpenId]);

  // Lista unificada de materias
  const availableMateriasList = React.useMemo(() => {
    return getAllAvailableMaterias(kits, userId);
  }, [kits, materiaVersion, userId]);

  // Kits filtrados por la materia seleccionada
  const filteredKits = React.useMemo(() => {
    if (selectedMateria === 'all') return kits;
    return kits.filter(k => (k.category || 'General').trim().toLowerCase() === selectedMateria.trim().toLowerCase());
  }, [kits, selectedMateria]);

  const renderKitIcon = (iconName: string, colorHex?: string) => {
    const style = colorHex ? { color: colorHex } : undefined;
    const cls = "w-5 h-5";
    switch (iconName) {
      case 'Lungs': return <LungsIllustration className={cls} style={style} />;
      case 'HeartPulse': return <HeartPulse className={cls} style={style} />;
      case 'Germ': return <Germ className={cls} style={style} />;
      case 'Virus': return <Virus className={cls} style={style} />;
      case 'Bone': return <Bone className={cls} style={style} />;
      case 'Eye': return <Eye className={cls} style={style} />;
      case 'Droplets': return <Droplets className={cls} style={style} />;
      case 'Syringe': return <Syringe className={cls} style={style} />;
      case 'Wind': return <Wind className={cls} style={style} />;
      case 'CloudRain': return <CloudRain className={cls} style={style} />;
      case 'Leaf': return <Leaf className={cls} style={style} />;
      case 'Hospital': return <Hospital className={cls} style={style} />;
      case 'Microscope': return <Microscope className={cls} style={style} />;
      case 'Scale': return <Scale className={cls} style={style} />;
      case 'Dna': return <Dna className={cls} style={style} />;
      case 'Stethoscope': return <Stethoscope className={cls} style={style} />;
      case 'Pill': return <Pill className={cls} style={style} />;
      case 'Atom': return <Atom className={cls} style={style} />;
      case 'FlaskConical': return <FlaskConical className={cls} style={style} />;
      case 'Binary': return <Binary className={cls} style={style} />;
      case 'Cpu': return <Cpu className={cls} style={style} />;
      case 'TrendingUp': return <TrendingUp className={cls} style={style} />;
      case 'Landmark': return <Landmark className={cls} style={style} />;
      case 'Calculator': return <Calculator className={cls} style={style} />;
      case 'Brain': return <Brain className={cls} style={style} />;
      case 'BookOpen': return <BookOpen className={cls} style={style} />;
      default: return <GraduationCap className={cls} style={style} />;
    }
  };

  const renderWatermarkIcon = (iconName: string, category?: string, title?: string) => {
    const cls = "w-28 h-28 stroke-[2.2] fill-current/25";
    switch (iconName) {
      case 'Lungs': return <LungsIllustration className={cls} />;
      case 'HeartPulse': return <HeartPulse className={cls} />;
      case 'Germ': return <Germ className={cls} />;
      case 'Virus': return <Virus className={cls} />;
      case 'Bone': return <Bone className={cls} />;
      case 'Eye': return <Eye className={cls} />;
      case 'Droplets': return <Droplets className={cls} />;
      case 'Syringe': return <Syringe className={cls} />;
      case 'Wind': return <Wind className={cls} />;
      case 'CloudRain': return <CloudRain className={cls} />;
      case 'Leaf': return <Leaf className={cls} />;
      case 'Microscope': return <Microscope className={cls} />;
      case 'Scale': return <Scale className={cls} />;
      case 'Dna': return <Dna className={cls} />;
      case 'Pill': return <Pill className={cls} />;
      case 'Atom': return <Atom className={cls} />;
      case 'FlaskConical': return <FlaskConical className={cls} />;
      case 'Binary': return <Binary className={cls} />;
      case 'Cpu': return <Cpu className={cls} />;
      case 'TrendingUp': return <TrendingUp className={cls} />;
      case 'Landmark': return <Landmark className={cls} />;
      case 'Calculator': return <Calculator className={cls} />;
      case 'Brain': return <Brain className={cls} />;
      case 'BookOpen': return <BookOpen className={cls} />;
      case 'Hospital':
      case 'Stethoscope':
        return <HospitalIllustration className="w-28 h-28" />;
      default: {
        const isMed = /fisiopatolog|medicin|salud|enfermedad|hospital|clinica/i.test(`${category || ''} ${title || ''}`);
        if (isMed && (iconName === 'Hospital' || iconName === 'Stethoscope')) {
          return <HospitalIllustration className="w-28 h-28" />;
        }
        return <GraduationCap className={cls} />;
      }
    }
  };

  const [statsVersion, setStatsVersion] = React.useState(0);

  // Escuchar eventos de actualización y sincronización de progreso en tiempo real
  React.useEffect(() => {
    const handleProgressUpdate = () => {
      setStatsVersion(v => v + 1);
    };
    window.addEventListener('thea_session_saved', handleProgressUpdate);
    window.addEventListener('thea_flashcard_saved', handleProgressUpdate);
    window.addEventListener('thea_progress_synced', handleProgressUpdate);
    return () => {
      window.removeEventListener('thea_session_saved', handleProgressUpdate);
      window.removeEventListener('thea_flashcard_saved', handleProgressUpdate);
      window.removeEventListener('thea_progress_synced', handleProgressUpdate);
    };
  }, []);

  // Métricas reales consolidadas de todos los libros
  const globalStats = React.useMemo(() => {
    return getGlobalRealStats(kits, userId);
  }, [kits, userId, statsVersion]);

  // Mapa indexado de estadísticas reales por kit para consulta O(1)
  const bookStatsMap = React.useMemo(() => {
    const map = new Map<string, ReturnType<typeof getBookRealStats>>();
    for (const b of globalStats.booksSummary) {
      map.set(b.kitId, b);
    }
    return map;
  }, [globalStats.booksSummary]);

  // Mapa memoizado de temas visuales por materia para evitar cálculo O(N^2) en el render
  const materiaThemeMap = React.useMemo(() => {
    const map = new Map<string, ReturnType<typeof getMateriaTheme>>();
    for (const m of availableMateriasList) {
      map.set(m.name.toLowerCase(), getMateriaTheme(m.name, kits, userId));
    }
    return map;
  }, [availableMateriasList, kits, userId]);

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-5 lg:px-6 py-4 sm:py-6 animate-fadeIn">

      {/* ── Hero Section ─────────────────────────── */}
      <section className="relative mb-6 overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-violet-950/80 via-thea-surface to-indigo-950/60 border border-thea-border p-5 sm:p-7">
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              Contrareloj Study
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
              ¡Hola! ¿Qué quieres<br />
              estudiar hoy?
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm max-w-md">
              Sube cualquier material y Contrareloj Study genera automáticamente preguntas, flashcards,
              guía de estudio y podcast de repaso — todo con IA y RAG local.
            </p>
          </div>

          {isAIActive ? (
            <button
              onClick={() => onNavigate('create', 'topic')}
              className="w-full sm:w-auto justify-center flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-sm sm:text-base transition-all shadow-lg shadow-violet-900/40 group shrink-0 cursor-pointer min-h-[48px]"
            >
              <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
              <span>Crear Study Kit</span>
            </button>
          ) : (
            <button
              onClick={() => (onOpenAISettings ? onOpenAISettings() : onNavigate('create'))}
              className="w-full sm:w-auto justify-center flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-400 hover:text-slate-200 font-semibold text-sm sm:text-base transition-all group shrink-0 cursor-pointer min-h-[48px] shadow-none"
              title="Configura tu API Key funcional para habilitar la creación de Study Kits"
            >
              <Lock className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform shrink-0" />
              <span>Crear Study Kit</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
                Requiere API
              </span>
            </button>
          )}
        </div>

        {/* Source chips */}
        <div className="relative z-10 mt-5 pt-3 border-t border-thea-border/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-semibold tracking-wide uppercase flex items-center gap-1.5">
              <span>Acepta:</span>
              {!isAIActive && (
                <span className="text-[11px] text-amber-400 font-normal lowercase">(en pausa hasta activar API)</span>
              )}
            </span>
            {isAIActive ? (
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                Desliza o haz clic para empezar
              </span>
            ) : (
              <button
                type="button"
                onClick={onOpenAISettings}
                className="text-[11px] text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 cursor-pointer font-medium"
              >
                <Key className="w-3 h-3" />
                <span>Activar API para desbloquear</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none touch-pan-x">
            {INPUT_SOURCES.map(src => {
              if (isAIActive) {
                return (
                  <button
                    key={src.label}
                    type="button"
                    onClick={() => onNavigate('create', src.tab)}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-thea-bg/90 border border-thea-border/80 text-slate-200 text-xs font-medium cursor-pointer transition-all shadow-sm active:scale-95 group shrink-0 ${src.hoverStyle}`}
                    title={`Hacer clic para crear con ${src.label}`}
                  >
                    <span className="transition-transform group-hover:scale-110 shrink-0">{src.icon}</span>
                    <span className="whitespace-nowrap font-medium">{src.label}</span>
                  </button>
                );
              }
              return (
                <button
                  key={src.label}
                  type="button"
                  onClick={onOpenAISettings}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-500 text-xs font-medium cursor-pointer transition-all active:scale-95 group shrink-0 grayscale hover:text-slate-300 hover:border-slate-700"
                  title="Configura tu API Key funcional para habilitar esta opción"
                >
                  <span className="opacity-50 shrink-0">{src.icon}</span>
                  <span className="whitespace-nowrap font-medium">{src.label}</span>
                  <Lock className="w-3 h-3 text-slate-600 group-hover:text-amber-400 shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Quick Stats Reales ─────────────────────────── */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <QuickStat
          icon={<Flame className="w-5 h-5 text-orange-400 fill-orange-500" />}
          value={`${globalStats.realStreakDays} ${globalStats.realStreakDays === 1 ? 'día' : 'días'}`}
          label="Racha activa"
          accent="orange"
        />
        <QuickStat
          icon={<Brain className="w-5 h-5 text-violet-400" />}
          value={globalStats.totalQuestions.toString()}
          label="Preguntas en libros"
          accent="violet"
        />
        <QuickStat
          icon={<Layers className="w-5 h-5 text-amber-400" />}
          value={`${globalStats.totalFlashcardsMastered}/${globalStats.totalFlashcards}`}
          label="Flashcards dominadas"
          accent="amber"
        />
        <QuickStat
          icon={<Trophy className="w-5 h-5 text-emerald-400" />}
          value={kits.length.toString()}
          label="Study Kits"
          accent="emerald"
        />
      </section>

      {/* ── Tus Study Kits ───────────────────────── */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-violet-400" /> Tus Study Kits
          </h2>
          <div className="flex items-center gap-3">
            {/* Botón Gestión de Materias */}
            <button
              type="button"
              onClick={() => setShowMateriaManagerModal(true)}
              className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-950/30 border border-amber-500/30 hover:border-amber-500/60 transition-all cursor-pointer font-medium"
              title="Crear, editar y gestionar materias de estudio"
            >
              <FolderEdit className="w-3.5 h-3.5" />
              <span>Gestionar Materias</span>
            </button>

            {/* Botón Seleccionar / Cancelar Selección */}
            {kits.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (isSelectionMode) {
                    setIsSelectionMode(false);
                    setSelectedKitIds(new Set());
                  } else {
                    setIsSelectionMode(true);
                  }
                }}
                className={`text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer font-medium ${
                  isSelectionMode
                    ? 'bg-violet-600/30 border-violet-500 text-violet-200'
                    : 'text-slate-400 hover:text-white border-slate-700/60 bg-thea-surface hover:bg-thea-surfaceLight'
                }`}
                title={isSelectionMode ? 'Salir del modo selección' : 'Seleccionar libros para cambiarlos de materia o eliminarlos'}
              >
                <CheckSquare className="w-3.5 h-3.5 text-violet-400" />
                <span>{isSelectionMode ? 'Cancelar selección' : 'Seleccionar'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors cursor-pointer font-medium"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Ver analíticas
            </button>
          </div>
        </div>

        {/* ── Barra de Filtro de Materias con Colores Oscuros Opacos (solo materias con kits) ── */}
        {availableMateriasList.length > 0 && (
          <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1.5 scrollbar-none">
            <span className="text-xs text-slate-500 flex items-center gap-1 shrink-0 mr-1 font-medium">
              <Filter className="w-3.5 h-3.5 text-violet-400" />
              Materia:
            </span>

            {/* Todas */}
            <button
              type="button"
              onClick={() => setSelectedMateria('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all cursor-pointer ${
                selectedMateria === 'all'
                  ? 'bg-violet-600 text-white shadow-sm shadow-violet-950/60'
                  : 'bg-[#12141a] border border-slate-700/50 text-slate-400 hover:text-white hover:border-violet-500/40'
              }`}
            >
              Todas ({kits.length})
            </button>

            {/* Botones de cada Materia existente con color opaco */}
            {availableMateriasList.map(materia => {
              const mTheme = materiaThemeMap.get(materia.name.toLowerCase()) || getMateriaTheme(materia.name, kits, userId);
              const isSelected = selectedMateria.trim().toLowerCase() === materia.name.trim().toLowerCase();
              return (
                <button
                  key={materia.name}
                  type="button"
                  onClick={() => setSelectedMateria(materia.name)}
                  style={{
                    backgroundColor: isSelected ? undefined : mTheme.cardBgHex,
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 border ${
                    isSelected
                      ? `${mTheme.chipActiveBgClass}`
                      : `${mTheme.chipInactiveClass}`
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: mTheme.hex }}
                  />
                  <span>{materia.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isSelected ? 'bg-black/25 text-white' : 'bg-black/40 text-slate-300'
                  }`}>
                    {materia.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {kits.length === 0 ? (
          <div className="p-8 sm:p-12 rounded-3xl bg-thea-surface/40 border border-thea-border text-center max-w-xl mx-auto my-4 animate-fadeIn">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-violet-600/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <BookOpen className="w-8 h-8" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white mb-2">No tienes ningún Study Kit activo</h3>
            <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed">
              {userId
                ? 'No se encontraron Study Kits en esta sesión. Puedes restaurar los kits de estudio de demostración para empezar de inmediato o crear un kit propio.'
                : 'Puedes restaurar los kits de estudio de fábrica para explorar la plataforma, iniciar sesión para recuperar tu progreso guardado o crear un kit nuevo.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {onResetDefaultKits && (
                <button
                  type="button"
                  onClick={onResetDefaultKits}
                  className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-violet-900/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Restaurar Kits Predeterminados</span>
                </button>
              )}
              {!userId && onOpenAuth && (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="px-5 py-2.5 rounded-xl bg-thea-surface border border-thea-border text-slate-200 hover:text-white hover:bg-thea-surfaceLight font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Iniciar Sesión</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigate('create')}
                className="px-5 py-2.5 rounded-xl bg-thea-surface border border-thea-border text-slate-200 hover:text-white hover:bg-thea-surfaceLight font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Crear nuevo Study Kit</span>
              </button>
            </div>
          </div>
        ) : filteredKits.length === 0 ? (
          <div className="p-8 rounded-2xl bg-thea-surface border border-thea-border text-center my-4">
            <p className="text-sm text-slate-300 mb-3">No hay Study Kits asignados a la materia &quot;{selectedMateria}&quot;.</p>
            <button
              onClick={() => setSelectedMateria('all')}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-colors cursor-pointer"
            >
              Ver todas las materias
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Tarjetas de kits con el estilo solicitado (Fondo rico opaco, marca de agua e indicadores) */}
            {filteredKits.map(kit => {
              const isActive = currentKit?.id === kit.id;
              const kStats = bookStatsMap.get(kit.id) || getBookRealStats(kit, userId);
              const mTheme = materiaThemeMap.get((kit.category || 'General').toLowerCase()) || getMateriaTheme(kit.category, kits, userId);
              const isMenuOpen = kitMenuOpenId === kit.id;
              const smartStudyPct = kStats.smartStudyProgressPercent ?? 0;
              const progressPercent = smartStudyPct > 0
                ? Math.max(6, smartStudyPct)
                : (kStats.level > 1 ? 6 : 0);

              const isKitSelected = selectedKitIds.has(kit.id);

              return (
                <div
                  key={kit.id}
                  onClick={() => {
                    if (isSelectionMode) {
                      toggleKitSelection(kit.id);
                    } else {
                      onSelectKit(kit);
                      onNavigate('smart-study');
                    }
                  }}
                  style={{
                    backgroundColor: mTheme.cardBgHex,
                  }}
                  className={`group relative text-left p-5 sm:p-6 rounded-3xl border transition-all duration-200 hover:scale-[1.015] cursor-pointer shadow-lg overflow-hidden flex flex-col justify-between min-h-[185px] ${
                    isSelectionMode && isKitSelected
                      ? 'ring-2 ring-violet-500 border-violet-400 shadow-2xl scale-[1.01]'
                      : isActive
                      ? 'ring-2 ring-white/30 shadow-2xl border-white/10'
                      : 'border-white/10 hover:border-white/25'
                  }`}
                >
                  {/* Marca de agua ilustrativa interactiva con animación hover pop-up y rotación dinámica */}
                  <div
                    style={{ color: mTheme.hex }}
                    className="absolute -bottom-2.5 -right-2.5 pointer-events-none select-none z-0 origin-bottom-right transition-all duration-300 ease-out rotate-[13deg] translate-y-3.5 translate-x-1 opacity-45 group-hover:rotate-0 group-hover:-translate-y-1.5 group-hover:translate-x-0 group-hover:opacity-100"
                  >
                    {renderWatermarkIcon(kit.icon, kit.category, kit.title)}
                  </div>

                  {/* Top Area: Título y Menú de tres puntos */}
                  <div className="flex items-start justify-between gap-3 relative z-10">
                    <div className="flex items-start gap-2.5 max-w-[85%]">
                      {isSelectionMode && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleKitSelection(kit.id);
                          }}
                          className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all cursor-pointer shrink-0 mt-0.5 ${
                            isKitSelected
                              ? 'bg-violet-600 border-violet-400 text-white shadow-md'
                              : 'bg-black/50 border-white/30 text-transparent hover:border-white/70'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className="inline-block text-[10px] font-bold tracking-wider text-white/60 uppercase">
                            {kit.category || 'General'}
                          </span>
                          {kit.sourceLanguage && kit.sourceLanguage !== 'Español' && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-white/10 text-white/80 border border-white/15">
                              <Globe className="w-2.5 h-2.5 opacity-70" />
                              <span>ES (orig. {kit.sourceLanguage})</span>
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-white text-base sm:text-lg leading-tight line-clamp-2">
                          {kit.title}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      {isActive && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/15 text-white border border-white/20">
                          Último abierto
                        </span>
                      )}

                      {!isSelectionMode && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setKitMenuOpenId(isMenuOpen ? null : kit.id);
                            }}
                          title="Opciones de este Study Kit"
                          className={`p-2 sm:p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/15 transition-colors cursor-pointer ${
                            isMenuOpen ? 'bg-white/20 text-white' : ''
                          }`}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {/* Dropdown contextual */}
                        {isMenuOpen && (
                          <div
                            className="absolute right-0 top-full mt-1.5 w-44 rounded-2xl bg-[#141720] border border-slate-700 shadow-2xl py-1.5 z-30 animate-fadeIn"
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setKitMenuOpenId(null);
                                setReassignKitModal(kit);
                              }}
                              className="w-full px-3.5 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 hover:text-white flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <FolderInput className="w-3.5 h-3.5 text-amber-400" />
                              <span>Cambiar Materia</span>
                            </button>

                            {onDeleteKit && (
                              <button
                                type="button"
                                onClick={() => {
                                  setKitMenuOpenId(null);
                                  if (window.confirm(`¿Seguro que deseas eliminar el Study Kit "${kit.title}"?`)) {
                                    onDeleteKit(kit.id);
                                  }
                                }}
                                className="w-full px-3.5 py-2 text-left text-xs text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 flex items-center gap-2 transition-colors cursor-pointer border-t border-slate-800/80"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Eliminar Kit</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                  </div>

                  {/* Bottom Area: Estadísticas + Barra cápsula oscura (idéntica a la imagen) */}
                  <div className="mt-5 relative z-10 space-y-2">
                    {/* Estadísticas del kit */}
                    <div className="flex items-center gap-3 text-xs text-white/85 font-medium flex-wrap">
                      <span className="flex items-center gap-1.5" title={`Smart Study - ${kStats.levelName}`}>
                        <Brain className="w-3.5 h-3.5 text-white/70" />
                        {kStats.levelCorrectCount > 0 || kStats.level > 1
                          ? `Nivel ${kStats.level}: ${kStats.levelCorrectCount}/${kStats.levelTarget} (${smartStudyPct}%)`
                          : (kStats.questionsAnswered > 0
                              ? `Nivel 1: 0/${kStats.levelTarget} (0%)`
                              : `Nivel 1: 0%`)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-white/70" />
                        {kStats.flashcardsMastered}/{kStats.flashcardsTotal} cards
                      </span>
                      {kStats.assetsCount > 0 && (
                        <span className="flex items-center gap-1.5">
                          <ImageIcon className="w-3.5 h-3.5 text-white/70" />
                          {kStats.assetsCount} img
                        </span>
                      )}
                    </div>

                    {/* Barra cápsula oscura con píldora redondeada (como en la captura) */}
                    <div className="w-full h-2.5 rounded-full bg-black/45 overflow-hidden p-0.5 border border-black/20">
                      <div
                        style={{
                          width: `${progressPercent}%`,
                          backgroundColor: mTheme.hex,
                        }}
                        className="h-full rounded-full transition-all duration-300 shadow-sm"
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Create New Kit Card */}
            <button
              onClick={() => onNavigate('create')}
              className="group flex flex-col items-center justify-center p-6 rounded-3xl border-2 border-dashed border-slate-700/60 hover:border-violet-500 bg-[#0d0f14] hover:bg-violet-950/20 transition-all duration-200 min-h-[185px] cursor-pointer"
            >
              <div className="w-12 h-12 rounded-2xl bg-violet-600/20 group-hover:bg-violet-600/30 flex items-center justify-center mb-2.5 transition-colors">
                <Plus className="w-6 h-6 text-violet-400 group-hover:text-violet-300 group-hover:rotate-90 transition-all duration-300" />
              </div>
              <span className="text-sm font-semibold text-slate-400 group-hover:text-violet-300 transition-colors">
                Nuevo Study Kit
              </span>
              <span className="text-xs text-slate-500 mt-0.5">
                Texto, YouTube, PDF o enlace
              </span>
            </button>
          </div>
        )}
      </section>

      {/* ── Acciones Rápidas ─────────────────────── */}
      <section className="mb-6">
        <h2 className="text-base sm:text-lg font-bold text-white mb-3.5 flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          Acciones Rápidas
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {QUICK_ACTIONS.map(action => (
            <button
              key={action.id}
              onClick={() => setSelectedActionForKit(action)}
              className="group relative flex flex-col items-center text-center p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-thea-surface border border-thea-border hover:border-violet-500/40 hover:bg-thea-surfaceLight transition-all duration-200 hover:scale-[1.02]"
            >
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center text-white mb-2 shadow-sm group-hover:scale-105 transition-transform duration-200`}>
                {action.icon}
              </div>
              <h3 className="font-semibold text-white text-xs sm:text-sm mb-1 group-hover:text-violet-300 transition-colors">
                {action.label}
              </h3>
              <p className="text-[11px] text-slate-400 leading-tight">
                {action.desc}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* ── Modal de Selección de Kit para Acción Rápida ── */}
      {selectedActionForKit && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn"
          onClick={() => setSelectedActionForKit(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl sm:rounded-3xl bg-thea-surface border border-thea-border shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-thea-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${selectedActionForKit.gradient} flex items-center justify-center text-white shrink-0`}>
                  {selectedActionForKit.icon}
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    Abrir {selectedActionForKit.label}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Selecciona en cuál de tus libros deseas estudiar
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedActionForKit(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-5 space-y-4">
              <button
                onClick={() => {
                  onNavigate('create');
                  setSelectedActionForKit(null);
                }}
                className="w-full p-3 rounded-xl border border-dashed border-violet-500/40 hover:border-violet-500 bg-violet-950/20 hover:bg-violet-950/40 text-violet-300 flex items-center justify-between text-xs sm:text-sm font-semibold transition-all group"
              >
                <span className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Crear un nuevo Study Kit para esta sesión
                </span>
                <ArrowRight className="w-4 h-4 text-violet-400 group-hover:translate-x-1 transition-transform shrink-0 ml-2" />
              </button>

              <div className="pt-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
                  Tus libros disponibles ({kits.length})
                </p>

                {kits.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs bg-thea-bg/40 rounded-xl border border-thea-border/60">
                    No tienes ningún libro creado actualmente.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[38vh] overflow-y-auto pr-1">
                    {kits.map((kit) => {
                      const isCurrent = currentKit?.id === kit.id;
                      return (
                        <button
                          key={kit.id}
                          onClick={() => {
                            onSelectKit(kit);
                            onNavigate(selectedActionForKit.id);
                            setSelectedActionForKit(null);
                          }}
                          className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all group ${
                            isCurrent
                              ? 'border-violet-500/70 bg-violet-950/30 ring-1 ring-violet-500/30'
                              : 'border-thea-border bg-thea-bg/50 hover:border-slate-600 hover:bg-thea-surfaceLight'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-lg bg-gradient-to-tr ${kit.color || 'from-violet-600 to-indigo-600'} flex items-center justify-center shrink-0 shadow-sm`}>
                              {renderKitIcon(kit.icon)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-white truncate">
                                  {kit.title}
                                </p>
                                {isCurrent && (
                                  <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-500/20 text-violet-300 border border-violet-500/30">
                                    Último abierto
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-400 truncate">
                                {kit.category || 'General'} • {kit.questions.length} preguntas
                              </p>
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-violet-400 group-hover:translate-x-1 transition-all shrink-0 ml-2" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 border-t border-thea-border bg-thea-surface flex justify-end">
              <button
                onClick={() => setSelectedActionForKit(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 border border-thea-border transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Gestión de Materias (Portal) ── */}
      {showMateriaManagerModal && createPortal(
        <MateriaManagerModal
          kits={kits}
          userId={userId}
          onClose={() => setShowMateriaManagerModal(false)}
          onMateriasChanged={() => setMateriaVersion(v => v + 1)}
          onUpdateKit={onUpdateKit}
        />,
        document.body
      )}

      {/* ── Modal de Reasignar Materia a un Kit (Portal) ── */}
      {reassignKitModal && createPortal(
        <ReassignMateriaModal
          kit={reassignKitModal}
          kits={kits}
          userId={userId}
          onClose={() => setReassignKitModal(null)}
          onConfirm={(newCategory) => {
            if (onUpdateKit) {
              onUpdateKit({
                ...reassignKitModal,
                category: newCategory,
              });
            }
            setMateriaVersion(v => v + 1);
            setReassignKitModal(null);
          }}
        />,
        document.body
      )}

      {/* ── Barra Flotante de Acciones en Lote (Portal) ── */}
      {isSelectionMode && createPortal(
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-xl bg-[#12151f]/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl p-3 sm:p-4 flex items-center justify-between gap-3 animate-slideUp">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-600/25 border border-violet-500/40 flex items-center justify-center text-violet-300 font-bold text-xs shrink-0">
              {selectedKitIds.size}
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-white whitespace-nowrap">
                {selectedKitIds.size} {selectedKitIds.size === 1 ? 'libro seleccionado' : 'libros seleccionados'}
              </p>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-[11px] text-violet-400 hover:text-violet-300 font-semibold underline underline-offset-2 transition-colors cursor-pointer"
              >
                {selectedKitIds.size === filteredKits.length && filteredKits.length > 0
                  ? 'Deseleccionar todos'
                  : `Seleccionar todos (${filteredKits.length})`}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Cambiar Materia en Lote */}
            <button
              type="button"
              disabled={selectedKitIds.size === 0}
              onClick={() => {
                setBatchSelectedMateria('');
                setBatchNewMateriaName('');
                setShowBatchMateriaModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:hover:bg-violet-600 text-white font-semibold text-xs transition-all shadow-md cursor-pointer"
              title="Cambiar materia de los libros seleccionados"
            >
              <FolderInput className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cambiar Materia</span>
              <span className="sm:hidden">Materia</span>
            </button>

            {/* Eliminar en Lote */}
            <button
              type="button"
              disabled={selectedKitIds.size === 0}
              onClick={() => setShowBatchDeleteModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600 border border-rose-500/40 text-rose-300 hover:text-white disabled:opacity-40 disabled:hover:bg-rose-600/20 disabled:hover:text-rose-300 font-semibold text-xs transition-all cursor-pointer"
              title="Eliminar libros seleccionados"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Eliminar</span>
            </button>

            {/* Salir de selección */}
            <button
              type="button"
              onClick={() => {
                setIsSelectionMode(false);
                setSelectedKitIds(new Set());
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Cerrar modo selección"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ── Modal de Cambio de Materia en Lote (Portal) ── */}
      {showBatchMateriaModal && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowBatchMateriaModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[#0f1117] border border-slate-800 shadow-2xl flex flex-col overflow-hidden text-slate-100"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-[#131620]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <FolderInput className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    Cambiar Materia en Lote
                  </h3>
                  <p className="text-xs text-slate-400">
                    Asignando a {selectedKitIds.size} {selectedKitIds.size === 1 ? 'libro seleccionado' : 'libros seleccionados'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBatchMateriaModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2">
                  Selecciona una materia existente:
                </label>
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1 scrollbar-none">
                  {availableMateriasList.map(materia => {
                    const mTheme = materiaThemeMap.get(materia.name.toLowerCase()) || getMateriaTheme(materia.name, kits, userId);
                    const isChosen = batchSelectedMateria.trim().toLowerCase() === materia.name.trim().toLowerCase() && !batchNewMateriaName.trim();
                    return (
                      <button
                        key={materia.name}
                        type="button"
                        onClick={() => {
                          setBatchSelectedMateria(materia.name);
                          setBatchNewMateriaName('');
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
                          isChosen
                            ? 'ring-2 ring-violet-500 shadow-md bg-violet-600/30 border-violet-500 text-white'
                            : `${mTheme.chipInactiveClass} hover:border-white/30`
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: mTheme.hex }} />
                        <span>{materia.name}</span>
                        <span className="text-[10px] opacity-70">({materia.count})</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  O escribe una nueva materia:
                </label>
                <input
                  type="text"
                  placeholder="Ej. Farmacología, Cardiología, Genética..."
                  value={batchNewMateriaName}
                  onChange={(e) => {
                    setBatchNewMateriaName(e.target.value);
                    if (e.target.value.trim()) {
                      setBatchSelectedMateria('');
                    }
                  }}
                  className="w-full bg-[#0c0e14] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                />
              </div>

              {/* Vista previa de libros afectados */}
              <div>
                <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                  Libros seleccionados ({selectedKitIds.size}):
                </span>
                <div className="bg-[#0c0e14] border border-slate-800 rounded-xl p-2.5 max-h-28 overflow-y-auto space-y-1 scrollbar-none">
                  {kits.filter(k => selectedKitIds.has(k.id)).map(k => (
                    <div key={k.id} className="text-[11px] text-slate-300 flex items-center gap-2 truncate">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                      <span className="truncate">{k.title}</span>
                      <span className="text-[10px] text-slate-500 shrink-0 ml-auto">({k.category || 'General'})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 sm:p-4 border-t border-slate-800 bg-[#131620] flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowBatchMateriaModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!batchSelectedMateria.trim() && !batchNewMateriaName.trim()}
                onClick={handleConfirmBatchMateria}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:hover:bg-violet-600 text-white transition-all shadow-md shadow-violet-900/30 cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Aplicar a {selectedKitIds.size} {selectedKitIds.size === 1 ? 'libro' : 'libros'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Modal de Confirmación de Eliminación en Lote (Portal) ── */}
      {showBatchDeleteModal && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowBatchDeleteModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[#0f1117] border border-rose-500/40 shadow-2xl flex flex-col overflow-hidden text-slate-100"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-[#131620]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    ¿Eliminar {selectedKitIds.size} {selectedKitIds.size === 1 ? 'Study Kit' : 'Study Kits'}?
                  </h3>
                  <p className="text-xs text-rose-300/80">
                    Esta acción es irreversible
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBatchDeleteModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 space-y-3">
              <p className="text-xs text-slate-300 leading-relaxed">
                Se eliminarán permanentemente los siguientes {selectedKitIds.size} libros, incluyendo todas sus preguntas, resúmenes, fichas y progreso registrado:
              </p>

              {/* Lista previa de libros a eliminar */}
              <div className="bg-[#0c0e14] border border-slate-800 rounded-xl p-2.5 max-h-36 overflow-y-auto space-y-1.5 scrollbar-none">
                {kits.filter(k => selectedKitIds.has(k.id)).map(k => (
                  <div key={k.id} className="text-xs text-slate-300 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                    <span className="truncate">{k.title}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 sm:p-4 border-t border-slate-800 bg-[#131620] flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowBatchDeleteModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmBatchDelete}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-md shadow-rose-950/40 cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Eliminar {selectedKitIds.size} {selectedKitIds.size === 1 ? 'libro' : 'libros'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

// ── Componente: Modal de Gestión de Materias ──────────────────

interface MateriaManagerModalProps {
  kits: StudyKit[];
  userId?: string | null;
  onClose: () => void;
  onMateriasChanged: () => void;
  onUpdateKit?: (kit: StudyKit) => void;
}

const MateriaManagerModal: React.FC<MateriaManagerModalProps> = ({
  kits,
  userId = null,
  onClose,
  onMateriasChanged,
  onUpdateKit,
}) => {
  const activeMaterias = React.useMemo(() => getAllAvailableMaterias(kits, userId), [kits, userId]);
  const [editingMateriaName, setEditingMateriaName] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState('');
  const [editingColor, setEditingColor] = React.useState('blue');

  const paletteKeys = Object.keys(OPAQUE_DARK_PALETTES);

  const handleStartEdit = (m: { name: string; colorId: string }) => {
    setEditingMateriaName(m.name);
    setEditingName(m.name);
    setEditingColor(m.colorId);
  };

  const handleSaveEdit = (oldName: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) return;
    updateCustomMateria(oldName, trimmed, editingColor, userId);

    if (trimmed.toLowerCase() !== oldName.toLowerCase() && onUpdateKit) {
      kits.forEach(k => {
        if ((k.category || '').toLowerCase() === oldName.toLowerCase()) {
          onUpdateKit({ ...k, category: trimmed });
        }
      });
    }

    setEditingMateriaName(null);
    onMateriasChanged();
  };

  const handleDelete = (materiaName: string) => {
    const kitsWithMateria = kits.filter(k => (k.category || '').toLowerCase() === materiaName.toLowerCase());
    let confirmMsg = `¿Deseas reasignar los libros de "${materiaName}" a la materia "General"?`;
    if (window.confirm(confirmMsg)) {
      deleteCustomMateria(materiaName, userId);
      if (kitsWithMateria.length > 0 && onUpdateKit) {
        kitsWithMateria.forEach(k => {
          onUpdateKit({ ...k, category: 'General' });
        });
      }
      onMateriasChanged();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[85vh] rounded-2xl bg-[#0f1117] border border-slate-800 shadow-2xl flex flex-col overflow-hidden text-slate-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-[#131620]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <FolderEdit className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                Materias Activas
              </h2>
              <p className="text-xs text-slate-400">
                Personaliza los colores oscuros de tus materias y renómbralas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Scrollable */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {activeMaterias.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">
              No hay materias activas actualmente. Se crearán automáticamente a medida que subas o crees Study Kits.
            </p>
          ) : (
            <div className="space-y-2.5">
              {activeMaterias.map(m => {
                const pal = OPAQUE_DARK_PALETTES[m.colorId] || OPAQUE_DARK_PALETTES.slate;
                const isEditing = editingMateriaName === m.name;

                if (isEditing) {
                  return (
                    <div
                      key={m.name}
                      className="p-3.5 rounded-xl bg-[#171b26] border border-amber-500/50 space-y-2.5"
                    >
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          className="flex-1 bg-[#0c0e14] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(m.name)}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 cursor-pointer"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingMateriaName(null)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:text-white cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>

                      {/* Paleta color en edicion */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {paletteKeys.map(key => {
                          const p = OPAQUE_DARK_PALETTES[key];
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setEditingColor(key)}
                              style={{ backgroundColor: p.cardBgHex }}
                              className={`px-2 py-1 rounded border text-[10px] flex items-center gap-1 cursor-pointer ${
                                editingColor === key ? 'border-amber-400 ring-1 ring-amber-400' : 'border-slate-800'
                              }`}
                            >
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.hex }} />
                              <span className="text-slate-300">{p.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={m.name}
                    style={{ backgroundColor: pal.cardBgHex }}
                    className={`p-3 rounded-xl border ${pal.cardBorderClass} flex items-center justify-between transition-colors`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: pal.hex }}
                        title={pal.name}
                      />
                      <span className="text-xs sm:text-sm font-semibold text-white truncate">
                        {m.name}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${pal.badgeBgClass} ${pal.badgeTextClass} border ${pal.badgeBorderClass}`}>
                        {m.count} {m.count === 1 ? 'kit' : 'kits'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(m)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Personalizar color o nombre"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {m.name.toLowerCase() !== 'general' && (
                        <button
                          type="button"
                          onClick={() => handleDelete(m.name)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                          title="Reasignar a General"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-800 bg-[#131620] flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Componente: Modal para Reasignar Materia a un Kit ─────────

interface ReassignMateriaModalProps {
  kit: StudyKit;
  kits: StudyKit[];
  userId?: string | null;
  onClose: () => void;
  onConfirm: (newCategory: string) => void;
}

const ReassignMateriaModal: React.FC<ReassignMateriaModalProps> = ({
  kit,
  kits,
  userId = null,
  onClose,
  onConfirm,
}) => {
  const currentCategory = kit.category || 'General';
  const availableMaterias = React.useMemo(() => getAllAvailableMaterias(kits, userId), [kits, userId]);

  const [selectedTarget, setSelectedTarget] = React.useState<string>(currentCategory);
  const [isCreatingNew, setIsCreatingNew] = React.useState(false);
  const [newMateriaInput, setNewMateriaInput] = React.useState('');
  const [newMateriaColor, setNewMateriaColor] = React.useState('blue');

  const paletteKeys = Object.keys(OPAQUE_DARK_PALETTES);

  const handleSave = () => {
    if (isCreatingNew) {
      const trimmed = newMateriaInput.trim();
      if (!trimmed) return;
      addCustomMateria(trimmed, newMateriaColor, userId);
      onConfirm(trimmed);
    } else {
      onConfirm(selectedTarget);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-[#0f1117] border border-slate-800 shadow-2xl flex flex-col overflow-hidden text-slate-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-[#131620]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <FolderInput className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                Reasignar Materia
              </h2>
              <p className="text-xs text-slate-400 truncate max-w-[280px] sm:max-w-sm">
                {kit.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 max-h-[70vh]">
          <div className="p-3 rounded-xl bg-[#141722] border border-slate-800 text-xs text-slate-400 flex items-center justify-between">
            <span>Materia actual del kit:</span>
            <span className="font-bold text-white px-2 py-0.5 rounded bg-slate-800">
              {currentCategory}
            </span>
          </div>

          {!isCreatingNew ? (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                Selecciona la nueva materia:
              </label>
              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
                {availableMaterias.map(m => {
                  const pal = getMateriaTheme(m.name, kits, userId);
                  const isSelected = selectedTarget.toLowerCase() === m.name.toLowerCase();
                  return (
                    <button
                      key={m.name}
                      type="button"
                      onClick={() => setSelectedTarget(m.name)}
                      style={{ backgroundColor: pal.cardBgHex }}
                      className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'border-violet-400 ring-2 ring-violet-500/50 shadow-md'
                          : `${pal.cardBorderClass}`
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: pal.hex }}
                        />
                        <span className="text-xs sm:text-sm font-semibold text-white">
                          {m.name}
                        </span>
                        <span className={`text-[10px] px-2 py-0.2 rounded-full font-bold ${pal.badgeBgClass} ${pal.badgeTextClass} border ${pal.badgeBorderClass}`}>
                          {m.count} {m.count === 1 ? 'kit' : 'kits'}
                        </span>
                      </div>

                      {isSelected && (
                        <Check className="w-4 h-4 text-violet-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setIsCreatingNew(true)}
                className="w-full mt-2 py-2 px-3 rounded-xl border border-dashed border-slate-700 hover:border-violet-500 text-xs text-slate-400 hover:text-violet-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Crear y asignar a una materia nueva</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3 p-4 rounded-xl bg-[#141722] border border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400">Crear nueva materia:</span>
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="text-[11px] text-slate-400 hover:text-white"
                >
                  Volver a existentes
                </button>
              </div>

              <input
                type="text"
                value={newMateriaInput}
                onChange={e => setNewMateriaInput(e.target.value)}
                placeholder="Nombre de la nueva materia..."
                className="w-full bg-[#0c0e14] border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500"
              />

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                  Color opaco:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {paletteKeys.map(key => {
                    const pal = OPAQUE_DARK_PALETTES[key];
                    const isSelected = newMateriaColor === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setNewMateriaColor(key)}
                        style={{ backgroundColor: pal.cardBgHex }}
                        className={`p-1.5 rounded-lg border text-left flex items-center gap-1.5 text-[10px] cursor-pointer ${
                          isSelected ? 'border-amber-400 ring-1 ring-amber-400' : 'border-slate-800'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: pal.hex }} />
                        <span className="text-slate-300 truncate">{pal.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-800 bg-[#131620] flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isCreatingNew && !newMateriaInput.trim()}
            className="px-5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Guardar Cambios</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Helper Components ──────────────────────────────────

const QuickStat: React.FC<{
  icon: React.ReactNode;
  value: string;
  label: string;
  accent: string;
}> = ({ icon, value, label }) => (
  <div className="flex items-center gap-3 p-4 rounded-2xl bg-thea-surface border border-thea-border">
    <div className="shrink-0">{icon}</div>
    <div>
      <p className="text-lg font-bold text-white leading-tight">{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  </div>
);
