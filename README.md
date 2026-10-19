# Road To The Rich

뱅크샐러드 → GCS → Cloud Run → BigQuery 파이프라인 위에 올린 **부부 자산·가계부 웹 대시보드**.
Tableau Desktop 라이선스 없이, 모바일·태블릿·PC 한 코드로 동작합니다.

```
BigQuery PRD ──(export_snapshot.py)──▶ GCS 비공개 버킷 latest.json ──▶ Next.js (Cloud Run) ──▶ 📱💻
                                         ▲
                     generate_demo.py ───┘ 같은 스키마의 합성 데이터 (개발·공개 데모용)
```

## 폴더 구조

| 경로 | 역할 |
|---|---|
| `pipeline/sql/*.sql` | KPI 정의서 기반 마트 쿼리 — 화면 1: asset / investment / ledger, 화면 2: year_end_monthly / year_end_annual |
| `pipeline/export_snapshot.py` | 마트 → 스냅샷 JSON (로컬 파일 또는 GCS 업로드) |
| `pipeline/generate_demo.py` | 합성 데이터 생성 (실데이터와 동일 스키마) |
| `web/lib/schema.ts` | 📌 **데이터 계약 v2** — 파이프라인과 웹앱의 유일한 약속 (가계부는 월×owner×구분×대분류 행) |
| `web/lib/metrics.ts` | 화면 1 KPI 계산 (MoM, 수익률, Owner 합산, 가계부 기준월, 카테고리 필터) |
| `web/lib/yearEnd.ts` | 화면 2 KPI 계산 (전년 동기 YoY, 원천징수영수증 대체, 카드 누적) |
| `web/lib/plan.ts` · `planStore.ts` | 화면 3 계획표 검증·합계 / 저장소 (로컬 파일 또는 GCS, 동시 수정 보호) |
| `web/app/api/plan/route.ts` | 화면 3 저장 API (`PUT`, 편집자만) |
| `web/lib/*.test.ts` | KPI·필터 규칙 회귀 테스트 (`npm test`) |
| `web/components/` | KPI 카드, 차트 카드, ECharts 차트 3종 |

## 화면

| 경로 | 화면 | 데이터 |
|---|---|---|
| `/` | Road To The Rich — 자산 · 투자 · 가계부 | asset / investment / ledger |
| `/year-end` | Year End Tax Settlement — 급여 · 실수령 · 세금 · 카드 지출 | year_end_monthly / year_end_annual (스냅샷 v3) |
| `/plan` | Monthly Plan — 월 고정 수익 · 저축 · 지출 계획표 (웹에서 직접 수정) | `PLAN_SOURCE` (`gs://…/app/plan.json`) — BigQuery·스냅샷과 무관 |

> 화면 3은 화면 1·2와 반대 방향입니다. 사람이 웹에서 입력 → `PUT /api/plan` → GCS `app/plan.json` 저장 (현재 상태 하나만 유지, 실수 복구는 GCS 객체 버전 관리). `EDITOR_EMAILS` 계정만 수정하고 나머지 허용 계정은 보기만 합니다.
>
> 웹은 v2·v3 스냅샷을 모두 읽습니다. 운영 스냅샷이 v2(화면 2 데이터 없음)여도 화면 1은 정상이고, 화면 2는 "데이터 없음" 안내를 보여줍니다.

## 두 가지 버전 — 데모(포트폴리오) / 실데이터(우리집)

같은 코드에서 데이터만 바꿔 두 버전을 띄웁니다. 두 서버를 **동시에** 켜서 비교할 수도 있습니다.

| 버전 | 명령 | 주소 | 데이터 |
|---|---|---|---|
| 데모 (포트폴리오) | `npm run dev` | http://localhost:3000 | `web/data/demo-snapshot.json` (합성) |
| 실데이터 (로컬 확인) | `npm run dev:real` | http://localhost:3001 | `web/.private/snapshot.json` (BigQuery PRD) |

### 처음 한 번

```bash
cd web
npm install
pip install -r ../pipeline/requirements.txt     # 실데이터용
gcloud auth application-default login           # 실데이터용 (브라우저로 Google 로그인)
```

### 실데이터 보기

```bash
npm run data:real      # GCS의 운영 스냅샷(latest.json) → .private/snapshot.json  (BigQuery 직접 생성: npm run data:real -- bq)
npm run dev:real       # http://localhost:3001
```

매월 `rttr-publish` Job 실행 후 `npm run data:real` 만 다시 실행하고 브라우저를 새로고침하면 반영됩니다. (회사망처럼 SSL 검사가 있는 환경에서도 동작 — gcloud 사용)

**아직 운영에 반영하지 않은 SQL(예: 화면 2)을 로컬에서 확인할 때**는 BigQuery 에서 직접 만듭니다.

```bash
pip install truststore            # 회사망 SSL 검사 환경에서만 (처음 한 번)
npm run data:real -- bq           # 로컬 SQL 로 .private/snapshot.json 생성 (운영 파일은 건드리지 않음)
```

> 🔒 `.private/` 폴더는 `.gitignore`·`.dockerignore`에 포함되어 커밋·배포 이미지에 들어가지 않습니다. 실데이터 화면은 스크린샷·공유에 주의하세요.

