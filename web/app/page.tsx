import Dashboard from "@/components/Dashboard";
import { guardedPage } from "@/lib/guard";

// 요청마다 서버에서 로그인·스냅샷을 확인 (빌드 시점에 굳지 않도록)
export const dynamic = "force-dynamic";

/** 화면 1 — Road To The Rich (자산 · 투자 · 가계부) */
export default async function Page() {
  return guardedPage(({ snapshot, mode, userMenu }) => (
    <Dashboard snapshot={snapshot} mode={mode} userMenu={userMenu} />
  ));
}
