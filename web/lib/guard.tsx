import "server-only";
import { headers } from "next/headers";
import LoginScreen from "@/components/auth/LoginScreen";
import UserMenu from "@/components/auth/UserMenu";
import { firebaseWebConfig, getSessionUser, isAuthEnabled } from "./auth";
import { getDataMode, getSnapshot, type DataMode } from "./data";
import type { Snapshot } from "./schema";

/**
 * 모든 화면 공통 관문 — 로그인 확인 → 스냅샷 읽기
 * 통과하기 전에는 스냅샷을 읽지도, 브라우저로 보내지도 않는다.
 */
export async function guardedPage(
  render: (ctx: { snapshot: Snapshot; mode: DataMode; userMenu: React.ReactNode }) => React.ReactNode,
): Promise<React.ReactNode> {
  // 1) 로그인 확인
  let userMenu: React.ReactNode = null;
  if (isAuthEnabled()) {
    const h = await headers();
    const config = firebaseWebConfig(h.get("x-forwarded-host") ?? h.get("host"));
    if (!config) return <Problem title="로그인 설정이 없어요" detail="FIREBASE_* 환경변수를 확인해 주세요." />;
    const user = await getSessionUser();
    if (!user) return <LoginScreen config={config} />;
    userMenu = <UserMenu key="user-menu" email={user.email} config={config} />;
  }

  // 2) 데이터
  try {
    const snapshot = await getSnapshot();
    return render({ snapshot, mode: getDataMode(), userMenu });
  } catch (err) {
    console.error("[snapshot]", err);
    return (
      <Problem
        title="데이터를 불러오지 못했어요"
        detail={
          getDataMode() === "private"
            ? "실데이터 모드입니다. 스냅샷 파일(또는 GCS 권한)을 확인해 주세요."
            : "스냅샷 파일 또는 권한 설정을 확인해 주세요."
        }
        error={process.env.NODE_ENV !== "production" ? String(err) : undefined}
      />
    );
  }
}

/** 한국 시간 기준 올해 (전년 동기 비교 기준) */
export function currentYearKST(): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
}

function Problem({ title, detail, error }: { title: string; detail: string; error?: string }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-ink-2">{detail}</p>
      {error && <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-sunken p-3 text-left text-xs text-ink-2">{error}</pre>}
    </main>
  );
}
