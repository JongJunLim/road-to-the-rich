"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import type { FirebaseWebConfig } from "@/lib/auth";

/** 브라우저 Firebase Auth — 로그인 상태는 브라우저(IndexedDB)에 유지되어 다음 방문 때 자동 로그인 */
export function clientAuth(config: FirebaseWebConfig): Auth {
  const app = getApps().length ? getApp() : initializeApp(config);
  return getAuth(app);
}

/** 새 ID 토큰을 서버에 전달해 세션 쿠키 갱신. 결과: ok | not_allowed | invalid | error */
export async function syncSession(idToken: string): Promise<"ok" | "not_allowed" | "invalid" | "error"> {
  try {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (res.ok) return "ok";
    if (res.status === 403) return "not_allowed";
    if (res.status === 401) return "invalid";
    return "error";
  } catch {
    return "error";
  }
}

export async function clearSession(): Promise<void> {
  await fetch("/api/session", { method: "DELETE" }).catch(() => undefined);
}
