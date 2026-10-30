// Sonidos de ambiente generados en el teléfono: sin archivos, sin descargas, sin licencias.
// Cada uno se sintetiza una vez con un OfflineAudioContext (ruido filtrado y modulado)
// como un bucle de LOOP_S segundos con la unión fundida, así repite sin cortes.

import { getMixer, setGain, sliderToGain } from './mixer';

export type AmbientKind = 'lluvia' | 'rio' | 'viento' | 'ninguno';
export const AMBIENT_KINDS: AmbientKind[] = ['lluvia', 'rio', 'viento', 'ninguno'];

const SR = 22050;
const LOOP_S = 24;
const SEAM_S = 2; // segundos de fundido en la unión del bucle
const TARGET_RMS = 0.12;

/** Generador pseudoaleatorio con semilla: el mismo sonido cada vez. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Color = 'white' | 'pink' | 'brown';

function noise(ctx: BaseAudioContext, seconds: number, color: Color, seed: number): AudioBuffer {
  const n = Math.ceil(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const r = rng(seed);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    if (color === 'white') d[i] = w;
    else if (color === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else {
      // Rosa (aproximación de Paul Kellet).
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  return buf;
}

/** Curva suave al azar entre lo y hi, con un punto nuevo cada `every` segundos. */
function wander(seconds: number, every: number, lo: number, hi: number, seed: number): Float32Array {
  const r = rng(seed);
  const rate = 50;
  const pts = Array.from({ length: Math.ceil(seconds / every) + 2 }, () => lo + (hi - lo) * r());
  const out = new Float32Array(Math.ceil(seconds * rate));
  for (let i = 0; i < out.length; i++) {
    const x = i / rate / every;
    const k = Math.floor(x);
    const f = (1 - Math.cos((x - k) * Math.PI)) / 2;
    out[i] = pts[k] * (1 - f) + pts[k + 1] * f;
  }
  return out;
}

function source(ctx: BaseAudioContext, buf: AudioBuffer): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  return s;
}

/** Arma la escena de cada sonido dentro del contexto offline. */
function build(ctx: OfflineAudioContext, kind: Exclude<AmbientKind, 'ninguno'>, seconds: number) {
  const out = ctx.destination;
  const starts: AudioBufferSourceNode[] = [];

  if (kind === 'lluvia') {
    // Cortina de lluvia: ruido rosa sin graves ni agudos extremos.
    const bed = source(ctx, noise(ctx, seconds, 'pink', 11));
    const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 420 });
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 6500 });
    const g = new GainNode(ctx, { gain: 0.9 });
    g.gain.setValueCurveAtTime(wander(seconds, 5, 0.75, 1, 12), 0, seconds);
    bed.connect(hp).connect(lp).connect(g).connect(out);
    // Gotas: impulsos cortos y dispersos, filtrados en la zona media-alta.
    const drops = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
    const dd = drops.getChannelData(0);
    const r = rng(13);
    const perSecond = 38;
    for (let k = 0; k < seconds * perSecond; k++) {
      const at = Math.floor(r() * dd.length);
      const amp = r() ** 3 * 0.9;
      const len = Math.floor(ctx.sampleRate * (0.002 + r() * 0.006));
      for (let j = 0; j < len && at + j < dd.length; j++) dd[at + j] += amp * (r() * 2 - 1) * Math.exp(-j / (len / 4));
    }
    const ds = source(ctx, drops);
    const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 2600, Q: 0.9 });
    ds.connect(bp).connect(new GainNode(ctx, { gain: 1.6 })).connect(out);
    starts.push(bed, ds);
  } else if (kind === 'rio') {
    // Corriente grave y continua más un burbujeo que cambia de tono.
    const flow = source(ctx, noise(ctx, seconds, 'brown', 21));
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1000 });
    const g = new GainNode(ctx, { gain: 0.8 });
    g.gain.setValueCurveAtTime(wander(seconds, 3, 0.7, 1, 22), 0, seconds);
    flow.connect(lp).connect(g).connect(out);
    const bubbles = source(ctx, noise(ctx, seconds, 'pink', 23));
    const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 900, Q: 2.5 });
    bp.frequency.setValueCurveAtTime(wander(seconds, 0.35, 500, 1600, 24), 0, seconds);
    const bg = new GainNode(ctx, { gain: 0.5 });
    bg.gain.setValueCurveAtTime(wander(seconds, 0.5, 0.15, 0.7, 25), 0, seconds);
    bubbles.connect(bp).connect(bg).connect(out);
    starts.push(flow, bubbles);
  } else {
    // Viento: ráfagas lentas, un filtro que sube y baja como el aire entre árboles.
    const air = source(ctx, noise(ctx, seconds, 'pink', 31));
    const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 500, Q: 0.8 });
    bp.frequency.setValueCurveAtTime(wander(seconds, 6, 240, 950, 32), 0, seconds);
    const g = new GainNode(ctx, { gain: 1 });
    g.gain.setValueCurveAtTime(wander(seconds, 5, 0.25, 1, 33), 0, seconds);
    air.connect(bp).connect(g).connect(out);
    const low = source(ctx, noise(ctx, seconds, 'brown', 34));
    const lg = new GainNode(ctx, { gain: 0.45 });
    lg.gain.setValueCurveAtTime(wander(seconds, 7, 0.3, 1, 35), 0, seconds);
    low.connect(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 300 })).connect(lg).connect(out);
    starts.push(air, low);
  }
  starts.forEach((s) => s.start(0));
}

