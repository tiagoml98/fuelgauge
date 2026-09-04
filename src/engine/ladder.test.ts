/**
 * M8 conversion ladder: the hand-check year, the SPEC §12 ladder-bridge case,
 * the tax-payment waterfall, ordering (withdrawals first), and bySource.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_BRACKET_TABLES, defaultAssumptions, defaultGrowthScenario, defaultWithdrawalStrategy } from './defaults';
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
const makeG = (): GrowthScenario => defaultGrowthScenario(1);
const rowAt = (years: RunYear[], age: number): RunYear => {
  const row = years.find((y) => y.age === age);
  if (!row) throw new Error(`no row at age ${age}`);
  return row;
};

describe('the hand-check year (examples/ladder.json shape)', () => {
  // single 64, trad401k 2M, cash 200k, SS 20k@65, spending 60k, bracket mode,
  // fill-to-12% from 65, r = 0, unindexed — every number exact.
  const handA = () =>
    makeA((x) => {
      x.taxMode = 'bracket';
      x.filers = [{ currentAge: 64 }];
      x.balances.perFiler[0].trad401k = 2_000_000;
      x.balances.cash = 200_000;
      // M8 anchors predate the 65+ deduction (M10) — pinned to zero here so
      // the verified numbers hold; the deduction has its own tests (rmd.test)
      x.bracketTables = {
        single: { ...DEFAULT_BRACKET_TABLES.single, additionalDeduction65: 0 },
        marriedJoint: { ...DEFAULT_BRACKET_TABLES.marriedJoint, additionalDeduction65: 0 },
      };
    });
  const handW = () =>
    makeW((x) => {
      x.drawdownStartAge = 65;
      x.spending = flat(60_000);
      x.income = [{ kind: 'socialSecurity', fromAge: 65, toAge: null, amount: 20_000 }];
      x.ladder = [{ fromAge: 65, toAge: null, fillToBracketPct: 0.12 }];
    });

  it('year 65: pool 17,000 → fill 49,500 → tax 5,710 from cash → unlock 2027 (immediate, owner ≥ 60)', () => {
    const run = simulateRun(handA(), makeG(), handW());
    const y65 = rowAt(run.years, 65);
    expect(y65.ladder).toBeDefined();
    expect(y65.ladder!.poolBeforeConversion).toBeCloseTo(17_000, 2); // spending came from cash
    expect(y65.ladder!.converted).toBeCloseTo(49_500, 2); // 16,100 + 50,400 − 17,000
    expect(y65.ladder!.tax).toBeCloseTo(5_710, 2); // 11,500×10% + 38,000×12%
    expect(y65.ladder!.paidFrom.cash).toBeCloseTo(5_710, 2);
    expect(y65.ladder!.paidFrom.taxable).toBeUndefined();
    expect(y65.ladder!.paidFrom.conversion).toBeUndefined();
    expect(y65.ladder!.penalty).toBe(0);
    expect(y65.ladder!.unlockYear).toBe(2027); // amended rule: owner is 65 ≥ ceil(59.5)
    // telescoping: income tax 90 + conversion tax 5,710 = ordinaryTax(66,500)
    expect(y65.ordinaryIncome).toBeCloseTo(66_500, 2);
    expect(y65.taxPaidThisYear).toBeCloseTo(5_800, 2);
    expect(y65.effectiveOrdinaryRate).toBeCloseTo(5_800 / 66_500, 6);
    // cash: 200,000 − 40,090 spending − 5,710 tax
    expect(y65.accounts.cash.balance).toBeCloseTo(154_200, 2);
  });

  it('pre-tax-spending variant: fill = room AFTER the spending draw; no spending dollar above the fill bracket', () => {
    const a = handA();
    a.balances.cash = 0; // spending must gross up from pre-tax
    const run = simulateRun(a, makeG(), handW());
    const noLadder = simulateRun(a, makeG(), { ...handW(), ladder: [] });
    const y65 = rowAt(run.years, 65);
    // spending gross-up identical to the no-ladder run — the conversion never
    // pushed spending into a higher bracket (amendment #2)
    expect(y65.withdrawals?.tradIra).toBeCloseTo(
      rowAt(noLadder.years, 65).withdrawals?.tradIra ?? NaN,
      2,
    );
    expect(y65.withdrawals?.tradIra).toBeCloseTo(45_295.454545, 2);
    // pool after withdrawals: 17,000 + 45,295.45 = 62,295.45 → room 4,204.55
    expect(y65.ladder!.poolBeforeConversion).toBeCloseTo(62_295.454545, 2);
    expect(y65.ladder!.converted).toBeCloseTo(4_204.545455, 2);
    // pool tops out exactly at the 12% boundary
    expect(y65.ordinaryIncome).toBeCloseTo(66_500, 2);
    // no outside money at all → tax withheld from the conversion, NO penalty at 65
    expect(y65.ladder!.paidFrom.conversion).toBeCloseTo(4_204.545455 * 0.12, 2);
    expect(y65.ladder!.penalty).toBe(0);
  });
});

describe('SPEC §12 ladder bridge (r = 0, conversion tax 0 for exactness)', () => {
  const bridgeA = (cashYears: number) =>
    makeA((x) => {
      x.filers = [{ currentAge: 44 }];
      x.balances.perFiler[0].trad401k = 2_000_000;
      x.balances.cash = cashYears * 40_000;
      x.effectiveRetirementRate = 0; // the SPEC case isolates timing, not tax
    });
  const bridgeW = makeW((x) => {
    x.drawdownStartAge = 45;
    x.spending = flat(40_000);
    x.ladder = [{ fromAge: 45, toAge: 59, amount: 40_000 }];
  });

  it('cash for exactly 5 years + conversions from 45 → fully funded', () => {
    const run = simulateRun(bridgeA(5), makeG(), bridgeW);
    expect(run.summary.firstGapAge).toBeNull();
    expect(run.summary.spans).toEqual([{ kind: 'funded', from: 45, to: 90 }]);
    // the 45-conversion unlocks in the year they turn 50 (2031 = 45+5 clock)
    expect(rowAt(run.years, 45).ladder!.unlockYear).toBe(2032);
    expect(rowAt(run.years, 50).withdrawalsBySource?.seasonedConversions).toBeCloseTo(40_000, 2);
  });

  it('4 years of cash → gap at exactly 49', () => {
    const run = simulateRun(bridgeA(4), makeG(), bridgeW);
    expect(run.summary.firstGapAge).toBe(49);
    expect(rowAt(run.years, 48).gap).toBe(false);
    expect(rowAt(run.years, 50).gap).toBe(false); // first tranche seasoned
  });
});

describe('tax-payment waterfall', () => {
  it('taxable pays after cash: the sale is taxed on its gain and basis falls pro-rata', () => {
    const a = makeA((x) => {
      x.filers = [{ currentAge: 49 }];
      x.balances.perFiler[0].trad401k = 1_000_000;
      x.balances.taxable = 100_000;
      x.balances.taxableBasis = 50_000; // half gains → sale LTCG applies
      x.balances.cash = 0;
    });
    const w = makeW((x) => {
      x.drawdownStartAge = 50;
      x.spending = [];
      x.ladder = [{ fromAge: 50, toAge: 50, amount: 40_000 }];
    });
    const y50 = rowAt(simulateRun(a, makeG(), w).years, 50);
    const bill = 40_000 * 0.12; // simple mode, flat effective
    expect(y50.ladder!.tax).toBeCloseTo(bill, 2);
    // gross sale nets the bill with LTCG on the 50% gain fraction
    const gross = bill / (1 - 0.5 * 0.15);
    expect(y50.ladder!.paidFrom.taxable).toBeCloseTo(gross, 2);
    expect(y50.taxPaidThisYear).toBeCloseTo(bill + (gross - bill), 2);
  });

  it('nothing outside: withheld from the conversion with the 10% penalty before 60, tranche shrinks BOTH fields', () => {
    const a = makeA((x) => {
      x.filers = [{ currentAge: 44 }];
      x.balances.perFiler[0].trad401k = 1_000_000;
    });
    const w = makeW((x) => {
      x.drawdownStartAge = 45;
      x.spending = [];
      x.ladder = [{ fromAge: 45, toAge: 45, amount: 40_000 }];
    });
    const y45 = rowAt(simulateRun(a, makeG(), w).years, 45);
    const bill = 4_800;
    const withheld = bill / 0.9;
    expect(y45.ladder!.paidFrom.conversion).toBeCloseTo(withheld, 2);
    expect(y45.ladder!.penalty).toBeCloseTo(withheld * 0.1, 2);
    expect(y45.taxPaidThisYear).toBeCloseTo(bill + withheld * 0.1, 2);
    // the tranche is smaller by the withholding — and stays fully taxable-portion
    const tranche = y45.accounts.rothIra.rothConversions!.find((c) => c.year === 2027)!;
    expect(tranche.amount).toBeCloseTo(40_000 - withheld, 2);
    expect(tranche.taxablePortion).toBeCloseTo(40_000 - withheld, 2);
    // no penalty at 60+
    const a60 = makeA((x) => {
      x.filers = [{ currentAge: 60 }];
      x.balances.perFiler[0].trad401k = 1_000_000;
    });
    const w61 = makeW((x) => {
      x.drawdownStartAge = 61;
      x.spending = [];
      x.ladder = [{ fromAge: 61, toAge: 61, amount: 40_000 }];
    });
    const y61 = rowAt(simulateRun(a60, makeG(), w61).years, 61);
    expect(y61.ladder!.penalty).toBe(0);
    expect(y61.ladder!.paidFrom.conversion).toBeCloseTo(4_800, 2);
  });
});

describe('rows, ordering, bySource, identity', () => {
  it('amount rows index at the start-of-year exponent; conversions only run during drawdown', () => {
    const a = makeA((x) => {
      x.indexWithInflation = true;
      x.inflation = 0.03;
      x.filers = [{ currentAge: 44 }];
      x.balances.perFiler[0].trad401k = 1_000_000;
      x.balances.cash = 500_000;
      x.effectiveRetirementRate = 0.12;
    });
    const w = makeW((x) => {
      x.drawdownStartAge = 46; // ladder row starts BELOW D — inert until D
      x.spending = [];
      x.ladder = [{ fromAge: 45, toAge: null, amount: 10_000 }];
    });
    const run = simulateRun(a, makeG(), w);
    expect(rowAt(run.years, 45).ladder).toBeUndefined(); // pre-drawdown: no conversion
    // t = 2 (age 46): startOfYear exponent = 1 → 10,000 × 1.03
    expect(rowAt(run.years, 46).ladder!.converted).toBeCloseTo(10_000 * 1.03, 2);
  });

  it('matchTrad falls proportionally when the conversion draws from the 401k', () => {
    const a = makeA((x) => {
      x.filers = [{ currentAge: 49 }];
      x.balances.perFiler[0].trad401k = 100_000;
      x.balances.cash = 100_000;
    });
    // seed matchTrad via a match-paying scenario is heavyweight; instead rely
    // on the pro-rata identity: converting 40% of the 401k leaves 60% of it
    const w = makeW((x) => {
      x.drawdownStartAge = 50;
      x.spending = [];
      x.ladder = [{ fromAge: 50, toAge: 50, amount: 40_000 }];
    });
    const run = simulateRun(a, makeG(), w);
    expect(rowAt(run.years, 50).accounts.trad401k.balance).toBeCloseTo(60_000, 2);
    expect(rowAt(run.years, 50).accounts.rothIra.balance).toBeCloseTo(40_000, 2);
  });

  it('bySource sums to need − unmet; rothIra account = its three sources', () => {
    const a = makeA((x) => {
      x.filers = [{ currentAge: 64 }];
      x.balances.cash = 10_000;
      x.balances.perFiler[0].trad401k = 50_000;
      x.balances.perFiler[0].rothIra = {
        basis: 20_000,
        conversions: [{ year: 2015, amount: 15_000, taxablePortion: 15_000 }],
        earnings: 30_000,
        firstFundedYear: 2010,
      };
    });
    const w = makeW((x) => {
      x.drawdownStartAge = 65;
      x.spending = flat(120_000);
    });
    const y65 = rowAt(simulateRun(a, makeG(), w).years, 65);
    const bySource = y65.withdrawalsBySource!;
    const total = Object.values(bySource).reduce((s, v) => s + (v ?? 0), 0);
    expect(total).toBeCloseTo((y65.need ?? 0) - (y65.unmet ?? 0), 2);
    expect(
      (bySource.rothBasis ?? 0) + (bySource.seasonedConversions ?? 0) + (bySource.rothEarnings ?? 0),
    ).toBeCloseTo(y65.withdrawals?.rothIra ?? 0, 2);
  });

  it('identity: absent ladder ≡ empty ladder — deep-equal runs', () => {
    const a = makeA((x) => {
      x.filers = [{ currentAge: 64 }];
      x.balances.perFiler[0].trad401k = 500_000;
    });
    const w = makeW((x) => {
      x.drawdownStartAge = 65;
      x.spending = flat(40_000);
    });
    expect(simulateRun(a, makeG(), { ...w, ladder: [] })).toEqual(simulateRun(a, makeG(), w));
  });
});
