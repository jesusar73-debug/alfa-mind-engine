import { getMixer, setGain, sliderToGain } from './mixer';
import type { ToneMode } from './types';

/** Ondas: tono binaural o isocrónico a theta (6 Hz), alfa (10 Hz) o delta (3 Hz). Dos motores con la misma interfaz. */
export interface Tone {
  start(fadeInS: number): void;
  pause(): void;
  resume(): void;
  /** Fade-out y apagado. Devuelve cuándo termina (ms). */
  stop(fadeOutS: number): void;
  setVolume(slider: number): void;
  /** Cambia la frecuencia del pulso en vivo, sin cortes. */
  setBeat?(hz: Beat): void;
  /** Deja el reproductor andando en silencio para poder entrar después sin arrancarlo de nuevo. */
  prime?(): void;
}

export type Beat = 3 | 6 | 10;
export const BEATS: Beat[] = [6, 10, 3];

const CARRIER_HZ = 200;
const LEVEL = 0.4; // nivel interno: audible en bocina de celular sin tapar la voz

/**
 * Tono generado en vivo con Web Audio.
 * - Binaural: 200 Hz izquierda, 200 + pulso a la derecha (requiere audífonos).
 * - Isocrónico: 200 Hz modulado por un pulso de coseno elevado a la frecuencia elegida.
 */
export class LiveTone implements Tone {
  private nodes: AudioScheduledSourceNode[] = [];
  private envelope: GainNode;
  private stopped = false;
  /** El oscilador cuya frecuencia marca el pulso (derecho en binaural, LFO en isocrónico). */
  private beatOsc: OscillatorNode;
  private beatOffset: number;

  constructor(mode: ToneMode, slider: number, beat: Beat = 10) {
    const { ctx, tone } = getMixer();
    setGain(tone, sliderToGain(slider), 0.01);
    this.envelope = ctx.createGain();
    this.envelope.gain.value = 0;
    this.envelope.connect(tone);

    if (mode === 'binaural') {
      const merger = ctx.createChannelMerger(2);
      const left = new OscillatorNode(ctx, { frequency: CARRIER_HZ });
      const right = new OscillatorNode(ctx, { frequency: CARRIER_HZ + beat });
      left.connect(merger, 0, 0);
      right.connect(merger, 0, 1);
      const level = new GainNode(ctx, { gain: LEVEL });
      merger.connect(level).connect(this.envelope);
      this.nodes = [left, right];
      this.beatOsc = right;
      this.beatOffset = CARRIER_HZ;
    } else {
      // am.gain = 0.5 + 0.5·sin(2π·pulso·t)  → pulso suave (coseno elevado), nunca cuadrado.
      const carrier = new OscillatorNode(ctx, { frequency: CARRIER_HZ });
      const am = new GainNode(ctx, { gain: 0.5 });
      const lfo = new OscillatorNode(ctx, { frequency: beat });
      const depth = new GainNode(ctx, { gain: 0.5 });
      lfo.connect(depth).connect(am.gain);
      const level = new GainNode(ctx, { gain: LEVEL * 1.4 });
      carrier.connect(am).connect(level).connect(this.envelope);
      this.nodes = [carrier, lfo];
      this.beatOsc = lfo;
      this.beatOffset = 0;
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

  setBeat(hz: Beat) {
    const f = this.beatOsc.frequency;
    const now = this.beatOsc.context.currentTime;
    f.cancelScheduledValues(now);
    f.setValueAtTime(f.value, now);
    f.linearRampToValueAtTime(this.beatOffset + hz, now + 3); // deslizamiento de 3 s
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

  prime() {
    void this.el.play().catch(() => undefined);
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

/**
 * Bucle del tono para el modo compatibilidad, generado en el teléfono:
 * 10 s exactos, con ciclos enteros de portadora y de pulso (200, 203/206/210 Hz y 3/6/10 Hz),
 * así repite sin clic.
 */
export function toneLoopBuffer(mode: ToneMode, beat: Beat): AudioBuffer {
  const sr = 22050;
  const n = 10 * sr;
  const amp = 0.35;
  const buf = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if (mode === 'binaural') {
      L[i] = amp * Math.sin(2 * Math.PI * CARRIER_HZ * t);
      R[i] = amp * Math.sin(2 * Math.PI * (CARRIER_HZ + beat) * t);
    } else {
      const v = amp * (0.5 - 0.5 * Math.cos(2 * Math.PI * beat * t)) * Math.sin(2 * Math.PI * CARRIER_HZ * t);
      L[i] = v;
      R[i] = v;
    }
  }
  return buf;
}
