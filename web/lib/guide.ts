/**
 * Data Guide 화면 계산 — 데이터 상태 · 결제수단 매핑표 · 카드별 지출 · 품질 체크
 * (화면에 보이는 것은 모두 스냅샷에서 계산 — BigQuery 를 직접 조회하지 않음)
 */
import type { OwnerFilter, OwnerId, PaymentExpenseRow, PaymentGroup, PaymentMethodRow, Snapshot } from "./schema";
import { shiftMonth } from "./metrics";

export const GROUP_ORDER: PaymentGroup[] = ["Unmapped", "Credit", "Debit", "Account", "Cash", "Etc"];

export const GROUP_LABEL: Record<PaymentGroup, string> = {
  Credit: "신용카드",
  Debit: "체크카드",
  Account: "계좌",
  Cash: "현금성",
  Etc: "간편결제·기타",
  Unmapped: "미분류 (매핑 필요)",
};

export const GROUP_HINT: Record<PaymentGroup, string> = {
  Credit: "연말정산 신용카드 공제 (15%)",
  Debit: "연말정산 체크카드·현금 공제 (30%)",
  Account: "이체·자동이체에 쓰이는 통장",
  Cash: "현금·보증금처럼 현금성 자산",
  Etc: "간편결제·머니 — 신용/체크가 섞여 한쪽으로 분류 불가",
  Unmapped: "매핑 테이블에 없는 새 결제수단",
};

/* ---------------- 날짜 도우미 ---------------- */

const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const daysBetween = (a: string, b: string) => Math.round((day(b) - day(a)) / 86_400_000);

/* ---------------- ① 데이터 상태 ---------------- */

export interface StatusRow {
  key: string;
  label: string; // 데이터 이름
  screen: string; // 쓰이는 화면
  latest: string | null; // 최신 시점 (YYYY-MM / YYYY / YYYY-MM-DD)
  starts: Partial<Record<OwnerId, string>>; // 사람별 시작 시점
  note?: string;
}

const maxOf = (xs: string[]) => (xs.length ? xs.reduce((a, b) => (b > a ? b : a)) : null);

function startsBy<T extends { owner: OwnerId }>(rows: T[], at: (r: T) => string): Partial<Record<OwnerId, string>> {
  const out: Partial<Record<OwnerId, string>> = {};
  for (const r of rows) {
    const v = at(r);
    if (!out[r.owner] || v < out[r.owner]!) out[r.owner] = v;
  }
  return out;
}

export function dataStatus(s: Snapshot): StatusRow[] {
  const ym = (r: { ym: string }) => r.ym;
  const pay = (s.year_end_monthly ?? []).filter((r) => r.metric === "gross");
  const pm = s.payment_method ?? [];
  return [
    { key: "ledger", label: "가계부 (수입·지출·이체)", screen: "Road To The Rich", latest: maxOf(s.ledger.map(ym)), starts: startsBy(s.ledger, ym) },
    { key: "asset", label: "자산", screen: "Road To The Rich", latest: maxOf(s.asset.map(ym)), starts: startsBy(s.asset, ym) },
    { key: "investment", label: "투자 (합계)", screen: "Road To The Rich", latest: maxOf(s.investment.map(ym)), starts: startsBy(s.investment, ym) },
    {
      key: "investment_product",
      label: "투자 (종목별)",
      screen: "Investment",
      latest: maxOf((s.investment_product ?? []).map(ym)),
      starts: startsBy(s.investment_product ?? [], ym),
    },
    {
      key: "expense_item",
      label: "지출 (항목별)",
      screen: "Expense Analysis",
      latest: maxOf((s.expense_item ?? []).map(ym)),
      starts: startsBy(s.expense_item ?? [], ym),
      note: "2025-01 이전은 월 합계만",
    },
    {
      key: "pay_slip",
      label: "급여명세서",
      screen: "Year End Tax Settlement",
      latest: maxOf(pay.map((r) => `${r.year}-${String(r.month).padStart(2, "0")}`)),
      starts: startsBy(pay, (r) => `${r.year}-${String(r.month).padStart(2, "0")}`),
    },
    {
      key: "withholding",
      label: "원천징수영수증",
      screen: "Year End Tax Settlement",
      latest: maxOf((s.year_end_annual ?? []).map((r) => String(r.year))),
      starts: startsBy(s.year_end_annual ?? [], (r) => String(r.year)),
      note: "연 1회 (연말정산 후 2~3월)",
    },
    {
      key: "payment_method",
      label: "결제수단 사용 기록",
      screen: "Data Guide",
      latest: maxOf(pm.map((r) => r.last_date)),
      starts: startsBy(pm, (r) => r.first_date.slice(0, 7)),
      note: "2025-02 부터 기록",
    },
  ];
}

