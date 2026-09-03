/**
 * M9 mega-backdoor (SPEC §10.2): editor with live room hint, over-room
 * warning, max rows, the disabled state, and the hand-check run
 * (examples/mega.json — room 44,500/yr, tranches accessible from day one).
 */

import { simulateRun } from '../src/engine/run';
import { commitInput, exampleState, expect, loadState, readState, test } from './fixtures';

test('editor: live room hint, over-room warning, max row → state (M9)', async ({ page }) => {
  const s = exampleState('mega');
  s.display = { ...s.display, activeTab: 'growth', inputsTier: 'advanced' };
  await loadState(page, s);
  await page.getByText('Contribution detail', { exact: false }).first().click();
  // live room hint from the engine's own helpers
  await expect(page.getByTestId('mega-editor-0')).toContainText('415(c) room this year: $44,500');
  // the 60,000 fixed row exceeds the room → inline warning, spec wording
  await expect(page.getByText('exceeds 415(c) room $44,500 — capped')).toBeVisible();
  // lower it under the room → warning clears
  await commitInput(page, 'Filer 1 mega 1 amount', '30000');
  await expect(page.getByText('exceeds 415(c) room', { exact: false })).toHaveCount(0);
  // add a max row — it tracks the room each year, no snapshot
  await page.getByRole('button', { name: '+ max row' }).click();
  const st = await readState(page);
  expect(st.growthScenarios[0].perFiler[0].megaBackdoor).toEqual([
    { fromAge: 31, toAge: null, amount: 30_000 },
    { fromAge: 31, toAge: null, max: true },
  ]);
});

test('disabled with the reason when the plan toggles do not permit it (M9)', async ({ page }) => {
  const s = exampleState('mega');
  s.assumptions.afterTaxContributions = false;
  s.display = { ...s.display, activeTab: 'growth', inputsTier: 'advanced' };
  await loadState(page, s);
  await page.getByText('Contribution detail', { exact: false }).first().click();
  await expect(page.getByTestId('mega-editor-0')).toContainText("plan toggles don't permit it");
  await expect(page.getByLabel('Filer 1 mega 1 amount', { exact: true })).toHaveCount(0);
});

test('hand-check run: tranches accessible from day one fund a 45 retirement (M9)', async ({ page }) => {
  const s = exampleState('mega');
  await loadState(page, s);
  // taxablePortion-0 tranches are accessible at ANY age → no locked years at all
  const run = simulateRun(s.assumptions, s.growthScenarios[0], s.strategies[0]);
  expect(run.summary.spans.every((sp) => sp.kind !== 'locked')).toBe(true);
  // 14 years of 44,500 tranches = 623,000, minus the year-45 draw of 40,000:
  // exactly 583,000 accessible (the 401k side is locked, but nothing needs it)
  expect(run.years.find((y) => y.age === 45)!.accessible).toBeCloseTo(583_000, 0);
  await expect(page.getByTestId('funding-spans')).toContainText('funded');
  // year-31 balance table row shows the 44,500 tranche in the Roth IRA column
  await page.getByRole('tab', { name: 'nominal' }).click();
  await expect(page.locator('tr[data-age="31"]')).toContainText('44,500');
  // mega-backdoor start marker (contribution-change regime event at N − 0.5)
  const markers = JSON.parse(
    (await page.locator('[data-markers]').first().getAttribute('data-markers'))!,
  ) as Array<{ x: number; kind: string }>;
  expect(markers.some((m) => m.x === 30.5 && m.kind === 'contributionChange')).toBe(true);
});
