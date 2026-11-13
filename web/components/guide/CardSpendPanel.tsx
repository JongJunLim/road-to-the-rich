"use client";

import type { OwnerId } from "@/lib/schema";
import type { CardSpend } from "@/lib/guide";
import { formatCompactKRW, formatMonthLong, formatPct, formatWon } from "@/lib/format";
import { GROUP_COLOR } from "./PaymentMethodTable";

/** ④ 카드별 지출 (최근 3개월) — 막대는 CSS 로 (차트 라이브러리 불필요) */
export default function CardSpendPanel({
  model,
  owners,
  showOwners,
}: {
  model: CardSpend;
  owners: { id: OwnerId; label: string }[];
  showOwners: OwnerId[];
}) {
  if (!model.months.length) return <p className="py-10 text-center text-sm text-ink-3">결제수단별 지출 데이터가 아직 없어요</p>;
  const max = Math.max(1, ...model.lines.map((l) => l.amount));
  const credit = model.byGroup.Credit;
  const debit = model.byGroup.Debit;
  const card = credit + debit;
  const other = model.byGroup.Etc + model.byGroup.Account + model.byGroup.Cash + model.byGroup.Unmapped;
  const label = (id: OwnerId) => owners.find((o) => o.id === id)?.label ?? id;

  return (
    <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div>
      <p className="text-xs text-ink-3">
        {formatMonthLong(model.months[0])} – {formatMonthLong(model.months.at(-1)!)} 지출 (환불 차감 순액)
      </p>

      {/* 신용 / 체크 비율 */}
      <div className="mt-3 rounded-xl bg-[var(--page)] p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px]">
          <span>
            <b>카드 지출 {formatCompactKRW(card)}</b>
            <span className="ml-2 text-ink-3">
              신용 {formatPct(model.creditShare, 0)} · 체크 {model.creditShare === null ? "–" : formatPct(1 - model.creditShare, 0)}
            </span>
          </span>
          {other > 0 && <span className="text-[11.5px] text-ink-3">카드 외 (간편결제·계좌 등) {formatCompactKRW(other)}</span>}
        </div>
        <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-sunken" aria-hidden>
          <span style={{ width: `${card ? (credit / card) * 100 : 0}%`, background: GROUP_COLOR.Credit }} />
          <span style={{ width: `${card ? (debit / card) * 100 : 0}%`, background: GROUP_COLOR.Debit }} />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
          연말정산 카드 공제는 총급여의 25%를 넘게 쓴 금액부터 적용되고, 신용카드 15% · 체크카드 30%예요. 25%까지는 혜택이 큰 신용카드로, 넘어선
          뒤에는 체크카드로 쓰는 게 일반적인 전략이에요. 간편결제(Etc)는 신용/체크가 섞여 있어 여기서 빠져요.
        </p>
      </div>
      </div>

      {/* 카드별 막대 */}
      <ul className="mt-3 space-y-2 lg:mt-0">
        {model.lines.map((l) => (
          <li key={l.pm} className="text-[12.5px]">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: GROUP_COLOR[l.group] }} />
                <span className="truncate font-medium" title={l.pm}>
                  {l.pm}
                </span>
                <span className="shrink-0 text-[10.5px] text-ink-3">{l.group === "Credit" ? "신용" : "체크"}</span>
              </span>
              <span className="tnum shrink-0 font-semibold">{formatWon(l.amount)}원</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-sunken" aria-hidden>
              <div className="h-2 rounded-full" style={{ width: `${(l.amount / max) * 100}%`, background: GROUP_COLOR[l.group], opacity: 0.85 }} />
            </div>
            {showOwners.length > 1 && Object.keys(l.byOwner).length > 1 && (
              <p className="tnum mt-0.5 text-[10.5px] text-ink-3">
                {showOwners
                  .filter((o) => l.byOwner[o])
                  .map((o) => `${label(o)} ${formatCompactKRW(l.byOwner[o]!)}`)
                  .join(" · ")}
              </p>
            )}
          </li>
        ))}
        {!model.lines.length && <li className="py-6 text-center text-sm text-ink-3">이 기간에는 카드 지출이 없어요</li>}
      </ul>
    </div>
  );
}
