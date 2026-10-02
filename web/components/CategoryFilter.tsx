"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORY_GROUPS, DEFAULT_CATEGORY_KEYS, type CategoryGroup, type CategoryOption } from "@/lib/metrics";

interface Props {
  options: CategoryOption[];
  value: string[];
  onChange: (keys: string[]) => void;
}

/** 그룹별 선택 요약: 선택 없으면 "전체", 2개까지 이름, 그 이상은 "외 N" */
export function summarizeGroup(value: string[], group: CategoryGroup): string {
  const names = value.filter((k) => k.startsWith(`${group}|`)).map((k) => k.slice(group.length + 1));
  if (!names.length) return "전체";
  return names.length <= 2 ? names.join(" · ") : `${names[0]} 외 ${names.length - 1}`;
}

/**
 * category_main 다중 선택 드롭다운
 * - 그룹(수입/지출/이체) 안에서 아무것도 고르지 않으면 그 그룹 전체가 합산된다
 * - KPI(수입·지출)와 가계부 추이 차트에 함께 적용
 */
export default function CategoryFilter({ options, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭·Esc 로 닫기
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

  const toggle = (key: string) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  const clearGroup = (group: CategoryGroup) => onChange(value.filter((k) => !k.startsWith(`${group}|`)));

  const restricted = CATEGORY_GROUPS.filter((g) => value.some((k) => k.startsWith(`${g.id}|`)));
  const label = restricted.length
    ? restricted.map((g) => `${g.label} ${summarizeGroup(value, g.id)}`).join(" / ")
    : "전체";

  return (
    <div ref={rootRef} className="lg:relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex h-9 max-w-[168px] items-center sm:max-w-[260px] gap-1.5 rounded-full border px-3 text-sm font-medium transition ${
          restricted.length ? "border-[var(--series-1)] bg-surface" : "border-line bg-surface"
        }`}
      >
        <span className="hidden text-ink-3 sm:inline">카테고리</span>
        <span className="sr-only sm:hidden">카테고리</span>
        <span className="truncate">{label}</span>
        <span aria-hidden className="text-[10px] text-ink-3">
          ▼
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="카테고리 선택"
          className="card absolute left-0 top-full z-30 mt-2 w-[min(92vw,420px)] p-4 lg:top-11 lg:mt-0"
        >
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {CATEGORY_GROUPS.map((g) => {
              const items = options.filter((o) => o.group === g.id);
              if (!items.length) return null;
              const any = value.some((k) => k.startsWith(`${g.id}|`));
              return (
                <fieldset key={g.id}>
                  <legend className="mb-2 flex w-full items-center justify-between text-xs font-semibold text-ink-2">
                    <span>
                      {g.label}
                      <span className="ml-1.5 font-normal text-ink-3">{any ? "선택한 항목만" : "선택 없음 = 전체"}</span>
                    </span>
                    {any && (
                      <button type="button" onClick={() => clearGroup(g.id)} className="font-medium text-[var(--series-1)]">
                        전체로
                      </button>
                    )}
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((o) => {
                      const on = value.includes(o.key);
                      return (
                        <button
                          key={o.key}
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          onClick={() => toggle(o.key)}
                          className={`h-8 rounded-full border px-3 text-xs font-medium transition ${
                            on
                              ? "border-transparent bg-[var(--accent)] text-[var(--surface)]"
                              : "border-line text-ink-2 hover:bg-sunken"
                          }`}
                        >
                          {on && <span aria-hidden>✓ </span>}
                          {o.category}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs">
            <button type="button" onClick={() => onChange([])} className="font-medium text-ink-2 hover:text-ink">
              모두 해제 (전체)
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onChange(DEFAULT_CATEGORY_KEYS)}
                className="rounded-full border border-line px-3 py-1.5 font-medium text-ink-2 hover:bg-sunken"
              >
                기본값 (급여·상여금)
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full bg-[var(--accent)] px-3 py-1.5 font-semibold text-[var(--surface)]"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
