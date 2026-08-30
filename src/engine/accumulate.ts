/**
 * Accumulation engine (M2). Year-by-year from filer 1's current age to the
 * horizon, SPEC §4 timing: growth compounds on the start-of-year balance, then
 * contributions and windfalls land at end of year — which is exactly what
 * makes FV = P(1+r)^n + C((1+r)^n − 1)/r hold for the golden test.
 *
 * Age conventions (gate #1 + M2 decision #1): RunYear.age is filer 1's age at
 * the END of that year; the growth applied during that year uses the return
 * schedule's value AT that age (so the age-51 year is the first at the post-50
 * rate). Row t=0 is today's snapshot — no growth, no contributions.
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
import { cashInterestTax, dividendDrag } from './tax';
import type {
  AccountId,
  Assumptions,
  BalanceSnapshot,
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

interface FilerState {
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

const INVESTED: ReadonlySet<AccountId> = new Set<AccountId>([
  'trad401k',
  'tradIra',
  'roth401k',
  'rothIra',
  'hsa',
  'taxable',
]);

export function simulateAccumulation(
  a: Assumptions,
  g: GrowthScenario,
  stopAtAge?: number,
): RunYear[] {
  const startAge = a.filers[0].currentAge;
  const endAge = a.horizonAge;
  const n = endAge - startAge;
  const idxOpts = { startAge, endAge, indexed: a.indexWithInflation, inflation: a.inflation };
  const rawOpts = { startAge, endAge, indexed: false, inflation: 0 };
  const filerOpts = (f: number, indexed: boolean) => ({
    startAge: a.filers[f].currentAge,
    endAge: a.filers[f].currentAge + n,
    indexed: indexed && a.indexWithInflation,
    inflation: indexed ? a.inflation : 0,
  });

  // --- resolve returns (rates, never indexed; filer-1 age domain) -----------
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

  // --- resolve contribution streams -----------------------------------------
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
  const hsaC = resolveSchedule(g.hsaContrib, idxOpts);
  const hsaRaw = resolveSchedule(g.hsaContrib, rawOpts);
  const taxableC = resolveSchedule(g.taxableContrib, idxOpts);
  const taxableRaw = resolveSchedule(g.taxableContrib, rawOpts);
  const cashC = resolveSchedule(g.cashContrib, idxOpts);
  const cashRaw = resolveSchedule(g.cashContrib, rawOpts);

  // --- initial state ---------------------------------------------------------
  const zeroed: string[] = [];
  const filerState: FilerState[] = a.filers.map((_, f) => {
    const b = a.balances.perFiler[f];
    return {
      trad401k: a.include.trad401k ? b.trad401k : 0,
      tradIra: a.include.tradIra ? b.tradIra : 0,
      tradIraBasis: a.include.tradIra ? b.tradIraBasis : 0,
      roth401k: a.include.roth401k ? b.roth401k : 0,
      roth401kBasis: a.include.roth401k ? b.roth401kBasis : 0,
      rothIra: a.include.rothIra
        ? {
            basis: b.rothIra.basis,
            conversions: b.rothIra.conversions.map((c) => ({ ...c })),
            earnings: b.rothIra.earnings,
            firstFundedYear: b.rothIra.firstFundedYear,
          }
        : { basis: 0, conversions: [], earnings: 0, firstFundedYear: null },
      hsa: a.include.hsa ? b.hsa : 0,
      matchTrad: 0, // starting balances count as fully vested
      matchRoth: 0,
      matchRothBasis: 0,
    };
  });
  let taxable = a.include.taxable ? a.balances.taxable : 0;
  let taxableBasis = a.include.taxable ? a.balances.taxableBasis : 0;
  let cash = a.include.cash ? a.balances.cash : 0;
  for (const id of ALL_ACCOUNTS) {
    if (!a.include[id]) zeroed.push(id);
  }

  let cumulativeTax = 0;
  const noted = new Set<string>(); // one-time notes (nondeductible, pro-rata, drops, HSA stop, forced Roth)

  const rothIraTotal = (s: RothIraState) =>
    s.basis + s.earnings + s.conversions.reduce((sum, c) => sum + c.amount, 0);

  const snapshot = (age: number, year: number, taxPaid: number, events: MarkerEvent[]): RunYear => {
    const sum = (pick: (s: FilerState) => number) =>
      filerState.reduce((acc, s) => acc + pick(s), 0);
    const rothConversions = filerState.flatMap((s) => s.rothIra.conversions.map((c) => ({ ...c })));
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
      taxable: { balance: taxable, basis: taxableBasis },
      cash: { balance: cash, basis: cash },
    };
    const ate = ateByAccount(accounts, a);
    const buckets = rollupBuckets(accounts, ate);
    const total = ALL_ACCOUNTS.reduce((acc, id) => acc + accounts[id].balance, 0);
    const totalAte = ALL_ACCOUNTS.reduce((acc, id) => acc + ate[id], 0);
    return {
      age,
      year,
      accounts,
      buckets,
      total,
      totalAte,
      accessible: totalAte, // placeholder until M3 computes access
      locked: 0,
      taxPaidThisYear: taxPaid,
      cumulativeTax,
      gap: false,
      events,
    };
  };

  const noteOnce = (key: string, events: MarkerEvent[], age: number, label: string) => {
    if (noted.has(key)) return;
    noted.add(key);
    events.push({ kind: 'note', age, label });
  };

  const fmtMoney = (v: number) => Math.round(v).toLocaleString('en-US');
  // Spec: "capped at limits" means cap AND warn — emitted every capped year.
  const capNote = (events: MarkerEvent[], age: number, label: string, requested: number, capped: number) => {
    if (requested > capped + 1e-9) {
      events.push({
        kind: 'note',
        age,
        label: `${label} requested ${fmtMoney(requested)}, capped at ${fmtMoney(capped)}`,
      });
    }
  };

  // --- year 0: today ----------------------------------------------------------
  const year0Events: MarkerEvent[] = [];
  for (const id of zeroed) {
    year0Events.push({ kind: 'note', age: startAge, label: `${id} excluded — ignored entirely` });
  }
  const years: RunYear[] = [snapshot(startAge, a.currentYear, 0, year0Events)];

  // --- main loop ---------------------------------------------------------------
  for (let t = 1; t <= n; t++) {
    const age = startAge + t;
    const events: MarkerEvent[] = [];
    let taxPaid = 0;

    // 1. Growth on start-of-year balances
    for (let f = 0; f < filerState.length; f++) {
      const s = filerState[f];
      s.trad401k *= 1 + returns.trad401k[t];
      s.matchTrad *= 1 + returns.trad401k[t];
      s.roth401k *= 1 + returns.roth401k[t];
      s.matchRoth *= 1 + returns.roth401k[t];
      s.tradIra *= 1 + returns.tradIra[t];
      s.hsa *= 1 + returns.hsa[t];
      s.rothIra.earnings += rothIraTotal(s.rothIra) * returns.rothIra[t];
    }
    if (a.include.taxable) {
      const drag = dividendDrag(taxable, a.dividendYield, a.dividendTaxRate);
      // Reinvested after-tax dividends are new cost basis (M2 gate bug fix):
      // basis += start-of-year balance × yield × (1 − dividend tax rate)
      taxableBasis += taxable * a.dividendYield * (1 - a.dividendTaxRate);
      taxable = taxable * (1 + returns.taxable[t]) - drag;
      taxPaid += drag;
    }
    if (a.include.cash) {
      const interest = cash * returns.cash[t];
      const tax = cashInterestTax(interest, 'accumulation', a);
      cash += interest - tax;
      taxPaid += tax;
    }

    // 2. Contributions (cut at the strategy's drawdown start — M3 passes stopAtAge)
    const contributing = stopAtAge === undefined || age < stopAtAge;
    if (contributing) {
      const limitsY = resolveLimits(a.limits, t, a.indexWithInflation, a.inflation);
      const filerAges = a.filers.map((fl) => fl.currentAge + t);

      for (let f = 0; f < filerState.length; f++) {
        const s = filerState[f];
        const p = perFiler[f];
        const ageF = filerAges[f];

        // 401k under one shared deferral limit
        let base401kUsed = 0;
        let deferralTotal = 0; // incl. Roth side and catch-up — the match formula's input (gate #7)
        if (p.c401k[t] > 0) {
          if (!a.include.trad401k && !a.include.roth401k) {
            noteOnce(`drop401k${f}`, events, age, `401k contributions (filer ${f + 1}) dropped — account excluded`);
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
              noteOnce(`forcedRoth${f}`, events, age, `catch-up forced to Roth 401k (filer ${f + 1}) — salary above threshold`);
              if (!noted.has(`forcedRothEvent${f}`)) {
                noted.add(`forcedRothEvent${f}`);
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
              noteOnce(`dropIraR${f}`, events, age, `backdoor IRA (filer ${f + 1}) dropped — Roth IRA excluded`);
            } else {
              s.rothIra.conversions.push({ year: a.currentYear + t, amount: capped, taxablePortion: 0 });
              s.rothIra.firstFundedYear ??= a.currentYear + t;
              if (s.tradIra > 0) {
                noteOnce(`proRata${f}`, events, age, `backdoor with a Traditional IRA balance (filer ${f + 1}) — pro-rata rule applies in reality, not modeled (T8)`);
              }
            }
          } else {
            const rothPart = capped * p.inputs.splitIraRothPct;
            const tradPart = capped - rothPart;
            if (rothPart > 0) {
              if (!a.include.rothIra) {
                noteOnce(`dropIraR${f}`, events, age, `Roth IRA contributions (filer ${f + 1}) dropped — account excluded`);
              } else {
                s.rothIra.basis += rothPart;
                s.rothIra.firstFundedYear ??= a.currentYear + t;
              }
            }
            if (tradPart > 0) {
              if (!a.include.tradIra) {
                noteOnce(`dropIraT${f}`, events, age, `Traditional IRA contributions (filer ${f + 1}) dropped — account excluded`);
              } else {
                s.tradIra += tradPart;
                if (!p.deductible) {
                  s.tradIraBasis += tradPart;
                  noteOnce(`nondeduct${f}`, events, age, `Traditional IRA contributions are nondeductible (filer ${f + 1}) — tracked as basis; consider the backdoor toggle`);
                }
              }
            }
          }
        }

        // Match (gate #7), 415(c)-clamped, into its destination's sub-balance
        const m = p.inputs.match;
        const flatIndexed =
          m.flatAmount * (a.indexWithInflation ? Math.pow(1 + a.inflation, t) : 1);
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
          const dropTrad = s.matchTrad * (1 - m.vestingPct);
          const dropRoth = s.matchRoth * (1 - m.vestingPct);
          const dropRothBasis = s.matchRothBasis * (1 - m.vestingPct);
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
      if (hsaC[t] > 0) {
        if (!a.include.hsa) {
          noteOnce('dropHsa', events, age, 'HSA contributions dropped — account excluded');
        } else {
          const capped = capHouseholdHsa(hsaC[t], filerAges, a.hsaCoverage, limitsY);
          if (capped > 0) {
            capNote(events, age, 'HSA', hsaC[t], capped);
            const eligible = filerAges
              .map((av, i) => ({ age: av, i }))
              .filter((x) => x.age < HSA_CONTRIBUTION_STOP_AGE)
              .sort((x, y) => x.age - y.age);
            filerState[eligible[0].i].hsa += capped;
          } else {
            noteOnce('hsaStop', events, age, 'HSA contributions auto-stop at 65');
          }
        }
      }

      // Household taxable + cash
      if (taxableC[t] > 0) {
        if (!a.include.taxable) {
          noteOnce('dropTaxable', events, age, 'taxable contributions dropped — account excluded');
        } else {
          taxable += taxableC[t];
          taxableBasis += taxableC[t];
        }
      }
      if (cashC[t] > 0) {
        if (!a.include.cash) {
          noteOnce('dropCash', events, age, 'cash contributions dropped — account excluded');
        } else {
          cash += cashC[t];
        }
      }
    }

    // 3. Windfalls — nominal, land at face (gate #12); per-filer targets go to w.filer (default filer 1)
    for (const w of g.windfalls) {
      if (w.age !== age) continue;
      if (!a.include[w.target]) {
        noteOnce(`dropWindfall${w.age}${w.target}`, events, age, `windfall "${w.label}" dropped — ${w.target} excluded`);
        continue;
      }
      const s = filerState[w.filer ?? 0];
      if (!s) {
        noteOnce(`dropWindfallF${w.age}${w.target}`, events, age, `windfall "${w.label}" dropped — no filer ${(w.filer ?? 0) + 1}`);
        continue;
      }
      switch (w.target) {
        case 'taxable':
          taxable += w.amount;
          taxableBasis += w.amount;
          break;
        case 'cash':
          cash += w.amount;
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

    // 4. Contribution stop/reduce markers (SPEC §3) — detected on unindexed streams
    if (contributing) {
      const streams: Array<[string, number[]]> = [
        ...perFiler.map((p, f): [string, number[]] => [`401k (filer ${f + 1})`, p.c401kRaw]),
        ...perFiler.map((p, f): [string, number[]] => [`IRA (filer ${f + 1})`, p.iraRaw]),
        ['HSA', hsaRaw],
        ['taxable', taxableRaw],
        ['cash', cashRaw],
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

    cumulativeTax += taxPaid;
    years.push(snapshot(age, a.currentYear + t, taxPaid, events));
  }

  return years;
}
