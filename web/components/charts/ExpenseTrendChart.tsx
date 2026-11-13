"use client";

import { useMemo } from "react";
import EChart, { type ThemeTokens } from "./EChart";
import { categoryXAxis, fullWon, highlightData, highlightIndexes, pointLabel, tooltipBase, tooltipHtml, valueYAxis } from "./base";
import { formatMonthLong } from "@/lib/format";

interface Props {
  tokens: ThemeTokens | null;
  months: string[];
  values: (number | null)[];
  height: number;
}

/**
 * Expense Analysis — 월별 지출 추이 (선 그래프)
 * 색은 화면 1 가계부의 '지출'과 같은 주황(series-2), 점선 = 표시 기간 월평균
 */
export default function ExpenseTrendChart({ tokens: t, months, values, height }: Props) {
  const option = useMemo(() => {
    if (!t) return null;
    const present = values.filter((v): v is number => v !== null);
    const avg = present.length ? present.reduce((s, v) => s + v, 0) / present.length : null;
    const hi = new Set(highlightIndexes(values, ["first", "max", "last"]));

    return {
      animationDuration: 500,
      grid: { left: 8, right: 12, top: 30, bottom: 4, containLabel: true },
      xAxis: categoryXAxis(t, months),
      yAxis: valueYAxis(t, { min: 0 }),
      tooltip: {
        ...tooltipBase(t),
        formatter: (ps: { dataIndex: number }[]) => {
          const i = ps[0].dataIndex;
          const items = [{ name: "지출", color: t.s2, value: fullWon(values[i]) }];
          if (avg !== null) items.push({ name: "기간 월평균", color: t.text3, value: fullWon(Math.round(avg)) });
          return tooltipHtml(t, formatMonthLong(months[i]), items);
        },
      },
      series: [
        {
          name: "지출",
          type: "line",
          data: values,
          connectNulls: false,
          symbol: "circle",
          symbolSize: 5,
          showSymbol: months.length <= 18,
          lineStyle: { width: 2.25, color: t.s2, cap: "round", join: "round" },
          itemStyle: { color: t.s2 },
          areaStyle: { color: t.s2, opacity: 0.08 },
          emphasis: { disabled: true },
          markLine:
            avg === null
              ? undefined
              : {
                  silent: true,
                  symbol: "none",
                  lineStyle: { color: t.text3, type: [4, 4], width: 1 },
                  label: { show: false }, // 값은 범례에 표시 (점 라벨과 겹치지 않게)
                  data: [{ yAxis: avg }],
                },
          z: 2,
        },
        {
          type: "scatter",
          data: highlightData(values, hi),
          symbolSize: 8,
          itemStyle: { color: t.s2, borderColor: t.surface, borderWidth: 2 },
          label: pointLabel(t, t.s2),
          silent: true,
          tooltip: { show: false },
          z: 4,
        },
      ],
    };
  }, [t, months, values]);

  return <EChart option={option} height={height} ariaLabel="월별 지출 추이 선 그래프" />;
}
