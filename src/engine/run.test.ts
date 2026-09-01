import { describe, expect, it } from 'vitest';
import { defaultAssumptions, defaultGrowthScenario, defaultWithdrawalStrategy } from './defaults';
import { resolveDrawdownStart, simulateRun } from './run';
import { toReal } from './schedule';
import type { Assumptions, GrowthScenario, RunYear, ScheduleRow, WithdrawalStrategy } from './types';

const flat = (value: number, fromAge = 0): ScheduleRow[] => [{ fromAge, toAge: null, value }];

function makeA(mut?: (a: Assumptions) => void): Assumptions {
  const a = defaultAssumptions(2026);
  a.indexWithInflation = false;
  a.fees = 0;
  a.returnSchedule = flat(0);
  a.returnOverrides = { cash: flat(0) };
  a.horizonAge = 90;
  mut?.(a);
  return a;
}

function makeW(mut?: (w: WithdrawalStrategy) => void): WithdrawalStrategy {
  const w = defaultWithdrawalStrategy(defaultAssumptions(2026));
  mut?.(w);
  return w;
}

const makeG = (mut?: (g: GrowthScenario) => void, filerCount = 1): GrowthScenario => {
  const g = defaultGrowthScenario(filerCount);
  mut?.(g);
  return g;
};

const rowAt = (years: RunYear[], age: number): RunYear => {
  const row = years.find((y) => y.age === age);
  if (!row) throw new Error(`no row at age ${age}`);
  return row;
};

describe('locked money (SPEC §12)', () => {
  const a = makeA((x) => {
    x.filers = [{ currentAge: 44 }];
    x.balances.perFiler[0].trad401k = 800_000;
  });
  const w = makeW((x) => {
    x.drawdownStartAge = 45;
    x.spending = flat(40_000);
  });
  const run = simulateRun(a, makeG(), w);

  it('drawdown at 45, all pre-tax, no cash/taxable → gap at 45 through 59', () => {
    for (let age = 45; age <= 59; age++) {
      expect(rowAt(run.years, age).gap).toBe(true);
      expect(rowAt(run.years, age).unmet).toBeCloseTo(40_000, 6);
    }
    expect(run.summary.firstGapAge).toBe(45);
  });

  it('pre-tax opens in the year they turn 60 (having rolled to the IRA there)', () => {
    const y60 = rowAt(run.years, 60);
    expect(y60.gap).toBe(false);
    expect(y60.withdrawals?.tradIra).toBeCloseTo(40_000 / 0.88, 6);
    expect(y60.events.some((e) => e.kind === 'rollover')).toBe(true);
  });

  it('everything is locked before 60, accessible after', () => {
    expect(rowAt(run.years, 45).accessible).toBeCloseTo(0, 6);
    expect(rowAt(run.years, 45).locked).toBeCloseTo(rowAt(run.years, 45).totalAte, 6);
    expect(rowAt(run.years, 60).locked).toBeCloseTo(0, 6);
  });

  it('summary: bridge unfunded, years retired = horizon − start, spending capped by the pot', () => {
    expect(run.summary.bridgeFunded).toBe(false);
    expect(run.summary.yearsRetired).toBe(45);
    // r = 0: the $800k pot nets exactly 800k × 0.88 of lifetime spending, then gaps resume
    expect(run.summary.lifetimeAfterTaxSpending).toBeCloseTo(800_000 * 0.88, 2);
  });

  it('gap kinds + spans (M6.1 #2): locked while the pot exists, depleted once it is gone', () => {
    // pre-60 gaps: the 800k trad 401k dwarfs the 40k unmet need → locked
    for (let age = 45; age <= 59; age++) expect(rowAt(run.years, age).gapKind).toBe('locked');
    // 704k net funds 60–76 (17 full years); the pot dies mid-77 → depleted
    expect(rowAt(run.years, 77).gapKind).toBe('depleted');
    expect(run.summary.spans).toEqual([
      { kind: 'locked', from: 45, to: 59 },
      { kind: 'funded', from: 60, to: 76 },
      { kind: 'depleted', from: 77, to: 90 },
    ]);
  });
});

