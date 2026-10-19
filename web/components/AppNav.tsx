"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Road To The Rich", short: "자산·가계부" },
  { href: "/year-end", label: "Year End Tax Settlement", short: "연말정산" },
  { href: "/plan", label: "Monthly Plan", short: "고정 수지" },
];

/** 누른 탭 옆에 작은 점 — 응답을 기다리는 동안 깜빡임 (크기 고정이라 레이아웃이 밀리지 않음) */
function PendingDot() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle transition-opacity ${pending ? "animate-pulse opacity-80" : "opacity-0"}`}
    />
  );
}

/** 화면 전환 탭 — 화면 1(자산·가계부) / 화면 2(연말정산) / 화면 3(월 고정 수지 계획) */
export default function AppNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="화면 선택" className="mb-4 flex w-fit max-w-full items-center rounded-full border border-line bg-surface p-1">
      {TABS.map((t) => {
        const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`h-8 whitespace-nowrap rounded-full px-3 text-[13px] sm:px-3.5 font-semibold leading-8 transition ${
              active ? "bg-[var(--accent)] text-[var(--surface)]" : "text-ink-2 hover:text-ink"
            }`}
          >
            <span className="sm:hidden">{t.short}</span>
            <span className="hidden sm:inline">{t.label}</span>
            <PendingDot />
          </Link>
        );
      })}
    </nav>
  );
}
