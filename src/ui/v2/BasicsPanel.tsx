/**
 * Basics tier (M4.5 D.2): everything a first-time user needs for a sensible
 * chart in under a minute — age, balances, one contribution per account with
 * "until age", salary and match, return, inflation, FIRE spending target.
 * Everything writes into the same PersistedState the Advanced tier edits.
 */

import { Switch } from '@/components/ui/switch';
import type { Assumptions, GrowthScenario } from '../../engine/types';
import { useStore } from '../../state/store';
import { Group } from './Group';
import { AgeInput, FieldRow, HintCard, MoneyInput, PercentInput } from './inputs';
import { ScheduleControl } from './ScheduleControl';

export function BasicsPanel({ a, g }: { a: Assumptions; g: GrowthScenario }) {
  const { state, dispatch } = useStore();
  // M4.5 item 4: same collapsible sections as Advanced, collapse persisted
  const collapsed = new Set(state.display.basicsCollapsed ?? []);
  const section = (id: string) => ({
    open: !collapsed.has(id),
    onOpenChange: (open: boolean) => {
      const next = new Set(collapsed);
      if (open) next.delete(id);
      else next.add(id);
      dispatch({ type: 'patchDisplay', patch: { basicsCollapsed: [...next] } });
    },
  });
  const patchA = (patch: Partial<Assumptions>) => dispatch({ type: 'patchAssumptions', patch });
  const patchG = (patch: Partial<GrowthScenario>) =>
    dispatch({ type: 'patchScenario', id: g.id, patch });
  const pf = g.perFiler[0];
  const patchPf = (p: Partial<typeof pf>) =>
    patchG({ perFiler: g.perFiler.map((x, i) => (i === 0 ? { ...x, ...p } : x)) });
  const b = a.balances.perFiler[0];
  const patchB = (p: Partial<typeof b>) =>
    patchA({
      balances: {
        ...a.balances,
        perFiler: a.balances.perFiler.map((x, i) => (i === 0 ? { ...x, ...p } : x)),
      },
    });
  const startAge = a.filers[0].currentAge;
  const noMoney =
    b.trad401k + b.rothIra.basis + b.rothIra.earnings + a.balances.taxable + a.balances.cash === 0;

  return (
    <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
      <FieldRow
        label="Your age"
        control={
          <AgeInput
            value={startAge}
            min={18}
            max={90}
            onCommit={(v) => patchA({ filers: a.filers.map((f, i) => (i === 0 ? { currentAge: v } : f)) })}
            aria-label="Your age"
          />
        }
      />

      <Group title="Balances today" hint="what's already saved, per account" {...section('balances')}>
        <FieldRow label="Traditional 401k" control={<MoneyInput value={b.trad401k} min={0} onCommit={(v) => patchB({ trad401k: v })} aria-label="Traditional 401k balance" />} />
        <FieldRow
          label="Roth IRA"
          description="entered as contribution basis — split conversions and earnings in Advanced"
          control={
            <MoneyInput
              value={b.rothIra.basis}
              min={0}
              onCommit={(v) => patchB({ rothIra: { ...b.rothIra, basis: v } })}
              aria-label="Roth IRA balance"
            />
          }
        />
        <FieldRow label="HSA" control={<MoneyInput value={b.hsa} min={0} onCommit={(v) => patchB({ hsa: v })} aria-label="HSA balance" />} />
        <FieldRow
          label="Invested taxable"
          control={
            <MoneyInput
              value={a.balances.taxable}
              min={0}
              // M6.2 #1: a balance edit NEVER touches the basis — basis is
              // explicit entry in Advanced, with a stated assumption when empty
              onCommit={(v) => patchA({ balances: { ...a.balances, taxable: v } })}
              aria-label="Invested taxable balance"
            />
          }
        />
        <FieldRow label="Cash" control={<MoneyInput value={a.balances.cash} min={0} onCommit={(v) => patchA({ balances: { ...a.balances, cash: v } })} aria-label="Cash balance" />} />
      </Group>

      <Group title="Contributions" hint="per year, today's dollars — plus salary and match" {...section('contributions')}>
        <ScheduleControl
          label="401k"
          description="traditional by default — Roth split in Advanced"
          rows={pf.contrib401k}
          onChange={(rows) => patchPf({ contrib401k: rows })}
          startAge={startAge}
          endAge={a.horizonAge}
          limit={{ value: a.limits.deferral401k, label: '2026 401k limit' }}
        />
        <ScheduleControl
          label="IRA"
          description="Roth by default — split and backdoor in Advanced"
          rows={pf.contribIra}
          onChange={(rows) => patchPf({ contribIra: rows })}
          startAge={startAge}
          endAge={a.horizonAge}
          limit={{ value: a.limits.ira, label: '2026 IRA limit' }}
        />
        <ScheduleControl
          label="HSA"
          rows={g.hsaContrib}
          onChange={(rows) => patchG({ hsaContrib: rows })}
          startAge={startAge}
          endAge={a.horizonAge}
          limit={{
            value: a.hsaCoverage === 'family' ? a.limits.hsaFamily : a.limits.hsaSelfOnly,
            label: `2026 HSA ${a.hsaCoverage === 'family' ? 'family' : 'self-only'} limit`,
          }}
        />
        <ScheduleControl
          label="Invested taxable"
          rows={g.taxableContrib}
          onChange={(rows) => patchG({ taxableContrib: rows })}
          startAge={startAge}
          endAge={a.horizonAge}
        />
        <ScheduleControl
          label="Cash"
          rows={g.cashContrib}
          onChange={(rows) => patchG({ cashContrib: rows })}
          startAge={startAge}
          endAge={a.horizonAge}
        />
        <ScheduleControl
          label="Salary"
          rows={pf.salary}
          onChange={(rows) => patchPf({ salary: rows })}
          startAge={startAge}
          endAge={a.horizonAge}
        />
        <FieldRow
          label="Employer match"
          description={`${Math.round(pf.match.rate * 100)}¢ per $1, up to ${Math.round(pf.match.capPctOfSalary * 100)}% of salary`}
          control={
            <div className="flex gap-1.5">
              <PercentInput value={pf.match.rate} onCommit={(v) => patchPf({ match: { ...pf.match, rate: v } })} aria-label="Match rate" className="min-w-0 flex-1" />
              <PercentInput value={pf.match.capPctOfSalary} onCommit={(v) => patchPf({ match: { ...pf.match, capPctOfSalary: v } })} aria-label="Match cap" className="min-w-0 flex-1" />
            </div>
          }
          controlWidth="w-[9.5rem]"
        />
      </Group>

      <Group title="Economy" hint="return and inflation" {...section('economy')}>
        <ScheduleControl
          label="Investment return"
          description="one flat rate; use “Lower to…” to step it down at an age — cash keeps its own return"
          rows={a.returnSchedule}
          onChange={(rows) => patchA({ returnSchedule: rows })}
          startAge={startAge}
          endAge={a.horizonAge}
          unit="percent"
        />
        <FieldRow
          label="Inflation"
          description="also indexes schedules and IRS limits"
          control={
            <div className="flex items-center gap-2">
              <PercentInput value={a.inflation} onCommit={(v) => patchA({ inflation: v })} aria-label="Inflation" className="min-w-0 flex-1" />
              <Switch
                checked={a.indexWithInflation}
                onCheckedChange={(v) => patchA({ indexWithInflation: v })}
                aria-label="Index with inflation"
              />
            </div>
          }
        />
      </Group>

      <Group title="FIRE target" hint="powers the FIRE metrics and the hero readout" {...section('fire')}>
        <FieldRow
          label="FIRE spending target"
          description="what a retired year costs, today's dollars"
          control={<MoneyInput value={a.fireSpendingTarget} min={0} onCommit={(v) => patchA({ fireSpendingTarget: v })} aria-label="FIRE spending target" />}
        />
      </Group>

      {noMoney && (
        <HintCard>
          <span className="font-medium text-neutral-700 dark:text-neutral-300">Start here.</span> Add a
          balance and a contribution and the chart fills in live. Everything else has a sensible
          default — refine in Advanced whenever you like.
        </HintCard>
      )}
      {!noMoney && a.balances.cash === 0 && (
        <HintCard>
          <span className="font-medium text-neutral-700 dark:text-neutral-300">Nothing in cash yet.</span>{' '}
          Cash earns its own {(Math.round((a.returnOverrides.cash?.[0]?.value ?? 0.04) * 1000) / 10).toFixed(1)}% return, taxed
          every year — it funds the first bridge years in Drawdown.
        </HintCard>
      )}
    </div>
  );
}
