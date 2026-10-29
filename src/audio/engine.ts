import { BASE_URL } from '../data/content';
import { diag } from '../platform/diag';
import type { Settings } from '../state/settings';
import { getMixer } from './mixer';
import { VoicePlayer } from './player';
import { LiveTone, LoopTone, type Tone } from './tone';
import type { AudioManifest, PlannedSegment } from './types';

const TONE_FADE_IN_S = 4;
const TONE_FADE_OUT_EXIT_S = 20; // durante la salida 1→5 el tono se apaga despacio
const TONE_FADE_OUT_SLEEP_S = 90; // "dormir directamente": fade muy lento

export interface Clock {
  time(): number;
  readonly totalDuration: number;
}

/**
 * Una sesión con audio: voz por segmentos + tono alfa.
 * Debe crearse dentro del gesto del usuario (botón "Iniciar") para que
 * Android permita arrancar el audio.
 */
export class AudioSession implements Clock {
  readonly player: VoicePlayer;
  private tone: Tone | null = null;
  private toneSrc: string | null = null;
  private exitStarted = false;
  onFinished?: () => void;
  onSuspended?: () => void;
  onExternalPause?: () => void;
  onExternalResume?: () => void;

  constructor(
    private segments: PlannedSegment[],
    private manifest: AudioManifest,
    private settings: Settings,
    private sleep: boolean,
  ) {
    if (settings.engine === 'webaudio') {
      const { ctx } = getMixer();
      void ctx.resume();
      ctx.onstatechange = () => {
        diag(`audio web: ${ctx.state}`);
        if (ctx.state !== 'running' && !this.player.paused) {
          void ctx.resume().catch(() => undefined);
          this.onSuspended?.();
        }
      };
    }
    this.player = new VoicePlayer(segments, settings.engine, settings.voiceVolume);
    this.player.onSegmentStart = (i) => this.handleSegment(i);
    this.player.onFinished = () => this.handleFinished();
    this.player.onExternalPause = () => {
      this.tone?.pause();
      this.onExternalPause?.();
    };
    this.player.onExternalResume = () => {
      if (settings.engine === 'webaudio') void getMixer().ctx.resume().catch(() => undefined);
      this.tone?.resume();
      this.onExternalResume?.();
    };
  }

  get totalDuration() {
    return this.player.totalDuration;
  }

  time() {
    return this.player.time();
  }

  async load(onProgress?: (f: number) => void) {
    await this.player.load(BASE_URL, onProgress);
    if (this.settings.toneEnabled && this.settings.engine === 'compat') {
      const res = await fetch(BASE_URL + this.manifest.tones[this.settings.toneMode].file);
      this.toneSrc = URL.createObjectURL(await res.blob());
    }
  }

  async start() {
    if (this.settings.toneEnabled) {
      this.tone =
        this.settings.engine === 'webaudio'
          ? new LiveTone(this.settings.toneMode, this.settings.toneVolume)
          : new LoopTone(this.toneSrc!, this.settings.toneVolume);
      this.tone.start(TONE_FADE_IN_S);
    }
    await this.player.play();
  }

  pause() {
    this.player.pause();
    this.tone?.pause();
  }

  async resume() {
    if (this.settings.engine === 'webaudio') await getMixer().ctx.resume();
    this.tone?.resume();
    try {
      await this.player.resume();
    } catch (e) {
      this.tone?.pause();
      throw e;
    }
  }

  get paused() {
    return this.player.paused;
  }

  setVoiceVolume(v: number) {
    this.player.setVolume(v);
  }

  setToneVolume(v: number) {
    this.tone?.setVolume(v);
  }

  stop() {
    this.tone?.stop(1.5);
    this.player.destroy();
    this.cleanup();
  }

  private handleSegment(i: number) {
    if (this.segments[i].phase === 'exit' && !this.exitStarted) {
      this.exitStarted = true;
      this.tone?.stop(TONE_FADE_OUT_EXIT_S);
    }
  }

  private handleFinished() {
    this.tone?.stop(this.sleep ? TONE_FADE_OUT_SLEEP_S : 3);
    this.onFinished?.();
    // En modo dormir el tono sigue apagándose; se libera al terminar el fade.
    window.setTimeout(() => this.cleanup(), (this.sleep ? TONE_FADE_OUT_SLEEP_S + 2 : 4) * 1000);
  }

  private cleanup() {
    if (this.toneSrc) URL.revokeObjectURL(this.toneSrc);
    this.toneSrc = null;
    if (this.settings.engine === 'webaudio') getMixer().ctx.onstatechange = null;
  }
}

/**
 * Plan C: si el audio no carga, la sesión sigue en modo visual con un reloj
 * propio que recorre el mismo timeline (sin voz ni tono).
 */
export class VisualClock implements Clock {
  private startedAt = 0;
  private pausedAt: number | null = 0;
  private elapsedBeforePause = 0;

  constructor(readonly totalDuration: number) {}

  start() {
    this.startedAt = performance.now();
    this.pausedAt = null;
  }

  pause() {
    if (this.pausedAt !== null) return;
    this.elapsedBeforePause = this.time();
    this.pausedAt = performance.now();
  }

  resume() {
    this.startedAt = performance.now();
    this.pausedAt = null;
  }

  get paused() {
    return this.pausedAt !== null;
  }

  time() {
    if (this.pausedAt !== null) return this.elapsedBeforePause;
    return Math.min(this.totalDuration, this.elapsedBeforePause + (performance.now() - this.startedAt) / 1000);
  }
}
