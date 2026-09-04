/**
 * After-tax-equivalent lens (SPEC §4): pre-tax × (1 − effective); Roth and
 * cash at face; HSA at face if medical else like pre-tax; taxable minus tax on
 * the embedded gain. Basis-aware where basis exists (trad IRA nondeductible
 * basis, taxable cost basis). Federal + state additive.
 */

import { ACCOUNT_BUCKET, ALL_ACCOUNTS } from './defaults';
import { ordinaryTax, resolveBracketTable } from './tax';
import type { AccountId, Assumptions, BalanceSnapshot, Bucket, RunYear } from './types';

/** balance − (balance − basis) × rate; never taxes a negative gain. */
function afterTaxOfGain(balance: number, basis: number, rate: number): number {
  return balance - Math.max(0, balance - basis) * rate;
}

/**
 * M7: the pre-tax valuation rate outside a run (Growth tab, no strategy).
 * Bracket mode prices liquidating the FIRE spending target through today's
 * table from a zero pool; falls back to the flat effective rate when no
 * target exists so pre-tax never shows at face value. Simple mode: flat
 * effective + state, as always.
 */
export function growthAteRate(a: Assumptions): number {
  if (a.taxMode !== 'bracket' || a.fireSpendingTarget <= 0) {
    return a.effectiveRetirementRate + a.stateTaxRate;
  }
  const table = resolveBracketTable(a, 0, a.filers.filter((fl) => fl.currentAge >= 65).length);
  return ordinaryTax(a.fireSpendingTarget, table, a.stateTaxRate) / a.fireSpendingTarget;
}

export function ateByAccount(
  accounts: Record<AccountId, BalanceSnapshot>,
  a: Assumptions,
  /** M7 bracket mode: the run's valuation rate for pre-tax balances. */
  preTaxRateOverride?: number,
): Record<AccountId, number> {
  const preTaxRate = preTaxRateOverride ?? growthAteRate(a);
  const gainRate = a.ltcgRate + a.stateTaxRate;
  return {
    trad401k: afterTaxOfGain(accounts.trad401k.balance, accounts.trad401k.basis, preTaxRate),
    tradIra: afterTaxOfGain(accounts.tradIra.balance, accounts.tradIra.basis, preTaxRate),
    roth401k: accounts.roth401k.balance,
    rothIra: accounts.rothIra.balance,
    hsa:
      a.hsaTreatment === 'medical'
        ? accounts.hsa.balance
        : accounts.hsa.balance * (1 - preTaxRate),
    taxable: afterTaxOfGain(accounts.taxable.balance, accounts.taxable.basis, gainRate),
    cash: accounts.cash.balance,
  };
}

export function rollupBuckets(
  accounts: Record<AccountId, BalanceSnapshot>,
  ate: Record<AccountId, number>,
): RunYear['buckets'] {
  const buckets: RunYear['buckets'] = {
    preTax: { gross: 0, ate: 0 },
    roth: { gross: 0, ate: 0 },
    hsa: { gross: 0, ate: 0 },
    taxable: { gross: 0, ate: 0 },
  };
  for (const id of ALL_ACCOUNTS) {
    const bucket: Bucket = ACCOUNT_BUCKET[id];
    buckets[bucket].gross += accounts[id].balance;
    buckets[bucket].ate += ate[id];
  }
  return buckets;
}
