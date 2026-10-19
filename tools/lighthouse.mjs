// Auditoría Lighthouse (móvil) + instalabilidad del build servido en http://localhost:4173.
// Usa el Chromium de Playwright con puerto de depuración.
// Uso: npm run build && npm run preview (en otra terminal) && npm run audit
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import { mkdirSync, writeFileSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4173/';
const port = 9333;
const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });
try {
  const result = await lighthouse(url, { port, output: ['html', 'json'], logLevel: 'error', formFactor: 'mobile' });
  mkdirSync('lighthouse', { recursive: true });
  writeFileSync('lighthouse/report.html', result.report[0]);
  writeFileSync('lighthouse/report.json', result.report[1]);
  const lhr = result.lhr;
  for (const [k, c] of Object.entries(lhr.categories)) console.log(`${k}: ${Math.round(c.score * 100)}`);
  for (const a of Object.values(lhr.audits)) {
    if (a.score !== null && a.score < 0.9 && !['informative', 'notApplicable', 'manual'].includes(a.scoreDisplayMode)) {
      console.log(`  - ${a.id}: ${a.score} ${a.displayValue ?? ''}`);
    }
  }

  // Instalabilidad según Chrome (reemplaza la antigua auditoría PWA de Lighthouse).
  const page = await browser.newPage();
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  const manifest = await cdp.send('Page.getAppManifest');
  console.log(`installable: ${installabilityErrors.length === 0 ? 'sí' : 'NO'}`, installabilityErrors.map((e) => e.errorId));
  console.log(`manifest errors: ${manifest.errors.length}`, manifest.errors.map((e) => e.message));
} finally {
  await browser.close();
}
