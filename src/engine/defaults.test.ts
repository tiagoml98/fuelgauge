import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_BUCKET,
  ALL_ACCOUNTS,
  DEFAULT_RETURN_SCHEDULE,
  DEFAULT_WITHDRAWAL_ORDER,
  LIMITS_2026,
  defaultAssumptions,
  defaultGrowthScenario,
  defaultWithdrawalStrategy,
} from './defaults';

describe('withdrawal order (gate #5)', () => {
  it('is exactly: cash → taxable → pre-tax → Roth basis → seasoned conversions → Roth earnings', () => {
    expect(DEFAULT_WITHDRAWAL_ORDER).toEqual([
      'cash',
      'taxable',
      'preTax',
      'rothBasis',
      'seasonedConversions',
      'rothEarnings',
    ]);
  });

  it('never includes HSA (medical default keeps it out)', () => {
    expect(DEFAULT_WITHDRAWAL_ORDER).not.toContain('hsa');
  });
});

describe('2026 limits (VARIABLES §1.5, verified 2026-08-30)', () => {
  it('matches the verified IRS values', () => {
    expect(LIMITS_2026).toEqual({
      deferral401k: 24_500,
      catchUp401k50: 8_000,
      catchUp401k60to63: 11_250,
      rothCatchUpWageThreshold: 150_000,
      ira: 7_500,
      iraCatchUp50: 1_100,
      hsaSelfOnly: 4_400,
      hsaFamily: 8_750,
      hsaCatchUp55: 1_000,
      overall415c: 72_000,
    });
  });
});

describe('account/bucket structure (SPEC §2)', () => {
  it('maps all seven accounts to the four buckets', () => {
    expect(ALL_ACCOUNTS).toHaveLength(7);
    expect(ACCOUNT_BUCKET.trad401k).toBe('preTax');
    expect(ACCOUNT_BUCKET.tradIra).toBe('preTax');
    expect(ACCOUNT_BUCKET.roth401k).toBe('roth');
    expect(ACCOUNT_BUCKET.rothIra).toBe('roth');
    expect(ACCOUNT_BUCKET.hsa).toBe('hsa');
    expect(ACCOUNT_BUCKET.taxable).toBe('taxable');
    expect(ACCOUNT_BUCKET.cash).toBe('taxable'); // cash lives in the taxable bucket
  });
});

describe('defaultAssumptions', () => {
  const a = defaultAssumptions(2026);

  it('sets the documented defaults', () => {
    expect(a.inflation).toBe(0.03);
    expect(a.indexWithInflation).toBe(true);
    expect(a.fees).toBe(0.001); // gate #15: 0.1%, not 0
    expect(a.dividendYield).toBe(0.02);
    expect(a.dividendTaxRate).toBe(0.15);
    expect(a.marginalRateNow).toBe(0.24);
    expect(a.effectiveRetirementRate).toBe(0.12);
    expect(a.ltcgRate).toBe(0.15);
    expect(a.stateTaxRate).toBe(0);
    expect(a.horizonAge).toBe(90);
    expect(a.safeWithdrawalRate).toBe(0.04);
    expect(a.coastTargetAge).toBe(65);
    expect(a.hsaTreatment).toBe('medical');
    expect(a.taxMode).toBe('simple');
  });

  it('stores one filer with age only — birth year is derived, never stored (M1 #4)', () => {
    expect(a.filers).toHaveLength(1);
    expect(a.filers[0]).toEqual({ currentAge: 30 });
    expect(a.currentYear).toBe(2026);
    expect(a.filingStatus).toBe('single');
  });

  it('default return schedule is 7% until 50, then 5%', () => {
    expect(a.returnSchedule).toEqual(DEFAULT_RETURN_SCHEDULE);
    expect(a.returnSchedule).not.toBe(DEFAULT_RETURN_SCHEDULE); // cloned, not shared
    expect(a.returnSchedule[0]).toEqual({ fromAge: 0, toAge: 50, value: 0.07 });
    expect(a.returnSchedule[1]).toEqual({ fromAge: 51, toAge: null, value: 0.05 });
  });

  it('cash carries its own 4% return override and every account is included', () => {
    expect(a.returnOverrides.cash).toEqual([{ fromAge: 0, toAge: null, value: 0.04 }]);
    for (const id of ALL_ACCOUNTS) expect(a.include[id]).toBe(true);
  });

  it('splits balances per filer vs household (M1 #1) with documented zeros', () => {
    expect(a.balances.perFiler).toHaveLength(1); // aligned with filers
    const fb = a.balances.perFiler[0];
    expect(fb.tradIraBasis).toBe(0); // M1 #3: Form 8606 basis input
    expect(fb.roth401kBasis).toBe(0); // gate #3: unentered = earnings
    expect(fb.rothIra.firstFundedYear).toBeNull();
    expect(a.balances.taxableBasis).toBe(a.balances.taxable); // household
  });
});

describe('defaultGrowthScenario', () => {
  it('creates per-filer inputs with documented splits, auto deductible, and per-filer match (M1 #5)', () => {
    const g = defaultGrowthScenario(2);
    expect(g.perFiler).toHaveLength(2);
    for (const f of g.perFiler) {
      expect(f.split401kRothPct).toBe(0); // all traditional
      expect(f.splitIraRothPct).toBe(1); // all Roth
      expect(f.tradIraDeductible).toBeUndefined(); // gate #11: auto
      expect(f.backdoor).toBe(false);
      expect(f.match.mode).toBe('percent');
      expect(f.match.destination).toBe('trad401k');
      expect(f.match.vestingPct).toBe(1); // vesting lives in the match now
    }
    expect(g.perFiler[0]).not.toBe(g.perFiler[1]); // independent objects
    expect(g.perFiler[0].match).not.toBe(g.perFiler[1].match);
    expect(g.windfalls).toEqual([]);
  });
});

describe('defaultWithdrawalStrategy', () => {
  it('leaves drawdown start undefined (auto, gate #15) and copies the default order', () => {
    const w = defaultWithdrawalStrategy(defaultAssumptions(2026));
    expect(w.drawdownStartAge).toBeUndefined();
    expect(w.order).toEqual(DEFAULT_WITHDRAWAL_ORDER);
    expect(w.order).not.toBe(DEFAULT_WITHDRAWAL_ORDER); // mutation-safe copy
  });

  it('seeds spending from the FIRE spending target only when it is set (gate #13)', () => {
    const a = defaultAssumptions(2026);
    expect(defaultWithdrawalStrategy(a).spending).toEqual([]);

    const withTarget = { ...a, fireSpendingTarget: 60_000 };
    expect(defaultWithdrawalStrategy(withTarget).spending).toEqual([
      { fromAge: 0, toAge: null, value: 60_000 },
    ]);
  });
});
