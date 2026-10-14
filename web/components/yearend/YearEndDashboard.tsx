"use client";

import { useEffect, useMemo, useState } from "react";
import type { OwnerFilter, Snapshot } from "@/lib/schema";
import {
  buildYearEndModel,
  cumulative,
  defaultYearEndYear,
  hasYearEndData,
  MONTHS,
  yearEndYears,
  type Series12,
  type YoY,
} from "@/lib/yearEnd";
import { formatPct, formatWon } from "@/lib/format";
import AppNav from "../AppNav";
import ChartCard, { LegendItem } from "../ChartCard";
import InfoTip from "../InfoTip";
import { useThemeTokens } from "../charts/EChart";
import YearTrendChart from "../charts/YearTrendChart";
import Sparkline, { type SparkPoint } from "../charts/Sparkline";
import type { YearPoint } from "@/lib/yearEnd";

type Direction = "up-good" | "down-good";

/* ------------------------------------------------------------------ */
/* 설명 문구 (ⓘ) — KPI 정의서 지표 정의                                 */
/* ------------------------------------------------------------------ */
const INFO = {
  gross: "급여명세서 '지급' 항목 합계 (세전). 귀속연도 기준이라 다음 해 1월에 받은 전년도 성과급은 전년도 12월에 포함됩니다.",
  net: "가계부 수입 중 '급여'·'상여금' 실수령액. 매년 1월에 받은 상여금은 전년도 12월로 귀속합니다.",
  refund: "원천징수영수증의 차감징수세액 (소득세 + 지방소득세). 결정세액보다 미리 낸 세금이 많으면 환급, 적으면 추가 징수됩니다. 연말정산(다음 해 2~3월) 전에는 '정산 전'으로 표시합니다.",
  card: "가계부 지출 중 신용카드·간편결제 + 체크카드 결제 합계 (계좌이체·현금 제외). 2021년 8월 ~ 2025년 1월은 결제수단 정보가 없어 그 기간 지출 전체를 카드 지출로 포함합니다 (신용/직불 구분 불가).",
  incomeDeduction: "소득공제 = 근로소득공제 + 종합소득공제(인적·연금보험료 등) + 그 밖의 소득공제(카드·주택자금 등).",
  taxBase: "종합소득 과세표준 = 근로소득금액 − 소득공제. 이 금액에 세율을 곱해 산출세액을 계산합니다.",
  taxCredit: "세액공제 — 산출세액에서 직접 빼주는 금액 (근로소득·자녀·보험료·의료비·교육비·기부금·월세 등).",
  deductionCriteria: "신용카드 등 소득공제 최저사용금액 = 총급여 × 25%. 카드 사용액이 이 금액을 넘는 부분부터 소득공제가 적용됩니다.",
};

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

/* ------------------------------------------------------------------ */
/* 작은 표시 조각                                                       */
/* ------------------------------------------------------------------ */

/** YoY ▼4,168,176 (▼9.9%) — 색 + 아이콘 (좋은 방향 파랑, 나쁜 방향 빨강) */
function YoYText({ yoy, direction, pct = true, note }: { yoy: YoY; direction: Direction; pct?: boolean; note?: string }) {
  const noteEl = note ? <span className="font-normal text-ink-3">({note})</span> : null;
  if (yoy.diff === null)
    return (
      <>
        <span className="text-ink-3">–</span>
        {noteEl}
      </>
    );
  if (yoy.diff === 0) return <span className="text-ink-3">변동 없음</span>;
  const up = yoy.diff > 0;
  const good = direction === "up-good" ? up : !up;
  const arrow = up ? "▲" : "▼";
  return (
    <>
      <span className={`tnum whitespace-nowrap font-semibold ${good ? "text-good" : "text-bad"}`}>
        <span className="sr-only">{up ? "증가" : "감소"}</span>
        {arrow}
        {formatWon(Math.abs(yoy.diff))}
        {pct && yoy.pct !== null && (
          <span className="ml-1 font-medium">
            ({arrow}
            {formatPct(Math.abs(yoy.pct))})
          </span>
        )}
      </span>
      {noteEl}
    </>
  );
}

