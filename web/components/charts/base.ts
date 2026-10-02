import type { ThemeTokens } from "./EChart";
import { formatCompactKRW, formatWon } from "@/lib/format";

/** 공통: 축/그리드는 조용하게, 데이터만 눈에 띄게 */
export function monthAxisLabel(months: string[]) {
  return (value: string, index: number) => {
    const mm = value.slice(5);
    // 첫 달과 1월에만 연도를 붙여 연도 경계를 표시
    return index === 0 || mm === "01" ? `${value.slice(2, 4)}.${mm}` : mm;
  };
}

export function categoryXAxis(t: ThemeTokens, months: string[], gridIndex = 0, showLabels = true) {
  return {
    type: "category" as const,
    data: months,
    gridIndex,
    boundaryGap: false,
    axisLine: { lineStyle: { color: t.axis } },
    axisTick: { show: false },
    axisLabel: {
      show: showLabels,
      color: t.text3,
      fontSize: 11,
      hideOverlap: true,
      formatter: monthAxisLabel(months),
    },
  };
}

export function valueYAxis(t: ThemeTokens, opts: { gridIndex?: number; min?: unknown; formatter?: (v: number) => string; splitNumber?: number } = {}) {
  return {
    type: "value" as const,
    gridIndex: opts.gridIndex ?? 0,
    min: opts.min,
    splitNumber: opts.splitNumber ?? 4,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: t.text3, fontSize: 11, formatter: opts.formatter ?? formatCompactKRW },
    splitLine: { lineStyle: { color: t.grid, width: 1 } },
  };
}

export interface TooltipItem {
  name: string;
  color: string;
  value: string;
}

/** 툴팁: 값·라벨은 텍스트 색, 계열 색은 옆의 점으로만 */
export function tooltipBase(t: ThemeTokens) {
  return {
    trigger: "axis" as const,
    confine: true,
    backgroundColor: t.surface,
    borderColor: t.axis,
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: t.text1, fontSize: 12 },
    extraCssText: "border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.12);",
    axisPointer: { type: "line" as const, lineStyle: { color: t.axis, width: 1 } },
  };
}

export function tooltipHtml(t: ThemeTokens, title: string, items: TooltipItem[]): string {
  const rows = items
    .map(
      (i) => `<div style="display:flex;align-items:center;gap:8px;justify-content:space-between;min-width:170px">
        <span style="display:flex;align-items:center;gap:6px;color:${t.text2}">
          <span style="width:8px;height:8px;border-radius:50%;background:${i.color}"></span>${i.name}</span>
        <b style="font-variant-numeric:tabular-nums;color:${t.text1};font-weight:600">${i.value}</b></div>`,
    )
    .join("");
  return `<div style="font-size:11px;color:${t.text3};margin-bottom:4px">${title}</div>${rows}`;
}

/** 선택적 라벨(첫 값·최댓값·마지막 값) 인덱스 — 서로 붙어 있으면 하나만 남김 */
export function highlightIndexes(values: (number | null)[], picks: ("first" | "max" | "last")[]): number[] {
  const present = values.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0);
  if (!present.length) return [];
  const out: number[] = [];
  for (const p of picks) {
    let idx = present[0];
    if (p === "last") idx = present[present.length - 1];
    if (p === "max") idx = present.reduce((a, b) => ((values[b] as number) > (values[a] as number) ? b : a));
    if (!out.some((o) => Math.abs(o - idx) <= 1)) out.push(idx);
  }
  return out;
}

export function pointLabel(t: ThemeTokens, color: string, position: "top" | "bottom" = "top") {
  return {
    show: true,
    position,
    distance: 8,
    color: t.text2,
    fontSize: 11,
    fontWeight: 600 as const,
    formatter: (p: { value: number | [number, number] }) =>
      formatCompactKRW(Array.isArray(p.value) ? p.value[1] : p.value),
    textBorderColor: t.surface,
    textBorderWidth: 3,
  };
}

export const fullWon = (v: number | null | undefined) => (v === null || v === undefined ? "–" : `${formatWon(v)}원`);

/** 강조 점 데이터 — 양 끝 점의 라벨은 안쪽으로 정렬해 축 라벨·카드 가장자리와 겹치지 않게 */
export function highlightData(values: (number | null)[], hi: Set<number>) {
  const last = values.length - 1;
  return values.map((v, i) => {
    if (!hi.has(i) || v === null) return null;
    if (i === 0) return { value: v, label: { align: "left" as const, offset: [-4, 0] } };
    if (i === last) return { value: v, label: { align: "right" as const, offset: [4, 0] } };
    return v;
  });
}
