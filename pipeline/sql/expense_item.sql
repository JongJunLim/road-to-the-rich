-- Expense Analysis 화면 : 거래일(txn_date) 기준 월 × owner × 대분류 × 중분류 × 항목(description) 지출 합계
--
-- - 금액 규칙은 ledger_monthly.sql 의 expense 와 동일 → 월 × owner 합계가 화면 1 지출과 원 단위로 일치
--     · 원천은 지출이 음수, 환불이 양수 → -SUM(amount) 로 양수화 (환불은 차감된 순액)
--     · 2021-08 ~ 2025-01 은 결제수단 없이 월 합계 1행이 '양수'로 적재 → ABS 그대로
-- - 같은 달 환불이 구매보다 크면 음수가 될 수 있음 (웹에서 트리맵은 제외, 표에는 그대로 표시)
-- - 빈 값: 대분류·중분류 → '미분류', 항목 → '(내용 없음)'
SELECT
  FORMAT_DATE('%Y-%m', txn_date)                         AS ym,
  owner,
  COALESCE(NULLIF(TRIM(category_main), ''), '미분류')     AS main,
  COALESCE(NULLIF(TRIM(category_sub), ''), '미분류')      AS sub,
  COALESCE(NULLIF(TRIM(description), ''), '(내용 없음)')  AS item,
  SUM(
    CASE
      WHEN NULLIF(TRIM(payment_method), '') IS NULL AND txn_date <= DATE '2025-01-31' THEN ABS(amount)
      ELSE -amount
    END
  ) AS amount
FROM `{project}.{dataset}.{prefix}ledger_detail`
WHERE txn_type = '지출'
  AND txn_date IS NOT NULL
  AND owner IS NOT NULL
  AND amount != 0
GROUP BY ym, owner, main, sub, item
HAVING amount != 0
ORDER BY ym, owner, main, sub, item
