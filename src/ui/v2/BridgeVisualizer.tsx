/**
 * Bridge visualizer (SPEC §3): one bar per year from drawdown start to the
 * latest access age — funded stacked BY SOURCE (M8, SPEC §9-2.3: outside
 * money carries the first years, seasoned conversions take over), gap red
 * (status color; the text summary carries the state so color is never alone).
 */

import { Card } from '@/components/ui/card';
import ReactECharts from 'echarts-for-react';
import { useMemo } from 'react';
import { timingExponent, toReal } from '../../engine/schedule';
import type { Assumptions, BridgeReport, DisplayState, RunResult, RunYear } from '../../engine/types';
import { CHROME } from '../theme/colors';
import { fmtMoney0 } from './inputs';
import { lensBridge } from './lens';

const GOOD = '#0ca30c';
const CRITICAL = '#d03b3b';
/** Source-group hues: outside money, seasoned conversions (Roth hue), other. */
const OUTSIDE = '#0ca30c';
const CONVERSIONS = '#1baf7a';
const OTHER = '#6da7ec';

/** M8: the funded bar split into the three SPEC §9-2.3 source groups (net $). */
function sourceGroups(y: RunYear | undefined): { outside: number; conversions: number; other: number } {
  const s = y?.withdrawalsBySource ?? {};
  const outside = (s.cash ?? 0) + (s.taxable ?? 0);
  const conversions = s.seasonedConversions ?? 0;
  const other = (s.preTax ?? 0) + (s.rothBasis ?? 0) + (s.rothEarnings ?? 0) + (s.hsa ?? 0);
  return { outside, conversions, other };
}

