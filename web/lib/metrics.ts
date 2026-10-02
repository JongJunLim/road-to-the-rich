/**
 * KPI 계산 — 순수 함수만 (화면·데이터 로딩과 분리해서 테스트하기 쉽게)
 * 정의는 "Road To The Rich 대시보드 KPI 정의서"를 따른다.
 */
import type { AssetRow, InvestmentRow, LedgerKind, LedgerRow, OwnerFilter, OwnerId, Snapshot } from "./schema";

type NumericKeys<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T];

/* ---------- 월 유틸 ---------- */

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** end 를 포함해 과거 n개월 (오래된 순) */
export function monthsEndingAt(end: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftMonth(end, i - (n - 1)));
}

export function monthsBetween(start: string, end: string): number {
  const [y1, m1] = start.split("-").map(Number);
  const [y2, m2] = end.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

/* ---------- Owner 필터 + 월 합산 ---------- */

export function byMonth<T extends { ym: string; owner: string }>(
  rows: T[],
  owner: OwnerFilter,
  keys: NumericKeys<T>[],
): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  for (const r of rows) {
    if (owner !== "all" && r.owner !== owner) continue;
    const acc = out.get(r.ym) ?? Object.fromEntries(keys.map((k) => [k, 0]));
    for (const k of keys) acc[k as string] += r[k] as number;
    out.set(r.ym, acc);
  }
  return out;
}

export interface Delta {
  current: number | null;
  previous: number | null;
  diff: number | null;
  /** 이번 달엔 있지만 전월 데이터가 없어 비교에서 뺀 사람 (예: 데이터 적재를 막 시작한 경우) */
  excluded: OwnerId[];
}

type Series = Map<string, Record<string, number>>;

/**
 * 같은 사람끼리만 비교하는 전월 대비 (like-for-like)
 *
 * 한 사람의 데이터가 이번 달부터 들어오기 시작하면, 단순 합계 비교는
 * "그 사람의 자산 전체"를 증가분으로 보여주는 착시가 생긴다.
 * → 전월과 이번 달 모두 데이터가 있는 사람만 증감에 포함하고, 빠진 사람은 excluded 로 알려준다.
 */
export function likeForLikeDelta(perOwner: Map<OwnerId, Series>, ym: string, key: string): Delta {
  const prevYm = shiftMonth(ym, -1);
  let current: number | null = null;
  let previous: number | null = null;
  let diff: number | null = null;
  const excluded: OwnerId[] = [];
  for (const [owner, series] of perOwner) {
    const cur = series.get(ym)?.[key];
    const prev = series.get(prevYm)?.[key];
    if (cur === undefined) continue;
    current = (current ?? 0) + cur;
    if (prev === undefined) {
      excluded.push(owner);
      continue;
    }
    previous = (previous ?? 0) + prev;
    diff = (diff ?? 0) + (cur - prev);
  }
  return { current, previous, diff, excluded: diff === null ? [] : excluded };
}

/** 사람별 데이터 시작 월 — '전체' 추이에 늦게 합류한 사람이 있으면 화면에 안내하기 위함 */
export interface OwnerCoverage {
  owner: OwnerId;
  asset: string | null;
  investment: string | null;
  ledger: string | null;
}

export function ownerCoverage(s: Snapshot): OwnerCoverage[] {
  const first = (rows: { ym: string; owner: string }[], o: string) =>
    rows.filter((r) => r.owner === o).reduce<string | null>((m, r) => (m === null || r.ym < m ? r.ym : m), null);
  return s.owners.map((o) => ({
    owner: o.id,
    asset: first(s.asset, o.id),
    investment: first(s.investment, o.id),
    ledger: first(s.ledger, o.id),
  }));
}

/** 다른 사람보다 늦게 데이터가 시작된 사람만 추림 */
export function lateJoiners(coverage: OwnerCoverage[]): OwnerCoverage[] {
  const keys = ["asset", "investment", "ledger"] as const;
  const earliest = Object.fromEntries(
    keys.map((k) => [k, coverage.map((c) => c[k]).filter(Boolean).sort()[0] ?? null]),
  ) as Record<(typeof keys)[number], string | null>;
  return coverage.filter((c) => keys.some((k) => c[k] !== null && earliest[k] !== null && c[k]! > earliest[k]!));
}

/* ---------- 가계부 카테고리 필터 ---------- */

/**
 * 필터 그룹: 수입 / 지출 / 이체 (이체(수입)·이체(지출)은 같은 category_main 을 공유하므로 한 그룹)
 * 선택 키 형식: "그룹|카테고리"  예) "income|급여"
 *
 * 규칙: 그룹 안에서 하나라도 선택하면 그 카테고리만, 아무것도 선택하지 않으면 그 그룹 전체.
 *   → 기본값 [급여, 상여금] 이면 수입 = 급여+상여금, 지출·이체 = 전체
 */
export type CategoryGroup = "income" | "expense" | "transfer";

export const CATEGORY_GROUPS: { id: CategoryGroup; label: string }[] = [
  { id: "income", label: "수입" },
  { id: "expense", label: "지출" },
  { id: "transfer", label: "이체" },
];

export const DEFAULT_CATEGORY_KEYS = ["income|급여", "income|상여금"];

export function groupOf(kind: LedgerKind): CategoryGroup {
  return kind === "transfer_in" || kind === "transfer_out" ? "transfer" : kind;
}

export const categoryKey = (group: CategoryGroup, category: string) => `${group}|${category}`;

