/**
 * The rate-arbitrage panel, milestones, and the plain-language readout
 * (SPEC §3 Drawdown sidebar).
 */

import { Card } from '@/components/ui/card';
import { latestAccessAgeF1 } from '../../engine/run';
import { timingExponent, toReal } from '../../engine/schedule';
import type { Assumptions, BridgeReport, RunResult, WithdrawalStrategy } from '../../engine/types';
import type { DrawdownMetrics } from '../../state/derived';
import { fmtMoney0 } from './inputs';
import { formatSpans, type RunTiles } from './lens';

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

/**
 * M9.1 #3/#6: why a ladder is inactive, and when an active one cannot help —
 * every tranche unlocking at/after the year everything opens anyway, or the
 * ladder paying its own tax with the penalty.
 */
export function ladderDiagnosis(
  run: RunResult | null,
  a: Assumptions,
  w: WithdrawalStrategy,
): { inactiveReason: string | null; caveat: string | null } {
  const rows = w.ladder ?? [];
  const activeYears = run?.years.filter((y) => y.ladder !== undefined) ?? [];
  let inactiveReason: string | null = null;
  if (rows.length > 0 && activeYears.length === 0 && run) {
    if (rows.every((r) => r.toAge !== null && r.fromAge > r.toAge)) inactiveReason = 'from > to';
    else if (rows.every((r) => r.fillToBracketPct !== undefined) && a.taxMode !== 'bracket')
      inactiveReason = 'fill rows need bracket mode';
    else inactiveReason = 'outside the drawdown window';
  }
  let caveat: string | null = null;
  if (run && activeYears.length > 0) {
    const openAge = latestAccessAgeF1(run, a, w.order);
    const openYear = a.currentYear + (openAge - a.filers[0].currentAge);
    const minUnlock = Math.min(...activeYears.map((y) => y.ladder!.unlockYear));
    const unlockAge = a.filers[0].currentAge + (minUnlock - a.currentYear);
    const totConv = activeYears.reduce((n, y) => n + (y.ladder?.converted ?? 0), 0);
    const convRate =
      totConv > 0.005 ? activeYears.reduce((n, y) => n + (y.ladder?.tax ?? 0), 0) / totConv : 0;
    const laterRate = run.ateRate;
    if (minUnlock >= openYear) {
      caveat =
        `this ladder unlocks at ${unlockAge}, when your pre-tax opens anyway — it can't shorten the bridge` +
        (convRate > laterRate + 0.0005
          ? `; conversions at ${pct(convRate)} cost more than withdrawals at ${pct(laterRate)}`
          : '');
    } else if (activeYears.some((y) => (y.ladder?.penalty ?? 0) > 0.005)) {
      caveat =
        'the ladder is paying its own tax with the 10% penalty — nothing left in cash/taxable; it may cost more than it unlocks';
    }
  }
  return { inactiveReason, caveat };
}

