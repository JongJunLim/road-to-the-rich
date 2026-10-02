"use client";

import { useMemo } from "react";
import EChart, { type ThemeTokens } from "./EChart";
import { categoryXAxis, highlightData, fullWon, highlightIndexes, pointLabel, tooltipBase, tooltipHtml, valueYAxis } from "./base";
import { formatMonthLong } from "@/lib/format";

interface Props {
  tokens: ThemeTokens | null;
  months: string[];
  values: (number | null)[];
  height: number;
}

/** 자산 추이 — 단일 계열 영역 차트, 첫 값·최댓값·최근 값만 라벨 */
export default function AssetChart({ tokens: t, months, values, height }: Props) {
  const option = useMemo(() => {
    if (!t) return null;
    const hi = new Set(highlightIndexes(values, ["first", "max", "last"]));
    return {
      animationDuration: 500,
      grid: { left: 8, right: 16, top: 28, bottom: 4, containLabel: true },
      xAxis: categoryXAxis(t, months),
      yAxis: { ...valueYAxis(t), scale: true }, // 0부터 시작하지 않고 변동폭이 보이게
      tooltip: {
        ...tooltipBase(t),
        formatter: (ps: { dataIndex: number }[]) => {
          const i = ps[0].dataIndex;
          return tooltipHtml(t, formatMonthLong(months[i]), [{ name: "자산", color: t.s1, value: fullWon(values[i]) }]);
        },
      },
      series: [
        {
          type: "line",
          data: values,
          connectNulls: true, // 스냅샷이 빠진 달은 이어서 그림
          symbol: "none",
          lineStyle: { width: 2, color: t.s1, cap: "round", join: "round" },
          areaStyle: { color: t.s1Wash },
          emphasis: { disabled: true },
        },
        {
          type: "scatter",
          data: highlightData(values, hi),
          symbolSize: 8,
          itemStyle: { color: t.s1, borderColor: t.surface, borderWidth: 2 },
          label: pointLabel(t, t.s1),
          labelLayout: { hideOverlap: true },
          tooltip: { show: false },
          silent: true,
          z: 3,
        },
      ],
    };
  }, [t, months, values]);

  return <EChart option={option} height={height} ariaLabel="월별 자산 추이 영역 차트" />;
}
