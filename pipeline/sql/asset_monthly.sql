-- Asset (자산) : 월 × owner 별 마지막 스냅샷 기준 자산 합계
-- KPI 정의서: asset_liability_type = 'asset' 의 월 합계
-- 두 사람의 내보내기 시점이 다를 수 있으므로 "마지막 스냅샷"은 owner 별로 따로 고른다
WITH latest_snapshot AS (
  SELECT
    owner,
    FORMAT_DATE('%Y-%m', DATE(snapshot_datetime, 'Asia/Seoul')) AS ym,
    MAX(snapshot_datetime) AS snapshot_datetime
  FROM `{project}.{dataset}.{prefix}finance_status`
  WHERE owner IS NOT NULL
  GROUP BY 1, 2
)
SELECT
  l.ym,
  l.owner,
  SUM(f.amount) AS asset
FROM `{project}.{dataset}.{prefix}finance_status` f
JOIN latest_snapshot l USING (owner, snapshot_datetime)
WHERE f.asset_liability_type = 'asset'
GROUP BY 1, 2
ORDER BY 1, 2
