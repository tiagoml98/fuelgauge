/**
 * Advanced tier (M4.5 D.2): filers, full balances (Roth sub-balances,
 * bases, conversions), include toggles, limits, taxes, horizon & targets,
 * plan toggles, access overrides, per-filer splits/backdoor/match detail,
 * windfalls, scenario return override — collapsed groups, quiet by default.
 */

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useMemo, type ReactNode } from 'react';
import { DEFAULT_BRACKET_TABLES } from '../../engine/defaults';
import { coastFireAge } from '../../engine/metrics';
import { toReal } from '../../engine/schedule';
import type {
  AccountId,
  Assumptions,
  BracketRow,
  BracketTable,
  EmployerMatch,
  FilerGrowthInputs,
  GrowthScenario,
  LimitSet,
  Windfall,
} from '../../engine/types';
import { useStore } from '../../state/store';
import { ACCOUNT_LABELS, ACCOUNT_ORDER } from '../theme/colors';
import { Group } from './Group';
import { AgeInput, BasisField, DraftNumberInput, FieldRow, fmtMoney0, MoneyInput, PercentInput } from './inputs';
import { ScheduleControl } from './ScheduleControl';

const YearInput = ({ value, onCommit, label }: { value: number | null; onCommit: (v: number | null) => void; label: string }) => (
  <DraftNumberInput
    value={value ?? 0}
    format={(v) => (v === 0 ? '' : String(v))}
    parse={(raw) => {
      const t = raw.trim();
      if (t === '') return 0;
      const n = Number(t.replaceAll(',', ''));
      return Number.isInteger(n) && n > 1900 ? n : null;
    }}
    onCommit={(v) => onCommit(v === 0 ? null : v)}
    placeholder="auto"
    invalidMessage="4-digit year"
    aria-label={label}
  />
);

/**
 * M6.3 #3: real section hierarchy — eyebrow header (small caps, no divider),
 * one-line intro, groups nested by indent, wide inter-section spacing.
 */
function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-7 first:mt-1" data-testid={id}>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
        {title}
      </h2>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{intro}</p>
      <div className="mt-1 pl-3">{children}</div>
    </section>
  );
}

/** M6.3 #2: "label · −Δ → v · now → v · +Δ → v" — field-hint scale, no box. */
function SensitivityRow({
  label,
  cells,
  testid,
}: {
  label: string;
  cells: Array<{ k: string; v: string; now?: boolean }>;
  testid: string;
}) {
  return (
    <p
      className="flex flex-wrap items-baseline gap-x-1.5 py-1 text-xs text-neutral-500 dark:text-neutral-400"
      data-testid={testid}
    >
      <span>{label}</span>
      {cells.map((c, i) => (
        <span key={c.k} className="tnum whitespace-nowrap">
          {i > 0 && <span className="mr-1.5 text-neutral-300 dark:text-neutral-600">·</span>}
          {c.k} →{' '}
          <span className={c.now ? 'font-medium text-neutral-800 dark:text-neutral-200' : ''}>
            {c.v}
          </span>
        </span>
      ))}
    </p>
  );
}

/**
 * M7: editable deduction + brackets for the ACTIVE filing status (the other
 * status keeps its own table in state). Bounds are TAXABLE-income tops
 * (after the deduction); blank upTo = top bracket. Defaults = 2026 federal;
 * editing materializes the tables into state, reset returns to defaults.
 */
