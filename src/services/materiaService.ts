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
    name: 'Verde Fisiología',
    hex: '#34d399',
    cardBgHex: '#143d22',
    cardBorderClass: 'border-emerald-600/30 hover:border-emerald-500/60',
    iconBgHex: '#1b4a2c',
    iconBorderClass: 'border-emerald-500/40',
    badgeBgHex: '#0f2f1a',
    badgeBgClass: 'bg-[#0f2f1a]',
    badgeBorderClass: 'border-emerald-500/40',
    badgeTextClass: 'text-emerald-300',
    chipActiveBgClass: 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/40',
    chipInactiveClass: 'bg-[#143d22] border-emerald-500/40 text-emerald-300 hover:border-emerald-400/60',
  },
  blue: {
    id: 'blue',
    name: 'Azul Zafiro',
    hex: '#38bdf8',
    cardBgHex: '#0f2a4a',
    cardBorderClass: 'border-sky-600/30 hover:border-sky-500/60',
    iconBgHex: '#153860',
    iconBorderClass: 'border-sky-500/40',
    badgeBgHex: '#0c2038',
    badgeBgClass: 'bg-[#0c2038]',
    badgeBorderClass: 'border-sky-500/40',
    badgeTextClass: 'text-sky-300',
    chipActiveBgClass: 'bg-sky-600 text-white shadow-sm shadow-sky-950/40',
    chipInactiveClass: 'bg-[#0f2a4a] border-sky-500/40 text-sky-300 hover:border-sky-400/60',
  },
  amber: {
    id: 'amber',
    name: 'Ámbar Cobre',
    hex: '#fbbf24',
    cardBgHex: '#36210e',
    cardBorderClass: 'border-amber-600/30 hover:border-amber-500/60',
    iconBgHex: '#452b14',
    iconBorderClass: 'border-amber-500/40',
    badgeBgHex: '#28190a',
    badgeBgClass: 'bg-[#28190a]',
    badgeBorderClass: 'border-amber-500/40',
    badgeTextClass: 'text-amber-300',
    chipActiveBgClass: 'bg-amber-600 text-slate-950 font-bold shadow-sm shadow-amber-950/40',
    chipInactiveClass: 'bg-[#36210e] border-amber-500/40 text-amber-300 hover:border-amber-400/60',
  },
  purple: {
    id: 'purple',
    name: 'Púrpura Amatista',
    hex: '#c084fc',
    cardBgHex: '#2a123a',
    cardBorderClass: 'border-purple-600/30 hover:border-purple-500/60',
    iconBgHex: '#3a1a50',
    iconBorderClass: 'border-purple-500/40',
    badgeBgHex: '#1f0d2b',
    badgeBgClass: 'bg-[#1f0d2b]',
    badgeBorderClass: 'border-purple-500/40',
    badgeTextClass: 'text-purple-300',
    chipActiveBgClass: 'bg-purple-600 text-white shadow-sm shadow-purple-950/40',
    chipInactiveClass: 'bg-[#2a123a] border-purple-500/40 text-purple-300 hover:border-purple-400/60',
  },
  indigo: {
    id: 'indigo',
    name: 'Índigo Profundo',
    hex: '#818cf8',
    cardBgHex: '#131945',
    cardBorderClass: 'border-indigo-600/30 hover:border-indigo-500/60',
    iconBgHex: '#1b235c',
    iconBorderClass: 'border-indigo-500/40',
    badgeBgHex: '#0e1333',
    badgeBgClass: 'bg-[#0e1333]',
    badgeBorderClass: 'border-indigo-500/40',
    badgeTextClass: 'text-indigo-300',
    chipActiveBgClass: 'bg-indigo-600 text-white shadow-sm shadow-indigo-950/40',
    chipInactiveClass: 'bg-[#131945] border-indigo-500/40 text-indigo-300 hover:border-indigo-400/60',
  },
  rose: {
    id: 'rose',
    name: 'Granate Carmesí',
    hex: '#fb7185',
    cardBgHex: '#38111e',
    cardBorderClass: 'border-rose-600/30 hover:border-rose-500/60',
    iconBgHex: '#4a1728',
    iconBorderClass: 'border-rose-500/40',
    badgeBgHex: '#290c16',
    badgeBgClass: 'bg-[#290c16]',
    badgeBorderClass: 'border-rose-500/40',
    badgeTextClass: 'text-rose-300',
    chipActiveBgClass: 'bg-rose-600 text-white shadow-sm shadow-rose-950/40',
    chipInactiveClass: 'bg-[#38111e] border-rose-500/40 text-rose-300 hover:border-rose-400/60',
  },
  teal: {
    id: 'teal',
    name: 'Turquesa Petróleo',
    hex: '#2dd4bf',
    cardBgHex: '#0d3336',
    cardBorderClass: 'border-teal-600/30 hover:border-teal-500/60',
    iconBgHex: '#14464a',
    iconBorderClass: 'border-teal-500/40',
    badgeBgHex: '#092426',
    badgeBgClass: 'bg-[#092426]',
    badgeBorderClass: 'border-teal-500/40',
    badgeTextClass: 'text-teal-300',
    chipActiveBgClass: 'bg-teal-600 text-white shadow-sm shadow-teal-950/40',
    chipInactiveClass: 'bg-[#0d3336] border-teal-500/40 text-teal-300 hover:border-teal-400/60',
  },
  cyan: {
    id: 'cyan',
    name: 'Cian Glaciar',
    hex: '#22d3ee',
    cardBgHex: '#0b2b3a',
    cardBorderClass: 'border-cyan-600/30 hover:border-cyan-500/60',
    iconBgHex: '#113b4f',
    iconBorderClass: 'border-cyan-500/40',
    badgeBgHex: '#071f2b',
    badgeBgClass: 'bg-[#071f2b]',
    badgeBorderClass: 'border-cyan-500/40',
    badgeTextClass: 'text-cyan-300',
    chipActiveBgClass: 'bg-cyan-600 text-white shadow-sm shadow-cyan-950/40',
    chipInactiveClass: 'bg-[#0b2b3a] border-cyan-500/40 text-cyan-300 hover:border-cyan-400/60',
  },
  orange: {
    id: 'orange',
    name: 'Óxido Cálido',
    hex: '#fb923c',
    cardBgHex: '#361b0c',
    cardBorderClass: 'border-orange-600/30 hover:border-orange-500/60',
    iconBgHex: '#482511',
    iconBorderClass: 'border-orange-500/40',
    badgeBgHex: '#261308',
    badgeBgClass: 'bg-[#261308]',
    badgeBorderClass: 'border-orange-500/40',
    badgeTextClass: 'text-orange-300',
    chipActiveBgClass: 'bg-orange-600 text-slate-950 font-bold shadow-sm shadow-orange-950/40',
    chipInactiveClass: 'bg-[#361b0c] border-orange-500/40 text-orange-300 hover:border-orange-400/60',
  },
  slate: {
    id: 'slate',
    name: 'Pizarra Grafito',
    hex: '#94a3b8',
    cardBgHex: '#181c26',
    cardBorderClass: 'border-slate-700/50 hover:border-slate-600/70',
    iconBgHex: '#222836',
    iconBorderClass: 'border-slate-600/40',
    badgeBgHex: '#12151d',
    badgeBgClass: 'bg-[#12151d]',
    badgeBorderClass: 'border-slate-600/40',
    badgeTextClass: 'text-slate-300',
    chipActiveBgClass: 'bg-slate-700 text-white shadow-sm shadow-slate-950/40',
    chipInactiveClass: 'bg-[#181c26] border-slate-700/40 text-slate-300 hover:border-slate-600/60',
  },
};

