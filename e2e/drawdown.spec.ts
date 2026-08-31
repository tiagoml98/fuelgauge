/** M5: Drawdown tab — bridge, markers at N−0.5, strategy editor, engine equality. */

import { simulateRun } from '../src/engine/run';
import { timingExponent, toReal } from '../src/engine/schedule';
import type { PersistedState } from '../src/engine/types';
import { commitInput, exampleState, expect, loadState, readState, test } from './fixtures';

function drawdownState(strategyId: 'locked' | 'swr-flat'): PersistedState {
  const s = exampleState('drawdown');
  s.display = {
    ...s.display,
    activeTab: 'drawdown',
    selectedStrategyId: strategyId,
    theme: 'light',
    yearlyTable: false,
  };
  return s;
}

const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 });

test('locked case: red gap years in the bridge, gap rows in the table, rollover at 60', async ({ page }) => {
  await loadState(page, drawdownState('locked'));
  // Bridge: the gate's red-gap-years deliverable, in readable form
  await expect(page.getByTestId('bridge-summary')).toContainText('15 gap years ✗');
  await expect(page.getByTestId('bridge-summary')).toContainText('$62,319 of $806,275 funded');
  // Gap rows are flagged in the balance table (yearly off — gap rows still forced in)
  await expect(page.locator('[data-gap-age="45"]')).toContainText('GAP');
  await expect(page.locator('[data-gap-age="59"]')).toContainText('GAP');
  await expect(page.locator('[data-gap-age="60"]')).toHaveCount(0); // first funded year
  // Readout + milestones
  await expect(page.getByTestId('readout')).toContainText('locked until 60');
  await expect(page.getByText('first gap at 45 ✗')).toBeVisible();
  // Rollover appears in the chart's crosshair readout at 60
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  const plotLeft = box.x + 64;
  const plotRight = box.x + box.width - 24;
  const x = plotLeft + ((60 - 44) / (90 - 44)) * (plotRight - plotLeft);
  await page.mouse.move(x, box.y + box.height / 2);
  await page.mouse.move(x, box.y + box.height / 2 - 4);
  await expect(page.getByText('Traditional 401k → Traditional IRA', { exact: false }).first()).toBeVisible();
});

test('drawdown-start and access-age markers render at N − 0.5 (gate requirement)', async ({ page }) => {
  await loadState(page, drawdownState('locked'));
  const markers = JSON.parse(
    (await page.locator('[data-markers]').first().getAttribute('data-markers'))!,
  ) as Array<{ x: number; kind: string }>;
  expect(markers).toContainEqual({ x: 44.5, kind: 'drawdownStart' }); // D = 45
  expect(markers.some((m) => m.x === 59.5 && (m.kind === 'accessAge' || m.kind === 'rollover'))).toBe(true); // opens/rolls at 60
});

test('swr-flat case: bridge funded, no gaps, real spend constant at three ages', async ({ page }) => {
  const state = drawdownState('swr-flat');
  await loadState(page, state);
  await expect(page.getByTestId('bridge-summary')).toContainText('fully funded ✓');
  await expect(page.locator('[data-gap-age]')).toHaveCount(0);

  // engine equality through the run path: need column real = 40,000 at three ages
  const a = state.assumptions;
  const run = simulateRun(a, state.growthScenarios[0], state.strategies[1]);
  await page.getByRole('button', { name: 'yearly' }).click();
  for (const age of [45, 60, 90]) {
    const y = run.years.find((yy) => yy.age === age)!;
    const realNeed = toReal(y.need!, timingExponent(age - 44, 'startOfYear'), a.inflation);
    expect(Math.round(realNeed)).toBe(40_000);
    await expect(page.locator(`tr[data-age="${age}"]`)).toContainText(fmt(realNeed));
  }
});

