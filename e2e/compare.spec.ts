/** M6: Compare tab — grid equality, selection/overlay/crossover, deltas, presets. */

import { defaultPersistedState } from '../src/engine/defaults';
import { simulateRun } from '../src/engine/run';
import { validateRows } from '../src/engine/scheduleOps';
import type { PersistedState } from '../src/engine/types';
import { commitInput, exampleState, expect, loadState, readState, test } from './fixtures';

const fmtM = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
};

function compareState(): PersistedState {
  const s = exampleState('drawdown');
  s.display = { ...s.display, activeTab: 'compare', theme: 'light' };
  return s;
}

/** r = 0 everywhere: stop-at-45 (280k by 44) vs reduce-to-8k (8k/yr) cross at exactly 66. */
function handCrossState(): PersistedState {
  const s = defaultPersistedState(2026);
  s.assumptions = {
    ...s.assumptions,
    indexWithInflation: false,
    inflation: 0.03,
    fees: 0, // pure arithmetic: 8k × 35 = 20k × 14 = 280k at 65, overtaken at 66
    returnSchedule: [{ fromAge: 0, toAge: null, value: 0 }],
    returnOverrides: { cash: [{ fromAge: 0, toAge: null, value: 0 }] },
    dividendYield: 0,
    horizonAge: 90,
  };
  s.growthScenarios[0].perFiler[0].contrib401k = [{ fromAge: 31, toAge: null, value: 20_000 }];
  s.strategies[0].drawdownStartAge = 89;
  s.strategies[0].spending = [{ fromAge: 0, toAge: null, value: 1_000 }];
  s.display = { ...s.display, activeTab: 'compare', theme: 'light', real: false };
  return s;
}

test('cell metrics for two cells match the engine under both lenses (single-scenario table)', async ({ page }) => {
  const state = compareState();
  await loadState(page, state);
  const a = state.assumptions;
  // M6.1 #4: one scenario → the degenerate sortable table, strategies as rows
  await expect(page.getByTestId('compare-list')).toBeVisible();
  for (const real of [true, false]) {
    await page.getByRole('tab', { name: real ? "today's $" : 'nominal' }).click();
    for (const w of state.strategies) {
      const run = simulateRun(a, state.growthScenarios[0], w);
      const cell = page.getByLabel(`cell row ${w.name}`);
      // lens rule (M5.5 item 1) applied across the grid: real sums in today's-$ mode
      const { runTiles } = await import('../src/ui/v2/lens');
      const tiles = runTiles(run, a, real);
      await expect(cell).toContainText(fmtM(tiles.lifetimeAfterTaxSpending));
      await expect(cell).toContainText(fmtM(tiles.terminalAte));
      await expect(cell).toContainText(run.summary.bridgeFunded ? '✓' : '✗');
    }
  }
  // M6.1 #2: the funding column shows span phases per row
  await expect(page.getByLabel(`cell row ${state.strategies[0].name}`)).toContainText(
    'locked out 45–59 · funded 60+',
  );
  await expect(page.getByLabel(`cell row ${state.strategies[1].name}`)).toContainText(
    'funded through 90 ✓',
  );
});

test('hand case: stop-at-45 vs reduce-to-8k crossover at exactly 66, marked and machine-checked', async ({ page }) => {
  await loadState(page, handCrossState());
  // spawn "stop contributing at 45"
  await commitInput(page, 'Stop preset age', '45');
  await page.getByRole('button', { name: 'Stop contributing at' }).click();
  // spawn "reduce 401k to 8,000 at 31" (selection resets to this spawn)
  await commitInput(page, 'Reduce preset amount', '8000');
  await commitInput(page, 'Reduce preset age', '31');
  await page.getByRole('button', { name: 'Reduce 401k to', exact: true }).click();
  // add the stop cell back into the selection — one strategy → table rows are scenarios
  const s = await readState(page);
  const stopScenario = s.growthScenarios.find((g) => g.name.includes('stop at 45'))!;
  const reduceScenario = s.growthScenarios.find((g) => g.name.includes('reduce 401k'))!;
  await page.getByLabel(`cell row ${stopScenario.name}`).click();

  const crossovers = JSON.parse(
    (await page.locator('[data-crossovers]').getAttribute('data-crossovers'))!,
  ) as number[];
  expect(crossovers).toEqual([66]); // 8k × 35 = 20k × 14 = 280k at 65; overtaken at 66
  // machine-check against the engine from the persisted state
  const { firstCrossover } = await import('../src/state/derived');
  const runReduce = simulateRun(s.assumptions, reduceScenario, s.strategies[0]);
  const runStop = simulateRun(s.assumptions, stopScenario, s.strategies[0]);
  expect(firstCrossover(runReduce, runStop, s.assumptions, false)).toBe(66);
  await expect(page.getByTestId('delta-table')).toBeVisible();
});

