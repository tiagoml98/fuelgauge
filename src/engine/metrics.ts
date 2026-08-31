/**
 * Milestones, bridge analysis, and derived metrics (M3). All target
 * comparisons happen in real terms via toReal (SPEC §4, gate #14).
 */

import { simulateAccumulation } from './accumulate';
import { latestAccessAgeF1, simulateRun } from './run';
import { resolveSchedule, toReal } from './schedule';
import type {
  Assumptions,
  BridgeReport,
  GrowthScenario,
  RunResult,
  RunYear,
  WithdrawalStrategy,
} from './types';

/** SPEC §1: FIRE number = annual spend ÷ SWR, both real. */
export function fireNumber(annualSpendReal: number, swr: number): number {
  return swr > 0 ? annualSpendReal / swr : Infinity;
}

/**
 * First age at which the REAL GROSS total reaches the target ($1M age —
 * M3 decision #7); null if never.
 */
export function firstAgeAtValue(years: RunYear[], targetReal: number, inflation: number): number | null {
  const startAge = years[0]?.age ?? 0;
  for (const y of years) {
    if (toReal(y.total, y.age - startAge, inflation) >= targetReal) return y.age;
  }
  return null;
}

/** First age at which the REAL ATE total reaches fireNumber(spendReal) — Full FIRE. */
export function fullFireAge(years: RunYear[], a: Assumptions, spendReal: number): number | null {
  const target = fireNumber(spendReal, a.safeWithdrawalRate);
  const startAge = years[0]?.age ?? 0;
  for (const y of years) {
    if (toReal(y.totalAte, y.age - startAge, a.inflation) >= target) return y.age;
  }
  return null;
}

/**
 * Barista FIRE (M3 decision #8, proposed definition): Full FIRE against
 * spending net of the strategy's part-time income at drawdown start.
 */
export function baristaFireAge(
  years: RunYear[],
  a: Assumptions,
  spendReal: number,
  w: WithdrawalStrategy,
  drawdownStartAge: number,
): number | null {
  const partTime = w.income
    .filter(
      (r) =>
        r.kind === 'partTime' &&
        r.fromAge <= drawdownStartAge &&
        (r.toAge === null || r.toAge >= drawdownStartAge),
    )
    .reduce((sum, r) => sum + r.amount, 0);
  return fullFireAge(years, a, Math.max(0, spendReal - partTime));
}

/**
 * Coast FIRE age (gate #13): the earliest age c at which stopping all
 * contributions still reaches fireNumber(fireSpendingTarget) in REAL ATE by
 * coastTargetAge. null when the target is unset or never reachable.
 */
export function coastFireAge(a: Assumptions, g: GrowthScenario): number | null {
  if (a.fireSpendingTarget <= 0) return null;
  const target = fireNumber(a.fireSpendingTarget, a.safeWithdrawalRate);
  const startAge = a.filers[0].currentAge;
  const checkAge = Math.min(a.coastTargetAge, a.horizonAge);
  for (let c = startAge; c <= checkAge; c++) {
    const years = simulateAccumulation(a, g, c);
    const row = years.find((y) => y.age === checkAge);
    if (row && toReal(row.totalAte, row.age - startAge, a.inflation) >= target) return c;
  }
  return null;
}

/**
 * Bridge (SPEC §3 Drawdown): one bar per year from drawdown start to the
 * latest access age; per year, that year's need vs what got funded; green
 * covered, red gap. spendAtStart/spendAtAccess are the inflated (nominal)
 * spending levels at the two ends.
 */
export function analyzeBridge(run: RunResult, a: Assumptions, w: WithdrawalStrategy): BridgeReport {
  const f1 = a.filers[0].currentAge;
  const latestAccess = latestAccessAgeF1(run, a);

  const years = run.years
    .filter((y) => y.age >= run.drawdownStartAge && y.age <= latestAccess && y.need !== undefined)
    .map((y) => ({
      age: y.age,
      need: y.need ?? 0,
      funded: (y.need ?? 0) - (y.unmet ?? 0),
      gap: y.unmet ?? 0,
    }));
  const totalCost = years.reduce((s, y) => s + y.need, 0);
  const totalFunding = years.reduce((s, y) => s + y.funded, 0);

  const spendingArr = resolveSchedule(w.spending, {
    startAge: f1,
    endAge: a.horizonAge,
    indexed: a.indexWithInflation,
    inflation: a.inflation,
  });
  return {
    years,
    totalCost,
    totalFunding,
    funded: years.every((y) => y.gap <= 0.005),
    spendAtStart: spendingArr[run.drawdownStartAge - f1] ?? 0,
    spendAtAccess: spendingArr[latestAccess - f1] ?? 0,
  };
}

/**
 * Earliest drawdown start age with no gap years (SPEC §3 Compare). A search —
 * up to ~60 simulateRun calls; call it lazily and memoize at the UI layer
 * (gate #E1), never eagerly per cell.
 */
export function earliestNoGapStartAge(
  a: Assumptions,
  g: GrowthScenario,
  w: WithdrawalStrategy,
): number | null {
  const startAge = a.filers[0].currentAge;
  for (let d = startAge + 1; d <= a.horizonAge; d++) {
    const run = simulateRun(a, g, { ...w, drawdownStartAge: d });
    if (run.years.every((y) => !y.gap)) return d;
  }
  return null;
}
