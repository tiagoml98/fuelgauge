/**
 * Compare tab (SPEC §3, M6 + M6.1 sprawl management): grid or single-axis
 * table of scenarios × strategies, visibility toggles, manage mode with bulk
 * delete, preset-spawned EXPERIMENTS (keep / clear), overlay + deltas that
 * never compare a run to itself.
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
import { Fragment, useMemo, useState } from 'react';
import { strategyHasSpending } from '../../engine/metrics';
import {
  convertBeforeRmdsPair,
  equalTakeHomePair,
  ladderBridgePair,
  reduceContributionTo,
  retireAt,
  stopContributingAt,
  stressFirstDrawdownYears,
} from '../../engine/presets';
import { resolveDrawdownStart, simulateRun } from '../../engine/run';
import { formatSpans as fmtSpansForNote } from './lens';
import type { GrowthScenario, WithdrawalStrategy } from '../../engine/types';
import { firstCrossover, useCompareGrid, type CompareCell } from '../../state/derived';
import { useSelectedScenario, useSelectedStrategy, useStore } from '../../state/store';
import { AssumptionsPanel } from '../components/AssumptionsPanel';
import { RUN_COLORS } from '../theme/colors';
import { CompareOverlay } from './CompareOverlay';
import { Lens } from './HeroCard';
import { AgeInput, fmtMoney0, fmtMoneyM, MoneyInput, PercentInput } from './inputs';
import { formatSpans, runTiles, type RunTiles } from './lens';

const cellKey = (c: { scenarioId: string; strategyId: string }) => `${c.scenarioId}:${c.strategyId}`;

/** Six compact metrics + the funding spans; grid cells render them 2-up. */
function metricRows(tiles: RunTiles, cell: CompareCell) {
  return [
    ['spending', fmtMoneyM(tiles.lifetimeAfterTaxSpending)],
    ['terminal', fmtMoneyM(tiles.terminalAte)],
    ['yrs ret.', String(cell.run!.summary.yearsRetired)],
    ['no-gap', cell.earliestNoGapStart === null ? '—' : String(cell.earliestNoGapStart)],
    ['bridge', cell.run!.summary.bridgeFunded ? '✓' : '✗'],
    ['tax', fmtMoney0(tiles.cumulativeTax)],
  ] as Array<[string, string]>;
}

function EyeToggle({ hidden, onToggle, label }: { hidden: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onToggle}
      className={cn('px-1 text-[11px]', hidden ? 'text-neutral-300 dark:text-neutral-600' : 'text-neutral-400 hover:text-neutral-700')}
    >
      {hidden ? '◌' : '👁'}
    </button>
  );
}

