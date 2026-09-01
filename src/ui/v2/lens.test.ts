import { describe, expect, it } from 'vitest';
import { analyzeBridge } from '../../engine/metrics';
import { migratePersistedState } from '../../engine/persist';
import { simulateRun } from '../../engine/run';
import { formatSpans, lensBridge, runTiles } from './lens';
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

  it('spans (M6.1 #2): locked case opens with a locked span; clean case is one funded span', () => {
    const tiles = runTiles(locked, a, false);
    expect(tiles.spans[0]).toEqual({ kind: 'locked', from: 45, to: 59 });
    expect(tiles.spans[1].kind).toBe('funded');
    expect(tiles.spans[1].from).toBe(60);

    const swrFlat = simulateRun(a, state.growthScenarios[0], state.strategies[1]);
    const clean = runTiles(swrFlat, a, false).spans;
    expect(clean).toHaveLength(1);
    expect(clean[0].kind).toBe('funded');

    // 90k spending on the Roth-only order: Roth thins → the trad 401k (still
    // locked) dwarfs the unmet need (locked span), Roth earnings open at 60
    // (funded again), then Roth truly runs dry (depleted — the untouched trad
    // 401k is accessible, just not in this strategy's order)
    const strategy = {
      ...state.strategies[1],
      spending: [{ fromAge: 0, toAge: null, value: 90_000 }],
    };
    const depleting = simulateRun(a, state.growthScenarios[0], strategy);
    const spans = runTiles(depleting, a, false).spans;
    expect(spans.map((s) => s.kind)).toEqual(['funded', 'locked', 'funded', 'depleted']);
    expect(spans[0]).toEqual({ kind: 'funded', from: 45, to: 53 });
    expect(spans[1]).toEqual({ kind: 'locked', from: 54, to: 59 });
    expect(spans[2]).toEqual({ kind: 'funded', from: 60, to: 64 });
    expect(spans[3]).toEqual({ kind: 'depleted', from: 65, to: 90 });
    expect(formatSpans(spans, a.horizonAge)).toBe(
      'funded 45–53 · locked out 54–59 · funded 60–64 · depleted 65+',
    );
  });
});

describe('formatSpans (M6.1 #2)', () => {
  it('collapses a clean run to "funded through <horizon> ✓"', () => {
    expect(formatSpans([{ kind: 'funded', from: 44, to: 90 }], 90)).toBe('funded through 90 ✓');
  });

  it('renders phases with "+" once a span reaches the horizon', () => {
    expect(
      formatSpans(
        [
          { kind: 'funded', from: 44, to: 50 },
          { kind: 'locked', from: 51, to: 59 },
          { kind: 'funded', from: 60, to: 83 },
          { kind: 'depleted', from: 84, to: 90 },
        ],
        90,
      ),
    ).toBe('funded 44–50 · locked out 51–59 · funded 60–83 · depleted 84+');
  });

  it('returns a dash for no drawdown years', () => {
    expect(formatSpans([], 90)).toBe('—');
  });
});
