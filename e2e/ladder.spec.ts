/**
 * M8 conversion ladder: before/after on the motivation examples, bridge
 * sources, the ladder preset with its honest note, the withheld warning, and
 * the hand-check run (examples/ladder.json — pool 17,000 · fill 49,500 ·
 * tax 5,710 from cash · unlock 2027).
 */

import { simulateRun } from '../src/engine/run';
import type { PersistedState } from '../src/engine/types';
import { commitInput, exampleState, expect, loadState, readState, test } from './fixtures';

test('hand-check run: LADDER figures rendered — conversion rate column, marker, table row', async ({ page }) => {
  const s = exampleState('ladder');
  s.display = { ...s.display, activeTab: 'drawdown' };
  await loadState(page, s);
  // rate panel middle column: engine-computed average over ALL conversion
  // years (later fills sit at flat 12% once cash depletes, so it's not 11.5%)
  const run = simulateRun(s.assumptions, s.growthScenarios[0], s.strategies[0]);
  const conv = run.years.filter((y) => y.ladder !== undefined);
  const avg =
    conv.reduce((n, y) => n + (y.ladder?.tax ?? 0), 0) /
    conv.reduce((n, y) => n + (y.ladder?.converted ?? 0), 0);
  await expect(page.getByTestId('rate-conversion')).toHaveText(`${Math.round(avg * 1000) / 10}%`);
  // and year 65 itself is the exact hand case
  expect(run.years.find((y) => y.age === 65)?.ladder).toMatchObject({
    poolBeforeConversion: expect.closeTo(17_000, 1),
    converted: expect.closeTo(49_500, 1),
    tax: expect.closeTo(5_710, 1),
    unlockYear: 2027,
  });
  await expect(page.getByText('conversion years (65–', { exact: false })).toBeVisible();
  // balance-table year 65: the 49,500 tranche shows in the Roth IRA column
  await expect(page.locator('tr[data-age="65"]')).toContainText('49,500');
  // conversion marker in the artifact at N (not N − 0.5)
  const markers = JSON.parse(
    (await page.locator('[data-markers]').first().getAttribute('data-markers'))!,
  ) as Array<{ x: number; kind: string }>;
  expect(markers.some((m) => m.x === 65 && m.kind === 'conversion')).toBe(true);
});

test('before/after (b): the ladder turns locked years into funded ones as tranches season', async ({ page }) => {
  const s = exampleState('ladder-motivation-b');
  s.display = { ...s.display, activeTab: 'compare', theme: 'light' };
  await loadState(page, s);
  await commitInput(page, 'Ladder preset amount', '80000');
  await commitInput(page, 'Ladder preset from age', '44');
  await page.getByRole('button', { name: 'Ladder bridge vs outside money' }).click();

  const st = (await readState(page)) as PersistedState;
  const outside = st.strategies.find((w) => w.name.includes('Outside-money'))!;
  const ladder = st.strategies.find((w) => w.name.startsWith('Ladder:'))!;
  expect(outside.experiment).toBe(true);
  expect(ladder.ladder).toEqual([{ fromAge: 44, toAge: 59, amount: 80_000 }]);
  // engine equality: 11 locked years collapse to 1 — only 48 remains (taxable
  // runs out one year before the first tranche seasons at 49)
  const runOut = simulateRun(st.assumptions, st.growthScenarios[0], outside);
  const runLad = simulateRun(st.assumptions, st.growthScenarios[0], ladder);
  const locked = (r: typeof runOut) =>
    r.summary.spans.filter((sp) => sp.kind === 'locked').reduce((n, sp) => n + sp.to - sp.from + 1, 0);
  expect(locked(runOut)).toBe(11);
  expect(locked(runLad)).toBe(1);
  expect(runLad.summary.spans.some((sp) => sp.kind === 'funded' && sp.from === 49)).toBe(true);
  // the note explains the drivers honestly; simple mode → the lens is neutral
  await expect(page.getByTestId('preset-note')).toContainText('Breakeven at 49');
  await expect(page.getByTestId('preset-note')).toContainText('Access drives it');
  await expect(page.getByTestId('preset-note')).toContainText('Conversions pay 12% vs your 24% marginal-now');
  await expect(page.getByTestId('preset-note')).toContainText('lens is neutral');
});

