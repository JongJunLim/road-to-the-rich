"use client";

import type { Compare, InvestTable as Model, TableLine, TableSortKey } from "@/lib/invest";
import { formatPct, formatWon } from "@/lib/format";

interface Props {
  model: Model;
  ownerLabel: (id: string) => string;
  sort: { key: TableSortKey; dir: "asc" | "desc" };
  onSort: (key: TableSortKey) => void;
}

type Tone = "neutral" | "up-good";

/** ▲▼ 차이 — 원금은 늘고 줄어드는 게 좋고 나쁨이 아니라 회색, 평가금·수익률은 좋음 파랑 / 나쁨 빨강 */
function Diff({ v, unit, tone, isNew }: { v: number | null; unit: "won" | "pp"; tone: Tone; isNew?: boolean }) {
  if (isNew) return <span className="rounded-full bg-sunken px-1.5 py-0.5 text-[10px] font-semibold text-ink-2">신규</span>;
  if (v === null) return <span className="text-ink-3">–</span>;
  const shown = unit === "won" ? formatWon(Math.abs(v)) : `${(Math.abs(v) * 100).toFixed(1)}%p`;
  if (unit === "won" ? v === 0 : Math.abs(v) < 0.0005) return <span className="text-ink-3">0</span>;
  const up = v > 0;
  const cls = tone === "neutral" ? "text-ink-2" : up ? "text-good" : "text-bad";
  return (
    <span className={`whitespace-nowrap ${cls}`}>
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      <span className="sr-only">{up ? "증가" : "감소"}</span>
      {shown}
    </span>
  );
}

function RateText({ v }: { v: number | null }) {
  if (v === null) return <span className="text-ink-3">–</span>;
  return <span className={v >= 0 ? "text-good" : "text-bad"}>{formatPct(v, 1)}</span>;
}

const STICKY_OWNER = "sticky left-0 z-[1] w-[60px] min-w-[60px]";
const STICKY_PRODUCT = "sticky left-[60px] z-[1] min-w-[132px] max-w-[180px] border-r border-line";

/** 칸 아래 얇은 막대 (오른쪽 정렬 숫자에 맞춰 오른쪽에서 왼쪽으로 자람) */
function MiniBar({ ratio, color }: { ratio: number; color: string }) {
  if (!(ratio > 0)) return null;
  return (
    <span
      aria-hidden
      className="absolute bottom-[3px] right-3 h-[3px] rounded-full opacity-60"
      style={{ width: `calc((100% - 1.5rem) * ${Math.min(1, ratio)})`, background: color }}
    />
  );
}

/** 수익률 막대 길이 — 로그 눈금 (+300% 이상 꽉 참, 트리맵 색과 같은 기준) */
const rateRatio = (r: number | null) => (r === null ? 0 : r >= 0 ? Math.log1p(r) / Math.log1p(3) : Math.min(1, -r / 0.5));

function Cells({ line, cmp, maxV }: { line: TableLine; cmp: { mom: Compare; yoy: Compare }; maxV?: number }) {
  return (
    <>
      <td className="px-3 py-2">{formatWon(line.principal)}</td>
      <td className="px-3 py-2"><Diff v={cmp.mom.principal} unit="won" tone="neutral" isNew={cmp.mom.isNew} /></td>
      <td className="border-r border-line px-3 py-2"><Diff v={cmp.yoy.principal} unit="won" tone="neutral" isNew={cmp.yoy.isNew} /></td>
      <td className="relative px-3 py-2 font-semibold">
        {formatWon(line.valuation)}
        {maxV ? <MiniBar ratio={line.valuation / maxV} color="var(--series-2)" /> : null}
      </td>
      <td className="px-3 py-2"><Diff v={cmp.mom.valuation} unit="won" tone="up-good" isNew={cmp.mom.isNew} /></td>
      <td className="border-r border-line px-3 py-2"><Diff v={cmp.yoy.valuation} unit="won" tone="up-good" isNew={cmp.yoy.isNew} /></td>
      <td className="relative px-3 py-2 font-semibold">
        <RateText v={line.rate} />
        {maxV ? <MiniBar ratio={rateRatio(line.rate)} color={(line.rate ?? 0) >= 0 ? "var(--delta-good)" : "var(--delta-bad)"} /> : null}
      </td>
      <td className="px-3 py-2"><Diff v={cmp.mom.rate} unit="pp" tone="up-good" isNew={cmp.mom.isNew} /></td>
      <td className="px-3 py-2"><Diff v={cmp.yoy.rate} unit="pp" tone="up-good" isNew={cmp.yoy.isNew} /></td>
    </>
  );
}

