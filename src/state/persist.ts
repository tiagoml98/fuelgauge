/**
 * URL-hash + JSON persistence (SPEC Tech; M1 #2). One serialized shape —
 * PersistedState — validated through the engine's migratePersistedState on
 * every load path. Schedule-row order is semantic and preserved verbatim.
 */

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { defaultPersistedState } from '../engine/defaults';
import { migratePersistedState } from '../engine/persist';
import type { PersistedState } from '../engine/types';

export function encodeStateToHash(state: PersistedState): string {
  return compressToEncodedURIComponent(JSON.stringify(state));
}

export function decodeStateFromHash(hash: string): PersistedState | null {
  if (!hash) return null;
  try {
    const json = decompressFromEncodedURIComponent(hash.replace(/^#/, ''));
    if (!json) return null;
    return migratePersistedState(JSON.parse(json));
  } catch {
    return null;
  }
}

export function loadInitialState(): PersistedState {
  const fromHash =
    typeof window !== 'undefined' ? decodeStateFromHash(window.location.hash) : null;
  return fromHash ?? defaultPersistedState(new Date().getFullYear());
}

export function writeHash(state: PersistedState): void {
  const hash = `#${encodeStateToHash(state)}`;
  // replaceState: no history spam while typing
  window.history.replaceState(null, '', hash);
}

export function exportJson(state: PersistedState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'fuelgauge.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Throws with a readable message on version/shape mismatch — surface it in the UI. */
export async function importJsonFile(file: File): Promise<PersistedState> {
  const text = await file.text();
  return migratePersistedState(JSON.parse(text));
}