test('preset note in bracket mode discloses the valuation-lens effect (plan amendment #3)', async ({ page }) => {
  const s = exampleState('ladder'); // bracket mode; valuation 13.4% ≠ conversion ~11.7%
  s.display = { ...s.display, activeTab: 'compare' };
  await loadState(page, s);
  await commitInput(page, 'Ladder preset amount', '49500');
  await commitInput(page, 'Ladder preset from age', '65');
  await page.getByRole('button', { name: 'Ladder bridge vs outside money' }).click();
  await expect(page.getByTestId('preset-note')).toContainText('pre-tax is valued at');
  await expect(page.getByTestId('preset-note')).toContainText('appear as an immediate ATE');
  await expect(page.getByTestId('preset-note')).toContainText('valuation rule, not only economics');
});

test('before/after (a): nothing to pay conversion tax from → withheld warning with the penalty', async ({ page }) => {
  const s = exampleState('ladder-motivation-a');
  // apply a ladder directly on the strategy (no outside money exists at all)
  s.strategies[0] = { ...s.strategies[0], ladder: [{ fromAge: 40, toAge: 59, amount: 90_000 }] };
  s.display = { ...s.display, activeTab: 'drawdown' };
  await loadState(page, s);
  await expect(page.getByTestId('ladder-withheld-warning')).toContainText(
    'Nothing left in cash/taxable to pay conversion tax',
  );
  await expect(page.getByTestId('ladder-withheld-warning')).toContainText('10% early-withdrawal penalty');
  // spans improve anyway: tranches from 40 season from 45 — engine equality
  const st = await readState(page);
  const run = simulateRun(st.assumptions, st.growthScenarios[0], st.strategies[0]);
  const noLadder = simulateRun(st.assumptions, st.growthScenarios[0], { ...st.strategies[0], ladder: [] });
  const locked = (r: typeof run) =>
    r.summary.spans.filter((sp) => sp.kind === 'locked').reduce((n, sp) => n + sp.to - sp.from + 1, 0);
  expect(locked(noLadder)).toBe(20);
  expect(locked(run)).toBe(5); // 40–44 unavoidable — nothing seasons before 45
  expect(run.summary.spans).toContainEqual({ kind: 'funded', from: 45, to: 90 });
});

test('bridge visualizer: outside money carries the early years, seasoned conversions take over (SPEC §9-2.3)', async ({ page }) => {
  const s = exampleState('ladder-motivation-b');
  s.strategies[0] = { ...s.strategies[0], ladder: [{ fromAge: 44, toAge: 59, amount: 55_000 }] };
  s.display = { ...s.display, real: false, activeTab: 'drawdown' };
  await loadState(page, s);
  const sources = JSON.parse(
    (await page.locator('[data-bridge-sources]').getAttribute('data-bridge-sources'))!,
  ) as Array<{ age: number; outside: number; conversions: number; other: number }>;
  const first = sources.find((x) => x.age === 44)!;
  expect(first.outside).toBeGreaterThan(0);
  expect(first.conversions).toBe(0);
  // tranche from 44 unlocks at 49 (+5 tax years; owner is 44 < 60)
  const at49 = sources.find((x) => x.age === 49)!;
  expect(at49.conversions).toBeGreaterThan(0);
  await expect(page.getByTestId('bridge-summary')).toContainText(
    'seasoned conversions are carrying part of the bridge',
  );
});

test('ladder rows editor: add, edit both shapes, round-trip; fill hint in simple mode', async ({ page }) => {
  const s = exampleState('drawdown'); // simple mode
  s.display = { ...s.display, activeTab: 'drawdown' };
  await loadState(page, s);
  await page.getByText('Conversion ladder', { exact: false }).first().click(); // expand group
  await page.getByRole('button', { name: '+ conversion row' }).click();
  await commitInput(page, 'Ladder 1 amount', '25000');
  await commitInput(page, 'Ladder 1 from age', '45');
  let st = await readState(page);
  expect(st.strategies[0].ladder).toEqual([{ fromAge: 45, toAge: 59, amount: 25_000 }]);
  // switch the row to fill-to-bracket → simple-mode hint appears
  await page.getByLabel('Ladder 1 type', { exact: true }).click();
  await page.getByRole('option', { name: 'Fill to top of a bracket' }).click();
  await expect(page.getByText('fill-to-bracket needs bracket mode', { exact: false })).toBeVisible();
  st = await readState(page);
  expect(st.strategies[0].ladder?.[0].fillToBracketPct).toBe(0.12);
  expect(st.strategies[0].ladder?.[0].amount).toBeUndefined();
});