describe('funded → locked → funded (M6.1 #2): lifetime spending counts BOTH sides', () => {
  // 80k cash covers 45–46, then everything left is the locked 401k until 60
  const a = makeA((x) => {
    x.filers = [{ currentAge: 44 }];
    x.balances.perFiler[0].trad401k = 800_000;
    x.balances.cash = 80_000;
  });
  const w = makeW((x) => {
    x.drawdownStartAge = 45;
    x.spending = flat(40_000);
  });
  const run = simulateRun(a, makeG(), w);

  it('spans: funded 45–46 · locked 47–59 · funded 60–76 · depleted 77+', () => {
    expect(run.summary.spans).toEqual([
      { kind: 'funded', from: 45, to: 46 },
      { kind: 'locked', from: 47, to: 59 },
      { kind: 'funded', from: 60, to: 76 },
      { kind: 'depleted', from: 77, to: 90 },
    ]);
  });

  it('lifetime spending = cash years + post-access years, not just up to the first gap', () => {
    // 80,000 (both cash years, pre-lock) + 800,000 × 0.88 (after access) — to the cent
    expect(run.summary.lifetimeAfterTaxSpending).toBeCloseTo(80_000 + 800_000 * 0.88, 2);
  });
});

describe('rule of 55 (SPEC §12)', () => {
  const a = makeA((x) => {
    x.filers = [{ currentAge: 50 }];
    x.balances.perFiler[0].trad401k = 500_000;
    x.balances.perFiler[0].tradIra = 200_000;
  });
  const g = makeG((x) => {
    x.perFiler[0].salary = [{ fromAge: 51, toAge: 56, value: 100_000 }];
  });
  const w = makeW((x) => {
    x.spending = flat(30_000);
  });
  const run = simulateRun(a, g, w);

  it('drawdown start auto-resolves to separation + 1 (M3 gate #2)', () => {
    expect(resolveDrawdownStart(a, g, w)).toBe(57);
    expect(run.drawdownStartAge).toBe(57);
    // separation year keeps its salary; no no-income-gap note for sep+1
    expect(run.notes.some((n) => n.includes('no income'))).toBe(false);
  });

  it('the 401k is open (rule of 55) at drawdown; the Traditional IRA stays locked until 60', () => {
    for (let age = 57; age <= 59; age++) {
      const y = rowAt(run.years, age);
      expect(y.gap).toBe(false);
      expect(y.withdrawals?.trad401k).toBeCloseTo(30_000 / 0.88, 6);
      expect(y.withdrawals?.tradIra).toBeUndefined();
    }
  });

  it('at 60 the 401k rolls to the IRA and draws continue from there', () => {
    const y60 = rowAt(run.years, 60);
    expect(y60.events.some((e) => e.kind === 'rollover' && e.label.includes('Traditional'))).toBe(
      true,
    );
    expect(y60.withdrawals?.tradIra).toBeCloseTo(30_000 / 0.88, 6);
    expect(y60.withdrawals?.trad401k).toBeUndefined();
    expect(y60.accounts.trad401k.balance).toBe(0);
  });
});

describe('Roth clock (SPEC §12)', () => {
  it('first funded 3 years ago at 59½ → earnings locked 2 more years', () => {
    const a = makeA((x) => {
      x.filers = [{ currentAge: 59 }];
      x.balances.perFiler[0].rothIra = {
        basis: 0,
        conversions: [],
        earnings: 100_000,
        firstFundedYear: 2023,
      };
    });
    const w = makeW((x) => {
      x.drawdownStartAge = 60;
      x.spending = flat(20_000);
    });
    const run = simulateRun(a, makeG(), w);
    expect(rowAt(run.years, 60).gap).toBe(true); // year 2027 < 2023 + 5
    const y61 = rowAt(run.years, 61); // year 2028: clock done, age ≥ 60
    expect(y61.gap).toBe(false);
    expect(y61.withdrawals?.rothIra).toBeCloseTo(20_000, 6);
  });
});

