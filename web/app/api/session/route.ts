import { cookies } from "next/headers";
import { isAuthEnabled, SESSION_COOKIE, verifyIdToken } from "@/lib/auth";

/**
 * POST   /api/session  { idToken }  → 검증 후 httpOnly 쿠키 저장
 * DELETE /api/session               → 쿠키 삭제 (로그아웃)
 */
export async function POST(req: Request) {
  if (!isAuthEnabled()) return Response.json({ ok: false, reason: "auth_disabled" }, { status: 404 });

  let idToken: unknown;
  try {
    ({ idToken } = await req.json());
  } catch {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  if (typeof idToken !== "string" || idToken.length > 4096) {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const result = await verifyIdToken(idToken);
  const store = await cookies();
  if (!result.ok) {
    store.delete(SESSION_COOKIE);
    const status = result.reason === "not_allowed" ? 403 : 401;
    return Response.json({ ok: false, reason: result.reason }, { status });
  }

  // 쿠키 수명 = 토큰 남은 수명 (최대 1시간). 브라우저 SDK가 갱신할 때마다 다시 저장됨
  const maxAge = Math.max(0, Math.floor((result.expiresAt - Date.now()) / 1000));
  store.set(SESSION_COOKIE, idToken, {
    httpOnly: true, // 스크립트에서 읽을 수 없음
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return Response.json({ ok: true, email: result.user.email });
}

export async function DELETE() {
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
