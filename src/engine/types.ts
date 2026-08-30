/**
 * All model types, derived from docs/VARIABLES.md (M0-approved, incl. gate decisions §6).
 * Types only — no logic, no React. Gate references (#N) point to VARIABLES.md §6.
 */

export type AccountId =
  | 'trad401k'
  | 'tradIra'
  | 'roth401k'
  | 'rothIra'
  | 'hsa'
  | 'taxable'
  | 'cash';

export type Bucket = 'preTax' | 'roth' | 'hsa' | 'taxable';

// ---------------------------------------------------------------------------
// Rows and schedules (VARIABLES §5 semantics)
// ---------------------------------------------------------------------------

/**
 * Ages are integers in the row-owner's age domain (per-filer rows use that
 * filer's own age — gate #1). toAge null = "until horizon". Gaps resolve to 0.
 * Overlaps: later rows win (quick actions append override rows).
 * value: today's $/yr for dollar schedules, decimal rate for %/yr schedules —
 * except windfalls, which are nominal (gate #12).
 */
export interface ScheduleRow {
  fromAge: number;
  toAge: number | null;
  value: number;
}

/** amount in today's $, indexed when the inflation toggle is on. */
export interface OneTimeRow {
  age: number;
  amount: number;
  label: string;
}

/** amount is NOMINAL — "amount that lands, in that year's dollars" (gate #12). */
export interface Windfall {
  age: number;
  amount: number;
  target: AccountId;
  label: string;
}

export type IncomeKind = 'partTime' | 'pension' | 'socialSecurity';

/**
 * Simple mode taxes these (gate #9): partTime/pension at the effective rate,
 * socialSecurity at 85% × effective. Bracket mode (P2): brackets, SS 85% taxable.
 */
export interface IncomeRow {
  kind: IncomeKind;
  fromAge: number;
  toAge: number | null;
  amount: number;
  label?: string;
}

/**
 * Gate #4: seasoning (5 tax years from `year`) applies to taxablePortion only;
 * the nontaxable remainder is accessible immediately. Within a conversion,
 * IRS ordering: taxable first, then nontaxable. Backdoor ⇒ taxablePortion 0.
 */
export interface RothConversion {
  year: number;
  amount: number;
  taxablePortion: number;
}

// ---------------------------------------------------------------------------
// Assumptions layer (VARIABLES §1)
// ---------------------------------------------------------------------------

/** Separation age lives in the growth scenario (gate #2), not here. */
export interface Filer {
  currentAge: number;
  birthYear: number;
}

export interface RothIraState {
  basis: number;
  conversions: RothConversion[];
  earnings: number;
  /**
   * Starts the 5-year clock. null = first year the model sees Roth IRA funding;
   * a rollover counts as funding (gate #17 / ASSUMPTIONS M11).
   */
  firstFundedYear: number | null;
}

export interface CurrentBalances {
  trad401k: number;
  /** Nondeductible basis accrues during simulation (gate #11); no starting-basis input. */
  tradIra: number;
  roth401k: number;
  /** Gate #3: default 0 — unentered Roth 401k balance is treated as earnings (conservative). */
  roth401kBasis: number;
  rothIra: RothIraState;
  hsa: number;
  taxable: number;
  /** 0 ≤ basis ≤ balance; default = balance. */
  taxableBasis: number;
  /** Basis = balance; interest taxed annually (gate #8). */
  cash: number;
}

export type TaxMode = 'simple' | 'bracket';
export type FilingStatus = 'single' | 'marriedJoint';

/** P2 (M7). Reserved now so nothing reshapes later. */
export interface BracketRow {
  /** Upper bound of the bracket in $; null = top bracket. */
  upTo: number | null;
  rate: number;
}

/** P2 (M7). Editable, indexed. */
export interface BracketTable {
  standardDeduction: number;
  brackets: BracketRow[];
}

/** All $ / yr, editable, indexed when the toggle is on. 2026 IRS values in defaults.ts. */
export interface LimitSet {
  deferral401k: number;
  catchUp401k50: number;
  /** Replaces (not stacks on) the 50+ catch-up at ages 60–63; back to 50+ at 64. */
  catchUp401k60to63: number;
  /** Gate #10: salary above this (indexed) forces the catch-up portion to Roth 401k. */
  rothCatchUpWageThreshold: number;
  ira: number;
  iraCatchUp50: number;
  hsaSelfOnly: number;
  hsaFamily: number;
  hsaCatchUp55: number;
  /** Caps deferrals + match + after-tax; age-based catch-ups sit outside it. */
  overall415c: number;
}

