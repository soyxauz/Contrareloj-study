/**
 * Reproductor de voz persistente compatible con iPadOS / iOS Safari.
 *
 * Safari en iPad bloquea con `NotAllowedError` cualquier `new Audio(url).play()`
 * creado de forma asíncrona (por ejemplo tras la detección de silencio en manos
 * libres). Este módulo mantiene un único `HTMLAudioElement` desbloqueado durante
 * el gesto del usuario y un `AudioContext` de respaldo para reproducir buffers
 * sintetizados incluso después de sesiones `getUserMedia`.
 */

export type SpeechPlayOutcome = 'ended' | 'stopped' | 'blocked';

let cachedSilentWavUri: string | null = null;

function getSilentWavDataUri(): string {
  if (cachedSilentWavUri) return cachedSilentWavUri;
  const sampleCount = 320; // 40 ms a 8 kHz PCM mono 16-bit
  const dataSize = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  cachedSilentWavUri = `data:audio/wav;base64,${btoa(binary)}`;
  return cachedSilentWavUri;
}

function decodeAudioDataCompat(ctx: AudioContext, raw: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    try {
      const maybePromise = ctx.decodeAudioData(
        raw,
        (decoded) => resolve(decoded),
        (err) => reject(err || new Error('decodeAudioData failed'))
      );
      if (maybePromise && typeof (maybePromise as Promise<AudioBuffer>).then === 'function') {
        (maybePromise as Promise<AudioBuffer>).then(resolve, reject);
      }
    } catch (err) {
      reject(err);
    }
  });
}

export class PersistentSpeechPlayer {
  private audioEl: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  private playToken = 0;
  private isPlayingReal = false;
  private htmlUnlocked = false;
  private unlockInFlight: Promise<void> | null = null;
  private settleActivePlay: ((outcome: SpeechPlayOutcome) => void) | null = null;

  private ensureAudioElement(): HTMLAudioElement | null {
    if (typeof Audio === 'undefined') return null;
    if (!this.audioEl) {
      const el = new Audio();
      el.preload = 'auto';
      el.setAttribute('playsinline', '');
      (el as any).playsInline = true;
      this.audioEl = el;
    }
    return this.audioEl;
  }

