import React, { useState, useEffect } from 'react';
import type { StudyGuideDepth } from '../types';
import {
  Cpu,
  Activity,
  FileText,
  Search,
  Clock,
  Zap
} from 'lucide-react';

interface StudyGuideScannerProps {
  title: string;
  category?: string;
  depth: StudyGuideDepth;
  progress: {
    message: string;
    percent: number;
  };
  sampleText?: string;
}

const DEPTH_LABELS: Record<StudyGuideDepth, { name: string; multiplier: string; phases: string[] }> = {
  essential: {
    name: 'Guía Esencial',
    multiplier: '1x Extensión',
    phases: ['Síntesis de Núcleos Conceptuales', 'Tablas de Alto Rendimiento', 'Consolidación']
  },
  complete: {
    name: 'Guía Completa',
    multiplier: '2x Extensión',
    phases: ['Marco Teórico & Taxonomía', 'Desarrollo Sistemático Seccional', 'Cuadros Comparativos Extensos']
  },
  ultra: {
    name: 'Tratado Ultra-Exhaustivo',
    multiplier: '3x Extensión',
    phases: [
      'Fundamentación Estructural & Glosario',
      'Recorrido Diapositiva por Diapositiva',
      'Grandes Matrices & Casos de Examen'
    ]
  }
};

const TELEMETRY_MESSAGES = [
  'Iniciando escáner de alta frecuencia del documento...',
  'Indexando morfología y núcleos conceptuales basales...',
  'Detectando relaciones de causa-efecto y taxonomía técnica...',
  'Mapeando vías analíticas y desgloses sistemáticos...',
  'Estructurando cuadros comparativos matriciales...',
  'Filtrando perlas analíticas y preguntas trampa de examen...',
  'Optimizando mapas mnemotécnicos de consolidación rápida...',
  'Compilando tratado académico sin límite de caracteres...'
];

