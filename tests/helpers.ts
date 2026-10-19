import type { Page } from '@playwright/test';

/** Activa el gancho de depuración (window.__ame) antes de cargar la app. */
export async function enableDebug(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ame.debug', '1'));
}

export async function startSession(page: Page, hash: string) {
  await page.goto(`/#${hash}`);
  await page.getByRole('button', { name: 'Iniciar' }).click();
  await page.getByTestId('session-running').waitFor();
  await page.waitForFunction(() => (window.__ame?.clock.time() ?? 0) > 0.3);
}

export async function seek(page: Page, t: number) {
  await page.evaluate((x) => window.__ame!.session!.player.seek(x), t);
}

/** Inicio del segmento con el id dado, en segundos de sesión. */
export async function segmentStart(page: Page, idPrefix: string): Promise<number> {
  return page.evaluate((p) => window.__ame!.segments.find((s) => s.id.startsWith(p))!.offset, idPrefix);
}
