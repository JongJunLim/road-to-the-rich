import type { Metadata } from "next";
import ExpenseDashboard from "@/components/expense/ExpenseDashboard";
import { guardedPage } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Expense Analysis · Road To The Rich" };

/** Expense Analysis 화면 — 지출 Drill down (추이 → 구성 비율 → Top 대분류 · 중분류 · 항목) */
export default async function ExpensePage() {
  return guardedPage(({ snapshot, mode, userMenu }) => <ExpenseDashboard snapshot={snapshot} mode={mode} userMenu={userMenu} />);
}
