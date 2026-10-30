import { useSyncExternalStore } from 'react';
import { dayKey } from './progress';
import { readJson, writeJson } from './storage';

/**
 * Registro nocturno: un minuto cada noche, guardado solo en este teléfono.
 * Convierte la rutina en un experimento medible (ver "Alfa Mind Engine — plan de cambios").
 */
export interface JournalEntry {
  /** La escena (slide) de hoy, en una línea. */
  slide: string;
  /** ¿Qué tan atado estuve al resultado? 1 a 10 (null = sin anotar). */
  importance: number | null;
  /** La acción elegida y si se hizo. */
  action: string;
  actionDone: boolean;
  actionNote: string;
  /** Coincidencias, puertas que se abrieron o bloqueos. */
  signals: string;
  updatedAt: string;
}

export interface Journal {
  version: 1;
  entries: Record<string, JournalEntry>; // clave: AAAA-MM-DD (fecha local)
}

export const JOURNAL_KEY = 'ame.journal.v1';
const EMPTY: Journal = { version: 1, entries: {} };

export const emptyEntry = (): JournalEntry => ({
  slide: '',
  importance: null,
  action: '',
  actionDone: false,
  actionNote: '',
  signals: '',
  updatedAt: '',
});

let current: Journal = readJson(JOURNAL_KEY, EMPTY);
const listeners = new Set<() => void>();

function save(next: Journal) {
  current = next;
  writeJson(JOURNAL_KEY, next);
  listeners.forEach((l) => l());
}

export function useJournal(): Journal {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function getJournal(): Journal {
  return current;
}

/** Una entrada vacía (sin nada escrito ni marcado) no se guarda. */
export function isBlank(e: JournalEntry): boolean {
  return !e.slide.trim() && e.importance === null && !e.action.trim() && !e.actionDone && !e.actionNote.trim() && !e.signals.trim();
}

/** Guarda la entrada de un día (o la borra si quedó vacía). */
export function saveEntry(day: string, entry: JournalEntry, now: Date = new Date()): void {
  const entries = { ...current.entries };
  if (isBlank(entry)) delete entries[day];
  else entries[day] = { ...entry, updatedAt: now.toISOString() };
  save({ version: 1, entries });
}

export function replaceJournal(j: Journal): void {
  const entries: Record<string, JournalEntry> = {};
  for (const [k, v] of Object.entries(j?.entries ?? {})) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v && typeof v === 'object') entries[k] = { ...emptyEntry(), ...v };
  }
  save({ version: 1, entries });
}

// ------------------------------------------------------------ fechas ----

export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Lunes a domingo de la semana que contiene `day`. */
export function weekDays(day: Date): string[] {
  const monday = new Date(day.getFullYear(), day.getMonth(), day.getDate() - ((day.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => dayKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
}

export function lastDays(n: number, today: Date = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)));
}

// ------------------------------------------------------ revisión ----

export interface WeekSummary {
  days: number; // días con algo anotado
  avgImportance: number | null; // promedio de los días con importancia
  actionsDone: number;
  actionsSet: number; // días con acción elegida o marcada
  signals: { day: string; text: string }[];
}

export function summarizeWeek(j: Journal, day: Date = new Date()): WeekSummary {
  const keys = weekDays(day).filter((k) => j.entries[k]);
  const imp = keys.map((k) => j.entries[k].importance).filter((v): v is number => v !== null);
  return {
    days: keys.length,
    avgImportance: imp.length ? Math.round((imp.reduce((a, b) => a + b, 0) / imp.length) * 10) / 10 : null,
    actionsDone: keys.filter((k) => j.entries[k].actionDone).length,
    actionsSet: keys.filter((k) => j.entries[k].action.trim() || j.entries[k].actionDone).length,
    signals: keys.filter((k) => j.entries[k].signals.trim()).map((k) => ({ day: k, text: j.entries[k].signals.trim() })),
  };
}

export interface GroupStats {
  days: number;
  actionRate: number; // 0..1: días con la acción hecha
  signalRate: number; // 0..1: días con alguna señal anotada
}

export interface Comparison {
  low: GroupStats; // importancia 1 a 4
  high: GroupStats; // importancia 7 a 10
  /** true cuando hay al menos MIN_GROUP días en cada grupo. */
  enough: boolean;
  /** Días entre la primera y la última entrada de la ventana (para el aviso de las 4 semanas). */
  spanDays: number;
  /** En días bajos hay claramente más acciones o señales (diferencia ≥ 15 puntos). */
  lowBetter: boolean;
  /** No hay diferencia clara en ningún sentido. */
  noDifference: boolean;
}

export const MIN_GROUP = 2;
const CLEAR = 0.15;

/** La pregunta de la revisión: ¿en los días de importancia baja hubo más acciones y señales? (últimos 28 días) */
export function compareImportance(j: Journal, today: Date = new Date()): Comparison {
  const window = lastDays(28, today).filter((k) => j.entries[k] && j.entries[k].importance !== null);
  const stats = (keys: string[]): GroupStats => ({
    days: keys.length,
    actionRate: keys.length ? keys.filter((k) => j.entries[k].actionDone).length / keys.length : 0,
    signalRate: keys.length ? keys.filter((k) => j.entries[k].signals.trim()).length / keys.length : 0,
  });
  const low = stats(window.filter((k) => j.entries[k].importance! <= 4));
  const high = stats(window.filter((k) => j.entries[k].importance! >= 7));
  const sorted = [...window].sort();
  const spanDays = sorted.length ? Math.round((parseDay(sorted[sorted.length - 1]).getTime() - parseDay(sorted[0]).getTime()) / 86_400_000) + 1 : 0;
  const dAction = low.actionRate - high.actionRate;
  const dSignal = low.signalRate - high.signalRate;
  return {
    low,
    high,
    enough: low.days >= MIN_GROUP && high.days >= MIN_GROUP,
    spanDays,
    lowBetter: dAction >= CLEAR || dSignal >= CLEAR,
    noDifference: Math.abs(dAction) < CLEAR && Math.abs(dSignal) < CLEAR,
  };
}

// ---------------------------------------------------------- texto ----

const DATE = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function formatDay(key: string): string {
  const s = DATE.format(parseDay(key));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Todo el registro como texto, del día más reciente al más antiguo (para copiar y pegar). */
export function journalAsText(j: Journal): string {
  const days = Object.keys(j.entries).sort().reverse();
  if (!days.length) return '';
  return [
    'Registro nocturno · Alfa Mind',
    ...days.map((k) => {
      const e = j.entries[k];
      const lines = [formatDay(k)];
      if (e.slide.trim()) lines.push(`Slide: ${e.slide.trim()}`);
      if (e.importance !== null) lines.push(`Importancia: ${e.importance}/10`);
      if (e.action.trim() || e.actionDone)
        lines.push(`Acción: ${e.action.trim() || '(sin escribir)'}${e.actionDone ? ' · hecha' : ' · no hecha'}${e.actionNote.trim() ? ` · ${e.actionNote.trim()}` : ''}`);
      if (e.signals.trim()) lines.push(`Señales: ${e.signals.trim()}`);
      return lines.join('\n');
    }),
  ].join('\n\n');
}
