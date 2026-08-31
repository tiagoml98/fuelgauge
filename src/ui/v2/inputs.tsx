/**
 * Draft-commit inputs (M4.5 B.1a/B.3): typing edits a local draft — nothing
 * reaches the engine until blur or Enter, and only when valid. Committed
 * values display formatted (3,000,000); leading zeros are stripped; invalid
 * drafts show an inline message and keep the last good value. Escape reverts.
 */

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useEffect, useId, useState, type ReactNode } from 'react';

export interface DraftNumberProps {
  value: number;
  onCommit: (v: number) => void;
  /** Format the committed display. */
  format?: (v: number) => string;
  /** Parse a raw draft; return null when invalid. */
  parse?: (raw: string) => number | null;
  min?: number;
  max?: number;
  suffix?: string;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
  invalidMessage?: string;
}

const groups = (v: number) =>
  v.toLocaleString('en-US', { maximumFractionDigits: 2 });

export const parsePlain = (raw: string): number | null => {
  const cleaned = raw.replaceAll(',', '').trim().replace(/^0+(?=\d)/, ''); // strip leading zeros
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

export function DraftNumberInput({
  value,
  onCommit,
  format = groups,
  parse = parsePlain,
  min,
  max,
  suffix,
  placeholder,
  className,
  invalidMessage = 'enter a number',
  ...aria
}: DraftNumberProps) {
  const [draft, setDraft] = useState<string | null>(null); // null = showing committed value
  const [invalid, setInvalid] = useState(false);

  // External value changed (import, quick action) while not editing → reflect it
  useEffect(() => {
    if (draft === null) setInvalid(false);
  }, [value, draft]);

  const tryCommit = () => {
    if (draft === null) return;
    const parsed = parse(draft);
    const ok =
      parsed !== null && (min === undefined || parsed >= min) && (max === undefined || parsed <= max);
    if (ok) {
      onCommit(parsed);
      setDraft(null);
      setInvalid(false);
    } else {
      setInvalid(true); // keep the draft; the engine keeps the last good value
    }
  };

  return (
    <div className={cn('relative', className)}>
      <Input
        {...aria}
        inputMode="decimal"
        className={cn(
          'h-8 bg-white text-right text-sm tnum dark:bg-neutral-900',
          suffix && 'pr-7',
          invalid && 'border-red-400 focus-visible:ring-red-300 dark:border-red-700',
        )}
        value={draft ?? format(value)}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        onFocus={(e) => {
          setDraft(String(value === 0 ? '' : value));
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          setInvalid(false);
        }}
        onBlur={tryCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(null);
            setInvalid(false);
          }
        }}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-neutral-400">
          {suffix}
        </span>
      )}
      {invalid && (
        <p role="alert" className="mt-0.5 text-right text-[11px] text-red-500">
          {invalidMessage}
        </p>
      )}
    </div>
  );
}

export function MoneyInput(props: Omit<DraftNumberProps, 'format'>) {
  return <DraftNumberInput format={groups} invalidMessage="enter an amount" {...props} />;
}

/** Stored as a 0–1 decimal, edited as a percent. */
export function PercentInput({
  value,
  onCommit,
  ...rest
}: Omit<DraftNumberProps, 'format' | 'parse' | 'value' | 'onCommit'> & {
  value: number;
  onCommit: (v: number) => void;
}) {
  return (
    <DraftNumberInput
      value={Math.round(value * 1000) / 10}
      onCommit={(v) => onCommit(v / 100)}
      format={(v) => String(v)}
      suffix="%"
      invalidMessage="enter a percent"
      {...rest}
    />
  );
}

export function AgeInput(props: Omit<DraftNumberProps, 'format'>) {
  return (
    <DraftNumberInput
      format={(v) => String(v)}
      min={0}
      max={120}
      invalidMessage="enter an age"
      {...props}
    />
  );
}

/** Monarch-style field: label + optional description left, control right. */
export function FieldRow({
  label,
  description,
  warning,
  control,
  controlWidth = 'w-[9.5rem]',
}: {
  label: string;
  description?: string;
  warning?: string;
  control: ReactNode;
  controlWidth?: string;
}) {
  const id = useId();
  return (
    <div className="py-2.5">
      <div className="grid grid-cols-[1fr_auto] items-start gap-3">
        <div className="min-w-0">
          <Label htmlFor={id} className="text-[13px] font-medium text-neutral-800 dark:text-neutral-200">
            {label}
          </Label>
          {description && (
            <p className="mt-0.5 text-xs leading-4 text-neutral-500 dark:text-neutral-400">{description}</p>
          )}
        </div>
        <div id={id} className={controlWidth}>
          {control}
        </div>
      </div>
      {warning && (
        <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] leading-4 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {warning}
        </p>
      )}
    </div>
  );
}

export function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="pb-1 pt-4 first:pt-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>}
    </div>
  );
}

export function HintCard({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-dashed border-neutral-300 bg-white/70 p-3 text-xs leading-5 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/70 dark:text-neutral-400">
      {children}
    </div>
  );
}

export const fmtMoney0 = (v: number): string =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const fmtMoneyM = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  return fmtMoney0(v);
};
