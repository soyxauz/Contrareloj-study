/**
 * Micrófono con transcripción por Groq Whisper.
 *
 * Por qué existe: el SpeechRecognition del navegador depende de los servidores de Google
 * y NO funciona en Brave/Firefox (el micrófono se pone rojo y se apaga solo).
 * Este servicio graba con getUserMedia + MediaRecorder (soportado en todos los navegadores
 * modernos), detecta cuándo dejas de hablar (VAD por volumen) y transcribe con Whisper.
 *
 * Límites del plan gratis de Groq para Whisper (verifica en console.groq.com/docs/rate-limits):
 * ~20 peticiones/min y ~2.000/día, archivo máx. 25 MB.
 */

import { DEFAULT_GROQ_KEY } from './aiService';

const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const STT_MODEL = 'whisper-large-v3-turbo';

export interface WhisperMicOptions {
  /** API key de Groq (gsk_...) */
  apiKey: string;
  /** Idioma ISO-639-1. Por defecto 'es' */
  language?: string;
  /** Pista de vocabulario para mejorar términos técnicos (ej. el título del kit). Máx. ~200 palabras */
  prompt?: string;
  /** Si true, detiene la grabación sola cuando dejas de hablar */
  autoStopOnSilence?: boolean;
  /** Milisegundos de silencio para dar por terminada la frase. Por defecto 1800 */
  silenceMs?: number;
  /** Si no se detecta voz en este tiempo, se cancela. Por defecto 9000 */
  noSpeechTimeoutMs?: number;
  /** Duración máxima de una grabación. Por defecto 90000 */
  maxMs?: number;
  /** Nivel de volumen 0..1 (para animar la interfaz) */
  onVolume?: (level: number) => void;
  /** Se llama cuando la grabación termina y empieza la transcripción */
  onTranscribing?: () => void;
  /** Se dispara tan pronto se detecta habla sostenida (para pausar audio/interrumpir) */
  onSpeechDetected?: () => void;
  /** Si true, es una escucha de interrupción mientras suena el altavoz (ignora eco/volumen bajo) */
  isInterruptionMode?: boolean;
  /** Umbral RMS mínimo manual para considerar habla y no eco de los altavoces */
  minSpeechRms?: number;
}

export interface WhisperRecording {
  /** Detiene la grabación y transcribe lo grabado */
  stop: () => void;
  /** Descarta la grabación sin transcribir */
  cancel: () => void;
  /** Texto transcrito ('' si no se detectó voz). Rechaza con Error legible si algo falla */
  result: Promise<string>;
}

/**
 * Determina si el texto transcrito corresponde a palabras reales con sentido
 * o si fue solo un ruido, carraspeo, suspiro, click o alucinación de Whisper.
 */
export function isMeaningfulSpeech(raw: string): boolean {
  if (!raw) return false;
  const clean = raw.trim().replace(/^["'«»“”]+|["'«»“”]+$/g, '').trim();
  if (!clean) return false;

  // Filtrar tokens de ruido entre corchetes o paréntesis típicos de Whisper
  if (/^(\[[^\]]+\]|\([^)]+\))$/i.test(clean)) return false;

  // Filtrar alucinaciones comunes de subtítulos
  if (/(subtítulo|suscríbete|gracias por ver|amara\.org|watching)/i.test(clean)) return false;

  // Extraer palabras con caracteres alfanuméricos españoles
  const words = clean
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()¿?¡!]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && /[a-záéíóúüñ]/i.test(w));

  if (words.length === 0) return false;

  // Si es una sola palabra y coincide con sonidos, carraspeos o suspiros comunes
  const noiseSounds = new Set([
    'ah', 'eh', 'oh', 'uh', 'um', 'umm', 'mm', 'mmm', 'sh', 'shh', 'psst',
    'ha', 'he', 'je', 'ay', 'uy', 'cough', 'throat'
  ]);

  if (words.length === 1 && noiseSounds.has(words[0])) {
    return false;
  }

  // Si tiene al menos una palabra de 2 o más letras que no sea un ruido aislado
  return words.some((w) => w.length >= 2 && !noiseSounds.has(w));
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find(t => MediaRecorder.isTypeSupported(t));
}

function extensionFor(mime: string): string {
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

export function isWhisperMicSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );
}

