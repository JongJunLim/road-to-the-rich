"use client";

import { useState } from "react";
import { formatMonthLong, formatWon } from "@/lib/format";

export interface TableColumn {
  label: string;
  values: (number | null)[];
  format?: (v: number | null) => string;
}

interface Props {
  title: string;
  subtitle?: string;
  controls?: React.ReactNode; // 제목 오른쪽 (기간·계열 선택 등)
  legend?: React.ReactNode;
  months: string[];
  table: TableColumn[];
  className?: string;
  children: React.ReactNode;
}

/** 차트 카드 — 모든 차트는 "표로 보기"를 제공 (색 구분이 어려운 경우·정확한 값 확인용) */
export default function ChartCard({ title, subtitle, controls, legend, months, table, className = "", children }: Props) {
  const [asTable, setAsTable] = useState(false);

  return (
    <section className={`card flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-ink-3">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {controls}
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            aria-pressed={asTable}
            className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-2 transition hover:bg-sunken"
          >
            {asTable ? "차트" : "표"}
          </button>
        </div>
      </header>
      {legend && <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">{legend}</div>}

      <div className="mt-2 min-w-0 flex-1">
        {asTable ? (
          <div className="max-h-[320px] overflow-auto rounded-xl border border-line">
            <table className="tnum w-full text-right text-xs">
              <thead className="sticky top-0 bg-sunken text-ink-2">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">월</th>
                  {table.map((c) => (
                    <th key={c.label} className="whitespace-nowrap px-3 py-2 font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months
                  .map((m, i) => ({ m, i }))
                  .reverse()
                  .map(({ m, i }) => (
                    <tr key={m} className="border-t border-line">
                      <td className="whitespace-nowrap px-3 py-1.5 text-left text-ink-2">{formatMonthLong(m)}</td>
                      {table.map((c) => (
                        <td key={c.label} className="whitespace-nowrap px-3 py-1.5">
                          {(c.format ?? formatWon)(c.values[i])}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/** 범례 항목 — 선 모양 스와치 + 텍스트 색 라벨 */
export function LegendItem({ color, label, dot = false }: { color: string; label: string; dot?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-ink-2">
      <span
        aria-hidden
        style={{ background: color }}
        className={dot ? "h-2 w-2 rounded-full" : "h-[3px] w-3.5 rounded-full"}
      />
      {label}
    </span>
  );
}
