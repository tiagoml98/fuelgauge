import { describe, expect, it } from 'vitest';
import { resolveOneTime, resolveSchedule, toReal, type ResolveOpts } from './schedule';
import type { OneTimeRow, ScheduleRow } from './types';

const opts = (over: Partial<ResolveOpts> = {}): ResolveOpts => ({
  startAge: 30,
  endAge: 55,
  indexed: false,
  inflation: 0.03,
  ...over,
});

const at = (values: number[], startAge: number, age: number) => values[age - startAge];

describe('resolveSchedule', () => {
  it('returns all zeros for empty rows, one slot per age inclusive', () => {
    const out = resolveSchedule([], opts());
    expect(out).toHaveLength(26); // 30..55
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it('fills gaps with zero and includes both boundary ages', () => {
    const rows: ScheduleRow[] = [{ fromAge: 32, toAge: 34, value: 100 }];
    const out = resolveSchedule(rows, opts());
    expect(at(out, 30, 31)).toBe(0);
    expect(at(out, 30, 32)).toBe(100);
    expect(at(out, 30, 34)).toBe(100);
    expect(at(out, 30, 35)).toBe(0);
  });

  it('SPEC §12: contributions end at 40 → zero from 41', () => {
    const rows: ScheduleRow[] = [{ fromAge: 30, toAge: 40, value: 5000 }];
    const out = resolveSchedule(rows, opts());
    expect(at(out, 30, 40)).toBe(5000);
    expect(at(out, 30, 41)).toBe(0);
  });

  it('SPEC §12: "$2,000 from 45 to 50" resumes exactly then', () => {
    const rows: ScheduleRow[] = [
      { fromAge: 30, toAge: 40, value: 5000 },
      { fromAge: 45, toAge: 50, value: 2000 },
    ];
    const out = resolveSchedule(rows, opts());
    expect(at(out, 30, 44)).toBe(0);
    expect(at(out, 30, 45)).toBe(2000);
    expect(at(out, 30, 50)).toBe(2000);
    expect(at(out, 30, 51)).toBe(0);
  });

  it('later rows win on overlap ("Reduce to $Y from Z" appends an override)', () => {
    const rows: ScheduleRow[] = [
      { fromAge: 30, toAge: 50, value: 10000 },
      { fromAge: 40, toAge: null, value: 4000 },
    ];
    const out = resolveSchedule(rows, opts());
    expect(at(out, 30, 39)).toBe(10000);
    expect(at(out, 30, 40)).toBe(4000);
    expect(at(out, 30, 55)).toBe(4000);
  });

  it('M1 gate #6: an interior override wins inside its range, then the earlier row resumes', () => {
    const rows: ScheduleRow[] = [
      { fromAge: 30, toAge: 50, value: 10000 },
      { fromAge: 40, toAge: 45, value: 5000 },
    ];
    const out = resolveSchedule(rows, opts());
    expect(at(out, 30, 39)).toBe(10000);
    expect(at(out, 30, 40)).toBe(5000);
    expect(at(out, 30, 45)).toBe(5000);
    expect(at(out, 30, 46)).toBe(10000);
    expect(at(out, 30, 50)).toBe(10000);
    expect(at(out, 30, 51)).toBe(0);
  });

  it('toAge null runs to endAge', () => {
    const out = resolveSchedule([{ fromAge: 50, toAge: null, value: 7 }], opts());
    expect(at(out, 30, 49)).toBe(0);
    expect(at(out, 30, 50)).toBe(7);
    expect(at(out, 30, 55)).toBe(7);
  });

  it('rows partly or fully outside the window are clipped, not errors', () => {
    const rows: ScheduleRow[] = [
      { fromAge: 20, toAge: 31, value: 1 },
      { fromAge: 60, toAge: 70, value: 2 },
    ];
    const out = resolveSchedule(rows, opts());
    expect(at(out, 30, 30)).toBe(1);
    expect(at(out, 30, 31)).toBe(1);
    expect(at(out, 30, 32)).toBe(0);
    expect(out.includes(2)).toBe(false);
  });

  it('indexes today\'s $ by (1+i)^(age − startAge) when indexed', () => {
    const rows: ScheduleRow[] = [{ fromAge: 30, toAge: null, value: 1000 }];
    const out = resolveSchedule(rows, opts({ indexed: true }));
    expect(at(out, 30, 30)).toBe(1000); // year 0: exponent 0
    expect(at(out, 30, 40)).toBeCloseTo(1000 * 1.03 ** 10, 8);
    expect(at(out, 30, 55)).toBeCloseTo(1000 * 1.03 ** 25, 8);
  });

  it('startOfYear timing indexes to the year-start price level (M3 correction #1)', () => {
    const rows: ScheduleRow[] = [{ fromAge: 30, toAge: null, value: 1000 }];
    const out = resolveSchedule(rows, opts({ indexed: true, timing: 'startOfYear' }));
    expect(at(out, 30, 31)).toBe(1000); // first drawdown year draws at today's level
    expect(at(out, 30, 40)).toBeCloseTo(1000 * 1.03 ** 9, 8); // one year less than endOfYear
    const oneTime = resolveOneTime([{ age: 40, amount: 10_000, label: 'x' }], opts({ indexed: true, timing: 'startOfYear' }));
    expect(at(oneTime, 30, 40)).toBeCloseTo(10_000 * 1.03 ** 9, 8);
  });

  it('indexed with zero inflation equals unindexed', () => {
    const rows: ScheduleRow[] = [{ fromAge: 30, toAge: null, value: 1000 }];
    expect(resolveSchedule(rows, opts({ indexed: true, inflation: 0 }))).toEqual(
      resolveSchedule(rows, opts()),
    );
  });

  it('throws on malformed input', () => {
    expect(() => resolveSchedule([{ fromAge: 40, toAge: 30, value: 1 }], opts())).toThrow();
    expect(() => resolveSchedule([{ fromAge: 30.5, toAge: 40, value: 1 }], opts())).toThrow();
    expect(() => resolveSchedule([], opts({ endAge: 20 }))).toThrow();
    expect(() => resolveSchedule([], opts({ startAge: 30.5, endAge: 40 }))).toThrow();
  });
});

describe('resolveOneTime', () => {
  const row = (age: number, amount: number): OneTimeRow => ({ age, amount, label: 'x' });

  it('places a single row at its age only', () => {
    const out = resolveOneTime([row(35, 200_000)], opts());
    expect(at(out, 30, 35)).toBe(200_000);
    expect(out.filter((v) => v !== 0)).toHaveLength(1);
  });

  it('sums rows at the same age', () => {
    const out = resolveOneTime([row(35, 100), row(35, 50)], opts());
    expect(at(out, 30, 35)).toBe(150);
  });

  it('ignores rows outside the window', () => {
    const out = resolveOneTime([row(20, 100), row(60, 100)], opts());
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it('windfall-style (unindexed) rows land at face value — gate #12', () => {
    const out = resolveOneTime([row(32, 200_000)], opts());
    expect(at(out, 30, 32)).toBe(200_000);
  });

  it('indexed rows (one-time expenses) inflate by years from startAge', () => {
    const out = resolveOneTime([row(40, 10_000)], opts({ indexed: true }));
    expect(at(out, 30, 40)).toBeCloseTo(10_000 * 1.03 ** 10, 8);
  });

  it('throws on non-integer age', () => {
    expect(() => resolveOneTime([row(35.5, 1)], opts())).toThrow();
  });
});

describe('toReal', () => {
  it('SPEC §12: real display divides nominal by 1.03^10 after 10 years', () => {
    const nominal = 123_456.78;
    expect(toReal(nominal, 10, 0.03)).toBeCloseTo(nominal / 1.03 ** 10, 8);
  });

  it('is the identity at zero years and at zero inflation', () => {
    expect(toReal(5000, 0, 0.03)).toBe(5000);
    expect(toReal(5000, 25, 0)).toBe(5000);
  });

  it('round-trips an indexed schedule back to today\'s dollars', () => {
    const rows: ScheduleRow[] = [{ fromAge: 30, toAge: null, value: 2000 }];
    const nominal = resolveSchedule(rows, opts({ indexed: true }));
    for (let i = 0; i < nominal.length; i++) {
      expect(toReal(nominal[i], i, 0.03)).toBeCloseTo(2000, 8);
    }
  });
});
