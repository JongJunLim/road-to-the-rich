import type { InvestmentProductRow, OwnerFilter, OwnerId, Snapshot } from "./schema";
import { shiftMonth } from "./metrics";

/**
 * Investment 화면 계산 (종목별 원금 · 평가금 · 수익률)
 *
 * 규칙
 * - 수익률 = (평가금 − 원금) ÷ 원금 — 언제나 "합계로 다시 계산" (종목·사람 비율을 더하지 않음)
 * - Owner '전체'는 두 사람 합산. 트리맵은 같은 종목을 하나로 합침 (예: 두 사람 모두 엔비디아 보유)
 * - 전월·전년 동월 비교는 같은 사람·같은 종목끼리. 비교 달에 없던 종목은 "신규"
 * - 총계 비교는 두 달 모두 데이터가 있는 사람끼리만 (화면 1 전월 대비와 같은 규칙)
 */

/** 2025-01 ~ 2026-01 처럼 종목 구분 없이 합계 1행만 있는 달의 이름 (SQL과 동일) */
export const LEGACY_PRODUCT = "종목 합산 (구분 전)";

export interface Totals {
  principal: number;
  valuation: number;
  rate: number | null;
}

export function rateOf(principal: number, valuation: number): number | null {
  return principal > 0 ? (valuation - principal) / principal : null;
}

function totals(rows: { principal: number; valuation: number }[]): Totals {
  const principal = rows.reduce((a, r) => a + r.principal, 0);
  const valuation = rows.reduce((a, r) => a + r.valuation, 0);
  return { principal, valuation, rate: rateOf(principal, valuation) };
}

const ownerMatch = (owner: OwnerFilter) => (r: { owner: string }) => owner === "all" || r.owner === owner;

export function investRows(s: Snapshot): InvestmentProductRow[] {
  return s.investment_product ?? [];
}

export function hasInvestProducts(s: Snapshot): boolean {
  return investRows(s).length > 0;
}

/** 조회 가능한 월 (오름차순) */
export function investMonths(rows: InvestmentProductRow[]): string[] {
  return [...new Set(rows.map((r) => r.ym))].sort();
}

export interface ProductOption {
  name: string;
  latestYm: string; // 마지막으로 보유한 달
  latestValuation: number;
}

/**
 * 종목 필터 목록 — 선택한 owner 가 한 번이라도 보유한 종목만
 * 정렬: 최근까지 보유한 종목 먼저 → 그 달 평가금 큰 순 → 이름 (구분 전 합산은 맨 끝)
 */
export function productOptions(rows: InvestmentProductRow[], owner: OwnerFilter): ProductOption[] {
  const last = new Map<string, { ym: string; valuation: number }>();
  for (const r of rows.filter(ownerMatch(owner))) {
    const cur = last.get(r.product);
    if (!cur || r.ym > cur.ym) last.set(r.product, { ym: r.ym, valuation: r.valuation });
    else if (r.ym === cur.ym) cur.valuation += r.valuation;
  }
  return [...last.entries()]
    .map(([name, v]) => ({ name, latestYm: v.ym, latestValuation: v.valuation }))
    .sort((a, b) => {
      if ((a.name === LEGACY_PRODUCT) !== (b.name === LEGACY_PRODUCT)) return a.name === LEGACY_PRODUCT ? 1 : -1;
      if (a.latestYm !== b.latestYm) return a.latestYm < b.latestYm ? 1 : -1;
      if (a.latestValuation !== b.latestValuation) return b.latestValuation - a.latestValuation;
      return a.name.localeCompare(b.name, "ko");
    });
}

export interface TrendPoint {
  principal: number | null;
  valuation: number | null;
  rate: number | null;
}

