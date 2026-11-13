// 실행: npm test — Data Guide 계산 규칙 회귀 테스트 (합성 값)
import assert from "node:assert/strict";
import { cardSpend, dataStatus, pmMatrix, qualityChecks } from "./guide";
import type { PaymentExpenseRow, PaymentMethodRow, Snapshot } from "./schema";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
console.log("guide");

const pm = (owner: "bbang" | "bbyak", name: string, group: PaymentMethodRow["group"], n: number, first: string, last: string): PaymentMethodRow => ({
  owner, pm: name, group, n, n_expense: n, first_date: first, last_date: last,
});
const pms: PaymentMethodRow[] = [
  pm("bbang", "A카드", "Credit", 100, "2025-02-01", "2026-10-31"),
  pm("bbyak", "A카드", "Credit", 20, "2026-08-01", "2026-10-30"), // 두 사람이 같이 쓰는 카드
  pm("bbang", "B체크", "Debit", 50, "2025-02-01", "2026-10-15"),
  pm("bbang", "옛카드", "Credit", 30, "2025-02-01", "2025-05-01"), // 휴면
  pm("bbyak", "새통장", "Account", 2, "2026-10-01", "2026-10-01"), // 신규
  pm("bbang", "모르는페이", "Unmapped", 3, "2026-10-20", "2026-10-25"),
];

test("매핑표: 같은 결제수단은 한 줄 + 사람별 사용, 신규·휴면 판단", () => {
  const m = pmMatrix(pms, "all");
  assert.equal(m.ref, "2026-10-31");
  const credit = m.groups.find((g) => g.group === "Credit")!;
  assert.deepEqual(credit.lines.map((l) => l.pm), ["A카드", "옛카드"]); // 휴면은 뒤로
  const a = credit.lines[0];
  assert.equal(a.n, 120);
  assert.deepEqual(Object.keys(a.byOwner).sort(), ["bbang", "bbyak"]);
  assert.equal(credit.lines[1].status, "dormant");
  assert.equal(m.groups.find((g) => g.group === "Account")!.lines[0].status, "new");
  assert.deepEqual(m.unmapped.map((l) => l.pm), ["모르는페이"]);
  assert.equal(m.count, 5);
});

test("매핑표: 사람을 고르면 그 사람이 쓴 결제수단만, 사용 횟수도 그 사람 것만", () => {
  const m = pmMatrix(pms, "bbyak");
  assert.deepEqual(m.groups.flatMap((g) => g.lines.map((l) => l.pm)), ["A카드", "새통장"]);
  assert.equal(m.groups[0].lines[0].n, 20);
  assert.equal(m.unmapped.length, 0);
});

const ex = (ym: string, owner: "bbang" | "bbyak", name: string, group: PaymentExpenseRow["group"], amount: number): PaymentExpenseRow => ({
  ym, owner, pm: name, group, amount,
});
const exs: PaymentExpenseRow[] = [
  ex("2026-07", "bbang", "A카드", "Credit", 999), // 기간 밖
  ex("2026-08", "bbang", "A카드", "Credit", 300),
  ex("2026-09", "bbyak", "A카드", "Credit", 100),
  ex("2026-10", "bbang", "B체크", "Debit", 200),
  ex("2026-10", "bbang", "카카오", "Etc", 50),
];

test("카드별 지출: 최근 3개월, 신용·체크만 줄로, 신용 비율", () => {
  const c = cardSpend(exs, "all");
  assert.deepEqual(c.months, ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(c.lines.map((l) => [l.pm, l.amount]), [["A카드", 400], ["B체크", 200]]);
  assert.equal(c.byGroup.Etc, 50);
  assert.ok(Math.abs(c.creditShare! - 400 / 600) < 1e-9);
  assert.deepEqual(c.lines[0].byOwner, { bbang: 300, bbyak: 100 });
  assert.equal(cardSpend(exs, "bbyak").lines[0].amount, 100);
});

const base: Snapshot = {
  version: 3,
  source: "demo",
  generated_at: "2026-11-01T00:00:00",
  data_updated_at: "2026-11-01T09:00:00",
  owners: [],
  asset: [{ ym: "2026-10", owner: "bbang", amount: 1 }],
  investment: [],
  ledger: [
    { ym: "2025-02", owner: "bbang", kind: "expense", category: "식비", amount: 1 },
    { ym: "2026-10", owner: "bbyak", kind: "expense", category: "식비", amount: 1 },
  ],
} as unknown as Snapshot;

test("데이터 상태: 최신 월과 사람별 시작 월", () => {
  const ledger = dataStatus(base).find((r) => r.key === "ledger")!;
  assert.equal(ledger.latest, "2026-10");
  assert.deepEqual(ledger.starts, { bbang: "2025-02", bbyak: "2026-10" });
  assert.equal(dataStatus(base).find((r) => r.key === "expense_item")!.latest, null);
});

test("품질 체크: 섹션 누락·Unmapped·미분류·갱신 지연", () => {
  const c1 = qualityChecks(base, "2026-11-13");
  assert.equal(c1.find((c) => c.key === "stale")!.level, "ok");
  assert.equal(qualityChecks(base, "2027-06-01", true).find((c) => c.key === "stale")!.level, "info"); // 데모는 갱신 경고 없음
  assert.equal(c1.find((c) => c.key === "sections")!.level, "warn");
  const full = {
    ...base,
    investment_product: [],
    payment_method: pms,
    expense_item: [
      { ym: "2026-10", owner: "bbang", main: "미분류", sub: "미분류", item: "x", amount: 5000 },
      { ym: "2026-10", owner: "bbang", main: "쇼핑", sub: "의류", item: "반품", amount: -100 },
    ],
  } as Snapshot;
  const c2 = qualityChecks(full, "2027-01-20");
  assert.equal(c2.find((c) => c.key === "stale")!.level, "warn");
  assert.equal(c2.find((c) => c.key === "sections")!.level, "ok");
  assert.equal(c2.find((c) => c.key === "unmapped")!.level, "warn");
  assert.match(c2.find((c) => c.key === "uncategorized")!.title, /1건/);
  assert.match(c2.find((c) => c.key === "refund")!.title, /1개/);
});

console.log(`  ${passed}개 통과\n`);
