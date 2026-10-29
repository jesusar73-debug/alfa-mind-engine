// Bitácora de diagnóstico de la última sesión (solo en este celular).
// Sirve para saber qué pasó si el audio se corta: se ve y se copia en "Acerca de".

const KEY = 'ame.diag.v1';
const MAX = 200;
let lines: string[] = [];
let t0 = 0;

function stamp(): string {
  const s = (performance.now() - t0) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // sin almacenamiento: el diagnóstico es opcional
  }
}

export function diagStart(title: string): void {
  t0 = performance.now();
  lines = [`${new Date().toLocaleString('es')} · ${title} · ${navigator.userAgent}`];
  persist();
}

export function diag(event: string): void {
  lines.push(`${stamp()} ${event}`);
  if (lines.length > MAX) lines.splice(1, lines.length - MAX);
  persist();
}

export function readDiag(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

// Visibilidad de la página: clave para entender cortes con pantalla bloqueada.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (t0) diag(`pantalla ${document.visibilityState === 'visible' ? 'visible' : 'oculta'}`);
  });
}