/** 월별 추이 — products 가 비어 있으면 전체 종목 */
export function trendSeries(rows: InvestmentProductRow[], owner: OwnerFilter, products: string[], months: string[]): TrendPoint[] {
  const pick = new Set(products);
  const byYm = new Map<string, { principal: number; valuation: number }[]>();
  for (const r of rows) {
    if (!ownerMatch(owner)(r) || (pick.size && !pick.has(r.product))) continue;
    (byYm.get(r.ym) ?? byYm.set(r.ym, []).get(r.ym)!).push(r);
  }
  return months.map((m) => {
    const list = byYm.get(m);
    if (!list) return { principal: null, valuation: null, rate: null };
    const t = totals(list);
    return { principal: t.principal, valuation: t.valuation, rate: t.rate };
  });
}

export interface Holding extends Totals {
  product: string;
  share: number | null; // 평가금 구성 비율
  shareP: number | null; // 원금 구성 비율 (트리맵 크기를 원금으로 볼 때)
  profit: number; // 평가손익 = 평가금 − 원금
}

/** 트리맵용 — 선택 월 종목별 합계 (owner 합산 시 같은 종목은 하나로), 평가금 큰 순 */
export function holdingsAt(rows: InvestmentProductRow[], ym: string, owner: OwnerFilter): Holding[] {
  const map = new Map<string, { principal: number; valuation: number }[]>();
  for (const r of rows) {
    if (r.ym !== ym || !ownerMatch(owner)(r)) continue;
    (map.get(r.product) ?? map.set(r.product, []).get(r.product)!).push(r);
  }
  const list = [...map.entries()].map(([product, rs]) => ({ product, ...totals(rs) }));
  const totalV = list.reduce((a, h) => a + Math.max(0, h.valuation), 0);
  const totalP = list.reduce((a, h) => a + Math.max(0, h.principal), 0);
  return list
    .map((h) => ({
      ...h,
      share: totalV > 0 ? Math.max(0, h.valuation) / totalV : null,
      shareP: totalP > 0 ? Math.max(0, h.principal) / totalP : null,
      profit: h.valuation - h.principal,
    }))
    .sort((a, b) => b.valuation - a.valuation);
}

/* ------------------------------------------------------------------ */
/* 요약 KPI · 평가금 변동 분해                                            */
/* ------------------------------------------------------------------ */

/** 이번 달과 비교 달 모두 데이터가 있는 사람 (나머지는 비교에서 제외) */
function likeForLike(rows: InvestmentProductRow[], ym: string, prevYm: string, owner: OwnerFilter) {
  const owners = [...new Set(rows.filter((r) => r.ym === ym && ownerMatch(owner)(r)).map((r) => r.owner))];
  const has = (o: string, m: string) => rows.some((r) => r.ym === m && r.owner === o);
  return {
    included: owners.filter((o) => has(o, prevYm)) as OwnerId[],
    excluded: owners.filter((o) => !has(o, prevYm)) as OwnerId[],
  };
}

export interface Summary {
  cur: Totals & { profit: number };
  mom: { principal: number; valuation: number; profit: number; rate: number | null } | null; // 전월 대비 (같은 사람끼리)
  excluded: OwnerId[]; // 전월 데이터가 없어 비교에서 빠진 사람
}

export function investSummary(rows: InvestmentProductRow[], ym: string, owner: OwnerFilter): Summary {
  const prevYm = shiftMonth(ym, -1);
  const cur = totals(rows.filter((r) => r.ym === ym && ownerMatch(owner)(r)));
  const { included, excluded } = likeForLike(rows, ym, prevYm, owner);
  let mom: Summary["mom"] = null;
  if (included.length) {
    const c = totals(rows.filter((r) => r.ym === ym && included.includes(r.owner)));
    const p = totals(rows.filter((r) => r.ym === prevYm && included.includes(r.owner)));
    mom = {
      principal: c.principal - p.principal,
      valuation: c.valuation - p.valuation,
      profit: c.valuation - c.principal - (p.valuation - p.principal),
      rate: c.rate !== null && p.rate !== null ? c.rate - p.rate : null,
    };
  }
  return { cur: { ...cur, profit: cur.valuation - cur.principal }, mom, excluded };
}

export interface Flow {
  start: number; // 전월 평가금 (비교 대상 사람만)
  flow: number; // 추가 투자 (+매수 / −매도)
  market: number; // 시장 손익 (가격 변동)
  end: number; // 이번 달 평가금 (비교 대상 사람만)
  excluded: OwnerId[];
  movers: { product: string; market: number }[]; // 종목별 시장 손익 (큰 순)
}

