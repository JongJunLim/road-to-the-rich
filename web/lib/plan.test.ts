/**
 * 화면 3 (Monthly Plan) 검증 · 합계 테스트 — npm test
 */
import assert from "node:assert/strict";
import { parseAmount, parseStoredPlan, planTotals, validatePlan, type PlanRow } from "./plan";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
console.log("plan");

const rows: PlanRow[] = [
  { id: "a", section: "income", item: "급여 A", amount: 3730000, memo: "" },
  { id: "b", section: "income", item: "급여 B", amount: 2310000, memo: "" },
  { id: "c", section: "saving", item: "대출 상환", amount: 421020, memo: "" },
  { id: "d", section: "expense", item: "이자", amount: 261369, memo: "" },
  { id: "e", section: "expense", item: "보험", amount: null, memo: "미정" },
  { id: "f", section: "expense", item: "기타", amount: 277040, memo: "" },
];

test("합계와 남는 금액 (미정 금액은 0)", () => {
  assert.deepEqual(planTotals(rows), { income: 6040000, saving: 421020, expense: 538409, remain: 5080571 });
});

test("금액 입력 해석", () => {
  assert.equal(parseAmount("3,730,000"), 3730000);
  assert.equal(parseAmount("₩23,450"), 23450);
  assert.equal(parseAmount(" -15,000 원"), -15000);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("12.5"), undefined);
  assert.equal(parseAmount("abc"), undefined);
});

test("정상 저장 요청은 다듬어서 통과", () => {
  const r = validatePlan({ rows: [{ id: "x1", section: "saving", item: "  적금 ", amount: 0, memo: " 청년\r\n미래 ", extra: 1 }] });
  assert.ok(r.ok);
  assert.deepEqual(r.plan.rows[0], { id: "x1", section: "saving", item: "적금", amount: 0, memo: "청년\n미래" });
});

test("잘못된 요청은 거부", () => {
  const bad = (row: object) => validatePlan({ rows: [{ id: "x", section: "income", item: "a", amount: 1, memo: "", ...row }] }).ok;
  assert.equal(bad({ section: "other" }), false);
  assert.equal(bad({ item: "   " }), false);
  assert.equal(bad({ item: "가".repeat(41) }), false);
  assert.equal(bad({ amount: 1.5 }), false);
  assert.equal(bad({ amount: "100" }), false);
  assert.equal(bad({ amount: 1e12 }), false);
  assert.equal(bad({ id: "../x" }), false);
  assert.equal(validatePlan({ rows: [{ id: "x", section: "income", item: "a", amount: 1, memo: "" }, { id: "x", section: "income", item: "b", amount: 1, memo: "" }] }).ok, false);
  assert.equal(validatePlan({ rows: Array.from({ length: 201 }, (_, i) => ({ id: `r${i}`, section: "income", item: "a", amount: 1, memo: "" })) }).ok, false);
  assert.equal(validatePlan(null).ok, false);
});

test("저장 파일 읽기 — updatedAt 유지, 손상 파일은 오류", () => {
  const p = parseStoredPlan({ version: 1, updatedAt: "2026-10-16T00:00:00Z", rows });
  assert.equal(p.updatedAt, "2026-10-16T00:00:00Z");
  assert.equal(p.rows.length, 6);
  assert.throws(() => parseStoredPlan({ rows: "x" }));
});

console.log(`  ${passed}개 통과\n`);
