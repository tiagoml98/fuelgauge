/**
 * Compare-tab presets (SPEC §3/§8, ARCHITECTURE §3, M6). Every output is a
 * fresh scenario/strategy with NORMALIZED, non-overlapping rows (M4.5 C.1 —
 * scheduleOps, never override rows). Ids are assigned by the caller (UI).
 * The ladder-bridge preset is deliberately absent until M8 (Phase 2) — the
 * UI notes it rather than faking it.
 */

import { rmdStartAge } from './access';
import { resolveSchedule } from './schedule';
import { rowsFromValues, reduceTo, sliceFrom, stopAt } from './scheduleOps';
import type { Assumptions, GrowthScenario, ScheduleRow, WithdrawalStrategy } from './types';

/** SPEC §8 drivers: what the UI must say is driving the traditional-vs-Roth result. */
export interface EqualTakeHomeDrivers {
  /** min(limit, ·) clipped at least one year on either path. */
  limitBinds: boolean;
  /** Spill flowed to taxable while drag > 0 — the only other source of a breakeven. */
  dragActive: boolean;
  /** (1 − t_ret) ÷ (1 − t_now): with flat rates and non-binding limits this IS the result. */
  rateRatio: number;
}

export interface EqualTakeHomePair {
  traditional: GrowthScenario;
  roth: GrowthScenario;
  drivers: EqualTakeHomeDrivers;
}

/**
 * SPEC §8, fixed take-home cost C per year (derived per age from filer 1's
 * current 401k schedule): Path A = min(limit, C ÷ (1 − t_now)) pre-tax,
 * remainder to taxable; Path B = min(limit, C) Roth, remainder to taxable.
 * Match identical (copied). Spill MERGES with existing taxable contributions
 * by per-age summing, then re-encodes to normalized rows.
 */
export function equalTakeHomePair(g: GrowthScenario, a: Assumptions): EqualTakeHomePair {
  const tNow = a.marginalRateNow + a.stateTaxRate;
  const tRet = a.effectiveRetirementRate + a.stateTaxRate;
  const startAge = a.filers[0].currentAge;
  const endAge = a.horizonAge;
  const opts = { startAge, endAge, indexed: false, inflation: 0 };
  const current = resolveSchedule(g.perFiler[0].contrib401k, opts);
  const taxableExisting = resolveSchedule(g.taxableContrib, opts);
  const limit = a.limits.deferral401k;

  const tradValues: number[] = [];
  const rothValues: number[] = [];
  const tradSpill: number[] = [];
  const rothSpill: number[] = [];
  let limitBinds = false;
  let anySpill = false;
  current.forEach((v, i) => {
    const C = v * (1 - tNow); // the take-home cost of today's pre-tax contribution
    const tradWanted = C / (1 - tNow);
    const trad = Math.min(limit, tradWanted);
    const roth = Math.min(limit, C);
    if (trad < tradWanted - 1e-9 || roth < C - 1e-9) limitBinds = true;
    // remainder of the take-home budget flows to taxable at face
    const spillA = C - trad * (1 - tNow);
    const spillB = C - roth;
    if (spillA > 1e-9 || spillB > 1e-9) anySpill = true;
    tradValues[i] = trad;
    rothValues[i] = roth;
    tradSpill[i] = taxableExisting[i] + spillA;
    rothSpill[i] = taxableExisting[i] + spillB;
  });

  const build = (name: string, contrib: number[], rothPct: number, taxable: number[]): GrowthScenario => ({
    ...structuredClone(g),
    id: g.id, // caller replaces
    name,
    perFiler: g.perFiler.map((pf, f) =>
      f === 0
        ? {
            ...structuredClone(pf),
            contrib401k: rowsFromValues(contrib, startAge),
            split401kRothPct: rothPct,
          }
        : structuredClone(pf),
    ),
    taxableContrib: rowsFromValues(taxable, startAge),
  });

  return {
    traditional: build('Traditional 401k (equal take-home)', tradValues, 0, tradSpill),
    roth: build('Roth 401k (equal take-home)', rothValues, 1, rothSpill),
    drivers: {
      limitBinds,
      dragActive: anySpill && a.dividendYield * a.dividendTaxRate > 0,
      rateRatio: (1 - tRet) / (1 - tNow),
    },
  };
}

const CONTRIB_KEYS = ['hsaContrib', 'taxableContrib', 'cashContrib'] as const;