function BracketEditor({
  a,
  patchA,
}: {
  a: Assumptions;
  patchA: (patch: Partial<Assumptions>) => void;
}) {
  const table = a.bracketTables?.[a.filingStatus] ?? DEFAULT_BRACKET_TABLES[a.filingStatus];
  const patchTable = (next: BracketTable) =>
    patchA({
      bracketTables: {
        ...DEFAULT_BRACKET_TABLES,
        ...a.bracketTables,
        [a.filingStatus]: next,
      },
    });
  const patchBracket = (i: number, p: Partial<BracketRow>) =>
    patchTable({ ...table, brackets: table.brackets.map((b, j) => (j === i ? { ...b, ...p } : b)) });

  return (
    <div className="py-2" data-testid="bracket-editor">
      <span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-200">
        Brackets — {a.filingStatus === 'single' ? 'single' : 'married filing jointly'}
      </span>
      <p className="text-xs text-neutral-500">
        taxable-income tops (after the deduction), indexed with inflation; state rate rides on top of every bracket
      </p>
      <FieldRow
        label="Standard deduction"
        control={<MoneyInput value={table.standardDeduction} min={0} onCommit={(v) => patchTable({ ...table, standardDeduction: v })} aria-label="Standard deduction" />}
      />
      {table.brackets.map((b, i) => (
        <div key={i} className="mt-1 flex items-center gap-1.5">
          <PercentInput className="w-20" value={b.rate} onCommit={(v) => patchBracket(i, { rate: v })} aria-label={`Bracket ${i + 1} rate`} />
          <span className="text-xs text-neutral-400">up to</span>
          <DraftNumberInput
            className="min-w-0 flex-1"
            value={b.upTo ?? 0}
            format={(v) => (v === 0 ? '' : v.toLocaleString('en-US'))}
            parse={(raw) => {
              const t = raw.replaceAll(',', '').trim();
              if (t === '') return 0;
              const n = Number(t);
              return Number.isFinite(n) && n > 0 ? n : null;
            }}
            onCommit={(v) => patchBracket(i, { upTo: v === 0 ? null : v })}
            placeholder="top bracket"
            invalidMessage="amount"
            aria-label={`Bracket ${i + 1} up to`}
          />
          <Button variant="ghost" size="sm" className="h-7 px-1.5 text-neutral-400 hover:text-red-500" aria-label={`delete bracket ${i + 1}`} onClick={() => patchTable({ ...table, brackets: table.brackets.filter((_, j) => j !== i) })}>
            ×
          </Button>
        </div>
      ))}
      <div className="mt-1.5 flex gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            const last = table.brackets[table.brackets.length - 1];
            patchTable({ ...table, brackets: [...table.brackets, { upTo: null, rate: (last?.rate ?? 0.3) + 0.02 }] });
          }}
        >
          + bracket
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => patchA({ bracketTables: undefined })}
          disabled={a.bracketTables === undefined}
        >
          reset to current federal
        </Button>
      </div>
    </div>
  );
}

