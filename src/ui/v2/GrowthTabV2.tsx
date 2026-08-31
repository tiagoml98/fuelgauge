/**
 * Growth tab, Ledger direction: resizable inputs panel (width persisted)
 * with Basics/Advanced tiers, hero card + chart, balance table, assumptions.
 */

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRef } from 'react';
import { DEFAULT_PANEL_WIDTH } from '../../engine/defaults';
import { useGrowthMetrics, useGrowthYears } from '../../state/derived';
import { useSelectedScenario, useStore } from '../../state/store';
import { AssumptionsPanel } from '../components/AssumptionsPanel';
import { BalanceTable } from '../components/BalanceTable';
import { AdvancedPanel } from './AdvancedPanel';
import { BasicsPanel } from './BasicsPanel';
import { HeroCard } from './HeroCard';

export function GrowthTabV2() {
  const { state, dispatch } = useStore();
  const a = state.assumptions;
  const scenario = useSelectedScenario();
  const { years, errors } = useGrowthYears(a, scenario);
  const metrics = useGrowthMetrics(a, scenario, years);
  const d = state.display;
  const tier = d.inputsTier ?? 'basics';
  // M4.5 item 1: the panel library moves the divider imperatively (DOM styles);
  // React state NEVER updates during the drag — we track the live width in a
  // ref and commit it to display state once, on pointer release.
  const liveWidth = useRef(d.panelWidth ?? DEFAULT_PANEL_WIDTH);
  const commitWidth = () => {
    const px = Math.round(liveWidth.current);
    if (px !== d.panelWidth) dispatch({ type: 'patchDisplay', patch: { panelWidth: px } });
  };

  return (
    /* h-full inside the viewport-height app frame: the two columns scroll independently */
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel
        defaultSize={d.panelWidth ?? DEFAULT_PANEL_WIDTH}
        minSize={300}
        maxSize={640}
        onResize={(size) => {
          liveWidth.current = size.inPixels;
        }}
      >
        <aside className="h-full overflow-y-auto pr-4" data-testid="inputs-panel">
          <Tabs
            value={tier}
            onValueChange={(v) => dispatch({ type: 'patchDisplay', patch: { inputsTier: v as 'basics' | 'advanced' } })}
          >
            <TabsList className="mb-1 w-full bg-neutral-200/60 dark:bg-neutral-800">
              <TabsTrigger value="basics" className="flex-1 text-xs">
                Basics
              </TabsTrigger>
              <TabsTrigger value="advanced" className="flex-1 text-xs">
                Advanced
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {tier === 'basics' ? <BasicsPanel a={a} g={scenario} /> : <AdvancedPanel a={a} g={scenario} />}
        </aside>
      </ResizablePanel>
      <ResizableHandle
        withHandle
        onPointerUp={commitWidth}
        onLostPointerCapture={commitWidth}
        /* wider visible bar + generous hit target (after: pseudo) */
        className="w-1 bg-neutral-200 transition-colors after:w-4 hover:bg-neutral-400 data-[resize-handle-state=drag]:bg-neutral-500 dark:bg-neutral-800 dark:hover:bg-neutral-600"
      />
      <ResizablePanel>
        <main className="h-full space-y-4 overflow-y-auto pl-4" data-testid="chart-column">
          {errors.length > 0 && (
            <p
              role="status"
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
            >
              Fix inputs — showing the last valid result. {errors.join(' · ')}
            </p>
          )}
          <HeroCard a={a} g={scenario} years={years} metrics={metrics} display={d} />
          <BalanceTable
            years={years}
            a={a}
            display={d}
            onToggleYearly={() => dispatch({ type: 'patchDisplay', patch: { yearlyTable: !d.yearlyTable } })}
          />
          <AssumptionsPanel />
        </main>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