const cache = new Map<AmbientKind, Promise<AudioBuffer>>();

/**
 * Genera (una vez por sesión de la app) el bucle estéreo del sonido.
 * Se renderiza LOOP_S + SEAM_S y la cola se funde sobre el inicio: el final empalma con el principio.
 */
export function ambientBuffer(kind: Exclude<AmbientKind, 'ninguno'>): Promise<AudioBuffer> {
  let p = cache.get(kind);
  if (!p) {
    p = (async () => {
      const total = LOOP_S + SEAM_S;
      const off = new OfflineAudioContext(1, Math.ceil(total * SR), SR);
      build(off, kind, total);
      const rendered = (await off.startRendering()).getChannelData(0);
      const n = LOOP_S * SR;
      const seam = SEAM_S * SR;
      const mono = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        if (i < seam) {
          const w = i / seam; // fundido de igual potencia
          mono[i] = rendered[i] * Math.sin((w * Math.PI) / 2) + rendered[n + i] * Math.cos((w * Math.PI) / 2);
        } else mono[i] = rendered[i];
      }
      // Nivel parejo entre sonidos.
      let sum = 0;
      for (let i = 0; i < n; i++) sum += mono[i] * mono[i];
      const gain = TARGET_RMS / Math.max(1e-6, Math.sqrt(sum / n));
      // Estéreo: el canal derecho es el izquierdo corrido 17 ms (en bucle), da amplitud sin cambiar el sonido.
      const out = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: SR });
      const L = out.getChannelData(0);
      const R = out.getChannelData(1);
      const shift = Math.round(0.017 * SR);
      for (let i = 0; i < n; i++) {
        L[i] = Math.max(-1, Math.min(1, mono[i] * gain));
        R[i] = Math.max(-1, Math.min(1, mono[(i + n - shift) % n] * gain));
      }
      return out;
    })();
    cache.set(kind, p);
    p.catch(() => cache.delete(kind));
  }
  return p;
}

/** WAV de 16 bits, para el modo compatibilidad (<audio loop>, sin Web Audio). */
export function toWavBlob(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  data.setUint32(4, 36 + n * ch * 2, true);
  w(8, 'WAVEfmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, ch, true);
  data.setUint32(24, buf.sampleRate, true);
  data.setUint32(28, buf.sampleRate * ch * 2, true);
  data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true);
  w(36, 'data');
  data.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++, o += 2) data.setInt16(o, Math.max(-1, Math.min(1, chans[c][i])) * 0x7fff, true);
  return new Blob([data], { type: 'audio/wav' });
}

/** Canal de ambiente. Misma interfaz para los dos motores. */
export interface Ambient {
  start(fadeInS: number): void;
  pause(): void;
  resume(): void;
  stop(fadeOutS: number): void;
  setVolume(slider: number): void;
}

const LEVEL = 0.9;

/** Ambiente por Web Audio: el bucle en un AudioBufferSourceNode con loop. */
export class LiveAmbient implements Ambient {
  private src: AudioBufferSourceNode;
  private env: GainNode;
  private stopped = false;

  constructor(buffer: AudioBuffer, slider: number) {
    const { ctx, ambient } = getMixer();
    setGain(ambient, sliderToGain(slider), 0.01);
    this.env = new GainNode(ctx, { gain: 0 });
    this.env.connect(ambient);
    this.src = new AudioBufferSourceNode(ctx, { buffer, loop: true });
    this.src.connect(new GainNode(ctx, { gain: LEVEL })).connect(this.env);
    this.src.start();
  }

  private ramp(target: number, s: number) {
    if (this.stopped && target > 0) return;
    const g = this.env.gain;
    const now = this.env.context.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(target, now + Math.max(0.05, s));
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
    this.src.stop(this.env.context.currentTime + fadeOutS + 0.1);
  }
  setVolume(slider: number) {
    setGain(getMixer().ambient, sliderToGain(slider));
  }
}

/** Ambiente en modo compatibilidad: el mismo bucle como WAV en <audio loop>. */
export class LoopAmbient implements Ambient {
  private el: HTMLAudioElement;
  private url: string;
  private level = 0;
  private slider: number;
  private timer: number | undefined;
  private stopped = false;

  constructor(buffer: AudioBuffer, slider: number) {
    this.slider = slider;
    this.url = URL.createObjectURL(toWavBlob(buffer));
    this.el = new Audio(this.url);
    this.el.loop = true;
    this.el.volume = 0;
  }

  private apply() {
    this.el.volume = Math.min(1, sliderToGain(this.slider) * this.level * LEVEL);
  }

  private fadeTo(target: number, s: number, done?: () => void) {
    window.clearInterval(this.timer);
    const from = this.level;
    const t0 = performance.now();
    const ms = Math.max(50, s * 1000);
    this.timer = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      this.level = from + (target - from) * k;
      this.apply();
      if (k >= 1) {
        window.clearInterval(this.timer);
        done?.();
      }
    }, 100);
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
      URL.revokeObjectURL(this.url);
    });
  }
  setVolume(slider: number) {
    this.slider = slider;
    this.apply();
  }
}
