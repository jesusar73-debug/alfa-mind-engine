export type Phase = 'intro' | 'countdown' | 'content' | 'exit';

export type TimelineEvent =
  | { t: number; kind: 'phase'; value: Phase }
  | { t: number; kind: 'say'; text: string; dur?: number }
  | { t: number; kind: 'breath'; value: 'inhala' | 'sostén' | 'exhala'; dur: number }
  | { t: number; kind: 'number'; value: number; spoken: boolean };

export interface ManifestSegment {
  file: string;
  phase: Phase;
  duration: number;
  bytes: number;
  events: TimelineEvent[];
}

export interface AudioManifest {
  voice: string;
  lengthScale: number;
  bitrate: string;
  totalBytes: number;
  segments: Record<string, ManifestSegment>;
  tones: Record<ToneMode, { file: string; bytes: number }>;
}

export type ToneMode = 'binaural' | 'isocronico';
export type EngineMode = 'webaudio' | 'compat';

/** Un segmento ya colocado dentro de una sesión. */
export interface PlannedSegment extends ManifestSegment {
  id: string;
  offset: number;
}
