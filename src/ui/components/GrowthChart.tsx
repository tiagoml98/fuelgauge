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
import { useEffect, useMemo, useRef } from 'react';
import { toReal } from '../../engine/schedule';
import type { Assumptions, DisplayState, MarkerEventKind, RunYear } from '../../engine/types';
import { joinMarkerLabels, shortMarkerLabel } from '../v2/markers';
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

const compact = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${Math.round(v / 1000)}k`;
};

/** Regime changes draw at age − 0.5; one-time events at age. */
const REGIME_KINDS: ReadonlySet<MarkerEventKind> = new Set([
  'contributionChange',
  'returnChange',
  'drawdownStart',
  'accessAge',
  'rollover',
]);

/** SPEC §13 marker taxonomy: solid = drawdown start, dotted = access ages, dashed = the rest. */
const MARKER_LINE: Record<string, { type: 'solid' | 'dotted' | 'dashed'; width: number }> = {
  drawdownStart: { type: 'solid', width: 1.5 },
  accessAge: { type: 'dotted', width: 1 },
  default: { type: 'dashed', width: 1 },
};
const KIND_PRIORITY: MarkerEventKind[] = ['drawdownStart', 'accessAge', 'rollover'];

export function GrowthChart({
  years,
  a,
  display,
  variant = 'growth',
}: {
  years: RunYear[];
  a: Assumptions;
  display: DisplayState;
  variant?: 'growth' | 'run';
}) {
  const mode = display.theme;
  const chrome = CHROME[mode];
  const startAge = years[0]?.age ?? 0;
  const lens = (v: number, age: number) =>
    display.real ? toReal(v, age - startAge, a.inflation) : v;

  // M4.5 item 1: no per-frame canvas redraws while the panel divider drags —
  // resize throttled to ~10/s with a trailing call that settles on release.
  const chartRef = useRef<ReactECharts>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let last = 0;
    let trailing: ReturnType<typeof setTimeout>;
    const doResize = () => chartRef.current?.getEchartsInstance().resize();
    const ro = new ResizeObserver(() => {
      const now = performance.now();
      if (now - last > 100) {
        last = now;
        doResize();
      }
      clearTimeout(trailing);
      trailing = setTimeout(doResize, 120);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      clearTimeout(trailing);
    };
  }, []);

  const { option, markerArtifact, seriesNames } = useMemo(() => {
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
            lens(display.ate ? y.ate[id] : y.accounts[id].balance, y.age),
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

    // Short labels on the lines ("401k stop", "IPO"); full text in the crosshair readout.
    // Regime changes render at N − 0.5, one-time events at N (M4.5 B.4).
    const singleFiler = a.filers.length === 1;
    const markAges = new Map<number, { labels: string[]; kinds: MarkerEventKind[] }>();
    // M9 pre-work: one-time events that REPEAT in consecutive years coalesce
    // into a single span marker ("ladder 44–58 · ≈$80k/yr") — per-year detail
    // stays in the crosshair readout. Conversions group by kind (amounts vary
    // with indexing); other one-time kinds (windfalls) group by exact label.
    const oneTime: Array<{ age: number; kind: MarkerEventKind; label: string; groupKey: string }> = [];
    for (const y of years) {
      for (const e of y.events) {
        if (e.kind === 'windfall' || e.kind === 'conversion') {
          const label = shortMarkerLabel(e, singleFiler);
          oneTime.push({
            age: e.age,
            kind: e.kind,
            label,
            groupKey: e.kind === 'conversion' ? 'conversion' : `${e.kind}:${label}`,
          });
        } else if (REGIME_KINDS.has(e.kind)) {
          const x = e.age - 0.5;
          const entry = markAges.get(x) ?? { labels: [], kinds: [] };
          entry.labels.push(shortMarkerLabel(e, singleFiler));
          entry.kinds.push(e.kind);
          markAges.set(x, entry);
        }
      }
    }
    oneTime.sort((p, q) => (p.groupKey < q.groupKey ? -1 : p.groupKey > q.groupKey ? 1 : p.age - q.age));
    const pushMark = (x: number, kind: MarkerEventKind, label: string) => {
      const entry = markAges.get(x) ?? { labels: [], kinds: [] };
      entry.labels.push(label);
      entry.kinds.push(kind);
      markAges.set(x, entry);
    };
    for (let i = 0; i < oneTime.length; ) {
      let j = i;
      while (
        j + 1 < oneTime.length &&
        oneTime[j + 1].groupKey === oneTime[i].groupKey &&
        oneTime[j + 1].age === oneTime[j].age + 1
      ) {
        j++;
      }
      const run = oneTime.slice(i, j + 1);
      if (run.length >= 2) {
        const from = run[0].age;
        const to = run[run.length - 1].age;
        if (run[0].kind === 'conversion') {
          // ≈ today's-$ average of the converted amounts across the span
          const reals = run.map((r) => {
            const y = years.find((yy) => yy.age === r.age);
            return toReal(y?.ladder?.converted ?? 0, r.age - startAge - 1, a.inflation);
          });
          const avg = reals.reduce((s2, v) => s2 + v, 0) / run.length;
          pushMark(from, 'conversion', `ladder ${from}–${to} · ≈${compact(avg)}/yr`);
        } else {
          pushMark(from, run[0].kind, `${run[0].label} ×${run.length} (${from}–${to})`);
        }
      } else {
        pushMark(run[0].age, run[0].kind, run[0].label);
      }
      i = j + 1;
    }
    const markLineData = [...markAges.entries()].map(([x, { labels, kinds }]) => {
      const kind = KIND_PRIORITY.find((k) => kinds.includes(k)) ?? kinds[0];
      const style = MARKER_LINE[kind] ?? MARKER_LINE.default;
      return {
        xAxis: x,
        label: {
          formatter: joinMarkerLabels(labels),
          rotate: 90,
          position: 'insideEndTop' as const,
          color: chrome.inkMuted,
          fontSize: 10,
        },
        lineStyle: {
          type: style.type,
          color: kind === 'drawdownStart' ? chrome.inkSecondary : chrome.inkMuted,
          width: style.width,
        },
      };
    });
    const markerArtifact = [...markAges.entries()]
      .map(([x, { kinds }]) => ({ x, kind: KIND_PRIORITY.find((k) => kinds.includes(k)) ?? kinds[0] }))
      .sort((p, q) => p.x - q.x);

    // Contiguous gap-year bands, split by kind (M6.1 #2): locked = amber
    // (recoverable — the bridge problem), depleted = red (nothing left)
    const gapRanges: Array<[{ xAxis: number; itemStyle: { color: string } }, { xAxis: number }]> = [];
    let lastKind: string | null = null;
    for (const y of years) {
      if (!y.gap) {
        lastKind = null;
        continue;
      }
      const kind = y.gapKind ?? 'depleted';
      const last = gapRanges[gapRanges.length - 1];
      if (last && lastKind === kind && last[1].xAxis === y.age - 1 + 0.5) {
        last[1] = { xAxis: y.age + 0.5 };
      } else {
        gapRanges.push([
          {
            xAxis: y.age - 0.5,
            itemStyle: {
              color: kind === 'locked' ? 'rgba(236, 131, 90, 0.14)' : 'rgba(208, 59, 59, 0.12)',
            },
          },
          { xAxis: y.age + 0.5 },
        ]);
      }
      lastKind = kind;
    }

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
        data: legendData,
        textStyle: { color: chrome.inkSecondary, fontSize: 11 },
      },
      xAxis: {
        type: 'value',
        min: startAge,
        max: years[years.length - 1]?.age ?? startAge + 1,
        minInterval: 1, // integer ages only — no fractional ticks when zoomed
        axisLine: { lineStyle: { color: chrome.axis } },
        axisTick: { show: false },
        axisLabel: {
          color: chrome.inkMuted,
          fontSize: 10,
          formatter: (v: number) => (Number.isInteger(v) ? String(v) : ''),
        },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: chrome.grid, width: 1 } },
        axisLabel: { color: chrome.inkMuted, fontSize: 10, formatter: compact },
      },
      // TradingView-style behavior (M4.5 D.1): wheel zooms, drag pans, no slider
      dataZoom: [
        {
          type: 'inside',
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          preventDefaultMouseMove: true,
        },
      ],
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          snap: true,
          label: {
            backgroundColor: chrome.surface,
            borderColor: chrome.grid,
            borderWidth: 1,
            color: chrome.inkPrimary,
            fontSize: 10,
            formatter: (p: { axisDimension: string; value: number }) =>
              p.axisDimension === 'x' ? `age ${Math.round(p.value)}` : compact(p.value),
          },
          crossStyle: { color: chrome.inkMuted, width: 1, type: 'dashed' as const },
        },
        backgroundColor: chrome.surface,
        borderColor: chrome.grid,
        textStyle: { color: chrome.inkPrimary, fontSize: 11 },
        // SPEC §3: hover shows each ACCOUNT's value at that age, per toggles
        formatter: (params: Array<{ data: [number, number] }>) => {
          const age = params[0]?.data?.[0];
          const y = years.find((yy) => yy.age === age);
          if (!y) return '';
          const ate = y.ate; // M7: engine valuation (bracket rate included)
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
          const eventLines = y.events
            .filter((e) => e.kind === 'windfall' || e.kind === 'conversion' || REGIME_KINDS.has(e.kind))
            .map(
              (e) =>
                `<div style="color:${chrome.inkMuted};font-size:10px;margin-top:2px">◆ ${e.label}</div>`,
            )
            .join('');
          // Drawdown years: need / withdrawn / gap in the crosshair readout
          const drawLines =
            y.need !== undefined
              ? `<div style="display:flex;justify-content:space-between;gap:16px;margin-top:4px;color:${chrome.inkSecondary}">
                   <span>need</span><span class="tnum">${fmtMoney(lens(y.need, y.age))}</span></div>
                 <div style="display:flex;justify-content:space-between;gap:16px;color:${chrome.inkSecondary}">
                   <span>withdrawn (gross)</span><span class="tnum">${fmtMoney(
                     lens(Object.values(y.withdrawals ?? {}).reduce((s, v) => s + (v ?? 0), 0), y.age),
                   )}</span></div>` +
                // M7 bracket mode: the year's COMPUTED effective rate
                (y.effectiveOrdinaryRate !== undefined
                  ? `<div style="display:flex;justify-content:space-between;gap:16px;color:${chrome.inkSecondary}">
                       <span>effective rate</span><span class="tnum">${(y.effectiveOrdinaryRate * 100).toFixed(1)}%</span></div>`
                  : '') +
                (y.gap
                  ? `<div style="color:#d03b3b;font-weight:600;margin-top:2px">⚠ GAP — need unmet by ${fmtMoney(lens(y.unmet ?? 0, y.age))}</div>`
                  : '')
              : '';
          return `<div style="font-weight:600;margin-bottom:4px">Age ${y.age} · ${y.year} · ${
            display.real ? "today's $" : 'nominal'
          } · ${display.ate ? 'after-tax equivalent' : 'gross'}</div>${rows}
          <div style="display:flex;justify-content:space-between;gap:16px;border-top:1px solid ${chrome.grid};margin-top:4px;padding-top:4px">
            <span>Total</span><span style="font-weight:600;font-variant-numeric:tabular-nums">${fmtMoney(total)}</span></div>${drawLines}${eventLines}`;
        },
      },
      series: seriesDefs.map((s, i) => ({
        name: s.name,
        type: 'line' as const,
        stack: 'total',
        symbol: 'none',
        data: s.values,
        color: s.color,
        // M6.1 #1: accounts mode steps between adjacent years — transfers
        // (rollovers) render as a clean vertical handoff, never a multi-year
        // diagonal. Buckets mode stays smooth: it charts the four AGGREGATE
        // bucket series, so intra-bucket rollovers are structurally invisible.
        ...(display.byBuckets ? {} : { step: 'end' as const }),
        // 2px surface-colored boundary = the spacer between stacked fills
        lineStyle: { width: 2, color: chrome.surface },
        areaStyle: { color: s.color, opacity: 1 },
        emphasis: { disabled: true },
        ...(i === 0
          ? {
              markLine: { silent: true, symbol: 'none', data: markLineData },
              // run variant: shade gap years (status-critical wash, labeled in tooltip)
              ...(variant === 'run' && gapRanges.length > 0
                ? {
                    markArea: { silent: true, data: gapRanges },
                  }
                : {}),
            }
          : {}),
      })),
    };
    return { option, markerArtifact, seriesNames: seriesDefs.map((s) => s.name) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years, a, display, mode, variant]);

  return (
    <div
      ref={wrapRef}
      data-markers={JSON.stringify(markerArtifact)}
      data-series={JSON.stringify(seriesNames)}
    >
      <ReactECharts ref={chartRef} option={option} style={{ height: 420 }} notMerge autoResize={false} theme={undefined} />
    </div>
  );
}
