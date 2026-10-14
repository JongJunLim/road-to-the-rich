import type { Metadata } from "next";
import YearEndDashboard from "@/components/yearend/YearEndDashboard";
import { currentYearKST, guardedPage } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Year End Tax Settlement · Road To The Rich" };

/** 화면 2 — Year End Tax Settlement (급여 · 세금 · 카드 지출) */
export default async function YearEndPage() {
  return guardedPage(({ snapshot, mode, userMenu }) => (
    <YearEndDashboard snapshot={snapshot} mode={mode} userMenu={userMenu} nowYear={currentYearKST()} />
  ));
}
