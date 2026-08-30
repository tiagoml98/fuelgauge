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
