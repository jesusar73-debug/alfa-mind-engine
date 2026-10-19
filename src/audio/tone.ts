import { getMixer, setGain, sliderToGain } from './mixer';
import type { ToneMode } from './types';

/** Tono alfa de 10 Hz. Dos motores con la misma interfaz. */
export interface Tone {
  start(fadeInS: number): void;
  pause(): void;
  resume(): void;
  /** Fade-out y apagado. Devuelve cuándo termina (ms). */
  stop(fadeOutS: number): void;
  setVolume(slider: number): void;
}

const CARRIER_HZ = 200;
const BEAT_HZ = 10;
const LEVEL = 0.4; // nivel interno: audible en bocina de celular sin tapar la voz

/**
 * Tono generado en vivo con Web Audio.
 * - Binaural: 200 Hz izquierda, 210 Hz derecha (requiere audífonos).
 * - Isocrónico: 200 Hz modulado por un pulso de coseno elevado a 10 Hz.
 */
export class LiveTone implements Tone {
  private nodes: AudioScheduledSourceNode[] = [];
  private envelope: GainNode;
  private stopped = false;

  constructor(mode: ToneMode, slider: number) {
    const { ctx, tone } = getMixer();
    setGain(tone, sliderToGain(slider), 0.01);
    this.envelope = ctx.createGain();
    this.envelope.gain.value = 0;
    this.envelope.connect(tone);

    if (mode === 'binaural') {
      const merger = ctx.createChannelMerger(2);
      const left = new OscillatorNode(ctx, { frequency: CARRIER_HZ });
      const right = new OscillatorNode(ctx, { frequency: CARRIER_HZ + BEAT_HZ });
      left.connect(merger, 0, 0);
      right.connect(merger, 0, 1);
      const level = new GainNode(ctx, { gain: LEVEL });
      merger.connect(level).connect(this.envelope);
      this.nodes = [left, right];
    } else {
      // am.gain = 0.5 + 0.5·sin(2π·10t)  → pulso suave (coseno elevado), nunca cuadrado.
      const carrier = new OscillatorNode(ctx, { frequency: CARRIER_HZ });
      const am = new GainNode(ctx, { gain: 0.5 });
      const lfo = new OscillatorNode(ctx, { frequency: BEAT_HZ });
      const depth = new GainNode(ctx, { gain: 0.5 });
      lfo.connect(depth).connect(am.gain);
      const level = new GainNode(ctx, { gain: LEVEL * 1.4 });
      carrier.connect(am).connect(level).connect(this.envelope);
      this.nodes = [carrier, lfo];
    }
    this.nodes.forEach((n) => n.start());
  }

  start(fadeInS: number) {
    this.ramp(1, fadeInS);
  }

  pause() {
    this.ramp(0, 0.4);
  }

  resume() {
    this.ramp(1, 1.5);
  }

  stop(fadeOutS: number) {
    if (this.stopped) return;
    this.stopped = true;
    this.ramp(0, fadeOutS);
    const end = this.envelope.context.currentTime + fadeOutS + 0.1;
    this.nodes.forEach((n) => n.stop(end));
  }

  setVolume(slider: number) {
    setGain(getMixer().tone, sliderToGain(slider));
  }

  private ramp(target: number, seconds: number) {
    if (this.stopped && target > 0) return;
    const g = this.envelope.gain;
    const now = this.envelope.context.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(target, now + Math.max(0.05, seconds));
  }
}

/**
 * Plan B: tono pre-renderizado (WAV de 10 s exactos) en <audio loop>.
 * Sin Web Audio: sigue sonando aunque el navegador suspenda el AudioContext.
 * Los fades son por pasos (en segundo plano el navegador los vuelve más gruesos).
 */
export class LoopTone implements Tone {
  private el: HTMLAudioElement;
  private level = 0; // 0..1 del envelope
  private slider: number;
  private timer: number | undefined;
  private stopped = false;

  constructor(src: string, slider: number) {
    this.slider = slider;
    this.el = new Audio(src);
    this.el.loop = true;
    this.el.preload = 'auto';
    this.el.volume = 0;
  }

  start(fadeInS: number) {
    void this.el.play().catch(() => undefined);
    this.fadeTo(1, fadeInS);
  }

  pause() {
    this.fadeTo(0, 0.4, () => this.el.pause());
  }

  resume() {
    void this.el.play().catch(() => undefined);
    this.fadeTo(1, 1.5);
  }

  stop(fadeOutS: number) {
    if (this.stopped) return;
    this.stopped = true;
    this.fadeTo(0, fadeOutS, () => {
      this.el.pause();
      this.el.removeAttribute('src');
      this.el.load();
    });
  }

  setVolume(slider: number) {
    this.slider = slider;
    this.apply();
  }

  private apply() {
    this.el.volume = Math.min(1, sliderToGain(this.slider) * this.level * LEVEL * 3);
  }

  private fadeTo(target: number, seconds: number, done?: () => void) {
    window.clearInterval(this.timer);
    const from = this.level;
    const start = performance.now();
    const ms = Math.max(50, seconds * 1000);
    this.timer = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - start) / ms);
      this.level = from + (target - from) * k;
      this.apply();
      if (k >= 1) {
        window.clearInterval(this.timer);
        done?.();
      }
    }, 100);
  }
}
