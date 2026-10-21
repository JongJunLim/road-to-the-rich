// 실행: npm test — Investment 화면 계산 규칙 회귀 테스트 (합성 숫자)
import assert from "node:assert/strict";
import { flowBreakdown, holdingsAt, investSummary, investTable, LEGACY_PRODUCT, productOptions, trendSeries } from "./invest";
import type { InvestmentProductRow } from "./schema";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
console.log("invest");

const r = (ym: string, owner: "bbang" | "bbyak", product: string, principal: number, valuation: number): InvestmentProductRow => ({
  ym, owner, product, principal, valuation,
});
const rows: InvestmentProductRow[] = [
  r("2025-10", "bbang", LEGACY_PRODUCT, 1000, 1100),
  r("2026-09", "bbang", "엔비디아", 100, 150),
  r("2026-09", "bbang", "애플", 200, 180),
  r("2026-10", "bbang", "엔비디아", 100, 200),
  r("2026-10", "bbang", "QQQM", 300, 330), // 신규 매수
  r("2026-10", "bbyak", "엔비디아", 400, 1000), // 또용은 10월부터
  r("2026-10", "bbyak", "삼성전자", 500, 450),
];

test("수익률은 합계로 다시 계산 (비율끼리 더하지 않음)", () => {
  const [p] = trendSeries(rows, "all", [], ["2026-10"]);
  assert.equal(p.principal, 1300);
  assert.equal(p.valuation, 1980);
  assert.equal(p.rate, (1980 - 1300) / 1300);
});

test("종목 필터 · 데이터 없는 달은 null", () => {
  const s = trendSeries(rows, "bbang", ["엔비디아"], ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(s.map((x) => x.valuation), [null, 150, 200]);
});

test("종목 목록은 owner 기준, 최근 보유 → 평가금 순, 구분 전 합산은 맨 끝", () => {
  assert.deepEqual(productOptions(rows, "bbang").map((o) => o.name), ["QQQM", "엔비디아", "애플", LEGACY_PRODUCT]);
  assert.deepEqual(productOptions(rows, "bbyak").map((o) => o.name), ["엔비디아", "삼성전자"]);
  assert.equal(productOptions(rows, "all")[0].name, "엔비디아"); // 두 사람 합산 1,200
});

test("트리맵: 전체 선택 시 같은 종목은 하나로 합치고 구성비 계산", () => {
  const h = holdingsAt(rows, "2026-10", "all");
  assert.deepEqual(h.map((x) => x.product), ["엔비디아", "삼성전자", "QQQM"]);
  assert.equal(h[0].valuation, 1200);
  assert.equal(h[0].share, 1200 / 1980);
});

test("표: 전월 대비 · 신규 · 소계", () => {
  const t = investTable(rows, "2026-10", "bbang", ["bbang", "bbyak"], { key: "valuation", dir: "desc" });
  assert.equal(t.total, null); // 한 사람만 → 총계 없음
  const [g] = t.groups;
  assert.deepEqual(g.lines.map((l) => l.product), ["QQQM", "엔비디아"]);
  const nv = g.lines.find((l) => l.product === "엔비디아")!;
  assert.equal(nv.mom.valuation, 50);
  assert.ok(Math.abs((nv.mom.rate ?? 0) - (1.0 - 0.5)) < 1e-9); // 100% - 50% = 50%p
  const q = g.lines.find((l) => l.product === "QQQM")!;
  assert.equal(q.mom.isNew, true);
  assert.equal(q.mom.valuation, null);
  assert.equal(g.subtotal.mom.valuation, 530 - 330);
  assert.equal(g.subtotal.yoy.valuation, 530 - 1100); // 2025-10 구분 전 합산과 비교
});

test("표: 총계 비교는 두 달 모두 있는 사람끼리 (또용 전월 없음)", () => {
  const t = investTable(rows, "2026-10", "all", ["bbang", "bbyak"]);
  assert.equal(t.groups.length, 2);
  assert.equal(t.total!.valuation, 1980);
  assert.equal(t.total!.mom.valuation, 530 - 330); // 빵준만 비교
  assert.deepEqual(t.total!.excludedMom, ["bbyak"]);
  const yb = t.groups[1];
  assert.equal(yb.lines[0].mom.isNew, false); // 또용은 전월 자체가 없음 → 신규 아님
  assert.equal(yb.subtotal.mom.valuation, null);
});

test("표 정렬: 기본 수익률 높은 순", () => {
  const t = investTable(rows, "2026-10", "bbyak", ["bbang", "bbyak"]);
  assert.deepEqual(t.groups[0].lines.map((l) => l.product), ["엔비디아", "삼성전자"]);
});

test("트리맵: 원금 구성비와 평가손익", () => {
  const h = holdingsAt(rows, "2026-10", "all");
  assert.equal(h[0].shareP, 500 / 1300);
  assert.equal(h[1].profit, -50); // 삼성전자 450 − 500
});

test("요약 KPI: 전월 대비는 두 달 모두 있는 사람끼리", () => {
  const s = investSummary(rows, "2026-10", "all");
  assert.equal(s.cur.valuation, 1980);
  assert.equal(s.cur.profit, 680);
  assert.deepEqual(s.excluded, ["bbyak"]);
  assert.equal(s.mom!.valuation, 530 - 330);
  assert.equal(s.mom!.principal, 400 - 300);
  assert.equal(s.mom!.profit, 130 - 30);
});

test("변동 분해: 계속 보유 · 신규 · 매도 (빵준 9→10월)", () => {
  const f = flowBreakdown(rows, "2026-10", "bbang")!;
  // 엔비디아: 원금 0 변화, 시장 +50 / QQQM 신규: 투자 +300, 시장 +30 / 애플 매도: 투자 −180
  assert.equal(f.start, 330);
  assert.equal(f.end, 530);
  assert.equal(f.flow, 300 - 180);
  assert.equal(f.market, 80);
  assert.equal(f.start + f.flow + f.market, f.end);
  assert.deepEqual(f.movers.map((m) => m.product), ["엔비디아", "QQQM"]);
});

test("변동 분해: 전월이 없는 사람은 제외, 구분 전 합산이 끼면 사람 합계로", () => {
  assert.equal(flowBreakdown(rows, "2026-10", "bbyak"), null);
  const legacy: InvestmentProductRow[] = [r("2026-01", "bbang", LEGACY_PRODUCT, 1000, 1200), r("2026-02", "bbang", "QQQM", 1100, 1350)];
  const f = flowBreakdown(legacy, "2026-02", "bbang")!;
  assert.equal(f.flow, 100);
  assert.equal(f.market, 50);
});

console.log(`  ${passed}개 통과\n`);
