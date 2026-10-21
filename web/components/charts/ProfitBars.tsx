"use client";

import { useMemo } from "react";
import EChart, { type ThemeTokens } from "./EChart";
import type { Holding } from "@/lib/invest";
import { formatCompactKRW, formatPct, formatWon } from "@/lib/format";

/** 종목별 평가손익 (평가금 − 원금) — 이익은 오른쪽 파랑, 손실은 왼쪽 빨강, 큰 순 */
export default function ProfitBars({ tokens: t, holdings }: { tokens: ThemeTokens | null; holdings: Holding[] }) {
  const list = useMemo(() => [...holdings].sort((a, b) => a.profit - b.profit), [holdings]); // 아래→위로 그려지므로 오름차순
  const height = Math.max(220, list.length * 26 + 40);

  const option = useMemo(() => {
    if (!t) return null;
    return {
      animationDuration: 500,
      grid: { left: 8, right: 56, top: 8, bottom: 4, containLabel: true },
      xAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitNumber: 3,
        axisLabel: { color: t.text3, fontSize: 11, formatter: formatCompactKRW, hideOverlap: true },
        splitLine: { lineStyle: { color: t.grid } },
      },
      yAxis: {
        type: "category",
        data: list.map((h) => h.product),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: t.text2, fontSize: 11, width: 110, overflow: "truncate" },
      },
      tooltip: {
        trigger: "item",
        confine: true,
        backgroundColor: t.surface,
        borderColor: t.axis,
        textStyle: { color: t.text1, fontSize: 12 },
        extraCssText: "border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.12);",
        formatter: (p: { dataIndex: number }) => {
          const h = list[p.dataIndex];
          const c = h.profit >= 0 ? t.good : t.bad;
          return `<div style="font-weight:600;margin-bottom:4px">${h.product}</div>
            <div style="display:grid;grid-template-columns:auto auto;gap:2px 14px;font-variant-numeric:tabular-nums">
            <span style="color:${t.text2}">평가손익</span><b style="text-align:right;color:${c}">${h.profit >= 0 ? "+" : "−"}${formatWon(Math.abs(h.profit))}원</b>
            <span style="color:${t.text2}">수익률</span><b style="text-align:right;color:${c}">${formatPct(h.rate, 1)}</b>
            <span style="color:${t.text2}">평가금</span><b style="text-align:right">${formatWon(h.valuation)}원</b>
            <span style="color:${t.text2}">원금</span><b style="text-align:right">${formatWon(h.principal)}원</b></div>`;
        },
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 16,
          data: list.map((h) => ({
            value: h.profit,
            itemStyle: { color: h.profit >= 0 ? t.good : t.bad, borderRadius: h.profit >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] },
            // 손실 라벨도 0선 오른쪽에 (작은 손실 막대 옆 라벨이 종목명과 겹치지 않게), 색으로 구분
            //   (음수 막대의 "오른쪽" = 0선 쪽)
            label: { position: "right", color: h.profit >= 0 ? t.text2 : t.bad },
          })),
          label: {
            show: true,
            color: t.text2,
            fontSize: 11,
            fontWeight: 600,
            formatter: (p: { value: number }) => `${p.value >= 0 ? "+" : "−"}${formatCompactKRW(Math.abs(p.value))}`,
          },
          markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: t.axis, type: "solid" }, data: [{ xAxis: 0 }] },
          emphasis: { disabled: true },
        },
      ],
    };
  }, [t, list]);

  return <EChart option={option} height={height} ariaLabel="종목별 평가손익 막대 차트" />;
}
