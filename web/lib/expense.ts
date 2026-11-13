/**
 * Expense Analysis 화면 계산 — 지출 Drill down (대분류 → 중분류 → 항목)
 *
 * 규칙
 *  - 금액은 스냅샷 expense_item 의 지출 순액(환불 차감). 월 × owner 합계 = 화면 1 지출
 *  - 전월·전년 동월 비교는 "두 달 모두 지출 데이터가 있는 사람끼리만" (화면 1·Investment 와 같은 규칙)
 *    → 또용 데이터가 2026-08 부터여도 '전체' 증감이 부풀지 않음. 제외된 사람은 excluded 로 돌려줌
 *  - 비교 달에 없던 분류·항목은 '신규'
 *  - 중분류·항목은 이름이 같아도 상위 분류가 다르면 다른 행 (예: 식비>기타 ≠ 생활>기타)
 */
import type { ExpenseItemRow, OwnerFilter, OwnerId, Snapshot } from "./schema";
import { shiftMonth } from "./metrics";

export type ExpenseLevel = "main" | "sub" | "item";

export const LEVEL_LABEL: Record<ExpenseLevel, string> = { main: "대분류", sub: "중분류", item: "항목" };

export function expenseRows(s: Snapshot): ExpenseItemRow[] {
  return s.expense_item ?? [];
}

export function hasExpenseData(s: Snapshot): boolean {
  return expenseRows(s).length > 0;
}

/** 지출 데이터가 있는 월 (오름차순) */
export function expenseMonths(rows: ExpenseItemRow[]): string[] {
  return [...new Set(rows.map((r) => r.ym))].sort();
}

const byOwner = (owner: OwnerFilter) => (r: ExpenseItemRow) => owner === "all" || r.owner === owner;

/** 그 달에 지출 데이터가 있는 사람 */
function ownersIn(rows: ExpenseItemRow[], ym: string, owner: OwnerFilter): Set<OwnerId> {
  const out = new Set<OwnerId>();
  for (const r of rows) if (r.ym === ym && byOwner(owner)(r)) out.add(r.owner);
  return out;
}

/** 분류 키 — 상위 분류까지 포함해 같은 이름의 하위 분류를 구분 */
export function keyOf(r: Pick<ExpenseItemRow, "main" | "sub" | "item">, level: ExpenseLevel): string {
  return level === "main" ? r.main : level === "sub" ? `${r.main}\u0000${r.sub}` : `${r.main}\u0000${r.sub}\u0000${r.item}`;
}

/* ---------------- 필터 옵션 ---------------- */

export interface MainOption {
  name: string;
  amount: number; // 정렬·표시용 (기간 합계)
}

/** 대분류 목록 — 주어진 월들의 지출 합계 큰 순 (지출이 0 이하인 분류는 뒤로) */
export function mainOptions(rows: ExpenseItemRow[], owner: OwnerFilter, months?: string[]): MainOption[] {
  const inRange = months ? new Set(months) : null;
  const sum = new Map<string, number>();
  for (const r of rows) {
    if (!byOwner(owner)(r)) continue;
    if (!sum.has(r.main)) sum.set(r.main, 0);
    if (!inRange || inRange.has(r.ym)) sum.set(r.main, sum.get(r.main)! + r.amount);
  }
  return [...sum.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "ko"));
}

/* ---------------- 1. 지출 추이 ---------------- */

/** 월별 지출 합계 — mains 가 비어 있으면 전체 대분류. 그 달에 (선택한 사람의) 지출 데이터가 아예 없으면 null */
export function expenseTrend(rows: ExpenseItemRow[], owner: OwnerFilter, mains: string[], months: string[]): (number | null)[] {
  const pick = new Set(mains);
  const has = new Set<string>();
  const sum = new Map<string, number>();
  for (const r of rows) {
    if (!byOwner(owner)(r)) continue;
    has.add(r.ym);
    if (pick.size && !pick.has(r.main)) continue;
    sum.set(r.ym, (sum.get(r.ym) ?? 0) + r.amount);
  }
  return months.map((m) => (has.has(m) ? sum.get(m) ?? 0 : null));
}

/** 월 지출 합계 */
export function monthTotal(rows: ExpenseItemRow[], ym: string, owner: OwnerFilter): number {
  let s = 0;
  for (const r of rows) if (r.ym === ym && byOwner(owner)(r)) s += r.amount;
  return s;
}

/* ---------------- 2. 구성 비율 (트리맵) ---------------- */

