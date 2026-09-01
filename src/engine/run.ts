/**
 * A run = one growth scenario × one withdrawal strategy (SPEC §1, M3).
 * Accumulates to the resolved drawdown start (contributions cut there), then
 * per drawdown year: rollovers → withdrawal at start of year → growth, no
 * contributions. Windfalls still land during drawdown (M3 decision #3).
 */

import {
  accessOpen,
  accessibleConversionAmount,
  computeAccessAges,
  rothEarningsOpen,
} from './access';
import {
  applyWindfalls,
  contributeYear,
  createSimContext,
  emitReturnChangeMarker,
  emitStreamMarkers,
  growYear,
  rothIraTotal,
  separationAge,
  takeSnapshot,
  yearZeroEvents,
  type SimContext,
} from './accumulate';
import { PRETAX_ACCESS_AGE } from './defaults';
import { withdrawYear } from './drawdown';
import { resolveOneTime, resolveSchedule } from './schedule';
import { preTaxWithdrawalRate, simpleIncomeTax, taxableSaleRate } from './tax';
import type {
  AccessMap,
  Assumptions,
  GrowthScenario,
  MarkerEvent,
  RunResult,
  RunSpan,
  RunYear,
  WithdrawalStrategy,
} from './types';

/**
 * Gate #15, corrected at the M3 gate (#2): explicit ?? earliest filer
 * separation age + 1 (converted to filer-1 age) ?? coastTargetAge; clamped
 * into (current age, horizon]. The separation year keeps its salary and
 * end-of-year contributions; the first withdrawal is at the start of the
 * following year.
 */
export function resolveDrawdownStart(
  a: Assumptions,
  g: GrowthScenario,
  w: WithdrawalStrategy,
): number {
  const f1 = a.filers[0].currentAge;
  const n = a.horizonAge - f1;
  let d = w.drawdownStartAge;
  if (d === undefined) {
    const seps = a.filers
      .map((fl, f) => {
        const sep = separationAge(g, f, fl.currentAge, fl.currentAge + n);
        return sep === null ? null : sep - (fl.currentAge - f1);
      })
      .filter((x): x is number => x !== null);
    d = seps.length > 0 ? Math.min(...seps) + 1 : a.coastTargetAge;
  }
  return Math.min(Math.max(d, f1 + 1), a.horizonAge);
}

/** ATE-terms accessible/locked at year t, per the access map (M3). */
function accessibleAte(
  ctx: SimContext,
  t: number,
  access: AccessMap,
): { accessible: number; locked: number } {
  const { a } = ctx;
  const year = a.currentYear + t;
  const preRate = preTaxWithdrawalRate(a);
  const saleRate = taxableSaleRate(a);
  let accessible =
    ctx.cash + (ctx.taxable - Math.max(0, ctx.taxable - ctx.taxableBasis) * saleRate);
  let lockedSum = 0;
  for (let f = 0; f < ctx.filers.length; f++) {
    const s = ctx.filers[f];
    const ageF = a.filers[f].currentAge + t;
    const acc = access[f] ?? {};
    const preTaxAte = (balance: number, basis: number) =>
      balance - Math.max(0, balance - basis) * preRate;

    const trad401kAte = preTaxAte(s.trad401k, 0);
    const tradIraAte = preTaxAte(s.tradIra, s.tradIraBasis);
    if (accessOpen(ageF, acc.trad401k)) accessible += trad401kAte;
    else lockedSum += trad401kAte;
    if (accessOpen(ageF, acc.tradIra)) accessible += tradIraAte;
    else lockedSum += tradIraAte;
    // Roth 401k is plan-bound: same access as the trad 401k (rolls at D anyway)
    if (accessOpen(ageF, acc.trad401k)) accessible += s.roth401k;
    else lockedSum += s.roth401k;

    accessible += s.rothIra.basis;
    for (const c of s.rothIra.conversions) {
      const open = accessibleConversionAmount(c, year);
      accessible += open;
      lockedSum += c.amount - open;
    }
    if (rothEarningsOpen(ageF, year, acc.rothEarnings, s.rothIra.firstFundedYear)) {
      accessible += s.rothIra.earnings;
    } else {
      lockedSum += s.rothIra.earnings;
    }

    if (a.hsaTreatment === 'medical') {
      accessible += s.hsa; // face, assumed spendable on qualified expenses (M10)
    } else if (accessOpen(ageF, acc.hsa)) {
      accessible += preTaxAte(s.hsa, 0);
    } else {
      lockedSum += preTaxAte(s.hsa, 0);
    }
  }
  return { accessible, locked: lockedSum };
}

