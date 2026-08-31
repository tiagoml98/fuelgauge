import { describe, expect, it } from 'vitest';
import type { ScheduleRow } from '../engine/types';
import { quickActionDefaultAge, reduceTo, stopAt, untilAge, validateRows } from './scheduleOps';

describe('stopAt (M4.5 B.2 — the reported bug case)', () => {
  it('one open row "31 → ∞ = 20,000", stop at 40 → "31 → 39 = 20,000"', () => {
    const rows: ScheduleRow[] = [{ fromAge: 31, toAge: null, value: 20_000 }];
    expect(stopAt(rows, 40)).toEqual([{ fromAge: 31, toAge: 39, value: 20_000 }]);
  });

  it('drops rows starting at or after the stop age; clips crossing rows; leaves earlier rows alone', () => {
    const rows: ScheduleRow[] = [
      { fromAge: 31, toAge: 35, value: 10_000 },
      { fromAge: 36, toAge: 45, value: 20_000 },
      { fromAge: 46, toAge: null, value: 30_000 },
    ];
    expect(stopAt(rows, 40)).toEqual([
      { fromAge: 31, toAge: 35, value: 10_000 },
      { fromAge: 36, toAge: 39, value: 20_000 },
    ]);
  });

  it('does not mutate the input', () => {
    const rows: ScheduleRow[] = [{ fromAge: 31, toAge: null, value: 20_000 }];
    stopAt(rows, 40);
    expect(rows[0].toAge).toBeNull();
  });
});

describe('reduceTo', () => {
  it('clips to Z−1 and appends one open row at the new value — non-overlapping result', () => {
    const rows: ScheduleRow[] = [{ fromAge: 31, toAge: null, value: 20_000 }];
    expect(reduceTo(rows, 5_000, 40)).toEqual([
      { fromAge: 31, toAge: 39, value: 20_000 },
      { fromAge: 40, toAge: null, value: 5_000 },
    ]);
  });
});

describe('untilAge', () => {
  it('sets the last row\'s end', () => {
    const rows: ScheduleRow[] = [
      { fromAge: 31, toAge: 35, value: 1 },
      { fromAge: 40, toAge: null, value: 2 },
    ];
    expect(untilAge(rows, 50)).toEqual([
      { fromAge: 31, toAge: 35, value: 1 },
      { fromAge: 40, toAge: 50, value: 2 },
    ]);
    expect(untilAge([], 50)).toEqual([]);
  });
});

describe('quickActionDefaultAge (C.1 — never the horizon fallback)', () => {
  it('prefers drawdown start, then the schedule\'s visible end, then the fallback', () => {
    const rows: ScheduleRow[] = [{ fromAge: 31, toAge: 45, value: 1 }];
    expect(quickActionDefaultAge(rows, 31, 55)).toBe(55);
    expect(quickActionDefaultAge(rows, 31)).toBe(45);
    expect(quickActionDefaultAge([{ fromAge: 31, toAge: null, value: 1 }], 31)).toBe(31);
    expect(quickActionDefaultAge([], 31)).toBe(31);
  });
});

describe('validateRows (B.1b — inline messages instead of resolver throws)', () => {
  it('flags toAge < fromAge with a readable message, no throw', () => {
    const errors = validateRows([{ fromAge: 30, toAge: 5, value: 1 }]);
    expect(errors).toEqual([{ index: 0, message: 'end age must be ≥ start age' }]);
  });

  it('flags non-integer ages; passes valid rows', () => {
    expect(validateRows([{ fromAge: 30.5, toAge: 40, value: 1 }])[0].message).toContain('whole');
    expect(validateRows([{ fromAge: 30, toAge: null, value: 1 }])).toEqual([]);
  });
});
