// Un solo AudioContext para toda la app: voz y tono con GainNodes propios.

export interface Mixer {
  ctx: AudioContext;
  voice: GainNode;
  tone: GainNode;
}

let mixer: Mixer | null = null;

export function getMixer(): Mixer {
  if (!mixer) {
    const ctx = new AudioContext({ latencyHint: 'playback' });
    const voice = ctx.createGain();
    const tone = ctx.createGain();
    voice.connect(ctx.destination);
    tone.connect(ctx.destination);
    mixer = { ctx, voice, tone };
  }
  return mixer;
}

export function hasMixer(): boolean {
  return mixer !== null;
}

/** Cambia un volumen sin clics (rampa corta). */
export function setGain(node: GainNode, value: number, seconds = 0.08): void {
  const now = node.context.currentTime;
  node.gain.cancelScheduledValues(now);
  node.gain.setValueAtTime(node.gain.value, now);
  node.gain.linearRampToValueAtTime(value, now + seconds);
}

/** Curva perceptual: el slider se siente lineal al oído. */
export function sliderToGain(v: number): number {
  return v <= 0 ? 0 : v * v;
}
