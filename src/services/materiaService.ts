/**
 * Servicio de Gestión de Materias y Paletas de Colores Oscuros y Opacos
 * Cumple con el modo oscuro opaco, sin transparencias ni brillos estridentes.
 * Asigna un color característico único a cada materia existente.
 * No genera materias vacías con 0 kits.
 */

import type { StudyKit } from '../types';
import { saveSessionItem, getSessionItem } from './storageService';

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
    name: 'Salvia Nórdica',
    hex: '#7da287',
    cardBgHex: '#131f18',
    cardBorderClass: 'border-white/[0.08] hover:border-[#7da287]/40',
    iconBgHex: '#18291f',
    iconBorderClass: 'border-[#7da287]/30',
    badgeBgHex: '#0f1712',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#7da287]/25',
    badgeTextClass: 'text-[#9fc0a8]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  blue: {
    id: 'blue',
    name: 'Azul Pizarra',
    hex: '#6888a7',
    cardBgHex: '#121a24',
    cardBorderClass: 'border-white/[0.08] hover:border-[#6888a7]/40',
    iconBgHex: '#172230',
    iconBorderClass: 'border-[#6888a7]/30',
    badgeBgHex: '#0e141c',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#6888a7]/25',
    badgeTextClass: 'text-[#8ca6c2]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  amber: {
    id: 'amber',
    name: 'Ocre Arena',
    hex: '#c99a6b',
    cardBgHex: '#231c15',
    cardBorderClass: 'border-white/[0.08] hover:border-[#c99a6b]/40',
    iconBgHex: '#2e251b',
    iconBorderClass: 'border-[#c99a6b]/30',
    badgeBgHex: '#18130e',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#c99a6b]/25',
    badgeTextClass: 'text-[#deb993]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  purple: {
    id: 'purple',
    name: 'Lavanda Ceniza',
    hex: '#9b8cb8',
    cardBgHex: '#1c1825',
    cardBorderClass: 'border-white/[0.08] hover:border-[#9b8cb8]/40',
    iconBgHex: '#252031',
    iconBorderClass: 'border-[#9b8cb8]/30',
    badgeBgHex: '#131019',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#9b8cb8]/25',
    badgeTextClass: 'text-[#baaed1]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  indigo: {
    id: 'indigo',
    name: 'Azul Niebla',
    hex: '#7b88b6',
    cardBgHex: '#141826',
    cardBorderClass: 'border-white/[0.08] hover:border-[#7b88b6]/40',
    iconBgHex: '#1b2033',
    iconBorderClass: 'border-[#7b88b6]/30',
    badgeBgHex: '#0f121d',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#7b88b6]/25',
    badgeTextClass: 'text-[#9ea8ce]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  rose: {
    id: 'rose',
    name: 'Rosa Palo',
    hex: '#b87a8b',
    cardBgHex: '#22161b',
    cardBorderClass: 'border-white/[0.08] hover:border-[#b87a8b]/40',
    iconBgHex: '#2d1d23',
    iconBorderClass: 'border-[#b87a8b]/30',
    badgeBgHex: '#170f12',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#b87a8b]/25',
    badgeTextClass: 'text-[#d09ba9]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  teal: {
    id: 'teal',
    name: 'Liquen Ártico',
    hex: '#6a9997',
    cardBgHex: '#122021',
    cardBorderClass: 'border-white/[0.08] hover:border-[#6a9997]/40',
    iconBgHex: '#182b2c',
    iconBorderClass: 'border-[#6a9997]/30',
    badgeBgHex: '#0d1617',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#6a9997]/25',
    badgeTextClass: 'text-[#8db6b4]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  cyan: {
    id: 'cyan',
    name: 'Acero Glacial',
    hex: '#689ba8',
    cardBgHex: '#121c21',
    cardBorderClass: 'border-white/[0.08] hover:border-[#689ba8]/40',
    iconBgHex: '#18262d',
    iconBorderClass: 'border-[#689ba8]/30',
    badgeBgHex: '#0d1317',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#689ba8]/25',
    badgeTextClass: 'text-[#8cb8c3]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  orange: {
    id: 'orange',
    name: 'Arcilla Arena',
    hex: '#b8795c',
    cardBgHex: '#221713',
    cardBorderClass: 'border-white/[0.08] hover:border-[#b8795c]/40',
    iconBgHex: '#2d1e19',
    iconBorderClass: 'border-[#b8795c]/30',
    badgeBgHex: '#170f0d',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#b8795c]/25',
    badgeTextClass: 'text-[#d09981]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  crimson: {
    id: 'crimson',
    name: 'Carmín Desaturado',
    hex: '#aa606c',
    cardBgHex: '#211317',
    cardBorderClass: 'border-white/[0.08] hover:border-[#aa606c]/40',
    iconBgHex: '#2c191f',
    iconBorderClass: 'border-[#aa606c]/30',
    badgeBgHex: '#160d10',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#aa606c]/25',
    badgeTextClass: 'text-[#c6838e]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  fuchsia: {
    id: 'fuchsia',
    name: 'Malva Ahumado',
    hex: '#9f6fa1',
    cardBgHex: '#1f1621',
    cardBorderClass: 'border-white/[0.08] hover:border-[#9f6fa1]/40',
    iconBgHex: '#2a1e2d',
    iconBorderClass: 'border-[#9f6fa1]/30',
    badgeBgHex: '#150f16',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#9f6fa1]/25',
    badgeTextClass: 'text-[#bd91bf]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  violet: {
    id: 'violet',
    name: 'Brezo Nórdico',
    hex: '#8c7db0',
    cardBgHex: '#191523',
    cardBorderClass: 'border-white/[0.08] hover:border-[#8c7db0]/40',
    iconBgHex: '#221c30',
    iconBorderClass: 'border-[#8c7db0]/30',
    badgeBgHex: '#110e17',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#8c7db0]/25',
    badgeTextClass: 'text-[#aba0ca]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  cobalt: {
    id: 'cobalt',
    name: 'Cobalto Pizarra',
    hex: '#5e7ba8',
    cardBgHex: '#111824',
    cardBorderClass: 'border-white/[0.08] hover:border-[#5e7ba8]/40',
    iconBgHex: '#172030',
    iconBorderClass: 'border-[#5e7ba8]/30',
    badgeBgHex: '#0c1017',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#5e7ba8]/25',
    badgeTextClass: 'text-[#829bc1]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  cerulean: {
    id: 'cerulean',
    name: 'Fiordo Marino',
    hex: '#628fa6',
    cardBgHex: '#121b22',
    cardBorderClass: 'border-white/[0.08] hover:border-[#628fa6]/40',
    iconBgHex: '#18242e',
    iconBorderClass: 'border-[#628fa6]/30',
    badgeBgHex: '#0c1217',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#628fa6]/25',
    badgeTextClass: 'text-[#84acc1]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  aquamarine: {
    id: 'aquamarine',
    name: 'Celadón Pálido',
    hex: '#729e96',
    cardBgHex: '#121e1d',
    cardBorderClass: 'border-white/[0.08] hover:border-[#729e96]/40',
    iconBgHex: '#182927',
    iconBorderClass: 'border-[#729e96]/30',
    badgeBgHex: '#0c1414',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#729e96]/25',
    badgeTextClass: 'text-[#92bbb4]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  forest: {
    id: 'forest',
    name: 'Musgo Profundo',
    hex: '#689478',
    cardBgHex: '#121e17',
    cardBorderClass: 'border-white/[0.08] hover:border-[#689478]/40',
    iconBgHex: '#18291f',
    iconBorderClass: 'border-[#689478]/30',
    badgeBgHex: '#0c140f',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#689478]/25',
    badgeTextClass: 'text-[#8bb399]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  lime: {
    id: 'lime',
    name: 'Salvia Seca',
    hex: '#8a9e62',
    cardBgHex: '#181e13',
    cardBorderClass: 'border-white/[0.08] hover:border-[#8a9e62]/40',
    iconBgHex: '#202819',
    iconBorderClass: 'border-[#8a9e62]/30',
    badgeBgHex: '#10140c',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#8a9e62]/25',
    badgeTextClass: 'text-[#a9b98c]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  olive: {
    id: 'olive',
    name: 'Oliva Ceniza',
    hex: '#7e8b61',
    cardBgHex: '#171b12',
    cardBorderClass: 'border-white/[0.08] hover:border-[#7e8b61]/40',
    iconBgHex: '#202418',
    iconBorderClass: 'border-[#7e8b61]/30',
    badgeBgHex: '#0f120c',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#7e8b61]/25',
    badgeTextClass: 'text-[#9fa985]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  gold: {
    id: 'gold',
    name: 'Latón Antiguo',
    hex: '#bfa365',
    cardBgHex: '#211d13',
    cardBorderClass: 'border-white/[0.08] hover:border-[#bfa365]/40',
    iconBgHex: '#2c2719',
    iconBorderClass: 'border-[#bfa365]/30',
    badgeBgHex: '#16130c',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#bfa365]/25',
    badgeTextClass: 'text-[#d6c088]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  terracotta: {
    id: 'terracotta',
    name: 'Siena Tostada',
    hex: '#a96a56',
    cardBgHex: '#201511',
    cardBorderClass: 'border-white/[0.08] hover:border-[#a96a56]/40',
    iconBgHex: '#2b1c17',
    iconBorderClass: 'border-[#a96a56]/30',
    badgeBgHex: '#150e0b',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#a96a56]/25',
    badgeTextClass: 'text-[#c68977]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  coral: {
    id: 'coral',
    name: 'Coral Pálido',
    hex: '#b67575',
    cardBgHex: '#211616',
    cardBorderClass: 'border-white/[0.08] hover:border-[#b67575]/40',
    iconBgHex: '#2c1d1d',
    iconBorderClass: 'border-[#b67575]/30',
    badgeBgHex: '#160e0e',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#b67575]/25',
    badgeTextClass: 'text-[#cf9494]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  plum: {
    id: 'plum',
    name: 'Ciruela Ceniza',
    hex: '#936b94',
    cardBgHex: '#1d151e',
    cardBorderClass: 'border-white/[0.08] hover:border-[#936b94]/40',
    iconBgHex: '#271c28',
    iconBorderClass: 'border-[#936b94]/30',
    badgeBgHex: '#130e14',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#936b94]/25',
    badgeTextClass: 'text-[#b18cb2]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  coffee: {
    id: 'coffee',
    name: 'Moca Tostado',
    hex: '#8e705b',
    cardBgHex: '#1c1613',
    cardBorderClass: 'border-white/[0.08] hover:border-[#8e705b]/40',
    iconBgHex: '#251e19',
    iconBorderClass: 'border-[#8e705b]/30',
    badgeBgHex: '#130f0c',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#8e705b]/25',
    badgeTextClass: 'text-[#ad907c]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  zinc: {
    id: 'zinc',
    name: 'Titanio Cepillado',
    hex: '#8c929d',
    cardBgHex: '#17191d',
    cardBorderClass: 'border-white/[0.08] hover:border-[#8c929d]/40',
    iconBgHex: '#1e2127',
    iconBorderClass: 'border-[#8c929d]/30',
    badgeBgHex: '#101114',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#8c929d]/25',
    badgeTextClass: 'text-[#abb0ba]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  wine: {
    id: 'wine',
    name: 'Higo Oscuro',
    hex: '#8a5266',
    cardBgHex: '#1b1217',
    cardBorderClass: 'border-white/[0.08] hover:border-[#8a5266]/40',
    iconBgHex: '#24181e',
    iconBorderClass: 'border-[#8a5266]/30',
    badgeBgHex: '#120c10',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#8a5266]/25',
    badgeTextClass: 'text-[#a97387]',
    chipActiveBgClass: 'bg-white/[0.12] text-white border-white/25 shadow-sm',
    chipInactiveClass: 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white',
  },
  slate: {
    id: 'slate',
    name: 'Pizarra Nórdica',
    hex: '#7c8594',
    cardBgHex: '#15181e',
    cardBorderClass: 'border-white/[0.08] hover:border-[#7c8594]/40',
    iconBgHex: '#1c2028',
    iconBorderClass: 'border-[#7c8594]/30',
    badgeBgHex: '#0e1014',
    badgeBgClass: 'bg-white/[0.04]',
    badgeBorderClass: 'border-[#7c8594]/25',
    badgeTextClass: 'text-[#9da5b3]',
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
      localStorage.setItem(key, JSON.stringify(clean));
      if (!userId) {
        localStorage.setItem('thea_custom_materias', JSON.stringify(clean));
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
