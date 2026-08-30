import { describe, expect, it } from 'vitest';
import { separationAge, simulateAccumulation } from './accumulate';
import { defaultAssumptions, defaultFilerBalances, defaultGrowthScenario } from './defaults';
import { toReal } from './schedule';
import type { Assumptions, GrowthScenario, RunYear, ScheduleRow } from './types';

const flat = (value: number, fromAge = 0): ScheduleRow[] => [{ fromAge, toAge: null, value }];

/** Deterministic base: indexing off, fees 0, flat 7% (cash keeps its 4% override). */
function makeA(mut?: (a: Assumptions) => void): Assumptions {
  const a = defaultAssumptions(2026);
  a.indexWithInflation = false;
  a.fees = 0;
  a.returnSchedule = flat(0.07);
  a.horizonAge = 45;
  mut?.(a);
  return a;
}

function makeG(mut?: (g: GrowthScenario) => void, filerCount = 1): GrowthScenario {
  const g = defaultGrowthScenario(filerCount);
  mut?.(g);
  return g;
}

const rowAt = (years: RunYear[], age: number): RunYear => {
  const row = years.find((y) => y.age === age);
  if (!row) throw new Error(`no row at age ${age}`);
  return row;
};

const eventsOf = (years: RunYear[]) => years.flatMap((y) => y.events);

describe('golden number (SPEC §12)', () => {
  it('P=$10k, C=$5k end-of-year, r=7%, n=10 → FV to the cent; real = nominal ÷ 1.03^10', () => {
    const a = makeA((x) => {
      x.balances.perFiler[0].trad401k = 10_000;
    });
    const g = makeG((x) => {
      x.perFiler[0].contrib401k = [{ fromAge: 31, toAge: 40, value: 5_000 }];
    });
    const years = simulateAccumulation(a, g);
    const fv = 10_000 * 1.07 ** 10 + 5_000 * ((1.07 ** 10 - 1) / 0.07);
    const nominal = rowAt(years, 40).accounts.trad401k.balance;
    expect(nominal).toBeCloseTo(fv, 2);
    expect(toReal(nominal, 10, 0.03)).toBeCloseTo(fv / 1.03 ** 10, 2);
  });
});

describe('returns, fees, and the schedule boundary (SPEC §12)', () => {
  it('7% with 0.5% fees compounds at exactly 6.5%', () => {
    const a = makeA((x) => {
      x.fees = 0.005;
      x.balances.perFiler[0].trad401k = 10_000;
    });
    const years = simulateAccumulation(a, makeG());
    expect(rowAt(years, 33).accounts.trad401k.balance).toBeCloseTo(10_000 * 1.065 ** 3, 8);
  });

  it('7% to 50 then 5%: the age-51 year is the first at 5%', () => {
    const a = defaultAssumptions(2026); // default return schedule
    a.indexWithInflation = false;
    a.fees = 0;
    a.filers = [{ currentAge: 48 }];
    a.horizonAge = 53;
    a.balances.perFiler[0].trad401k = 1_000;
    const years = simulateAccumulation(a, makeG());
    expect(rowAt(years, 50).accounts.trad401k.balance).toBeCloseTo(1_000 * 1.07 ** 2, 8);
    expect(rowAt(years, 51).accounts.trad401k.balance).toBeCloseTo(1_000 * 1.07 ** 2 * 1.05, 8);
    expect(rowAt(years, 52).accounts.trad401k.balance).toBeCloseTo(1_000 * 1.07 ** 2 * 1.05 ** 2, 8);
  });

  it('fees never touch cash; cash interest is taxed at marginal-now (gate #8)', () => {
    const a = makeA((x) => {
      x.fees = 0.005;
      x.balances.cash = 10_000;
    });
    const years = simulateAccumulation(a, makeG());
    const y1 = rowAt(years, 31);
    expect(y1.accounts.cash.balance).toBeCloseTo(10_000 * (1 + 0.04 * (1 - 0.24)), 8); // 10,304
    expect(y1.taxPaidThisYear).toBeCloseTo(96, 8);
    expect(y1.cumulativeTax).toBeCloseTo(96, 8);
  });
});

