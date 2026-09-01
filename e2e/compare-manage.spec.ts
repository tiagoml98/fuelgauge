/**
 * M6.1 #3–#5: sprawl management (bulk delete, visibility, experiments),
 * the degenerate single-axis table, and the no-self-compare overlay rules.
 */

import type { PersistedState } from '../src/engine/types';
import { exampleState, expect, loadState, readState, test } from './fixtures';

function compareState(): PersistedState {
  const s = exampleState('drawdown');
  s.display = { ...s.display, activeTab: 'compare', theme: 'light' };
  return s;
}

/** drawdown example widened to 3 scenarios × 2 strategies with 2 cells selected. */
function wideState(): PersistedState {
  const s = compareState();
  const g0 = s.growthScenarios[0];
  s.growthScenarios = [
    g0,
    { ...structuredClone(g0), id: 'g2', name: 'Clone B' },
    { ...structuredClone(g0), id: 'g3', name: 'Clone C' },
  ];
  s.display.compareSelection = [
    { scenarioId: 'g2', strategyId: s.strategies[0].id },
    { scenarioId: g0.id, strategyId: s.strategies[1].id },
  ];
  s.display.compareBaseline = { scenarioId: 'g2', strategyId: s.strategies[0].id };
  return s;
}

test('bulk delete: one confirm per batch, selections cleaned, survives reload (M6.1 #3a)', async ({ page }) => {
  const state = wideState();
  await loadState(page, state);
  await expect(page.getByTestId('compare-count')).toContainText('3 scenarios × 2 strategies');

  await page.getByRole('button', { name: 'manage', exact: true }).click();
  await page.getByLabel('select Clone B').check();
  await page.getByLabel('select Clone C').check();
  await page.getByRole('button', { name: 'delete selected (2)' }).click();
  await page.getByRole('button', { name: 'yes, delete' }).click();

  const s = await readState(page);
  expect(s.growthScenarios.map((g) => g.name)).toEqual([state.growthScenarios[0].name]);
  // the deleted scenario's cell left the selection; the baseline re-anchored
  expect(s.display.compareSelection).toEqual([
    { scenarioId: state.growthScenarios[0].id, strategyId: state.strategies[1].id },
  ]);
  expect(s.display.compareBaseline).toEqual(s.display.compareSelection![0]);

  // round-trip: the URL is the store — a fresh boot shows the same world
  await page.reload();
  await expect(page.getByTestId('compare-count')).toContainText('1 scenario × 2 strategies');
  await expect(page.getByText('Clone B')).toHaveCount(0);
});

test('visibility: eye hides a row, deselects its cells, flips grid↔table; show all restores (M6.1 #3b, #4)', async ({ page }) => {
  const state = wideState();
  state.growthScenarios = state.growthScenarios.slice(0, 2); // 2×2 → a real grid
  await loadState(page, state);
  const g0 = state.growthScenarios[0];
  const w0 = state.strategies[0];
  await expect(page.getByRole('button', { name: `cell ${g0.name} × ${w0.name}` })).toBeVisible();

  await page.getByLabel('hide scenario Clone B').click();
  // one visible scenario left → the degenerate table replaces the grid
  await expect(page.getByTestId('compare-list')).toBeVisible();
  await expect(page.getByTestId('compare-count')).toContainText('· 1 hidden');
  const s = await readState(page);
  expect(s.display.hiddenScenarios).toEqual(['g2']);
  // hiding deselects: the Clone B cell left the overlay selection
  expect(s.display.compareSelection).toEqual([{ scenarioId: g0.id, strategyId: state.strategies[1].id }]);

  await page.getByRole('button', { name: 'manage', exact: true }).click();
  await page.getByRole('button', { name: 'show all scenarios' }).click();
  // both axes ≥ 2 again → the grid returns
  await expect(page.getByRole('button', { name: `cell Clone B × ${w0.name}` })).toBeVisible();
  await expect(page.getByTestId('compare-count')).not.toContainText('hidden');

  // hide all but selected: selection is the g0 × strategies[1] cell → Clone B
  // and the other strategy get hidden, on both axes at once
  await page.getByRole('button', { name: 'hide all but selected' }).click();
  const s2 = await readState(page);
  expect(s2.display.hiddenScenarios).toEqual(['g2']);
  expect(s2.display.hiddenStrategies).toEqual([w0.id]);
  expect(s2.display.compareSelection).toEqual([
    { scenarioId: g0.id, strategyId: state.strategies[1].id },
  ]);
  await expect(page.getByTestId('compare-count')).toContainText('· 2 hidden');

  // hiding the last visible scenario leaves the honest everything-hidden state
  await page.getByLabel(`toggle visibility ${g0.name}`).click();
  await expect(page.getByText('everything is hidden', { exact: false })).toBeVisible();
});

