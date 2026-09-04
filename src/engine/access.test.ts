import { describe, expect, it } from 'vitest';
import {
  accessOpen,
  accessibleConversionAmount,
  computeAccessAges,
  conversionUnlockYear,
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

describe('rule of 55 never DELAYS access (M9.1 #1)', () => {
  const withSeparation = (sep: number | null) => {
    const a = defaultAssumptions(2026);
    a.filers = [{ currentAge: 40 }];
    const g = defaultGrowthScenario(1);
    if (sep !== null) g.perFiler[0].salary = [{ fromAge: 41, toAge: sep, value: 100_000 }];
    return computeAccessAges(a, g)[0];
  };

  it('separation 90 (salary to the horizon) → the 401k still opens at 60, not 90', () => {
    expect(withSeparation(90).trad401k).toBe(59.5); // ceil → opens the year they turn 60
  });
  it('separation 56 → rule of 55 opens the 401k at 56', () => {
    expect(withSeparation(56).trad401k).toBe(56);
  });
  it('separation 50 (before 55) → the normal 59½ rule', () => {
    expect(withSeparation(50).trad401k).toBe(59.5);
  });
});

describe('accessibleConversionAmount (gate #4, M8 unlock rule)', () => {
  it('M8: the taxable portion opens at the EARLIER of +5 tax years or the ceil(59.5) year', () => {
    const c = { year: 2026, amount: 50_000, taxablePortion: 50_000 };
    // conversion at 57: age rule wins — accessible at 60 (2029), not 62 (2031)
    expect(accessibleConversionAmount(c, 2028, 59)).toBe(0);
    expect(accessibleConversionAmount(c, 2029, 60)).toBe(50_000);
    expect(conversionUnlockYear(2026, 57)).toBe(2029);
    // conversion at 50: the 5-year clock wins — accessible at 55
    expect(conversionUnlockYear(2026, 50)).toBe(2031);
    expect(accessibleConversionAmount(c, 2030, 54)).toBe(0);
    expect(accessibleConversionAmount(c, 2031, 55)).toBe(50_000);
    // conversion at 65: immediately accessible — the clock only ever gated the penalty
    expect(accessibleConversionAmount(c, 2026, 65)).toBe(50_000);
    expect(conversionUnlockYear(2026, 65)).toBe(2026);
  });


  const c = { year: 2024, amount: 50_000, taxablePortion: 30_000 };

  it('nontaxable portion is accessible immediately; taxable after 5 tax years', () => {
    expect(accessibleConversionAmount(c, 2026, 45)).toBe(20_000);
    expect(accessibleConversionAmount(c, 2028, 47)).toBe(20_000);
    expect(accessibleConversionAmount(c, 2029, 48)).toBe(50_000);
  });

  it('backdoor conversions (taxablePortion 0) are never locked', () => {
    expect(accessibleConversionAmount({ year: 2026, amount: 7_000, taxablePortion: 0 }, 2026, 45)).toBe(
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
