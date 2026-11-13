"use client";

import { useEffect, useMemo, useState } from "react";
import type { OwnerFilter, Snapshot } from "@/lib/schema";
import { monthsBetween, monthsEndingAt, shiftMonth } from "@/lib/metrics";
import {
  changeBreakdown,
  composition,
  DEFAULT_ALERT_RULE,
  expenseHeatmap,
  expenseMonths,
  expenseRows,
  expenseTrend,
  keyOf,
  mainOptions,
  monthTotal,
  spendAlerts,
  topTable,
  totalCompare,
  type ExpenseLevel,
  type SpendAlert,
} from "@/lib/expense";
import { formatCompactKRW, formatMonthLong, formatPct } from "@/lib/format";
import AppNav from "../AppNav";
import ChartCard, { LegendItem } from "../ChartCard";
import { DeltaText } from "../KpiCard";
import { useThemeTokens } from "../charts/EChart";
import ExpenseTrendChart from "../charts/ExpenseTrendChart";
import ExpenseTreemap from "../charts/ExpenseTreemap";
import ExpenseWaterfall, { expenseWaterfallZoomed } from "../charts/ExpenseWaterfall";
import ExpenseHeatmap from "../charts/ExpenseHeatmap";
import MainFilter from "./MainFilter";
import TopTable from "./TopTable";

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

const TOP_DEFAULT = 10;
const ALERT_SHOW = 4; // 중분류·항목 각각 처음에 보이는 개수

/**
 * Expense Analysis — 지출 Drill down
 * 점검 포인트 → 지출 추이 → (증감 분해 | 구성 비율) → 대분류 × 월 → Top 지출 (대분류 | 중분류 | 항목)
 * 트리맵 · 폭포 · 히트맵 · 표를 누르면 같은 Drill down 경로(대분류 › 중분류)가 바뀌고, 중분류·항목 표가 그 범위로 좁혀짐
 */
