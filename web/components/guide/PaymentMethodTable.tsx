"use client";

import { useState } from "react";
import type { OwnerId, PaymentGroup } from "@/lib/schema";
import { DORMANT_DAYS, GROUP_HINT, GROUP_LABEL, NEW_DAYS, type PmLine, type PmMatrix } from "@/lib/guide";

export const GROUP_COLOR: Record<PaymentGroup, string> = {
  Credit: "var(--series-1)",
  Debit: "var(--series-3)",
  Account: "var(--series-4)",
  Cash: "var(--series-2)",
  Etc: "var(--text-muted)",
  Unmapped: "var(--delta-bad)",
};

const short = (d: string) => `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`;

function StatusBadge({ s }: { s: PmLine["status"] }) {
  if (s === "new") return <span className="rounded-full bg-[var(--series-1-wash)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--series-1)]">🆕 신규</span>;
  if (s === "dormant") return <span className="rounded-full bg-sunken px-1.5 py-0.5 text-[10px] font-semibold text-ink-3">💤 휴면</span>;
  return null;
}

function UseCell({ u }: { u: PmLine["byOwner"][OwnerId] }) {
  if (!u) return <span className="text-ink-3">–</span>;
  return (
    <span className="tnum inline-flex items-center gap-1.5">
      <span aria-hidden className="text-[10px] text-good">●</span>
      <span>{short(u.last)}</span>
    </span>
  );
}

/** INSERT 예시 — 결제수단 이름은 화면에 보이는 그대로 */
function insertSql(names: string[]): string {
  const rows = (names.length ? names : ["새 결제수단 이름"]).map((n) => `  ('${n.replace(/'/g, "\\'")}', 'Credit', NULL, CURRENT_DATE('Asia/Seoul'))`);
  return `-- 그룹: Credit · Debit · Account · Cash · Etc 중 하나로 바꿔서 실행
INSERT INTO \`<프로젝트>.banksalad_prd.payment_method_map\`
  (payment_method, pm_group, note, updated_at)
VALUES
${rows.join(",\n")};`;
}

export default function PaymentMethodTable({
  model,
  owners,
  showOwners,
}: {
  model: PmMatrix;
  owners: { id: OwnerId; label: string }[];
  showOwners: OwnerId[]; // 열로 보여줄 사람
}) {
  const [copied, setCopied] = useState(false);
  const sql = insertSql(model.unmapped.map((l) => l.pm));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 복사 권한이 없으면 무시 — 코드 블록을 직접 선택해 복사 */
    }
  };
  const label = (id: OwnerId) => owners.find((o) => o.id === id)?.label ?? id;

  return (
    <div>
      {/* ---------- Unmapped 경고 + 대응 방법 ---------- */}
      {model.unmapped.length > 0 ? (
        <div className="mb-4 rounded-xl border border-[var(--delta-bad)] bg-[color-mix(in_srgb,var(--delta-bad)_7%,transparent)] p-3 sm:p-4" role="alert">
          <p className="text-sm font-semibold text-bad">⚠ 매핑되지 않은 결제수단 {model.unmapped.length}개 — 카드 지출·연말정산 집계에서 빠지고 있어요</p>
          <ul className="mt-2 space-y-1 text-[12.5px]">
            {model.unmapped.map((l) => (
              <li key={l.pm} className="flex flex-wrap items-center gap-x-2">
                <b>{l.pm}</b>
                <span className="text-ink-3">
                  {showOwners.filter((o) => l.byOwner[o]).map(label).join("·")} · 처음 사용 {short(l.first)}
                </span>
              </li>
            ))}
          </ul>
          <details className="mt-3 text-[12px] text-ink-2">
            <summary className="cursor-pointer font-semibold text-ink">대응 방법 (3단계)</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>신용카드인지 체크카드인지, 통장인지 확인 (간편결제처럼 섞여 있으면 Etc)</li>
              <li>BigQuery 콘솔에서 아래 SQL의 그룹을 고쳐 실행</li>
              <li>
                <code className="rounded bg-sunken px-1">gcloud run jobs execute rttr-publish --region asia-northeast3 --wait</code> → 10분 뒤 이 경고가 사라지면 완료
              </li>
            </ol>
            <div className="relative mt-2">
              <pre className="overflow-x-auto rounded-lg bg-sunken p-3 text-[11.5px] leading-relaxed text-ink">{sql}</pre>
              <button
                type="button"
                onClick={copy}
                className="absolute right-2 top-2 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-semibold"
              >
                {copied ? "복사됨" : "복사"}
              </button>
            </div>
          </details>
        </div>
      ) : (
        <p className="mb-4 rounded-xl bg-[var(--page)] px-3 py-2 text-[12.5px] text-ink-2">
          ✓ 거래 기록에 나온 결제수단 {model.count}개가 모두 매핑되어 있어요.
        </p>
      )}

      {/* ---------- 그룹별 표 ---------- */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {model.groups.map((g) => (
          <section key={g.group} className="min-w-0 rounded-xl border border-line" aria-label={GROUP_LABEL[g.group]}>
            <header className="flex items-baseline justify-between gap-2 border-b border-line bg-sunken px-3 py-2">
              <div className="flex items-center gap-2">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: GROUP_COLOR[g.group] }} />
                <span className="text-[13px] font-semibold">{g.group}</span>
                <span className="text-[12px] text-ink-2">{GROUP_LABEL[g.group]}</span>
              </div>
              <span className="text-[11px] text-ink-3">{g.lines.length}개</span>
            </header>
            <p className="px-3 pt-1.5 text-[11px] text-ink-3">{GROUP_HINT[g.group]}</p>
            <div className="overflow-x-auto">
              <table className="tnum w-full border-collapse text-right text-[12.5px]">
                <thead className="text-[11px] text-ink-3">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">결제수단</th>
                    {showOwners.map((o) => (
                      <th key={o} className="whitespace-nowrap px-3 py-1.5 font-medium">
                        {label(o)} <span className="font-normal">마지막 사용</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.lines.map((l) => (
                    <tr key={l.pm} className={`border-t border-line ${l.status === "dormant" ? "text-ink-3" : ""}`}>
                      <td className="max-w-[230px] px-3 py-1.5 text-left">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="break-keep font-medium">{l.pm}</span>
                          <StatusBadge s={l.status} />
                        </span>
                      </td>
                      {showOwners.map((o) => (
                        <td key={o} className="whitespace-nowrap px-3 py-1.5">
                          <UseCell u={l.byOwner[o]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-3">
        ※ ● 날짜 = 그 사람이 마지막으로 쓴 날 (결제수단이 기록된 2025-02 이후), – = 쓰지 않음. 그룹 안에서는 자주 쓰는 순. 🆕 신규 = 기준일
        {model.ref ? `(${model.ref})` : ""}로부터 {NEW_DAYS}일 안에 처음 쓴 것, 💤 휴면 = {DORMANT_DAYS}일 넘게 안 쓴 것 (해지 후보).
      </p>
    </div>
  );
}
