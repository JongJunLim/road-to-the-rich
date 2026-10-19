import "server-only";
import { headers } from "next/headers";
import LoginScreen from "@/components/auth/LoginScreen";
import UserMenu from "@/components/auth/UserMenu";
import { firebaseWebConfig, getSessionUser, isAuthEnabled, type SessionUser } from "./auth";
import { getDataMode, getSnapshot, type DataMode } from "./data";
import type { Snapshot } from "./schema";

type AuthGate =
  | { pass: true; user: SessionUser | null; userMenu: React.ReactNode }
  | { pass: false; node: React.ReactNode };

/** 로그인 확인 — 통과하지 못하면 로그인 화면(또는 설정 오류)을 돌려준다 */
async function authGate(): Promise<AuthGate> {
  if (!isAuthEnabled()) return { pass: true, user: null, userMenu: null };
  const h = await headers();
  const config = firebaseWebConfig(h.get("x-forwarded-host") ?? h.get("host"));
  if (!config) return { pass: false, node: <Problem title="로그인 설정이 없어요" detail="FIREBASE_* 환경변수를 확인해 주세요." /> };
  const user = await getSessionUser();
  if (!user) return { pass: false, node: <LoginScreen config={config} /> };
  return { pass: true, user, userMenu: <UserMenu key="user-menu" email={user.email} config={config} /> };
}

/**
 * 화면 1·2 공통 관문 — 로그인 확인 → 스냅샷 읽기
 * 통과하기 전에는 스냅샷을 읽지도, 브라우저로 보내지도 않는다.
 */
export async function guardedPage(
  render: (ctx: { snapshot: Snapshot; mode: DataMode; userMenu: React.ReactNode }) => React.ReactNode,
): Promise<React.ReactNode> {
  const gate = await authGate();
  if (!gate.pass) return gate.node;

  try {
    const snapshot = await getSnapshot();
    return render({ snapshot, mode: getDataMode(), userMenu: gate.userMenu });
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

/**
 * 스냅샷이 필요 없는 화면(화면 3)용 관문 — 로그인만 확인하고 각 화면이 직접 데이터를 읽는다
 */
export async function guardedAuthPage(
  render: (ctx: { user: SessionUser | null; mode: DataMode; userMenu: React.ReactNode }) => Promise<React.ReactNode>,
): Promise<React.ReactNode> {
  const gate = await authGate();
  if (!gate.pass) return gate.node;
  return render({ user: gate.user, mode: getDataMode(), userMenu: gate.userMenu });
}

/** 한국 시간 기준 올해 (전년 동기 비교 기준) */
export function currentYearKST(): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
}

export function Problem({ title, detail, error }: { title: string; detail: string; error?: string }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-ink-2">{detail}</p>
      {error && <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-sunken p-3 text-left text-xs text-ink-2">{error}</pre>}
    </main>
  );
}
