/**
 * 📌 데이터 계약 v3 — 파이프라인(Python)과 웹앱(TS)이 공유하는 유일한 약속
 *
 * v2 변경: ledger 를 '월 × owner × 구분(kind) × 대분류(category)' 행으로 세분화 (카테고리 필터용)
 * v3 변경: 화면 2(Year End Tax Settlement)용 year_end_monthly / year_end_annual 추가
 *          → 두 섹션은 선택 항목이라 v2 스냅샷도 그대로 읽힘 (웹을 먼저 배포해도 화면 1은 정상)
 *
 * - 생성: pipeline/export_snapshot.py (실데이터), pipeline/generate_demo.py (데모)
 * - 모든 금액은 원 단위 정수, 월은 'YYYY-MM'
 * - 비율(수익률 등)은 담지 않는다 → Owner 합산 후 웹앱에서 계산해야 정확하기 때문
 * - 스키마를 바꾸면 version을 올리고 양쪽을 함께 수정한다
 */

export type OwnerId = "bbang" | "bbyak";
export type OwnerFilter = OwnerId | "all";

export interface OwnerInfo {
  id: OwnerId;
  label: string;
}

export interface AssetRow {
  ym: string;
  owner: OwnerId;
  asset: number;
}

export interface InvestmentRow {
  ym: string;
  owner: OwnerId;
  principal: number;
  valuation: number;
}

export type LedgerKind = "income" | "expense" | "transfer_in" | "transfer_out";

export interface LedgerRow {
  ym: string;
  owner: OwnerId;
  kind: LedgerKind;
  category: string; // 원천 category_main (빈 값은 '미분류')
  amount: number; // 모든 kind 에서 양수 (지출·이체(지출)은 부호를 뒤집어 저장)
}

/** 화면 2 월별 지표 (원 단위, 양수) */
// card_legacy: 2021-08 ~ 2025-01 결제수단 정보가 없는 카드 지출 (카드 합계·추이에만 포함)
export type YearEndMetric = "gross" | "tax_paid" | "net" | "credit" | "debit" | "card_legacy";

export interface YearEndMonthlyRow {
  year: number; // 귀속연도 (급여는 fiscal_year, 가계부는 거래일 — 1월 상여금은 전년도)
  month: number; // 1~12
  owner: OwnerId;
  metric: YearEndMetric;
  amount: number;
}

/** 화면 2 연도별 원천징수영수증 요약 (연말정산이 끝난 해만 존재) */
export interface YearEndAnnualRow {
  year: number;
  owner: OwnerId;
  gross_pay: number;
  tax_paid: number;
  income_deduction: number;
  tax_base: number;
  calculated_tax: number;
  tax_reduction: number;
  tax_credit: number;
  determined_tax: number;
  refund_or_additional: number; // 양수 = 추가 징수, 음수 = 환급
}

export interface Snapshot {
  version: 2 | 3;
  source: "banksalad" | "demo";
  generated_at: string;
  data_updated_at: string | null;
  owners: OwnerInfo[];
  asset: AssetRow[];
  investment: InvestmentRow[];
  ledger: LedgerRow[];
  year_end_monthly?: YearEndMonthlyRow[];
  year_end_annual?: YearEndAnnualRow[];
}

/** 런타임 최소 검증 — 계약이 깨진 JSON이 화면까지 가지 않게 */
export function assertSnapshot(x: unknown): asserts x is Snapshot {
  const s = x as Partial<Snapshot> | null;
  if (!s || (s.version !== 2 && s.version !== 3))
    throw new Error("snapshot: 지원하지 않는 버전입니다 (2·3만 지원). 파이프라인과 웹앱 버전을 맞춰 주세요.");
  for (const key of ["asset", "investment", "ledger", "owners"] as const) {
    if (!Array.isArray(s[key])) throw new Error(`snapshot: '${key}' 배열이 없습니다.`);
  }
  const bad = [...s.asset!, ...s.investment!, ...s.ledger!].find(
    (r) => typeof r.ym !== "string" || !/^\d{4}-\d{2}$/.test(r.ym),
  );
  if (bad) throw new Error(`snapshot: 잘못된 월 형식 ${JSON.stringify(bad)}`);
  const kinds = new Set(["income", "expense", "transfer_in", "transfer_out"]);
  const badKind = s.ledger!.find((r) => !kinds.has(r.kind));
  if (badKind) throw new Error(`snapshot: 알 수 없는 ledger kind ${JSON.stringify(badKind)}`);

  for (const key of ["year_end_monthly", "year_end_annual"] as const) {
    if (s[key] !== undefined && !Array.isArray(s[key])) throw new Error(`snapshot: '${key}' 는 배열이어야 합니다.`);
  }
  const metrics = new Set(["gross", "tax_paid", "net", "credit", "debit", "card_legacy"]);
  const badYe = (s.year_end_monthly ?? []).find(
    (r) => !metrics.has(r.metric) || !Number.isInteger(r.year) || r.month < 1 || r.month > 12,
  );
  if (badYe) throw new Error(`snapshot: 잘못된 year_end_monthly 행 ${JSON.stringify(badYe)}`);
}