export default function ExpenseDashboard({
  snapshot,
  mode,
  userMenu,
}: {
  snapshot: Snapshot;
  mode: "demo" | "private";
  userMenu?: React.ReactNode;
}) {
  const rows = useMemo(() => expenseRows(snapshot), [snapshot]);
  const months = useMemo(() => expenseMonths(rows), [rows]);
  const latest = months.at(-1) ?? "";
  const years = useMemo(() => [...new Set(months.map((m) => m.slice(0, 4)))].reverse(), [months]);

  const [ym, setYm] = useState(latest);
  const [owner, setOwner] = useState<OwnerFilter>("all");
  const [trendN, setTrendN] = useState(12);
  const [trendMains, setTrendMains] = useState<string[]>([]);
  const [level, setLevel] = useState<"main" | "sub">("main");
  const [drillMain, setDrillMain] = useState<string | null>(null);
  const [drillSub, setDrillSub] = useState<string | null>(null);
  const [topN, setTopN] = useState<Record<ExpenseLevel, number>>({ main: TOP_DEFAULT, sub: TOP_DEFAULT, item: TOP_DEFAULT });
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const tokens = useThemeTokens();
  const mobile = useIsMobile();
  const ownerLabel = (id: string) => snapshot.owners.find((o) => o.id === id)?.label ?? id;

  /* ---------- Drill down ---------- */
  const drillTo = (main: string | null, sub: string | null = null) => {
    setDrillMain(main);
    setDrillSub(main ? sub : null);
  };
  const scrollToTables = () => document.getElementById("top-tables")?.scrollIntoView({ behavior: "smooth", block: "start" });

  /* ---------- 필터 (연·월) ---------- */
  const year = ym.slice(0, 4);
  const monthsOfYear = months.filter((m) => m.startsWith(year));
  const changeYear = (y: string) => {
    const inYear = months.filter((m) => m.startsWith(y));
    const sameMonth = `${y}-${ym.slice(5)}`;
    setYm(inYear.includes(sameMonth) ? sameMonth : inYear.at(-1) ?? ym);
  };

  /* ---------- 점검 포인트 (급증 알림) ---------- */
  const alertRes = useMemo(() => spendAlerts(rows, ym, owner), [rows, ym, owner]);
  const subAlerts = alertRes.alerts.filter((a) => a.level === "sub");
  const itemAlerts = alertRes.alerts.filter((a) => a.level === "item");

  /* ---------- 1. 지출 추이 ---------- */
  const maxN = Math.max(2, monthsBetween(months[0] ?? ym, ym));
  const trendMonths = monthsEndingAt(ym, Math.min(trendN, maxN));
  const trendKey = trendMonths.join();
  const trendOptions = useMemo(() => mainOptions(rows, owner, trendMonths), [rows, owner, trendKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const mainsPicked = useMemo(() => trendMains.filter((m) => trendOptions.some((o) => o.name === m)), [trendMains, trendOptions]);
  const trend = useMemo(() => expenseTrend(rows, owner, mainsPicked, trendMonths), [rows, owner, mainsPicked, trendKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const trendAvg = useMemo(() => {
    const v = trend.filter((x): x is number => x !== null);
    return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
  }, [trend]);
  const total = useMemo(() => monthTotal(rows, ym, owner), [rows, ym, owner]);
  const mom = useMemo(() => totalCompare(rows, ym, owner, -1), [rows, ym, owner]);
  const yoy = useMemo(() => totalCompare(rows, ym, owner, -12), [rows, ym, owner]);

  // '전체'에서 한 사람 데이터가 늦게 시작하면 추이가 계단처럼 뛰므로 안내
  const joinNote = useMemo(() => {
    if (owner !== "all") return null;
    const first = new Map<string, string>();
    for (const r of rows) if (!first.has(r.owner) || r.ym < first.get(r.owner)!) first.set(r.owner, r.ym);
    const late = [...first.entries()].filter(([, m]) => m > trendMonths[0] && m <= ym);
    return late.length
      ? `${late.map(([o, m]) => `${ownerLabel(o)} 데이터는 ${formatMonthLong(m)}부터`).join(", ")} 포함돼요. 그 전 추이는 나머지 사람만 반영됩니다.`
      : null;
  }, [rows, owner, trendKey, ym]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- 2. 증감 분해 ---------- */
  const breakdown = useMemo(() => changeBreakdown(rows, ym, owner, mobile ? 4 : 6), [rows, ym, owner, mobile]);
  const prevYm = shiftMonth(ym, -1);

  /* ---------- 3. 구성 비율 ---------- */
  const monthMains = useMemo(() => composition(rows, ym, owner, "main"), [rows, ym, owner]);
  const treeMain = level === "sub" && drillMain && monthMains.some((s) => s.main === drillMain) ? drillMain : "";
  const slices = useMemo(
    () => (level === "main" ? monthMains : composition(rows, ym, owner, "sub", treeMain || null)),
    [rows, ym, owner, level, treeMain, monthMains],
  );

  /* ---------- 4. 대분류 × 월 ---------- */
  const heat = useMemo(() => expenseHeatmap(rows, owner, trendMonths), [rows, owner, trendKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- 5. Top 지출 ---------- */
  const tMain = useMemo(() => topTable(rows, ym, owner, "main", topN.main), [rows, ym, owner, topN.main]);
  const tSub = useMemo(() => topTable(rows, ym, owner, "sub", topN.sub, { main: drillMain }), [rows, ym, owner, topN.sub, drillMain]);
  const tItem = useMemo(
    () => topTable(rows, ym, owner, "item", topN.item, { main: drillMain, sub: drillSub }),
    [rows, ym, owner, topN.item, drillMain, drillSub],
  );
  const setN = (lv: ExpenseLevel) => (n: number) => setTopN((s) => ({ ...s, [lv]: n }));
  const cmpNote = (t: typeof tMain) =>
    [
      t.excludedMom.length ? `전월 대비는 ${t.excludedMom.map(ownerLabel).join("·")} 제외 (전월 데이터 없음)` : null,
      t.excludedYoy.length ? `전년 동월 대비는 ${t.excludedYoy.map(ownerLabel).join("·")} 제외 (전년 데이터 없음)` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;
  const cmpSubtitle = `${formatMonthLong(ym)} · 전월(${Number(prevYm.slice(5))}월) · 전년 동월 대비`;
  const kpiNote = tMain.excludedMom.length ? `${tMain.excludedMom.map(ownerLabel).join("·")} 전월 없음` : undefined;
  const subKey = drillMain && drillSub ? keyOf({ main: drillMain, sub: drillSub, item: "" }, "sub") : null;

  const updated = snapshot.data_updated_at?.slice(0, 10) ?? null;

  if (!months.length) {
    return (
      <main className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <AppNav />
        <section className="card mx-auto mt-10 max-w-lg p-8 text-center">
          <h1 className="text-lg font-semibold">항목별 지출 데이터가 아직 없어요</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            스냅샷에 <code className="rounded bg-sunken px-1">expense_item</code> 섹션이 없습니다. 새 버전의{" "}
            <code className="rounded bg-sunken px-1">rttr-publish</code>를 배포·실행하거나, 로컬에서는{" "}
            <code className="rounded bg-sunken px-1">npm run data:real -- bq</code>로 스냅샷을 다시 만들어 주세요.
          </p>
        </section>
      </main>
    );
  }

  const drillChip = (label: string, onClear: () => void) => (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1 rounded-full border border-[var(--series-1)] bg-[var(--series-1-wash)] px-2 py-0.5 text-[11.5px] font-semibold text-ink"
      aria-label={`${label} 범위 해제`}
    >
      {label}
      <span aria-hidden className="text-ink-3">
        ✕
      </span>
    </button>
  );

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <AppNav />

      {/* ---------- 헤더 ---------- */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Expense Analysis</h1>
            {mode === "demo" && (
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-3">DEMO</span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-2">지출 Drill down · 대분류 → 중분류 → 항목</p>
        </div>
        <div className="relative flex w-full flex-wrap items-center justify-between gap-3 text-xs text-ink-3 sm:w-auto sm:justify-end sm:text-right">
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
            <div className="card absolute right-0 top-10 z-20 w-[320px] p-4 text-left text-xs leading-relaxed text-ink-2">
              <p className="mb-2 font-semibold text-ink">지표 설명</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>가계부의 &lsquo;지출&rsquo;만 거래일 기준으로 집계합니다. 환불은 차감한 순액이라 월 합계가 Road To The Rich 화면의 지출과 같습니다.</li>
                <li>
                  점검 포인트: 이번 달 중분류·항목 중 직전 {DEFAULT_ALERT_RULE.months}개월 월평균보다 +{(DEFAULT_ALERT_RULE.minRatio - 1) * 100}% 이상이면서{" "}
                  {formatCompactKRW(DEFAULT_ALERT_RULE.minDiff)}원 이상 늘어난 것. 평균은 사람별로 데이터가 있는 달만으로 계산합니다.
                </li>
                <li>증감 분해: 전월 지출에서 대분류별 증감을 더해 이번 달 지출이 되는 과정입니다. 두 달 모두 데이터가 있는 사람만 포함합니다.</li>
                <li>트리맵·증감 분해·히트맵·표를 누르면 그 분류로 Drill down 되어 중분류·항목 표가 좁혀집니다. 다시 누르거나 ✕로 해제합니다.</li>
                <li>같은 달 환불이 구매보다 크면 음수(−)로 표시되고, 트리맵에서는 빠집니다.</li>
                <li>2025년 1월 이전은 분류·항목 구분 없이 월 합계만 적재되어 있어 구성·순위 분석이 제한됩니다.</li>
                <li>전월·전년 동월 대비는 두 달 모두 데이터가 있는 사람끼리만 비교합니다. 비교 달에 없던 분류는 &lsquo;신규&rsquo;입니다.</li>
                <li>색: 지출이 늘면 빨강, 줄면 파랑. 트리맵·히트맵은 진한 빨강일수록 지출이 큽니다.</li>
              </ul>
            </div>
          )}
        </div>
      </header>

      {/* ---------- 0. 공통 필터 (모바일에서는 상단 고정) ---------- */}
      <div className="sticky top-0 z-10 -mx-4 mt-4 bg-page/85 px-4 py-2.5 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
        <div className="flex flex-wrap items-center gap-2">
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

      {/* ---------- 점검 포인트 ---------- */}
      <section className="card mt-3 p-4 sm:p-5" aria-labelledby="al-title">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 id="al-title" className="text-[15px] font-semibold">
              이번 달 점검 포인트
            </h2>
            <p className="text-xs text-ink-3">
              {formatMonthLong(ym)} · 직전 {DEFAULT_ALERT_RULE.months}개월 월평균보다 +{(DEFAULT_ALERT_RULE.minRatio - 1) * 100}% 이상 &amp;{" "}
              {formatCompactKRW(DEFAULT_ALERT_RULE.minDiff)}원 이상 늘어난 지출 · 누르면 Drill down
            </p>
          </div>
          {alertRes.alerts.length > 0 && (
            <span className="text-xs text-ink-2">
              <b className="text-bad">{alertRes.alerts.length}</b>건
            </span>
          )}
        </header>
        {alertRes.alerts.length ? (
          <div className="mt-3 space-y-2">
            <AlertRow
              label="중분류"
              alerts={showAllAlerts ? subAlerts : subAlerts.slice(0, ALERT_SHOW)}
              onPick={(a) => {
                drillTo(a.main, a.sub);
                scrollToTables();
              }}
            />
            <AlertRow
              label="항목"
              alerts={showAllAlerts ? itemAlerts : itemAlerts.slice(0, ALERT_SHOW)}
              onPick={(a) => {
                drillTo(a.main, a.sub);
                scrollToTables();
              }}
            />
            {(subAlerts.length > ALERT_SHOW || itemAlerts.length > ALERT_SHOW) && (
              <button type="button" onClick={() => setShowAllAlerts((v) => !v)} className="text-xs font-semibold text-ink-2 underline-offset-2 hover:underline">
                {showAllAlerts ? "접기" : `모두 보기 (${alertRes.alerts.length}건)`}
              </button>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-2">✓ 평소보다 크게 늘어난 지출이 없어요.</p>
        )}
        {alertRes.skipped.length > 0 && (
          <p className="mt-2 text-[11px] text-ink-3">
            ※ {alertRes.skipped.map(ownerLabel).join("·")}은(는) 직전 데이터가 {DEFAULT_ALERT_RULE.minBaseMonths}개월 미만이라 점검에서 제외했어요.
          </p>
        )}
      </section>

      {/* ---------- 1. 지출 추이 ---------- */}
      <ChartCard
        title="지출 추이"
        subtitle={`${formatMonthLong(trendMonths[0])} – ${formatMonthLong(ym)} · ${mainsPicked.length ? `대분류 ${mainsPicked.length}개` : "전체 대분류"}`}
        className="mt-3"
        months={trendMonths}
        table={[{ label: "지출", values: trend }]}
        controls={
          <>
            <MainFilter options={trendOptions} value={mainsPicked} onChange={setTrendMains} amountLabel={`최근 ${trendMonths.length}개월 합계`} />
            <label className="flex items-center gap-1.5 text-xs text-ink-2">
              최근
              <input
                type="number"
                inputMode="numeric"
                min={2}
                max={maxN}
                value={trendN}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) setTrendN(Math.min(maxN, Math.max(2, Math.round(n))));
                }}
                className="tnum h-7 w-12 rounded-lg border border-line bg-surface px-1.5 text-center text-sm font-semibold text-ink"
                aria-label="최근 개월 수"
              />
              개월
            </label>
          </>
        }
        legend={
          <>
            <LegendItem color="var(--series-2)" label={mainsPicked.length ? `지출 (${mainsPicked.join("·")})` : "지출"} />
            <span className="flex items-center gap-1.5 text-xs text-ink-2">
              <span aria-hidden className="w-3.5 border-t-[1.5px] border-dashed border-[var(--text-muted)]" />
              기간 월평균{trendAvg !== null && <b className="tnum text-ink">{formatCompactKRW(trendAvg)}</b>}
            </span>
            <span className="ml-auto flex flex-wrap items-center gap-x-2 text-xs text-ink-2">
              <span className="text-ink-3">{formatMonthLong(ym)} 전체 지출</span>
              <b className="tnum text-ink">
                {total < 0 ? "−" : ""}
                {Math.abs(total).toLocaleString("ko-KR")}원
              </b>
              <span className="text-ink-3">전월 대비</span>
              <DeltaText diff={mom?.diff ?? null} direction="down-good" note={kpiNote} />
              <span className="text-ink-3">전년 동월</span>
              <DeltaText diff={yoy?.diff ?? null} direction="down-good" />
            </span>
          </>
        }
      >
        {joinNote && <p className="mb-1 mt-1 text-[11px] text-ink-3">※ {joinNote}</p>}
        <ExpenseTrendChart tokens={tokens} months={trendMonths} values={trend} height={mobile ? 260 : 300} />
      </ChartCard>

      {/* ---------- 2. 증감 분해 | 3. 구성 비율 ---------- */}
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <section className="card flex min-w-0 flex-col p-4 sm:p-5" aria-labelledby="wf-title">
          <h2 id="wf-title" className="text-[15px] font-semibold">
            지출 증감 분해
          </h2>
          <p className="text-xs text-ink-3">
            {formatMonthLong(prevYm)} → {formatMonthLong(ym)} · 대분류별 증감(늘면 빨강, 줄면 파랑) · 막대를 누르면 Drill down
            {breakdown && expenseWaterfallZoomed(breakdown) && " · 변동을 잘 보이게 세로축을 0이 아닌 곳에서 시작"}
          </p>
          {breakdown ? (
            <>
              <div className="mt-3 flex-1">
                <ExpenseWaterfall
                  tokens={tokens}
                  data={breakdown}
                  prevLabel={`${Number(prevYm.slice(5))}월`}
                  curLabel={`${Number(ym.slice(5))}월`}
                  height={mobile ? 300 : 400}
                  compact={mobile}
                  onPick={(main) => {
                    drillTo(main);
                    setLevel("sub");
                  }}
                />
              </div>
              {breakdown.excluded.length > 0 && (
                <p className="mt-2 text-[11px] text-ink-3">※ {breakdown.excluded.map(ownerLabel).join("·")}은(는) 전월 데이터가 없어 제외했어요.</p>
              )}
            </>
          ) : (
            <p className="flex-1 py-16 text-center text-sm text-ink-3">전월 데이터가 없어 비교할 수 없어요</p>
          )}
        </section>

        <section className="card min-w-0 p-4 sm:p-5" aria-labelledby="cp-title">
          <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div>
              <h2 id="cp-title" className="text-[15px] font-semibold">
                구성 비율
              </h2>
              <p className="text-xs text-ink-3">
                {formatMonthLong(ym)} · {level === "main" ? "대분류" : treeMain ? `${treeMain}의 중분류` : "중분류"} · 크기·색 = 지출 · 칸을 누르면 Drill down
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {level === "sub" && (
                <select
                  aria-label="대분류 필터"
                  value={treeMain}
                  onChange={(e) => drillTo(e.target.value || null)}
                  className="h-8 max-w-[200px] rounded-full border border-line bg-surface px-3 text-xs font-medium"
                >
                  <option value="">대분류: 전체</option>
                  {monthMains.map((s) => (
                    <option key={s.main} value={s.main}>
                      {s.main} ({formatPct(s.share, 0)})
                    </option>
                  ))}
                </select>
              )}
              <div role="radiogroup" aria-label="구분 기준" className="flex h-8 items-center rounded-full border border-line bg-surface p-0.5 text-xs">
                {(
                  [
                    { id: "main", label: "대분류" },
                    { id: "sub", label: "중분류" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={level === o.id}
                    onClick={() => setLevel(o.id)}
                    className={`h-7 rounded-full px-3 font-medium transition ${
                      level === o.id ? "bg-[var(--accent)] text-[var(--surface)]" : "text-ink-2 hover:text-ink"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </header>
          <div className="mt-3">
            {slices.length ? (
              <ExpenseTreemap
                tokens={tokens}
                slices={slices}
                level={level}
                height={mobile ? 340 : 400}
                onPick={(s) => {
                  if (level === "main") {
                    drillTo(s.main);
                    setLevel("sub");
                  } else drillTo(s.main, s.name);
                }}
              />
            ) : (
              <p className="py-16 text-center text-sm text-ink-3">이 달에는 지출이 없어요</p>
            )}
          </div>
          <ColorLegend />
        </section>
      </div>

      {/* ---------- 4. 대분류 × 월 ---------- */}
      <section className="card mt-3 p-4 sm:p-5" aria-labelledby="hm-title">
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="hm-title" className="text-[15px] font-semibold">
              대분류 × 월
            </h2>
            <p className="text-xs text-ink-3">
              {formatMonthLong(trendMonths[0])} – {formatMonthLong(ym)} (추이 차트와 같은 기간) · 반복되는 패턴·계절성 확인 · 칸을 누르면 그 달로 이동해 Drill down
            </p>
          </div>
          {mobile && <p className="text-[11px] text-ink-3">← 옆으로 밀어서 보기</p>}
        </header>
        <div className="mt-3 overflow-x-auto">
          <div style={{ minWidth: Math.max(560, trendMonths.length * 58 + 110) }}>
            {heat.mains.length ? (
              <ExpenseHeatmap
                tokens={tokens}
                model={heat}
                selectedYm={ym}
                showLabels={!mobile}
                onPick={(m, main) => {
                  setYm(m);
                  drillTo(main);
                  scrollToTables();
                }}
              />
            ) : (
              <p className="py-16 text-center text-sm text-ink-3">기간 안에 지출이 없어요</p>
            )}
          </div>
        </div>
        <ColorLegend />
      </section>

      {/* ---------- 5. Top 지출 (대분류 | 중분류 | 항목) ---------- */}
      <div id="top-tables" className="mt-6 flex scroll-mt-16 flex-wrap items-center gap-2 text-xs text-ink-2">
        <span className="font-semibold text-ink">Drill down</span>
        <button
          type="button"
          onClick={() => drillTo(null)}
          className={`rounded-full px-2 py-0.5 ${drillMain ? "text-ink-2 hover:underline" : "bg-sunken font-semibold text-ink"}`}
        >
          전체 지출
        </button>
        {drillMain && (
          <>
            <span aria-hidden className="text-ink-3">
              ›
            </span>
            {drillChip(drillMain, () => drillTo(null))}
          </>
        )}
        {drillMain && drillSub && (
          <>
            <span aria-hidden className="text-ink-3">
              ›
            </span>
            {drillChip(drillSub, () => drillTo(drillMain))}
          </>
        )}
        {!drillMain && <span className="text-ink-3">· 표의 행·차트를 누르면 중분류·항목 표가 그 범위로 좁혀져요</span>}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-3 xl:grid-cols-3">
        <TopTable
          level="main"
          title="Top 지출 (대분류)"
          subtitle={cmpSubtitle}
          model={tMain}
          n={topN.main}
          onN={setN("main")}
          note={cmpNote(tMain)}
          selectedKey={drillMain}
          onPick={(l) => drillTo(drillMain === l.main ? null : l.main)}
        />
        <TopTable
          level="sub"
          title="Top 지출 (중분류)"
          subtitle={drillMain ? `${formatMonthLong(ym)} · ${drillMain} 안에서 · 전월·전년 동월 대비` : cmpSubtitle}
          model={tSub}
          n={topN.sub}
          onN={setN("sub")}
          note={cmpNote(tSub)}
          selectedKey={subKey}
          onPick={(l) => (subKey === l.key ? drillTo(l.main) : drillTo(l.main, l.sub))}
          scopeChip={drillMain ? drillChip(drillMain, () => drillTo(null)) : null}
        />
        <TopTable
          level="item"
          title="Top 지출 (항목)"
          subtitle={`${formatMonthLong(ym)} · ${drillMain ? `${drillMain}${drillSub ? ` › ${drillSub}` : ""} 안에서` : "항목(내역)별 합계"}`}
          model={tItem}
          n={topN.item}
          onN={setN("item")}
          scopeChip={
            drillMain ? (
              <>
                {drillChip(drillMain, () => drillTo(null))}
                {drillSub && drillChip(drillSub, () => drillTo(drillMain))}
              </>
            ) : null
          }
        />
      </div>
    </main>
  );
}

/** 점검 포인트 칩 한 줄 (중분류 / 항목) */
function AlertRow({ label, alerts, onPick }: { label: string; alerts: SpendAlert[]; onPick: (a: SpendAlert) => void }) {
  if (!alerts.length) return null;
  return (
    <div className="flex flex-wrap items-start gap-1.5 text-[12px]">
      <span className="mt-1 w-12 shrink-0 text-ink-3">{label}</span>
      {alerts.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={() => onPick(a)}
          title={`${a.main} › ${a.sub}${a.item ? ` › ${a.item}` : ""}`}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-[var(--page)] px-2.5 py-1 text-left transition hover:border-[var(--delta-bad)]"
        >
          <span className="min-w-0 truncate">
            <span className="text-ink-3">{a.item ? `${a.sub} › ` : `${a.main} › `}</span>
            <b className="font-semibold text-ink">{a.item ?? a.sub}</b>
          </span>
          <b className="tnum shrink-0 text-ink">{formatCompactKRW(a.cur)}</b>
          <span className="tnum shrink-0 font-semibold text-bad">
            {a.ratio === null ? "새 지출" : `평소 ${formatCompactKRW(a.base)} · +${formatPct(a.ratio - 1, 0)}`}
          </span>
        </button>
      ))}
    </div>
  );
}

/** 트리맵·히트맵 색 범례 */
function ColorLegend() {
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-[11px] text-ink-3">
      <span>적음</span>
      <span aria-hidden className="h-2 w-32 rounded-full" style={{ background: "linear-gradient(90deg, var(--grid), var(--delta-bad))" }} />
      <span>많음</span>
      <span className="sr-only">색이 진한 빨강일수록 지출이 큽니다</span>
    </div>
  );
}
