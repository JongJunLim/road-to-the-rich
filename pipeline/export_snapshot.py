"""
BigQuery 마트 → snapshot JSON 내보내기 (Road To The Rich 웹앱용 데이터 계약 v2)

실행
  pip install -r requirements.txt
  gcloud auth application-default login          # 로컬 실행 시
  python export_snapshot.py --env dev --out ./latest.json                 # dev 테이블로 확인
  python export_snapshot.py --env prd --gcs gs://<비공개버킷>/snapshot/latest.json   # 운영

--env 별 테이블
  dev : banksalad.finance_status / investment_status / ledger_detail
  prd : banksalad_prd.prd_finance_status / prd_investment_status / prd_ledger_detail
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

SQL_DIR = Path(__file__).parent / "sql"
KST = timezone(timedelta(hours=9))

PROJECT = os.getenv("BQ_PROJECT", "project-7fa653f6-d7a3-40a0-893")
ENVIRONMENTS = {
    "dev": {"dataset": "banksalad", "prefix": ""},
    "prd": {"dataset": "banksalad_prd", "prefix": "prd_"},
}

# 스냅샷 섹션 이름 → SQL 파일, 정수로 반올림할 숫자 컬럼
SECTIONS = {
    "asset":      ("asset_monthly.sql",      ["asset"]),
    "investment": ("investment_monthly.sql", ["principal", "valuation"]),
    "ledger":     ("ledger_monthly.sql",     ["amount"]),
}
LEDGER_KINDS = {"income", "expense", "transfer_in", "transfer_out"}

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
    file_name, numeric_cols = SECTIONS[name]
    sql = render((SQL_DIR / file_name).read_text(encoding="utf-8"))
    rows = []
    for r in client.query(sql).result():
        row = dict(r)
        for col in numeric_cols:
            # 금액은 원 단위 정수로 통일 (FLOAT 자산 금액 소수점 제거), NULL은 0
            row[col] = int(round(row[col] or 0))
        rows.append(row)
    if not rows:
        raise RuntimeError(f"{name}: 결과가 0행입니다. 원천 테이블 적재를 확인하세요.")
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


def build_snapshot(client: bigquery.Client) -> dict:
    snapshot: dict = {
        "version": 2,
        "source": "banksalad",
        "generated_at": datetime.now(KST).isoformat(timespec="seconds"),
        "owners": OWNERS,
    }
    updated = list(client.query(render(UPDATED_AT_SQL)).result())[0]["ts"]
    snapshot["data_updated_at"] = updated.isoformat(timespec="seconds") if updated else None

    for name in SECTIONS:
        snapshot[name] = run_section(client, name)
        print(f"  ✓ {name}: {len(snapshot[name])}행", file=sys.stderr)
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
