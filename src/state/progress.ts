import { useSyncExternalStore } from 'react';
import { LEVELS, type Level } from '../data/content';
import { getSettings, replaceSettings, type Settings } from './settings';
import { readJson, writeJson } from './storage';

export interface Completion {
  levelId: string;
  at: string; // ISO
}

export interface Progress {
  version: 1;
  /** Una entrada por día (fecha local AAAA-MM-DD) con sesión de acondicionamiento completa. */
  days: Record<string, Completion>;
  /** Sesiones de herramientas completadas (solo informativo). */
  tools: { id: string; at: string }[];
}

export const PROGRESS_KEY = 'ame.progress.v1';
const EMPTY: Progress = { version: 1, days: {}, tools: [] };

let current: Progress = readJson(PROGRESS_KEY, EMPTY);
const listeners = new Set<() => void>();

function save(next: Progress) {
  current = next;
  writeJson(PROGRESS_KEY, next);
  listeners.forEach((l) => l());
}

export function useProgress(): Progress {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

// ------------------------------------------------------------ fechas ----

export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

// ----------------------------------------------------------- lógica ----

export function completedCount(p: Progress): number {
  return Object.keys(p.days).length;
}

export interface LevelPosition {
  level: Level;
  levelIndex: number;
  /** Día dentro del nivel (1..days), o sesiones hechas en "Rápido". */
  dayInLevel: number;
  /** Total de días del nivel (null en Rápido). */
  levelDays: number | null;
  /** Día global del programa (1..). */
  programDay: number;
}

/**
 * Nivel actual según sesiones COMPLETADAS, no según el calendario:
 * saltarse días no castiga; retomas donde quedaste.
 */
export function positionFor(count: number, levels: Level[] = LEVELS): LevelPosition {
  let start = 0;
  for (let i = 0; i < levels.length; i++) {
    const lv = levels[i];
    if (lv.days === null || count < start + lv.days) {
      return { level: lv, levelIndex: i, dayInLevel: count - start + 1, levelDays: lv.days, programDay: count + 1 };
    }
    start += lv.days;
  }
  const last = levels[levels.length - 1];
  return { level: last, levelIndex: levels.length - 1, dayInLevel: count - start + 1, levelDays: last.days, programDay: count + 1 };
}

/** Racha: días seguidos completados terminando hoy (o ayer, si hoy aún no practicas). */
export function streak(p: Progress, today: Date = new Date()): number {
  let d = p.days[dayKey(today)] ? today : addDays(today, -1);
  let n = 0;
  while (p.days[dayKey(d)]) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function doneToday(p: Progress, today: Date = new Date()): boolean {
  return Boolean(p.days[dayKey(today)]);
}

/** Días desde la última sesión completada (null si nunca). */
export function daysSinceLast(p: Progress, today: Date = new Date()): number | null {
  const keys = Object.keys(p.days).sort();
  if (!keys.length) return null;
  const [y, m, d] = keys[keys.length - 1].split('-').map(Number);
  const last = new Date(y, m - 1, d);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((t.getTime() - last.getTime()) / 86_400_000);
}

/** Marca hoy como completo. Solo se llama al terminar la sesión. */
export function markConditioningComplete(levelId: string, now: Date = new Date()): void {
  const key = dayKey(now);
  if (current.days[key]) return; // una vez por día
  save({ ...current, days: { ...current.days, [key]: { levelId, at: now.toISOString() } } });
}

export function markToolComplete(id: string, now: Date = new Date()): void {
  save({ ...current, tools: [...current.tools, { id, at: now.toISOString() }].slice(-500) });
}

// ---------------------------------------------------- respaldo JSON ----

export interface Backup {
  app: 'alfa-mind-engine';
  version: 1;
  exportedAt: string;
  progress: Progress;
  settings: Settings;
}

export function makeBackup(): Backup {
  return { app: 'alfa-mind-engine', version: 1, exportedAt: new Date().toISOString(), progress: current, settings: getSettings() };
}

export function restoreBackup(text: string): { days: number } {
  const data = JSON.parse(text) as Partial<Backup>;
  if (data.app !== 'alfa-mind-engine' || !data.progress || typeof data.progress.days !== 'object') {
    throw new Error('El archivo no es un respaldo de Alfa Mind Engine.');
  }
  const days: Record<string, Completion> = {};
  for (const [k, v] of Object.entries(data.progress.days)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v && typeof v.levelId === 'string') days[k] = v;
  }
  save({ version: 1, days, tools: Array.isArray(data.progress.tools) ? data.progress.tools : [] });
  if (data.settings) replaceSettings(data.settings);
  return { days: Object.keys(days).length };
}
