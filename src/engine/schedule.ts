/**
 * Schedule resolver (SPEC §5) and real/nominal conversion (gate #14).
 * Pure functions — no clocks, no I/O, no React.
 */

import type { OneTimeRow, ScheduleRow } from './types';

export interface ResolveOpts {
  /**
   * The row-owner's current age — "today" in their age domain. Per-filer rows
   * resolve with that filer's own current age (gate #1); callers map domains.
   * The indexing exponent for age a is (a − startAge) = years from today.
   */
  startAge: number;
  /** Inclusive. */
  endAge: number;
  /** When true, today's-$ values are indexed to nominal at (1+inflation)^years. */
  indexed: boolean;
  inflation: number;
}

function validateOpts({ startAge, endAge }: ResolveOpts): void {
  if (!Number.isInteger(startAge) || !Number.isInteger(endAge)) {
    throw new Error(`resolve: startAge/endAge must be integers (got ${startAge}, ${endAge})`);
  }
  if (endAge < startAge) {
    throw new Error(`resolve: endAge ${endAge} < startAge ${startAge}`);
  }
}

function validateRow(fromAge: number, toAge: number | null): void {
  if (!Number.isInteger(fromAge) || (toAge !== null && !Number.isInteger(toAge))) {
    throw new Error(`schedule row ages must be integers (got ${fromAge}–${toAge})`);
  }
  if (toAge !== null && toAge < fromAge) {
    throw new Error(`schedule row fromAge ${fromAge} > toAge ${toAge}`);
  }
}

/**
 * Rows → one value per age, startAge..endAge inclusive. Gaps are 0. toAge null
 * runs to endAge. Overlaps: later rows win — quick actions ("Reduce to $Y from
 * Z") append override rows.
 */
export function resolveSchedule(rows: ScheduleRow[], opts: ResolveOpts): number[] {
  validateOpts(opts);
  const { startAge, endAge, indexed, inflation } = opts;
  const out = new Array<number>(endAge - startAge + 1).fill(0);
  for (const row of rows) {
    validateRow(row.fromAge, row.toAge);
    const from = Math.max(row.fromAge, startAge);
    const to = Math.min(row.toAge ?? endAge, endAge);
    for (let age = from; age <= to; age++) {
      out[age - startAge] = row.value;
    }
  }
  if (indexed && inflation !== 0) {
    for (let i = 0; i < out.length; i++) {
      out[i] *= Math.pow(1 + inflation, i);
    }
  }
  return out;
}

/**
 * One-time rows → per-age array; rows at the same age sum; rows outside the
 * range are ignored. Windfalls resolve with indexed: false (nominal, gate #12);
 * one-time expenses with indexed: true.
 */
export function resolveOneTime(rows: OneTimeRow[], opts: ResolveOpts): number[] {
  validateOpts(opts);
  const { startAge, endAge, indexed, inflation } = opts;
  const out = new Array<number>(endAge - startAge + 1).fill(0);
  for (const row of rows) {
    if (!Number.isInteger(row.age)) {
      throw new Error(`one-time row age must be an integer (got ${row.age})`);
    }
    if (row.age < startAge || row.age > endAge) continue;
    const factor = indexed && inflation !== 0 ? Math.pow(1 + inflation, row.age - startAge) : 1;
    out[row.age - startAge] += row.amount * factor;
  }
  return out;
}

/**
 * Nominal → today's dollars: nominal ÷ (1+inflation)^yearsFromNow (SPEC §4).
 * The one inflation-division in the codebase — metrics, the table script, and
 * the UI all use this (gate #14).
 */
export function toReal(nominal: number, yearsFromNow: number, inflation: number): number {
  return nominal / Math.pow(1 + inflation, yearsFromNow);
}