describe('contribution schedules (SPEC §12)', () => {
  it('contributions end at 40 → growth only from 41, with a stop marker; "$2k from 45 to 50" resumes exactly with a resume marker', () => {
    const a = makeA((x) => {
      x.returnSchedule = flat(0);
      x.horizonAge = 55;
    });
    const g = makeG((x) => {
      x.perFiler[0].contrib401k = [
        { fromAge: 31, toAge: 40, value: 1_000 },
        { fromAge: 45, toAge: 50, value: 2_000 },
      ];
    });
    const years = simulateAccumulation(a, g);
    expect(rowAt(years, 40).accounts.trad401k.balance).toBe(10_000);
    expect(rowAt(years, 44).accounts.trad401k.balance).toBe(10_000);
    expect(rowAt(years, 45).accounts.trad401k.balance).toBe(12_000);
    expect(rowAt(years, 50).accounts.trad401k.balance).toBe(22_000);
    expect(rowAt(years, 55).accounts.trad401k.balance).toBe(22_000);
    const stops = rowAt(years, 41).events.filter((e) => e.kind === 'contributionChange');
    expect(stops).toHaveLength(1);
    expect(stops[0].label).toContain('stop');
    const resumes = rowAt(years, 45).events.filter((e) => e.kind === 'contributionChange');
    expect(resumes).toHaveLength(1);
    expect(resumes[0].label).toContain('resume');
  });

  it('an increase emits an "increased" marker', () => {
    const a = makeA((x) => {
      x.returnSchedule = flat(0);
    });
    const g = makeG((x) => {
      x.perFiler[0].contrib401k = [
        { fromAge: 31, toAge: 35, value: 4_000 },
        { fromAge: 36, toAge: 40, value: 10_000 },
      ];
    });
    const marks = rowAt(simulateAccumulation(a, g), 36).events.filter(
      (e) => e.kind === 'contributionChange',
    );
    expect(marks).toHaveLength(1);
    expect(marks[0].label).toContain('increased');
  });

  it('a capped contribution warns every capped year (cap and warn)', () => {
    const a = makeA((x) => {
      x.returnSchedule = flat(0);
    });
    const g = makeG((x) => {
      x.perFiler[0].contrib401k = flat(40_000, 38);
    });
    const years = simulateAccumulation(a, g);
    for (const age of [38, 39, 45]) {
      const notes = rowAt(years, age).events.filter((e) => e.label.includes('capped'));
      expect(notes).toHaveLength(1);
      expect(notes[0].label).toBe('401k (filer 1) requested 40,000, capped at 24,500');
    }
  });

  it('a reduction emits a "reduced" marker', () => {
    const a = makeA((x) => {
      x.returnSchedule = flat(0);
    });
    const g = makeG((x) => {
      x.perFiler[0].contrib401k = [
        { fromAge: 31, toAge: 35, value: 10_000 },
        { fromAge: 36, toAge: 40, value: 4_000 },
      ];
    });
    const years = simulateAccumulation(a, g);
    const marks = rowAt(years, 36).events.filter((e) => e.kind === 'contributionChange');
    expect(marks).toHaveLength(1);
    expect(marks[0].label).toContain('reduced');
  });

  it('stopAtAge cuts contributions from that age on (for M3 runs)', () => {
    const a = makeA((x) => {
      x.returnSchedule = flat(0);
    });
    const g = makeG((x) => {
      x.perFiler[0].contrib401k = flat(1_000, 31);
    });
    const years = simulateAccumulation(a, g, 35);
    expect(rowAt(years, 34).accounts.trad401k.balance).toBe(4_000); // 31..34
    expect(rowAt(years, 45).accounts.trad401k.balance).toBe(4_000);
  });
});