/** 소유자 → 종목 표 (소유자별 소계 · 총계, 전월 · 전년 동월 대비) */
export default function InvestTable({ model, ownerLabel, sort, onSort }: Props) {
  const SortBtn = ({ k, children, align = "right" }: { k: TableSortKey; children: React.ReactNode; align?: "left" | "right" }) => {
    const active = sort.key === k;
    return (
      <button
        type="button"
        onClick={() => onSort(k)}
        aria-label={`${children} 기준 정렬`}
        className={`inline-flex items-center gap-1 font-semibold ${align === "right" ? "justify-end" : ""} ${active ? "text-ink" : "text-ink-2 hover:text-ink"}`}
      >
        {children}
        <span aria-hidden className={`text-[9px] ${active ? "" : "opacity-30"}`}>
          {active && sort.dir === "asc" ? "▲" : "▼"}
        </span>
      </button>
    );
  };

  const sub2 = ["금액", "전월 대비", "전년 동월 대비"];
  // 평가금 막대 기준: 표에 보이는 종목 중 가장 큰 평가금
  const maxV = Math.max(1, ...model.groups.flatMap((g) => g.lines.map((l) => l.valuation)));

  return (
    <div className="relative overflow-x-auto rounded-xl border border-line">
      <table className="tnum w-full min-w-[1040px] border-collapse text-right text-[12.5px]">
        <thead className="bg-sunken text-[11.5px] text-ink-2">
          <tr className="border-b border-line">
            <th rowSpan={2} className={`${STICKY_OWNER} bg-sunken px-3 py-2 text-left font-semibold`}>
              소유자
            </th>
            <th rowSpan={2} className={`${STICKY_PRODUCT} bg-sunken px-3 py-2 text-left`}>
              <SortBtn k="product" align="left">종목</SortBtn>
            </th>
            <th colSpan={3} className="border-r border-line px-3 pt-2 text-center"><SortBtn k="principal">원금</SortBtn></th>
            <th colSpan={3} className="border-r border-line px-3 pt-2 text-center"><SortBtn k="valuation">평가금</SortBtn></th>
            <th colSpan={3} className="px-3 pt-2 text-center"><SortBtn k="rate">수익률</SortBtn></th>
          </tr>
          <tr className="border-b border-line text-[11px] text-ink-3">
            {[0, 1, 2].flatMap((g) =>
              sub2.map((s, i) => (
                <th key={`${g}-${i}`} className={`whitespace-nowrap px-3 pb-2 pt-1 font-medium ${i === 2 && g < 2 ? "border-r border-line" : ""}`}>
                  {g === 2 && i > 0 ? `${s} (%p)` : g === 2 && i === 0 ? "비율" : s}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {model.groups.map((g) => (
            <GroupRows key={g.owner} group={g} ownerLabel={ownerLabel} maxV={maxV} />
          ))}
          {model.total && (
            <tr className="border-t-2 border-[var(--axis)] bg-sunken font-bold">
              <td colSpan={2} className={`sticky left-0 z-[1] border-r border-line bg-sunken px-3 py-2.5 text-left`}>
                총계
              </td>
              <Cells line={model.total} cmp={model.total} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({ group, ownerLabel, maxV }: { group: Model["groups"][number]; ownerLabel: (id: string) => string; maxV: number }) {
  return (
    <>
      {group.lines.map((l, i) => (
        <tr key={`${group.owner}-${l.product}`} className="border-t border-line hover:bg-[var(--series-1-wash)]">
          <td className={`${STICKY_OWNER} bg-[var(--surface)] px-3 py-2 text-left font-semibold text-ink-2`}>
            {i === 0 ? ownerLabel(group.owner) : ""}
          </td>
          <td className={`${STICKY_PRODUCT} truncate bg-[var(--surface)] px-3 py-2 text-left font-medium`} title={l.product ?? ""}>
            {l.product}
          </td>
          <Cells line={l} cmp={l} maxV={maxV} />
        </tr>
      ))}
      <tr className="border-t border-line bg-[var(--page)] font-semibold">
        <td className={`${STICKY_OWNER} bg-[var(--page)] px-3 py-2`} />
        <td className={`${STICKY_PRODUCT} bg-[var(--page)] px-3 py-2 text-left`}>{ownerLabel(group.owner)} 소계</td>
        <Cells line={group.subtotal} cmp={group.subtotal} />
      </tr>
    </>
  );
}
