/**
 * Accumulation engine (M2) and the shared sim core (M3 step 0). Year-by-year
 * from filer 1's current age to the horizon, SPEC §4 timing: growth compounds
 * on the start-of-year balance, then contributions and windfalls land at end
 * of year — which is exactly what makes FV = P(1+r)^n + C((1+r)^n − 1)/r hold
 * for the golden test.
 *
 * Age conventions (gate #1 + M2 decision #1): RunYear.age is filer 1's age at
 * the END of that year; the growth applied during that year uses the return
 * schedule's value AT that age (so the age-51 year is the first at the post-50
 * rate). Row t=0 is today's snapshot — no growth, no contributions.
 *
 * The SimContext + step functions (createSimContext / growYear /
 * contributeYear / applyWindfalls / emitStreamMarkers / takeSnapshot) are
 * engine-internal plumbing shared with run.ts (M3), which inserts withdrawals
 * and rollovers between the same steps. They are exported for the engine only
 * — the UI consumes simulateAccumulation / simulateRun.
 */

import { ateByAccount, rollupBuckets } from './ate';
import { ALL_ACCOUNTS, HSA_CONTRIBUTION_STOP_AGE } from './defaults';
import {
  capFiler401k,
  capFilerIra,
  capHouseholdHsa,
  clamp415c,
  matchAmount,
  resolveLimits,
} from './limits';
import { resolveSchedule } from './schedule';
import { cashInterestTax, dividendDrag, marginalOrdinaryTax } from './tax';
import type {
  AccountId,
  Assumptions,
  BalanceSnapshot,
  BracketTable,
  FilerGrowthInputs,
  GrowthScenario,
  MarkerEvent,
  RothIraState,
  RunYear,
  ScheduleRow,
} from './types';

/**
 * Gate #2: last own-age with salary > 0 in this scenario (override wins);
 * null when the scenario has no salary for this filer. Resolves the schedule
 * so overlap rows ("stop at X") are honored.
 */
export function separationAge(
  g: GrowthScenario,
  filerIndex: number,
  ownStartAge: number,
  ownEndAge: number,
): number | null {
  const inputs = g.perFiler[filerIndex];
  if (inputs.separationAgeOverride !== undefined) return inputs.separationAgeOverride;
  const salary = resolveSchedule(inputs.salary, {
    startAge: ownStartAge,
    endAge: ownEndAge,
    indexed: false,
    inflation: 0,
  });
  for (let i = salary.length - 1; i >= 0; i--) {
    if (salary[i] > 0) return ownStartAge + i;
  }
  return null;
}

export interface FilerState {
  trad401k: number;
  tradIra: number;
  tradIraBasis: number;
  roth401k: number;
  roth401kBasis: number;
  rothIra: RothIraState;
  hsa: number;
  /** Match sub-balances compound inside their account; unvested fraction dropped at separation. */
  matchTrad: number;
  matchRoth: number;
  /** Deposited Roth-match dollars — contribution basis (M2 gate #5), tracked for the vesting drop. */
  matchRothBasis: number;
}

export interface ResolvedFilerStreams {
  inputs: FilerGrowthInputs;
  salary: number[];
  c401k: number[];
  c401kRaw: number[];
  ira: number[];
  iraRaw: number[];
  separation: number | null;
  deductible: boolean;
}

