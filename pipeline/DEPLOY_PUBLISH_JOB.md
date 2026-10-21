# 월간 반영 Job 배포 가이드 (A단계)

지금까지 BigQuery 콘솔에서 직접 실행하던 **③ DEV → PRD 반영 SQL**과 새로 필요한 **④ 스냅샷 생성**을
Cloud Run Job 하나(`rttr-publish`)로 합칩니다.

## 월간 운영 순서 (변경 후)

```
① ZIP 업로드 (GCS raw/, raw_bbyak/)
② ETL Job 실행                     → BigQuery DEV       (기존 그대로)
③ rttr-publish Job 실행 (신규)     → PRD 반영 + gs://.../snapshot/latest.json
④ 웹앱 새로고침 (C단계 이후 자동 반영)
```

## 반영 로직 (기존 콘솔 SQL과 동일 + 안전장치 2개)

| 항목 | 기존 (콘솔 수동) | rttr-publish |
|---|---|---|
| 반영 방식 | `INSERT ... WHERE NOT EXISTS (message_id, owner)` | 동일 |
| owner | owner별로 따로 실행 | 두 사람 한 번에 |
| 대상 테이블 | 4개 (finance / investment / ledger / etl_run_log) | 동일, `etl_run_log` 항상 마지막 |
| 중간 실패 시 | 일부 테이블만 반영된 채 남을 수 있음 | **트랜잭션 — 전부 성공 또는 전부 취소** |
| 불완전한 적재 | 그대로 반영될 수 있음 | **DEV `etl_run_log`에 기록된(=ETL이 끝까지 성공한) 파일만 반영** |
| 재실행 | 안전 | 안전 (이미 반영된 건 건너뜀) |

## 최초 1회 설정 (Windows 명령 프롬프트, `pipeline` 폴더에서)

```bat
set PROJECT=your-project-id
set REGION=asia-northeast3
set BUCKET=%PROJECT%-rttr-snapshot
set SA=rttr-publish@%PROJECT%.iam.gserviceaccount.com
gcloud config set project %PROJECT%
```

### 1) 비공개 버킷

```bat
gcloud storage buckets create gs://%BUCKET% --location=%REGION% --uniform-bucket-level-access --public-access-prevention
```

`--public-access-prevention`: 실수로 공개 권한을 줘도 외부 공개가 원천 차단됩니다.

### 2) 전용 서비스 계정 + 권한

```bat
gcloud iam service-accounts create rttr-publish --display-name="Road To The Rich monthly publish"

gcloud projects add-iam-policy-binding %PROJECT% --member=serviceAccount:%SA% --role=roles/bigquery.jobUser
gcloud projects add-iam-policy-binding %PROJECT% --member=serviceAccount:%SA% --role=roles/bigquery.dataViewer
gcloud storage buckets add-iam-policy-binding gs://%BUCKET% --member=serviceAccount:%SA% --role=roles/storage.objectAdmin
```

**PRD 쓰기 권한은 PRD 데이터셋에만** 줍니다. BigQuery 콘솔에서 아래 SQL을 실행하세요.

```sql
GRANT `roles/bigquery.dataEditor`
ON SCHEMA `your-project-id.banksalad_prd`
TO "serviceAccount:rttr-publish@your-project-id.iam.gserviceaccount.com";
```

| 권한 | 범위 | 용도 |
|---|---|---|
| 쿼리 실행 `jobUser` | 프로젝트 | SQL 실행 |
| 읽기 `dataViewer` | 프로젝트 | DEV·PRD 조회 |
| 쓰기 `dataEditor` | **banksalad_prd 데이터셋만** | PRD 반영 (DEV는 수정 불가) |
| 객체 관리 `objectAdmin` | **스냅샷 버킷만** | `latest.json` 덮어쓰기 |

### 3) Job 배포

```bat
gcloud run jobs deploy rttr-publish --source . --region %REGION% --service-account %SA% --set-env-vars SNAPSHOT_GCS_URI=gs://%BUCKET%/snapshot/latest.json,BQ_PROJECT=%PROJECT% --max-retries 0 --task-timeout 600
```

처음에는 이미지 빌드로 2~4분 걸립니다.

## 실행

### 처음 한 번은 dry-run 으로 확인 (아무것도 바꾸지 않음)

```bat
gcloud run jobs execute rttr-publish --region %REGION% --update-env-vars PUBLISH_DRY_RUN=true --wait
```

콘솔 → Cloud Run → 작업 → `rttr-publish` → **로그**에서 `▶ DEV → PRD 반영 대상` 목록을 확인합니다.

### 실제 실행 (매월 ② 다음)

```bat
gcloud run jobs execute rttr-publish --region %REGION% --wait
```

또는 콘솔 → Cloud Run → 작업 → `rttr-publish` → **실행**.

> 실행 명령의 `--update-env-vars` 는 **그 한 번의 실행에만** 적용됩니다. Job 기본 설정에는 dry-run 이 없으므로 콘솔 버튼은 항상 실제 실행입니다.

### 확인

```bat
gcloud storage ls -l gs://%BUCKET%/snapshot/
```

`latest.json` 시각이 방금이면 성공. 실패하면 로그의 `❌ [단계] 실패` 메시지를 확인하세요.

| 실패 단계 | 상태 | 조치 |
|---|---|---|
| DEV→PRD 반영 | 트랜잭션이라 PRD는 실행 전 그대로 | 원인 수정 후 재실행 |
| 스냅샷 생성 | PRD 반영은 완료 | 재실행하면 반영은 건너뛰고 스냅샷만 생성 |

## 코드를 수정했을 때

`publish.py`, `export_snapshot.py`, `sql/*.sql` 을 바꾸면 3)의 `deploy` 명령만 다시 실행합니다.
