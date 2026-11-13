"use client";

import { useMemo } from "react";
import EChart, { type ThemeTokens } from "./EChart";
import { luminance, mix } from "./ProductTreemap";
import type { Slice } from "@/lib/expense";
import { formatPct, formatWon } from "@/lib/format";

interface Props {
  tokens: ThemeTokens | null;
  slices: Slice[];
  level: "main" | "sub";
  height: number;
  onPick?: (slice: Slice) => void; // 칸을 누르면 Drill down
}

/** 금액 → 색 강도: 그 달 가장 큰 칸이 가장 진한 빨강, 작을수록 회색 (작은 칸은 옅게, 큰 칸일수록 진하게) */
export function amountColor(t: ThemeTokens, amount: number, max: number): string {
  const k = max > 0 ? Math.min(1, Math.max(0, amount / max)) : 0;
  return mix(t.grid, t.bad, 0.08 + 0.92 * Math.pow(k, 0.8));
}

/** 지출 구성 트리맵 — 크기 = 지출, 색 = 지출(클수록 빨강) */
export default function ExpenseTreemap({ tokens: t, slices, level, height, onPick }: Props) {
  const option = useMemo(() => {
    if (!t) return null;
    const max = Math.max(0, ...slices.map((s) => s.amount));
    const data = slices.map((s) => {
      const color = amountColor(t, s.amount, max);
      return {
        name: s.name,
        key: s.key,
        value: s.amount,
        main: s.main,
        share: s.share,
        itemStyle: { color },
        label: { color: luminance(color) > 0.55 ? "#151515" : "#ffffff" },
      };
    });
    type P = { name: string; value: number; data: { main: string; share: number } };

    return {
      animationDuration: 400,
      tooltip: {
        confine: true,
        backgroundColor: t.surface,
        borderColor: t.axis,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: t.text1, fontSize: 12 },
        extraCssText: "border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.12);",
        formatter: (p: P) => `<div style="font-weight:600;margin-bottom:4px">${p.name}</div>
          <div style="display:grid;grid-template-columns:auto auto;gap:2px 14px;font-variant-numeric:tabular-nums">
            ${level === "sub" ? `<span style="color:${t.text2}">대분류</span><b style="text-align:right">${p.data.main}</b>` : ""}
            <span style="color:${t.text2}">지출</span><b style="text-align:right">${formatWon(p.value)}원</b>
            <span style="color:${t.text2}">구성비</span><b style="text-align:right">${formatPct(p.data.share, 1)}</b>
          </div>`,
      },
      series: [
        {
          type: "treemap",
          data,
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          squareRatio: 1.4,
          itemStyle: { borderColor: t.surface, borderWidth: 2, gapWidth: 2, borderRadius: 6 },
          label: {
            show: true,
            position: "insideTopLeft",
            padding: [8, 10],
            overflow: "truncate",
            lineOverflow: "truncate",
            formatter: (p: P) => [`{name|${p.name}}`, `{v|${formatWon(p.value)}원 (${formatPct(p.data.share, 1)})}`].join("\n"),
            rich: {
              name: { fontSize: 13, fontWeight: 700, lineHeight: 20 },
              v: { fontSize: 11, lineHeight: 16, opacity: 0.92 },
            },
          },
          emphasis: { disabled: true },
        },
      ],
    };
  }, [t, slices, level]);

  return (
    <EChart
      option={option}
      height={height}
      ariaLabel={`${level === "main" ? "대분류" : "중분류"}별 지출 구성 트리맵`}
      onClick={
        onPick
          ? (p) => {
              const key = (p.data as { key?: string } | undefined)?.key;
              const hit = slices.find((s) => s.key === key);
              if (hit) onPick(hit);
            }
          : undefined
      }
    />
  );
}
