/**
 * The single home of every default value (CLAUDE.md: no magic numbers anywhere
 * else). Values from docs/VARIABLES.md; gate references (#N) to VARIABLES §7,
 * M1 amendment references (M1 #N) to §7.1.
 *
 * Factories take `currentYear` as a parameter — the engine never reads clocks
 * (docs/ARCHITECTURE.md §4); the UI passes the real year and the user can edit it.
 */

import type {
  AccountId,
  Assumptions,
  Bucket,
  DisplayState,
  EmployerMatch,
  Filer,
  FilerBalances,
  FilerGrowthInputs,
  GrowthScenario,
  LimitSet,
  PersistedState,
  ScheduleRow,
  WithdrawalSource,
  WithdrawalStrategy,
} from './types';

/** Bump when PersistedState's shape changes; add a migration in persist.ts. */
export const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Rates and economy
// ---------------------------------------------------------------------------

export const DEFAULT_INFLATION = 0.03;
export const DEFAULT_INDEX_WITH_INFLATION = true;
/** Gate #15. Applies to invested accounts only — never cash (gate #8). */
export const DEFAULT_FEES = 0.001;
/** SPEC §2: cash has its own return, expressed as a return-schedule override. */
export const DEFAULT_CASH_RETURN = 0.04;
export const DEFAULT_DIVIDEND_YIELD = 0.02;
export const DEFAULT_DIVIDEND_TAX_RATE = 0.15;

/**
 * M4.5 C.2: one flat row — the SPEC §1 7%-then-5%-at-50 default produced an
 * unexplained kink on first use. Age-based steps come from the "lower return
 * to X% from age Y" quick action (and the Stress preset, M6) instead.
 */
export const DEFAULT_RETURN_SCHEDULE: ScheduleRow[] = [{ fromAge: 0, toAge: null, value: 0.07 }];

// ---------------------------------------------------------------------------
// Taxes (simple mode)
// ---------------------------------------------------------------------------

export const DEFAULT_MARGINAL_RATE_NOW = 0.24;
export const DEFAULT_EFFECTIVE_RETIREMENT_RATE = 0.12;
export const DEFAULT_LTCG_RATE = 0.15;
export const DEFAULT_STATE_TAX_RATE = 0;

// ---------------------------------------------------------------------------
// Contribution limits — 2026 IRS values, verified 2026-08-30 (VARIABLES §1.5)
// ---------------------------------------------------------------------------

export const LIMITS_BASE_YEAR = 2026;

export const LIMITS_2026: LimitSet = {
  deferral401k: 24_500,
  catchUp401k50: 8_000,
  catchUp401k60to63: 11_250,
  rothCatchUpWageThreshold: 150_000,
  ira: 7_500,
  iraCatchUp50: 1_100,
  hsaSelfOnly: 4_400,
  hsaFamily: 8_750,
  hsaCatchUp55: 1_000,
  overall415c: 72_000,
};

// Age bands (IRS rules, consumed by limits.ts in M2)
export const CATCH_UP_AGE = 50;
export const SUPER_CATCH_UP_FROM = 60;
export const SUPER_CATCH_UP_TO = 63;
export const HSA_CATCH_UP_AGE = 55;
export const HSA_CONTRIBUTION_STOP_AGE = 65;
/** M6.2 #2: nonqualified HSA withdrawals before 65 pay this on top of ordinary income. */
export const HSA_NONQUALIFIED_PENALTY = 0.2;
export const HSA_PENALTY_ENDS_AGE = 65;

// ---------------------------------------------------------------------------
// Access rules (SPEC §2, consumed by access.ts in M3)
// ---------------------------------------------------------------------------

/** Rounded per the gate rule: accessible the first year start-of-year age ≥ this. */
export const PRETAX_ACCESS_AGE = 59.5;
export const RULE_OF_55_MIN_SEPARATION = 55;
export const ROTH_SEASONING_YEARS = 5;
export const RMD_AGE_BORN_1951_TO_1959 = 73;
export const RMD_AGE_BORN_1960_PLUS = 75;

// ---------------------------------------------------------------------------
// Horizon, policy, FIRE targets
// ---------------------------------------------------------------------------

export const DEFAULT_HORIZON_AGE = 90;
export const DEFAULT_HSA_TREATMENT = 'medical' as const;
/** Tooltip: calibrated to ~30 years (SPEC §1). */
export const DEFAULT_SAFE_WITHDRAWAL_RATE = 0.04;
/** Gate #13: $0 ⇒ FIRE metrics show "—". */
export const DEFAULT_FIRE_SPENDING_TARGET = 0;
export const DEFAULT_COAST_TARGET_AGE = 65;
/** M3 gate #6: $0 ⇒ Growth-tab Barista FIRE shows "—". */
export const DEFAULT_BARISTA_INCOME_TARGET = 0;
export const DEFAULT_MATCH_VESTING_PCT = 1;
export const DEFAULT_CURRENT_AGE = 30;
/** M4.5 D.1 decision: light is the default and the priority; dark is derived. */
export const DEFAULT_THEME = 'light' as const;
export const DEFAULT_PANEL_WIDTH = 400;

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

/** SPEC §2: seven accounts, four buckets. Cash sits in the taxable bucket. */
export const ACCOUNT_BUCKET: Record<AccountId, Bucket> = {
  trad401k: 'preTax',
  tradIra: 'preTax',
  roth401k: 'roth',
  rothIra: 'roth',
  hsa: 'hsa',
  taxable: 'taxable',
  cash: 'taxable',
};

export const ALL_ACCOUNTS = Object.keys(ACCOUNT_BUCKET) as AccountId[];