test('experiments: preset spawns tagged, keep survives clear, cleared gone everywhere incl. URL (M6.1 #3c)', async ({ page }) => {
  const state = wideState();
  state.growthScenarios = state.growthScenarios.slice(0, 2); // 2 scenarios → grid mode
  state.display.compareSelection = [];
  state.display.compareBaseline = undefined;
  await loadState(page, state);
  await page.getByRole('button', { name: 'Retire at', exact: true }).click(); // spawns 55 vs 65
  await expect(page.getByTestId('compare-count')).toContainText('· 2 experiments');
  // M6.1 #3d: experiment strategies wear the exp badge in the grid header
  await expect(page.locator('th', { hasText: 'Retire at 55' }).getByText('exp')).toBeVisible();
  let s = await readState(page);
  expect(s.strategies.filter((w) => w.experiment)).toHaveLength(2);
  // spawned experiments are auto-selected for the overlay
  expect(s.display.compareSelection).toHaveLength(2);

  await page.getByRole('button', { name: 'manage', exact: true }).click();
  await page
    .getByTestId('manage-panel')
    .locator('label', { hasText: 'Retire at 55' })
    .getByRole('button', { name: 'keep' })
    .click();
  await page.getByRole('button', { name: 'clear 1 experiment', exact: true }).click();

  s = await readState(page);
  const names = s.strategies.map((w) => w.name);
  expect(names).toContain('Retire at 55'); // kept — promoted, no longer an experiment
  expect(s.strategies.every((w) => !w.experiment)).toBe(true);
  expect(names.some((n) => n.includes('Retire at 65'))).toBe(false); // cleared from state = cleared from URL
  expect(s.display.compareSelection!.every((c) => s.strategies.some((w) => w.id === c.strategyId))).toBe(true);
  await page.reload();
  await expect(page.getByText('Retire at 65')).toHaveCount(0);
  await expect(page.getByTestId('compare-count')).not.toContainText('experiments');
});

test('degenerate table sorts by metric columns (M6.1 #4)', async ({ page }) => {
  const state = compareState();
  await loadState(page, state);
  const rows = page.getByTestId('compare-list').locator('tbody tr');
  // unsorted: storage order — locked first
  await expect(rows.first()).toContainText(state.strategies[0].name);
  // first click: descending — swr-flat funds 46 years, locked only ~18 → swr-flat first
  await page.getByRole('button', { name: 'spending', exact: true }).click();
  await expect(rows.first()).toContainText(state.strategies[1].name);
  // second click flips to ascending
  await page.getByRole('button', { name: /spending/ }).click();
  await expect(rows.first()).toContainText(state.strategies[0].name);
});

test('single selected cell: curve + hint, no baseline, no deltas, no crossovers (M6.1 #5)', async ({ page }) => {
  const state = compareState();
  await loadState(page, state);
  await page.getByLabel(`cell row ${state.strategies[0].name}`).click();
  await expect(page.getByTestId('single-run-hint')).toHaveText('select another cell to compare');
  await expect(page.getByLabel('Baseline run')).toHaveCount(0);
  await expect(page.getByTestId('delta-table')).toHaveCount(0);
  expect(JSON.parse((await page.locator('[data-crossovers]').getAttribute('data-crossovers'))!)).toEqual([]);

  // second cell → baseline picker and deltas appear; hint goes away
  await page.getByLabel(`cell row ${state.strategies[1].name}`).click();
  await expect(page.getByLabel('Baseline run')).toBeVisible();
  await expect(page.getByTestId('delta-table')).toBeVisible();
  await expect(page.getByTestId('single-run-hint')).toHaveCount(0);
});
