/**
 * 📌 데이터 계약 v2 — 파이프라인(Python)과 웹앱(TS)이 공유하는 유일한 약속
 *
 * v2 변경: ledger 를 '월 × owner × 구분(kind) × 대분류(category)' 행으로 세분화 (카테고리 필터용)
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

export interface Snapshot {
  version: 2;
  source: "banksalad" | "demo";
  generated_at: string;
  data_updated_at: string | null;
  owners: OwnerInfo[];
  asset: AssetRow[];
  investment: InvestmentRow[];
  ledger: LedgerRow[];
}

/** 런타임 최소 검증 — 계약이 깨진 JSON이 화면까지 가지 않게 */
export function assertSnapshot(x: unknown): asserts x is Snapshot {
  const s = x as Partial<Snapshot> | null;
  if (!s || s.version !== 2) throw new Error("snapshot: version 2 가 아닙니다. 파이프라인과 웹앱 버전을 맞춰 주세요.");
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
}
