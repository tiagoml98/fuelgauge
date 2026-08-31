/**
 * The rate-arbitrage panel, milestones, and the plain-language readout
 * (SPEC §3 Drawdown sidebar).
 */

import { Card } from '@/components/ui/card';
import { latestAccessAgeF1 } from '../../engine/run';
import type { Assumptions, BridgeReport, RunResult } from '../../engine/types';
import type { DrawdownMetrics } from '../../state/derived';
import { fmtMoney0 } from './inputs';

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

export function RateArbitragePanel({ a }: { a: Assumptions }) {
  const now = a.marginalRateNow;
  const later = a.effectiveRetirementRate + a.stateTaxRate;
  const deltaCents = Math.round(Math.abs(now - later) * 100);
  const verdict =
    now > later
      ? `Deferring at ${pct(now)} and withdrawing at ${pct(later)} keeps ${deltaCents}¢ of every pre-tax dollar — on rates alone, traditional wins.`
      : now < later
        ? `You'd defer at ${pct(now)} but withdraw at ${pct(later)} — on rates alone, Roth wins.`
        : 'Rates match — traditional vs Roth is a wash on rates alone; limits and drag decide.';

  return (
    <Card
      className="gap-2 rounded-lg border-neutral-200 bg-white p-4 shadow-none dark:border-neutral-800 dark:bg-neutral-900"
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
          <div className="tnum text-xl font-semibold">{pct(later)}</div>
          <div className="text-[11px] text-neutral-500">effective after access</div>
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
}: {
  run: RunResult;
  bridge: BridgeReport;
  metrics: DrawdownMetrics;
  coastAge: number | null;
  a: Assumptions;
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
    <Card className="gap-1 rounded-lg border-neutral-200 bg-white p-4 shadow-none dark:border-neutral-800 dark:bg-neutral-900">
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
        . Lifetime after-tax spending {fmtMoney0(s.lifetimeAfterTaxSpending)} · cumulative tax{' '}
        {fmtMoney0(s.cumulativeTax)}.
      </p>
    </Card>
  );
}
