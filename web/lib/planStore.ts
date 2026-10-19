import "server-only";
import { readFile, rename, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getDataMode } from "./data";
import { emptyPlan, parseStoredPlan, type Plan } from "./plan";

/**
 * 화면 3 저장소 — plan.json 하나를 읽고 쓴다 (서버 전용)
 *
 * PLAN_SOURCE
 *   로컬: .private/plan.json            (npm run dev:real 이 자동 설정)
 *   운영: gs://<비공개버킷>/app/plan.json  (웹 서비스 계정에 app/ 쓰기 권한 필요)
 * DATA_MODE=demo 면 data/demo-plan.json 을 읽기만 함 (저장 불가)
 *
 * 동시 수정 보호: 읽을 때 받은 "버전 표(token)"를 저장할 때 다시 보내고,
 *   그 사이 다른 탭·기기에서 먼저 저장했으면 덮어쓰지 않고 conflict 를 돌려준다.
 *   - GCS: 객체 generation + ifGenerationMatch (원자적)
 *   - 로컬: 파일 수정 시각
 */

export interface PlanDoc {
  plan: Plan;
  token: string; // "0" = 아직 파일 없음
}

export type SaveResult = { ok: true; doc: PlanDoc } | { ok: false; reason: "conflict" | "readonly" };

function source(): string | null {
  return process.env.PLAN_SOURCE?.trim() || null;
}

function gcsTarget(src: string): { bucket: string; name: string } | null {
  const m = src.match(/^gs:\/\/([^/]+)\/(.+)$/);
  return m ? { bucket: m[1], name: m[2] } : null;
}

async function gcsFile(bucket: string, name: string) {
  const { Storage } = await import("@google-cloud/storage");
  return new Storage().bucket(bucket).file(name);
}

function isNotFound(err: unknown): boolean {
  const e = err as { code?: number | string };
  return e?.code === 404 || e?.code === "ENOENT";
}

/** 저장 가능한 환경인지 (실데이터 모드 + PLAN_SOURCE 설정) */
export function planWritable(): boolean {
  return getDataMode() === "private" && source() !== null;
}

export async function readPlan(): Promise<PlanDoc> {
  if (getDataMode() === "demo") {
    const raw = JSON.parse(await readFile(path.join(process.cwd(), "data", "demo-plan.json"), "utf-8"));
    return { plan: parseStoredPlan(raw), token: "demo" };
  }
  const src = source();
  if (!src) throw new Error("PLAN_SOURCE 가 없습니다. (로컬 .private/plan.json 또는 gs://bucket/app/plan.json)");

  const gcs = gcsTarget(src);
  if (gcs) {
    const file = await gcsFile(gcs.bucket, gcs.name);
    try {
      const [meta] = await file.getMetadata();
      const generation = String(meta.generation);
      // 방금 확인한 generation 을 지정해 읽어야 메타데이터와 내용이 어긋나지 않음
      const [buf] = await file.bucket.file(gcs.name, { generation }).download();
      return { plan: parseStoredPlan(JSON.parse(buf.toString("utf-8"))), token: generation };
    } catch (err) {
      if (isNotFound(err)) return { plan: emptyPlan(), token: "0" };
      throw err;
    }
  }

  const file = path.resolve(/*turbopackIgnore: true*/ process.cwd(), src);
  try {
    const [buf, st] = await Promise.all([readFile(file, "utf-8"), stat(file)]);
    return { plan: parseStoredPlan(JSON.parse(buf)), token: String(Math.floor(st.mtimeMs)) };
  } catch (err) {
    if (isNotFound(err)) return { plan: emptyPlan(), token: "0" };
    throw err;
  }
}

export async function savePlan(plan: Plan, token: string): Promise<SaveResult> {
  const src = source();
  if (!planWritable() || !src) return { ok: false, reason: "readonly" };

  const stored: Plan = { ...plan, updatedAt: new Date().toISOString() };
  const body = JSON.stringify(stored, null, 2);

  const gcs = gcsTarget(src);
  if (gcs) {
    if (!/^\d+$/.test(token)) return { ok: false, reason: "conflict" };
    const file = await gcsFile(gcs.bucket, gcs.name);
    try {
      await file.save(body, {
        resumable: false,
        contentType: "application/json; charset=utf-8",
        metadata: { cacheControl: "no-store" },
        // token 이 "0" 이면 "파일이 아직 없을 때만" 생성
        preconditionOpts: { ifGenerationMatch: Number(token) },
      });
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 412) return { ok: false, reason: "conflict" };
      throw err;
    }
    const [meta] = await file.getMetadata();
    return { ok: true, doc: { plan: stored, token: String(meta.generation) } };
  }

  // 로컬 파일: 수정 시각 비교 → 임시 파일에 쓴 뒤 교체 (쓰다가 끊겨도 원본이 깨지지 않게)
  const file = path.resolve(/*turbopackIgnore: true*/ process.cwd(), src);
  let current = "0";
  try {
    current = String(Math.floor((await stat(file)).mtimeMs));
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
  if (current !== token) return { ok: false, reason: "conflict" };
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, body, "utf-8");
  await rename(tmp, file);
  return { ok: true, doc: { plan: stored, token: String(Math.floor((await stat(file)).mtimeMs)) } };
}
