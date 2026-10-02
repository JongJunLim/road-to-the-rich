import "server-only";
import { cookies } from "next/headers";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

/**
 * 로그인 검증 (서버 전용)
 *
 * 흐름
 *   브라우저: Firebase Google 로그인 → ID 토큰(1시간 유효, SDK가 자동 갱신)
 *   서버:     /api/session 에서 토큰 검증 → 허용 이메일이면 httpOnly 쿠키로 저장
 *   페이지:   요청마다 쿠키의 토큰을 다시 검증 → 통과해야만 스냅샷을 읽어 화면에 보냄
 *
 * ID 토큰 검증은 Google 공개키로만 하므로 별도 서비스 계정 키가 필요 없다.
 */

export const SESSION_COOKIE = "__session";

export interface SessionUser {
  email: string;
  name: string | null;
}

export function isAuthEnabled(): boolean {
  return process.env.AUTH_ENABLED === "true";
}

/** ALLOWED_EMAILS=a@gmail.com,b@gmail.com  (코드가 아니라 배포 설정에만 존재) */
export function allowedEmails(): Set<string> {
  return new Set(
    (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

/**
 * 로그인 핸들러 도메인
 * - FIREBASE_AUTH_DOMAIN="self" 이면 현재 접속한 주소(예: rttr-web-xxx.run.app)를 사용
 *   → next.config.mjs 의 /__/auth 프록시를 거쳐 "같은 사이트" 로그인이 되어 iPhone Safari 에서도 동작
 * - localhost 는 OAuth 리디렉션 URI 를 따로 등록하지 않도록 기존 firebaseapp.com 사용
 */
function resolveAuthDomain(host?: string | null): string {
  const configured = process.env.FIREBASE_AUTH_DOMAIN ?? "";
  if (configured !== "self") return configured;
  const fallback = process.env.FIREBASE_PROJECT_ID ? `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com` : "";
  if (!host || /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) return fallback;
  return /^[a-z0-9.-]+(:\d+)?$/i.test(host) ? host : fallback; // Host 헤더 값 검증
}

/** 브라우저용 Firebase 설정 — 공개 식별자라 비밀값이 아님. 런타임 환경변수에서 읽어 전달 */
export function firebaseWebConfig(host?: string | null): FirebaseWebConfig | null {
  const cfg = {
    apiKey: process.env.FIREBASE_API_KEY ?? "",
    authDomain: resolveAuthDomain(host),
    projectId: process.env.FIREBASE_PROJECT_ID ?? "",
    appId: process.env.FIREBASE_APP_ID ?? "",
  };
  return Object.values(cfg).every(Boolean) ? cfg : null;
}

function adminAuth() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID 가 설정되지 않았습니다.");
  const app = getApps()[0] ?? initializeApp({ projectId });
  return getAuth(app);
}

export type VerifyResult =
  | { ok: true; user: SessionUser; expiresAt: number }
  | { ok: false; reason: "invalid" | "not_allowed"; email?: string };

/** ID 토큰 검증 + Google 로그인 + 이메일 인증 + 허용 목록 */
export async function verifyIdToken(token: string): Promise<VerifyResult> {
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    const email = decoded.email?.toLowerCase();
    if (!email || !decoded.email_verified || decoded.firebase?.sign_in_provider !== "google.com") {
      console.error("[auth] 허용되지 않는 로그인 방식 또는 미인증 이메일:", decoded.firebase?.sign_in_provider, decoded.email_verified);
      return { ok: false, reason: "invalid" };
    }
    if (!allowedEmails().has(email)) return { ok: false, reason: "not_allowed", email };
    return { ok: true, user: { email, name: (decoded.name as string) ?? null }, expiresAt: decoded.exp * 1000 };
  } catch (err) {
    // 원인 진단용 (토큰 자체는 기록하지 않음). 회사망 SSL 검사 환경에선 Google 공개키 조회가 여기서 실패함
    const e = err as { code?: string; message?: string; cause?: { code?: string } };
    console.error("[auth] 토큰 검증 실패:", e.code ?? e.cause?.code ?? "", e.message ?? err);
    return { ok: false, reason: "invalid" };
  }
}

/** 현재 요청의 로그인 사용자 (없거나 허용되지 않으면 null) */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await verifyIdToken(token);
  return result.ok ? result.user : null;
}
