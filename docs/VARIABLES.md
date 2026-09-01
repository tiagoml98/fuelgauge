# VARIABLES.md

Every input to the model, one row each. Source of truth for `src/engine/types.ts` (M1) and `src/engine/defaults.ts` (M1). Derived from SPEC.md v6 §1–§7, amended by the M0 gate decisions (§7 below) and the M1 gate amendments (§7.1).

**Columns.** *Real/nominal:* what the user enters. All schedules are entered in today's dollars and indexed to nominal when "index with inflation" is on (SPEC §4); the engine computes in nominal internally. **Exception: windfalls are nominal — the amount that lands, in that year's dollars (gate #12).** *Consumed by:* the engine module (see `docs/ARCHITECTURE.md`) that reads the variable, with its milestone.

**Two-filer timeline (gate #1).** Every unqualified "age" in the model — return schedule, spending, windfalls, one-time expenses, drawdown start, horizon, chart axis — is **filer 1's age**. Filer 2's age at any model age = model age + (filer2.currentAge − filer1.currentAge). Per-filer items (salary, 401k, IRA, catch-ups, access ages, RMD age, separation age) use that filer's own age.

*(P2)* = Phase 2, listed now so types reserve space; not implemented until M7–M10.

---

## 1. Assumptions (global, one set)

### 1.1 Filers and filing

| Name | Layer | Unit | Real/nominal | Default | Valid range | Consumed by |
|---|---|---|---|---|---|---|
| Filer count | Assumptions | 1 or 2 | n/a | 1 | {1, 2} | everything per-filer |
| Current age — per filer | Assumptions | age | n/a | 30 | 18–90 | accumulate (M2), access (M3), limits (M2); filer-2 offset per the timeline rule |
| Birth year — per filer | — (derived, not stored) | year | n/a | current year − current age (M1 #4) | — | access/RMD age (M3, used M10); ≤1-year error on the RMD 73/75 boundary and the 60–63 window (ASSUMPTIONS M22) |
| Filing status | Assumptions | enum: single \| married-joint | n/a | single (1 filer) / married-joint (2) | those two | tax: bracket mode (M7); UI labels |
| Flat state-tax rate | Assumptions | % | n/a (rate) | 0% | 0–15% | tax (M2/M3) |
| Current calendar year | Assumptions | year | n/a | auto (system clock, editable) | 2020–2100 | schedule indexing anchor (M1); conversion seasoning (M3); RMD age (M10) |

> Planned separation age moved to the **Growth layer** (per filer, per scenario) at the M0 gate — see §2 and gate #2.

### 1.2 Current balances (seven accounts, SPEC §2)

All balances are **nominal** (today's actual dollars). All default to $0, valid range ≥ 0, consumed by accumulate (M2) as year-0 starting state.

**Ownership (M1 #1):** retirement accounts are **per filer** — arrays aligned with the filer list — because rule of 55, 59½, the Roth clock, catch-ups, and RMDs are per filer. Invested taxable and cash are **household**. The engine tracks per-filer sub-balances; `RunYear.accounts` stays merged as the display contract.

| Name | Ownership | Unit | Notes |
|---|---|---|---|
| Traditional 401k balance | per filer | $ | Pre-tax bucket |
| Traditional IRA balance | per filer | $ | Pre-tax bucket; drives backdoor pro-rata warning |
| Traditional IRA — nondeductible basis | per filer | $ (explicit entry, may be empty) | M1 #3 + M6.2 #1: existing Form 8606 basis. EXPLICIT ENTRY — never auto-filled; empty = not entered → no nondeductible basis, withdrawals fully taxable. Gate-#11 accruals add to the entered value; recovered pro rata tax-free on withdrawal |
| Roth 401k balance | per filer | $ | Roth bucket |
| Roth 401k — contribution basis | per filer | $ (explicit entry, may be empty) | Gate #3 + M6.2 #1. EXPLICIT ENTRY — never auto-filled; empty = not entered → the full balance counts as earnings (conservative). Forward contributions tracked as basis. On rollover: basis → Roth IRA basis, earnings → Roth IRA earnings |
| Roth IRA — contribution basis | per filer | $ | Withdrawable any time |
| Roth IRA — conversions, rows {year, amount, taxablePortion} | per filer | rows: year + $ + $ | Gate #4. Seasoning (5 tax years from conversion year) applies **only to the taxable portion**; the nontaxable portion is accessible immediately. Within each conversion, IRS ordering: taxable first, then nontaxable. Backdoor contributions are recorded as conversions with taxablePortion = 0 (pro-rata ignored per ASSUMPTIONS T8) — never locked. Ladder conversions *(P2)* have taxablePortion = amount → access (M3) |
| Roth IRA — earnings | per filer | $ | Locked until 59½ **and** 5 years since that filer's first funding |
| Roth IRA — first-funded year | per filer | year | Starts that filer's 5-year clock; blank = first year the model sees Roth IRA funding — a rollover counts as funding (starts the clock if no Roth IRA existed before) |
| HSA balance | per filer | $ | Contributions auto-stop at 65 |
| Invested taxable balance | household | $ | Taxable bucket |
| Invested taxable — current cost basis | household | $ (explicit entry, may be empty) | M6.2 #1: EXPLICIT ENTRY — no balance edit ever touches it; a clear control returns it to empty. Empty = not entered → modeled as basis = balance (no embedded gains, optimistic; stated in the UI as placeholder, chip, and readout line). The sim grows the entered basis with contributions and reinvested dividends (M9). Consumed by accumulate (M2), ate (M2), tax on sale (M3) |
| Cash balance | household | $ | Basis = balance; interest taxed annually (gate #8) |
| Include toggle — per account (×7) | — | bool | true — accumulate/drawdown skip excluded accounts entirely |

### 1.3 Economy and returns

| Name | Layer | Unit | Real/nominal | Default | Valid range | Consumed by |
|---|---|---|---|---|---|---|
| Inflation | Assumptions | %/yr | n/a (rate) | 3% | 0–15% | schedule indexing (M1), toReal (M1), real-return math (M2) |
| Index with inflation | Assumptions | bool | on | — | schedule (M1), limits (M2) |
| Return schedule by age | Assumptions | rows {from age, to age, %/yr} | nominal rate | **7% flat** (M4.5 C.2 — SPEC's 7%-then-5%-at-50 produced an unexplained kink on first use; age steps come from the "lower return to X% from age Y" quick action, which the Stress preset also uses) | −20%–+20% per row | accumulate (M2), drawdown growth (M3); changes emit a returnChange marker (M4.5 C.3) |
| Per-account return override (×7, optional) | Assumptions | rows, same shape | nominal rate | unset (use global); **Cash: 4%** (SPEC §2) | same | accumulate (M2) |
| Fees / expense ratio | Assumptions | %/yr | n/a (rate) | **0.1%** (gate #15) | 0–2% | accumulate (M2): subtracted from return on **invested accounts only — never cash** (gate #8) |
| Dividend yield (taxable drag) | Assumptions | %/yr | n/a (rate) | 2% | 0–10% | accumulate: drag on invested taxable only (M2) |
| Dividend tax rate | Assumptions | % | n/a (rate) | 15% | 0–40% | accumulate: drag (M2) |

**Cash taxation (gate #8):** cash interest is ordinary income, taxed annually — at the marginal-now rate during accumulation, at the effective retirement rate during drawdown (bracket mode: the schedule, M7).

### 1.4 Taxes (simple mode; bracket mode is M7)

| Name | Layer | Unit | Default | Valid range | Consumed by |
|---|---|---|---|---|---|
| Tax mode | Assumptions | enum: simple \| bracket *(P2)* | simple | those two | tax (M2/M3, M7) |
| Marginal rate now | Assumptions | % | 24% | 0–50% | cash-interest tax in accumulation (M2), trad-vs-Roth comparison §8 (M6), conversion tax *(P2)* |
| Effective rate on pre-tax withdrawals (labeled "effective") | Assumptions | % | 12% | 0–50% | ate (M2), drawdown gross-up (M3), cash-interest tax in drawdown (M3), simple-mode retirement-income tax (M3, gate #9) |
| LTCG rate | Assumptions | % | 15% | 0–30% | ate (M2), tax on taxable sale (M3) |
| Standard deduction + bracket tables per filing status *(P2)* | Assumptions | table rows | current IRS, editable, indexed | — | tax (M7) |

### 1.5 Contribution limits (editable, indexed when toggle on)

2026 IRS values, **verified 2026-08-30** against IRS announcements (IR-2025-111, Notice 2025-67); confirmed correct at the M0 gate. Consumed by limits (M2). Catch-ups keyed to filer age in the year; couple = limits applied per filer, then summed (SPEC §12).

| Name | Unit | Default (2026) | Valid range | Notes |
|---|---|---|---|---|
| 401k employee deferral limit | $/yr | $24,500 | ≥ 0 | Shared across traditional + Roth 401k split |
| 401k catch-up, age 50+ | $/yr | $8,000 | ≥ 0 | |
| 401k catch-up, ages 60–63 | $/yr | $11,250 | ≥ 0 | Replaces (not stacks on) the 50+ catch-up in those years; back to 50+ amount at 64 |
| Roth catch-up wage threshold | $/yr | $150,000 | ≥ 0 | Gate #10. If a filer's salary exceeds this (indexed by model inflation), that filer's 401k catch-up portion goes to **Roth 401k regardless of split**, with a note when it triggers. Simplification: compared against same-year modeled salary, not prior-year FICA wages (ASSUMPTIONS T11) |
| IRA limit | $/yr | $7,500 | ≥ 0 | Shared across traditional + Roth IRA split |
| IRA catch-up, age 50+ | $/yr | $1,100 | ≥ 0 | |
| HSA limit — self-only | $/yr | $4,400 | ≥ 0 | |
| HSA limit — family | $/yr | $8,750 | ≥ 0 | |
| HSA catch-up, age 55+ | $/yr | $1,000 | ≥ 0 | Household HSA with two filers 55+ gets both catch-ups — simplification, real catch-ups need separate HSAs (ASSUMPTIONS M18) |
| HSA coverage type | enum: self-only \| family | family (2 filers) / self-only (1) | those two | Picks which HSA limit applies. UI (M4): when a second filer is added, suggest flipping to family |
| 415(c) overall limit | $/yr | $72,000 | ≥ 0 | Caps deferrals + match + after-tax; age-based catch-ups sit outside it. Binds for mega-backdoor *(P2)* |

### 1.6 Horizon, policy, plan toggles, FIRE targets

| Name | Layer | Unit | Default | Valid range | Consumed by |
|---|---|---|---|---|---|
| Planning horizon | Assumptions | age (filer 1) | 90 | > current age, ≤ 105 | every engine step; charts end here |
| HSA treatment | Assumptions | enum: medical \| non-medical | medical | those two | ate (M2), drawdown order (M3) |
| Safe withdrawal rate | Assumptions | % | 4% (tooltip: ~30 years) | 1–10% | metrics: FIRE number (M3) |
| FIRE spending target | Assumptions | $/yr, today's $ | $0 (metrics show "—") | ≥ 0 | Gate #13: Growth-tab metrics (M3/M4); default spending row of a new withdrawal strategy |
| Coast FIRE target age | Assumptions | age (filer 1) | 65 | > current age, ≤ horizon | Gate #13: Growth-tab Coast FIRE metric; drawdown-start fallback default (§3). Growth-tab metrics labeled "vs target spend $X, target age Y" |
| Barista income target | Assumptions | $/yr, today's $ | $0 (metric shows "—") — optional field, no migration | ≥ 0 | M3 gate #6: Growth-tab Barista FIRE metric = Full FIRE on (spending target − this). Drawdown-tab Barista uses the strategy's part-time rows |
| In-plan conversion allowed | Assumptions | bool | off | — | ladder *(P2)* |
| In-service withdrawal allowed | Assumptions | bool | off | — | mega-backdoor *(P2)* |
| After-tax contributions allowed | Assumptions | bool | off | — | mega-backdoor *(P2)* |

> Match vesting % moved into the per-filer employer-match config (§2) at the M1 gate (M1 #5).

### 1.7 Access ages (auto-derived, editable — SPEC §2, gate #2/#6)

| Name | Layer | Unit | Default | Consumed by |
|---|---|---|---|---|
| Pre-tax access age — per filer per pre-tax account | Assumptions (auto-filled from the growth scenario) | age (own age) | 59½; Traditional 401k auto-fills to the **scenario's** separation age when separation ≥ 55 (rule of 55), shown editable. `computeAccessAges(assumptions, scenario)` | access (M3) |
| Roth-earnings access | — | derived | 59½ **and** 5 years since Roth IRA first funding | access (M3) |
| RMD start age — per filer | — | derived from birth year | 73 (born 1951–59), 75 (1960+) | rmd (M10) |
| Integer-year treatment of 59½ | — | rule (confirmed at gate; operationalized M3) | a source is open in the first year whose **end-of-year age ≥ ⌈access age⌉** — 59½ → the year they turn 60; rule-of-55 age 56 → the year they turn 56. Within ±6 months of the true date (ASSUMPTIONS M7) | access (M3): `accessOpen` |

---

## 2. Growth scenario (named, saved, many)

All dollar schedules: rows `{from age, to age, value in today's $/yr}`, gaps = 0, indexed when the toggle is on (SPEC §5). Per-filer schedules are in **that filer's own age**. Resolved by schedule (M1); applied by accumulate (M2). Contributions are applied only before the paired strategy's drawdown start age (SPEC §1); schedules extending past it are cut with a note.

| Name | Layer | Unit | Real/nominal | Default | Valid range | Consumed by |
|---|---|---|---|---|---|---|
| Scenario name + id | Growth | text | n/a | "Base" / id `base` | non-empty; **unique ids are the UI's responsibility** — factories default to `base`, the UI generates fresh ids on create/duplicate | UI, compare grid, persistence |
| Salary schedule — per filer | Growth | schedule $/yr | real | empty | ≥ 0 | match cap (M2), Roth-catch-up threshold (M2), separation-age derivation (below), take-home comparison §8 (M6) |
| Separation age — per filer | Growth | age (own age) | derived: **last age with salary > 0 in this scenario**; editable override | ≥ current age | Gate #2. access: rule of 55 (M3); accumulate: match vesting (M2); run: rollover timing (M3); drawdown-start default (§3). If salary ends before the paired strategy's drawdown start, the run emits: "ages X–Y have no income and no spending modeled" |
| 401k total contribution schedule — per filer | Growth | schedule $/yr | real | empty | ≥ 0 | limits + accumulate (M2) |
| 401k traditional/Roth split — per filer | Growth | % to Roth | n/a | 0% (all traditional) | 0–100% | accumulate (M2); overridden for the catch-up portion when the Roth catch-up threshold triggers (gate #10) |
| IRA total contribution schedule — per filer | Growth | schedule $/yr | real | empty | ≥ 0 | limits + accumulate (M2) |
| IRA traditional/Roth split — per filer | Growth | % to Roth | n/a | 100% (all Roth) | 0–100% | accumulate (M2) |
| Traditional IRA deductible — per filer | Growth | bool | **"no" if that filer has a 401k schedule in this scenario, else "yes"** (gate #11) | — | tax (M2). Non-deductible + backdoor off → warn, and track the contribution as Traditional IRA basis, recovered pro rata tax-free on withdrawal — never taxed twice |
| Backdoor toggle — per filer | Growth | bool | off | — | accumulate (M2): routes IRA contribution to Roth, recorded as a conversion with taxablePortion = 0 (gate #4); pro-rata **warning** if trad IRA balance > 0 |
| Employer match — mode | Growth | enum: percent \| flat | n/a | percent | those two | accumulate (M2) |
| Employer match — rate | Growth | % of deferral | n/a | 0% | 0–200% | Gate #7: match = rate × min(filer's total 401k deferral incl. Roth side, cap × salary). Zero when deferral is zero — "stop contributing at X" also loses the match |
| Employer match — cap | Growth | % of salary | n/a | 0% | 0–25% | accumulate (M2) |
| Employer match — flat amount | Growth | $/yr | real | $0 | ≥ 0 | accumulate (M2). Applied unconditionally (profit-sharing stand-in, ASSUMPTIONS M17) — the deferral-gated behavior is percent mode's |
| Match destination | Growth | enum: traditional \| Roth 401k | n/a | traditional | those two | accumulate (M2). Roth-destination match is **contribution basis** — taxed as income when made; becomes Roth IRA basis on rollover (M2 gate #5) |
| Match vesting % | Growth (per-filer match config, M1 #5) | % | 100% | 0–100% | accumulate: unvested fraction dropped at that filer's separation (M2) |
| HSA contribution schedule (household) | Growth | schedule $/yr | real | empty | ≥ 0 | limits + accumulate (M2); auto-stops at 65 |
| Invested taxable contribution schedule | Growth | schedule $/yr | real | empty | ≥ 0 | accumulate (M2); adds to cost basis |
| Cash contribution schedule | Growth | schedule $/yr | real | empty | ≥ 0 | accumulate (M2) |
| Mega-backdoor schedule *(P2)* | Growth | schedule $/yr | real | empty | ≥ 0, capped by 415(c) | accumulate (M9) |
| Windfall rows | Growth | rows {age, after-tax $, target account, label, filer?} | **nominal** — field label: "amount that lands, in that year's dollars"; UI shows today's-$ equivalent beside it (gate #12) | none; target default = invested taxable; filer default = filer 1 (M2 gate #4, matters for per-filer targets) | amount ≥ 0 | accumulate (M2); adds to basis of target; chart markers (M4–M6) |
| Return-schedule override (optional) | Growth | rows {from age, to age, %/yr} | nominal rate | unset (use Assumptions) | −50%–+20% | accumulate (M2); enables "base / bear / stress" scenarios |

## 3. Withdrawal strategy (named, saved, many)

| Name | Layer | Unit | Real/nominal | Default | Valid range | Consumed by |
|---|---|---|---|---|---|---|
| Strategy name + id | Withdrawal | text | n/a | "Base" / id `base` | non-empty; unique ids are the UI's responsibility (as in §2) | UI, compare grid, persistence |
| Drawdown start age | Withdrawal | age (filer 1) | n/a | auto: **earliest filer separation age + 1 in the paired growth scenario (M3 gate #2 — the separation year keeps its salary and end-of-year contributions); if the scenario has no salary rows, the Coast FIRE target age** | > current age, ≤ horizon | run (M3): contributions cut here, withdrawals begin at start of this year; rollover timing per gate #6 |
| Spending schedule | Withdrawal | schedule $/yr | real (today's $) | one row: FIRE spending target from drawdown start to horizon (gate #13) | ≥ 0 | drawdown need (M3), FIRE number (M3) |
| One-time expense rows | Withdrawal | rows {age, amount, label} | real (today's $, indexed) | none | ≥ 0 | drawdown need (M3) |
| Retirement income rows | Withdrawal | rows {type: part-time \| pension \| social-security, from age, to age, $/yr, label} | real (today's $, indexed) | none | ≥ 0 | drawdown need offset (M3). **Simple mode taxes them (gate #9): part-time and pension at the effective rate, Social Security at 85% × effective.** Bracket mode (M7): brackets, SS 85% taxable |
| Withdrawal order | Withdrawal | ordered list of sources | n/a | **cash → invested taxable → pre-tax (once ≥ access age) → Roth basis → seasoned conversions → Roth earnings (once ≥ access age)**; HSA excluded under "medical" (gate #5 — corrects SPEC §1) | permutation | drawdown (M3). The access filter makes it self-adjusting: before access age, pre-tax is skipped and Roth basis fills the bridge; after, pre-tax goes first |
| Conversion ladder rows *(P2)* | Withdrawal | rows {from, to, $} or {from, to, fill to top of N% bracket} | real | none | ≥ 0 | ladder (M8); taxablePortion = amount |

## 4. Schedule semantics (SPEC §5)

Rules every schedule in §1–§3 follows. `src/engine/schedule.ts` implements them; the UI's schedule editor must respect them.

- A schedule is an **ordered list** of rows `{from age, to age, value}`; ages are integers in the row-owner's age domain (per-filer rows use that filer's own age — gate #1).
- **Gaps are zero** — ages covered by no row contribute nothing.
- **`to age` empty (null) = "until horizon."**
- **Overlaps: later rows win.** Quick actions ("Stop at X," "Reduce to $Y from Z") append override rows rather than editing existing ones. An interior override wins inside its range, then the earlier row resumes (e.g. $10k 30–50 + $5k 40–45 → $5k at 40–45, $10k at 46–50).
- **Row order is therefore semantic.** Serialization preserves array order; the UI never re-sorts rows in storage — sorting is display-only (M1 #2).
- Dollar schedules are today's $, indexed to nominal when the toggle is on; one-time expenses likewise. **Windfalls are the exception: nominal, never indexed** (gate #12).
- **Cash always uses its own return** (the per-account override row, default 4%) — a scenario return override applies to all *invested* accounts and beats per-account overrides; cash is never touched by it (M2 gate #6). UI (M4): surface an editable "Cash return" field, and make each account's effective return schedule visible.

## 5. Per-run output (not inputs — the engine's contract, SPEC §6)

Per age per run: balance per account and per bucket (gross and ATE), cost basis, Roth sub-balances, total, accessible, locked, cumulative tax paid, gap flag, and marker events (windfalls, contribution changes, drawdown start, access ages). Summary per run: lifetime after-tax spending, terminal ATE at horizon, **years retired = horizon − drawdown start**, **first gap age (reported separately)**, earliest gap-free drawdown age (computed lazily, memoized — up to ~60 runs per cell), bridge funded ✓/✗, cumulative tax (SPEC §3 Compare; gate #E3).

`AccessMap` (per filer, per source): a **missing key means accessible from the start** (taxable, cash, Roth basis); present keys give the owner's own age at which the source unlocks.

## 6. Display state and persistence (UI only — never read by the engine)

Real/nominal toggle (default **real**), ATE/gross toggle (default ATE, SPEC §4), buckets/by-account toggle (default buckets, SPEC §2), balance-table granularity (5-yr/1-yr), theme (dark/light), selected scenario/strategy/cells. Real values everywhere come from the engine's `toReal(value, yearsFromNow)` (gate #14) — the UI never does its own inflation math.

Everything serializes as one `PersistedState { schemaVersion, assumptions, growthScenarios, strategies, display }` (M1 #2) — the URL hash, JSON export/import, and the table script's input all share it; `migratePersistedState` (src/engine/persist.ts) gates schema upgrades.

## 7. M0 gate decisions (approved 2026-08-30)

Deviations from SPEC and additions beyond it, as approved at the M0 gate. Numbers are referenced throughout this file and in ASSUMPTIONS.md.

1. **Two-filer timeline** — unqualified ages are filer 1's; filer 2 offset by age difference; per-filer items in own age.
2. **Separation age is per filer, per growth scenario** — derived as last age with salary > 0, editable; rule of 55, vesting, and rollover timing follow the scenario. Salary-end/drawdown-start gap emits a note.
3. **Roth 401k basis tracked** — starting-basis input (default $0 = all earnings, conservative); forward contributions are basis; rollover maps basis→basis, earnings→earnings.
4. **Conversions carry `taxablePortion`** — seasoning applies to the taxable portion only; nontaxable accessible immediately; taxable-first ordering within each conversion; backdoor = conversion with taxablePortion 0.
5. **Withdrawal order corrected** — pre-tax (access-gated) ahead of Roth basis; SPEC §1's order superseded.
6. **Rollover timing** — Traditional 401k → Traditional IRA at the **later of drawdown start and 59½** (its access age absent rule of 55), so rule-of-55 withdrawals come from the plan until 59½; Roth 401k → Roth IRA at drawdown start. Assumes the plan permits partial withdrawals under rule of 55.
7. **Match formula** — rate × min(total 401k deferral incl. Roth, cap × salary); zero when deferral is zero; flat mode unconditional (profit-sharing stand-in); vested at separation.
8. **Cash** — interest taxed annually as ordinary income (marginal now / effective in drawdown); fees never apply to cash.
9. **Simple mode taxes retirement income** — pension and part-time at effective; SS at 85% × effective.
10. **Mandatory Roth catch-up modeled** — salary above indexed threshold ($150k, 2026) forces the catch-up portion to Roth 401k, with a note.
11. **Traditional IRA deductible default** — "no" with a 401k schedule, else "yes"; non-deductible contributions tracked as IRA basis, recovered pro rata tax-free.
12. **Windfalls are nominal** — labeled "amount that lands, in that year's dollars," today's-$ equivalent shown beside; SPEC §12 test wording fixed to match.
13. **FIRE metrics inputs** — Assumptions-level FIRE spending target + Coast FIRE target age; seed new strategies' spending and (via the fallback in #15) drawdown start; Growth-tab metrics labeled with them.
14. **ate.ts in M2; engine-side `toReal`** — the M2 table shows ATE, prints real and nominal side by side; metrics and UI use `toReal`.
15. **Defaults** — fees 0.1%; drawdown start auto = earliest separation age in the paired scenario, falling back to Coast FIRE target age when the scenario has no salary *(reconciliation of gate items 13 & 15, approved with the M1 plan)*; real display default; all remaining open defaults from the original M0 review approved.
16. **Household HSA gets both 55+ catch-ups** — simplification (real catch-ups need separate HSAs).
17. **Calendar-year anchor, taxable cost-basis input, Roth first-funded fallback** (rollover counts as funding), **59½ rounding rule** — approved as proposed.

### 7.1 M1 gate amendments (approved 2026-08-30)

Applied before M2, in one commit, because `types.ts` freezes the serialization format:

1. **Per-filer retirement balances** — trad 401k, trad IRA (+basis), Roth 401k (+basis), Roth IRA (own 5-year clock each), HSA are per-filer arrays; taxable and cash stay household; `RunYear.accounts` stays merged as the display contract (§1.2).
2. **`PersistedState` with `schemaVersion`** + migration stub in `src/engine/persist.ts`; schedule-row array order is semantic and preserved in storage (§4, §6).
3. **Starting Traditional IRA nondeductible basis input** (Form 8606), per filer, default $0 (§1.2).
4. **Birth year derived** as currentYear − currentAge, not stored (§1.1; ASSUMPTIONS M22).
5. **Vesting % lives inside the per-filer employer-match config**; match folded into the per-filer growth inputs — no parallel arrays (§2).

### 7.2 M2 gate decisions (approved 2026-08-30)

Confirmed as documented: return-age convention (the year ending at age N uses the return at age N — the age-51 year is the first at 5%); HSA household deposits to the youngest filer under 65; federal + state combine additively; per-filer vested match sub-balance with starting balances fully vested; excluded accounts zeroed with a note. Amended:

1. **Taxable cost basis includes reinvested after-tax dividends** (bug fix): basis += contributions + start-of-year balance × yield × (1 − dividend tax rate). See ASSUMPTIONS M9.
2. **Contribution markers fire on every change** — stop, reduce, resume, increase, and first-ever start.
3. **Capped contributions warn** — a note "X requested N, capped at M" every capped year.
4. **`Windfall.filer`** (optional, default filer 1) picks the owner for per-filer targets.
5. **Roth-destination match is contribution basis** (taxed as income when made).
6. **Return precedence**: scenario override beats per-account overrides for all invested accounts; cash always uses its own return.

### 7.3 M3 gate decisions (approved 2026-08-30)

Approved as documented: access rounding via end-of-year age ≥ ⌈access age⌉ (bias reworded to "±6 months of the true date," ASSUMPTIONS M7); surplus retirement income → cash (M23); windfalls land during drawdown (M24); preTax draw order filer 1 → filer 2, trad 401k → trad IRA; HSA medical = accessible at face but never auto-drawn, non-medical opens at 65; trad-401k rollover at max(drawdown start, age-60 year); $1M milestone real gross, FIRE milestones real ATE; Drawdown-tab Barista FIRE = fireNumber on (spend − part-time income at start); example file isolates cases via order restriction. Amended:

1. **Start-of-year flows index one year earlier** (bug fix): spending, one-time expenses, income rows, and ladder rows (P2) are priced at their year's START — `timing: 'startOfYear'` in the resolver, exponent (age − currentAge − 1); real display deflates them with the same exponent. Contributions and windfalls stay end-of-year. This makes the 4% rule literal: year-one draw = 4% of the starting balance (Trinity/Bengen, ASSUMPTIONS M25); SPEC §12's drawdown-flat test now pins the closed form to the cent.
2. **Auto drawdown start = earliest separation age + 1** — the separation year keeps its salary and end-of-year contributions (supersedes the M3 report's decision #9).
3. **Roth clock at rollover starts only if no Roth IRA was already funded** — an existing first-funded year governs (confirmed in code, now tested).
4. **`baristaIncomeTarget`** added to Assumptions (optional, default $0 → "—") for the Growth-tab Barista metric (§1.6).
