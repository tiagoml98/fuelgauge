/**
 * Memoized, VALIDATED engine calls (M4.5 B.1b). Invalid inputs never reach
 * the resolver from the UI: validation runs first and yields readable errors
 * while the chart keeps the last valid result. The resolver keeps throwing —
 * the UI catches at this layer.
 */

import { useMemo, useRef } from 'react';
import { simulateAccumulation } from '../engine/accumulate';
import {
  analyzeBridge,
  baristaFireAge,
  baristaFireAgeFromAssumptions,
  coastFireAge,
  fireNumber,
  firstAgeAtValue,
  fullFireAge,
} from '../engine/metrics';
import { simulateRun } from '../engine/run';
import { toReal } from '../engine/schedule';
import type {
  Assumptions,
  BridgeReport,
  GrowthScenario,
  RunResult,
  RunYear,
  ScheduleRow,
  WithdrawalStrategy,
} from '../engine/types';
import { validateRows } from './scheduleOps';

function namedSchedules(a: Assumptions, g: GrowthScenario): Array<[string, ScheduleRow[]]> {
  return [
    ['Return schedule', a.returnSchedule],
    ...Object.entries(a.returnOverrides).map(
      ([id, rows]): [string, ScheduleRow[]] => [`${id} return override`, rows ?? []],
    ),
    ...g.perFiler.flatMap((pf, f): Array<[string, ScheduleRow[]]> => [
      [`Salary (filer ${f + 1})`, pf.salary],
      [`401k contributions (filer ${f + 1})`, pf.contrib401k],
      [`IRA contributions (filer ${f + 1})`, pf.contribIra],
    ]),
    ['HSA contributions', g.hsaContrib],
    ['Taxable contributions', g.taxableContrib],
    ['Cash contributions', g.cashContrib],
    ...(g.returnScheduleOverride ? [['Scenario return override', g.returnScheduleOverride] as [string, ScheduleRow[]]] : []),
  ];
}

export function collectScheduleErrors(a: Assumptions, g: GrowthScenario): string[] {
  const errors = namedSchedules(a, g).flatMap(([name, rows]) =>
    validateRows(rows).map((e) => `${name}, row ${e.index + 1}: ${e.message}`),
  );
  if (a.filers[0].currentAge >= a.horizonAge) {
    errors.push(
      `your age (${a.filers[0].currentAge}) is at or past the planning horizon (${a.horizonAge}) — raise the horizon under Advanced`,
    );
  }
  return errors;
}

export interface SafeSimResult {
  years: RunYear[] | null;
  errors: string[];
}

/** Pure and never throws: validation errors instead of resolver throws. */
export function safeSimulate(a: Assumptions, g: GrowthScenario): SafeSimResult {
  const errors = collectScheduleErrors(a, g);
  if (errors.length > 0) return { years: null, errors };
  try {
    return { years: simulateAccumulation(a, g), errors: [] };
  } catch (err) {
    return { years: null, errors: [err instanceof Error ? err.message : String(err)] };
  }
}

/** Simulation + last-good fallback: the chart never blanks on a partial edit. */
export function useGrowthYears(
  a: Assumptions,
  g: GrowthScenario,
): { years: RunYear[]; errors: string[] } {
  const result = useMemo(() => safeSimulate(a, g), [a, g]);
  const lastGood = useRef<RunYear[]>([]);
  if (result.years) lastGood.current = result.years;
  return { years: result.years ?? lastGood.current, errors: result.errors };
}

export interface GrowthMetrics {
  fireNumber: number | null;
  coastAge: number | null;
  baristaAge: number | null;
  millionAge: number | null;
}

function strategyScheduleErrors(w: WithdrawalStrategy): string[] {
  const named: Array<[string, ScheduleRow[]]> = [
    ['Spending', w.spending],
    ...w.income.map(
      (r, i): [string, ScheduleRow[]] => [
        `Income row ${i + 1}`,
        [{ fromAge: r.fromAge, toAge: r.toAge, value: r.amount }],
      ],
    ),
  ];
  return named.flatMap(([name, rows]) =>
    validateRows(rows).map((e) => `${name}${rows.length > 1 ? `, row ${e.index + 1}` : ''}: ${e.message}`),
  );
}

