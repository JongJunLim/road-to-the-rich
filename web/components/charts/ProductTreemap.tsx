"use client";

import { useMemo } from "react";
import EChart, { type ThemeTokens } from "./EChart";
import type { Holding } from "@/lib/invest";
import { formatPct, formatWon } from "@/lib/format";

export type TreemapSize = "valuation" | "principal";

interface Props {
  tokens: ThemeTokens | null;
  holdings: Holding[];
  height: number;
  sizeBy?: TreemapSize; // 칸 크기 기준 (기본 평가금)
}

/**
 * 수익률 → 색 강도 (0% = 중립 회색)
 * - 이익: 로그 눈금, +300% 이상이 가장 진한 파랑 (수백 % 종목이 많아도 서로 구분되게)
 * - 손실: −50% 이하가 가장 진한 빨강
 */
export const RATE_SCALE = { good: 3.0, bad: 0.5 };

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return t > 0.5 ? b : a;
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function luminance(color: string): number {
  const m = color.match(/\d+/g);
  if (!m) return 1;
  const [r, g, b] = m.slice(0, 3).map((v) => Number(v) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function rateColor(t: ThemeTokens, neutral: string, rate: number | null): string {
  if (rate === null) return neutral;
  const k =
    rate >= 0 ? Math.min(1, Math.log1p(rate) / Math.log1p(RATE_SCALE.good)) : Math.min(1, -rate / RATE_SCALE.bad);
  // 작은 수익률도 구분되도록 제곱근 곡선 (0~10% 구간이 너무 흐리지 않게)
  return mix(neutral, rate >= 0 ? t.good : t.bad, 0.12 + 0.88 * Math.sqrt(k));
}

/** 종목 구성 트리맵 — 크기 = 평가금 또는 원금(선택), 색 = 수익률 (0% 기준 파랑/빨강) */
export default function ProductTreemap({ tokens: t, holdings, height, sizeBy = "valuation" }: Props) {
  const option = useMemo(() => {
    if (!t) return null;
    const neutral = t.grid;
    const data = holdings
      .filter((h) => (sizeBy === "principal" ? h.principal : h.valuation) > 0)
      .map((h) => {
        const color = rateColor(t, neutral, h.rate);
        const light = luminance(color) > 0.55;
        return {
          name: h.product,
          value: sizeBy === "principal" ? h.principal : h.valuation,
          valuation: h.valuation,
          principal: h.principal,
          rate: h.rate,
          share: h.share,
          shareP: h.shareP,
          itemStyle: { color },
          label: { color: light ? "#151515" : "#ffffff" },
        };
      });

    type P = {
      name: string;
      value: number;
      data: { valuation: number; principal: number; rate: number | null; share: number | null; shareP: number | null };
    };
    const pct = (v: number | null) => (v !== null ? ` (${formatPct(v, 1)})` : "");
    // 크기 기준 지표를 먼저, 구성비(%)는 크기 기준 지표에 붙임
    const lines = (p: P) =>
      sizeBy === "principal"
        ? [
            `{name|${p.name}}`,
            `{v|원금 ${formatWon(p.data.principal)}${pct(p.data.shareP)}}`,
            `{v|평가금 ${formatWon(p.data.valuation)}}`,
            `{v|수익률 ${formatPct(p.data.rate, 1)}}`,
          ]
        : [
            `{name|${p.name}}`,
            `{v|평가금 ${formatWon(p.data.valuation)}${pct(p.data.share)}}`,
            `{v|원금 ${formatWon(p.data.principal)}}`,
            `{v|수익률 ${formatPct(p.data.rate, 1)}}`,
          ];

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
        formatter: (p: P) => {
          const rate = p.data.rate;
          const rc = rate === null ? t.text2 : rate >= 0 ? t.good : t.bad;
          return `<div style="font-weight:600;margin-bottom:4px">${p.name}</div>
            <div style="display:grid;grid-template-columns:auto auto;gap:2px 14px;font-variant-numeric:tabular-nums">
              <span style="color:${t.text2}">평가금</span><b style="text-align:right">${formatWon(p.data.valuation)}원 <span style="color:${t.text3};font-weight:400">(${formatPct(p.data.share, 1)})</span></b>
              <span style="color:${t.text2}">원금</span><b style="text-align:right">${formatWon(p.data.principal)}원 <span style="color:${t.text3};font-weight:400">(${formatPct(p.data.shareP, 1)})</span></b>
              <span style="color:${t.text2}">수익률</span><b style="text-align:right;color:${rc}">${formatPct(rate, 1)}</b>
            </div>`;
        },
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
            formatter: (p: P) => lines(p).join("\n"),
            rich: {
              name: { fontSize: 13, fontWeight: 700, lineHeight: 20 },
              v: { fontSize: 11, lineHeight: 16, opacity: 0.92 },
            },
          },
          emphasis: { disabled: true },
        },
      ],
    };
  }, [t, holdings, sizeBy]);

  return (
    <EChart
      option={option}
      height={height}
      ariaLabel={`종목별 ${sizeBy === "principal" ? "원금" : "평가금"} 구성과 수익률 트리맵`}
    />
  );
}
