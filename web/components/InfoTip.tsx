"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ⓘ 설명 — PC는 마우스를 올리면, 모바일은 누르면 표시 (KPI 정의서 요건)
 * align: 말풍선이 카드 밖으로 나가지 않도록 기준 방향 선택
 */
export default function InfoTip({ text, label, align = "left" }: { text: string; label: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <span ref={ref} className="group relative inline-flex align-middle" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={`${label} 설명`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid h-[15px] w-[15px] place-items-center rounded-full border border-ink-3 text-[9px] font-bold leading-none text-ink-3 transition hover:border-ink-2 hover:text-ink-2"
      >
        i
      </button>
      <span
        role="tooltip"
        className={`card absolute top-5 z-30 w-60 p-3 text-left text-[11px] font-normal leading-relaxed text-ink-2 ${
          align === "right" ? "right-0" : "left-0"
        } ${open ? "block" : "hidden group-hover:block"}`}
      >
        {text}
      </span>
    </span>
  );
}
