import { diag } from '../platform/diag';
import { getMixer, setGain, sliderToGain } from './mixer';
import type { EngineMode, PlannedSegment } from './types';

/**
 * Reproduce la voz de una sesión como UN solo archivo continuo.
 *
 * Los segmentos (intro, cuenta, contenido, salida) son MP3 sin cabecera con el
 * mismo formato, así que se unen byte a byte en un único Blob. Un solo <audio>
 * y un solo archivo: no hay cambio de reproductor entre segmentos, que es
 * justo lo que Android puede bloquear con la pantalla apagada.
 *
 * El reloj de la sesión ES el audio: audio.currentTime.
 */
export class VoicePlayer {
  private el: HTMLAudioElement;
  private url: string | null = null;
  private index = 0;
  private finished = false;
  /** true mientras la pausa la pidió la app (no el sistema). */
  private ownPause = false;
  /** true si la última pausa la hizo el sistema y aún no se reanuda. */
  private externalPause = false;
  onSegmentStart?: (index: number) => void;
  onFinished?: () => void;
  /** Cada avance del audio (unas 4 veces por segundo, también con la pantalla apagada). */
  onTime?: (t: number) => void;
  /** El sistema pausó la voz (llamada entrante, otra app tomó el audio…). */
  onExternalPause?: () => void;
  /** El sistema reanudó la voz por su cuenta (iPhone al colgar una llamada). */
  onExternalResume?: () => void;

  constructor(
    readonly segments: PlannedSegment[],
    readonly engine: EngineMode,
    slider: number,
  ) {
    const el = new Audio();
    this.el = el;
    el.preload = 'auto';
    el.addEventListener('ended', () => {
      if (this.finished) return;
      diag('voz: fin');
      this.finished = true;
      this.onFinished?.();
    });
    el.addEventListener('timeupdate', () => {
      this.checkSegment();
      this.onTime?.(el.currentTime);
    });
    el.addEventListener('play', () => {
      this.ownPause = false;
      if (this.externalPause) {
        this.externalPause = false;
        diag('voz: el sistema la reanudó');
        this.onExternalResume?.();
      }
    });
    el.addEventListener('pause', () => {
      if (!this.ownPause && !el.ended && !this.finished) this.markExternalPause('el sistema la pausó');
    });
    el.addEventListener('stalled', () => diag(`voz: atascada en ${el.currentTime.toFixed(1)} s`));
    el.addEventListener('error', () => diag(`voz: error ${el.error?.code ?? ''}`));
    if (engine === 'webaudio') {
      const { ctx, voice } = getMixer();
      setGain(voice, sliderToGain(slider), 0.01);
      ctx.createMediaElementSource(el).connect(voice);
    } else {
      el.volume = sliderToGain(slider);
    }
  }

  get totalDuration(): number {
    const last = this.segments[this.segments.length - 1];
    return last.offset + last.duration;
  }

  /** Descarga (o lee del caché) los segmentos y los une. Lanza error si alguno falla. */
  async load(baseUrl: string, onProgress?: (fraction: number) => void): Promise<void> {
    let done = 0;
    const parts = await Promise.all(
      this.segments.map(async (s) => {
        const res = await fetch(baseUrl + s.file);
        if (!res.ok) throw new Error(`HTTP ${res.status} en ${s.file}`);
        const blob = await res.blob();
        onProgress?.(++done / this.segments.length);
        return blob;
      }),
    );
    this.url = URL.createObjectURL(new Blob(parts, { type: 'audio/mpeg' }));
    this.el.src = this.url;
    diag(`voz: ${parts.length} segmentos unidos (${Math.round(this.totalDuration)} s)`);
  }

  async play(): Promise<void> {
    if (this.finished) return;
    this.onSegmentStart?.(this.index);
    await this.el.play();
    diag('voz: inicia');
  }

  pause(): void {
    this.ownPause = true;
    this.el.pause();
  }

  async resume(): Promise<void> {
    this.externalPause = false;
    try {
      await this.el.play();
    } catch (e) {
      this.markExternalPause(`no pudo reanudar (${(e as Error).name})`);
      throw e;
    }
  }

  get paused(): boolean {
    return this.el.paused;
  }

  /** Tiempo global de la sesión en segundos. */
  time(): number {
    return this.finished ? this.totalDuration : this.el.currentTime;
  }

  get segmentIndex(): number {
    return this.index;
  }

  setVolume(slider: number): void {
    if (this.engine === 'webaudio') setGain(getMixer().voice, sliderToGain(slider));
    else this.el.volume = sliderToGain(slider);
  }

  /** Salta a un tiempo global (usado por las pruebas automáticas). */
  async seek(globalT: number): Promise<void> {
    if (this.el.readyState < 1) await new Promise((r) => this.el.addEventListener('loadedmetadata', r, { once: true }));
    this.el.currentTime = globalT;
    this.checkSegment();
  }

  /** Avisa cuando la reproducción entra a otro segmento (para el fade del tono). */
  private checkSegment() {
    const t = this.el.currentTime;
    let i = this.segments.length - 1;
    while (i > 0 && t < this.segments[i].offset) i--;
    if (i !== this.index) {
      this.index = i;
      diag(`segmento ${i + 1}/${this.segments.length}: ${this.segments[i].id}`);
      this.onSegmentStart?.(i);
    }
  }

  private markExternalPause(reason: string) {
    if (this.externalPause) return;
    this.externalPause = true;
    diag(`voz: ${reason} en ${this.el.currentTime.toFixed(1)} s`);
    this.onExternalPause?.();
  }

  destroy(): void {
    this.finished = true;
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }
}
