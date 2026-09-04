/**
 * Engine-to-UI equality: balance table, chart tooltip, and hero metrics must
 * match the engine (the same numbers `npm run table` prints) for at least
 * three ages per example file.
 */

import { simulateAccumulation } from '../src/engine/accumulate';
import { ateByAccount } from '../src/engine/ate';
import { firstAgeAtValue } from '../src/engine/metrics';
import { toReal } from '../src/engine/schedule';
import { exampleState, expect, loadState, test } from './fixtures';

const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 });

for (const name of ['golden', 'spotcheck', 'drawdown'] as const) {
  test(`${name}.json: table matches the engine at three ages (nominal + real ATE)`, async ({ page }) => {
    const state = exampleState(name);
    const a = state.assumptions;
    const years = simulateAccumulation(a, state.growthScenarios[0]);
    const startAge = years[0].age;
    const pick = [
      years[Math.floor(years.length / 4)],
      years[Math.floor(years.length / 2)],
      years[years.length - 1],
    ];

    // Nominal gross lens
    state.display = { ...state.display, real: false, ate: false, yearlyTable: true, theme: 'light', byBuckets: true };
    await loadState(page, state);
    for (const y of pick) {
      const row = page.locator(`tr[data-age="${y.age}"]`);
      await expect(row).toContainText(fmt(y.total));
      if (y.accounts.trad401k.balance > 0.5) {
        await expect(row).toContainText(fmt(y.accounts.trad401k.balance));
      }
    }

    // Real ATE lens
    state.display = { ...state.display, real: true, ate: true };
    await loadState(page, state);
    for (const y of pick) {
      const row = page.locator(`tr[data-age="${y.age}"]`);
      await expect(row).toContainText(fmt(toReal(y.totalAte, y.age - startAge, a.inflation)));
      const ate = ateByAccount(y.accounts, a);
      if (ate.taxable > 0.5) {
        await expect(row).toContainText(fmt(toReal(ate.taxable, y.age - startAge, a.inflation)));
      }
    }
  });
}

test('chart tooltip readout matches the engine at a hovered age', async ({ page }) => {
  const state = exampleState('spotcheck');
  state.display = { ...state.display, real: false, ate: false, theme: 'light' };
  await loadState(page, state);
  const a = state.assumptions;
  const years = simulateAccumulation(a, state.growthScenarios[0]);
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  // grid: left 64, right 24 → x for age 40 across 30..62
  const plotLeft = box.x + 64;
  const plotRight = box.x + box.width - 24;
  const x = plotLeft + ((40 - 30) / (62 - 30)) * (plotRight - plotLeft);
  await page.mouse.move(x, box.y + box.height / 2);
  await page.mouse.move(x, box.y + box.height / 2 - 5); // trigger tooltip
  const y40 = years.find((y) => y.age === 40)!;
  await expect(page.getByText(`Age 40 · ${y40.year}`, { exact: false })).toBeVisible();
  await expect(page.getByText(fmt(y40.total), { exact: false }).first()).toBeVisible();
  await expect(page.getByText('IPO', { exact: false }).first()).toBeVisible(); // event line in readout
});

test('hero metrics match the engine ($1M age on spotcheck)', async ({ page }) => {
  const state = exampleState('spotcheck');
  await loadState(page, state);
  const years = simulateAccumulation(state.assumptions, state.growthScenarios[0]);
  const millionAge = firstAgeAtValue(years, 1_000_000, state.assumptions.inflation);
  await expect(page.getByText(`age ${millionAge}`, { exact: false })).toBeVisible();
});

test('y-axis floor: no plotted series dips below $0 on ANY example, buckets and accounts (M9.1 #7)', async ({ page }) => {
  for (const name of ['golden', 'spotcheck', 'drawdown', 'bracket', 'ladder', 'mega', 'rmd', 'fuelgauge'] as const) {
    const s = exampleState(name);
    s.display = { ...s.display, activeTab: 'drawdown', theme: 'light' };
    for (const byBuckets of [true, false]) {
      s.display.byBuckets = byBuckets;
      await loadState(page, s);
      const chart = page.locator('[data-y-min]').first();
      if ((await chart.count()) === 0) continue; // no-spending states render no run chart
      const yMin = Number(await chart.getAttribute('data-y-min'));
      expect(yMin, `${name} byBuckets=${byBuckets}`).toBeGreaterThanOrEqual(0);
    }
  }
});
