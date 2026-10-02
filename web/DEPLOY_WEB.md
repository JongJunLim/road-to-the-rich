# 웹앱 배포 가이드 (C단계 — 실데이터, 로그인 필수)

Cloud Run 서비스 `rttr-web` 으로 실데이터 대시보드를 배포합니다.
누구나 주소에 접속은 할 수 있지만, **허용된 Google 계정으로 로그인해야만** 데이터가 보입니다.

```
폰·PC 브라우저 ──▶ rttr-web (Cloud Run, 서울)
                     ├─ Google 로그인 확인 (Firebase)
                     └─ 통과 시에만 gs://…-rttr-snapshot/snapshot/latest.json 읽기 (읽기 전용 권한)
```

## 최초 1회 (Windows 명령 프롬프트, `web` 폴더에서)

```bat
set PROJECT=project-7fa653f6-d7a3-40a0-893
set REGION=asia-northeast3
set BUCKET=%PROJECT%-rttr-snapshot
set WEB_SA=rttr-web@%PROJECT%.iam.gserviceaccount.com
gcloud config set project %PROJECT%
```

### 1) 웹 서버 전용 서비스 계정 — 스냅샷 버킷 "읽기"만

```bat
gcloud iam service-accounts create rttr-web --display-name="Road To The Rich web"
gcloud storage buckets add-iam-policy-binding gs://%BUCKET% --member=serviceAccount:%WEB_SA% --role=roles/storage.objectViewer
```

- BigQuery·DEV·PRD 권한은 **주지 않습니다.** 웹 서버가 뚫려도 월별 합계 파일 하나만 읽을 수 있습니다.

### 2) 환경변수 확인

`deploy/private.env.yaml` 을 열어 값을 확인합니다. (허용 이메일, Firebase 설정, 스냅샷 위치)
와이프 계정은 나중에 `ALLOWED_EMAILS: "a@gmail.com,b@gmail.com"` 처럼 추가합니다.

### 3) 배포

```bat
gcloud run deploy rttr-web --source . --region %REGION% --service-account %WEB_SA% --env-vars-file deploy/private.env.yaml --allow-unauthenticated --memory 512Mi --max-instances 2
```

| 옵션 | 이유 |
|---|---|
| `--allow-unauthenticated` | 브라우저가 로그인 화면까지 들어올 수 있게 함 (데이터 보호는 앱의 Google 로그인이 담당) |
| `--max-instances 2` | 트래픽 폭주·오작동 시에도 비용 상한 |
| 최소 인스턴스 기본값 0 | 안 쓸 때 요금 0원 (첫 접속만 1~3초 느림) |

처음에는 빌드에 3~6분 걸립니다. 끝나면 `Service URL: https://rttr-web-xxxxx.asia-northeast3.run.app` 이 출력됩니다.

### 4) Firebase 에 배포 주소 등록 (안 하면 로그인 창에서 `auth/unauthorized-domain` 오류)

Firebase 콘솔 → **Authentication → 설정 → 승인된 도메인 → 도메인 추가**
→ `rttr-web-xxxxx.asia-northeast3.run.app` (https:// 없이, 3)에서 나온 주소)

### 4-1) 모바일 로그인용 리디렉션 주소 등록 (iPhone Safari 대응)

`deploy/private.env.yaml` 의 `FIREBASE_AUTH_DOMAIN: "self"` 설정으로 로그인 핸들러가 **우리 앱 주소**(`/__/auth/handler`)에서 동작합니다.
Google 에 이 주소를 알려줘야 합니다.

GCP 콘솔 → **API 및 서비스 → 사용자 인증 정보** → OAuth 2.0 클라이언트 ID 중
**"Web client (auto created by Google Service)"** 클릭

| 항목 | 추가할 값 |
|---|---|
| 승인된 JavaScript 원본 | `https://rttr-web-xxxxx.asia-northeast3.run.app` |
| 승인된 리디렉션 URI | `https://rttr-web-xxxxx.asia-northeast3.run.app/__/auth/handler` |

저장 후 반영까지 5분~몇 시간 걸릴 수 있습니다. (안 되면 `redirect_uri_mismatch` 오류)

### 5) 확인

1. PC 브라우저에서 Service URL 접속 → 로그인 → 대시보드
2. 폰의 **Safari / Chrome 에서 직접** 접속 (노션·카카오톡 링크로 열면 앱 내 브라우저라 Google 이 로그인을 막음) → 로그인 → 대시보드 → 공유 메뉴의 **"홈 화면에 추가"** (앱처럼 설치)
3. 허용되지 않은 계정으로 로그인 → "접근 권한이 없어요" 확인
4. 시크릿 창에서 로그인 없이 접속 → 로그인 화면만 보이는지 확인

## 이후 운영

| 할 일 | 명령 |
|---|---|
| 매월 데이터 갱신 | `rttr-publish` Job 실행만 하면 됨 (웹은 최대 10분 안에 새 파일을 읽음) |
| 코드 수정 반영 | 3) 배포 명령 다시 실행 |
| 허용 계정 변경 | `deploy/private.env.yaml` 수정 후 3) 배포 명령 다시 실행 |
| 로그 보기 | 콘솔 → Cloud Run → `rttr-web` → 로그 |

## 막힐 때

| 증상 | 조치 |
|---|---|
| 배포 중 `Setting IAM policy failed` / `allUsers` 관련 오류 | 조직 정책(도메인 제한 공유)이 공개 접속을 막는 경우 → 아래 명령으로 대체 |
| 로그인 창에 `auth/unauthorized-domain` | 4) 승인된 도메인 등록 확인 |
| 모바일에서 `missing initial state` | `FIREBASE_AUTH_DOMAIN: "self"` 로 재배포했는지, 4-1) 리디렉션 URI 등록 확인 |
| `redirect_uri_mismatch` / `Error 400` | 4-1) 주소 오타(끝의 `/__/auth/handler`) 확인, 등록 직후면 잠시 뒤 재시도 |
| `403 disallowed_useragent` | 앱 내 브라우저 → "브라우저로 열기" 로 Safari·Chrome 에서 열기 |
| 로그인 후 "데이터를 불러오지 못했어요" | 1)의 버킷 읽기 권한, `SNAPSHOT_SOURCE` 경로 확인 |

조직 정책으로 `--allow-unauthenticated` 가 막히면:

```bat
gcloud run services update rttr-web --region %REGION% --no-invoker-iam-check
```

(Cloud Run 자체의 호출자 확인을 끄고, 접근 통제는 앱의 Google 로그인에 맡기는 방식 — 이 앱은 원래 그렇게 설계됨)
