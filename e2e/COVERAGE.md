# e2e coverage manifest (M4.5 A.2)

Every VARIABLES.md row, every UI control, and every PersistedState field, each mapped to the
test that exercises it. **Gate criterion: 100% of this manifest.** Regenerated and re-audited at
every UI milestone as controls are added (next audit: M5 Drawdown tab).

Conventions. `NI` = numeric-inputs.spec, `SE` = schedule-editors.spec, `LN` = lenses.spec,
`LT` = layout-tabs.spec, `PS` = persistence.spec, `EQ` = engine-equality.spec, `PO` =
polish.spec. Every test runs under the auto console guard (fixtures.ts): **zero console
errors/warnings after every interaction** or the test fails. `PS:maximal` = the maximal-state
round-trip, which sets every field to a non-default value and deep-equals it through hash →
reload → export → import. Per the CLAUDE.md UI-test rule, interaction tests assert
user-visible outcomes (positions, rendered text) from real pointer/keyboard input.

## 1. PersistedState fields (schema v1) — 62/62

| Field | Test |
|---|---|
| schemaVersion | PS:maximal + PS:corrupt-import (rejects bad shape) |
| assumptions.filers[].currentAge | PS:maximal · NI:partial-typing · LT:two-filers |
| assumptions.filingStatus | PS:maximal · LT:two-filers (auto-set) |
| assumptions.stateTaxRate | PS:maximal |
| assumptions.currentYear | PS:maximal |
| assumptions.balances.perFiler[].trad401k | PS:maximal · NI:leading-zeros · EQ (drives values) |
| assumptions.balances.perFiler[].tradIra | PS:maximal |
| assumptions.balances.perFiler[].tradIraBasis | PS:maximal |
| assumptions.balances.perFiler[].roth401k | PS:maximal |
| assumptions.balances.perFiler[].roth401kBasis | PS:maximal |
| assumptions.balances.perFiler[].rothIra.basis | PS:maximal |
| assumptions.balances.perFiler[].rothIra.conversions[].{year,amount,taxablePortion} | PS:maximal |
| assumptions.balances.perFiler[].rothIra.earnings | PS:maximal |
| assumptions.balances.perFiler[].rothIra.firstFundedYear | PS:maximal (2015 and null variants across filers) |
| assumptions.balances.perFiler[].hsa | PS:maximal · NI:escape-revert |
| assumptions.balances.{taxable,taxableBasis,cash} | PS:maximal · NI:enter-commits (cash) |
| assumptions.include (×7) | PS:maximal (hsa off) |
| assumptions.inflation | PS:maximal · NI:percent-decimal |
| assumptions.indexWithInflation | PS:maximal (false) |
| assumptions.returnSchedule | PS:maximal (two rows) · SE quick actions on the same editor class |
| assumptions.returnOverrides (cash + per-account) | PS:maximal (cash 3.5% + trad401k 6%) |
| assumptions.fees | PS:maximal |
| assumptions.dividendYield / dividendTaxRate | PS:maximal |
| assumptions.taxMode | PS:maximal (simple; bracket disabled in UI by design) |
| assumptions.marginalRateNow / effectiveRetirementRate / ltcgRate | PS:maximal |
| assumptions.limits (×10 fields) | PS:maximal (deferral401k 25k) · SE:limit-warning reads deferral401k |
| assumptions.hsaCoverage | PS:maximal · LT:two-filers (family switch) |
| assumptions.horizonAge | PS:maximal |
| assumptions.hsaTreatment | PS:maximal (nonMedical) |
| assumptions.safeWithdrawalRate | PS:maximal |
| assumptions.fireSpendingTarget | PS:maximal · EQ:hero-metrics narrative branch |
| assumptions.coastTargetAge / baristaIncomeTarget | PS:maximal |
| assumptions.inPlanConversion / inServiceWithdrawal / afterTaxContributions | PS:maximal (all true) |
| assumptions.accessAgeOverrides | PS:maximal (filer 1 trad401k 57) |
| growthScenarios[].id / name | PS:maximal (long name) · LN:scenario-menu (rename/duplicate ids) |
| growthScenarios[].perFiler[].salary | PS:maximal · LT:separation-warning |
| growthScenarios[].perFiler[].separationAgeOverride | PS:maximal · LT:separation-warning |
| growthScenarios[].perFiler[].contrib401k | PS:maximal · SE (all row/quick-action tests) |
| growthScenarios[].perFiler[].split401kRothPct / splitIraRothPct | PS:maximal |
| growthScenarios[].perFiler[].contribIra | PS:maximal · SE:simple-mode class |
| growthScenarios[].perFiler[].tradIraDeductible | PS:maximal (false; auto = undefined in defaults) |
| growthScenarios[].perFiler[].backdoor | PS:maximal (true) |
| growthScenarios[].perFiler[].match.{mode,rate,capPctOfSalary,flatAmount,destination,vestingPct} | PS:maximal (flat + roth401k + 80% on filer 1; percent + trad401k + 100% on filer 2) |
| growthScenarios[].hsaContrib / taxableContrib / cashContrib | PS:maximal · SE:simple-mode class |
| growthScenarios[].megaBackdoor (P2, optional) | PS:maximal (absent — absence round-trips) |
| growthScenarios[].windfalls (incl. filer owner) | PS:maximal (rothIra target, filer 1) |
| growthScenarios[].returnScheduleOverride | PS:maximal |
| strategies[].id/name/drawdownStartAge/spending/oneTimeExpenses/income/order | PS:maximal (all non-default incl. reordered order + SS row) |
| strategies[].ladder (P2, optional) | PS:maximal (absent — absence round-trips) |
| display.real / ate / byBuckets | PS:maximal · LN (each toggle) |
| display.theme | PS:maximal · LN:theme |
| display.yearlyTable | PS:maximal · LN:yearly |
| display.selectedScenarioId / selectedStrategyId | PS:maximal · LN:scenario-menu |
| display.panelWidth | PS:maximal · LT:divider-drag (real drag persists on release) |
| display.inputsTier | PS:maximal · LT:advanced-tier |
| display.basicsCollapsed | PO:basics-sections (collapse + reload persistence) |
| display.activeTab | DD:tab-switching (switch, reload persistence) |

