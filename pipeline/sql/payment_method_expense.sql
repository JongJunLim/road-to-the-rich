-- Data Guide 화면 : 월 × owner × 결제수단 지출 순액 (카드별 지출 · 신용/체크 비율)
--
-- - 지출만, 환불 차감 순액 (-SUM(amount)) — Expense Analysis·화면 1 지출과 같은 규칙
-- - 결제수단이 기록되기 시작한 2025-02 이후만 해당 (그 전은 결제수단 NULL)
WITH map AS (
  SELECT TRIM(payment_method) AS pm, ANY_VALUE(pm_group) AS grp
  FROM `{project}.banksalad_prd.payment_method_map`
  GROUP BY pm
)
SELECT
  FORMAT_DATE('%Y-%m', l.txn_date)  AS ym,
  l.owner,
  TRIM(l.payment_method)            AS pm,
  COALESCE(m.grp, 'Unmapped')       AS `group`,
  -SUM(l.amount)                    AS amount
FROM `{project}.{dataset}.{prefix}ledger_detail` AS l
LEFT JOIN map AS m ON m.pm = TRIM(l.payment_method)
WHERE l.txn_type = '지출'
  AND l.owner IS NOT NULL
  AND l.txn_date IS NOT NULL
  AND NULLIF(TRIM(l.payment_method), '') IS NOT NULL
  AND l.amount != 0
GROUP BY ym, l.owner, pm, `group`
HAVING amount != 0
ORDER BY ym, l.owner, pm
