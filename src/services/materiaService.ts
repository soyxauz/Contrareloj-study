/**
 * Servicio de Gestión de Materias y Paletas de Colores Oscuros y Opacos
 * Cumple con el modo oscuro opaco, sin transparencias ni brillos estridentes.
 * Asigna un color característico único a cada materia existente.
 * No genera materias vacías con 0 kits.
 */

import type { StudyKit } from '../types';
import { saveSessionItem, getSessionItem, safeLocalStorageSetItem } from './storageService';

export interface MateriaColorDef {
  id: string;
  name: string;
  hex: string;
  cardBgHex: string;
  cardBorderClass: string;
  iconBgHex: string;
  iconBorderClass: string;
  badgeBgHex: string;
  badgeBgClass: string;
  badgeBorderClass: string;
  badgeTextClass: string;
  chipActiveBgClass: string;
  chipInactiveClass: string;
}

export interface CustomMateria {
  id: string;
  name: string;
  colorId: string;
  updatedAt?: number;
}

export const OPAQUE_DARK_PALETTES: Record<string, MateriaColorDef> = {
  emerald: {
    id: 'emerald',
    name: 'Verde Esmeralda',
    hex: '#34d399',
    cardBgHex: '#0e2617',
    cardBorderClass: 'border-[#34d399]/30 hover:border-[#34d399]/60',
    iconBgHex: '#143d22',
    iconBorderClass: 'border-[#34d399]/35',
    badgeBgHex: '#0a1c11',
    badgeBgClass: 'bg-[#34d399]/10',
    badgeBorderClass: 'border-[#34d399]/25',
    badgeTextClass: 'text-[#6ee7b7]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  blue: {
    id: 'blue',
    name: 'Azul Océano',
    hex: '#38bdf8',
    cardBgHex: '#0c2238',
    cardBorderClass: 'border-[#38bdf8]/30 hover:border-[#38bdf8]/60',
    iconBgHex: '#10304f',
    iconBorderClass: 'border-[#38bdf8]/35',
    badgeBgHex: '#081829',
    badgeBgClass: 'bg-[#38bdf8]/10',
    badgeBorderClass: 'border-[#38bdf8]/25',
    badgeTextClass: 'text-[#7dd3fc]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  amber: {
    id: 'amber',
    name: 'Ámbar Cobre',
    hex: '#f59e0b',
    cardBgHex: '#2b1b0e',
    cardBorderClass: 'border-[#f59e0b]/30 hover:border-[#f59e0b]/60',
    iconBgHex: '#3d2614',
    iconBorderClass: 'border-[#f59e0b]/35',
    badgeBgHex: '#1f130a',
    badgeBgClass: 'bg-[#f59e0b]/10',
    badgeBorderClass: 'border-[#f59e0b]/25',
    badgeTextClass: 'text-[#fcd34d]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  purple: {
    id: 'purple',
    name: 'Púrpura Amatista',
    hex: '#c084fc',
    cardBgHex: '#231136',
    cardBorderClass: 'border-[#c084fc]/30 hover:border-[#c084fc]/60',
    iconBgHex: '#33194f',
    iconBorderClass: 'border-[#c084fc]/35',
    badgeBgHex: '#190c26',
    badgeBgClass: 'bg-[#c084fc]/10',
    badgeBorderClass: 'border-[#c084fc]/25',
    badgeTextClass: 'text-[#d8b4fe]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  indigo: {
    id: 'indigo',
    name: 'Índigo Profundo',
    hex: '#818cf8',
    cardBgHex: '#141838',
    cardBorderClass: 'border-[#818cf8]/30 hover:border-[#818cf8]/60',
    iconBgHex: '#1d224f',
    iconBorderClass: 'border-[#818cf8]/35',
    badgeBgHex: '#0e1126',
    badgeBgClass: 'bg-[#818cf8]/10',
    badgeBorderClass: 'border-[#818cf8]/25',
    badgeTextClass: 'text-[#a5b4fc]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  rose: {
    id: 'rose',
    name: 'Rosa Carmesí',
    hex: '#fb7185',
    cardBgHex: '#2b1019',
    cardBorderClass: 'border-[#fb7185]/30 hover:border-[#fb7185]/60',
    iconBgHex: '#3d1624',
    iconBorderClass: 'border-[#fb7185]/35',
    badgeBgHex: '#1f0c12',
    badgeBgClass: 'bg-[#fb7185]/10',
    badgeBorderClass: 'border-[#fb7185]/25',
    badgeTextClass: 'text-[#fda4af]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  teal: {
    id: 'teal',
    name: 'Turquesa Boreal',
    hex: '#2dd4bf',
    cardBgHex: '#0a2624',
    cardBorderClass: 'border-[#2dd4bf]/30 hover:border-[#2dd4bf]/60',
    iconBgHex: '#0f3835',
    iconBorderClass: 'border-[#2dd4bf]/35',
    badgeBgHex: '#071c1a',
    badgeBgClass: 'bg-[#2dd4bf]/10',
    badgeBorderClass: 'border-[#2dd4bf]/25',
    badgeTextClass: 'text-[#5eead4]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  cyan: {
    id: 'cyan',
    name: 'Cian Glaciar',
    hex: '#22d3ee',
    cardBgHex: '#092330',
    cardBorderClass: 'border-[#22d3ee]/30 hover:border-[#22d3ee]/60',
    iconBgHex: '#0d3245',
    iconBorderClass: 'border-[#22d3ee]/35',
    badgeBgHex: '#061924',
    badgeBgClass: 'bg-[#22d3ee]/10',
    badgeBorderClass: 'border-[#22d3ee]/25',
    badgeTextClass: 'text-[#67e8f9]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  orange: {
    id: 'orange',
    name: 'Naranja Ámbar',
    hex: '#fb923c',
    cardBgHex: '#2e1509',
    cardBorderClass: 'border-[#fb923c]/30 hover:border-[#fb923c]/60',
    iconBgHex: '#401e0d',
    iconBorderClass: 'border-[#fb923c]/35',
    badgeBgHex: '#210f06',
    badgeBgClass: 'bg-[#fb923c]/10',
    badgeBorderClass: 'border-[#fb923c]/25',
    badgeTextClass: 'text-[#fdba74]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  crimson: {
    id: 'crimson',
    name: 'Rojo Rubí',
    hex: '#f43f5e',
    cardBgHex: '#2d0f14',
    cardBorderClass: 'border-[#f43f5e]/30 hover:border-[#f43f5e]/60',
    iconBgHex: '#3d151c',
    iconBorderClass: 'border-[#f43f5e]/35',
    badgeBgHex: '#210a0e',
    badgeBgClass: 'bg-[#f43f5e]/10',
    badgeBorderClass: 'border-[#f43f5e]/25',
    badgeTextClass: 'text-[#fda4af]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  fuchsia: {
    id: 'fuchsia',
    name: 'Fucsia Magenta',
    hex: '#e879f9',
    cardBgHex: '#290e2b',
    cardBorderClass: 'border-[#e879f9]/30 hover:border-[#e879f9]/60',
    iconBgHex: '#3b143e',
    iconBorderClass: 'border-[#e879f9]/35',
    badgeBgHex: '#1f0a21',
    badgeBgClass: 'bg-[#e879f9]/10',
    badgeBorderClass: 'border-[#e879f9]/25',
    badgeTextClass: 'text-[#f0abfc]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  violet: {
    id: 'violet',
    name: 'Violeta Iris',
    hex: '#a78bfa',
    cardBgHex: '#1f1338',
    cardBorderClass: 'border-[#a78bfa]/30 hover:border-[#a78bfa]/60',
    iconBgHex: '#2b1b4f',
    iconBorderClass: 'border-[#a78bfa]/35',
    badgeBgHex: '#160d26',
    badgeBgClass: 'bg-[#a78bfa]/10',
    badgeBorderClass: 'border-[#a78bfa]/25',
    badgeTextClass: 'text-[#c4b5fd]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  cobalt: {
    id: 'cobalt',
    name: 'Azul Cobalto',
    hex: '#60a5fa',
    cardBgHex: '#0e1f3d',
    cardBorderClass: 'border-[#60a5fa]/30 hover:border-[#60a5fa]/60',
    iconBgHex: '#142c57',
    iconBorderClass: 'border-[#60a5fa]/35',
    badgeBgHex: '#0a162b',
    badgeBgClass: 'bg-[#60a5fa]/10',
    badgeBorderClass: 'border-[#60a5fa]/25',
    badgeTextClass: 'text-[#93c5fd]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  cerulean: {
    id: 'cerulean',
    name: 'Azul Cerúleo',
    hex: '#0ea5e9',
    cardBgHex: '#092133',
    cardBorderClass: 'border-[#0ea5e9]/30 hover:border-[#0ea5e9]/60',
    iconBgHex: '#0d2e47',
    iconBorderClass: 'border-[#0ea5e9]/35',
    badgeBgHex: '#061724',
    badgeBgClass: 'bg-[#0ea5e9]/10',
    badgeBorderClass: 'border-[#0ea5e9]/25',
    badgeTextClass: 'text-[#7dd3fc]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  aquamarine: {
    id: 'aquamarine',
    name: 'Menta Aguamarina',
    hex: '#5eead4',
    cardBgHex: '#092925',
    cardBorderClass: 'border-[#5eead4]/30 hover:border-[#5eead4]/60',
    iconBgHex: '#0d3833',
    iconBorderClass: 'border-[#5eead4]/35',
    badgeBgHex: '#061d1a',
    badgeBgClass: 'bg-[#5eead4]/10',
    badgeBorderClass: 'border-[#5eead4]/25',
    badgeTextClass: 'text-[#99f6e4]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  forest: {
    id: 'forest',
    name: 'Verde Bosque',
    hex: '#4ade80',
    cardBgHex: '#0d2616',
    cardBorderClass: 'border-[#4ade80]/30 hover:border-[#4ade80]/60',
    iconBgHex: '#12381f',
    iconBorderClass: 'border-[#4ade80]/35',
    badgeBgHex: '#081a0e',
    badgeBgClass: 'bg-[#4ade80]/10',
    badgeBorderClass: 'border-[#4ade80]/25',
    badgeTextClass: 'text-[#86efac]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  lime: {
    id: 'lime',
    name: 'Verde Lima',
    hex: '#a3e635',
    cardBgHex: '#1d280b',
    cardBorderClass: 'border-[#a3e635]/30 hover:border-[#a3e635]/60',
    iconBgHex: '#27380f',
    iconBorderClass: 'border-[#a3e635]/35',
    badgeBgHex: '#141c07',
    badgeBgClass: 'bg-[#a3e635]/10',
    badgeBorderClass: 'border-[#a3e635]/25',
    badgeTextClass: 'text-[#bef264]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  olive: {
    id: 'olive',
    name: 'Verde Oliva',
    hex: '#84cc16',
    cardBgHex: '#1d240e',
    cardBorderClass: 'border-[#84cc16]/30 hover:border-[#84cc16]/60',
    iconBgHex: '#283313',
    iconBorderClass: 'border-[#84cc16]/35',
    badgeBgHex: '#131909',
    badgeBgClass: 'bg-[#84cc16]/10',
    badgeBorderClass: 'border-[#84cc16]/25',
    badgeTextClass: 'text-[#a3e635]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  gold: {
    id: 'gold',
    name: 'Oro Imperial',
    hex: '#facc15',
    cardBgHex: '#281f07',
    cardBorderClass: 'border-[#facc15]/30 hover:border-[#facc15]/60',
    iconBgHex: '#382c0a',
    iconBorderClass: 'border-[#facc15]/35',
    badgeBgHex: '#1c1605',
    badgeBgClass: 'bg-[#facc15]/10',
    badgeBorderClass: 'border-[#facc15]/25',
    badgeTextClass: 'text-[#fde047]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  terracotta: {
    id: 'terracotta',
    name: 'Terracota Cálido',
    hex: '#ea580c',
    cardBgHex: '#2c130b',
    cardBorderClass: 'border-[#ea580c]/30 hover:border-[#ea580c]/60',
    iconBgHex: '#3d1b0f',
    iconBorderClass: 'border-[#ea580c]/35',
    badgeBgHex: '#1e0d07',
    badgeBgClass: 'bg-[#ea580c]/10',
    badgeBorderClass: 'border-[#ea580c]/25',
    badgeTextClass: 'text-[#fdba74]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  coral: {
    id: 'coral',
    name: 'Coral Suave',
    hex: '#f87171',
    cardBgHex: '#2c1214',
    cardBorderClass: 'border-[#f87171]/30 hover:border-[#f87171]/60',
    iconBgHex: '#3d191c',
    iconBorderClass: 'border-[#f87171]/35',
    badgeBgHex: '#1f0d0e',
    badgeBgClass: 'bg-[#f87171]/10',
    badgeBorderClass: 'border-[#f87171]/25',
    badgeTextClass: 'text-[#fca5a5]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  plum: {
    id: 'plum',
    name: 'Ciruela Oscuro',
    hex: '#d946ef',
    cardBgHex: '#250f28',
    cardBorderClass: 'border-[#d946ef]/30 hover:border-[#d946ef]/60',
    iconBgHex: '#35163a',
    iconBorderClass: 'border-[#d946ef]/35',
    badgeBgHex: '#1a0b1c',
    badgeBgClass: 'bg-[#d946ef]/10',
    badgeBorderClass: 'border-[#d946ef]/25',
    badgeTextClass: 'text-[#f0abfc]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  coffee: {
    id: 'coffee',
    name: 'Café Moca',
    hex: '#d97706',
    cardBgHex: '#24170d',
    cardBorderClass: 'border-[#d97706]/30 hover:border-[#d97706]/60',
    iconBgHex: '#362213',
    iconBorderClass: 'border-[#d97706]/35',
    badgeBgHex: '#191009',
    badgeBgClass: 'bg-[#d97706]/10',
    badgeBorderClass: 'border-[#d97706]/25',
    badgeTextClass: 'text-[#fcd34d]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  zinc: {
    id: 'zinc',
    name: 'Titanio Grafito',
    hex: '#94a3b8',
    cardBgHex: '#14171f',
    cardBorderClass: 'border-[#94a3b8]/30 hover:border-[#94a3b8]/60',
    iconBgHex: '#1c202b',
    iconBorderClass: 'border-[#94a3b8]/35',
    badgeBgHex: '#0e1017',
    badgeBgClass: 'bg-[#94a3b8]/10',
    badgeBorderClass: 'border-[#94a3b8]/25',
    badgeTextClass: 'text-[#cbd5e1]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  wine: {
    id: 'wine',
    name: 'Vino Borgoña',
    hex: '#e11d48',
    cardBgHex: '#2b0b14',
    cardBorderClass: 'border-[#e11d48]/30 hover:border-[#e11d48]/60',
    iconBgHex: '#3b101c',
    iconBorderClass: 'border-[#e11d48]/35',
    badgeBgHex: '#1e070e',
    badgeBgClass: 'bg-[#e11d48]/10',
    badgeBorderClass: 'border-[#e11d48]/25',
    badgeTextClass: 'text-[#fda4af]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  slate: {
    id: 'slate',
    name: 'Pizarra Grafito',
    hex: '#64748b',
    cardBgHex: '#121620',
    cardBorderClass: 'border-[#64748b]/30 hover:border-[#64748b]/60',
    iconBgHex: '#1a1f2e',
    iconBorderClass: 'border-[#64748b]/35',
    badgeBgHex: '#0d1017',
    badgeBgClass: 'bg-[#64748b]/10',
    badgeBorderClass: 'border-[#64748b]/25',
    badgeTextClass: 'text-[#94a3b8]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
};

const PALETTE_ROTATION = [
  'blue',
  'emerald',
  'amber',
  'purple',
  'indigo',
  'rose',
  'teal',
  'cyan',
  'orange',
  'crimson',
  'violet',
  'forest',
  'gold',
  'terracotta',
  'fuchsia',
  'cobalt',
  'aquamarine',
  'lime',
  'coral',
  'plum',
  'coffee',
  'wine',
  'cerulean',
  'olive',
  'zinc',
  'slate',
];
export const getMateriaStorageKey = (userId?: string | null): string => {
  return userId ? `thea_custom_materias_${userId}` : 'thea_custom_materias';
};

/**
 * Obtiene las materias personalizadas guardadas por el usuario.
 * No genera materias vacías por defecto.
 */
export function getStoredCustomMaterias(userId?: string | null): CustomMateria[] {
  try {
    const key = getMateriaStorageKey(userId);
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    // Si es usuario autenticado pero aún no tiene clave con userId, leer la clave global de respaldo
    if (userId && typeof localStorage !== 'undefined') {
      const fallbackRaw = localStorage.getItem('thea_custom_materias');
      if (fallbackRaw) {
        const parsedFallback = JSON.parse(fallbackRaw);
        if (Array.isArray(parsedFallback) && parsedFallback.length > 0) {
          return parsedFallback;
        }
      }
    }
  } catch (err) {
    console.error('Error al leer materias personalizadas:', err);
  }
  return [];
}

/**
 * Fusión acumulativa de materias personalizadas por nombre y marca temporal updatedAt (el más reciente gana).
 */
export function mergeCustomMaterias(listA: CustomMateria[], listB: CustomMateria[]): CustomMateria[] {
  const map = new Map<string, CustomMateria>();

  const addOrMerge = (m: CustomMateria) => {
    if (!m || !m.name) return;
    const key = m.name.trim().toLowerCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...m,
        name: m.name.trim(),
        updatedAt: m.updatedAt || Date.now(),
      });
      return;
    }

    const existingTime = existing.updatedAt || 0;
    const incomingTime = m.updatedAt || 0;

    // Prevalece la edición más reciente por fecha y hora
    if (incomingTime >= existingTime) {
      map.set(key, {
        ...existing,
        ...m,
        name: m.name.trim() || existing.name,
        colorId: m.colorId || existing.colorId,
        updatedAt: incomingTime,
      });
    }
  };

  if (Array.isArray(listA)) {
    for (const item of listA) addOrMerge(item);
  }
  if (Array.isArray(listB)) {
    for (const item of listB) addOrMerge(item);
  }

  return Array.from(map.values());
}