export interface SafeRunResult {
  run: RunResult | null;
  errors: string[];
}

/** Run-path twin of safeSimulate (M4.5 B.1b): validation first, never throws. */
export function safeSimulateRun(
  a: Assumptions,
  g: GrowthScenario,
  w: WithdrawalStrategy,
): SafeRunResult {
  const errors = [...collectScheduleErrors(a, g), ...strategyScheduleErrors(w)];
  if (errors.length > 0) return { run: null, errors };
  try {
    return { run: simulateRun(a, g, w), errors: [] };
  } catch (err) {
    return { run: null, errors: [err instanceof Error ? err.message : String(err)] };
  }
}

/** Run + last-good fallback: the Drawdown tab never blanks on a partial edit. */
export function useRun(
  a: Assumptions,
  g: GrowthScenario,
  w: WithdrawalStrategy,
): { run: RunResult | null; errors: string[] } {
  const result = useMemo(() => safeSimulateRun(a, g, w), [a, g, w]);
  const lastGood = useRef<RunResult | null>(null);
  if (result.run) lastGood.current = result.run;
  return { run: result.run ?? lastGood.current, errors: result.errors };
}

export function useBridge(
  run: RunResult | null,
  a: Assumptions,
  w: WithdrawalStrategy,
): BridgeReport | null {
  return useMemo(() => (run ? analyzeBridge(run, a, w) : null), [run, a, w]);
}

export interface DrawdownMetrics {
  fullAge: number | null;
  baristaAge: number | null;
  millionAge: number | null;
  /** real ATE at drawdown start ÷ FIRE number − 1; null without a target. */
  marginOverTarget: number | null;
}

export function useDrawdownMetrics(run: RunResult | null, a: Assumptions, w: WithdrawalStrategy): DrawdownMetrics {
  return useMemo(() => {
    if (!run) return { fullAge: null, baristaAge: null, millionAge: null, marginOverTarget: null };
    const spendReal = a.fireSpendingTarget > 0 ? a.fireSpendingTarget : null;
    const startRow = run.years.find((y) => y.age === run.drawdownStartAge - 1) ?? run.years[0];
    const startAge = run.years[0].age;
    const margin =
      spendReal !== null
        ? toReal(startRow.totalAte, startRow.age - startAge, a.inflation) /
            fireNumber(spendReal, a.safeWithdrawalRate) -
          1
        : null;
    return {
      fullAge: spendReal !== null ? fullFireAge(run.years, a, spendReal) : null,
      baristaAge:
        spendReal !== null ? baristaFireAge(run.years, a, spendReal, w, run.drawdownStartAge) : null,
      millionAge: firstAgeAtValue(run.years, 1_000_000, a.inflation),
      marginOverTarget: margin,
    };
  }, [run, a, w]);
}

export function useGrowthMetrics(
  a: Assumptions,
  g: GrowthScenario,
  years: RunYear[],
): GrowthMetrics {
  // coastFireAge runs ~O(ages) simulations — memoized on [a, g]; guarded so a
  // mid-edit state can never throw through the metrics path
  const coastAge = useMemo(() => {
    try {
      return coastFireAge(a, g);
    } catch {
      return null;
    }
  }, [a, g]);
  return useMemo(
    () => ({
      fireNumber:
        a.fireSpendingTarget > 0 ? fireNumber(a.fireSpendingTarget, a.safeWithdrawalRate) : null,
      coastAge,
      baristaAge: years.length > 0 ? baristaFireAgeFromAssumptions(years, a) : null,
      millionAge: years.length > 0 ? firstAgeAtValue(years, 1_000_000, a.inflation) : null,
    }),
    [a, years, coastAge],
  );
}
