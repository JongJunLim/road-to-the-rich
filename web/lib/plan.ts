/**
 * 화면 3 — Monthly Plan (월 고정 수입 · 저축 · 지출 계획표)
 *
 * 화면 1·2 와 달리 BigQuery 가 아니라 "사람이 웹앱에서 직접 입력"하는 데이터.
 *   저장 위치: 운영 gs://<버킷>/app/plan.json · 로컬 .private/plan.json (planStore.ts)
 *   항상 "현재 상태" 하나만 저장 (월별 이력 없음, 실수 복구는 GCS 객체 버전 관리)
 *
 * 이 파일은 서버·브라우저 공용 (검증 · 합계 계산)
 */

export type PlanSection = "income" | "saving" | "expense";

export interface PlanRow {
  id: string;
  section: PlanSection;
  item: string; // 항목 (예: 종준 급여)
  amount: number | null; // 원 단위 정수, 미정이면 null (합계에서는 0)
  memo: string; // 메모 (여러 줄 가능)
}

export interface Plan {
  version: 1;
  updatedAt: string | null; // ISO 시각 — 서버가 저장할 때 기록
  rows: PlanRow[];
}

export const SECTIONS: { key: PlanSection; label: string; total: string }[] = [
  { key: "income", label: "수익", total: "수익 합계" },
  { key: "saving", label: "저축", total: "저축 합계" },
  { key: "expense", label: "지출", total: "고정 지출 합계" },
];

export const LIMITS = {
  rows: 200,
  item: 40,
  memo: 300,
  amount: 100_000_000_000, // 1,000억 (오타 방지용 상한)
  id: 40,
};

export function emptyPlan(): Plan {
  return { version: 1, updatedAt: null, rows: [] };
}

export interface PlanTotals {
  income: number;
  saving: number;
  expense: number;
  remain: number; // 수익 - (저축 + 지출)
}

export function planTotals(rows: PlanRow[]): PlanTotals {
  const sum = (s: PlanSection) => rows.filter((r) => r.section === s).reduce((a, r) => a + (r.amount ?? 0), 0);
  const income = sum("income");
  const saving = sum("saving");
  const expense = sum("expense");
  return { income, saving, expense, remain: income - (saving + expense) };
}

/** "3,730,000" · "₩3,730,000" · "-15,000" → 정수, 빈 칸 → null, 숫자가 아니면 undefined */
export function parseAmount(text: string): number | null | undefined {
  const t = text.replace(/[\s,₩원]/g, "");
  if (t === "") return null;
  if (!/^-?\d+$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : undefined;
}

export function newRowId(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export type PlanCheck = { ok: true; plan: Plan } | { ok: false; error: string };

/** 저장 요청 검증 (서버) — 모르는 필드는 버리고, 문자열은 다듬고, 범위를 벗어나면 거부 */
export function validatePlan(raw: unknown): PlanCheck {
  if (!raw || typeof raw !== "object") return { ok: false, error: "형식이 올바르지 않습니다." };
  const rows = (raw as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return { ok: false, error: "rows 가 없습니다." };
  if (rows.length > LIMITS.rows) return { ok: false, error: `행은 최대 ${LIMITS.rows}개까지 저장할 수 있습니다.` };

  const seen = new Set<string>();
  const clean: PlanRow[] = [];
  for (const [i, r] of rows.entries()) {
    const where = `${i + 1}번째 행`;
    if (!r || typeof r !== "object") return { ok: false, error: `${where} 형식 오류` };
    const { id, section, item, amount, memo } = r as Record<string, unknown>;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(id) || seen.has(id)) return { ok: false, error: `${where}: id 오류` };
    seen.add(id);
    if (section !== "income" && section !== "saving" && section !== "expense") return { ok: false, error: `${where}: 구분 오류` };
    if (typeof item !== "string") return { ok: false, error: `${where}: 항목 오류` };
    const itemT = item.trim();
    if (itemT.length === 0) return { ok: false, error: `${where}: 항목 이름을 입력해 주세요.` };
    if (itemT.length > LIMITS.item) return { ok: false, error: `${where}: 항목은 ${LIMITS.item}자 이내로 입력해 주세요.` };
    if (amount !== null && (typeof amount !== "number" || !Number.isSafeInteger(amount) || Math.abs(amount) > LIMITS.amount))
      return { ok: false, error: `${where}: 금액은 정수(원)로 입력해 주세요.` };
    const memoT = typeof memo === "string" ? memo.replace(/\r\n/g, "\n").trim() : "";
    if (memoT.length > LIMITS.memo) return { ok: false, error: `${where}: 메모는 ${LIMITS.memo}자 이내로 입력해 주세요.` };
    clean.push({ id, section, item: itemT, amount: amount as number | null, memo: memoT });
  }
  return { ok: true, plan: { version: 1, updatedAt: null, rows: clean } };
}

/** 저장 파일 읽기 (파일이 손상돼도 화면이 죽지 않도록 검증 실패 시 예외) */
export function parseStoredPlan(raw: unknown): Plan {
  const check = validatePlan(raw);
  if (!check.ok) throw new Error(`plan.json 형식 오류: ${check.error}`);
  const updatedAt = (raw as { updatedAt?: unknown }).updatedAt;
  return { ...check.plan, updatedAt: typeof updatedAt === "string" ? updatedAt : null };
}
