// 실행: npm test — Expense Analysis 계산 규칙 회귀 테스트 (합성 숫자)
import assert from "node:assert/strict";
import { changeBreakdown, composition, expenseHeatmap, expenseTrend, mainOptions, monthTotal, spendAlerts, topTable, totalCompare } from "./expense";
import type { ExpenseItemRow } from "./schema";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
console.log("expense");

const r = (ym: string, owner: "bbang" | "bbyak", main: string, sub: string, item: string, amount: number): ExpenseItemRow => ({
  ym, owner, main, sub, item, amount,
});
const rows: ExpenseItemRow[] = [
  r("2025-10", "bbang", "식비", "외식", "국밥집", 100),
  r("2026-09", "bbang", "식비", "외식", "국밥집", 200),
  r("2026-09", "bbang", "식비", "기타", "편의점", 50),
  r("2026-09", "bbang", "교통", "택시", "카카오T", 80),
  r("2026-10", "bbang", "식비", "외식", "국밥집", 300),
  r("2026-10", "bbang", "식비", "외식", "초밥집", 120), // 같은 중분류 안 다른 항목
  r("2026-10", "bbang", "생활", "기타", "다이소", 40), // 식비>기타 와 이름만 같은 중분류
  r("2026-10", "bbang", "쇼핑", "의류", "반품", -30), // 환불이 더 큰 달 → 음수
  r("2026-10", "bbyak", "식비", "외식", "국밥집", 500), // 또용은 10월부터
];

test("월 합계 = 모든 행 합 (환불 음수 포함, 화면 1 지출과 같은 규칙)", () => {
  assert.equal(monthTotal(rows, "2026-10", "all"), 300 + 120 + 40 - 30 + 500);
  assert.equal(monthTotal(rows, "2026-10", "bbang"), 430);
});

test("추이: 대분류 선택 · 데이터 없는 달은 null", () => {
  const months = ["2026-08", "2026-09", "2026-10"];
  assert.deepEqual(expenseTrend(rows, "all", [], months), [null, 330, 930]);
  assert.deepEqual(expenseTrend(rows, "all", ["식비"], months), [null, 250, 920]);
  assert.deepEqual(expenseTrend(rows, "bbyak", [], months), [null, null, 500]);
  assert.deepEqual(expenseTrend(rows, "bbang", ["교통"], months), [null, 80, 0]); // 데이터는 있는데 그 분류만 0
});

test("대분류 옵션: 기간 지출 큰 순", () => {
  assert.deepEqual(
    mainOptions(rows, "all", ["2026-10"]).map((o) => o.name),
    ["식비", "생활", "교통", "쇼핑"],
  );
});

test("구성: 0 이하는 제외, 비율 합 = 1, 같은 이름 중분류는 대분류별로 따로", () => {
  const mains = composition(rows, "2026-10", "all", "main");
  assert.deepEqual(mains.map((s) => s.name), ["식비", "생활"]);
  assert.ok(Math.abs(mains.reduce((s, x) => s + x.share, 0) - 1) < 1e-9);
  const subs = composition(rows, "2026-09", "all", "sub");
  assert.deepEqual(subs.map((s) => `${s.main}>${s.name}`), ["식비>외식", "교통>택시", "식비>기타"]);
  const food = composition(rows, "2026-10", "all", "sub", "생활");
  assert.deepEqual(food.map((s) => s.name), ["기타"]);
});

test("Top 대분류: 지출 큰 순 + 전월 대비는 두 달 모두 있는 사람끼리", () => {
  const t = topTable(rows, "2026-10", "all", "main", 10);
  assert.deepEqual(t.lines.map((l) => l.main), ["식비", "생활", "쇼핑"]); // 교통은 10월 지출 없음
  const food = t.lines[0];
  assert.equal(food.amount, 920); // 표시 금액은 두 사람 합
  assert.equal(food.mom!.diff, 420 - 250); // 빵준끼리만 비교
  assert.ok(Math.abs(food.mom!.pct! - 170 / 250) < 1e-9);
  assert.deepEqual(t.excludedMom, ["bbyak"]);
  assert.equal(t.lines[1].mom!.isNew, true); // 생활은 9월에 없던 분류
  assert.equal(t.count, 3);
});

test("Top 대분류: 전년 동월 비교", () => {
  const t = topTable(rows, "2026-10", "bbang", "main", 10);
  assert.equal(t.lines[0].yoy!.diff, 420 - 100);
  assert.equal(t.lines[1].yoy!.isNew, true);
});

test("Top 중분류: 같은 이름(기타)도 대분류가 다르면 다른 행", () => {
  const t = topTable(rows, "2026-09", "all", "sub", 10);
  assert.deepEqual(t.lines.map((l) => `${l.main}>${l.sub}`), ["식비>외식", "교통>택시", "식비>기타"]);
});

