"use client";

import { useEffect, useMemo, useState } from "react";
import type { OwnerFilter, Snapshot } from "@/lib/schema";
import { monthsBetween, monthsEndingAt, shiftMonth } from "@/lib/metrics";
import {
  flowBreakdown,
  holdingsAt,
  investMonths,
  investRows,
  investSummary,
  investTable,
  productOptions,
  trendSeries,
  type TableSortKey,
} from "@/lib/invest";
import { formatCompactKRW, formatMonthLong, formatPct, formatWon } from "@/lib/format";
import AppNav from "../AppNav";
import ChartCard, { LegendItem } from "../ChartCard";
import { useThemeTokens } from "../charts/EChart";
import ProductTrendChart from "../charts/ProductTrendChart";
import ProductTreemap, { RATE_SCALE, type TreemapSize } from "../charts/ProductTreemap";
import FlowWaterfall, { waterfallZoomed } from "../charts/FlowWaterfall";
import ProfitBars from "../charts/ProfitBars";
import WeightRateScatter from "../charts/WeightRateScatter";
import { DeltaText } from "../KpiCard";
import ProductFilter from "./ProductFilter";
import InvestTable from "./InvestTable";

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

/** Investment 화면 — 추이(라인) → 종목 구성(트리맵) → 종목별 표 */
export default function InvestmentDashboard({
  snapshot,
  mode,
  userMenu,
}: {
  snapshot: Snapshot;
  mode: "demo" | "private";
  userMenu?: React.ReactNode;
}) {
  const rows = useMemo(() => investRows(snapshot), [snapshot]);
  const months = useMemo(() => investMonths(rows), [rows]);
  const latest = months.at(-1) ?? "";
  const years = useMemo(() => [...new Set(months.map((m) => m.slice(0, 4)))].reverse(), [months]);

  const [ym, setYm] = useState(latest);
  const [owner, setOwner] = useState<OwnerFilter>("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [trendN, setTrendN] = useState(12);
  const [sort, setSort] = useState<{ key: TableSortKey; dir: "asc" | "desc" }>({ key: "rate", dir: "desc" });
  const [showInfo, setShowInfo] = useState(false);
  const [treeSize, setTreeSize] = useState<TreemapSize>("valuation");

  const tokens = useThemeTokens();
  const mobile = useIsMobile();
  const ownerLabel = (id: string) => snapshot.owners.find((o) => o.id === id)?.label ?? id;

  /* ---------- 필터 ---------- */
  const year = ym.slice(0, 4);
  const monthsOfYear = months.filter((m) => m.startsWith(year));
  const changeYear = (y: string) => {
    const inYear = months.filter((m) => m.startsWith(y));
    const sameMonth = `${y}-${ym.slice(5)}`;
    setYm(inYear.includes(sameMonth) ? sameMonth : inYear.at(-1) ?? ym);
  };

  // 종목 목록은 owner 기준 — owner 를 바꾸면 목록에 없는 선택은 자동으로 빠짐
  const options = useMemo(() => productOptions(rows, owner), [rows, owner]);
  const products = useMemo(() => picked.filter((p) => options.some((o) => o.name === p)), [picked, options]);

  /* ---------- 1. 추이 ---------- */
  const firstMonth = months[0] ?? ym;
  const maxN = Math.max(2, monthsBetween(firstMonth, ym));
  const trendMonths = monthsEndingAt(ym, Math.min(trendN, maxN));
  const trend = useMemo(() => trendSeries(rows, owner, products, trendMonths), [rows, owner, products, trendMonths.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const principal = trend.map((p) => p.principal);
  const valuation = trend.map((p) => p.valuation);
  const rate = trend.map((p) => p.rate);

  /* ---------- 요약 KPI · 변동 분해 ---------- */
  const summary = useMemo(() => investSummary(rows, ym, owner), [rows, ym, owner]);
  const flow = useMemo(() => flowBreakdown(rows, ym, owner), [rows, ym, owner]);
  const prevYm = shiftMonth(ym, -1);
  const kpiNote = summary.excluded.length ? `${summary.excluded.map(ownerLabel).join("·")} 전월 없음` : undefined;

  /* ---------- 종목 구성 (트리맵 · 평가손익 · 산점도) ---------- */
  const holdings = useMemo(() => holdingsAt(rows, ym, owner), [rows, ym, owner]);

  /* ---------- 3. 표 ---------- */
  const ownerOrder = snapshot.owners.map((o) => o.id);
  const table = useMemo(() => investTable(rows, ym, owner, ownerOrder, sort), [rows, ym, owner, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const onSort = (key: TableSortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "product" ? "asc" : "desc" }));
  const excludedNotes = [
    table.total?.excludedMom?.length ? `전월 대비 총계는 ${table.total.excludedMom.map(ownerLabel).join("·")} 제외 (전월 데이터 없음)` : null,
    table.total?.excludedYoy?.length ? `전년 동월 대비 총계는 ${table.total.excludedYoy.map(ownerLabel).join("·")} 제외 (전년 데이터 없음)` : null,
  ].filter(Boolean);

  const updated = snapshot.data_updated_at?.slice(0, 10) ?? null;

  // '전체'에서 한 사람 데이터가 늦게 시작하면 추이가 계단처럼 뛰므로 안내
  const joiners = useMemo(() => {
    const first = new Map<string, string>();
    for (const r of rows) if (!first.has(r.owner) || r.ym < first.get(r.owner)!) first.set(r.owner, r.ym);
    const start = months[0];
    return [...first.entries()].filter(([, m]) => m > start).map(([o, m]) => ({ owner: o, ym: m }));
  }, [rows, months]);
  const joinNote =
    owner === "all" && joiners.some((j) => j.ym > trendMonths[0] && j.ym <= ym)
      ? `${joiners.map((j) => `${ownerLabel(j.owner)} 데이터는 ${formatMonthLong(j.ym)}부터`).join(", ")} 포함돼요. 그 전 추이는 나머지 사람만 반영됩니다.`
      : null;

  if (!months.length) {
    return (
      <main className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <AppNav />
        <section className="card mx-auto mt-10 max-w-lg p-8 text-center">
          <h1 className="text-lg font-semibold">종목별 투자 데이터가 아직 없어요</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            스냅샷에 <code className="rounded bg-sunken px-1">investment_product</code> 섹션이 없습니다. 새 버전의{" "}
            <code className="rounded bg-sunken px-1">rttr-publish</code>를 배포·실행하거나, 로컬에서는{" "}
            <code className="rounded bg-sunken px-1">npm run data:real -- bq</code>로 스냅샷을 다시 만들어 주세요.
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
            <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Investment</h1>
            {mode === "demo" && (
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-3">DEMO</span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-2">종목별 원금 · 평가금 · 수익률</p>
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
            <div className="card absolute right-0 top-10 z-20 w-[310px] p-4 text-left text-xs leading-relaxed text-ink-2">
              <p className="mb-2 font-semibold text-ink">지표 설명</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>사람별로 매월 마지막 스냅샷 기준입니다. 같은 종목을 여러 증권사에 나눠 가진 경우 합산합니다.</li>
                <li>수익률 = (평가금 − 원금) ÷ 원금. 여러 종목·두 사람을 합칠 때는 합계로 다시 계산합니다.</li>
                <li>&lsquo;종목 합산 (구분 전)&rsquo;은 종목별 내역 없이 합계만 적재된 달(2026년 1월 이전)입니다.</li>
                <li>트리맵 색은 0% 회색 기준으로 이익은 파랑(+300% 이상 가장 진함, 로그 눈금), 손실은 빨강(−50% 이하 가장 진함)입니다.</li>
                <li>종목 필터는 추이 차트에만 적용되고, 트리맵·표는 선택한 달의 전체 종목을 보여줍니다.</li>
                <li>평가금 변동 분해: 전월 평가금 + 추가 투자(원금 변화, 신규 매수는 +원금, 전량 매도는 −전월 평가금) + 시장 손익(나머지 = 가격 변동) = 이번 달 평가금.</li>
                <li>비중 × 수익률 산점도의 세로축은 로그 눈금입니다. 오른쪽 아래(비중 크고 수익률 낮음)가 점검 대상입니다.</li>
                <li>&lsquo;신규&rsquo;는 비교하는 달에는 없던 종목입니다. 총계 비교는 두 달 모두 데이터가 있는 사람끼리만 합니다.</li>
              </ul>
            </div>
          )}
        </div>
      </header>

      {/* ---------- 필터 (모바일에서는 상단 고정) ---------- */}
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

      {/* ---------- 요약 KPI ---------- */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="평가금" subtitle="Valuation" value={`${formatWon(summary.cur.valuation)}`} unit="원">
          <span className="text-ink-3">전월 대비</span>
          <DeltaText diff={summary.mom?.valuation ?? null} direction="up-good" note={kpiNote} />
        </StatCard>
        <StatCard title="원금" subtitle="Principal" value={`${formatWon(summary.cur.principal)}`} unit="원">
          <span className="text-ink-3">전월 대비</span>
          <NeutralDelta v={summary.mom?.principal ?? null} />
        </StatCard>
        <StatCard
          title="평가손익"
          subtitle="Profit"
          value={`${summary.cur.profit < 0 ? "−" : ""}${formatWon(Math.abs(summary.cur.profit))}`}
          unit="원"
          tone={summary.cur.profit >= 0 ? "good" : "bad"}
        >
          <span className="text-ink-3">전월 대비</span>
          <DeltaText diff={summary.mom?.profit ?? null} direction="up-good" />
        </StatCard>
        <StatCard
          title="수익률"
          subtitle="Return"
          value={formatPct(summary.cur.rate, 1)}
          tone={summary.cur.rate === null ? undefined : summary.cur.rate >= 0 ? "good" : "bad"}
        >
          <span className="text-ink-3">전월 대비</span>
          <PpDelta v={summary.mom?.rate ?? null} />
        </StatCard>
      </div>

      {/* ---------- 1. 추이 ---------- */}
      <ChartCard
        title="투자 추이"
        subtitle={`${formatMonthLong(trendMonths[0])} – ${formatMonthLong(ym)} · ${products.length ? `${products.length}개 종목` : "전체 종목"}`}
        className="mt-3"
        months={trendMonths}
        table={[
          { label: "원금", values: principal },
          { label: "평가금", values: valuation },
          { label: "수익률", values: rate, format: (v) => formatPct(v, 2) },
        ]}
        controls={
          <>
            <ProductFilter options={options} value={products} onChange={setPicked} currentYm={ym} />
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
              />
              개월
            </label>
          </>
        }
        legend={
          <>
            <LegendItem color="var(--series-1)" label="원금" />
            <LegendItem color="var(--series-2)" label="평가금" />
            <span className="flex items-center gap-1.5 text-xs text-ink-2">
              <span aria-hidden className="w-3.5 border-t-[1.5px] border-dashed border-[var(--text-muted)]" />
              수익률 (오른쪽 축)
            </span>
          </>
        }
      >
        {joinNote && <p className="mb-1 mt-1 text-[11px] text-ink-3">※ {joinNote}</p>}
        <ProductTrendChart tokens={tokens} months={trendMonths} principal={principal} valuation={valuation} rate={rate} height={mobile ? 260 : 340} />
      </ChartCard>

      {/* ---------- 2. 이번 달 변화 (변동 분해 · 종목별 평가손익) ---------- */}
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <section className="card flex flex-col p-4 sm:p-5" aria-labelledby="wf-title">
          <h2 id="wf-title" className="text-[15px] font-semibold">
            평가금 변동 분해
          </h2>
          <p className="text-xs text-ink-3">
            {formatMonthLong(prevYm)} → {formatMonthLong(ym)} · 넣은 돈(추가 투자)과 오른 돈(시장 손익) 나누기
            {flow && waterfallZoomed(flow) && " · 변동을 잘 보이게 세로축을 0이 아닌 곳에서 시작"}
          </p>
          {flow ? (
            <>
              <div className="mt-3">
                <FlowWaterfall tokens={tokens} flow={flow} prevLabel={`${Number(prevYm.slice(5))}월`} curLabel={`${Number(ym.slice(5))}월`} height={mobile ? 240 : 280} />
              </div>
              <MoverChips movers={flow.movers} />
              {flow.excluded.length > 0 && (
                <p className="mt-2 text-[11px] text-ink-3">※ {flow.excluded.map(ownerLabel).join("·")}은(는) 전월 데이터가 없어 제외했어요.</p>
              )}
            </>
          ) : (
            <p className="flex-1 py-16 text-center text-sm text-ink-3">전월 데이터가 없어 비교할 수 없어요</p>
          )}
        </section>

        <section className="card p-4 sm:p-5" aria-labelledby="pf-title">
          <h2 id="pf-title" className="text-[15px] font-semibold">
            종목별 평가손익
          </h2>
          <p className="text-xs text-ink-3">{formatMonthLong(ym)} · 평가금 − 원금 (금액 기준, 큰 순)</p>
          <div className="mt-3">
            {holdings.length ? <ProfitBars tokens={tokens} holdings={holdings} /> : <p className="py-16 text-center text-sm text-ink-3">이 달에는 보유 종목이 없어요</p>}
          </div>
        </section>
      </div>

      {/* ---------- 3. 종목 구성 (트리맵) ---------- */}
      <section className="card mt-3 p-4 sm:p-5" aria-labelledby="tm-title">
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div>
            <h2 id="tm-title" className="text-[15px] font-semibold">
              종목 구성
            </h2>
            <p className="text-xs text-ink-3">
              {formatMonthLong(ym)} · 크기 = {treeSize === "principal" ? "원금" : "평가금"}, 색 = 수익률
            </p>
          </div>
          <div role="radiogroup" aria-label="칸 크기 기준" className="flex h-8 items-center rounded-full border border-line bg-surface p-0.5 text-xs">
            {(
              [
                { id: "valuation", label: "평가금" },
                { id: "principal", label: "원금" },
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={treeSize === o.id}
                onClick={() => setTreeSize(o.id)}
                className={`h-7 rounded-full px-3 font-medium transition ${
                  treeSize === o.id ? "bg-[var(--accent)] text-[var(--surface)]" : "text-ink-2 hover:text-ink"
                }`}
              >
                크기: {o.label}
              </button>
            ))}
          </div>
        </header>
        <div className="mt-3">
          {holdings.some((h) => (treeSize === "principal" ? h.principal : h.valuation) > 0) ? (
            <ProductTreemap tokens={tokens} holdings={holdings} sizeBy={treeSize} height={mobile ? 420 : 460} />
          ) : (
            <p className="py-16 text-center text-sm text-ink-3">이 달에는 보유 종목이 없어요</p>
          )}
        </div>
        <RateLegend />
      </section>

      {/* ---------- 4. 비중 × 수익률 ---------- */}
      <section className="card mt-3 p-4 sm:p-5" aria-labelledby="sc-title">
        <h2 id="sc-title" className="text-[15px] font-semibold">
          비중 × 수익률
        </h2>
        <p className="text-xs text-ink-3">
          {formatMonthLong(ym)} · 점 크기 = 평가금 · 오른쪽 아래(비중 크고 수익률 낮음)가 점검 대상 · 세로축 로그 눈금
        </p>
        <div className="mt-3">
          {holdings.some((h) => h.valuation > 0 && h.rate !== null) ? (
            <WeightRateScatter tokens={tokens} holdings={holdings} height={mobile ? 340 : 400} />
          ) : (
            <p className="py-16 text-center text-sm text-ink-3">이 달에는 보유 종목이 없어요</p>
          )}
        </div>
      </section>

      {/* ---------- 5. 표 ---------- */}
      <section className="card mt-3 p-4 sm:p-5" aria-labelledby="tb-title">
        <header className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="tb-title" className="text-[15px] font-semibold">
              종목별 현황
            </h2>
            <p className="text-xs text-ink-3">
              {formatMonthLong(ym)} · 전월 = {formatMonthLong(shiftMonth(ym, -1))}, 전년 동월 = {formatMonthLong(shiftMonth(ym, -12))}
            </p>
          </div>
          <p className="text-[11px] text-ink-3 sm:hidden">← 옆으로 밀어서 보기</p>
        </header>
        {table.groups.length ? (
          <InvestTable model={table} ownerLabel={ownerLabel} sort={sort} onSort={onSort} />
        ) : (
          <p className="py-10 text-center text-sm text-ink-3">이 달에는 보유 종목이 없어요</p>
        )}
        {excludedNotes.length > 0 && <p className="mt-2 text-[11px] text-ink-3">※ {excludedNotes.join(" · ")}</p>}
      </section>
    </main>
  );
}

/** KPI 카드 — 화면 1 KpiCard 와 같은 모양 (수익률처럼 원 단위가 아닌 값도 표시) */
function StatCard({
  title,
  subtitle,
  value,
  unit,
  tone,
  children,
}: {
  title: string;
  subtitle: string;
  value: string;
  unit?: string;
  tone?: "good" | "bad";
  children: React.ReactNode;
}) {
  return (
    <section className="card flex min-w-0 flex-col justify-between gap-2.5 p-3.5 sm:gap-3 sm:p-5">
      <h2 className="text-sm font-semibold text-ink-2">
        {title}
        <span className="ml-1.5 hidden text-xs font-medium text-ink-3 sm:inline">{subtitle}</span>
      </h2>
      <p
        className={`tnum min-w-0 truncate text-[19px] font-bold leading-none tracking-tight min-[400px]:text-[21px] sm:text-[28px] xl:text-[30px] ${
          tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""
        }`}
      >
        {value}
        {unit && <span className="ml-1 hidden text-base font-medium text-ink-3 sm:inline">{unit}</span>}
      </p>
      <div className="flex flex-wrap items-center gap-x-1.5 text-xs sm:text-[13px]">{children}</div>
    </section>
  );
}

/** 원금 증감 — 좋고 나쁨이 아니라 회색 ▲▼ */
function NeutralDelta({ v }: { v: number | null }) {
  if (v === null) return <span className="text-ink-3">–</span>;
  if (v === 0) return <span className="text-ink-3">변동 없음</span>;
  return (
    <span className="tnum font-semibold text-ink-2">
      {v > 0 ? "▲" : "▼"}
      {formatWon(Math.abs(v))}
    </span>
  );
}

/** 수익률 차이 (%p) */
function PpDelta({ v }: { v: number | null }) {
  if (v === null) return <span className="text-ink-3">–</span>;
  if (Math.abs(v) < 0.0005) return <span className="text-ink-3">변동 없음</span>;
  return (
    <span className={`tnum font-semibold ${v > 0 ? "text-good" : "text-bad"}`}>
      {v > 0 ? "▲" : "▼"}
      {(Math.abs(v) * 100).toFixed(1)}%p
    </span>
  );
}

/** 시장 손익 상·하위 종목 */
function MoverChips({ movers }: { movers: { product: string; market: number }[] }) {
  const up = movers.filter((m) => m.market > 0).slice(0, 3);
  const down = movers.filter((m) => m.market < 0).slice(-3).reverse();
  if (!up.length && !down.length) return null;
  const chip = (m: { product: string; market: number }) => (
    <span key={m.product} className="inline-flex items-center gap-1 rounded-full bg-sunken px-2 py-0.5">
      <span className="max-w-[110px] truncate">{m.product}</span>
      <b className={`tnum ${m.market > 0 ? "text-good" : "text-bad"}`}>
        {m.market > 0 ? "+" : "−"}
        {formatCompactKRW(Math.abs(m.market))}
      </b>
    </span>
  );
  return (
    <div className="mt-3 space-y-1.5 text-[11.5px] text-ink-2">
      {up.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 shrink-0 text-ink-3">많이 오른</span>
          {up.map(chip)}
        </div>
      )}
      {down.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 shrink-0 text-ink-3">많이 내린</span>
          {down.map(chip)}
        </div>
      )}
    </div>
  );
}

/** 트리맵 색 범례 — 빨강(손실) ← 0% → 파랑(이익) */
function RateLegend() {
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-[11px] text-ink-3">
      <span>−{RATE_SCALE.bad * 100}% 이하</span>
      <span
        aria-hidden
        className="h-2 w-40 rounded-full"
        style={{ background: "linear-gradient(90deg, var(--delta-bad), var(--grid) 50%, var(--delta-good))" }}
      />
      <span>+{RATE_SCALE.good * 100}% 이상</span>
      <span className="sr-only">색이 진할수록 수익률이 크거나(파랑) 손실이 큽니다(빨강). 가운데 회색이 0%</span>
    </div>
  );
}
