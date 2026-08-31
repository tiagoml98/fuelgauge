/**
 * The SPEC §5 compact schedule table: rows {from, to, value}, gaps = 0,
 * toAge blank = until horizon, LATER ROWS WIN. Storage order is semantic and
 * never re-sorted here (M1 #2) — quick actions append override rows, exactly
 * like the resolver expects. Sparkline shows the resolved (unindexed) values.
 */

import { useState } from 'react';
import { resolveSchedule } from '../../engine/schedule';
import type { ScheduleRow } from '../../engine/types';
import { buttonCls } from './fields';

const cell =
  'w-16 rounded border border-neutral-300 bg-white px-1 py-0.5 text-xs tnum text-neutral-900 ' +
  'dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100';

function Sparkline({ rows, startAge, endAge }: { rows: ScheduleRow[]; startAge: number; endAge: number }) {
  let values: number[];
  try {
    values = resolveSchedule(rows, { startAge, endAge, indexed: false, inflation: 0 });
  } catch {
    return <span className="text-xs text-red-500">invalid rows</span>;
  }
  const max = Math.max(...values, 1);
  const w = 120;
  const h = 24;
  const step = w / values.length;
  // step-shaped polyline: value v held across each age
  const points = values
    .flatMap((v, i) => {
      const y = h - (v / max) * (h - 2) - 1;
      return [`${(i * step).toFixed(1)},${y.toFixed(1)}`, `${((i + 1) * step).toFixed(1)},${y.toFixed(1)}`];
    })
    .join(' ');
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-blue-500" />
    </svg>
  );
}

export function ScheduleEditor({
  label,
  rows,
  onChange,
  startAge,
  endAge,
  unit = '$/yr',
}: {
  label: string;
  rows: ScheduleRow[];
  onChange: (rows: ScheduleRow[]) => void;
  startAge: number;
  endAge: number;
  unit?: string;
}) {
  const [quick, setQuick] = useState<'stop' | 'reduce' | 'until' | null>(null);
  const [qAge, setQAge] = useState(endAge);
  const [qAmount, setQAmount] = useState(0);

  const patchRow = (i: number, patch: Partial<ScheduleRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const applyQuick = () => {
    if (quick === 'stop') onChange([...rows, { fromAge: qAge, toAge: null, value: 0 }]);
    if (quick === 'reduce') onChange([...rows, { fromAge: qAge, toAge: null, value: qAmount }]);
    if (quick === 'until') onChange([...rows, { fromAge: qAge + 1, toAge: null, value: 0 }]);
    setQuick(null);
  };

  return (
    <div className="space-y-1 rounded border border-neutral-200 p-2 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {label} <span className="text-neutral-400">({unit}, today's $)</span>
        </span>
        <Sparkline rows={rows} startAge={startAge} endAge={endAge} />
      </div>
      {rows.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-neutral-400">
              <th className="font-normal">from</th>
              <th className="font-normal">to</th>
              <th className="font-normal">value</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              /* storage order preserved — later rows win on overlap */
              <tr key={i}>
                <td>
                  <input
                    type="number"
                    className={cell}
                    value={r.fromAge}
                    onChange={(e) => patchRow(i, { fromAge: e.target.valueAsNumber || 0 })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className={cell}
                    placeholder="∞"
                    value={r.toAge ?? ''}
                    onChange={(e) =>
                      patchRow(i, { toAge: Number.isNaN(e.target.valueAsNumber) ? null : e.target.valueAsNumber })
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className={`${cell} w-24`}
                    value={r.value}
                    step={1000}
                    onChange={(e) => patchRow(i, { value: e.target.valueAsNumber || 0 })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="px-1 text-neutral-400 hover:text-red-500"
                    onClick={() => onChange(rows.filter((_, j) => j !== i))}
                    aria-label="delete row"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          className={buttonCls}
          onClick={() => onChange([...rows, { fromAge: startAge + 1, toAge: null, value: 0 }])}
        >
          + row
        </button>
        {(['stop', 'reduce', 'until'] as const).map((q) => (
          <button key={q} type="button" className={buttonCls} onClick={() => setQuick(quick === q ? null : q)}>
            {q === 'stop' ? 'Stop at…' : q === 'reduce' ? 'Reduce…' : 'Until age…'}
          </button>
        ))}
        {quick && (
          <span className="flex items-center gap-1 text-xs">
            age
            <input type="number" className={cell} value={qAge} onChange={(e) => setQAge(e.target.valueAsNumber || 0)} />
            {quick === 'reduce' && (
              <>
                to
                <input
                  type="number"
                  className={`${cell} w-24`}
                  value={qAmount}
                  step={1000}
                  onChange={(e) => setQAmount(e.target.valueAsNumber || 0)}
                />
              </>
            )}
            <button type="button" className={buttonCls} onClick={applyQuick}>
              apply
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