/**
 * 평가금 변동 분해 — 이번 달 평가금 − 전월 평가금 = 추가 투자 + 시장 손익
 * 종목별로 계산 (같은 사람 · 같은 종목)
 *   계속 보유: 추가 투자 = 원금 변화, 시장 손익 = 평가금 변화 − 원금 변화
 *   신규 매수: 추가 투자 = 원금,      시장 손익 = 평가금 − 원금
 *   전량 매도: 추가 투자 = −전월 평가금 (전월 가격에 판 것으로 가정), 시장 손익 = 0
 * '종목 합산 (구분 전)'이 끼어 있는 사람은 종목을 맞출 수 없어 사람 합계로 계산
 */
export function flowBreakdown(rows: InvestmentProductRow[], ym: string, owner: OwnerFilter): Flow | null {
  const prevYm = shiftMonth(ym, -1);
  const { included, excluded } = likeForLike(rows, ym, prevYm, owner);
  if (!included.length) return null;

  let start = 0;
  let end = 0;
  let flow = 0;
  const market = new Map<string, number>();
  const addMarket = (product: string, v: number) => market.set(product, (market.get(product) ?? 0) + v);

  for (const o of included) {
    const cur = rows.filter((r) => r.ym === ym && r.owner === o);
    const prev = rows.filter((r) => r.ym === prevYm && r.owner === o);
    const c = totals(cur);
    const p = totals(prev);
    start += p.valuation;
    end += c.valuation;

    if ([...cur, ...prev].some((r) => r.product === LEGACY_PRODUCT)) {
      const f = c.principal - p.principal;
      flow += f;
      addMarket(LEGACY_PRODUCT, c.valuation - p.valuation - f);
      continue;
    }
    const sum = (list: InvestmentProductRow[]) => {
      const m = new Map<string, { principal: number; valuation: number }>();
      for (const r of list) {
        const x = m.get(r.product) ?? { principal: 0, valuation: 0 };
        x.principal += r.principal;
        x.valuation += r.valuation;
        m.set(r.product, x);
      }
      return m;
    };
    const cm = sum(cur);
    const pm = sum(prev);
    for (const name of new Set([...cm.keys(), ...pm.keys()])) {
      const a = cm.get(name);
      const b = pm.get(name);
      if (a && b) {
        const f = a.principal - b.principal;
        flow += f;
        addMarket(name, a.valuation - b.valuation - f);
      } else if (a) {
        flow += a.principal;
        addMarket(name, a.valuation - a.principal);
      } else if (b) {
        flow -= b.valuation;
      }
    }
  }
  const movers = [...market.entries()]
    .map(([product, v]) => ({ product, market: v }))
    .filter((m) => m.market !== 0)
    .sort((a, b) => b.market - a.market);
  return { start, flow, market: end - start - flow, end, excluded, movers };
}

/* ------------------------------------------------------------------ */
/* 표 (소유자 → 종목, 소계 · 총계, 전월 · 전년 동월 비교)                  */
/* ------------------------------------------------------------------ */

export interface Compare {
  principal: number | null; // 차이 (원)
  valuation: number | null;
  rate: number | null; // 차이 (%p, 0.05 = 5%p)
  isNew: boolean; // 비교 달에 그 사람은 있었지만 이 종목은 없었음
}

export interface TableLine extends Totals {
  owner: OwnerId | null; // 총계는 null
  product: string | null; // 소계·총계는 null
  mom: Compare;
  yoy: Compare;
  excludedMom?: OwnerId[]; // 총계 전월 비교에서 빠진 사람 (전월 데이터 없음)
  excludedYoy?: OwnerId[]; // 총계 전년 동월 비교에서 빠진 사람
}

export interface TableGroup {
  owner: OwnerId;
  lines: TableLine[];
  subtotal: TableLine;
}

export interface InvestTable {
  groups: TableGroup[];
  total: TableLine | null; // 그룹이 2개 이상일 때만
}

