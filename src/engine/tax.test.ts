import { describe, expect, it } from 'vitest';
import { defaultAssumptions } from './defaults';
import { cashInterestTax, dividendDrag } from './tax';

describe('dividendDrag', () => {
  it('is balance × yield × dividend tax rate', () => {
    expect(dividendDrag(10_000, 0.02, 0.15)).toBe(30);
    expect(dividendDrag(0, 0.02, 0.15)).toBe(0);
  });
});

describe('cashInterestTax (gate #8)', () => {
  const a = defaultAssumptions(2026); // marginal 24%, effective 12%, state 0

  it('uses marginal-now during accumulation', () => {
    expect(cashInterestTax(400, 'accumulation', a)).toBeCloseTo(96, 10);
  });

  it('uses the effective retirement rate during drawdown', () => {
    expect(cashInterestTax(400, 'drawdown', a)).toBeCloseTo(48, 10);
  });

  it('adds the flat state rate additively', () => {
    const withState = { ...a, stateTaxRate: 0.05 };
    expect(cashInterestTax(400, 'accumulation', withState)).toBeCloseTo(400 * 0.29, 10);
  });
});

// ---------------------------------------------------------------------------
// Bracket mode (M7)
// ---------------------------------------------------------------------------

import { DEFAULT_BRACKET_TABLES } from './defaults';
import {
  grossOrdinaryFromNet,
  marginalOrdinaryTax,
  ordinaryTax,
  resolveBracketTable,
  roomToBracketTop,
} from './tax';

const SINGLE = DEFAULT_BRACKET_TABLES.single;

describe('ordinaryTax (M7 golden cases, 2026 single table)', () => {
  it('taxable 50,000 (OI 66,100): 12,400×10% + 37,600×12% = 5,752.00 to the cent', () => {
    expect(ordinaryTax(66_100, SINGLE, 0)).toBeCloseTo(5_752, 10);
  });

  it('below the deduction: zero', () => {
    expect(ordinaryTax(16_100, SINGLE, 0)).toBe(0);
    expect(ordinaryTax(5_000, SINGLE, 0)).toBe(0);
  });

  it('state rides on top of every bracket: +5% state adds 50,000×5% here', () => {
    expect(ordinaryTax(66_100, SINGLE, 0.05)).toBeCloseTo(5_752 + 50_000 * 0.05, 10);
  });

  it('top bracket is unbounded: OI 1,016,100 reaches 37%', () => {
    const taxable = 1_000_000;
    const expected =
      12_400 * 0.1 +
      (50_400 - 12_400) * 0.12 +
      (105_700 - 50_400) * 0.22 +
      (201_775 - 105_700) * 0.24 +
      (256_225 - 201_775) * 0.32 +
      (640_600 - 256_225) * 0.35 +
      (taxable - 640_600) * 0.37;
    expect(ordinaryTax(taxable + 16_100, SINGLE, 0)).toBeCloseTo(expected, 8);
  });
});

describe('marginalOrdinaryTax + grossOrdinaryFromNet (M7)', () => {
  it('marginal stacking telescopes: tax(pool+add) − tax(pool)', () => {
    expect(marginalOrdinaryTax(17_000, 45_295.454545, SINGLE, 0)).toBeCloseTo(
      ordinaryTax(62_295.454545, SINGLE, 0) - ordinaryTax(17_000, SINGLE, 0),
      10,
    );
  });

  it('gross-up across the 10%→12% boundary nets exactly (the bracket.json hand case)', () => {
    // pool 17,000 (85% of a 20k SS row): 11,500 gross at 10% nets 10,350;
    // the rest at 12% → total gross 11,500 + 29,740/0.88 = 45,295.45…
    const gross = grossOrdinaryFromNet(40_090, 17_000, 1, SINGLE, 0);
    expect(gross).toBeCloseTo(11_500 + 29_740 / 0.88, 6);
    // and it really nets what was asked
    expect(gross - marginalOrdinaryTax(17_000, gross, SINGLE, 0)).toBeCloseTo(40_090, 6);
  });

  it('inside the zero-tax zone gross = net', () => {
    expect(grossOrdinaryFromNet(5_000, 0, 1, SINGLE, 0)).toBeCloseTo(5_000, 10);
  });

  it('pro-rata basis fraction: only half the gross is taxable', () => {
    const gross = grossOrdinaryFromNet(20_000, 100_000, 0.5, SINGLE, 0);
    expect(gross - marginalOrdinaryTax(100_000, gross * 0.5, SINGLE, 0)).toBeCloseTo(20_000, 6);
  });

  it('the +20% penalty applies to the FULL gross on top of bracket slices', () => {
    const gross = grossOrdinaryFromNet(10_000, 100_000, 1, SINGLE, 0, 0.2);
    expect(gross - marginalOrdinaryTax(100_000, gross, SINGLE, 0) - 0.2 * gross).toBeCloseTo(
      10_000,
      6,
    );
  });
});

describe('resolveBracketTable (M7)', () => {
  const a = defaultAssumptions(2026); // inflation 3%, indexed

  it('indexes deduction and bounds at the START-OF-YEAR exponent (t−1), never rates', () => {
    const t5 = resolveBracketTable(a, 5);
    const factor = Math.pow(1.03, 4); // t−1 — in step with spending, not limits
    expect(t5.standardDeduction).toBeCloseTo(16_100 * factor, 8);
    expect(t5.brackets[0].upTo).toBeCloseTo(12_400 * factor, 8);
    expect(t5.brackets[0].rate).toBe(0.1);
    expect(t5.brackets[6].upTo).toBeNull();
  });

  it('unindexed when the toggle is off; filing status picks the table', () => {
    const flat = { ...a, indexWithInflation: false };
    expect(resolveBracketTable(flat, 20).standardDeduction).toBe(16_100);
    const mfj = { ...a, filingStatus: 'marriedJoint' as const };
    expect(resolveBracketTable(mfj, 0).standardDeduction).toBe(32_200);
  });

  it('user-edited tables win over the defaults', () => {
    const edited = {
      ...a,
      bracketTables: {
        ...DEFAULT_BRACKET_TABLES,
        single: { standardDeduction: 20_000, brackets: [{ upTo: null, rate: 0.25 }] },
      },
    };
    expect(resolveBracketTable(edited, 0).standardDeduction).toBe(20_000);
    expect(ordinaryTax(120_000, resolveBracketTable(edited, 0), 0)).toBeCloseTo(25_000, 10);
  });
});

describe('roomToBracketTop (M8 hook)', () => {
  it('room from a pool to the top of the 12% bracket', () => {
    expect(roomToBracketTop(30_000, 0.12, SINGLE)).toBeCloseTo(16_100 + 50_400 - 30_000, 10);
  });
  it('null for the unbounded top bracket or a missing rate', () => {
    expect(roomToBracketTop(0, 0.37, SINGLE)).toBeNull();
    expect(roomToBracketTop(0, 0.99, SINGLE)).toBeNull();
  });
});
