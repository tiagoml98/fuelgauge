/**
 * The Ledger hero (M4.5 D.1 pick): one figure, a sentence that explains it,
 * segmented lens toggles that always show both states, and the chart —
 * a precision instrument inside a calm card.
 */

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toReal } from '../../engine/schedule';
import type { Assumptions, DisplayState, GrowthScenario, RunYear } from '../../engine/types';
import type { GrowthMetrics } from '../../state/derived';
import { useStore } from '../../state/store';
import { GrowthChart } from '../components/GrowthChart';
import { fmtMoney0, fmtMoneyM } from './inputs';

function Lens({
  value,
  a: optionA,
  b: optionB,
  onChange,
  labels,
}: {
  value: boolean;
  a: string;
  b: string;
  onChange: (v: boolean) => void;
  labels: [string, string];
}) {
  return (
    <Tabs value={value ? optionA : optionB} onValueChange={(v) => onChange(v === optionA)}>
      <TabsList className="h-7 bg-neutral-100 dark:bg-neutral-800">
        <TabsTrigger value={optionA} className="px-2.5 text-[11px]">
          {labels[0]}
        </TabsTrigger>
        <TabsTrigger value={optionB} className="px-2.5 text-[11px]">
          {labels[1]}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export function HeroCard({
  a,
  g,
  years,
  metrics,
  display,
}: {
  a: Assumptions;
  g: GrowthScenario;
  years: RunYear[];
  metrics: GrowthMetrics;
  display: DisplayState;
}) {
  const { dispatch } = useStore();
  const lens = (key: 'real' | 'ate' | 'byBuckets') => (v: boolean) =>
    dispatch({ type: 'patchDisplay', patch: { [key]: v } });
  const last = years[years.length - 1];
  const startAge = years[0]?.age ?? 0;
  const heroReal = last ? toReal(last.totalAte, last.age - startAge, a.inflation) : 0;
  const empty = !last || last.total <= 0.005;
  const hasWindfall = g.windfalls.length > 0;

  return (
    <Card className="gap-0 rounded-xl border-neutral-200 bg-white p-6 shadow-none dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
        {g.name} · growth only — no withdrawals
      </p>
      {empty ? (
        <div className="mt-2">
          <span className="text-2xl font-semibold text-neutral-400">Nothing to grow yet</span>
          <p className="mt-1 text-sm leading-6 text-neutral-500">
            Add a balance and a contribution under <strong>Basics</strong> on the left — the chart
            fills in live as you type.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <span className="tnum text-[38px] font-semibold leading-none tracking-tight text-neutral-900 dark:text-neutral-50">
              {fmtMoneyM(heroReal)}
            </span>
            <span className="text-sm text-neutral-500">
              after tax at {last.age}, in today's dollars
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600 dark:text-neutral-400">
            {metrics.fireNumber !== null ? (
              <>
                Your FIRE number is <strong className="tnum">{fmtMoneyM(metrics.fireNumber)}</strong>{' '}
                ({fmtMoney0(a.fireSpendingTarget)} a year ÷{' '}
                {(a.safeWithdrawalRate * 100).toFixed(0)}%).{' '}
                {metrics.coastAge !== null ? (
                  <>
                    From <strong>age {metrics.coastAge}</strong> you could stop saving entirely and
                    still reach it by {a.coastTargetAge}.{' '}
                  </>
                ) : (
                  <>On this path it isn't reached by {a.coastTargetAge} without more saving. </>
                )}
              </>
            ) : (
              <>Set a FIRE spending target under Basics to see your FIRE number and Coast age. </>
            )}
            {metrics.millionAge !== null && (
              <>
                First million (gross, real): <strong>age {metrics.millionAge}</strong>.
              </>
            )}
            {metrics.baristaAge !== null && (
              <>
                {' '}
                Barista FIRE with {fmtMoney0(a.baristaIncomeTarget ?? 0)}/yr part-time:{' '}
                <strong>age {metrics.baristaAge}</strong>.
              </>
            )}
          </p>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Lens value={display.real} a="real" b="nominal" onChange={lens('real')} labels={["today's $", 'nominal']} />
          <Lens value={display.ate} a="ate" b="gross" onChange={lens('ate')} labels={['after-tax', 'gross']} />
          <Lens value={display.byBuckets} a="buckets" b="accounts" onChange={lens('byBuckets')} labels={['buckets', 'accounts']} />
        </div>
        <span className="text-[11px] text-neutral-400">
          scroll zooms · drag pans · dashed lines mark changes{hasWindfall ? ' · ◆ one-time events' : ''}
        </span>
      </div>
      {!empty && <GrowthChart years={years} a={a} display={display} />}
      {empty && (
        <div className="mt-4 flex h-64 items-center justify-center rounded-lg border border-dashed border-neutral-200 text-sm text-neutral-400 dark:border-neutral-800">
          the chart appears here
        </div>
      )}
      <Badge
        variant="outline"
        className="mt-2 w-fit border-neutral-200 text-[10px] font-medium uppercase tracking-wide text-neutral-400 dark:border-neutral-700"
      >
        growth only — no withdrawals
      </Badge>
    </Card>
  );
}
