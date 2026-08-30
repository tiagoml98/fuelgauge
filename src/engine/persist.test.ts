import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, defaultPersistedState } from './defaults';
import { migratePersistedState } from './persist';

describe('migratePersistedState', () => {
  it('passes a current-version state through unchanged', () => {
    const state = defaultPersistedState(2026);
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migratePersistedState(state)).toEqual(state);
  });

  it('round-trips through JSON (the storage path)', () => {
    const state = defaultPersistedState(2026);
    const revived = migratePersistedState(JSON.parse(JSON.stringify(state)));
    expect(revived).toEqual(state);
  });

  it('preserves schedule-row order — order is semantic (later rows win)', () => {
    const state = defaultPersistedState(2026);
    state.growthScenarios[0].perFiler[0].contrib401k = [
      { fromAge: 30, toAge: 50, value: 10000 },
      { fromAge: 40, toAge: 45, value: 5000 },
    ];
    const revived = migratePersistedState(JSON.parse(JSON.stringify(state)));
    expect(revived.growthScenarios[0].perFiler[0].contrib401k).toEqual([
      { fromAge: 30, toAge: 50, value: 10000 },
      { fromAge: 40, toAge: 45, value: 5000 },
    ]);
  });

  it('rejects non-objects and objects without a schemaVersion', () => {
    expect(() => migratePersistedState(null)).toThrow();
    expect(() => migratePersistedState('{}')).toThrow();
    expect(() => migratePersistedState({})).toThrow(/schemaVersion/);
  });

  it('rejects states from a newer schema than this app understands', () => {
    const state = { ...defaultPersistedState(2026), schemaVersion: SCHEMA_VERSION + 1 };
    expect(() => migratePersistedState(state)).toThrow(/newer/);
  });
});