export interface Slice {
  key: string;
  name: string; // 표시 이름 (대분류 또는 중분류)
  main: string;
  amount: number;
  share: number; // 양수 지출 합계 대비 비율
}

/**
 * 트리맵 칸 — level 단위 합계, 0 이하(환불이 더 큰 경우)는 제외
 * level = 'sub' 이고 main 을 주면 그 대분류의 중분류만
 */
export function composition(
  rows: ExpenseItemRow[],
  ym: string,
  owner: OwnerFilter,
  level: "main" | "sub",
  main: string | null = null,
): Slice[] {
  const acc = new Map<string, Slice>();
  for (const r of rows) {
    if (r.ym !== ym || !byOwner(owner)(r)) continue;
    if (level === "sub" && main && r.main !== main) continue;
    const key = keyOf(r, level);
    const cur = acc.get(key) ?? { key, name: level === "main" ? r.main : r.sub, main: r.main, amount: 0, share: 0 };
    cur.amount += r.amount;
    acc.set(key, cur);
  }
  const out = [...acc.values()].filter((s) => s.amount > 0).sort((a, b) => b.amount - a.amount);
  const total = out.reduce((s, x) => s + x.amount, 0);
  for (const s of out) s.share = total > 0 ? s.amount / total : 0;
  return out;
}

/* ---------------- 3. Top 지출 표 ---------------- */

export interface Compare {
  diff: number | null; // 이번 달(비교 가능한 사람만) − 비교 달
  pct: number | null; // diff ÷ 비교 달 (비교 달이 0 이하이면 null)
  isNew: boolean; // 비교 달에는 없던 분류·항목
}

export interface TopLine {
  key: string;
  main: string;
  sub: string | null;
  item: string | null;
  amount: number;
  share: number | null; // 그 달 지출 합계 대비
  mom: Compare | null; // null = 비교할 사람이 없음
  yoy: Compare | null;
}

export interface TopTable {
  lines: TopLine[]; // 상위 n개
  count: number; // 전체 행 수
  total: number; // 그 달 지출 합계
  excludedMom: OwnerId[]; // 전월 데이터가 없어 비교에서 빠진 사람
  excludedYoy: OwnerId[];
}

function sumByKey(rows: ExpenseItemRow[], ym: string, owners: Set<OwnerId>, level: ExpenseLevel, scope?: DrillScope): Map<string, number> {
  const out = new Map<string, number>();
  const ok = inScope(scope);
  for (const r of rows) {
    if (r.ym !== ym || !owners.has(r.owner) || !ok(r)) continue;
    const k = keyOf(r, level);
    out.set(k, (out.get(k) ?? 0) + r.amount);
  }
  return out;
}

function compareFor(
  rows: ExpenseItemRow[],
  ym: string,
  cmpYm: string,
  owner: OwnerFilter,
  level: ExpenseLevel,
  scope?: DrillScope,
): { common: Set<OwnerId>; cur: Map<string, number>; prev: Map<string, number>; excluded: OwnerId[] } {
  const now = ownersIn(rows, ym, owner);
  const then = ownersIn(rows, cmpYm, owner);
  const common = new Set([...now].filter((o) => then.has(o)));
  const excluded = [...now].filter((o) => !then.has(o));
  return { common, cur: sumByKey(rows, ym, common, level, scope), prev: sumByKey(rows, cmpYm, common, level, scope), excluded };
}

function makeCompare(key: string, cmp: ReturnType<typeof compareFor>): Compare | null {
  if (!cmp.common.size) return null;
  const cur = cmp.cur.get(key) ?? 0;
  const had = cmp.prev.has(key);
  if (!had) return { diff: cur === 0 ? null : cur, pct: null, isNew: cur !== 0 };
  const prev = cmp.prev.get(key)!;
  const diff = cur - prev;
  return { diff, pct: prev > 0 ? diff / prev : null, isNew: false };
}

/** Drill down 범위 — 대분류 또는 대분류>중분류 안으로 좁힘 */
export interface DrillScope {
  main?: string | null;
  sub?: string | null; // main 과 함께 사용
}

const inScope = (scope?: DrillScope) => (r: ExpenseItemRow) =>
  (!scope?.main || r.main === scope.main) && (!scope?.sub || r.sub === scope.sub);

/**
 * level 단위 지출 순위 — 지출 큰 순, 상위 n개
 * scope 를 주면 그 대분류(·중분류) 안에서만 순위·비중을 계산 (비교 대상 사람 판단은 전체 지출 기준)
 */
