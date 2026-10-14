-- Year End Tax Settlement (화면 2) — 귀속연도별 원천징수영수증 요약, 원 단위
--
-- 한 해에 회사가 둘 이상이면(이직) 합산. 연말정산 전인 해(현재 연도)는 행이 없음 → 화면에서 '정산 전' 표시
-- ⚠ 원천징수영수증에도 owner 컬럼이 없어 'bbang' 으로 고정
--
-- refund_or_additional : 양수 = 추가 징수(더 냄), 음수 = 환급(돌려받음)
SELECT
  tax_year AS year,
  'bbang' AS owner,
  SUM(IFNULL(total_gross_pay, 0)) AS gross_pay,                  -- 총급여 (급여명세서가 없는 과거 연도용)
  SUM(IFNULL(total_tax_paid, 0)) AS tax_paid,                    -- 기납부세액 (급여명세서가 없는 과거 연도용)
  SUM(IFNULL(earned_income_deduction, 0)
    + IFNULL(comprehensive_income_deduction, 0)
    + IFNULL(other_income_deduction, 0)) AS income_deduction,    -- 소득공제 = 근로소득 + 종합소득 + 그 밖의 소득공제
  SUM(IFNULL(comprehensive_income_tax_base, 0)) AS tax_base,     -- 종합소득 과세표준
  SUM(IFNULL(calculated_tax_amount, 0)) AS calculated_tax,       -- 산출세액
  SUM(IFNULL(tax_reduction, 0)) AS tax_reduction,                -- 세액감면
  SUM(IFNULL(tax_credit, 0)) AS tax_credit,                      -- 세액공제
  SUM(IFNULL(final_determined_tax, 0)) AS determined_tax,        -- 결정세액 (소득세 + 지방소득세)
  SUM(IFNULL(refund_or_additional_tax, 0)) AS refund_or_additional
FROM `{project}.{dataset}.{prefix}tax_withholding_summary`
GROUP BY tax_year
