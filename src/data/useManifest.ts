import { useEffect, useState } from 'react';
import type { AudioManifest } from '../audio/types';
import { loadManifest, type SessionSpec } from './content';

export function useManifest(): AudioManifest | null {
  const [m, setM] = useState<AudioManifest | null>(null);
  useEffect(() => {
    let alive = true;
    loadManifest()
      .then((x) => alive && setM(x))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return m;
}

/** Duración aproximada de una sesión en minutos (null si no hay audio). */
export function minutesOf(spec: SessionSpec, m: AudioManifest | null): number | null {
  if (!m) return null;
  let s = 0;
  for (const id of spec.segmentIds) {
    const seg = m.segments[id];
    if (!seg) return null;
    s += seg.duration;
  }
  return Math.round(s / 60);
}
