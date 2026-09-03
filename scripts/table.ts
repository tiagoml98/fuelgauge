/**
 * npm run table -- <input.json> [--scenario <id>] [--strategy <id>] [--growth-only]
 *
 * Prints the year-by-year per-account table for a PersistedState JSON (the
 * same shape the app exports), for hand-checking against a spreadsheet
 * (SPEC §14 M2/M3). Default runs the full run (growth × withdrawal strategy)
 * with need / withdrawn / gap columns; --growth-only keeps the M2 view.
 * Sections: nominal, real (today's $ via the engine's toReal), ATE (real),
 * per-account withdrawals, and markers.
 */

import { readFileSync } from 'node:fs';
import { simulateAccumulation } from '../src/engine/accumulate';
import { ALL_ACCOUNTS } from '../src/engine/defaults';
import { strategyHasSpending } from '../src/engine/metrics';
import { migratePersistedState } from '../src/engine/persist';
import { simulateRun } from '../src/engine/run';
import { timingExponent, toReal } from '../src/engine/schedule';
import type { RunYear } from '../src/engine/types';

function fail(message: string): never {
  console.error(`table: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const flagValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const scenarioId = flagValue('--scenario');
const strategyId = flagValue('--strategy');
const growthOnly = args.includes('--growth-only');
const consumed = new Set(
  [scenarioId, strategyId].filter((v): v is string => v !== undefined),
);
const file = args.find((x) => !x.startsWith('--') && !consumed.has(x));
if (!file) fail('usage: npm run table -- <input.json> [--scenario <id>] [--strategy <id>] [--growth-only]');

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
const strategy = strategyId
  ? state.strategies.find((s) => s.id === strategyId)
  : state.strategies[0];
if (!growthOnly && !strategy) {
  fail(`strategy "${strategyId}" not found (have: ${state.strategies.map((s) => s.id).join(', ')})`);
}

const a = state.assumptions;
const run = growthOnly || !strategy ? null : simulateRun(a, scenario, strategy);
const years = run ? run.years : simulateAccumulation(a, scenario);
const startAge = a.filers[0].currentAge;
const yearsFromNow = (y: RunYear) => y.age - startAge;

const EXTRA = run ? (['need', 'wdrawn', 'gap'] as const) : ([] as const);
// M7: bracket-mode runs get the year's ordinary income + computed rate
const BRACKET = run && a.taxMode === 'bracket' ? (['ordInc', 'effRate'] as const) : ([] as const);
const COLS = [...ALL_ACCOUNTS, 'total', 'totalAte', 'tax', 'cumTax', ...EXTRA, ...BRACKET] as const;
type Col = (typeof COLS)[number];
const WIDTH = 13;

const wdTotal = (y: RunYear) =>
  Object.values(y.withdrawals ?? {}).reduce((s, v) => s + (v ?? 0), 0);

function nominalValue(y: RunYear, col: Col): number | string {
  switch (col) {
    case 'total':
      return y.total;
    case 'totalAte':
      return y.totalAte;
    case 'tax':
      return y.taxPaidThisYear;
    case 'cumTax':
      return y.cumulativeTax;
    case 'need':
      return y.need ?? 0;
    case 'wdrawn':
      return wdTotal(y);
    case 'gap':
      return y.gap ? 'GAP' : '';
    case 'ordInc':
      return y.ordinaryIncome ?? 0;
    case 'effRate':
      return y.effectiveOrdinaryRate === undefined
        ? ''
        : `${(y.effectiveOrdinaryRate * 100).toFixed(1)}%`;
    default:
      return y.accounts[col].balance;
  }
}

function ateNominalValue(y: RunYear, col: Col): number | string {
  if (col === 'total' || col === 'totalAte') return y.totalAte;
  if (
    col === 'tax' || col === 'cumTax' || col === 'need' || col === 'wdrawn' ||
    col === 'gap' || col === 'ordInc' || col === 'effRate'
  ) {
    return nominalValue(y, col);
  }
  return y.ate[col]; // M7: the engine's valuation, never recomputed
}

function printSection(title: string, value: (y: RunYear, col: Col) => number | string) {
  console.log(`\n=== ${title} ===`);
  console.log(
    ['age', 'year'].map((h) => h.padStart(5)).join('') + COLS.map((c) => c.padStart(WIDTH)).join(''),
  );
  for (const y of years) {
    const cells = COLS.map((c) => {
      const v = value(y, c);
      return (typeof v === 'number' ? v.toFixed(2) : v).padStart(WIDTH);
    });
    console.log(String(y.age).padStart(5) + String(y.year).padStart(5) + cells.join(''));
  }
}

// need/withdrawn are start-of-year flows — deflated with the start-of-year
// exponent (M3 gate correction #1); balances/taxes use end-of-year.
const realize = (fn: (y: RunYear, col: Col) => number | string) => (y: RunYear, col: Col) => {
  const v = fn(y, col);
  if (typeof v !== 'number' || col === 'gap') return v;
  const timing = col === 'need' || col === 'wdrawn' ? ('startOfYear' as const) : undefined;
  return toReal(v, timingExponent(yearsFromNow(y), timing), a.inflation);
};

printSection('NOMINAL ($)', nominalValue);
printSection("REAL (today's $)", realize(nominalValue));
printSection("ATE (real, today's $)", realize(ateNominalValue));

if (run) {
  // M8: one row per conversion year — the gate's hand-check figures
  const ladderYears = years.filter((y) => y.ladder !== undefined);
  if (ladderYears.length > 0) {
    console.log('\n=== LADDER (nominal) ===');
    console.log(
      ['age', 'year'].map((h) => h.padStart(5)).join('') +
        ['poolBefore', 'converted', 'convTax', 'paidCash', 'paidTaxable', 'withheld', 'penalty', 'unlock']
          .map((c) => c.padStart(WIDTH))
          .join(''),
    );
    for (const y of ladderYears) {
      const l = y.ladder!;
      const cells = [
        l.poolBeforeConversion,
        l.converted,
        l.tax,
        l.paidFrom.cash ?? 0,
        l.paidFrom.taxable ?? 0,
        l.paidFrom.conversion ?? 0,
        l.penalty,
      ];
      console.log(
        String(y.age).padStart(5) +
          String(y.year).padStart(5) +
          cells.map((v) => v.toFixed(2).padStart(WIDTH)).join('') +
          String(l.unlockYear).padStart(WIDTH),
      );
    }
  }

  const drawYears = years.filter((y) => y.withdrawals !== undefined);
  if (drawYears.length > 0) {
    console.log('\n=== WITHDRAWALS (nominal, gross, per account) ===');
    console.log(
      ['age', 'year'].map((h) => h.padStart(5)).join('') +
        [...ALL_ACCOUNTS, 'need', 'unmet'].map((c) => c.padStart(WIDTH)).join(''),
    );
    for (const y of drawYears) {
      const cells = [...ALL_ACCOUNTS.map((id) => y.withdrawals?.[id] ?? 0), y.need ?? 0, y.unmet ?? 0];
      console.log(
        String(y.age).padStart(5) +
          String(y.year).padStart(5) +
          cells.map((v) => v.toFixed(2).padStart(WIDTH)).join(''),
      );
    }
  }
}

const markers = years.flatMap((y) => y.events.map((e) => `  age ${e.age} [${e.kind}] ${e.label}`));
if (markers.length > 0) {
  console.log('\n=== MARKERS & NOTES ===');
  for (const m of markers) console.log(m);
}
if (run && run.notes.length > 0) {
  console.log('\n=== RUN NOTES ===');
  for (const n of run.notes) console.log(`  ${n}`);
}
if (run && strategy) {
  const s = run.summary;
  if (!strategyHasSpending(strategy)) {
    console.log(
      `\nSummary: drawdown at ${run.drawdownStartAge} · no spending entered — set a FIRE spending target or add spending rows · ` +
        `terminal ATE ${s.terminalAte.toFixed(2)} · cumulative tax ${s.cumulativeTax.toFixed(2)}`,
    );
  } else {
    console.log(
      `\nSummary: drawdown at ${run.drawdownStartAge} · years retired ${s.yearsRetired} · ` +
        `lifetime after-tax spending ${s.lifetimeAfterTaxSpending.toFixed(2)} · ` +
        `terminal ATE ${s.terminalAte.toFixed(2)} · first gap ${s.firstGapAge ?? '—'} · ` +
        `bridge funded ${s.bridgeFunded ? 'yes' : 'NO'} · cumulative tax ${s.cumulativeTax.toFixed(2)}`,
    );
  }
}

console.log(
  `\nScenario "${scenario.name}" (${scenario.id})` +
    (run && strategy ? ` × strategy "${strategy.name}" (${strategy.id})` : ' · growth only (no withdrawals)') +
    ` · ${a.filers.length} filer(s) · age ${startAge}→${a.horizonAge} · ` +
    `inflation ${(a.inflation * 100).toFixed(1)}% · indexing ${a.indexWithInflation ? 'on' : 'off'}`,
);
