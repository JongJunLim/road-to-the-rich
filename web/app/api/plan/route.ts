import { canEdit, getSessionUser } from "@/lib/auth";
import { validatePlan } from "@/lib/plan";
import { savePlan } from "@/lib/planStore";

/**
 * PUT /api/plan  { rows, token }  → 화면 3 계획표 저장 (편집자만)
 *
 * 응답
 *   200 { ok, plan, token }        저장 완료 (token = 새 버전 표)
 *   400 { ok:false, error }        입력값 오류
 *   401/403                        로그인 안 됨 / 편집 권한 없음
 *   409 { ok:false, reason:"conflict" }  다른 탭·기기에서 먼저 저장됨 → 새로고침 필요
 */

const MAX_BODY = 200_000; // 200KB — 계획표 200행이어도 수십 KB

/** 다른 사이트에서 보낸 요청 차단 (같은 주소에서 연 화면만 허용) */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // 일부 브라우저는 같은 사이트 요청에 Origin 을 생략
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return Response.json({ ok: false, reason: "forbidden" }, { status: 403 });

  const user = await getSessionUser();
  if (!user) return Response.json({ ok: false, reason: "unauthorized", error: "로그인이 만료됐어요. 새로고침 후 다시 로그인해 주세요." }, { status: 401 });
  if (!canEdit(user)) return Response.json({ ok: false, reason: "forbidden", error: "수정 권한이 없는 계정입니다." }, { status: 403 });

  const text = await req.text();
  if (text.length > MAX_BODY) return Response.json({ ok: false, error: "데이터가 너무 큽니다." }, { status: 400 });

  let body: { rows?: unknown; token?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ ok: false, error: "형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (typeof body.token !== "string" || body.token.length > 40) {
    return Response.json({ ok: false, error: "버전 정보가 없습니다. 새로고침해 주세요." }, { status: 400 });
  }

  const check = validatePlan({ rows: body.rows });
  if (!check.ok) return Response.json({ ok: false, error: check.error }, { status: 400 });

  try {
    const result = await savePlan(check.plan, body.token);
    if (!result.ok) {
      return result.reason === "conflict"
        ? Response.json({ ok: false, reason: "conflict", error: "다른 탭이나 기기에서 먼저 저장된 내용이 있어요. 새로고침 후 다시 수정해 주세요." }, { status: 409 })
        : Response.json({ ok: false, reason: "readonly", error: "저장할 수 없는 환경입니다 (데모 모드 또는 PLAN_SOURCE 미설정)." }, { status: 403 });
    }
    console.log(`[plan] saved by ${user.email} (${check.plan.rows.length} rows)`);
    return Response.json({ ok: true, plan: result.doc.plan, token: result.doc.token });
  } catch (err) {
    console.error("[plan] 저장 실패:", err);
    return Response.json({ ok: false, error: "저장 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
