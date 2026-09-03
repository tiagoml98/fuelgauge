# e2e coverage manifest (M4.5 A.2)

Every VARIABLES.md row, every UI control, and every PersistedState field, each mapped to the
test that exercises it. **Gate criterion: 100% of this manifest.** Regenerated and re-audited at
every UI milestone as controls are added (next audit: M5 Drawdown tab).

Conventions. `NI` = numeric-inputs.spec, `SE` = schedule-editors.spec, `LN` = lenses.spec,
`LT` = layout-tabs.spec, `PS` = persistence.spec, `EQ` = engine-equality.spec, `PO` =
polish.spec, `DD` = drawdown.spec, `CP` = compare.spec, `CM` = compare-manage.spec, `BS` = basis.spec, `BR` = bracket.spec, `LD` = ladder.spec, `MG` = mega.spec. Every test runs under the auto console guard (fixtures.ts): **zero console
errors/warnings after every interaction** or the test fails. `PS:maximal` = the maximal-state
round-trip, which sets every field to a non-default value and deep-equals it through hash →
reload → export → import. Per the CLAUDE.md UI-test rule, interaction tests assert
user-visible outcomes (positions, rendered text) from real pointer/keyboard input.
State reads are deterministic: the store raises `data-hash-pending` synchronously with every
change and clears it when the debounced hash write lands; `readState` waits on that flag —
never on hash-stability timing. The suite runs against its own strict-port dev server
(playwright.config webServer, port 5199, `reuseExistingServer: false`) so an ambient or stale
server can never be silently reused.

