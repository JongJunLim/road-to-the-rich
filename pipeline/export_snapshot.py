"""
BigQuery 마트 → snapshot JSON 내보내기 (Road To The Rich 웹앱용 데이터 계약 v3)

v3: 화면 2(Year End Tax Settlement)용 year_end_monthly / year_end_annual 섹션 추가
    + Investment 화면용 investment_product (월 × owner × 종목) — 선택 섹션이라 버전은 그대로 3

실행
  pip install -r requirements.txt
  gcloud auth application-default login          # 로컬 실행 시
  python export_snapshot.py --env dev --out ./latest.json                 # dev 테이블로 확인
  python export_snapshot.py --env prd --gcs gs://<비공개버킷>/snapshot/latest.json   # 운영

--env 별 테이블
  dev : banksalad.finance_status / investment_status / ledger_detail / pay_slip / tax_withholding_summary
  prd : banksalad_prd.prd_ (위와 같은 이름에 prd_ 접두어)
  (BQ_PROJECT, BQ_DATASET, BQ_TABLE_PREFIX 환경변수로 덮어쓸 수 있음)

기존 Cloud Run 파이프라인의 마지막 단계(BigQuery PRD 적재 직후)에서 호출하면 된다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

from google.cloud import bigquery

# 회사망처럼 SSL 검사(사내 인증서)가 있는 PC에서 로컬 실행할 때:
#   pip install truststore  → Windows/macOS 인증서 저장소를 그대로 사용 (gcloud 가 되는 환경이면 동작)
# 설치하지 않았거나 Cloud Run 에서는 아무 일도 하지 않음
try:
    import truststore

    truststore.inject_into_ssl()
except ImportError:
    pass

SQL_DIR = Path(__file__).parent / "sql"
KST = timezone(timedelta(hours=9))

PROJECT = os.getenv("BQ_PROJECT", "project-7fa653f6-d7a3-40a0-893")
ENVIRONMENTS = {
    "dev": {"dataset": "banksalad", "prefix": ""},
    "prd": {"dataset": "banksalad_prd", "prefix": "prd_"},
}

# 스냅샷 섹션 이름 → (SQL 파일, 정수로 반올림할 숫자 컬럼, 0행이면 실패시킬지)
YEAR_END_ANNUAL_COLS = [
    "gross_pay", "tax_paid", "income_deduction", "tax_base", "calculated_tax",
    "tax_reduction", "tax_credit", "determined_tax", "refund_or_additional",
]
SECTIONS = {
    "asset":            ("asset_monthly.sql",      ["asset"], True),
    "investment":       ("investment_monthly.sql", ["principal", "valuation"], True),
    "ledger":           ("ledger_monthly.sql",     ["amount"], True),
    # 화면 2 — 급여명세서·원천징수영수증이 비어 있어도 화면 1 갱신은 막지 않음
    "year_end_monthly": ("year_end_monthly.sql",   ["amount"], False),
    "year_end_annual":  ("year_end_annual.sql",    YEAR_END_ANNUAL_COLS, False),
    # Investment 화면 — 종목별 원금·평가금 (비어 있어도 다른 화면 갱신은 막지 않음)
    "investment_product": ("investment_product.sql", ["principal", "valuation"], False),
}
LEDGER_KINDS = {"income", "expense", "transfer_in", "transfer_out"}
YEAR_END_METRICS = {"gross", "tax_paid", "net", "credit", "debit", "card_legacy"}

OWNERS = [
    {"id": "bbang", "label": "빵준"},
    {"id": "bbyak", "label": "또용"},
]

UPDATED_AT_SQL = """
SELECT MAX(ts) AS ts FROM (
  SELECT DATETIME(MAX(snapshot_datetime), 'Asia/Seoul') AS ts FROM `{project}.{dataset}.{prefix}finance_status`
  UNION ALL SELECT MAX(snapshot_datetime) FROM `{project}.{dataset}.{prefix}investment_status`
  UNION ALL SELECT MAX(snapshot_datetime) FROM `{project}.{dataset}.{prefix}ledger_detail`
)
"""


QUERY_TIMEOUT_SEC = int(os.getenv("QUERY_TIMEOUT_SEC", "180"))
CONFIG = {"dataset": "", "prefix": ""}  # main()에서 --env 로 채움


def configure(env: str) -> None:
    cfg = ENVIRONMENTS[env]
    CONFIG["dataset"] = os.getenv("BQ_DATASET", cfg["dataset"])
    CONFIG["prefix"] = os.getenv("BQ_TABLE_PREFIX", cfg["prefix"])


def render(sql: str) -> str:
    return (sql.replace("{project}", PROJECT)
               .replace("{dataset}", CONFIG["dataset"])
               .replace("{prefix}", CONFIG["prefix"]))


def run_section(client: bigquery.Client, name: str) -> list[dict]:
    file_name, numeric_cols, required = SECTIONS[name]
    sql = render((SQL_DIR / file_name).read_text(encoding="utf-8"))
    print(f"  … {name} 조회 중", file=sys.stderr, flush=True)
    try:
        job = client.query(sql, timeout=60)  # 쿼리 전송 단계도 무한 대기하지 않게
    except Exception as exc:
        raise RuntimeError(
            f"{name}: BigQuery 에 쿼리를 보내지 못했습니다 (60초 응답 없음) — {exc}\n"
            "    회사망 보안 장비가 이 요청을 막는 경우일 수 있습니다. 다른 네트워크(핫스팟)나 Cloud Shell 에서 실행해 보세요."
        ) from exc
    try:
        result = job.result(timeout=QUERY_TIMEOUT_SEC)  # 무한 대기 방지
    except Exception as exc:
        raise RuntimeError(f"{name}: 쿼리 실패/시간 초과 (job_id={job.job_id}) — {exc}") from exc
    rows = []
    for r in result:
        row = dict(r)
        for col in numeric_cols:
            # 금액은 원 단위 정수로 통일 (FLOAT 자산 금액 소수점 제거), NULL은 0
            row[col] = int(round(row[col] or 0))
        rows.append(row)
    if not rows:
        if required:
            raise RuntimeError(f"{name}: 결과가 0행입니다. 원천 테이블 적재를 확인하세요.")
        print(f"  ⚠ {name}: 0행 (원천 테이블이 비어 있음 — 해당 화면은 '데이터 없음'으로 표시)", file=sys.stderr)
        return rows
    validate_rows(name, rows)
    return rows


def validate_rows(name: str, rows: list[dict]) -> None:
    """데이터 계약 위반은 업로드 전에 실패시켜 화면이 깨지지 않게 한다."""
    known = {o["id"] for o in OWNERS}
    unknown = {r["owner"] for r in rows} - known
    if unknown:
        raise RuntimeError(f"{name}: 등록되지 않은 owner {unknown} — OWNERS 목록 또는 원천 데이터를 확인하세요.")
    if name == "ledger":
        bad = {r["kind"] for r in rows} - LEDGER_KINDS
        if bad:
            raise RuntimeError(f"ledger: 알 수 없는 kind {bad}")
    if name == "investment_product":
        bad = [r for r in rows if not str(r.get("product") or "").strip()]
        if bad:
            raise RuntimeError(f"investment_product: 종목명이 빈 행 {bad[:3]}")
    if name == "year_end_monthly":
        bad = {r["metric"] for r in rows} - YEAR_END_METRICS
        if bad:
            raise RuntimeError(f"year_end_monthly: 알 수 없는 metric {bad}")
        bad_month = [r for r in rows if not (1 <= int(r["month"]) <= 12)]
        if bad_month:
            raise RuntimeError(f"year_end_monthly: 잘못된 월 {bad_month[:3]}")


def build_snapshot(client: bigquery.Client) -> dict:
    snapshot: dict = {
        "version": 3,
        "source": "banksalad",
        "generated_at": datetime.now(KST).isoformat(timespec="seconds"),
        "owners": OWNERS,
    }
    updated = list(client.query(render(UPDATED_AT_SQL)).result())[0]["ts"]
    snapshot["data_updated_at"] = updated.isoformat(timespec="seconds") if updated else None

    for name in SECTIONS:
        snapshot[name] = run_section(client, name)
        print(f"  ✓ {name}: {len(snapshot[name])}행", file=sys.stderr, flush=True)
    return snapshot


def write_output(snapshot: dict, out: str | None, gcs: str | None) -> None:
    payload = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"))
    if out:
        Path(out).write_text(payload, encoding="utf-8")
        print(f"✅ 저장: {out}", file=sys.stderr)
    if gcs:
        from google.cloud import storage  # 운영에서만 필요

        if not gcs.startswith("gs://"):
            raise ValueError("--gcs 는 gs://bucket/path 형식이어야 합니다.")
        bucket_name, _, blob_path = gcs[5:].partition("/")
        blob = storage.Client(project=PROJECT).bucket(bucket_name).blob(blob_path)
        blob.cache_control = "no-store"
        blob.upload_from_string(payload, content_type="application/json; charset=utf-8")
        print(f"✅ 업로드: {gcs}", file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(description="Road To The Rich snapshot export")
    # Cloud Run Job 에서는 인자 대신 환경변수로 설정 (SNAPSHOT_ENV / SNAPSHOT_GCS_URI / SNAPSHOT_OUT)
    parser.add_argument("--env", choices=ENVIRONMENTS.keys(), default=os.getenv("SNAPSHOT_ENV", "prd"),
                        help="dev | prd (기본 prd, 환경변수 SNAPSHOT_ENV)")
    parser.add_argument("--out", default=os.getenv("SNAPSHOT_OUT"), help="로컬 JSON 경로 (환경변수 SNAPSHOT_OUT)")
    parser.add_argument("--gcs", default=os.getenv("SNAPSHOT_GCS_URI"),
                        help="gs://bucket/path.json 비공개 버킷 (환경변수 SNAPSHOT_GCS_URI)")
    args = parser.parse_args()
    if not (args.out or args.gcs):
        parser.error("--out 또는 --gcs 중 하나는 필요합니다. (또는 환경변수 SNAPSHOT_OUT / SNAPSHOT_GCS_URI)")

    configure(args.env)
    print(f"▶ {args.env}: {PROJECT}.{CONFIG['dataset']} (prefix='{CONFIG['prefix']}')", file=sys.stderr)
    try:
        client = bigquery.Client(project=PROJECT)
        snapshot = build_snapshot(client)
        write_output(snapshot, args.out, args.gcs)
    except Exception as exc:  # 파이프라인에서 실패를 확실히 감지하도록 비정상 종료
        print(f"❌ snapshot export 실패: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
