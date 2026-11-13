"use client";

import type { Compare, ExpenseLevel, TopLine, TopTable as Model } from "@/lib/expense";
import { formatCompactKRW, formatPct, formatWon } from "@/lib/format";

interface Props {
  level: ExpenseLevel;
  title: string;
  subtitle: string;
  model: Model;
  n: number;
  onN: (n: number) => void;
  note?: string | null;
  selectedKey?: string | null; // Drill down 으로 선택된 행
  onPick?: (line: TopLine) => void; // 행을 누르면 Drill down (다시 누르면 해제는 부모가 판단)
  scopeChip?: React.ReactNode; // 표 위 범위 안내 (예: 식비 안에서)
}

/** 증감 — 지출은 늘면 빨강(나쁨), 줄면 파랑(좋음). 금액 아래 작은 % */
function Diff({ c }: { c: Compare | null }) {
  if (!c) return <span className="text-ink-3">–</span>;
  if (c.isNew) return <span className="rounded-full bg-sunken px-1.5 py-0.5 text-[10px] font-semibold text-ink-2">신규</span>;
  if (c.diff === null) return <span className="text-ink-3">–</span>;
  if (c.diff === 0) return <span className="text-ink-3">0</span>;
  const up = c.diff > 0;
  return (
    <span className={`inline-flex flex-col items-end leading-tight ${up ? "text-bad" : "text-good"}`}>
      <span className="whitespace-nowrap font-semibold">
        <span aria-hidden>{up ? "▲" : "▼"}</span>
        <span className="sr-only">{up ? "증가" : "감소"}</span>
        {formatCompactKRW(Math.abs(c.diff))}
      </span>
      {c.pct !== null && (
        <span className="text-[10.5px] opacity-80">
          {up ? "+" : "−"}
          {formatPct(Math.abs(c.pct), 0)}
        </span>
      )}
    </span>
  );
}

/** Top 지출 표 — 지출 큰 순, 상위 N개, 약 10행 높이 후 세로 스크롤 */
export default function TopTable({ level, title, subtitle, model, n, onN, note, selectedKey, onPick, scopeChip }: Props) {
  const withCompare = level !== "item";
  const maxN = Math.max(1, model.count);
  const maxAmount = Math.max(1, ...model.lines.map((l) => l.amount));

  return (
    <section className="card flex min-w-0 flex-col p-4 sm:p-5" aria-label={title}>
      <header className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <p className="text-xs text-ink-3">{subtitle}</p>
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-2">
          Top
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={maxN}
            value={Math.min(n, maxN)}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onN(Math.max(1, Math.round(v)));
            }}
            className="tnum h-7 w-12 rounded-lg border border-line bg-surface px-1.5 text-center text-sm font-semibold text-ink"
            aria-label={`${title} 표시 개수`}
          />
          <span className="text-ink-3">/ {model.count}</span>
        </label>
      </header>

      {scopeChip && <div className="-mt-1 mb-2 flex flex-wrap items-center gap-1.5">{scopeChip}</div>}

      {model.lines.length ? (
        <div className="relative max-h-[470px] overflow-auto rounded-xl border border-line">
          <table className="tnum w-full border-collapse text-right text-[12.5px]">
            <thead className="sticky top-0 z-[1] bg-sunken text-[11.5px] text-ink-2">
              <tr>
                <th className="w-8 px-2 py-2 text-center font-medium">#</th>
                {level === "main" && <th className="px-2 py-2 text-left font-semibold">대분류</th>}
                {level === "sub" && (
                  <>
                    <th className="px-2 py-2 text-left font-semibold">중분류</th>
                    <th className="px-2 py-2 text-left font-medium">대분류</th>
                  </>
                )}
                {level === "item" && (
                  <>
                    <th className="px-2 py-2 text-left font-semibold">항목</th>
                    <th className="px-2 py-2 text-left font-medium">대분류</th>
                    <th className="px-2 py-2 text-left font-medium">중분류</th>
                  </>
                )}
                <th className="px-2 py-2 font-semibold">지출</th>
                {withCompare && (
                  <>
                    <th className="whitespace-nowrap px-2 py-2 font-medium">전월 대비</th>
                    <th className="whitespace-nowrap px-2 py-2 font-medium">전년 동월</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {model.lines.map((l, i) => {
                const name = level === "main" ? l.main : level === "sub" ? l.sub! : l.item!;
                const selected = selectedKey === l.key;
                return (
                  <tr
                    key={l.key}
                    onClick={onPick ? () => onPick(l) : undefined}
                    onKeyDown={onPick ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick(l)) : undefined}
                    tabIndex={onPick ? 0 : undefined}
                    aria-selected={onPick ? selected : undefined}
                    title={onPick ? (selected ? "다시 누르면 선택 해제" : "누르면 아래 단계로 Drill down") : undefined}
                    className={`h-[37px] border-t border-line ${onPick ? "cursor-pointer" : ""} ${
                      selected ? "bg-[var(--series-1-wash)] outline outline-1 -outline-offset-1 outline-[var(--series-1)]" : "hover:bg-[var(--series-1-wash)]"
                    }`}
                  >
                    <td className="px-2 py-1.5 text-center text-[11px] text-ink-3">{i + 1}</td>
                    <td className="max-w-[160px] truncate px-2 py-1.5 text-left font-medium" title={name}>
                      {name}
                    </td>
                    {level !== "main" && (
                      <td className="max-w-[90px] truncate px-2 py-1.5 text-left text-ink-2" title={l.main}>
                        {l.main}
                      </td>
                    )}
                    {level === "item" && (
                      <td className="max-w-[90px] truncate px-2 py-1.5 text-left text-ink-2" title={l.sub ?? ""}>
                        {l.sub}
                      </td>
                    )}
                    <td className="relative whitespace-nowrap px-2 py-1.5 font-semibold">
                      {l.amount < 0 ? "−" : ""}
                      {formatWon(Math.abs(l.amount))}
                      {l.share !== null && l.amount > 0 && (
                        <span className="ml-1 text-[10.5px] font-normal text-ink-3">{formatPct(l.share, 0)}</span>
                      )}
                      {l.amount > 0 && (
                        <span
                          aria-hidden
                          className="absolute bottom-[3px] right-2 h-[3px] rounded-full bg-[var(--series-2)] opacity-50"
                          style={{ width: `calc((100% - 1rem) * ${l.amount / maxAmount})` }}
                        />
                      )}
                    </td>
                    {withCompare && (
                      <>
                        <td className="px-2 py-1.5">
                          <Diff c={l.mom} />
                        </td>
                        <td className="px-2 py-1.5">
                          <Diff c={l.yoy} />
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-ink-3">이 달에는 지출이 없어요</p>
      )}
      {note && <p className="mt-2 text-[11px] text-ink-3">※ {note}</p>}
    </section>
  );
}
