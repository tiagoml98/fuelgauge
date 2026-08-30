/**
 * npm run table -- <input.json> [--scenario <id>]
 *
 * Prints the year-by-year per-account table for a PersistedState JSON (the
 * same shape the app exports), for hand-checking against a spreadsheet before
 * any UI exists (SPEC §14 M2). Three sections: nominal, real (today's $ via
 * the engine's toReal), and ATE in real dollars. Growth-only in M2; extends
 * through drawdown in M3.
 */

import { readFileSync } from 'node:fs';
import { simulateAccumulation } from '../src/engine/accumulate';
import { ateByAccount } from '../src/engine/ate';
import { ALL_ACCOUNTS } from '../src/engine/defaults';
import { migratePersistedState } from '../src/engine/persist';
import { toReal } from '../src/engine/schedule';
import type { RunYear } from '../src/engine/types';

function fail(message: string): never {
  console.error(`table: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const scenarioFlag = args.indexOf('--scenario');
const scenarioId = scenarioFlag >= 0 ? args[scenarioFlag + 1] : undefined;
const file = args.find((x, i) => !x.startsWith('--') && (scenarioFlag < 0 || i !== scenarioFlag + 1));
if (!file) fail('usage: npm run table -- <input.json> [--scenario <id>]');

const state = (() => {
  try {
    return migratePersistedState(JSON.parse(readFileSync(file, 'utf8')));
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
})();

const scenario = scenarioId
  ? state.growthScenarios.find((g) => g.id === scenarioId)
  : state.growthScenarios[0];
if (!scenario) {
  fail(`scenario "${scenarioId}" not found (have: ${state.growthScenarios.map((g) => g.id).join(', ')})`);
}

const a = state.assumptions;
const years = simulateAccumulation(a, scenario);
const startAge = a.filers[0].currentAge;
const yearsFromNow = (y: RunYear) => y.age - startAge;

const COLS = [...ALL_ACCOUNTS, 'total', 'totalAte', 'tax', 'cumTax'] as const;
type Col = (typeof COLS)[number];
const WIDTH = 14;

function nominalValue(y: RunYear, col: Col): number {
  switch (col) {
    case 'total':
      return y.total;
    case 'totalAte':
      return y.totalAte;
    case 'tax':
      return y.taxPaidThisYear;
    case 'cumTax':
      return y.cumulativeTax;
    default:
      return y.accounts[col].balance;
  }
}

function ateNominalValue(y: RunYear, col: Col): number {
  if (col === 'total' || col === 'totalAte') return y.totalAte;
  if (col === 'tax') return y.taxPaidThisYear;
  if (col === 'cumTax') return y.cumulativeTax;
  return ateByAccount(y.accounts, a)[col];
}

function printSection(title: string, value: (y: RunYear, col: Col) => number) {
  console.log(`\n=== ${title} ===`);
  console.log(
    ['age', 'year'].map((h) => h.padStart(5)).join('') + COLS.map((c) => c.padStart(WIDTH)).join(''),
  );
  for (const y of years) {
    console.log(
      String(y.age).padStart(5) +
        String(y.year).padStart(5) +
        COLS.map((c) => value(y, c).toFixed(2).padStart(WIDTH)).join(''),
    );
  }
}

printSection('NOMINAL ($)', nominalValue);
printSection("REAL (today's $)", (y, col) => toReal(nominalValue(y, col), yearsFromNow(y), a.inflation));
printSection("ATE (real, today's $)", (y, col) =>
  toReal(ateNominalValue(y, col), yearsFromNow(y), a.inflation),
);

const markers = years.flatMap((y) => y.events.map((e) => `  age ${e.age} [${e.kind}] ${e.label}`));
if (markers.length > 0) {
  console.log('\n=== MARKERS & NOTES ===');
  for (const m of markers) console.log(m);
}

console.log(
  `\nScenario "${scenario.name}" (${scenario.id}) · ${a.filers.length} filer(s) · ` +
    `age ${startAge}→${a.horizonAge} · inflation ${(a.inflation * 100).toFixed(1)}% · ` +
    `indexing ${a.indexWithInflation ? 'on' : 'off'} · growth only (no withdrawals)`,
);
