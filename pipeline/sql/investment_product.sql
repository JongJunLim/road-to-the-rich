-- Investment 화면 (종목별) : 월 × owner × 종목, owner 별 월 마지막 스냅샷 기준 원금·평가금
--
-- - 같은 종목을 여러 증권사에 나눠 보유하면 종목명 기준으로 합산 (예: 삼성전자 NH + KB)
-- - 수익률은 계산하지 않음 → Owner 합산·종목 선택 후 웹앱에서 합계로 다시 계산 (비율끼리 더하면 틀림)
-- - 2025-01 ~ 2026-01 은 종목 구분 없이 'total' 1행으로 적재되어 있어 이름을 바꿔 표시
-- - 참고 쿼리(월 전체 SUM)와 달리 "월 마지막 스냅샷"만 사용 → 한 달에 스냅샷이 여러 번 있어도 중복 합산되지 않음
--   (현재는 owner·월마다 스냅샷이 1개라 결과는 동일)
WITH latest_snapshot AS (
  SELECT
    owner,
    FORMAT_DATE('%Y-%m', DATE(snapshot_datetime)) AS ym,
    MAX(snapshot_datetime) AS snapshot_datetime
  FROM `{project}.{dataset}.{prefix}investment_status`
  WHERE owner IS NOT NULL
  GROUP BY 1, 2
)
SELECT
  l.ym,
  l.owner,
  CASE
    WHEN LOWER(TRIM(i.product_name)) = 'total' THEN '종목 합산 (구분 전)'
    ELSE COALESCE(NULLIF(TRIM(i.product_name), ''), '(이름 없음)')
  END AS product,
  SUM(i.principal)        AS principal,
  SUM(i.valuation_amount) AS valuation
FROM `{project}.{dataset}.{prefix}investment_status` i
JOIN latest_snapshot l USING (owner, snapshot_datetime)
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3