export function simulateRun(
  a: Assumptions,
  g: GrowthScenario,
  w: WithdrawalStrategy,
): RunResult {
  const ctx = createSimContext(a, g);
  const D = resolveDrawdownStart(a, g, w);
  const access = computeAccessAges(a, g);
  // Drawdown-year flows happen at the START of the year and are indexed to
  // that year's start-of-year price level (M3 gate correction #1).
  const startOpts = {
    startAge: ctx.startAge,
    endAge: a.horizonAge,
    indexed: a.indexWithInflation,
    inflation: a.inflation,
    timing: 'startOfYear' as const,
  };
  const spending = resolveSchedule(w.spending, startOpts);
  const oneTime = resolveOneTime(w.oneTimeExpenses, startOpts);
  // Income rows are additive streams — one row, one source (no overlap rule).
  const incomeRows = w.income.map((r) => ({
    kind: r.kind,
    values: resolveSchedule([{ fromAge: r.fromAge, toAge: r.toAge, value: r.amount }], startOpts),
  }));

  const notes: string[] = [];
  const rawStreams = [
    ...ctx.perFiler.flatMap((p) => [p.c401kRaw, p.iraRaw]),
    ctx.hsaRaw,
    ctx.taxableRaw,
    ctx.cashRaw,
  ];
  if (rawStreams.some((arr) => arr.some((v, t) => v > 0 && ctx.startAge + t >= D))) {
    notes.push(`contributions cut at ${D} — growth schedules extend past drawdown start`);
  }
  const lastIncomeAgeF1 = Math.max(
    -Infinity,
    ...ctx.perFiler.map((p, f) =>
      p.separation === null
        ? -Infinity
        : p.separation - (a.filers[f].currentAge - ctx.startAge),
    ),
  );
  if (Number.isFinite(lastIncomeAgeF1) && lastIncomeAgeF1 + 1 <= D - 1) {
    notes.push(
      `ages ${lastIncomeAgeF1 + 1}–${D - 1} have no income and no spending modeled`,
    );
  }

  const years: RunYear[] = [];
  const year0 = takeSnapshot(ctx, ctx.startAge, a.currentYear, 0, yearZeroEvents(ctx));
  Object.assign(year0, accessibleAte(ctx, 0, access));
  years.push(year0);

  const rolledRoth = new Set<number>();
  const rolledTrad = new Set<number>();
  const accessMarked = new Set<string>();
  let firstGapAge: number | null = null;
  let lifetimeAfterTaxSpending = 0;

  for (let t = 1; t <= ctx.n; t++) {
    const age = ctx.startAge + t;
    const year = a.currentYear + t;
    const events: MarkerEvent[] = [];
    let taxPaid = 0;
    let need: number | undefined;
    let grossNeedOut: number | undefined;
    let unmet: number | undefined;
    let withdrawals: RunYear['withdrawals'];
    let gap = false;

    if (age < D) {
      taxPaid += growYear(ctx, t, 'accumulation');
      contributeYear(ctx, t, events);
      applyWindfalls(ctx, t, events);
      emitStreamMarkers(ctx, t, events);
    } else {
      if (age === D) {
        events.push({ kind: 'drawdownStart', age, label: `drawdown starts at ${D}` });
      }
      // Rollovers at the start of the year (gate #6)
      for (let f = 0; f < ctx.filers.length; f++) {
        const s = ctx.filers[f];
        const ageF = a.filers[f].currentAge + t;
        if (!rolledRoth.has(f)) {
          rolledRoth.add(f);
          if (s.roth401k > 0) {
            s.rothIra.basis += s.roth401kBasis;
            s.rothIra.earnings += s.roth401k - s.roth401kBasis;
            // Starts the clock ONLY if no Roth IRA was already funded (M11);
            // an existing firstFundedYear governs.
            s.rothIra.firstFundedYear ??= year;
            s.roth401k = 0;
            s.roth401kBasis = 0;
            s.matchRoth = 0;
            s.matchRothBasis = 0;
            events.push({ kind: 'rollover', age, label: `Roth 401k → Roth IRA (filer ${f + 1})` });
          }
        }
        if (!rolledTrad.has(f) && ageF >= Math.ceil(PRETAX_ACCESS_AGE)) {
          rolledTrad.add(f);
          if (s.trad401k > 0) {
            s.tradIra += s.trad401k;
            s.trad401k = 0;
            s.matchTrad = 0;
            events.push({
              kind: 'rollover',
              age,
              label: `Traditional 401k → Traditional IRA (filer ${f + 1})`,
            });
          }
        }
      }

      // Need: spending + one-time − net retirement income (gate #9);
      // surplus income is saved to cash (M3 decision #2)
      const grossNeed = spending[t] + oneTime[t];
      let incomeNet = 0;
      for (const row of incomeRows) {
        const amount = row.values[t];
        if (amount > 0) {
          const tax = simpleIncomeTax(row.kind, amount, a);
          incomeNet += amount - tax;
          taxPaid += tax;
        }
      }
      let netNeed = grossNeed - incomeNet;
      if (netNeed < 0) {
        ctx.cash += -netNeed;
        netNeed = 0;
      }

      const result = withdrawYear(ctx, t, netNeed, w.order, access);
      taxPaid += result.taxPaid;
      need = netNeed;
      grossNeedOut = grossNeed;
      unmet = result.unmet;
      withdrawals = result.withdrawals;
      gap = result.gap;
      if (gap && firstGapAge === null) firstGapAge = age;
      lifetimeAfterTaxSpending += grossNeed - result.unmet;

      taxPaid += growYear(ctx, t, 'drawdown');
      applyWindfalls(ctx, t, events);
    }
    emitReturnChangeMarker(ctx, t, events);

    // Access-age markers: emitted once, the year each per-filer source opens
    for (let f = 0; f < ctx.filers.length; f++) {
      const ageF = a.filers[f].currentAge + t;
      const acc = access[f] ?? {};
      const marks: Array<[string, number | undefined]> = [
        [`Traditional 401k`, acc.trad401k],
        [`Traditional IRA`, acc.tradIra],
        [`HSA`, acc.hsa],
      ];
      for (const [name, accessAge] of marks) {
        if (accessAge !== undefined && ageF === Math.ceil(accessAge)) {
          const key = `${f}:${name}`;
          if (!accessMarked.has(key)) {
            accessMarked.add(key);
            events.push({ kind: 'accessAge', age, label: `${name} opens (filer ${f + 1})` });
          }
        }
      }
      const s = ctx.filers[f];
      if (
        rothEarningsOpen(ageF, year, acc.rothEarnings, s.rothIra.firstFundedYear) &&
        !accessMarked.has(`${f}:rothEarnings`) &&
        rothIraTotal(s.rothIra) > 0
      ) {
        accessMarked.add(`${f}:rothEarnings`);
        events.push({ kind: 'accessAge', age, label: `Roth earnings open (filer ${f + 1})` });
      }
    }

    ctx.cumulativeTax += taxPaid;
    const row = takeSnapshot(ctx, age, year, taxPaid, events);
    row.need = need;
    row.grossNeed = grossNeedOut;
    row.unmet = unmet;
    row.withdrawals = withdrawals;
    row.gap = gap;
    Object.assign(row, accessibleAte(ctx, t, access));
    if (row.gap) {
      // M6.1 #2: locked = the money exists but can't be touched yet;
      // depleted = there is nothing left to touch
      row.gapKind = row.locked >= (row.unmet ?? 0) - 0.005 ? 'locked' : 'depleted';
    }
    years.push(row);
  }

  // Funded/locked/depleted spans over the drawdown years (M6.1 #2)
  const spans: RunSpan[] = [];
  for (const y of years) {
    if (y.need === undefined) continue;
    const kind: RunSpan['kind'] = !y.gap ? 'funded' : (y.gapKind ?? 'depleted');
    const last = spans[spans.length - 1];
    if (last && last.kind === kind && last.to === y.age - 1) last.to = y.age;
    else spans.push({ kind, from: y.age, to: y.age });
  }

  const result: RunResult = {
    years,
    notes,
    access,
    drawdownStartAge: D,
    summary: {
      lifetimeAfterTaxSpending,
      terminalAte: years[years.length - 1].totalAte,
      yearsRetired: a.horizonAge - D,
      firstGapAge,
      bridgeFunded: false,
      cumulativeTax: ctx.cumulativeTax,
      spans,
    },
  };
  // Bridge funded ⇔ no gap year between D and the latest access age
  const latestAccess = latestAccessAgeF1(result, a);
  result.summary.bridgeFunded = result.years
    .filter((y) => y.age >= D && y.age <= latestAccess)
    .every((y) => !y.gap);
  return result;
}

/** Latest access age across filers, in filer-1 age terms, clamped to the horizon. */
export function latestAccessAgeF1(run: RunResult, a: Assumptions): number {
  const f1 = a.filers[0].currentAge;
  let latest = run.drawdownStartAge;
  run.access.forEach((acc, f) => {
    const offset = a.filers[f].currentAge - f1;
    for (const v of Object.values(acc)) {
      if (v !== undefined) latest = Math.max(latest, Math.ceil(v) - offset);
    }
  });
  return Math.min(latest, a.horizonAge);
}
