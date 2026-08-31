import { describe, expect, it } from 'vitest';
import { analyzeBridge } from '../../engine/metrics';
import { migratePersistedState } from '../../engine/persist';
import { simulateRun } from '../../engine/run';
import { lensBridge, runTiles } from './lens';
import drawdownRaw from '../../../examples/drawdown.json';

const state = migratePersistedState(drawdownRaw);
const a = state.assumptions;
const locked = simulateRun(a, state.growthScenarios[0], state.strategies[0]);
const lockedBridge = analyzeBridge(locked, a, state.strategies[0]);

describe('lensBridge (M5.5 item 1)', () => {
  it("today's-$ mode: real sums — $40,000 of $640,000 for the locked case", () => {
    const real = lensBridge(lockedBridge, locked, a, true);
    // 16 bridge years × 40,000 real need; only age 60 funded at 40,000 real
    expect(Math.round(real.totalCost)).toBe(640_000);
    expect(Math.round(real.totalFunding)).toBe(40_000);
    expect(Math.round(real.spendAtStart)).toBe(40_000);
    expect(Math.round(real.spendAtAccess)).toBe(40_000);
    expect(real.lensLabel).toBe("today's $");
    // every real-mode bar is a flat 40,000 need
    for (const y of real.years) expect(Math.round(y.need)).toBe(40_000);
  });

  it('nominal mode passes the engine sums through', () => {
    const nominal = lensBridge(lockedBridge, locked, a, false);
    expect(Math.round(nominal.totalFunding)).toBe(62_319);
    expect(Math.round(nominal.totalCost)).toBe(806_275);
    expect(nominal.lensLabel).toBe('nominal');
  });
});

describe('runTiles (M5.5 items 1–2)', () => {
  it('real lifetime spending = per-year deflated funded spending, summed', () => {
    const real = runTiles(locked, a, true);
    const nominal = runTiles(locked, a, false);
    // funded years each cover exactly 40,000 real → lifetime real = 40,000 × funded years
    expect(Math.round(real.lifetimeAfterTaxSpending) % 40_000).toBe(0);
    expect(real.lifetimeAfterTaxSpending).toBeLessThan(nominal.lifetimeAfterTaxSpending);
    expect(nominal.lifetimeAfterTaxSpending).toBeCloseTo(locked.summary.lifetimeAfterTaxSpending, 6);
    expect(real.terminalAte).toBeLessThan(nominal.terminalAte);
  });

  it('fundedThrough: null when gaps start immediately; age-1 when money runs out later; horizon when clean', () => {
    expect(runTiles(locked, a, false).fundedThrough).toBeNull(); // locked gaps from 45

    const swrFlat = simulateRun(a, state.growthScenarios[0], state.strategies[1]);
    expect(runTiles(swrFlat, a, false).fundedThrough).toBe('horizon');

    // an underfunded late-gap case: tiny pot, spending resumes gaps mid-retirement
    const strategy = {
      ...state.strategies[1],
      spending: [{ fromAge: 0, toAge: null, value: 90_000 }],
    };
    const depleting = simulateRun(a, state.growthScenarios[0], strategy);
    const first = depleting.summary.firstGapAge;
    expect(first).not.toBeNull();
    expect(first!).toBeGreaterThan(depleting.drawdownStartAge);
    expect(runTiles(depleting, a, false).fundedThrough).toBe(first! - 1);
  });
});
