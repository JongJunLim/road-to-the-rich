import type { OwnerFilter, OwnerId, Snapshot, YearEndAnnualRow, YearEndMetric } from "./schema";

/**
 * 화면 2 — Year End Tax Settlement 계산 (KPI 정의서 기준)
 *
 * YoY 규칙
 *  - 올해(Today() 연도)를 고르면 "지표별로 데이터가 있는 마지막 달"까지만 전년도와 비교 (= 전년 동기)
 *    예) 급여명세서가 8월까지면 급여는 1~8월, 가계부가 9월까지면 카드는 1~9월끼리 비교
 *  - 과거 연도는 1~12월 전체 비교
 * Owner
 *  - 급여명세서·원천징수영수증은 owner 가 'bbang' 으로만 적재됨 → '또용' 선택 시 급여·세금은 데이터 없음
 *  - 가계부 기반(실수령액·카드)은 owner 필터 그대로 적용
 *  - '전체'의 YoY 는 화면 1과 같은 규칙: 전년 같은 기간에 데이터가 있는 사람끼리만 비교
 *    (예: 또용 가계부가 2026년 8월부터면 카드 YoY 는 빵준끼리 비교하고 "또용 전년 없음" 표시)
 */

export const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const CARD_DEDUCTION_RATE = 0.25; // 신용카드 등 소득공제 최저사용금액 = 총급여 × 25%

export type Series12 = (number | null)[]; // index 0 = 1월

export interface YoY {
  value: number | null;
  prev: number | null;
  diff: number | null;
  pct: number | null; // diff ÷ prev
  cutoff: number | null; // 비교한 마지막 달 (12 = 연간 전체)
  excluded: OwnerId[]; // 전년 데이터가 없어 비교에서 뺀 사람
}

export interface AnnualTotals extends Omit<YearEndAnnualRow, "year" | "owner"> {}

export interface YearEndModel {
  year: number;
  prevYear: number;
  isCurrent: boolean;
  hasPayData: boolean; // 선택한 owner 의 급여명세서·원천징수영수증 존재 여부
  series: Record<Exclude<YearEndMetric, "card_legacy"> | "card", { cur: Series12; prev: Series12 }>;
  gross: YoY & { source: "monthly" | "annual" | null };
  net: YoY;
  card: YoY;
  credit: YoY;
  debit: YoY;
  taxPaid: YoY & { source: "monthly" | "annual" | null };
  deductionCriteria: YoY;
  share: { credit: number | null; debit: number | null };
  annual: { cur: AnnualTotals | null; prev: AnnualTotals | null };
  refunds: { year: number; value: number }[]; // 최근 5개년 (양수 = 추가 징수, 음수 = 환급)
  trend5: Record<"gross" | "net" | "card", YearPoint[]>; // 상단 KPI 5개년 추이 (선택 연도 포함)
}

/** 5개년 추이의 한 점 — 올해는 데이터가 있는 달까지의 누계 */
export interface YearPoint {
  year: number;
  value: number | null;
  throughMonth: number | null; // 올해 누계의 마지막 달 (지난 연도는 null)
}

const ANNUAL_KEYS = [
  "gross_pay",
  "tax_paid",
  "income_deduction",
  "tax_base",
  "calculated_tax",
  "tax_reduction",
  "tax_credit",
  "determined_tax",
  "refund_or_additional",
] as const;

const ownerMatch = (owner: OwnerFilter) => (o: string) => owner === "all" || o === owner;

/** 데이터가 있는 연도 (최근 → 과거) */
export function yearEndYears(s: Snapshot): number[] {
  const ys = new Set<number>();
  for (const r of s.year_end_monthly ?? []) ys.add(r.year);
  for (const r of s.year_end_annual ?? []) ys.add(r.year);
  return [...ys].sort((a, b) => b - a);
}

/** 기본 선택 연도: 월별 데이터가 있는 가장 최근 연도 */
export function defaultYearEndYear(s: Snapshot): number | null {
  const monthly = (s.year_end_monthly ?? []).map((r) => r.year);
  if (monthly.length) return Math.max(...monthly);
  return yearEndYears(s)[0] ?? null;
}

export function hasYearEndData(s: Snapshot): boolean {
  return (s.year_end_monthly?.length ?? 0) + (s.year_end_annual?.length ?? 0) > 0;
}

/** owner 별 월 계열 */
function ownerSeries(s: Snapshot, owner: OwnerFilter, metrics: YearEndMetric[], year: number): Map<OwnerId, Series12> {
  const out = new Map<OwnerId, Series12>();
  const match = ownerMatch(owner);
  for (const r of s.year_end_monthly ?? []) {
    if (r.year !== year || !metrics.includes(r.metric) || !match(r.owner)) continue;
    const arr = out.get(r.owner) ?? Array(12).fill(null);
    arr[r.month - 1] = (arr[r.month - 1] ?? 0) + r.amount;
    out.set(r.owner, arr);
  }
  return out;
}