const PALETTE_ROTATION = ['blue', 'emerald', 'amber', 'purple', 'indigo', 'rose', 'teal', 'cyan', 'orange'];
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
 * Asigna un color característico único para una materia, evitando repetir colores
 * asignados a otras materias presentes en la lista.
 */
export function getDistinctColorForCategory(categoryName: string, usedColors: string[], userId?: string | null): string {
  // Ver si ya tiene un color guardado
  const stored = getStoredCustomMaterias(userId);
  const existing = stored.find(m => m.name.toLowerCase() === categoryName.trim().toLowerCase());
  if (existing && OPAQUE_DARK_PALETTES[existing.colorId]) {
    return existing.colorId;
  }

  // Si encaja semánticamente con alguna conocida y no está en conflicto
  const lower = categoryName.toLowerCase();
  let candidate = '';
  if (lower.includes('fisiolog') || lower.includes('médic') || lower.includes('medic') || lower.includes('salud') || lower.includes('farmac')) candidate = 'blue';
  else if (lower.includes('bio') || lower.includes('ecolog') || lower.includes('botán')) candidate = 'emerald';
  else if (lower.includes('derecho') || lower.includes('ley') || lower.includes('legal') || lower.includes('juríd')) candidate = 'amber';
  else if (lower.includes('computer') || lower.includes('software') || lower.includes('sistemas') || lower.includes('algoritmo') || lower.includes('código')) candidate = 'indigo';
  else if (lower.includes('human') || lower.includes('filosof') || lower.includes('histori') || lower.includes('literat') || lower.includes('arte')) candidate = 'purple';
  else if (lower.includes('econ') || lower.includes('finanz') || lower.includes('comerc')) candidate = 'rose';
  else if (lower.includes('químic') || lower.includes('laborat')) candidate = 'teal';
  else if (lower.includes('matemát') || lower.includes('físic') || lower.includes('álgebra')) candidate = 'cyan';
  else if (lower.includes('idioma') || lower.includes('comunic')) candidate = 'orange';

  if (candidate && !usedColors.includes(candidate)) {
    return candidate;
  }

  // Si candidate ya está ocupado o no hubo match, buscar el primer color libre del pool
  for (const colorKey of PALETTE_ROTATION) {
    if (!usedColors.includes(colorKey)) {
      return colorKey;
    }
  }

  // Si se agotaron los colores únicos, calcular hash determinista
  let hash = 0;
  for (let i = 0; i < categoryName.length; i++) {
    hash = (hash << 5) - hash + categoryName.charCodeAt(i);
    hash |= 0;
  }
  return PALETTE_ROTATION[Math.abs(hash) % PALETTE_ROTATION.length];
}

