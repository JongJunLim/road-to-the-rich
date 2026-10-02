// 실행: npm test  — KPI·카테고리 필터 규칙 회귀 테스트
import { ledgerByMonth, buildModel, categoryOptions, DEFAULT_CATEGORY_KEYS, lateJoiners, ownerCoverage } from "./metrics";
import type { LedgerRow, Snapshot } from "./schema";
const rows: LedgerRow[] = [
  { ym: "2026-07", owner: "bbang", kind: "income", category: "급여", amount: 100 },
  { ym: "2026-07", owner: "bbang", kind: "income", category: "상여금", amount: 50 },
  { ym: "2026-07", owner: "bbang", kind: "income", category: "금융수입", amount: 7 },
  { ym: "2026-07", owner: "bbyak", kind: "expense", category: "식비", amount: 30 },
  { ym: "2026-08", owner: "bbang", kind: "income", category: "금융수입", amount: 5 },
  { ym: "2026-08", owner: "bbang", kind: "transfer_in", category: "이체", amount: 11 },
  { ym: "2026-08", owner: "bbang", kind: "transfer_out", category: "이체", amount: 13 },
  { ym: "2026-08", owner: "bbang", kind: "transfer_out", category: "저축", amount: 17 },
];
const eq = (a: unknown, b: unknown, msg: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("FAIL", msg, a, b); process.exit(1); } else console.log("ok", msg); };
const def = ledgerByMonth(rows, "all", DEFAULT_CATEGORY_KEYS);
eq(def.get("2026-07"), { income: 150, expense: 30, transfer_in: 0, transfer_out: 0 }, "기본값: 급여+상여금, 지출 전체");
eq(def.get("2026-08")?.income, 0, "상여금·급여 없는 달은 0 (null 아님)");
eq(ledgerByMonth(rows, "all", []).get("2026-07")?.income, 157, "선택 없음 = 전체");
eq(ledgerByMonth(rows, "all", ["transfer|이체"]).get("2026-08"), { income: 5, expense: 0, transfer_in: 11, transfer_out: 13 }, "이체 그룹은 in/out 모두에 적용");
eq(ledgerByMonth(rows, "bbyak", DEFAULT_CATEGORY_KEYS).get("2026-07"), { income: 0, expense: 30, transfer_in: 0, transfer_out: 0 }, "owner 필터");
eq(categoryOptions(rows).map((o) => o.key), ["income|급여", "income|상여금", "income|금융수입", "expense|식비", "transfer|이체", "transfer|저축"], "옵션 정렬");
const snap = { version: 2, source: "demo", generated_at: "", data_updated_at: null, owners: [], asset: [{ ym: "2026-09", owner: "bbang", asset: 1 }], investment: [], ledger: rows } as Snapshot;
const m = buildModel(snap, "2026-09", "all", DEFAULT_CATEGORY_KEYS);
eq([m.ledgerYm, m.income.current, m.income.previous, m.income.diff], ["2026-08", 0, 150, -150], "9월 선택 → 8월 기준, 필터 적용 MoM");

// like-for-like: 또용 데이터가 이번 달부터 시작하면 전월 비교에서 제외
const snap2 = {
  version: 2, source: "demo", generated_at: "", data_updated_at: null,
  owners: [{ id: "bbang", label: "빵준" }, { id: "bbyak", label: "또용" }],
  asset: [
    { ym: "2026-08", owner: "bbang", asset: 100 },
    { ym: "2026-09", owner: "bbang", asset: 90 },
    { ym: "2026-09", owner: "bbyak", asset: 400 },
  ],
  investment: [], ledger: [],
} as Snapshot;
const m2 = buildModel(snap2, "2026-09", "all");
eq([m2.asset.current, m2.asset.diff, m2.asset.excluded], [490, -10, ["bbyak"]], "전체 자산: 합계는 490, 증감은 빵준만 -10");
eq(buildModel(snap2, "2026-09", "bbyak").asset.diff, null, "또용만: 전월 없음 → 증감 없음");
eq(lateJoiners(ownerCoverage(snap2)).map((c) => c.owner), ["bbyak"], "늦게 합류한 사람 감지");
