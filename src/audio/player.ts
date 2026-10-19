import { getMixer, setGain, sliderToGain } from './mixer';
import type { EngineMode, PlannedSegment } from './types';

/**
 * Reproduce los segmentos de voz de una sesión uno tras otro.
 * El reloj de la sesión ES el audio: offset del segmento + audio.currentTime.
 *
 * Se usan dos <audio> alternados: mientras uno suena, el otro precarga el siguiente.
 * Los MP3 se leen como blob (desde el caché offline) para evitar problemas de
 * peticiones parciales (Range) con el service worker.
 */
export class VoicePlayer {
  private els: [HTMLAudioElement, HTMLAudioElement];
  private urls: string[] = [];
  private index = 0;
  private finished = false;
  /** true mientras la pausa la pidió la app (no el sistema). */
  private ownPause = false;
  onSegmentStart?: (index: number) => void;
  onFinished?: () => void;
  /** El sistema pausó la voz (llamada entrante, otra app tomó el audio…). */
  onExternalPause?: () => void;

  constructor(
    readonly segments: PlannedSegment[],
    readonly engine: EngineMode,
    slider: number,
  ) {
    this.els = [new Audio(), new Audio()];
    for (const el of this.els) {
      el.preload = 'auto';
      el.addEventListener('ended', () => this.handleEnded(el));
      el.addEventListener('play', () => (this.ownPause = false));
      el.addEventListener('pause', () => {
        if (el === this.current && !this.ownPause && !el.ended && !this.finished) this.onExternalPause?.();
      });
    }
    if (engine === 'webaudio') {
      const { ctx, voice } = getMixer();
      setGain(voice, sliderToGain(slider), 0.01);
      for (const el of this.els) ctx.createMediaElementSource(el).connect(voice);
    } else {
      for (const el of this.els) el.volume = sliderToGain(slider);
    }
  }

  get totalDuration(): number {
    const last = this.segments[this.segments.length - 1];
    return last.offset + last.duration;
  }

  /** Descarga (o lee del caché) todos los audios. Lanza error si alguno falla. */
  async load(baseUrl: string, onProgress?: (fraction: number) => void): Promise<void> {
    let done = 0;
    this.urls = await Promise.all(
      this.segments.map(async (s) => {
        const res = await fetch(baseUrl + s.file);
        if (!res.ok) throw new Error(`HTTP ${res.status} en ${s.file}`);
        const blob = await res.blob();
        onProgress?.(++done / this.segments.length);
        return URL.createObjectURL(blob);
      }),
    );
    this.els[0].src = this.urls[0];
    if (this.urls[1]) this.els[1].src = this.urls[1];
  }

  private get current(): HTMLAudioElement {
    return this.els[this.index % 2];
  }

  async play(): Promise<void> {
    if (this.finished) return;
    this.onSegmentStart?.(this.index);
    await this.current.play();
  }

  pause(): void {
    this.ownPause = true;
    this.current.pause();
  }

  resume(): Promise<void> {
    return this.current.play();
  }

  get paused(): boolean {
    return this.current.paused;
  }

  /** Tiempo global de la sesión en segundos. */
  time(): number {
    if (this.finished) return this.totalDuration;
    return this.segments[this.index].offset + this.current.currentTime;
  }

  get segmentIndex(): number {
    return this.index;
  }

  setVolume(slider: number): void {
    if (this.engine === 'webaudio') setGain(getMixer().voice, sliderToGain(slider));
    else for (const el of this.els) el.volume = sliderToGain(slider);
  }

  /** Salta a un tiempo global (usado por las pruebas automáticas). */
  async seek(globalT: number): Promise<void> {
    const target = this.segments.findIndex((s) => globalT < s.offset + s.duration);
    if (target < 0) return;
    const wasPlaying = !this.current.paused;
    this.ownPause = true;
    this.current.pause();
    this.index = target;
    const el = this.current;
    el.src = this.urls[target];
    await new Promise((r) => el.addEventListener('loadedmetadata', r, { once: true }));
    el.currentTime = globalT - this.segments[target].offset;
    const next = this.els[(target + 1) % 2];
    if (this.urls[target + 1]) next.src = this.urls[target + 1];
    this.onSegmentStart?.(target);
    if (wasPlaying) await el.play();
  }

  private handleEnded(el: HTMLAudioElement) {
    if (el !== this.current || this.finished) return;
    if (this.index + 1 >= this.segments.length) {
      this.finished = true;
      this.onFinished?.();
      return;
    }
    this.index++;
    const next = this.current;
    void next.play().catch(() => undefined);
    this.onSegmentStart?.(this.index);
    // Precarga el segmento siguiente en el elemento que acaba de terminar.
    const upcoming = this.urls[this.index + 1];
    if (upcoming) {
      el.src = upcoming;
      el.load();
    }
  }

  destroy(): void {
    this.finished = true;
    for (const el of this.els) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    this.urls.forEach((u) => URL.revokeObjectURL(u));
  }
}
