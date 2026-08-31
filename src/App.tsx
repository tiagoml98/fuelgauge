/** App shell: tabs, theme, export/import, always-visible disclaimer (SPEC §13). */

import { useRef, useState } from 'react';
import { exportJson, importJsonFile } from './state/persist';
import { StoreProvider, useStore } from './state/store';
import { buttonCls } from './ui/components/fields';
import { GrowthTab } from './ui/tabs/GrowthTab';

function Shell() {
  const { state, dispatch } = useStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const dark = state.display.theme === 'dark';

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-[#f9f9f7] text-neutral-900 dark:bg-[#0d0d0d] dark:text-neutral-100">
        <header className="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
          <h1 className="text-lg font-bold tracking-tight">FuelGauge</h1>
          <nav className="flex gap-1">
            <button type="button" className="rounded bg-neutral-900 px-3 py-1 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
              Growth
            </button>
            <button type="button" disabled className="cursor-not-allowed rounded px-3 py-1 text-sm text-neutral-400" title="M5">
              Drawdown
            </button>
            <button type="button" disabled className="cursor-not-allowed rounded px-3 py-1 text-sm text-neutral-400" title="M6">
              Compare
            </button>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              className={buttonCls}
              onClick={() => dispatch({ type: 'patchDisplay', patch: { theme: dark ? 'light' : 'dark' } })}
            >
              {dark ? 'light mode' : 'dark mode'}
            </button>
            <button type="button" className={buttonCls} onClick={() => exportJson(state)}>
              export JSON
            </button>
            <button type="button" className={buttonCls} onClick={() => fileInput.current?.click()}>
              import JSON
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  dispatch({ type: 'replaceState', state: await importJsonFile(file) });
                  setImportError(null);
                } catch (err) {
                  setImportError(err instanceof Error ? err.message : String(err));
                }
              }}
            />
          </div>
        </header>

        <p className="border-b border-amber-200 bg-amber-50 px-4 py-1 text-center text-[11px] font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Educational model built on simplifying assumptions — not tax or financial advice. Confirm
          real decisions with a CPA.
        </p>

        {importError && (
          <p className="border-b border-red-200 bg-red-50 px-4 py-1 text-center text-xs text-red-800 dark:bg-red-950 dark:text-red-200">
            Import failed: {importError}{' '}
            <button type="button" className="underline" onClick={() => setImportError(null)}>
              dismiss
            </button>
          </p>
        )}

        <div className="p-3">
          <GrowthTab />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
