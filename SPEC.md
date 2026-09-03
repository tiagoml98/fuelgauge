# SPEC — Retirement & Tax-Strategy Modeler (v6)

**You are Claude Code, and this file is the source of truth.** Sections 1–13 say what to build; §14 says the order to build it in and where to stop and wait for me. Work one milestone at a time, use plan mode at the start of each, and do not start the next milestone until I approve the gate. `CLAUDE.md` holds the standing working rules.

**What we're building, in one paragraph:** I enter my age and account balances, control returns, taxes, and inflation, and see visually how each account grows. I can add manual bumps at an age (say, $200k at 32 from an IPO) and see a vertical marker on the chart. I save **growth scenarios** (different contribution and stop-contribution strategies) and **withdrawal strategies** (when and how I draw down), and a compare grid crosses them so I can see how each withdrawal strategy behaves under each growth scenario. Deterministic simulator, not an optimizer. Purpose is understanding, not advice. Priority: correctness of the math, then legibility, then it should look good.

**Tech:** Vite + React + TypeScript, Tailwind, **ECharts** (echarts-for-react) for all charts — stacked areas, markLine for vertical age markers, dataZoom for zoom, rich tooltips, themed. Engine is a pure TS module (`src/engine/`) with Vitest tests and no React imports. Client-side only; nothing leaves the browser. Everything serializes to the URL hash and to a JSON file (export/import).

---

## 1. Three layers of state

**Assumptions (global, one set)**
- Filers: one or two; per filer current age, birth year, planned separation age. Filing status. Flat state-tax rate (default 0).
- Current balances per account (§2), with Roth IRA entered as basis / conversions (by year) / earnings, and Roth IRA first-funded year.
- Per-account include toggle.
- Inflation (3%). "Index with inflation" toggle (default on).
- **Return schedule by age** (default: 7% until 50, 5% after) with optional per-account override. Fees / expense ratio subtracted. Taxable drag: dividend yield (2%) × dividend tax rate (15%).
- Tax mode: simple (marginal now 24%; effective on pre-tax withdrawals 12%, labeled "effective"; LTCG 15%) or bracket (Phase 2).
- Contribution limits, editable and indexed; defaults = current IRS limits, **verify before shipping** (2026: deferral $24,500; IRA $7,500; HSA $4,400 / $8,750; 415(c) $72,000; catch-ups at 50+ and 60–63 per IRS).
- Planning horizon (90). HSA treatment (medical / non-medical). Safe withdrawal rate (4%, tooltip: calibrated to ~30 years).
- Plan toggles: in-plan conversion, in-service withdrawal, after-tax contributions allowed, match vesting %.

**Growth scenarios (named, saved, many)** — everything about money going in:
- Per filer: salary schedule; 401k total schedule + traditional/Roth split; IRA total schedule + split; "traditional IRA deductible" yes/no; backdoor toggle.
- Employer match: rate % up to cap % of salary or flat $; lands in Traditional 401k (toggle Roth).
- HSA, invested taxable, cash contribution schedules. Mega-backdoor schedule (Phase 2).
- **Windfalls:** rows `{age, after-tax amount, target account, label}`. Default target: invested taxable. Each renders as a labeled vertical dashed line on every chart. The model does not tax windfalls — I enter what actually lands (footnote: RSUs are taxed as income at vest, options at exercise/sale; enter the after-tax number).
- Optional return-schedule override (lets me save "base," "bear," and "stress" growth scenarios).