export function BridgeVisualizer({
  bridge: bridgeNominal,
  run,
  display,
  a,
}: {
  bridge: BridgeReport;
  run: RunResult;
  display: DisplayState;
  a: Assumptions;
}) {
  const chrome = CHROME[display.theme];
  // M5.5 item 1: totals and bars follow the display lens — real sums in
  // today's-$ mode, never a sum of dollars from different years
  const bridge = useMemo(
    () => lensBridge(bridgeNominal, run, a, display.real),
    [bridgeNominal, run, a, display.real],
  );
  // M8: per-year source stacks, deflated with the SAME start-of-year exponent
  // as the funded bar so real-mode stacks still sum exactly
  const stacks = useMemo(() => {
    const startAge = run.years[0]?.age ?? 0;
    return bridge.years.map((y) => {
      const raw = sourceGroups(run.years.find((yy) => yy.age === y.age));
      if (!display.real) return { age: y.age, ...raw };
      const deflate = (v: number) =>
        toReal(v, timingExponent(y.age - startAge, 'startOfYear'), a.inflation);
      return {
        age: y.age,
        outside: deflate(raw.outside),
        conversions: deflate(raw.conversions),
        other: deflate(raw.other),
      };
    });
  }, [bridge.years, run.years, display.real, a.inflation]);
  const anyConversions = stacks.some((s) => s.conversions > 0.005);
  const gapYears = bridge.years.filter((y) => y.gap > 0.005);
  const kindAt = (age: number) => run.years.find((y) => y.age === age)?.gapKind;
  const lockedCount = gapYears.filter((y) => kindAt(y.age) === 'locked').length;
  const depletedCount = gapYears.length - lockedCount;
  const lastFunded = (() => {
    let last: number | null = null;
    for (const y of bridge.years) {
      if (y.gap > 0.005) break;
      last = y.age;
    }
    return last;
  })();

  const option = useMemo(
    () => ({
      backgroundColor: 'transparent',
      animation: false,
      grid: { left: 64, right: 24, top: 26, bottom: 28 },
      legend: {
        top: 0,
        left: 0,
        icon: 'roundRect',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: chrome.inkSecondary, fontSize: 10 },
        data: ['outside money', 'seasoned conversions', 'other sources', 'gap'],
      },
      xAxis: {
        type: 'category',
        data: bridge.years.map((y) => String(y.age)),
        axisLine: { lineStyle: { color: chrome.axis } },
        axisTick: { show: false },
        axisLabel: { color: chrome.inkMuted, fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: chrome.grid, width: 1 } },
        axisLabel: {
          color: chrome.inkMuted,
          fontSize: 10,
          formatter: (v: number) => `$${Math.round(v / 1000)}k`,
        },
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: chrome.surface,
        borderColor: chrome.grid,
        textStyle: { color: chrome.inkPrimary, fontSize: 11 },
        formatter: (params: Array<{ dataIndex: number }>) => {
          const i = params[0]?.dataIndex ?? 0;
          const y = bridge.years[i];
          const s = stacks[i];
          if (!y) return '';
          const line = (label: string, v: number, color?: string) =>
            v > 0.005
              ? `<br/><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:6px"></span>${label} ${fmtMoney0(v)}`
              : '';
          return (
            `<b>Age ${y.age}</b><br/>need ${fmtMoney0(y.need)}<br/>funded ${fmtMoney0(y.funded)}` +
            line('outside money', s?.outside ?? 0, OUTSIDE) +
            line('seasoned conversions', s?.conversions ?? 0, CONVERSIONS) +
            line('other sources', s?.other ?? 0, OTHER) +
            (y.gap > 0.005
              ? `<br/><span style="color:${CRITICAL};font-weight:600">GAP ${fmtMoney0(y.gap)}</span>`
              : '')
          );
        },
      },
      series: [
        {
          name: 'outside money',
          type: 'bar' as const,
          stack: 'bridge',
          data: stacks.map((s) => s.outside),
          color: OUTSIDE,
          barCategoryGap: '25%',
          itemStyle: { borderColor: chrome.surface, borderWidth: 1 },
        },
        {
          name: 'seasoned conversions',
          type: 'bar' as const,
          stack: 'bridge',
          data: stacks.map((s) => s.conversions),
          color: CONVERSIONS,
          itemStyle: { borderColor: chrome.surface, borderWidth: 1 },
        },
        {
          name: 'other sources',
          type: 'bar' as const,
          stack: 'bridge',
          data: stacks.map((s) => s.other),
          color: OTHER,
          itemStyle: { borderColor: chrome.surface, borderWidth: 1 },
        },
        {
          name: 'gap',
          type: 'bar' as const,
          stack: 'bridge',
          data: bridge.years.map((y) => y.gap),
          color: CRITICAL,
          itemStyle: { borderRadius: [3, 3, 0, 0], borderColor: chrome.surface, borderWidth: 1 },
        },
      ],
    }),
    [bridge, stacks, chrome],
  );

  return (
    <Card className="gap-1 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          Bridge — accessible money vs need until everything opens
        </h3>
        <span className="text-[11px] text-neutral-500 tnum">
          spend at start {fmtMoney0(bridge.spendAtStart)} · at access {fmtMoney0(bridge.spendAtAccess)} ({bridge.lensLabel})
        </span>
      </div>
      <p className="text-xs text-neutral-500" data-testid="bridge-summary">
        {bridge.years.length > 0 ? (
          <>
            bridge {bridge.years[0].age}–{bridge.years[bridge.years.length - 1].age}:{' '}
            {gapYears.length === 0 ? (
              <span className="font-semibold" style={{ color: GOOD }}>
                fully funded ✓
              </span>
            ) : (
              // M6.1 #2: the bridge counts LOCKED years specifically —
              // depletion inside the window is a different failure, named apart
              <span className="font-semibold" style={{ color: CRITICAL }}>
                {lockedCount > 0 && `${lockedCount} locked year${lockedCount === 1 ? '' : 's'} ✗`}
                {lockedCount > 0 && depletedCount > 0 && ' · '}
                {depletedCount > 0 && `${depletedCount} depleted (not a bridge problem)`}
              </span>
            )}{' '}
            — {fmtMoney0(bridge.totalFunding)} of {fmtMoney0(bridge.totalCost)} funded
            {lastFunded !== null && gapYears.length > 0 ? `, funded through ${lastFunded}` : ''}
            {anyConversions ? ' · seasoned conversions are carrying part of the bridge' : ''}
          </>
        ) : (
          'no bridge years — everything is already open at drawdown start'
        )}
      </p>
      {bridge.years.length > 0 && (
        <div
          data-bridge-sources={JSON.stringify(
            stacks.map((s) => ({
              age: s.age,
              outside: Math.round(s.outside),
              conversions: Math.round(s.conversions),
              other: Math.round(s.other),
            })),
          )}
        >
          <ReactECharts option={option} style={{ height: 180 }} notMerge />
        </div>
      )}
    </Card>
  );
}