export function RateArbitragePanel({ a, run, w }: { a: Assumptions; run: RunResult | null; w: WithdrawalStrategy }) {
  const now = a.marginalRateNow;
  // M7 (+ M8 pre-work): in bracket mode the effective rate is an OUTPUT.
  // Early-retirement runs often draw no pre-tax for years — key on the FIRST
  // YEAR WITH PRE-TAX WITHDRAWALS and show the drawdown-wide average too.
  const bracket = a.taxMode === 'bracket';
  const drawYears = bracket && run ? run.years.filter((y) => y.age >= run.drawdownStartAge) : [];
  const firstPreTax = drawYears.find(
    (y) =>
      (y.withdrawals?.trad401k ?? 0) + (y.withdrawals?.tradIra ?? 0) > 0.005 &&
      y.effectiveOrdinaryRate !== undefined,
  );
  const totalOrdinary = drawYears.reduce((s, y) => s + (y.ordinaryIncome ?? 0), 0);
  const avg =
    totalOrdinary > 0.005
      ? drawYears.reduce((s, y) => s + (y.ordinaryTax ?? 0), 0) / totalOrdinary
      : null;
  const later = bracket
    ? (firstPreTax?.effectiveOrdinaryRate ?? avg ?? 0)
    : a.effectiveRetirementRate + a.stateTaxRate;
  const deltaCents = Math.round(Math.abs(now - later) * 100);
  const laterLabel = bracket
    ? firstPreTax
      ? `first pre-tax withdrawals (age ${firstPreTax.age}) — computed from your brackets`
      : 'no year draws pre-tax in this run'
    : 'effective after access';
  const verdict = !bracket || firstPreTax || avg !== null
    ? now > later
      ? `Deferring at ${pct(now)} and withdrawing at ${pct(later)} keeps ${deltaCents}¢ of every pre-tax dollar — on rates alone, traditional wins.`
      : now < later
        ? `You'd defer at ${pct(now)} but withdraw at ${pct(later)} — on rates alone, Roth wins.`
        : 'Rates match — traditional vs Roth is a wash on rates alone; limits and drag decide.'
    : 'This run pays no ordinary income tax in drawdown — there is nothing to arbitrage against.';

  return (
    <Card
      className="gap-2 p-4"
      data-testid="rate-arbitrage"
    >
      <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Rate arbitrage</h3>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="tnum text-xl font-semibold">{pct(now)}</div>
          <div className="text-[11px] text-neutral-500">marginal today</div>
        </div>
        {(() => {
          // M8: the ladder's average conversion rate fills the middle column;
          // M9.1 #6: rows that exist but never fire get the REASON, not
          // "no ladder rows"
          const conv = (run?.years ?? []).filter((y) => y.ladder !== undefined);
          const totConverted = conv.reduce((s, y) => s + (y.ladder?.converted ?? 0), 0);
          const totTax = conv.reduce((s, y) => s + (y.ladder?.tax ?? 0), 0);
          const { inactiveReason } = ladderDiagnosis(run, a, w);
          return totConverted > 0.005 ? (
            <div>
              <div className="tnum text-xl font-semibold" data-testid="rate-conversion">{pct(totTax / totConverted)}</div>
              <div className="text-[11px] text-neutral-500">
                conversion years ({conv[0].age}–{conv[conv.length - 1].age})
              </div>
            </div>
          ) : (
            <div className="opacity-50">
              <div className="text-xl font-semibold">—</div>
              <div className="text-[11px] text-neutral-500" data-testid="rate-ladder-state">
                {inactiveReason ? `ladder rows inactive — ${inactiveReason}` : 'conversion years (no ladder rows)'}
              </div>
            </div>
          );
        })()}
        <div>
          <div className="tnum text-xl font-semibold" data-testid="rate-later">
            {!bracket || firstPreTax ? pct(later) : '—'}
          </div>
          <div className="text-[11px] text-neutral-500">{laterLabel}</div>
        </div>
      </div>
      {bracket && avg !== null && (
        <p className="text-xs text-neutral-500" data-testid="rate-average">
          average over drawdown: {pct(avg)}
          {(() => {
            // M10: the rate the forced years actually pay — the RMD argument
            // for converting, made visible next to the conversion rate
            const rmdYears = drawYears.filter((y) => y.rmd !== undefined);
            const rmdGross = rmdYears.reduce(
              (t, y) => t + y.rmd!.entries.reduce((t2, e) => t2 + e.gross, 0),
              0,
            );
            const rmdTax = rmdYears.reduce(
              (t, y) => t + y.rmd!.entries.reduce((t2, e) => t2 + e.tax, 0),
              0,
            );
            return rmdGross > 0.005 ? (
              <span data-testid="rate-rmd-average"> · RMD years average: {pct(rmdTax / rmdGross)}</span>
            ) : null;
          })()}
        </p>
      )}
      <p className="text-xs leading-5 text-neutral-600 dark:text-neutral-400">{verdict}</p>
      {(() => {
        const { caveat } = ladderDiagnosis(run, a, w);
        return caveat ? (
          <p className="text-xs leading-5 text-amber-800 dark:text-amber-300" data-testid="ladder-caveat">
            {caveat}
          </p>
        ) : null;
      })()}
    </Card>
  );
}

function Milestone({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-neutral-100 py-1 text-sm last:border-0 dark:border-neutral-800">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="tnum font-medium text-neutral-800 dark:text-neutral-200">{value}</span>
    </div>
  );
}

