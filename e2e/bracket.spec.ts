/**
 * M7 bracket mode: mode toggle + editor, the computed effective rate in the
 * rate-arbitrage panel / crosshair / balance table, and the bracket-mode
 * preset explanation. The engine numbers are the hand-check case
 * (examples/bracket.json): year 65 — pool 17,000 · deduction 16,100 ·
 * gross-up 45,295.45 · tax 5,295.45 · effective 8.5%.
 */

import { defaultPersistedState } from '../src/engine/defaults';
import { commitInput, exampleState, expect, loadState, readState, test } from './fixtures';

test('tax mode toggle: bracket replaces the effective-rate input with the editor; edits + reset round-trip', async ({ page }) => {
  const s = defaultPersistedState(2026);
  s.display = { ...s.display, inputsTier: 'advanced', theme: 'light' };
  await loadState(page, s);
  await page.getByText('Taxes', { exact: true }).click();
  await expect(page.getByLabel('Effective rate', { exact: true })).toBeVisible();
  await expect(page.getByTestId('bracket-editor')).toHaveCount(0);

  await page.getByLabel('Tax mode', { exact: true }).click();
  await page.getByRole('option', { name: /Bracket/ }).click();
  expect((await readState(page)).assumptions.taxMode).toBe('bracket');
  // the input disappears — the rate is an output now
  await expect(page.getByLabel('Effective rate', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('bracket-editor')).toBeVisible();
  await expect(page.getByLabel('Standard deduction', { exact: true })).toHaveValue('16,100');
  await expect(page.getByText('stays FLAT even in bracket mode', { exact: false })).toBeVisible();

  // editing materializes the tables; reset returns to federal defaults
  await commitInput(page, 'Standard deduction', '20000');
  let state = await readState(page);
  expect(state.assumptions.bracketTables?.single.standardDeduction).toBe(20_000);
  expect(state.assumptions.bracketTables?.marriedJoint.standardDeduction).toBe(32_200);
  await page.getByRole('button', { name: 'reset to current federal' }).click();
  state = await readState(page);
  expect(state.assumptions.bracketTables).toBeUndefined();
  await expect(page.getByLabel('Standard deduction', { exact: true })).toHaveValue('16,100');
});

test('hand-check run: computed rate in the panel, the table row, and the crosshair (engine equality)', async ({ page }) => {
  await loadState(page, exampleState('bracket'));
  // rate-arbitrage: keyed on the first year WITH pre-tax withdrawals + the average
  await expect(page.getByTestId('rate-later')).toHaveText('8.5%');
  await expect(
    page.getByText('first pre-tax withdrawals (age 65) — computed from your brackets'),
  ).toBeVisible();
  await expect(page.getByTestId('rate-average')).toHaveText('average over drawdown: 8.5%');
  // balance table (yearly, nominal): year-65 tax cell = 5,295.45
  await expect(page.locator('tr[data-age="65"]')).toContainText('5,295');
  await expect(page.locator('tr[data-age="65"]')).toContainText('45,295');
  // crosshair at 65 shows the effective-rate line
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  const plotLeft = box.x + 64;
  const plotRight = box.x + box.width - 24;
  const x = plotLeft + ((65 - 64) / (90 - 64)) * (plotRight - plotLeft);
  await page.mouse.move(x, box.y + box.height / 2);
  await page.mouse.move(x, box.y + box.height / 2 - 4);
  await expect(page.getByText('effective rate').first()).toBeVisible();
  await expect(page.getByText('8.5%').first()).toBeVisible();
});

test('equal-take-home preset explains bracket mode with computed average rates, not a constant ratio', async ({ page }) => {
  const s = exampleState('bracket');
  // a 401k schedule so there is something to split (M8 pre-work guard)
  s.growthScenarios[0].perFiler[0].salary = [{ fromAge: 64, toAge: 64, value: 150_000 }];
  s.growthScenarios[0].perFiler[0].contrib401k = [{ fromAge: 64, toAge: 64, value: 20_000 }];
  s.display = { ...s.display, activeTab: 'compare' };
  await loadState(page, s);
  await page.getByRole('button', { name: 'Traditional vs Roth (equal take-home)' }).click();
  await expect(page.getByTestId('preset-note')).toContainText('Bracket mode — no constant ratio');
  await expect(page.getByTestId('preset-note')).toContainText('marginal-now');
  await expect(page.getByTestId('preset-note')).not.toContainText('rate ratio (1−t_ret)');
});

test('rate panel with no pre-tax draws: says so, still shows the drawdown average (M8 pre-work)', async ({ page }) => {
  const s = exampleState('bracket');
  // Roth-only pot: the SS row still creates ordinary income, but no year draws pre-tax
  s.assumptions.balances.perFiler[0].trad401k = 0;
  s.assumptions.balances.perFiler[0].rothIra = {
    basis: 2_000_000,
    conversions: [],
    earnings: 0,
    firstFundedYear: 2000,
  };
  await loadState(page, s);
  await expect(page.getByTestId('rate-later')).toHaveText('—');
  await expect(page.getByText('no year draws pre-tax in this run')).toBeVisible();
  // income-row ordinary income only: tax 90 on pool 17,000 → 0.5%
  await expect(page.getByTestId('rate-average')).toHaveText('average over drawdown: 0.5%');
});

test('never-retires warning replaces results when the auto start hits the horizon (M8 pre-work)', async ({ page }) => {
  const s = exampleState('bracket');
  // salary to the horizon + auto start → separation = horizon → D clamps to 90
  s.growthScenarios[0].perFiler[0].salary = [{ fromAge: 64, toAge: null, value: 100_000 }];
  s.strategies[0] = { ...s.strategies[0], drawdownStartAge: undefined };
  await loadState(page, s);
  await expect(page.getByTestId('never-retires')).toContainText('this run never retires');
  await expect(page.getByTestId('never-retires')).toContainText('resolves to 90');
  await expect(page.getByTestId('funding-spans')).toHaveCount(0); // no fake "funded through 90 ✓"

  // Compare cell says it too, instead of rendering metrics
  s.display = { ...s.display, activeTab: 'compare' };
  await loadState(page, s);
  await expect(page.getByText('never retires — auto start hits the horizon')).toBeVisible();
});
