"use client";

import { useMemo } from "react";
import EChart, { type ThemeTokens } from "./EChart";
import type { Flow } from "@/lib/invest";
import { formatCompactKRW, formatWon } from "@/lib/format";

/**
 * 평가금 변동 분해 (폭포 차트)
 * 전월 평가금 → + 추가 투자 → + 시장 손익 → 이번 달 평가금
 * 막대 아래는 투명한 받침 막대로 띄워서 "얼마에서 얼마로" 이동했는지 보이게 함
 */
/** 보기 좋은 아래쪽 경계 (유효숫자 2자리로 내림) */
function niceFloor(v: number): number {
  if (v <= 0) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.floor(v / p) * p;
}

/** 세로축을 0이 아닌 곳에서 시작하는지 (화면 안내문용) */
export function waterfallZoomed(flow: Flow): boolean {
  const levels = [flow.start, flow.start + flow.flow, flow.end];
  const lo = Math.min(...levels);
  return lo > 0 && Math.max(...levels) - lo < lo * 0.2;
}

export default function FlowWaterfall({ tokens: t, flow, prevLabel, curLabel, height }: {
  tokens: ThemeTokens | null;
  flow: Flow;
  prevLabel: string;
  curLabel: string;
  height: number;
}) {
  const option = useMemo(() => {
    if (!t) return null;
    const cats = [`${prevLabel} 평가금`, "추가 투자", "시장 손익", `${curLabel} 평가금`];
    const afterFlow = flow.start + flow.flow;
    // [받침, 막대 높이, 실제 값, 색]
    const steps: [number, number, number, string][] = [
      [0, flow.start, flow.start, t.s2],
      [Math.min(flow.start, afterFlow), Math.abs(flow.flow), flow.flow, t.s1],
      [Math.min(afterFlow, flow.end), Math.abs(flow.market), flow.market, flow.market >= 0 ? t.good : t.bad],
      [0, flow.end, flow.end, t.s2],
    ];
    // 변동이 평가금에 비해 작으면 막대가 안 보이므로 세로축을 0이 아닌 곳에서 시작 (폭포 차트 관례)
    const levels = [flow.start, afterFlow, flow.end];
    const lo = Math.min(...levels);
    const hi = Math.max(...levels);
    const span = hi - lo;
    const zoom = lo > 0 && span < lo * 0.2;
    const yMin = zoom ? Math.max(0, niceFloor(lo - Math.max(span * 1.2, hi * 0.01))) : 0;
    const signed = (v: number, i: number) => (i === 0 || i === 3 ? formatCompactKRW(v) : `${v >= 0 ? "+" : "−"}${formatCompactKRW(Math.abs(v))}`);
    return {
      animationDuration: 500,
      grid: { left: 8, right: 8, top: 28, bottom: 4, containLabel: true },
      xAxis: {
        type: "category",
        data: cats,
        axisLine: { lineStyle: { color: t.axis } },
        axisTick: { show: false },
        axisLabel: { color: t.text2, fontSize: 11, interval: 0 },
      },
      yAxis: {
        type: "value",
        min: yMin,
        scale: zoom,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: t.text3, fontSize: 11, formatter: formatCompactKRW },
        splitLine: { lineStyle: { color: t.grid } },
      },
      tooltip: {
        trigger: "item",
        confine: true,
        backgroundColor: t.surface,
        borderColor: t.axis,
        textStyle: { color: t.text1, fontSize: 12 },
        extraCssText: "border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.12);",
        formatter: (p: { dataIndex: number }) => {
          const [, , v] = steps[p.dataIndex];
          const sign = p.dataIndex === 1 || p.dataIndex === 2 ? (v >= 0 ? "+" : "−") : "";
          return `<div style="color:${t.text3};font-size:11px">${cats[p.dataIndex]}</div><b style="font-variant-numeric:tabular-nums">${sign}${formatWon(Math.abs(v))}원</b>`;
        },
      },
      series: [
        {
          type: "bar",
          stack: "w",
          data: steps.map((s) => s[0]),
          itemStyle: { color: "transparent" },
          emphasis: { disabled: true },
          tooltip: { show: false },
          silent: true,
        },
        {
          type: "bar",
          stack: "w",
          barMaxWidth: 56,
          data: steps.map((s) => ({ value: s[1], itemStyle: { color: s[3], borderRadius: 6 } })),
          label: {
            show: true,
            position: "top",
            color: t.text1,
            fontSize: 12,
            fontWeight: 700,
            formatter: (p: { dataIndex: number }) => signed(steps[p.dataIndex][2], p.dataIndex),
          },
          emphasis: { disabled: true },
        },
      ],
    };
  }, [t, flow, prevLabel, curLabel]);

  return <EChart option={option} height={height} ariaLabel="전월 대비 평가금 변동을 추가 투자와 시장 손익으로 나눈 폭포 차트" />;
}
