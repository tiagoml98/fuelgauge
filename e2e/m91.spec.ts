/**
 * M9.1: rule-of-55 access fix + bridge-end guard (1), ladder row defaults
 * (2), ladder-can't-help caveat (3), no-bridge copy (4), milestones fallback
 * (5), inactive-ladder wording (6). Item 7's invariant lives in
 * invariants.test + the engine-equality y-min sweep.
 */

import { defaultPersistedState } from '../src/engine/defaults';
import type { PersistedState } from '../src/engine/types';
import { commitInput, exampleState, expect, loadState, readState, test } from './fixtures';

/** Salary to the horizon (separation = 90), all pre-tax, drawdown at 56. */
function fiftySixRun(): PersistedState {
  const s = defaultPersistedState(2026);
  s.assumptions.filers = [{ currentAge: 50 }];
  s.assumptions.balances.perFiler[0].trad401k = 1_500_000;
  s.growthScenarios[0].perFiler[0].salary = [{ fromAge: 51, toAge: null, value: 150_000 }];
  s.strategies[0] = {
    ...s.strategies[0],
    drawdownStartAge: 56,
    spending: [{ fromAge: 0, toAge: null, value: 60_000 }],
  };
  s.display = { ...s.display, activeTab: 'drawdown', theme: 'light' };
  return s;
}

test('rule of 55 never delays access: salary to ∞ → bridge 56–60, locked until 60 (M9.1 #1)', async ({ page }) => {
  await loadState(page, fiftySixRun());
  // before the fix this read "bridge 56–90" and "locked until 90"
  await expect(page.getByTestId('bridge-summary')).toContainText('bridge 56–60');
  await expect(page.getByTestId('readout')).toContainText('locked until 60');
});

test('ladder rows default to the resolved drawdown start; from > to flags inline (M9.1 #2)', async ({ page }) => {
  const s = exampleState('bracket'); // bracket mode → fill-to-12% default
  s.display = { ...s.display, activeTab: 'drawdown' };
  await loadState(page, s);
  await page.getByText('Conversion ladder', { exact: false }).first().click();
  await page.getByRole('button', { name: '+ conversion row' }).click();
  const st = await readState(page);
  // resolved drawdown start is 65 (explicit); bracket mode → fill row
  expect(st.strategies[0].ladder).toEqual([{ fromAge: 65, toAge: 59, fillToBracketPct: 0.12 }]);
  // 65 > 59 → the inline flag renders (a real inert-default is visible, not silent)
  await expect(page.getByText('from > to — this row converts nothing')).toBeVisible();
  await commitInput(page, 'Ladder 1 to age', '70');
  await expect(page.getByText('from > to — this row converts nothing')).toHaveCount(0);
});

test('caveat when the ladder cannot shorten the bridge (M9.1 #3)', async ({ page }) => {
  const s = fiftySixRun();
  // converting at 58–59 unlocks at 60 — exactly when pre-tax opens anyway
  s.strategies[0].ladder = [{ fromAge: 58, toAge: 59, amount: 20_000 }];
  await loadState(page, s);
  await expect(page.getByTestId('ladder-caveat')).toContainText(
    "unlocks at 60, when your pre-tax opens anyway — it can't shorten the bridge",
  );
  await expect(page.getByTestId('readout')).toContainText("can't shorten the bridge");
});

test('no bridge: plain statement, no locked-until sentence (M9.1 #4)', async ({ page }) => {
  const s = fiftySixRun();
  s.strategies[0] = { ...s.strategies[0], drawdownStartAge: 65, ladder: [] };
  await loadState(page, s);
  await expect(page.getByTestId('bridge-summary')).toContainText(
    'no bridge needed — every account is open at your drawdown start',
  );
  await expect(page.getByTestId('readout')).toContainText('Everything is open at your drawdown start');
  await expect(page.getByTestId('readout')).not.toContainText('locked until');
});

test('milestones fall back to strategy spending when no FIRE target is set (M9.1 #5)', async ({ page }) => {
  const s = exampleState('fuelgauge');
  s.assumptions.fireSpendingTarget = 0;
  await loadState(page, s);
  await expect(page.getByTestId('milestones-fallback')).toHaveText(
    'using strategy spending ($80,000) — no FIRE target set',
  );
  // and the Full FIRE age is a number now, not "—"
  await expect(page.getByText('Full FIRE age')).toBeVisible();
});

test('inactive ladder says WHY, not "no ladder rows" (M9.1 #6)', async ({ page }) => {
  const s = fiftySixRun();
  s.strategies[0].ladder = [{ fromAge: 65, toAge: 59, amount: 20_000 }]; // from > to
  await loadState(page, s);
  await expect(page.getByTestId('rate-ladder-state')).toHaveText('ladder rows inactive — from > to');
});
