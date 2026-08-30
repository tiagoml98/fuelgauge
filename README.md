# fuelgauge

A client-side retirement and tax-strategy modeler. Enter your age, account balances, returns, taxes, and inflation, and see visually how each account grows. Save **growth scenarios** (contribution strategies) and **withdrawal strategies** (drawdown plans), then cross them in a compare grid to see how each combination plays out.

Deterministic simulator, not an optimizer. Educational model with simplifying assumptions — not tax advice.

## Stack

- Vite + React + TypeScript
- Tailwind CSS
- ECharts (echarts-for-react) for all charts
- Vitest for engine tests
- Pure client-side: no backend, no network calls, no data leaves the browser. State serializes to the URL hash and to JSON export/import.

## Commands

```sh
npm run dev                    # dev server
npm test                       # all engine tests
npm run table -- <input.json>  # year-by-year per-account table for hand-checking
```

## Project layout

- `SPEC.md` — the source of truth for what to build and in what order
- `CLAUDE.md` — standing working rules for development
- `docs/VARIABLES.md` — every input: name, layer, unit, default, valid range (produced in milestone M0)
- `docs/ASSUMPTIONS.md` — every simplification and the direction of bias it introduces (produced in milestone M0)
- `src/engine/` — pure TypeScript simulation engine, no React imports

## Status

Spec stage. Built milestone by milestone per SPEC.md §14, each ending at a review gate.

## Disclaimer

This is an educational model built on simplifying assumptions. It is not financial or tax advice — confirm real decisions with a CPA.