describe('drawdown-flat (SPEC §12, M3 gate wording): 4% draw at 4% real', () => {
  // Start-of-year withdrawals at start-of-year price levels (M3 correction #1)
  // are the Trinity/Bengen convention: year-one draw = exactly 4% of the
  // starting balance. Real balance follows b' = (b − 40,000) × 1.04 — the
  // closed form b_k = 1,040,000 − 40,000 × 1.04^k after k withdrawals.
  it('real balance matches the closed form to the cent and is ≥ 0.9× 30 years in', () => {
    const a = makeA((x) => {
      x.filers = [{ currentAge: 44 }];
      x.horizonAge = 75;
      x.indexWithInflation = true;
      x.returnSchedule = flat(1.04 * 1.03 - 1); // real 4% at 3% inflation
      x.balances.perFiler[0].rothIra = {
        basis: 1_000_000,
        conversions: [],
        earnings: 0,
        firstFundedYear: 2010,
      };
    });
    const w = makeW((x) => {
      x.drawdownStartAge = 45;
      x.spending = flat(40_000); // 4% of the $1M ATE at start, today's $
      x.order = ['rothBasis', 'seasonedConversions', 'rothEarnings'];
    });
    const run = simulateRun(a, makeG(), w);
    expect(run.years.every((y) => !y.gap)).toBe(true);
    const startReal = rowAt(run.years, 44).accounts.rothIra.balance;
    const realAt = (age: number) =>
      toReal(rowAt(run.years, age).accounts.rothIra.balance, age - 44, a.inflation);
    const closedForm = (k: number) => 1_040_000 - 40_000 * 1.04 ** k;
    expect(realAt(60)).toBeCloseTo(closedForm(16), 2); // 965,080.75
    expect(realAt(75)).toBeCloseTo(closedForm(31), 2); // 905,074.66
    expect(realAt(74) / startReal).toBeGreaterThanOrEqual(0.9); // 30 withdrawals in
    expect(realAt(75) / startReal).toBeGreaterThan(0.9);
  });
});

describe('gross-up and sale tax mechanics', () => {
  const base = (mut: (a: Assumptions) => void) =>
    makeA((x) => {
      x.filers = [{ currentAge: 65 }];
      mut(x);
    });
  const w10k = makeW((x) => {
    x.drawdownStartAge = 66;
    x.spending = flat(10_000);
  });

  it('pre-tax: net X costs X ÷ 0.88 gross; the difference is tax', () => {
    const a = base((x) => {
      x.balances.perFiler[0].trad401k = 500_000;
    });
    const w = makeW((x) => {
      x.drawdownStartAge = 66;
      x.spending = flat(44_000);
    });
    const y = rowAt(simulateRun(a, makeG(), w).years, 66);
    expect(y.withdrawals?.tradIra).toBeCloseTo(50_000, 6); // rolled at 66 (age ≥ 60)
    expect(y.accounts.tradIra.balance).toBeCloseTo(450_000, 6);
    expect(y.taxPaidThisYear).toBeCloseTo(6_000, 6);
  });

  it('trad IRA nondeductible basis is recovered pro rata (gate #11)', () => {
    const a = base((x) => {
      x.balances.perFiler[0].tradIra = 100_000;
      x.balances.perFiler[0].tradIraBasis = 40_000;
    });
    const y = rowAt(simulateRun(a, makeG(), w10k).years, 66);
    const gross = 10_000 / (1 - 0.6 * 0.12);
    expect(y.withdrawals?.tradIra).toBeCloseTo(gross, 4);
    expect(y.taxPaidThisYear).toBeCloseTo(gross - 10_000, 4);
    expect(y.accounts.tradIra.basis).toBeCloseTo(40_000 - gross * 0.4, 4);
  });

  it('taxable sale taxes only the gain fraction and reduces basis proportionally', () => {
    const a = base((x) => {
      x.balances.taxable = 100_000;
      x.balances.taxableBasis = 40_000;
      x.dividendYield = 0; // isolate sale mechanics from drag
    });
    const y = rowAt(simulateRun(a, makeG(), w10k).years, 66);
    const gross = 10_000 / (1 - 0.6 * 0.15);
    expect(y.withdrawals?.taxable).toBeCloseTo(gross, 4);
    expect(y.taxPaidThisYear).toBeCloseTo(gross - 10_000, 4);
    expect(y.accounts.taxable.basis).toBeCloseTo(40_000 - gross * 0.4, 4);
  });

  it('walks the order: cash, then taxable, then Roth basis', () => {
    const a = base((x) => {
      x.balances.cash = 10_000;
      x.balances.taxable = 10_000;
      x.balances.taxableBasis = 10_000;
      x.balances.perFiler[0].rothIra = {
        basis: 10_000,
        conversions: [],
        earnings: 0,
        firstFundedYear: 2010,
      };
    });
    const w = makeW((x) => {
      x.drawdownStartAge = 66;
      x.spending = flat(25_000);
    });
    const y = rowAt(simulateRun(a, makeG(), w).years, 66);
    expect(y.withdrawals?.cash).toBeCloseTo(10_000, 6);
    expect(y.withdrawals?.taxable).toBeCloseTo(10_000, 6); // basis = balance, no gain tax
    expect(y.withdrawals?.rothIra).toBeCloseTo(5_000, 6);
    expect(y.gap).toBe(false);
  });
});

