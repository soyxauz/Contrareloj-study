/**
 * Servicio de Gestión de Materias y Paletas de Colores Oscuros y Opacos
 * Cumple con el modo oscuro opaco, sin transparencias ni brillos estridentes.
 * Asigna un color característico único a cada materia existente.
 * No genera materias vacías con 0 kits.
 */

import type { StudyKit } from '../types';

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
const STORAGE_KEY = 'thea_custom_materias';

/**
 * Obtiene las materias personalizadas guardadas por el usuario.
 * No genera materias vacías por defecto.
 */
export function getStoredCustomMaterias(): CustomMateria[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.error('Error al leer materias personalizadas:', err);
  }
  return [];
}

/**
 * Guarda materias personalizadas
 */
export function saveCustomMaterias(materias: CustomMateria[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(materias));
  } catch (err) {
    console.error('Error al guardar materias:', err);
  }
}

/**
 * Asigna un color característico único para una materia, evitando repetir colores
 * asignados a otras materias presentes en la lista.
 */
export function getDistinctColorForCategory(categoryName: string, usedColors: string[]): string {
  // Ver si ya tiene un color guardado
  const stored = getStoredCustomMaterias();
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
export function getAllAvailableMaterias(kits: StudyKit[]): { name: string; colorId: string; count: number }[] {
  const map = new Map<string, { colorId: string; count: number }>();
  const usedColors: string[] = [];

  // Mapear solo los kits reales existentes
  for (const kit of kits) {
    const rawCat = kit.category ? kit.category.trim() : 'General';
    if (!rawCat) continue;

    if (map.has(rawCat)) {
      map.get(rawCat)!.count += 1;
    } else {
      const assignedColor = getDistinctColorForCategory(rawCat, usedColors);
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
export function getMateriaTheme(categoryName: string | undefined, kits?: StudyKit[]): MateriaColorDef {
  if (!categoryName) return OPAQUE_DARK_PALETTES.slate;
  const trimmed = categoryName.trim();

  // Si se proporcionó la lista de kits, buscar la asignación unificada
  if (kits && kits.length > 0) {
    const activeMaterias = getAllAvailableMaterias(kits);
    const found = activeMaterias.find(m => m.name.toLowerCase() === trimmed.toLowerCase());
    if (found && OPAQUE_DARK_PALETTES[found.colorId]) {
      return OPAQUE_DARK_PALETTES[found.colorId];
    }
  }

  // Verificar si está en storage personalizado
  const stored = getStoredCustomMaterias();
  const custom = stored.find(m => m.name.toLowerCase() === trimmed.toLowerCase());
  if (custom && OPAQUE_DARK_PALETTES[custom.colorId]) {
    return OPAQUE_DARK_PALETTES[custom.colorId];
  }

  // Fallback determinista
  const fallbackColor = getDistinctColorForCategory(trimmed, []);
  return OPAQUE_DARK_PALETTES[fallbackColor] || OPAQUE_DARK_PALETTES.slate;
}

/**
 * Guarda una nueva asignación o edición de materia
 */
export function addCustomMateria(name: string, colorId: string): CustomMateria {
  const trimmed = name.trim();
  const current = getStoredCustomMaterias();
  const existing = current.find(m => m.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) {
    existing.colorId = colorId;
    saveCustomMaterias(current);
    return existing;
  }
  const newMateria: CustomMateria = {
    id: 'mat-' + Date.now().toString(36),
    name: trimmed,
    colorId: colorId in OPAQUE_DARK_PALETTES ? colorId : 'slate',
  };
  const updated = [...current, newMateria];
  saveCustomMaterias(updated);
  return newMateria;
}

export function updateCustomMateria(oldName: string, newName: string, colorId: string): void {
  const current = getStoredCustomMaterias();
  const updated = current.map(m => {
    if (m.name.toLowerCase() === oldName.toLowerCase()) {
      return { ...m, name: newName.trim(), colorId };
    }
    return m;
  });
  saveCustomMaterias(updated);
}

export function deleteCustomMateria(name: string): void {
  const current = getStoredCustomMaterias();
  const updated = current.filter(m => m.name.toLowerCase() !== name.toLowerCase());
  saveCustomMaterias(updated);
}
