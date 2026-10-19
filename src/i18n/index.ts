import { es } from './es';

const dict = es;

type Dict = typeof es;
type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : T[K] extends readonly string[] ? K : Join<K, Paths<T[K]>>;
}[keyof T & string];

export type TKey = Paths<Dict>;

function lookup(key: string): unknown {
  return key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], dict);
}

/** Texto traducido con variables {nombre}. */
export function t(key: TKey, vars: Record<string, string | number> = {}): string {
  const v = lookup(key);
  if (typeof v !== 'string') return key;
  return v.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

/** Lista de textos (párrafos, pasos). */
export function tl(key: TKey): readonly string[] {
  const v = lookup(key);
  return Array.isArray(v) ? v : [];
}

export const tr = dict;
