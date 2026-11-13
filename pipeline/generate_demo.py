"""
합성(데모) 스냅샷 생성기 — 실데이터와 같은 스키마(데이터 계약 v3, investment_product · expense_item · payment_method 포함)

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
OWNERS = [{"id": "bbang", "label": "남편"}, {"id": "bbyak", "label": "아내"}]  # 데모 표시 이름 (실데이터 이름은 export_snapshot.py)


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


# 데모 지출 구조 — 대분류: [(중분류, 비중, [항목…]), …]  (가게 이름은 합성)
DEMO_EXPENSE_TREE = {
    "식비": [("외식", 0.45, ["동네 국밥집", "회사 앞 백반집", "초밥 오마카세", "분식집"]),
             ("식재료", 0.35, ["동네 마트", "온라인 장보기", "정육점"]),
             ("배달", 0.20, ["배달앱 A", "배달앱 B"])],
    "생활": [("생필품", 0.55, ["생활용품점", "드럭스토어"]),
             ("의료", 0.25, ["동네 내과", "약국"]),
             ("미용", 0.20, ["미용실"])],
    "온라인쇼핑": [("종합몰", 0.65, ["오픈마켓 A", "오픈마켓 B", "새벽배송몰"]),
               ("패션", 0.35, ["패션 플랫폼", "브랜드 공식몰"])],
    "교통": [("대중교통", 0.45, ["교통카드"]),
             ("택시", 0.25, ["택시 호출앱"]),
             ("자동차", 0.30, ["주유소", "주차장"])],
    "카페/간식": [("카페", 0.75, ["프랜차이즈 카페", "동네 카페", "저가 커피"]),
              ("베이커리", 0.25, ["동네 빵집"])],
    "주거/통신": [("관리비", 0.60, ["아파트 관리비"]),
              ("통신", 0.40, ["휴대폰 요금", "인터넷 요금"])],
    "문화/여가": [("구독", 0.35, ["영상 구독", "음악 구독"]),
              ("영화/공연", 0.30, ["영화관", "공연 예매"]),
              ("운동", 0.35, ["헬스장"])],
    "여행/숙박": [("숙박", 0.60, ["호텔 예약", "숙박 앱"]),
              ("항공", 0.40, ["항공권"])],
    "결혼": [("예식", 0.55, ["웨딩홀"]),
            ("스드메", 0.30, ["웨딩 스튜디오"]),
            ("예물", 0.15, ["예물 매장"])],
}


def gen_expense_items(rng: random.Random, ledger: list[dict]) -> list[dict]:
    """가계부 지출(대분류 월 합계)을 중분류·항목으로 나눔 — 항목 합계 = 화면 1 지출 (원 단위까지 일치)"""
    out: list[dict] = []
    for r in ledger:
        if r["kind"] != "expense":
            continue
        tree = DEMO_EXPENSE_TREE.get(r["category"], [("기타", 1.0, ["기타 지출"])])
        parts: list[tuple[str, str, float]] = []
        for sub, w, items in tree:
            picked = [i for i in items if rng.random() < 0.8] or [items[0]]
            ws = [rng.uniform(0.4, 1.6) for _ in picked]
            for item, iw in zip(picked, ws):
                parts.append((sub, item, w * rng.uniform(0.6, 1.4) * iw / sum(ws)))
        total_w = sum(p[2] for p in parts)
        left = r["amount"]
        for k, (sub, item, w) in enumerate(parts):
            amt = left if k == len(parts) - 1 else round_to(r["amount"] * w / total_w, 10)
            left -= amt
            out.append({"ym": r["ym"], "owner": r["owner"], "main": r["category"], "sub": sub, "item": item, "amount": amt})
        # 가끔 반품 환불 (같은 달 다른 항목에서 차감 → 합계는 그대로)
        if r["category"] == "온라인쇼핑" and rng.random() < 0.2:
            refund = round_to(rng.uniform(20_000, 60_000), 10)
            out.append({"ym": r["ym"], "owner": r["owner"], "main": r["category"], "sub": "환불", "item": "반품 환불", "amount": -refund})
            out[-2]["amount"] += refund
    merged: dict[tuple, int] = {}
    for x in out:
        k = (x["ym"], x["owner"], x["main"], x["sub"], x["item"])
        merged[k] = merged.get(k, 0) + x["amount"]
    return [
        {"ym": k[0], "owner": k[1], "main": k[2], "sub": k[3], "item": k[4], "amount": v}
        for k, v in sorted(merged.items()) if v != 0
    ]


# 데모 결제수단 (합성 이름) — owner: [(이름, 그룹, 신용·체크 안에서의 비중)]
DEMO_CARDS = {
    "bbang": {"Credit": [("A카드 (신용)", 0.6), ("F카드 (가족)", 0.25), ("B카드 (신용)", 0.15)], "Debit": [("C은행 체크카드", 1.0)]},
    "bbyak": {"Credit": [("E카드 (신용)", 0.75), ("F카드 (가족)", 0.25)], "Debit": [("G 체크카드", 1.0)]},
}
DEMO_OTHER = {  # 카드 외 지출이 나가는 곳
    "bbang": {"Etc": "D페이 간편결제", "Account": "주거래 입출금통장"},
    "bbyak": {"Etc": "D페이 간편결제", "Account": "월급 통장"},
}
DEMO_NO_EXPENSE = [  # 지출 없이 이체만 쓰는 계좌 등 (owner, 이름, 그룹)
    ("bbang", "비상금 파킹통장", "Account"), ("bbang", "주택청약", "Account"), ("bbang", "전세 보증금", "Cash"),
    ("bbyak", "증권 예탁금", "Account"), ("bbyak", "D페이 머니", "Etc"),
]


def gen_payment_methods(rng: random.Random, ledger: list[dict], year_end_monthly: list[dict]) -> tuple[list[dict], list[dict]]:
    """결제수단별 지출(payment_method_expense)과 사용 현황(payment_method)
    - 신용·체크 합계는 연말정산 화면(year_end_monthly credit·debit)과 같고, 월 합계는 화면 1 지출과 같음
    - 'B카드'는 마지막 8개월 사용 없음(휴면), 마지막 달에 매핑 안 된 '새 간편결제'와 신규 '새 적금통장'이 생김
    """
    expense: dict[tuple[str, str], int] = {}
    for r in ledger:
        if r["kind"] == "expense":
            k = (r["ym"], r["owner"])
            expense[k] = expense.get(k, 0) + r["amount"]
    card = {(f"{r['year']}-{r['month']:02d}", r["owner"], r["metric"]): r["amount"] for r in year_end_monthly if r["metric"] in ("credit", "debit")}
    months = sorted({ym for ym, _ in expense})
    last = months[-1]
    dormant_from = months[-8] if len(months) >= 8 else months[0]

    out: list[dict] = []

    def split(ym: str, owner: str, group: str, parts: list[tuple[str, float]], total: int) -> None:
        left = total
        for i, (name, w) in enumerate(parts):
            amt = left if i == len(parts) - 1 else round_to(total * w, 10)
            left -= amt
            if amt:
                out.append({"ym": ym, "owner": owner, "pm": name, "group": group, "amount": amt})

    for (ym, owner), total in sorted(expense.items()):
        credit = card.get((ym, owner, "credit"), 0)
        debit = card.get((ym, owner, "debit"), 0)
        cards = [(n, w) for n, w in DEMO_CARDS[owner]["Credit"] if not (n.startswith("B카드") and ym >= dormant_from)]
        wsum = sum(w for _, w in cards)
        split(ym, owner, "Credit", [(n, w / wsum) for n, w in cards], credit)
        split(ym, owner, "Debit", DEMO_CARDS[owner]["Debit"], debit)
        rest = total - credit - debit
        etc = round_to(max(0, min(rest, rng.uniform(80_000, 220_000))), 10)
        if owner == "bbang" and ym == last:  # 매핑 테이블에 없는 새 결제수단 → Unmapped 경고 시연
            new_pay = round_to(etc * 0.3, 10)
            out.append({"ym": ym, "owner": owner, "pm": "새 간편결제", "group": "Unmapped", "amount": new_pay})
            etc -= new_pay
        if etc:
            out.append({"ym": ym, "owner": owner, "pm": DEMO_OTHER[owner]["Etc"], "group": "Etc", "amount": etc})
        left = rest - etc - (new_pay if owner == "bbang" and ym == last else 0)
        if left:
            out.append({"ym": ym, "owner": owner, "pm": DEMO_OTHER[owner]["Account"], "group": "Account", "amount": left})

    # 사용 현황 — 지출이 있던 달 × 월 건수 (계좌는 이체 건수도 더함)
    usage: dict[tuple[str, str, str], dict] = {}
    for r in out:
        k = (r["owner"], r["pm"], r["group"])
        u = usage.setdefault(k, {"months": [], "n_expense": 0})
        u["months"].append(r["ym"])
        u["n_expense"] += rng.randint(2, 4) if r["pm"] == "새 간편결제" else rng.randint(6, 28)
    for owner, name, group in DEMO_NO_EXPENSE:
        usage[(owner, name, group)] = {"months": months[::3] + [last], "n_expense": 0}
    usage[("bbyak", "새 적금통장", "Account")] = {"months": [last], "n_expense": 0}  # 신규
    summary = []
    for (owner, name, group), u in sorted(usage.items()):
        ms = sorted(set(u["months"]))
        extra = rng.randint(3, 9) * len(ms) if group in ("Account", "Cash", "Etc") else 0
        summary.append({
            "owner": owner, "pm": name, "group": group,
            "n": u["n_expense"] + extra, "n_expense": u["n_expense"],
            "first_date": f"{ms[0]}-{rng.randint(1, 9):02d}",
            "last_date": f"{ms[-1]}-{rng.randint(18, 28):02d}",
        })
    summary.sort(key=lambda r: (r["owner"], -r["n"]))
    return summary, out


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
    # 항목별 지출 — 별도 난수로 생성해 기존 섹션 값은 바뀌지 않게
    snapshot["expense_item"] = gen_expense_items(random.Random(a.seed + 202), snapshot["ledger"])
    # 결제수단 매핑 현황·지출 — 별도 난수 (기존 섹션 값은 그대로)
    snapshot["payment_method"], snapshot["payment_method_expense"] = gen_payment_methods(
        random.Random(a.seed + 303), snapshot["ledger"], snapshot["year_end_monthly"]
    )

    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(snapshot, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✅ 데모 스냅샷 생성: {a.out} ({len(months)}개월, seed={a.seed})")


if __name__ == "__main__":
    main()