/**
 * Guarda materias personalizadas en LocalStorage e IndexedDB,
 * y emite eventos para actualizar la interfaz y Google Drive en tiempo real.
 */
export function saveCustomMaterias(
  materias: CustomMateria[],
  userId?: string | null,
  triggerCloudSync = true
): void {
  try {
    const key = getMateriaStorageKey(userId);
    const clean = materias.map(m => ({
      ...m,
      name: m.name.trim(),
      updatedAt: m.updatedAt || Date.now(),
    }));

    if (typeof localStorage !== 'undefined') {
      safeLocalStorageSetItem(key, JSON.stringify(clean));
      if (!userId) {
        safeLocalStorageSetItem('thea_custom_materias', JSON.stringify(clean));
      }
    }

    // Persistencia inmutable en IndexedDB
    saveSessionItem(key, clean).catch(() => {});

    // Notificar reactivamente a la UI
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('thea_materias_updated', {
        detail: { materias: clean, userId }
      }));

      // Disparar sincronización inmediata a Google Drive en segundo plano
      if (triggerCloudSync && userId && userId !== 'guest') {
        window.dispatchEvent(new CustomEvent('thea_materias_cloud_sync_request', {
          detail: { userId, materias: clean }
        }));
      }
    }
  } catch (err) {
    console.error('Error al guardar materias:', err);
  }
}

