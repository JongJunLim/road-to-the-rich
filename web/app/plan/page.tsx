import type { Metadata } from "next";
import PlanBoard from "@/components/plan/PlanBoard";
import { canEdit } from "@/lib/auth";
import { guardedAuthPage, Problem } from "@/lib/guard";
import { planWritable, readPlan } from "@/lib/planStore";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Monthly Plan · Road To The Rich" };

/** 화면 3 — Monthly Plan (월 고정 수입 · 저축 · 지출 계획표, 웹앱에서 직접 수정) */
export default async function PlanPage() {
  return guardedAuthPage(async ({ user, mode, userMenu }) => {
    try {
      const doc = await readPlan();
      const editable = mode === "demo" ? "demo" : canEdit(user) && planWritable() ? "yes" : "no";
      return <PlanBoard initial={doc.plan} token={doc.token} mode={mode} editable={editable} userMenu={userMenu} />;
    } catch (err) {
      console.error("[plan]", err);
      return (
        <Problem
          title="계획표를 불러오지 못했어요"
          detail="PLAN_SOURCE 설정 또는 GCS 권한을 확인해 주세요."
          error={process.env.NODE_ENV !== "production" ? String(err) : undefined}
        />
      );
    }
  });
}
