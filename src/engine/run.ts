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
import { convertYear } from './ladder';
import { preTaxBalances, takeRmds } from './rmd';
import { resolveOneTime, resolveSchedule } from './schedule';
import {
  marginalOrdinaryTax,
  ordinaryTax,
  preTaxWithdrawalRate,
  resolveBracketTable,
  simpleIncomeTax,
  SS_TAXABLE_SHARE,
  taxableSaleRate,
} from './tax';
import type {
  AccessMap,
  Assumptions,
  GrowthScenario,
  MarkerEvent,
  RunResult,
  RunSpan,
  RunYear,
  WithdrawalSource,
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
  const preRate = ctx.ateRate ?? preTaxWithdrawalRate(a); // M7: bracket valuation rate
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
      const open = accessibleConversionAmount(c, year, ageF);
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
  // M6.2 #2: the medical SLICE of spending — paid from the HSA first
  const medical = resolveSchedule(w.medical ?? [], startOpts);
  const oneTime = resolveOneTime(w.oneTimeExpenses, startOpts);
  // Income rows are additive streams — one row, one source (no overlap rule).
  const incomeRows = w.income.map((r) => ({
    kind: r.kind,
    values: resolveSchedule([{ fromAge: r.fromAge, toAge: r.toAge, value: r.amount }], startOpts),
  }));
  const incomeSliceAt = (t: number): number =>
    incomeRows.reduce(
      (sum, row) =>
        sum + (row.values[t] > 0 ? row.values[t] * (row.kind === 'socialSecurity' ? SS_TAXABLE_SHARE : 1) : 0),
      0,
    );

  // M7 bracket mode: the pre-tax ATE valuation rate — priced by stacking the
  // first drawdown year's spending ON TOP of that year's income-row taxable
  // slices (a pension or early SS must not make pre-tax look cheaper to
  // liquidate than it is). Falls back to the flat effective rate when the
  // year-D spending is zero. Simple mode: flat effective + state, unchanged.
  if (a.taxMode === 'bracket') {
    const tD = D - ctx.startAge;
    const spendD = spending[tD] > 0 ? spending[tD] : a.fireSpendingTarget;
    if (spendD > 0) {
      const tableD = resolveBracketTable(
        a,
        tD,
        a.filers.filter((fl) => fl.currentAge + tD >= 65).length,
      );
      ctx.ateRate =
        marginalOrdinaryTax(incomeSliceAt(tD), spendD, tableD, a.stateTaxRate) / spendD;
    } else {
      ctx.ateRate = a.effectiveRetirementRate + a.stateTaxRate;
    }
  }

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
  const rmdMarked = new Set<number>();
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
    let bySource: RunYear['withdrawalsBySource'];
    let ladderYear: RunYear['ladder'];
    let rmdYear: RunYear['rmd'];
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
      // M10: start-of-year (= end of y−1) pre-tax balances drive this year's RMDs
      const priorPreTax = preTaxBalances(ctx);
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

      // M7 bracket mode: fresh ordinary-income pool + this year's indexed table
      if (a.taxMode === 'bracket') {
        const filers65 = a.filers.filter((fl) => fl.currentAge + t >= 65).length;
        ctx.taxCtx = { pool: 0, table: resolveBracketTable(a, t, filers65), stateRate: a.stateTaxRate };
      }

      // Need: spending + one-time − net retirement income (gate #9);
      // surplus income is saved to cash (M3 decision #2)
      const grossNeed = spending[t] + oneTime[t];
      let incomeNet = 0;
      if (ctx.taxCtx !== undefined) {
        // Bracket mode: income rows' taxable slices SEED the pool (partTime /
        // pension 100%, SS 85%); their collective tax comes off the top
        let incomeGross = 0;
        for (const row of incomeRows) {
          if (row.values[t] > 0) incomeGross += row.values[t];
        }
        ctx.taxCtx.pool = incomeSliceAt(t);
        const tax = ordinaryTax(ctx.taxCtx.pool, ctx.taxCtx.table, ctx.taxCtx.stateRate);
        incomeNet = incomeGross - tax;
        taxPaid += tax;
      } else {
        for (const row of incomeRows) {
          const amount = row.values[t];
          if (amount > 0) {
            const tax = simpleIncomeTax(row.kind, amount, a);
            incomeNet += amount - tax;
            taxPaid += tax;
          }
        }
      }
      let netNeed = grossNeed - incomeNet;
      if (netNeed < 0) {
        ctx.cash += -netNeed;
        netNeed = 0;
      }

      // M10: RMDs come FIRST — forced pre-tax draws whose net covers need
      // before the withdrawal order runs; the surplus moves to invested
      // taxable (basis = net) and is NOT spending
      const rmdRes = takeRmds(ctx, t, priorPreTax, events, rmdMarked);
      taxPaid += rmdRes.taxPaid;
      let needAfterRmd = netNeed;
      if (rmdRes.rmd !== null) {
        const applied = Math.min(netNeed, rmdRes.rmd.net);
        rmdRes.rmd.appliedToNeed = applied;
        rmdRes.rmd.toTaxable = rmdRes.rmd.net - applied;
        needAfterRmd = netNeed - applied;
        if (rmdRes.rmd.toTaxable > 0.005) {
          ctx.taxable += rmdRes.rmd.toTaxable;
          ctx.taxableBasis += rmdRes.rmd.toTaxable;
        }
        rmdYear = rmdRes.rmd;
      }

      // income offsets the non-medical share first — the medical slice keeps
      // its tax-free HSA claim (M6.2 #2, noted in ASSUMPTIONS M10)
      const result = withdrawYear(ctx, t, needAfterRmd, w.order, access, Math.min(medical[t], needAfterRmd));
      taxPaid += result.taxPaid;
      need = netNeed;
      grossNeedOut = grossNeed;
      unmet = result.unmet;
      withdrawals = result.withdrawals;
      bySource = result.bySource;
      if (rmdYear !== undefined) {
        for (const acct of ['trad401k', 'tradIra'] as const) {
          if (rmdRes.grossByAccount[acct] > 0.005) {
            withdrawals[acct] = (withdrawals[acct] ?? 0) + rmdRes.grossByAccount[acct];
          }
        }
        bySource.preTax = (bySource.preTax ?? 0) + rmdYear.appliedToNeed;
      }
      gap = result.gap;
      if (gap && firstGapAge === null) firstGapAge = age;
      lifetimeAfterTaxSpending += grossNeed - result.unmet;

      // M8: ladder conversions AFTER withdrawals — spending first, fill rows
      // take the bracket room that is left (plan amendment #2)
      const conv = convertYear(ctx, t, w, events);
      taxPaid += conv.taxPaid;
      ladderYear = conv.ladder ?? undefined;

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
    row.withdrawalsBySource = bySource;
    row.ladder = ladderYear;
    row.rmd = rmdYear;
    row.gap = gap;
    Object.assign(row, accessibleAte(ctx, t, access));
    // M7 bracket mode: the year's ordinary income, its bracket tax, and the
    // COMPUTED effective rate (all increments telescope to ordinaryTax(pool))
    if (ctx.taxCtx !== undefined && age >= D) {
      const { pool, table, stateRate } = ctx.taxCtx;
      if (pool > 0.005) {
        row.ordinaryIncome = pool;
        row.ordinaryTax = ordinaryTax(pool, table, stateRate);
        row.effectiveOrdinaryRate = row.ordinaryTax / pool;
      }
    }
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
    ateRate: ctx.ateRate ?? preTaxWithdrawalRate(a),
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
  const latestAccess = latestAccessAgeF1(result, a, w.order);
  result.summary.bridgeFunded = result.years
    .filter((y) => y.age >= D && y.age <= latestAccess)
    .every((y) => !y.gap);
  return result;
}

/**
 * Latest access age across filers, filer-1 terms, clamped to the horizon.
 * M9.1 #1 guard: only sources PRESENT IN THE WITHDRAWAL ORDER extend the
 * bridge — an unordered HSA (or any source the strategy never draws) must
 * not stretch "locked until".
 */
export function latestAccessAgeF1(
  run: RunResult,
  a: Assumptions,
  order: WithdrawalSource[],
): number {
  const sourceFor: Record<string, WithdrawalSource> = {
    trad401k: 'preTax',
    tradIra: 'preTax',
    rothEarnings: 'rothEarnings',
    hsa: 'hsa',
  };
  const f1 = a.filers[0].currentAge;
  let latest = run.drawdownStartAge;
  run.access.forEach((acc, f) => {
    const offset = a.filers[f].currentAge - f1;
    for (const [key, v] of Object.entries(acc)) {
      if (v === undefined) continue;
      const src = sourceFor[key];
      if (src !== undefined && !order.includes(src)) continue;
      latest = Math.max(latest, Math.ceil(v) - offset);
    }
  });
  return Math.min(latest, a.horizonAge);
}
