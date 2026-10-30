import { BASE_URL } from '../data/content';
import { diag } from '../platform/diag';
import type { Settings } from '../state/settings';
import { ambientBuffer, LiveAmbient, LoopAmbient, toWavBlob, type Ambient, type AmbientKind } from './ambient';
import { getMixer } from './mixer';
import { VoicePlayer } from './player';
import { LiveTone, LoopTone, toneLoopBuffer, type Beat, type Tone } from './tone';
import type { PlannedSegment } from './types';

const BED_FADE_IN_S = 10; // ondas y ambiente entran con una rampa de 10 s
const BED_FADE_OUT_EXIT_S = 20; // durante la salida 1→5 se apagan despacio
const BED_FADE_OUT_SLEEP_S = 90; // "dormir directamente": fade muy lento
const AMBIENT_SWAP_S = 2.5; // cambio de ambiente a mitad de sesión: fundido cruzado

export interface Clock {
  time(): number;
  readonly totalDuration: number;
}

/**
 * Una sesión con audio en tres canales: voz guía, ambiente y ondas.
 * Debe crearse dentro del gesto del usuario (botón "Iniciar") para que
 * Android permita arrancar el audio.
 */
export class AudioSession implements Clock {
  readonly player: VoicePlayer;
  private tone: Tone | null = null;
  private toneUrl: string | null = null;
  private ambient: Ambient | null = null;
  private ambientKind: AmbientKind;
  private exitStarted = false;
  private ended = false;
  onFinished?: () => void;
  onSuspended?: () => void;
  onExternalPause?: () => void;
  onExternalResume?: () => void;

  constructor(
    private segments: PlannedSegment[],
    private settings: Settings,
    private sleep: boolean,
  ) {
    this.ambientKind = settings.ambient;
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
      this.beds((b) => b.pause());
      this.onExternalPause?.();
    };
    this.player.onExternalResume = () => {
      if (settings.engine === 'webaudio') void getMixer().ctx.resume().catch(() => undefined);
      this.beds((b) => b.resume());
      this.onExternalResume?.();
    };
  }

  /** Aplica algo a los canales de fondo (ondas y ambiente). */
  private beds(fn: (b: Tone | Ambient) => void) {
    if (this.tone) fn(this.tone);
    if (this.ambient) fn(this.ambient);
  }

  get totalDuration() {
    return this.player.totalDuration;
  }

  time() {
    return this.player.time();
  }

  async load(onProgress?: (f: number) => void) {
    // El ambiente se genera mientras se cargan las voces.
    const amb = this.ambientKind !== 'ninguno' ? ambientBuffer(this.ambientKind) : null;
    await this.player.load(BASE_URL, onProgress);
    if (amb) await amb;
    if (this.settings.toneEnabled && this.settings.engine === 'compat') {
      this.toneUrl = URL.createObjectURL(toWavBlob(toneLoopBuffer(this.settings.toneMode, this.settings.beat)));
    }
  }

  private async makeAmbient(kind: AmbientKind): Promise<Ambient | null> {
    if (kind === 'ninguno') return null;
    const buf = await ambientBuffer(kind);
    return this.settings.engine === 'webaudio'
      ? new LiveAmbient(buf, this.settings.ambientVolume)
      : new LoopAmbient(buf, this.settings.ambientVolume);
  }

  async start() {
    if (this.settings.toneEnabled) {
      this.tone =
        this.settings.engine === 'webaudio'
          ? new LiveTone(this.settings.toneMode, this.settings.toneVolume, this.settings.beat)
          : new LoopTone(this.toneUrl!, this.settings.toneVolume);
      this.tone.start(BED_FADE_IN_S);
    }
    this.ambient = await this.makeAmbient(this.ambientKind);
    this.ambient?.start(BED_FADE_IN_S);
    diag(
      `mezcla: ambiente ${this.ambientKind}, ondas ${
        this.settings.toneEnabled ? `${this.settings.toneMode} ${this.settings.beat} Hz` : 'apagadas'
      }`,
    );
    await this.player.play();
  }

  pause() {
    this.player.pause();
    this.beds((b) => b.pause());
  }

  async resume() {
    if (this.settings.engine === 'webaudio') await getMixer().ctx.resume();
    this.beds((b) => b.resume());
    try {
      await this.player.resume();
    } catch (e) {
      this.beds((b) => b.pause());
      throw e;
    }
  }

  get paused() {
    return this.player.paused;
  }

  /** Estado de la mezcla (para el diagnóstico y las pruebas). */
  mixState() {
    return { ambient: this.ambientKind, ambientOn: this.ambient !== null, toneOn: this.tone !== null };
  }

  setVoiceVolume(v: number) {
    this.player.setVolume(v);
  }

  setToneVolume(v: number) {
    this.tone?.setVolume(v);
  }

  setAmbientVolume(v: number) {
    this.settings = { ...this.settings, ambientVolume: v };
    this.ambient?.setVolume(v);
  }

  /** Cambia el pulso en vivo (en compatibilidad aplica desde la próxima sesión). */
  setBeat(hz: Beat) {
    this.tone?.setBeat?.(hz);
  }

  /** Cambia el sonido de ambiente a mitad de sesión con un fundido cruzado. */
  async setAmbient(kind: AmbientKind) {
    if (kind === this.ambientKind || this.exitStarted || this.ended) return;
    this.ambientKind = kind;
    const old = this.ambient;
    this.ambient = null;
    old?.stop(AMBIENT_SWAP_S);
    const next = await this.makeAmbient(kind);
    if (this.ambientKind !== kind || this.ended) return next?.stop(0);
    this.ambient = next;
    if (next) {
      next.start(AMBIENT_SWAP_S);
      if (this.player.paused) next.pause();
    }
  }

  stop() {
    this.ended = true;
    this.beds((b) => b.stop(1.5));
    this.player.destroy();
    this.cleanup();
  }

  private handleSegment(i: number) {
    if (this.segments[i].phase === 'exit' && !this.exitStarted) {
      this.exitStarted = true;
      this.beds((b) => b.stop(BED_FADE_OUT_EXIT_S));
    }
  }

  private handleFinished() {
    this.ended = true;
    this.beds((b) => b.stop(this.sleep ? BED_FADE_OUT_SLEEP_S : 3));
    this.onFinished?.();
    // En modo dormir las ondas y el ambiente siguen apagándose; se liberan al terminar el fade.
    window.setTimeout(() => this.cleanup(), (this.sleep ? BED_FADE_OUT_SLEEP_S + 2 : 4) * 1000);
  }

  private cleanup() {
    if (this.toneUrl) URL.revokeObjectURL(this.toneUrl);
    this.toneUrl = null;
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
