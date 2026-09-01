/**
 * Bridge visualizer (SPEC §3): one bar per year from drawdown start to the
 * latest access age — funded green, gap red (status colors, never the series
 * palette; a text summary carries the state so color is never alone).
 */

import { Card } from '@/components/ui/card';
import ReactECharts from 'echarts-for-react';
import { useMemo } from 'react';
import type { Assumptions, BridgeReport, DisplayState, RunResult } from '../../engine/types';
import { CHROME } from '../theme/colors';
import { fmtMoney0 } from './inputs';
import { lensBridge } from './lens';

const GOOD = '#0ca30c';
const CRITICAL = '#d03b3b';

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
      grid: { left: 64, right: 24, top: 12, bottom: 28 },
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
          const y = bridge.years[params[0]?.dataIndex ?? 0];
          if (!y) return '';
          return `<b>Age ${y.age}</b><br/>need ${fmtMoney0(y.need)}<br/>funded ${fmtMoney0(y.funded)}${
            y.gap > 0.005 ? `<br/><span style="color:${CRITICAL};font-weight:600">GAP ${fmtMoney0(y.gap)}</span>` : ''
          }`;
        },
      },
      series: [
        {
          name: 'funded',
          type: 'bar' as const,
          stack: 'bridge',
          data: bridge.years.map((y) => y.funded),
          color: GOOD,
          barCategoryGap: '25%',
          itemStyle: { borderRadius: [0, 0, 0, 0], borderColor: chrome.surface, borderWidth: 1 },
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
    [bridge, chrome],
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
          </>
        ) : (
          'no bridge years — everything is already open at drawdown start'
        )}
      </p>
      {bridge.years.length > 0 && <ReactECharts option={option} style={{ height: 180 }} notMerge />}
    </Card>
  );
}