### 기타

```bash
npm test               # KPI·카테고리 필터·전월 비교 규칙 테스트
npm run demo:data      # 데모 데이터 재생성
```

## 파이프라인 직접 실행

```bash
cd pipeline
python export_snapshot.py --env prd --out ../web/.private/snapshot.json              # = npm run data:real
python export_snapshot.py --env prd --gcs gs://<비공개버킷>/snapshot/latest.json       # 운영 업로드
```

`--env dev` 는 `banksalad.*`, `--env prd` 는 `banksalad_prd.prd_*` 테이블을 읽습니다. 모든 테이블에 `owner` 컬럼이 필요하며, 등록되지 않은 owner 나 NULL 이 섞이면 업로드 전에 실패합니다.

## 월간 반영 자동화 (Cloud Run Job `rttr-publish`)

`pipeline/publish.py` 가 **DEV → PRD 반영(트랜잭션)** 과 **스냅샷 생성**을 한 번에 실행합니다.
버킷·권한·배포 명령은 [`pipeline/DEPLOY_PUBLISH_JOB.md`](pipeline/DEPLOY_PUBLISH_JOB.md) 참고.

월간 순서: ZIP 업로드 → ETL Job(DEV) → **rttr-publish Job** → 웹앱 반영

```bash
cd pipeline
python publish.py --dry-run     # 반영될 행 수만 확인 (변경 없음)
```

## 로그인 (Google + 허용 목록)

- 실데이터 모드는 **허용된 Google 계정만** 볼 수 있습니다. 데모 모드는 로그인 없이 공개.
- 흐름: 브라우저 Firebase 로그인 → ID 토큰 → `/api/session` 에서 서버가 검증(Google 로그인·이메일 인증·허용 목록) → httpOnly 쿠키
- 페이지는 요청마다 쿠키 토큰을 다시 검증하고, **통과하기 전에는 스냅샷을 읽지도 브라우저로 보내지도 않습니다.**
- 로컬: `npm run dev:real` 은 로그인이 켜진 상태로 실행됩니다 (`web/.env.local` 필요 — `FIREBASE_*`, `ALLOWED_EMAILS`).
- 허용 계정 추가: `ALLOWED_EMAILS=a@gmail.com,b@gmail.com` (로컬은 `.env.local`, 운영은 Cloud Run 환경변수).

## 환경변수 (`web/.env.example`)

| 변수 | 설명 |
|---|---|
| `DATA_MODE` | `demo`(기본) / `private` |
| `SNAPSHOT_SOURCE` | private 모드의 스냅샷 위치 — 로컬 파일 경로 또는 `gs://bucket/path.json` |
| `AUTH_ENABLED` | `true` 면 Google 로그인 + 허용 목록 검사. production + private 조합은 이 값이 없으면 로딩 거부 |
| `ALLOWED_EMAILS` | 접속 허용 Google 계정 (쉼표 구분) |
| `EDITOR_EMAILS` | 화면 3을 수정할 수 있는 계정 (비어 있으면 모두 보기 전용) |
| `PLAN_SOURCE` | 화면 3 저장 위치 — 로컬 `.private/plan.json`(dev:real 자동) / 운영 `gs://bucket/app/plan.json` |
| `FIREBASE_API_KEY` · `FIREBASE_AUTH_DOMAIN` · `FIREBASE_PROJECT_ID` · `FIREBASE_APP_ID` | Firebase 웹 앱 설정 (공개 식별자). 운영은 `FIREBASE_AUTH_DOMAIN=self` → 접속 주소의 `/__/auth` 프록시로 로그인 (iPhone Safari 저장소 분리 대응) |

## 배포 (Cloud Run)

- **실데이터 (로그인 필수)**: [`web/DEPLOY_WEB.md`](web/DEPLOY_WEB.md) — 서비스 `rttr-web`, 버킷 읽기 전용 서비스 계정
- **데모 (공개)**: 아래 명령

```bash
cd web
gcloud run deploy road-to-the-rich-demo --source . --region asia-northeast3 --allow-unauthenticated
```

## KPI 규칙 요약

- 자산·투자: 월별 **마지막 스냅샷** 기준
- 수입·지출: 거래일 기준, 지출은 양수로 변환(`-SUM(amount)`), 이체는 부호로 이체(수입)/이체(지출) 분리
- **카테고리 필터(category_main)**: 수입·지출·이체 그룹별 다중 선택. 그룹에서 아무것도 고르지 않으면 그 그룹 전체 합산
  - 기본값: 수입 = `급여`·`상여금`, 지출·이체 = 전체 → KPI(수입·지출)와 가계부 추이 차트에 함께 적용
- 선택한 달에 가계부가 없으면 0 대신 **가장 최근 달**을 보여주고 "N월 기준" 배지 표시
- 수익률 = (평가금 − 원금) ÷ 원금, **Owner 합산 후 재계산** (비율은 더하지 않음)
- 전월 대비는 **같은 사람끼리만** 비교 (한 사람의 데이터가 이번 달부터 시작되면 증감에서 제외하고 "○○ 전월 없음" 표시)
- 증감 색: 좋은 방향 파랑 / 나쁜 방향 빨강 + ▲▼ (지출은 감소가 좋은 방향)
