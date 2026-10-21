"""
합성(데모) 스냅샷 생성기 — 실데이터와 같은 스키마(데이터 계약 v3, investment_product 포함)

용도
  - 개발 중 화면 확인 (실제 금액이 코드·로그·스크린샷에 남지 않게)
  - 포트폴리오용 공개 데모 배포

실행
  python generate_demo.py --out ../web/data/demo-snapshot.json
  python generate_demo.py --end 2026-09 --months 24 --seed 7 --out demo.json
"""
from __future__ import annotations

import argparse
import json
import math
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
OWNERS = [{"id": "bbang", "label": "빵준"}, {"id": "bbyak", "label": "또용"}]


def month_list(end_ym: str, n: int) -> list[str]:
    y, m = map(int, end_ym.split("-"))
    out = []
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return out[::-1]


def round_to(x: float, unit: int) -> int:
    return int(round(x / unit) * unit)


def gen_owner(rng: random.Random, owner: str, months: list[str], ledger_months: list[str]) -> tuple[list, list, list]:
    base = {"bbang": 62_000_000, "bbyak": 41_000_000}[owner]
    salary = {"bbang": 3_450_000, "bbyak": 2_980_000}[owner]
    monthly_saving = {"bbang": 1_150_000, "bbyak": 900_000}[owner]

    asset_rows, inv_rows, led_rows = [], [], []

    # 투자: 원금은 적립식으로 늘다가 중간에 한 번 크게 인출(전세/결혼 자금 등) 후 소액 재시작
    principal = {"bbang": 18_000_000, "bbyak": 9_000_000}[owner]
    withdraw_at = len(months) - 6 if owner == "bbang" else len(months) - 9
    drift = 0.0
    asset = base
    for i, ym in enumerate(months):
        if i == withdraw_at:
            principal = 300_000
        elif i < withdraw_at:
            principal += rng.choice([500_000, 700_000, 1_000_000])
        else:
            principal += 100_000
        drift += rng.gauss(0.006, 0.025)
        valuation = principal * (1 + drift + 0.02 * math.sin(i / 2))
        inv_rows.append({"ym": ym, "owner": owner,
                         "principal": round_to(principal, 1_000),
                         "valuation": round_to(max(valuation, 0), 1_000)})

        # 자산: 저축 + 투자 손익 + 약간의 변동, 결혼 준비 달에는 감소
        shock = -rng.uniform(2_500_000, 4_500_000) if i in (len(months) - 5, len(months) - 1) else 0
        asset += monthly_saving + rng.gauss(0, 650_000) + shock
        asset_rows.append({"ym": ym, "owner": owner, "asset": round_to(asset, 1)})

    expense_mix = {  # 카테고리별 월 평균 지출 (합성)
        "식비": 520_000, "생활": 210_000, "온라인쇼핑": 260_000, "교통": 150_000,
        "카페/간식": 90_000, "주거/통신": 120_000, "문화/여가": 110_000, "여행/숙박": 180_000,
    }

    def add(ym: str, kind: str, category: str, amount: float) -> None:
        if amount > 0:
            led_rows.append({"ym": ym, "owner": owner, "kind": kind, "category": category, "amount": round_to(amount, 1)})

    for ym in ledger_months:
        m = int(ym[5:])
        # 수입: 급여 + (1·7월) 상여금 + 소액 금융수입 + 가끔 기타수입
        add(ym, "income", "급여", salary * rng.uniform(0.98, 1.02))
        if m in (1, 7):
            add(ym, "income", "상여금", salary * rng.uniform(0.9, 1.3))
        add(ym, "income", "금융수입", rng.uniform(3_000, 25_000))
        if rng.random() < 0.25:
            add(ym, "income", "기타수입", rng.uniform(50_000, 300_000))

        # 지출: 카테고리별 변동 + 연말·5월 소폭 증가 + 목돈 이벤트(결혼 준비 등)
        season = 1.12 if m in (12, 5) else 1.0
        for cat, base_amt in expense_mix.items():
            add(ym, "expense", cat, base_amt * rng.uniform(0.6, 1.4) * season)
        if ym == ledger_months[-4]:
            add(ym, "expense", "결혼", {"bbang": 5_200_000, "bbyak": 3_100_000}[owner])

        # 이체: 들어온 이체 / 나간 이체 (카드대금·저축·투자 등)
        add(ym, "transfer_in", "내계좌이체", rng.uniform(300_000, 1_400_000))
        add(ym, "transfer_in", "이체", rng.uniform(100_000, 700_000))
        add(ym, "transfer_out", "카드대금", rng.uniform(600_000, 1_500_000))
        add(ym, "transfer_out", "저축", monthly_saving * rng.uniform(0.5, 0.8))
        add(ym, "transfer_out", "투자", rng.uniform(100_000, 500_000))
    return asset_rows, inv_rows, led_rows


