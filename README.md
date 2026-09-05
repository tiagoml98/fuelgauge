# FuelGauge

A client-side retirement and tax-strategy modeler. Enter your age, account balances, returns, taxes, and inflation, and see visually how each account grows. Save **growth scenarios** (contribution strategies) and **withdrawal strategies** (drawdown plans), then cross them in a compare grid to see how each combination plays out — including Roth conversion ladders, the mega-backdoor, RMDs, and honest breakeven comparisons between them.

**What the model does and doesn't do.** It is a deterministic year-by-year simulator, not an optimizer and not a probability engine: one growth scenario × one withdrawal strategy = one run, computed in nominal dollars and displayed real or nominal per toggle. It models seven accounts across four tax buckets, IRS contribution limits with catch-ups, employer match and vesting, access-age rules (59½, rule of 55, Roth clocks, conversion seasoning), two tax modes (flat "simple" and a bracket engine with marginal stacking, the 65+ deduction, and fill-to-bracket conversions), and forced RMDs with surplus routed to taxable. It deliberately does **not** model Monte Carlo outcomes, IRMAA, ACA subsidies, NIIT, phase-outs, state brackets, 72(t)/SEPP, survivor or inheritance rules — every simplification and the direction of bias it introduces is cataloged in [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md), which the app renders verbatim in its always-visible assumptions panel. It is an educational model, not tax or financial advice; confirm real decisions with a CPA.

## Running it

```sh
npm install
npm run dev                    # dev server (Vite)
npm test                       # engine + UI unit tests (Vitest)
npx playwright test            # e2e suite (starts its own server on port 5199)
npm run table -- <input.json>  # year-by-year per-account table for hand-checking
```

The table script prints nominal, real, and after-tax-equivalent sections plus per-topic
sections (`=== LADDER ===`, `=== RMD ===`, withdrawals, markers) for any exported state —
the same numbers the UI renders, reproducible by hand.

## Export / import

Everything lives in one `PersistedState` JSON — assumptions, every saved scenario and
strategy, and display state:

- **URL hash** — the app continuously serializes state into the address bar (compressed).
  Copy the URL to save or share a complete setup; opening it restores everything. No data
  ever leaves the browser.
- **Export JSON / import JSON** — buttons in the header write and read the same shape as a
  file. The files in `examples/` are exactly these exports, so any of them can be imported
  (or passed to `npm run table`).

## Example files

Each example in `examples/` is a hand-checkable fixture whose key numbers are verified to
the cent in the test suites:

| File | Demonstrates |
|---|---|
| `golden.json` | The M2 golden accumulation number: FV of $10k + $5k/yr at 7% over 10 years, to the cent |
| `spotcheck.json` | A fuller accumulation case — limits, match, splits, windfall markers |
| `drawdown.json` | Locked money and gap semantics: drawdown at 45 on pre-tax-heavy balances; rule-of-55 and Roth-clock cases; span summaries (funded / locked / depleted) |
| `bracket.json` | Bracket-mode hand-check: $2M pre-tax, $60k spending, $20k Social Security — year 65 gross-up 45,015.91 and tax 5,015.91 with the 65+ deduction, every number exact (r = 0) |
| `ladder.json` | Conversion-ladder hand-check: fill-to-12% converts 51,550 at 65, tax 5,800 paid from cash, unlock immediately at 60+; RMDs crowd out the fills from 75 |
| `ladder-motivation-a.json` | A ladder with **no outside money**: conversions pay their own tax with the 10% penalty — the in-app warning case |
| `ladder-motivation-b.json` | The ladder's purpose: outside money carries five bridge years, seasoned conversions take over — locked years collapse from 11 to 1, breakeven at 49 |
| `mega.json` | Mega-backdoor: 415(c) room = 72,000 − 24,500 deferral − 3,000 match = 44,500, landing as immediately-accessible Roth conversion tranches |
| `rmd.json` | RMD golden case: $1M pre-tax at 75 (born 1961) → 1,000,000 ÷ 24.6 = 40,650.41 forced, tax 2,452.05, surplus 8,198.36 pushed to taxable — and the "Convert before RMDs vs don't" preset |
| `fuelgauge.json` | A realistic full household export used in the invariant and chart-floor sweeps |

## Stack

- Vite + React + TypeScript, Tailwind CSS, shadcn/ui
- ECharts (echarts-for-react) for all charts
- Vitest (engine + UI units), Playwright (e2e)
- Pure client-side: no backend, no network calls, no data leaves the browser

## Project layout

- `SPEC.md` — the source of truth: what was built, in what order, updated to as-built at every gate
- `CLAUDE.md` — standing working rules for development
- `docs/VARIABLES.md` — every input: name, layer, unit, default, valid range, consuming engine step
- `docs/ASSUMPTIONS.md` — every simplification with its bias direction (rendered in-app)
- `src/engine/` — pure TypeScript simulation engine, no React imports
- `e2e/COVERAGE.md` — the e2e manifest: every field and control mapped to the test that exercises it

## Status

**v1.0-phase2** — Phases 1 and 2 complete per SPEC.md §14: accumulation and drawdown
engines, all three tabs, bracket mode, conversion ladder, mega-backdoor, and RMDs, each
approved at its gate.

## Disclaimer

This is an educational model built on simplifying assumptions. It is not financial or tax advice — confirm real decisions with a CPA.