test('strategy editor: start age auto↔explicit, spending, one-time, income rows', async ({ page }) => {
  await loadState(page, drawdownState('locked'));
  // explicit → auto: clearing shows the resolved auto value as placeholder
  const start = page.getByLabel('Drawdown start age', { exact: true });
  await start.click();
  await start.fill('');
  await start.blur();
  let s = await readState(page);
  expect(s.strategies[0].drawdownStartAge).toBeUndefined();
  await expect(start).toHaveAttribute('placeholder', 'auto: 65'); // no salary → coast age
  await commitInput(page, 'Drawdown start age', '45');
  s = await readState(page);
  expect(s.strategies[0].drawdownStartAge).toBe(45);

  // one-time expense: add, edit, verify it hits the run (need rises at that age)
  await page.getByRole('button', { name: '+ one-time expense' }).click();
  await commitInput(page, 'Expense 1 age', '50');
  await commitInput(page, 'Expense 1 amount', '30000');
  s = await readState(page);
  expect(s.strategies[0].oneTimeExpenses).toEqual([{ age: 50, amount: 30_000, label: 'expense' }]);
  await page.getByRole('button', { name: 'delete expense 1' }).click();
  expect((await readState(page)).strategies[0].oneTimeExpenses).toEqual([]);

  // income row incl. SS default (group starts collapsed when empty)
  await page.getByText('Retirement income', { exact: false }).click();
  await page.getByRole('button', { name: '+ income row' }).click();
  await commitInput(page, 'Income 1 amount', '24000');
  s = await readState(page);
  expect(s.strategies[0].income[0]).toEqual({
    kind: 'socialSecurity',
    fromAge: 67,
    toAge: null,
    amount: 24_000,
    label: 'Social Security',
  });
});

test('withdrawal order: reorder via buttons and drag changes the first-draw account', async ({ page }) => {
  const state = drawdownState('swr-flat'); // order: rothBasis, seasonedConversions, rothEarnings
  await loadState(page, state);
  const items = page.getByTestId('order-list').locator('li');
  await expect(items.first()).toContainText('Roth basis');
  await page.getByRole('button', { name: 'move rothBasis down' }).click();
  await expect(items.first()).toContainText('Seasoned conversions');
  let s = await readState(page);
  expect(s.strategies[1].order.slice(0, 2)).toEqual(['seasonedConversions', 'rothBasis']);
  // drag it back to the top
  await items.nth(1).dragTo(items.first());
  await expect(items.first()).toContainText('Roth basis');
  s = await readState(page);
  expect(s.strategies[1].order[0]).toBe('rothBasis');
});

test('strategy menu + tab switching persist; no-spending empty state', async ({ page }) => {
  await loadState(page, drawdownState('locked'));
  await page.getByRole('button', { name: 'duplicate strategy' }).click();
  let s = await readState(page);
  expect(s.strategies).toHaveLength(3);
  expect(s.strategies[2].name).toContain('(copy)');
  await page.getByRole('button', { name: 'delete strategy' }).click();
  expect((await readState(page)).strategies).toHaveLength(2);

  // tab switch persists through reload
  await page.getByRole('button', { name: 'Growth' }).click();
  await expect(page.getByText('growth only — no withdrawals').first()).toBeVisible();
  expect((await readState(page)).display.activeTab).toBe('growth');
  await page.reload();
  await expect(page.getByText('growth only — no withdrawals').first()).toBeVisible();
  await page.getByRole('button', { name: 'Drawdown' }).click();
  await expect(page.getByTestId('bridge-summary')).toBeVisible();

  // no-spending: strip the strategy's spending → the C.5 empty state
  const empty = drawdownState('locked');
  empty.strategies[0].spending = [];
  await loadState(page, empty);
  await expect(page.getByText('no spending entered')).toBeVisible();
  await expect(page.getByTestId('bridge-summary')).toHaveCount(0);
});

test('rate-arbitrage panel shows both rates and the verdict', async ({ page }) => {
  await loadState(page, drawdownState('locked'));
  const panel = page.getByTestId('rate-arbitrage');
  await expect(panel).toContainText('24%');
  await expect(panel).toContainText('12%');
  await expect(panel).toContainText('traditional wins');
  await expect(panel).toContainText('Phase 2 ladder');
});
