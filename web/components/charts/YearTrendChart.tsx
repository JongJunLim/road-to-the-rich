"use client";

import { useMemo } from "react";
import EChart, { type ThemeTokens } from "./EChart";
import { highlightData, highlightIndexes, pointLabel, tooltipBase, tooltipHtml, valueYAxis, fullWon } from "./base";
import { formatWon } from "@/lib/format";

const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

interface Props {
  tokens: ThemeTokens | null;
  cur: (number | null)[]; // 선택 연도 1~12월
  prev: (number | null)[]; // 전년도 1~12월
  curLabel: string;
  prevLabel: string;
  color: string; // CSS 색 (선택 연도), 전년도는 같은 색을 옅은 점선으로
  height: number;
  showAverage?: boolean; // 선택 연도 월평균 기준선
  ariaLabel: string;
}

/** 연도별 월 추이 — 선택 연도는 실선(첫 값·최댓값·마지막 값 라벨), 전년도는 옅은 점선 */
export default function YearTrendChart({ tokens: t, cur, prev, curLabel, prevLabel, color, height, showAverage, ariaLabel }: Props) {
  const option = useMemo(() => {
    if (!t) return null;
    const hi = new Set(highlightIndexes(cur, ["first", "max", "last"]));
    const present = cur.filter((v): v is number => v !== null);
    const avg = present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;

    return {
      animationDuration: 500,
      grid: { left: 8, right: 14, top: 26, bottom: 4, containLabel: true },
      xAxis: {
        type: "category" as const,
        data: MONTH_LABELS,
        boundaryGap: false,
        axisLine: { lineStyle: { color: t.axis } },
        axisTick: { show: false },
        axisLabel: { color: t.text3, fontSize: 11 },
      },
      yAxis: { ...valueYAxis(t), scale: true },
      tooltip: {
        ...tooltipBase(t),
        formatter: (ps: { dataIndex: number }[]) => {
          const i = ps[0].dataIndex;
          const c = cur[i];
          const p = prev[i];
          const items = [
            { name: curLabel, color, value: fullWon(c) },
            { name: prevLabel, color: t.axis, value: fullWon(p) },
          ];
          if (c !== null && p !== null) {
            const d = c - p;
            items.push({ name: "증감", color: "transparent", value: `${d >= 0 ? "▲" : "▼"}${formatWon(Math.abs(d))}원` });
          }
          return tooltipHtml(t, `${i + 1}월`, items);
        },
      },
      series: [
        {
          name: prevLabel,
          type: "line",
          data: prev,
          connectNulls: false,
          symbol: "none",
          lineStyle: { width: 1.75, color, type: "dashed" as const, opacity: 0.4 },
          emphasis: { disabled: true },
          z: 1,
        },
        {
          name: curLabel,
          type: "line",
          data: cur,
          connectNulls: true,
          symbol: "circle",
          symbolSize: 5,
          itemStyle: { color },
          lineStyle: { width: 2.25, color, cap: "round" as const, join: "round" as const },
          emphasis: { disabled: true },
          markLine:
            showAverage && avg !== null
              ? {
                  silent: true,
                  symbol: "none",
                  lineStyle: { color: t.text3, type: "solid" as const, width: 1, opacity: 0.6 },
                  label: {
                    position: "insideEndTop" as const,
                    color: t.text3,
                    fontSize: 10,
                    formatter: () => `평균 ${formatWon(avg)}`,
                  },
                  data: [{ yAxis: avg }],
                }
              : undefined,
          z: 2,
        },
        {
          type: "scatter",
          data: highlightData(cur, hi),
          symbolSize: 8,
          itemStyle: { color, borderColor: t.surface, borderWidth: 2 },
          label: pointLabel(t, color),
          labelLayout: { hideOverlap: true },
          tooltip: { show: false },
          silent: true,
          z: 3,
        },
      ],
    };
  }, [t, cur, prev, curLabel, prevLabel, color, showAverage]);

  return <EChart option={option} height={height} ariaLabel={ariaLabel} />;
}