/* ---------------- ③ 결제수단 매핑표 ---------------- */

export type PmStatus = "new" | "dormant" | "active";

export interface PmUse {
  n: number;
  nExpense: number;
  first: string;
  last: string;
}

export interface PmLine {
  pm: string;
  group: PaymentGroup;
  byOwner: Partial<Record<OwnerId, PmUse>>;
  n: number;
  first: string;
  last: string;
  status: PmStatus;
}

export interface PmMatrix {
  ref: string | null; // 기준일 = 기록상 가장 최근 거래일
  groups: { group: PaymentGroup; lines: PmLine[] }[];
  unmapped: PmLine[];
  count: number;
}

export const NEW_DAYS = 60; // 처음 쓴 날이 기준일로부터 이 기간 안이면 '신규'
export const DORMANT_DAYS = 180; // 마지막 사용이 이보다 오래되면 '휴면'

/** 결제수단 × 사람 사용 현황 — owner 를 고르면 그 사람이 쓴 결제수단만 */
export function pmMatrix(rows: PaymentMethodRow[], owner: OwnerFilter): PmMatrix {
  const ref = maxOf(rows.map((r) => r.last_date));
  const acc = new Map<string, PmLine>();
  for (const r of rows) {
    if (owner !== "all" && r.owner !== owner) continue;
    const line =
      acc.get(r.pm) ?? ({ pm: r.pm, group: r.group, byOwner: {}, n: 0, first: r.first_date, last: r.last_date, status: "active" } as PmLine);
    line.byOwner[r.owner] = { n: r.n, nExpense: r.n_expense, first: r.first_date, last: r.last_date };
    line.n += r.n;
    if (r.first_date < line.first) line.first = r.first_date;
    if (r.last_date > line.last) line.last = r.last_date;
    acc.set(r.pm, line);
  }
  const lines = [...acc.values()];
  for (const l of lines) {
    l.status = !ref ? "active" : daysBetween(l.first, ref) <= NEW_DAYS ? "new" : daysBetween(l.last, ref) > DORMANT_DAYS ? "dormant" : "active";
  }
  const groups = GROUP_ORDER.filter((g) => g !== "Unmapped")
    .map((group) => ({
      group,
      lines: lines.filter((l) => l.group === group).sort((a, b) => (a.status === "dormant" ? 1 : 0) - (b.status === "dormant" ? 1 : 0) || b.n - a.n),
    }))
    .filter((g) => g.lines.length);
  return { ref, groups, unmapped: lines.filter((l) => l.group === "Unmapped").sort((a, b) => b.n - a.n), count: lines.length };
}

/* ---------------- ④ 카드별 지출 ---------------- */

export interface CardLine {
  pm: string;
  group: PaymentGroup;
  amount: number;
  byOwner: Partial<Record<OwnerId, number>>;
}

export interface CardSpend {
  months: string[]; // 대상 월 (최근 N개월)
  lines: CardLine[]; // 신용·체크 카드, 지출 큰 순
  byGroup: Record<PaymentGroup, number>;
  creditShare: number | null; // 신용 ÷ (신용 + 체크)
}

/** 결제수단별 지출 — 기록상 마지막 달부터 최근 n개월 */
export function cardSpend(rows: PaymentExpenseRow[], owner: OwnerFilter, n = 3): CardSpend {
  const last = maxOf(rows.map((r) => r.ym));
  const months = last ? Array.from({ length: n }, (_, i) => shiftMonth(last, i - n + 1)) : [];
  const inRange = new Set(months);
  const byGroup = Object.fromEntries(GROUP_ORDER.map((g) => [g, 0])) as Record<PaymentGroup, number>;
  const acc = new Map<string, CardLine>();
  for (const r of rows) {
    if (!inRange.has(r.ym) || (owner !== "all" && r.owner !== owner)) continue;
    byGroup[r.group] += r.amount;
    if (r.group !== "Credit" && r.group !== "Debit") continue;
    const line = acc.get(r.pm) ?? { pm: r.pm, group: r.group, amount: 0, byOwner: {} };
    line.amount += r.amount;
    line.byOwner[r.owner] = (line.byOwner[r.owner] ?? 0) + r.amount;
    acc.set(r.pm, line);
  }
  const card = byGroup.Credit + byGroup.Debit;
  return {
    months,
    lines: [...acc.values()].filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount),
    byGroup,
    creditShare: card > 0 ? byGroup.Credit / card : null,
  };
}