const EMPTY: Compare = { principal: null, valuation: null, rate: null, isNew: false };

function compare(cur: Totals, prev: Totals | null, isNew = false): Compare {
  if (!prev) return { ...EMPTY, isNew };
  return {
    principal: cur.principal - prev.principal,
    valuation: cur.valuation - prev.valuation,
    rate: cur.rate !== null && prev.rate !== null ? cur.rate - prev.rate : null,
    isNew: false,
  };
}

export type TableSortKey = "product" | "principal" | "valuation" | "rate";

export function investTable(
  rows: InvestmentProductRow[],
  ym: string,
  owner: OwnerFilter,
  ownerOrder: OwnerId[],
  sort: { key: TableSortKey; dir: "asc" | "desc" } = { key: "rate", dir: "desc" },
): InvestTable {
  const momYm = shiftMonth(ym, -1);
  const yoyYm = shiftMonth(ym, -12);
  const at = (m: string, o: OwnerId) => rows.filter((r) => r.ym === m && r.owner === o);

  const groups: TableGroup[] = [];
  for (const o of ownerOrder) {
    if (owner !== "all" && owner !== o) continue;
    const cur = at(ym, o);
    if (!cur.length) continue;
    const prevM = at(momYm, o);
    const prevY = at(yoyYm, o);

    const byProduct = (list: InvestmentProductRow[]) => {
      const m = new Map<string, InvestmentProductRow[]>();
      for (const r of list) (m.get(r.product) ?? m.set(r.product, []).get(r.product)!).push(r);
      return m;
    };
    const curP = byProduct(cur);
    const momP = byProduct(prevM);
    const yoyP = byProduct(prevY);

    const lines: TableLine[] = [...curP.entries()].map(([product, rs]) => {
      const t = totals(rs);
      const pm = momP.get(product);
      const py = yoyP.get(product);
      return {
        owner: o,
        product,
        ...t,
        mom: compare(t, pm ? totals(pm) : null, !pm && prevM.length > 0),
        yoy: compare(t, py ? totals(py) : null, !py && prevY.length > 0),
      };
    });
    lines.sort((a, b) => sortLines(a, b, sort));

    const sub = totals(cur);
    groups.push({
      owner: o,
      lines,
      subtotal: {
        owner: o,
        product: null,
        ...sub,
        mom: compare(sub, prevM.length ? totals(prevM) : null),
        yoy: compare(sub, prevY.length ? totals(prevY) : null),
      },
    });
  }

  if (groups.length < 2) return { groups, total: null };

  // 총계 비교: 두 달 모두 데이터가 있는 사람끼리만
  const all = totals(groups.flatMap((g) => g.lines));
  const likeFor = (m: string) => {
    const incl = groups.filter((g) => at(m, g.owner).length > 0);
    if (!incl.length) return { cmp: EMPTY, excluded: groups.map((g) => g.owner) };
    const cur = totals(incl.flatMap((g) => at(ym, g.owner)));
    const prev = totals(incl.flatMap((g) => at(m, g.owner)));
    return { cmp: compare(cur, prev), excluded: groups.filter((g) => !incl.includes(g)).map((g) => g.owner) };
  };
  const mom = likeFor(momYm);
  const yoy = likeFor(yoyYm);
  return {
    groups,
    total: {
      owner: null,
      product: null,
      ...all,
      mom: mom.cmp,
      yoy: yoy.cmp,
      excludedMom: mom.excluded,
      excludedYoy: yoy.excluded,
    },
  };
}

function sortLines(a: TableLine, b: TableLine, sort: { key: TableSortKey; dir: "asc" | "desc" }): number {
  const sign = sort.dir === "asc" ? 1 : -1;
  if (sort.key === "product") return sign * (a.product ?? "").localeCompare(b.product ?? "", "ko");
  const va = a[sort.key];
  const vb = b[sort.key];
  if (va === null && vb === null) return 0;
  if (va === null) return 1; // 값 없는 행은 항상 뒤로
  if (vb === null) return -1;
  return sign * (va - vb);
}
