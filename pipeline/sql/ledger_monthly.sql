-- Ledger (가계부) : 거래일(txn_date) 기준 월 × owner × 구분 × 대분류(category_main) 금액
--
-- 웹앱의 category_main 필터를 위해 카테고리 단위로 내보낸다. (합계는 웹앱에서 계산)
-- kind 규칙
--   income       : txn_type = '수입'
--   expense      : txn_type = '지출'  → 원천은 지출이 음수, 환불이 양수라서 -SUM(amount) 로 양수화
--                  단, 2021-08 ~ 2025-01 은 결제수단 없이 월 합계 1행이 '양수'로 적재되어 있어 그대로 사용
--   transfer_in  : txn_type = '이체' AND amount > 0   (KPI 정의서의 '이체(수입)')
--   transfer_out : txn_type = '이체' AND amount < 0   (KPI 정의서의 '이체(지출)', 양수로 저장)
SELECT
  FORMAT_DATE('%Y-%m', txn_date)                     AS ym,
  owner,
  CASE
    WHEN txn_type = '수입' THEN 'income'
    WHEN txn_type = '지출' THEN 'expense'
    WHEN txn_type = '이체' AND amount > 0 THEN 'transfer_in'
    WHEN txn_type = '이체' AND amount < 0 THEN 'transfer_out'
  END                                                AS kind,
  COALESCE(NULLIF(TRIM(category_main), ''), '미분류') AS category,
  -- 지출·이체(지출)은 부호를 뒤집어 모두 양수로 저장
  SUM(
    CASE
      WHEN txn_type = '지출' AND NULLIF(TRIM(payment_method), '') IS NULL AND txn_date <= DATE '2025-01-31' THEN ABS(amount)
      WHEN txn_type = '지출' OR (txn_type = '이체' AND amount < 0) THEN -amount
      ELSE amount
    END
  ) AS amount
FROM `{project}.{dataset}.{prefix}ledger_detail`
WHERE txn_date IS NOT NULL
  AND owner IS NOT NULL
  AND txn_type IN ('수입', '지출', '이체')
  AND amount != 0
GROUP BY ym, owner, kind, category
ORDER BY ym, owner, kind, category