describe('windfalls (SPEC §12)', () => {
  it('$200k at 32 → taxable exactly $200k higher than the same run without it; marker + basis', () => {
    const a = makeA((x) => {
      x.balances.taxable = 50_000;
      x.balances.taxableBasis = 50_000;
    });
    const without = simulateAccumulation(a, makeG());
    const withW = simulateAccumulation(
      a,
      makeG((x) => {
        x.windfalls = [{ age: 32, amount: 200_000, target: 'taxable', label: 'IPO' }];
      }),
    );
    const diff =
      rowAt(withW, 32).accounts.taxable.balance - rowAt(without, 32).accounts.taxable.balance;
    expect(diff).toBeCloseTo(200_000, 8);
    const basisDiff =
      rowAt(withW, 32).accounts.taxable.basis - rowAt(without, 32).accounts.taxable.basis;
    expect(basisDiff).toBeCloseTo(200_000, 8);
    const marks = rowAt(withW, 32).events.filter((e) => e.kind === 'windfall');
    expect(marks).toHaveLength(1);
    expect(marks[0].label).toBe('IPO');
  });
});

describe('splits, catch-ups, couples, match (SPEC §12)', () => {
  it('couple: each filer capped separately (limits effectively summed)', () => {
    const a = makeA((x) => {
      x.returnSchedule = flat(0);
      x.filers = [{ currentAge: 30 }, { currentAge: 40 }];
      x.balances.perFiler = [defaultFilerBalances(), defaultFilerBalances()];
      x.filingStatus = 'marriedJoint';
    });
    const g = makeG((x) => {
      for (const f of x.perFiler) f.contrib401k = flat(30_000);
    }, 2);
    const years = simulateAccumulation(a, g);
    expect(rowAt(years, 31).accounts.trad401k.balance).toBe(49_000); // 24.5k × 2
  });

  it('match is computed per filer salary and lands with the deferral', () => {
    const a = makeA((x) => {
      x.returnSchedule = flat(0);
      x.filers = [{ currentAge: 30 }, { currentAge: 40 }];
      x.balances.perFiler = [defaultFilerBalances(), defaultFilerBalances()];
    });
    const g = makeG((x) => {
      x.perFiler[0].salary = flat(100_000);
      x.perFiler[1].salary = flat(200_000);
      for (const f of x.perFiler) {
        f.contrib401k = flat(10_000);
        f.match = { ...f.match, rate: 0.5, capPctOfSalary: 0.06 };
      }
    }, 2);
    const years = simulateAccumulation(a, g);
    // f1: 0.5 × min(10k, 6k) = 3k; f2: 0.5 × min(10k, 12k) = 5k
    expect(rowAt(years, 31).accounts.trad401k.balance).toBe(20_000 + 3_000 + 5_000);
  });

  it('zero deferral → zero percent-mode match; flat match pays regardless', () => {
    const a = makeA((x) => {
      x.returnSchedule = flat(0);
    });
    const percent = makeG((x) => {
      x.perFiler[0].salary = flat(100_000);
      x.perFiler[0].match = { ...x.perFiler[0].match, rate: 0.5, capPctOfSalary: 0.06 };
    });
    expect(rowAt(simulateAccumulation(a, percent), 35).accounts.trad401k.balance).toBe(0);

    const flatMatch = makeG((x) => {
      x.perFiler[0].match = { ...x.perFiler[0].match, mode: 'flat', flatAmount: 2_000 };
    });
    expect(rowAt(simulateAccumulation(a, flatMatch), 31).accounts.trad401k.balance).toBe(2_000);
  });

  it('415(c) clamps the match', () => {
    const a = makeA((x) => {
      x.returnSchedule = flat(0);
    });
    const g = makeG((x) => {
      x.perFiler[0].salary = flat(100_000);
      x.perFiler[0].contrib401k = flat(24_500);
      x.perFiler[0].match = { ...x.perFiler[0].match, rate: 3, capPctOfSalary: 1 };
    });
    const years = simulateAccumulation(a, g);
    // raw match 73.5k → clamped to 72k − 24.5k = 47.5k
    expect(rowAt(years, 31).accounts.trad401k.balance).toBe(24_500 + 47_500);
  });

  it('forced Roth catch-up above the wage threshold, with a marker (gate #10)', () => {
    const a = makeA((x) => {
      x.returnSchedule = flat(0);
      x.filers = [{ currentAge: 51 }];
      x.horizonAge = 60;
    });
    const g = makeG((x) => {
      x.perFiler[0].salary = flat(200_000);
      x.perFiler[0].contrib401k = flat(32_500);
      x.perFiler[0].split401kRothPct = 0;
    });
    const years = simulateAccumulation(a, g);
    const y1 = rowAt(years, 52);
    expect(y1.accounts.trad401k.balance).toBe(24_500);
    expect(y1.accounts.roth401k.balance).toBe(8_000);
    expect(eventsOf(years).some((e) => e.kind === 'rothCatchUpForced')).toBe(true);
  });

  it('vesting: unvested match sub-balance dropped at scenario-derived separation (gates #2, #7)', () => {
    const a = makeA((x) => {
      x.returnSchedule = flat(0);
    });
    const g = makeG((x) => {
      x.perFiler[0].salary = [{ fromAge: 31, toAge: 33, value: 100_000 }];
      x.perFiler[0].contrib401k = [{ fromAge: 31, toAge: 33, value: 10_000 }];
      x.perFiler[0].match = { ...x.perFiler[0].match, rate: 0.5, capPctOfSalary: 0.06, vestingPct: 0.5 };
    });
    expect(separationAge(g, 0, 30, 45)).toBe(33);
    const years = simulateAccumulation(a, g);
    // 3 × 10k deferrals + 3 × 3k match − 50% of 9k dropped at 33
    expect(rowAt(years, 33).accounts.trad401k.balance).toBe(30_000 + 9_000 - 4_500);
    expect(rowAt(years, 34).accounts.trad401k.balance).toBe(34_500);
  });
});

