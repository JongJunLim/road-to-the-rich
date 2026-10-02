"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { onIdTokenChanged, signOut } from "firebase/auth";
import type { FirebaseWebConfig } from "@/lib/auth";
import { clientAuth, clearSession, syncSession } from "./firebase-client";

/**
 * 로그인 상태 유지 + 로그아웃
 * - Firebase SDK 가 1시간마다 토큰을 갱신하면 그때마다 서버 쿠키도 새 토큰으로 교체
 */
export default function UserMenu({ email, config }: { email: string; config: FirebaseWebConfig }) {
  const router = useRouter();

  useEffect(() => {
    const auth = clientAuth(config);
    return onIdTokenChanged(auth, async (user) => {
      if (user) await syncSession(await user.getIdToken());
    });
  }, [config]);

  const logout = async () => {
    await signOut(clientAuth(config));
    await clearSession();
    router.refresh();
  };

  return (
    <div className="flex items-center gap-2 text-xs text-ink-3">
      <span className="hidden max-w-[180px] truncate sm:inline" title={email}>
        {email}
      </span>
      <button
        type="button"
        onClick={logout}
        className="rounded-full border border-line px-2.5 py-1 font-medium text-ink-2 transition hover:bg-sunken"
      >
        로그아웃
      </button>
    </div>
  );
}