async function transcribe(blob: Blob, opts: WhisperMicOptions): Promise<string> {
  const ext = extensionFor(blob.type || 'audio/webm');
  const form = new FormData();
  form.append('file', blob, `audio.${ext}`);
  form.append('model', STT_MODEL);
  form.append('language', opts.language || 'es');
  form.append('response_format', 'json');
  form.append('temperature', '0');
  if (opts.prompt) form.append('prompt', opts.prompt.slice(0, 600));

  const res = await fetch(GROQ_STT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}` }, // NO fijar Content-Type: el navegador añade el boundary
    body: form,
  });

  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.error?.message || '';
    } catch {
      /* sin detalle */
    }
    if (res.status === 401) {
      if (DEFAULT_GROQ_KEY && opts.apiKey !== DEFAULT_GROQ_KEY) {
        console.warn('[WhisperMic] Clave 401 rechazada, auto-recuperando con DEFAULT_GROQ_KEY...');
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('thea_groq_api_key', DEFAULT_GROQ_KEY);
          }
        } catch {}
        return transcribe(blob, { ...opts, apiKey: DEFAULT_GROQ_KEY });
      }
      throw new Error('La API key de Groq no es válida (debe empezar por gsk_).');
    }
    if (res.status === 429) throw new Error('Límite de Groq alcanzado (demasiadas peticiones). Espera un minuto e inténtalo de nuevo.');
    throw new Error(`Error de transcripción (HTTP ${res.status}). ${detail}`.trim());
  }

  const json = await res.json();
  return String(json?.text || '').trim();
}

/**
 * Empieza a grabar. Lanza error si el usuario niega el permiso o no hay micrófono.
 */
export async function startWhisperRecording(opts: WhisperMicOptions): Promise<WhisperRecording> {
  if (!isWhisperMicSupported()) {
    throw new Error('Este navegador no permite grabar audio.');
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err: any) {
    if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
      throw new Error('Permiso de micrófono denegado. Pulsa el candado junto a la URL y permite el micrófono.');
    }
    if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') {
      throw new Error('No se detectó ningún micrófono.');
    }
    throw new Error('No se pudo acceder al micrófono.');
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  // ── VAD por volumen ──
  const AudioCtx: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioCtx();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);

  const silenceMs = opts.silenceMs ?? 1400;
  const noSpeechTimeoutMs = opts.noSpeechTimeoutMs ?? 9000;
  const maxMs = opts.maxMs ?? 90000;

  const startedAt = Date.now();
  let lastVoiceAt = 0;
  let heardSpeech = false;
  let speechConsecutiveTicks = 0;
  let noiseFloor = 0.01;
  let calibrationSamples = 0;
  let cancelled = false;
  let stopped = false;
  let vadTimer: ReturnType<typeof setInterval> | null = null;

  let resolveResult!: (v: string) => void;
  let rejectResult!: (e: Error) => void;
  const result = new Promise<string>((res, rej) => {
    resolveResult = res;
    rejectResult = rej;
  });

  const cleanup = () => {
    if (vadTimer) clearInterval(vadTimer);
    vadTimer = null;
    try { source.disconnect(); } catch { /* ignore */ }
    try { audioCtx.close(); } catch { /* ignore */ }
    stream.getTracks().forEach(t => t.stop());
    opts.onVolume?.(0);
  };

  recorder.onstop = async () => {
    cleanup();
    if (cancelled) return resolveResult('');
    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
    // Sin audio relevante (< 1500 bytes)
    if (blob.size < 1500) return resolveResult('');
    // Si no se detectó voz clara por VAD y el audio es minúsculo (< 3000 bytes), evitar alucinaciones
    if (!heardSpeech && blob.size < 3000) return resolveResult('');
    try {
      opts.onTranscribing?.();
      resolveResult(await transcribe(blob, opts));
    } catch (e) {
      rejectResult(e instanceof Error ? e : new Error(String(e)));
    }
  };

  const finish = () => {
    if (stopped) return;
    stopped = true;
    try {
      if (recorder.state !== 'inactive') recorder.stop();
      else recorder.onstop?.(new Event('stop'));
    } catch {
      cleanup();
      resolveResult('');
    }
  };

  vadTimer = setInterval(() => {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    opts.onVolume?.(Math.min(1, rms * 6));

    const now = Date.now();
    // Calibra el piso de ruido con muestras tranquilas iniciales
    if (calibrationSamples < 5) {
      if (rms < 0.03) {
        noiseFloor = calibrationSamples === 0 ? rms : (noiseFloor * 0.7 + rms * 0.3);
      }
      calibrationSamples++;
      return;
    }

    // En modo interrupción mientras suena el altavoz, exigir voz firme por encima del altavoz (evita auto-pausa por eco)
    // Una vez que Thea se pausa (heardSpeech === true), relajamos el umbral para que el usuario hable cómodo
    const isInterruptionGate = Boolean(opts.isInterruptionMode && !heardSpeech);
    const threshold = isInterruptionGate
      ? (opts.minSpeechRms ?? 0.085)
      : Math.max(0.016, Math.min(0.035, noiseFloor * 1.8));

    const requiredTicks = isInterruptionGate ? 3 : 2;

    if (rms > threshold) {
      speechConsecutiveTicks++;
      if (speechConsecutiveTicks >= requiredTicks && !heardSpeech) {
        heardSpeech = true;
        opts.onSpeechDetected?.();
      } else if (speechConsecutiveTicks >= requiredTicks) {
        heardSpeech = true;
      }
      lastVoiceAt = now;
    } else {
      speechConsecutiveTicks = 0;
    }

    if (opts.autoStopOnSilence && heardSpeech && now - lastVoiceAt > silenceMs) {
      finish();
    } else if (!heardSpeech && now - startedAt > noSpeechTimeoutMs) {
      cancelled = true;
      finish();
    } else if (now - startedAt > maxMs) {
      finish();
    }
  }, 100);

  recorder.start(250);

  return {
    stop: finish,
    cancel: () => {
      cancelled = true;
      finish();
    },
    result,
  };
}
