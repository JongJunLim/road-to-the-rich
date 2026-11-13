-- Year End Tax Settlement (화면 2) — 연도 × 월 × owner × 지표, 원 단위
--
-- metric
--   gross     총급여      급여명세서 category2='지급'. 귀속연도(fiscal_year) 기준
--   tax_paid  기납세액    급여명세서 category3 IN ('소득세','주민세(지방소득세)') — 연말정산 정산분 제외
--   net       실수령액    가계부 수입 중 급여·상여금. 1월에 받은 상여금은 전년도 12월로 귀속
--   credit    신용카드    가계부 지출 중 신용카드·간편결제 (양수로 변환)
--   debit     직불카드    가계부 지출 중 체크카드 (양수로 변환)
--   card_legacy  카드(구분 불가)  2021-08 ~ 2025-01 은 결제수단 정보가 없음(payment_method NULL, 월 합계 1행)
--                → 카드 지출 합계·연도별 추이에만 포함, 신용/직불 비중에는 제외
--                ⚠ 이 기간 행은 지출인데도 금액이 양수로 적재되어 있어 ABS 로 집계
--
-- ⚠ 급여명세서에는 owner 컬럼이 없음 → 현재는 빵준(bbang) 명세서만 적재되어 있어 'bbang' 으로 고정
-- ⚠ 결제수단 → 그룹은 BigQuery 매핑 테이블 banksalad_prd.payment_method_map
WITH pay AS (
  SELECT
    SAFE_CAST(fiscal_year AS INT64) AS year,
    -- 다음 해에 지급된 전년도 귀속분(예: 1월 성과급)은 귀속연도의 12월로 표시
    CASE
      WHEN EXTRACT(YEAR FROM payment_date) > SAFE_CAST(fiscal_year AS INT64) THEN 12
      WHEN EXTRACT(YEAR FROM payment_date) < SAFE_CAST(fiscal_year AS INT64) THEN 1
      ELSE EXTRACT(MONTH FROM payment_date)
    END AS month,
    category2,
    TRIM(category3) AS category3,
    amount
  FROM `{project}.{dataset}.{prefix}pay_slip`
  WHERE payment_date IS NOT NULL AND SAFE_CAST(fiscal_year AS INT64) IS NOT NULL
),
ledger AS (
  SELECT
    owner,
    txn_type,
    category_main,
    TRIM(payment_method) AS pm,
    amount,
    CASE
      WHEN txn_type = '수입' AND category_main = '상여금' AND EXTRACT(MONTH FROM txn_date) = 1
        THEN DATE_SUB(txn_date, INTERVAL 1 MONTH)  -- 매년 1월 상여금은 전년도 귀속
      ELSE txn_date
    END AS d
  FROM `{project}.{dataset}.{prefix}ledger_detail`
  WHERE txn_date IS NOT NULL AND owner IS NOT NULL AND amount IS NOT NULL
),
-- 결제수단 → 그룹: BigQuery 매핑 테이블 banksalad_prd.payment_method_map (Data Guide 화면·Tableau 와 같은 기준표)
-- 새 결제수단은 그 테이블에 한 줄 추가 (pipeline/sql/setup/payment_method_map.sql 참고). 표에 없으면 카드 지출에서 빠짐
-- 카드 지출은 Credit·Debit 만 사용 (간편결제처럼 신용/체크가 섞인 결제수단은 Etc → 제외)
pm_group AS (
  SELECT TRIM(payment_method) AS pm, ANY_VALUE(pm_group) AS grp
  FROM `{project}.banksalad_prd.payment_method_map`
  GROUP BY pm
),
card AS (
  SELECT
    l.owner, l.d, l.amount,
    CASE g.grp WHEN 'Credit' THEN 'credit' WHEN 'Debit' THEN 'debit' END AS metric
  FROM ledger AS l
  JOIN pm_group AS g ON g.pm = l.pm
  WHERE l.txn_type = '지출'
)
SELECT year, month, 'bbang' AS owner, 'gross' AS metric, SUM(amount) AS amount
FROM pay WHERE category2 = '지급'
GROUP BY year, month

UNION ALL
SELECT year, month, 'bbang', 'tax_paid', SUM(amount)
FROM pay WHERE category2 = '공제' AND category3 IN ('소득세', '주민세(지방소득세)')
GROUP BY year, month

UNION ALL
SELECT EXTRACT(YEAR FROM d), EXTRACT(MONTH FROM d), owner, 'net', SUM(amount)
FROM ledger WHERE txn_type = '수입' AND category_main IN ('급여', '상여금')
GROUP BY 1, 2, 3

UNION ALL
SELECT EXTRACT(YEAR FROM d), EXTRACT(MONTH FROM d), owner, metric, -SUM(amount)
FROM card WHERE metric IS NOT NULL
GROUP BY 1, 2, 3, 4

UNION ALL
SELECT EXTRACT(YEAR FROM d), EXTRACT(MONTH FROM d), owner, 'card_legacy', SUM(ABS(amount))
FROM ledger
WHERE txn_type = '지출' AND (pm IS NULL OR pm = '') AND d BETWEEN DATE '2021-08-01' AND DATE '2025-01-31'
GROUP BY 1, 2, 3