export function CompareTab() {
  const { state, dispatch } = useStore();
  const a = state.assumptions;
  const d = state.display;
  const scenario = useSelectedScenario();
  const strategy = useSelectedStrategy();
  const hiddenScenarios = new Set(d.hiddenScenarios ?? []);
  const hiddenStrategies = new Set(d.hiddenStrategies ?? []);
  // experiments grouped last (M6.1 #3d)
  const orderedScenarios = useMemo(
    () => [...state.growthScenarios.filter((g) => !g.experiment), ...state.growthScenarios.filter((g) => g.experiment)],
    [state.growthScenarios],
  );
  const orderedStrategies = useMemo(
    () => [...state.strategies.filter((w) => !w.experiment), ...state.strategies.filter((w) => w.experiment)],
    [state.strategies],
  );
  const visScenarios = orderedScenarios.filter((g) => !hiddenScenarios.has(g.id));
  const visStrategies = orderedStrategies.filter((w) => !hiddenStrategies.has(w.id));
  const grid = useCompareGrid(a, visScenarios, visStrategies);
  const selection = d.compareSelection ?? [];
  const baseline = d.compareBaseline ?? selection[0];
  const experimentCount =
    state.growthScenarios.filter((g) => g.experiment).length + state.strategies.filter((w) => w.experiment).length;

  const [manage, setManage] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [presetNote, setPresetNote] = useState<string | null>(null);
  const [stopAge, setStopAge] = useState(50);
  const [reduceAmount, setReduceAmount] = useState(6_000);
  const [reduceAge, setReduceAge] = useState(45);
  const [retireA, setRetireA] = useState(55);
  const [retireB, setRetireB] = useState(65);
  const [ladderAmount, setLadderAmount] = useState(40_000);
  const [ladderFrom, setLadderFrom] = useState(45);
  const [rmdFillPct, setRmdFillPct] = useState(0.12);
  const [sortBy, setSortBy] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const lens = (key: 'real' | 'ate') => (v: boolean) =>
    dispatch({ type: 'patchDisplay', patch: { [key]: v } });

  const toggleCell = (scenarioId: string, strategyId: string) => {
    const key = cellKey({ scenarioId, strategyId });
    const exists = selection.some((c) => cellKey(c) === key);
    const next = exists ? selection.filter((c) => cellKey(c) !== key) : [...selection, { scenarioId, strategyId }];
    dispatch({
      type: 'patchDisplay',
      patch: {
        compareSelection: next,
        compareBaseline: baseline && next.some((c) => cellKey(c) === cellKey(baseline)) ? baseline : next[0],
      },
    });
  };

  const overlayRuns = useMemo(() => {
    return selection
      .map((sel) => {
        const cell = grid.flat().find((c) => c.scenarioId === sel.scenarioId && c.strategyId === sel.strategyId);
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
    // M8 pre-work: with no 401k schedule the two paths are identical — say so
    if (!scenario.perFiler.some((pf) => pf.contrib401k.some((r) => r.value > 0))) {
      setPresetNote('Nothing to split — this scenario has no 401k contributions. Add a 401k schedule first; the preset compares pre-tax vs Roth destinations for those dollars.');
      return;
    }
    const { traditional, roth, drivers } = equalTakeHomePair(scenario, a);
    let note: string;
    if (a.taxMode === 'bracket') {
      // M7: no constant ratio in bracket mode — state the COMPUTED average
      // ordinary rates each path actually pays on its withdrawals (spawned
      // scenarios × the currently selected strategy)
      const avgRate = (run: ReturnType<typeof simulateRun>): number | null => {
        let income = 0;
        let tax = 0;
        for (const y of run.years) {
          income += y.ordinaryIncome ?? 0;
          tax += y.ordinaryTax ?? 0;
        }
        return income > 0.005 ? tax / income : null;
      };
      const fmtR = (r: number | null) => (r === null ? '—' : `${(r * 100).toFixed(1)}%`);
      const tradAvg = avgRate(simulateRun(a, traditional, strategy));
      const rothAvg = avgRate(simulateRun(a, roth, strategy));
      note =
        `Bracket mode — no constant ratio: the traditional path averages ${fmtR(tradAvg)} on its ordinary income vs ${fmtR(rothAvg)} on the Roth path. ` +
        `The gap between that traditional average and your ${Math.round(a.marginalRateNow * 1000) / 10}% marginal-now is what traditional wins (or loses)` +
        (drivers.limitBinds ? '; the deferral limit also binds, spilling dollars to taxable.' : '.');
    } else {
      const ratioPct = Math.round(drivers.rateRatio * 1000) / 10;
      note = drivers.limitBinds
        ? 'The deferral limit binds — the clipped dollars spill to taxable, and that (plus drag) is what creates any breakeven age. Without the limit, only the rate comparison would matter.'
        : drivers.dragActive
          ? `Limits don't bind here, so the rate ratio (1−t_ret)÷(1−t_now) = ${ratioPct}% decides — taxable drag on spill dollars is the only thing that can bend it.`
          : `With flat rates and non-binding limits there is no crossover: traditional ends at exactly ${ratioPct}% of Roth's after-tax value at every age. Only the rate comparison matters.`;
    }
    spawn(note, [traditional, roth], []);
  };

  // M8 (SPEC §9-2.4): outside-money bridge vs conversion ladder — with the
  // honest breakeven explanation, including the valuation-lens disclosure
  const ladderBridge = () => {
    const { outside, ladder } = ladderBridgePair(strategy, ladderAmount, ladderFrom);
    const runOut = simulateRun(a, scenario, outside);
    const runLad = simulateRun(a, scenario, ladder);
    const breakeven = firstCrossover(runOut, runLad, a, d.real);
    const lockedYears = (r: typeof runOut) =>
      r.summary.spans.filter((sp) => sp.kind === 'locked').reduce((n, sp) => n + sp.to - sp.from + 1, 0);
    const lockedBefore = lockedYears(runOut);
    const lockedAfter = lockedYears(runLad);
    const convYears = runLad.years.filter((y) => y.ladder !== undefined);
    const totConv = convYears.reduce((n, y) => n + (y.ladder?.converted ?? 0), 0);
    const convRate = totConv > 0.005 ? convYears.reduce((n, y) => n + (y.ladder?.tax ?? 0), 0) / totConv : 0;
    const pctf = (v: number) => `${Math.round(v * 1000) / 10}%`;
    const valuation =
      Math.abs(runLad.ateRate - convRate) < 0.0005
        ? 'Pre-tax is valued at the same rate the conversions pay, so the lens is neutral here.'
        : `Note the lens: pre-tax is valued at ${pctf(runLad.ateRate)}; conversions taxed at ${pctf(convRate)} appear as an immediate ATE ${runLad.ateRate > convRate ? 'gain' : 'loss'} of ${Math.abs(Math.round((runLad.ateRate - convRate) * 100))}¢ per dollar converted — part of any crossover reflects this valuation rule, not only economics.`;
    const access =
      lockedAfter < lockedBefore
        ? `Access drives it: the ladder turns ${lockedBefore - lockedAfter} locked year${lockedBefore - lockedAfter === 1 ? '' : 's'} into funded ones (${fmtSpansForNote(runLad.summary.spans, a.horizonAge)}).`
        : lockedBefore === 0
          ? 'No locked years either way — access adds nothing; only the rate gap can justify converting.'
          : 'The ladder does not reduce the locked years here.';
    const rate = `Conversions pay ${pctf(convRate)} vs your ${pctf(a.marginalRateNow)} marginal-now; paying tax early from outside money also gives up its growth.`;
    const be =
      breakeven !== null
        ? `Breakeven at ${breakeven} — before it the outside-money path is ahead, after it the ladder is.`
        : 'No breakeven by the horizon: the paths never cross — the cost side outweighs the gains (or vice versa from the start).';
    spawn(`${be} ${access} ${rate} ${valuation}`, [], [outside, ladder]);
  };

  // M10 (SPEC §10.3): convert before RMDs vs don't — first-RMD-year gross on
  // both paths, lifetime tax, terminal ATE, breakeven, both rate drivers, and
  // the §10.1 valuation-lens disclosure; the note states the window used
  const convertBeforeRmds = () => {
    if (a.taxMode !== 'bracket') {
      setPresetNote('Fill-to-bracket conversions need bracket mode — switch “Tax mode” to bracket (Advanced) so the preset can fill to the top of a bracket.');
      return;
    }
    const D = resolveDrawdownStart(a, scenario, strategy);
    const { none, convert, window, rmdAge } = convertBeforeRmdsPair(strategy, a, D, rmdFillPct);
    if (window === null) {
      setPresetNote(`Your drawdown starts at ${D}, at or past filer 1's RMD age (${rmdAge}) — there are no pre-RMD conversion years to use. Nothing spawned.`);
      return;
    }
    const runNone = simulateRun(a, scenario, none);
    const runConv = simulateRun(a, scenario, convert);
    const pctf = (v: number) => `${Math.round(v * 1000) / 10}%`;
    const firstRmd = (r: typeof runNone) => r.years.find((y) => y.rmd !== undefined);
    const rmdGross = (y: NonNullable<ReturnType<typeof firstRmd>>) =>
      y.rmd!.entries.reduce((n, e) => n + e.gross, 0);
    const fN = firstRmd(runNone);
    const fC = firstRmd(runConv);
    if (!fN) {
      spawn(`No RMD years by your horizon (${a.horizonAge}) — filer 1's RMDs would start at ${rmdAge}. The pair still compares bracket smoothing on its own.`, [], [none, convert]);
      return;
    }
    const rmdRate = (r: typeof runNone) => {
      const ys = r.years.filter((y) => y.rmd !== undefined);
      const g = ys.reduce((n, y) => n + rmdGross(y), 0);
      const t = ys.reduce((n, y) => n + y.rmd!.entries.reduce((n2, e) => n2 + e.tax, 0), 0);
      return g > 0.005 ? t / g : null;
    };
    const convYears = runConv.years.filter((y) => y.ladder !== undefined);
    const totConv = convYears.reduce((n, y) => n + (y.ladder?.converted ?? 0), 0);
    const convRate = totConv > 0.005 ? convYears.reduce((n, y) => n + (y.ladder?.tax ?? 0), 0) / totConv : null;
    const noneRmdRate = rmdRate(runNone);
    const breakeven = firstCrossover(runNone, runConv, a, d.real);
    const firstLine = fC
      ? `First RMD year (${fN.age}): ${fmtMoney0(rmdGross(fN))} forced without converting vs ${fmtMoney0(rmdGross(fC))} after — conversions in ${window.fromAge}–${window.toAge} (the window used: your resolved drawdown start through the year before RMDs) shrink the pre-tax balance RMDs are computed on.`
      : `Converting in ${window.fromAge}–${window.toAge} (the window used: your resolved drawdown start through the year before RMDs) empties pre-tax entirely — the no-convert path is forced to take ${fmtMoney0(rmdGross(fN))} at ${fN.age}; the convert path has no RMD years at all.`;
    const totals = `Lifetime tax ${fmtMoney0(runNone.summary.cumulativeTax)} without vs ${fmtMoney0(runConv.summary.cumulativeTax)} with; terminal ATE ${fmtMoneyM(runNone.summary.terminalAte)} vs ${fmtMoneyM(runConv.summary.terminalAte)}.`;
    const be =
      breakeven !== null
        ? `Breakeven at ${breakeven} — before it the no-convert path is ahead, after it converting is.`
        : 'No breakeven by the horizon: the paths never cross.';
    const rates =
      convRate !== null && noneRmdRate !== null
        ? `The driver is the rate gap: conversions pay ${pctf(convRate)} in the bridge years vs ${pctf(noneRmdRate)} the forced RMD years average without them.`
        : 'No rate comparison available (one side pays no ordinary tax).';
    const valuation =
      convRate !== null && Math.abs(runConv.ateRate - convRate) >= 0.0005
        ? ` Note the lens: pre-tax is valued at ${pctf(runConv.ateRate)}; conversions taxed at ${pctf(convRate)} appear as an immediate ATE ${runConv.ateRate > convRate ? 'gain' : 'loss'} of ${Math.abs(Math.round((runConv.ateRate - convRate) * 100))}¢ per dollar converted — part of any crossover reflects this valuation rule, not only economics.`
        : ' Pre-tax is valued at the same rate the conversions pay, so the lens is neutral here.';
    spawn(`${firstLine} ${totals} ${be} ${rates}${valuation}`, [], [none, convert]);
  };

  const setHiddenScenarios = (ids: string[]) => dispatch({ type: 'setHidden', scenarios: ids });
  const setHiddenStrategies = (ids: string[]) => dispatch({ type: 'setHidden', strategies: ids });
  const toggleHidden = (kind: 'scenario' | 'strategy', id: string) => {
    const set = kind === 'scenario' ? hiddenScenarios : hiddenStrategies;
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    (kind === 'scenario' ? setHiddenScenarios : setHiddenStrategies)([...next]);
  };

  const singleAxis = visScenarios.length === 1 || visStrategies.length === 1;
  const listRows = useMemo(() => {
    if (!singleAxis) return [];
    const rows = grid.flat().map((cell) => {
      const g = state.growthScenarios.find((x) => x.id === cell.scenarioId)!;
      const w = state.strategies.find((x) => x.id === cell.strategyId)!;
      const tiles = cell.run ? runTiles(cell.run, a, d.real) : null;
      return { cell, label: visScenarios.length === 1 ? w.name : g.name, tiles };
    });
    if (sortBy && rows.every((r) => r.tiles)) {
      const value = (r: (typeof rows)[number]) => {
        const t = r.tiles!;
        const c = r.cell;
        return [
          t.lifetimeAfterTaxSpending,
          t.terminalAte,
          c.run!.summary.yearsRetired,
          c.earliestNoGapStart ?? Infinity,
          c.run!.summary.bridgeFunded ? 1 : 0,
          t.cumulativeTax,
        ][sortBy.col];
      };
      rows.sort((x, y) => (value(x) - value(y)) * sortBy.dir);
    }
    return rows;
  }, [singleAxis, grid, state.growthScenarios, state.strategies, a, d.real, sortBy, visScenarios.length]);

  const METRIC_HEADERS = ['spending', 'terminal ATE', 'yrs retired', 'no-gap start', 'bridge', 'cum. tax'];

  return (
    <div className="col-scroll h-full space-y-4 overflow-y-auto pr-2" data-testid="compare-tab">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100" data-testid="compare-count">
          {state.growthScenarios.length} scenario{state.growthScenarios.length === 1 ? '' : 's'} ×{' '}
          {state.strategies.length} strateg{state.strategies.length === 1 ? 'y' : 'ies'}
          {hiddenScenarios.size + hiddenStrategies.size > 0 && (
            <span className="font-normal text-neutral-400"> · {hiddenScenarios.size + hiddenStrategies.size} hidden</span>
          )}
          {experimentCount > 0 && <span className="font-normal text-neutral-400"> · {experimentCount} experiments</span>}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {experimentCount > 0 && (
            <Button
              variant={visScenarios.length > 8 ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => dispatch({ type: 'clearExperiments' })}
            >
              clear {experimentCount} experiment{experimentCount === 1 ? '' : 's'}
            </Button>
          )}
          <Button variant={manage ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setManage(!manage)}>
            {manage ? 'done managing' : 'manage'}
          </Button>
          <Lens value={d.real} a="real" b="nominal" onChange={lens('real')} labels={["today's $", 'nominal']} />
          <Lens value={d.ate} a="ate" b="gross" onChange={lens('ate')} labels={['after-tax', 'gross']} />
        </div>
      </div>

      {manage && (
        <Card className="gap-2 p-4" data-testid="manage-panel">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Manage</span>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setHiddenScenarios([])} disabled={hiddenScenarios.size === 0}>
              show all scenarios
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setHiddenStrategies([])} disabled={hiddenStrategies.size === 0}>
              show all strategies
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={selection.length === 0}
              onClick={() => {
                const selG = new Set(selection.map((c) => c.scenarioId));
                const selW = new Set(selection.map((c) => c.strategyId));
                dispatch({
                  type: 'setHidden',
                  scenarios: state.growthScenarios.filter((g) => !selG.has(g.id)).map((g) => g.id),
                  strategies: state.strategies.filter((w) => !selW.has(w.id)).map((w) => w.id),
                });
              }}
            >
              hide all but selected
            </Button>
            {!confirmingDelete ? (
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={checked.size === 0} onClick={() => setConfirmingDelete(true)}>
                delete selected ({checked.size})
              </Button>
            ) : (
              <span className="flex items-center gap-1 text-xs text-red-600">
                delete {checked.size} permanently?
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    dispatch({
                      type: 'bulkDelete',
                      scenarioIds: state.growthScenarios.filter((g) => checked.has(`g:${g.id}`)).map((g) => g.id),
                      strategyIds: state.strategies.filter((w) => checked.has(`w:${w.id}`)).map((w) => w.id),
                    });
                    setChecked(new Set());
                    setConfirmingDelete(false);
                  }}
                >
                  yes, delete
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setConfirmingDelete(false)}>
                  cancel
                </Button>
              </span>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {(
              [
                ['g', 'Scenarios', orderedScenarios, hiddenScenarios, 'scenario'],
                ['w', 'Strategies', orderedStrategies, hiddenStrategies, 'strategy'],
              ] as Array<[string, string, Array<GrowthScenario | WithdrawalStrategy>, Set<string>, 'scenario' | 'strategy']>
            ).map(([prefix, title, items, hidden, kind]) => (
              <div key={prefix}>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{title}</p>
                {items.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 py-0.5 text-xs text-neutral-700 dark:text-neutral-300">
                    <input
                      type="checkbox"
                      checked={checked.has(`${prefix}:${item.id}`)}
                      aria-label={`select ${item.name}`}
                      onChange={(e) => {
                        const next = new Set(checked);
                        if (e.target.checked) next.add(`${prefix}:${item.id}`);
                        else next.delete(`${prefix}:${item.id}`);
                        setChecked(next);
                      }}
                    />
                    <span className={cn('min-w-0 flex-1 truncate', hidden.has(item.id) && 'text-neutral-400 line-through')}>
                      {item.name}
                    </span>
                    {item.experiment && (
                      <Button variant="outline" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => dispatch({ type: 'keepExperiment', kind, id: item.id })}>
                        keep
                      </Button>
                    )}
                    <EyeToggle hidden={hidden.has(item.id)} onToggle={() => toggleHidden(kind, item.id)} label={`toggle visibility ${item.name}`} />
                  </label>
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="gap-2 p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs" data-testid="preset-bar">
          <span className="font-semibold text-neutral-700 dark:text-neutral-300">Presets</span>
          <span className="text-[10px] uppercase tracking-wide text-neutral-400">spawn as experiments</span>
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
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => spawn(`Retiring at ${retireA} vs ${retireB}, same scenario.`, [], [retireAt(strategy, retireA), retireAt(strategy, retireB)])}>
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
          <span className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={ladderBridge}>
              Ladder bridge vs outside money
            </Button>
            <MoneyInput className="w-24" value={ladderAmount} min={0} onCommit={setLadderAmount} aria-label="Ladder preset amount" />
            <span className="text-neutral-400">/yr from</span>
            <AgeInput className="w-16" value={ladderFrom} onCommit={setLadderFrom} aria-label="Ladder preset from age" />
          </span>
          <span className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={convertBeforeRmds}>
              Convert before RMDs vs don’t
            </Button>
            <span className="text-neutral-400">fill to top of</span>
            <PercentInput className="w-16" value={rmdFillPct} onCommit={setRmdFillPct} aria-label="RMD preset fill bracket" />
          </span>
        </div>
        {presetNote && (
          <p className="rounded-md bg-neutral-50 p-2 text-xs leading-5 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300" data-testid="preset-note">
            {presetNote} <span className="text-neutral-400">Spawned as an experiment — keep it from “manage”, or clear experiments when done.</span>
          </p>
        )}
      </Card>

      {visScenarios.length === 0 || visStrategies.length === 0 ? (
        <Card className="p-6 text-center text-sm text-neutral-400">
          everything is hidden — show scenarios and strategies from “manage”
        </Card>
      ) : singleAxis ? (
        <Card className="gap-2 overflow-x-auto p-4">
          <p className="text-[11px] text-neutral-400">
            {visScenarios.length === 1 ? `scenario: ${visScenarios[0].name}` : `strategy: ${visStrategies[0].name}`} — click a
            row to select · click headers to sort ({d.real ? "today's $" : 'nominal'})
          </p>
          <table className="w-full text-xs tnum" data-testid="compare-list">
            <thead>
              <tr className="text-left text-neutral-400">
                <th className="p-1 font-normal">{visScenarios.length === 1 ? 'strategy' : 'scenario'}</th>
                {METRIC_HEADERS.map((h, i) => (
                  <th key={h} className="p-1 font-normal">
                    <button type="button" className="hover:text-neutral-700" onClick={() => setSortBy(sortBy?.col === i ? { col: i, dir: sortBy.dir === 1 ? -1 : 1 } : { col: i, dir: -1 })}>
                      {h} {sortBy?.col === i ? (sortBy.dir === 1 ? '↑' : '↓') : ''}
                    </button>
                  </th>
                ))}
                <th className="p-1 font-normal">funding</th>
              </tr>
            </thead>
            <tbody>
              {listRows.map(({ cell, label, tiles }) => {
                const selected = selection.findIndex((c) => cellKey(c) === cellKey(cell));
                return (
                  <tr
                    key={cellKey(cell)}
                    onClick={() => toggleCell(cell.scenarioId, cell.strategyId)}
                    aria-label={`cell row ${label}`}
                    className={cn(
                      'cursor-pointer border-t border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50',
                      selected >= 0 && 'bg-neutral-50 dark:bg-neutral-800/50',
                    )}
                  >
                    <td className="max-w-72 p-1">
                      {selected >= 0 && <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: RUN_COLORS[d.theme][selected % 8] }} />}
                      <span className="line-clamp-1 inline">{label}</span>
                    </td>
                    {cell.run && cell.run.drawdownStartAge >= a.horizonAge ? (
                      <td colSpan={7} className="p-1 text-neutral-400">never retires — auto start hits the horizon</td>
                    ) : tiles && cell.run ? (
                      <>
                        {metricRows(tiles, cell).map(([k, v]) => (
                          <td key={k} className="p-1">{v}</td>
                        ))}
                        <td className="p-1 text-neutral-500">{formatSpans(tiles.spans, a.horizonAge)}</td>
                      </>
                    ) : (
                      <td colSpan={7} className="p-1 text-neutral-400">{strategyHasSpending(state.strategies.find((w) => w.id === cell.strategyId)!) ? cell.errors[0] ?? 'error' : 'no spending entered'}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card className="gap-2 overflow-x-auto p-4">
          <p className="text-[11px] text-neutral-400">
            click cells to select ({d.real ? "today's $" : 'nominal'} · {selection.length} selected)
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="p-1 text-left align-bottom font-normal text-neutral-400">scenario ↓ · strategy →</th>
                {visStrategies.map((w) => (
                  <th key={w.id} className="max-w-44 p-1 text-left font-medium text-neutral-600 dark:text-neutral-300">
                    <span className="line-clamp-2">
                      {w.experiment && <Badge variant="outline" className="mr-1 border-neutral-300 px-1 text-[9px] uppercase text-neutral-400">exp</Badge>}
                      {w.name}
                    </span>
                    <EyeToggle hidden={false} onToggle={() => toggleHidden('strategy', w.id)} label={`hide strategy ${w.name}`} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visScenarios.map((g, gi) => (
                <Fragment key={g.id}>
                  {g.experiment && !visScenarios[gi - 1]?.experiment && (
                    <tr key={`${g.id}-divider`}>
                      <td colSpan={visStrategies.length + 1} className="pt-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                        experiments
                      </td>
                    </tr>
                  )}
                  <tr key={g.id} className="align-top">
                    <td className="max-w-48 p-1 font-medium text-neutral-600 dark:text-neutral-300">
                      <span className="line-clamp-2">{g.name}</span>
                      <EyeToggle hidden={false} onToggle={() => toggleHidden('scenario', g.id)} label={`hide scenario ${g.name}`} />
                      {g.experiment && (
                        <Button variant="outline" size="sm" className="ml-1 h-5 px-1.5 text-[10px]" onClick={() => dispatch({ type: 'keepExperiment', kind: 'scenario', id: g.id })}>
                          keep
                        </Button>
                      )}
                    </td>
                    {grid[gi].map((cell) => {
                      const w = visStrategies.find((x) => x.id === cell.strategyId)!;
                      const selected = selection.findIndex((c) => cellKey(c) === cellKey(cell));
                      const tiles = cell.run ? runTiles(cell.run, a, d.real) : null;
                      return (
                        <td key={cell.strategyId} className="p-1">
                          <button
                            type="button"
                            aria-label={`cell ${g.name} × ${w.name}`}
                            onClick={() => toggleCell(cell.scenarioId, cell.strategyId)}
                            className={cn(
                              'w-full rounded-md border p-1.5 text-left transition-colors',
                              selected >= 0
                                ? 'border-neutral-500 ring-2 ring-neutral-400/40 dark:border-neutral-400'
                                : 'border-neutral-200 hover:border-neutral-400 dark:border-neutral-700',
                            )}
                          >
                            {selected >= 0 && (
                              <span className="mb-0.5 inline-block h-2 w-2 rounded-sm" style={{ background: RUN_COLORS[d.theme][selected % 8] }} />
                            )}
                            {!strategyHasSpending(w) ? (
                              <span className="text-neutral-400">no spending entered</span>
                            ) : cell.run && cell.run.drawdownStartAge >= a.horizonAge ? (
                              <span className="text-neutral-400">never retires — auto start hits the horizon</span>
                            ) : tiles && cell.run ? (
                              <>
                                {/* M6.1 #4: compact 2-column label:value pairs */}
                                <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                                  {metricRows(tiles, cell).map(([k, v]) => (
                                    <div key={k} className="flex justify-between gap-1">
                                      <dt className="text-neutral-400">{k}</dt>
                                      <dd className="tnum text-neutral-800 dark:text-neutral-200">{v}</dd>
                                    </div>
                                  ))}
                                </dl>
                                <div className="mt-0.5 text-[10px] leading-3 text-neutral-500">{formatSpans(tiles.spans, a.horizonAge)}</div>
                              </>
                            ) : (
                              <span className="text-red-500">{cell.errors[0] ?? 'error'}</span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {overlayRuns.length >= 1 ? (
        <>
          <Card className="gap-1 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                After-tax-equivalent totals · {d.real ? "today's $" : 'nominal'}
              </h3>
              {overlayRuns.length >= 2 ? (
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
              ) : (
                <span className="text-xs text-neutral-400" data-testid="single-run-hint">
                  select another cell to compare
                </span>
              )}
            </div>
            <CompareOverlay runs={overlayRuns} a={a} display={d} />
          </Card>

          {overlayRuns.length >= 2 && (
            <Card className="gap-2 p-4">
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
          )}
        </>
      ) : (
        <Card className="p-6 text-center text-sm text-neutral-400">
          select cells to overlay their after-tax totals and see crossover ages
        </Card>
      )}

      <AssumptionsPanel />
    </div>
  );
}
