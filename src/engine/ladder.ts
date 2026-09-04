/**
 * Conversion ladder (M8, SPEC §9-2.1 / §10.1). Runs each drawdown year AFTER
 * withdrawals (spending first — fill-to-bracket fills the room LEFT OVER, so
 * a year that draws pre-tax for spending never has that spending pushed into
 * a higher bracket by the conversion) and before growth.
 *
 * Rows are ADDITIVE and processed in order. amount rows are today's $,
 * indexed at the start-of-year exponent; fill rows convert up to the top of
 * the named bracket (bracket mode only — skipped with a note in simple mode).
 * Conversions draw filer 1 then filer 2, trad401k before tradIra; the tranche
 * lands as {year, amount, taxablePortion: amount} and unlocks at the EARLIER
 * of +5 tax years or the owner's ceil(59.5) year.
 *
 * Conversion tax: bracket = marginal on the year's pool (the conversion then
 * joins the pool); simple = flat effective + state. Paid from cash first,
 * then taxable (sale taxed on the gain portion, basis reduced pro-rata);
 * whatever remains is WITHHELD from the conversion itself — W = shortfall /
 * (1 − 10% penalty) before the owner's ceil(59.5) year, W = shortfall after —
 * shrinking the tranche (both amount and taxablePortion) and flagged for the
 * UI warning.
 */

import { conversionUnlockYear } from './access';
import { snapDust } from './drawdown';
import { noteOnce, type SimContext } from './accumulate';
import { EARLY_WITHDRAWAL_PENALTY, PRETAX_ACCESS_AGE } from './defaults';
import { timingExponent } from './schedule';
import {
  grossFromNet,
  marginalOrdinaryTax,
  preTaxWithdrawalRate,
  roomToBracketTop,
  taxableSaleRate,
} from './tax';
import type { LadderYear, MarkerEvent, WithdrawalStrategy } from './types';

const EPS = 0.005;

/**
 * Execute the year's ladder conversions. Returns the LadderYear record (or
 * null when nothing converted) plus the tax actually paid this step; mutates
 * balances, the tranche list, and (bracket mode) the ordinary pool.
 */
