# ARCHITECTURE.md (approved home for structure + signatures — M0 deliverable)

Proposed file structure and engine function list with type signatures, per SPEC §14 M0, amended by the M0 gate decisions (VARIABLES.md §7) and the M1 gate amendments (§7.1). As of M1, `src/engine/types.ts` is the authoritative type source; the sketch in §2 tracks it at lower resolution.

## 1. File structure

```
fuelgauge/
├── docs/
│   ├── VARIABLES.md          # every input (M0)
│   ├── ASSUMPTIONS.md        # every simplification + bias (M0, mirrored in-app)
│   └── ARCHITECTURE.md       # this file (M0)
├── scripts/
│   └── table.ts              # npm run table -- input.json (M2, extended through drawdown in M3)
│                             # prints real and nominal side by side, including ATE (gate #14)
├── src/
│   ├── engine/               # pure TS — never imports React (CLAUDE.md)
│   │   ├── types.ts          # M1 — all types, derived from VARIABLES.md
│   │   ├── defaults.ts       # M1 — the single home of every default; no magic numbers elsewhere
│   │   ├── schedule.ts       # M1 — rows → per-age array; indexing; gaps = 0; one-time rows; toReal
│   │   ├── persist.ts        # M1 — PersistedState schemaVersion gate + migration stub (M1 #2);
│   │   │                     #      shared by URL hash, JSON import (M4), table-script input (M2)
│   │   ├── limits.ts         # M2 — caps, splits, catch-ups, Roth-catch-up threshold, couple summing, 415(c)
│   │   ├── accumulate.ts     # M2 — year loop: returns net of fees (invested only), drag, cash-interest tax,
│   │   │                     #      match (deferral-gated), vesting, windfalls, basis, Roth sub-balances
│   │   ├── ate.ts            # M2 — after-tax-equivalent lens (gate #14: needed for the M2 table)
│   │   ├── tax.ts            # M2/M3 — simple mode (gross-up, sale tax, income-row tax); bracket mode M7
│   │   ├── access.ts         # M3 — access ages (takes the growth scenario), rule of 55, Roth clock,
│   │   │                     #      conversion seasoning (taxable portion only), RMD start age
│   │   ├── drawdown.ts       # M3 — need, withdrawal order, gross-up, IRA-basis pro-rata, gaps
│   │   ├── run.ts            # M3 — run = growth scenario × withdrawal strategy; rollover timing
│   │   ├── metrics.ts        # M3 — FIRE milestones, bridge analysis, summary (lazy earliestNoGapStartAge)
│   │   ├── presets.ts        # M6 — scenario/strategy generators for the Compare tab (gate #E2)
│   │   └── *.test.ts         # Vitest, colocated with each module
│   ├── state/                # M4 — app state; URL-hash + JSON export/import round-trip
│   ├── ui/                   # M4–M6 — imports the engine, never the reverse
│   │   ├── tabs/             # GrowthTab (M4), DrawdownTab (M5), CompareTab (M6)
│   │   ├── components/       # schedule editor w/ sparkline, charts (ECharts), bridge bars, assumptions panel
│   │   └── theme/            # bucket colors (consistent everywhere), dark/light
│   ├── App.tsx               # M4
│   └── main.tsx              # M4
├── index.html, vite.config.ts, tsconfig.json, package.json, tailwind config
```

Phase 2 lands inside existing modules (bracket tables in `tax.ts` M7, ladder as `ladder.ts` M8, mega-backdoor in `accumulate.ts` M9, RMDs as `rmd.ts` M10) — types reserve the fields from M1 so nothing reshapes later.

## 2. Core types (sketch)

