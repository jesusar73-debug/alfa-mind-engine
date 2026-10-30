import { expect, test } from '@playwright/test';
import { contrast, descentLevel, stageColors } from '../src/audio/descent';

test('el descenso mantiene contraste AA (4.5:1) en toda su profundidad', () => {
  for (let i = 0; i <= 200; i++) {
    const { bg, ink } = stageColors(i / 200);
    expect(contrast(bg, ink), `k=${i / 200} ${bg} / ${ink}`).toBeGreaterThanOrEqual(4.5);
  }
});

test('el descenso baja con la cuenta y sube en la salida', () => {
  const at = (phase: 'intro' | 'countdown' | 'content' | 'exit', number: number | null) =>
    descentLevel({ phase, number, numberSpoken: true, caption: null, breath: null }, 25);
  expect(at('intro', null)).toBe(0);
  expect(at('countdown', 25)).toBeLessThan(at('countdown', 13));
  expect(at('countdown', 1)).toBeCloseTo(1);
  expect(at('content', null)).toBe(1);
  expect(at('exit', 1)).toBeGreaterThan(at('exit', 4));
  expect(at('exit', 5)).toBe(0);
});
