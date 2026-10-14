// 실행: npm test  — 화면 2(Year End) 규칙 회귀 테스트 (합성 숫자)
import { buildYearEndModel, cumulative, defaultYearEndYear } from "./yearEnd";
import type { Snapshot, YearEndMonthlyRow, YearEndAnnualRow } from "./schema";

const eq = (a: unknown, b: unknown, msg: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("FAIL", msg, a, b); process.exit(1); } else console.log("ok", msg);
};

const mrow = (year: number, month: number, metric: YearEndMonthlyRow["metric"], amount: number, owner: "bbang" | "bbyak" = "bbang"): YearEndMonthlyRow =>
  ({ year, month, owner, metric, amount });
const arow = (year: number, extra: Partial<YearEndAnnualRow>): YearEndAnnualRow => ({
  year, owner: "bbang", gross_pay: 0, tax_paid: 0, income_deduction: 0, tax_base: 0, calculated_tax: 0,
  tax_reduction: 0, tax_credit: 0, determined_tax: 0, refund_or_additional: 0, ...extra,
});

const monthly: YearEndMonthlyRow[] = [];
for (let m = 1; m <= 12; m++) monthly.push(mrow(2025, m, "gross", 100)); // 전년: 매월 100
for (let m = 1; m <= 8; m++) monthly.push(mrow(2026, m, "gross", 110)); // 올해: 8월까지 110
for (let m = 1; m <= 12; m++) monthly.push(mrow(2025, m, "credit", 10));
for (let m = 1; m <= 9; m++) monthly.push(mrow(2026, m, "credit", 20)); // 카드는 9월까지
monthly.push(mrow(2026, 9, "debit", 5, "bbyak"));

const snap = {
  version: 3, source: "demo", generated_at: "", data_updated_at: null, owners: [], asset: [], investment: [], ledger: [],
  year_end_monthly: monthly,
  year_end_annual: [
    arow(2023, { refund_or_additional: -30, gross_pay: 900 }),
    arow(2024, { refund_or_additional: -50, gross_pay: 1000, income_deduction: 300 }),
    arow(2025, { refund_or_additional: 40, income_deduction: 330 }),
  ],
} as Snapshot;

const cur = buildYearEndModel(snap, 2026, "all", 2026);
eq([cur.gross.value, cur.gross.prev, cur.gross.cutoff], [880, 800, 8], "올해: 급여는 1~8월끼리 비교 (전년 동기)");
eq([cur.credit.value, cur.credit.prev, cur.credit.cutoff], [180, 90, 9], "올해: 카드는 지표별 마지막 달(9월)까지 비교");
eq(cur.card.value, 185, "카드 지출 = 신용 + 직불");
eq(cur.deductionCriteria.value, 220, "카드 공제 기준 = 총급여 × 25%");
eq(cur.annual.cur, null, "올해는 원천징수영수증 없음 → 정산 전");
eq(cur.refunds.map((r) => r.year), [2023, 2024, 2025], "환급·징수 이력은 선택 연도 이하 최근 5개년");

const past = buildYearEndModel(snap, 2025, "all", 2026);
eq([past.gross.value, past.gross.cutoff], [1200, 12], "과거 연도: 1~12월 전체");
eq([past.gross.prev, past.gross.diff], [1000, 200], "전년 급여명세서가 없으면 원천징수영수증 총급여와 비교");
eq(past.annual.cur?.income_deduction, 330, "연간 세금 항목은 원천징수영수증 값");

const old = buildYearEndModel(snap, 2024, "all", 2026);
eq([old.gross.value, old.gross.source, old.gross.prev], [1000, "annual", 900], "급여명세서가 없는 해는 원천징수영수증으로 대체");

const yak = buildYearEndModel(snap, 2026, "bbyak", 2026);
eq([yak.hasPayData, yak.gross.value, yak.debit.value], [false, null, 5], "또용: 급여·세금 없음, 가계부 지표만");

eq(cumulative([1, 2, null, 3, null, null, null, null, null, null, null, null]).slice(0, 5), [1, 3, 3, 6, null], "누적: 빈 달은 직전 값 유지, 마지막 데이터 이후 null");
eq(defaultYearEndYear(snap), 2026, "기본 연도 = 월별 데이터가 있는 최근 연도");

// 같은 사람끼리 비교: 또용은 전년 데이터가 없으므로 증감에서 제외
const snap3 = { ...snap, year_end_monthly: [...monthly, mrow(2026, 8, "credit", 1000, "bbyak")] } as Snapshot;
const lfl = buildYearEndModel(snap3, 2026, "all", 2026);
eq([lfl.credit.value, lfl.credit.prev, lfl.credit.diff, lfl.credit.excluded], [1180, 90, 90, ["bbyak"]], "전체 YoY는 전년 데이터가 있는 사람끼리만");

// 상단 KPI 5개년 추이: 선택 연도 포함 5칸, 올해는 누계, 급여명세서 없는 해는 원천징수영수증
const t5 = buildYearEndModel(snap, 2026, "all", 2026).trend5;
eq(t5.gross.map((p) => p.year), [2022, 2023, 2024, 2025, 2026], "5개년 = 선택 연도 포함 최근 5년");
eq(t5.gross.map((p) => p.value), [null, 900, 1000, 1200, 880], "급여 5개년: 원천징수영수증(2023·2024) + 급여명세서(2025·2026 누계)");
eq([t5.gross[4].throughMonth, t5.card[4].throughMonth], [8, 9], "올해 누계 기간 (팝업에 1~N월 표시)");

// 2025-01 이전 결제수단 없는 카드 지출(card_legacy)은 카드 합계·5개년 추이에만 포함
const snap4 = { ...snap, year_end_monthly: [...monthly, mrow(2024, 5, "card_legacy", 300)] } as Snapshot;
const lg = buildYearEndModel(snap4, 2026, "all", 2026);
eq(lg.trend5.card.find((p) => p.year === 2024)?.value, 300, "card_legacy 는 카드 5개년 추이에 포함");
eq(buildYearEndModel(snap4, 2024, "all", 2026).share.credit, null, "card_legacy 는 신용/직불 비중에서 제외 (구분 가능한 카드가 없으면 비중 없음)");