```ts
type AccountId = 'trad401k' | 'tradIra' | 'roth401k' | 'rothIra' | 'hsa' | 'taxable' | 'cash';
type Bucket = 'preTax' | 'roth' | 'hsa' | 'taxable';           // §2 mapping is a constant in defaults.ts

interface ScheduleRow { fromAge: number; toAge: number; value: number }   // today's $/yr or %/yr
interface OneTimeRow  { age: number; amount: number; label: string }
interface Windfall    { age: number; amount: number; target: AccountId; label: string }  // amount is NOMINAL (gate #12)
interface IncomeRow   { kind: 'partTime' | 'pension' | 'socialSecurity';
                        fromAge: number; toAge: number; amount: number; label?: string }
interface RothConversion { year: number; amount: number; taxablePortion: number }        // gate #4

interface Filer { currentAge: number }   // separation age lives in the scenario (gate #2);
                                          // birthYear derived = currentYear − currentAge (M1 #4)
interface FilerBalances { /* trad401k, tradIra(+basis), roth401k(+basis), rothIra, hsa — per filer (M1 #1) */ }
interface CurrentBalances { perFiler: FilerBalances[]; taxable: number; taxableBasis: number; cash: number }
interface Assumptions { /* every VARIABLES §1 row; incl. fireSpendingTarget, coastTargetAge */ }
interface GrowthScenario { /* every VARIABLES §2 row; perFiler[] carries its own EmployerMatch incl. vestingPct (M1 #5) */ }
interface WithdrawalStrategy { /* every VARIABLES §3 row; drawdownStartAge?: number — undefined = auto */ }
interface PersistedState {  // M1 #2 — the one serialized shape (URL hash, JSON, table-script input)
  schemaVersion: number; assumptions: Assumptions;
  growthScenarios: GrowthScenario[]; strategies: WithdrawalStrategy[]; display: DisplayState;
}

interface BalanceSnapshot {                     // one account, one year-end
  balance: number; basis: number;               // taxable & cash basis; trad IRA nondeductible basis (gate #11)
  rothBasis?: number; rothConversions?: RothConversion[]; rothEarnings?: number;   // Roth IRA & Roth 401k (gate #3)
}
interface RunYear {                             // engine output contract (SPEC §6)
  age: number; year: number;                    // age = filer 1's age (gate #1)
  accounts: Record<AccountId, BalanceSnapshot>;
  buckets: Record<Bucket, { gross: number; ate: number }>;
  total: number; totalAte: number;
  accessible: number; locked: number;           // ATE terms
  taxPaidThisYear: number; cumulativeTax: number;
  need?: number; withdrawals?: Partial<Record<AccountId, number>>;
  gap: boolean; events: MarkerEvent[];          // windfall / contribution change / drawdown start / access age / rollover / roth-catch-up note
}
interface RunResult { years: RunYear[]; notes: string[]; access: AccessMap; summary: RunSummary }
interface RunSummary {                          // compare-grid cell (SPEC §3, gate #E3)
  lifetimeAfterTaxSpending: number; terminalAte: number;
  yearsRetired: number;                         // = horizon − drawdown start
  firstGapAge: number | null;                   // reported separately from the search below
  bridgeFunded: boolean; cumulativeTax: number;
  // earliestNoGapStartAge: number | null — a search over drawdown ages (up to ~60 runs per cell);
  // computed lazily on demand and memoized, NOT eagerly in summarizeRun (gate #E1)
}
```

## 3. Engine functions

```ts
// schedule.ts (M1)
resolveSchedule(rows: ScheduleRow[], opts: {
  startAge: number; endAge: number;            // inclusive integer ages, in the row-owner's age domain
  indexed: boolean; inflation: number;         // today's $ → nominal at each age offset
}): number[];                                  // one value per age; gaps = 0
resolveOneTime(rows: OneTimeRow[], opts: /* same */): number[];
toReal(nominal: number, yearsFromNow: number, inflation: number): number;   // gate #14 — engine-side;
// used by metrics.ts, scripts/table.ts, and the UI; "real at the UI layer only" is dead

// limits.ts (M2)
resolveLimits(base: LimitSet, yearsFromNow: number, indexed: boolean, inflation: number): LimitSet;
capContributions(requested: RequestedContributions, filerAges: number[], salaries: number[],
                 limits: LimitSet, coverage: 'selfOnly' | 'family'): CappedContributions;
// shared deferral limit across trad/Roth split; catch-up bands 50+ / 60–63 / (IRA 50+, HSA 55+);
// salary > rothCatchupThreshold ⇒ catch-up portion forced to Roth 401k + note (gate #10);
// per-filer limits then summed for couples; household HSA gets both 55+ catch-ups (M18);
// 415(c) caps deferral + match (+ after-tax, P2)

// accumulate.ts (M2)
simulateAccumulation(a: Assumptions, g: GrowthScenario, stopAtAge?: number): RunYear[];
// per year: capped contributions + match + windfalls (nominal) at EOY;
// match = rate × min(filer's total 401k deferral incl. Roth, cap × salary), zero when deferral zero;
// flat match unconditional (gate #7); unvested match dropped at that filer's separation age;
// growth at per-account return net of fees — fees on invested accounts only;
// cash interest taxed annually at marginal-now (gate #8); dividend drag on invested taxable;
// basis tracking (taxable, cash, trad-IRA nondeductible per gate #11), Roth sub-balances (gate #3/#4);
// HSA contributions stop at 65; backdoor ⇒ RothConversion{taxablePortion: 0}

// ate.ts (M2)
computeAte(accounts: Record<AccountId, BalanceSnapshot>, a: Assumptions): Record<Bucket, number>;
// pre-tax × (1 − effective); Roth & cash at face; HSA face if medical else like pre-tax;
// taxable minus LTCG on embedded gain

// tax.ts (M2/M3; bracket mode M7)
grossUpPreTax(netNeeded: number, effectiveRate: number, stateRate: number): number;
taxOnTaxableSale(grossSale: number, basisFraction: number, ltcgRate: number, stateRate: number): number;
dividendDrag(balance: number, divYield: number, divTaxRate: number): number;
cashInterestTax(interest: number, phase: 'accumulation' | 'drawdown', a: Assumptions): number;
simpleIncomeTax(row: IncomeRow, amount: number, a: Assumptions): number;   // gate #9:
// partTime & pension at effective; socialSecurity at 85% × effective

// access.ts (M3)
computeAccessAges(a: Assumptions, g: GrowthScenario): AccessMap;   // gate #2: rule of 55 reads the
// scenario's per-filer separation age (derived from salary, overridable)
separationAge(g: GrowthScenario, filerIndex: number): number | null;  // last age with salary > 0, or override
accessibleConversionAmount(c: RothConversion, inYear: number): number; // gate #4: nontaxable portion always;
// taxable portion once inYear ≥ c.year + 5; taxable-first ordering within the conversion
rmdStartAge(birthYear: number): 73 | 75;                            // consumed M10

// drawdown.ts (M3)
runDrawdownYear(state: PortfolioState, needNominal: number, order: WithdrawalSource[],
                access: AccessMap, a: Assumptions): { state: PortfolioState;
                withdrawals: Partial<Record<AccountId, number>>; taxPaid: number; gap: boolean };
// withdrawals at start of year; order default per gate #5 (access filter makes it self-adjusting);
// pre-tax grossed up (trad-IRA nondeductible basis recovered pro rata tax-free, gate #11);
// taxable taxed on gain portion; locked money never drawn; shortfall ⇒ gap (reported, not covered)

// run.ts (M3)
simulateRun(a: Assumptions, g: GrowthScenario, w: WithdrawalStrategy): RunResult;
// resolves drawdown start (auto: earliest separation in g, else coastTargetAge — gate #15);
// accumulates to drawdown start (contributions cut there, note emitted; salary-gap note per M15);
// rollovers: Roth 401k at drawdown start (basis→basis, earnings→earnings);
// Trad 401k at later of drawdown start and 59½ (rule-of-55 money drawn in-plan until then, gate #6);
// then drawdown years to horizon

// metrics.ts (M3)
fireNumber(annualSpendReal: number, swr: number): number;
coastFireAge(a: Assumptions, g: GrowthScenario): number | null;     // vs fireSpendingTarget at coastTargetAge,
// labeled "vs target spend $X, target age Y" (gate #13)
firstAgeAtValue(years: RunYear[], targetReal: number): number | null;   // $1M age, etc. — compares via toReal
analyzeBridge(run: RunResult): BridgeReport;   // per-year covered/gap bars, totals (SPEC §3 Drawdown)
summarizeRun(run: RunResult): RunSummary;      // cheap fields only
earliestNoGapStartAge(a: Assumptions, g: GrowthScenario, w: WithdrawalStrategy): number | null;
// lazy + memoized: binary/linear search over start ages, ~60 simulateRun calls worst case (gate #E1)

// presets.ts (M6, gate #E2)
equalTakeHomeRoth(g: GrowthScenario, a: Assumptions): GrowthScenario;  // SPEC §8: Path A min(limit, C÷(1−t_now))
// pre-tax + spill to taxable vs Path B min(limit, C) Roth + spill; match identical
stopContributingAt(g: GrowthScenario, age: number): GrowthScenario;
reduceTo(g: GrowthScenario, amount: number, fromAge: number): GrowthScenario;
retireAt(w: WithdrawalStrategy, age: number): WithdrawalStrategy;
stressFirstYears(g: GrowthScenario, returns: number[]): GrowthScenario;  // −20/−10/0 preset
```

