export type Phase = 'intro' | 'countdown' | 'content' | 'exit';

export type TimelineEvent =
  | { t: number; kind: 'phase'; value: Phase }
  /** Nombre de la fase de una rutina (p. ej. Sintonía 10: “Descenso a alfa”). */
  | { t: number; kind: 'chapter'; value: string }
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
}

export type ToneMode = 'binaural' | 'isocronico';
export type EngineMode = 'webaudio' | 'compat';

/** Un segmento ya colocado dentro de una sesión. */
export interface PlannedSegment extends ManifestSegment {
  id: string;
  offset: number;
}
