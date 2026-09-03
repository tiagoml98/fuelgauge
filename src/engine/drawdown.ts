/**
 * One drawdown year's withdrawals (M3). Runs at the START of the year, before
 * growth (SPEC §4). Walks the strategy's order; each source releases only
 * what is open this year per the access map; pre-tax draws are grossed up,
 * taxable sales taxed on the gain portion, trad-IRA nondeductible basis
 * recovered pro rata (gate #11). Shortfall ⇒ gap — reported, never covered;
 * balances never go negative (SPEC §6).
 *
 * M6.2 #2, HSA under "medical" treatment:
 * (a) the medical slice of need is paid from the HSA FIRST, tax-free at any
 *     age, until the HSA is exhausted; the rest of need walks the order;
 * (b) LAST RESORT — need the order could not cover draws from the HSA:
 *     tax-free up to the year's remaining medical slice, beyond that as
 *     ordinary income at the effective (+state) rate plus the 20% penalty
 *     while that filer's end-of-year age < 65. A year gaps only when the HSA
 *     is also empty.
 */

import { accessOpen, rothEarningsOpen } from './access';
import { rothIraTotal, type FilerState, type SimContext } from './accumulate';
import { HSA_NONQUALIFIED_PENALTY, HSA_PENALTY_ENDS_AGE, ROTH_SEASONING_YEARS } from './defaults';
import {
  grossFromNet,
  grossOrdinaryFromNet,
  marginalOrdinaryTax,
  preTaxWithdrawalRate,
  taxableSaleRate,
} from './tax';
import type { AccessMap, AccountId, WithdrawalSource } from './types';

const EPS = 0.005; // sub-cent

export interface WithdrawResult {
  /** Gross amounts drawn per account (incl. tax gross-up). */
  withdrawals: Partial<Record<AccountId, number>>;
  taxPaid: number;
  /** Unfunded remainder of the net need. */
  unmet: number;
  gap: boolean;
}

