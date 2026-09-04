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
  BracketTable,
  DisplayState,
  EmployerMatch,
  Filer,
  FilerBalances,
  FilerGrowthInputs,
  FilingStatus,
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

/**
 * M7: 2026 federal bracket tables (Rev. Proc. 2025-32), same anchor year as
 * LIMITS_2026. Editable per filing status; brackets apply to TAXABLE income
 * (after the standard deduction); upTo null = top bracket. Deliberately NOT
 * placed in defaultAssumptions — resolveBracketTable falls back here, so the
 * tables persist only once edited.
 */
export const DEFAULT_BRACKET_TABLES: Record<FilingStatus, BracketTable> = {
  single: {
    standardDeduction: 16_100,
    /** M10: 65+ additional deduction per qualifying filer (2026 — verify). */
    additionalDeduction65: 2_050,
    brackets: [
      { upTo: 12_400, rate: 0.1 },
      { upTo: 50_400, rate: 0.12 },
      { upTo: 105_700, rate: 0.22 },
      { upTo: 201_775, rate: 0.24 },
      { upTo: 256_225, rate: 0.32 },
      { upTo: 640_600, rate: 0.35 },
      { upTo: null, rate: 0.37 },
    ],
  },
  marriedJoint: {
    standardDeduction: 32_200,
    /** M10: per qualifying spouse aged 65+ (2026 — verify). */
    additionalDeduction65: 1_650,
    brackets: [
      { upTo: 24_800, rate: 0.1 },
      { upTo: 100_800, rate: 0.12 },
      { upTo: 211_400, rate: 0.22 },
      { upTo: 403_550, rate: 0.24 },
      { upTo: 512_450, rate: 0.32 },
      { upTo: 768_700, rate: 0.35 },
      { upTo: null, rate: 0.37 },
    ],
  },
};

/**
 * M10: IRS Uniform Lifetime Table (Pub 590-B, Table III, 2022 revision),
 * ages 72-120. VERIFY-BEFORE-SHIPPING: entered from model knowledge; quoted
 * in full in the M10 gate report for verification against the publication.
 */
export const UNIFORM_LIFETIME_TABLE: Record<number, number> = {
  72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0,
  79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0,
  86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8,
  93: 10.1, 94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8,
  100: 6.4, 101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3,
  107: 4.1, 108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3, 113: 3.1,
  114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3, 120: 2.0,
};

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
/** M8: early-withdrawal penalty on conversion-tax withholding before ceil(59.5). */
export const EARLY_WITHDRAWAL_PENALTY = 0.1;
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