describe('drag, HSA, IRA routing', () => {
  it('taxable basis includes reinvested after-tax dividends (M2 gate bug fix)', () => {
    const a = makeA((x) => {
      x.horizonAge = 62;
    });
    const g = makeG((x) => {
      x.taxableContrib = flat(10_000, 31);
      x.windfalls = [{ age: 40, amount: 200_000, target: 'taxable', label: 'IPO' }];
    });
    const years = simulateAccumulation(a, g);
    expect(rowAt(years, 32).accounts.taxable.basis).toBeCloseTo(20_170.0, 2);
    expect(rowAt(years, 40).accounts.taxable.basis).toBeCloseTo(309_190.69, 2);
    expect(rowAt(years, 62).accounts.taxable.basis).toBeCloseTo(863_238.52, 2);
    const y40 = rowAt(years, 40);
    const ateReal = toReal(
      y40.accounts.taxable.balance -
        (y40.accounts.taxable.balance - y40.accounts.taxable.basis) * 0.15,
      10,
      0.03,
    );
    expect(ateReal).toBeCloseTo(247_163.75, 2);
  });

  it('taxable drag: 7% growth minus 2%×15% drag, drag counted as tax', () => {
    const a = makeA((x) => {
      x.balances.taxable = 10_000;
      x.balances.taxableBasis = 10_000;
    });
    const y1 = rowAt(simulateAccumulation(a, makeG()), 31);
    expect(y1.accounts.taxable.balance).toBeCloseTo(10_000 * 1.07 - 30, 8);
    expect(y1.taxPaidThisYear).toBeCloseTo(30, 8);
  });

  it('HSA household cap honors coverage + catch-ups and auto-stops at 65', () => {
    const a = makeA((x) => {
      x.returnSchedule = flat(0);
      x.filers = [{ currentAge: 63 }];
      x.horizonAge = 70;
      x.hsaCoverage = 'selfOnly';
    });
    const g = makeG((x) => {
      x.hsaContrib = flat(20_000);
    });
    const years = simulateAccumulation(a, g);
    // one contributing year (age 64): 4,400 + 1,000 catch-up
    expect(rowAt(years, 64).accounts.hsa.balance).toBe(5_400);
    expect(rowAt(years, 70).accounts.hsa.balance).toBe(5_400);
    expect(eventsOf(years).some((e) => e.label.includes('auto-stop at 65'))).toBe(true);
  });

  it('backdoor: contribution becomes a conversion with taxablePortion 0; pro-rata warning with a trad IRA balance', () => {
    const a = makeA((x) => {
      x.returnSchedule = flat(0);
      x.balances.perFiler[0].tradIra = 5_000;
    });
    const g = makeG((x) => {
      x.perFiler[0].contribIra = flat(7_000, 31);
      x.perFiler[0].backdoor = true;
    });
    const years = simulateAccumulation(a, g);
    const y1 = rowAt(years, 31);
    expect(y1.accounts.rothIra.balance).toBe(7_000);
    expect(y1.accounts.rothIra.rothConversions).toContainEqual({
      year: 2027,
      amount: 7_000,
      taxablePortion: 0,
    });
    expect(eventsOf(years).some((e) => e.label.includes('pro-rata'))).toBe(true);
  });

  it('gate #11: 401k schedule ⇒ IRA nondeductible by default; basis accrues with a warning', () => {
    const a = makeA((x) => {
      x.returnSchedule = flat(0);
    });
    const g = makeG((x) => {
      x.perFiler[0].contrib401k = flat(5_000, 31);
      x.perFiler[0].contribIra = flat(7_000, 31);
      x.perFiler[0].splitIraRothPct = 0;
    });
    const years = simulateAccumulation(a, g);
    const y1 = rowAt(years, 31);
    expect(y1.accounts.tradIra.balance).toBe(7_000);
    expect(y1.accounts.tradIra.basis).toBe(7_000);
    expect(eventsOf(years).some((e) => e.label.includes('nondeductible'))).toBe(true);
  });

  it('gate #11: no 401k schedule ⇒ deductible by default, no basis', () => {
    const a = makeA((x) => {
      x.returnSchedule = flat(0);
    });
    const g = makeG((x) => {
      x.perFiler[0].contribIra = flat(7_000, 31);
      x.perFiler[0].splitIraRothPct = 0;
    });
    const y1 = rowAt(simulateAccumulation(a, g), 31);
    expect(y1.accounts.tradIra.balance).toBe(7_000);
    expect(y1.accounts.tradIra.basis).toBe(0);
  });
});

