import { describe, expect, it } from 'vitest';
import {
  accessOpen,
  accessibleConversionAmount,
  computeAccessAges,
  rmdStartAge,
  rothEarningsOpen,
} from './access';
import { defaultAssumptions, defaultGrowthScenario } from './defaults';

describe('accessOpen (59½ rounding, M0 gate #17)', () => {
  it('59½ opens in the year they turn 60; never early', () => {
    expect(accessOpen(59, 59.5)).toBe(false);
    expect(accessOpen(60, 59.5)).toBe(true);
  });

  it('integer access ages open in that exact year (rule of 55)', () => {
    expect(accessOpen(55, 56)).toBe(false);
    expect(accessOpen(56, 56)).toBe(true);
  });

  it('missing access age = always open', () => {
    expect(accessOpen(30, undefined)).toBe(true);
  });
});

describe('computeAccessAges', () => {
  it('defaults both pre-tax accounts to 59½ when there is no rule of 55', () => {
    const a = defaultAssumptions(2026);
    const access = computeAccessAges(a, defaultGrowthScenario(1));
    expect(access[0].trad401k).toBe(59.5);
    expect(access[0].tradIra).toBe(59.5);
    expect(access[0].rothEarnings).toBe(59.5);
    expect(access[0].hsa).toBeUndefined(); // medical: never in the order, face-accessible
  });

  it('rule of 55: separation ≥ 55 moves the 401k (only) to the separation age', () => {
    const a = defaultAssumptions(2026);
    a.filers = [{ currentAge: 50 }];
    const g = defaultGrowthScenario(1);
    g.perFiler[0].salary = [{ fromAge: 51, toAge: 56, value: 100_000 }];
    const access = computeAccessAges(a, g);
    expect(access[0].trad401k).toBe(56);
    expect(access[0].tradIra).toBe(59.5);
  });

  it('separation below 55 does not trigger the rule', () => {
    const a = defaultAssumptions(2026);
    const g = defaultGrowthScenario(1);
    g.perFiler[0].salary = [{ fromAge: 31, toAge: 50, value: 100_000 }];
    expect(computeAccessAges(a, g)[0].trad401k).toBe(59.5);
  });

  it('explicit overrides win; non-medical HSA opens at 65', () => {
    const a = defaultAssumptions(2026);
    a.accessAgeOverrides = [{ trad401k: 57 }];
    a.hsaTreatment = 'nonMedical';
    const access = computeAccessAges(a, defaultGrowthScenario(1));
    expect(access[0].trad401k).toBe(57);
    expect(access[0].hsa).toBe(65);
  });
});

describe('rothEarningsOpen', () => {
  it('SPEC §12: first funded 3 years ago at 59½ → locked 2 more years', () => {
    // Age 60 in 2027 (funded 2023: clock ends 2028) → still locked; open 2028
    expect(rothEarningsOpen(60, 2027, 59.5, 2023)).toBe(false);
    expect(rothEarningsOpen(61, 2028, 59.5, 2023)).toBe(true);
  });

  it('age gate holds even when the clock is done', () => {
    expect(rothEarningsOpen(58, 2040, 59.5, 2010)).toBe(false);
    expect(rothEarningsOpen(60, 2040, 59.5, 2010)).toBe(true);
  });

  it('no funding year ⇒ closed', () => {
    expect(rothEarningsOpen(70, 2040, 59.5, null)).toBe(false);
  });
});

describe('accessibleConversionAmount (gate #4)', () => {
  const c = { year: 2024, amount: 50_000, taxablePortion: 30_000 };

  it('nontaxable portion is accessible immediately; taxable after 5 tax years', () => {
    expect(accessibleConversionAmount(c, 2026)).toBe(20_000);
    expect(accessibleConversionAmount(c, 2028)).toBe(20_000);
    expect(accessibleConversionAmount(c, 2029)).toBe(50_000);
  });

  it('backdoor conversions (taxablePortion 0) are never locked', () => {
    expect(accessibleConversionAmount({ year: 2026, amount: 7_000, taxablePortion: 0 }, 2026)).toBe(
      7_000,
    );
  });
});

describe('rmdStartAge', () => {
  it('is 73 for 1951–59 births, 75 for 1960+', () => {
    expect(rmdStartAge(1955)).toBe(73);
    expect(rmdStartAge(1959)).toBe(73);
    expect(rmdStartAge(1960)).toBe(75);
    expect(rmdStartAge(1990)).toBe(75);
  });
});