export function MilestonesPanel({
  run,
  bridge,
  metrics,
  coastAge,
  a,
  w,
  tiles,
  real,
}: {
  run: RunResult;
  bridge: BridgeReport;
  metrics: DrawdownMetrics;
  coastAge: number | null;
  a: Assumptions;
  w: WithdrawalStrategy;
  tiles: RunTiles;
  real: boolean;
}) {
  const s = run.summary;
  const D = run.drawdownStartAge;
  const latestAccess = latestAccessAgeF1(run, a, w.order);
  const startRow = run.years.find((y) => y.age === D);
  const lockedPct =
    startRow && startRow.totalAte > 0 ? Math.round((startRow.locked / startRow.totalAte) * 100) : 0;
  const lastFunded = (() => {
    let last: number | null = null;
    for (const y of bridge.years) {
      if (y.gap > 0.005) break;
      last = y.age;
    }
    return last;
  })();
  const age = (v: number | null) => (v === null ? '—' : String(v));

  return (
    <Card className="gap-1 p-4">
      <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Milestones</h3>
      {metrics.usedStrategySpending !== undefined && (
        <p className="text-[11px] text-neutral-400" data-testid="milestones-fallback">
          using strategy spending ({fmtMoney0(metrics.usedStrategySpending)}) — no FIRE target set
        </p>
      )}
      <Milestone label="Full FIRE age" value={age(metrics.fullAge)} />
      <Milestone label="Barista FIRE age" value={age(metrics.baristaAge)} />
      <Milestone label="Coast FIRE age" value={age(coastAge)} />
      <Milestone label="$1M age (gross, real)" value={age(metrics.millionAge)} />
      <Milestone
        label="Bridge"
        value={s.bridgeFunded ? 'funded ✓' : `first gap at ${s.firstGapAge ?? '—'} ✗`}
      />
      <Milestone
        label="Margin over target at start"
        value={
          metrics.marginOverTarget === null
            ? '—'
            : `${metrics.marginOverTarget >= 0 ? '+' : ''}${Math.round(metrics.marginOverTarget * 100)}%`
        }
      />
      <p className="mt-2 text-xs leading-5 text-neutral-600 dark:text-neutral-400" data-testid="readout">
        {bridge.years.length > 0 ? (
          <>
            At {D}, <strong>{lockedPct}%</strong> of your money is locked until{' '}
            <strong>{latestAccess}</strong>; bridge{' '}
            {s.bridgeFunded
              ? 'fully funded'
              : lastFunded !== null
                ? `funded through ${lastFunded}`
                : 'not funded'}
          </>
        ) : (
          // M9.1 #4: no bridge → no locked-until sentence
          <>Everything is open at your drawdown start ({D}) — no bridge needed</>
        )}
        . <strong>{formatSpans(s.spans, a.horizonAge)}</strong>.
        {(() => {
          // M6.1 #2: attempted-vs-withdrawn during locked years
          const locked = s.spans.find((sp) => sp.kind === 'locked');
          if (!locked) return null;
          const y = run.years.find((yy) => yy.age === locked.from);
          if (!y || y.need === undefined) return null;
          const startAge = run.years[0].age;
          const attempted = real
            ? toReal(y.need, timingExponent(y.age - startAge, 'startOfYear'), a.inflation)
            : y.need;
          const withdrawn = Object.values(y.withdrawals ?? {}).reduce((sum, v) => sum + (v ?? 0), 0);
          return (
            <>
              {' '}
              During {locked.from}–{locked.to}, withdrawals attempted {fmtMoney0(attempted)}/yr —{' '}
              {withdrawn > 0.005 ? 'only partly accessible' : 'all sources locked'}.
            </>
          );
        })()}{' '}
        Lifetime after-tax spending {fmtMoney0(tiles.lifetimeAfterTaxSpending)} · cumulative tax{' '}
        {fmtMoney0(tiles.cumulativeTax)} ({tiles.lensLabel}).
        {(() => {
          // M10: forced withdrawals beyond spending — nominal, averaged over
          // the years that actually overflow, with their own average rate
          const surplusYears = run.years.filter((y) => (y.rmd?.toTaxable ?? 0) > 0.005);
          if (surplusYears.length === 0) return null;
          const from = surplusYears[0].age;
          const avgSurplus =
            surplusYears.reduce((t, y) => t + y.rmd!.toTaxable, 0) / surplusYears.length;
          const gross = surplusYears.reduce(
            (t, y) => t + y.rmd!.entries.reduce((t2, e) => t2 + e.gross, 0),
            0,
          );
          const tax = surplusYears.reduce(
            (t, y) => t + y.rmd!.entries.reduce((t2, e) => t2 + e.tax, 0),
            0,
          );
          return (
            <span data-testid="readout-rmd-surplus">
              {' '}
              From {from}, forced withdrawals exceed your spending by about{' '}
              {fmtMoney0(avgSurplus)}/yr (nominal), taxed at {pct(tax / gross)} and pushed into
              taxable.
            </span>
          );
        })()}
        {a.balances.taxable > 0 && a.balances.taxableBasis === undefined && (
          <> cost basis not entered — taxable withdrawals modeled tax-free.</>
        )}
        {(() => {
          const { caveat } = ladderDiagnosis(run, a, w);
          return caveat ? <> {caveat.charAt(0).toUpperCase() + caveat.slice(1)}.</> : null;
        })()}
      </p>
    </Card>
  );
}