export interface SimContext {
  a: Assumptions;
  g: GrowthScenario;
  /** Filer 1's current age; model year t ↔ age startAge + t. */
  startAge: number;
  /** Number of simulated years (horizon − startAge). */
  n: number;
  returns: Record<AccountId, number[]>;
  /** Gross invested-return stream (before fees) for the returnChange marker. */
  investedGrossReturns: number[];
  perFiler: ResolvedFilerStreams[];
  hsaC: number[];
  hsaRaw: number[];
  taxableC: number[];
  taxableRaw: number[];
  cashC: number[];
  cashRaw: number[];
  filers: FilerState[];
  taxable: number;
  taxableBasis: number;
  cash: number;
  cumulativeTax: number;
  /**
   * M7 bracket mode, per drawdown year: the running ordinary-income pool and
   * that year's indexed table. run.ts resets and seeds it each year; the
   * withdrawal walk and drawdown cash interest stack onto it. Absent in
   * simple mode and during accumulation.
   */
  taxCtx?: { pool: number; table: BracketTable; stateRate: number };
  /** M7 bracket mode: the run's pre-tax ATE valuation rate (set by run.ts). */
  ateRate?: number;
  /** One-time note keys already emitted. */
  noted: Set<string>;
  zeroed: AccountId[];
}

const INVESTED: ReadonlySet<AccountId> = new Set<AccountId>([
  'trad401k',
  'tradIra',
  'roth401k',
  'rothIra',
  'hsa',
  'taxable',
]);

export const rothIraTotal = (s: RothIraState): number =>
  s.basis + s.earnings + s.conversions.reduce((sum, c) => sum + c.amount, 0);

export function createSimContext(a: Assumptions, g: GrowthScenario): SimContext {
  const startAge = a.filers[0].currentAge;
  const n = a.horizonAge - startAge;
  const idxOpts = {
    startAge,
    endAge: a.horizonAge,
    indexed: a.indexWithInflation,
    inflation: a.inflation,
  };
  const rawOpts = { startAge, endAge: a.horizonAge, indexed: false, inflation: 0 };
  const filerOpts = (f: number, indexed: boolean) => ({
    startAge: a.filers[f].currentAge,
    endAge: a.filers[f].currentAge + n,
    indexed: indexed && a.indexWithInflation,
    inflation: indexed ? a.inflation : 0,
  });

  // Precedence (M2 gate #6): a scenario override applies to ALL invested
  // accounts and beats per-account overrides; cash always uses its own return.
  const returnRows = (id: AccountId): ScheduleRow[] =>
    id === 'cash'
      ? (a.returnOverrides.cash ?? a.returnSchedule)
      : (g.returnScheduleOverride ?? a.returnOverrides[id] ?? a.returnSchedule);
  const returns = {} as Record<AccountId, number[]>;
  for (const id of ALL_ACCOUNTS) {
    const gross = resolveSchedule(returnRows(id), rawOpts);
    returns[id] = gross.map((r) => (INVESTED.has(id) ? r - a.fees : r)); // fees never touch cash (gate #8)
  }

  // The invested-account schedule (M2 gate #6 precedence, sans per-account
  // overrides), gross of fees — drives the returnChange marker (M4.5 C.3).
  const investedGrossReturns = resolveSchedule(
    g.returnScheduleOverride ?? a.returnSchedule,
    rawOpts,
  );

  const perFiler = a.filers.map((_, f) => {
    const inputs: FilerGrowthInputs = g.perFiler[f];
    return {
      inputs,
      salary: resolveSchedule(inputs.salary, filerOpts(f, true)),
      c401k: resolveSchedule(inputs.contrib401k, filerOpts(f, true)),
      c401kRaw: resolveSchedule(inputs.contrib401k, filerOpts(f, false)),
      ira: resolveSchedule(inputs.contribIra, filerOpts(f, true)),
      iraRaw: resolveSchedule(inputs.contribIra, filerOpts(f, false)),
      separation: separationAge(g, f, a.filers[f].currentAge, a.filers[f].currentAge + n),
      deductible:
        inputs.tradIraDeductible ?? !inputs.contrib401k.some((row) => row.value > 0), // gate #11 auto
    };
  });

  const zeroed: AccountId[] = ALL_ACCOUNTS.filter((id) => !a.include[id]);
  const filers: FilerState[] = a.filers.map((_, f) => {
    const b = a.balances.perFiler[f];
    const rothIra: RothIraState = a.include.rothIra
      ? {
          basis: b.rothIra.basis,
          conversions: b.rothIra.conversions.map((c) => ({ ...c })),
          earnings: b.rothIra.earnings,
          firstFundedYear: b.rothIra.firstFundedYear,
        }
      : { basis: 0, conversions: [], earnings: 0, firstFundedYear: null };
    // A starting balance IS funding the model sees — it anchors the 5-year clock.
    if (rothIra.firstFundedYear === null && rothIraTotal(rothIra) > 0) {
      rothIra.firstFundedYear = a.currentYear;
    }
    return {
      trad401k: a.include.trad401k ? b.trad401k : 0,
      tradIra: a.include.tradIra ? b.tradIra : 0,
      // M6.2 #1: basis is explicit entry — absent resolves to the STATED
      // assumption here, once, at context creation (never written back)
      tradIraBasis: a.include.tradIra ? (b.tradIraBasis ?? 0) : 0,
      roth401k: a.include.roth401k ? b.roth401k : 0,
      roth401kBasis: a.include.roth401k ? (b.roth401kBasis ?? 0) : 0,
      rothIra,
      hsa: a.include.hsa ? b.hsa : 0,
      matchTrad: 0, // starting balances count as fully vested
      matchRoth: 0,
      matchRothBasis: 0,
    };
  });

  return {
    a,
    g,
    startAge,
    n,
    returns,
    investedGrossReturns,
    perFiler,
    hsaC: resolveSchedule(g.hsaContrib, idxOpts),
    hsaRaw: resolveSchedule(g.hsaContrib, rawOpts),
    taxableC: resolveSchedule(g.taxableContrib, idxOpts),
    taxableRaw: resolveSchedule(g.taxableContrib, rawOpts),
    cashC: resolveSchedule(g.cashContrib, idxOpts),
    cashRaw: resolveSchedule(g.cashContrib, rawOpts),
    filers,
    taxable: a.include.taxable ? a.balances.taxable : 0,
    // absent = not entered → basis = balance (no embedded gains, optimistic)
    taxableBasis: a.include.taxable ? (a.balances.taxableBasis ?? a.balances.taxable) : 0,
    cash: a.include.cash ? a.balances.cash : 0,
    cumulativeTax: 0,
    noted: new Set<string>(),
    zeroed,
  };
}

