/**
 * M10 RMDs (SPEC §10.3): the golden year to the cent, surplus-to-taxable,
 * the counting rule (forced draw counts toward need — never a double
 * withdrawal), the conversion interaction, stops-at-zero, no Roth RMDs,
 * per-filer start ages, and the 65+ additional deduction (bracket mode only).
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRACKET_TABLES,
  defaultAssumptions,
  defaultFilerBalances,
  defaultGrowthScenario,
  defaultWithdrawalStrategy,
} from './defaults';
import { uniformLifetimeDivisor } from './rmd';
import { simulateRun } from './run';
import type { Assumptions, GrowthScenario, RunYear, ScheduleRow, WithdrawalStrategy } from './types';

const flat = (value: number, fromAge = 0): ScheduleRow[] => [{ fromAge, toAge: null, value }];

function makeA(mut?: (a: Assumptions) => void): Assumptions {
  const a = defaultAssumptions(2026);
  a.indexWithInflation = false;
  a.fees = 0;
  a.returnSchedule = flat(0);
  a.returnOverrides = { cash: flat(0) };
  a.dividendYield = 0;
  a.horizonAge = 90;
  mut?.(a);
  return a;
}
const makeW = (mut?: (w: WithdrawalStrategy) => void): WithdrawalStrategy => {
  const w = defaultWithdrawalStrategy(defaultAssumptions(2026));
  mut?.(w);
  return w;
};
const makeG = (n = 1): GrowthScenario => defaultGrowthScenario(n);
const rowAt = (years: RunYear[], age: number): RunYear => {
  const row = years.find((y) => y.age === age);
  if (!row) throw new Error(`no row at age ${age}`);
  return row;
};

describe('uniformLifetimeDivisor', () => {
  it('starts at 72, matches the anchors, clamps past 120', () => {
    expect(uniformLifetimeDivisor(71)).toBeNull();
    expect(uniformLifetimeDivisor(72)).toBe(27.4);
    expect(uniformLifetimeDivisor(73)).toBe(26.5);
    expect(uniformLifetimeDivisor(75)).toBe(24.6);
    expect(uniformLifetimeDivisor(90)).toBe(12.2);
    expect(uniformLifetimeDivisor(120)).toBe(2.0);
    expect(uniformLifetimeDivisor(130)).toBe(2.0); // ages past the table keep the final divisor
  });
});

describe('the golden RMD year (examples/rmd.json shape)', () => {
  // Single filer 65 (born 1961 → RMD start 75), trad401k 1,000,000, cash
  // 270,000 funding ages 66–74 exactly (9 × 30,000, r = 0), bracket mode,
  // unindexed. Age 75: prior pre-tax is exactly 1,000,000.
  const handA = () =>
    makeA((x) => {
      x.taxMode = 'bracket';
      x.filers = [{ currentAge: 65 }];
      x.balances.perFiler[0].trad401k = 1_000_000;
      x.balances.cash = 270_000;
    });
  const handW = (mut?: (w: WithdrawalStrategy) => void) =>
    makeW((x) => {
      x.drawdownStartAge = 66;
      x.spending = flat(30_000);
      mut?.(x);
    });

  it('to the cent: 1,000,000 ÷ 24.6 = 40,650.41 gross; tax 2,452.05 via the pool; net 38,198.36', () => {
    const run = simulateRun(handA(), makeG(), handW());
    // no RMD before 75 (born 1961) — 73 and 74 have divisors but no start age
    expect(rowAt(run.years, 73).rmd).toBeUndefined();
    expect(rowAt(run.years, 74).rmd).toBeUndefined();
    const y75 = rowAt(run.years, 75);
    expect(y75.rmd).toBeDefined();
    expect(y75.rmd!.entries).toHaveLength(1);
    const e = y75.rmd!.entries[0];
    expect(e.filer).toBe(0);
    expect(e.priorPreTax).toBeCloseTo(1_000_000, 2);
    expect(e.divisor).toBe(24.6);
    expect(e.gross).toBeCloseTo(40_650.41, 2);
    // deduction 16,100 + 2,050 (65+) = 18,150 → taxable 22,500.41
    // → 12,400 × 10% + 10,100.41 × 12% = 1,240 + 1,212.05 = 2,452.05
    expect(e.tax).toBeCloseTo(2_452.05, 2);
    expect(y75.rmd!.net).toBeCloseTo(38_198.36, 2);
    expect(y75.taxPaidThisYear).toBeCloseTo(2_452.05, 2);
    // gross lands in withdrawals (the 401k rolled to the IRA at drawdown)
    expect(y75.withdrawals?.tradIra).toBeCloseTo(40_650.41, 2);
    expect(y75.events.some((ev) => ev.kind === 'rmdStart')).toBe(true);
  });

  it('RMD > need: applied 30,000, surplus 8,198.36 → invested taxable with basis; NOT lifetime spending', () => {
    const run = simulateRun(handA(), makeG(), handW());
    const y75 = rowAt(run.years, 75);
    expect(y75.rmd!.appliedToNeed).toBeCloseTo(30_000, 2);
    expect(y75.rmd!.toTaxable).toBeCloseTo(8_198.36, 2);
    // taxable was zero through 74; the surplus arrives with basis = itself
    expect(rowAt(run.years, 74).accounts.taxable.balance).toBeCloseTo(0, 2);
    expect(y75.accounts.taxable.balance).toBeCloseTo(8_198.36, 2);
    expect(y75.accounts.taxable.basis).toBeCloseTo(8_198.36, 2);
    // lifetime spending = 25 funded years × 30,000 exactly — the surplus
    // never inflates it (it re-enters need only when later years draw it)
    expect(run.summary.lifetimeAfterTaxSpending).toBeCloseTo(750_000, 2);
    for (const y of run.years) expect(y.unmet ?? 0).toBeCloseTo(0, 2);
  });

  it('counting rule (RMD < need): total pre-tax gross = one gross-up of the full need, not RMD + need', () => {
    // same shape at 60,000 spending (cash 540,000 funds 66–74)
    const a = handA();
    a.balances.cash = 540_000;
    const run = simulateRun(a, makeG(), handW((x) => (x.spending = flat(60_000))));
    const y75 = rowAt(run.years, 75);
    // RMD first: net 38,198.36 applied; the order tops up the remaining
    // 21,801.64 net at 12% marginal → 24,774.59 gross. Total pre-tax gross
    // 65,425.00 — exactly what a single 60,000 gross-up from a zero pool
    // costs, so the forced draw was counted toward need, never added to it.
    expect(y75.rmd!.appliedToNeed).toBeCloseTo(38_198.36, 2);
    expect(y75.rmd!.toTaxable).toBeCloseTo(0, 2);
    expect(y75.withdrawals?.tradIra).toBeCloseTo(65_425.0, 2);
    expect(y75.withdrawalsBySource?.preTax).toBeCloseTo(60_000, 2);
    expect(y75.taxPaidThisYear).toBeCloseTo(5_425.0, 2);
    expect(y75.unmet ?? 0).toBeCloseTo(0, 2);
  });

  it('conversion interaction: RMD stacks the pool first; a conversion shrinks the NEXT year’s RMD', () => {
    const w = handW((x) => (x.ladder = [{ fromAge: 75, toAge: null, fillToBracketPct: 0.12 }]));
    const run = simulateRun(handA(), makeG(), w);
    const bare = simulateRun(handA(), makeG(), handW());
    const y75 = rowAt(run.years, 75);
    // pool already carries the RMD gross when the ladder fills
    expect(y75.ladder!.poolBeforeConversion).toBeCloseTo(40_650.41, 2);
    // room to the top of 12%: (18,150 + 50,400) − 40,650.41 = 27,899.59
    expect(y75.ladder!.converted).toBeCloseTo(27_899.59, 2);
    // the conversion did NOT satisfy the RMD — the forced gross is unchanged
    expect(y75.rmd!.entries[0].gross).toBeCloseTo(40_650.41, 2);
    // year 76: prior pre-tax lost the conversion too → a smaller RMD
    const y76 = rowAt(run.years, 76);
    expect(y76.rmd!.entries[0].priorPreTax).toBeCloseTo(1_000_000 - 40_650.41 - 27_899.59, 2);
    expect(y76.rmd!.entries[0].divisor).toBe(23.7);
    expect(y76.rmd!.entries[0].gross).toBeCloseTo(931_450.0 / 23.7, 2);
    expect(y76.rmd!.entries[0].gross).toBeLessThan(rowAt(bare.years, 76).rmd!.entries[0].gross);
  });

  it('stops at zero: once pre-tax is depleted there are no RMD rows and no negative balances', () => {
    const a = handA();
    a.balances.cash = 0;
    a.balances.perFiler[0].trad401k = 200_000;
    const run = simulateRun(a, makeG(), handW((x) => (x.spending = flat(40_000))));
    for (const y of run.years) {
      expect(y.accounts.trad401k.balance).toBeGreaterThanOrEqual(0);
      expect(y.accounts.tradIra.balance).toBeGreaterThanOrEqual(0);
      if (y.age >= 75) expect(y.rmd).toBeUndefined(); // drained years before
    }
    expect(rowAt(run.years, 80).gap).toBe(true); // honest depletion, no resurrection
  });
});

describe('scope: which accounts and which filers', () => {
  it('no RMDs on Roth: a Roth-only 80-year-old is never forced to withdraw', () => {
    const a = makeA((x) => {
      x.taxMode = 'bracket';
      x.filers = [{ currentAge: 70 }];
      x.balances.perFiler[0].rothIra = {
        basis: 500_000,
        conversions: [],
        earnings: 0,
        firstFundedYear: 2000,
      };
    });
    const run = simulateRun(a, makeG(), makeW((x) => {
      x.drawdownStartAge = 71;
      x.spending = flat(20_000);
    }));
    for (const y of run.years) {
      expect(y.rmd).toBeUndefined();
      expect(y.events.some((ev) => ev.kind === 'rmdStart')).toBe(false);
    }
  });

  it('per-filer start ages: born 1955 starts at 73, born 1965 at 75 — separate entries in the same run', () => {
    const a = makeA((x) => {
      x.taxMode = 'bracket';
      x.filingStatus = 'marriedJoint';
      x.filers = [{ currentAge: 71 }, { currentAge: 61 }]; // born 1955 / 1965
      x.balances.perFiler = [defaultFilerBalances(), defaultFilerBalances()];
      x.balances.perFiler[0].trad401k = 500_000;
      x.balances.perFiler[1].trad401k = 500_000;
      x.balances.cash = 600_000;
      x.horizonAge = 92;
    });
    const run = simulateRun(a, makeG(2), makeW((x) => {
      x.drawdownStartAge = 72;
      x.spending = flat(20_000);
    }));
    // filer 1 at 72: divisor exists (27.4) but the start age is 73 — no RMD
    expect(rowAt(run.years, 72).rmd).toBeUndefined();
    const y73 = rowAt(run.years, 73);
    expect(y73.rmd!.entries).toHaveLength(1);
    expect(y73.rmd!.entries[0].filer).toBe(0);
    expect(y73.rmd!.entries[0].divisor).toBe(26.5);
    expect(y73.rmd!.entries[0].gross).toBeCloseTo(500_000 / 26.5, 2);
    // filer 2 turns 75 when filer 1 is 85 — both entries present, untouched
    // balance still exactly 500,000 (cash + filer-1 RMDs carried the need)
    const y85 = rowAt(run.years, 85);
    expect(y85.rmd!.entries).toHaveLength(2);
    const f2 = y85.rmd!.entries.find((e) => e.filer === 1)!;
    expect(f2.priorPreTax).toBeCloseTo(500_000, 2);
    expect(f2.divisor).toBe(24.6);
    expect(f2.gross).toBeCloseTo(500_000 / 24.6, 2);
    expect(run.years.flatMap((y) => y.events).filter((ev) => ev.kind === 'rmdStart')).toHaveLength(2);
  });

  it('identity: horizon below the RMD start age ⇒ no rmd rows, no markers, no forced draws', () => {
    const a = makeA((x) => {
      x.taxMode = 'bracket';
      x.filers = [{ currentAge: 65 }];
      x.balances.perFiler[0].trad401k = 1_000_000;
      x.balances.cash = 270_000;
      x.horizonAge = 74; // born 1961 → RMDs would start at 75
    });
    const run = simulateRun(a, makeG(), makeW((x) => {
      x.drawdownStartAge = 66;
      x.spending = flat(30_000);
    }));
    for (const y of run.years) {
      expect(y.rmd).toBeUndefined();
      expect(y.events.some((ev) => ev.kind === 'rmdStart')).toBe(false);
      expect((y.withdrawals?.tradIra ?? 0) + (y.withdrawals?.trad401k ?? 0)).toBeCloseTo(0, 2);
    }
  });
});

describe('the 65+ additional deduction (bracket mode only)', () => {
  const singleA = () =>
    makeA((x) => {
      x.taxMode = 'bracket';
      x.filers = [{ currentAge: 63 }];
      x.balances.perFiler[0].trad401k = 1_000_000;
    });
  const spendW = () =>
    makeW((x) => {
      x.drawdownStartAge = 64;
      x.spending = flat(40_000);
    });

  it('64 vs 65 on identical 40,000 net draws: tax drops 2,977.27 → 2,697.73 (Δ = 2,050 × 12% ÷ 88%)', () => {
    const run = simulateRun(singleA(), makeG(), spendW());
    const y64 = rowAt(run.years, 64);
    const y65 = rowAt(run.years, 65);
    // deduction 16,100: gross 42,977.27, tax 1,240 + 12% above 28,500
    expect(y64.taxPaidThisYear).toBeCloseTo(2_977.27, 2);
    expect(y64.withdrawals?.tradIra).toBeCloseTo(42_977.27, 2);
    // deduction 18,150: gross 42,697.73 — the fixed-NET delta is
    // 2,050 × 0.12 / 0.88 = 279.55 on both gross and tax
    expect(y65.taxPaidThisYear).toBeCloseTo(2_697.73, 2);
    expect(y65.withdrawals?.tradIra).toBeCloseTo(42_697.73, 2);
    expect(y64.taxPaidThisYear! - y65.taxPaidThisYear!).toBeCloseTo((2_050 * 0.12) / 0.88, 2);
  });

  it('MFJ: both spouses 65+ add 2 × 1,650 — deduction 35,500 nets 40,000 from 40,500 gross (tax 500)', () => {
    const a = makeA((x) => {
      x.taxMode = 'bracket';
      x.filingStatus = 'marriedJoint';
      x.filers = [{ currentAge: 65 }, { currentAge: 65 }];
      x.balances.perFiler = [defaultFilerBalances(), defaultFilerBalances()];
      x.balances.perFiler[0].trad401k = 1_000_000;
    });
    const run = simulateRun(a, makeG(2), makeW((x) => {
      x.drawdownStartAge = 66;
      x.spending = flat(40_000);
    }));
    const y66 = rowAt(run.years, 66);
    expect(y66.taxPaidThisYear).toBeCloseTo(500.0, 2);
    expect(y66.withdrawals?.tradIra).toBeCloseTo(40_500.0, 2);
  });

  it('MFJ: one spouse 65+ adds a single 1,650 (deduction 33,850 → tax 683.33)', () => {
    const a = makeA((x) => {
      x.taxMode = 'bracket';
      x.filingStatus = 'marriedJoint';
      x.filers = [{ currentAge: 65 }, { currentAge: 59 }];
      x.balances.perFiler = [defaultFilerBalances(), defaultFilerBalances()];
      x.balances.perFiler[0].trad401k = 1_000_000;
    });
    const run = simulateRun(a, makeG(2), makeW((x) => {
      x.drawdownStartAge = 66;
      x.spending = flat(40_000);
    }));
    expect(rowAt(run.years, 66).taxPaidThisYear).toBeCloseTo(683.33, 2);
  });

  it('the M8 ladder hand-check with the deduction ON: fill grows by exactly 2,050 (49,500 → 51,550)', () => {
    // the same fixture ladder.test.ts pins to zero — here the default table
    // applies, the fill-to-12% room grows by the deduction, tax = 1,150 free
    // + 12,400 × 10% + 38,000 × 12% = 5,800
    const a = makeA((x) => {
      x.taxMode = 'bracket';
      x.filers = [{ currentAge: 64 }];
      x.balances.perFiler[0].trad401k = 2_000_000;
      x.balances.cash = 200_000;
    });
    const w = makeW((x) => {
      x.drawdownStartAge = 65;
      x.spending = flat(60_000);
      x.income = [{ kind: 'socialSecurity', fromAge: 65, toAge: null, amount: 20_000 }];
      x.ladder = [{ fromAge: 65, toAge: null, fillToBracketPct: 0.12 }];
    });
    const y65 = rowAt(simulateRun(a, makeG(), w).years, 65);
    expect(y65.ladder!.converted).toBeCloseTo(51_550, 2);
    expect(y65.ladder!.tax).toBeCloseTo(5_800, 2);
  });

  it('simple mode is unaffected: the flat rate never changes across the 65 boundary', () => {
    const a = singleA();
    a.taxMode = 'simple';
    const run = simulateRun(a, makeG(), spendW());
    expect(rowAt(run.years, 64).taxPaidThisYear).toBeCloseTo(rowAt(run.years, 65).taxPaidThisYear!, 6);
  });

  it('an explicit additionalDeduction65 override wins over the default', () => {
    const a = singleA();
    a.bracketTables = {
      single: { ...DEFAULT_BRACKET_TABLES.single, additionalDeduction65: 0 },
      marriedJoint: { ...DEFAULT_BRACKET_TABLES.marriedJoint, additionalDeduction65: 0 },
    };
    const run = simulateRun(a, makeG(), spendW());
    // zeroed: 65 taxes exactly like 64
    expect(rowAt(run.years, 65).taxPaidThisYear).toBeCloseTo(2_977.27, 2);
  });
});
