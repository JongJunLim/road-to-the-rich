import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertSnapshot, type Snapshot } from "./schema";

/**
 * 스냅샷 로더 (서버 전용 — GCS 자격 증명이 브라우저로 가지 않음)
 *
 * DATA_MODE=demo    → web/data/demo-snapshot.json (기본값, 포트폴리오·공개 데모용)
 * DATA_MODE=private → SNAPSHOT_SOURCE 의 실데이터
 *     - 로컬 확인: .private/snapshot.json  (npm run data:real 로 생성, 배포·압축에서 제외됨)
 *     - 운영:      gs://<비공개버킷>/snapshot/latest.json
 *
 * 🔒 안전장치: 로그인(4단계)이 붙기 전까지 production 에서 private 모드는 거부한다.
 *    AUTH_ENABLED=true 는 인증을 실제로 붙인 뒤에만 설정할 것.
 */

const CACHE_TTL_MS = 10 * 60 * 1000; // 월 1회 갱신 데이터라 10분 캐시면 충분
let cache: { at: number; data: Snapshot } | null = null;

export type DataMode = "demo" | "private";

export function getDataMode(): DataMode {
  return process.env.DATA_MODE === "private" ? "private" : "demo";
}

async function loadDemo(): Promise<unknown> {
  const file = path.join(process.cwd(), "data", "demo-snapshot.json");
  return JSON.parse(await readFile(file, "utf-8"));
}

async function loadPrivate(): Promise<unknown> {
  if (process.env.NODE_ENV === "production" && process.env.AUTH_ENABLED !== "true") {
    throw new Error("private 모드는 로그인 적용(AUTH_ENABLED=true) 후에만 배포할 수 있습니다.");
  }
  const source = process.env.SNAPSHOT_SOURCE ?? process.env.SNAPSHOT_GCS_URI;
  if (!source) throw new Error("SNAPSHOT_SOURCE 가 없습니다. (로컬 파일 경로 또는 gs://bucket/path.json)");

  const match = source.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    // 로컬 파일 (개발용)
    return JSON.parse(await readFile(path.resolve(process.cwd(), source), "utf-8"));
  }
  const { Storage } = await import("@google-cloud/storage");
  const [buf] = await new Storage().bucket(match[1]).file(match[2]).download();
  return JSON.parse(buf.toString("utf-8"));
}

export async function getSnapshot(): Promise<Snapshot> {
  // 개발 중에는 캐시하지 않음 → 스냅샷을 새로 뽑으면 새로고침만으로 반영
  const useCache = process.env.NODE_ENV === "production";
  if (useCache && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;

  const raw = getDataMode() === "private" ? await loadPrivate() : await loadDemo();
  assertSnapshot(raw);
  cache = { at: Date.now(), data: raw };
  return raw;
}
