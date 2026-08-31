/** The growth-scenario layer of the inputs panel (VARIABLES §2). */

import type {
  Assumptions,
  EmployerMatch,
  FilerGrowthInputs,
  GrowthScenario,
} from '../../engine/types';
import { useStore } from '../../state/store';
import { NumberField, PercentField, Section, SelectField, Toggle, buttonCls } from './fields';
import { ScheduleEditor } from './ScheduleEditor';
import { WindfallEditor } from './WindfallEditor';

export function ScenarioInputs({ a, g }: { a: Assumptions; g: GrowthScenario }) {
  const { dispatch } = useStore();
  const patch = (p: Partial<GrowthScenario>) =>
    dispatch({ type: 'patchScenario', id: g.id, patch: p });
  const patchFiler = (f: number, p: Partial<FilerGrowthInputs>) =>
    patch({ perFiler: g.perFiler.map((x, i) => (i === f ? { ...x, ...p } : x)) });
  const patchMatch = (f: number, p: Partial<EmployerMatch>) =>
    patchFiler(f, { match: { ...g.perFiler[f].match, ...p } });
  const horizonN = a.horizonAge - a.filers[0].currentAge;

  return (
    <div>
      {g.perFiler.map((pf, f) => {
        const ownStart = a.filers[f].currentAge;
        const ownEnd = ownStart + horizonN;
        return (
          <Section key={f} title={`Contributions — filer ${f + 1}`} defaultOpen={f === 0}>
            <ScheduleEditor label="Salary" rows={pf.salary} onChange={(rows) => patchFiler(f, { salary: rows })} startAge={ownStart} endAge={ownEnd} />
            <NumberField
              label="Separation age override (0 = auto: last salary age)"
              value={pf.separationAgeOverride ?? 0}
              step={1}
              onChange={(v) => patchFiler(f, { separationAgeOverride: v > 0 ? v : undefined })}
            />
            {pf.separationAgeOverride !== undefined &&
              pf.salary.some(
                (r) =>
                  r.value > 0 && (r.toAge === null || r.toAge > (pf.separationAgeOverride ?? 0)),
              ) && (
                <p className="rounded bg-amber-50 p-2 text-[11px] text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  salary continues after separation — match and contributions after{' '}
                  {pf.separationAgeOverride} still apply
                </p>
              )}
            <ScheduleEditor label="401k contributions (total, both sides)" rows={pf.contrib401k} onChange={(rows) => patchFiler(f, { contrib401k: rows })} startAge={ownStart} endAge={ownEnd} />
            <PercentField label="401k share to Roth" value={pf.split401kRothPct} step={5} onChange={(v) => patchFiler(f, { split401kRothPct: v })} />
            <ScheduleEditor label="IRA contributions (total, both sides)" rows={pf.contribIra} onChange={(rows) => patchFiler(f, { contribIra: rows })} startAge={ownStart} endAge={ownEnd} />
            <PercentField label="IRA share to Roth" value={pf.splitIraRothPct} step={5} onChange={(v) => patchFiler(f, { splitIraRothPct: v })} />
            <SelectField
              label="Traditional IRA deductible"
              value={pf.tradIraDeductible === undefined ? 'auto' : pf.tradIraDeductible ? 'yes' : 'no'}
              options={[
                { value: 'auto', label: 'Auto (no if a 401k schedule exists)' },
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No (tracked as basis)' },
              ]}
              onChange={(v) =>
                patchFiler(f, { tradIraDeductible: v === 'auto' ? undefined : v === 'yes' })
              }
            />
            <Toggle label="Backdoor Roth (IRA contribution converts, taxable portion 0)" checked={pf.backdoor} onChange={(v) => patchFiler(f, { backdoor: v })} />
            <div className="pt-1 text-xs font-semibold text-neutral-500">Employer match</div>
            <SelectField
              label="Match mode"
              value={pf.match.mode}
              options={[
                { value: 'percent', label: '% of deferral up to cap' },
                { value: 'flat', label: 'Flat $ (unconditional)' },
              ]}
              onChange={(v) => patchMatch(f, { mode: v })}
            />
            {pf.match.mode === 'percent' ? (
              <>
                <PercentField label="Match rate (of deferral)" value={pf.match.rate} step={5} onChange={(v) => patchMatch(f, { rate: v })} />
                <PercentField label="Match cap (% of salary)" value={pf.match.capPctOfSalary} step={1} onChange={(v) => patchMatch(f, { capPctOfSalary: v })} />
              </>
            ) : (
              <NumberField label="Flat match ($/yr, today's $)" value={pf.match.flatAmount} onChange={(v) => patchMatch(f, { flatAmount: v })} />
            )}
            <SelectField
              label="Match destination"
              value={pf.match.destination}
              options={[
                { value: 'trad401k', label: 'Traditional 401k' },
                { value: 'roth401k', label: 'Roth 401k (counts as basis)' },
              ]}
              onChange={(v) => patchMatch(f, { destination: v })}
            />
            <PercentField label="Match vesting" value={pf.match.vestingPct} step={5} onChange={(v) => patchMatch(f, { vestingPct: v })} />
          </Section>
        );
      })}

      <Section title="Household contributions & windfalls" defaultOpen>
        <ScheduleEditor label="HSA (household, stops at 65)" rows={g.hsaContrib} onChange={(rows) => patch({ hsaContrib: rows })} startAge={a.filers[0].currentAge} endAge={a.horizonAge} />
        <ScheduleEditor label="Invested taxable" rows={g.taxableContrib} onChange={(rows) => patch({ taxableContrib: rows })} startAge={a.filers[0].currentAge} endAge={a.horizonAge} />
        <ScheduleEditor label="Cash" rows={g.cashContrib} onChange={(rows) => patch({ cashContrib: rows })} startAge={a.filers[0].currentAge} endAge={a.horizonAge} />
        <WindfallEditor
          windfalls={g.windfalls}
          onChange={(w) => patch({ windfalls: w })}
          filerCount={a.filers.length}
          currentAge={a.filers[0].currentAge}
          inflation={a.inflation}
        />
      </Section>

      <Section title="Scenario return override">
        {g.returnScheduleOverride ? (
          <>
            <ScheduleEditor
              label="Override (all invested accounts; cash unaffected)"
              unit="%/yr as decimal"
              rows={g.returnScheduleOverride}
              onChange={(rows) => patch({ returnScheduleOverride: rows })}
              startAge={a.filers[0].currentAge}
              endAge={a.horizonAge}
            />
            <button type="button" className={buttonCls} onClick={() => patch({ returnScheduleOverride: undefined })}>
              remove override (use global schedule)
            </button>
          </>
        ) : (
          <button
            type="button"
            className={buttonCls}
            onClick={() => patch({ returnScheduleOverride: [{ fromAge: 0, toAge: null, value: 0.05 }] })}
          >
            add override (e.g. bear / stress scenario)
          </button>
        )}
      </Section>
    </div>
  );
}
