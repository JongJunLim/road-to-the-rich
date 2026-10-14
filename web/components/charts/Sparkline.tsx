"use client";

import { useState } from "react";

/**
 * KPI 카드용 5개년 미니 차트 (SVG) — 마우스를 올리거나(PC) 누르면(모바일) 연도·값 팝업
 *  - kind="area": 연도별 합계 추이 (Tableau 원본과 같은 영역 + 점)
 *  - kind="bars": 양수/음수 막대 (연말정산 환급·징수)
 */

export interface SparkPoint {
  key: string;
  value: number | null;
  title: string; // 팝업 1행 (예: 2026년 급여)
  detail: string; // 팝업 2행 (예: 37,766,672원)
  color?: string; // 막대 색 (bars)
}

interface Props {
  points: SparkPoint[];
  kind: "area" | "bars";
  color?: string; // 영역 색 (area)
  label: string; // 스크린리더용 설명
}

const W = 120;
const H = 40;
const PAD = 5;

export default function Sparkline({ points, kind, color = "currentColor", label }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const n = points.length;
  const slot = (W - PAD * 2) / Math.max(n, 1);
  const cx = (i: number) => PAD + slot * i + slot / 2;
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null);

  let body: React.ReactNode = null;
  let anchorY: (i: number) => number = () => H / 2;

  if (vals.length && kind === "area") {
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const y = (v: number) => (max === min ? H / 2 : H - PAD - ((v - min) / (max - min)) * (H - PAD * 2));
    anchorY = (i) => (points[i].value === null ? H / 2 : y(points[i].value as number));
    const present = points.map((p, i) => ({ v: p.value, i })).filter((p): p is { v: number; i: number } => p.v !== null);
    const line = present.map((p, k) => `${k ? "L" : "M"}${cx(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
    const area = present.length > 1 ? `${line} L${cx(present.at(-1)!.i).toFixed(1)},${H} L${cx(present[0].i).toFixed(1)},${H} Z` : "";
    body = (
      <>
        {area && <path d={area} fill={color} opacity={0.14} />}
        {present.length > 1 && (
          <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        )}
      </>
    );
  }

  if (vals.length && kind === "bars") {
    const maxAbs = Math.max(...vals.map(Math.abs), 1);
    const hasNeg = vals.some((v) => v < 0);
    const hasPos = vals.some((v) => v > 0);
    const zero = hasNeg && hasPos ? H / 2 : hasNeg ? PAD : H - PAD;
    const room = hasNeg && hasPos ? H / 2 - PAD : H - PAD * 2;
    const bw = Math.min(14, slot * 0.6);
    anchorY = (i) => {
      const v = points[i].value ?? 0;
      return v >= 0 ? zero - Math.max(2, (Math.abs(v) / maxAbs) * room) : zero;
    };
    body = (
      <>
        {points.map((p, i) => {
          if (p.value === null) return null;
          const h = Math.max(2, (Math.abs(p.value) / maxAbs) * room);
          return (
            <rect
              key={p.key}
              x={cx(i) - bw / 2}
              y={p.value >= 0 ? zero - h : zero}
              width={bw}
              height={h}
              rx={1.5}
              fill={p.color ?? color}
              opacity={active === null || active === i ? 1 : 0.45}
            />
          );
        })}
        <line x1={PAD} x2={W - PAD} y1={zero} y2={zero} stroke="var(--axis)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </>
    );
  }

  const tip = active !== null && points[active]?.value !== null ? points[active] : null;
  // 팝업 위치: 양 끝 점은 카드 밖으로 나가지 않게 안쪽 정렬
  const tipX = active === null ? 0 : (cx(active) / W) * 100;
  const tipShift = active === 0 ? "0%" : active === n - 1 ? "-100%" : "-50%";

  return (
    <div className="relative h-10 w-full" onPointerLeave={() => setActive(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-10 w-full overflow-visible" role="img" aria-label={label}>
        {body}
      </svg>
      {/* 점(원형 유지)은 SVG 밖에 그려 가로로 늘어나지 않게 */}
      {kind === "area" &&
        points.map((p, i) =>
          p.value === null ? null : (
            <span
              key={p.key}
              aria-hidden
              className="pointer-events-none absolute rounded-full border-2 border-[var(--surface)] transition-all"
              style={{
                left: `${(cx(i) / W) * 100}%`,
                top: `${(anchorY(i) / H) * 100}%`,
                width: active === i ? 10 : i === n - 1 ? 8 : 6,
                height: active === i ? 10 : i === n - 1 ? 8 : 6,
                transform: "translate(-50%, -50%)",
                background: color,
              }}
            />
          ),
        )}
      {/* 연도별 터치 영역 */}
      <div className="absolute inset-0 flex" style={{ paddingLeft: `${(PAD / W) * 100}%`, paddingRight: `${(PAD / W) * 100}%` }}>
        {points.map((p, i) => (
          <button
            key={p.key}
            type="button"
            aria-label={p.value === null ? `${p.title} 데이터 없음` : `${p.title} ${p.detail}`}
            onPointerEnter={(e) => e.pointerType === "mouse" && setActive(i)}
            onClick={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className="h-full flex-1 cursor-default focus:outline-none"
          />
        ))}
      </div>
      {tip && (
        <div
          role="tooltip"
          className="card pointer-events-none absolute bottom-full z-30 mb-1.5 whitespace-nowrap px-2.5 py-1.5 text-left"
          style={{ left: `${tipX}%`, transform: `translateX(${tipShift})`, borderRadius: 10 }}
        >
          <div className="text-[11px] font-semibold text-ink">{tip.title}</div>
          <div className="tnum text-[11px] text-ink-2">{tip.detail}</div>
        </div>
      )}
    </div>
  );
}
