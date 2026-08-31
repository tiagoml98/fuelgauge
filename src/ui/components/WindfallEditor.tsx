/**
 * Windfall rows (gate #12): amounts are NOMINAL — "amount that lands, in that
 * year's dollars" — with the today's-$ equivalent shown beside each row.
 */

import { toReal } from '../../engine/schedule';
import type { AccountId, Windfall } from '../../engine/types';
import { ACCOUNT_LABELS, ACCOUNT_ORDER } from '../theme/colors';
import { buttonCls, fmtMoney } from './fields';

const cell =
  'rounded border border-neutral-300 bg-white px-1 py-0.5 text-xs text-neutral-900 ' +
  'dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100';

export function WindfallEditor({
  windfalls,
  onChange,
  filerCount,
  currentAge,
  inflation,
}: {
  windfalls: Windfall[];
  onChange: (w: Windfall[]) => void;
  filerCount: number;
  currentAge: number;
  inflation: number;
}) {
  const patch = (i: number, p: Partial<Windfall>) =>
    onChange(windfalls.map((w, j) => (j === i ? { ...w, ...p } : w)));

  return (
    <div className="space-y-1 rounded border border-neutral-200 p-2 dark:border-neutral-800">
      <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
        Windfalls{' '}
        <span className="font-normal text-neutral-400">
          — amount that lands, in that year's dollars
        </span>
      </div>
      {windfalls.map((w, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-neutral-400">age</span>
          <input
            type="number"
            className={`${cell} w-14 tnum`}
            value={w.age}
            onChange={(e) => patch(i, { age: e.target.valueAsNumber || 0 })}
          />
          <input
            type="number"
            className={`${cell} w-24 tnum`}
            value={w.amount}
            step={10000}
            onChange={(e) => patch(i, { amount: e.target.valueAsNumber || 0 })}
          />
          <span className="text-neutral-400" title="today's-dollar equivalent">
            ≈ {fmtMoney(toReal(w.amount, Math.max(0, w.age - currentAge), inflation))} today
          </span>
          <select
            className={cell}
            value={w.target}
            onChange={(e) => patch(i, { target: e.target.value as AccountId })}
          >
            {ACCOUNT_ORDER.map((id) => (
              <option key={id} value={id}>
                {ACCOUNT_LABELS[id]}
              </option>
            ))}
          </select>
          {filerCount > 1 && (
            <select
              className={cell}
              value={w.filer ?? 0}
              onChange={(e) => patch(i, { filer: Number(e.target.value) })}
            >
              <option value={0}>filer 1</option>
              <option value={1}>filer 2</option>
            </select>
          )}
          <input
            className={`${cell} w-24`}
            value={w.label}
            placeholder="label"
            onChange={(e) => patch(i, { label: e.target.value })}
          />
          <button
            type="button"
            className="px-1 text-neutral-400 hover:text-red-500"
            onClick={() => onChange(windfalls.filter((_, j) => j !== i))}
            aria-label="delete windfall"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className={buttonCls}
        onClick={() =>
          onChange([
            ...windfalls,
            { age: currentAge + 2, amount: 100_000, target: 'taxable', label: 'windfall' },
          ])
        }
      >
        + windfall
      </button>
    </div>
  );
}
