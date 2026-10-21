"use client";

import { useMemo } from "react";
import EChart, { type ThemeTokens } from "./EChart";
import type { Holding } from "@/lib/invest";
import { formatPct, formatWon } from "@/lib/format";
import { rateColor } from "./ProductTreemap";

/**
 * 비중 × 수익률 산점도 — x = 평가금 구성비, y = 수익률, 점 크기 = 평가금, 색 = 수익률
 * 세로축은 부호 있는 로그 눈금 (−50% ~ +2,000% 가 한 화면에 함께 보이게)
 *   y' = sign(r) × ln(1 + |r|)
 * 오른쪽 아래(비중 크고 수익률 낮음)가 점검 대상
 */
const fwd = (r: number) => Math.sign(r) * Math.log1p(Math.abs(r));
const TICKS = [-0.9, -0.5, -0.2, 0, 0.2, 0.5, 1, 3, 10, 20, 50];

export default function WeightRateScatter({ tokens: t, holdings, height }: { tokens: ThemeTokens | null; holdings: Holding[]; height: number }) {
  const option = useMemo(() => {
    if (!t) return null;
    const pts = holdings.filter((h) => h.valuation > 0 && h.rate !== null && h.share !== null);
    if (!pts.length) return null;
    const maxV = Math.max(...pts.map((h) => h.valuation));
    const rates = pts.map((h) => h.rate as number);
    const lo = Math.min(0, ...rates);
    const hi = Math.max(0, ...rates);
    // 데이터 범위를 감싸는 눈금만 사용
    const floor = [...TICKS].reverse().find((x) => x <= lo) ?? TICKS[0];
    const ceil = TICKS.find((x) => x >= hi) ?? TICKS[TICKS.length - 1];
    const ticks = TICKS.filter((v) => v >= floor && v <= ceil);
    const yMin = fwd(ticks[0]);
    const yMax = fwd(ticks[ticks.length - 1]);
    const avgShare = 1 / pts.length;
    const maxShare = Math.max(...pts.map((h) => h.share as number));

    return {
      animationDuration: 500,
      grid: { left: 8, right: 20, top: 20, bottom: 26, containLabel: true },
      xAxis: {
        type: "value",
        name: "평가금 구성비",
        nameLocation: "middle",
        nameGap: 26,
        nameTextStyle: { color: t.text3, fontSize: 11 },
        min: 0,
        max: Math.min(1, Math.ceil((maxShare * 1.12) / 0.05) * 0.05),
        axisLine: { lineStyle: { color: t.axis } },
        axisTick: { show: false },
        axisLabel: { color: t.text3, fontSize: 11, formatter: (v: number) => formatPct(v, 0) },
        splitLine: { lineStyle: { color: t.grid } },
      },
      yAxis: {
        type: "value",
        min: yMin,
        max: yMax,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: t.text3,
          fontSize: 11,
          customValues: ticks.map(fwd),
          formatter: (v: number) => {
            const r = Math.sign(v) * Math.expm1(Math.abs(v));
            return formatPct(Math.round(r * 100) / 100, 0);
          },
        },
        splitLine: { show: false },
      },
      tooltip: {
        trigger: "item",
        confine: true,
        backgroundColor: t.surface,
        borderColor: t.axis,
        textStyle: { color: t.text1, fontSize: 12 },
        extraCssText: "border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.12);",
        formatter: (p: { dataIndex: number }) => {
          const h = pts[p.dataIndex];
          const c = (h.rate as number) >= 0 ? t.good : t.bad;
          return `<div style="font-weight:600;margin-bottom:4px">${h.product}</div>
            <div style="display:grid;grid-template-columns:auto auto;gap:2px 14px;font-variant-numeric:tabular-nums">
            <span style="color:${t.text2}">구성비</span><b style="text-align:right">${formatPct(h.share, 1)}</b>
            <span style="color:${t.text2}">수익률</span><b style="text-align:right;color:${c}">${formatPct(h.rate, 1)}</b>
            <span style="color:${t.text2}">평가금</span><b style="text-align:right">${formatWon(h.valuation)}원</b></div>`;
        },
      },
      series: [
        {
          type: "scatter",
          data: pts.map((h) => ({
            value: [h.share, fwd(h.rate as number)],
            name: h.product,
            symbolSize: 10 + 34 * Math.sqrt(h.valuation / maxV),
            itemStyle: { color: rateColor(t, t.axis, h.rate), opacity: 0.85, borderColor: t.surface, borderWidth: 1.5 },
          })),
          label: {
            show: true,
            position: "right",
            distance: 4,
            color: t.text2,
            fontSize: 11,
            formatter: (p: { name: string }) => p.name,
            textBorderColor: t.surface,
            textBorderWidth: 3,
          },
          labelLayout: { hideOverlap: true },
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: true, color: t.text3, fontSize: 10, position: "insideEndTop" },
            data: [
              { yAxis: 0, lineStyle: { color: t.axis, type: "solid" }, label: { formatter: "0%" } },
              { xAxis: avgShare, lineStyle: { color: t.axis, type: [4, 4] }, label: { formatter: "평균 비중" } },
            ],
          },
          emphasis: { scale: false },
        },
      ],
    };
  }, [t, holdings]);

  return <EChart option={option} height={height} ariaLabel="종목별 평가금 구성비와 수익률 산점도" />;
}
