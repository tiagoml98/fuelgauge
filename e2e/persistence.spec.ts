/**
 * Every PersistedState field round-trips through the URL hash and JSON
 * export/import. The maximal state below sets every field to a non-default
 * value (2 filers, windfall with owner, overrides, conversions, display) —
 * a single deep-equal covers the whole schema.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultPersistedState } from '../src/engine/defaults';
import type { PersistedState } from '../src/engine/types';
import { expect, loadState, readState, test } from './fixtures';

function maximalState(): PersistedState {
  const s = defaultPersistedState(2027);
  s.assumptions = {
    ...s.assumptions,
    filers: [{ currentAge: 41 }, { currentAge: 39 }],
    filingStatus: 'marriedJoint',
    stateTaxRate: 0.05,
    balances: {
      perFiler: [
        {
          trad401k: 111_111,
          tradIra: 22_222,
          tradIraBasis: 3_333,
          roth401k: 44_444,
          roth401kBasis: 20_000,
          rothIra: {
            basis: 55_555,
            conversions: [{ year: 2024, amount: 10_000, taxablePortion: 6_000 }],
            earnings: 6_666,
            firstFundedYear: 2015,
          },
          hsa: 7_777,
        },
        {
          // M6.2 #1: basis fields ABSENT here — "not entered" must round-trip
          trad401k: 88_888,
          tradIra: 0,
          roth401k: 0,
          rothIra: { basis: 0, conversions: [], earnings: 0, firstFundedYear: null },
          hsa: 999,
        },
      ],
      taxable: 123_456,
      taxableBasis: 100_000,
      cash: 45_000,
    },
    include: { ...s.assumptions.include, hsa: false },
    inflation: 0.025,
    indexWithInflation: false,
    returnSchedule: [
      { fromAge: 0, toAge: 50, value: 0.08 },
      { fromAge: 51, toAge: null, value: 0.05 },
    ],
    returnOverrides: {
      cash: [{ fromAge: 0, toAge: null, value: 0.035 }],
      trad401k: [{ fromAge: 0, toAge: null, value: 0.06 }],
    },
    fees: 0.002,
    dividendYield: 0.018,
    dividendTaxRate: 0.18,
    marginalRateNow: 0.32,
    effectiveRetirementRate: 0.1,
    ltcgRate: 0.18,
    limits: { ...s.assumptions.limits, deferral401k: 25_000 },
    // M7: bracket mode + an edited table round-trip
    taxMode: 'bracket',
    bracketTables: {
      single: {
        standardDeduction: 17_000,
        brackets: [
          { upTo: 15_000, rate: 0.1 },
          { upTo: null, rate: 0.3 },
        ],
      },
      marriedJoint: {
        standardDeduction: 32_200,
        brackets: [{ upTo: null, rate: 0.25 }],
      },
    },
    hsaCoverage: 'family',
    horizonAge: 92,
    hsaTreatment: 'nonMedical',
    safeWithdrawalRate: 0.035,
    fireSpendingTarget: 65_000,
    coastTargetAge: 58,
    baristaIncomeTarget: 18_000,
    inPlanConversion: true,
    inServiceWithdrawal: true,
    afterTaxContributions: true,
    accessAgeOverrides: [{ trad401k: 57 }, {}],
  };
  const g = s.growthScenarios[0];
  g.name = 'Maximal scenario with a very long name that must never clip in the menu';
  g.perFiler = [
    {
      salary: [{ fromAge: 42, toAge: 56, value: 150_000 }],
      separationAgeOverride: 54,
      contrib401k: [
        { fromAge: 42, toAge: 50, value: 20_000 },
        { fromAge: 51, toAge: null, value: 10_000 },
      ],
      split401kRothPct: 0.4,
      contribIra: [{ fromAge: 42, toAge: 60, value: 7_000 }],
      splitIraRothPct: 0.9,
      tradIraDeductible: false,
      backdoor: true,
      match: {
        mode: 'flat',
        rate: 0.5,
        capPctOfSalary: 0.06,
        flatAmount: 4_000,
        destination: 'roth401k',
        vestingPct: 0.8,
      },
    },
    {
      salary: [{ fromAge: 40, toAge: null, value: 90_000 }],
      contrib401k: [],
      split401kRothPct: 0,
      contribIra: [],
      splitIraRothPct: 1,
      backdoor: false,
      match: {
        mode: 'percent',
        rate: 1,
        capPctOfSalary: 0.03,
        flatAmount: 0,
        destination: 'trad401k',
        vestingPct: 1,
      },
    },
  ];
  g.hsaContrib = [{ fromAge: 42, toAge: 64, value: 8_000 }];
  g.taxableContrib = [{ fromAge: 42, toAge: null, value: 12_000 }];
  g.cashContrib = [{ fromAge: 42, toAge: 45, value: 5_000 }];
  g.windfalls = [{ age: 47, amount: 250_000, target: 'rothIra', label: 'vested RSUs', filer: 1 }];
  g.returnScheduleOverride = [{ fromAge: 0, toAge: null, value: 0.04 }];
  s.growthScenarios.push({
    ...structuredClone(g),
    id: 'second',
    name: 'Second scenario',
    experiment: true, // M6.1: experiment tag round-trips
  });
  s.strategies[0] = {
    ...s.strategies[0],
    name: 'Retire at 55',
    drawdownStartAge: 55,
    spending: [{ fromAge: 0, toAge: null, value: 60_000 }],
    medical: [{ fromAge: 65, toAge: null, value: 8_000 }], // M6.2 #2 round-trip

    oneTimeExpenses: [{ age: 60, amount: 30_000, label: 'roof' }],
    income: [{ kind: 'socialSecurity', fromAge: 67, toAge: null, amount: 28_000, label: 'SS' }],
    order: ['taxable', 'cash', 'preTax', 'rothBasis', 'seasonedConversions', 'rothEarnings'],
  };
  s.display = {
    real: false,
    ate: false,
    byBuckets: false,
    theme: 'dark',
    yearlyTable: true,
    selectedScenarioId: 'second',
    selectedStrategyId: s.strategies[0].id,
    panelWidth: 520,
    inputsTier: 'advanced',
    // M6.1: compare + visibility state round-trips
    activeTab: 'drawdown',
    compareSelection: [{ scenarioId: 'second', strategyId: s.strategies[0].id }],
    compareBaseline: { scenarioId: 'second', strategyId: s.strategies[0].id },
    hiddenScenarios: [s.growthScenarios[0].id],
    hiddenStrategies: [],
  };
  return s;
}

test('the maximal state round-trips the URL hash and survives reload', async ({ page }) => {
  const state = maximalState();
  await loadState(page, state);
  expect(await readState(page)).toEqual(state);
  await page.reload();
  expect(await readState(page)).toEqual(state);
});

test('export JSON produces the exact state; import replaces it', async ({ page }) => {
  const state = maximalState();
  await loadState(page, state);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'export JSON' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const { readFileSync } = await import('node:fs');
  expect(JSON.parse(readFileSync(path!, 'utf8'))).toEqual(state);

  // import a different state
  const other = defaultPersistedState(2026);
  other.assumptions.balances.perFiler[0].trad401k = 777_777;
  const dir = mkdtempSync(join(tmpdir(), 'fuelgauge-'));
  const file = join(dir, 'other.json');
  writeFileSync(file, JSON.stringify(other));
  await page.locator('[data-testid="import-input"]').setInputFiles(file);
  expect((await readState(page)).assumptions.balances.perFiler[0].trad401k).toBe(777_777);
});

test('a corrupt import shows the error and leaves state untouched', async ({ page }) => {
  const state = maximalState();
  await loadState(page, state);
  const dir = mkdtempSync(join(tmpdir(), 'fuelgauge-'));
  const file = join(dir, 'bad.json');
  writeFileSync(file, JSON.stringify({ nope: true }));
  await page.locator('[data-testid="import-input"]').setInputFiles(file);
  await expect(page.getByText('Import failed', { exact: false })).toBeVisible();
  expect(await readState(page)).toEqual(state);
});
