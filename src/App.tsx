/**
 * App shell, Ledger direction (M4.5 D.1): calm light-first chrome, tabs,
 * scenario menu, export/import, theme toggle, always-visible disclaimer.
 */

import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useEffect, useRef, useState } from 'react';
import { exportJson, importJsonFile } from './state/persist';
import { StoreProvider, useSelectedScenario, useStore } from './state/store';
import { TabErrorBoundary } from './ui/components/TabErrorBoundary';
import { CompareTab } from './ui/v2/CompareTab';
import { DrawdownTab } from './ui/v2/DrawdownTab';
import { GrowthTabV2 } from './ui/v2/GrowthTabV2';
import { ScenarioMenu } from './ui/v2/ScenarioMenu';

function Shell() {
  const { state, dispatch } = useStore();
  const scenario = useSelectedScenario();
  const fileInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const dark = state.display.theme === 'dark';

  // M6.2 #4: overlay scrollbars show while scrolling, hide ~1s after the last
  // scroll. Scroll events don't bubble — capture phase catches every column.
  useEffect(() => {
    const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
    const onScroll = (e: Event) => {
      const el = e.target;
      if (!(el instanceof Element) || !el.classList.contains('col-scroll')) return;
      el.setAttribute('data-scrolling', '');
      clearTimeout(timers.get(el));
      timers.set(el, setTimeout(() => el.removeAttribute('data-scrolling'), 1_000));
    };
    document.addEventListener('scroll', onScroll, true);
    return () => document.removeEventListener('scroll', onScroll, true);
  }, []);

  return (
    <div className={dark ? 'dark' : ''}>
      {/* M4.5 item 2: viewport-height frame — the PAGE never scrolls; each
          column below is its own scroll container. M6.2 #4 variant B: the
          deeper page tint carries card separation (cards are borderless). */}
      <div className="flex h-screen flex-col overflow-hidden bg-[#f1f0eb] font-sans text-neutral-900 dark:bg-[#0c0c0b] dark:text-neutral-100">
        <header className="mx-auto flex w-full max-w-[1560px] shrink-0 flex-wrap items-center gap-x-5 gap-y-2 px-5 pb-1 pt-3">
          <span className="text-[17px] font-bold tracking-tight">FuelGauge</span>
          <nav className="flex gap-4 text-sm" aria-label="Tabs">
            {(['growth', 'drawdown', 'compare'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => dispatch({ type: 'patchDisplay', patch: { activeTab: tab } })}
                className={
                  (state.display.activeTab ?? 'growth') === tab
                    ? 'border-b-2 border-neutral-900 pb-0.5 font-medium dark:border-neutral-100'
                    : 'pb-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
                }
              >
                {tab === 'growth' ? 'Growth' : tab === 'drawdown' ? 'Drawdown' : 'Compare'}
              </button>
            ))}
          </nav>
          <ScenarioMenu scenario={scenario} />
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 bg-white text-xs dark:bg-neutral-900"
              onClick={() => dispatch({ type: 'patchDisplay', patch: { theme: dark ? 'light' : 'dark' } })}
            >
              {dark ? 'light mode' : 'dark mode'}
            </Button>
            <Button variant="outline" size="sm" className="h-8 bg-white text-xs dark:bg-neutral-900" onClick={() => exportJson(state)}>
              export JSON
            </Button>
            <Button variant="outline" size="sm" className="h-8 bg-white text-xs dark:bg-neutral-900" onClick={() => fileInput.current?.click()}>
              import JSON
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json"
              className="hidden"
              data-testid="import-input"
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

        <p className="mx-auto w-full max-w-[1560px] shrink-0 px-5 pb-2 text-[11px] font-medium text-amber-700 dark:text-amber-400">
          Educational model on simplifying assumptions — not tax or financial advice. Confirm real
          decisions with a CPA.
        </p>

        {importError && (
          <p role="alert" className="mx-auto max-w-[1560px] px-5 pb-2 text-xs text-red-700 dark:text-red-300">
            Import failed: {importError}{' '}
            <button type="button" className="underline" onClick={() => setImportError(null)}>
              dismiss
            </button>
          </p>
        )}

        <div className="mx-auto min-h-0 w-full max-w-[1560px] flex-1 px-5 pb-4">
          <TabErrorBoundary>
            {(state.display.activeTab ?? 'growth') === 'drawdown' ? (
              <DrawdownTab />
            ) : (state.display.activeTab ?? 'growth') === 'compare' ? (
              <CompareTab />
            ) : (
              <GrowthTabV2 />
            )}
          </TabErrorBoundary>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <TooltipProvider>
        <Shell />
      </TooltipProvider>
    </StoreProvider>
  );
}
