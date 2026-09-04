/**
 * Withdrawal-strategy editor (SPEC §1/§3): drawdown start (auto or explicit),
 * spending, one-time expenses, retirement income rows, and the withdrawal
 * order as a drag list (native HTML5 drag + ↑/↓ buttons for keyboard).
 */

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState } from 'react';
import { DEFAULT_BRACKET_TABLES } from '../../engine/defaults';
import { resolveDrawdownStart } from '../../engine/run';
import type {
  Assumptions,
  GrowthScenario,
  IncomeKind,
  WithdrawalSource,
  WithdrawalStrategy,
} from '../../engine/types';
import { useStore } from '../../state/store';
import { Group } from './Group';
import { AgeInput, DraftNumberInput, FieldRow, MoneyInput } from './inputs';
import { ScheduleControl } from './ScheduleControl';

const SOURCE_LABELS: Record<WithdrawalSource, string> = {
  cash: 'Cash',
  taxable: 'Invested taxable',
  preTax: 'Pre-tax 401k/IRA — once open',
  rothBasis: 'Roth basis — always open',
  seasonedConversions: 'Seasoned conversions',
  rothEarnings: 'Roth earnings — once open',
  hsa: 'HSA — non-medical, 65+',
};

const KIND_LABELS: Record<IncomeKind, string> = {
  partTime: 'Part-time work',
  pension: 'Pension',
  socialSecurity: 'Social Security (85% taxable)',
};

const cell =
  'rounded-md border border-neutral-300 bg-white px-1.5 py-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100';

function OrderList({
  order,
  onChange,
  hsaEligible,
}: {
  order: WithdrawalSource[];
  onChange: (order: WithdrawalSource[]) => void;
  hsaEligible: boolean;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };
  return (
    <div className="py-2" data-testid="order-list">
      <ol className="mt-1.5 space-y-1">
        {order.map((source, i) => (
          <li
            key={source}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIdx !== null) move(dragIdx, i);
              setDragIdx(null);
            }}
            className="flex cursor-grab items-center gap-2 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 active:cursor-grabbing dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
          >
            <span className="text-neutral-300 dark:text-neutral-600">⋮⋮</span>
            <span className="w-4 text-neutral-400">{i + 1}</span>
            <span className="flex-1">{SOURCE_LABELS[source]}</span>
            <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px]" aria-label={`move ${source} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
              ↑
            </Button>
            <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px]" aria-label={`move ${source} down`} disabled={i === order.length - 1} onClick={() => move(i, i + 1)}>
              ↓
            </Button>
          </li>
        ))}
      </ol>
      {hsaEligible && !order.includes('hsa') && (
        <Button
          variant="outline"
          size="sm"
          className="mt-1.5 h-7 text-xs"
          onClick={() => onChange([...order, 'hsa'])}
        >
          + add HSA (non-medical treatment is on)
        </Button>
      )}
    </div>
  );
}