## 1. PersistedState fields (schema v1) — 68/68

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
| assumptions.taxMode | PS:maximal (bracket) · BR:mode-toggle (live select, switch → state) |
| assumptions.bracketTables (M7, optional — persisted only once edited) | PS:maximal (edited tables both statuses) · BR:mode-toggle (edit materializes, reset → absent) |
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
| growthScenarios[].perFiler[].megaBackdoor (M9 — moved per-filer, both row shapes) | PS:maximal · MG:editor (fixed + max rows → state) |
| growthScenarios[].windfalls (incl. filer owner) | PS:maximal (rothIra target, filer 1) |
| growthScenarios[].returnScheduleOverride | PS:maximal |
| strategies[].id/name/drawdownStartAge/spending/oneTimeExpenses/income/order | PS:maximal (all non-default incl. reordered order + SS row) |
| strategies[].ladder (M8) | PS:maximal (both row shapes) · LD:editor (add/edit both shapes, round-trip) |
| display.real / ate / byBuckets | PS:maximal · LN (each toggle) |
| display.theme | PS:maximal · LN:theme |
| display.yearlyTable | PS:maximal · LN:yearly |
| display.selectedScenarioId / selectedStrategyId | PS:maximal · LN:scenario-menu |
| display.panelWidth | PS:maximal · LT:divider-drag (real drag persists on release) |
| display.inputsTier | PS:maximal · LT:advanced-tier |
| display.basicsCollapsed | PO:basics-sections (collapse + reload persistence) |
| display.activeTab | DD:tab-switching (switch, reload persistence) · PS:maximal |
| growthScenarios[].experiment / strategies[].experiment (M6.1) | PS:maximal (scenario) · CM:experiments (spawn tags, keep clears, clear removes) |
| balances.taxableBasis / perFiler[].roth401kBasis / perFiler[].tradIraBasis — explicit-entry optional (M6.2 #1) | BS (all three: empty round-trip, placeholder, chip, clear, no auto-fill on balance edit) · PS:maximal (explicit on filer 1, ABSENT on filer 2 — absence round-trips) |
| strategies[].medical (M6.2 #2) | PS:maximal · DD:medical-slice (simple-mode entry → state → HSA-first draw) |
| display.hiddenScenarios / hiddenStrategies (M6.1) | PS:maximal · CM:visibility (hide → deselect → persist through reload) |
| display.compareSelection / compareBaseline | PS:maximal · CP:hand-case · CM:bulk-delete (cleaned on delete/hide) |

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

## 3. UI controls — 82/82

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
| Steppers: money ±1,000 / ⇧ ±10,000; age ±1; percent ±0.1; ↑/↓ keys; hold-to-repeat (value-wait while held + quiescence stop-proof); clamping | PO:stepper tests (×3) — applies to every DraftNumberInput-family field |
| Draft inputs never re-take focus after commit (late select-frame guard) | NI:late-focus-select — the race forced deterministically via trapped rAF |
| Hero readout statements — never split across lines at three widths | PO:hero-statements |
| Radius token scale — no pills; computed radii ≤ 6px on card/input/tab/button/badge + screenshot artifact | PO:radius |
| Card style variant B (M6.2 #4): borderless, shadowless, 4px radius, white/`#1b1b1a` fill on tinted page | PO:variant-b (computed border/shadow/radius/bg) |
| Overlay column scrollbars (M6.2 #4): stable gutter, appears on real wheel scroll, auto-hides ~1s idle | PO:scrollbars (gutter computed + data-scrolling set on scroll, gone via state wait) |
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
| Mega-backdoor editor (M9): live 415(c) room hint, fixed/max row types, over-room warning, disabled-with-reason | MG (all three tests) + unit room-arithmetic tests |
| Plan toggles now LIVE (labels de-P2'd) gating the mega editor | MG:disabled |
| Advanced: windfall editor (age/amount/target/filer/label/delete/add + today's-$ readout) | PS:maximal · LT:advanced-tier |
| Advanced: cash return / fees / dividend fields | PS:maximal |
| Advanced: scenario return override add/remove | PS:maximal |
| Advanced: tax fields | PS:maximal |
| Tax mode select — LIVE (M7): bracket hides the effective-rate input + its sensitivity row | BR:mode-toggle |
| Bracket editor (M7): standard deduction, per-bracket rate/upTo rows (blank = top), + bracket, delete, reset to current federal, LTCG flat note | BR:mode-toggle (edit → state, reset, 16,100 default rendered) |
| Rate-arbitrage computed line (M7 bracket, M8 pre-work): first pre-tax-withdrawal year's rate + "average over drawdown"; plain message when no year draws pre-tax | BR:hand-check (8.5% + average) · BR:no-pre-tax (— + 0.5% average) |
| Never-retires warning (M8 pre-work): Drawdown notice + Compare cell text when the auto start hits the horizon | BR:never-retires (both tabs; funding tile absent) |
| Equal-take-home guard (M8 pre-work): "Nothing to split" without a 401k schedule, no spawn | CP:equal-take-home (guard + spawn-with-schedule) |
| Crosshair effective-rate line (M7 bracket) | BR:hand-check (rendered at 65) |
| Advanced: 10 limit fields | PS:maximal · SE:limit-warning |
| Advanced: horizon/SWR/coast/barista/HSA treatment/coverage | PS:maximal |
| Advanced: plan toggles + access-age overrides | PS:maximal |
| Advanced sections (M6.2 #3, M6.3 hierarchy): three eyebrow sections — "Your details" / "Assumptions worth questioning" / "Reference & plan rules" (rarely changed, collapsed) with intros, groups nested by indent | LT:advanced-sections (containment per section, uppercase eyebrow computed, limits hidden until expanded; group titles unchanged) |
| Live sensitivity rows (M6.2 #3, M6.3 inline+structured): three-cell rows under their fields inside their groups — Coast FIRE at −1%/now/+1% return; trad-vs-Roth edge at −5/now/+5 pts | LT:advanced-sections — full cell text machine-checked vs engine + live reprice of the now-cell after editing the rate |
| Basis fields: explicit entry, chip, placeholder, clear control, readout line (M6.2 #1) | BS (three tests incl. the 99,871 reproduction + readout) |
| Hero figure + narrative (populated, unset-target, empty variants) | EQ:hero-metrics · LT:empty-state · LT:render-examples |
| Lens toggles ×3 (segmented, both states visible) | LN (one test each) |
| Chart: series values, crosshair tooltip readout incl. event lines | EQ:tooltip |
| Chart markers (N−0.5 regime / N one-time, short labels) | EQ:tooltip (IPO in readout) · unit markers/chart tests |
| Chart zoom/pan | EQ:tooltip (mouse interaction under console guard) |
| Balance table (both lenses, both granularities) | EQ:table · LN:yearly |
| Assumptions panel (?raw render + show all) | LT:empty-state (disclaimer) — panel content is doc-sourced |
| Error boundary + last-good banner | NI:invalid-schedule-row |

## 4. Drawdown-tab controls (M5 re-audit + M6.1 + M6.2 + M8) — 30/30

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
| Funding tile span summary — phases + collapsed "funded through H ✓" (M6.1 #2) | DD:locked (locked out 45–59 · funded 60+) · DD:swr-flat (funded through 90 ✓) |
| Two-tone gap shading + legend badge (amber locked / red depleted) (M6.1 #2) | DD:locked (badge text) — the washes are canvas paint, verified by QA screenshot |
| Bridge summary counts locked vs depleted apart (M6.1 #2) | DD:locked (15 locked years ✗) |
| Readout narrates phases + attempted-vs-withdrawn in locked years (M6.1 #2) | DD:locked (During 45–59, withdrawals attempted $40,000/yr) |
| Chart structure: buckets = 4 aggregate series (structurally seamless), accounts = per-account with year-step (M6.1 #1) | DD:bucket-series (data-series artifact both modes) |
| Medical slice editor "Medical spending (part of total)" (renamed M6.3) — HSA-first tax-free at any age (M6.2 #2) | DD:medical-slice (entry → rendered table row, engine equality, no gap) |
| HSA last resort — funded past pot-death, depleted only at HSA zero (M6.2 #2) | DD:hsa-last-resort (spans text, taxed draw in table, gap only at 89) + engine shape tests |
| Conversion-ladder rows editor (M8): type select $/fill, from/to, add/delete, simple-mode fill hint | LD:editor |
| Ladder withheld warning (M8): amber notice with withheld total + 10% penalty when cash/taxable are exhausted | LD:before-after-a + engine waterfall tests |
| Rate panel conversion column (M8): avg conversion rate over ladder years fills the middle slot | LD:hand-check (engine-derived %) |
| Bridge source stack (M8, SPEC §9-2.3): outside money / seasoned conversions / other + legend + data-bridge-sources artifact | LD:bridge-sources (conversions take over at the unlock year) |
| Conversion chart marker at N + crosshair event line | LD:hand-check (marker artifact kind 'conversion') |

## 5. Compare-tab controls (M6 re-audit + M6.1 + M7 + M8) — 24/24

`CP` = compare.spec, `CM` = compare-manage.spec. All under the console guard.

| Control | Test |
|---|---|
| Compare tab nav + activeTab='compare' persistence | CP (loads via state) · DD:tab-switching pattern |
| Grid cells (compact 2-col metrics, lens rule, no-spending state, error state) | CP:cell-metrics (both lenses, engine equality) |
| Cell selection toggle + selection ring/color dot | CP:hand-case · CP:baseline-deltas |
| Lens toggles on the grid | CP:cell-metrics |
| Overlay chart + crossover markers + data-crossovers artifact | CP:hand-case (66, machine-checked) · CP:retire-pair (correctly none) |
| Baseline picker (≥ 2 distinct runs only) | CP:baseline-deltas · CM:single-cell (absent with 1) |
| Delta table (signed, lens rule; never a self-delta) | CP:hand-case · CP:baseline-deltas · CM:single-cell (absent with 1) |
| Preset: Traditional vs Roth equal take-home + §8 driver note | CP:equal-take-home + unit presets tests |
| Preset note, bracket mode (M7): computed average rates per path, no constant-ratio claim | BR:preset-note |
| Ladder preset (M8, SPEC §9-2.4): amount + from-age inputs, spawns outside/ladder pair as experiments; honest note — breakeven age or its absence, access/rate/cost drivers, valuation-lens disclosure (bracket) or lens-neutral statement (simple) | LD:before-after-b (breakeven 49, spans 11→1 locked) · LD:valuation-lens |
| Preset: stop contributing at X (age input) | CP:normalized-presets |
| Preset: reduce 401k to Y at Z (two inputs) | CP:normalized-presets |
| Preset: retire at X vs Y (two inputs) | CP:retire-pair |
| Preset: stress first 3 drawdown years | CP:normalized-presets (exact rows) |
| Ladder-bridge P2 note (not faked) | CP:normalized-presets |
| Empty state (0 selected) + ?mockup routes removed | CP:baseline-deltas · rendered by default state |
| Count badge (N scenarios × M strategies · hidden · experiments) (M6.1 #3d) | CM:bulk-delete · CM:visibility · CM:experiments |
| Manage mode: multi-select checkboxes, one-confirm batch delete, cleaned selections, URL round-trip (M6.1 #3a) | CM:bulk-delete + unit store bulkDelete tests |
| Eye toggles per row/column + show all + hide all but selected (M6.1 #3b) | CM:visibility + unit store setHidden tests |
| Everything-hidden honest empty state (M6.1 #3b) | CM:visibility |
| Experiments: spawn-tagged, grouped last under divider, exp badge, keep promotes, clear removes incl. URL (M6.1 #3c) | CM:experiments · CP:equal-take-home (divider + keep) + unit store keep/clear tests |
| Degenerate single-axis table + sortable metric headers + grid restore at ≥2×2 (M6.1 #4) | CM:sort · CM:visibility (grid↔table flip) · CP:cell-metrics |
| Funding span column/row in cells (M6.1 #2) | CP:cell-metrics (locked + clean span text) |
| Single-cell overlay: curve + hint, no baseline tag, no deltas, no crossovers (M6.1 #5) | CM:single-cell |

Display fields `compareSelection` / `compareBaseline` / `hiddenScenarios` / `hiddenStrategies`: §1 rows (PS:maximal + CP/CM set-and-read-back).

**Manifest: 294/294 items covered (73 state fields + 72 VARIABLES rows + 94 Growth + 30 Drawdown + 24 Compare + 1 route-removal check). M8 re-audit noted previously; M9 re-audit: +1 VARIABLES row (mega rows), +2 Growth-panel items (mega editor, live plan toggles); megaBackdoor flips from absence-pinned to populated per-filer round-trip. M7 re-audit: +1 state field (bracketTables), +4 Growth-panel items (live tax-mode select, bracket editor, rate-arbitrage computed line, crosshair effective-rate line), +1 Compare item (bracket preset note) over the M6.3 count of 277. Engine-side reconciliation: `npm run table -- examples/bracket.json` prints the hand-check year with ordInc/effRate columns.**
