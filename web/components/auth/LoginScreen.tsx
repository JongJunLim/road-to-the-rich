"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  getRedirectResult,
  onIdTokenChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import type { FirebaseWebConfig } from "@/lib/auth";
import { clientAuth, clearSession, syncSession } from "./firebase-client";

type Status =
  | { kind: "checking" }
  | { kind: "ready" }
  | { kind: "signing-in" }
  | { kind: "denied"; email: string }
  | { kind: "error"; message: string };

/** 모바일·태블릿(터치 위주 기기)은 팝업 대신 전체 화면 이동(redirect) 방식이 안정적 */
function prefersRedirect(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

/** 앱 안의 브라우저(노션·카카오톡·인스타그램 등)는 Google 이 로그인을 막음 → Safari/Chrome 으로 열도록 안내 */
function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Notion|KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|; wv\)/i.test(navigator.userAgent);
}

/**
 * 로그인 화면
 * - 이전에 로그인한 브라우저면 Firebase 가 로그인 상태를 복원 → 자동으로 세션 쿠키 저장 후 대시보드로
 * - 처음이면 "Google로 로그인" 버튼
 * - 허용 목록에 없는 계정이면 안내 후 즉시 로그아웃
 */
export default function LoginScreen({ config }: { config: FirebaseWebConfig }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "checking" });
  const refreshed = useRef(false);
  const [inApp, setInApp] = useState(false);

  useEffect(() => setInApp(isInAppBrowser()), []);

  useEffect(() => {
    const auth = clientAuth(config);
    // redirect 로그인에서 돌아왔을 때의 오류를 화면에 표시 (성공은 아래 onIdTokenChanged 가 처리)
    getRedirectResult(auth).catch((err) => {
      const code = (err as { code?: string }).code ?? "unknown";
      setStatus({ kind: "error", message: `로그인에 실패했어요 (${code}). Safari·Chrome 에서 직접 열어 다시 시도해 주세요.` });
    });
    return onIdTokenChanged(auth, async (user) => {
      if (!user) {
        // 거절·오류 안내는 로그아웃 후에도 화면에 남겨 둔다
        setStatus((s) => (s.kind === "denied" || s.kind === "error" ? s : { kind: "ready" }));
        return;
      }
      const result = await syncSession(await user.getIdToken());
      if (result === "ok") {
        // 세션 저장 성공 → 서버 컴포넌트를 다시 그려 대시보드 표시 (무한 새로고침 방지: 1회만)
        if (!refreshed.current) {
          refreshed.current = true;
          router.refresh();
        } else {
          setStatus({ kind: "error", message: "세션을 저장하지 못했어요. 쿠키 차단 설정을 확인해 주세요." });
        }
        return;
      }
      if (result === "not_allowed") {
        setStatus({ kind: "denied", email: user.email ?? "알 수 없는 계정" });
      } else {
        setStatus({
          kind: "error",
          message: "서버에서 로그인을 확인하지 못했어요. 서버 터미널의 [auth] 메시지를 확인해 주세요.",
        });
      }
      await signOut(auth);
      await clearSession();
    });
  }, [config, router]);

  const login = async () => {
    const auth = clientAuth(config);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" }); // 여러 계정일 때 항상 선택 창
    setStatus({ kind: "signing-in" });
    try {
      if (prefersRedirect()) {
        await signInWithRedirect(auth, provider); // 페이지가 Google 로그인으로 이동했다가 돌아옴
        return;
      }
      await signInWithPopup(auth, provider);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        await signInWithRedirect(auth, provider); // 팝업이 막힌 환경(일부 모바일 브라우저)
        return;
      }
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        setStatus({ kind: "ready" });
        return;
      }
      setStatus({ kind: "error", message: `로그인에 실패했어요 (${code || "unknown"}).` });
    }
  };

  const busy = status.kind === "checking" || status.kind === "signing-in";

  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <section className="card w-full max-w-sm p-7 text-center">
        <div aria-hidden className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent)]">
          <svg viewBox="0 0 512 512" className="h-7 w-7">
            <path d="M112 352 L208 256 L272 304 L400 168" fill="none" stroke="#3987e5" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="400" cy="168" r="30" fill="var(--surface)" />
          </svg>
        </div>
        <h1 className="text-xl font-bold tracking-tight">Road To The Rich</h1>
        <p className="mt-1.5 text-sm text-ink-2">우리집 자산 · 투자 · 가계부</p>

        <div className="mt-7">
          {status.kind === "checking" ? (
            <p className="text-sm text-ink-3">로그인 상태를 확인하고 있어요…</p>
          ) : (
            <button
              type="button"
              onClick={login}
              disabled={busy}
              className="flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-line bg-surface text-sm font-semibold transition hover:bg-sunken disabled:opacity-60"
            >
              <svg aria-hidden viewBox="0 0 48 48" className="h-5 w-5">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              {status.kind === "signing-in" ? "로그인 중…" : "Google로 로그인"}
            </button>
          )}
        </div>

        {inApp && (
          <p role="note" className="mt-4 rounded-xl bg-sunken px-3 py-2.5 text-xs leading-relaxed text-ink-2">
            앱 안의 브라우저에서는 Google 로그인이 막혀요.
            <br />
            우측 상단 메뉴의 <b>“브라우저로 열기”</b>(Safari·Chrome)로 열어 주세요.
          </p>
        )}
        {status.kind === "denied" && (
          <p role="alert" className="mt-4 rounded-xl bg-sunken px-3 py-2.5 text-xs leading-relaxed text-ink-2">
            <b className="text-bad">{status.email}</b> 계정은 접근 권한이 없어요.
            <br />
            허용된 Google 계정으로 다시 로그인해 주세요.
          </p>
        )}
        {status.kind === "error" && (
          <p role="alert" className="mt-4 text-xs text-bad">
            {status.message}
          </p>
        )}
        <p className="mt-6 text-[11px] text-ink-3">허용된 가족 계정만 볼 수 있는 비공개 대시보드입니다.</p>
      </section>
    </main>
  );
}
