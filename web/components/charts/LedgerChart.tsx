"use client";

import { useMemo } from "react";
import EChart, { type ThemeTokens } from "./EChart";
import { categoryXAxis, highlightData, fullWon, highlightIndexes, pointLabel, tooltipBase, tooltipHtml, valueYAxis } from "./base";
import { formatMonthLong } from "@/lib/format";

export type LedgerKey = "income" | "expense" | "transfer_in" | "transfer_out";

export const LEDGER_SERIES: { key: LedgerKey; label: string; token: "s1" | "s2" | "s3" | "s4" }[] = [
  { key: "income", label: "수입", token: "s1" },
  { key: "expense", label: "지출", token: "s2" },
  { key: "transfer_in", label: "이체(수입)", token: "s3" },
  { key: "transfer_out", label: "이체(지출)", token: "s4" },
];

interface Props {
  tokens: ThemeTokens | null;
  months: string[];
  data: Record<LedgerKey, (number | null)[]>;
  visible: LedgerKey[];
  height: number;
}

/** 가계부 추이 — 같은 금액 축, 계열마다 최댓값만 라벨 (색은 대상별로 고정) */
export default function LedgerChart({ tokens: t, months, data, visible, height }: Props) {
  const option = useMemo(() => {
    if (!t) return null;
    const shown = LEDGER_SERIES.filter((s) => visible.includes(s.key));
    return {
      animationDuration: 500,
      grid: { left: 8, right: 16, top: 28, bottom: 4, containLabel: true },
      xAxis: categoryXAxis(t, months),
      yAxis: valueYAxis(t, { min: 0 }),
      tooltip: {
        ...tooltipBase(t),
        formatter: (ps: { dataIndex: number }[]) => {
          const i = ps[0].dataIndex;
          return tooltipHtml(
            t,
            formatMonthLong(months[i]),
            shown.map((s) => ({ name: s.label, color: t[s.token], value: fullWon(data[s.key][i]) })),
          );
        },
      },
      series: shown.flatMap((s) => {
        const color = t[s.token];
        const values = data[s.key];
        const hi = new Set(highlightIndexes(values, ["max"]));
        return [
          {
            name: s.label,
            type: "line",
            data: values,
            connectNulls: true,
            symbol: "none",
            lineStyle: { width: 2, color, cap: "round", join: "round" },
            itemStyle: { color },
            emphasis: { disabled: true },
          },
          {
            type: "scatter",
            data: highlightData(values, hi),
            symbolSize: 8,
            itemStyle: { color, borderColor: t.surface, borderWidth: 2 },
            label: pointLabel(t, color),
            labelLayout: { hideOverlap: true },
            silent: true,
            tooltip: { show: false },
            z: 3,
          },
        ];
      }),
    };
  }, [t, months, data, visible]);

  return <EChart option={option} height={height} ariaLabel="월별 수입·지출·이체 추이" />;
}
