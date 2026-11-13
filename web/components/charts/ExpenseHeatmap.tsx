"use client";

import { useMemo } from "react";
import EChart, { type ThemeTokens } from "./EChart";
import { monthAxisLabel } from "./base";
import type { HeatmapModel } from "@/lib/expense";
import { formatCompactKRW, formatMonthLong, formatWon } from "@/lib/format";

/**
 * 대분류 × 월 히트맵 — 색 = 지출 (진할수록 많음, 대분류 행마다가 아니라 표 전체 기준)
 * 칸을 누르면 그 달 · 그 대분류로 Drill down
 */
export default function ExpenseHeatmap({
  tokens: t,
  model,
  selectedYm,
  showLabels,
  onPick,
}: {
  tokens: ThemeTokens | null;
  model: HeatmapModel;
  selectedYm: string;
  showLabels: boolean;
  onPick?: (ym: string, main: string) => void;
}) {
  const ROW = 30;
  const height = Math.max(160, model.mains.length * ROW + 56);

  const option = useMemo(() => {
    if (!t) return null;
    const data: [number, number, number | null][] = [];
    model.values.forEach((row, y) => row.forEach((v, x) => data.push([x, y, v])));
    const positives = data.map((d) => d[2] ?? 0).filter((v) => v > 0).sort((a, b) => a - b);
    // 목돈 한두 칸 때문에 나머지가 모두 옅어지지 않게 95백분위를 최댓값으로
    const cap = positives.length ? positives[Math.floor((positives.length - 1) * 0.95)] : 1;
    const selX = model.months.indexOf(selectedYm);

    return {
      animationDuration: 300,
      grid: { left: 8, right: 8, top: 8, bottom: 4, containLabel: true },
      xAxis: {
        type: "category",
        data: model.months,
        position: "top",
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: t.text3,
          fontSize: 11,
          formatter: (v: string, i: number) => {
            const text = monthAxisLabel(model.months)(v, i);
            return v === selectedYm ? `{sel|${text}}` : text;
          },
          rich: { sel: { color: t.text1, fontWeight: 700, fontSize: 11 } },
        },
        splitArea: { show: false },
      },
      yAxis: {
        type: "category",
        data: model.mains,
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: t.text2, fontSize: 11.5, width: 84, overflow: "truncate" },
      },
      visualMap: {
        show: false,
        min: 0,
        max: Math.max(1, cap),
        inRange: { color: [t.surface, t.bad] },
        outOfRange: { color: t.grid },
        calculable: false,
        dimension: 2,
      },
      tooltip: {
        trigger: "item",
        confine: true,
        backgroundColor: t.surface,
        borderColor: t.axis,
        textStyle: { color: t.text1, fontSize: 12 },
        extraCssText: "border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.12);",
        formatter: (p: { value: [number, number, number | null] }) => {
          const [x, y, v] = p.value;
          return `<div style="color:${t.text3};font-size:11px">${formatMonthLong(model.months[x])} · ${model.mains[y]}</div>
            <b style="font-variant-numeric:tabular-nums">${v === null ? "데이터 없음" : `${v < 0 ? "−" : ""}${formatWon(Math.abs(v))}원`}</b>`;
        },
      },
      series: [
        {
          type: "heatmap",
          data: data.map(([x, y, v]) => ({
            value: [x, y, v === null ? null : Math.max(0, v)],
            // 선택한 달 열은 테두리로 표시
            itemStyle: x === selX ? { borderColor: t.text2, borderWidth: 1.5 } : undefined,
          })),
          itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 4 },
          label: {
            show: showLabels,
            fontSize: 10,
            color: t.text2,
            formatter: (p: { value: [number, number, number | null] }) => (p.value[2] ? formatCompactKRW(p.value[2]) : ""),
          },
          emphasis: { disabled: true },
        },
      ],
    };
  }, [t, model, selectedYm, showLabels]);

  return (
    <EChart
      option={option}
      height={height}
      ariaLabel="대분류별 월 지출 히트맵"
      onClick={onPick ? (p) => {
        const v = (p.data as { value: [number, number, number | null] } | undefined)?.value;
        if (v) onPick(model.months[v[0]], model.mains[v[1]]);
      } : undefined}
    />
  );
}