**Withdrawal strategies (named, saved, many)** — everything about money coming out:
- Drawdown start age.
- Spending schedule (today's $) + one-time expense rows `{age, amount, label}`.
- Retirement income rows: part-time work, pension, Social Security (tagged so bracket mode treats 85% as taxable).
- Withdrawal order (drag list). Default: cash → invested taxable → Roth basis → seasoned conversions → pre-tax (once ≥ that account's access age) → Roth earnings (once ≥ access age). HSA not drawn under "medical."
- Conversion ladder schedule (Phase 2): rows `{from, to, $}` or `{from, to, fill to top of N% bracket}`.

**A run = one growth scenario × one withdrawal strategy.** The engine applies contributions only before the strategy's drawdown start age; if a growth scenario's schedules extend past it, they are cut there and a note says so.

## 2. Accounts and buckets

Seven accounts, four buckets. Charts default to buckets; toggle "by account."

| Bucket | Accounts | Notes |
|---|---|---|
| Pre-tax | Traditional 401k, Traditional IRA | Separate so the IRA balance drives the backdoor pro-rata warning |
| Roth | Roth 401k, Roth IRA | Roth IRA tracks basis / conversions by year / earnings |
| HSA | HSA | Contributions auto-stop at 65 |
| Taxable | Invested taxable (cost basis tracked), Cash | Cash: own return (4%), basis = balance, no drag |

At drawdown start, Traditional 401k → Traditional IRA and Roth 401k → Roth IRA (stated in UI). Unvested match dropped at separation.

**Access ages:** pre-tax accounts default 59½. If a filer's separation age ≥ 55, Traditional 401k access = separation age (rule of 55), shown as an editable auto-fill. Roth earnings: 59½ and 5 years since first funding. RMD start age from birth year (73 for 1951–59, 75 for 1960+), used in Phase 2.5.

## 3. Tabs

**Growth tab** — edit one growth scenario, save/duplicate/rename. Chart: stacked area of the four buckets from current age to horizon, **labeled "growth only — no withdrawals"**, with vertical markers at every windfall and at every contribution stop/reduce point. Hover shows each account's value at that age (real or nominal per toggle). Below: balance table every 5 years, expandable to yearly. Sidebar readouts: Coast FIRE age, $1M age, and the FIRE number for context.

**Drawdown tab** — pick a growth scenario and a withdrawal strategy, edit the strategy, save/duplicate/rename. Chart: the same stacked area, now with real drawdown after the start age, a solid vertical line at drawdown start and a marker at each access age. Below it: the **bridge visualizer** (one bar per year from drawdown start to the latest access age; accessible sources stacked vs that year's need + conversion tax; green covered, red gap; header: total bridge cost vs funding, inflated spend at start and at access age). Sidebar: milestones (Full / Barista / Coast FIRE, $1M, bridge funded and first gap year, margin over target), the **rate-arbitrage panel** (marginal today vs effective in conversion years vs effective after access, one-line verdict), and the plain-language readout ("at 50, X% of your money is locked until Y; bridge funded through Z").

**Compare tab** — a grid: rows = growth scenarios, columns = withdrawal strategies. Each cell shows the run's summary metrics: lifetime after-tax spending, terminal ATE at horizon, years retired, earliest drawdown age with no gaps, bridge funded (✓/✗), cumulative tax paid. Click cells to select; selected runs overlay their ATE totals on one chart with crossover ages marked, and a delta table shows differences against a chosen baseline run. Presets that create a scenario or strategy from the current one: "Roth 401k instead of traditional (equal take-home)," "Stop contributing at X," "Reduce to $Y at Z," "Retire at X instead," "Ladder bridge instead of outside-money bridge," "Stress: −20%, −10%, 0% in the first three drawdown years."

## 4. Core modeling rules

- Compute nominal internally; display real or nominal per toggle; every on-screen figure labeled. Real return = (1+r)/(1+i) − 1. Real display divides by (1+i)^(years from today).
- Timing: integer-year steps; contributions, windfalls, and growth at end of year; drawdown begins at the start of the drawdown-start year; withdrawals at the start of each drawdown year. Footnoted.
- All schedules in today's dollars, indexed when the toggle is on.
- All target comparisons (FIRE numbers, $1M, bridge sufficiency) in real terms.
- **After-tax-equivalent (ATE)** is the default lens (toggle to gross): pre-tax × (1 − effective rate) (bracket mode: schedule); Roth and cash at face; HSA at face if medical else like pre-tax; taxable minus tax on embedded gain.

## 5. Schedules

Every dollar flow and every age-varying rate is a list of rows `{from age, to age, value}`; gaps are zero. UI: compact table with a sparkline and quick actions ("Stop at X," "Reduce to $Y from Z," "Until age X"). One-time rows `{age, amount, label}` for windfalls and expenses.

## 6. Engine

- Year by year to horizon per run. Each account compounds on that year's return net of fees; schedules applied and capped at limits (catch-ups by filer age); windfalls added to their target; drag applied; cost basis and Roth sub-balances tracked.
- Drawdown: need = spending + one-time expenses − retirement income (all inflated). Withdrawals follow the strategy's order; pre-tax grossed up for tax, taxable for tax on the gain portion. Money before its access age is never drawn; if accessible sources run out, the year is a **gap** — reported, not covered.
- Per age per run: balance per account and bucket (gross and ATE), basis, total, accessible, locked, cumulative tax, gap flag.

## 7. Taxes

Simple mode (Phase 1) as in Assumptions. Bracket mode (Phase 2.0): editable standard deduction + brackets per filing status, indexed, plus flat state rate; used for conversion tax, withdrawal tax, fill-to-bracket, and Social Security at 85% taxable. No phase-outs, NIIT, IRMAA, ACA. Required for the ladder to mean anything: with one flat rate there is no bracket to fill.

## 8. The traditional-vs-Roth comparison (define precisely)

Fix take-home cost C. Path A: min(limit, C ÷ (1 − t_now)) pre-tax, remainder to taxable. Path B: min(limit, C) Roth, remainder to taxable. Match identical. Overlay ATE; mark first crossover. **The UI must explain the result:** with flat rates and non-binding limits the ratio is (1 − t_ret) ÷ (1 − t_now) at every age — no crossover, only the rate comparison matters; a breakeven age appears only via binding limits plus taxable drag, or conversion taxes paid now from taxable. Say which is driving it.

## 9. Phase 2 — tax-strategy layer (after Phase 1 passes)

- 2.0 Bracket mode.
- 2.1 Conversion ladder: tax from the bracket table, **paid from cash/taxable** (warn if exhausted; paying from the conversion is modeled as penalized before access age); each tranche accessible 5 tax years after conversion; Roth ordering enforced.
- 2.2 Mega-backdoor schedule.
- 2.3 Bridge visualizer gains ladder sources (cash/taxable carry the first five years, seasoned conversions take over).
- 2.4 Preset: "convert $X/yr from Y vs don't," breakeven age.
- 2.5 RMDs from the filer's start age: pre-tax ÷ Uniform Lifetime Table divisor; excess over need → taxable after tax. Cheap and materially important.

## 10. Assumptions panel (always visible) + disclaimer

- Simple mode overstates retirement tax if a marginal rate is entered → biases toward Roth
- No RMDs until 2.5 → biases against conversions
- Social Security only if entered as an income row (85% taxable in bracket mode)
- Deterministic returns; the stress preset is a stand-in, not a probability
- ACA subsidies before 65 not modeled — conversions during the bridge raise the income they're based on; check separately before acting on a ladder amount
- IRMAA after 65 not modeled — large conversions or RMDs after 63 can trigger it
- Windfalls entered after tax; HSA "medical" assumes qualified expenses ≥ balance; 401k → IRA rollover at drawdown start; backdoor pro-rata rule if any Traditional IRA balance
- **Prominent:** educational model, simplifying assumptions, not tax advice — confirm real decisions with a CPA.

### 10.1 Conversion ladder (as built, M8)

- Ladder rows live on the withdrawal strategy: `{from, to, $ amount}` (today's $, indexed at the start-of-year exponent) or `{from, to, fill to top of N% bracket}` (bracket mode only — skipped with a note in simple mode). Rows are ADDITIVE and processed in order; they act only during drawdown years.
- Ordering within a year: rollovers → income (seeds the ordinary pool) → spending withdrawals → **conversions** → growth. Fill-to-bracket fills the room remaining AFTER spending withdrawals — spending is never pushed into a higher bracket by a conversion.
- Conversions draw filer 1 then filer 2, trad401k before tradIra (match and nondeductible basis reduced pro-rata; the tranche still carries taxablePortion = amount — conservative). The tranche lands in that filer's Roth IRA and starts the Roth clock if none exists.
- Conversion tax: bracket mode = marginal slices on the year's pool (it IS ordinary tax and appears in the computed effective rate); simple mode = flat effective + state. Paid from **cash first, then taxable** (the sale pays LTCG on its gain portion); with neither left the tax is **withheld from the conversion itself** — W = shortfall ÷ (1 − 10%) with the 10% early-withdrawal penalty before the owner's ⌈59.5⌉ year, no penalty after — shrinking the tranche and raising an explicit in-app warning.
- Unlock rule: a tranche's taxable portion is accessible at the **earlier of** five tax years after conversion **or** the year the owner reaches ⌈59.5⌉ — the conversion clock only ever gates the penalty. (The separate 5-year rule on Roth EARNINGS is unchanged.)
- The bridge visualizer stacks funded years by source — outside money (cash + taxable), seasoned conversions, other sources — per §9-2.3. The preset "Ladder bridge vs outside money" spawns both strategies as experiments; its note states the breakeven age (or its absence), which driver produced it (access vs rates vs the cost of early tax), and the valuation-lens effect: pre-tax is valued at the run's ATE rate, so conversions taxed below/above it appear as an immediate ATE gain/loss per dollar.

## 11. Out of scope — do not build
Monte Carlo or any probabilistic engine; IRMAA; ACA subsidy modeling; 72(t)/SEPP; survivor brackets; estate / 10-year rule; tax-law-change presets; mortgage; NIIT; phase-outs; asset-allocation modeling (the return schedule stands in for it); taxing windfalls.

## 12. Acceptance criteria

**Phase 1**
- Golden number: P = 10,000, C = 5,000/yr end-of-year, r = 7%, n = 10 → FV = P(1+r)^n + C·((1+r)^n − 1)/r, to the cent. With 3% inflation and real display → nominal ÷ 1.03^10.
- Fees: 7% with 0.5% fees compounds at 6.5%. Return schedule: 7% to 50 then 5% → year 51 uses 5%.
- Schedules: contributions end at 40 → growth only from 41; "$2,000 from 45 to 50" resumes exactly then.
- **Windfall:** $200k at 32 to taxable → taxable balance at 32 is exactly $200k higher than the same run without it (windfalls are nominal — the amount that lands in that year's dollars, never indexed); a labeled vertical marker appears at 32 on Growth, Drawdown, and Compare charts.
- Split: 401k $20k at 50% Roth → $10k each under one shared limit; catch-up at 50 and higher catch-up at 60–63. Couple: limits summed, match per filer salary.
- ATE: pre-tax-only portfolio = gross × (1 − rate). Coast FIRE matches a hand-computed case.
- **Growth tab is growth-only:** the growth chart of a run never declines after drawdown start; the Drawdown tab chart of the same run does.
- Drawdown: spending = SWR × ATE at start and real return = SWR → real balance matches the closed form to the cent (start-of-year withdrawals: bₖ = b* − (b* − b₀)(1+SWR)ᵏ with b* = spend×(1+SWR)/SWR), and is ≥ 0.9× the starting balance 30 years in.
- Locked money: drawdown at 45, all pre-tax, no cash/taxable → gap at 45. Rule of 55: separation at 56 → Traditional 401k open at 56, Traditional IRA at 59½. Roth clock: first funded 3 years ago at 59½ → earnings locked 2 more years.
- **Matrix:** 2 growth scenarios × 2 strategies → 4 runs; each cell's metrics match the Drawdown tab for that pair; selecting two cells overlays them with the correct crossover; URL and JSON round-trip all scenarios, strategies, and assumptions.
- Stress preset lowers drawdown-start ATE vs base. All inputs live; every chart, table, and metric updates on change.
- After I test with real numbers and sign off, start Phase 2.

**Phase 2**
- Seasoning: conversion at 50 accessible at 55, not 54. Fill-to-bracket amount correct for a known schedule including an SS row. Equal-cost: t_now = t_ret, non-binding limits, no spill → Paths A and B identical every year. Ladder bridge: cash for exactly 5 years + conversions from 45 → funded; 4 years → gap at 49. RMD: born 1965, $1M at 75 → $1M ÷ divisor (verify divisor against the current table).

## 13. Design

Three tabs across the top (Growth / Drawdown / Compare); inputs in a left panel grouped and collapsible, schedules as compact tables with sparklines; chart dominant on the right; bridge and balance table below; assumptions/disclaimer always visible. Consistent bucket colors everywhere. Vertical markers: dashed for windfalls and contribution changes, solid for drawdown start, dotted for access ages, each labeled. Real/nominal and ATE/gross toggles in the chart header. Dark and light themes. It should look designed, not like a spreadsheet.

## 14. Build process — milestones and gates

Work in this order. Each milestone ends at a **gate**: stop, give me a short report, and wait for my OK. Use plan mode at the start of every milestone and show me the plan before touching files.

**M0 — Variables and assumptions. No code.**
Read this spec end to end. Produce:
- `docs/VARIABLES.md` — every input in §1, one row each: name, layer (assumptions / growth / withdrawal), unit, real-or-nominal, default, valid range, and which engine step consumes it. If an engine step will need something the spec doesn't define, add it and mark it "proposed."
- `docs/ASSUMPTIONS.md` — every simplification in §10 and §11 plus any you find, each with the direction of bias it introduces (e.g., "biases toward Roth").
- Proposed file structure, and the list of engine functions with type signatures.
Gate: I review both docs and the structure. Nothing else is built until I approve, because every later milestone reads from these.

**M1 — Types and schedules.**
`src/engine/types.ts` derived from VARIABLES.md; `src/engine/defaults.ts` as the single home of every default (no magic numbers anywhere else); the schedule resolver (rows → per-age array; indexing; gaps = 0; one-time rows). Vitest tests for each.
Gate: tests green; I skim the types.

**M2 — Accumulation engine.**
Compounding per return schedule net of fees; contributions with limits, splits, catch-ups, match, vesting; windfalls; drag; cost basis; Roth sub-balances. All Phase 1 accumulation tests from §12. Also `npm run table -- input.json`: a script that prints the year-by-year per-account table for a JSON input, so I can check numbers against a spreadsheet before any UI exists.
Gate: golden-number tests green; I reconcile one hand-calc case with the table script.

**M3 — Drawdown engine.**
Access ages, withdrawal order, gross-up, gaps, ATE, milestones, summary metrics, and run = growth × withdrawal. All Phase 1 drawdown tests. Table script extended through drawdown.
Gate: locked-money, rule-of-55, Roth-clock, and drawdown-flat tests green; I reconcile one full run.

**M4 — Growth tab.** UI scaffold, inputs panel, growth-only chart with markers, balance table, save/duplicate growth scenarios, URL and JSON persistence.
Gate: I test with my real numbers.

**M5 — Drawdown tab.** Strategy editor, drawdown chart, bridge visualizer, milestones, rate-arbitrage panel, readout.
Gate: I test with real numbers.

**M6 — Compare tab.** Grid, cell metrics, overlay chart, deltas, presets.
Gate: Phase 1 sign-off.

**M7–M10 — Phase 2**, one milestone each, same tests-first pattern: bracket mode → conversion ladder and bridge sources → mega-backdoor → RMDs.

**Rules that hold at every milestone**
- Engine before UI. A test before any engine change. The engine never imports React.
- Every default lives in `defaults.ts`; every assumption lives in `ASSUMPTIONS.md` *and* the in-app panel. Adding one means adding it in both, in the same commit.
- If a number looks wrong, write a failing test that reproduces it before fixing it.
- Do not add scope. If something seems necessary, propose it at the gate.
- Gate report format: what was built; test count and status; how to run it; exactly what I should check; any assumption you had to make that isn't in the spec.
