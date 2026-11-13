-- Data Guide 화면 : owner × 결제수단 사용 현황 + 매핑 그룹
--
-- - 그룹은 BigQuery 매핑 테이블 banksalad_prd.payment_method_map 에서 가져옴 (DEV 실행 때도 같은 표)
-- - 매핑 표에 없는 결제수단은 'Unmapped' → 웹에서 경고
-- - 결제수단이 없는 행(2021-08 ~ 2025-01 월 합계 등)은 제외
WITH map AS (
  SELECT TRIM(payment_method) AS pm, ANY_VALUE(pm_group) AS grp
  FROM `{project}.banksalad_prd.payment_method_map`
  GROUP BY pm
)
SELECT
  l.owner,
  TRIM(l.payment_method)                       AS pm,
  COALESCE(m.grp, 'Unmapped')                  AS `group`,
  COUNT(*)                                     AS n,
  COUNTIF(l.txn_type = '지출')                 AS n_expense,
  FORMAT_DATE('%Y-%m-%d', MIN(l.txn_date))     AS first_date,
  FORMAT_DATE('%Y-%m-%d', MAX(l.txn_date))     AS last_date
FROM `{project}.{dataset}.{prefix}ledger_detail` AS l
LEFT JOIN map AS m ON m.pm = TRIM(l.payment_method)
WHERE l.owner IS NOT NULL
  AND l.txn_date IS NOT NULL
  AND NULLIF(TRIM(l.payment_method), '') IS NOT NULL
GROUP BY l.owner, pm, `group`
ORDER BY l.owner, n DESC