export const StudyGuideScanner: React.FC<StudyGuideScannerProps> = ({
  title,
  category = 'Material Académico',
  depth,
  progress,
  sampleText = ''
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [telemetryIndex, setTelemetryIndex] = useState(0);
  const [detectedKeywords, setDetectedKeywords] = useState<string[]>([]);

  const depthInfo = DEPTH_LABELS[depth] || DEPTH_LABELS.ultra;

  // Contador de segundos transcurridos
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Rotador de telemetría en tiempo real
  useEffect(() => {
    const teleTimer = setInterval(() => {
      setTelemetryIndex(prev => (prev + 1) % TELEMETRY_MESSAGES.length);
    }, 2400);
    return () => clearInterval(teleTimer);
  }, []);

  // Extraer palabras clave dinámicas del texto para el ticker en vivo
  useEffect(() => {
    if (sampleText && sampleText.length > 50) {
      const words = sampleText
        .replace(/[#*`_~>[\]()]/g, ' ')
        .split(/\s+/)
        .map(w => w.trim())
        .filter(w => w.length >= 6 && !/^(presente|documento|analiza|estudio|capitulo|seccion|pantalla)$/i.test(w));
      const unique = Array.from(new Set(words)).slice(0, 16);
      if (unique.length > 0) {
        setDetectedKeywords(unique);
      }
    }
  }, [sampleText]);

  const activeMessage = progress.message || TELEMETRY_MESSAGES[telemetryIndex];
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto rounded-3xl bg-[#0e0b16]/90 border border-white/[0.08] p-6 sm:p-10 shadow-[0_12px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] overflow-hidden backdrop-blur-2xl animate-fadeIn space-y-8">
      {/* Resplandor superior sutil */}
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-48 bg-violet-600/10 blur-3xl pointer-events-none" />

      {/* ── BARRA SUPERIOR DE TELEMETRÍA ─────────────────────────────────── */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-11 h-11 rounded-2xl bg-white/[0.04] border border-white/10 shadow-inner">
            <Activity className="w-5 h-5 text-zinc-300 animate-pulse" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-400 font-bold px-2 py-0.5 rounded bg-white/[0.05] border border-white/10">
                Escáner Multi-Fase Activo
              </span>
              <span className="text-xs text-zinc-400 font-mono flex items-center gap-1 tabular-nums">
                <Clock className="w-3 h-3 text-zinc-500" />
                {formatTime(elapsedSeconds)}
              </span>
            </div>
            <h2 className="text-lg font-bold text-white truncate max-w-md mt-0.5 flex items-center gap-2 tracking-tight">
              <span className="truncate">{title}</span>
              {category && (
                <span className="text-xs text-zinc-400 font-normal shrink-0">({category})</span>
              )}
            </h2>
          </div>
        </div>

        {/* Nivel de Extensión en Proceso */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-right">
            <div className="text-[9px] uppercase font-bold text-zinc-500 font-mono">Modo Seleccionado</div>
            <div className="text-xs font-bold text-zinc-200 flex items-center gap-1 tabular-nums">
              <Zap className="w-3 h-3 text-zinc-400" />
              <span>{depthInfo.name} ({depthInfo.multiplier})</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── BARRA DE PROGRESO CON PORCENTAJE EN TIEMPO REAL ─────────────── */}
      <div className="relative z-10 space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="font-semibold text-zinc-300 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-zinc-400 animate-spin" />
            <span className="truncate max-w-lg">{activeMessage}</span>
          </span>
          <span className="font-mono font-bold text-white text-sm tabular-nums">
            {Math.max(5, progress.percent)}%
          </span>
        </div>

        <div className="relative w-full bg-white/[0.05] h-2.5 rounded-full overflow-hidden border border-white/[0.08] p-0.5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 via-indigo-500 to-zinc-200 transition-all duration-500"
            style={{ width: `${Math.max(6, progress.percent)}%` }}
          />
        </div>
      </div>

      {/* ── DOCUMENTO CON BARRIDO DE FRECUENCIA ────────────────── */}
      <div className="relative z-10 rounded-2xl bg-[#090314]/95 border border-white/[0.08] p-6 sm:p-8 overflow-hidden shadow-2xl min-h-[280px]">
        {/* LÍNEA DE BARRIDO DE FRECUENCIA CONTINUO */}
        <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent shadow-[0_0_12px_rgba(255,255,255,0.4)] animate-laser-sweep pointer-events-none z-20">
          <div className="absolute -top-8 left-0 right-0 h-8 bg-gradient-to-t from-white/10 to-transparent pointer-events-none" />
        </div>

        {/* CONTENIDO DEL DOCUMENTO */}
        <div className="space-y-6 opacity-90">
          {/* Encabezado del documento simulado */}
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-zinc-400" />
              <div className="space-y-1">
                <div className="h-3 w-44 bg-white/20 rounded animate-pulse" />
                <div className="h-2 w-24 bg-white/10 rounded" />
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-white/[0.05] text-zinc-300 border border-white/10">
              Estructurando
            </span>
          </div>

          {/* Bloques de Secciones Didácticas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {depthInfo.phases.map((phaseTitle, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-white/[0.025] border border-white/[0.06] space-y-2.5 transition-all"
              >
                <div className="flex items-center justify-between text-xs font-bold text-zinc-200">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    <span>{idx + 1}. {phaseTitle}</span>
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {progress.percent >= (idx + 1) * 30 ? 'Listo' : 'Escaneando'}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="h-2 w-full bg-white/10 rounded animate-pulse" />
                  <div className="h-2 w-4/5 bg-white/10 rounded animate-pulse" />
                  <div className="h-2 w-3/5 bg-white/[0.05] rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>

          {/* Ticker Dinámico de Palabras Clave Detectadas */}
          {detectedKeywords.length > 0 && (
            <div className="pt-2">
              <div className="text-[10px] uppercase font-mono font-bold text-zinc-400 mb-2 flex items-center gap-1.5">
                <Search className="w-3 h-3 text-zinc-400" />
                <span>Conceptos y Entidades Clave Detectadas:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {detectedKeywords.map((kw, i) => (
                  <span
                    key={i}
                    className="text-[11px] font-medium font-mono px-2 py-0.5 rounded-lg bg-white/[0.04] text-zinc-300 border border-white/[0.08] shadow-xs animate-fadeIn"
                    style={{ animationDelay: `${i * 120}ms` }}
                  >
                    #{kw}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── PIE CON INDICADORES DE CALIDAD ────────────────────────────────── */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-center text-xs">
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-0.5">
          <div className="text-zinc-500 text-[11px]">Rigor Analítico</div>
          <div className="font-bold text-zinc-200">Cobertura 100% Estricta</div>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-0.5">
          <div className="text-zinc-500 text-[11px]">Límite de Longitud</div>
          <div className="font-bold text-zinc-200">Sin Límite de Caracteres</div>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-0.5">
          <div className="text-zinc-500 text-[11px]">Formato Didáctico</div>
          <div className="font-bold text-zinc-200">Markdown & Tablas Matriciales</div>
        </div>
      </div>
    </div>
  );
};