export function AdvancedPanel({ a, g }: { a: Assumptions; g: GrowthScenario }) {
  const { dispatch } = useStore();
  const patchA = (patch: Partial<Assumptions>) => dispatch({ type: 'patchAssumptions', patch });
  const patchG = (patch: Partial<GrowthScenario>) => dispatch({ type: 'patchScenario', id: g.id, patch });
  const patchPf = (f: number, p: Partial<FilerGrowthInputs>) =>
    patchG({ perFiler: g.perFiler.map((x, i) => (i === f ? { ...x, ...p } : x)) });
  const patchMatch = (f: number, p: Partial<EmployerMatch>) =>
    patchPf(f, { match: { ...g.perFiler[f].match, ...p } });
  const patchB = (f: number, p: Partial<Assumptions['balances']['perFiler'][number]>) =>
    patchA({
      balances: { ...a.balances, perFiler: a.balances.perFiler.map((x, i) => (i === f ? { ...x, ...p } : x)) },
    });
  const startAge = a.filers[0].currentAge;
  const cashReturn = a.returnOverrides.cash?.[0]?.value ?? 0.04;

  // M6.2 #3 / M6.3 #2: live sensitivity on the two biggest levers, rendered
  // as compact cell rows directly under the fields they describe
  const sensitivity = useMemo(() => {
    const shifted = (delta: number) => ({
      ...a,
      returnSchedule: a.returnSchedule.map((r) => ({ ...r, value: r.value + delta })),
    });
    let coast: { down: number; base: number; up: number } | null = null;
    try {
      const base = coastFireAge(a, g);
      const up = coastFireAge(shifted(0.01), g);
      const down = coastFireAge(shifted(-0.01), g);
      if (base !== null && up !== null && down !== null) coast = { down, base, up };
    } catch {
      coast = null; // no FIRE target / unreachable — nothing honest to say
    }
    // traditional's edge over Roth on rates alone: (1 − t_ret) ÷ (1 − t_now) − 1
    const edge = (delta: number) => {
      const r = (1 - (a.effectiveRetirementRate + delta + a.stateTaxRate)) / (1 - a.marginalRateNow) - 1;
      return `${r >= 0 ? '+' : '−'}${Math.abs(Math.round(r * 1000) / 10)}%`;
    };
    return { coast, edge: { down: edge(-0.05), base: edge(0), up: edge(0.05) } };
  }, [a, g]);

  return (
    <div>
      <Section id="section-details" title="Your details" intro="who's filing, what you already hold, and how it's being fed">
      <Group title="Filers & filing" defaultOpen={a.filers.length > 1}>
        <FieldRow
          label="Filers"
          control={
            <Select
              value={String(a.filers.length)}
              onValueChange={(v) => dispatch({ type: 'setFilerCount', count: Number(v) as 1 | 2 })}
            >
              <SelectTrigger size="sm" className="w-full bg-white dark:bg-neutral-900" aria-label="Filers"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">One</SelectItem>
                <SelectItem value="2">Two</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        {a.filers.length === 2 && (
          <FieldRow
            label="Filer 2 age"
            control={<AgeInput value={a.filers[1].currentAge} min={18} max={90} onCommit={(v) => patchA({ filers: a.filers.map((f, i) => (i === 1 ? { currentAge: v } : f)) })} aria-label="Filer 2 age" />}
          />
        )}
        {a.filers.length === 2 && a.hsaCoverage === 'selfOnly' && (
          <FieldRow
            label="HSA coverage"
            warning="two filers — switch HSA coverage to family?"
            control={
              <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => patchA({ hsaCoverage: 'family' })}>
                switch to family
              </Button>
            }
          />
        )}
        <FieldRow
          label="Filing status"
          control={
            <Select value={a.filingStatus} onValueChange={(v) => patchA({ filingStatus: v as Assumptions['filingStatus'] })}>
              <SelectTrigger size="sm" className="w-full bg-white dark:bg-neutral-900"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single</SelectItem>
                <SelectItem value="marriedJoint">Married filing jointly</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <FieldRow label="State tax rate" description="flat, added to every federal rate" control={<PercentInput value={a.stateTaxRate} onCommit={(v) => patchA({ stateTaxRate: v })} aria-label="State tax rate" />} />
        <FieldRow label="Current calendar year" control={<DraftNumberInput value={a.currentYear} format={String} onCommit={(v) => patchA({ currentYear: v })} min={2020} max={2100} aria-label="Current calendar year" />} />
      </Group>

      {a.balances.perFiler.map((b, f) => (
        <Group key={f} title={a.filers.length > 1 ? `Detailed balances — filer ${f + 1}` : 'Detailed balances'} hint="bases, Roth sub-balances, conversions">
          <FieldRow label="Traditional IRA" control={<MoneyInput value={b.tradIra} min={0} onCommit={(v) => patchB(f, { tradIra: v })} aria-label={`Filer ${f + 1} Traditional IRA`} />} />
          <FieldRow
            label="Trad IRA nondeductible basis"
            description="Form 8606 basis — explicit entry, never auto-filled; empty = none: withdrawals fully taxable"
            controlWidth="w-[12rem]"
            control={
              <BasisField
                value={b.tradIraBasis}
                balance={b.tradIra}
                assumption="withdrawals fully taxable"
                placeholder="not entered"
                chipId={`basis-chip-tradira-${f}`}
                label={`Filer ${f + 1} trad IRA basis`}
                onCommit={(v) => patchB(f, { tradIraBasis: v })}
                onClear={() => patchB(f, { tradIraBasis: undefined })}
              />
            }
          />
          <FieldRow label="Roth 401k" control={<MoneyInput value={b.roth401k} min={0} onCommit={(v) => patchB(f, { roth401k: v })} aria-label={`Filer ${f + 1} Roth 401k`} />} />
          <FieldRow
            label="Roth 401k contribution basis"
            description="explicit entry, never auto-filled; empty = full balance counts as earnings (conservative)"
            controlWidth="w-[12rem]"
            control={
              <BasisField
                value={b.roth401kBasis}
                balance={b.roth401k}
                assumption="full balance counts as earnings (conservative)"
                placeholder="not entered"
                chipId={`basis-chip-roth401k-${f}`}
                label={`Filer ${f + 1} Roth 401k basis`}
                onCommit={(v) => patchB(f, { roth401kBasis: v })}
                onClear={() => patchB(f, { roth401kBasis: undefined })}
              />
            }
          />
          {f > 0 && (
            <FieldRow label="Traditional 401k" control={<MoneyInput value={b.trad401k} min={0} onCommit={(v) => patchB(f, { trad401k: v })} aria-label={`Filer ${f + 1} Traditional 401k`} />} />
          )}
          <FieldRow label="Roth IRA earnings" description="locked until 59½ + the 5-year clock" control={<MoneyInput value={b.rothIra.earnings} min={0} onCommit={(v) => patchB(f, { rothIra: { ...b.rothIra, earnings: v } })} aria-label={`Filer ${f + 1} Roth IRA earnings`} />} />
          <FieldRow label="Roth IRA first-funded year" description="blank = first modeled funding starts the clock" control={<YearInput value={b.rothIra.firstFundedYear} onCommit={(v) => patchB(f, { rothIra: { ...b.rothIra, firstFundedYear: v } })} label={`Filer ${f + 1} Roth first-funded year`} />} />
          <div className="py-2">
            <span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-200">Roth conversions</span>
            <p className="text-xs text-neutral-500">year · amount · taxable portion (seasoned 5 tax years)</p>
            {b.rothIra.conversions.map((c, ci) => (
              <div key={ci} className="mt-1 flex items-center gap-1.5">
                <DraftNumberInput className="w-20" value={c.year} format={String} onCommit={(v) => patchB(f, { rothIra: { ...b.rothIra, conversions: b.rothIra.conversions.map((x, j) => (j === ci ? { ...x, year: v } : x)) } })} aria-label={`Conversion ${ci + 1} year`} />
                <MoneyInput className="min-w-0 flex-1" value={c.amount} min={0} onCommit={(v) => patchB(f, { rothIra: { ...b.rothIra, conversions: b.rothIra.conversions.map((x, j) => (j === ci ? { ...x, amount: v } : x)) } })} aria-label={`Conversion ${ci + 1} amount`} />
                <MoneyInput className="min-w-0 flex-1" value={c.taxablePortion} min={0} onCommit={(v) => patchB(f, { rothIra: { ...b.rothIra, conversions: b.rothIra.conversions.map((x, j) => (j === ci ? { ...x, taxablePortion: v } : x)) } })} aria-label={`Conversion ${ci + 1} taxable portion`} />
                <Button variant="ghost" size="sm" className="h-7 px-1.5 text-neutral-400 hover:text-red-500" aria-label={`delete conversion ${ci + 1}`} onClick={() => patchB(f, { rothIra: { ...b.rothIra, conversions: b.rothIra.conversions.filter((_, j) => j !== ci) } })}>×</Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="mt-1.5 h-7 text-xs" onClick={() => patchB(f, { rothIra: { ...b.rothIra, conversions: [...b.rothIra.conversions, { year: a.currentYear - 1, amount: 0, taxablePortion: 0 }] } })}>
              + conversion
            </Button>
          </div>
        </Group>
      ))}

      <Group title="Household basis & accounts">
        <FieldRow
          label="Invested taxable cost basis"
          description="explicit entry, never auto-filled; empty = basis equals balance: no embedded gains, optimistic. The model grows the entered basis with contributions and reinvested dividends"
          controlWidth="w-[12rem]"
          control={
            <BasisField
              value={a.balances.taxableBasis}
              balance={a.balances.taxable}
              assumption="modeled as basis = balance (no embedded gains, optimistic)"
              placeholder="not entered"
              chipId="basis-chip-taxable"
              label="Taxable cost basis"
              onCommit={(v) => patchA({ balances: { ...a.balances, taxableBasis: v } })}
              onClear={() => patchA({ balances: { ...a.balances, taxableBasis: undefined } })}
            />
          }
        />
        <div className="py-2">
          <span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-200">Include accounts</span>
          {ACCOUNT_ORDER.map((id) => (
            <label key={id} className="mt-1.5 flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400">
              {ACCOUNT_LABELS[id]}
              <Switch checked={a.include[id]} onCheckedChange={(v) => patchA({ include: { ...a.include, [id]: v } })} aria-label={`Include ${ACCOUNT_LABELS[id]}`} />
            </label>
          ))}
        </div>
      </Group>

      {g.perFiler.map((pf, f) => (
        <Group key={f} title={a.filers.length > 1 ? `Contribution detail — filer ${f + 1}` : 'Contribution detail'} hint="splits, backdoor, match destination & vesting, separation">
          {f > 0 && (
            <>
              <ScheduleControl label="Salary" rows={pf.salary} onChange={(rows) => patchPf(f, { salary: rows })} startAge={a.filers[f].currentAge} endAge={a.filers[f].currentAge + (a.horizonAge - startAge)} />
              <ScheduleControl label="401k contributions" rows={pf.contrib401k} onChange={(rows) => patchPf(f, { contrib401k: rows })} startAge={a.filers[f].currentAge} endAge={a.filers[f].currentAge + (a.horizonAge - startAge)} limit={{ value: a.limits.deferral401k, label: '2026 401k limit' }} />
              <ScheduleControl label="IRA contributions" rows={pf.contribIra} onChange={(rows) => patchPf(f, { contribIra: rows })} startAge={a.filers[f].currentAge} endAge={a.filers[f].currentAge + (a.horizonAge - startAge)} limit={{ value: a.limits.ira, label: '2026 IRA limit' }} />
            </>
          )}
          <FieldRow label="401k share to Roth" control={<PercentInput value={pf.split401kRothPct} onCommit={(v) => patchPf(f, { split401kRothPct: v })} aria-label={`Filer ${f + 1} 401k Roth share`} />} />
          <FieldRow label="IRA share to Roth" control={<PercentInput value={pf.splitIraRothPct} onCommit={(v) => patchPf(f, { splitIraRothPct: v })} aria-label={`Filer ${f + 1} IRA Roth share`} />} />
          <FieldRow
            label="Traditional IRA deductible"
            control={
              <Select
                value={pf.tradIraDeductible === undefined ? 'auto' : pf.tradIraDeductible ? 'yes' : 'no'}
                onValueChange={(v) => patchPf(f, { tradIraDeductible: v === 'auto' ? undefined : v === 'yes' })}
              >
                <SelectTrigger size="sm" className="w-full bg-white dark:bg-neutral-900">
                  <SelectValue>
                    {pf.tradIraDeductible === undefined ? 'Auto' : pf.tradIraDeductible ? 'Yes' : 'No'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto — no if a 401k schedule exists</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No — tracked as basis</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <FieldRow label="Backdoor Roth" description="IRA contribution converts immediately, never locked" control={<Switch checked={pf.backdoor} onCheckedChange={(v) => patchPf(f, { backdoor: v })} aria-label={`Filer ${f + 1} backdoor`} />} controlWidth="w-fit" />
          <FieldRow
            label="Match destination"
            control={
              <Select value={pf.match.destination} onValueChange={(v) => patchMatch(f, { destination: v as EmployerMatch['destination'] })}>
                <SelectTrigger size="sm" className="w-full bg-white dark:bg-neutral-900"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trad401k">Traditional 401k</SelectItem>
                  <SelectItem value="roth401k">Roth 401k — counts as basis</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <FieldRow
            label="Match mode"
            control={
              <Select value={pf.match.mode} onValueChange={(v) => patchMatch(f, { mode: v as EmployerMatch['mode'] })}>
                <SelectTrigger size="sm" className="w-full bg-white dark:bg-neutral-900">
                  <SelectValue>{pf.match.mode === 'percent' ? 'Percent of deferral' : 'Flat dollars'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percent of deferral, up to a salary cap</SelectItem>
                  <SelectItem value="flat">Flat dollars — pays even with no deferral</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          {pf.match.mode === 'flat' && (
            <FieldRow label="Flat match" control={<MoneyInput value={pf.match.flatAmount} min={0} onCommit={(v) => patchMatch(f, { flatAmount: v })} aria-label={`Filer ${f + 1} flat match`} />} />
          )}
          <FieldRow label="Match vesting" description="unvested fraction dropped at separation" control={<PercentInput value={pf.match.vestingPct} onCommit={(v) => patchMatch(f, { vestingPct: v })} aria-label={`Filer ${f + 1} vesting`} />} />
          <FieldRow
            label="Separation age override"
            description="blank = auto: last age with salary"
            warning={
              pf.separationAgeOverride !== undefined &&
              pf.salary.some((r) => r.value > 0 && (r.toAge === null || r.toAge > (pf.separationAgeOverride ?? 0)))
                ? `salary continues after separation — match and contributions after ${pf.separationAgeOverride} still apply`
                : undefined
            }
            control={
              <DraftNumberInput
                value={pf.separationAgeOverride ?? 0}
                format={(v) => (v === 0 ? '' : String(v))}
                parse={(raw) => {
                  const t = raw.trim();
                  if (t === '') return 0;
                  const n = Number(t);
                  return Number.isInteger(n) && n > 0 ? n : null;
                }}
                onCommit={(v) => patchPf(f, { separationAgeOverride: v === 0 ? undefined : v })}
                placeholder="auto"
                invalidMessage="whole age"
                aria-label={`Filer ${f + 1} separation override`}
              />
            }
          />
        </Group>
      ))}

      <Group title="Windfalls" hint="one-time amounts that land, in that year's dollars">
        {g.windfalls.map((w, i) => {
          const patchW = (p: Partial<Windfall>) => patchG({ windfalls: g.windfalls.map((x, j) => (j === i ? { ...x, ...p } : x)) });
          return (
            <div key={i} className="mt-1.5 rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
              <div className="flex items-center gap-1.5">
                <AgeInput className="w-16" value={w.age} onCommit={(v) => patchW({ age: v })} aria-label={`Windfall ${i + 1} age`} />
                <MoneyInput className="min-w-0 flex-1" value={w.amount} min={0} onCommit={(v) => patchW({ amount: v })} aria-label={`Windfall ${i + 1} amount`} />
                <Select value={w.target} onValueChange={(v) => patchW({ target: v as AccountId })}>
                  <SelectTrigger size="sm" className="w-32 bg-white text-xs dark:bg-neutral-900"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_ORDER.map((id) => (
                      <SelectItem key={id} value={id}>{ACCOUNT_LABELS[id]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {a.filers.length > 1 && (
                  <Select value={String(w.filer ?? 0)} onValueChange={(v) => patchW({ filer: Number(v) })}>
                    <SelectTrigger size="sm" className="w-20 bg-white text-xs dark:bg-neutral-900"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">filer 1</SelectItem>
                      <SelectItem value="1">filer 2</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <Button variant="ghost" size="sm" className="h-7 px-1.5 text-neutral-400 hover:text-red-500" aria-label={`delete windfall ${i + 1}`} onClick={() => patchG({ windfalls: g.windfalls.filter((_, j) => j !== i) })}>×</Button>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <input
                  className="w-40 rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  value={w.label}
                  placeholder="label (shows on the chart)"
                  onChange={(e) => patchW({ label: e.target.value })}
                  aria-label={`Windfall ${i + 1} label`}
                />
                <span className="text-[11px] text-neutral-400">≈ {fmtMoney0(toReal(w.amount, Math.max(0, w.age - startAge), a.inflation))} today</span>
              </div>
            </div>
          );
        })}
        <Button variant="outline" size="sm" className="mt-1.5 h-7 text-xs" onClick={() => patchG({ windfalls: [...g.windfalls, { age: startAge + 2, amount: 100_000, target: 'taxable', label: 'windfall' }] })}>
          + windfall
        </Button>
      </Group>
      </Section>

      {/* M6.2 #3 / M6.3: the levers that move the answer, separated from reference data */}
      <Section id="section-levers" title="Assumptions worth questioning" intro="the handful of numbers that move the answer — question these before trusting any result">
      <Group title="Returns & fees">
        <ScheduleControl
          label="Investment return"
          description="every point compounds over the whole horizon — the single biggest lever (also editable in Basics)"
          rows={a.returnSchedule}
          onChange={(rows) => patchA({ returnSchedule: rows })}
          startAge={startAge}
          endAge={a.horizonAge}
          unit="percent"
        />
        {sensitivity.coast && (
          <SensitivityRow
            testid="sensitivity-return"
            label="Coast FIRE if the return is…"
            cells={[
              { k: '−1%', v: String(sensitivity.coast.down) },
              { k: 'now', v: String(sensitivity.coast.base), now: true },
              { k: '+1%', v: String(sensitivity.coast.up) },
            ]}
          />
        )}
        <FieldRow label="Cash return" description="cash always uses its own return — never fees, never overrides" control={<PercentInput value={cashReturn} onCommit={(v) => patchA({ returnOverrides: { ...a.returnOverrides, cash: [{ fromAge: 0, toAge: null, value: v }] } })} aria-label="Cash return" />} />
        <FieldRow label="Fees / expense ratio" description="acts exactly like a return cut — 1% of fees cancels 1% of return, forever" control={<PercentInput value={a.fees} onCommit={(v) => patchA({ fees: v })} aria-label="Fees" />} />
        <FieldRow label="Dividend yield" description="taxable drag; after-tax dividends become cost basis" control={<PercentInput value={a.dividendYield} onCommit={(v) => patchA({ dividendYield: v })} aria-label="Dividend yield" />} />
        <FieldRow label="Dividend tax rate" control={<PercentInput value={a.dividendTaxRate} onCommit={(v) => patchA({ dividendTaxRate: v })} aria-label="Dividend tax rate" />} />
        <div className="py-2">
          <span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-200">Scenario return override</span>
          <p className="text-xs text-neutral-500">replaces the global schedule for ALL invested accounts (bear/stress scenarios)</p>
          {g.returnScheduleOverride ? (
            <>
              <ScheduleControl label="Override" rows={g.returnScheduleOverride} onChange={(rows) => patchG({ returnScheduleOverride: rows })} startAge={startAge} endAge={a.horizonAge} unit="percent" />
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => patchG({ returnScheduleOverride: undefined })}>remove override</Button>
            </>
          ) : (
            <Button variant="outline" size="sm" className="mt-1.5 h-7 text-xs" onClick={() => patchG({ returnScheduleOverride: [{ fromAge: 0, toAge: null, value: 0.05 }] })}>
              add override
            </Button>
          )}
        </div>
      </Group>

      <Group title="Taxes">
        <FieldRow
          label="Tax mode"
          description={a.taxMode === 'bracket' ? 'brackets compute each year’s actual tax — the effective rate becomes an output; the computed rate appears in the Drawdown tab’s rate panel and the chart readout' : 'flat rates everywhere'}
          control={
            <Select value={a.taxMode} onValueChange={(v) => patchA({ taxMode: v as Assumptions['taxMode'] })}>
              <SelectTrigger size="sm" className="w-full bg-white dark:bg-neutral-900" aria-label="Tax mode">
                <SelectValue>{a.taxMode === 'bracket' ? 'Bracket' : 'Simple (flat rates)'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">Simple (flat rates)</SelectItem>
                <SelectItem value="bracket">Bracket — deduction + brackets, indexed</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <FieldRow label="Marginal rate now" description="prices every deferred dollar today — the traditional side of the rate arbitrage" control={<PercentInput value={a.marginalRateNow} onCommit={(v) => patchA({ marginalRateNow: v })} aria-label="Marginal rate" />} />
        {a.taxMode === 'simple' && (
          <>
            <FieldRow label="Effective retirement rate" description="prices every pre-tax dollar at withdrawal — deliberately effective, not marginal" control={<PercentInput value={a.effectiveRetirementRate} onCommit={(v) => patchA({ effectiveRetirementRate: v })} aria-label="Effective rate" />} />
            <SensitivityRow
              testid="sensitivity-rate"
              label="Traditional vs Roth if this rate is…"
              cells={[
                { k: '−5 pts', v: sensitivity.edge.down },
                { k: 'now', v: sensitivity.edge.base, now: true },
                { k: '+5 pts', v: sensitivity.edge.up },
              ]}
            />
          </>
        )}
        {a.taxMode === 'bracket' && <BracketEditor a={a} patchA={patchA} />}
        <FieldRow
          label="LTCG rate"
          description={a.taxMode === 'bracket' ? 'stays FLAT even in bracket mode — no 0% LTCG bracket is modeled (ASSUMPTIONS T13)' : undefined}
          control={<PercentInput value={a.ltcgRate} onCommit={(v) => patchA({ ltcgRate: v })} aria-label="LTCG rate" />}
        />
      </Group>

      <Group title="Horizon, HSA & targets">
        <FieldRow
          label="Inflation"
          description="spending and limits index with it — it compounds against you the way returns compound for you (also in Basics)"
          control={<PercentInput value={a.inflation} onCommit={(v) => patchA({ inflation: v })} aria-label="Inflation" />}
        />
        <FieldRow label="Planning horizon" description="each extra year adds one more indexed year of spending to fund" control={<AgeInput value={a.horizonAge} min={startAge + 1} max={105} onCommit={(v) => patchA({ horizonAge: v })} aria-label="Horizon" />} />
        <FieldRow label="Safe withdrawal rate" description="divides straight into your FIRE number — 4% = 25× spending, 3% ≈ 33×" control={<PercentInput value={a.safeWithdrawalRate} onCommit={(v) => patchA({ safeWithdrawalRate: v })} aria-label="SWR" />} />
        <FieldRow label="Coast FIRE target age" control={<AgeInput value={a.coastTargetAge} onCommit={(v) => patchA({ coastTargetAge: v })} aria-label="Coast target age" />} />
        <FieldRow label="Barista income target" description="assumed part-time income for the Barista metric" control={<MoneyInput value={a.baristaIncomeTarget ?? 0} min={0} onCommit={(v) => patchA({ baristaIncomeTarget: v })} aria-label="Barista income target" />} />
        <FieldRow
          label="HSA treatment"
          control={
            <Select value={a.hsaTreatment} onValueChange={(v) => patchA({ hsaTreatment: v as Assumptions['hsaTreatment'] })}>
              <SelectTrigger size="sm" className="w-full bg-white dark:bg-neutral-900">
                {/* short trigger text; long copy lives in the open menu (no-clipping rule) */}
                <SelectValue>{a.hsaTreatment === 'medical' ? 'Medical' : 'Non-medical'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="medical">Medical — pays the medical slice, then last resort</SelectItem>
                <SelectItem value="nonMedical">Non-medical — like pre-tax, opens at 65</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <FieldRow
          label="HSA coverage"
          control={
            <Select value={a.hsaCoverage} onValueChange={(v) => patchA({ hsaCoverage: v as Assumptions['hsaCoverage'] })}>
              <SelectTrigger size="sm" className="w-full bg-white dark:bg-neutral-900"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="selfOnly">Self-only</SelectItem>
                <SelectItem value="family">Family</SelectItem>
              </SelectContent>
            </Select>
          }
        />
      </Group>
      </Section>

      {/* M6.2 #3 / M6.3: reference data — IRS numbers and plan facts, rarely touched */}
      <Section id="section-reference" title="Reference & plan rules" intro="rarely changed — IRS limits, access ages, and what your plan permits">
      <Group title="Contribution limits (2026, indexed)">
        {(
          [
            ['deferral401k', '401k deferral'],
            ['catchUp401k50', '401k catch-up 50+'],
            ['catchUp401k60to63', '401k catch-up 60–63'],
            ['rothCatchUpWageThreshold', 'Roth catch-up wage threshold'],
            ['ira', 'IRA'],
            ['iraCatchUp50', 'IRA catch-up 50+'],
            ['hsaSelfOnly', 'HSA self-only'],
            ['hsaFamily', 'HSA family'],
            ['hsaCatchUp55', 'HSA catch-up 55+'],
            ['overall415c', '415(c) overall'],
          ] as Array<[keyof LimitSet, string]>
        ).map(([key, lbl]) => (
          <FieldRow key={key} label={lbl} control={<MoneyInput value={a.limits[key]} min={0} onCommit={(v) => patchA({ limits: { ...a.limits, [key]: v } })} aria-label={`Limit: ${lbl}`} />} />
        ))}
      </Group>

      <Group title="Plan toggles & access overrides">
        {(
          [
            ['inPlanConversion', 'In-plan conversion allowed (P2)'],
            ['inServiceWithdrawal', 'In-service withdrawal allowed (P2)'],
            ['afterTaxContributions', 'After-tax contributions allowed (P2)'],
          ] as Array<[keyof Pick<Assumptions, 'inPlanConversion' | 'inServiceWithdrawal' | 'afterTaxContributions'>, string]>
        ).map(([key, lbl]) => (
          <label key={key} className="mt-1.5 flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400">
            {lbl}
            <Switch checked={a[key]} onCheckedChange={(v) => patchA({ [key]: v })} aria-label={lbl} />
          </label>
        ))}
        {a.filers.map((_, f) => (
          <div key={f} className="pt-2">
            <p className="text-xs text-neutral-500">
              Filer {f + 1} access-age overrides — blank = auto (59½; rule of 55 from the scenario)
            </p>
            {(['trad401k', 'tradIra'] as const).map((acct) => (
              <FieldRow
                key={acct}
                label={`${ACCOUNT_LABELS[acct]} access age`}
                control={
                  <DraftNumberInput
                    value={a.accessAgeOverrides?.[f]?.[acct] ?? 0}
                    format={(v) => (v === 0 ? '' : String(v))}
                    parse={(raw) => {
                      const t = raw.trim();
                      if (t === '') return 0;
                      const n = Number(t);
                      return Number.isFinite(n) && n > 0 ? n : null;
                    }}
                    onCommit={(v) => {
                      const overrides = a.filers.map((_, i) => ({ ...(a.accessAgeOverrides?.[i] ?? {}) }));
                      if (v > 0) overrides[f][acct] = v;
                      else delete overrides[f][acct];
                      patchA({ accessAgeOverrides: overrides });
                    }}
                    placeholder="auto"
                    invalidMessage="age"
                    aria-label={`Filer ${f + 1} ${acct} access override`}
                  />
                }
              />
            ))}
          </div>
        ))}
      </Group>
      </Section>
    </div>
  );
}