/**
 * Gate #5 (corrects SPEC §1): pre-tax ahead of Roth basis. The access filter
 * makes it self-adjusting — before access age pre-tax is skipped and Roth
 * basis fills the bridge; after, pre-tax goes first. HSA joins only under
 * non-medical treatment.
 */
export const DEFAULT_WITHDRAWAL_ORDER: WithdrawalSource[] = [
  'cash',
  'taxable',
  'preTax',
  'rothBasis',
  'seasonedConversions',
  'rothEarnings',
];

/** Share of contributions going to the Roth side (VARIABLES §2). */
export const DEFAULT_401K_ROTH_SPLIT = 0;
export const DEFAULT_IRA_ROTH_SPLIT = 1;

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export function defaultFiler(): Filer {
  // birthYear is derived (currentYear − currentAge), never stored (M1 #4)
  return { currentAge: DEFAULT_CURRENT_AGE };
}

export function defaultFilerBalances(): FilerBalances {
  // M6.2 #1: basis fields start ABSENT (not entered) — the stated assumption
  // applies until the user types a number; nothing ever auto-fills them
  return {
    trad401k: 0,
    tradIra: 0,
    roth401k: 0,
    rothIra: { basis: 0, conversions: [], earnings: 0, firstFundedYear: null },
    hsa: 0,
  };
}

export function defaultAssumptions(currentYear: number): Assumptions {
  return {
    filers: [defaultFiler()],
    filingStatus: 'single',
    stateTaxRate: DEFAULT_STATE_TAX_RATE,
    currentYear,
    balances: {
      perFiler: [defaultFilerBalances()],
      taxable: 0,
      cash: 0,
    },
    include: {
      trad401k: true,
      tradIra: true,
      roth401k: true,
      rothIra: true,
      hsa: true,
      taxable: true,
      cash: true,
    },
    inflation: DEFAULT_INFLATION,
    indexWithInflation: DEFAULT_INDEX_WITH_INFLATION,
    returnSchedule: structuredClone(DEFAULT_RETURN_SCHEDULE),
    returnOverrides: {
      cash: [{ fromAge: 0, toAge: null, value: DEFAULT_CASH_RETURN }],
    },
    fees: DEFAULT_FEES,
    dividendYield: DEFAULT_DIVIDEND_YIELD,
    dividendTaxRate: DEFAULT_DIVIDEND_TAX_RATE,
    taxMode: 'simple',
    marginalRateNow: DEFAULT_MARGINAL_RATE_NOW,
    effectiveRetirementRate: DEFAULT_EFFECTIVE_RETIREMENT_RATE,
    ltcgRate: DEFAULT_LTCG_RATE,
    limits: { ...LIMITS_2026 },
    hsaCoverage: 'selfOnly',
    horizonAge: DEFAULT_HORIZON_AGE,
    hsaTreatment: DEFAULT_HSA_TREATMENT,
    safeWithdrawalRate: DEFAULT_SAFE_WITHDRAWAL_RATE,
    fireSpendingTarget: DEFAULT_FIRE_SPENDING_TARGET,
    coastTargetAge: DEFAULT_COAST_TARGET_AGE,
    baristaIncomeTarget: DEFAULT_BARISTA_INCOME_TARGET,
    inPlanConversion: false,
    inServiceWithdrawal: false,
    afterTaxContributions: false,
  };
}

export function defaultEmployerMatch(): EmployerMatch {
  return {
    mode: 'percent',
    rate: 0,
    capPctOfSalary: 0,
    flatAmount: 0,
    destination: 'trad401k',
    vestingPct: DEFAULT_MATCH_VESTING_PCT,
  };
}

export function defaultFilerGrowthInputs(): FilerGrowthInputs {
  return {
    salary: [],
    contrib401k: [],
    split401kRothPct: DEFAULT_401K_ROTH_SPLIT,
    contribIra: [],
    splitIraRothPct: DEFAULT_IRA_ROTH_SPLIT,
    // tradIraDeductible left undefined = auto (gate #11)
    backdoor: false,
    match: defaultEmployerMatch(),
  };
}

export function defaultGrowthScenario(filerCount: number, id = 'base'): GrowthScenario {
  return {
    id,
    name: 'Base',
    perFiler: Array.from({ length: filerCount }, defaultFilerGrowthInputs),
    hsaContrib: [],
    taxableContrib: [],
    cashContrib: [],
    windfalls: [],
  };
}

export function defaultWithdrawalStrategy(a: Assumptions, id = 'base'): WithdrawalStrategy {
  return {
    id,
    name: 'Base',
    // drawdownStartAge left undefined = auto (gate #15)
    spending:
      a.fireSpendingTarget > 0
        ? [{ fromAge: 0, toAge: null, value: a.fireSpendingTarget }]
        : [],
    oneTimeExpenses: [],
    income: [],
    order: [...DEFAULT_WITHDRAWAL_ORDER],
  };
}

export function defaultDisplayState(): DisplayState {
  return {
    real: true,
    ate: true,
    byBuckets: true,
    theme: DEFAULT_THEME,
    yearlyTable: false,
    panelWidth: DEFAULT_PANEL_WIDTH,
    inputsTier: 'basics',
  };
}

export function defaultPersistedState(currentYear: number): PersistedState {
  const assumptions = defaultAssumptions(currentYear);
  return {
    schemaVersion: SCHEMA_VERSION,
    assumptions,
    growthScenarios: [defaultGrowthScenario(assumptions.filers.length)],
    strategies: [defaultWithdrawalStrategy(assumptions)],
    display: defaultDisplayState(),
  };
}
