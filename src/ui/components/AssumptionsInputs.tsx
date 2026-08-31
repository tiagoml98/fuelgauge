/** The Assumptions layer of the inputs panel (VARIABLES §1), grouped + collapsible. */

import type { Assumptions, FilerBalances, LimitSet } from '../../engine/types';
import { useStore } from '../../state/store';
import { ACCOUNT_LABELS, ACCOUNT_ORDER } from '../theme/colors';
import { NumberField, PercentField, Section, SelectField, Toggle, buttonCls } from './fields';
import { ScheduleEditor } from './ScheduleEditor';

export function AssumptionsInputs({ a }: { a: Assumptions }) {
  const { state, dispatch } = useStore();
  const patch = (p: Partial<Assumptions>) => dispatch({ type: 'patchAssumptions', patch: p });
  const patchFilerBalances = (f: number, p: Partial<FilerBalances>) =>
    patch({
      balances: {
        ...a.balances,
        perFiler: a.balances.perFiler.map((b, i) => (i === f ? { ...b, ...p } : b)),
      },
    });
  const patchLimits = (p: Partial<LimitSet>) => patch({ limits: { ...a.limits, ...p } });
  const scenario = state.growthScenarios.find((g) => g.id === state.display.selectedScenarioId) ??
    state.growthScenarios[0];
  const startAge = a.filers[0].currentAge;
  const cashReturn = a.returnOverrides.cash?.[0]?.value ?? 0;

  return (
    <div>
      <Section title="Filers & filing" defaultOpen>
        <SelectField
          label="Filers"
          value={String(a.filers.length) as '1' | '2'}
          options={[
            { value: '1', label: 'One' },
            { value: '2', label: 'Two' },
          ]}
          onChange={(v) => dispatch({ type: 'setFilerCount', count: Number(v) as 1 | 2 })}
        />
        {a.filers.map((f, i) => (
          <NumberField
            key={i}
            label={`Filer ${i + 1} current age`}
            value={f.currentAge}
            step={1}
            min={18}
            max={90}
            onChange={(v) =>
              patch({ filers: a.filers.map((fl, j) => (j === i ? { currentAge: v } : fl)) })
            }
          />
        ))}
        <SelectField
          label="Filing status"
          value={a.filingStatus}
          options={[
            { value: 'single', label: 'Single' },
            { value: 'marriedJoint', label: 'Married filing jointly' },
          ]}
          onChange={(v) => patch({ filingStatus: v })}
        />
        <PercentField label="State tax rate (flat)" value={a.stateTaxRate} onChange={(v) => patch({ stateTaxRate: v })} />
        <NumberField label="Current calendar year" value={a.currentYear} step={1} onChange={(v) => patch({ currentYear: v })} />
        {a.filers.length === 2 && a.hsaCoverage === 'selfOnly' && (
          <div className="flex items-center justify-between rounded bg-blue-50 p-2 text-xs text-blue-900 dark:bg-blue-950 dark:text-blue-200">
            Two filers — switch HSA coverage to family?
            <button type="button" className={buttonCls} onClick={() => patch({ hsaCoverage: 'family' })}>
              switch
            </button>
          </div>
        )}
      </Section>

      <Section title="Current balances">
        {a.balances.perFiler.map((b, f) => (
          <div key={f} className="space-y-2">
            {a.filers.length > 1 && (
              <div className="pt-1 text-xs font-semibold text-neutral-500">Filer {f + 1}</div>
            )}
            <NumberField label="Traditional 401k" value={b.trad401k} onChange={(v) => patchFilerBalances(f, { trad401k: v })} />
            <NumberField label="Traditional IRA" value={b.tradIra} onChange={(v) => patchFilerBalances(f, { tradIra: v })} />
            <NumberField label="Trad IRA nondeductible basis (Form 8606)" value={b.tradIraBasis} onChange={(v) => patchFilerBalances(f, { tradIraBasis: v })} />
            <NumberField label="Roth 401k" value={b.roth401k} onChange={(v) => patchFilerBalances(f, { roth401k: v })} />
            <NumberField label="Roth 401k contribution basis" value={b.roth401kBasis} onChange={(v) => patchFilerBalances(f, { roth401kBasis: v })} />
            <NumberField label="Roth IRA contribution basis" value={b.rothIra.basis} onChange={(v) => patchFilerBalances(f, { rothIra: { ...b.rothIra, basis: v } })} />
            <NumberField label="Roth IRA earnings" value={b.rothIra.earnings} onChange={(v) => patchFilerBalances(f, { rothIra: { ...b.rothIra, earnings: v } })} />
            <NumberField
              label="Roth IRA first-funded year (blank = first modeled funding)"
              value={b.rothIra.firstFundedYear ?? 0}
              step={1}
              onChange={(v) => patchFilerBalances(f, { rothIra: { ...b.rothIra, firstFundedYear: v > 1900 ? v : null } })}
            />
            <div className="space-y-1">
              <div className="text-xs text-neutral-500">Roth IRA conversions (year / amount / taxable portion)</div>
              {b.rothIra.conversions.map((c, ci) => (
                <div key={ci} className="flex items-center gap-1">
                  {(['year', 'amount', 'taxablePortion'] as const).map((k) => (
                    <input
                      key={k}
                      type="number"
                      className="w-24 rounded border border-neutral-300 px-1 py-0.5 text-xs tnum dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      value={c[k]}
                      onChange={(e) =>
                        patchFilerBalances(f, {
                          rothIra: {
                            ...b.rothIra,
                            conversions: b.rothIra.conversions.map((cc, cj) =>
                              cj === ci ? { ...cc, [k]: e.target.valueAsNumber || 0 } : cc,
                            ),
                          },
                        })
                      }
                    />
                  ))}
                  <button
                    type="button"
                    className="px-1 text-neutral-400 hover:text-red-500"
                    onClick={() =>
                      patchFilerBalances(f, {
                        rothIra: { ...b.rothIra, conversions: b.rothIra.conversions.filter((_, cj) => cj !== ci) },
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className={buttonCls}
                onClick={() =>
                  patchFilerBalances(f, {
                    rothIra: {
                      ...b.rothIra,
                      conversions: [...b.rothIra.conversions, { year: a.currentYear - 1, amount: 0, taxablePortion: 0 }],
                    },
                  })
                }
              >
                + conversion
              </button>
            </div>
            <NumberField label="HSA" value={b.hsa} onChange={(v) => patchFilerBalances(f, { hsa: v })} />
          </div>
        ))}
        <div className="pt-1 text-xs font-semibold text-neutral-500">Household</div>
        <NumberField label="Invested taxable" value={a.balances.taxable} onChange={(v) => patch({ balances: { ...a.balances, taxable: v } })} />
        <NumberField label="Invested taxable cost basis" value={a.balances.taxableBasis} onChange={(v) => patch({ balances: { ...a.balances, taxableBasis: v } })} />
        <NumberField label="Cash" value={a.balances.cash} onChange={(v) => patch({ balances: { ...a.balances, cash: v } })} />
        <div className="space-y-1 pt-1">
          <div className="text-xs text-neutral-500">Include accounts</div>
          {ACCOUNT_ORDER.map((id) => (
            <Toggle
              key={id}
              label={ACCOUNT_LABELS[id]}
              checked={a.include[id]}
              onChange={(v) => patch({ include: { ...a.include, [id]: v } })}
            />
          ))}
        </div>
      </Section>

      <Section title="Economy & returns">
        <PercentField label="Inflation" value={a.inflation} onChange={(v) => patch({ inflation: v })} />
        <Toggle label="Index schedules & limits with inflation" checked={a.indexWithInflation} onChange={(v) => patch({ indexWithInflation: v })} />
        <ScheduleEditor
          label="Return schedule by age"
          unit="%/yr as decimal"
          rows={a.returnSchedule}
          onChange={(rows) => patch({ returnSchedule: rows })}
          startAge={startAge}
          endAge={a.horizonAge}
        />
        <NumberField
          label="Cash return (%/yr)"
          value={Math.round(cashReturn * 1000) / 10}
          step={0.1}
          onChange={(v) =>
            patch({ returnOverrides: { ...a.returnOverrides, cash: [{ fromAge: 0, toAge: null, value: v / 100 }] } })
          }
        />
        <PercentField label="Fees / expense ratio (invested accounts)" value={a.fees} step={0.05} onChange={(v) => patch({ fees: v })} />
        <PercentField label="Dividend yield (taxable drag)" value={a.dividendYield} onChange={(v) => patch({ dividendYield: v })} />
        <PercentField label="Dividend tax rate" value={a.dividendTaxRate} onChange={(v) => patch({ dividendTaxRate: v })} />
        <div className="rounded bg-neutral-100 p-2 text-[10px] leading-4 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          Effective returns: {scenario.returnScheduleOverride ? 'scenario override (all invested accounts)' : 'global schedule'} − fees;
          cash always uses its own return ({(cashReturn * 100).toFixed(1)}%), untouched by fees or overrides.
        </div>
      </Section>

      <Section title="Taxes (simple mode)">
        <SelectField
          label="Tax mode"
          value={a.taxMode}
          options={[
            { value: 'simple', label: 'Simple (flat rates)' },
            { value: 'bracket', label: 'Bracket (Phase 2 — not yet built)' },
          ]}
          onChange={(v) => patch({ taxMode: v === 'bracket' ? 'simple' : v })}
        />
        <PercentField label="Marginal rate now" value={a.marginalRateNow} onChange={(v) => patch({ marginalRateNow: v })} />
        <PercentField label='Effective rate on pre-tax withdrawals ("effective")' value={a.effectiveRetirementRate} onChange={(v) => patch({ effectiveRetirementRate: v })} />
        <PercentField label="LTCG rate" value={a.ltcgRate} onChange={(v) => patch({ ltcgRate: v })} />
      </Section>

      <Section title="Contribution limits (2026, indexed)">
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
        ).map(([key, label]) => (
          <NumberField key={key} label={label} value={a.limits[key]} step={500} onChange={(v) => patchLimits({ [key]: v })} />
        ))}
      </Section>

      <Section title="Horizon, HSA, FIRE targets">
        <NumberField label="Planning horizon (age)" value={a.horizonAge} step={1} onChange={(v) => patch({ horizonAge: v })} />
        <PercentField label="Safe withdrawal rate (~30 yrs)" value={a.safeWithdrawalRate} onChange={(v) => patch({ safeWithdrawalRate: v })} />
        <NumberField label="FIRE spending target (today's $/yr)" value={a.fireSpendingTarget} onChange={(v) => patch({ fireSpendingTarget: v })} />
        <NumberField label="Coast FIRE target age" value={a.coastTargetAge} step={1} onChange={(v) => patch({ coastTargetAge: v })} />
        <NumberField label="Barista income target (today's $/yr)" value={a.baristaIncomeTarget ?? 0} onChange={(v) => patch({ baristaIncomeTarget: v })} />
        <SelectField
          label="HSA treatment"
          value={a.hsaTreatment}
          options={[
            { value: 'medical', label: 'Medical (face value, never drawn)' },
            { value: 'nonMedical', label: 'Non-medical (like pre-tax, opens at 65)' },
          ]}
          onChange={(v) => patch({ hsaTreatment: v })}
        />
        <SelectField
          label="HSA coverage"
          value={a.hsaCoverage}
          options={[
            { value: 'selfOnly', label: 'Self-only' },
            { value: 'family', label: 'Family' },
          ]}
          onChange={(v) => patch({ hsaCoverage: v })}
        />
      </Section>

      <Section title="Plan toggles & access overrides">
        <Toggle label="In-plan conversion allowed (P2)" checked={a.inPlanConversion} onChange={(v) => patch({ inPlanConversion: v })} />
        <Toggle label="In-service withdrawal allowed (P2)" checked={a.inServiceWithdrawal} onChange={(v) => patch({ inServiceWithdrawal: v })} />
        <Toggle label="After-tax contributions allowed (P2)" checked={a.afterTaxContributions} onChange={(v) => patch({ afterTaxContributions: v })} />
        {a.filers.map((_, f) => (
          <div key={f} className="space-y-2">
            <div className="text-xs text-neutral-500">
              Filer {f + 1} access-age overrides (0 = auto: 59½, rule of 55 from the scenario)
            </div>
            {(['trad401k', 'tradIra'] as const).map((acct) => (
              <NumberField
                key={acct}
                label={`${ACCOUNT_LABELS[acct]} access age`}
                value={a.accessAgeOverrides?.[f]?.[acct] ?? 0}
                step={0.5}
                onChange={(v) => {
                  const overrides = a.filers.map((_, i) => ({ ...(a.accessAgeOverrides?.[i] ?? {}) }));
                  if (v > 0) overrides[f][acct] = v;
                  else delete overrides[f][acct];
                  patch({ accessAgeOverrides: overrides });
                }}
              />
            ))}
          </div>
        ))}
      </Section>
    </div>
  );
}