export interface CategoryOption {
  key: string;
  group: CategoryGroup;
  category: string;
  total: number; // 정렬용 (전체 기간 합계)
}

/** 필터 선택지 — 그룹별로 금액이 큰 순 */
export function categoryOptions(rows: LedgerRow[]): CategoryOption[] {
  const acc = new Map<string, CategoryOption>();
  for (const r of rows) {
    const group = groupOf(r.kind);
    const key = categoryKey(group, r.category);
    const o = acc.get(key) ?? { key, group, category: r.category, total: 0 };
    o.total += r.amount;
    acc.set(key, o);
  }
  const order = CATEGORY_GROUPS.map((g) => g.id);
  return [...acc.values()].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || b.total - a.total);
}

/** 존재하는 키만 남김 (데이터에 없는 기본값이 조용히 '전체'로 바뀌지 않도록 호출부에서 확인용) */
export function sanitizeCategoryKeys(keys: string[], options: CategoryOption[]): string[] {
  const valid = new Set(options.map((o) => o.key));
  return keys.filter((k) => valid.has(k));
}

export function ledgerByMonth(
  rows: LedgerRow[],
  owner: OwnerFilter,
  selectedKeys: string[],
): Map<string, Record<string, number>> {
  const selected = new Set(selectedKeys);
  const restricted = new Set(selectedKeys.map((k) => k.split("|")[0])); // 선택이 있는 그룹
  const out = new Map<string, Record<string, number>>();
  for (const r of rows) {
    if (owner !== "all" && r.owner !== owner) continue;
    // 가계부가 있는 달은 필터 결과가 비어도 0으로 남긴다 (예: 상여금이 없는 달 → 0원, '데이터 없음'과 구분)
    const acc = out.get(r.ym) ?? { income: 0, expense: 0, transfer_in: 0, transfer_out: 0 };
    out.set(r.ym, acc);
    const group = groupOf(r.kind);
    if (restricted.has(group) && !selected.has(categoryKey(group, r.category))) continue;
    acc[r.kind] += r.amount;
  }
  return out;
}

/* ---------- 화면 모델 ---------- */

export interface DashboardModel {
  ym: string;
  ledgerYm: string | null; // 가계부 기준월 (조회월에 데이터가 없으면 가장 최근 월로 대체)
  asset: Delta;
  investment: { valuation: number | null; principal: number | null; profit: number | null; rate: number | null };
  income: Delta;
  expense: Delta;
  assetSeries: Map<string, Record<string, number>>;
  investmentSeries: Map<string, Record<string, number>>;
  ledgerSeries: Map<string, Record<string, number>>;
}

export function buildModel(s: Snapshot, ym: string, owner: OwnerFilter, categoryKeys: string[] = []): DashboardModel {
  // 전월 대비는 사람별로 계산해서 합친다 (like-for-like)
  const allOwners = [...new Set<OwnerId>([...s.owners.map((o) => o.id), ...[...s.asset, ...s.investment, ...s.ledger].map((r) => r.owner)])];
  const ownerIds: OwnerId[] = owner === "all" ? allOwners : [owner];
  const perOwner = (fn: (o: OwnerId) => Series) =>
    new Map(ownerIds.map((o) => [o, fn(o)] as const));
  const assetByOwner = perOwner((o) => byMonth<AssetRow>(s.asset, o, ["asset"]));
  const ledgerByOwner = perOwner((o) => ledgerByMonth(s.ledger, o, categoryKeys));

  const assetSeries = byMonth<AssetRow>(s.asset, owner, ["asset"]);
  const investmentSeries = byMonth<InvestmentRow>(s.investment, owner, ["principal", "valuation"]);
  const ledgerSeries = ledgerByMonth(s.ledger, owner, categoryKeys);

  // KPI 정의서 주석: "Income/Expense는 조회일 기준 전월이 최대값"
  // → 조회월에 가계부가 없으면 0 대신 그 이전의 가장 최근 월을 보여주고 화면에 기준월을 표시
  const ledgerMonths = [...ledgerSeries.keys()].filter((m) => m <= ym).sort();
  const ledgerYm = ledgerSeries.has(ym) ? ym : ledgerMonths.at(-1) ?? null;

  const inv = investmentSeries.get(ym);
  const valuation = inv?.valuation ?? null;
  const principal = inv?.principal ?? null;
  const profit = valuation !== null && principal !== null ? valuation - principal : null;
  // 수익률은 합계로 다시 계산 (두 사람의 비율을 더하면 틀림)
  const rate = profit !== null && principal ? profit / principal : null;

  const empty: Delta = { current: null, previous: null, diff: null, excluded: [] };
  return {
    ym,
    ledgerYm,
    asset: likeForLikeDelta(assetByOwner, ym, "asset"),
    investment: { valuation, principal, profit, rate },
    income: ledgerYm ? likeForLikeDelta(ledgerByOwner, ledgerYm, "income") : empty,
    expense: ledgerYm ? likeForLikeDelta(ledgerByOwner, ledgerYm, "expense") : empty,
    assetSeries,
    investmentSeries,
    ledgerSeries,
  };
}

/** 선택 가능한 월 목록 (자산·투자·가계부 중 어느 하나라도 있는 월) */
export function availableMonths(s: Snapshot): string[] {
  const set = new Set<string>();
  for (const r of [...s.asset, ...s.investment]) set.add(r.ym);
  return [...set].sort();
}
