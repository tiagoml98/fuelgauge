import { describe, expect, it } from 'vitest';
import { simulateAccumulation } from './accumulate';
import { defaultAssumptions, defaultGrowthScenario, defaultWithdrawalStrategy } from './defaults';
import {
  analyzeBridge,
  coastFireAge,
  earliestNoGapStartAge,
  fireNumber,
  firstAgeAtValue,
  fullFireAge,
} from './metrics';
import { simulateRun } from './run';
import type { Assumptions, GrowthScenario, ScheduleRow, WithdrawalStrategy } from './types';

const flat = (value: number, fromAge = 0): ScheduleRow[] => [{ fromAge, toAge: null, value }];

describe('fireNumber', () => {
  it('is spend ÷ SWR', () => {
    expect(fireNumber(40_000, 0.04)).toBe(1_000_000);
    expect(fireNumber(0, 0.04)).toBe(0);
  });
});

describe('coastFireAge — hand-computed case (SPEC §12)', () => {
  // r = 0 everywhere, inflation 0: cash 800k + 50k/yr; target 40k/4% = $1M by 65.
  // Stopping at age c leaves 800k + 50k×(c−31+1−1) = 800k + 50k×(c−31)... contributions
  // land at ages 31..c−1, so balance = 800k + 50k×(c−31). ≥ $1M ⇔ c ≥ 35.
  const a = (() => {
    const x = defaultAssumptions(2026);
    x.indexWithInflation = false;
    x.inflation = 0;
    x.fees = 0;
    x.returnSchedule = flat(0);
    x.returnOverrides = { cash: flat(0) };
    x.horizonAge = 70;
    x.balances.cash = 800_000;
    x.fireSpendingTarget = 40_000;
    x.coastTargetAge = 65;
    return x;
  })();
  const g = (() => {
    const x = defaultGrowthScenario(1);
    x.cashContrib = flat(50_000, 31);
    return x;
  })();

  it('finds the earliest stop age that still coasts to the target', () => {
    expect(coastFireAge(a, g)).toBe(35);
  });

  it('is null when the target is unset or unreachable', () => {
    expect(coastFireAge({ ...a, fireSpendingTarget: 0 }, g)).toBeNull();
    expect(coastFireAge({ ...a, fireSpendingTarget: 500_000 }, g)).toBeNull();
  });

  it('firstAgeAtValue: crosses $1M with contributions running at 34', () => {
    const years = simulateAccumulation(a, g);
    expect(firstAgeAtValue(years, 1_000_000, a.inflation)).toBe(34);
    expect(firstAgeAtValue(years, 10_000_000, a.inflation)).toBeNull();
  });

  it('fullFireAge uses ATE (cash is face here, so same crossing)', () => {
    const years = simulateAccumulation(a, g);
    expect(fullFireAge(years, a, 40_000)).toBe(34);
  });
});

describe('bridge and earliest gap-free start (locked-money setup)', () => {
  const makeSetup = (cash: number) => {
    const a: Assumptions = (() => {
      const x = defaultAssumptions(2026);
      x.indexWithInflation = false;
      x.fees = 0;
      x.returnSchedule = flat(0);
      x.returnOverrides = { cash: flat(0) };
      x.filers = [{ currentAge: 44 }];
      x.horizonAge = 90;
      x.balances.perFiler[0].trad401k = 2_000_000;
      x.balances.cash = cash;
      return x;
    })();
    const g: GrowthScenario = defaultGrowthScenario(1);
    const w: WithdrawalStrategy = defaultWithdrawalStrategy(a);
    w.drawdownStartAge = 45;
    w.spending = flat(40_000);
    return { a, g, w };
  };

  it('unfunded bridge: every year 45–59 is a red bar; funded flips with enough cash', () => {
    const { a, g, w } = makeSetup(0);
    const run = simulateRun(a, g, w);
    const bridge = analyzeBridge(run, a, w);
    expect(bridge.years[0].age).toBe(45);
    expect(bridge.years[bridge.years.length - 1].age).toBe(60);
    expect(bridge.funded).toBe(false);
    expect(bridge.years.filter((y) => y.gap > 0)).toHaveLength(15); // 45..59
    expect(bridge.spendAtStart).toBe(40_000);
    expect(run.summary.bridgeFunded).toBe(false);

    // 15 bridge years × 40k = 600k of cash funds it exactly
    const funded = makeSetup(600_000);
    const fundedRun = simulateRun(funded.a, funded.g, funded.w);
    expect(analyzeBridge(fundedRun, funded.a, funded.w).funded).toBe(true);
    expect(fundedRun.summary.bridgeFunded).toBe(true);
    expect(fundedRun.summary.firstGapAge).toBeNull();
  });

  it('earliestNoGapStartAge finds 60 for the all-locked case', () => {
    const { a, g, w } = makeSetup(0);
    expect(earliestNoGapStartAge(a, g, w)).toBe(60);
  });
});
