import { describe, expect, it } from 'vitest';
import { defaultAssumptions, defaultGrowthScenario, defaultWithdrawalStrategy } from './defaults';
import {
  equalTakeHomePair,
  reduceContributionTo,
  retireAt,
  stopContributingAt,
  stressFirstDrawdownYears,
} from './presets';
import { rowsFromValues, sliceFrom, validateRows } from './scheduleOps';
import type { GrowthScenario, ScheduleRow } from './types';

const noOverlaps = (rows: ScheduleRow[]) => {
  expect(validateRows(rows)).toEqual([]);
  const covered = new Set<number>();
  for (const r of rows) {
    for (let age = r.fromAge; age <= (r.toAge ?? r.fromAge + 200); age++) {
      expect(covered.has(age), `age ${age} covered twice`).toBe(false);
      covered.add(age);
    }
  }
};

function baseScenario(): GrowthScenario {
  const g = defaultGrowthScenario(1);
  g.perFiler[0].contrib401k = [{ fromAge: 31, toAge: 55, value: 20_000 }];
  g.taxableContrib = [{ fromAge: 31, toAge: 40, value: 5_000 }];
  return g;
}

describe('scheduleOps additions (M6)', () => {
  it('sliceFrom clips rows to start at or after the age', () => {
    const rows: ScheduleRow[] = [
      { fromAge: 30, toAge: 50, value: 1 },
      { fromAge: 51, toAge: null, value: 2 },
    ];
    expect(sliceFrom(rows, 48)).toEqual([
      { fromAge: 48, toAge: 50, value: 1 },
      { fromAge: 51, toAge: null, value: 2 },
    ]);
    expect(sliceFrom(rows, 60)).toEqual([{ fromAge: 60, toAge: null, value: 2 }]);
  });

  it('rowsFromValues run-length encodes and open-ends a window-filling tail', () => {
    expect(rowsFromValues([0, 5, 5, 3, 0, 3], 30)).toEqual([
      { fromAge: 31, toAge: 32, value: 5 },
      { fromAge: 33, toAge: 33, value: 3 },
      { fromAge: 35, toAge: null, value: 3 },
    ]);
    expect(rowsFromValues([0, 0], 30)).toEqual([]);
  });
});

describe('equalTakeHomePair (SPEC §8)', () => {
  const a = defaultAssumptions(2026); // marginal 24%, effective 12%, limit 24,500

  it('non-binding limits: A equals the current pre-tax amount, B = C, no spill on A', () => {
    const { traditional, roth, drivers } = equalTakeHomePair(baseScenario(), a);
    // C = 20,000 × 0.76 = 15,200; A = min(24,500, C/0.76) = 20,000; B = min(24,500, 15,200)
    expect(traditional.perFiler[0].contrib401k).toEqual([{ fromAge: 31, toAge: 55, value: 20_000 }]);
    expect(traditional.perFiler[0].split401kRothPct).toBe(0);
    expect(roth.perFiler[0].contrib401k).toEqual([{ fromAge: 31, toAge: 55, value: 15_200 }]);
    expect(roth.perFiler[0].split401kRothPct).toBe(1);
    // A spends its whole take-home budget on the deferral → taxable = existing rows only
    expect(traditional.taxableContrib).toEqual([{ fromAge: 31, toAge: 40, value: 5_000 }]);
    expect(roth.taxableContrib).toEqual([{ fromAge: 31, toAge: 40, value: 5_000 }]);
    expect(drivers.limitBinds).toBe(false);
    expect(drivers.rateRatio).toBeCloseTo(0.88 / 0.76, 10);
    noOverlaps(traditional.perFiler[0].contrib401k);
    noOverlaps(roth.taxableContrib);
  });

  it('binding limit: pre-tax clips at the limit and the remainder spills to taxable', () => {
    const g = baseScenario();
    g.perFiler[0].contrib401k = [{ fromAge: 31, toAge: 55, value: 40_000 }];
    const { traditional, drivers } = equalTakeHomePair(g, a);
    // C = 30,400; A wants 40,000 → clipped to 24,500; spill = 30,400 − 24,500×0.76 = 11,780
    expect(traditional.perFiler[0].contrib401k[0].value).toBe(24_500);
    const spillRow = traditional.taxableContrib.find((r) => r.fromAge === 31)!;
    expect(spillRow.value).toBeCloseTo(5_000 + 30_400 - 24_500 * 0.76, 6);
    expect(drivers.limitBinds).toBe(true);
    expect(drivers.dragActive).toBe(true); // spill exists and drag > 0 by default
    noOverlaps(traditional.taxableContrib);
  });
});

describe('the other presets normalize and behave', () => {
  it('stopContributingAt clips every schedule', () => {
    const g = baseScenario();
    g.hsaContrib = [{ fromAge: 31, toAge: null, value: 4_000 }];
    const out = stopContributingAt(g, 45);
    expect(out.perFiler[0].contrib401k).toEqual([{ fromAge: 31, toAge: 44, value: 20_000 }]);
    expect(out.hsaContrib).toEqual([{ fromAge: 31, toAge: 44, value: 4_000 }]);
    expect(out.taxableContrib).toEqual([{ fromAge: 31, toAge: 40, value: 5_000 }]);
    expect(out.name).toContain('stop at 45');
    noOverlaps(out.perFiler[0].contrib401k);
  });

  it('reduceContributionTo clips then appends one open row', () => {
    const out = reduceContributionTo(baseScenario(), 6_000, 45);
    expect(out.perFiler[0].contrib401k).toEqual([
      { fromAge: 31, toAge: 44, value: 20_000 },
      { fromAge: 45, toAge: null, value: 6_000 },
    ]);
    noOverlaps(out.perFiler[0].contrib401k);
  });

  it('retireAt sets an explicit start on a copy', () => {
    const w = defaultWithdrawalStrategy(defaultAssumptions(2026));
    const out = retireAt(w, 52);
    expect(out.drawdownStartAge).toBe(52);
    expect(out.name).toBe('Retire at 52');
    expect(w.drawdownStartAge).toBeUndefined(); // original untouched
  });

  it('stress preset: base to D−1, then −20/−10/0 single years, then base resumes — normalized', () => {
    const a = defaultAssumptions(2026);
    a.returnSchedule = [{ fromAge: 0, toAge: null, value: 0.07 }];
    const out = stressFirstDrawdownYears(baseScenario(), a, 56);
    expect(out.returnScheduleOverride).toEqual([
      { fromAge: 0, toAge: 55, value: 0.07 },
      { fromAge: 56, toAge: 56, value: -0.2 },
      { fromAge: 57, toAge: 57, value: -0.1 },
      { fromAge: 58, toAge: 58, value: 0 },
      { fromAge: 59, toAge: null, value: 0.07 },
    ]);
  });
});
