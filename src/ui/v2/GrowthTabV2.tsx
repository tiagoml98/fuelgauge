/**
 * Growth tab, Ledger direction: resizable inputs panel (width persisted)
 * with Basics/Advanced tiers, hero card + chart, balance table, assumptions.
 */

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

  return (
    /* fixed height: the two columns scroll independently — the chart stays on screen */
    <ResizablePanelGroup orientation="horizontal" className="h-[calc(100vh-7rem)]">
      <ResizablePanel
        defaultSize={d.panelWidth ?? DEFAULT_PANEL_WIDTH}
        minSize={300}
        maxSize={640}
        onResize={(size) => {
          const px = Math.round(size.inPixels);
          if (px !== d.panelWidth) dispatch({ type: 'patchDisplay', patch: { panelWidth: px } });
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
      <ResizableHandle withHandle />
      <ResizablePanel>
        <main className="h-full space-y-4 overflow-y-auto pl-4">
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