export function topTable(
  rows: ExpenseItemRow[],
  ym: string,
  owner: OwnerFilter,
  level: ExpenseLevel,
  n: number,
  scope?: DrillScope,
): TopTable {
  const acc = new Map<string, TopLine>();
  const ok = inScope(scope);
  let total = 0;
  for (const r of rows) {
    if (r.ym !== ym || !byOwner(owner)(r) || !ok(r)) continue;
    total += r.amount;
    const key = keyOf(r, level);
    const line =
      acc.get(key) ??
      ({
        key,
        main: r.main,
        sub: level === "main" ? null : r.sub,
        item: level === "item" ? r.item : null,
        amount: 0,
        share: null,
        mom: null,
        yoy: null,
      } satisfies TopLine);
    line.amount += r.amount;
    acc.set(key, line);
  }
  const all = [...acc.values()].sort((a, b) => b.amount - a.amount || a.key.localeCompare(b.key, "ko"));
  const lines = all.slice(0, Math.max(0, n));

  const mom = compareFor(rows, ym, shiftMonth(ym, -1), owner, level, scope);
  const yoy = compareFor(rows, ym, shiftMonth(ym, -12), owner, level, scope);
  for (const l of lines) {
    l.share = total > 0 ? l.amount / total : null;
    if (level !== "item") {
      l.mom = makeCompare(l.key, mom);
      l.yoy = makeCompare(l.key, yoy);
    }
  }
  return {
    lines,
    count: all.length,
    total,
    excludedMom: mom.common.size ? mom.excluded : [],
    excludedYoy: yoy.common.size ? yoy.excluded : [],
  };
}

/** 월 합계의 전월·전년 동월 비교 (같은 사람끼리) */
export function totalCompare(rows: ExpenseItemRow[], ym: string, owner: OwnerFilter, months: -1 | -12): Compare | null {
  const cmp = compareFor(rows, ym, shiftMonth(ym, months), owner, "main");
  if (!cmp.common.size) return null;
  const cur = [...cmp.cur.values()].reduce((s, v) => s + v, 0);
  const prev = [...cmp.prev.values()].reduce((s, v) => s + v, 0);
  return { diff: cur - prev, pct: prev > 0 ? (cur - prev) / prev : null, isNew: false };
}

/* ---------------- 4. 지출 증감 분해 (폭포) ---------------- */

export interface ChangeStep {
  label: string; // 대분류 이름 또는 '기타 n개'
  main: string | null; // 클릭 Drill down 용 (기타는 null)
  diff: number;
}

export interface ChangeBreakdown {
  start: number; // 전월 합계 (비교 가능한 사람만)
  end: number; // 이번 달 합계 (비교 가능한 사람만)
  steps: ChangeStep[]; // 증감이 큰 순 (절댓값)
  excluded: OwnerId[];
}

/** 전월 → 이번 달 지출 변화를 대분류별 기여로 나눔. 상위 topK 개 + 나머지 묶음 */
export function changeBreakdown(rows: ExpenseItemRow[], ym: string, owner: OwnerFilter, topK = 5): ChangeBreakdown | null {
  const cmp = compareFor(rows, ym, shiftMonth(ym, -1), owner, "main");
  if (!cmp.common.size) return null;
  const keys = new Set([...cmp.cur.keys(), ...cmp.prev.keys()]);
  const diffs = [...keys]
    .map((k) => ({ main: k, diff: (cmp.cur.get(k) ?? 0) - (cmp.prev.get(k) ?? 0) }))
    .filter((d) => d.diff !== 0)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.main.localeCompare(b.main, "ko"));
  const head: ChangeStep[] = diffs.slice(0, topK).map((d) => ({ label: d.main, main: d.main, diff: d.diff }));
  const rest = diffs.slice(topK);
  if (rest.length) head.push({ label: `기타 ${rest.length}개`, main: null, diff: rest.reduce((s, d) => s + d.diff, 0) });
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  return { start: sum(cmp.prev), end: sum(cmp.cur), steps: head, excluded: cmp.excluded };
}

/* ---------------- 5. 급증 알림 ---------------- */

export interface AlertRule {
  months: number; // 비교 기간 (직전 N개월 평균)
  minRatio: number; // 평균 대비 배수 (1.5 = +50%)
  minDiff: number; // 평균 대비 최소 증가액 (원)
  minBaseMonths: number; // 사람별로 이만큼 데이터가 있어야 비교
}

