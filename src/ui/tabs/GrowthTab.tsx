/** Growth tab (SPEC §3, §13): inputs left, chart + readouts right, table + assumptions below. */

import { useGrowthMetrics, useGrowthYears } from '../../state/derived';
import { useSelectedScenario, useStore } from '../../state/store';
import { AssumptionsInputs } from '../components/AssumptionsInputs';
import { AssumptionsPanel } from '../components/AssumptionsPanel';
import { BalanceTable } from '../components/BalanceTable';
import { buttonCls } from '../components/fields';
import { GrowthChart } from '../components/GrowthChart';
import { MetricsSidebar } from '../components/MetricsSidebar';
import { ScenarioBar } from '../components/ScenarioBar';
import { ScenarioInputs } from '../components/ScenarioInputs';

export function GrowthTab() {
  const { state, dispatch } = useStore();
  const a = state.assumptions;
  const scenario = useSelectedScenario();
  const years = useGrowthYears(a, scenario);
  const metrics = useGrowthMetrics(a, scenario, years);
  const d = state.display;
  const toggle = (key: 'real' | 'ate' | 'byBuckets') =>
    dispatch({ type: 'patchDisplay', patch: { [key]: !d[key] } });

  return (
    <div className="grid gap-3 lg:grid-cols-[22rem_1fr]">
      <aside className="max-h-[calc(100vh-8rem)] overflow-y-auto rounded border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="border-b border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-800 dark:border-neutral-800 dark:text-neutral-100">
          Assumptions
        </div>
        <AssumptionsInputs a={a} />
        <div className="border-b border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-800 dark:border-neutral-800 dark:text-neutral-100">
          Growth scenario
        </div>
        <ScenarioInputs a={a} g={scenario} />
      </aside>

      <main className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ScenarioBar scenario={scenario} />
          <div className="flex gap-1">
            <button type="button" className={buttonCls} onClick={() => toggle('real')}>
              {d.real ? "today's $" : 'nominal'}
            </button>
            <button type="button" className={buttonCls} onClick={() => toggle('ate')}>
              {d.ate ? 'after-tax equivalent' : 'gross'}
            </button>
            <button type="button" className={buttonCls} onClick={() => toggle('byBuckets')}>
              {d.byBuckets ? 'buckets' : 'by account'}
            </button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_11rem]">
          <div className="rounded border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="px-2 pt-1 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
              {scenario.name}
              <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                growth only — no withdrawals
              </span>
            </div>
            <GrowthChart years={years} a={a} display={d} />
          </div>
          <MetricsSidebar a={a} metrics={metrics} />
        </div>

        <BalanceTable
          years={years}
          a={a}
          display={d}
          onToggleYearly={() => dispatch({ type: 'patchDisplay', patch: { yearlyTable: !d.yearlyTable } })}
        />
        <AssumptionsPanel />
      </main>
    </div>
  );
}