export function noteOnce(
  ctx: SimContext,
  key: string,
  events: MarkerEvent[],
  age: number,
  label: string,
): void {
  if (ctx.noted.has(key)) return;
  ctx.noted.add(key);
  events.push({ kind: 'note', age, label });
}

const fmtMoney = (v: number) => Math.round(v).toLocaleString('en-US');

// Spec: "capped at limits" means cap AND warn — emitted every capped year.
function capNote(
  events: MarkerEvent[],
  age: number,
  label: string,
  requested: number,
  capped: number,
): void {
  if (requested > capped + 1e-9) {
    events.push({
      kind: 'note',
      age,
      label: `${label} requested ${fmtMoney(requested)}, capped at ${fmtMoney(capped)}`,
    });
  }
}

/** Growth on start-of-year balances. Returns the tax paid (drag + cash interest). */
export function growYear(
  ctx: SimContext,
  t: number,
  phase: 'accumulation' | 'drawdown',
): number {
  const { a, returns } = ctx;
  let taxPaid = 0;
  for (const s of ctx.filers) {
    s.trad401k *= 1 + returns.trad401k[t];
    s.matchTrad *= 1 + returns.trad401k[t];
    s.roth401k *= 1 + returns.roth401k[t];
    s.matchRoth *= 1 + returns.roth401k[t];
    s.tradIra *= 1 + returns.tradIra[t];
    s.hsa *= 1 + returns.hsa[t];
    s.rothIra.earnings += rothIraTotal(s.rothIra) * returns.rothIra[t];
  }
  if (a.include.taxable) {
    const drag = dividendDrag(ctx.taxable, a.dividendYield, a.dividendTaxRate);
    // Reinvested after-tax dividends are new cost basis (M2 gate bug fix):
    // basis += start-of-year balance × yield × (1 − dividend tax rate)
    ctx.taxableBasis += ctx.taxable * a.dividendYield * (1 - a.dividendTaxRate);
    ctx.taxable = ctx.taxable * (1 + returns.taxable[t]) - drag;
    taxPaid += drag;
  }
  if (a.include.cash) {
    const interest = ctx.cash * returns.cash[t];
    // M7: in bracket mode, drawdown-year interest is ordinary income stacked
    // on the year's pool at its marginal increment; accumulation stays flat
    const tax =
      phase === 'drawdown' && ctx.taxCtx !== undefined
        ? marginalOrdinaryTax(ctx.taxCtx.pool, interest, ctx.taxCtx.table, ctx.taxCtx.stateRate)
        : cashInterestTax(interest, phase, a);
    if (phase === 'drawdown' && ctx.taxCtx !== undefined) ctx.taxCtx.pool += interest;
    ctx.cash += interest - tax;
    taxPaid += tax;
  }
  return taxPaid;
}