test("Top 항목: 상위 n개 자르기, 비교 없음", () => {
  const t = topTable(rows, "2026-10", "all", "item", 2);
  assert.deepEqual(t.lines.map((l) => l.item), ["국밥집", "초밥집"]);
  assert.equal(t.lines[0].amount, 800);
  assert.equal(t.lines[0].mom, null);
  assert.equal(t.count, 4);
});

test("비교 대상 사람이 아예 없으면 null (또용만 선택, 전월 없음)", () => {
  const t = topTable(rows, "2026-10", "bbyak", "main", 10);
  assert.equal(t.lines[0].mom, null);
  assert.equal(totalCompare(rows, "2026-10", "bbyak", -1), null);
});

test("월 합계 전월 대비 (같은 사람끼리)", () => {
  const c = totalCompare(rows, "2026-10", "all", -1)!;
  assert.equal(c.diff, 430 - 330);
});

test("Drill down: 대분류 안에서만 순위·비중, 비교 대상 사람은 전체 기준", () => {
  const t = topTable(rows, "2026-10", "all", "item", 10, { main: "식비" });
  assert.deepEqual(t.lines.map((l) => l.item), ["국밥집", "초밥집"]);
  assert.equal(t.total, 920);
  const s = topTable(rows, "2026-10", "all", "sub", 10, { main: "식비" });
  assert.equal(s.lines.length, 1);
  assert.equal(s.lines[0].mom!.diff, 420 - 200); // 빵준 외식 9→10월
  const one = topTable(rows, "2026-09", "all", "item", 10, { main: "식비", sub: "기타" });
  assert.deepEqual(one.lines.map((l) => l.item), ["편의점"]);
});

test("증감 분해: 시작 + 단계 합 = 끝 (같은 사람끼리), 큰 순 + 기타 묶음", () => {
  const b = changeBreakdown(rows, "2026-10", "all", 2)!;
  assert.equal(b.start, 330); // 빵준 9월
  assert.equal(b.end, 430); // 빵준 10월 (또용 제외)
  assert.equal(b.start + b.steps.reduce((s, x) => s + x.diff, 0), b.end);
  assert.deepEqual(b.steps.map((x) => x.label), ["식비", "교통", "기타 2개"]);
  assert.deepEqual(b.excluded, ["bbyak"]);
  assert.equal(changeBreakdown(rows, "2026-10", "bbyak"), null);
});

test("급증 알림: 직전 평균 대비 +50% & 최소 증가액, 데이터 부족한 사람 제외", () => {
  const base = (ym: string, amt: number) => r(ym, "bbang", "식비", "배달", "배달앱", amt);
  const hist = [
    base("2026-04", 100_000), base("2026-05", 100_000), base("2026-06", 100_000),
    base("2026-07", 100_000), base("2026-08", 100_000), base("2026-09", 100_000),
    base("2026-10", 180_000), // +80%, +8만 → 알림
    ...["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map((m) => r(m, "bbang", "생활", "생필품", "마트", 200_000)),
    r("2026-10", "bbang", "생활", "생필품", "마트", 240_000), // 평소 20만 → 24만 (+20%) → 아님
    r("2026-10", "bbang", "여행", "항공", "항공권", 600_000), // 새로 생긴 큰 지출 → 알림 (ratio null)
    r("2026-10", "bbyak", "식비", "배달", "배달앱", 900_000), // 또용은 직전 데이터 없음 → 제외
  ];
  const a = spendAlerts(hist, "2026-10", "all");
  assert.deepEqual(a.skipped, ["bbyak"]);
  const subs = a.alerts.filter((x) => x.level === "sub").map((x) => `${x.main}>${x.sub}:${x.diff}`);
  assert.deepEqual(subs, ["여행>항공:600000", "식비>배달:80000"]);
  assert.equal(a.alerts.find((x) => x.sub === "항공")!.ratio, null);
  // 가끔만 쓰는 지출: 6개월 중 한 달만 30만 → 평균 5만 → 이번 달 30만은 알림
  const rare = spendAlerts([...hist, r("2026-05", "bbang", "문화", "공연", "콘서트", 300_000), r("2026-10", "bbang", "문화", "공연", "콘서트", 300_000)], "2026-10", "bbang");
  assert.equal(rare.alerts.find((x) => x.sub === "공연")!.base, 50_000);
});

test("히트맵: 기간 합계 큰 순, 데이터 없는 달은 null", () => {
  const h = expenseHeatmap(rows, "all", ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(h.mains, ["식비", "교통", "생활"]); // 쇼핑(−30)은 제외
  assert.deepEqual(h.values[0], [null, 250, 920]);
});

console.log(`  ${passed}개 통과\n`);