export function withdrawYear(
  ctx: SimContext,
  t: number,
  netNeed: number,
  order: WithdrawalSource[],
  access: AccessMap,
  /** This year's medical slice of the net need (already indexed), M6.2 #2. */
  medicalNeed = 0,
): WithdrawResult {
  const { a } = ctx;
  const year = a.currentYear + t;
  const ages = a.filers.map((fl) => fl.currentAge + t); // end-of-year ages
  const preTaxRate = preTaxWithdrawalRate(a);
  const saleRate = taxableSaleRate(a);

  const withdrawals: Partial<Record<AccountId, number>> = {};
  let taxPaid = 0;
  let remaining = netNeed;

  const record = (id: AccountId, gross: number) => {
    withdrawals[id] = (withdrawals[id] ?? 0) + gross;
  };

  // (a) qualified pass: the medical slice comes out of the HSA first,
  // tax-free at any age. Whatever the HSA cannot cover rejoins the order.
  let qualifiedLeft = a.hsaTreatment === 'medical' ? Math.min(medicalNeed, remaining) : 0;
  if (qualifiedLeft > EPS) {
    for (const s of ctx.filers) {
      if (qualifiedLeft <= EPS) break;
      const w = Math.min(s.hsa, qualifiedLeft);
      if (w > 0) {
        s.hsa -= w;
        qualifiedLeft -= w;
        remaining -= w;
        record('hsa', w);
      }
    }
  }

  /** Draw up to `remaining` net from a balance where `taxableFrac` of gross is taxed. */
  const drawTaxed = (balance: number, basis: number, rate: number): { gross: number; net: number } => {
    if (balance <= EPS || remaining <= EPS) return { gross: 0, net: 0 };
    const taxableFrac = Math.max(0, balance - basis) / balance;
    const maxNet = balance - Math.max(0, balance - basis) * rate;
    const net = Math.min(remaining, maxNet);
    const gross = net >= maxNet - EPS ? balance : grossFromNet(net, taxableFrac, rate);
    taxPaid += gross - net;
    remaining -= net;
    return { gross, net };
  };

  /**
   * M7: ORDINARY-INCOME draws (pre-tax accounts, non-Roth HSA). Bracket mode
   * grosses up against the year's running pool and pushes the taxable slice
   * into it so successive draws stack marginally; simple mode is the flat
   * path, byte-identical to before. `extraFlat` = the pre-65 HSA penalty.
   */
  const drawOrdinary = (balance: number, basis: number, extraFlat = 0): { gross: number; net: number } => {
    const tc = ctx.taxCtx;
    if (tc === undefined) {
      return drawTaxed(balance, basis, Math.min(preTaxRate + extraFlat, 0.99));
    }
    if (balance <= EPS || remaining <= EPS) return { gross: 0, net: 0 };
    const taxableFrac = Math.max(0, balance - basis) / balance;
    const maxNet =
      balance -
      marginalOrdinaryTax(tc.pool, balance * taxableFrac, tc.table, tc.stateRate) -
      extraFlat * balance;
    const net = Math.min(remaining, maxNet);
    const gross =
      net >= maxNet - EPS
        ? balance
        : grossOrdinaryFromNet(net, tc.pool, taxableFrac, tc.table, tc.stateRate, extraFlat);
    tc.pool += gross * taxableFrac;
    taxPaid += gross - net;
    remaining -= net;
    return { gross, net };
  };

  const drawPreTaxAccount = (s: FilerState, id: 'trad401k' | 'tradIra') => {
    const balance = id === 'trad401k' ? s.trad401k : s.tradIra;
    const basis = id === 'tradIra' ? s.tradIraBasis : 0;
    const { gross } = drawOrdinary(balance, basis);
    if (gross <= 0) return;
    if (id === 'trad401k') {
      s.matchTrad = Math.max(0, s.matchTrad - gross * (s.matchTrad / balance));
      s.trad401k -= gross;
    } else {
      s.tradIraBasis -= gross * (basis / balance);
      s.tradIra -= gross;
    }
    record(id, gross);
  };

  for (const source of order) {
    if (remaining <= EPS) break;
    switch (source) {
      case 'cash': {
        const w = Math.min(ctx.cash, remaining);
        if (w > 0) {
          ctx.cash -= w;
          remaining -= w;
          record('cash', w);
        }
        break;
      }
      case 'taxable': {
        const balance = ctx.taxable;
        const { gross } = drawTaxed(balance, ctx.taxableBasis, saleRate);
        if (gross > 0) {
          ctx.taxableBasis -= gross * (ctx.taxableBasis / balance);
          ctx.taxable -= gross;
          record('taxable', gross);
        }
        break;
      }
      case 'preTax': {
        // Filer 1 before filer 2, trad401k before tradIra (M3 decision #4);
        // each gated by its own access age — the rule-of-55 401k may be open
        // while the IRA is not.
        for (let f = 0; f < ctx.filers.length && remaining > EPS; f++) {
          const s = ctx.filers[f];
          if (accessOpen(ages[f], access[f]?.trad401k)) drawPreTaxAccount(s, 'trad401k');
          if (remaining > EPS && accessOpen(ages[f], access[f]?.tradIra)) {
            drawPreTaxAccount(s, 'tradIra');
          }
        }
        break;
      }
      case 'rothBasis': {
        for (const s of ctx.filers) {
          if (remaining <= EPS) break;
          const w = Math.min(s.rothIra.basis, remaining);
          if (w > 0) {
            s.rothIra.basis -= w;
            remaining -= w;
            record('rothIra', w);
          }
        }
        break;
      }
      case 'seasonedConversions': {
        // Oldest first; taxable-first inside each conversion (gate #4): the
        // taxable portion once seasoned, the nontaxable portion immediately.
        for (const s of ctx.filers) {
          const sorted = [...s.rothIra.conversions].sort((x, y) => x.year - y.year);
          for (const c of sorted) {
            if (remaining <= EPS) break;
            if (year >= c.year + ROTH_SEASONING_YEARS && c.taxablePortion > 0) {
              const w = Math.min(c.taxablePortion, remaining);
              c.taxablePortion -= w;
              c.amount -= w;
              remaining -= w;
              record('rothIra', w);
            }
            const nontaxable = c.amount - c.taxablePortion;
            if (remaining > EPS && nontaxable > 0) {
              const w = Math.min(nontaxable, remaining);
              c.amount -= w;
              remaining -= w;
              record('rothIra', w);
            }
          }
        }
        break;
      }
      case 'rothEarnings': {
        for (let f = 0; f < ctx.filers.length && remaining > EPS; f++) {
          const s = ctx.filers[f];
          if (
            rothEarningsOpen(ages[f], year, access[f]?.rothEarnings, s.rothIra.firstFundedYear)
          ) {
            const w = Math.min(s.rothIra.earnings, remaining);
            if (w > 0) {
              s.rothIra.earnings -= w;
              remaining -= w;
              record('rothIra', w);
            }
          }
        }
        break;
      }
      case 'hsa': {
        // Only meaningful under non-medical treatment (open at 65); under
        // medical the default order excludes it and we never auto-draw.
        if (a.hsaTreatment !== 'nonMedical') break;
        for (let f = 0; f < ctx.filers.length && remaining > EPS; f++) {
          const s = ctx.filers[f];
          if (!accessOpen(ages[f], access[f]?.hsa)) continue;
          const { gross } = drawOrdinary(s.hsa, 0);
          if (gross > 0) {
            s.hsa -= gross;
            record('hsa', gross);
          }
        }
        break;
      }
    }
  }

  // (b) last resort: every ordered source is exhausted or locked — the HSA
  // covers what it can before the year is allowed to gap.
  if (a.hsaTreatment === 'medical' && remaining > EPS) {
    for (let f = 0; f < ctx.filers.length && remaining > EPS; f++) {
      const s = ctx.filers[f];
      if (s.hsa <= EPS) continue;
      // any unused qualified capacity first (tax-free)
      const freeNet = Math.min(remaining, qualifiedLeft, s.hsa);
      if (freeNet > 0) {
        s.hsa -= freeNet;
        qualifiedLeft -= freeNet;
        remaining -= freeNet;
        record('hsa', freeNet);
      }
      if (remaining <= EPS || s.hsa <= EPS) continue;
      // nonqualified: ordinary income (+ state), +20% penalty before 65
      const penalty = ages[f] < HSA_PENALTY_ENDS_AGE ? HSA_NONQUALIFIED_PENALTY : 0;
      const { gross } = drawOrdinary(s.hsa, 0, penalty);
      if (gross > 0) {
        s.hsa -= gross;
        record('hsa', gross);
      }
    }
  }

  const unmet = Math.max(0, remaining);
  return { withdrawals, taxPaid, unmet, gap: unmet > EPS };
}

/** Total conversion principal still sitting in a filer's Roth IRA. */
export const conversionTotal = (s: FilerState): number =>
  s.rothIra.conversions.reduce((sum, c) => sum + c.amount, 0);

export { rothIraTotal };