/** End-of-year contributions: 401k/IRA/HSA/taxable/cash, match, vesting drop. */
export function contributeYear(ctx: SimContext, t: number, events: MarkerEvent[]): void {
  const { a } = ctx;
  const age = ctx.startAge + t;
  const limitsY = resolveLimits(a.limits, t, a.indexWithInflation, a.inflation);
  const filerAges = a.filers.map((fl) => fl.currentAge + t);

  for (let f = 0; f < ctx.filers.length; f++) {
    const s = ctx.filers[f];
    const p = ctx.perFiler[f];
    const ageF = filerAges[f];

    // 401k under one shared deferral limit
    let base401kUsed = 0;
    let deferralTotal = 0; // incl. Roth side and catch-up — the match formula's input (gate #7)
    if (p.c401k[t] > 0) {
      if (!a.include.trad401k && !a.include.roth401k) {
        noteOnce(ctx, `drop401k${f}`, events, age, `401k contributions (filer ${f + 1}) dropped — account excluded`);
      } else {
        const capped = capFiler401k(
          p.c401k[t],
          ageF,
          p.salary[t],
          p.inputs.split401kRothPct,
          limitsY,
        );
        s.trad401k += capped.trad;
        s.roth401k += capped.roth;
        s.roth401kBasis += capped.roth;
        deferralTotal = capped.trad + capped.roth;
        base401kUsed = deferralTotal - capped.catchUpUsed;
        capNote(events, age, `401k (filer ${f + 1})`, p.c401k[t], deferralTotal);
        if (capped.forcedRothCatchUp) {
          noteOnce(ctx, `forcedRoth${f}`, events, age, `catch-up forced to Roth 401k (filer ${f + 1}) — salary above threshold`);
          if (!ctx.noted.has(`forcedRothEvent${f}`)) {
            ctx.noted.add(`forcedRothEvent${f}`);
            events.push({ kind: 'rothCatchUpForced', age, label: `Roth catch-up forced (filer ${f + 1})` });
          }
        }
      }
    }

    // IRA under one shared limit
    if (p.ira[t] > 0) {
      const capped = capFilerIra(p.ira[t], ageF, limitsY);
      capNote(events, age, `IRA (filer ${f + 1})`, p.ira[t], capped);
      if (p.inputs.backdoor) {
        if (!a.include.rothIra) {
          noteOnce(ctx, `dropIraR${f}`, events, age, `backdoor IRA (filer ${f + 1}) dropped — Roth IRA excluded`);
        } else {
          s.rothIra.conversions.push({ year: a.currentYear + t, amount: capped, taxablePortion: 0 });
          s.rothIra.firstFundedYear ??= a.currentYear + t;
          if (s.tradIra > 0) {
            noteOnce(ctx, `proRata${f}`, events, age, `backdoor with a Traditional IRA balance (filer ${f + 1}) — pro-rata rule applies in reality, not modeled (T8)`);
          }
        }
      } else {
        const rothPart = capped * p.inputs.splitIraRothPct;
        const tradPart = capped - rothPart;
        if (rothPart > 0) {
          if (!a.include.rothIra) {
            noteOnce(ctx, `dropIraR${f}`, events, age, `Roth IRA contributions (filer ${f + 1}) dropped — account excluded`);
          } else {
            s.rothIra.basis += rothPart;
            s.rothIra.firstFundedYear ??= a.currentYear + t;
          }
        }
        if (tradPart > 0) {
          if (!a.include.tradIra) {
            noteOnce(ctx, `dropIraT${f}`, events, age, `Traditional IRA contributions (filer ${f + 1}) dropped — account excluded`);
          } else {
            s.tradIra += tradPart;
            if (!p.deductible) {
              s.tradIraBasis += tradPart;
              noteOnce(ctx, `nondeduct${f}`, events, age, `Traditional IRA contributions are nondeductible (filer ${f + 1}) — tracked as basis; consider the backdoor toggle`);
            }
          }
        }
      }
    }

    // Match (gate #7), 415(c)-clamped, into its destination's sub-balance
    const m = p.inputs.match;
    const flatIndexed = m.flatAmount * (a.indexWithInflation ? Math.pow(1 + a.inflation, t) : 1);
    const raw = matchAmount(m, deferralTotal, p.salary[t], flatIndexed);
    const allowed = clamp415c(base401kUsed, raw, 0, limitsY);
    if (allowed > 0 && a.include[m.destination]) {
      if (m.destination === 'trad401k') {
        s.trad401k += allowed;
        s.matchTrad += allowed;
      } else {
        // Employer Roth match is taxed as income when made ⇒ it IS contribution
        // basis; on rollover it becomes regular Roth IRA basis (M2 gate #5).
        s.roth401k += allowed;
        s.roth401kBasis += allowed;
        s.matchRoth += allowed;
        s.matchRothBasis += allowed;
      }
    }

    // Separation: drop the unvested fraction at the last working age
    if (p.separation !== null && ageF === p.separation && m.vestingPct < 1) {
      const dropTrad = Math.min(s.matchTrad * (1 - m.vestingPct), s.trad401k);
      const dropRoth = Math.min(s.matchRoth * (1 - m.vestingPct), s.roth401k);
      const dropRothBasis = Math.min(s.matchRothBasis * (1 - m.vestingPct), s.roth401kBasis);
      if (dropTrad + dropRoth > 0) {
        s.trad401k -= dropTrad;
        s.matchTrad -= dropTrad;
        s.roth401k -= dropRoth;
        s.matchRoth -= dropRoth;
        s.roth401kBasis -= dropRothBasis;
        s.matchRothBasis -= dropRothBasis;
        events.push({
          kind: 'note',
          age,
          label: `unvested match dropped at separation (filer ${f + 1}): ${Math.round(dropTrad + dropRoth)}`,
        });
      }
    }
  }

  // HSA (household schedule → youngest filer under 65; M2 decision #2)
  if (ctx.hsaC[t] > 0) {
    if (!a.include.hsa) {
      noteOnce(ctx, 'dropHsa', events, age, 'HSA contributions dropped — account excluded');
    } else {
      const capped = capHouseholdHsa(ctx.hsaC[t], filerAges, a.hsaCoverage, limitsY);
      if (capped > 0) {
        capNote(events, age, 'HSA', ctx.hsaC[t], capped);
        const eligible = filerAges
          .map((av, i) => ({ age: av, i }))
          .filter((x) => x.age < HSA_CONTRIBUTION_STOP_AGE)
          .sort((x, y) => x.age - y.age);
        ctx.filers[eligible[0].i].hsa += capped;
      } else {
        noteOnce(ctx, 'hsaStop', events, age, 'HSA contributions auto-stop at 65');
      }
    }
  }

  // Household taxable + cash
  if (ctx.taxableC[t] > 0) {
    if (!a.include.taxable) {
      noteOnce(ctx, 'dropTaxable', events, age, 'taxable contributions dropped — account excluded');
    } else {
      ctx.taxable += ctx.taxableC[t];
      ctx.taxableBasis += ctx.taxableC[t];
    }
  }
  if (ctx.cashC[t] > 0) {
    if (!a.include.cash) {
      noteOnce(ctx, 'dropCash', events, age, 'cash contributions dropped — account excluded');
    } else {
      ctx.cash += ctx.cashC[t];
    }
  }
}

