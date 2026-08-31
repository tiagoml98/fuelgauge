/**
 * M5.5 item 1: every multi-year total follows the display lens. In today's-$
 * mode, per-year values are deflated FIRST (start-of-year exponent for flows,
 * end-of-year for balances/taxes) and then summed — never a sum of dollars
 * from different years. Nominal sums only in nominal mode.
 */

import { timingExponent, toReal } from '../../engine/schedule';
import type { Assumptions, BridgeReport, RunResult } from '../../engine/types';

export interface LensedBridge extends BridgeReport {
  lensLabel: string;
}

export function lensBridge(bridge: BridgeReport, run: RunResult, a: Assumptions, real: boolean): LensedBridge {
  if (!real) return { ...bridge, lensLabel: 'nominal' };
  const startAge = run.years[0]?.age ?? 0;
  const deflate = (v: number, age: number) =>
    toReal(v, timingExponent(age - startAge, 'startOfYear'), a.inflation);
  const years = bridge.years.map((y) => ({
    age: y.age,
    need: deflate(y.need, y.age),
    funded: deflate(y.funded, y.age),
    gap: deflate(y.gap, y.age),
  }));
  const latestAge = bridge.years[bridge.years.length - 1]?.age ?? startAge;
  return {
    years,
    totalCost: years.reduce((s, y) => s + y.need, 0),
    totalFunding: years.reduce((s, y) => s + y.funded, 0),
    funded: bridge.funded,
    spendAtStart: deflate(bridge.spendAtStart, run.drawdownStartAge),
    spendAtAccess: deflate(bridge.spendAtAccess, latestAge),
    lensLabel: "today's $",
  };
}

export interface RunTiles {
  lifetimeAfterTaxSpending: number;
  terminalAte: number;
  cumulativeTax: number;
  /** null = gaps from the very start; 'horizon' = never gaps. */
  fundedThrough: number | 'horizon' | null;
  lensLabel: string;
}

export function runTiles(run: RunResult, a: Assumptions, real: boolean): RunTiles {
  const startAge = run.years[0]?.age ?? 0;
  const s = run.summary;
  const fundedThrough =
    s.firstGapAge === null
      ? ('horizon' as const)
      : s.firstGapAge <= run.drawdownStartAge
        ? null
        : s.firstGapAge - 1;
  if (!real) {
    return {
      lifetimeAfterTaxSpending: s.lifetimeAfterTaxSpending,
      terminalAte: s.terminalAte,
      cumulativeTax: s.cumulativeTax,
      fundedThrough,
      lensLabel: 'nominal',
    };
  }
  let lifetime = 0;
  let tax = 0;
  for (const y of run.years) {
    if (y.grossNeed !== undefined) {
      lifetime += toReal(
        y.grossNeed - (y.unmet ?? 0),
        timingExponent(y.age - startAge, 'startOfYear'),
        a.inflation,
      );
    }
    tax += toReal(y.taxPaidThisYear, y.age - startAge, a.inflation);
  }
  return {
    lifetimeAfterTaxSpending: lifetime,
    terminalAte: toReal(s.terminalAte, (run.years[run.years.length - 1]?.age ?? startAge) - startAge, a.inflation),
    cumulativeTax: tax,
    fundedThrough,
    lensLabel: "today's $",
  };
}
