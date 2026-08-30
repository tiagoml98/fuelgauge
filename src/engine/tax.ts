/**
 * Tax math, simple mode (M2 slice: annual drags). Gross-up and sale tax land
 * in M3; bracket mode replaces the flat rates in M7. Federal + state combine
 * additively throughout (M2 gate decision #3).
 */

import type { Assumptions } from './types';

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