## 4. Data flow

```
Assumptions ──┐
GrowthScenario ─┼─→ simulateRun ─→ RunResult ─→ charts / tables / bridge / readouts
WithdrawalStrategy ┘                  └→ summarizeRun → compare grid (runs = scenarios × strategies)
```

- Engine computes **nominal only**; anything real — metric targets, table output, chart display — goes through the engine's `toReal` (gate #14). The UI never does its own inflation math.
- UI state (three layers + display toggles) serializes to URL hash and JSON in `src/state/` (M4); the engine is a pure function of its arguments — same inputs, same outputs, no clocks, no I/O (the calendar-year anchor is an input).
- The Growth tab calls `simulateAccumulation` directly (growth-only chart never declines); the Drawdown and Compare tabs call `simulateRun` (SPEC §12: same run, different lens).
- `scripts/table.ts` feeds a JSON file through the same engine and prints the per-year per-account table, real and nominal side by side including ATE — the reconciliation path for the M2/M3 gates.

## 5. UI notes for M4+ (recorded at the M1/M2 gates)

- **Cash return** must surface as an editable "Cash return" field (it is stored as a per-account return-override row) so users editing the global return schedule can see why cash didn't move.
- **Each account's effective return schedule must be visible** — precedence is: scenario override (all invested accounts) > per-account override > global schedule; cash always uses its own return (M2 gate #6).
- **Ids** for scenarios/strategies are generated and uniqued by the UI; engine factories default to `'base'`.
- **Second filer added** ⇒ suggest flipping `hsaCoverage` to family.
- **Schedule rows are never re-sorted in storage** — order is semantic (later rows win); sort in the editor for display only. Quick actions NORMALIZE rows (clip/drop via `src/state/scheduleOps.ts`) — they never append override rows (M4.5 C.1); the overlap rule remains for manual edits.
- **Marker placement (M4.5 B.4):** engine events are "from age N"; the chart x-axis is numeric and renders REGIME changes (contribution changes, return changes, drawdown start, access ages, rollovers) at **N − 0.5** so the line sits on the visible bend; one-time events (windfalls, one-time expenses) render at N.