/** "Stop contributing at X" — every contribution schedule, all filers, clipped. */
export function stopContributingAt(g: GrowthScenario, age: number): GrowthScenario {
  const out = structuredClone(g);
  out.name = `${g.name} — stop at ${age}`;
  out.perFiler = out.perFiler.map((pf) => ({
    ...pf,
    contrib401k: stopAt(pf.contrib401k, age),
    contribIra: stopAt(pf.contribIra, age),
  }));
  for (const key of CONTRIB_KEYS) out[key] = stopAt(out[key], age);
  return out;
}

/** "Reduce to $Y at Z" — filer 1's 401k schedule (scope stated in the preset description). */
export function reduceContributionTo(g: GrowthScenario, amount: number, fromAge: number): GrowthScenario {
  const out = structuredClone(g);
  out.name = `${g.name} — reduce 401k to $${amount.toLocaleString('en-US')} at ${fromAge}`;
  out.perFiler[0].contrib401k = reduceTo(out.perFiler[0].contrib401k, amount, fromAge);
  return out;
}

/** "Retire at X" — same strategy, explicit start. */
export function retireAt(w: WithdrawalStrategy, age: number): WithdrawalStrategy {
  return { ...structuredClone(w), name: `Retire at ${age}`, drawdownStartAge: age };
}

export const STRESS_RETURNS = [-0.2, -0.1, 0];

/** "Stress: −20%/−10%/0% in the first three drawdown years", then the base schedule resumes. */
export function stressFirstDrawdownYears(
  g: GrowthScenario,
  a: Assumptions,
  drawdownStartAge: number,
): GrowthScenario {
  const base: ScheduleRow[] = g.returnScheduleOverride ?? a.returnSchedule;
  const out = structuredClone(g);
  out.name = `${g.name} — stress first 3 drawdown years`;
  out.returnScheduleOverride = [
    ...stopAt(base, drawdownStartAge),
    ...STRESS_RETURNS.map((value, i) => ({
      fromAge: drawdownStartAge + i,
      toAge: drawdownStartAge + i,
      value,
    })),
    ...sliceFrom(base, drawdownStartAge + STRESS_RETURNS.length),
  ];
  return out;
}

/**
 * M8 (SPEC §9-2.4): "convert $X/yr from Y vs don't". Two strategy clones —
 * the pure outside-money bridge and the same strategy with ladder rows
 * converting $X/yr (today's $) from age Y through 59 (past 59 access is no
 * longer the motive; the RMD-motivated variant arrives in M10).
 */
/**
 * M10 (SPEC §10.3): "Convert before RMDs vs don't". Two strategy clones —
 * no ladder, vs fill-to-top-of-N% rows from the RESOLVED drawdown start
 * through the year before filer 1's RMDs begin (the bridge years are the
 * cheapest conversion years — low pool, no forced income yet). The caller
 * resolves the drawdown start (it needs the scenario) and passes it in.
 * Returns the window so the note can state it; empty window (start ≥ RMD
 * age) yields identical paths and the caller says so instead of faking it.
 */
export function convertBeforeRmdsPair(
  w: WithdrawalStrategy,
  a: Assumptions,
  resolvedStart: number,
  fillPct = 0.12,
): {
  none: WithdrawalStrategy;
  convert: WithdrawalStrategy;
  window: { fromAge: number; toAge: number } | null;
  rmdAge: number;
} {
  const rmdAge = rmdStartAge(a.currentYear - a.filers[0].currentAge);
  const window =
    resolvedStart <= rmdAge - 1 ? { fromAge: resolvedStart, toAge: rmdAge - 1 } : null;
  const none: WithdrawalStrategy = {
    ...structuredClone(w),
    name: "Don't convert (RMDs as they come)",
    ladder: [],
  };
  const convert: WithdrawalStrategy = {
    ...structuredClone(w),
    name: `Convert to top of ${Math.round(fillPct * 1000) / 10}% before RMDs`,
    ladder: window === null ? [] : [{ fromAge: window.fromAge, toAge: window.toAge, fillToBracketPct: fillPct }],
  };
  return { none, convert, window, rmdAge };
}

export function ladderBridgePair(
  w: WithdrawalStrategy,
  amount: number,
  fromAge: number,
): { outside: WithdrawalStrategy; ladder: WithdrawalStrategy } {
  const outside: WithdrawalStrategy = {
    ...structuredClone(w),
    name: 'Outside-money bridge (no ladder)',
    ladder: [],
  };
  const ladder: WithdrawalStrategy = {
    ...structuredClone(w),
    name: `Ladder: convert $${amount.toLocaleString('en-US')}/yr from ${fromAge}`,
    // through 59 for bridge ladders; open-ended when started at 60+ (the
    // access motive is gone there — bracket smoothing, formalized in M10)
    ladder: [{ fromAge, toAge: fromAge > 59 ? null : 59, amount }],
  };
  return { outside, ladder };
}
