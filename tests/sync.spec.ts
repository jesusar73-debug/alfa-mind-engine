import { expect, test } from '@playwright/test';
import { enableDebug, seek, segmentStart, startSession } from './helpers';

/**
 * Sincronía contador–audio en el navegador.
 * Cada vez que cambia el número en pantalla se anota audio.currentTime;
 * la deriva es la diferencia contra el tiempo del número en el timeline.
 */
async function measure(page: import('@playwright/test').Page, seconds: number) {
  await page.evaluate(() => {
    const w = window as Window & { __drift?: number[] };
    w.__drift = [];
    const events = window.__ame!.events.filter((e) => e.kind === 'number');
    let last = '';
    const obs = () => {
      const el = document.querySelector('[data-testid=big-number]');
      const text = el?.textContent ?? '';
      if (text && text !== last) {
        last = text;
        const now = window.__ame!.clock.time();
        // Evento de ese número más cercano al tiempo actual.
        const n = Number(text);
        const ev = events.filter((e) => e.value === n).sort((a, b) => Math.abs(a.t - now) - Math.abs(b.t - now))[0];
        if (ev) w.__drift!.push(now - ev.t);
      }
      requestAnimationFrame(obs);
    };
    requestAnimationFrame(obs);
  });
  await page.waitForTimeout(seconds * 1000);
  return page.evaluate(() => (window as Window & { __drift?: number[] }).__drift!.slice(1)); // el 1º viene de un salto
}

for (const [level, label] of [
  ['n3', '25→1'],
  ['n1', '100→1'],
] as const) {
  test(`sincronía ${label}: deriva < 300 ms`, async ({ page }) => {
    await enableDebug(page);
    await startSession(page, `/sesion/acond/${level}`);
    const cd = await segmentStart(page, 'cd-');
    await seek(page, cd + 4);
    // 25→1 completo (≈50 s). 100→1: los primeros 60 s; el tramo final lo verifica
    // tools/verify_sync.py sobre el MP3 completo.
    const drifts = await measure(page, level === 'n3' ? 52 : 60);
    const worst = Math.max(...drifts.map(Math.abs));
    console.log(`${label}: ${drifts.length} cambios, deriva máx ${(worst * 1000).toFixed(0)} ms`);
    expect(drifts.length).toBeGreaterThan(level === 'n3' ? 20 : 25);
    expect(worst).toBeLessThan(0.3);
  });
}

test('sincronía 100→1 al final de la cuenta (tras 3 min de audio)', async ({ page }) => {
  await enableDebug(page);
  await startSession(page, '/sesion/acond/n1');
  const cd = await segmentStart(page, 'cd-');
  await seek(page, cd + 170);
  const drifts = await measure(page, 30);
  const worst = Math.max(...drifts.map(Math.abs));
  console.log(`100→1 final: ${drifts.length} cambios, deriva máx ${(worst * 1000).toFixed(0)} ms`);
  expect(drifts.length).toBeGreaterThan(10);
  expect(worst).toBeLessThan(0.3);
});
