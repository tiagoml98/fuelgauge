/**
 * Draft-commit inputs (M4.5 B.1a/B.3): typing edits a local draft — nothing
 * reaches the engine until blur or Enter, and only when valid. Committed
 * values display formatted (3,000,000); leading zeros are stripped; invalid
 * drafts show an inline message and keep the last good value. Escape reverts.
 */

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface DraftNumberProps {
  /** undefined = "not entered" — only meaningful with onClear (M6.2 #1). */
  value: number | undefined;
  onCommit: (v: number) => void;
  /**
   * M6.2 #1 explicit-entry fields: present ⇒ the field may be EMPTY. An empty
   * committed draft calls onClear (back to "not entered"); the placeholder
   * states the assumption that applies while empty.
   */
  onClear?: () => void;
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
  /**
   * M4.5 item 3: stepper increment in display units (buttons + ↑/↓ keys,
   * hold-to-repeat). Stepping commits immediately and clamps; ⇧ uses bigStep.
   */
  step?: number;
  bigStep?: number;
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
  onClear,
  format = groups,
  parse = parsePlain,
  min,
  max,
  suffix,
  placeholder,
  className,
  invalidMessage = 'enter a number',
  step = 1,
  bigStep,
  ...aria
}: DraftNumberProps) {
  const [draft, setDraft] = useState<string | null>(null); // null = showing committed value
  const [invalid, setInvalid] = useState(false);
  const latest = useRef(value); // hold-to-repeat must see fresh commits
  latest.current = value;
  const repeat = useRef<{ delay?: ReturnType<typeof setTimeout>; tick?: ReturnType<typeof setInterval> }>({});

  // External value changed (import, quick action) while not editing → reflect it
  useEffect(() => {
    if (draft === null) setInvalid(false);
  }, [value, draft]);

  const tryCommit = () => {
    if (draft === null) return;
    if (onClear !== undefined && draft.trim() === '') {
      onClear(); // explicit-entry field emptied → back to "not entered"
      setDraft(null);
      setInvalid(false);
      return;
    }
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

  // Stepping always commits (the result is always valid) and clamps
  const stepBy = (dir: 1 | -1, big: boolean) => {
    const base = (draft !== null ? (parse(draft) ?? latest.current) : latest.current) ?? 0;
    const size = big && bigStep !== undefined ? bigStep : step;
    let next = Math.round((base + dir * size) * 1e6) / 1e6;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    latest.current = next;
    onCommit(next);
    setDraft(null);
    setInvalid(false);
  };
  const stopRepeat = () => {
    clearTimeout(repeat.current.delay);
    clearInterval(repeat.current.tick);
  };
  const startRepeat = (dir: 1 | -1, big: boolean) => {
    stepBy(dir, big);
    repeat.current.delay = setTimeout(() => {
      repeat.current.tick = setInterval(() => stepBy(dir, big), 60);
    }, 400);
  };
  useEffect(() => stopRepeat, []);

  return (
    <div className={cn('relative', className)}>
      <Input
        {...aria}
        inputMode="decimal"
        className={cn(
          'h-8 bg-white pr-5 text-right text-sm tnum dark:bg-neutral-900',
          suffix && 'pr-9',
          invalid && 'border-red-400 focus-visible:ring-red-300 dark:border-red-700',
        )}
        value={draft ?? (value === undefined ? '' : format(value))}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        onFocus={(e) => {
          setDraft(value === undefined || value === 0 ? '' : String(value));
          const el = e.target;
          // select() FOCUSES the element — on a busy frame this callback can
          // fire after the user already left, so it must never run then
          requestAnimationFrame(() => {
            if (document.activeElement === el) el.select();
          });
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
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            stepBy(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
          }
        }}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-5 flex items-center text-xs text-neutral-400">
          {suffix}
        </span>
      )}
      <span className="absolute inset-y-0 right-0 flex w-4 flex-col border-l border-neutral-200 dark:border-neutral-700">
        {([1, -1] as const).map((dir) => (
          <button
            key={dir}
            type="button"
            tabIndex={-1}
            aria-label={`${aria['aria-label'] ?? 'value'} ${dir === 1 ? 'increment' : 'decrement'}`}
            className="flex-1 text-[7px] leading-none text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
            onPointerDown={(e) => startRepeat(dir, e.shiftKey)}
            onPointerUp={stopRepeat}
            onPointerLeave={stopRepeat}
          >
            {dir === 1 ? '▲' : '▼'}
          </button>
        ))}
      </span>
      {invalid && (
        <p role="alert" className="mt-0.5 text-right text-[11px] text-red-500">
          {invalidMessage}
        </p>
      )}
    </div>
  );
}

export function MoneyInput(props: Omit<DraftNumberProps, 'format'>) {
  return (
    <DraftNumberInput
      format={groups}
      invalidMessage="enter an amount"
      step={1_000}
      bigStep={10_000}
      {...props}
    />
  );
}

/**
 * M6.2 #1: explicit-entry basis field. Empty = "not entered" — the stated
 * assumption (placeholder + chip) applies; no balance edit ever fills it;
 * "clear" returns it to empty.
 */
export function BasisField({
  value,
  balance,
  assumption,
  placeholder,
  chipId,
  label,
  onCommit,
  onClear,
}: {
  value: number | undefined;
  balance: number;
  /** Chip text after "basis not entered — ". */
  assumption: string;
  placeholder: string;
  chipId: string;
  label: string;
  onCommit: (v: number) => void;
  onClear: () => void;
}) {
  return (
    <div className="w-full">
      <div className="flex items-center gap-1.5">
        <MoneyInput
          className="min-w-0 flex-1"
          value={value}
          min={0}
          onCommit={onCommit}
          onClear={onClear}
          placeholder={placeholder}
          aria-label={label}
        />
        {value !== undefined && (
          <button
            type="button"
            aria-label={`clear ${label}`}
            className="shrink-0 text-[11px] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            onClick={onClear}
          >
            clear
          </button>
        )}
      </div>
      {value === undefined && balance > 0 && (
        // a CHIP, not stray text: amber-100 wash survives the variant-B page
        // tint (amber-50 did not); ⚠ so the warning is never color-alone
        <p
          data-testid={chipId}
          className="mt-1 inline-block rounded-sm bg-amber-100 px-1.5 py-0.5 text-right text-[11px] leading-4 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
        >
          ⚠ basis not entered — {assumption}
        </p>
      )}
    </div>
  );
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
      step={0.1}
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
      step={1}
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
