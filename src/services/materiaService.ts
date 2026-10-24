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
  if (lower.includes('meteorolog') || lower.includes('clima') || lower.includes('atmósfer') || lower.includes('tiempo')) return 'blue';
  if (lower.includes('gastro') || lower.includes('digestiv') || lower.includes('esófago') || lower.includes('estómag') || lower.includes('hígado') || lower.includes('intest')) return 'emerald';
  if (lower.includes('otorrino') || lower.includes('oído') || lower.includes('nariz') || lower.includes('laring') || lower.includes('audiolog')) return 'amber';
  if (lower.includes('bioquím') || lower.includes('metabol') || lower.includes('enzim') || lower.includes('molecular')) return 'purple';
  if (lower.includes('dermato') || lower.includes('piel') || lower.includes('cutáne') || lower.includes('herpes') || lower.includes('tegument')) return 'indigo';
  if (lower.includes('ginecol') || lower.includes('obstetr') || lower.includes('embaraz') || lower.includes('endometri') || lower.includes('parto')) return 'rose';
  if (lower.includes('neumo') || lower.includes('pulmon') || lower.includes('respirat') || lower.includes('asma') || lower.includes('tórax')) return 'teal';
  if (lower.includes('cardio') || lower.includes('vascular') || lower.includes('corazón') || lower.includes('hematol') || lower.includes('sangre')) return 'rose';
  if (lower.includes('neuro') || lower.includes('cerebro') || lower.includes('psiquiatr') || lower.includes('psicolog') || lower.includes('mental')) return 'purple';
  if (lower.includes('pediatr') || lower.includes('infant') || lower.includes('niñ')) return 'cyan';
  if (lower.includes('traumato') || lower.includes('ortoped') || lower.includes('óseo') || lower.includes('hueso') || lower.includes('múscul')) return 'orange';
  if (lower.includes('oftalmo') || lower.includes('ojo') || lower.includes('visión') || lower.includes('óptica')) return 'cyan';
  if (lower.includes('nefro') || lower.includes('urolog') || lower.includes('renal') || lower.includes('riñón')) return 'amber';
  if (lower.includes('endocrin') || lower.includes('hormon') || lower.includes('tiroides') || lower.includes('diabetes')) return 'orange';
  if (lower.includes('infectolog') || lower.includes('microbiol') || lower.includes('bacteri') || lower.includes('virolog') || lower.includes('inmunol')) return 'teal';
  if (lower.includes('fisiolog') || lower.includes('médic') || lower.includes('medic') || lower.includes('salud') || lower.includes('farmac')) return 'blue';
  if (lower.includes('bio') || lower.includes('ecolog') || lower.includes('botán')) return 'emerald';
  if (lower.includes('derecho') || lower.includes('ley') || lower.includes('legal') || lower.includes('juríd')) return 'amber';
  if (lower.includes('computer') || lower.includes('software') || lower.includes('sistemas') || lower.includes('algoritmo') || lower.includes('código')) return 'indigo';
  if (lower.includes('human') || lower.includes('filosof') || lower.includes('histori') || lower.includes('literat') || lower.includes('arte')) return 'purple';
  if (lower.includes('econ') || lower.includes('finanz') || lower.includes('comerc')) return 'rose';
  if (lower.includes('químic') || lower.includes('laborat')) return 'teal';
  if (lower.includes('matemát') || lower.includes('físic') || lower.includes('álgebra')) return 'cyan';
  if (lower.includes('idioma') || lower.includes('comunic')) return 'orange';

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