export function convertYear(
  ctx: SimContext,
  t: number,
  w: WithdrawalStrategy,
  events: MarkerEvent[],
): { ladder: LadderYear | null; taxPaid: number } {
  const rows = w.ladder ?? [];
  if (rows.length === 0) return { ladder: null, taxPaid: 0 };
  const { a } = ctx;
  const age = ctx.startAge + t; // filer-1 end-of-year age
  const year = a.currentYear + t;
  const indexFactor = a.indexWithInflation
    ? Math.pow(1 + a.inflation, timingExponent(t, 'startOfYear'))
    : 1;

  const poolBeforeConversion = ctx.taxCtx?.pool ?? 0;
  let taxPaid = 0;
  let converted = 0;
  let conversionTax = 0;
  const paidFrom: LadderYear['paidFrom'] = {};
  let penalty = 0;

  // Which filer receives the tranche: the first one that had pre-tax to give.
  let trancheFiler = -1;

  for (const row of rows) {
    if (age < row.fromAge || (row.toAge !== null && age > row.toAge)) continue;
    let desired = 0;
    if (row.amount !== undefined) {
      desired = row.amount * indexFactor;
    } else if (row.fillToBracketPct !== undefined) {
      if (ctx.taxCtx === undefined) {
        noteOnce(ctx, 'ladder-fill-simple', events, age, 'ladder fill-to-bracket rows need bracket mode — skipped');
        continue;
      }
      const room = roomToBracketTop(ctx.taxCtx.pool, row.fillToBracketPct, ctx.taxCtx.table);
      if (room === null) {
        noteOnce(ctx, 'ladder-fill-rate', events, age, `no bounded ${Math.round(row.fillToBracketPct * 100)}% bracket in the table — fill row skipped`);
        continue;
      }
      desired = room;
    }
    if (desired <= EPS) continue;

    // Draw the conversion from pre-tax: filer 1 → 2, trad401k → tradIra
    for (let f = 0; f < ctx.filers.length && desired > EPS; f++) {
      const s = ctx.filers[f];
      for (const acct of ['trad401k', 'tradIra'] as const) {
        if (desired <= EPS) break;
        const balance = s[acct];
        if (balance <= EPS) continue;
        const take = Math.min(balance, desired);
        if (acct === 'trad401k') {
          s.matchTrad = Math.max(0, s.matchTrad - take * (s.matchTrad / balance));
          s.trad401k -= take;
        } else {
          // pro-rata basis reduction like withdrawals; the tranche still
          // carries taxablePortion = amount (conservative, ASSUMPTIONS)
          s.tradIraBasis -= take * (s.tradIraBasis / balance);
          s.tradIra -= take;
        }
        desired -= take;
        converted += take;
        if (trancheFiler === -1) trancheFiler = f;
        // tax on this slice: marginal on the running pool, or flat in simple mode
        if (ctx.taxCtx !== undefined) {
          conversionTax += marginalOrdinaryTax(ctx.taxCtx.pool, take, ctx.taxCtx.table, ctx.taxCtx.stateRate);
          ctx.taxCtx.pool += take;
        } else {
          conversionTax += take * preTaxWithdrawalRate(a);
        }
      }
    }
  }

  if (converted <= EPS) return { ladder: null, taxPaid: 0 };
  taxPaid += conversionTax;

  // The receiving tranche (one per year, on the first contributing filer)
  const owner = ctx.filers[trancheFiler];
  const ownerAge = a.filers[trancheFiler].currentAge + t;
  const tranche = { year, amount: converted, taxablePortion: converted };
  owner.rothIra.conversions.push(tranche);
  owner.rothIra.firstFundedYear ??= year;

  // Pay the conversion tax: cash → taxable (sale taxed on the gain) →
  // withheld from the conversion itself (penalized before ceil(59.5))
  let bill = conversionTax;
  const fromCash = Math.min(ctx.cash, bill);
  if (fromCash > EPS) {
    ctx.cash -= fromCash;
    bill -= fromCash;
    paidFrom.cash = fromCash;
  }
  if (bill > EPS && ctx.taxable > EPS) {
    const saleRate = taxableSaleRate(a);
    const gainFrac = Math.max(0, ctx.taxable - ctx.taxableBasis) / ctx.taxable;
    const maxNet = ctx.taxable - Math.max(0, ctx.taxable - ctx.taxableBasis) * saleRate;
    const net = Math.min(bill, maxNet);
    const gross = net >= maxNet - EPS ? ctx.taxable : grossFromNet(net, gainFrac, saleRate);
    ctx.taxableBasis -= gross * (ctx.taxableBasis / ctx.taxable);
    ctx.taxable -= gross;
    taxPaid += gross - net; // the sale's own LTCG
    bill -= net;
    paidFrom.taxable = gross;
  }
  if (bill > EPS) {
    // nothing left outside — withhold from the conversion, penalized pre-60
    const rate = ownerAge < Math.ceil(PRETAX_ACCESS_AGE) ? EARLY_WITHDRAWAL_PENALTY : 0;
    const withheld = Math.min(tranche.amount, bill / (1 - rate));
    penalty = withheld * rate;
    tranche.amount -= withheld;
    tranche.taxablePortion -= withheld; // BOTH fields — nontaxable must stay 0
    taxPaid += penalty;
    bill = Math.max(0, bill - (withheld - penalty));
    paidFrom.conversion = withheld;
    noteOnce(
      ctx,
      'ladder-withheld',
      events,
      age,
      `nothing left in cash/taxable to pay conversion tax — withheld from the conversion (10% penalty before ${Math.ceil(PRETAX_ACCESS_AGE)})`,
    );
  }

  const ladder: LadderYear = {
    poolBeforeConversion,
    converted,
    tax: conversionTax,
    paidFrom,
    penalty,
    unlockYear: conversionUnlockYear(year, ownerAge),
  };
  events.push({
    kind: 'conversion',
    age,
    label: `convert ${Math.round(converted).toLocaleString('en-US')}`,
  });
  snapDust(ctx);
  return { ladder, taxPaid };
}
