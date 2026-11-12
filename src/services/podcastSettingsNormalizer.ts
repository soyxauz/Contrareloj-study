import type { PodcastSettings } from '../types';

export const DEFAULT_PODCAST_SETTINGS: PodcastSettings = {
  voiceEngine: 'edge',
  sofiaVoice: 'Aoede',
  mateoVoice: 'Puck',
  edgeSofiaVoice: 'es-ES-ElviraNeural',
  edgeMateoVoice: 'es-ES-AlvaroNeural',
  playbackSpeed: 1,
  geminiApiKey: '',
  orientation: '',
};

/**
 * Normaliza cualquier configuración de podcast (incluyendo cuentas antiguas de
 * Google Drive o dispositivos previos con 'browser'/'gemini') para exigir
 * exclusivamente Microsoft Azure Neural ('edge').
 */
export function normalizePodcastSettings(
  raw?: Partial<PodcastSettings> | Record<string, unknown> | null
): PodcastSettings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawSpeed = typeof src.playbackSpeed === 'number' && Number.isFinite(src.playbackSpeed) && src.playbackSpeed > 0
    ? src.playbackSpeed
    : DEFAULT_PODCAST_SETTINGS.playbackSpeed;

  return {
    voiceEngine: 'edge',
    sofiaVoice: typeof src.sofiaVoice === 'string' && src.sofiaVoice ? src.sofiaVoice : DEFAULT_PODCAST_SETTINGS.sofiaVoice,
    mateoVoice: typeof src.mateoVoice === 'string' && src.mateoVoice ? src.mateoVoice : DEFAULT_PODCAST_SETTINGS.mateoVoice,
    edgeSofiaVoice: typeof src.edgeSofiaVoice === 'string' && src.edgeSofiaVoice.trim()
      ? src.edgeSofiaVoice
      : DEFAULT_PODCAST_SETTINGS.edgeSofiaVoice,
    edgeMateoVoice: typeof src.edgeMateoVoice === 'string' && src.edgeMateoVoice.trim()
      ? src.edgeMateoVoice
      : DEFAULT_PODCAST_SETTINGS.edgeMateoVoice,
    playbackSpeed: rawSpeed,
    geminiApiKey: typeof src.geminiApiKey === 'string' ? src.geminiApiKey : DEFAULT_PODCAST_SETTINGS.geminiApiKey,
    orientation: typeof src.orientation === 'string' ? src.orientation : DEFAULT_PODCAST_SETTINGS.orientation,
  };
}