export type HsaCoverage = 'selfOnly' | 'family';
export type HsaTreatment = 'medical' | 'nonMedical';

export interface Assumptions {
  /** 1 or 2. filers[0] owns the model timeline: every unqualified age is filer 1's (gate #1). */
  filers: Filer[];
  filingStatus: FilingStatus;
  /** Flat rate, applies wherever tax is computed. */
  stateTaxRate: number;
  /** Calendar anchor for indexing, seasoning, RMD ages (gate #17). An input — the engine never reads clocks. */
  currentYear: number;

  balances: CurrentBalances;
  include: Record<AccountId, boolean>;

  inflation: number;
  indexWithInflation: boolean;
  /** Decimal %/yr rows in filer-1 age domain. */
  returnSchedule: ScheduleRow[];
  /** Per-account override; cash defaults to its own 4% here (SPEC §2). */
  returnOverrides: Partial<Record<AccountId, ScheduleRow[]>>;
  /** Subtracted from returns on invested accounts only — never cash (gate #8). */
  fees: number;
  dividendYield: number;
  dividendTaxRate: number;

  taxMode: TaxMode;
  marginalRateNow: number;
  /** Labeled "effective" in the UI (ASSUMPTIONS T1). */
  effectiveRetirementRate: number;
  ltcgRate: number;
  /** P2 (M7). */
  bracketTables?: Record<FilingStatus, BracketTable>;

  limits: LimitSet;
  hsaCoverage: HsaCoverage;

  /** Filer-1 age. */
  horizonAge: number;
  hsaTreatment: HsaTreatment;
  safeWithdrawalRate: number;
  /** Gate #13: today's $/yr; drives Growth-tab FIRE metrics and seeds new strategies. */
  fireSpendingTarget: number;
  /** Gate #13: filer-1 age; Coast FIRE metric and drawdown-start fallback (gate #15). */
  coastTargetAge: number;

  inPlanConversion: boolean;
  inServiceWithdrawal: boolean;
  afterTaxContributions: boolean;
  /** 0–1. Unvested match dropped at that filer's separation (scenario-derived, gate #2). */
  matchVestingPct: number;

  /**
   * Editable auto-fill (SPEC §2): index = filer; own-age access ages. Unset accounts
   * use the defaults (59½; rule of 55 from the scenario — computeAccessAges, M3).
   */
  accessAgeOverrides?: Array<Partial<Record<AccountId, number>>>;
}

// ---------------------------------------------------------------------------
// Growth scenario layer (VARIABLES §2)
// ---------------------------------------------------------------------------

export interface FilerGrowthInputs {
  /** Own-age domain. Also feeds separation derivation and the Roth-catch-up threshold. */
  salary: ScheduleRow[];
  /** Gate #2: default = last age with salary > 0 in this scenario. */
  separationAgeOverride?: number;
  contrib401k: ScheduleRow[];
  /** 0–1, share to Roth 401k. Catch-up portion forced to Roth above the wage threshold (gate #10). */
  split401kRothPct: number;
  contribIra: ScheduleRow[];
  /** 0–1, share to Roth IRA. */
  splitIraRothPct: number;
  /**
   * Gate #11: undefined = auto ("no" if contrib401k is non-empty, else "yes").
   * Non-deductible + backdoor off ⇒ warn + track as trad IRA basis.
   */
  tradIraDeductible?: boolean;
  /** Routes the IRA contribution to Roth as a conversion with taxablePortion 0 (gate #4). */
  backdoor: boolean;
}

export type MatchMode = 'percent' | 'flat';

/**
 * Gate #7 (percent mode): match = rate × min(filer's total 401k deferral incl.
 * Roth side, capPctOfSalary × salary) — zero when deferral is zero.
 * Flat mode is unconditional (profit-sharing stand-in, ASSUMPTIONS M17).
 */
export interface EmployerMatch {
  mode: MatchMode;
  rate: number;
  capPctOfSalary: number;
  /** Today's $/yr. */
  flatAmount: number;
  destination: 'trad401k' | 'roth401k';
}

export interface GrowthScenario {
  id: string;
  name: string;
  /** Aligned with Assumptions.filers. */
  perFiler: FilerGrowthInputs[];
  /** Aligned with Assumptions.filers — match is per filer salary (SPEC §12). */
  match: EmployerMatch[];
  /** Household schedule; contributions auto-stop at 65 (SPEC §2). */
  hsaContrib: ScheduleRow[];
  taxableContrib: ScheduleRow[];
  cashContrib: ScheduleRow[];
  /** P2 (M9); capped by 415(c). */
  megaBackdoor?: ScheduleRow[];
  windfalls: Windfall[];
  /** Enables "base / bear / stress" scenarios; unset = Assumptions schedule. */
  returnScheduleOverride?: ScheduleRow[];
}

