/**
 * Compare tab (SPEC §3, M6): scenarios × strategies grid with per-cell
 * summary metrics (lens rule everywhere), cell selection → overlay with
 * first-crossover ages, delta table vs a chosen baseline, and the presets.
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useMemo, useState } from 'react';
import {
  equalTakeHomePair,
  reduceContributionTo,
  retireAt,
  stopContributingAt,
  stressFirstDrawdownYears,
} from '../../engine/presets';
import { strategyHasSpending } from '../../engine/metrics';
import { resolveDrawdownStart } from '../../engine/run';
import type { GrowthScenario, WithdrawalStrategy } from '../../engine/types';
import { useCompareGrid, type CompareCell } from '../../state/derived';
import { useSelectedScenario, useSelectedStrategy, useStore } from '../../state/store';
import { AssumptionsPanel } from '../components/AssumptionsPanel';
import { RUN_COLORS } from '../theme/colors';
import { CompareOverlay } from './CompareOverlay';
import { Lens } from './HeroCard';
import { AgeInput, fmtMoney0, fmtMoneyM, MoneyInput } from './inputs';
import { runTiles, type RunTiles } from './lens';

const cellKey = (c: { scenarioId: string; strategyId: string }) => `${c.scenarioId}:${c.strategyId}`;

function metricRows(tiles: RunTiles, cell: CompareCell, horizonAge: number) {
  return [
    ['spending', fmtMoneyM(tiles.lifetimeAfterTaxSpending)],
    ['terminal ATE', fmtMoneyM(tiles.terminalAte)],
    ['years retired', String(cell.run!.summary.yearsRetired)],
    ['no-gap start', cell.earliestNoGapStart === null ? '—' : String(cell.earliestNoGapStart)],
    ['bridge', cell.run!.summary.bridgeFunded ? '✓' : '✗'],
    ['cum. tax', fmtMoney0(tiles.cumulativeTax)],
    [
      'funded thru',
      tiles.fundedThrough === 'horizon' ? `${horizonAge} ✓` : tiles.fundedThrough === null ? '— ✗' : String(tiles.fundedThrough),
    ],
  ] as Array<[string, string]>;
}

export function CompareTab() {
  const { state, dispatch } = useStore();
  const a = state.assumptions;
  const d = state.display;
  const scenario = useSelectedScenario();
  const strategy = useSelectedStrategy();
  const grid = useCompareGrid(a, state.growthScenarios, state.strategies);
  const selection = d.compareSelection ?? [];
  const baseline = d.compareBaseline ?? selection[0];
  const [presetNote, setPresetNote] = useState<string | null>(null);
  const [stopAge, setStopAge] = useState(50);
  const [reduceAmount, setReduceAmount] = useState(6_000);
  const [reduceAge, setReduceAge] = useState(45);
  const [retireA, setRetireA] = useState(55);
  const [retireB, setRetireB] = useState(65);
  const lens = (key: 'real' | 'ate') => (v: boolean) =>
    dispatch({ type: 'patchDisplay', patch: { [key]: v } });

  const toggleCell = (scenarioId: string, strategyId: string) => {
    const key = cellKey({ scenarioId, strategyId });
    const exists = selection.some((c) => cellKey(c) === key);
    const next = exists
      ? selection.filter((c) => cellKey(c) !== key)
      : [...selection, { scenarioId, strategyId }];
    dispatch({
      type: 'patchDisplay',
      patch: {
        compareSelection: next,
        compareBaseline:
          baseline && next.some((c) => cellKey(c) === cellKey(baseline)) ? baseline : next[0],
      },
    });
  };

  const overlayRuns = useMemo(() => {
    return selection
      .map((sel) => {
        const cell = grid
          .flat()
          .find((c) => c.scenarioId === sel.scenarioId && c.strategyId === sel.strategyId);
        if (!cell?.run) return null;
        const g = state.growthScenarios.find((x) => x.id === sel.scenarioId)!;
        const w = state.strategies.find((x) => x.id === sel.strategyId)!;
        return {
          label: `${g.name} × ${w.name}`,
          run: cell.run,
          isBaseline: baseline !== undefined && cellKey(sel) === cellKey(baseline),
          sel,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .slice(0, 8); // fixed categorical slots — never cycled
  }, [selection, grid, state.growthScenarios, state.strategies, baseline]);

  const baselineTiles = useMemo(() => {
    const b = overlayRuns.find((r) => r.isBaseline);
    return b ? runTiles(b.run, a, d.real) : null;
  }, [overlayRuns, a, d.real]);

  const spawn = (note: string, scenarios: GrowthScenario[], strategies: WithdrawalStrategy[]) => {
    setPresetNote(note);
    dispatch({ type: 'addCompareRuns', scenarios, strategies });
  };

  const equalTakeHome = () => {
    const { traditional, roth, drivers } = equalTakeHomePair(scenario, a);
    const ratioPct = Math.round(drivers.rateRatio * 1000) / 10;
    const note = drivers.limitBinds
      ? `The deferral limit binds — the clipped dollars spill to taxable, and that (plus drag) is what creates any breakeven age. Without the limit, only the rate comparison would matter.`
      : drivers.dragActive
        ? `Limits don't bind here, so the rate ratio (1−t_ret)÷(1−t_now) = ${ratioPct}% decides — taxable drag on spill dollars is the only thing that can bend it.`
        : `With flat rates and non-binding limits there is no crossover: traditional ends at exactly ${ratioPct}% of Roth's after-tax value at every age. Only the 24%-now vs 12%-later comparison matters.`;
    spawn(note, [traditional, roth], []);
  };

  return (
    <div className="h-full space-y-4 overflow-y-auto" data-testid="compare-tab">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          {state.growthScenarios.length} scenario{state.growthScenarios.length === 1 ? '' : 's'} ×{' '}
          {state.strategies.length} strateg{state.strategies.length === 1 ? 'y' : 'ies'}
        </h2>
        <div className="flex gap-1.5">
          <Lens value={d.real} a="real" b="nominal" onChange={lens('real')} labels={["today's $", 'nominal']} />
          <Lens value={d.ate} a="ate" b="gross" onChange={lens('ate')} labels={['after-tax', 'gross']} />
        </div>
      </div>

      <Card className="gap-2 rounded-lg border-neutral-200 bg-white p-4 shadow-none dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs" data-testid="preset-bar">
          <span className="font-semibold text-neutral-700 dark:text-neutral-300">Presets</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={equalTakeHome}>
            Traditional vs Roth (equal take-home)
          </Button>
          <span className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => spawn(`Stopped every contribution at ${stopAge}.`, [stopContributingAt(scenario, stopAge)], [])}>
              Stop contributing at
            </Button>
            <AgeInput className="w-16" value={stopAge} onCommit={setStopAge} aria-label="Stop preset age" />
          </span>
          <span className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => spawn(`Reduced filer 1's 401k to ${fmtMoney0(reduceAmount)} from ${reduceAge}.`, [reduceContributionTo(scenario, reduceAmount, reduceAge)], [])}>
              Reduce 401k to
            </Button>
            <MoneyInput className="w-24" value={reduceAmount} min={0} onCommit={setReduceAmount} aria-label="Reduce preset amount" />
            <span className="text-neutral-400">at</span>
            <AgeInput className="w-16" value={reduceAge} onCommit={setReduceAge} aria-label="Reduce preset age" />
          </span>
          <span className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => spawn(`Retiring at ${retireA} vs ${retireB}, same scenario.`, [], [retireAt(strategy, retireA), retireAt(strategy, retireB)])}
            >
              Retire at
            </Button>
            <AgeInput className="w-16" value={retireA} onCommit={setRetireA} aria-label="Retire preset age A" />
            <span className="text-neutral-400">vs</span>
            <AgeInput className="w-16" value={retireB} onCommit={setRetireB} aria-label="Retire preset age B" />
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              const D = resolveDrawdownStart(a, scenario, strategy);
              spawn(`−20%/−10%/0% in drawdown years ${D}–${D + 2}, then the base schedule resumes.`, [stressFirstDrawdownYears(scenario, a, D)], []);
            }}
          >
            Stress first 3 drawdown years
          </Button>
          <span className="text-neutral-400">ladder bridge arrives in Phase 2</span>
        </div>
        {presetNote && (
          <p className="rounded-md bg-neutral-50 p-2 text-xs leading-5 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300" data-testid="preset-note">
            {presetNote}
          </p>
        )}
      </Card>

      <Card className="gap-2 overflow-x-auto rounded-lg border-neutral-200 bg-white p-4 shadow-none dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-[11px] text-neutral-400">
          click cells to select ({d.real ? "today's $" : 'nominal'} · click a selected cell again to
          deselect · {selection.length} selected)
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="p-1 text-left align-bottom font-normal text-neutral-400">scenario ↓ · strategy →</th>
              {state.strategies.map((w) => (
                <th key={w.id} className="max-w-40 p-1 text-left font-medium text-neutral-600 dark:text-neutral-300">
                  <span className="line-clamp-2">{w.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, gi) => (
              <tr key={state.growthScenarios[gi].id} className="align-top">
                <td className="max-w-44 p-1 font-medium text-neutral-600 dark:text-neutral-300">
                  <span className="line-clamp-2">{state.growthScenarios[gi].name}</span>
                </td>
                {row.map((cell) => {
                  const g = state.growthScenarios[gi];
                  const w = state.strategies.find((x) => x.id === cell.strategyId)!;
                  const selected = selection.findIndex((c) => cellKey(c) === cellKey(cell));
                  const noSpend = !strategyHasSpending(w);
                  const tiles = cell.run ? runTiles(cell.run, a, d.real) : null;
                  return (
                    <td key={cell.strategyId} className="p-1">
                      <button
                        type="button"
                        aria-label={`cell ${g.name} × ${w.name}`}
                        onClick={() => toggleCell(cell.scenarioId, cell.strategyId)}
                        className={cn(
                          'w-full rounded-md border p-2 text-left transition-colors',
                          selected >= 0
                            ? 'border-neutral-500 ring-2 ring-neutral-400/40 dark:border-neutral-400'
                            : 'border-neutral-200 hover:border-neutral-400 dark:border-neutral-700',
                        )}
                      >
                        {selected >= 0 && (
                          <span
                            className="mb-1 inline-block h-2 w-2 rounded-sm"
                            style={{ background: RUN_COLORS[d.theme][selected % 8] }}
                          />
                        )}
                        {noSpend ? (
                          <span className="text-neutral-400">no spending entered</span>
                        ) : tiles && cell.run ? (
                          <dl className="space-y-0.5">
                            {metricRows(tiles, cell, a.horizonAge).map(([k, v]) => (
                              <div key={k} className="flex justify-between gap-2">
                                <dt className="text-neutral-400">{k}</dt>
                                <dd className="tnum text-neutral-800 dark:text-neutral-200">{v}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : (
                          <span className="text-red-500">{cell.errors[0] ?? 'error'}</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {overlayRuns.length >= 2 ? (
        <>
          <Card className="gap-1 rounded-lg border-neutral-200 bg-white p-4 shadow-none dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                After-tax-equivalent totals · {d.real ? "today's $" : 'nominal'}
              </h3>
              <span className="flex items-center gap-1.5 text-xs text-neutral-500">
                baseline
                <Select
                  value={baseline ? cellKey(baseline) : ''}
                  onValueChange={(v) => {
                    const [scenarioId, strategyId] = v.split(':');
                    dispatch({ type: 'patchDisplay', patch: { compareBaseline: { scenarioId, strategyId } } });
                  }}
                >
                  <SelectTrigger size="sm" className="max-w-72 bg-white text-xs dark:bg-neutral-900" aria-label="Baseline run">
                    <span className="truncate"><SelectValue /></span>
                  </SelectTrigger>
                  <SelectContent className="max-w-[30rem]">
                    {overlayRuns.map((r) => (
                      <SelectItem key={cellKey(r.sel)} value={cellKey(r.sel)} className="whitespace-normal text-xs">
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </span>
            </div>
            <CompareOverlay runs={overlayRuns} a={a} display={d} />
          </Card>

          <Card className="gap-2 rounded-lg border-neutral-200 bg-white p-4 shadow-none dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
              Deltas vs baseline <span className="font-normal text-neutral-400">({d.real ? "today's $" : 'nominal'})</span>
            </h3>
            <table className="w-full text-xs tnum" data-testid="delta-table">
              <thead>
                <tr className="text-left text-neutral-400">
                  <th className="p-1 font-normal">run</th>
                  <th className="p-1 font-normal">Δ lifetime spending</th>
                  <th className="p-1 font-normal">Δ terminal ATE</th>
                  <th className="p-1 font-normal">Δ cumulative tax</th>
                </tr>
              </thead>
              <tbody>
                {overlayRuns
                  .filter((r) => !r.isBaseline)
                  .map((r) => {
                    const t = runTiles(r.run, a, d.real);
                    const delta = (v: number, base: number, goodWhenHigher: boolean) => {
                      const diff = v - base;
                      const good = goodWhenHigher ? diff >= 0 : diff <= 0;
                      return (
                        <span className={good ? 'text-[#006300] dark:text-[#0ca30c]' : 'text-[#d03b3b]'}>
                          {diff >= 0 ? '+' : '−'}{fmtMoneyM(Math.abs(diff))}
                        </span>
                      );
                    };
                    return (
                      <tr key={cellKey(r.sel)} className="border-t border-neutral-100 dark:border-neutral-800">
                        <td className="max-w-72 p-1"><span className="line-clamp-1">{r.label}</span></td>
                        <td className="p-1">{baselineTiles && delta(t.lifetimeAfterTaxSpending, baselineTiles.lifetimeAfterTaxSpending, true)}</td>
                        <td className="p-1">{baselineTiles && delta(t.terminalAte, baselineTiles.terminalAte, true)}</td>
                        <td className="p-1">{baselineTiles && delta(t.cumulativeTax, baselineTiles.cumulativeTax, false)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </Card>
        </>
      ) : (
        <Card className="rounded-lg border-neutral-200 bg-white p-6 text-center text-sm text-neutral-400 shadow-none dark:border-neutral-800 dark:bg-neutral-900">
          select two cells to overlay their after-tax totals and see crossover ages
          <Badge variant="outline" className="ml-2 border-neutral-200 text-[10px] text-neutral-400 dark:border-neutral-700">
            {selection.length}/2
          </Badge>
        </Card>
      )}

      <AssumptionsPanel />
    </div>
  );
}
