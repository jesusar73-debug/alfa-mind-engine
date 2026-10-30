import type { TimelineState } from './timeline';

/**
 * "El descenso": qué tan profundo está la sesión, de 0 (niebla) a 1 (mar de noche).
 * - Relajación inicial: superficie.
 * - Cuenta regresiva: baja número a número (de `from` a 1).
 * - Ejercicio o cierre: en lo profundo (el Vaso de Agua nocturno se queda ahí).
 * - Salida 1→5: vuelve a la superficie al llegar a cinco.
 */
export function descentLevel(state: TimelineState | null, countdownFrom: number): number {
  if (!state) return 0;
  switch (state.phase) {
    case 'intro':
      return 0;
    case 'countdown':
      if (state.number === null || countdownFrom <= 1) return 0.1;
      return 0.15 + (0.85 * (countdownFrom - state.number)) / (countdownFrom - 1);
    case 'content':
      return 1;
    case 'exit':
      return state.number === null ? 1 : 1 - state.number / 5;
  }
}

// Tonos del descenso (los mismos que --color-stage-* en index.css).
const STAGE_0 = '#dbe6e8';
const STAGE_M = '#3f7c84';
const STAGE_1 = '#0d2328';
const INK_DARK = '#0c1a1d';
const INK_LIGHT = '#eef6f7';
const MIN_CONTRAST = 4.5; // texto pequeño (WCAG AA)

function mix(a: string, b: string, k: number): string {
  const pa = a.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

function luminance(hex: string): number {
  const [r, g, b] = hex.match(/\w\w/g)!.map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Fondo y tinta para un nivel de profundidad. El fondo pasa por un medio saturado
 * (nunca por un gris turbio) y la tinta es la que más contrasta. En la franja estrecha
 * donde ninguna llega a 4.5:1, el fondo se oscurece un poco hasta que la tinta clara llegue.
 */
export function stageColors(k: number): { bg: string; ink: string } {
  const c = Math.min(1, Math.max(0, k));
  let bg = c < 0.5 ? mix(STAGE_0, STAGE_M, c * 2) : mix(STAGE_M, STAGE_1, (c - 0.5) * 2);
  if (contrast(bg, INK_DARK) >= MIN_CONTRAST) return { bg, ink: INK_DARK };
  for (let i = 0; i < 20 && contrast(bg, INK_LIGHT) < MIN_CONTRAST; i++) bg = mix(bg, STAGE_1, 0.08);
  return { bg, ink: INK_LIGHT };
}
