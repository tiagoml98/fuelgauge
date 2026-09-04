/**
 * M9.1 #7: engine invariants across EVERY example file — no account balance,
 * bucket value, or basis is ever negative in any year of any scenario ×
 * strategy combination. Guards the dust class that produced the below-$0
 * axis and the stack seam (fuelgauge.json, taxable exhausted at 75).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migratePersistedState } from './persist';
import { simulateRun } from './run';
import type { AccountId, RunYear } from './types';

const files = readdirSync('examples').filter((f) => f.endsWith('.json'));

const checkYears = (years: RunYear[], label: string) => {
  for (const y of years) {
    for (const [id, snap] of Object.entries(y.accounts)) {
      expect(snap.balance, `${label} ${id} balance @${y.age}`).toBeGreaterThanOrEqual(0);
      expect(snap.basis, `${label} ${id} basis @${y.age}`).toBeGreaterThanOrEqual(0);
      expect(y.ate[id as AccountId], `${label} ${id} ate @${y.age}`).toBeGreaterThanOrEqual(0);
    }
    for (const [b, v] of Object.entries(y.buckets)) {
      expect(v.gross, `${label} bucket ${b} gross @${y.age}`).toBeGreaterThanOrEqual(0);
      expect(v.ate, `${label} bucket ${b} ate @${y.age}`).toBeGreaterThanOrEqual(0);
    }
  }
};

describe('non-negativity invariant over all example files (M9.1 #7)', () => {
  for (const file of files) {
    it(`${file}: every account, basis, ATE, and bucket ≥ 0 in every year of every run`, () => {
      const st = migratePersistedState(JSON.parse(readFileSync(`examples/${file}`, 'utf8')));
      for (const g of st.growthScenarios) {
        for (const w of st.strategies) {
          checkYears(simulateRun(st.assumptions, g, w).years, `${file} ${g.id}×${w.id}`);
        }
      }
    });
  }

  it('fuelgauge.json (the repro): taxable and cash are EXACTLY 0 after exhaustion, not dust', () => {
    const st = migratePersistedState(JSON.parse(readFileSync('examples/fuelgauge.json', 'utf8')));
    const run = simulateRun(st.assumptions, st.growthScenarios[0], st.strategies[0]);
    const y76 = run.years.find((y) => y.age === 76)!;
    const y49 = run.years.find((y) => y.age === 49)!;
    expect(y76.accounts.taxable.balance).toBe(0);
    expect(y76.buckets.taxable.ate).toBe(0); // was −2.18e-12 before the fix
    expect(y49.accounts.cash.balance).toBe(0);
  });
});