function totalSeries(m: Map<OwnerId, Series12>): Series12 {
  let acc: Series12 = Array(12).fill(null);
  for (const v of m.values()) acc = addSeries(acc, v);
  return acc;
}

function addSeries(a: Series12, b: Series12): Series12 {
  return a.map((v, i) => (v === null && b[i] === null ? null : (v ?? 0) + (b[i] ?? 0)));
}

export function lastMonthWithData(s: Series12): number | null {
  for (let i = 11; i >= 0; i--) if (s[i] !== null) return i + 1;
  return null;
}

/** 누적 합계 (마지막 데이터 이후는 null) */
export function cumulative(s: Series12): Series12 {
  const last = lastMonthWithData(s);
  let acc = 0;
  return s.map((v, i) => {
    if (last === null || i + 1 > last) return null;
    acc += v ?? 0;
    return acc;
  });
}

const sumTo = (s: Series12, cutoff: number) => s.slice(0, cutoff).reduce<number>((a, v) => a + (v ?? 0), 0);
const hasAny = (s: Series12, cutoff = 12) => s.slice(0, cutoff).some((v) => v !== null);

function makeYoY(
  value: number | null,
  prev: number | null,
  cutoff: number | null,
  comparableValue: number | null = value,
  excluded: OwnerId[] = [],
): YoY {
  const diff = comparableValue !== null && prev !== null ? comparableValue - prev : null;
  const pct = diff !== null && prev ? diff / Math.abs(prev) : null;
  return { value, prev, diff, pct, cutoff, excluded };
}

/** 월별 계열의 전년 동기 비교 — 전년 같은 기간에 데이터가 있는 사람끼리만 증감 계산 */
function ytd(cur: Map<OwnerId, Series12>, prev: Map<OwnerId, Series12>, isCurrent: boolean): YoY {
  const curTotal = totalSeries(cur);
  const prevTotal = totalSeries(prev);
  if (!hasAny(curTotal)) return makeYoY(null, hasAny(prevTotal) ? sumTo(prevTotal, 12) : null, null);
  const cutoff = isCurrent ? (lastMonthWithData(curTotal) ?? 12) : 12;

  const comparable: OwnerId[] = [];
  const excluded: OwnerId[] = [];
  for (const [o, series] of cur) {
    if (!hasAny(series, cutoff)) continue;
    const p = prev.get(o);
    (p && hasAny(p, cutoff) ? comparable : excluded).push(o);
  }
  if (!comparable.length) return makeYoY(sumTo(curTotal, cutoff), null, cutoff, null, excluded);
  const cmpCur = comparable.reduce((a, o) => a + sumTo(cur.get(o)!, cutoff), 0);
  const cmpPrev = comparable.reduce((a, o) => a + sumTo(prev.get(o)!, cutoff), 0);
  return makeYoY(sumTo(curTotal, cutoff), cmpPrev, cutoff, cmpCur, excluded);
}

function annualTotals(s: Snapshot, owner: OwnerFilter, year: number): AnnualTotals | null {
  const rows = (s.year_end_annual ?? []).filter((r) => r.year === year && ownerMatch(owner)(r.owner));
  if (!rows.length) return null;
  const out = Object.fromEntries(ANNUAL_KEYS.map((k) => [k, 0])) as AnnualTotals;
  for (const r of rows) for (const k of ANNUAL_KEYS) out[k] += r[k] ?? 0;
  return out;
}

/**
 * 급여명세서(월별)가 있으면 월별 기준, 없는 과거 연도는 원천징수영수증(연간) 값으로 대체.
 * 올해처럼 전년 동기 비교가 필요한데 전년이 연간 값뿐이면 비교하지 않음 (기간이 달라 오해 소지).
 */
function withAnnualFallback(
  base: YoY,
  cur: Series12,
  prev: Series12,
  curAnnual: number | null,
  prevAnnual: number | null,
  isCurrent: boolean,
): YoY & { source: "monthly" | "annual" | null } {
  if (hasAny(cur)) {
    if (base.prev === null && !isCurrent && prevAnnual !== null) return { ...makeYoY(base.value, prevAnnual, 12), source: "monthly" };
    return { ...base, source: "monthly" };
  }
  if (curAnnual !== null) {
    const p = hasAny(prev) ? sumTo(prev, 12) : prevAnnual;
    return { ...makeYoY(curAnnual, p, 12), source: "annual" };
  }
  return { ...base, source: null };
}

