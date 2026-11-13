"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MainOption } from "@/lib/expense";
import { formatCompactKRW } from "@/lib/format";

interface Props {
  options: MainOption[]; // 지출 큰 순
  value: string[]; // 비어 있으면 전체
  onChange: (v: string[]) => void;
  amountLabel: string; // 옆 금액이 무엇의 합계인지 (예: "최근 12개월")
}

/** 대분류 복수 선택 드롭다운 — 아무것도 고르지 않으면 전체 대분류 (Investment 종목 필터와 같은 모양) */
export default function MainFilter({ options, value, onChange, amountLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? options.filter((o) => o.name.toLowerCase().includes(k)) : options;
  }, [options, q]);

  const toggle = (name: string) => onChange(value.includes(name) ? value.filter((v) => v !== name) : [...value, name]);
  const label = !value.length ? "전체" : value.length === 1 ? value[0] : `${value[0]} 외 ${value.length - 1}`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex h-7 max-w-[180px] items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition sm:max-w-[240px] ${
          value.length ? "border-[var(--series-2)] bg-surface text-ink" : "border-line bg-surface text-ink-2"
        }`}
      >
        <span className="text-ink-3">대분류</span>
        <span className="truncate">{label}</span>
        <span aria-hidden className="text-[9px] text-ink-3">
          ▼
        </span>
      </button>

      {open && (
        <div role="dialog" aria-label="대분류 선택" className="card absolute right-0 top-9 z-30 w-[min(86vw,300px)] p-3">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="대분류 검색"
            aria-label="대분류 검색"
            className="mb-2 h-8 w-full rounded-lg border border-line bg-[var(--page)] px-2.5 text-sm outline-none focus:border-[var(--series-2)]"
          />
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold hover:bg-sunken">
            <input type="checkbox" checked={!value.length} onChange={() => onChange([])} className="accent-[var(--series-2)]" />
            전체 대분류
            <span className="ml-auto text-[11px] font-normal text-ink-3">{amountLabel}</span>
          </label>
          <ul className="mt-1 max-h-[46vh] overflow-y-auto border-t border-line pt-1">
            {shown.map((o) => (
              <li key={o.name}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-sunken">
                  <input
                    type="checkbox"
                    checked={value.includes(o.name)}
                    onChange={() => toggle(o.name)}
                    className="accent-[var(--series-2)]"
                  />
                  <span className={`min-w-0 truncate ${o.amount > 0 ? "" : "text-ink-3"}`}>{o.name}</span>
                  <span className="tnum ml-auto shrink-0 text-[11px] text-ink-3">{o.amount > 0 ? formatCompactKRW(o.amount) : "–"}</span>
                </label>
              </li>
            ))}
            {!shown.length && <li className="px-2 py-3 text-center text-xs text-ink-3">검색 결과가 없어요</li>}
          </ul>
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-2 w-full rounded-full border border-line py-1.5 text-xs font-semibold text-ink-2 hover:bg-sunken"
            >
              선택 해제 ({value.length}개 선택됨)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
