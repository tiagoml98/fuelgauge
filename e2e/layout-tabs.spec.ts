/** Tab render states, panel resize, truncation rules, Advanced tier. */

import { exampleState, expect, expectNoTruncation, loadState, readState, test } from './fixtures';

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

test('no text truncation at default, min, and max panel widths', async ({ page }) => {
  await loadState(page, exampleState('spotcheck'));
  await expectNoTruncation(page, 'inputs-panel');

  const handle = page.locator('[data-slot="resizable-handle"]');
  const box = (await handle.boundingBox())!;
  // drag to min
  await page.mouse.move(box.x + 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x - 600, box.y + 200, { steps: 5 });
  await page.mouse.up();
  await expectNoTruncation(page, 'inputs-panel');
  let s = await readState(page);
  expect(s.display.panelWidth).toBeGreaterThanOrEqual(299);
  expect(s.display.panelWidth).toBeLessThanOrEqual(320);

  // drag wider
  const box2 = (await handle.boundingBox())!;
  await page.mouse.move(box2.x + 2, box2.y + 200);
  await page.mouse.down();
  await page.mouse.move(box2.x + 900, box2.y + 200, { steps: 8 });
  await page.mouse.up();
  await expectNoTruncation(page, 'inputs-panel');
  s = await readState(page);
  expect(s.display.panelWidth).toBeGreaterThan(400); // grew past the default

  // exact max width, loaded from persisted state (deterministic)
  const maxed = exampleState('spotcheck');
  maxed.display = { ...maxed.display, panelWidth: 640 };
  await loadState(page, maxed);
  await expectNoTruncation(page, 'inputs-panel');
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
