"use client";

import { useMemo } from "react";
import EChart, { type ThemeTokens } from "./EChart";
import type { ChangeBreakdown } from "@/lib/expense";
import { formatCompactKRW, formatWon } from "@/lib/format";

/** 보기 좋은 아래쪽 경계 (유효숫자 2자리로 내림) */
function niceFloor(v: number): number {
  if (v <= 0) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.floor(v / p) * p;
}

/** 세로축을 0이 아닌 곳에서 시작하는지 (화면 안내문용) */
export function expenseWaterfallZoomed(b: ChangeBreakdown): boolean {
  let level = b.start;
  const levels = [b.start];
  for (const s of b.steps) levels.push((level += s.diff));
  const lo = Math.min(...levels, b.end);
  return lo > 0 && Math.max(...levels, b.end) - lo < lo * 0.35;
}

/**
 * 지출 증감 분해 (폭포 차트)
 * 전월 지출 → 대분류별 증감(늘면 빨강 / 줄면 파랑) → 이번 달 지출
 * 막대를 누르면 그 대분류로 Drill down
 */
export default function ExpenseWaterfall({
  tokens: t,
  data: b,
  prevLabel,
  curLabel,
  height,
  compact = false,
  onPick,
}: {
  tokens: ThemeTokens | null;
  data: ChangeBreakdown;
  prevLabel: string;
  curLabel: string;
  height: number;
  compact?: boolean; // 좁은 화면: 분류 이름을 비스듬히
  onPick?: (main: string) => void;
}) {
  const option = useMemo(() => {
    if (!t) return null;
    const cats = [`${prevLabel}`, ...b.steps.map((s) => s.label), `${curLabel}`];
    // [받침, 막대 높이, 실제 값, 색]
    const steps: [number, number, number, string][] = [[0, b.start, b.start, t.s2]];
    let level = b.start;
    for (const s of b.steps) {
      const next = level + s.diff;
      steps.push([Math.min(level, next), Math.abs(s.diff), s.diff, s.diff > 0 ? t.bad : t.good]);
      level = next;
    }
    steps.push([0, b.end, b.end, t.s2]);

    const levels = [b.start, ...steps.slice(1, -1).map((x) => x[0]), ...steps.slice(1, -1).map((x) => x[0] + x[1]), b.end];
    const lo = Math.min(...levels);
    const hi = Math.max(...levels);
    const zoom = lo > 0 && hi - lo < lo * 0.35;
    const yMin = zoom ? Math.max(0, niceFloor(lo - Math.max((hi - lo) * 0.8, hi * 0.02))) : 0;
    const last = steps.length - 1;
    const signed = (v: number, i: number) =>
      i === 0 || i === last ? formatCompactKRW(v) : `${v >= 0 ? "+" : "−"}${formatCompactKRW(Math.abs(v))}`;

    return {
      animationDuration: 500,
      grid: { left: 8, right: 8, top: 28, bottom: 4, containLabel: true },
      xAxis: {
        type: "category",
        data: cats,
        axisLine: { lineStyle: { color: t.axis } },
        axisTick: { show: false },
        axisLabel: compact
          ? { color: t.text2, fontSize: 10, interval: 0, rotate: 40, width: 60, overflow: "truncate" }
          : { color: t.text2, fontSize: 11, interval: 0, width: 64, overflow: "truncate" },
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
          const i = p.dataIndex;
          const v = steps[i][2];
          const sign = i === 0 || i === last ? "" : v >= 0 ? "+" : "−";
          const hint = i > 0 && i < last && b.steps[i - 1].main ? `<div style="color:${t.text3};font-size:10.5px;margin-top:2px">누르면 이 대분류로 Drill down</div>` : "";
          return `<div style="color:${t.text3};font-size:11px">${cats[i]}</div><b style="font-variant-numeric:tabular-nums">${sign}${formatWon(Math.abs(v))}원</b>${hint}`;
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
          barMaxWidth: 52,
          data: steps.map((s) => ({ value: s[1], itemStyle: { color: s[3], borderRadius: 6 } })),
          label: {
            show: true,
            position: "top",
            color: t.text1,
            fontSize: 11.5,
            fontWeight: 700,
            formatter: (p: { dataIndex: number }) => signed(steps[p.dataIndex][2], p.dataIndex),
          },
          emphasis: { disabled: true },
        },
      ],
    };
  }, [t, b, prevLabel, curLabel, compact]);

  return (
    <EChart
      option={option}
      height={height}
      ariaLabel="전월 대비 지출 변화를 대분류별 증감으로 나눈 폭포 차트"
      onClick={
        onPick
          ? (p) => {
              const step = b.steps[p.dataIndex - 1];
              if (p.seriesIndex === 1 && step?.main) onPick(step.main);
            }
          : undefined
      }
    />
  );
}
