/**
 * M6.2 #1: cost basis is EXPLICIT ENTRY, never auto-populated. The bug: the
 * taxable-balance commit handler silently wrote taxableBasis (clamp + fill),
 * so the basis showed values the user never entered and changed on later
 * balance edits. Empty basis = stated assumption, shown as placeholder, chip,
 * and readout line; a clear control returns the field to empty.
 */

import { defaultPersistedState } from '../src/engine/defaults';
import type { PersistedState } from '../src/engine/types';
import { commitInput, expect, loadState, readState, test } from './fixtures';

function advancedState(): PersistedState {
  const s = defaultPersistedState(2026);
  s.display = { ...s.display, activeTab: 'growth', inputsTier: 'basics', theme: 'light' };
  return s;
}

test('editing the taxable balance never touches the basis (the 99,871 bug)', async ({ page }) => {
  await loadState(page, advancedState());
  // the user's exact history: enter a balance, then change it later
  await commitInput(page, 'Invested taxable balance', '99871');
  await commitInput(page, 'Invested taxable balance', '149506');
  let s = await readState(page);
  expect(s.assumptions.balances.taxable).toBe(149_506);
  expect(s.assumptions.balances.taxableBasis).toBeUndefined(); // never entered → never written

  // the basis field itself is empty with the assumption as placeholder + chip
  await page.getByRole('tab', { name: 'Advanced' }).click();
  await page.getByText('Household basis & accounts').click(); // expand the group
  const basis = page.getByLabel('Taxable cost basis', { exact: true });
  await expect(basis).toHaveValue('');
  await expect(basis).toHaveAttribute('placeholder', /basis = balance/);
  await expect(page.getByTestId('basis-chip-taxable')).toContainText('basis not entered');

  // explicit entry works, kills the chip, and balance edits still leave it alone
  await commitInput(page, 'Taxable cost basis', '60000');
  await expect(page.getByTestId('basis-chip-taxable')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Basics' }).click();
  await commitInput(page, 'Invested taxable balance', '30000'); // balance below basis: still untouched
  await page.getByRole('tab', { name: 'Advanced' }).click();
  await page.getByText('Household basis & accounts').click();
  await expect(page.getByLabel('Taxable cost basis', { exact: true })).toHaveValue('60,000');
  s = await readState(page);
  expect(s.assumptions.balances.taxableBasis).toBe(60_000);

  // clear returns it to empty = not entered
  await page.getByRole('button', { name: 'clear Taxable cost basis' }).click();
  await expect(page.getByLabel('Taxable cost basis', { exact: true })).toHaveValue('');
  await expect(page.getByTestId('basis-chip-taxable')).toBeVisible();
  s = await readState(page);
  expect(s.assumptions.balances.taxableBasis).toBeUndefined();
});

test('Roth 401k and trad IRA basis follow the same rule: empty, stated assumption, clear control', async ({ page }) => {
  const state = advancedState();
  state.assumptions.balances.perFiler[0].roth401k = 80_000;
  state.assumptions.balances.perFiler[0].tradIra = 50_000;
  state.display.inputsTier = 'advanced';
  await loadState(page, state);
  await page.getByText('Detailed balances', { exact: true }).click(); // expand the group

  const roth = page.getByLabel('Filer 1 Roth 401k basis', { exact: true });
  await expect(roth).toHaveValue('');
  await expect(roth).toHaveAttribute('placeholder', /earnings/);
  await expect(page.getByTestId('basis-chip-roth401k-0')).toContainText('basis not entered');
  const ira = page.getByLabel('Filer 1 trad IRA basis', { exact: true });
  await expect(ira).toHaveValue('');
  await expect(ira).toHaveAttribute('placeholder', /fully taxable/);

  await commitInput(page, 'Filer 1 Roth 401k basis', '45000');
  await expect(page.getByTestId('basis-chip-roth401k-0')).toHaveCount(0);
  expect((await readState(page)).assumptions.balances.perFiler[0].roth401kBasis).toBe(45_000);
  await page.getByRole('button', { name: 'clear Filer 1 Roth 401k basis' }).click();
  expect((await readState(page)).assumptions.balances.perFiler[0].roth401kBasis).toBeUndefined();
});

test('readout states the taxable assumption when basis is empty', async ({ page }) => {
  const state = advancedState();
  state.assumptions.balances.taxable = 200_000;
  state.strategies[0].spending = [{ fromAge: 0, toAge: null, value: 40_000 }];
  state.strategies[0].drawdownStartAge = 45;
  state.display.activeTab = 'drawdown';
  await loadState(page, state);
  await expect(page.getByTestId('readout')).toContainText(
    'cost basis not entered — taxable withdrawals modeled tax-free',
  );
});
