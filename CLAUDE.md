# CLAUDE.md

## Project
Client-side retirement and tax-strategy modeler. `SPEC.md` is the source of truth — read it before doing anything. `docs/VARIABLES.md` and `docs/ASSUMPTIONS.md` (produced in milestone M0) define every input and every simplification.

## Stack
Vite + React + TypeScript, Tailwind, ECharts (echarts-for-react), Vitest. Pure client-side; no backend, no network calls, no data leaves the browser.

## Commands
- `npm run dev` — dev server
- `npm test` — all engine tests
- `npm run table -- <input.json>` — print a year-by-year per-account table for hand-checking

## Working rules
- Work one milestone at a time, in the order in SPEC.md §14. Use plan mode at the start of each milestone and show the plan before touching files. Stop at the gate and wait for approval.
- Engine before UI. `src/engine/` never imports React. Every engine change comes with a test; a bug report becomes a failing test before it becomes a fix.
- Every default value lives in `src/engine/defaults.ts`. No magic numbers elsewhere.
- Every simplifying assumption lives in `docs/ASSUMPTIONS.md` and in the in-app assumptions panel. Add to both in the same commit.
- All money is computed in nominal dollars internally. Real vs nominal is a display concern. Real return = (1+r)/(1+i) − 1.
- Do not add scope beyond SPEC.md. If something seems necessary, propose it in the gate report.
- Gate report format: what was built; test count and status; how to run it; exactly what to check; any assumption made that isn't in the spec.
- The spec section for a milestone is updated to match what was built before its gate report.
- When a gate approval includes fixes, land them in their own commit and report the verification numbers before starting the next milestone.
- UI milestones require a green e2e suite at 100% manifest coverage (e2e/COVERAGE.md) and an exploratory browser QA pass with console-error monitoring before the gate report.
- UI tests must assert user-visible outcomes (element positions, rendered text, what's on screen after a real pointer/scroll/keyboard interaction), not internal state or programmatic APIs. If a feature can fail by hand while its test passes, the test is wrong and gets rewritten alongside the fix.
