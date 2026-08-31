/**
 * Quick-action row operations and validation (M4.5 B.2/C.1). Quick actions
 * NORMALIZE rows — clip and drop, never append override rows — so the result
 * is non-overlapping and readable without knowing the overlap rule (which
 * remains in force for manual edits). Pure functions, no React.
 */

import type { ScheduleRow } from '../engine/types';

/** "Stop at X": clip every row to end ≤ X−1; drop rows starting at or after X. */
export function stopAt(rows: ScheduleRow[], stopAge: number): ScheduleRow[] {
  return rows
    .filter((r) => r.fromAge < stopAge)
    .map((r) =>
      r.toAge === null || r.toAge >= stopAge ? { ...r, toAge: stopAge - 1 } : { ...r },
    );
}

/** "Reduce to Y from Z": clip to Z−1, then one open row at the new value. */
export function reduceTo(rows: ScheduleRow[], value: number, fromAge: number): ScheduleRow[] {
  return [...stopAt(rows, fromAge), { fromAge, toAge: null, value }];
}

/** "Lower return to X% from age Y" (C.2) — same mechanism; the Stress preset (M6) reuses it. */
export const lowerReturnFrom = reduceTo;

/** "Until age X": the last row's end becomes X. */
export function untilAge(rows: ScheduleRow[], endAge: number): ScheduleRow[] {
  if (rows.length === 0) return rows;
  return rows.map((r, i) => (i === rows.length - 1 ? { ...r, toAge: endAge } : { ...r }));
}

/**
 * Default age for a quick-action field (C.1): the paired strategy's drawdown
 * start when known, else the schedule's current visible end — never the
 * horizon fallback.
 */
export function quickActionDefaultAge(
  rows: ScheduleRow[],
  fallbackAge: number,
  drawdownStartAge?: number,
): number {
  if (drawdownStartAge !== undefined) return drawdownStartAge;
  const ends = rows.map((r) => r.toAge ?? r.fromAge);
  return ends.length > 0 ? Math.max(...ends) : fallbackAge;
}

export interface RowError {
  index: number;
  message: string;
}

/** Mirrors the resolver's throw conditions as inline messages (M4.5 B.1b). */
export function validateRows(rows: ScheduleRow[]): RowError[] {
  const errors: RowError[] = [];
  rows.forEach((r, index) => {
    if (!Number.isInteger(r.fromAge) || (r.toAge !== null && !Number.isInteger(r.toAge))) {
      errors.push({ index, message: 'ages must be whole years' });
    } else if (r.toAge !== null && r.toAge < r.fromAge) {
      errors.push({ index, message: 'end age must be ≥ start age' });
    }
  });
  return errors;
}
