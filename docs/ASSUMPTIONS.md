# ASSUMPTIONS.md

Every simplification the model makes, with the direction of bias it introduces. This file and the in-app assumptions panel must stay in sync: adding an assumption means adding it in both, in the same commit (CLAUDE.md). Amended at the M0 and M1 gates (2026-08-30); gate decision numbers refer to VARIABLES.md §7, M1 amendment numbers to §7.1.

> **Prominent disclaimer (always visible in-app):** This is an educational model built on simplifying assumptions. It is not tax advice, financial advice, or a prediction. Confirm real decisions with a CPA.

**Reading the bias column.** "→ Roth" / "→ traditional" = tilts the traditional-vs-Roth comparison that way. "Optimistic" = outcomes look better than reality; "conservative" = worse. "Neutral" = shifts levels, not decisions. "Mixed" = cuts both ways, stated how.

## 1. Tax simplifications

| # | Assumption | Bias | Notes |
|---|---|---|---|
| T1 | Simple mode taxes all pre-tax withdrawals at one flat "effective" rate; if a marginal rate is entered there instead, retirement tax is overstated | → Roth | The rate is labeled "effective" in the UI to fight this |
| T2 | No RMDs until Phase 2.5 | → against conversions | Pre-tax balances never get force-drained into high brackets, so the ladder's benefit is understated |
| T3 | Social Security exists only if entered as a retirement-income row. Simple mode taxes it at 85% × effective rate; bracket mode treats 85% as taxable income | conservative if omitted | |
| T4 | Simple mode taxes part-time and pension income at the flat effective rate | mildly optimistic for large income | Real earned income in retirement faces marginal rates; bracket mode (M7) fixes this |
| T5 | ACA subsidies before 65 not modeled | → conversions look cheaper | Ladder conversions during the bridge raise MAGI, which real subsidies are based on — check separately before acting |
| T6 | IRMAA after 65 not modeled | → large conversions/RMDs look cheaper | Conversions or RMDs after 63 can raise Medicare premiums |
| T7 | Windfalls are entered after tax; the model never taxes them | neutral | RSUs are taxed as income at vest, options at exercise/sale — enter the number that actually lands |
| T8 | Backdoor pro-rata rule is a warning, not modeled — the backdoor executes cleanly even with a Traditional IRA balance, and its conversion is recorded with taxablePortion = 0 | → backdoor looks cleaner | Real pro-rata tax can make the backdoor expensive |
| T9 | Flat state tax rate applied uniformly; no state brackets, no state LTCG distinction | neutral-ish | Understates progressivity in high-tax states |
| T10 | No FICA/payroll tax modeling; salary exists for the match cap, the Roth-catch-up threshold, separation derivation, and the equal-take-home comparison | neutral | |
| T11 | Mandatory Roth catch-up (gate #10) is modeled, but the real rule keys on **prior-year W-2 (Box 3) wages from that employer**; the model compares **current-year modeled salary**, and indexes the threshold by model inflation rather than IRS COLA | neutral, small | Off by one year around the threshold and blind to job changes |
| T12 | No phase-outs: IRA deductibility is handled by the gate #11 default + basis tracking, Roth IRA income limits by the backdoor toggle — never enforced as law | → IRA strategies look freer | |
| T13 | LTCG is a flat rate even in years when income would qualify for the 0% bracket | → against taxable | Overstates tax on taxable sales in low-income years (e.g. the bridge) |
| T14 | Cash interest is taxed at two flat rates: marginal-now in accumulation, effective in drawdown | neutral-ish | A two-rate stand-in for ordinary-income treatment (gate #8) |
| T15 | The equal-take-home preset (§8) assumes the traditional path's tax savings are invested in taxable, not spent | neutral (definitional) | Stated in the preset's explanation |

## 2. Modeling and timing simplifications

| # | Assumption | Bias | Notes |
|---|---|---|---|
| M1 | Integer-year steps; contributions, windfalls, and growth land at end of year | conservative (accumulation) | Mid-year contributions earn no growth in their first year |
| M2 | Withdrawals at the start of each drawdown year; drawdown begins at the start of the drawdown-start year | conservative (longevity) | Withdrawn money misses that year's growth |
| M3 | Deterministic returns; the stress preset is a stand-in, not a probability | optimistic | No sequence-of-returns risk; a flat 7% is not a market |
| M4 | Contributions are cut at the strategy's drawdown start age even if the growth scenario's schedules extend past it (noted in UI) | neutral | A run = scenario × strategy; the strategy wins |
| M5 | Traditional 401k rolls to Traditional IRA at the **later of drawdown start and 59½**, so rule-of-55 withdrawals come from the plan until 59½; Roth 401k rolls at drawdown start (basis → basis, earnings → earnings). Assumes the plan permits partial withdrawals under rule of 55 | neutral | Gate #6; matches real-world behavior |
| M6 | Unvested match is dropped at separation, using a single vesting % — no vesting schedule | conservative | |
| M7 | Access at 59½ rounds to integer years: accessible the first year start-of-year age ≥ access age | conservative | Never unlocks early |
| M8 | Contribution limits and the Roth-catch-up threshold indexed by the model's single inflation rate, not actual IRS COLA rounding rules | neutral | Small drift over decades |
| M9 | Taxable drag = dividend yield × dividend tax rate annually; **after-tax dividends are reinvested and become cost basis** (basis grows by start-of-year balance × yield × (1 − dividend tax rate) each year, plus contributions and windfalls); all other gains unrealized until sale; no capital-gain distributions, no tax-loss harvesting | mildly optimistic for taxable | M2 gate bug fix — basis is never just contributions |
| M10 | HSA under "medical": ATE counts it at face value, but the default order never draws it | **mixed** | Optimistic for net worth (face value assumes qualified expenses ≥ balance forever); conservative for bridge/gap coverage (it never funds a year). Toggle "non-medical" to treat it like pre-tax |
| M11 | Roth 401k money inherits the Roth IRA's 5-year clock after rollover — no separate Roth 401k clock. If no Roth IRA existed before the rollover, the rollover year starts the clock (a rollover counts as first funding) | mildly optimistic | Roth IRA ordering itself (basis → conversions → earnings, taxable-first within each conversion) is the actual IRS rule, not a simplification |
| M12 | IRA/401k contributions are not checked against earned income or plan eligibility; schedules are taken at face (only IRS dollar limits are enforced) | optimistic | e.g. contributing with no salary entered still works |
| M13 | All target comparisons (FIRE numbers, $1M, bridge sufficiency) are in real terms via the engine's `toReal`; real vs nominal display is a lens, never a recomputation | neutral | Real return = (1+r)/(1+i) − 1 |
| M14 | Two-filer timeline: every unqualified age is filer 1's; filer 2's age = model age + age difference; per-filer items use own age | neutral (definitional) | Gate #1 |
| M15 | If a scenario's salary ends before the paired strategy's drawdown start, the gap years have **no income and no spending modeled**; the run carries a note: "ages X–Y have no income and no spending modeled" | optimistic if unread | The note is the mitigation — pre-retirement spending is otherwise out of model |
| M16 | One inflation rate, forever, used for all indexing (schedules, limits, thresholds, real display) | neutral | No CPI-vs-wage-growth distinction |
| M17 | No employer contributions other than match; enter profit-sharing as a flat match | neutral | Flat match is unconditional; percent match requires deferral > 0 (gate #7) |
| M18 | Household HSA with two filers 55+ gets both catch-ups in one account | mildly optimistic | Real catch-ups require each spouse's own HSA |
| M19 | The Growth tab is a growth-only lens — no withdrawals ever, labeled "growth only — no withdrawals" | neutral (definitional) | The same run declines on the Drawdown tab (SPEC §12) |
| M20 | Windfalls are nominal ("amount that lands, in that year's dollars"); one-time expenses are today's dollars, indexed — both labeled at the input | neutral (definitional) | Gate #12 |
| M21 | Fees apply to invested accounts only, never cash | neutral (definitional) | Gate #8 |
| M22 | Birth year is derived as currentYear − currentAge, not entered (M1 #4) | neutral, small | Affects only the RMD 73/75 boundary and the 60–63 catch-up window, by at most one year |
| M23 | Retirement income exceeding that year's need is saved to cash (after simple-mode tax) | neutral | M3: surplus is never silently discarded |
| M24 | Windfalls still land during drawdown years — only *contributions* are cut at the drawdown start | neutral | An inheritance at 70 is an event, not a contribution |
| M25 | Under "spending = SWR × ATE, real return = SWR," the real balance decays slowly instead of holding exactly flat — a consequence of discrete start-of-year withdrawals (M2): ≈0.83× after the ~30 years the SWR tooltip is calibrated to | conservative (longevity) | The engine matches the closed form b′ = (b − spend×(1+i)) × (1+r_real) exactly |

## 3. Out of scope — never modeled (SPEC §11)

| # | Not modeled | Bias of its absence |
|---|---|---|
| O1 | Monte Carlo / any probabilistic engine | Optimistic — no failure probabilities; stress preset is the only stand-in |
| O2 | 72(t)/SEPP substantially-equal payments | Conservative — overstates the locked-money problem before access ages |
| O3 | Survivor brackets (widow's penalty) | → traditional — understates a surviving spouse's single-filer rates on pre-tax money |
| O4 | Estate / inherited-IRA 10-year rule | → traditional — terminal pre-tax balances carry heirs' tax bills the terminal-ATE lens only partly captures |
| O5 | Tax-law-change presets | Current law (with indexing) assumed forever |
| O6 | Mortgage modeling | Neutral — model it as spending-schedule rows |
| O7 | NIIT (3.8%) | Optimistic for large taxable accounts |
| O8 | Asset-allocation modeling | Neutral — the age-based return schedule is the stand-in |
| O9 | IRMAA (see T6), ACA subsidies (see T5), phase-outs (see T12), taxing windfalls (see T7) | Listed above with their biases |

Anything in this table stays out even if it seems easy; changes go through a gate proposal (CLAUDE.md).