describe('ATE, indexing, excluded accounts', () => {
  it('pre-tax-only portfolio: totalAte = gross × (1 − 12%) (SPEC §12)', () => {
    const a = makeA((x) => {
      x.balances.perFiler[0].trad401k = 100_000;
    });
    const y0 = simulateAccumulation(a, makeG())[0];
    expect(y0.totalAte).toBeCloseTo(y0.total * 0.88, 8);
    expect(y0.buckets.preTax.ate).toBeCloseTo(88_000, 8);
  });

  it('with indexing on, a contribution pinned at the limit stays at the limit', () => {
    const a = makeA((x) => {
      x.indexWithInflation = true;
      x.returnSchedule = flat(0);
      x.horizonAge = 33;
    });
    const g = makeG((x) => {
      x.perFiler[0].contrib401k = flat(24_500, 31);
    });
    const years = simulateAccumulation(a, g);
    const expected = 24_500 * 1.03 + 24_500 * 1.03 ** 2 + 24_500 * 1.03 ** 3;
    expect(rowAt(years, 33).accounts.trad401k.balance).toBeCloseTo(expected, 6);
  });

  it('excluded accounts are ignored entirely, with notes (M2 decision #5)', () => {
    const a = makeA((x) => {
      x.include.taxable = false;
      x.balances.taxable = 5_000;
    });
    const g = makeG((x) => {
      x.taxableContrib = flat(1_000, 31);
    });
    const years = simulateAccumulation(a, g);
    expect(years[0].accounts.taxable.balance).toBe(0);
    expect(rowAt(years, 45).accounts.taxable.balance).toBe(0);
    expect(years[0].events.some((e) => e.label.includes('excluded'))).toBe(true);
    expect(eventsOf(years).some((e) => e.label.includes('dropped'))).toBe(true);
  });

  it('windfalls land in the designated filer\'s account; invalid filer index is dropped with a note (M2 gate #4)', () => {
    const a = makeA((x) => {
      x.returnSchedule = flat(0);
      x.filers = [{ currentAge: 30 }, { currentAge: 40 }];
      x.balances.perFiler = [defaultFilerBalances(), defaultFilerBalances()];
    });
    const g = makeG((x) => {
      x.windfalls = [
        { age: 32, amount: 50_000, target: 'hsa', label: 'to filer 2', filer: 1 },
        { age: 33, amount: 10_000, target: 'hsa', label: 'bad index', filer: 5 },
      ];
    }, 2);
    const years = simulateAccumulation(a, g);
    expect(rowAt(years, 32).accounts.hsa.balance).toBe(50_000);
    expect(rowAt(years, 33).accounts.hsa.balance).toBe(50_000); // bad-index windfall dropped
    expect(eventsOf(years).some((e) => e.label.includes('no filer 6'))).toBe(true);
  });

  it('Roth-destination match is contribution basis and vests like the balance (M2 gate #5)', () => {
    const a = makeA((x) => {
      x.returnSchedule = flat(0);
    });
    const g = makeG((x) => {
      x.perFiler[0].salary = [{ fromAge: 31, toAge: 33, value: 100_000 }];
      x.perFiler[0].contrib401k = [{ fromAge: 31, toAge: 33, value: 10_000 }];
      x.perFiler[0].split401kRothPct = 1;
      x.perFiler[0].match = {
        mode: 'percent',
        rate: 0.5,
        capPctOfSalary: 0.06,
        flatAmount: 0,
        destination: 'roth401k',
        vestingPct: 0.5,
      };
    });
    const years = simulateAccumulation(a, g);
    // 30k deferrals + 9k match − 4.5k unvested drop; basis identical since match is basis
    const y33 = rowAt(years, 33);
    expect(y33.accounts.roth401k.balance).toBe(34_500);
    expect(y33.accounts.roth401k.rothBasis).toBe(34_500);
  });

  it('scenario return override beats per-account overrides; cash always keeps its own return (M2 gate #6)', () => {
    const a = makeA((x) => {
      x.balances.perFiler[0].trad401k = 10_000;
      x.balances.cash = 10_000;
      x.returnOverrides.trad401k = flat(0.1);
    });
    const g = makeG((x) => {
      x.returnScheduleOverride = flat(0);
    });
    const y1 = rowAt(simulateAccumulation(a, g), 31);
    expect(y1.accounts.trad401k.balance).toBe(10_000); // scenario 0% wins over the 10% account override
    expect(y1.accounts.cash.balance).toBeCloseTo(10_000 * (1 + 0.04 * 0.76), 8); // cash untouched by scenario
  });

  it('is deterministic: same inputs, same output', () => {
    const a = makeA((x) => {
      x.balances.perFiler[0].trad401k = 12_345;
    });
    const g = makeG((x) => {
      x.perFiler[0].contrib401k = flat(1_000, 31);
    });
    expect(simulateAccumulation(a, g)).toEqual(simulateAccumulation(a, g));
  });
});
