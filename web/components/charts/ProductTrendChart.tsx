"use client";

import { useMemo } from "react";
import EChart, { type ThemeTokens } from "./EChart";
import { categoryXAxis, fullWon, highlightData, highlightIndexes, pointLabel, tooltipBase, tooltipHtml, valueYAxis } from "./base";
import { formatMonthLong, formatPct } from "@/lib/format";

interface Props {
  tokens: ThemeTokens | null;
  months: string[];
  principal: (number | null)[];
  valuation: (number | null)[];
  rate: (number | null)[];
  height: number;
}

/**
 * Investment 화면 — 원금·평가금(실선, 왼쪽 금액 축) + 수익률(점선 + 점, 오른쪽 % 축)
 * 색은 화면 1 투자 추이와 같게: 원금 = 파랑, 평가금 = 주황, 수익률 점 = 좋음 파랑 / 나쁨 빨강
 */
export default function ProductTrendChart({ tokens: t, months, principal, valuation, rate, height }: Props) {
  const option = useMemo(() => {
    if (!t) return null;
    const hiVal = new Set(highlightIndexes(valuation, ["last"]));
    const hiPri = new Set(highlightIndexes(principal, ["last"]));
    const hiRate = new Set(highlightIndexes(rate, ["last"]));
    const money = (name: string, data: (number | null)[], color: string) => ({
      name,
      type: "line",
      data,
      yAxisIndex: 0,
      connectNulls: false,
      symbol: "none",
      lineStyle: { width: 2.25, color, cap: "round", join: "round" },
      itemStyle: { color },
      emphasis: { disabled: true },
      z: 2,
    });

    return {
      animationDuration: 500,
      grid: { left: 8, right: 8, top: 30, bottom: 4, containLabel: true },
      xAxis: categoryXAxis(t, months),
      yAxis: [
        valueYAxis(t, { min: 0 }),
        {
          ...valueYAxis(t, { formatter: (v) => formatPct(v, 0) }),
          position: "right",
          splitLine: { show: false },
          scale: true,
        },
      ],
      tooltip: {
        ...tooltipBase(t),
        formatter: (ps: { dataIndex: number }[]) => {
          const i = ps[0].dataIndex;
          return tooltipHtml(t, formatMonthLong(months[i]), [
            { name: "원금", color: t.s1, value: fullWon(principal[i]) },
            { name: "평가금", color: t.s2, value: fullWon(valuation[i]) },
            { name: "수익률", color: (rate[i] ?? 0) >= 0 ? t.good : t.bad, value: formatPct(rate[i], 2) },
          ]);
        },
      },
      series: [
        money("원금", principal, t.s1),
        money("평가금", valuation, t.s2),
        // 마지막 값 라벨 (원금은 아래, 평가금은 위 — 겹침 방지)
        {
          type: "scatter",
          data: highlightData(valuation, hiVal),
          yAxisIndex: 0,
          symbolSize: 8,
          itemStyle: { color: t.s2, borderColor: t.surface, borderWidth: 2 },
          label: pointLabel(t, t.s2),
          silent: true,
          tooltip: { show: false },
          z: 4,
        },
        {
          type: "scatter",
          data: highlightData(principal, hiPri),
          yAxisIndex: 0,
          symbolSize: 8,
          itemStyle: { color: t.s1, borderColor: t.surface, borderWidth: 2 },
          label: pointLabel(t, t.s1, "bottom"),
          silent: true,
          tooltip: { show: false },
          z: 4,
        },
        {
          name: "수익률",
          type: "line",
          data: rate,
          yAxisIndex: 1,
          connectNulls: false,
          symbol: "circle",
          symbolSize: 6,
          lineStyle: { width: 1.5, type: [4, 4], color: t.text3 },
          itemStyle: {
            color: (p: { value: number }) => (p.value >= 0 ? t.good : t.bad),
            borderColor: t.surface,
            borderWidth: 1.5,
          },
          label: {
            show: true,
            position: "top",
            distance: 6,
            color: t.text2,
            fontSize: 11,
            fontWeight: 600,
            textBorderColor: t.surface,
            textBorderWidth: 3,
            formatter: (p: { dataIndex: number; value: number }) => (hiRate.has(p.dataIndex) ? formatPct(p.value, 1) : ""),
          },
          labelLayout: { hideOverlap: true },
          emphasis: { disabled: true },
          z: 3,
        },
      ],
    };
  }, [t, months, principal, valuation, rate]);

  return <EChart option={option} height={height} ariaLabel="월별 투자 원금·평가금 추이와 수익률" />;
}
