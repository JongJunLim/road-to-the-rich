"use client";

import { useMemo } from "react";
import EChart, { type ThemeTokens } from "./EChart";
import { categoryXAxis, highlightData, fullWon, highlightIndexes, pointLabel, tooltipBase, tooltipHtml, valueYAxis } from "./base";
import { formatMonthLong, formatPct } from "@/lib/format";

interface Props {
  tokens: ThemeTokens | null;
  months: string[];
  principal: (number | null)[];
  valuation: (number | null)[];
  height: number;
}

/**
 * 투자 추이
 * - 위: 원금·평가금 (같은 금액 축, 실선)
 * - 아래: 수익률 (점, 0% 기준선) — 금액과 비율을 한 축에 섞지 않도록 같은 x축의 작은 패널로 분리
 */
export default function InvestmentChart({ tokens: t, months, principal, valuation, height }: Props) {
  const rate = useMemo(
    () => principal.map((p, i) => (p && valuation[i] !== null ? ((valuation[i] as number) - p) / p : null)),
    [principal, valuation],
  );

  const option = useMemo(() => {
    if (!t) return null;
    const hiVal = new Set(highlightIndexes(valuation, ["max", "last"]));
    const hiRate = new Set(highlightIndexes(rate, ["last"]));
    const lineSeries = (name: string, data: (number | null)[], color: string) => ({
      name,
      type: "line",
      data,
      xAxisIndex: 0,
      yAxisIndex: 0,
      connectNulls: true,
      symbol: "none",
      lineStyle: { width: 2, color, cap: "round", join: "round" },
      itemStyle: { color },
      emphasis: { disabled: true },
    });

    return {
      animationDuration: 500,
      grid: [
        { left: 8, right: 16, top: 28, height: "56%", containLabel: true },
        { left: 8, right: 16, top: "74%", bottom: 4, containLabel: true },
      ],
      xAxis: [categoryXAxis(t, months, 0, false), categoryXAxis(t, months, 1)],
      yAxis: [
        valueYAxis(t, { gridIndex: 0 }),
        valueYAxis(t, { gridIndex: 1, splitNumber: 2, formatter: (v) => formatPct(v, 0) }),
      ],
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      tooltip: {
        ...tooltipBase(t),
        formatter: (ps: { dataIndex: number }[]) => {
          const i = ps[0].dataIndex;
          return tooltipHtml(t, formatMonthLong(months[i]), [
            { name: "원금", color: t.s1, value: fullWon(principal[i]) },
            { name: "평가금", color: t.s2, value: fullWon(valuation[i]) },
            {
              name: "수익률",
              color: (rate[i] ?? 0) >= 0 ? t.good : t.bad,
              value: formatPct(rate[i], 2),
            },
          ]);
        },
      },
      series: [
        lineSeries("원금", principal, t.s1),
        lineSeries("평가금", valuation, t.s2),
        {
          type: "scatter",
          data: highlightData(valuation, hiVal),
          xAxisIndex: 0,
          yAxisIndex: 0,
          symbolSize: 8,
          itemStyle: { color: t.s2, borderColor: t.surface, borderWidth: 2 },
          label: pointLabel(t, t.s2),
          labelLayout: { hideOverlap: true },
          silent: true,
          tooltip: { show: false },
          z: 3,
        },
        {
          name: "수익률",
          type: "scatter",
          data: rate,
          xAxisIndex: 1,
          yAxisIndex: 1,
          symbolSize: 8,
          itemStyle: {
            color: (p: { value: number }) => (p.value >= 0 ? t.good : t.bad),
            borderColor: t.surface,
            borderWidth: 2,
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
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: false },
            lineStyle: { color: t.axis, width: 1, type: "solid" },
            data: [{ yAxis: 0 }],
          },
          emphasis: { disabled: true },
        },
      ],
    };
  }, [t, months, principal, valuation, rate]);

  return <EChart option={option} height={height} ariaLabel="월별 투자 원금·평가금 추이와 수익률" />;
}