describe('conversion seasoning in drawdown (gate #4)', () => {
  it('a fully-taxable conversion is locked five tax years; a backdoor one is not', () => {
    const seasonedCase = (taxablePortion: number) => {
      const a = makeA((x) => {
        x.filers = [{ currentAge: 44 }];
        x.balances.perFiler[0].rothIra = {
          basis: 0,
          conversions: [{ year: 2024, amount: 60_000, taxablePortion }],
          earnings: 0,
          firstFundedYear: 2024,
        };
      });
      const w = makeW((x) => {
        x.drawdownStartAge = 45;
        x.spending = flat(10_000);
      });
      return simulateRun(a, makeG(), w);
    };

    const taxable = seasonedCase(60_000);
    expect(rowAt(taxable.years, 45).gap).toBe(true); // 2027 < 2029
    expect(rowAt(taxable.years, 46).gap).toBe(true); // 2028 < 2029
    expect(rowAt(taxable.years, 47).gap).toBe(false); // 2029: seasoned
    expect(rowAt(taxable.years, 47).withdrawals?.rothIra).toBeCloseTo(10_000, 6);

    const backdoor = seasonedCase(0);
    expect(rowAt(backdoor.years, 45).gap).toBe(false);
  });
});

describe('retirement income rows (gate #9)', () => {
  const base = () =>
    makeA((x) => {
      x.filers = [{ currentAge: 65 }];
      x.balances.perFiler[0].trad401k = 500_000;
    });

  it('pension nets at the effective rate and offsets need', () => {
    const w = makeW((x) => {
      x.drawdownStartAge = 66;
      x.spending = flat(40_000);
      x.income = [{ kind: 'pension', fromAge: 66, toAge: null, amount: 30_000 }];
    });
    const y = rowAt(simulateRun(base(), makeG(), w).years, 66);
    const netNeed = 40_000 - 30_000 * 0.88;
    expect(y.grossNeed).toBeCloseTo(40_000, 6); // pre-offset spending (M5.5 lens support)
    expect(y.need).toBeCloseTo(netNeed, 6);
    expect(y.withdrawals?.tradIra).toBeCloseTo(netNeed / 0.88, 4);
    expect(y.taxPaidThisYear).toBeCloseTo(30_000 * 0.12 + (netNeed / 0.88) * 0.12, 4);
  });

  it('Social Security is taxed on 85% of the benefit', () => {
    const w = makeW((x) => {
      x.drawdownStartAge = 66;
      x.spending = flat(40_000);
      x.income = [{ kind: 'socialSecurity', fromAge: 66, toAge: null, amount: 30_000 }];
    });
    const y = rowAt(simulateRun(base(), makeG(), w).years, 66);
    expect(y.need).toBeCloseTo(40_000 - 30_000 * (1 - 0.85 * 0.12), 6);
  });

  it('surplus income is saved to cash (M3 decision #2)', () => {
    const w = makeW((x) => {
      x.drawdownStartAge = 66;
      x.spending = flat(20_000);
      x.income = [{ kind: 'pension', fromAge: 66, toAge: null, amount: 50_000 }];
    });
    const y = rowAt(simulateRun(base(), makeG(), w).years, 66);
    expect(y.need).toBe(0);
    expect(y.accounts.cash.balance).toBeCloseTo(50_000 * 0.88 - 20_000, 6);
  });
});

