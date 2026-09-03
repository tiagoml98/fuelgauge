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
  // rate-arbitrage: the computed first-drawdown-year rate, labeled as computed
  await expect(page.getByTestId('rate-later')).toHaveText('8.5%');
  await expect(page.getByText('this year (65): 8.5% — computed from your brackets')).toBeVisible();
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
  s.display = { ...s.display, activeTab: 'compare' };
  await loadState(page, s);
  await page.getByRole('button', { name: 'Traditional vs Roth (equal take-home)' }).click();
  await expect(page.getByTestId('preset-note')).toContainText('Bracket mode — no constant ratio');
  await expect(page.getByTestId('preset-note')).toContainText('marginal-now');
  await expect(page.getByTestId('preset-note')).not.toContainText('rate ratio (1−t_ret)');
});
