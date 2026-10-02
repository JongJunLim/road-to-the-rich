# Road To The Rich — 월간 반영 Cloud Run Job
#   ③ DEV → PRD 반영 (트랜잭션)  +  ④ 스냅샷 생성 → gs://<비공개버킷>/snapshot/latest.json
# 설정은 환경변수로: SNAPSHOT_GCS_URI (필수), PUBLISH_DRY_RUN, PUBLISH_STEPS
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY export_snapshot.py publish.py ./
COPY sql ./sql

CMD ["python", "publish.py"]
