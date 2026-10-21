import type { Metadata } from "next";
import InvestmentDashboard from "@/components/invest/InvestmentDashboard";
import { guardedPage } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Investment · Road To The Rich" };

/** Investment 화면 — 종목별 원금 · 평가금 · 수익률 (추이 → 트리맵 → 표) */
export default async function InvestmentPage() {
  return guardedPage(({ snapshot, mode, userMenu }) => <InvestmentDashboard snapshot={snapshot} mode={mode} userMenu={userMenu} />);
}
