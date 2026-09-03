/**
 * The rate-arbitrage panel, milestones, and the plain-language readout
 * (SPEC §3 Drawdown sidebar).
 */

import { Card } from '@/components/ui/card';
import { latestAccessAgeF1 } from '../../engine/run';
import { timingExponent, toReal } from '../../engine/schedule';
import type { Assumptions, BridgeReport, RunResult } from '../../engine/types';
import type { DrawdownMetrics } from '../../state/derived';
import { fmtMoney0 } from './inputs';
import { formatSpans, type RunTiles } from './lens';

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

export function RateArbitragePanel({ a, run }: { a: Assumptions; run: RunResult | null }) {
  const now = a.marginalRateNow;
  // M7: in bracket mode the effective rate is an OUTPUT — the first drawdown
  // year with ordinary income shows its computed rate
  const bracketYear = a.taxMode === 'bracket'
    ? run?.years.find((y) => y.age >= run.drawdownStartAge && y.effectiveOrdinaryRate !== undefined)
    : undefined;
  const later = bracketYear?.effectiveOrdinaryRate ?? a.effectiveRetirementRate + a.stateTaxRate;
  const deltaCents = Math.round(Math.abs(now - later) * 100);
  const laterLabel =
    a.taxMode === 'bracket'
      ? bracketYear
        ? `this year (${bracketYear.age}): ${pct(later)} — computed from your brackets`
        : 'no ordinary income yet — computed from your brackets'
      : 'effective after access';
  const verdict =
    now > later
      ? `Deferring at ${pct(now)} and withdrawing at ${pct(later)} keeps ${deltaCents}¢ of every pre-tax dollar — on rates alone, traditional wins.`
      : now < later
        ? `You'd defer at ${pct(now)} but withdraw at ${pct(later)} — on rates alone, Roth wins.`
        : 'Rates match — traditional vs Roth is a wash on rates alone; limits and drag decide.';

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
        <div className="opacity-50">
          <div className="text-xl font-semibold">—</div>
          <div className="text-[11px] text-neutral-500">conversion years (Phase 2 ladder)</div>
        </div>
        <div>
          <div className="tnum text-xl font-semibold" data-testid="rate-later">{bracketYear || a.taxMode === 'simple' ? pct(later) : '—'}</div>
          <div className="text-[11px] text-neutral-500">{laterLabel}</div>
        </div>
      </div>
      <p className="text-xs leading-5 text-neutral-600 dark:text-neutral-400">{verdict}</p>
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
  tiles,
  real,
}: {
  run: RunResult;
  bridge: BridgeReport;
  metrics: DrawdownMetrics;
  coastAge: number | null;
  a: Assumptions;
  tiles: RunTiles;
  real: boolean;
}) {
  const s = run.summary;
  const D = run.drawdownStartAge;
  const latestAccess = latestAccessAgeF1(run, a);
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
        At {D}, <strong>{lockedPct}%</strong> of your money is locked until{' '}
        <strong>{latestAccess}</strong>
        {bridge.years.length > 0 && (
          <>
            ; bridge{' '}
            {s.bridgeFunded
              ? 'fully funded'
              : lastFunded !== null
                ? `funded through ${lastFunded}`
                : 'not funded'}
          </>
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
        {a.balances.taxable > 0 && a.balances.taxableBasis === undefined && (
          <> cost basis not entered — taxable withdrawals modeled tax-free.</>
        )}
      </p>
    </Card>
  );
}