# 데모 종목 (owner별) — (종목명, 비중, 성과 성향, 시작 인덱스(음수=끝에서), 종료 인덱스(None=계속))
DEMO_PRODUCTS = {
    "bbang": [
        ("미국 S&P500 ETF", 0.30, 0.25, 0, None),
        ("나스닥100 ETF", 0.22, 0.45, 0, None),
        ("미국 배당 ETF", 0.15, 0.05, 0, None),
        ("엔비디아", 0.08, 1.20, 0, None),
        ("애플", 0.08, 0.15, 0, None),
        ("금 ETF", 0.07, 0.30, 0, -8),         # 중간에 매도
        ("2차전지 ETF", 0.10, -0.35, 0, None),
        ("팔란티어", 0.04, 0.60, -4, None),     # 최근 신규 매수
    ],
    "bbyak": [
        ("SK하이닉스", 0.25, -0.05, 0, None),
        ("삼성전자", 0.18, 0.40, 0, None),
        ("알파벳 Class A", 0.14, 0.90, 0, None),
        ("마이크로소프트", 0.12, 0.55, 0, None),
        ("테슬라", 0.08, -0.25, 0, None),
        ("미국채 ETF", 0.15, -0.08, 0, None),
        ("카카오페이", 0.04, -0.50, 0, None),
        ("브로드컴", 0.04, 0.35, -3, None),
    ],
}


def gen_products(rng: random.Random, inv_rows: list[dict]) -> list[dict]:
    """투자 월 합계(investment)를 종목별로 나눔 — 종목 합계 = 화면 1 투자 금액 (원 단위까지 일치)"""
    out: list[dict] = []
    for owner, products in DEMO_PRODUCTS.items():
        rows = [r for r in inv_rows if r["owner"] == owner]
        n = len(rows)
        tilt = {name: 0.0 for name, *_ in products}
        for i, r in enumerate(rows):
            active = []
            for name, weight, perf, start, end in products:
                s = start if start >= 0 else n + start
                e = n if end is None else (end if end >= 0 else n + end)
                if s <= i < e:
                    tilt[name] += rng.gauss(perf / max(n, 1), 0.02)
                    active.append((name, weight * rng.uniform(0.92, 1.08), max(0.05, 1 + tilt[name])))
            if not active:
                continue
            wsum = sum(w for _, w, _ in active)
            vsum = sum(w * g for _, w, g in active)
            p_left, v_left = r["principal"], r["valuation"]
            for k, (name, w, g) in enumerate(active):
                last = k == len(active) - 1
                p = p_left if last else round_to(r["principal"] * w / wsum, 1)
                v = v_left if last else round_to(r["valuation"] * w * g / vsum, 1)
                p_left -= p
                v_left -= v
                out.append({"ym": r["ym"], "owner": owner, "product": name, "principal": p, "valuation": v})
    return sorted(out, key=lambda x: (x["ym"], x["owner"], x["product"]))


def kr_income_tax(base: float) -> float:
    """종합소득세 누진세율(간이) — 데모용 산출세액"""
    brackets = [(14_000_000, 0.06), (50_000_000, 0.15), (88_000_000, 0.24), (150_000_000, 0.35), (float("inf"), 0.38)]
    tax, prev = 0.0, 0.0
    for limit, rate in brackets:
        if base > prev:
            tax += (min(base, limit) - prev) * rate
        prev = limit
    return tax