// ---------------------------------------------------------------------------
// Withdrawal strategy layer (VARIABLES §3)
// ---------------------------------------------------------------------------

/**
 * Drawdown order entries. 'hsa' participates only under non-medical treatment.
 * Default order per gate #5 lives in defaults.ts.
 */
export type WithdrawalSource =
  | 'cash'
  | 'taxable'
  | 'preTax'
  | 'rothBasis'
  | 'seasonedConversions'
  | 'rothEarnings'
  | 'hsa';

/** P2 (M8): either a fixed $ amount or fill-to-top-of-bracket. */
export interface ConversionLadderRow {
  fromAge: number;
  toAge: number | null;
  amount?: number;
  fillToBracketPct?: number;
}

export interface WithdrawalStrategy {
  id: string;
  name: string;
  /**
   * Filer-1 age. undefined = auto (gate #15): earliest filer separation age in the
   * paired growth scenario; if the scenario has no salary rows, coastTargetAge.
   */
  drawdownStartAge?: number;
  /** Today's $/yr. */
  spending: ScheduleRow[];
  oneTimeExpenses: OneTimeRow[];
  income: IncomeRow[];
  order: WithdrawalSource[];
  /** P2 (M8). */
  ladder?: ConversionLadderRow[];
}

// ---------------------------------------------------------------------------
// Engine output contracts (SPEC §6, VARIABLES §4)
// ---------------------------------------------------------------------------

export interface BalanceSnapshot {
  balance: number;
  /** Taxable/cash cost basis; trad IRA nondeductible basis (gate #11); 0 elsewhere. */
  basis: number;
  rothBasis?: number;
  rothConversions?: RothConversion[];
  rothEarnings?: number;
}

export type MarkerEventKind =
  | 'windfall'
  | 'contributionChange'
  | 'drawdownStart'
  | 'accessAge'
  | 'rollover'
  | 'rothCatchUpForced'
  | 'note';

export interface MarkerEvent {
  kind: MarkerEventKind;
  /** Filer-1 age. */
  age: number;
  label: string;
}

/**
 * Per filer (array index), per source: the owner's own age at which it unlocks.
 * 'rothEarnings' is the effective age satisfying both 59½ and the 5-year clock.
 */
export type AccessMap = Array<Partial<Record<AccountId | 'rothEarnings', number>>>;

export interface RunYear {
  /** Filer-1 age (gate #1). */
  age: number;
  year: number;
  accounts: Record<AccountId, BalanceSnapshot>;
  buckets: Record<Bucket, { gross: number; ate: number }>;
  total: number;
  totalAte: number;
  /** ATE terms. */
  accessible: number;
  locked: number;
  taxPaidThisYear: number;
  cumulativeTax: number;
  /** Drawdown years only. */
  need?: number;
  withdrawals?: Partial<Record<AccountId, number>>;
  /** Accessible sources ran out — reported, not covered (SPEC §6). */
  gap: boolean;
  events: MarkerEvent[];
}

/** Compare-grid cell metrics (SPEC §3, gate #E3). */
export interface RunSummary {
  lifetimeAfterTaxSpending: number;
  terminalAte: number;
  /** = horizonAge − resolved drawdown start (gate #E3). */
  yearsRetired: number;
  firstGapAge: number | null;
  bridgeFunded: boolean;
  cumulativeTax: number;
  // earliestNoGapStartAge is NOT here: it is a search over start ages
  // (~60 runs per cell), computed lazily and memoized (gate #E1, metrics.ts).
}

export interface RunResult {
  years: RunYear[];
  /** e.g. "contributions cut at 50", "ages 52–55 have no income and no spending modeled". */
  notes: string[];
  access: AccessMap;
  /** Resolved from the auto rule when the strategy leaves it undefined (gate #15). */
  drawdownStartAge: number;
  summary: RunSummary;
}

export interface BridgeYear {
  age: number;
  need: number;
  funded: number;
  gap: number;
}

/** Bridge visualizer data (SPEC §3 Drawdown tab). */
export interface BridgeReport {
  years: BridgeYear[];
  totalCost: number;
  totalFunding: number;
  funded: boolean;
  /** Inflated annual spend at drawdown start. */
  spendAtStart: number;
  /** Inflated annual spend at the latest access age. */
  spendAtAccess: number;
}
