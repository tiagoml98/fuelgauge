/**
 * Tax math. Simple mode: flat rates. Bracket mode (M7, SPEC §7): editable
 * standard deduction + brackets per filing status, indexed with inflation at
 * the START-OF-YEAR exponent (t−1 — brackets tax start-of-year flows, so they
 * must inflate in step with spending/income, NOT like end-of-year limits).
 * Flat state rate rides on top of every bracket rate; no separate state
 * deduction. Federal + state combine additively throughout (M2 gate #3).
 */

import { DEFAULT_BRACKET_TABLES } from './defaults';
import { timingExponent } from './schedule';
import type { Assumptions, BracketTable, IncomeKind } from './types';

/** SS taxable share in simple AND bracket mode (SPEC §7). */
export const SS_TAXABLE_SHARE = 0.85;

// ---------------------------------------------------------------------------
// Bracket mode (M7)
// ---------------------------------------------------------------------------

/**
 * The active filing status's table (user-edited ?? 2026 federal defaults),
 * deduction and upTo bounds indexed to year t's start-of-year price level.
 * Rates are never indexed. Bracket rows are ordered; each upTo bounds
 * TAXABLE income (after the deduction); null = top bracket.
 */
export function resolveBracketTable(a: Assumptions, yearsFromNow: number): BracketTable {
  const base = a.bracketTables?.[a.filingStatus] ?? DEFAULT_BRACKET_TABLES[a.filingStatus];
  if (!a.indexWithInflation || a.inflation === 0 || yearsFromNow <= 0) {
    return { standardDeduction: base.standardDeduction, brackets: base.brackets.map((b) => ({ ...b })) };
  }
  const factor = Math.pow(1 + a.inflation, timingExponent(yearsFromNow, 'startOfYear'));
  return {
    standardDeduction: base.standardDeduction * factor,
    brackets: base.brackets.map((b) => ({ upTo: b.upTo === null ? null : b.upTo * factor, rate: b.rate })),
  };
}

/**
 * Total tax on `oi` of ordinary income: apply the deduction, then bracket
 * slices at (bracketRate + stateRate) each.
 */
export function ordinaryTax(oi: number, table: BracketTable, stateRate: number): number {
  const taxable = Math.max(0, oi - table.standardDeduction);
  let tax = 0;
  let lower = 0;
  for (const b of table.brackets) {
    const cap = b.upTo ?? Infinity;
    const slice = Math.min(taxable, cap) - lower;
    if (slice <= 0) break;
    tax += slice * (b.rate + stateRate);
    lower = cap;
    if (taxable <= cap) break;
  }
  return tax;
}

/** Tax on `add` of ordinary income stacked on top of an existing `pool`. */
export function marginalOrdinaryTax(
  pool: number,
  add: number,
  table: BracketTable,
  stateRate: number,
): number {
  return ordinaryTax(pool + add, table, stateRate) - ordinaryTax(pool, table, stateRate);
}

/**
 * Gross ordinary-income withdrawal needed to net `net` when stacked on
 * `pool`, with only `taxableFrac` of gross taxable (pro-rata basis, gate
 * #11) and an optional flat add-on rate on the FULL gross (the pre-65 HSA
 * penalty). Piecewise-linear walk over the deduction boundary and bracket
 * bounds; per-segment net-per-gross is guarded ≥ 0.01 so a user-edited top
 * rate + state + penalty can never divide by ≤ 0.
 */
export function grossOrdinaryFromNet(
  net: number,
  pool: number,
  taxableFrac: number,
  table: BracketTable,
  stateRate: number,
  extraFlatRate = 0,
): number {
  if (net <= 0) return 0;
  if (taxableFrac <= 0) return net / Math.max(0.01, 1 - extraFlatRate);
  // OI-space boundaries: end of the zero-tax zone, then each bracket top
  const bounds = [
    table.standardDeduction,
    ...table.brackets
      .filter((b) => b.upTo !== null)
      .map((b) => table.standardDeduction + (b.upTo as number)),
  ];
  const marginalRateAt = (x: number): number => {
    if (x < table.standardDeduction) return 0;
    const taxable = x - table.standardDeduction;
    for (const b of table.brackets) {
      if (taxable < (b.upTo ?? Infinity)) return b.rate;
    }
    return table.brackets[table.brackets.length - 1]?.rate ?? 0;
  };
  let remaining = net;
  let gross = 0;
  let x = pool; // position on the ordinary-income axis
  for (let guard = 0; guard < 64 && remaining > 1e-9; guard++) {
    const fed = marginalRateAt(x);
    const netPerGross = Math.max(0.01, 1 - taxableFrac * (fed + stateRate) - extraFlatRate);
    const nextBound = bounds.find((b) => b > x + 1e-9) ?? Infinity;
    const grossCap = nextBound === Infinity ? Infinity : (nextBound - x) / taxableFrac;
    if (remaining <= grossCap * netPerGross + 1e-9 || grossCap === Infinity) {
      return gross + remaining / netPerGross;
    }
    gross += grossCap;
    remaining -= grossCap * netPerGross;
    x = nextBound;
  }
  return gross;
}

/**
 * M8 hook: ordinary-income room from `pool` to the TOP of the bracket whose
 * rate is `rate`; null when no such bracket exists or it is unbounded.
 */
export function roomToBracketTop(pool: number, rate: number, table: BracketTable): number | null {
  const b = table.brackets.find((row) => Math.abs(row.rate - rate) < 1e-9);
  if (!b || b.upTo === null) return null;
  return Math.max(0, table.standardDeduction + b.upTo - pool);
}

/** Annual taxable-account drag = dividend yield × dividend tax rate × balance. It IS the tax paid. */
export function dividendDrag(balance: number, divYield: number, divTaxRate: number): number {
  return balance * divYield * divTaxRate;
}

/**
 * Gate #8: cash interest is ordinary income, taxed annually — marginal-now
 * during accumulation, the effective retirement rate during drawdown.
 */
export function cashInterestTax(
  interest: number,
  phase: 'accumulation' | 'drawdown',
  a: Assumptions,
): number {
  const rate =
    (phase === 'accumulation' ? a.marginalRateNow : a.effectiveRetirementRate) + a.stateTaxRate;
  return interest * rate;
}

/** Effective + state, the pre-tax withdrawal rate (SPEC §1, additive per M2 #3). */
export function preTaxWithdrawalRate(a: Assumptions): number {
  return a.effectiveRetirementRate + a.stateTaxRate;
}

/** LTCG + state, the taxable-sale rate on the gain portion. */
export function taxableSaleRate(a: Assumptions): number {
  return a.ltcgRate + a.stateTaxRate;
}

/**
 * Gross withdrawal needed to net `net`, when only `taxableFraction` of the
 * gross is taxed at `rate`. Covers all three drawdown cases:
 * pre-tax (fraction 1), trad IRA with nondeductible basis (pro-rata fraction,
 * gate #11), taxable sale (gain fraction).
 */
export function grossFromNet(net: number, taxableFraction: number, rate: number): number {
  return net / (1 - taxableFraction * rate);
}

/**
 * Gate #9: simple mode taxes retirement income — part-time and pension at the
 * effective rate, Social Security at 85% × effective. Returns the tax.
 */
export function simpleIncomeTax(kind: IncomeKind, amount: number, a: Assumptions): number {
  const rate = preTaxWithdrawalRate(a);
  return kind === 'socialSecurity' ? amount * SS_TAXABLE_SHARE * rate : amount * rate;
}