describe('run odds and ends', () => {
  it('windfalls still land during drawdown (M3 decision #3)', () => {
    const a = makeA((x) => {
      x.filers = [{ currentAge: 65 }];
      x.balances.cash = 1_000_000;
    });
    const g = makeG((x) => {
      x.windfalls = [{ age: 70, amount: 100_000, target: 'taxable', label: 'inheritance' }];
    });
    const w = makeW((x) => {
      x.drawdownStartAge = 66;
      x.spending = flat(10_000);
    });
    const run = simulateRun(a, g, w);
    expect(rowAt(run.years, 70).accounts.taxable.balance).toBeCloseTo(100_000, 6);
    expect(rowAt(run.years, 70).events.some((e) => e.kind === 'windfall')).toBe(true);
  });

  it('emits the contributions-cut and no-income-gap notes', () => {
    const a = makeA((x) => {
      x.filers = [{ currentAge: 40 }];
    });
    const g = makeG((x) => {
      x.perFiler[0].salary = [{ fromAge: 41, toAge: 50, value: 100_000 }];
      x.perFiler[0].contrib401k = flat(10_000, 41);
    });
    const w = makeW((x) => {
      x.drawdownStartAge = 55;
      x.spending = flat(30_000);
    });
    const run = simulateRun(a, g, w);
    expect(run.notes.some((n) => n.includes('contributions cut at 55'))).toBe(true);
    expect(run.notes.some((n) => n.includes('ages 51–54 have no income'))).toBe(true);
  });

  it('rollover does NOT restart an existing Roth clock (M3 gate #5)', () => {
    const a = makeA((x) => {
      x.filers = [{ currentAge: 58 }];
      x.balances.perFiler[0].roth401k = 100_000; // all earnings (basis 0)
      x.balances.perFiler[0].rothIra = {
        basis: 0,
        conversions: [],
        earnings: 0,
        firstFundedYear: 2020, // long-satisfied clock governs
      };
    });
    const w = makeW((x) => {
      x.drawdownStartAge = 59;
      x.spending = flat(20_000);
    });
    const run = simulateRun(a, makeG(), w);
    expect(rowAt(run.years, 59).gap).toBe(true); // age gate, not the clock
    const y60 = rowAt(run.years, 60);
    expect(y60.gap).toBe(false); // a restarted clock would lock until 2032
    expect(y60.withdrawals?.rothIra).toBeCloseTo(20_000, 6);
  });

  it('Roth 401k rolls at drawdown start: basis → basis, earnings → earnings, clock starts', () => {
    const a = makeA((x) => {
      x.filers = [{ currentAge: 50 }];
      x.balances.perFiler[0].roth401k = 100_000;
      x.balances.perFiler[0].roth401kBasis = 60_000;
    });
    const w = makeW((x) => {
      x.drawdownStartAge = 51;
      x.spending = flat(10_000);
    });
    const run = simulateRun(a, makeG(), w);
    const y51 = rowAt(run.years, 51);
    expect(y51.events.some((e) => e.kind === 'rollover' && e.label.includes('Roth'))).toBe(true);
    expect(y51.accounts.roth401k.balance).toBe(0);
    // 60k basis rolled in, 10k drawn from basis this year; 40k earnings intact
    expect(y51.accounts.rothIra.rothBasis).toBeCloseTo(50_000, 6);
    expect(y51.accounts.rothIra.rothEarnings).toBeCloseTo(40_000, 6);
    expect(y51.gap).toBe(false); // basis is accessible at 51
  });

  it('auto drawdown start falls back to coastTargetAge with no salary anywhere', () => {
    const a = makeA((x) => {
      x.coastTargetAge = 55;
      x.balances.cash = 2_000_000;
    });
    const run = simulateRun(a, makeG(), makeW((x) => (x.spending = flat(10_000))));
    expect(run.drawdownStartAge).toBe(55);
  });
});
