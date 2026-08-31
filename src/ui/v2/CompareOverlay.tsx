/**
 * Overlay chart (SPEC §3 Compare): selected runs' ATE totals under the lens,
 * first-crossover ages vs the baseline marked. Run colors: fixed categorical
 * slots, never cycled. `data-crossovers` is the rendered artifact for e2e.
 */

import ReactECharts from 'echarts-for-react';
import { useMemo } from 'react';
import { toReal } from '../../engine/schedule';
import type { Assumptions, DisplayState, RunResult } from '../../engine/types';
import { firstCrossover } from '../../state/derived';
import { CHROME, RUN_COLORS } from '../theme/colors';
import { fmtMoney } from '../components/fields';

export interface OverlayRun {
  label: string;
  run: RunResult;
  isBaseline: boolean;
}

const compact = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${Math.round(v / 1000)}k`;
};

export function CompareOverlay({
  runs,
  a,
  display,
}: {
  runs: OverlayRun[];
  a: Assumptions;
  display: DisplayState;
}) {
  const chrome = CHROME[display.theme];
  const colors = RUN_COLORS[display.theme];
  const startAge = runs[0]?.run.years[0]?.age ?? 0;
  const lensValue = (run: RunResult, i: number) => {
    const y = run.years[i];
    return display.real ? toReal(y.totalAte, y.age - startAge, a.inflation) : y.totalAte;
  };

  const { option, crossovers } = useMemo(() => {
    const baseline = runs.find((r) => r.isBaseline) ?? runs[0];
    const crossovers = runs
      .filter((r) => r !== baseline)
      .map((r) => ({
        label: r.label,
        age: firstCrossover(baseline.run, r.run, a, display.real),
      }))
      .filter((c): c is { label: string; age: number } => c.age !== null);

    const option = {
      backgroundColor: 'transparent',
      animation: false,
      grid: { left: 64, right: 24, top: 36, bottom: 36 },
      legend: {
        top: 0,
        left: 0,
        icon: 'roundRect',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: chrome.inkSecondary, fontSize: 11 },
      },
      xAxis: {
        type: 'value' as const,
        min: startAge,
        max: Math.max(...runs.map((r) => r.run.years[r.run.years.length - 1]?.age ?? startAge)),
        minInterval: 1,
        axisLine: { lineStyle: { color: chrome.axis } },
        axisTick: { show: false },
        axisLabel: {
          color: chrome.inkMuted,
          fontSize: 10,
          formatter: (v: number) => (Number.isInteger(v) ? String(v) : ''),
        },
      },
      yAxis: {
        type: 'value' as const,
        splitLine: { lineStyle: { color: chrome.grid, width: 1 } },
        axisLabel: { color: chrome.inkMuted, fontSize: 10, formatter: compact },
      },
      dataZoom: [{ type: 'inside' as const, zoomOnMouseWheel: true, moveOnMouseMove: true }],
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'cross' as const, snap: true, crossStyle: { color: chrome.inkMuted, width: 1, type: 'dashed' as const } },
        backgroundColor: chrome.surface,
        borderColor: chrome.grid,
        textStyle: { color: chrome.inkPrimary, fontSize: 11 },
        valueFormatter: (v: number) => fmtMoney(v),
      },
      series: runs.map((r, i) => ({
        name: r.label + (r.isBaseline ? ' (baseline)' : ''),
        type: 'line' as const,
        symbol: 'none',
        data: r.run.years.map((y, j) => [y.age, lensValue(r.run, j)]),
        color: colors[i % colors.length],
        lineStyle: { width: r.isBaseline ? 2.5 : 1.5 },
        emphasis: { disabled: true },
        ...(i === 0 && crossovers.length > 0
          ? {
              markLine: {
                silent: true,
                symbol: 'none',
                data: crossovers.map((c) => ({
                  xAxis: c.age,
                  label: {
                    formatter: `crossover ${c.age}`,
                    rotate: 90,
                    position: 'insideEndTop' as const,
                    color: chrome.inkMuted,
                    fontSize: 10,
                  },
                  lineStyle: { type: 'dashed' as const, color: chrome.inkSecondary, width: 1 },
                })),
              },
            }
          : {}),
      })),
    };
    return { option, crossovers };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, a, display.real, display.theme]);

  return (
    <div data-crossovers={JSON.stringify(crossovers.map((c) => c.age))}>
      <ReactECharts option={option} style={{ height: 340 }} notMerge />
    </div>
  );
}
