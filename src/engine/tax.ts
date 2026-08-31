/**
 * Tax math, simple mode. Bracket mode replaces the flat rates in M7.
 * Federal + state combine additively throughout (M2 gate decision #3).
 */

import type { Assumptions, IncomeKind } from './types';

/** SS taxable share in simple AND bracket mode (SPEC §7). */
const SS_TAXABLE_SHARE = 0.85;

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