test('retire-at pair: no fake crossover — curves diverge and never cross', async ({ page }) => {
  const state = compareState();
  await loadState(page, state);
  await commitInput(page, 'Retire preset age A', '55');
  await commitInput(page, 'Retire preset age B', '65');
  await page.getByRole('button', { name: 'Retire at', exact: true }).click();
  const crossovers = JSON.parse(
    (await page.locator('[data-crossovers]').getAttribute('data-crossovers'))!,
  ) as number[];
  expect(crossovers).toEqual([]);
  // both spawned strategies exist and render in the overlay legend/grid
  const s = await readState(page);
  expect(s.strategies.filter((w) => w.name.startsWith('Retire at'))).toHaveLength(2);
  expect(s.display.compareSelection).toHaveLength(2);
});

test('equal-take-home preset spawns both paths with the §8 explanation', async ({ page }) => {
  // M8 pre-work: with NO 401k schedule the paths would be identical — the
  // preset must refuse with a plain note instead of spawning twins
  await loadState(page, compareState());
  await page.getByRole('button', { name: 'Traditional vs Roth (equal take-home)' }).click();
  await expect(page.getByTestId('preset-note')).toContainText('Nothing to split');
  expect((await readState(page)).growthScenarios).toHaveLength(1); // nothing spawned

  // with a 401k schedule the pair spawns as before
  const withContrib = compareState();
  withContrib.growthScenarios[0].perFiler[0].salary = [{ fromAge: 44, toAge: 44, value: 120_000 }];
  withContrib.growthScenarios[0].perFiler[0].contrib401k = [{ fromAge: 44, toAge: 44, value: 10_000 }];
  await loadState(page, withContrib);
  await page.getByRole('button', { name: 'Traditional vs Roth (equal take-home)' }).click();
  const s = await readState(page);
  const trad = s.growthScenarios.find((g) => g.name === 'Traditional 401k (equal take-home)')!;
  const roth = s.growthScenarios.find((g) => g.name === 'Roth 401k (equal take-home)')!;
  expect(trad.perFiler[0].split401kRothPct).toBe(0);
  expect(roth.perFiler[0].split401kRothPct).toBe(1);
  expect(validateRows(trad.perFiler[0].contrib401k)).toEqual([]);
  expect(validateRows(roth.taxableContrib)).toEqual([]);
  await expect(page.getByTestId('preset-note')).toContainText('rate');
  // M6.1 #3d: spawned scenarios group under the experiments divider with keep buttons
  expect(trad.experiment).toBe(true);
  await expect(page.getByText('experiments', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'keep' }).first()).toBeVisible();
});

test('stop/reduce/stress presets produce normalized rows — never overrides', async ({ page }) => {
  const state = compareState();
  state.growthScenarios[0].perFiler[0].contrib401k = [{ fromAge: 45, toAge: null, value: 10_000 }];
  await loadState(page, state);

  await commitInput(page, 'Stop preset age', '50');
  await page.getByRole('button', { name: 'Stop contributing at' }).click();
  let s = await readState(page);
  expect(s.growthScenarios.find((g) => g.name.includes('stop at 50'))!.perFiler[0].contrib401k).toEqual([
    { fromAge: 45, toAge: 49, value: 10_000 },
  ]);

  await commitInput(page, 'Reduce preset amount', '4000');
  await commitInput(page, 'Reduce preset age', '48');
  await page.getByRole('button', { name: 'Reduce 401k to', exact: true }).click();
  s = await readState(page);
  expect(s.growthScenarios.find((g) => g.name.includes('reduce 401k'))!.perFiler[0].contrib401k).toEqual([
    { fromAge: 45, toAge: 47, value: 10_000 },
    { fromAge: 48, toAge: null, value: 4_000 },
  ]);

  await page.getByRole('button', { name: 'Stress first 3 drawdown years' }).click();
  s = await readState(page);
  const stress = s.growthScenarios.find((g) => g.name.includes('stress'))!;
  // drawdown.json locked strategy starts at 45 → stress years 45/46/47
  expect(stress.returnScheduleOverride).toEqual([
    { fromAge: 0, toAge: 44, value: 0.0712 },
    { fromAge: 45, toAge: 45, value: -0.2 },
    { fromAge: 46, toAge: 46, value: -0.1 },
    { fromAge: 47, toAge: 47, value: 0 },
    { fromAge: 48, toAge: null, value: 0.0712 },
  ]);
  await expect(page.getByRole('button', { name: 'Ladder bridge vs outside money' })).toBeVisible();
});

test('baseline picker drives the delta table; mockup routes are gone', async ({ page }) => {
  await loadState(page, compareState());
  // select both rows of the 1-scenario table
  const s0 = await readState(page);
  await page.getByLabel(`cell row ${s0.strategies[0].name}`).click();
  await page.getByLabel(`cell row ${s0.strategies[1].name}`).click();
  await expect(page.getByTestId('delta-table')).toBeVisible();
  await expect(page.getByTestId('delta-table').locator('tbody tr')).toHaveCount(1);
  // switch baseline → the other run becomes the delta row
  await page.getByLabel('Baseline run', { exact: true }).click();
  await page.getByRole('option', { name: /swr-flat|Case \(b\)/ }).click();
  await expect(page.getByTestId('delta-table').locator('tbody tr')).toHaveCount(1);

  // housekeeping: ?mockup routes removed — the app renders normally
  await page.goto('/?mockup=a');
  await expect(page.getByText('FuelGauge')).toBeVisible();
  await expect(page.getByText('Instrument panel')).toHaveCount(0);
});