/**
 * Obtiene únicamente las materias que tienen al menos 1 kit asociado.
 * No genera materias vacías con 0 kits.
 * Asigna a cada una un color característico único.
 */
export function getAllAvailableMaterias(kits: StudyKit[], userId?: string | null): { name: string; colorId: string; count: number }[] {
  const map = new Map<string, { colorId: string; count: number }>();
  const usedColors: string[] = [];

  // Mapear solo los kits reales existentes
  for (const kit of kits) {
    const rawCat = kit.category ? kit.category.trim() : 'General';
    if (!rawCat) continue;

    if (map.has(rawCat)) {
      map.get(rawCat)!.count += 1;
    } else {
      const assignedColor = getDistinctColorForCategory(rawCat, usedColors, userId);
      usedColors.push(assignedColor);
      map.set(rawCat, { colorId: assignedColor, count: 1 });
    }
  }

  // Filtrar estrictamente solo las que tienen kits (count > 0)
  return Array.from(map.entries())
    .filter(([_, data]) => data.count > 0)
    .map(([name, data]) => ({
      name,
      colorId: data.colorId,
      count: data.count,
    }));
}

/**
 * Obtiene el tema visual de una categoría/materia.
 * Si se pasa la lista de kits actuales, garantiza que tome el color asignado a esa materia en el pool.
 */
export function getMateriaTheme(categoryName: string | undefined, kits?: StudyKit[], userId?: string | null): MateriaColorDef {
  if (!categoryName) return OPAQUE_DARK_PALETTES.slate;
  const trimmed = categoryName.trim();

  // Si se proporcionó la lista de kits, buscar la asignación unificada
  if (kits && kits.length > 0) {
    const activeMaterias = getAllAvailableMaterias(kits, userId);
    const found = activeMaterias.find(m => m.name.toLowerCase() === trimmed.toLowerCase());
    if (found && OPAQUE_DARK_PALETTES[found.colorId]) {
      return OPAQUE_DARK_PALETTES[found.colorId];
    }
  }

  // Verificar si está en storage personalizado
  const stored = getStoredCustomMaterias(userId);
  const custom = stored.find(m => m.name.toLowerCase() === trimmed.toLowerCase());
  if (custom && OPAQUE_DARK_PALETTES[custom.colorId]) {
    return OPAQUE_DARK_PALETTES[custom.colorId];
  }

  // Fallback determinista
  const fallbackColor = getDistinctColorForCategory(trimmed, [], userId);
  return OPAQUE_DARK_PALETTES[fallbackColor] || OPAQUE_DARK_PALETTES.slate;
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