export function buildYearEndModel(s: Snapshot, year: number, owner: OwnerFilter, nowYear: number): YearEndModel {
  const prevYear = year - 1;
  const isCurrent = year === nowYear;
  // owner 별 계열 (YoY 같은 사람끼리 비교용) + 합계 계열 (차트용)
  const byOwner = (ms: YearEndMetric[]) => ({ cur: ownerSeries(s, owner, ms, year), prev: ownerSeries(s, owner, ms, prevYear) });
  const totals = (p: { cur: Map<OwnerId, Series12>; prev: Map<OwnerId, Series12> }) => ({ cur: totalSeries(p.cur), prev: totalSeries(p.prev) });

  const o = {
    gross: byOwner(["gross"]),
    taxPaid: byOwner(["tax_paid"]),
    net: byOwner(["net"]),
    credit: byOwner(["credit"]),
    debit: byOwner(["debit"]),
    card: byOwner(["credit", "debit", "card_legacy"]),
  };
  const gross = totals(o.gross);
  const taxPaid = totals(o.taxPaid);
  const net = totals(o.net);
  const credit = totals(o.credit);
  const debit = totals(o.debit);
  const card = totals(o.card);

  const annualCur = annualTotals(s, owner, year);
  const annualPrev = annualTotals(s, owner, prevYear);

  const grossYoY = withAnnualFallback(
    ytd(o.gross.cur, o.gross.prev, isCurrent),
    gross.cur,
    gross.prev,
    annualCur?.gross_pay ?? null,
    annualPrev?.gross_pay ?? null,
    isCurrent,
  );
  const taxPaidYoY = withAnnualFallback(
    ytd(o.taxPaid.cur, o.taxPaid.prev, isCurrent),
    taxPaid.cur,
    taxPaid.prev,
    annualCur?.tax_paid ?? null,
    annualPrev?.tax_paid ?? null,
    isCurrent,
  );

  const creditYoY = ytd(o.credit.cur, o.credit.prev, isCurrent);
  const debitYoY = ytd(o.debit.cur, o.debit.prev, isCurrent);
  const cardYoY = ytd(o.card.cur, o.card.prev, isCurrent);
  // 신용/직불 비중은 구분 가능한 카드 지출(credit + debit)만으로 계산 (card_legacy 제외)
  const classified = (creditYoY.value ?? 0) + (debitYoY.value ?? 0);

  const r25 = (v: number | null) => (v === null ? null : Math.round(v * CARD_DEDUCTION_RATE));
  const deductionCriteria: YoY = {
    ...grossYoY,
    value: r25(grossYoY.value),
    prev: r25(grossYoY.prev),
    diff: r25(grossYoY.diff),
  };

  const match = ownerMatch(owner);
  const hasPayData =
    (s.year_end_monthly ?? []).some((r) => (r.metric === "gross" || r.metric === "tax_paid") && match(r.owner)) ||
    (s.year_end_annual ?? []).some((r) => match(r.owner));

  const refunds = [...new Set((s.year_end_annual ?? []).filter((r) => match(r.owner) && r.year <= year && r.year > year - 5).map((r) => r.year))]
    .sort((a, b) => a - b)
    .slice(-5)
    .map((y) => ({ year: y, value: annualTotals(s, owner, y)!.refund_or_additional }));

  // 상단 KPI 5개년 추이: 월별 합계(올해는 누계), 급여는 급여명세서가 없으면 원천징수영수증 총급여
  const window5 = Array.from({ length: 5 }, (_, i) => year - 4 + i);
  const yearPoint = (ms: YearEndMetric[], y: number, annualKey?: "gross_pay"): YearPoint => {
    const t = totalSeries(ownerSeries(s, owner, ms, y));
    if (hasAny(t)) return { year: y, value: sumTo(t, 12), throughMonth: y === nowYear ? lastMonthWithData(t) : null };
    const a = annualKey ? annualTotals(s, owner, y)?.[annualKey] : undefined;
    return { year: y, value: a ?? null, throughMonth: null };
  };
  const trend5 = {
    gross: window5.map((y) => yearPoint(["gross"], y, "gross_pay")),
    net: window5.map((y) => yearPoint(["net"], y)),
    card: window5.map((y) => yearPoint(["credit", "debit", "card_legacy"], y)),
  };

  return {
    year,
    prevYear,
    isCurrent,
    trend5,
    hasPayData,
    series: { gross, tax_paid: taxPaid, net, credit, debit, card },
    gross: grossYoY,
    net: ytd(o.net.cur, o.net.prev, isCurrent),
    card: cardYoY,
    credit: creditYoY,
    debit: debitYoY,
    taxPaid: taxPaidYoY,
    deductionCriteria,
    share: {
      credit: classified ? (creditYoY.value ?? 0) / classified : null,
      debit: classified ? (debitYoY.value ?? 0) / classified : null,
    },
    annual: { cur: annualCur, prev: annualPrev },
    refunds,
  };
}
