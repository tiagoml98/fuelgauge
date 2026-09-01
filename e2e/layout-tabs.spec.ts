/** Tab render states, panel resize, truncation rules, Advanced tier. */

import { commitInput, exampleState, expect, expectNoTruncation, loadState, readState, test } from './fixtures';

test('empty state renders the first-run nudge, no chart, disabled tabs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Nothing to grow yet')).toBeVisible();
  await expect(page.getByText('the chart appears here')).toBeVisible();
  await expect(page.getByText('Drawdown')).toBeVisible();
  await expect(page.getByText('Compare')).toBeVisible();
  await expect(page.getByText('Start here.')).toBeVisible(); // Basics nudge
  await expect(page.getByText('not tax or financial advice', { exact: false })).toBeVisible();
});

test('renders spotcheck.json and drawdown.json states', async ({ page }) => {
  await loadState(page, exampleState('spotcheck'));
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(page.getByText('after tax at 62', { exact: false })).toBeVisible();

  await loadState(page, exampleState('drawdown'));
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(page.getByText('after tax at 90', { exact: false })).toBeVisible();
});

test('the divider tracks the cursor during a real drag; width persists on release (M4.5 #1)', async ({ page }) => {
  await loadState(page, exampleState('spotcheck'));
  await expectNoTruncation(page, 'inputs-panel');

  const handle = page.locator('[data-slot="resizable-handle"]');
  const start = (await handle.boundingBox())!;
  const y = start.y + 200;
  const startX = start.x + start.width / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  // the divider must follow the cursor within a few px at every step — the
  // laggy-trailing bug fails exactly this
  for (const dx of [40, 90, 140]) {
    await page.mouse.move(startX + dx, y, { steps: 3 });
    const b = (await handle.boundingBox())!;
    expect(Math.abs(b.x + b.width / 2 - (startX + dx))).toBeLessThan(6);
  }
  await page.mouse.up();
  const s = await readState(page);
  expect(s.display.panelWidth).toBeGreaterThan(500); // committed the dragged width
  await expectNoTruncation(page, 'inputs-panel');

  // drag hard left → clamps at min, still no truncation
  const b2 = (await handle.boundingBox())!;
  await page.mouse.move(b2.x + b2.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(b2.x - 700, y, { steps: 6 });
  await page.mouse.up();
  await expectNoTruncation(page, 'inputs-panel');
  const s2 = await readState(page);
  expect(s2.display.panelWidth).toBeGreaterThanOrEqual(299);
  expect(s2.display.panelWidth).toBeLessThanOrEqual(320);

  // reload with the maximum persisted width — the saved-width render path
  const maxed = exampleState('spotcheck');
  maxed.display = { ...maxed.display, panelWidth: 640 };
  await loadState(page, maxed);
  await expectNoTruncation(page, 'inputs-panel');
});

test('columns scroll independently and the page itself never scrolls (M4.5 #2)', async ({ page }) => {
  const state = exampleState('spotcheck');
  state.display = { ...state.display, inputsTier: 'basics', yearlyTable: true };
  await loadState(page, state);
  const canvas = page.locator('canvas').first();
  const chartBefore = (await canvas.boundingBox())!;
  const panel = page.getByTestId('inputs-panel');
  const panelBox = (await panel.boundingBox())!;

  // wheel over the LEFT panel: panel content moves, chart stays put, page still
  await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + 200);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(150);
  expect((await panel.evaluate((el) => el.scrollTop))).toBeGreaterThan(0);
  const chartAfterLeft = (await canvas.boundingBox())!;
  expect(Math.abs(chartAfterLeft.y - chartBefore.y)).toBeLessThan(2);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  // wheel over the RIGHT column: it scrolls, the panel doesn't move further
  const panelScroll = await panel.evaluate((el) => el.scrollTop);
  const column = page.getByTestId('chart-column');
  const colBox = (await column.boundingBox())!;
  await page.mouse.move(colBox.x + colBox.width / 2, colBox.y + 100);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(150);
  expect(await column.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await panel.evaluate((el) => el.scrollTop)).toBe(panelScroll);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => document.body.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
});

