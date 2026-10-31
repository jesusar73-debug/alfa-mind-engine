import { expect, test } from '@playwright/test';

/**
 * Prueba offline real: primera visita con red (instala el service worker y
 * precachea todo), luego se corta la red y se recorre la app y los audios.
 */
test('funciona sin conexión después de la primera visita', async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem('ame.debug', '1'));
  await page.goto('/');

  // Espera a que el service worker controle la página y termine el precache.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }
  });
  const manifest = await page.evaluate(() => fetch('audio/manifest.json').then((r) => r.json()));
  const expected = Object.keys(manifest.segments).length; // las ondas y el ambiente se generan en el teléfono
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          let n = 0;
          for (const name of await caches.keys()) {
            const c = await caches.open(name);
            n += (await c.keys()).filter((r) => /\/audio\/.+\.(mp3|wav)/.test(r.url)).length;
          }
          return n;
        }),
      { timeout: 120_000 },
    )
    .toBe(expected);

  // --- Sin red ---
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: /Buen(os|as) (días|tardes|noches)/ })).toBeVisible();
  // La tipografía propia también sale del caché (si no, caería a la del sistema).
  await expect
    .poll(() => page.evaluate(() => [...document.fonts].some((f) => f.family.includes('Albert Sans') && f.status === 'loaded')))
    .toBe(true);
  for (const [hash, text] of [
    ['/herramientas', 'Pantalla Mental'],
    ['/progreso', 'Tu progreso'],
    ['/ajustes', 'Ajustes'],
    ['/acerca', 'no sustituyen'],
  ]) {
    await page.goto(`/#${hash}`);
    await expect(page.getByText(text).first()).toBeVisible();
  }

  // Todos los audios se leen desde el caché.
  const failures = await page.evaluate(async (files: string[]) => {
    const bad: string[] = [];
    for (const f of files) {
      const r = await fetch(f).catch(() => null);
      if (!r || !r.ok || (await r.blob()).size < (f.endsWith('.json') ? 50 : 1000)) bad.push(f);
    }
    return bad;
  }, [
    ...Object.values(manifest.segments).map((s) => (s as { file: string }).file),
    // Las grabaciones de ambiente y sus créditos también están guardadas.
    'ambient/lluvia.flac',
    'ambient/rio.flac',
    'ambient/viento.flac',
    'ambient/credits.json',
  ]);
  expect(failures).toEqual([]);

  // Una sesión real suena offline (el reloj del audio avanza).
  await page.goto('/#/sesion/tool/espejo-mente');
  await page.getByRole('button', { name: 'Iniciar' }).click();
  await page.getByTestId('session-running').waitFor();
  await expect.poll(() => page.evaluate(() => window.__ame!.clock.time()), { timeout: 10_000 }).toBeGreaterThan(2);

  // Modo compatibilidad (plan B: tono en <audio loop>) también funciona offline.
  await page.goto('/#/ajustes');
  await page.getByRole('radio', { name: 'Compatibilidad' }).click();
  await page.goto('/#/sesion/acond/n5');
  await page.getByRole('button', { name: 'Iniciar' }).click();
  await page.getByTestId('session-running').waitFor();
  await expect.poll(() => page.evaluate(() => window.__ame!.clock.time()), { timeout: 10_000 }).toBeGreaterThan(2);
});
