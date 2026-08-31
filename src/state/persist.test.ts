import { describe, expect, it } from 'vitest';
import { defaultPersistedState } from '../engine/defaults';
import { decodeStateFromHash, encodeStateToHash } from './persist';
import { reducer } from './store';

describe('URL-hash persistence', () => {
  it('round-trips the full state through the compressed hash', () => {
    const state = defaultPersistedState(2026);
    state.growthScenarios[0].perFiler[0].contrib401k = [
      { fromAge: 31, toAge: 50, value: 10_000 },
      { fromAge: 40, toAge: 45, value: 5_000 }, // order is semantic — must survive
    ];
    const decoded = decodeStateFromHash(`#${encodeStateToHash(state)}`);
    expect(decoded).toEqual(state);
  });

  it('returns null on garbage instead of throwing', () => {
    expect(decodeStateFromHash('#not-a-real-hash')).toBeNull();
    expect(decodeStateFromHash('')).toBeNull();
  });
});

describe('store reducer', () => {
  it('duplicate assigns a fresh unique id and selects the copy', () => {
    const state = defaultPersistedState(2026);
    const next = reducer(state, { type: 'duplicateScenario', id: state.growthScenarios[0].id });
    expect(next.growthScenarios).toHaveLength(2);
    const [orig, copy] = next.growthScenarios;
    expect(copy.id).not.toBe(orig.id);
    expect(copy.name).toBe(`${orig.name} (copy)`);
    expect(next.display.selectedScenarioId).toBe(copy.id);
    expect(copy.perFiler[0]).not.toBe(orig.perFiler[0]); // deep clone
  });

  it('setFilerCount keeps filers, balances, and every scenario aligned', () => {
    const state = defaultPersistedState(2026);
    const two = reducer(state, { type: 'setFilerCount', count: 2 });
    expect(two.assumptions.filers).toHaveLength(2);
    expect(two.assumptions.balances.perFiler).toHaveLength(2);
    expect(two.growthScenarios.every((g) => g.perFiler.length === 2)).toBe(true);
    expect(two.assumptions.filingStatus).toBe('marriedJoint');
    const one = reducer(two, { type: 'setFilerCount', count: 1 });
    expect(one.assumptions.balances.perFiler).toHaveLength(1);
    expect(one.growthScenarios.every((g) => g.perFiler.length === 1)).toBe(true);
  });

  it('never deletes the last scenario', () => {
    const state = defaultPersistedState(2026);
    expect(reducer(state, { type: 'deleteScenario', id: state.growthScenarios[0].id })).toBe(state);
  });

  it('strategy actions mirror scenario actions (M5)', () => {
    const state = defaultPersistedState(2026);
    const dup = reducer(state, { type: 'duplicateStrategy', id: state.strategies[0].id });
    expect(dup.strategies).toHaveLength(2);
    expect(dup.strategies[1].id).not.toBe(dup.strategies[0].id);
    expect(dup.display.selectedStrategyId).toBe(dup.strategies[1].id);

    const renamed = reducer(dup, { type: 'renameStrategy', id: dup.strategies[1].id, name: 'Retire at 50' });
    expect(renamed.strategies[1].name).toBe('Retire at 50');

    const patched = reducer(renamed, {
      type: 'patchStrategy',
      id: renamed.strategies[1].id,
      patch: { drawdownStartAge: 50 },
    });
    expect(patched.strategies[1].drawdownStartAge).toBe(50);
    expect(patched.strategies[0].drawdownStartAge).toBeUndefined(); // untouched

    const deleted = reducer(patched, { type: 'deleteStrategy', id: patched.strategies[1].id });
    expect(deleted.strategies).toHaveLength(1);
    expect(reducer(deleted, { type: 'deleteStrategy', id: deleted.strategies[0].id })).toBe(deleted);
  });
});
