/**
 * Memoized, VALIDATED engine calls (M4.5 B.1b). Invalid inputs never reach
 * the resolver from the UI: validation runs first and yields readable errors
 * while the chart keeps the last valid result. The resolver keeps throwing —
 * the UI catches at this layer.
 */

import { useMemo, useRef } from 'react';
import { simulateAccumulation } from '../engine/accumulate';
import {
  baristaFireAgeFromAssumptions,
  coastFireAge,
  fireNumber,
  firstAgeAtValue,
} from '../engine/metrics';
import type { Assumptions, GrowthScenario, RunYear, ScheduleRow } from '../engine/types';
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
  return namedSchedules(a, g).flatMap(([name, rows]) =>
    validateRows(rows).map((e) => `${name}, row ${e.index + 1}: ${e.message}`),
  );
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
