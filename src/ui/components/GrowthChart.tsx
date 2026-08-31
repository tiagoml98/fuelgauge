/**
 * Growth-only stacked area (SPEC §3): four buckets (or by account), labeled
 * "growth only — no withdrawals", dataZoom, per-account tooltip honoring the
 * real/nominal and ATE/gross toggles. Colors: src/ui/theme/colors.ts.
 *
 * Markers (M4.5 B.4): engine events are "from age N"; the x-axis is numeric
 * and REGIME changes (contribution changes, return changes; drawdown start
 * and access ages in M5) render at N − 0.5 so the line sits on the visible
 * bend. One-time events (windfalls) render at N. Legend entries for empty
 * buckets are dimmed (C.7).
 */

import ReactECharts from 'echarts-for-react';
import { useMemo } from 'react';
import { ateByAccount } from '../../engine/ate';
import { toReal } from '../../engine/schedule';
import type { Assumptions, DisplayState, MarkerEventKind, RunYear } from '../../engine/types';
import {
  ACCOUNT_COLORS,
  ACCOUNT_LABELS,
  ACCOUNT_ORDER,
  BUCKET_COLORS,
  BUCKET_LABELS,
  BUCKET_ORDER,
  CHROME,
} from '../theme/colors';
import { fmtMoney } from './fields';

const compact = (v: number) =>
  Math.abs(v) >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${Math.round(v / 1000)}k`;

/** Regime changes draw at age − 0.5; one-time events at age. */
const REGIME_KINDS: ReadonlySet<MarkerEventKind> = new Set([
  'contributionChange',
  'returnChange',
  'drawdownStart',
  'accessAge',
  'rollover',
]);

export function GrowthChart({
  years,
  a,
  display,
}: {
  years: RunYear[];
  a: Assumptions;
  display: DisplayState;
}) {
  const mode = display.theme;
  const chrome = CHROME[mode];
  const startAge = years[0]?.age ?? 0;
  const lens = (v: number, age: number) =>
    display.real ? toReal(v, age - startAge, a.inflation) : v;

  const option = useMemo(() => {
    const seriesDefs = display.byBuckets
      ? BUCKET_ORDER.map((b) => ({
          name: BUCKET_LABELS[b],
          color: BUCKET_COLORS[mode][b],
          values: years.map((y) => [
            y.age,
            lens(display.ate ? y.buckets[b].ate : y.buckets[b].gross, y.age),
          ]),
        }))
      : ACCOUNT_ORDER.map((id) => ({
          name: ACCOUNT_LABELS[id],
          color: ACCOUNT_COLORS[mode][id],
          values: years.map((y) => [
            y.age,
            lens(display.ate ? ateByAccount(y.accounts, a)[id] : y.accounts[id].balance, y.age),
          ]),
        }));

    // Dim legend entries for series with no data (C.7)
    const legendData = seriesDefs.map((s) => {
      const empty = s.values.every(([, v]) => (v as number) <= 0.005);
      return {
        name: s.name,
        ...(empty
          ? { textStyle: { color: chrome.inkMuted, opacity: 0.5 }, itemStyle: { opacity: 0.3 } }
          : {}),
      };
    });

    const markAges = new Map<number, string[]>();
    for (const y of years) {
      for (const e of y.events) {
        if (e.kind === 'windfall' || REGIME_KINDS.has(e.kind)) {
          const x = REGIME_KINDS.has(e.kind) ? e.age - 0.5 : e.age;
          markAges.set(x, [...(markAges.get(x) ?? []), e.label]);
        }
      }
    }
    const markLineData = [...markAges.entries()].map(([x, labels]) => ({
      xAxis: x,
      label: {
        formatter: labels.length > 1 ? `${labels[0]} +${labels.length - 1}` : labels[0],
        rotate: 90,
        position: 'insideEndTop' as const,
        color: chrome.inkMuted,
        fontSize: 10,
      },
      lineStyle: { type: 'dashed' as const, color: chrome.inkMuted, width: 1 },
    }));

    return {
      backgroundColor: 'transparent',
      animation: false,
      grid: { left: 64, right: 24, top: 36, bottom: 64 },
      legend: {
        top: 0,
        left: 0,
        icon: 'roundRect',
        itemWidth: 10,
        itemHeight: 10,
        data: legendData,
        textStyle: { color: chrome.inkSecondary, fontSize: 11 },
      },
      xAxis: {
        type: 'value',
        min: startAge,
        max: years[years.length - 1]?.age ?? startAge + 1,
        interval: 5,
        axisLine: { lineStyle: { color: chrome.axis } },
        axisTick: { show: false },
        axisLabel: { color: chrome.inkMuted, fontSize: 10, formatter: (v: number) => String(v) },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: chrome.grid, width: 1 } },
        axisLabel: { color: chrome.inkMuted, fontSize: 10, formatter: compact },
      },
      dataZoom: [
        { type: 'inside' },
        {
          type: 'slider',
          height: 16,
          bottom: 10,
          borderColor: chrome.grid,
          textStyle: { color: chrome.inkMuted, fontSize: 9 },
        },
      ],
      tooltip: {
        trigger: 'axis',
        backgroundColor: chrome.surface,
        borderColor: chrome.grid,
        textStyle: { color: chrome.inkPrimary, fontSize: 11 },
        // SPEC §3: hover shows each ACCOUNT's value at that age, per toggles
        formatter: (params: Array<{ data: [number, number] }>) => {
          const age = params[0]?.data?.[0];
          const y = years.find((yy) => yy.age === age);
          if (!y) return '';
          const ate = ateByAccount(y.accounts, a);
          const rows = ACCOUNT_ORDER.filter((id) => y.accounts[id].balance > 0.005)
            .map((id) => {
              const v = lens(display.ate ? ate[id] : y.accounts[id].balance, y.age);
              const c = ACCOUNT_COLORS[mode][id];
              return `<div style="display:flex;justify-content:space-between;gap:16px">
                <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${c};margin-right:6px"></span>${ACCOUNT_LABELS[id]}</span>
                <span style="font-variant-numeric:tabular-nums">${fmtMoney(v)}</span></div>`;
            })
            .join('');
          const total = lens(display.ate ? y.totalAte : y.total, y.age);
          return `<div style="font-weight:600;margin-bottom:4px">Age ${y.age} · ${y.year} · ${
            display.real ? "today's $" : 'nominal'
          } · ${display.ate ? 'after-tax equivalent' : 'gross'}</div>${rows}
          <div style="display:flex;justify-content:space-between;gap:16px;border-top:1px solid ${chrome.grid};margin-top:4px;padding-top:4px">
            <span>Total</span><span style="font-weight:600;font-variant-numeric:tabular-nums">${fmtMoney(total)}</span></div>`;
        },
      },
      series: seriesDefs.map((s, i) => ({
        name: s.name,
        type: 'line' as const,
        stack: 'total',
        symbol: 'none',
        data: s.values,
        color: s.color,
        // 2px surface-colored boundary = the spacer between stacked fills
        lineStyle: { width: 2, color: chrome.surface },
        areaStyle: { color: s.color, opacity: 1 },
        emphasis: { disabled: true },
        ...(i === 0 ? { markLine: { silent: true, symbol: 'none', data: markLineData } } : {}),
      })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years, a, display, mode]);

  return <ReactECharts option={option} style={{ height: 420 }} notMerge theme={undefined} />;
}