/** Windfalls — nominal, land at face (gate #12); per-filer targets go to w.filer (default filer 1). */
export function applyWindfalls(ctx: SimContext, t: number, events: MarkerEvent[]): void {
  const { a } = ctx;
  const age = ctx.startAge + t;
  for (const w of ctx.g.windfalls) {
    if (w.age !== age) continue;
    if (!a.include[w.target]) {
      noteOnce(ctx, `dropWindfall${w.age}${w.target}`, events, age, `windfall "${w.label}" dropped — ${w.target} excluded`);
      continue;
    }
    const s = ctx.filers[w.filer ?? 0];
    if (!s) {
      noteOnce(ctx, `dropWindfallF${w.age}${w.target}`, events, age, `windfall "${w.label}" dropped — no filer ${(w.filer ?? 0) + 1}`);
      continue;
    }
    switch (w.target) {
      case 'taxable':
        ctx.taxable += w.amount;
        ctx.taxableBasis += w.amount;
        break;
      case 'cash':
        ctx.cash += w.amount;
        break;
      case 'trad401k':
        s.trad401k += w.amount;
        break;
      case 'tradIra':
        s.tradIra += w.amount;
        break;
      case 'roth401k':
        s.roth401k += w.amount;
        s.roth401kBasis += w.amount;
        break;
      case 'rothIra':
        s.rothIra.basis += w.amount;
        s.rothIra.firstFundedYear ??= a.currentYear + t;
        break;
      case 'hsa':
        s.hsa += w.amount;
        break;
    }
    events.push({ kind: 'windfall', age, label: w.label });
  }
}

