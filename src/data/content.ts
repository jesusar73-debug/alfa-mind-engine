import levelsJson from '../../content/levels.json';
import modulesJson from '../../content/modules.json';
import type { AudioManifest, ManifestSegment, PlannedSegment, TimelineEvent } from '../audio/types';

export interface Level {
  id: string;
  name: string;
  from: number;
  days: number | null;
}

export interface Tool {
  id: string;
  title: string;
  summary: string;
  instructions: string[];
  segments: string[];
  segmentsAwake?: string[];
  sleepOption?: boolean;
  /** Segundo en que entran las ondas (Sintonía 10: 120). Sin valor: desde el inicio. */
  toneStartAt?: number;
  /** Rampa de salida de ondas y ambiente al empezar la salida (s). */
  bedFadeOutS?: number;
}

export const LEVELS: Level[] = levelsJson.levels;
export const INTERVALS: number[] = levelsJson.intervals;
export const TOOL_COUNTDOWN_FROM: number = levelsJson.toolCountdownFrom;
export const CONDITIONING_SEGMENTS: string[] = modulesJson.conditioning.segments;
export const TOOLS: Tool[] = modulesJson.tools;

export const BASE_URL = import.meta.env.BASE_URL;

let manifestPromise: Promise<AudioManifest> | null = null;

export function loadManifest(): Promise<AudioManifest> {
  manifestPromise ??= fetch(`${BASE_URL}audio/manifest.json`).then((r) => {
    if (!r.ok) throw new Error(`manifest HTTP ${r.status}`);
    return r.json() as Promise<AudioManifest>;
  });
  manifestPromise.catch(() => (manifestPromise = null));
  return manifestPromise;
}

export function countdownId(from: number, interval: number, sayEvery: number): string {
  return `cd-${from}-${interval}-${from <= 10 ? 1 : sayEvery}`;
}

export interface SessionSpec {
  kind: 'conditioning' | 'tool';
  title: string;
  segmentIds: string[];
  /** Vaso de agua nocturno: sin salida, fade lento del tono. */
  sleep: boolean;
  levelId?: string;
  toolId?: string;
  toneStartAt?: number;
  bedFadeOutS?: number;
}

export function conditioningSpec(level: Level, interval: number, sayEvery: number): SessionSpec {
  return {
    kind: 'conditioning',
    title: `${level.name} · ${level.from} → 1`,
    levelId: level.id,
    sleep: false,
    segmentIds: CONDITIONING_SEGMENTS.map((s) =>
      s === 'countdown' ? countdownId(level.from, interval, sayEvery) : s,
    ),
  };
}

export function toolSpec(tool: Tool, interval: number, sleep: boolean): SessionSpec {
  const useSleep = Boolean(tool.sleepOption && sleep);
  const list = !useSleep && tool.segmentsAwake ? tool.segmentsAwake : tool.segments;
  return {
    kind: 'tool',
    title: tool.title,
    toolId: tool.id,
    sleep: useSleep,
    toneStartAt: tool.toneStartAt,
    bedFadeOutS: tool.bedFadeOutS,
    segmentIds: list.map((s) => (s === 'countdown' ? countdownId(TOOL_COUNTDOWN_FROM, interval, 1) : s)),
  };
}

export function planSegments(spec: SessionSpec, manifest: AudioManifest): PlannedSegment[] {
  let offset = 0;
  return spec.segmentIds.map((id) => {
    const seg: ManifestSegment | undefined = manifest.segments[id];
    if (!seg) throw new Error(`Falta el audio "${id}". Corre npm run build:audio.`);
    const planned = { ...seg, id, offset };
    offset += seg.duration;
    return planned;
  });
}

/** Une los eventos de todos los segmentos en tiempo global, ordenados. */
export function flattenEvents(segments: PlannedSegment[]): TimelineEvent[] {
  return segments.flatMap((s) => s.events.map((e) => ({ ...e, t: e.t + s.offset })));
}