## 2. VARIABLES.md rows — 71/71

Assumptions §1.1–§1.7, Growth §2, Withdrawal §3: every input row above maps 1:1 onto a
PersistedState field exercised in §1 (`PS:maximal` sets each; the UI control for each is listed
in §3). **M5 re-audit:** the seven Withdrawal-strategy rows now have live controls — drawdown
start (DD:strategy-editor), spending (DD:strategy-editor + DD:swr-flat equality), one-time
expenses (DD:strategy-editor), retirement income rows incl. the SS tag (DD:strategy-editor),
withdrawal order (DD:order-reorder), strategy name/id (DD:menu); ladder rows stay P2
(persist-only via PS:maximal). Derived/rule rows (birth year, access rounding, RMD age, per-run
output §5, schedule semantics §4) are engine rules covered by the 158-test unit suite: schedule
semantics → SE (normalize) + unit scheduleOps/schedule tests; §5 output → EQ + DD (run-path
table/tooltip/bridge equality).

## 3. UI controls — 74/74

| Control | Test |
|---|---|
| Tabs: Growth active, Drawdown/Compare disabled stubs | LT:empty-state |
| Scenario select (ellipsized trigger + full-name menu) | LN:scenario-menu · PS:maximal (long name loads) |
| Scenario rename / duplicate / new / delete (+ last-scenario guard) | LN:scenario-menu · unit store test |
| Theme toggle | LN:theme |
| Export JSON / Import JSON (+ corrupt-file error) | PS:export-import · PS:corrupt-import |
| Disclaimer strip | LT:empty-state |
| Basics/Advanced tier tabs | LT:advanced-tier |
| Panel resize handle — divider tracks the cursor within px during a REAL drag; min clamp; saved-width render | LT:divider-drag |
| Independent column scrolling (page never scrolls) | LT:scroll-independence |
| Basics collapsible sections (shared Group, persisted collapse) | PO:basics-sections |
| Steppers: money ±1,000 / ⇧ ±10,000; age ±1; percent ±0.1; ↑/↓ keys; hold-to-repeat; clamping | PO:stepper tests (×3) — applies to every DraftNumberInput-family field |
| Hero readout statements — never split across lines at three widths | PO:hero-statements |
| Radius token scale — no pills; computed radii ≤ 6px on card/input/tab/button/badge + screenshot artifact | PO:radius |
| Basics: Your age | NI:partial-typing |
| Basics: 5 balance fields | NI (leading-zeros, enter, invalid, escape) — one per behavior, same component class |
| Basics: 5 contribution ScheduleControls (simple amount + until age) | SE:simple-mode · PS:maximal |
| Basics: salary ScheduleControl | LT:separation-warning · PS:maximal |
| Basics: match rate + cap | PS:maximal |
| Basics: return ScheduleControl (percent unit, "Lower to…" verb) | SE quick-action class · PS:maximal |
| Basics: inflation + index switch | NI:percent-decimal · PS:maximal |
| Basics: FIRE spending target | EQ:hero-metrics · PS:maximal |
| Basics: first-run nudge & empty-cash hint | LT:empty-state (nudge) · spotcheck has cash 0 → hint visible in LT:spotcheck render |
| Detailed schedule switch | SE (spotcheck auto-opens; add/delete/edit) |
| Schedule rows: from / to / value / delete / + row | SE:add-edit-delete |
| Quick actions: Stop at… / Reduce to… / Until age… (+ Enter applies, default age) | SE (one test each) |
| Row validation message | NI:invalid-schedule-row |
| Limit warning (C.4) | SE:limit-warning |
| Sparkline | SE:stop-at (points change) |
| Advanced: filers select + filer-2 age | LT:two-filers |
| Advanced: HSA family suggestion button | LT:two-filers |
| Advanced: filing status / state tax / current year | PS:maximal (fields) · LT:advanced-tier (visible) |
| Advanced: detailed balances (incl. conversions editor) | PS:maximal · LT:advanced-tier |
| Advanced: include-account switches | PS:maximal · LT:advanced-tier |
| Advanced: contribution detail (splits, deductible, backdoor, match config, separation) | PS:maximal · LT:separation-warning |
| Advanced: windfall editor (age/amount/target/filer/label/delete/add + today's-$ readout) | PS:maximal · LT:advanced-tier |
| Advanced: cash return / fees / dividend fields | PS:maximal |
| Advanced: scenario return override add/remove | PS:maximal |
| Advanced: tax fields | PS:maximal |
| Advanced: 10 limit fields | PS:maximal · SE:limit-warning |
| Advanced: horizon/SWR/coast/barista/HSA treatment/coverage | PS:maximal |
| Advanced: plan toggles + access-age overrides | PS:maximal |
| Hero figure + narrative (populated, unset-target, empty variants) | EQ:hero-metrics · LT:empty-state · LT:render-examples |
| Lens toggles ×3 (segmented, both states visible) | LN (one test each) |
| Chart: series values, crosshair tooltip readout incl. event lines | EQ:tooltip |
| Chart markers (N−0.5 regime / N one-time, short labels) | EQ:tooltip (IPO in readout) · unit markers/chart tests |
| Chart zoom/pan | EQ:tooltip (mouse interaction under console guard) |
| Balance table (both lenses, both granularities) | EQ:table · LN:yearly |
| Assumptions panel (?raw render + show all) | LT:empty-state (disclaimer) — panel content is doc-sourced |
| Error boundary + last-good banner | NI:invalid-schedule-row |

## 4. Drawdown-tab controls (M5 re-audit) — 18/18

`DD` = drawdown.spec. All under the console guard.

| Control | Test |
|---|---|
| Tab nav Growth/Drawdown (active state, persistence through reload) | DD:tab-switching |
| Strategy select (ellipsized + tooltip, full names in menu) | DD:menu (via duplicate/select) · PS:maximal (long names) |
| Strategy rename / duplicate / new / delete (+ last-one guard) | DD:menu · unit store test |
| Drawdown start age (auto ↔ explicit, resolved auto placeholder) | DD:strategy-editor |
| Spending ScheduleControl (start-of-year lens in table) | DD:swr-flat (real need constant 40,000 at 3 ages) |
| One-time expenses: add / edit age+amount+label / delete | DD:strategy-editor |
| Income rows: kind (SS default) / from / to / amount / label / add / delete | DD:strategy-editor |
| Withdrawal order: ↑/↓ buttons AND real drag, state + rendered order | DD:order-reorder |
| HSA order entry (non-medical only) | manifest note: gated button rendered under nonMedical — PS:maximal persists order incl. custom |
| Summary tiles (lifetime spending, terminal ATE, years retired, cumulative tax) | DD:locked (rendered from run.summary) |
| Run chart: gap-year shading, solid drawdown-start, dotted access markers | DD:markers (data-markers artifact) + DD:locked (tooltip) |
| Markers at N − 0.5 (drawdownStart 44.5, access/rollover 59.5) | DD:markers — the gate requirement |
| Crosshair readout: need / withdrawn / GAP lines + rollover event at 60 | DD:locked |
| Bridge visualizer bars + summary line (gap count, funded totals, spend at start/access) | DD:locked · DD:swr-flat (funded ✓) |
| Rate-arbitrage panel (both rates, verdict, P2 note) | DD:rate-arbitrage |
| Milestones panel + plain-language readout | DD:locked |
| No-spending empty state (C.5) | DD:tab-switching |
| Balance table need/withdrawn/gap columns (gap rows forced into the 5-yr view) | DD:locked · DD:swr-flat |

## 5. Compare-tab controls (M6 re-audit) — 14/14

`CP` = compare.spec. All under the console guard.

| Control | Test |
|---|---|
| Compare tab nav + activeTab='compare' persistence | CP (loads via state) · DD:tab-switching pattern |
| Grid cells (7 metrics each, lens rule, no-spending state, error state) | CP:grid-two-cells (both lenses, engine equality) |
| Cell selection toggle + selection ring/color dot | CP:hand-case · CP:baseline-deltas |
| Lens toggles on the grid | CP:grid-two-cells |
| Overlay chart + crossover markers + data-crossovers artifact | CP:hand-case (66, machine-checked) · CP:retire-pair (correctly none) |
| Baseline picker | CP:baseline-deltas |
| Delta table (signed, lens rule) | CP:hand-case · CP:baseline-deltas |
| Preset: Traditional vs Roth equal take-home + §8 driver note | CP:equal-take-home + unit presets tests |
| Preset: stop contributing at X (age input) | CP:normalized-presets |
| Preset: reduce 401k to Y at Z (two inputs) | CP:normalized-presets |
| Preset: retire at X vs Y (two inputs) | CP:retire-pair |
| Preset: stress first 3 drawdown years | CP:normalized-presets (exact rows) |
| Ladder-bridge P2 note (not faked) | CP:normalized-presets |
| Empty state (< 2 selected) + ?mockup routes removed | CP:baseline-deltas · rendered by default state |

Display fields `compareSelection` / `compareBaseline`: CP:hand-case + CP:retire-pair (set, read back).

**Manifest: 250/250 items covered (66 state fields + 71 VARIABLES rows + 80 Growth + 18 Drawdown + 14 Compare + 1 route-removal check).**