/** 올해는 '1~8월' 처럼 비교 기간을 표시 */
function periodLabel(yoy: YoY, isCurrent: boolean): string | null {
  if (!isCurrent || yoy.cutoff === null || yoy.cutoff === 12) return null;
  return yoy.cutoff === 1 ? "1월" : `1~${yoy.cutoff}월`;
}

function PeriodBadge({ label }: { label: string | null }) {
  if (!label) return null;
  return <span className="whitespace-nowrap rounded-full bg-sunken px-2 py-0.5 text-[10px] font-medium text-ink-2 sm:text-[11px]">{label}</span>;
}

function Value({ v, pending, size = "lg" }: { v: number | null; pending?: string; size?: "lg" | "md" }) {
  const cls =
    size === "lg"
      ? "text-[19px] min-[400px]:text-[21px] sm:text-[24px] xl:text-[27px]"
      : "text-[17px] sm:text-[19px]";
  if (v === null && pending) return <p className={`${cls} font-semibold leading-none tracking-tight text-ink-3`}>{pending}</p>;
  return <p className={`tnum min-w-0 whitespace-nowrap font-bold leading-none tracking-tight ${cls}`}>{formatWon(v)}</p>;
}

/* ------------------------------------------------------------------ */
/* 상단 KPI 카드                                                        */
/* ------------------------------------------------------------------ */
function TopCard({
  title,
  subtitle,
  info,
  period,
  badge,
  value,
  chart,
  footer,
}: {
  title: string;
  subtitle: string;
  info?: string;
  period?: string | null; // 비교 기간 (올해) — PC는 배지, 모바일은 부제에 붙여 공간 절약
  badge?: React.ReactNode;
  value: React.ReactNode;
  chart?: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <section className="card flex min-w-0 flex-col gap-2 p-3.5 sm:p-5">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[13px] font-semibold min-[400px]:text-sm sm:text-[15px]">
            <span className="truncate">{title}</span>
            {info && <InfoTip text={info} label={title} />}
          </h2>
          <p className="truncate text-[11px] text-ink-3 sm:text-xs">
            {subtitle}
            {period && <span className="sm:hidden"> · {period}</span>}
          </p>
        </div>
        {period ? <span className="hidden sm:inline-flex"><PeriodBadge label={period} /></span> : badge}
      </header>
      <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-2">
        <div className="shrink-0">{value}</div>
        {chart && <div className="w-full min-w-0 sm:ml-auto sm:max-w-[120px] sm:flex-1">{chart}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] sm:text-xs">{footer}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Tax 카드의 한 칸                                                     */
/* ------------------------------------------------------------------ */
function TaxCell({
  title,
  sub,
  value,
  yoy,
  direction,
  info,
  pending,
  infoAlign,
}: {
  title: string;
  sub: string;
  value: number | null;
  yoy: YoY;
  direction: Direction;
  info?: string;
  pending?: string;
  infoAlign?: "left" | "right";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-2xl bg-sunken/60 p-3 sm:p-3.5">
      <div className="flex items-center gap-1.5 text-[13px] font-semibold">
        <span className="truncate">{title}</span>
        {info && <InfoTip text={info} label={title} align={infoAlign} />}
      </div>
      <p className="-mt-1 text-[11px] text-ink-3">{sub}</p>
      <Value v={value} pending={pending} size="md" />
      <div className="flex flex-wrap items-center gap-x-1 text-[11px]">
        {value === null && pending && yoy.prev !== null ? (
          <span className="text-ink-3">
            전년 <span className="tnum font-medium text-ink-2">{formatWon(yoy.prev)}</span>
          </span>
        ) : (
          <>
            <span className="text-ink-3">YoY</span>
            <YoYText yoy={yoy} direction={direction} pct={false} />
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 본문                                                                 */
/* ------------------------------------------------------------------ */
export default function YearEndDashboard({
  snapshot,
  mode,
  userMenu,
  nowYear,
}: {
  snapshot: Snapshot;
  mode: "demo" | "private";
  userMenu?: React.ReactNode;
  nowYear: number; // 서버 기준(한국 시간) 올해 — 전년 동기 비교 기준
}) {
  const years = useMemo(() => yearEndYears(snapshot), [snapshot]);
  const [year, setYear] = useState<number>(() => defaultYearEndYear(snapshot) ?? nowYear);
  const [owner, setOwner] = useState<OwnerFilter>("all");
  const [cardMode, setCardMode] = useState<"monthly" | "cumulative">("monthly");
  const [showInfo, setShowInfo] = useState(false);

  const tokens = useThemeTokens();
  const mobile = useIsMobile();
  const chartH = mobile ? 220 : 260;

  const m = useMemo(() => buildYearEndModel(snapshot, year, owner, nowYear), [snapshot, year, owner, nowYear]);
  const updated = snapshot.data_updated_at?.slice(0, 10).replaceAll("-", ". ");
  const curLabel = String(m.year);
  const prevLabel = String(m.prevYear);
  const pending = m.isCurrent ? "정산 전" : undefined;
  const noPay = !m.hasPayData;
  const ownerLabel = (id: string) => snapshot.owners.find((o) => o.id === id)?.label ?? id;
  const exNote = (y: YoY) => (y.excluded.length ? `${y.excluded.map(ownerLabel).join("·")} 전년 없음` : undefined);

  const yearMonths = MONTHS.map((mm) => `${m.year}-${String(mm).padStart(2, "0")}`);
  const trendTable = (s: { cur: Series12; prev: Series12 }) => [
    { label: curLabel, values: s.cur },
    { label: prevLabel, values: s.prev },
  ];
  const yearLegend = (color: string) => (
    <>
      <LegendItem color={color} label={curLabel} />
      <LegendItem color={`color-mix(in srgb, ${color} 40%, transparent)`} label={prevLabel} />
    </>
  );
  const cardSeries = (s: { cur: Series12; prev: Series12 }) =>
    cardMode === "monthly" ? s : { cur: cumulative(s.cur), prev: cumulative(s.prev) };

  const refund = m.annual.cur?.refund_or_additional ?? null;
  const prevRefund = m.annual.prev?.refund_or_additional ?? null;
  const refundWord = (v: number) => (v > 0 ? "추가 징수" : v < 0 ? "환급" : "0원");

  if (!hasYearEndData(snapshot)) {
    return (
      <main className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <AppNav />
        <section className="card mx-auto mt-10 max-w-lg p-8 text-center">
          <h1 className="text-lg font-semibold">연말정산 데이터가 아직 없어요</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            스냅샷에 화면 2 데이터(year_end)가 없습니다. 새 버전의 <code className="rounded bg-sunken px-1">rttr-publish</code>를
            배포·실행하거나, 로컬에서는 <code className="rounded bg-sunken px-1">npm run data:real -- bq</code>로 스냅샷을 다시 만들어 주세요.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <AppNav />

      {/* ---------- 헤더 ---------- */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Year End Tax Settlement</h1>
            {mode === "demo" && (
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-3">DEMO</span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-2">급여명세서 · 원천징수영수증 · 가계부로 보는 수입 · 지출 · 세금</p>
        </div>
        <div className="relative flex flex-wrap items-center justify-end gap-3 text-right text-xs text-ink-3">
          {userMenu}
          <div>
            <div>출처 · {snapshot.source === "demo" ? "합성 데이터" : "뱅크샐러드 · 급여명세서 · 국세청"}</div>
            {updated && <div>데이터 기준일 · {updated}</div>}
          </div>
          <button
            type="button"
            onClick={() => setShowInfo((v) => !v)}
            aria-expanded={showInfo}
            aria-label="지표 설명"
            className="grid h-8 w-8 place-items-center rounded-full border border-line text-ink-2 transition hover:bg-sunken"
          >
            i
          </button>
          {showInfo && (
            <div className="card absolute right-0 top-10 z-20 w-[310px] p-4 text-left text-xs leading-relaxed text-ink-2">
              <p className="mb-2 font-semibold text-ink">지표 설명</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>YoY: 올해는 지표별로 데이터가 있는 마지막 달까지 전년 같은 기간과 비교하고(예: 1~8월), 지난 연도는 1~12월 전체를 비교합니다.</li>
                <li>급여·기납세액은 급여명세서, 소득공제·과세표준·세액은 원천징수영수증(연말정산 후) 기준입니다.</li>
                <li>실수령액·카드 지출은 가계부 기준이며, 1월 상여금은 전년도 12월로 귀속합니다.</li>
                <li>급여명세서·원천징수영수증은 현재 빵준 것만 적재되어 있어, 또용을 선택하면 급여·세금 지표는 표시되지 않습니다.</li>
                <li>▲▼ 파란색은 좋은 방향, 빨간색은 나쁜 방향입니다. (세금·지출은 감소가 좋은 방향)</li>
              </ul>
            </div>
          )}
        </div>
      </header>

      {/* ---------- 필터 ---------- */}
      <div className="sticky top-0 z-10 -mx-4 mt-4 bg-page/85 px-4 py-2.5 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-ink-3">
            <span className="hidden sm:inline">귀속연도</span>
            <select
              aria-label="귀속연도"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="h-9 rounded-full border border-line bg-surface px-3 text-sm font-medium text-ink"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
          </label>
          <div role="radiogroup" aria-label="소유자" className="ml-auto flex h-9 items-center rounded-full border border-line bg-surface p-1">
            {[{ id: "all" as const, label: "전체" }, ...snapshot.owners].map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={owner === o.id}
                onClick={() => setOwner(o.id)}
                className={`h-7 rounded-full px-3 text-sm font-medium transition ${
                  owner === o.id ? "bg-[var(--accent)] text-[var(--surface)]" : "text-ink-2 hover:text-ink"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {noPay && (
        <p className="mt-3 rounded-2xl border border-line bg-sunken px-4 py-2.5 text-xs leading-relaxed text-ink-2">
          선택한 사람의 급여명세서·원천징수영수증이 없어 급여·세금 지표는 비어 있어요. 실수령액·카드 지출은 가계부 기준으로 표시됩니다.
        </p>
      )}

      {/* ---------- 상단 KPI 4개 ---------- */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TopCard
          title="Gross Salary"
          subtitle={m.gross.source === "annual" ? "급여 · 원천징수영수증 기준" : "급여 (세전)"}
          info={INFO.gross}
          period={periodLabel(m.gross, m.isCurrent)}
          value={<Value v={m.gross.value} />}
          chart={<Sparkline kind="area" points={yearPoints(m.trend5.gross, "급여")} color="var(--ye-gross)" label="최근 5개년 급여 추이" />}
          footer={
            <>
              <span className="text-ink-3">YoY</span>
              <YoYText yoy={m.gross} direction="up-good" />
            </>
          }
        />
        <TopCard
          title="Net Salary"
          subtitle="실수령액"
          info={INFO.net}
          period={periodLabel(m.net, m.isCurrent)}
          value={<Value v={m.net.value} />}
          chart={<Sparkline kind="area" points={yearPoints(m.trend5.net, "실수령액")} color="var(--ye-net)" label="최근 5개년 실수령액 추이" />}
          footer={
            <>
              <span className="text-ink-3">YoY</span>
              <YoYText yoy={m.net} direction="up-good" note={exNote(m.net)} />
            </>
          }
        />
        <TopCard
          title="Collected / Refunded"
          subtitle="징수 · 환급"
          info={INFO.refund}
          badge={
            refund !== null && refund !== 0 ? (
              <span
                className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold sm:text-[11px] ${
                  refund < 0 ? "bg-[color-mix(in_srgb,var(--delta-good)_14%,transparent)] text-good" : "bg-[color-mix(in_srgb,var(--delta-bad)_14%,transparent)] text-bad"
                }`}
              >
                {refundWord(refund)}
              </span>
            ) : null
          }
          value={<Value v={refund === null ? null : Math.abs(refund)} pending={pending ?? (noPay ? undefined : "–")} />}
          chart={
            <Sparkline
              kind="bars"
              label="최근 5개년 연말정산 징수·환급"
              points={m.refunds.map((r) => ({
                key: String(r.year),
                value: -r.value, // 환급(음수)을 위로
                color: r.value <= 0 ? "var(--delta-good)" : "var(--delta-bad)",
                title: `${r.year}년 징수 / 환급 세액`,
                detail: `${formatWon(Math.abs(r.value))}원 (${r.value > 0 ? "징수" : r.value < 0 ? "환급" : "변동 없음"})`,
              }))}
            />
          }
          footer={
            prevRefund !== null ? (
              <span className="text-ink-3">
                {m.prevYear}년 {refundWord(prevRefund)}{" "}
                <span className={`tnum font-semibold ${prevRefund <= 0 ? "text-good" : "text-bad"}`}>{formatWon(Math.abs(prevRefund))}</span>
              </span>
            ) : (
              <span className="text-ink-3">전년 정산 내역 없음</span>
            )
          }
        />
        <TopCard
          title="Card Expense"
          subtitle="카드 지출"
          info={INFO.card}
          period={periodLabel(m.card, m.isCurrent)}
          value={<Value v={m.card.value} />}
          chart={<Sparkline kind="area" points={yearPoints(m.trend5.card, "카드지출")} color="var(--ye-card)" label="최근 5개년 카드 지출 추이" />}
          footer={
            <>
              <span className="text-ink-3">YoY</span>
              <YoYText yoy={m.card} direction="down-good" note={exNote(m.card)} />
            </>
          }
        />
      </div>

      {/* ---------- Tax + Payment Method ---------- */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-4">
        <section className="card p-4 sm:p-5 lg:col-span-3">
          <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold">
              Tax <span className="ml-1 text-xs font-medium text-ink-3">공제 · 세액 · 결정세액</span>
            </h2>
            <span className="text-[11px] text-ink-3">
              {m.annual.cur ? `${m.year}년 원천징수영수증 기준` : m.isCurrent ? `${m.year}년 연말정산 전 · 기납세액만 집계` : "원천징수영수증 없음"}
            </span>
          </header>
          {/* 데스크톱: Tableau 원본처럼 3열(소득 → 감면·공제 → 결정·기납), 모바일: 2열로 흐름 */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5">
            <div className="contents sm:flex sm:flex-col sm:gap-2.5">
              <TaxCell
                title="Income Deduction"
                sub="소득공제"
                info={INFO.incomeDeduction}
                value={m.annual.cur?.income_deduction ?? null}
                yoy={annualYoY(m.annual.cur?.income_deduction, m.annual.prev?.income_deduction)}
                direction="up-good"
                pending={pending}
              />
              <TaxCell
                title="Tax Base"
                sub="종합소득 과세표준"
                info={INFO.taxBase}
                infoAlign={mobile ? "right" : "left"}
                value={m.annual.cur?.tax_base ?? null}
                yoy={annualYoY(m.annual.cur?.tax_base, m.annual.prev?.tax_base)}
                direction="down-good"
                pending={pending}
              />
              <TaxCell
                title="Calculated Tax"
                sub="산출세액"
                value={m.annual.cur?.calculated_tax ?? null}
                yoy={annualYoY(m.annual.cur?.calculated_tax, m.annual.prev?.calculated_tax)}
                direction="down-good"
                pending={pending}
              />
            </div>
            <div className="contents sm:flex sm:flex-col sm:gap-2.5">
              <TaxCell
                title="Tax Reduction"
                sub="세액감면"
                value={m.annual.cur?.tax_reduction ?? null}
                yoy={annualYoY(m.annual.cur?.tax_reduction, m.annual.prev?.tax_reduction)}
                direction="up-good"
                pending={pending}
              />
              <TaxCell
                title="Tax Credit"
                sub="세액공제"
                info={INFO.taxCredit}
                infoAlign={mobile ? "right" : "left"}
                value={m.annual.cur?.tax_credit ?? null}
                yoy={annualYoY(m.annual.cur?.tax_credit, m.annual.prev?.tax_credit)}
                direction="up-good"
                pending={pending}
              />
            </div>
            <div className="contents sm:flex sm:flex-col sm:gap-2.5">
              <TaxCell
                title="Determined Tax"
                sub="결정세액"
                value={m.annual.cur?.determined_tax ?? null}
                yoy={annualYoY(m.annual.cur?.determined_tax, m.annual.prev?.determined_tax)}
                direction="down-good"
                pending={pending}
              />
              <TaxCell
                title="Tax Paid"
                sub={periodLabel(m.taxPaid, m.isCurrent) ? `기납세액 · ${periodLabel(m.taxPaid, m.isCurrent)}` : "기납세액"}
                value={m.taxPaid.value}
                yoy={m.taxPaid}
                direction="down-good"
              />
            </div>
          </div>
        </section>

        <section className="card flex flex-col p-4 sm:p-5">
          <header className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold">
              Payment Method <span className="ml-1 text-xs font-medium text-ink-3">결제수단</span>
            </h2>
            <PeriodBadge label={periodLabel(m.card, m.isCurrent)} />
          </header>
          <dl className="flex flex-1 flex-col justify-around gap-4">
            {[
              { title: "Credit Card", sub: "신용카드", yoy: m.credit, share: m.share.credit, color: "var(--ye-credit)" },
              { title: "Debit Card", sub: "직불카드", yoy: m.debit, share: m.share.debit, color: "var(--ye-debit)" },
            ].map((r) => (
              <div key={r.title} className="flex items-start justify-between gap-3">
                <dt className="shrink-0">
                  <div className="flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold">
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                    {r.title}
                  </div>
                  <div className="pl-3.5 text-[11px] text-ink-3">{r.sub}</div>
                </dt>
                <dd className="text-right">
                  <div className="tnum text-[17px] font-bold leading-tight">
                    {formatWon(r.yoy.value)}
                    {r.share !== null && <span className="ml-1 text-xs font-medium text-ink-3">({formatPct(r.share)})</span>}
                  </div>
                  <div className="text-[11px]">
                    <span className="mr-1 text-ink-3">YoY</span>
                    <YoYText yoy={r.yoy} direction="down-good" pct={false} />
                  </div>
                  {exNote(r.yoy) && <div className="text-[10px] text-ink-3">({exNote(r.yoy)})</div>}
                </dd>
              </div>
            ))}
            {/* 비중 막대 */}
            {m.share.credit !== null && (
              <div className="flex h-2.5 overflow-hidden rounded-full bg-sunken" role="img" aria-label={`신용카드 ${formatPct(m.share.credit)}, 직불카드 ${formatPct(m.share.debit)}`}>
                <span style={{ width: `${(m.share.credit ?? 0) * 100}%`, background: "var(--ye-credit)" }} />
                <span style={{ width: `${(m.share.debit ?? 0) * 100}%`, background: "var(--ye-debit)" }} />
              </div>
            )}
            <div className="flex items-start justify-between gap-3 border-t border-line pt-3">
              <dt className="min-w-0">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold">
                  Deduction Criteria
                  <InfoTip text={INFO.deductionCriteria} label="Deduction Criteria" align="left" />
                </div>
                <div className="text-[11px] text-ink-3">카드 공제 기준 (총급여 25%)</div>
              </dt>
              <dd className="text-right">
                <div className="tnum text-[17px] font-bold leading-tight">{formatWon(m.deductionCriteria.value)}</div>
                <div className="text-[11px]">
                  <span className="mr-1 text-ink-3">YoY</span>
                  <YoYText yoy={m.deductionCriteria} direction="down-good" pct={false} />
                </div>
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {/* ---------- 연도별 월 추이 ---------- */}
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          title="Gross Salary"
          subtitle="급여 · 월별"
          months={yearMonths}
          table={trendTable(m.series.gross)}
          legend={yearLegend("var(--ye-gross)")}
        >
          <YearTrendChart
            tokens={tokens}
            {...m.series.gross}
            curLabel={curLabel}
            prevLabel={prevLabel}
            color={tokens?.yeGross ?? "#2f9a48"}
            height={chartH}
            ariaLabel="급여 월별 추이, 올해와 전년 비교"
          />
        </ChartCard>
        <ChartCard title="Net Salary" subtitle="실수령액 · 월별" months={yearMonths} table={trendTable(m.series.net)} legend={yearLegend("var(--ye-net)")}>
          <YearTrendChart
            tokens={tokens}
            {...m.series.net}
            curLabel={curLabel}
            prevLabel={prevLabel}
            color={tokens?.yeNet ?? "#4a71ad"}
            height={chartH}
            ariaLabel="실수령액 월별 추이, 올해와 전년 비교"
          />
        </ChartCard>
        <ChartCard
          title="Card Expense"
          subtitle="카드 지출 · 월별"
          className="md:col-span-2 xl:col-span-1"
          months={yearMonths}
          table={trendTable(m.series.card)}
          legend={yearLegend("var(--ye-card)")}
        >
          <YearTrendChart
            tokens={tokens}
            {...m.series.card}
            curLabel={curLabel}
            prevLabel={prevLabel}
            color={tokens?.yeCard ?? "#e9574b"}
            height={chartH}
            ariaLabel="카드 지출 월별 추이, 올해와 전년 비교"
          />
        </ChartCard>
      </div>

      {/* ---------- 카드 지출 상세 ---------- */}
      <div className="mb-2 mt-6 flex items-center gap-3">
        <h2 className="text-[15px] font-semibold">
          Card Expense <span className="ml-1 text-xs font-medium text-ink-3">결제수단별</span>
        </h2>
        <div role="radiogroup" aria-label="카드 지출 표시 방식" className="flex h-8 items-center rounded-full border border-line bg-surface p-0.5">
          {(
            [
              { id: "monthly", label: "월별" },
              { id: "cumulative", label: "누적" },
            ] as const
          ).map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={cardMode === o.id}
              onClick={() => setCardMode(o.id)}
              className={`h-7 rounded-full px-3 text-xs font-medium transition ${
                cardMode === o.id ? "bg-[var(--accent)] text-[var(--surface)]" : "text-ink-2 hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          title="Credit"
          subtitle={cardMode === "monthly" ? "신용카드 · 월별 (회색선 = 올해 월평균)" : "신용카드 · 누적"}
          months={yearMonths}
          table={trendTable(cardSeries(m.series.credit))}
          legend={yearLegend("var(--ye-credit)")}
        >
          <YearTrendChart
            tokens={tokens}
            {...cardSeries(m.series.credit)}
            curLabel={curLabel}
            prevLabel={prevLabel}
            color={tokens?.yeCredit ?? "#13a3a0"}
            height={chartH}
            showAverage={cardMode === "monthly"}
            ariaLabel="신용카드 지출 추이"
          />
        </ChartCard>
        <ChartCard
          title="Debit"
          subtitle={cardMode === "monthly" ? "직불카드 · 월별 (회색선 = 올해 월평균)" : "직불카드 · 누적"}
          months={yearMonths}
          table={trendTable(cardSeries(m.series.debit))}
          legend={yearLegend("var(--ye-debit)")}
        >
          <YearTrendChart
            tokens={tokens}
            {...cardSeries(m.series.debit)}
            curLabel={curLabel}
            prevLabel={prevLabel}
            color={tokens?.yeDebit ?? "#e58c0b"}
            height={chartH}
            showAverage={cardMode === "monthly"}
            ariaLabel="직불카드 지출 추이"
          />
        </ChartCard>
        <PaymentShare credit={m.credit.value} debit={m.debit.value} height={chartH} className="md:col-span-2 xl:col-span-1" />
      </div>

      <footer className="mt-6 text-center text-[11px] text-ink-3">
        {snapshot.source === "demo"
          ? "표시된 금액은 모두 합성 데이터입니다."
          : `마지막 갱신 ${snapshot.generated_at.slice(0, 16).replace("T", " ")}`}
      </footer>
    </main>
  );
}

/** 5개년 추이 팝업 문구 — "2026년 급여 / 37,766,672원" (올해는 누계 기간 표시) */
function yearPoints(points: YearPoint[], name: string): SparkPoint[] {
  return points.map((p) => ({
    key: String(p.year),
    value: p.value,
    title: `${p.year}년 ${name}${p.throughMonth && p.throughMonth < 12 ? ` (1~${p.throughMonth}월)` : ""}`,
    detail: `${formatWon(p.value)}원`,
  }));
}

/** 원천징수영수증(연간) 값끼리의 전년 비교 */
function annualYoY(cur: number | undefined, prev: number | undefined): YoY {
  const c = cur ?? null;
  const p = prev ?? null;
  const diff = c !== null && p !== null ? c - p : null;
  return { value: c, prev: p, diff, pct: diff !== null && p ? diff / Math.abs(p) : null, cutoff: 12, excluded: [] };
}

/** 결제수단 비중 — 면적 비례 블록 (Tableau 트리맵과 같은 표현) */
function PaymentShare({ credit, debit, height, className = "" }: { credit: number | null; debit: number | null; height: number; className?: string }) {
  const total = (credit ?? 0) + (debit ?? 0);
  const blocks = [
    { key: "credit", label: "Credit", sub: "신용카드", value: credit ?? 0, color: "var(--ye-credit)" },
    { key: "debit", label: "Debit", sub: "직불카드", value: debit ?? 0, color: "var(--ye-debit)" },
  ];
  return (
    <section className={`card flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
      <header className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold">By Payment Method</h2>
          <p className="text-xs text-ink-3">결제수단별 비중 · 선택 연도 합계</p>
        </div>
      </header>
      <div className="mt-3 flex min-h-0 flex-1 gap-1 overflow-hidden rounded-xl" style={{ minHeight: Math.min(height, 220) }}>
        {total === 0 ? (
          <div className="grid flex-1 place-items-center rounded-xl bg-sunken text-xs text-ink-3">신용/직불 구분 데이터가 없어요 (2025년 1월 이전은 결제수단 정보 없음)</div>
        ) : (
          blocks
            .filter((b) => b.value > 0)
            .map((b) => {
              const share = b.value / total;
              return (
                <div
                  key={b.key}
                  className="flex min-w-[54px] flex-col justify-start p-2.5 text-white sm:p-3"
                  style={{ flexGrow: share, flexBasis: 0, background: b.color }}
                  title={`${b.sub} ${formatWon(b.value)}원 (${formatPct(share)})`}
                >
                  <span className="text-[13px] font-semibold">{b.label}</span>
                  <span className="tnum text-xs opacity-90">{formatPct(share)}</span>
                  {share >= 0.18 && <span className="tnum mt-0.5 text-xs opacity-90">{formatWon(b.value)}</span>}
                </div>
              );
            })
        )}
      </div>
    </section>
  );
}
