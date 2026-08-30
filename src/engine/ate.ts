/**
 * After-tax-equivalent lens (SPEC §4): pre-tax × (1 − effective); Roth and
 * cash at face; HSA at face if medical else like pre-tax; taxable minus tax on
 * the embedded gain. Basis-aware where basis exists (trad IRA nondeductible
 * basis, taxable cost basis). Federal + state additive.
 */

import { ACCOUNT_BUCKET, ALL_ACCOUNTS } from './defaults';
import type { AccountId, Assumptions, BalanceSnapshot, Bucket, RunYear } from './types';

/** balance − (balance − basis) × rate; never taxes a negative gain. */
function afterTaxOfGain(balance: number, basis: number, rate: number): number {
  return balance - Math.max(0, balance - basis) * rate;
}

export function ateByAccount(
  accounts: Record<AccountId, BalanceSnapshot>,
  a: Assumptions,
): Record<AccountId, number> {
  const preTaxRate = a.effectiveRetirementRate + a.stateTaxRate;
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
