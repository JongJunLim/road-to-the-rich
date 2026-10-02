import { formatWon } from "@/lib/format";

type Direction = "up-good" | "down-good";

interface DeltaProps {
  diff: number | null;
  direction: Direction;
  suffix?: string;
  note?: string; // 비교에서 제외된 대상 안내 (예: 또용 전월 없음)
}

/** ▲▼ 아이콘 + 색 (색만으로 의미를 전달하지 않도록 항상 아이콘을 함께 표시) */
export function DeltaText({ diff, direction, suffix = "", note }: DeltaProps) {
  if (diff === null) return <span className="text-ink-3">–</span>;
  if (diff === 0) return <span className="text-ink-3">변동 없음</span>;
  const up = diff > 0;
  const good = direction === "up-good" ? up : !up;
  return (
    <span className={`tnum font-semibold ${good ? "text-good" : "text-bad"}`}>
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      <span className="sr-only">{up ? "증가" : "감소"}</span>
      {formatWon(Math.abs(diff))}
      {suffix}
      {note && <span className="ml-1 font-normal text-ink-3">({note})</span>}
    </span>
  );
}

interface KpiCardProps {
  title: string;
  subtitle: string;
  value: number | null;
  children?: React.ReactNode; // 하단 비교 영역
  badge?: React.ReactNode; // 값 옆 보조 정보 (수익률, 기준월 등)
  caption?: string; // 적용된 필터 요약 (예: 급여 · 상여금)
}

export default function KpiCard({ title, subtitle, value, children, badge, caption }: KpiCardProps) {
  return (
    <section className="card flex min-w-0 flex-col justify-between gap-2.5 p-3.5 sm:gap-3 sm:p-5">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink-2">
          {title}
          <span className="ml-1.5 hidden text-xs font-medium text-ink-3 sm:inline">{subtitle}</span>
        </h2>
        {badge}
      </header>
      {caption && (
        <p className="-mt-1.5 truncate text-[11px] text-ink-3 sm:-mt-2 sm:text-xs" title={caption}>
          {caption}
        </p>
      )}
      <p className="min-w-0 truncate text-[19px] font-bold leading-none tracking-tight min-[400px]:text-[21px] sm:text-[28px] xl:text-[30px]">
        {formatWon(value)}
        <span className="ml-1 hidden text-base font-medium text-ink-3 sm:inline">원</span>
      </p>
      <div className="flex flex-wrap items-center gap-x-1.5 text-xs sm:text-[13px]">{children}</div>
    </section>
  );
}
