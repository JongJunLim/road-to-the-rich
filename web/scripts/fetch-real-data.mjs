// 로컬 확인용 실데이터 스냅샷 가져오기 → .private/snapshot.json
//
//   npm run data:real            GCS 에서 받기 (기본, 권장)
//                                 = 매월 rttr-publish Job 이 만든 운영용 파일과 똑같은 데이터
//   npm run data:real -- bq      BigQuery 에서 직접 생성 (Python 필요)
//                                 → 새 SQL(예: 화면 2)을 운영 반영 전에 로컬에서 확인할 때 사용
//                                 → 회사망 SSL 검사 환경이면 먼저 pip install truststore
//   npm run data:real -- bq dev  BigQuery dev 테이블에서 생성
//
// GCS 위치는 .env.local 의 SNAPSHOT_GCS_URI 로 바꿀 수 있음
import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (existsSync(".env.local") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env.local");

const OUT = ".private/snapshot.json";
const GCS_URI =
  process.env.SNAPSHOT_GCS_URI ?? "gs://project-7fa653f6-d7a3-40a0-893-rttr-snapshot/snapshot/latest.json";
const [mode, env] = process.argv.slice(2);
mkdirSync(".private", { recursive: true });

function done(status, hints) {
  if (status === 0) {
    console.log(`\n✅ 완료 — ${OUT}\n   npm run dev:real 로 확인하세요 (http://localhost:3001)`);
  } else {
    console.error("\n❌ 실패 — 위 메시지를 확인하세요.");
    for (const h of hints) console.error(`   · ${h}`);
  }
  process.exit(status ?? 1);
}

if (mode !== "bq") {
  // ---------- 기본: GCS 에서 다운로드 (gcloud 사용) ----------
  console.log(`▶ gcloud storage cp ${GCS_URI} ${OUT}`);
  const run = spawnSync("gcloud", ["storage", "cp", GCS_URI, OUT], { stdio: "inherit", shell: true });
  if (run.status === 0) console.log("   ℹ 운영 스냅샷입니다. 아직 운영에 반영하지 않은 SQL(예: 화면 2)은 npm run data:real -- bq 로 확인하세요.");
  done(run.status, [
    "'gcloud' 명령을 찾을 수 없음 → Google Cloud CLI 설치 후 터미널 재시작",
    "권한 오류(403) → gcloud auth login 으로 프로젝트 소유자 계정 로그인",
    "파일 없음(404) → rttr-publish Job 을 먼저 실행 (gcloud run jobs execute rttr-publish --region asia-northeast3 --wait)",
  ]);
} else {
  // ---------- 선택: BigQuery 에서 직접 생성 (Python) ----------
  const args = ["../pipeline/export_snapshot.py", "--env", env === "dev" ? "dev" : "prd", "--out", OUT];
  for (const cmd of ["python", "py", "python3"]) {
    const probe = spawnSync(cmd, ["--version"], { shell: true, encoding: "utf-8" });
    if (probe.status !== 0 || /Microsoft Store|not found/i.test(probe.stderr + probe.stdout)) continue;
    console.log(`▶ ${cmd} ${args.join(" ")}`);
    const run = spawnSync(cmd, args, { stdio: "inherit", shell: true });
    done(run.status, [
      "'No module named google' → pip install -r ../pipeline/requirements.txt",
      "인증 오류(DefaultCredentialsError) → gcloud auth application-default login",
      "CERTIFICATE_VERIFY_FAILED → 회사망 SSL 검사 때문. pip install truststore 후 다시 실행 (Windows 인증서 저장소 사용)",
    ]);
  }
  console.error("❌ Python 을 찾지 못했습니다.");
  process.exit(1);
}
