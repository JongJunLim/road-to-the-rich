import type { Metadata } from "next";
import GuideDashboard from "@/components/guide/GuideDashboard";
import { guardedPage } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Data Guide · Road To The Rich" };

/** Data Guide 화면 — 데이터 상태 · 파이프라인 아키텍처 · 결제수단 매핑 · 카드별 지출 · 품질 체크 · 용어 · 월간 운영 */
export default async function GuidePage() {
  return guardedPage(({ snapshot, mode, userMenu }) => <GuideDashboard snapshot={snapshot} mode={mode} userMenu={userMenu} />);
}
