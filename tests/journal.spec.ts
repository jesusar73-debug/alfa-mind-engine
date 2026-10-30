import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Fecha local AAAA-MM-DD de hace `n` días (igual que dayKey en la app). */
function daysAgo(n: number, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function seedJournal(page: Page, entries: Record<string, object>) {
  await page.addInitScript((e) => {
    if (sessionStorage.getItem('seededJournal')) return;
    sessionStorage.setItem('seededJournal', '1');
    localStorage.setItem('ame.journal.v1', JSON.stringify({ version: 1, entries: e }));
  }, entries);
}

const entry = (importance: number | null, actionDone: boolean, signals = '', slide = 'Una escena') => ({
  slide,
  importance,
  action: 'Una acción',
  actionDone,
  actionNote: '',
  signals,
  updatedAt: '',
});

test('el registro de hoy se guarda solo y sigue ahí al volver', async ({ page }) => {
  await page.goto('/#/registro');
  await expect(page.getByTestId('journal-day')).toContainText('Hoy');
  await page.getByPlaceholder(/La escena que imaginaste/).fill('Entrego la mesa y el cliente sonríe');
  await page.getByRole('radio', { name: '3', exact: true }).click();
  await page.getByPlaceholder(/La acción pequeña/).fill('Llamar a un diseñador');
  await page.getByLabel('La hice').check();
  await page.getByPlaceholder(/Coincidencias/).fill('Me escribió un cliente antiguo');
  await expect(page.getByTestId('journal-saved')).toHaveText('Guardado');

  await page.reload();
  await expect(page.getByPlaceholder(/La escena que imaginaste/)).toHaveValue('Entrego la mesa y el cliente sonríe');
  await expect(page.getByRole('radio', { name: '3', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('La hice')).toBeChecked();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ame.journal.v1')!));
  expect(Object.values(saved.entries)).toHaveLength(1);
});

test('una entrada borrada por completo no deja un día vacío', async ({ page }) => {
  await page.goto('/#/registro');
  await page.getByRole('radio', { name: '5', exact: true }).click();
  await expect(page.getByTestId('journal-saved')).toHaveText('Guardado');
  await page.getByRole('radio', { name: '5', exact: true }).click(); // tocar de nuevo la quita
  await expect(page.getByTestId('journal-saved')).toHaveText('Guardado');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ame.journal.v1')!));
  expect(Object.keys(saved.entries)).toHaveLength(0);
});

test('revisión: compara días de importancia baja y alta', async ({ page }) => {
  await seedJournal(page, {
    [daysAgo(0)]: entry(2, true, 'Una puerta se abrió'),
    [daysAgo(1)]: entry(3, true),
    [daysAgo(2)]: entry(8, false),
    [daysAgo(3)]: entry(9, false),
  });
  await page.goto('/#/registro');
  await expect(page.getByTestId('question')).toContainText('Baja (1 a 4)');
  await expect(page.getByTestId('verdict')).toHaveText('En tus días de importancia baja hubo más acciones o más señales.');
});

test('revisión: con pocos datos lo dice en vez de sacar conclusiones', async ({ page }) => {
  await seedJournal(page, { [daysAgo(0)]: entry(2, true) });
  await page.goto('/#/registro');
  await expect(page.getByTestId('verdict')).toContainText('Todavía faltan datos');
});

test('revisión semanal: promedio, acciones y señales de esta semana', async ({ page }) => {
  // Un día fijo (jueves) para que la semana sea predecible.
  await page.clock.setFixedTime(new Date(2026, 9, 29, 21, 0));
  await seedJournal(page, {
    '2026-10-26': entry(3, true, 'Me escribió un diseñador'),
    '2026-10-27': entry(8, false),
    '2026-10-29': entry(4, true),
    '2026-10-19': entry(10, false), // semana anterior: no cuenta
  });
  await page.goto('/#/registro');
  await expect(page.getByTestId('avg-importance')).toHaveText('5'); // (3 + 8 + 4) / 3
  await expect(page.getByTestId('actions-done')).toHaveText('2 / 3');
  await expect(page.getByTestId('week')).toContainText('Me escribió un diseñador');
});

test('recordatorio en Inicio a partir de las 6 de la tarde, si falta el de hoy', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 29, 19, 30));
  await page.goto('/');
  await expect(page.getByTestId('journal-reminder')).toBeVisible();
  await page.getByTestId('journal-reminder').click();
  await expect(page.getByRole('heading', { name: 'Registro nocturno' })).toBeVisible();
});

test('sin recordatorio por la mañana', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 29, 7, 0));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Buenos días');
  await expect(page.getByTestId('journal-reminder')).toHaveCount(0);
});

test('el respaldo JSON incluye el registro y lo restaura', async ({ page }, info) => {
  await seedJournal(page, { [daysAgo(0)]: entry(6, true, 'Señal guardada', 'Mi escena de respaldo') });
  await page.goto('/#/progreso');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
  const file = info.outputPath('respaldo.json');
  await download.saveAs(file);
  const backup = JSON.parse(readFileSync(file, 'utf8'));
  expect(Object.values(backup.journal.entries)).toHaveLength(1);

  await page.evaluate(() => localStorage.removeItem('ame.journal.v1'));
  await page.reload();
  await page.getByTestId('import-input').setInputFiles(file);
  await expect(page.getByText(/Respaldo importado/)).toBeVisible();
  await page.goto('/#/registro');
  await expect(page.getByPlaceholder(/La escena que imaginaste/)).toHaveValue('Mi escena de respaldo');
});
