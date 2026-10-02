"use client";

import { useEffect, useMemo, useState } from "react";
import type { OwnerFilter, Snapshot } from "@/lib/schema";
import {
  availableMonths,
  buildModel,
  categoryOptions,
  DEFAULT_CATEGORY_KEYS,
  monthsBetween,
  monthsEndingAt,
  lateJoiners,
  ownerCoverage,
  sanitizeCategoryKeys,
} from "@/lib/metrics";
import { formatMonthLong, formatPct, formatWon } from "@/lib/format";
import KpiCard, { DeltaText } from "./KpiCard";
import ChartCard, { LegendItem } from "./ChartCard";
import CategoryFilter, { summarizeGroup } from "./CategoryFilter";
import { useThemeTokens } from "./charts/EChart";
import AssetChart from "./charts/AssetChart";
import InvestmentChart from "./charts/InvestmentChart";
import LedgerChart, { LEDGER_SERIES, type LedgerKey } from "./charts/LedgerChart";

const TREND_MONTHS = 12; // KPI 정의서: Investment·Ledger 추이는 최근 12개월
const DEFAULT_LEDGER: LedgerKey[] = ["income", "expense"]; // 기본값: 이체 제외

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

export default function Dashboard({
  snapshot,
  mode,
  userMenu,
}: {
  snapshot: Snapshot;
  mode: "demo" | "private";
  userMenu?: React.ReactNode; // 로그인 사용 시: 이메일 + 로그아웃
}) {
  const months = useMemo(() => availableMonths(snapshot), [snapshot]);
  const latest = months.at(-1) ?? "";
  const years = useMemo(() => [...new Set(months.map((m) => m.slice(0, 4)))].reverse(), [months]);

  const [ym, setYm] = useState(latest);
  const [owner, setOwner] = useState<OwnerFilter>("all");
  const [assetN, setAssetN] = useState(12);
  const [ledgerKeys, setLedgerKeys] = useState<LedgerKey[]>(DEFAULT_LEDGER);
  const [showInfo, setShowInfo] = useState(false);

  // category_main 필터 — 기본값: 수입의 '급여'·'상여금' (데이터에 없는 값은 제외)
  const catOptions = useMemo(() => categoryOptions(snapshot.ledger), [snapshot]);
  const [categoryKeys, setCategoryKeys] = useState<string[]>(() => sanitizeCategoryKeys(DEFAULT_CATEGORY_KEYS, catOptions));

  const tokens = useThemeTokens();
  const mobile = useIsMobile();
  const chartH = mobile ? 230 : 290;

  const model = useMemo(() => buildModel(snapshot, ym, owner, categoryKeys), [snapshot, ym, owner, categoryKeys]);

  /* ---------- 필터 ---------- */
  const year = ym.slice(0, 4);
  const monthsOfYear = months.filter((m) => m.startsWith(year));
  const changeYear = (y: string) => {
    const inYear = months.filter((m) => m.startsWith(y));
    const sameMonth = `${y}-${ym.slice(5)}`;
    setYm(inYear.includes(sameMonth) ? sameMonth : inYear.at(-1) ?? ym);
  };
  const toggleLedger = (k: LedgerKey) =>
    setLedgerKeys((cur) => (cur.includes(k) ? (cur.length > 1 ? cur.filter((x) => x !== k) : cur) : [...cur, k]));

  /* ---------- 차트 데이터 ---------- */
  const firstMonth = months[0] ?? ym;
  const maxAssetN = Math.max(2, monthsBetween(firstMonth, ym));
  const assetMonths = monthsEndingAt(ym, Math.min(assetN, maxAssetN));
  const assetValues = assetMonths.map((m) => model.assetSeries.get(m)?.asset ?? null);

  const invMonths = monthsEndingAt(ym, TREND_MONTHS);
  const principal = invMonths.map((m) => model.investmentSeries.get(m)?.principal ?? null);
  const valuation = invMonths.map((m) => model.investmentSeries.get(m)?.valuation ?? null);
  const rate = principal.map((p, i) => (p && valuation[i] !== null ? ((valuation[i] as number) - p) / p : null));

  const ledgerEnd = model.ledgerYm ?? ym;
  const ledgerMonths = monthsEndingAt(ledgerEnd, TREND_MONTHS);
  const ledgerData = useMemo(() => {
    const pick = (k: LedgerKey) => ledgerMonths.map((m) => model.ledgerSeries.get(m)?.[k] ?? null);
    return { income: pick("income"), expense: pick("expense"), transfer_in: pick("transfer_in"), transfer_out: pick("transfer_out") };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, ledgerEnd]);

  const ledgerCapped = model.ledgerYm !== null && model.ledgerYm !== ym;
  const ledgerBadge = ledgerCapped ? (
    <span className="whitespace-nowrap rounded-full bg-sunken px-2 py-0.5 text-[11px] font-medium text-ink-2">
      {Number(model.ledgerYm!.slice(5))}월 기준
    </span>
  ) : null;

  const inv = model.investment;

  // 늦게 데이터가 시작된 사람 안내 (예: 또용 데이터가 2026년 9월부터 적재된 경우)
  const ownerLabel = (id: string) => snapshot.owners.find((o) => o.id === id)?.label ?? id;
  const joiners = useMemo(() => lateJoiners(ownerCoverage(snapshot)), [snapshot]);
  const excludedNote = (ids: string[]) => (ids.length ? `${ids.map(ownerLabel).join("·")} 전월 없음` : undefined);
  const updated = snapshot.data_updated_at?.slice(0, 10).replaceAll("-", ". ");

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      {/* ---------- 헤더 ---------- */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Road To The Rich</h1>
            {mode === "demo" && (
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-3">DEMO</span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-2">우리집 자산 · 투자 · 가계부 한눈에 보기</p>
        </div>
        <div className="relative flex flex-wrap items-center justify-end gap-3 text-right text-xs text-ink-3">
          {userMenu}
          <div>
            <div>출처 · {snapshot.source === "demo" ? "합성 데이터" : "뱅크샐러드"}</div>
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
            <div className="card absolute right-0 top-10 z-20 w-[300px] p-4 text-left text-xs leading-relaxed text-ink-2">
              <p className="mb-2 font-semibold text-ink">지표 설명</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>자산·투자는 월별 마지막 스냅샷 기준입니다.</li>
                <li>수입·지출은 거래일 기준이며, 선택한 달의 내역이 아직 없으면 가장 최근 달을 보여줍니다.</li>
                <li>카테고리 필터는 수입·지출·이체 그룹별로 적용되고, 그룹에서 아무것도 고르지 않으면 그 그룹 전체를 합산합니다. (기본값: 수입 = 급여·상여금)</li>
                <li>수익률 = (평가금 − 원금) ÷ 원금. 전체 선택 시 두 사람의 합계로 다시 계산합니다.</li>
                <li>▲▼ 파란색은 좋은 방향, 빨간색은 나쁜 방향입니다. (지출은 감소가 좋은 방향)</li>
              </ul>
            </div>
          )}
        </div>
      </header>

      {/* ---------- 필터 (모바일에서는 상단 고정) ---------- */}
      <div className="sticky top-0 z-10 -mx-4 mt-4 bg-page/85 px-4 py-2.5 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
        <div className="relative flex flex-wrap items-center gap-2">
          <select
            aria-label="연도"
            value={year}
            onChange={(e) => changeYear(e.target.value)}
            className="h-9 rounded-full border border-line bg-surface px-3 text-sm font-medium"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <select
            aria-label="월"
            value={ym}
            onChange={(e) => setYm(e.target.value)}
            className="h-9 rounded-full border border-line bg-surface px-3 text-sm font-medium"
          >
            {monthsOfYear.map((m) => (
              <option key={m} value={m}>
                {Number(m.slice(5))}월
              </option>
            ))}
          </select>
          <CategoryFilter options={catOptions} value={categoryKeys} onChange={setCategoryKeys} />
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

      {/* ---------- 데이터 시작 시점 안내 ('전체'에서 한 사람이 늦게 합류한 경우) ---------- */}
      {owner === "all" && joiners.length > 0 && (
        <p className="mt-3 rounded-2xl border border-line bg-sunken px-4 py-2.5 text-xs leading-relaxed text-ink-2">
          {joiners
            .map((c) => {
              const parts = [
                c.asset && `자산 ${formatMonthLong(c.asset)}`,
                c.investment && `투자 ${formatMonthLong(c.investment)}`,
                c.ledger && `가계부 ${formatMonthLong(c.ledger)}`,
              ].filter(Boolean);
              return `${ownerLabel(c.owner)} 데이터는 ${parts.join(" · ")}부터 포함돼요.`;
            })
            .join(" ")}{" "}
          그 이전 추이는 나머지 사람만 반영되고, 전월 대비는 두 달 모두 데이터가 있는 사람끼리만 비교합니다.
        </p>
      )}

      {/* ---------- KPI (모바일 2×2 → 데스크톱 4열) ---------- */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard title="자산" subtitle="Asset" value={model.asset.current}>
          <span className="text-ink-3">전월 대비</span>
          <DeltaText diff={model.asset.diff} direction="up-good" note={excludedNote(model.asset.excluded)} />
        </KpiCard>
        <KpiCard
          title="투자"
          subtitle="Investment"
          value={inv.valuation}
          badge={
            inv.rate !== null && (
              <span className={`tnum whitespace-nowrap text-xs font-semibold ${inv.rate >= 0 ? "text-good" : "text-bad"}`}>
                {inv.rate >= 0 ? "▲" : "▼"}
                {formatPct(Math.abs(inv.rate))}
              </span>
            )
          }
        >
          <span className="text-ink-3">평가손익</span>
          <DeltaText diff={inv.profit} direction="up-good" />
        </KpiCard>
        <KpiCard
          title="수입"
          subtitle="Income"
          value={model.income.current}
          badge={ledgerBadge}
          caption={summarizeGroup(categoryKeys, "income")}
        >
          <span className="text-ink-3">전월 대비</span>
          <DeltaText diff={model.income.diff} direction="up-good" note={excludedNote(model.income.excluded)} />
        </KpiCard>
        <KpiCard
          title="지출"
          subtitle="Expense"
          value={model.expense.current}
          badge={ledgerBadge}
          caption={summarizeGroup(categoryKeys, "expense")}
        >
          <span className="text-ink-3">전월 대비</span>
          <DeltaText diff={model.expense.diff} direction="down-good" note={excludedNote(model.expense.excluded)} />
        </KpiCard>
      </div>

      {/* ---------- 추이 (모바일 1열 → 태블릿 2열 → 데스크톱 3열) ---------- */}
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          title="자산 추이"
          subtitle={`${formatMonthLong(assetMonths[0])} – ${formatMonthLong(ym)}`}
          className="md:col-span-2 xl:col-span-1"
          months={assetMonths}
          table={[{ label: "자산", values: assetValues }]}
          controls={
            <label className="flex items-center gap-1.5 text-xs text-ink-2">
              최근
              <input
                type="number"
                inputMode="numeric"
                min={2}
                max={maxAssetN}
                value={assetN}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) setAssetN(Math.min(maxAssetN, Math.max(2, Math.round(n))));
                }}
                className="tnum h-7 w-12 rounded-lg border border-line bg-surface px-1.5 text-center text-sm font-semibold text-ink"
              />
              개월
            </label>
          }
        >
          <AssetChart tokens={tokens} months={assetMonths} values={assetValues} height={chartH} />
        </ChartCard>

        <ChartCard
          title="투자 추이"
          subtitle="최근 12개월 · 아래 패널은 수익률"
          months={invMonths}
          table={[
            { label: "원금", values: principal },
            { label: "평가금", values: valuation },
            { label: "수익률", values: rate, format: (v) => formatPct(v, 2) },
          ]}
          legend={
            <>
              <LegendItem color="var(--series-1)" label="원금" />
              <LegendItem color="var(--series-2)" label="평가금" />
              <LegendItem color="var(--delta-good)" label="수익률 +" dot />
              <LegendItem color="var(--delta-bad)" label="수익률 −" dot />
            </>
          }
        >
          <InvestmentChart tokens={tokens} months={invMonths} principal={principal} valuation={valuation} height={chartH} />
        </ChartCard>

        <ChartCard
          title="가계부 추이"
          subtitle={`최근 12개월 · ${formatMonthLong(ledgerEnd)}까지`}
          months={ledgerMonths}
          table={LEDGER_SERIES.filter((s) => ledgerKeys.includes(s.key)).map((s) => ({ label: s.label, values: ledgerData[s.key] }))}
          legend={
            <div role="group" aria-label="표시할 항목" className="flex flex-wrap gap-1.5">
              {LEDGER_SERIES.map((s) => {
                const on = ledgerKeys.includes(s.key);
                return (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleLedger(s.key)}
                    className={`flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition ${
                      on ? "border-line bg-sunken text-ink" : "border-dashed border-line text-ink-3"
                    }`}
                  >
                    <span
                      aria-hidden
                      className="h-[3px] w-3.5 rounded-full"
                      style={{ background: on ? `var(--series-${s.token.slice(1)})` : "var(--axis)" }}
                    />
                    {s.label}
                  </button>
                );
              })}
            </div>
          }
        >
          <LedgerChart tokens={tokens} months={ledgerMonths} data={ledgerData} visible={ledgerKeys} height={chartH - 20} />
        </ChartCard>
      </div>

      <footer className="mt-6 text-center text-[11px] text-ink-3">
        {snapshot.source === "demo"
          ? "표시된 금액은 모두 합성 데이터입니다."
          : `마지막 갱신 ${snapshot.generated_at.slice(0, 16).replace("T", " ")} · 총 ${formatWon(months.length)}개월`}
      </footer>
    </main>
  );
}