/* ---------------- ⑤ 데이터 품질 체크 ---------------- */

export type CheckLevel = "ok" | "warn" | "info";

export interface QualityCheck {
  key: string;
  level: CheckLevel;
  title: string;
  detail: string;
}

export const STALE_DAYS = 45; // 데이터 기준일이 이보다 오래되면 갱신 필요

export function qualityChecks(s: Snapshot, today: string, demo = false): QualityCheck[] {
  const out: QualityCheck[] = [];

  const updated = s.data_updated_at?.slice(0, 10) ?? null;
  if (updated) {
    const age = daysBetween(updated, today);
    out.push(
      demo
        ? { key: "stale", level: "info", title: "데모 데이터 (고정된 합성 스냅샷)", detail: `데이터 기준일 ${updated} — 실제 운영에서는 ${STALE_DAYS}일이 지나면 갱신 알림이 떠요.` }
        : age > STALE_DAYS
        ? { key: "stale", level: "warn", title: `데이터가 ${age}일 전 기준이에요`, detail: "뱅크샐러드 내보내기 → ETL → rttr-publish 순서로 갱신하세요 (아래 ⑦)." }
        : { key: "stale", level: "ok", title: "데이터가 최신이에요", detail: `데이터 기준일 ${updated} (${age}일 전)` },
    );
  }

  const missing = (
    [
      ["investment_product", "Investment 종목별"],
      ["expense_item", "Expense Analysis 항목별 지출"],
      ["payment_method", "Data Guide 결제수단"],
    ] as const
  ).filter(([k]) => !s[k]);
  out.push(
    missing.length
      ? { key: "sections", level: "warn", title: `스냅샷에 없는 데이터 ${missing.length}개`, detail: `${missing.map((m) => m[1]).join(", ")} — 새 버전 rttr-publish 를 배포·실행하세요.` }
      : { key: "sections", level: "ok", title: "모든 화면의 데이터가 스냅샷에 있어요", detail: "화면 4개 + Data Guide" },
  );

  const pm = s.payment_method ?? [];
  if (s.payment_method) {
    const un = [...new Set(pm.filter((r) => r.group === "Unmapped").map((r) => r.pm))];
    out.push(
      un.length
        ? { key: "unmapped", level: "warn", title: `매핑되지 않은 결제수단 ${un.length}개`, detail: `${un.join(", ")} — 매핑 테이블에 추가하세요 (③ 안내).` }
        : { key: "unmapped", level: "ok", title: "모든 결제수단이 매핑되어 있어요", detail: `${new Set(pm.map((r) => r.pm)).size}개 결제수단` },
    );
  }

  const ex = s.expense_item ?? [];
  if (ex.length) {
    const last = maxOf(ex.map((r) => r.ym))!;
    const recent = new Set([0, 1, 2].map((i) => shiftMonth(last, -i)));
    const uncategorized = ex.filter((r) => recent.has(r.ym) && (r.main === "미분류" || r.sub === "미분류"));
    const amt = uncategorized.reduce((a, r) => a + r.amount, 0);
    out.push(
      uncategorized.length
        ? {
            key: "uncategorized",
            level: "info",
            title: `분류가 '미분류'인 지출 ${uncategorized.length}건`,
            detail: `최근 3개월 ${Math.round(amt).toLocaleString("ko-KR")}원 — 뱅크샐러드 앱에서 카테고리를 지정하면 다음 갱신 때 반영돼요.`,
          }
        : { key: "uncategorized", level: "ok", title: "최근 3개월 지출이 모두 분류되어 있어요", detail: "대분류·중분류 '미분류' 0건" },
    );
    const negative = ex.filter((r) => r.ym === last && r.amount < 0);
    out.push(
      negative.length
        ? {
            key: "refund",
            level: "info",
            title: `${Number(last.slice(5))}월 환불이 구매보다 큰 항목 ${negative.length}개`,
            detail: "지난달 산 물건을 이번 달에 환불한 경우예요. Expense Analysis 표에 음수(−)로 보여요.",
          }
        : { key: "refund", level: "ok", title: "환불로 음수가 된 항목이 없어요", detail: `${Number(last.slice(5))}월 기준` },
    );
  }
  return out;
}