/**
 * Restaura las materias asíncronamente desde IndexedDB para máxima velocidad y tolerancia a fallos.
 */
export async function restoreCustomMateriasAsync(userId?: string | null): Promise<CustomMateria[]> {
  const key = getMateriaStorageKey(userId);
  try {
    const idbMaterias = await getSessionItem<CustomMateria[]>(key);
    const localMaterias = getStoredCustomMaterias(userId);
    const merged = mergeCustomMaterias(localMaterias, idbMaterias || []);
    if (merged.length > 0) {
      saveCustomMaterias(merged, userId, false);
      return merged;
    }
    return localMaterias;
  } catch (e) {
    console.warn('[materiaService] Error al restaurar materias desde IndexedDB:', e);
    return getStoredCustomMaterias(userId);
  }
}

/**
 * Determina el identificador de color característico de una materia.
 * Es 100% determinista y estable: el color depende EXCLUSIVAMENTE del nombre
 * de la materia y de las preferencias guardadas del usuario, NUNCA de la posición
 * o el orden de los kits en la lista.
 */
export function getColorIdForCategory(categoryName: string | undefined, userId?: string | null): string {
  if (!categoryName) return 'slate';
  const trimmed = categoryName.trim();
  const lower = trimmed.toLowerCase();

  // 1. Color personalizado guardado por el usuario (máxima prioridad)
  const stored = getStoredCustomMaterias(userId);
  const existing = stored.find(m => m.name.toLowerCase() === lower);
  if (existing && OPAQUE_DARK_PALETTES[existing.colorId]) {
    return existing.colorId;
  }

  // 2. Afinidad semántica determinista por materia (inmune a reordenamientos)
  if (lower.includes('meteorolog') || lower.includes('clima') || lower.includes('atmósfer') || lower.includes('tiempo')) return 'cerulean';
  if (lower.includes('gastro') || lower.includes('digestiv') || lower.includes('esófago') || lower.includes('estómag') || lower.includes('hígado') || lower.includes('intest')) return 'emerald';
  if (lower.includes('otorrino') || lower.includes('oído') || lower.includes('nariz') || lower.includes('laring') || lower.includes('audiolog')) return 'amber';
  if (lower.includes('bioquím') || lower.includes('metabol') || lower.includes('enzim') || lower.includes('molecular')) return 'violet';
  if (lower.includes('dermato') || lower.includes('piel') || lower.includes('cutáne') || lower.includes('herpes') || lower.includes('tegument')) return 'indigo';
  if (lower.includes('ginecol') || lower.includes('obstetr') || lower.includes('embaraz') || lower.includes('endometri') || lower.includes('parto')) return 'rose';
  if (lower.includes('neumo') || lower.includes('pulmon') || lower.includes('respirat') || lower.includes('asma') || lower.includes('tórax')) return 'aquamarine';
  if (lower.includes('hematol') || lower.includes('sangre') || lower.includes('anemia') || lower.includes('leucem') || lower.includes('plaquet')) return 'crimson';
  if (lower.includes('cirug') || lower.includes('quirúrg') || lower.includes('quirófano') || lower.includes('operatori')) return 'wine';
  if (lower.includes('cardio') || lower.includes('vascular') || lower.includes('corazón') || lower.includes('hemodinám')) return 'coral';
  if (lower.includes('neuro') || lower.includes('cerebro') || lower.includes('nervios')) return 'purple';
  if (lower.includes('psiquiatr') || lower.includes('psicolog') || lower.includes('mental') || lower.includes('conducta')) return 'fuchsia';
  if (lower.includes('pediatr') || lower.includes('infant') || lower.includes('niñ') || lower.includes('neonat')) return 'cyan';
  if (lower.includes('traumato') || lower.includes('ortoped') || lower.includes('óseo') || lower.includes('hueso') || lower.includes('múscul') || lower.includes('articulac')) return 'terracotta';
  if (lower.includes('oftalmo') || lower.includes('ojo') || lower.includes('visión') || lower.includes('óptica') || lower.includes('retina')) return 'cobalt';
  if (lower.includes('nefro') || lower.includes('urolog') || lower.includes('renal') || lower.includes('riñón')) return 'gold';
  if (lower.includes('endocrin') || lower.includes('hormon') || lower.includes('tiroides') || lower.includes('diabetes')) return 'orange';
  if (lower.includes('infectolog') || lower.includes('microbiol') || lower.includes('bacteri') || lower.includes('virolog') || lower.includes('inmunol') || lower.includes('parásit')) return 'teal';
  if (lower.includes('fisiolog') || lower.includes('médic') || lower.includes('medic') || lower.includes('salud') || lower.includes('farmac')) return 'blue';
  if (lower.includes('genétic') || lower.includes('adn') || lower.includes('arn') || lower.includes('herenci')) return 'lime';
  if (lower.includes('nutric') || lower.includes('dietét') || lower.includes('alimento') || lower.includes('salvia')) return 'olive';
  if (lower.includes('ecolog') || lower.includes('botán') || lower.includes('medio ambiente') || lower.includes('forest')) return 'forest';
  if (lower.includes('derecho') || lower.includes('ley') || lower.includes('legal') || lower.includes('juríd') || lower.includes('bioétic')) return 'coffee';
  if (lower.includes('computer') || lower.includes('software') || lower.includes('sistemas') || lower.includes('algoritmo') || lower.includes('código') || lower.includes('programac')) return 'indigo';
  if (lower.includes('human') || lower.includes('filosof') || lower.includes('histori') || lower.includes('literat') || lower.includes('arte')) return 'plum';
  if (lower.includes('econ') || lower.includes('finanz') || lower.includes('comerc') || lower.includes('administrac')) return 'zinc';
  if (lower.includes('químic') || lower.includes('laborat')) return 'teal';
  if (lower.includes('matemát') || lower.includes('físic') || lower.includes('álgebra') || lower.includes('estadíst')) return 'blue';
  if (lower.includes('idioma') || lower.includes('comunic') || lower.includes('lenguaj')) return 'orange';

  // 3. Hash determinista estricto del nombre si no hubo coincidencia semántica
  let hash = 0;
  for (let i = 0; i < lower.length; i++) {
    hash = ((hash << 5) - hash) + lower.charCodeAt(i);
    hash |= 0;
  }
  return PALETTE_ROTATION[Math.abs(hash) % PALETTE_ROTATION.length];
}

