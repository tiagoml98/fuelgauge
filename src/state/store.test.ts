/**
 * Reducer tests for the M6.1 sprawl actions: bulkDelete, setHidden,
 * keepExperiment, clearExperiments — and the cleanSelections invariant that
 * overlay selections, the baseline, and selected ids never reference a
 * missing or hidden object.
 */

import { describe, expect, it } from 'vitest';
import { defaultGrowthScenario, defaultPersistedState, defaultWithdrawalStrategy } from '../engine/defaults';
import type { PersistedState } from '../engine/types';
import { reducer } from './store';

/** 3 scenarios (g1..g3, g3 an experiment) × 2 strategies (w1, w2 an experiment), all cells g1/g2 × w1 selected. */
function makeState(): PersistedState {
  const s = defaultPersistedState(2026);
  const g = (id: string, experiment = false) => ({
    ...defaultGrowthScenario(1, id),
    name: `scenario ${id}`,
    ...(experiment ? { experiment: true } : {}),
  });
  const w = (id: string, experiment = false) => ({
    ...defaultWithdrawalStrategy(s.assumptions, id),
    name: `strategy ${id}`,
    ...(experiment ? { experiment: true } : {}),
  });
  return {
    ...s,
    growthScenarios: [g('g1'), g('g2'), g('g3', true)],
    strategies: [w('w1'), w('w2', true)],
    display: {
      ...s.display,
      selectedScenarioId: 'g2',
      selectedStrategyId: 'w2',
      compareSelection: [
        { scenarioId: 'g1', strategyId: 'w1' },
        { scenarioId: 'g2', strategyId: 'w1' },
        { scenarioId: 'g3', strategyId: 'w2' },
      ],
      compareBaseline: { scenarioId: 'g2', strategyId: 'w1' },
    },
  };
}

describe('bulkDelete (M6.1 #3a)', () => {
  it('removes the given ids and cleans every selection that referenced them', () => {
    const next = reducer(makeState(), { type: 'bulkDelete', scenarioIds: ['g2', 'g3'], strategyIds: [] });
    expect(next.growthScenarios.map((g) => g.id)).toEqual(['g1']);
    expect(next.display.compareSelection).toEqual([{ scenarioId: 'g1', strategyId: 'w1' }]);
    // baseline referenced g2 → falls back to the first surviving selection
    expect(next.display.compareBaseline).toEqual({ scenarioId: 'g1', strategyId: 'w1' });
    expect(next.display.selectedScenarioId).toBe('g1');
  });

  it('never deletes the last scenario or strategy', () => {
    const state = makeState();
    expect(reducer(state, { type: 'bulkDelete', scenarioIds: ['g1', 'g2', 'g3'], strategyIds: [] })).toBe(state);
    expect(reducer(state, { type: 'bulkDelete', scenarioIds: [], strategyIds: ['w1', 'w2'] })).toBe(state);
  });
});

describe('setHidden (M6.1 #3b)', () => {
  it('hiding a scenario deselects its overlay cells and re-anchors the baseline', () => {
    const next = reducer(makeState(), { type: 'setHidden', scenarios: ['g2'] });
    expect(next.display.hiddenScenarios).toEqual(['g2']);
    expect(next.display.compareSelection).toEqual([
      { scenarioId: 'g1', strategyId: 'w1' },
      { scenarioId: 'g3', strategyId: 'w2' },
    ]);
    expect(next.display.compareBaseline).toEqual({ scenarioId: 'g1', strategyId: 'w1' });
    // the hidden scenario stays in the model — only display state changes
    expect(next.growthScenarios).toHaveLength(3);
  });

  it('hiding a strategy deselects every cell in its column', () => {
    const next = reducer(makeState(), { type: 'setHidden', strategies: ['w1'] });
    expect(next.display.compareSelection).toEqual([{ scenarioId: 'g3', strategyId: 'w2' }]);
  });
});

describe('keepExperiment / clearExperiments (M6.1 #3c)', () => {
  it('keep promotes the object: experiment flag cleared, everything else intact', () => {
    const next = reducer(makeState(), { type: 'keepExperiment', kind: 'scenario', id: 'g3' });
    expect(next.growthScenarios.find((g) => g.id === 'g3')?.experiment).toBeUndefined();
    expect(next.growthScenarios).toHaveLength(3);
  });

  it('clear removes every experiment and cleans selections', () => {
    const next = reducer(makeState(), { type: 'clearExperiments' });
    expect(next.growthScenarios.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(next.strategies.map((w) => w.id)).toEqual(['w1']);
    expect(next.display.compareSelection).toEqual([
      { scenarioId: 'g1', strategyId: 'w1' },
      { scenarioId: 'g2', strategyId: 'w1' },
    ]);
    expect(next.display.selectedStrategyId).toBe('w1'); // w2 was an experiment
  });

  it('a kept experiment survives a later clear', () => {
    let state = reducer(makeState(), { type: 'keepExperiment', kind: 'strategy', id: 'w2' });
    state = reducer(state, { type: 'clearExperiments' });
    expect(state.strategies.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(state.growthScenarios.map((g) => g.id)).toEqual(['g1', 'g2']);
  });
});

describe('addCompareRuns spawns experiments (M6.1 #3c)', () => {
  it('tags spawned objects experiment: true and selects them against the reference', () => {
    const state = makeState();
    const spawned = { ...defaultGrowthScenario(1), name: 'spawned' };
    const next = reducer(state, { type: 'addCompareRuns', scenarios: [spawned], strategies: [] });
    const added = next.growthScenarios.find((g) => g.name === 'spawned');
    expect(added?.experiment).toBe(true);
    // selected against the currently-selected strategy (w2)
    expect(next.display.compareSelection).toEqual([{ scenarioId: added!.id, strategyId: 'w2' }]);
    expect(next.display.activeTab).toBe('compare');
  });
});
