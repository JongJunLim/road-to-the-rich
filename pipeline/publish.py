"""
월간 반영 Job — ③ DEV → PRD 반영 + ④ 스냅샷 생성을 한 번에

지금까지 BigQuery 콘솔에서 직접 실행하던 반영 SQL(INSERT ... WHERE NOT EXISTS message_id)을
그대로 코드로 옮기고, 두 가지 안전장치를 더했습니다.

  1) 트랜잭션: 4개 테이블 반영이 전부 성공하거나 전부 취소됨 (중간에 실패해도 PRD가 반쯤 채워지지 않음)
  2) 완료된 적재만 반영: DEV etl_run_log 에 기록된 message_id(= ETL이 끝까지 성공한 파일)만 PRD로 옮김

실행 (Cloud Run Job 환경변수)
  SNAPSHOT_GCS_URI  gs://<비공개버킷>/snapshot/latest.json   (필수)
  PUBLISH_DRY_RUN   true 면 반영될 행 수만 출력하고 아무것도 바꾸지 않음 (기본 false)
  PUBLISH_STEPS     promote,snapshot (기본) | promote | snapshot

로컬 실행
  python publish.py --dry-run
  python publish.py
"""
from __future__ import annotations

import argparse
import os
import sys

from google.cloud import bigquery

import export_snapshot as ex

PROJECT = ex.PROJECT
DEV = f"{PROJECT}.banksalad"
PRD = f"{PROJECT}.banksalad_prd"

# 반영 대상 (순서 중요: 실행 기록 etl_run_log 는 항상 마지막)
PROMOTE_TABLES: list[tuple[str, list[str]]] = [
    ("finance_status", [
        "asset_liability_type", "category", "product_name", "amount",
        "snapshot_datetime", "message_id", "owner",
    ]),
    ("investment_status", [
        "asset_type", "financial_company", "product_name", "principal", "valuation_amount",
        "return_rate", "start_date", "maturity_date", "snapshot_datetime", "message_id", "owner",
    ]),
    ("ledger_detail", [
        "txn_date", "txn_time", "txn_type", "category_main", "category_sub", "description",
        "amount", "unit", "payment_method", "memo", "snapshot_datetime", "message_id", "owner",
    ]),
    ("etl_run_log", [
        "message_id", "subject", "sender", "snapshot_datetime", "loaded_at",
        "ledger_target_year", "ledger_target_month", "loading_ledger_detail_rows", "owner",
    ]),
]


def pending_filter(table: str) -> str:
    """DEV 에는 있고 PRD 에는 아직 없는, '완료된' 적재분만 고르는 조건."""
    return f"""
    FROM `{DEV}.{table}` AS s
    WHERE s.owner IS NOT NULL
      AND s.message_id IN (SELECT message_id FROM `{DEV}.etl_run_log` WHERE owner IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM `{PRD}.prd_{table}` AS p
        WHERE p.message_id = s.message_id AND p.owner = s.owner
      )"""


def pending_counts(bq: bigquery.Client) -> dict[str, dict[str, int]]:
    """테이블 × owner 별로 반영될 행 수."""
    union = "\nUNION ALL\n".join(
        f"SELECT '{t}' AS tbl, s.owner, COUNT(*) AS n {pending_filter(t)} GROUP BY s.owner"
        for t, _ in PROMOTE_TABLES
    )
    out: dict[str, dict[str, int]] = {t: {} for t, _ in PROMOTE_TABLES}
    for r in bq.query(union).result():
        out[r["tbl"]][r["owner"]] = r["n"]
    return out


def promote_script() -> str:
    statements = []
    for table, cols in PROMOTE_TABLES:
        col_list = ", ".join(cols)
        sel_list = ", ".join(f"s.{c}" for c in cols)
        statements.append(
            f"INSERT INTO `{PRD}.prd_{table}` ({col_list})\nSELECT {sel_list}{pending_filter(table)};"
        )
    return "BEGIN TRANSACTION;\n\n" + "\n\n".join(statements) + "\n\nCOMMIT TRANSACTION;"


def promote(bq: bigquery.Client, dry_run: bool) -> int:
    counts = pending_counts(bq)
    total = sum(sum(v.values()) for v in counts.values())
    print("▶ DEV → PRD 반영 대상", file=sys.stderr)
    for table, by_owner in counts.items():
        detail = ", ".join(f"{o}={n}" for o, n in sorted(by_owner.items())) or "없음"
        print(f"   {table:<18} {detail}", file=sys.stderr)

    if total == 0:
        print("  ✓ 새로 반영할 데이터가 없습니다 (이미 반영됨).", file=sys.stderr)
        return 0
    if dry_run:
        print("  (dry-run) 실제 반영은 하지 않았습니다.", file=sys.stderr)
        return total

    bq.query(promote_script()).result()  # 트랜잭션: 실패 시 전체 롤백
    print(f"  ✓ PRD 반영 완료: {total}행", file=sys.stderr)
    return total


def snapshot(bq: bigquery.Client, gcs_uri: str | None, dry_run: bool) -> None:
    if dry_run:
        print("▶ 스냅샷: dry-run 이라 건너뜀", file=sys.stderr)
        return
    if not gcs_uri:
        raise RuntimeError("SNAPSHOT_GCS_URI 가 설정되지 않았습니다.")
    ex.configure("prd")
    print("▶ 스냅샷 생성", file=sys.stderr)
    ex.write_output(ex.build_snapshot(bq), out=None, gcs=gcs_uri)


def main() -> int:
    parser = argparse.ArgumentParser(description="DEV→PRD 반영 + 스냅샷 생성")
    parser.add_argument("--dry-run", action="store_true",
                        default=os.getenv("PUBLISH_DRY_RUN", "false").lower() == "true")
    parser.add_argument("--steps", default=os.getenv("PUBLISH_STEPS", "promote,snapshot"))
    parser.add_argument("--gcs", default=os.getenv("SNAPSHOT_GCS_URI"))
    args = parser.parse_args()
    steps = {s.strip() for s in args.steps.split(",") if s.strip()}

    stage = "준비"
    try:
        bq = bigquery.Client(project=PROJECT, location="asia-northeast3")
        if "promote" in steps:
            stage = "DEV→PRD 반영"
            promote(bq, args.dry_run)
        if "snapshot" in steps:
            stage = "스냅샷 생성"
            snapshot(bq, args.gcs, args.dry_run)
    except Exception as exc:
        print(f"❌ [{stage}] 실패: {exc}", file=sys.stderr)
        if stage == "DEV→PRD 반영":
            print("   트랜잭션이라 PRD 는 실행 전 상태 그대로입니다. 원인 확인 후 다시 실행하세요.", file=sys.stderr)
        elif stage == "스냅샷 생성":
            print("   PRD 반영은 끝났습니다. 다시 실행하면 반영은 건너뛰고 스냅샷만 새로 만듭니다.", file=sys.stderr)
        return 1
    print("✅ 월간 반영 완료", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