test('Advanced tier shows every group and persists the tier choice', async ({ page }) => {
  await loadState(page, exampleState('spotcheck'));
  await page.getByRole('tab', { name: 'Advanced' }).click();
  for (const group of [
    'Filers & filing',
    'Detailed balances',
    'Household basis & accounts',
    'Contribution detail',
    'Windfalls',
    'Returns & fees',
    'Taxes (simple mode)',
    'Contribution limits (2026, indexed)',
    'Horizon, HSA & targets',
    'Plan toggles & access overrides',
  ]) {
    await expect(page.getByText(group, { exact: false }).first()).toBeVisible();
  }
  expect((await readState(page)).display.inputsTier).toBe('advanced');
  await expectNoTruncation(page, 'inputs-panel');
});

test('Advanced sections: levers vs reference, live sensitivity hints machine-checked (M6.2 #3)', async ({ page }) => {
  const state = exampleState('spotcheck');
  state.assumptions.fireSpendingTarget = 40_000;
  state.display = { ...state.display, inputsTier: 'advanced' };
  await loadState(page, state);

  // two labeled sections, reference marked rarely-changed and collapsed
  await expect(page.getByTestId('section-levers')).toContainText('Assumptions worth questioning');
  await expect(page.getByTestId('section-reference')).toContainText('rarely changed');
  await expect(page.getByLabel('Limit: 401k deferral', { exact: true })).toHaveCount(0); // collapsed
  await page.getByText('Contribution limits (2026, indexed)').click();
  await expect(page.getByLabel('Limit: 401k deferral', { exact: true })).toBeVisible();

  // sensitivity hints: the rendered numbers must equal the engine's
  const a = state.assumptions;
  const { coastFireAge } = await import('../src/engine/metrics');
  const shifted = (d: number) => ({
    ...a,
    returnSchedule: a.returnSchedule.map((r) => ({ ...r, value: r.value + d })),
  });
  const base = coastFireAge(a, state.growthScenarios[0])!;
  const up = coastFireAge(shifted(0.01), state.growthScenarios[0])!;
  const down = coastFireAge(shifted(-0.01), state.growthScenarios[0])!;
  const n = Math.max(Math.abs(base - up), Math.abs(down - base));
  await expect(page.getByTestId('sensitivity-return')).toHaveText(
    `±1% return moves Coast FIRE by ~${n} year${n === 1 ? '' : 's'} (now ${base} · −1% → ${down} · +1% → ${up})`,
  );
  const tRet = a.effectiveRetirementRate + a.stateTaxRate;
  const swing = Math.round((0.05 / (1 - tRet)) * 1000) / 10;
  await expect(page.getByTestId('sensitivity-rate')).toContainText(
    `±5 points here move your traditional-vs-Roth result by ±${swing}%`,
  );

  // the hint is live: raising the effective rate reprices the swing
  await page.getByText('Taxes (simple mode)').click();
  await commitInput(page, 'Effective rate', '20');
  const swing20 = Math.round((0.05 / (1 - (0.2 + a.stateTaxRate))) * 1000) / 10;
  await expect(page.getByTestId('sensitivity-rate')).toContainText(`±${swing20}%`);
});

test('two filers: adding filer 2 aligns state and offers the HSA family switch', async ({ page }) => {
  await loadState(page, exampleState('spotcheck'));
  await page.getByRole('tab', { name: 'Advanced' }).click();
  await page.getByText('Filers & filing').click(); // collapsed group with one filer
  await page.getByLabel('Filers', { exact: true }).click();
  await page.getByRole('option', { name: 'Two' }).click();
  const s = await readState(page);
  expect(s.assumptions.filers).toHaveLength(2);
  expect(s.assumptions.balances.perFiler).toHaveLength(2);
  expect(s.growthScenarios.every((g) => g.perFiler.length === 2)).toBe(true);
  await expect(page.getByText('switch HSA coverage to family', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'switch to family' }).click();
  expect((await readState(page)).assumptions.hsaCoverage).toBe('family');
});

test('separation/salary disagreement warns inline (C.6)', async ({ page }) => {
  await loadState(page, exampleState('spotcheck'));
  await page.getByRole('tab', { name: 'Advanced' }).click();
  await page.getByText('Contribution detail').click();
  const field = page.getByLabel('Filer 1 separation override', { exact: true });
  await field.scrollIntoViewIfNeeded();
  await field.click();
  await field.fill('49');
  await field.blur();
  await expect(
    page.getByText('salary continues after separation — match and contributions after 49 still apply'),
  ).toBeVisible();
});
