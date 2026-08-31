/**
 * Memoized engine calls. The engine is pure, so memo keys are just the input
 * object identities — any reducer change produces new objects.
 */

import { useMemo } from 'react';
import { simulateAccumulation } from '../engine/accumulate';
import {
  baristaFireAgeFromAssumptions,
  coastFireAge,
  fireNumber,
  firstAgeAtValue,
} from '../engine/metrics';
import type { Assumptions, GrowthScenario, RunYear } from '../engine/types';

export function useGrowthYears(a: Assumptions, g: GrowthScenario): RunYear[] {
  return useMemo(() => simulateAccumulation(a, g), [a, g]);
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
  // coastFireAge runs ~O(ages) simulations — memoized on [a, g] identity (gate #E1 spirit)
  const coastAge = useMemo(() => coastFireAge(a, g), [a, g]);
  return useMemo(
    () => ({
      fireNumber:
        a.fireSpendingTarget > 0 ? fireNumber(a.fireSpendingTarget, a.safeWithdrawalRate) : null,
      coastAge,
      baristaAge: baristaFireAgeFromAssumptions(years, a),
      millionAge: firstAgeAtValue(years, 1_000_000, a.inflation),
    }),
    [a, years, coastAge],
  );
}