/**
 * Asigna un color característico único para una materia de forma determinista.
 */
export function getDistinctColorForCategory(categoryName: string, _usedColors: string[] = [], userId?: string | null): string {
  return getColorIdForCategory(categoryName, userId);
}

/**
 * Obtiene únicamente las materias que tienen al menos 1 kit asociado.
 * No genera materias vacías con 0 kits.
 * Asigna a cada materia su color fijo característico, completamente inmune al orden de los kits.
 */
export function getAllAvailableMaterias(kits: StudyKit[], userId?: string | null): { name: string; colorId: string; count: number }[] {
  const countMap = new Map<string, number>();

  // Contar kits por cada materia
  for (const kit of kits) {
    const rawCat = kit.category ? kit.category.trim() : 'General';
    if (!rawCat) continue;
    countMap.set(rawCat, (countMap.get(rawCat) || 0) + 1);
  }

  // Ordenar alfabéticamente para estabilidad total en los filtros
  return Array.from(countMap.entries())
    .filter(([_, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
    .map(([name, count]) => ({
      name,
      colorId: getColorIdForCategory(name, userId),
      count,
    }));
}

/**
 * Obtiene el tema visual de una categoría/materia.
 * Depende exclusivamente de la materia, sin importar la posición de ningún kit.
 */
export function getMateriaTheme(categoryName: string | undefined, _kits?: StudyKit[], userId?: string | null): MateriaColorDef {
  if (!categoryName) return OPAQUE_DARK_PALETTES.slate;
  const colorId = getColorIdForCategory(categoryName, userId);
  return OPAQUE_DARK_PALETTES[colorId] || OPAQUE_DARK_PALETTES.slate;
}

/**
 * Guarda una nueva asignación o edición de materia
 */
export function addCustomMateria(name: string, colorId?: string, userId?: string | null): CustomMateria {
  const trimmed = name.trim();
  const assignedColor = (colorId && colorId in OPAQUE_DARK_PALETTES) ? colorId : getDistinctColorForCategory(trimmed, [], userId);
  const current = getStoredCustomMaterias(userId);
  const existing = current.find(m => m.name.toLowerCase() === trimmed.toLowerCase());
  const now = Date.now();
  if (existing) {
    existing.colorId = assignedColor;
    existing.updatedAt = now;
    saveCustomMaterias(current, userId, true);
    return existing;
  }
  const newMateria: CustomMateria = {
    id: 'mat-' + now.toString(36),
    name: trimmed,
    colorId: assignedColor,
    updatedAt: now,
  };
  const updated = [...current, newMateria];
  saveCustomMaterias(updated, userId, true);
  return newMateria;
}

export function updateCustomMateria(oldName: string, newName: string, colorId: string, userId?: string | null): void {
  const current = getStoredCustomMaterias(userId);
  const now = Date.now();
  const updated = current.map(m => {
    if (m.name.toLowerCase() === oldName.toLowerCase()) {
      return { ...m, name: newName.trim(), colorId, updatedAt: now };
    }
    return m;
  });
  saveCustomMaterias(updated, userId, true);
}

export function deleteCustomMateria(name: string, userId?: string | null): void {
  const current = getStoredCustomMaterias(userId);
  const updated = current.filter(m => m.name.toLowerCase() !== name.toLowerCase());
  saveCustomMaterias(updated, userId, true);
}
