/** Shared static data for the D.1 direction mockups: spotcheck.json through the real engine. */

import spotcheckRaw from '../../examples/spotcheck.json';
import { simulateAccumulation } from '../engine/accumulate';
import { coastFireAge, fireNumber, firstAgeAtValue, fullFireAge } from '../engine/metrics';
import { migratePersistedState } from '../engine/persist';
import { toReal } from '../engine/schedule';
import type { Assumptions, GrowthScenario, RunYear } from '../engine/types';

const state = migratePersistedState(spotcheckRaw);

/** FIRE targets set so the metric displays are populated in the mockups. */
export const a: Assumptions = {
  ...state.assumptions,
  fireSpendingTarget: 40_000,
  coastTargetAge: 60,
  baristaIncomeTarget: 20_000,
};
export const g: GrowthScenario = state.growthScenarios[0];
export const years: RunYear[] = simulateAccumulation(a, g);

const startAge = years[0].age;
const last = years[years.length - 1];

export const mock = {
  horizonAge: last.age,
  totalAteRealAtHorizon: toReal(last.totalAte, last.age - startAge, a.inflation),
  fireNumber: fireNumber(a.fireSpendingTarget, a.safeWithdrawalRate),
  coastAge: coastFireAge(a, g),
  fullFireAge: fullFireAge(years, a, a.fireSpendingTarget),
  millionAge: firstAgeAtValue(years, 1_000_000, a.inflation),
};

export const money0 = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const moneyM = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M` : money0(v);
