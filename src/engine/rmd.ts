/**
 * Required minimum distributions (M10, SPEC §10.3). Drawdown years only —
 * the still-working exception is not modeled, and accumulation years assume
 * salary covers spending (ASSUMPTIONS). Per filer from the birth-year start
 * age (73 for 1951–59, 75 for 1960+): RMD = combined pre-tax balance at the
 * START of the year (= end of y−1; the 401k→IRA rollover doesn't change the
 * sum) ÷ the Uniform Lifetime Table divisor at this year's age. Real 401k
 * RMDs are computed separately from IRA RMDs — the model aggregates
 * (documented). Forced gross draw trad401k → tradIra; tax comes out of the
 * distribution (bracket = marginal on the pool, simple = flat); the net is
 * applied to need first in run.ts, surplus → invested taxable with basis.
 */

import { rmdStartAge } from './access';
import { type FilerState, type SimContext } from './accumulate';
import { UNIFORM_LIFETIME_TABLE } from './defaults';
import { marginalOrdinaryTax, preTaxWithdrawalRate } from './tax';
import type { MarkerEvent, RunYear } from './types';

const EPS = 0.005;

/** The divisor at `age`; ages past 120 keep the final divisor. */
export function uniformLifetimeDivisor(age: number): number | null {
  if (age < 72) return null;
  return UNIFORM_LIFETIME_TABLE[Math.min(age, 120)] ?? null;
}

/**
 * Execute this year's RMDs. `priorPreTax` per filer must be captured BEFORE
 * rollovers/withdrawals (the start-of-year = end-of-prior-year balance).
 * Mutates balances and (bracket mode) the ordinary pool; returns the record
 * plus tax paid, and pushes the rmdStart marker in each filer's first year.
 */
export function takeRmds(
  ctx: SimContext,
  t: number,
  priorPreTax: number[],
  events: MarkerEvent[],
  rmdMarked: Set<number>,
): {
  rmd: NonNullable<RunYear['rmd']> | null;
  taxPaid: number;
  grossByAccount: { trad401k: number; tradIra: number };
} {
  const { a } = ctx;
  const age = ctx.startAge + t;
  const entries: NonNullable<RunYear['rmd']>['entries'] = [];
  const grossByAccount = { trad401k: 0, tradIra: 0 };
  let netTotal = 0;
  let taxPaid = 0;

  for (let f = 0; f < ctx.filers.length; f++) {
    const ageF = a.filers[f].currentAge + t;
    const birthYear = a.currentYear - a.filers[f].currentAge;
    if (ageF < rmdStartAge(birthYear)) continue;
    const divisor = uniformLifetimeDivisor(ageF);
    if (divisor === null || priorPreTax[f] <= EPS) continue;
    const s = ctx.filers[f];
    const rmdGross = Math.min(priorPreTax[f] / divisor, s.trad401k + s.tradIra);
    if (rmdGross <= EPS) continue;

    if (!rmdMarked.has(f)) {
      rmdMarked.add(f);
      events.push({ kind: 'rmdStart', age, label: `RMDs begin (filer ${f + 1})` });
    }

    // forced draw trad401k → tradIra, match/basis pro-rata like other draws
    let remaining = rmdGross;
    let taxableSlice = 0;
    const drawFrom = (acct: 'trad401k' | 'tradIra') => {
      const balance = s[acct];
      if (balance <= EPS || remaining <= EPS) return;
      const take = Math.min(balance, remaining);
      grossByAccount[acct] += take;
      if (acct === 'trad401k') {
        s.matchTrad = Math.max(0, s.matchTrad - take * (s.matchTrad / balance));
        s.trad401k -= take;
        taxableSlice += take;
      } else {
        const basisPart = take * (s.tradIraBasis / balance);
        s.tradIraBasis -= basisPart;
        s.tradIra -= take;
        taxableSlice += take - basisPart; // nondeductible basis comes out untaxed
      }
      remaining -= take;
    };
    drawFrom('trad401k');
    drawFrom('tradIra');

    // tax comes out of the distribution itself
    let tax: number;
    if (ctx.taxCtx !== undefined) {
      tax = marginalOrdinaryTax(ctx.taxCtx.pool, taxableSlice, ctx.taxCtx.table, ctx.taxCtx.stateRate);
      ctx.taxCtx.pool += taxableSlice;
    } else {
      tax = taxableSlice * preTaxWithdrawalRate(a);
    }
    taxPaid += tax;
    netTotal += rmdGross - tax;
    entries.push({ filer: f, priorPreTax: priorPreTax[f], divisor, gross: rmdGross, tax });
  }

  if (entries.length === 0) return { rmd: null, taxPaid: 0, grossByAccount };
  // appliedToNeed/toTaxable are filled by run.ts once the year's need is known
  return { rmd: { entries, net: netTotal, appliedToNeed: 0, toTaxable: 0 }, taxPaid, grossByAccount };
}

/** Combined pre-tax balance per filer, captured at the start of the year. */
export function preTaxBalances(ctx: SimContext): number[] {
  return ctx.filers.map((s: FilerState) => s.trad401k + s.tradIra);
}
