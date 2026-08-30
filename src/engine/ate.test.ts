import { describe, expect, it } from 'vitest';
import { ateByAccount, rollupBuckets } from './ate';
import { defaultAssumptions } from './defaults';
import type { AccountId, Assumptions, BalanceSnapshot } from './types';

function accounts(over: Partial<Record<AccountId, Partial<BalanceSnapshot>>> = {}) {
  const zero = (): BalanceSnapshot => ({ balance: 0, basis: 0 });
  const out: Record<AccountId, BalanceSnapshot> = {
    trad401k: zero(),
    tradIra: zero(),
    roth401k: zero(),
    rothIra: zero(),
    hsa: zero(),
    taxable: zero(),
    cash: zero(),
  };
  for (const [id, patch] of Object.entries(over)) {
    out[id as AccountId] = { ...out[id as AccountId], ...patch };
  }
  return out;
}

const a: Assumptions = defaultAssumptions(2026); // effective 12%, LTCG 15%, state 0, medical

describe('ateByAccount (SPEC §4)', () => {
  it('pre-tax at (1 − effective): $100k trad 401k → $88k', () => {
    expect(ateByAccount(accounts({ trad401k: { balance: 100_000 } }), a).trad401k).toBe(88_000);
  });

  it('trad IRA respects nondeductible basis (gate #11)', () => {
    const ate = ateByAccount(accounts({ tradIra: { balance: 100_000, basis: 40_000 } }), a);
    expect(ate.tradIra).toBe(100_000 - 60_000 * 0.12);
  });

  it('Roth and cash at face', () => {
    const ate = ateByAccount(
      accounts({ roth401k: { balance: 5_000 }, rothIra: { balance: 7_000 }, cash: { balance: 3_000 } }),
      a,
    );
    expect(ate.roth401k).toBe(5_000);
    expect(ate.rothIra).toBe(7_000);
    expect(ate.cash).toBe(3_000);
  });

  it('HSA at face under medical, like pre-tax under non-medical', () => {
    const acc = accounts({ hsa: { balance: 10_000 } });
    expect(ateByAccount(acc, a).hsa).toBe(10_000);
    expect(ateByAccount(acc, { ...a, hsaTreatment: 'nonMedical' }).hsa).toBe(8_800);
  });

  it('taxable minus LTCG on the embedded gain; never taxes a loss', () => {
    expect(ateByAccount(accounts({ taxable: { balance: 10_000, basis: 4_000 } }), a).taxable).toBe(9_100);
    expect(ateByAccount(accounts({ taxable: { balance: 8_000, basis: 10_000 } }), a).taxable).toBe(8_000);
  });

  it('adds the flat state rate additively (M2 decision #3)', () => {
    const withState = { ...a, stateTaxRate: 0.05 };
    expect(ateByAccount(accounts({ trad401k: { balance: 100_000 } }), withState).trad401k).toBe(
      100_000 * (1 - 0.17),
    );
  });
});

describe('rollupBuckets', () => {
  it('sums gross and ATE into the four buckets; cash lands in taxable', () => {
    const acc = accounts({
      trad401k: { balance: 100 },
      tradIra: { balance: 50 },
      taxable: { balance: 200, basis: 200 },
      cash: { balance: 25 },
    });
    const buckets = rollupBuckets(acc, ateByAccount(acc, a));
    expect(buckets.preTax.gross).toBe(150);
    expect(buckets.preTax.ate).toBeCloseTo(132, 10);
    expect(buckets.taxable.gross).toBe(225);
    expect(buckets.taxable.ate).toBe(225);
    expect(buckets.roth.gross).toBe(0);
    expect(buckets.hsa.gross).toBe(0);
  });
});
