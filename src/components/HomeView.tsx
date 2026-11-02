import React from 'react';
import { createPortal } from 'react-dom';
import type { StudyKit, StudyMode } from '../types';
import type { InputTab } from './CreateStudyKitView';
import {
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
  Globe,
  Trash2,
  Microscope,
  Binary,
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
  LogIn,
  Mic,
} from 'lucide-react';
import { getGlobalRealStats, getBookRealStats } from '../services/statsService';
import {
  OPAQUE_DARK_PALETTES,
  getMateriaTheme,
  getAllAvailableMaterias,
  addCustomMateria,
  updateCustomMateria,
  deleteCustomMateria,
} from '../services/materiaService';

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

export const HomeView: React.FC<HomeViewProps> = ({
  kits,
  currentKit,
  onSelectKit,
  onNavigate,
  onDeleteKit,
  onUpdateKit,
  userId = null,
  onOpenAuth,
  onDeleteKitsBatch,
  onChangeCategoryBatch,
  onResetDefaultKits,
}) => {

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

  // Kits filtrados por la materia seleccionada, ubicando siempre al principio el último kit abierto o activo
  const filteredKits = React.useMemo(() => {
    const baseKits = selectedMateria === 'all'
      ? kits
      : kits.filter(k => (k.category || 'General').trim().toLowerCase() === selectedMateria.trim().toLowerCase());

    if (!currentKit) return baseKits;

    const activeIdx = baseKits.findIndex(k => k.id === currentKit.id);
    if (activeIdx <= 0) return baseKits;

    const activeKit = baseKits[activeIdx];
    const rest = baseKits.filter((_, i) => i !== activeIdx);
    return [activeKit, ...rest];
  }, [kits, selectedMateria, currentKit]);

const KIT_ICON_COMPONENTS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Lungs: LungsIllustration,
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
  Hospital,
  Microscope,
  Scale,
  Dna,
  Stethoscope,
  Pill,
  Atom,
  FlaskConical,
  Binary,
  Cpu,
  TrendingUp,
  Landmark,
  Calculator,
  Brain,
  BookOpen,
};

  const renderKitIcon = (iconName: string, colorHex?: string) => {
    const IconComp = KIT_ICON_COMPONENTS[iconName] || GraduationCap;
    return <IconComp className="w-5 h-5" style={colorHex ? { color: colorHex } : undefined} />;
  };

  const renderWatermarkIcon = (iconName: string, category?: string, title?: string) => {
    if (iconName === 'Hospital' || iconName === 'Stethoscope') {
      return <HospitalIllustration className="w-28 h-28" />;
    }
    const isMed = /fisiopatolog|medicin|salud|enfermedad|hospital|clinica/i.test(`${category || ''} ${title || ''}`);
    if (isMed && (iconName === 'Hospital' || iconName === 'Stethoscope')) {
      return <HospitalIllustration className="w-28 h-28" />;
    }
    const IconComp = KIT_ICON_COMPONENTS[iconName] || GraduationCap;
    return <IconComp className="w-28 h-28 stroke-[2.2] fill-current/25" />;
  };

  const [statsVersion, setStatsVersion] = React.useState(0);

  // Escuchar eventos reales de guardado y sincronización sin sobrecargar el hilo con focus/blur
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
      map.set(m.name.trim().toLowerCase(), getMateriaTheme(m.name, kits, userId));
    }
    return map;
  }, [availableMateriasList, kits, userId]);

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-5 lg:px-6 py-4 sm:py-6">

      {/* ── Header de Espacio de Estudio (Estilo Linear / Raycast Studio) ── */}
      <section className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Tus Study Kits
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-white/[0.06] text-slate-300 border border-white/[0.12] text-xs font-semibold tabular-nums shadow-sm">
              {kits.length}
            </span>
          </div>

          {/* Barra de Acciones Globales Unificada */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onNavigate('create', 'topic')}
              className="active-press px-3.5 py-1.5 rounded-lg bg-white text-zinc-950 hover:bg-zinc-200 font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Nuevo Kit</span>
            </button>

            <button
              type="button"
              onClick={() => setShowMateriaManagerModal(true)}
              className="active-press text-xs text-slate-300 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/15 transition-colors cursor-pointer font-medium"
              title="Gestionar materias de estudio"
            >
              <FolderEdit className="w-3.5 h-3.5 text-slate-400" />
              <span>Materias</span>
            </button>

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
                className={`active-press text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-medium transition-colors cursor-pointer ${
                  isSelectionMode
                    ? 'bg-white/[0.12] border-white/25 text-white'
                    : 'text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] hover:border-white/15'
                }`}
                title={isSelectionMode ? 'Salir del modo selección' : 'Seleccionar libros para cambiarlos de materia o eliminarlos'}
              >
                <CheckSquare className="w-3.5 h-3.5 text-slate-400" />
                <span>{isSelectionMode ? 'Cancelar' : 'Seleccionar'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="active-press text-xs text-slate-300 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/15 transition-colors cursor-pointer font-medium"
            >
              <BarChart3 className="w-3.5 h-3.5 text-slate-400" />
              <span>Analíticas</span>
            </button>
          </div>
        </div>

        {/* ── Micro-Tarjetas de Telemetría Studio (Estilo Apple / Linear Studio) ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          {/* Card 1: Racha */}
          <div
            className="p-3.5 sm:p-4 rounded-2xl bg-white/[0.02] border border-white/[0.07] shadow-sm shadow-black/20 flex flex-col justify-between cursor-default select-none"
            style={{
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
            }}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 truncate">
                Racha Activa
              </span>
              <div className="w-6 h-6 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-slate-300 shrink-0">
                <Flame className="w-3.5 h-3.5 text-slate-300" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline">
                <span className="text-xl sm:text-2xl font-bold tracking-tight text-white tabular-nums">
                  {globalStats.realStreakDays}
                </span>
                <span className="text-xs text-slate-400 font-medium ml-1.5">
                  {globalStats.realStreakDays === 1 ? 'día' : 'días'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-normal truncate">
                {globalStats.realStreakDays > 0 ? 'Constancia activa' : 'Comienza hoy'}
              </p>
            </div>
          </div>

          {/* Card 2: Preguntas */}
          <div
            className="p-3.5 sm:p-4 rounded-2xl bg-white/[0.02] border border-white/[0.07] shadow-sm shadow-black/20 flex flex-col justify-between cursor-default select-none"
            style={{
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
            }}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 truncate">
                Preguntas
              </span>
              <div className="w-6 h-6 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-slate-300 shrink-0">
                <Brain className="w-3.5 h-3.5 text-slate-300" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline">
                <span className="text-xl sm:text-2xl font-bold tracking-tight text-white tabular-nums">
                  {globalStats.totalQuestions}
                </span>
                <span className="text-xs text-slate-400 font-medium ml-1.5">
                  reactivos
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-normal truncate">
                En tu biblioteca
              </p>
            </div>
          </div>

          {/* Card 3: Flashcards */}
          <div
            className="p-3.5 sm:p-4 rounded-2xl bg-white/[0.02] border border-white/[0.07] shadow-sm shadow-black/20 flex flex-col justify-between cursor-default select-none"
            style={{
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
            }}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 truncate">
                Flashcards
              </span>
              <div className="w-6 h-6 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-slate-300 shrink-0">
                <Layers className="w-3.5 h-3.5 text-slate-300" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline">
                <span className="text-xl sm:text-2xl font-bold tracking-tight text-white tabular-nums">
                  {globalStats.totalFlashcardsMastered}/{globalStats.totalFlashcards}
                </span>
                <span className="text-xs text-slate-400 font-medium ml-1.5">
                  fichas
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-normal truncate">
                Memorización activa
              </p>
            </div>
          </div>

          {/* Card 4: Study Kits */}
          <div
            className="p-3.5 sm:p-4 rounded-2xl bg-white/[0.02] border border-white/[0.07] shadow-sm shadow-black/20 flex flex-col justify-between cursor-default select-none"
            style={{
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
            }}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 truncate">
                Study Kits
              </span>
              <div className="w-6 h-6 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-slate-300 shrink-0">
                <Trophy className="w-3.5 h-3.5 text-slate-300" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline">
                <span className="text-xl sm:text-2xl font-bold tracking-tight text-white tabular-nums">
                  {kits.length}
                </span>
                <span className="text-xs text-slate-400 font-medium ml-1.5">
                  {kits.length === 1 ? 'kit' : 'kits'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-normal truncate">
                Activos en tu espacio
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Tus Study Kits ───────────────────────── */}
      <section className="mb-6">
        {/* ── Barra de Filtro de Materias ── */}
        {availableMateriasList.length > 0 && (
          <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1.5 scrollbar-none">
            <span className="text-xs text-slate-500 flex items-center gap-1 shrink-0 mr-1 font-medium">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              Materia:
            </span>

            {/* Todas */}
            <button
              type="button"
              onClick={() => setSelectedMateria('all')}
              className={`active-press px-3.5 py-1.5 rounded-xl text-xs font-medium shrink-0 cursor-pointer tabular-nums flex items-center gap-2 border transition-[transform,background-color,border-color] ${
                selectedMateria === 'all'
                  ? 'bg-white/[0.12] text-white border-white/25 shadow-sm shadow-black/40'
                  : 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-white hover:border-white/20 hover:bg-white/[0.06]'
              }`}
            >
              <span>Todas</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold border ${
                selectedMateria === 'all'
                  ? 'bg-white/[0.10] text-white border-white/15'
                  : 'bg-white/[0.05] text-slate-400 border-white/[0.06]'
              }`}>
                {kits.length}
              </span>
            </button>

            {/* Chips de Materia con Superficie Unificada Dark Glass (Linear Studio) */}
            {availableMateriasList.map(materia => {
              const isSelected = selectedMateria.trim().toLowerCase() === materia.name.trim().toLowerCase();
              return (
                <button
                  key={materia.name}
                  type="button"
                  onClick={() => setSelectedMateria(materia.name)}
                  className={`active-press px-3.5 py-1.5 rounded-xl text-xs font-medium shrink-0 cursor-pointer flex items-center gap-2 border tabular-nums transition-[transform,background-color,border-color] ${
                    isSelected
                      ? 'bg-white/[0.12] text-white border-white/25 shadow-sm shadow-black/40'
                      : 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:text-white hover:border-white/20 hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="tracking-tight">{materia.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold border ${
                    isSelected
                      ? 'bg-white/[0.10] text-white border-white/15'
                      : 'bg-white/[0.05] text-slate-400 border-white/[0.06]'
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {/* Tarjetas de kits con fondo tintado distintivo y espaciado amplio Studio Space */}
            {filteredKits.map((kit, index) => {
              const isActive = currentKit?.id === kit.id;
              const kStats = bookStatsMap.get(kit.id) || getBookRealStats(kit, userId);
              const catKey = (kit.category || 'General').trim().toLowerCase();
              const mTheme = materiaThemeMap.get(catKey) || getMateriaTheme(kit.category, kits, userId);
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
                    background: `radial-gradient(ellipse 120% 90% at 0% 0%, ${mTheme.hex}22 0%, ${mTheme.cardBgHex} 65%, #0e0b16 100%)`,
                    borderColor: `${mTheme.hex}30`,
                    animationDelay: `${Math.min(index * 25, 200)}ms`,
                  }}
                  className={`animate-stagger-item glass-specular group relative text-left p-6 sm:p-7 rounded-[26px] border cursor-pointer overflow-hidden flex flex-col justify-between min-h-[220px] transition-all duration-200 ease-out hover:scale-[1.015] hover:-translate-y-1.5 hover:shadow-2xl hover:border-white/35 active:scale-[0.985] ${
                    isSelectionMode && isKitSelected
                      ? 'ring-2 ring-white/50 border-white shadow-2xl'
                      : isActive
                      ? 'ring-1 ring-white/30 border-white/40 shadow-2xl'
                      : ''
                  }`}
                >
                  {/* Línea de luz superior con el color distintivo de la materia */}
                  <div
                    className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity duration-200"
                    style={{
                      background: `linear-gradient(90deg, ${mTheme.hex}cc 0%, ${mTheme.hex}35 60%, transparent 100%)`,
                    }}
                  />

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
                              ? 'bg-white text-zinc-950 border-white shadow-md'
                              : 'bg-black/50 border-white/30 text-transparent hover:border-white/70'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span
                            className="text-[11px] font-semibold tracking-wider uppercase"
                            style={{ color: mTheme.hex }}
                          >
                            {kit.category || 'General'}
                          </span>
                          {kit.sourceLanguage && kit.sourceLanguage !== 'Español' && (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
                              <Globe className="w-3 h-3 text-slate-500" />
                              <span>ES (orig. {kit.sourceLanguage})</span>
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-white text-base sm:text-lg leading-snug line-clamp-2 tracking-tight group-hover:text-white transition-colors">
                          {kit.title}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      {isActive && (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-white/15 text-white border border-white/25 shadow-sm">
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
                          className={`active-press p-2 sm:p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/15 transition-[transform,background-color] cursor-pointer ${
                            isMenuOpen ? 'bg-white/20 text-white' : ''
                          }`}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {/* Dropdown contextual */}
                        {isMenuOpen && (
                          <div
                            className="absolute right-0 top-full mt-1.5 w-44 rounded-2xl bg-thea-surface border border-thea-border shadow-2xl py-1.5 z-30 animate-fadeIn"
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setKitMenuOpenId(null);
                                setReassignKitModal(kit);
                              }}
                              className="w-full px-3.5 py-2 text-left text-xs text-slate-200 hover:bg-thea-surfaceLight hover:text-white flex items-center gap-2 transition-colors cursor-pointer"
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
                                className="w-full px-3.5 py-2 text-left text-xs text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 flex items-center gap-2 transition-colors cursor-pointer border-t border-thea-border/80"
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

                  {/* Bottom Area: Estadísticas + Micro-barra de progreso con respiración amplia */}
                  <div className="mt-7 relative z-10 space-y-3">
                    {/* Estadísticas del kit */}
                    <div className="flex items-center gap-4 text-xs text-white/90 font-medium flex-wrap tabular-nums">
                      <span className="flex items-center gap-1.5" title={`Smart Study - ${kStats.levelName}`}>
                        <Brain className="w-3.5 h-3.5 shrink-0" style={{ color: mTheme.hex }} />
                        <span>
                          {kStats.levelCorrectCount > 0 || kStats.level > 1
                            ? `Nivel ${kStats.level}: ${kStats.levelCorrectCount}/${kStats.levelTarget} (${smartStudyPct}%)`
                            : (kStats.questionsAnswered > 0
                                ? `Nivel 1: 0/${kStats.levelTarget} (0%)`
                                : `Nivel 1: 0%`)}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 shrink-0" style={{ color: mTheme.hex }} />
                        <span>{kStats.flashcardsMastered}/{kStats.flashcardsTotal} cards</span>
                      </span>
                      {kStats.assetsCount > 0 && (
                        <span className="flex items-center gap-1.5">
                          <ImageIcon className="w-3.5 h-3.5 text-white/70 shrink-0" />
                          <span>{kStats.assetsCount} img</span>
                        </span>
                      )}
                    </div>

                    {/* Barra de progreso de precisión con color distintivo de la materia */}
                    <div className="w-full h-1 rounded-full bg-black/50 overflow-hidden">
                      <div
                        style={{
                          width: `${progressPercent}%`,
                          backgroundColor: mTheme.hex,
                        }}
                        className="h-full rounded-full transition-[width] duration-300 ease-out shadow-sm"
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Create New Kit Card con feedback táctil elástico y respiración amplia */}
            <button
              onClick={() => onNavigate('create')}
              className="group flex flex-col items-center justify-center p-7 rounded-[26px] border border-dashed border-white/15 hover:border-white/35 bg-white/[0.02] hover:bg-white/[0.05] glass-specular transition-all duration-200 ease-out hover:scale-[1.015] hover:-translate-y-1.5 hover:shadow-2xl active:scale-[0.985] min-h-[220px] cursor-pointer"
            >
              <div className="w-11 h-11 rounded-2xl bg-white/[0.06] group-hover:bg-white/[0.12] group-hover:scale-110 border border-white/10 flex items-center justify-center mb-3 transition-all duration-200">
                <Plus className="w-5 h-5 text-white/70 group-hover:text-white transition-colors" />
              </div>
              <span className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">
                Nuevo Study Kit
              </span>
              <span className="text-xs text-slate-500 mt-1">
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 animate-fadeIn"
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-xl bg-thea-surface border border-thea-border rounded-2xl shadow-2xl p-3 sm:p-4 flex items-center justify-between gap-3 animate-slideUp">
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
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-thea-surfaceLight transition-colors cursor-pointer"
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
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 animate-fadeIn"
          onClick={() => setShowBatchMateriaModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-thea-surface border border-thea-border shadow-2xl flex flex-col overflow-hidden text-slate-100"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-thea-border flex items-center justify-between shrink-0 bg-thea-surfaceLight/50">
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
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-thea-surfaceLight transition-colors cursor-pointer"
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
                  className="w-full bg-thea-bg border border-thea-border rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                />
              </div>

              {/* Vista previa de libros afectados */}
              <div>
                <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                  Libros seleccionados ({selectedKitIds.size}):
                </span>
                <div className="bg-thea-bg/80 border border-thea-border rounded-xl p-2.5 max-h-28 overflow-y-auto space-y-1 scrollbar-none">
                  {kits.filter(k => selectedKitIds.has(k.id)).map(k => (
                    <div key={k.id} className="text-[11px] text-slate-300 flex items-center gap-2 truncate">
                      <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{k.title}</span>
                      <span className="text-[10px] text-slate-500 shrink-0 ml-auto">({k.category || 'General'})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 sm:p-4 border-t border-thea-border bg-thea-surfaceLight/50 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowBatchMateriaModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-thea-surfaceLight transition-colors cursor-pointer"
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
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 animate-fadeIn"
          onClick={() => setShowBatchDeleteModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-thea-surface border border-rose-500/40 shadow-2xl flex flex-col overflow-hidden text-slate-100"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-thea-border flex items-center justify-between shrink-0 bg-thea-surfaceLight/50">
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
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-thea-surfaceLight transition-colors cursor-pointer"
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
              <div className="bg-thea-bg/80 border border-thea-border rounded-xl p-2.5 max-h-36 overflow-y-auto space-y-1.5 scrollbar-none">
                {kits.filter(k => selectedKitIds.has(k.id)).map(k => (
                  <div key={k.id} className="text-xs text-slate-300 flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{k.title}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 sm:p-4 border-t border-thea-border bg-thea-surfaceLight/50 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowBatchDeleteModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-thea-surfaceLight transition-colors cursor-pointer"
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[85vh] rounded-2xl bg-thea-surface border border-thea-border shadow-2xl flex flex-col overflow-hidden text-slate-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-thea-border flex items-center justify-between shrink-0 bg-thea-surfaceLight/50">
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
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-thea-surfaceLight transition-colors cursor-pointer"
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
                const isEditing = editingMateriaName === m.name;

                if (isEditing) {
                  return (
                    <div
                      key={m.name}
                      className="p-3.5 rounded-xl bg-thea-surfaceLight/80 border border-amber-500/50 space-y-2.5"
                    >
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          className="flex-1 bg-thea-bg border border-thea-border rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
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
                          className="px-2.5 py-1.5 rounded-lg bg-thea-surface text-slate-300 text-xs hover:text-white border border-thea-border cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>

                      {/* Paleta color en edicion */}
                      <div className="flex flex-wrap gap-1.5 pt-1 max-h-48 overflow-y-auto pr-1">
                        {paletteKeys.map(key => {
                          const p = OPAQUE_DARK_PALETTES[key];
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setEditingColor(key)}
                              style={{ backgroundColor: p.cardBgHex }}
                              className={`px-2 py-1 rounded border text-[10px] flex items-center gap-1 cursor-pointer ${
                                editingColor === key ? 'border-amber-400 ring-1 ring-amber-400' : 'border-thea-border'
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
                    className="p-3 rounded-xl border border-white/[0.08] bg-white/[0.03] flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xs sm:text-sm font-semibold text-white truncate">
                        {m.name}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-white/[0.05] text-slate-400 border border-white/[0.08] tabular-nums">
                        {m.count} {m.count === 1 ? 'kit' : 'kits'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(m)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-thea-surfaceLight transition-colors cursor-pointer"
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
        <div className="p-3 sm:p-4 border-t border-thea-border bg-thea-surfaceLight/50 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-200 hover:text-white bg-thea-surfaceLight hover:bg-thea-surfaceLight/80 border border-thea-border transition-colors cursor-pointer"
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-thea-surface border border-thea-border shadow-2xl flex flex-col overflow-hidden text-slate-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-thea-border flex items-center justify-between shrink-0 bg-thea-surfaceLight/50">
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
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-thea-surfaceLight transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 max-h-[70vh]">
          <div className="p-3 rounded-xl bg-thea-surfaceLight/60 border border-thea-border text-xs text-slate-400 flex items-center justify-between">
            <span>Materia actual del kit:</span>
            <span className="font-bold text-white px-2 py-0.5 rounded bg-thea-surface border border-thea-border">
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
                  const isSelected = selectedTarget.toLowerCase() === m.name.toLowerCase();
                  return (
                    <button
                      key={m.name}
                      type="button"
                      onClick={() => setSelectedTarget(m.name)}
                      className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-white/[0.10] border-white/30 ring-1 ring-white/20 shadow-md'
                          : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.08]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs sm:text-sm font-semibold text-white">
                          {m.name}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-white/[0.05] text-slate-400 border border-white/[0.08] tabular-nums">
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
                className="w-full mt-2 py-2 px-3 rounded-xl border border-dashed border-thea-border hover:border-violet-500 text-xs text-slate-400 hover:text-violet-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Crear y asignar a una materia nueva</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3 p-4 rounded-xl bg-thea-surfaceLight/60 border border-thea-border">
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
                className="w-full bg-thea-bg border border-thea-border rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500"
              />

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                  Color opaco:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-52 overflow-y-auto pr-1">
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
                          isSelected ? 'border-amber-400 ring-1 ring-amber-400' : 'border-thea-border'
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
        <div className="p-3 sm:p-4 border-t border-thea-border bg-thea-surfaceLight/50 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-thea-surfaceLight transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isCreatingNew && !newMateriaInput.trim()}
            className="active-press px-5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white hover:bg-zinc-200 text-zinc-950 disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5 shadow-md"
          >
            <Check className="w-4 h-4" />
            <span>Guardar Cambios</span>
          </button>
        </div>
      </div>
    </div>
  );
};