  private ensureAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx: typeof AudioContext | undefined =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      try {
        this.audioCtx = new AudioCtx();
      } catch {
        this.audioCtx = null;
      }
    }
    return this.audioCtx;
  }

  /**
   * Debe llamarse síncronamente dentro de un gesto de usuario (clic / toque / tecla)
   * para mantener desbloqueada la reproducción de voz en iPadOS / iOS Safari.
   */
  unlock(): void {
    const ctx = this.ensureAudioContext();
    if (ctx && ctx.state === 'suspended') {
      try {
        ctx.resume().catch(() => {});
        const silentBuf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = silentBuf;
        src.connect(ctx.destination);
        src.start(0);
      } catch {
        // Ignorar si la política del navegador aún requiere interacción adicional
      }
    }

    if (this.htmlUnlocked || this.isPlayingReal || this.unlockInFlight) {
      return;
    }

    const el = this.ensureAudioElement();
    if (!el) return;

    try {
      el.muted = false;
      el.volume = 1;
      el.src = getSilentWavDataUri();
      const playPromise = el.play();
      if (playPromise && typeof playPromise.then === 'function') {
        const pending = playPromise
          .then(() => {
            this.htmlUnlocked = true;
            if (!this.isPlayingReal) {
              try {
                el.pause();
                el.currentTime = 0;
              } catch {}
            }
          })
          .catch(() => {})
          .finally(() => {
            if (this.unlockInFlight === pending) {
              this.unlockInFlight = null;
            }
          });
        this.unlockInFlight = pending;
      }
    } catch {
      // Ignorar errores síncronos en entornos sin soporte multimedia
    }
  }

  stop(): void {
    this.playToken++;
    const hadRealPlay = this.isPlayingReal;
    this.isPlayingReal = false;

    if (this.audioEl && hadRealPlay) {
      this.audioEl.onended = null;
      this.audioEl.onerror = null;
      try {
        this.audioEl.pause();
        this.audioEl.currentTime = 0;
      } catch {}
    }

    if (this.activeSource) {
      this.activeSource.onended = null;
      try {
        this.activeSource.stop(0);
      } catch {}
      try {
        this.activeSource.disconnect();
      } catch {}
      this.activeSource = null;
    }

    if (this.settleActivePlay) {
      const resolve = this.settleActivePlay;
      this.settleActivePlay = null;
      resolve('stopped');
    }
  }

  dispose(): void {
    this.stop();
    if (this.audioEl) {
      this.audioEl.onended = null;
      this.audioEl.onerror = null;
      try {
        this.audioEl.removeAttribute('src');
        this.audioEl.load();
      } catch {}
      this.audioEl = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close().catch(() => {});
      } catch {}
      this.audioCtx = null;
    }
    this.htmlUnlocked = false;
  }

  async play(url: string): Promise<SpeechPlayOutcome> {
    this.stop();
    const token = ++this.playToken;
    this.isPlayingReal = true;

    if (this.unlockInFlight) {
      await Promise.race([
        this.unlockInFlight,
        new Promise<void>((r) => setTimeout(r, 120)),
      ]);
      if (token !== this.playToken) {
        return 'stopped';
      }
    }

    const htmlOutcome = await this.playViaHtmlAudio(url, token);
    if (token !== this.playToken) {
      return 'stopped';
    }
    if (htmlOutcome === 'ended' || htmlOutcome === 'stopped') {
      this.isPlayingReal = false;
      return htmlOutcome;
    }

    // Respaldo Web Audio API para iPadOS/iOS Safari tras sesiones de micrófono
    const webAudioOutcome = await this.playViaWebAudio(url, token);
    if (token !== this.playToken) {
      return 'stopped';
    }
    this.isPlayingReal = false;
    return webAudioOutcome;
  }

  private playViaHtmlAudio(url: string, token: number): Promise<SpeechPlayOutcome | 'fallback'> {
    const el = this.ensureAudioElement();
    if (!el) return Promise.resolve('fallback');

    return new Promise<SpeechPlayOutcome | 'fallback'>((resolve) => {
      let finished = false;
      const done = (outcome: SpeechPlayOutcome | 'fallback') => {
        if (finished) return;
        finished = true;
        el.onended = null;
        el.onerror = null;
        if (this.settleActivePlay === onStop) {
          this.settleActivePlay = null;
        }
        resolve(outcome);
      };

      const onStop = () => done('stopped');
      this.settleActivePlay = onStop;

      el.onended = () => {
        if (token !== this.playToken) {
          done('stopped');
          return;
        }
        this.htmlUnlocked = true;
        done('ended');
      };

      el.onerror = () => {
        if (token !== this.playToken) {
          done('stopped');
          return;
        }
        done('fallback');
      };

      try {
        el.muted = false;
        el.volume = 1;
        el.src = url;
        const p = el.play();
        if (p && typeof p.catch === 'function') {
          p.then(() => {
            this.htmlUnlocked = true;
          }).catch(() => {
            if (token !== this.playToken) {
              done('stopped');
            } else {
              done('fallback');
            }
          });
        }
      } catch {
        done('fallback');
      }
    });
  }

  private async playViaWebAudio(url: string, token: number): Promise<SpeechPlayOutcome> {
    const ctx = this.ensureAudioContext();
    if (!ctx) return 'blocked';

    try {
      if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') {
        await ctx.resume();
      }
      if ((ctx.state as string) !== 'running') {
        return 'blocked';
      }

      const response = await fetch(url);
      if (token !== this.playToken) return 'stopped';
      const arrayBuffer = await response.arrayBuffer();
      if (token !== this.playToken) return 'stopped';
      const decoded = await decodeAudioDataCompat(ctx, arrayBuffer);
      if (token !== this.playToken) return 'stopped';

      return await new Promise<SpeechPlayOutcome>((resolve) => {
        let finished = false;
        const source = ctx.createBufferSource();
        source.buffer = decoded;
        source.connect(ctx.destination);
        this.activeSource = source;

        const done = (outcome: SpeechPlayOutcome) => {
          if (finished) return;
          finished = true;
          source.onended = null;
          if (this.activeSource === source) {
            this.activeSource = null;
          }
          if (this.settleActivePlay === onStop) {
            this.settleActivePlay = null;
          }
          try {
            source.disconnect();
          } catch {}
          resolve(outcome);
        };

        const onStop = () => done('stopped');
        this.settleActivePlay = onStop;

        source.onended = () => {
          done(token !== this.playToken ? 'stopped' : 'ended');
        };

        try {
          source.start(0);
        } catch {
          done('blocked');
        }
      });
    } catch {
      return token !== this.playToken ? 'stopped' : 'blocked';
    }
  }
}
