// 실데이터 모드로 개발 서버 실행 (Windows / macOS 공통)
//   npm run dev:real  →  http://localhost:3001
// 데모 서버(npm run dev, 3000번)와 동시에 띄워 비교할 수 있도록 포트·빌드 폴더를 분리했다.
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const SNAPSHOT = ".private/snapshot.json";

if (!existsSync(SNAPSHOT)) {
  console.error(`\n❌ ${SNAPSHOT} 가 없습니다. 먼저 실데이터 스냅샷을 받아 주세요:\n\n   npm run data:real\n`);
  process.exit(1);
}
if (!existsSync(".env.local")) {
  console.error("\n❌ .env.local 이 없습니다. 로그인 설정(FIREBASE_*, ALLOWED_EMAILS)이 필요합니다. .env.example 을 참고해 만들어 주세요.\n");
  process.exit(1);
}

// 회사망처럼 HTTPS 를 중간에서 검사하는 환경에서는 Node 가 회사 인증서를 몰라
// Google 공개키 조회(로그인 검증)가 실패한다 → Windows/macOS 에 설치된 인증서를 쓰도록 설정
const nodeOptions = [process.env.NODE_OPTIONS ?? ""];
if (process.allowedNodeEnvironmentFlags.has("--use-system-ca")) {
  nodeOptions.push("--use-system-ca");
} else {
  console.warn(
    `⚠️  현재 Node ${process.version} 는 --use-system-ca 를 지원하지 않습니다.` +
      "\n   회사망에서 로그인이 실패하면 Node 22 LTS 최신 버전(22.15 이상)으로 업데이트해 주세요.\n",
  );
}

const child = spawn("npx next dev -p 3001", {
  stdio: "inherit",
  shell: true, // Windows 에서 npx.cmd 를 찾기 위함
  env: {
    ...process.env,
    DATA_MODE: "private",
    SNAPSHOT_SOURCE: SNAPSHOT,
    NEXT_DIST_DIR: ".next-real",
    AUTH_ENABLED: "true",
    NODE_OPTIONS: nodeOptions.join(" ").trim(),
  },
});
child.on("exit", (code) => process.exit(code ?? 0));
