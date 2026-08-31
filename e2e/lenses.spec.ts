/** Lenses and toggles: each changes exactly what it should, nothing else. */

import { ateByAccount } from '../src/engine/ate';
import { simulateAccumulation } from '../src/engine/accumulate';
import { toReal } from '../src/engine/schedule';
import { exampleState, expect, loadState, readState, test } from './fixtures';

const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 });

/** spotcheck.json ships nominal/gross display — pin the default lenses first. */
function spotcheckWithLenses() {
  const state = exampleState('spotcheck');
  state.display = { ...state.display, real: true, ate: true, byBuckets: true, theme: 'light', yearlyTable: true };
  return state;
}

test('real ↔ nominal changes the table values and only them', async ({ page }) => {
  const state = spotcheckWithLenses();
  await loadState(page, state);
  const a = state.assumptions;
  const years = simulateAccumulation(a, state.growthScenarios[0]);
  const y40 = years.find((y) => y.age === 40)!;
  const ateReal40 = toReal(ateByAccount(y40.accounts, a).taxable, 10, a.inflation);
  const ateNominal40 = ateByAccount(y40.accounts, a).taxable;

  const row40 = page.locator('tr[data-age="40"]');
  await expect(row40).toContainText(fmt(ateReal40)); // 247,164
  await page.getByRole('tab', { name: 'nominal' }).click();
  await expect(row40).toContainText(fmt(ateNominal40)); // 332,167
  expect((await readState(page)).display.real).toBe(false);
  // nothing else changed: scenario id/name intact, ate lens intact
  const s = await readState(page);
  expect(s.display.ate).toBe(true);
  expect(s.growthScenarios[0].id).toBe(state.growthScenarios[0].id);
});

test('after-tax ↔ gross changes the table values per the ATE lens', async ({ page }) => {
  const state = spotcheckWithLenses();
  await loadState(page, state);
  const a = state.assumptions;
  const years = simulateAccumulation(a, state.growthScenarios[0]);
  const y40 = years.find((y) => y.age === 40)!;
  const grossReal = toReal(y40.accounts.taxable.balance, 10, a.inflation);

  await page.getByRole('tab', { name: 'gross' }).click();
  await expect(page.locator('tr[data-age="40"]')).toContainText(fmt(grossReal));
  expect((await readState(page)).display.ate).toBe(false);
  expect((await readState(page)).display.real).toBe(true); // untouched
});

test('buckets ↔ accounts and theme flip only their own display fields', async ({ page }) => {
  await loadState(page, spotcheckWithLenses());
  await page.getByRole('tab', { name: 'accounts' }).click();
  let s = await readState(page);
  expect(s.display.byBuckets).toBe(false);
  expect(s.display.real).toBe(true);
  await page.getByRole('button', { name: 'dark mode' }).click();
  s = await readState(page);
  expect(s.display.theme).toBe('dark');
  await expect(page.locator('div.dark').first()).toBeVisible();
  await page.getByRole('button', { name: 'light mode' }).click();
  expect((await readState(page)).display.theme).toBe('light');
});

test('yearly ↔ every-5-years changes the table row count', async ({ page }) => {
  await loadState(page, spotcheckWithLenses()); // ages 30..62
  const rows = page.locator('tr[data-age]');
  await expect(rows).toHaveCount(33);
  await page.getByRole('button', { name: 'every 5 years' }).click();
  await expect(rows).toHaveCount(8); // 30,35,40,45,50,55,60 + endpoint 62
  expect((await readState(page)).display.yearlyTable).toBe(false);
});

test('scenario menu: rename, duplicate with fresh id, delete guarded', async ({ page }) => {
  await loadState(page, spotcheckWithLenses()); // two scenarios
  await page.getByRole('button', { name: 'duplicate' }).click();
  let s = await readState(page);
  expect(s.growthScenarios).toHaveLength(3);
  const copy = s.growthScenarios[2];
  expect(copy.name).toContain('(copy)');
  expect(new Set(s.growthScenarios.map((g) => g.id)).size).toBe(3);
  await page.getByRole('button', { name: 'rename' }).click();
  await page.getByLabel('Scenario name', { exact: true }).fill('My plan');
  await page.getByRole('button', { name: 'save' }).click();
  s = await readState(page);
  expect(s.growthScenarios[2].name).toBe('My plan');
  await page.getByRole('button', { name: 'delete', exact: true }).click();
  s = await readState(page);
  expect(s.growthScenarios).toHaveLength(2);
});