const pct = (v: number): string => {
  const p = Math.round(v * 1000) / 10; // one decimal, no float dust (0.07 → 7, not 7.000…01)
  return `${p}%`;
};

/** M4.5 C.3: marker whenever the effective invested return changes between years. */
export function emitReturnChangeMarker(ctx: SimContext, t: number, events: MarkerEvent[]): void {
  const prev = ctx.investedGrossReturns[t - 1];
  const now = ctx.investedGrossReturns[t];
  if (t > 1 && now !== prev) {
    events.push({
      kind: 'returnChange',
      age: ctx.startAge + t,
      label: `return ${pct(prev)} → ${pct(now)}`,
    });
  }
}

/** Contribution stop/reduce/resume/increase/start markers (SPEC §3, M2 gate #2). */
export function emitStreamMarkers(ctx: SimContext, t: number, events: MarkerEvent[]): void {
  const age = ctx.startAge + t;
  const streams: Array<[string, number[]]> = [
    ...ctx.perFiler.map((p, f): [string, number[]] => [`401k (filer ${f + 1})`, p.c401kRaw]),
    ...ctx.perFiler.map((p, f): [string, number[]] => [`IRA (filer ${f + 1})`, p.iraRaw]),
    ['HSA', ctx.hsaRaw],
    ['taxable', ctx.taxableRaw],
    ['cash', ctx.cashRaw],
  ];
  for (const [label, arr] of streams) {
    if (arr[t] !== arr[t - 1]) {
      const verb =
        arr[t] === 0
          ? 'stop'
          : arr[t] < arr[t - 1]
            ? 'reduced'
            : arr[t - 1] > 0
              ? 'increased'
              : arr.slice(0, t).some((v) => v > 0)
                ? 'resume'
                : 'start';
      events.push({ kind: 'contributionChange', age, label: `${label} contributions ${verb}` });
    }
  }
}