export const DEFAULT_ALERT_RULE: AlertRule = { months: 6, minRatio: 1.5, minDiff: 50_000, minBaseMonths: 3 };

export interface SpendAlert {
  level: "sub" | "item";
  key: string;
  main: string;
  sub: string;
  item: string | null;
  cur: number; // 이번 달 (비교 가능한 사람만)
  base: number; // 직전 N개월 월평균 (사람별 데이터가 있는 달 기준)
  diff: number;
  ratio: number | null; // cur ÷ base (평균이 0 이하이면 null = 새로 생긴 지출)
}

export interface AlertResult {
  alerts: SpendAlert[];
  skipped: OwnerId[]; // 직전 데이터가 부족해 빠진 사람
}

/**
 * 이번 달 중분류·항목 중 평소(직전 N개월 월평균)보다 크게 늘어난 것
 * - 평균은 사람별로 "그 사람 데이터가 있는 달"만으로 계산해 합산 → 늦게 합류한 사람 때문에 평균이 낮아지지 않음
 */
export function spendAlerts(rows: ExpenseItemRow[], ym: string, owner: OwnerFilter, rule: AlertRule = DEFAULT_ALERT_RULE): AlertResult {
  const window = Array.from({ length: rule.months }, (_, i) => shiftMonth(ym, -(i + 1)));
  const owners = [...ownersIn(rows, ym, owner)];
  const used: OwnerId[] = [];
  const skipped: OwnerId[] = [];
  const baseMonths = new Map<OwnerId, number>();
  for (const o of owners) {
    const n = window.filter((m) => rows.some((r) => r.ym === m && r.owner === o)).length;
    if (n >= rule.minBaseMonths) {
      used.push(o);
      baseMonths.set(o, n);
    } else skipped.push(o);
  }
  const inWindow = new Set(window);
  const out: SpendAlert[] = [];
  for (const level of ["sub", "item"] as const) {
    const cur = new Map<string, number>();
    const base = new Map<string, number>();
    const meta = new Map<string, ExpenseItemRow>();
    for (const r of rows) {
      if (!used.includes(r.owner)) continue;
      const k = keyOf(r, level);
      if (r.ym === ym) {
        cur.set(k, (cur.get(k) ?? 0) + r.amount);
        meta.set(k, r);
      } else if (inWindow.has(r.ym)) {
        base.set(k, (base.get(k) ?? 0) + r.amount / baseMonths.get(r.owner)!);
      }
    }
    for (const [k, c] of cur) {
      const b = base.get(k) ?? 0;
      const diff = c - b;
      if (diff < rule.minDiff) continue;
      if (b > 0 && c / b < rule.minRatio) continue;
      const m = meta.get(k)!;
      out.push({
        level,
        key: k,
        main: m.main,
        sub: m.sub,
        item: level === "item" ? m.item : null,
        cur: c,
        base: Math.round(b),
        diff: Math.round(diff),
        ratio: b > 0 ? c / b : null,
      });
    }
  }
  out.sort((a, b) => b.diff - a.diff);
  return { alerts: out, skipped };
}

/* ---------------- 6. 대분류 × 월 히트맵 ---------------- */

export interface HeatmapModel {
  mains: string[]; // 기간 합계 큰 순 (합계가 0 이하인 분류는 제외)
  months: string[];
  values: (number | null)[][]; // [main][month] — 그 달 데이터가 아예 없으면 null
}

export function expenseHeatmap(rows: ExpenseItemRow[], owner: OwnerFilter, months: string[]): HeatmapModel {
  const idx = new Map(months.map((m, i) => [m, i]));
  const has = new Set<string>();
  const sum = new Map<string, number[]>();
  for (const r of rows) {
    if (!byOwner(owner)(r)) continue;
    const i = idx.get(r.ym);
    if (i === undefined) continue;
    has.add(r.ym);
    if (!sum.has(r.main)) sum.set(r.main, months.map(() => 0));
    sum.get(r.main)![i] += r.amount;
  }
  const mains = [...sum.entries()]
    .map(([m, v]) => ({ m, t: v.reduce((a, b) => a + b, 0) }))
    .filter((x) => x.t > 0)
    .sort((a, b) => b.t - a.t)
    .map((x) => x.m);
  return { mains, months, values: mains.map((m) => sum.get(m)!.map((v, i) => (has.has(months[i]) ? v : null))) };
}
