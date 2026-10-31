import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { enableDebug, seek, startSession } from './helpers';

const manifest = JSON.parse(readFileSync('public/audio/manifest.json', 'utf8'));
const rutina = manifest.segments['sintonia-10'];

test('Sintonía 10: cada fase empieza en su minuto y dura 10 min', () => {
  const chapters = rutina.events.filter((e: { kind: string }) => e.kind === 'chapter');
  const inicio = chapters.map((e: { t: number; value: string }) => [e.value, Math.round(e.t)]);
  expect(inicio).toEqual([
    ['Anclaje', 0],
    ['Descenso a alfa', 120],
    ['Soltar la importancia', 240],
    ['Slide', 330],
    ['Soltar y elegir una acción', 480],
    ['Salida', 555],
  ]);
  expect(rutina.duration).toBeGreaterThan(590);
  expect(rutina.duration).toBeLessThan(606);
});

test('Sintonía 10 es la primera herramienta', async ({ page }) => {
  await page.goto('/#/herramientas');
  await expect(page.getByRole('button', { name: /Empezar: / }).first()).toHaveAccessibleName('Empezar: Sintonía 10');
});

test('Sintonía 10: fases en pantalla, ondas desde 2:00 y salida con rampa', async ({ page }) => {
  await enableDebug(page);
  await startSession(page, '/sesion/tool/sintonia-10');
  const mix = () => page.evaluate(() => window.__ame!.session!.mixState());

  // Anclaje: ambiente sí, ondas todavía no (armadas en silencio).
  await expect(page.getByTestId('phase')).toHaveText('Anclaje');
  await expect.poll(mix).toMatchObject({ ambientOn: true, toneOn: true, toneLive: false });

  // Descenso: a los 2:00 entran las ondas y se ve la cuenta.
  await seek(page, 121);
  await expect(page.getByTestId('phase')).toHaveText('Descenso a alfa');
  await expect.poll(mix).toMatchObject({ toneLive: true });
  await seek(page, 136);
  await expect(page.getByTestId('big-number')).toHaveText('10', { timeout: 5000 });

  // Tras el "Uno", la voz sigue: se ve el texto, no un "1" fijo.
  await seek(page, 3 * 60 + 30);
  await expect(page.getByTestId('caption')).toContainText(/profundo y tranquilo|ritmo lento y sereno/, { timeout: 6000 });
  await expect(page.getByTestId('big-number')).toHaveCount(0);

  // Slide y salida.
  await seek(page, 5 * 60 + 31);
  await expect(page.getByTestId('phase')).toHaveText('Slide');
  await seek(page, 9 * 60 + 16);
  await expect(page.getByTestId('phase')).toHaveText('Salida');
  await expect.poll(mix).toMatchObject({ exitStarted: true });

  // Termina sola y queda registrada.
  await seek(page, rutina.duration - 2);
  await expect(page.getByTestId('session-done')).toBeVisible({ timeout: 10_000 });
  const tools = await page.evaluate(() => JSON.parse(localStorage.getItem('ame.progress.v1')!).tools);
  expect(tools.at(-1).id).toBe('sintonia-10');
});
