-- Investment (투자) : 월 × owner 별 마지막 스냅샷 기준 원금·평가금
-- 수익률(return_rate)은 여기서 계산하지 않음.
--   Owner '전체' 선택 시 두 사람의 비율을 더하면 틀리므로, 웹앱에서 합계로부터 다시 계산한다.
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
  SUM(i.principal)        AS principal,
  SUM(i.valuation_amount) AS valuation
FROM `{project}.{dataset}.{prefix}investment_status` i
JOIN latest_snapshot l USING (owner, snapshot_datetime)
GROUP BY 1, 2
ORDER BY 1, 2
