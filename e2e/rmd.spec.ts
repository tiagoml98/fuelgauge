/**
 * M10 RMDs: the hand-check run (examples/rmd.json — age 75: 1,000,000 ÷ 24.6
 * = 40,650.41 gross · tax 2,452.05 · net 38,198.36 · surplus 8,198.36 →
 * taxable), the rmdStart marker at N − 0.5, the crosshair RMD line, the
 * readout surplus sentence, the rate panel's RMD-years average, the 65+
 * deduction editor row, and the "Convert before RMDs vs don't" preset with
 * its full note.
 */

import { simulateRun } from '../src/engine/run';
import { commitInput, exampleState, expect, loadState, readState, test } from './fixtures';

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

test('hand-check run: RMD figures in the table row, the marker at 74.5, and the crosshair line', async ({ page }) => {
  const s = exampleState('rmd');
  s.display = { ...s.display, activeTab: 'drawdown', theme: 'light', yearlyTable: true };
  await loadState(page, s);
  // engine equality: year 75 IS the golden case
  const run = simulateRun(s.assumptions, s.growthScenarios[0], s.strategies[0]);
  const y75 = run.years.find((y) => y.age === 75)!;
  expect(y75.rmd!.entries[0]).toMatchObject({
    priorPreTax: expect.closeTo(1_000_000, 1),
    divisor: 24.6,
    gross: expect.closeTo(40_650.41, 1),
    tax: expect.closeTo(2_452.05, 1),
  });
  expect(y75.rmd!.toTaxable).toBeCloseTo(8_198.36, 1);
  // balance table year 75: withdrawn = the forced gross; the surplus shows
  // up as the taxable balance born that year (basis = itself → face value)
  await expect(page.locator('tr[data-age="75"]')).toContainText('40,650');
  await expect(page.locator('tr[data-age="75"]')).toContainText('8,198');
  // regime marker renders at N − 0.5
  const markers = JSON.parse(
    (await page.locator('[data-markers]').first().getAttribute('data-markers'))!,
  ) as Array<{ x: number; kind: string }>;
  expect(markers.some((m) => m.x === 74.5 && m.kind === 'rmdStart')).toBe(true);
  // crosshair at 75: the RMD line with the excess-to-taxable clause
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  const plotLeft = box.x + 64;
  const plotRight = box.x + box.width - 24;
  const x = plotLeft + ((75 - 65) / (90 - 65)) * (plotRight - plotLeft);
  await page.mouse.move(x, box.y + box.height / 2);
  await page.mouse.move(x, box.y + box.height / 2 - 4);
  await expect(page.getByText('RMD', { exact: true })).toBeVisible();
  await expect(page.getByText('(excess $8,198 to taxable)', { exact: false })).toBeVisible();
});

test('readout surplus sentence + rate panel RMD-years average (engine equality)', async ({ page }) => {
  const s = exampleState('rmd');
  s.display = { ...s.display, activeTab: 'drawdown', theme: 'light' };
  await loadState(page, s);
  const run = simulateRun(s.assumptions, s.growthScenarios[0], s.strategies[0]);
  const rmdYears = run.years.filter((y) => y.rmd !== undefined);
  const avgSurplus =
    rmdYears.reduce((t, y) => t + y.rmd!.toTaxable, 0) / rmdYears.length;
  const gross = rmdYears.reduce((t, y) => t + y.rmd!.entries.reduce((n, e) => n + e.gross, 0), 0);
  const tax = rmdYears.reduce((t, y) => t + y.rmd!.entries.reduce((n, e) => n + e.tax, 0), 0);
  await expect(page.getByTestId('readout-rmd-surplus')).toContainText(
    `From 75, forced withdrawals exceed your spending by about $${Math.round(avgSurplus).toLocaleString('en-US')}/yr`,
  );
  await expect(page.getByTestId('readout-rmd-surplus')).toContainText(
    `taxed at ${pct(tax / gross)} and pushed into taxable`,
  );
  await expect(page.getByTestId('rate-rmd-average')).toContainText(
    `RMD years average: ${pct(tax / gross)}`,
  );
});

test('65+ deduction: the bracket editor row round-trips; zeroing it shrinks the year-75 surplus on screen', async ({ page }) => {
  const s = exampleState('rmd');
  s.display = { ...s.display, activeTab: 'growth', theme: 'light', inputsTier: 'advanced', yearlyTable: true };
  await loadState(page, s);
  await page.getByText('Taxes', { exact: true }).click();
  await expect(page.getByLabel('Additional deduction 65+', { exact: true })).toHaveValue('2,050');
  await commitInput(page, 'Additional deduction 65+', '0');
  const st = await readState(page);
  expect(st.assumptions.bracketTables?.single.additionalDeduction65).toBe(0);
  // user-visible outcome: without the deduction the RMD tax rises 2,452.05 →
  // 2,698.05, so the surplus pushed to taxable shrinks 8,198 → 7,952
  await page.getByRole('button', { name: 'Drawdown', exact: true }).click();
  await expect(page.locator('tr[data-age="75"]')).toContainText('7,952');
});

test('preset: "Convert before RMDs vs don\'t" spawns the pair with the full note (window, RMD grosses, rates, lens)', async ({ page }) => {
  const s = exampleState('rmd');
  s.display = { ...s.display, activeTab: 'compare', theme: 'light' };
  await loadState(page, s);
  await page.getByRole('button', { name: 'Convert before RMDs vs don’t' }).click();

  const st = await readState(page);
  const none = st.strategies.find((w) => w.name.startsWith("Don't convert"))!;
  const convert = st.strategies.find((w) => w.name.startsWith('Convert to top of'))!;
  expect(none.experiment).toBe(true);
  expect(none.ladder).toEqual([]);
  // the window: resolved drawdown start (66) through rmdAge − 1 (74)
  expect(convert.ladder).toEqual([{ fromAge: 66, toAge: 74, fillToBracketPct: 0.12 }]);

  const note = page.getByTestId('preset-note');
  await expect(note).toContainText('First RMD year (75):');
  await expect(note).toContainText('conversions in 66–74');
  await expect(note).toContainText('the window used: your resolved drawdown start through the year before RMDs');
  await expect(note).toContainText('Lifetime tax');
  await expect(note).toContainText('terminal ATE');
  await expect(note).toContainText(/Breakeven at \d+|No breakeven by the horizon/);
  await expect(note).toContainText('conversions pay');
  await expect(note).toContainText('the forced RMD years average without them');
  // §10.1 valuation-lens disclosure, in whichever form applies
  await expect(note).toContainText(/valuation rule, not only economics|lens is neutral/);
  // both first-RMD-year grosses are the engine's (no-convert side = golden 40,650)
  await expect(note).toContainText('$40,650 forced without converting');
});

test('preset guard: simple mode explains fill rows need bracket mode instead of spawning', async ({ page }) => {
  const s = exampleState('drawdown'); // simple mode
  s.display = { ...s.display, activeTab: 'compare', theme: 'light' };
  await loadState(page, s);
  await page.getByRole('button', { name: 'Convert before RMDs vs don’t' }).click();
  await expect(page.getByTestId('preset-note')).toContainText('need bracket mode');
  const st = await readState(page);
  expect(st.strategies.some((w) => w.name.startsWith("Don't convert"))).toBe(false);
});
