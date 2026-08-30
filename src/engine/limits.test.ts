import { describe, expect, it } from 'vitest';
import { LIMITS_2026 } from './defaults';
import {
  capFiler401k,
  capFilerIra,
  capHouseholdHsa,
  catchUp401kFor,
  clamp415c,
  matchAmount,
  resolveLimits,
} from './limits';
import type { EmployerMatch } from './types';

const L = LIMITS_2026;

describe('resolveLimits', () => {
  it('is the identity when unindexed or at year 0', () => {
    expect(resolveLimits(L, 10, false, 0.03)).toEqual(L);
    expect(resolveLimits(L, 0, true, 0.03)).toEqual(L);
  });

  it('indexes every field by (1+i)^years', () => {
    const out = resolveLimits(L, 10, true, 0.03);
    const f = 1.03 ** 10;
    expect(out.deferral401k).toBeCloseTo(24_500 * f, 6);
    expect(out.rothCatchUpWageThreshold).toBeCloseTo(150_000 * f, 6);
    expect(out.overall415c).toBeCloseTo(72_000 * f, 6);
  });
});

describe('catchUp401kFor', () => {
  it('is 0 under 50, $8k at 50–59, $11.25k at 60–63 (replacing), $8k again at 64', () => {
    expect(catchUp401kFor(49, L)).toBe(0);
    expect(catchUp401kFor(50, L)).toBe(8_000);
    expect(catchUp401kFor(59, L)).toBe(8_000);
    expect(catchUp401kFor(60, L)).toBe(11_250);
    expect(catchUp401kFor(63, L)).toBe(11_250);
    expect(catchUp401kFor(64, L)).toBe(8_000);
  });
});

describe('capFiler401k (SPEC §12 splits and catch-ups)', () => {
  it('caps $30k at 49 to $24.5k, split 50/50 → $12,250 each', () => {
    const c = capFiler401k(30_000, 49, 100_000, 0.5, L);
    expect(c.trad).toBe(12_250);
    expect(c.roth).toBe(12_250);
    expect(c.catchUpUsed).toBe(0);
  });

  it('at 50, $30k fits under $32.5k and splits evenly', () => {
    const c = capFiler401k(30_000, 50, 100_000, 0.5, L);
    expect(c.trad + c.roth).toBe(30_000);
    expect(c.trad).toBe(15_000);
    expect(c.catchUpUsed).toBe(5_500);
  });

  it('at 60, the super catch-up caps a $40k request at $35,750', () => {
    const c = capFiler401k(40_000, 60, 100_000, 0, L);
    expect(c.trad + c.roth).toBe(35_750);
  });

  it('forces the catch-up to Roth above the wage threshold (gate #10)', () => {
    const c = capFiler401k(32_500, 52, 200_000, 0, L);
    expect(c.forcedRothCatchUp).toBe(true);
    expect(c.trad).toBe(24_500);
    expect(c.roth).toBe(8_000);
  });

  it('does not force below the threshold', () => {
    const c = capFiler401k(32_500, 52, 100_000, 0, L);
    expect(c.forcedRothCatchUp).toBe(false);
    expect(c.trad).toBe(32_500);
    expect(c.roth).toBe(0);
  });
});

describe('capFilerIra', () => {
  it('caps at $7.5k under 50, $8.6k at 50+', () => {
    expect(capFilerIra(10_000, 49, L)).toBe(7_500);
    expect(capFilerIra(10_000, 50, L)).toBe(8_600);
    expect(capFilerIra(5_000, 49, L)).toBe(5_000);
  });
});

describe('capHouseholdHsa', () => {
  it('family coverage with one 55+ filer: $8,750 + $1,000', () => {
    expect(capHouseholdHsa(20_000, [56, 53], 'family', L)).toBe(9_750);
  });

  it('self-only 56-year-old: $4,400 + $1,000', () => {
    expect(capHouseholdHsa(20_000, [56], 'selfOnly', L)).toBe(5_400);
  });

  it('two 55–64 filers get both catch-ups (ASSUMPTIONS M18)', () => {
    expect(capHouseholdHsa(20_000, [58, 56], 'family', L)).toBe(10_750);
  });

  it('zero once every filer is 65+ (auto-stop); 65+ filers add no catch-up', () => {
    expect(capHouseholdHsa(20_000, [66], 'selfOnly', L)).toBe(0);
    expect(capHouseholdHsa(20_000, [66, 64], 'family', L)).toBe(9_750);
  });
});

describe('matchAmount (gate #7)', () => {
  const m = (over: Partial<EmployerMatch> = {}): EmployerMatch => ({
    mode: 'percent',
    rate: 0.5,
    capPctOfSalary: 0.06,
    flatAmount: 0,
    destination: 'trad401k',
    vestingPct: 1,
    ...over,
  });

  it('is rate × min(deferral, cap × salary)', () => {
    expect(matchAmount(m(), 10_000, 100_000, 0)).toBe(3_000);
    expect(matchAmount(m(), 4_000, 100_000, 0)).toBe(2_000);
  });

  it('is zero when the deferral is zero — stopping contributions loses the match', () => {
    expect(matchAmount(m(), 0, 100_000, 0)).toBe(0);
  });

  it('flat mode is unconditional (profit-sharing stand-in)', () => {
    expect(matchAmount(m({ mode: 'flat' }), 0, 0, 2_000)).toBe(2_000);
  });
});

describe('clamp415c', () => {
  it('clamps match to the 415(c) room after the base deferral', () => {
    expect(clamp415c(24_500, 73_500, 0, L)).toBe(47_500);
    expect(clamp415c(24_500, 3_000, 0, L)).toBe(3_000);
    expect(clamp415c(72_000, 3_000, 0, L)).toBe(0);
  });
});
