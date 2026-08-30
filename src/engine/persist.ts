/**
 * Schema-version gate for everything that loads a PersistedState — URL hash,
 * JSON import (M4), and the table script's input files (M2).
 *
 * Migration stub (M1 #2): when SCHEMA_VERSION bumps, add a step that upgrades
 * version N to N+1 and chain through them here, oldest first.
 */

import { SCHEMA_VERSION } from './defaults';
import type { PersistedState } from './types';

export function migratePersistedState(raw: unknown): PersistedState {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('Not a FuelGauge state object');
  }
  const state = raw as PersistedState;
  if (typeof state.schemaVersion !== 'number') {
    throw new Error('Missing schemaVersion — not a FuelGauge state object');
  }
  if (state.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `State schema v${state.schemaVersion} is newer than this app understands (v${SCHEMA_VERSION}) — update the app`,
    );
  }
  // Migrations run here, oldest first, each bumping schemaVersion by 1.
  // None exist yet: v1 is the first schema.
  return state;
}
