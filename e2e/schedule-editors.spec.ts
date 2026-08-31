/** M4.5 C.1/D.3: schedule editors — rows, quick actions, normalization, sparkline. */

import { commitInput, exampleState, expect, loadState, readState, test } from './fixtures';

const rows401k = async (page: Parameters<typeof readState>[0]) =>
  (await readState(page)).growthScenarios[0].perFiler[0].contrib401k;

test('simple mode: amount + until age writes a single row', async ({ page }) => {
  await page.goto('/');
  await commitInput(page, '401k amount', '15000');
  await commitInput(page, '401k until age', '45');
  expect(await rows401k(page)).toEqual([{ fromAge: 31, toAge: 45, value: 15_000 }]);
});

test('add row, edit each field, delete row', async ({ page }) => {
  await loadState(page, exampleState('spotcheck'));
  await page.getByRole('button', { name: '+ row' }).first().click();
  expect(await rows401k(page)).toHaveLength(3);
  await commitInput(page, '401k row 3 from age', '52');
  await commitInput(page, '401k row 3 to age', '55');
  await commitInput(page, '401k row 3 value', '12000');
  expect((await rows401k(page))[2]).toEqual({ fromAge: 52, toAge: 55, value: 12_000 });
  await page.getByRole('button', { name: '401k delete row 3' }).click();
  expect(await rows401k(page)).toHaveLength(2);
});

test('Stop at X normalizes rows — clips and drops, never appends (the B.2 bug case)', async ({ page }) => {
  await loadState(page, exampleState('spotcheck'));
  const spark = page.locator('svg polyline').first();
  const before = await spark.getAttribute('points');
  await page.getByRole('button', { name: 'Stop at…' }).first().click();
  await commitInput(page, 'quick action age', '40');
  await page.getByRole('button', { name: 'apply' }).click();
  // spotcheck rows were {31–35: 20k} {38–∞: 40k} → clip to 39, keep 31–35
  // user-visible outcome first: the rendered row inputs show the normalized rows
  await expect(page.getByLabel('401k row 2 to age', { exact: true })).toHaveValue('39');
  await expect(page.getByLabel('401k row 2 value', { exact: true })).toHaveValue('40,000');
  await expect(page.getByLabel('401k row 1 to age', { exact: true })).toHaveValue('35');
  expect(await rows401k(page)).toEqual([
    { fromAge: 31, toAge: 35, value: 20_000 },
    { fromAge: 38, toAge: 39, value: 40_000 },
  ]);
  expect(await spark.getAttribute('points')).not.toBe(before); // sparkline updated
});

test('Reduce to Y from Z clips then appends one open row', async ({ page }) => {
  await loadState(page, exampleState('spotcheck'));
  await page.getByRole('button', { name: 'Reduce to…' }).first().click();
  await commitInput(page, 'quick action value', '5000');
  await commitInput(page, 'quick action age', '45');
  await page.getByRole('button', { name: 'apply' }).click();
  expect(await rows401k(page)).toEqual([
    { fromAge: 31, toAge: 35, value: 20_000 },
    { fromAge: 38, toAge: 44, value: 40_000 },
    { fromAge: 45, toAge: null, value: 5_000 },
  ]);
});

test('Until age X sets the last row\'s end; quick-action age defaults to the visible end', async ({ page }) => {
  await loadState(page, exampleState('spotcheck'));
  await page.getByRole('button', { name: 'Until age…' }).first().click();
  const ageField = page.getByLabel('quick action age', { exact: true });
  // default = the schedule's visible end (last row from 38 open → 38), never 79
  await expect(ageField).not.toHaveValue('79');
  await commitInput(page, 'quick action age', '50');
  await ageField.press('Enter'); // Enter applies
  const rows = await rows401k(page);
  expect(rows[rows.length - 1].toAge).toBe(50);
});

test('limit warning appears on an over-limit row and clears when lowered (C.4)', async ({ page }) => {
  await page.goto('/');
  await commitInput(page, '401k amount', '3000000');
  await expect(page.getByText('exceeds 2026 401k limit $24,500 — capped')).toBeVisible();
  await commitInput(page, '401k amount', '20000');
  await expect(page.getByText('exceeds 2026 401k limit', { exact: false })).toHaveCount(0);
});
