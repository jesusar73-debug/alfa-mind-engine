import { useCallback, useSyncExternalStore } from 'react';
import type { EngineMode, ToneMode } from '../audio/types';
import { readJson, writeJson } from './storage';

export interface Settings {
  voiceVolume: number; // 0..1 (slider)
  toneVolume: number;
  toneEnabled: boolean;
  toneMode: ToneMode;
  interval: number; // segundos entre números
  sayEvery: 1 | 5;
  engine: EngineMode;
  showCaptions: boolean;
  sleepDirect: boolean; // Vaso de agua: dormir directamente
}

export const SETTINGS_KEY = 'ame.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  voiceVolume: 0.9,
  toneVolume: 0.7,
  toneEnabled: true,
  toneMode: 'isocronico',
  interval: 2,
  sayEvery: 1,
  engine: 'webaudio',
  showCaptions: true,
  sleepDirect: true,
};

let current: Settings = readJson(SETTINGS_KEY, DEFAULT_SETTINGS);
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function replaceSettings(next: Settings): void {
  current = { ...DEFAULT_SETTINGS, ...next };
  writeJson(SETTINGS_KEY, current);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const settings = useSyncExternalStore(subscribe, getSettings);
  const update = useCallback((patch: Partial<Settings>) => replaceSettings({ ...current, ...patch }), []);
  return [settings, update];
}
