/**
 * Drawdown tab (SPEC §3, M5): a run = selected growth scenario × selected
 * withdrawal strategy. Strategy editor left; summary tiles, run chart,
 * bridge visualizer, rate-arbitrage + milestones + readout, table right.
 */

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useMemo, useRef } from 'react';
import { DEFAULT_PANEL_WIDTH } from '../../engine/defaults';
import { coastFireAge, strategyHasSpending } from '../../engine/metrics';
import { useBridge, useDrawdownMetrics, useRun } from '../../state/derived';
import { useSelectedScenario, useSelectedStrategy, useStore } from '../../state/store';
import { AssumptionsPanel } from '../components/AssumptionsPanel';
import { BalanceTable } from '../components/BalanceTable';
import { GrowthChart } from '../components/GrowthChart';
import { BridgeVisualizer } from './BridgeVisualizer';
import { MilestonesPanel, RateArbitragePanel } from './DrawdownPanels';
import { Lens } from './HeroCard';
import { fmtMoney0, fmtMoneyM } from './inputs';
import { runTiles } from './lens';
import { StrategyEditor } from './StrategyEditor';
import { StrategyMenu } from './StrategyMenu';

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="gap-0.5 rounded-lg border-neutral-200 bg-white px-4 py-3 shadow-none dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">{label}</div>
      <div className="tnum text-xl font-semibold text-neutral-900 dark:text-neutral-50">{value}</div>
      {hint && <div className="text-[11px] text-neutral-400">{hint}</div>}
    </Card>
  );
}

export function DrawdownTab() {
  const { state, dispatch } = useStore();
  const a = state.assumptions;
  const scenario = useSelectedScenario();
  const strategy = useSelectedStrategy();
  const { run, errors } = useRun(a, scenario, strategy);
  const bridge = useBridge(run, a, strategy);
  const metrics = useDrawdownMetrics(run, a, strategy);
  const coastAge = useMemo(() => {
    try {
      return coastFireAge(a, scenario);
    } catch {
      return null;
    }
  }, [a, scenario]);
  const d = state.display;
  const liveWidth = useRef(d.panelWidth ?? DEFAULT_PANEL_WIDTH);
  const commitWidth = () => {
    const px = Math.round(liveWidth.current);
    if (px !== d.panelWidth) dispatch({ type: 'patchDisplay', patch: { panelWidth: px } });
  };
  const lens = (key: 'real' | 'ate' | 'byBuckets') => (v: boolean) =>
    dispatch({ type: 'patchDisplay', patch: { [key]: v } });
  const hasSpending = strategyHasSpending(strategy);
  const tiles = useMemo(
    () => (run ? runTiles(run, a, d.real) : null),
    [run, a, d.real],
  )!;

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel
        defaultSize={d.panelWidth ?? DEFAULT_PANEL_WIDTH}
        minSize={300}
        maxSize={640}
        onResize={(size) => {
          liveWidth.current = size.inPixels;
        }}
      >
        <aside className="h-full overflow-y-auto pr-4" data-testid="strategy-panel">
          <StrategyMenu strategy={strategy} />
          <StrategyEditor a={a} g={scenario} w={strategy} />
        </aside>
      </ResizablePanel>
      <ResizableHandle
        withHandle
        onPointerUp={commitWidth}
        onLostPointerCapture={commitWidth}
        className="w-1 bg-neutral-200 transition-colors after:w-4 hover:bg-neutral-400 data-[resize-handle-state=drag]:bg-neutral-500 dark:bg-neutral-800 dark:hover:bg-neutral-600"
      />
      <ResizablePanel>
        <main className="h-full space-y-4 overflow-y-auto pl-4" data-testid="drawdown-column">
          {errors.length > 0 && (
            <p
              role="status"
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
            >
              Fix inputs — showing the last valid result. {errors.join(' · ')}
            </p>
          )}

          {!hasSpending && (
            <Card className="gap-1 rounded-lg border-neutral-200 bg-white p-6 shadow-none dark:border-neutral-800 dark:bg-neutral-900">
              <span className="text-lg font-semibold text-neutral-400">no spending entered</span>
              <p className="text-sm text-neutral-500">
                Set a FIRE spending target under Growth → Basics, or add spending rows in the
                strategy editor — the run, bridge, and milestones fill in from there.
              </p>
            </Card>
          )}

          {run && hasSpending && (
            <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
                <Tile
                  label="Lifetime after-tax spending"
                  value={fmtMoneyM(tiles.lifetimeAfterTaxSpending)}
                  hint={`${tiles.lensLabel}, funded years only`}
                />
                <Tile
                  label="Terminal ATE"
                  value={fmtMoneyM(tiles.terminalAte)}
                  hint={`${tiles.lensLabel} at ${a.horizonAge}`}
                />
                <Tile
                  label="Funded through"
                  value={
                    tiles.fundedThrough === 'horizon'
                      ? `${a.horizonAge} ✓`
                      : tiles.fundedThrough === null
                        ? '— ✗'
                        : `${tiles.fundedThrough}`
                  }
                  hint={
                    tiles.fundedThrough === 'horizon'
                      ? 'no gap years'
                      : tiles.fundedThrough === null
                        ? 'gaps from the start'
                        : `money runs out at ${run.summary.firstGapAge}`
                  }
                />
                <Tile
                  label="Years retired"
                  value={String(run.summary.yearsRetired)}
                  hint={`planned span from ${run.drawdownStartAge} — not the funded span`}
                />
                <Tile
                  label="Cumulative tax"
                  value={fmtMoney0(tiles.cumulativeTax)}
                  hint={`${tiles.lensLabel} — drag, income & withdrawal tax`}
                />
              </div>

              <Card className="gap-0 rounded-lg border-neutral-200 bg-white p-4 shadow-none dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                      {scenario.name} × {strategy.name}
                    </h3>
                    <Badge
                      variant="outline"
                      className="mt-0.5 border-neutral-200 text-[10px] font-medium uppercase tracking-wide text-neutral-400 dark:border-neutral-700"
                    >
                      solid = drawdown start · dotted = access ages · shaded = gap years
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Lens value={d.real} a="real" b="nominal" onChange={lens('real')} labels={["today's $", 'nominal']} />
                    <Lens value={d.ate} a="ate" b="gross" onChange={lens('ate')} labels={['after-tax', 'gross']} />
                    <Lens value={d.byBuckets} a="buckets" b="accounts" onChange={lens('byBuckets')} labels={['buckets', 'accounts']} />
                  </div>
                </div>
                <GrowthChart years={run.years} a={a} display={d} variant="run" />
              </Card>

              {bridge && <BridgeVisualizer bridge={bridge} run={run} display={d} a={a} />}

              <div className="grid gap-3 xl:grid-cols-2">
                <RateArbitragePanel a={a} />
                {bridge && (
                  <MilestonesPanel run={run} bridge={bridge} metrics={metrics} coastAge={coastAge} a={a} />
                )}
              </div>

              <BalanceTable
                years={run.years}
                a={a}
                display={d}
                onToggleYearly={() => dispatch({ type: 'patchDisplay', patch: { yearlyTable: !d.yearlyTable } })}
              />
            </>
          )}
          <AssumptionsPanel />
        </main>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