/** Merged display snapshot (M1 #1: per-filer sub-balances summed). */
export function takeSnapshot(
  ctx: SimContext,
  age: number,
  year: number,
  taxPaid: number,
  events: MarkerEvent[],
): RunYear {
  const { a } = ctx;
  const sum = (pick: (s: FilerState) => number) =>
    ctx.filers.reduce((acc, s) => acc + pick(s), 0);
  const rothConversions = ctx.filers.flatMap((s) => s.rothIra.conversions.map((c) => ({ ...c })));
  const accounts: Record<AccountId, BalanceSnapshot> = {
    trad401k: { balance: sum((s) => s.trad401k), basis: 0 },
    tradIra: { balance: sum((s) => s.tradIra), basis: sum((s) => s.tradIraBasis) },
    roth401k: {
      balance: sum((s) => s.roth401k),
      basis: 0,
      rothBasis: sum((s) => s.roth401kBasis),
      rothEarnings: sum((s) => s.roth401k - s.roth401kBasis),
    },
    rothIra: {
      balance: sum((s) => rothIraTotal(s.rothIra)),
      basis: 0,
      rothBasis: sum((s) => s.rothIra.basis),
      rothConversions,
      rothEarnings: sum((s) => s.rothIra.earnings),
    },
    hsa: { balance: sum((s) => s.hsa), basis: 0 },
    taxable: { balance: ctx.taxable, basis: ctx.taxableBasis },
    cash: { balance: ctx.cash, basis: ctx.cash },
  };
  const ate = ateByAccount(accounts, a, ctx.ateRate);
  const buckets = rollupBuckets(accounts, ate);
  const total = ALL_ACCOUNTS.reduce((acc, id) => acc + accounts[id].balance, 0);
  const totalAte = ALL_ACCOUNTS.reduce((acc, id) => acc + ate[id], 0);
  return {
    age,
    year,
    accounts,
    ate, // M7: snapshot so UI/table render the SAME valuation the engine used
    buckets,
    total,
    totalAte,
    accessible: totalAte, // run.ts overwrites with the access-aware value (M3)
    locked: 0,
    taxPaidThisYear: taxPaid,
    cumulativeTax: ctx.cumulativeTax,
    gap: false,
    events,
  };
}

export function yearZeroEvents(ctx: SimContext): MarkerEvent[] {
  return ctx.zeroed.map((id) => ({
    kind: 'note' as const,
    age: ctx.startAge,
    label: `${id} excluded — ignored entirely`,
  }));
}

export function simulateAccumulation(
  a: Assumptions,
  g: GrowthScenario,
  stopAtAge?: number,
): RunYear[] {
  const ctx = createSimContext(a, g);
  const years: RunYear[] = [
    takeSnapshot(ctx, ctx.startAge, a.currentYear, 0, yearZeroEvents(ctx)),
  ];
  for (let t = 1; t <= ctx.n; t++) {
    const age = ctx.startAge + t;
    const events: MarkerEvent[] = [];
    let taxPaid = growYear(ctx, t, 'accumulation');
    const contributing = stopAtAge === undefined || age < stopAtAge;
    if (contributing) {
      contributeYear(ctx, t, events);
    }
    applyWindfalls(ctx, t, events);
    if (contributing) {
      emitStreamMarkers(ctx, t, events);
    }
    emitReturnChangeMarker(ctx, t, events);
    ctx.cumulativeTax += taxPaid;
    years.push(takeSnapshot(ctx, age, a.currentYear + t, taxPaid, events));
  }
  return years;
}
