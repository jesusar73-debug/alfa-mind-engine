import type { Phase, TimelineEvent } from './types';

export interface TimelineState {
  phase: Phase;
  number: number | null;
  numberSpoken: boolean;
  caption: string | null;
  breath: { value: 'inhala' | 'sostén' | 'exhala'; start: number; dur: number } | null;
}

/** Busca el último evento con t <= tiempo (búsqueda binaria). */
function lastIndexAtOrBefore(events: TimelineEvent[], t: number): number {
  let lo = 0;
  let hi = events.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].t <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/**
 * Estado visible en el instante t (segundos de audio).
 * Se recorre hacia atrás desde el último evento ya ocurrido.
 */
export function stateAt(events: TimelineEvent[], t: number): TimelineState {
  const state: TimelineState = { phase: 'intro', number: null, numberSpoken: false, caption: null, breath: null };
  let gotPhase = false;
  let gotNumber = false;
  let gotCaption = false;
  let gotBreath = false;
  for (let i = lastIndexAtOrBefore(events, t); i >= 0; i--) {
    const e = events[i];
    if (e.kind === 'phase' && !gotPhase) {
      state.phase = e.value;
      gotPhase = true;
      break; // nada anterior a la fase actual importa
    }
    if (e.kind === 'number' && !gotNumber) {
      state.number = e.value;
      state.numberSpoken = e.spoken;
      gotNumber = true;
    } else if (e.kind === 'say' && !gotCaption) {
      state.caption = e.text;
      gotCaption = true;
    } else if (e.kind === 'breath' && !gotBreath) {
      if (t < e.t + e.dur) state.breath = { value: e.value, start: e.t, dur: e.dur };
      gotBreath = true;
    }
  }
  return state;
}