export function StrategyEditor({
  a,
  g,
  w,
}: {
  a: Assumptions;
  g: GrowthScenario;
  w: WithdrawalStrategy;
}) {
  const { dispatch } = useStore();
  const patch = (p: Partial<WithdrawalStrategy>) =>
    dispatch({ type: 'patchStrategy', id: w.id, patch: p });
  const startAge = a.filers[0].currentAge;
  const autoStart = resolveDrawdownStart(a, g, { ...w, drawdownStartAge: undefined });
  // M8: fill-to-bracket offers only the ACTIVE table's bounded rates
  const fillRates = (a.bracketTables?.[a.filingStatus] ?? DEFAULT_BRACKET_TABLES[a.filingStatus]).brackets
    .filter((b) => b.upTo !== null)
    .map((b) => b.rate);

  return (
    <div>
      <Group title="When & how much" defaultOpen>
        <FieldRow
          label="Drawdown start age"
          description={`blank = auto (${autoStart}: earliest separation + 1, else the Coast target age)`}
          control={
            <DraftNumberInput
              value={w.drawdownStartAge ?? 0}
              format={(v) => (v === 0 ? '' : String(v))}
              parse={(raw) => {
                const t = raw.trim();
                if (t === '') return 0;
                const n = Number(t);
                return Number.isInteger(n) && n > 0 ? n : null;
              }}
              onCommit={(v) => patch({ drawdownStartAge: v === 0 ? undefined : v })}
              placeholder={`auto: ${autoStart}`}
              min={0}
              max={a.horizonAge}
              step={1}
              invalidMessage="whole age"
              aria-label="Drawdown start age"
            />
          }
        />
        <ScheduleControl
          label="Spending"
          description="today's dollars per retired year — drawn at the start of each year"
          rows={w.spending}
          onChange={(rows) => patch({ spending: rows })}
          startAge={startAge}
          endAge={a.horizonAge}
        />
        <ScheduleControl
          label="Medical spending (part of total)"
          description="portion of the spending above that goes to medical costs — an HSA can pay this tax-free at any age; tends to rise with age"
          rows={w.medical ?? []}
          onChange={(rows) => patch({ medical: rows })}
          startAge={startAge}
          endAge={a.horizonAge}
        />
        <div className="py-2">
          <span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-200">One-time expenses</span>
          <p className="text-xs text-neutral-500">today's dollars, indexed — a roof, a wedding, a sabbatical</p>
          {w.oneTimeExpenses.map((row, i) => (
            <div key={i} className="mt-1 flex items-center gap-1.5">
              <AgeInput
                className="w-16"
                value={row.age}
                onCommit={(v) => patch({ oneTimeExpenses: w.oneTimeExpenses.map((x, j) => (j === i ? { ...x, age: v } : x)) })}
                aria-label={`Expense ${i + 1} age`}
              />
              <MoneyInput
                className="min-w-0 flex-1"
                value={row.amount}
                min={0}
                onCommit={(v) => patch({ oneTimeExpenses: w.oneTimeExpenses.map((x, j) => (j === i ? { ...x, amount: v } : x)) })}
                aria-label={`Expense ${i + 1} amount`}
              />
              <input
                className={`${cell} w-28`}
                value={row.label}
                placeholder="label"
                onChange={(e) => patch({ oneTimeExpenses: w.oneTimeExpenses.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                aria-label={`Expense ${i + 1} label`}
              />
              <Button variant="ghost" size="sm" className="h-7 px-1.5 text-neutral-400 hover:text-red-500" aria-label={`delete expense ${i + 1}`} onClick={() => patch({ oneTimeExpenses: w.oneTimeExpenses.filter((_, j) => j !== i) })}>
                ×
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="mt-1.5 h-7 text-xs"
            onClick={() => patch({ oneTimeExpenses: [...w.oneTimeExpenses, { age: autoStart + 5, amount: 25_000, label: 'expense' }] })}
          >
            + one-time expense
          </Button>
        </div>
      </Group>

      <Group title="Retirement income" hint="offsets need — taxed (SS at 85% taxable in both modes)" defaultOpen={w.income.length > 0}>
        {w.income.map((row, i) => (
          <div key={i} className="mt-1.5 rounded-md border border-neutral-200 p-2 dark:border-neutral-800">
            <div className="flex items-center gap-1.5">
              <Select
                value={row.kind}
                onValueChange={(v) => patch({ income: w.income.map((x, j) => (j === i ? { ...x, kind: v as IncomeKind } : x)) })}
              >
                <SelectTrigger size="sm" className="w-40 bg-white text-xs dark:bg-neutral-900" aria-label={`Income ${i + 1} kind`}>
                  <SelectValue>{KIND_LABELS[row.kind].split(' (')[0]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABELS) as IncomeKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <MoneyInput
                className="min-w-0 flex-1"
                value={row.amount}
                min={0}
                onCommit={(v) => patch({ income: w.income.map((x, j) => (j === i ? { ...x, amount: v } : x)) })}
                aria-label={`Income ${i + 1} amount`}
              />
              <Button variant="ghost" size="sm" className="h-7 px-1.5 text-neutral-400 hover:text-red-500" aria-label={`delete income ${i + 1}`} onClick={() => patch({ income: w.income.filter((_, j) => j !== i) })}>
                ×
              </Button>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-neutral-400">
              from
              <AgeInput
                className="w-16"
                value={row.fromAge}
                onCommit={(v) => patch({ income: w.income.map((x, j) => (j === i ? { ...x, fromAge: v } : x)) })}
                aria-label={`Income ${i + 1} from age`}
              />
              to
              <DraftNumberInput
                className="w-16"
                value={row.toAge ?? 0}
                format={(v) => (v === 0 ? '' : String(v))}
                parse={(raw) => {
                  const t = raw.trim();
                  if (t === '' || t === '∞') return 0;
                  const n = Number(t);
                  return Number.isInteger(n) ? n : null;
                }}
                onCommit={(v) => patch({ income: w.income.map((x, j) => (j === i ? { ...x, toAge: v === 0 ? null : v } : x)) })}
                placeholder="∞"
                invalidMessage="whole age"
                aria-label={`Income ${i + 1} to age`}
              />
              <input
                className={`${cell} min-w-0 flex-1`}
                value={row.label ?? ''}
                placeholder="label"
                onChange={(e) => patch({ income: w.income.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                aria-label={`Income ${i + 1} label`}
              />
            </div>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="mt-1.5 h-7 text-xs"
          onClick={() => patch({ income: [...w.income, { kind: 'socialSecurity', fromAge: 67, toAge: null, amount: 24_000, label: 'Social Security' }] })}
        >
          + income row
        </Button>
      </Group>

      <Group
        title="Conversion ladder"
        hint="convert pre-tax → Roth during drawdown; tranches unlock at the earlier of +5 tax years or 60"
        defaultOpen={(w.ladder?.length ?? 0) > 0}
      >
        {(w.ladder ?? []).map((row, i) => (
          <div key={i} className="mt-1.5 rounded-md border border-neutral-200 p-2 dark:border-neutral-800">
            <div className="flex items-center gap-1.5">
              <Select
                value={row.amount !== undefined ? 'amount' : 'fill'}
                onValueChange={(v) =>
                  patch({
                    ladder: (w.ladder ?? []).map((x, j) =>
                      j === i
                        ? v === 'amount'
                          ? { fromAge: x.fromAge, toAge: x.toAge, amount: 20_000 }
                          : { fromAge: x.fromAge, toAge: x.toAge, fillToBracketPct: 0.12 }
                        : x,
                    ),
                  })
                }
              >
                <SelectTrigger size="sm" className="w-36 bg-white text-xs dark:bg-neutral-900" aria-label={`Ladder ${i + 1} type`}>
                  <SelectValue>{row.amount !== undefined ? 'Fixed $ / yr' : 'Fill bracket'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="amount">Fixed $ / yr (today's $)</SelectItem>
                  <SelectItem value="fill">Fill to top of a bracket</SelectItem>
                </SelectContent>
              </Select>
              {row.amount !== undefined ? (
                <MoneyInput
                  className="min-w-0 flex-1"
                  value={row.amount}
                  min={0}
                  onCommit={(v) => patch({ ladder: (w.ladder ?? []).map((x, j) => (j === i ? { ...x, amount: v } : x)) })}
                  aria-label={`Ladder ${i + 1} amount`}
                />
              ) : (
                <Select
                  value={String(row.fillToBracketPct ?? 0.12)}
                  onValueChange={(v) => patch({ ladder: (w.ladder ?? []).map((x, j) => (j === i ? { fromAge: x.fromAge, toAge: x.toAge, fillToBracketPct: Number(v) } : x)) })}
                >
                  <SelectTrigger size="sm" className="min-w-0 flex-1 bg-white text-xs dark:bg-neutral-900" aria-label={`Ladder ${i + 1} bracket`}>
                    <SelectValue>{`top of ${Math.round((row.fillToBracketPct ?? 0.12) * 100)}%`}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {fillRates.map((r) => (
                      <SelectItem key={r} value={String(r)}>{`top of the ${Math.round(r * 100)}% bracket`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button variant="ghost" size="sm" className="h-7 px-1.5 text-neutral-400 hover:text-red-500" aria-label={`delete ladder ${i + 1}`} onClick={() => patch({ ladder: (w.ladder ?? []).filter((_, j) => j !== i) })}>
                ×
              </Button>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-neutral-400">
              from
              <AgeInput className="w-16" value={row.fromAge} onCommit={(v) => patch({ ladder: (w.ladder ?? []).map((x, j) => (j === i ? { ...x, fromAge: v } : x)) })} aria-label={`Ladder ${i + 1} from age`} />
              to
              <DraftNumberInput
                className="w-16"
                value={row.toAge ?? 0}
                format={(v) => (v === 0 ? '' : String(v))}
                parse={(raw) => {
                  const t = raw.trim();
                  if (t === '') return 0;
                  const n = Number(t);
                  return Number.isInteger(n) && n > 0 ? n : null;
                }}
                onCommit={(v) => patch({ ladder: (w.ladder ?? []).map((x, j) => (j === i ? { ...x, toAge: v === 0 ? null : v } : x)) })}
                placeholder="∞"
                invalidMessage="whole age"
                aria-label={`Ladder ${i + 1} to age`}
              />
              {row.toAge !== null && row.fromAge > row.toAge && (
                <span className="text-amber-700 dark:text-amber-400">from &gt; to — this row converts nothing</span>
              )}
              {row.fillToBracketPct !== undefined && a.taxMode !== 'bracket' && (
                <span className="text-amber-700 dark:text-amber-400">fill-to-bracket needs bracket mode — this row is skipped</span>
              )}
            </div>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="mt-1.5 h-7 text-xs"
          onClick={() => {
            // M9.1 #2: default from = the RESOLVED drawdown start (never an
            // inert 90/59 pair); fill-to-12% by default in bracket mode
            const from = w.drawdownStartAge ?? autoStart;
            const base = { fromAge: from, toAge: 59 as number | null };
            patch({
              ladder: [
                ...(w.ladder ?? []),
                a.taxMode === 'bracket' ? { ...base, fillToBracketPct: 0.12 } : { ...base, amount: 20_000 },
              ],
            });
          }}
        >
          + conversion row
        </Button>
        <p className="mt-1 text-xs text-neutral-500">
          tax comes from cash, then taxable; with neither left it's withheld from the conversion
          (10% penalty before 60)
        </p>
      </Group>

      <Group title="Withdrawal order" hint="drag to reorder — sources are skipped until their access age opens" defaultOpen>
        <OrderList
          order={w.order}
          onChange={(order) => patch({ order })}
          hsaEligible={a.hsaTreatment === 'nonMedical'}
        />
      </Group>
    </div>
  );
}
