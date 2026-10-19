import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { enableDebug, seek, startSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await enableDebug(page);
});

test('sesión corta completa marca el día y actualiza el tracker', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Día 1 de 10')).toBeVisible();
  await expect(page.getByTestId('completed')).toHaveText('0');

  await page.getByRole('button', { name: /Practicar otro nivel/ }).click();
  await page.getByRole('button', { name: /Rápido/ }).click();
  await page.getByRole('button', { name: 'Iniciar' }).click();
  await page.getByTestId('session-running').waitFor();

  // Intro: respiración guiada y texto visibles.
  await expect(page.getByTestId('caption')).toContainText('bienvenida');

  // Pausa: el reloj del audio se detiene.
  await page.getByTestId('pause').click();
  const t1 = await page.evaluate(() => window.__ame!.clock.time());
  await page.waitForTimeout(1200);
  const t2 = await page.evaluate(() => window.__ame!.clock.time());
  expect(Math.abs(t2 - t1)).toBeLessThan(0.05);
  await page.getByTestId('pause').click();

  // Cuenta 3→2→1 en la pantalla.
  const cdStart = await page.evaluate(() => window.__ame!.segments.find((s) => s.id.startsWith('cd-'))!.offset);
  await seek(page, cdStart + 0.5);
  await expect(page.getByTestId('phase')).toHaveText('Cuenta regresiva');
  await expect(page.getByTestId('big-number')).toHaveText('3', { timeout: 8000 });
  await expect(page.getByTestId('big-number')).toHaveText('2', { timeout: 8000 });
  await expect(page.getByTestId('big-number')).toHaveText('1', { timeout: 8000 });

  // No se marca nada antes de terminar.
  expect(await page.evaluate(() => localStorage.getItem('ame.progress.v1'))).toBeNull();

  // Salto al final: debe cerrarse sola y marcar el día.
  const total = await page.evaluate(() => window.__ame!.clock.totalDuration);
  await seek(page, total - 3);
  await expect(page.getByTestId('session-done')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Día marcado como completo')).toBeVisible();

  await page.getByRole('button', { name: 'Volver al inicio' }).click();
  await expect(page.getByTestId('completed')).toHaveText('1');
  await expect(page.getByTestId('streak')).toContainText('1');
  await expect(page.getByTestId('done-today')).toBeVisible();
  await expect(page.locator('li[data-done]')).toHaveCount(1);
});

test('detener una sesión no la marca como completa', async ({ page }) => {
  await startSession(page, '/sesion/acond/n5');
  await page.getByRole('button', { name: 'Detener' }).click();
  await page.getByRole('button', { name: 'Detener' }).last().click();
  await expect(page.getByTestId('completed')).toHaveText('0');
});

test('exportar e importar respaldo JSON', async ({ page }, info) => {
  // Progreso previo: 12 días (pasa a Nivel 2, día 3).
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const days: Record<string, { levelId: string; at: string }> = {};
    for (let i = 1; i <= 12; i++) {
      const d = new Date(2026, 0, i);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days[k] = { levelId: 'n1', at: d.toISOString() };
    }
    localStorage.setItem('ame.progress.v1', JSON.stringify({ version: 1, days, tools: [] }));
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Nivel 2' })).toBeVisible();
  await expect(page.getByTestId('level-day')).toHaveText('Día 3 de 10');
  await expect(page.getByText(/Retoma donde quedaste/)).toBeVisible();

  await page.goto('/#/progreso');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
  const file = info.outputPath('respaldo.json');
  await download.saveAs(file);
  const backup = JSON.parse(readFileSync(file, 'utf8'));
  expect(backup.app).toBe('alfa-mind-engine');
  expect(Object.keys(backup.progress.days)).toHaveLength(12);

  // Borrar todo y restaurar.
  await page.evaluate(() => localStorage.removeItem('ame.progress.v1'));
  await page.reload();
  await page.goto('/#/');
  await expect(page.getByTestId('completed')).toHaveText('0');
  await page.goto('/#/progreso');
  await page.getByTestId('import-input').setInputFiles(file);
  await expect(page.getByText('Respaldo importado: 12 días.')).toBeVisible();
  await page.goto('/#/');
  await expect(page.getByTestId('completed')).toHaveText('12');

  // Un archivo inválido muestra error y no borra nada.
  await page.goto('/#/progreso');
  await page.getByTestId('import-input').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hola":1}') });
  await expect(page.getByText(/No se pudo importar/)).toBeVisible();
  await page.goto('/#/');
  await expect(page.getByTestId('completed')).toHaveText('12');
});

test('ajustes se guardan y cambian la sesión', async ({ page }) => {
  await page.goto('/#/ajustes');
  await page.getByRole('radio', { name: /4 s/ }).click();
  await page.getByRole('radio', { name: /Cada 5/ }).click();
  await page.getByRole('radio', { name: /Binaural/ }).click();
  await page.reload();
  await expect(page.getByRole('radio', { name: /4 s/ })).toHaveAttribute('aria-checked', 'true');
  await page.goto('/#/sesion/acond/n1');
  await expect(page.getByText('Binaural: usa audífonos.')).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar' }).click();
  await page.getByTestId('session-running').waitFor();
  const ids = await page.evaluate(() => window.__ame!.segments.map((s) => s.id));
  expect(ids).toEqual(['intro', 'cd-100-4-5', 'profundo', 'salida']);
});

test('vaso de agua: modo dormir no tiene salida 1→5', async ({ page }) => {
  await startSession(page, '/sesion/tool/vaso-agua');
  const ids = await page.evaluate(() => window.__ame!.segments.map((s) => s.id));
  expect(ids).toEqual(['intro-acostado', 'cd-10-2-1', 'vaso-agua', 'vaso-dormir']);
});

test('si el audio falla, ofrece modo visual', async ({ page }) => {
  await page.route('**/audio/intro.mp3', (r) => r.abort());
  await page.goto('/#/sesion/tool/pantalla-mental');
  await page.getByRole('button', { name: 'Iniciar' }).click();
  await page.getByRole('button', { name: 'Seguir en modo visual' }).click();
  await expect(page.getByTestId('caption')).toContainText('bienvenida');
});
