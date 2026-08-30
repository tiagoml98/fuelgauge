/**
 * Contribution limits: indexing, per-filer caps, catch-up bands, splits,
 * forced Roth catch-up (gate #10), match formula (gate #7), 415(c).
 * Couples are handled by calling the per-filer functions per filer — limits
 * sum naturally (SPEC §12).
 */

import {
  CATCH_UP_AGE,
  HSA_CATCH_UP_AGE,
  HSA_CONTRIBUTION_STOP_AGE,
  SUPER_CATCH_UP_FROM,
  SUPER_CATCH_UP_TO,
} from './defaults';
import type { EmployerMatch, HsaCoverage, LimitSet } from './types';

/** Index every limit by (1+inflation)^years — a schedule pinned at the limit stays at the limit. */
export function resolveLimits(
  base: LimitSet,
  yearsFromNow: number,
  indexed: boolean,
  inflation: number,
): LimitSet {
  if (!indexed || inflation === 0 || yearsFromNow === 0) return { ...base };
  const factor = Math.pow(1 + inflation, yearsFromNow);
  const out = { ...base };
  for (const key of Object.keys(out) as Array<keyof LimitSet>) {
    out[key] = base[key] * factor;
  }
  return out;
}

/** 60–63 replaces the 50+ amount (not stacked); back to the 50+ amount at 64. */
export function catchUp401kFor(age: number, limits: LimitSet): number {
  if (age >= SUPER_CATCH_UP_FROM && age <= SUPER_CATCH_UP_TO) return limits.catchUp401k60to63;
  if (age >= CATCH_UP_AGE) return limits.catchUp401k50;
  return 0;
}

export interface Capped401k {
  trad: number;
  roth: number;
  /** Portion of the total that used the catch-up allowance. */
  catchUpUsed: number;
  /** Gate #10: salary above the (indexed) threshold forced the catch-up to Roth. */
  forcedRothCatchUp: boolean;
}

/**
 * One shared deferral limit across the traditional/Roth split (SPEC §12).
 * The split applies to the whole capped amount, except a forced-Roth catch-up.
 */
export function capFiler401k(
  requested: number,
  age: number,
  salary: number,
  splitRothPct: number,
  limits: LimitSet,
): Capped401k {
  const catchUpCap = catchUp401kFor(age, limits);
  const total = Math.min(requested, limits.deferral401k + catchUpCap);
  const catchUpUsed = Math.max(0, total - limits.deferral401k);
  const base = total - catchUpUsed;
  const forcedRothCatchUp = catchUpUsed > 0 && salary > limits.rothCatchUpWageThreshold;
  let roth = base * splitRothPct;
  let trad = base * (1 - splitRothPct);
  if (forcedRothCatchUp) {
    roth += catchUpUsed;
  } else {
    roth += catchUpUsed * splitRothPct;
    trad += catchUpUsed * (1 - splitRothPct);
  }
  return { trad, roth, catchUpUsed, forcedRothCatchUp };
}

/** One shared IRA limit across the traditional/Roth split. */
export function capFilerIra(requested: number, age: number, limits: LimitSet): number {
  const cap = limits.ira + (age >= CATCH_UP_AGE ? limits.iraCatchUp50 : 0);
  return Math.min(requested, cap);
}

/**
 * Household HSA: coverage limit + $1k per 55–64 filer (ASSUMPTIONS M18 — real
 * catch-ups need separate HSAs). Zero once every filer is 65+ (auto-stop).
 */
export function capHouseholdHsa(
  requested: number,
  filerAges: number[],
  coverage: HsaCoverage,
  limits: LimitSet,
): number {
  if (!filerAges.some((age) => age < HSA_CONTRIBUTION_STOP_AGE)) return 0;
  const base = coverage === 'family' ? limits.hsaFamily : limits.hsaSelfOnly;
  const catchUps =
    filerAges.filter((age) => age >= HSA_CATCH_UP_AGE && age < HSA_CONTRIBUTION_STOP_AGE).length *
    limits.hsaCatchUp55;
  return Math.min(requested, base + catchUps);
}

/**
 * Gate #7. Percent mode: rate × min(total deferral incl. Roth, cap × salary) —
 * zero when the deferral is zero. Flat mode: unconditional (profit-sharing
 * stand-in, ASSUMPTIONS M17); pass the already-indexed flat amount.
 */
export function matchAmount(
  match: EmployerMatch,
  deferralTotal: number,
  salary: number,
  indexedFlatAmount: number,
): number {
  if (match.mode === 'flat') return indexedFlatAmount;
  return match.rate * Math.min(deferralTotal, match.capPctOfSalary * salary);
}

/**
 * 415(c): base deferral (ex-catch-up) + match + after-tax ≤ overall limit;
 * age-based catch-ups sit outside it. Returns the allowed match.
 */
export function clamp415c(
  baseDeferral: number,
  match: number,
  afterTax: number,
  limits: LimitSet,
): number {
  return Math.min(match, Math.max(0, limits.overall415c - baseDeferral - afterTax));
}
