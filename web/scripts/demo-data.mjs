// 데모(합성) 스냅샷 재생성 — Windows / macOS 공통
//   npm run demo:data
import { spawnSync } from "node:child_process";

const args = ["../pipeline/generate_demo.py", "--out", "data/demo-snapshot.json"];
for (const cmd of ["python", "py", "python3"]) {
  const probe = spawnSync(cmd, ["--version"], { shell: true, encoding: "utf-8" });
  if (probe.status !== 0 || /Microsoft Store|not found/i.test(probe.stderr + probe.stdout)) continue;
  const run = spawnSync(cmd, args, { stdio: "inherit", shell: true });
  process.exit(run.status ?? 1);
}
console.error("❌ Python 을 찾지 못했습니다.");
process.exit(1);
