/**
 * Schedule editing, two tiers (M4.5 D.3): the default presentation is
 * "amount + until age"; the full row table appears only when the user opts
 * into "detailed schedule". Inline validation and limit warnings live on the
 * rows (C.4); quick actions normalize (C.1) and apply on Enter.
 */

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useState } from 'react';
import { resolveSchedule } from '../../engine/schedule';
import type { ScheduleRow } from '../../engine/types';
import {
  quickActionDefaultAge,
  reduceTo,
  stopAt,
  untilAge,
  validateRows,
} from '../../engine/scheduleOps';
import { AgeInput, DraftNumberInput, fmtMoney0, MoneyInput, PercentInput } from './inputs';

function Sparkline({ rows, startAge, endAge }: { rows: ScheduleRow[]; startAge: number; endAge: number }) {
  let values: number[];
  try {
    values = resolveSchedule(rows, { startAge, endAge, indexed: false, inflation: 0 });
  } catch {
    return null;
  }
  const max = Math.max(...values, 1);
  const w = 96;
  const h = 20;
  const step = w / values.length;
  const points = values
    .flatMap((v, i) => {
      const y = h - (v / max) * (h - 2) - 1;
      return [`${(i * step).toFixed(1)},${y.toFixed(1)}`, `${((i + 1) * step).toFixed(1)},${y.toFixed(1)}`];
    })
    .join(' ');
  return (
    <svg width={w} height={h} aria-hidden className="text-neutral-400">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

export function ScheduleControl({
  label,
  description,
  rows,
  onChange,
  startAge,
  endAge,
  unit = 'money',
  limit,
}: {
  label: string;
  description?: string;
  rows: ScheduleRow[];
  onChange: (rows: ScheduleRow[]) => void;
  startAge: number;
  endAge: number;
  unit?: 'money' | 'percent';
  /** C.4: applicable IRS limit for inline "capped" warnings. */
  limit?: { value: number; label: string };
}) {
  const simpleCapable = rows.length <= 1;
  const [detailed, setDetailed] = useState(!simpleCapable);
  const errors = validateRows(rows);
  const overLimit = limit && rows.some((r) => r.value > limit.value + 1e-9);
  const Amount = unit === 'percent' ? PercentInput : MoneyInput;

  const simpleRow = rows[0];
  const setSimple = (patch: Partial<ScheduleRow>) => {
    const base: ScheduleRow = simpleRow ?? { fromAge: startAge + 1, toAge: null, value: 0 };
    const next = { ...base, ...patch };
    onChange(next.value === 0 && next.toAge === null && !simpleRow ? [] : [next]);
  };

  const [qAge, setQAge] = useState(() => quickActionDefaultAge(rows, startAge + 1));
  const [qValue, setQValue] = useState(0);
  const [quick, setQuick] = useState<'stop' | 'reduce' | 'until' | null>(null);
  const applyQuick = () => {
    if (quick === 'stop') onChange(stopAt(rows, qAge));
    if (quick === 'reduce') onChange(reduceTo(rows, qValue, qAge));
    if (quick === 'until') onChange(untilAge(rows, qAge));
    setQuick(null);
  };

  return (
    <div className="py-2.5">
      <div className="grid grid-cols-[1fr_auto] items-start gap-3">
        <div className="min-w-0">
          <span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-200">{label}</span>
          {description && (
            <p className="mt-0.5 text-xs leading-4 text-neutral-500 dark:text-neutral-400">{description}</p>
          )}
          <label className="mt-1 flex w-fit items-center gap-1.5 text-[11px] text-neutral-400">
            <Switch
              checked={detailed}
              onCheckedChange={(v) => setDetailed(v || !simpleCapable)}
              className="scale-75"
              aria-label={`${label}: detailed schedule`}
            />
            detailed schedule{rows.length > 1 ? ` (${rows.length} rows)` : ''}
          </label>
        </div>
        {!detailed && (
          <div className="flex w-[12.5rem] items-start gap-1.5">
            <Amount
              className="min-w-0 flex-1"
              value={simpleRow?.value ?? 0}
              onCommit={(v) => setSimple({ value: v })}
              aria-label={`${label} amount`}
            />
            <div className="w-[4.5rem]">
              <DraftNumberInput
                value={simpleRow?.toAge ?? 0}
                format={(v) => (v === 0 ? '' : String(v))}
                parse={(raw) => {
                  const t = raw.trim();
                  if (t === '' || t === '∞') return 0; // 0 encodes "no end"
                  const n = Number(t.replaceAll(',', ''));
                  return Number.isInteger(n) && n > 0 ? n : null;
                }}
                onCommit={(v) => setSimple({ toAge: v === 0 ? null : v })}
                placeholder="∞"
                invalidMessage="whole age"
                aria-label={`${label} until age`}
              />
              <p className="mt-0.5 text-center text-[10px] text-neutral-400">until age</p>
            </div>
          </div>
        )}
      </div>

      {overLimit && limit && (
        <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] leading-4 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          exceeds {limit.label} {fmtMoney0(limit.value)} — capped
        </p>
      )}

      {detailed && (
        <div className="mt-2 space-y-1.5 rounded-lg border border-neutral-200 p-2.5 dark:border-neutral-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-neutral-400">
              rows apply in order — later rows win on overlap
            </span>
            <Sparkline rows={rows} startAge={startAge} endAge={endAge} />
          </div>
          {rows.map((r, i) => {
            const err = errors.find((e) => e.index === i);
            return (
              <div key={i}>
                <div className="flex items-center gap-1.5">
                  <AgeInput
                    className="w-16"
                    value={r.fromAge}
                    onCommit={(v) => onChange(rows.map((x, j) => (j === i ? { ...x, fromAge: v } : x)))}
                    aria-label={`${label} row ${i + 1} from age`}
                  />
                  <span className="text-xs text-neutral-400">→</span>
                  <DraftNumberInput
                    className="w-16"
                    value={r.toAge ?? 0}
                    format={(v) => (v === 0 ? '' : String(v))}
                    parse={(raw) => {
                      const t = raw.trim();
                      if (t === '' || t === '∞') return 0;
                      const n = Number(t.replaceAll(',', ''));
                      return Number.isInteger(n) ? n : null;
                    }}
                    onCommit={(v) =>
                      onChange(rows.map((x, j) => (j === i ? { ...x, toAge: v === 0 ? null : v } : x)))
                    }
                    placeholder="∞"
                    invalidMessage="whole age"
                    aria-label={`${label} row ${i + 1} to age`}
                  />
                  <Amount
                    className="min-w-0 flex-1"
                    value={r.value}
                    onCommit={(v) => onChange(rows.map((x, j) => (j === i ? { ...x, value: v } : x)))}
                    aria-label={`${label} row ${i + 1} value`}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-1.5 text-neutral-400 hover:text-red-500"
                    onClick={() => onChange(rows.filter((_, j) => j !== i))}
                    aria-label={`${label} delete row ${i + 1}`}
                  >
                    ×
                  </Button>
                </div>
                {err && (
                  <p role="alert" className="mt-0.5 text-[11px] text-red-500">
                    {err.message}
                  </p>
                )}
              </div>
            );
          })}
          <div
            className="flex flex-wrap items-center gap-1.5 pt-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && quick) applyQuick();
            }}
          >
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onChange([...rows, { fromAge: startAge + 1, toAge: null, value: 0 }])}
            >
              + row
            </Button>
            {(['stop', 'reduce', 'until'] as const).map((q) => (
              <Button
                key={q}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setQAge(quickActionDefaultAge(rows, startAge + 1));
                  setQuick(quick === q ? null : q);
                }}
              >
                {q === 'stop' ? 'Stop at…' : q === 'reduce' ? (unit === 'percent' ? 'Lower to…' : 'Reduce to…') : 'Until age…'}
              </Button>
            ))}
            {quick && (
              <span className="flex items-center gap-1.5 text-xs text-neutral-500">
                {quick === 'reduce' && (
                  <Amount className="w-24" value={qValue} onCommit={setQValue} aria-label="quick action value" />
                )}
                <span>{quick === 'until' ? 'to age' : 'at age'}</span>
                <AgeInput className="w-16" value={qAge} onCommit={setQAge} aria-label="quick action age" />
                <Button size="sm" className="h-7 text-xs" onClick={applyQuick}>
                  apply
                </Button>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
