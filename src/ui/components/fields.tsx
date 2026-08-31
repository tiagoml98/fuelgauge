/** Small form primitives shared by every inputs group. */

import { useId, useState, type ReactNode } from 'react';

export function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-neutral-800 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800/60"
      >
        {title}
        <span className="text-neutral-400">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="space-y-2 px-3 pb-3">{children}</div>}
    </div>
  );
}

const inputCls =
  'w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 tnum ' +
  'focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100';

export function LabeledRow({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className="grid grid-cols-[1fr_9rem] items-center gap-2">
      <span className="text-xs text-neutral-600 dark:text-neutral-400">{label}</span>
      <span id={id}>{children}</span>
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  step = 1000,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <LabeledRow label={label}>
      <input
        type="number"
        className={inputCls}
        value={Number.isFinite(value) ? value : 0}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.valueAsNumber || 0)}
      />
    </LabeledRow>
  );
}

/** Stores a 0–1 decimal; shows percent. */
export function PercentField({
  label,
  value,
  onChange,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <LabeledRow label={label}>
      <span className="flex items-center gap-1">
        <input
          type="number"
          className={inputCls}
          value={Math.round(value * 1000) / 10}
          step={step}
          onChange={(e) => onChange((e.target.valueAsNumber || 0) / 100)}
        />
        <span className="text-xs text-neutral-500">%</span>
      </span>
    </LabeledRow>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-neutral-600 dark:text-neutral-400">
      {label}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <LabeledRow label={label}>
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </LabeledRow>
  );
}

export const fmtMoney = (v: number): string =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const buttonCls =
  'rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 ' +
  'dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800';
