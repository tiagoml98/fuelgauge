/** Growth-tab readouts: Coast FIRE age, Barista, $1M age, FIRE number (SPEC §3, gate #13). */

import type { Assumptions } from '../../engine/types';
import type { GrowthMetrics } from '../../state/derived';
import { fmtMoney } from './fields';

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">{value}</div>
      {hint && <div className="text-[10px] text-neutral-400">{hint}</div>}
    </div>
  );
}

export function MetricsSidebar({ a, metrics }: { a: Assumptions; metrics: GrowthMetrics }) {
  const target =
    a.fireSpendingTarget > 0
      ? `vs target spend ${fmtMoney(a.fireSpendingTarget)}, target age ${a.coastTargetAge}`
      : 'set a FIRE spending target in Assumptions';
  const age = (v: number | null) => (v === null ? '—' : String(v));
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
      <Tile
        label="FIRE number"
        value={metrics.fireNumber === null ? '—' : fmtMoney(metrics.fireNumber)}
        hint={`spend ÷ ${(a.safeWithdrawalRate * 100).toFixed(1)}% SWR (~30 yrs), real`}
      />
      <Tile label="Coast FIRE age" value={age(metrics.coastAge)} hint={target} />
      <Tile
        label="Barista FIRE age"
        value={age(metrics.baristaAge)}
        hint={
          (a.baristaIncomeTarget ?? 0) > 0
            ? `with ${fmtMoney(a.baristaIncomeTarget ?? 0)}/yr part-time income`
            : 'set a barista income target'
        }
      />
      <Tile label="$1M age" value={age(metrics.millionAge)} hint="real gross total" />
    </div>
  );
}