def gen_year_end(rng: random.Random, ledger: list[dict], ledger_months: list[str]) -> tuple[list, list]:
    """화면 2용 합성 데이터 — 실수령액·카드 지출은 화면 1 가계부와 맞물리게 만든다."""
    monthly: dict[tuple, int] = {}

    def put(year: int, month: int, owner: str, metric: str, amount: float) -> None:
        if amount > 0:
            key = (year, month, owner, metric)
            monthly[key] = monthly.get(key, 0) + round_to(amount, 10)

    for r in ledger:
        y, m = int(r["ym"][:4]), int(r["ym"][5:])
        if r["kind"] == "income" and r["category"] in ("급여", "상여금"):
            if r["category"] == "상여금" and m == 1:  # 1월 상여금은 전년도 귀속 (실데이터 규칙과 동일)
                y, m = y - 1, 12
            put(y, m, r["owner"], "net", r["amount"])
            gross = r["amount"] / rng.uniform(0.80, 0.84)  # 세전 = 실수령 ÷ 약 82%
            put(y, m, r["owner"], "gross", gross)
            put(y, m, r["owner"], "tax_paid", gross * rng.uniform(0.045, 0.06))
        elif r["kind"] == "expense" and r["category"] != "결혼":
            card = r["amount"] * rng.uniform(0.78, 0.9)  # 지출의 대부분은 카드 결제
            credit_share = 0.72 if r["owner"] == "bbang" else 0.6
            put(y, m, r["owner"], "credit", card * credit_share)
            put(y, m, r["owner"], "debit", card * (1 - credit_share))

    monthly_rows = [
        {"year": y, "month": m, "owner": o, "metric": k, "amount": v} for (y, m, o, k), v in sorted(monthly.items())
    ]

    # 원천징수영수증: 올해는 아직 연말정산 전 → 작년까지 5개년
    this_year = int(ledger_months[-1][:4])
    annual_rows = []
    for owner, base_gross in (("bbang", 46_000_000), ("bbyak", 38_000_000)):
        for i, year in enumerate(range(this_year - 5, this_year)):
            known = sum(v for (y, _, o, k), v in monthly.items() if y == year and o == owner and k == "gross")
            gross = known if known > 0 and year == this_year - 1 else base_gross * (0.8 + 0.06 * i) * rng.uniform(0.97, 1.03)
            deduction = gross * rng.uniform(0.3, 0.36)
            base = gross - deduction
            calculated = kr_income_tax(base)
            credit = calculated * rng.uniform(0.12, 0.22)
            reduction = calculated * 0.5 if owner == "bbyak" and i < 2 else 0  # 중소기업 취업자 감면 흉내
            determined = max(calculated - credit - reduction, 0) * 1.1  # + 지방소득세 10%
            tax_paid = determined * rng.uniform(0.8, 1.25)
            annual_rows.append({
                "year": year, "owner": owner,
                "gross_pay": round_to(gross, 1), "tax_paid": round_to(tax_paid, 10),
                "income_deduction": round_to(deduction, 1), "tax_base": round_to(base, 1),
                "calculated_tax": round_to(calculated, 1), "tax_reduction": round_to(reduction, 1),
                "tax_credit": round_to(credit, 1), "determined_tax": round_to(determined, 10),
                "refund_or_additional": round_to(determined - tax_paid, 10),
            })
    return monthly_rows, annual_rows


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--end", default=datetime.now(KST).strftime("%Y-%m"), help="마지막 자산 스냅샷 월 (YYYY-MM)")
    p.add_argument("--months", type=int, default=24)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--out", required=True)
    a = p.parse_args()

    rng = random.Random(a.seed)
    months = month_list(a.end, a.months)
    ledger_months = months[:-1]  # 가계부는 조회월 기준 '전월'까지만 존재 (실데이터와 동일한 규칙)

    snapshot = {
        "version": 3,
        "source": "demo",
        "generated_at": datetime.now(KST).isoformat(timespec="seconds"),
        "data_updated_at": f"{a.end}-01T09:00:00",
        "owners": OWNERS,
        "asset": [], "investment": [], "ledger": [],
    }
    for o in OWNERS:
        ar, ir, lr = gen_owner(rng, o["id"], months, ledger_months)
        snapshot["asset"] += ar
        snapshot["investment"] += ir
        snapshot["ledger"] += lr
    snapshot["year_end_monthly"], snapshot["year_end_annual"] = gen_year_end(rng, snapshot["ledger"], ledger_months)
    # 종목별 투자 — 별도 난수로 생성해 기존 섹션(화면 1·2) 값은 바뀌지 않게
    snapshot["investment_product"] = gen_products(random.Random(a.seed + 101), snapshot["investment"])

    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(snapshot, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✅ 데모 스냅샷 생성: {a.out} ({len(months)}개월, seed={a.seed})")


if __name__ == "__main__":
    main()
