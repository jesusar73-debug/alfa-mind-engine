import { expect, test } from '@playwright/test';
import { enableDebug, seek, startSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await enableDebug(page);
});

test('los tres ambientes son grabaciones reales en bucle sin corte y a nivel parejo', async ({ page }) => {
  await startSession(page, '/sesion/acond/rapido');
  const stats = await page.evaluate(async () => {
    const out: Record<string, { seconds: number; channels: number; rms: number; peak: number; seam: number; typical: number }> = {};
    for (const kind of ['lluvia', 'rio', 'viento'] as const) {
      const buf = await window.__ame!.ambientBuffer(kind);
      const L = buf.getChannelData(0);
      let sum = 0;
      let peak = 0;
      let diff = 0;
      for (let i = 0; i < L.length; i++) {
        sum += L[i] * L[i];
        peak = Math.max(peak, Math.abs(L[i]));
        if (i) diff += Math.abs(L[i] - L[i - 1]);
      }
      out[kind] = {
        seconds: buf.duration,
        channels: buf.numberOfChannels,
        rms: Math.sqrt(sum / L.length),
        peak,
        // Salto en la unión del bucle (último → primer valor) contra el salto típico entre muestras.
        seam: Math.abs(L[0] - L[L.length - 1]),
        typical: diff / (L.length - 1),
      };
    }
    return out;
  });
  for (const [kind, s] of Object.entries(stats)) {
    expect(s.seconds, `${kind}: la grabación real (40 s), no el respaldo sintetizado (24 s)`).toBeCloseTo(40, 1);
    expect(s.channels, kind).toBe(2);
    expect(s.rms, kind).toBeGreaterThan(0.06);
    expect(s.rms, kind).toBeLessThan(0.16);
    expect(s.peak, kind).toBeLessThanOrEqual(1);
    expect(s.seam, `${kind}: la unión del bucle no debe dar un salto`).toBeLessThan(s.typical * 8 + 0.01);
  }
});

/** Nivel real (dB) de cada canal del mezclador, medido con un analizador en su salida. */
async function tapChannels(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const m = window.__ame!.mixer!;
    const w = window as Window & { __taps?: Record<string, AnalyserNode> };
    w.__taps = {};
    for (const k of ['voice', 'ambient', 'tone'] as const) {
      const a = m.ctx.createAnalyser();
      a.fftSize = 8192;
      m[k].connect(a);
      const mute = m.ctx.createGain();
      mute.gain.value = 0;
      a.connect(mute).connect(m.ctx.destination); // para que el analizador procese
      w.__taps[k] = a;
    }
  });
}
const levels = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const taps = (window as Window & { __taps?: Record<string, AnalyserNode> }).__taps!;
    const out: Record<string, number> = {};
    for (const [k, a] of Object.entries(taps)) {
      const d = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(d);
      out[k] = 20 * Math.log10(Math.sqrt(d.reduce((s, v) => s + v * v, 0) / d.length) + 1e-9);
    }
    return out;
  });

test('las ondas SE OYEN: el canal de ondas tiene sonido real a los 12 s', async ({ page }) => {
  await startSession(page, '/sesion/acond/n3');
  await tapChannels(page);
  await page.waitForFunction(() => window.__ame!.clock.time() >= 12);
  const l = await levels(page);
  expect(l.tone, 'ondas').toBeGreaterThan(-35);
  expect(l.ambient, 'ambiente').toBeGreaterThan(-60);
});

test('Sintonía 10: ondas en silencio antes de 2:00 y sonando después', async ({ page }) => {
  await startSession(page, '/sesion/tool/sintonia-10');
  await tapChannels(page);
  await page.waitForTimeout(3000);
  expect((await levels(page)).tone, 'antes de 2:00').toBeLessThan(-80);
  await seek(page, 121);
  await page.waitForFunction(() => window.__ame!.clock.time() >= 133);
  expect((await levels(page)).tone, 'después de 2:00').toBeGreaterThan(-35);
});

test('Acerca de muestra autor y licencia de cada grabación de ambiente', async ({ page }) => {
  await page.goto('/#/acerca');
  const credits = page.getByTestId('ambient-credits');
  await expect(credits).toContainText('Gravity Sound');
  await expect(credits).toContainText('CC BY 4.0');
  await expect(credits).toContainText('jackthemurray');
  await expect(credits.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', /creativecommons\.org\/licenses\/by\/4\.0/);
});

test('el mezclador se guarda: ambiente, pulso y volúmenes', async ({ page }) => {
  await page.goto('/#/ajustes');
  await page.getByRole('radio', { name: 'Río' }).click();
  await page.getByRole('radio', { name: 'Theta 6 Hz' }).click();
  await expect(page.getByText('Theta: para imaginar')).toBeVisible();
  await page.getByRole('slider', { name: 'Ambiente' }).fill('0.3');
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Río' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: 'Theta 6 Hz' })).toHaveAttribute('aria-checked', 'true');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ame.settings.v1')!));
  expect(saved).toMatchObject({ ambient: 'rio', beat: 6, ambientVolume: 0.3 });
});

test('durante la sesión suenan los tres canales y el ambiente se cambia sin parar la voz', async ({ page }) => {
  await startSession(page, '/sesion/acond/rapido');
  await expect.poll(() => page.evaluate(() => window.__ame!.session!.mixState())).toMatchObject({ ambient: 'lluvia', ambientOn: true, toneOn: true });
  await page.getByRole('button', { name: 'Mezclador' }).click();
  await expect(page.getByTestId('mixer-panel')).toBeVisible();
  await page.getByRole('radio', { name: 'Viento' }).click();
  await expect.poll(() => page.evaluate(() => window.__ame!.session!.mixState())).toMatchObject({ ambient: 'viento', ambientOn: true });
  await page.getByRole('radio', { name: 'Ninguno' }).click();
  await expect.poll(() => page.evaluate(() => window.__ame!.session!.mixState())).toMatchObject({ ambient: 'ninguno', ambientOn: false });
  expect(await page.evaluate(() => window.__ame!.session!.paused)).toBe(false);
});
