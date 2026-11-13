"use client";

import { useMemo, useState } from "react";
import type { OwnerFilter, OwnerId, Snapshot } from "@/lib/schema";
import { cardSpend, dataStatus, pmMatrix, qualityChecks, type CheckLevel } from "@/lib/guide";
import { formatMonthLong } from "@/lib/format";
import AppNav from "../AppNav";
import ArchitectureDiagram from "./ArchitectureDiagram";
import CardSpendPanel from "./CardSpendPanel";
import PaymentMethodTable from "./PaymentMethodTable";

const todayKst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

function Section({ id, num, title, subtitle, children, right }: { id: string; num: string; title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section id={id} className="card mt-3 scroll-mt-4 p-4 sm:p-5" aria-labelledby={`${id}-t`}>
      <header className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={`${id}-t`} className="text-[15px] font-semibold">
            <span className="mr-1.5 text-ink-3">{num}</span>
            {title}
          </h2>
          {subtitle && <p className="text-xs text-ink-3">{subtitle}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

const fmtLatest = (v: string | null) => (!v ? "없음" : v.length === 7 ? formatMonthLong(v) : v.length === 4 ? `${v}년` : v);

const LEVEL_ICON: Record<CheckLevel, { icon: string; cls: string }> = {
  ok: { icon: "✓", cls: "text-good" },
  warn: { icon: "⚠", cls: "text-bad" },
  info: { icon: "ℹ", cls: "text-ink-2" },
};

/** ⑥ 화면별 용어·지표 정의 */
const DEFINITIONS: { screen: string; items: [string, string][] }[] = [
  {
    screen: "공통",
    items: [
      ["소유자 필터", "전체 = 두 사람 합계. 데이터 시작 시점이 달라 '전체' 비교는 두 달 모두 데이터가 있는 사람끼리만 해요 (예: 또용 전월 없음)."],
      ["증감 색", "좋은 방향 파랑, 나쁜 방향 빨강. 지출은 줄면 파랑, 원금 증감은 좋고 나쁨이 없어 회색."],
      ["데이터 기준일", "뱅크샐러드에서 내보낸 마지막 기록 시각. 화면은 매달 갱신돼요."],
      ["N월 기준 배지", "선택한 달에 가계부가 아직 없으면 0 대신 가장 최근 달을 보여줘요."],
    ],
  },
  {
    screen: "Road To The Rich",
    items: [
      ["자산 · 투자", "사람별 그 달 마지막 스냅샷 기준."],
      ["수입 · 지출", "거래일 기준. 지출은 환불을 뺀 순액."],
      ["카테고리 필터", "기본값은 수입의 급여·상여금. 그룹에서 아무것도 안 고르면 그 그룹 전체."],
    ],
  },
  {
    screen: "Year End Tax Settlement",
    items: [
      ["Gross Salary", "급여명세서 지급 합계, 귀속연도 기준 (1월 성과급은 전년 12월)."],
      ["Net Salary", "가계부 수입 중 급여·상여금."],
      ["Card Expense", "결제수단 그룹이 Credit·Debit 인 지출 (③ 매핑표 기준). 간편결제(Etc)는 빠져요."],
      ["Deduction Criteria", "총급여 × 25% — 이 금액을 넘게 쓴 부분부터 카드 공제."],
    ],
  },
  {
    screen: "Investment",
    items: [
      ["수익률", "(평가금 − 원금) ÷ 원금, 항상 합계로 다시 계산 (비율끼리 더하지 않음)."],
      ["변동 분해", "추가 투자 = 원금 변화, 시장 손익 = 나머지. 전량 매도는 −전월 평가금."],
      ["종목 합산 (구분 전)", "2025-01 ~ 2026-01 은 종목 없이 합계만 적재된 기간."],
    ],
  },
  {
    screen: "Expense Analysis",
    items: [
      ["점검 포인트", "직전 6개월 월평균보다 +50% 이상 & 5만 원 이상 늘어난 중분류·항목."],
      ["증감 분해", "전월 → 대분류별 증감 → 이번 달."],
      ["음수 지출", "같은 달 환불이 구매보다 큰 경우."],
    ],
  },
  {
    screen: "Monthly Plan",
    items: [
      ["남는 금액", "수익 − (저축 + 지출). 편집은 편집자만, 저장 전 버전은 보관돼 복구 가능."],
    ],
  },
];

/** ⑦ 월간 운영 체크리스트 */
const OPS: { step: string; detail: string; cmd?: string }[] = [
  { step: "뱅크샐러드 앱에서 내보내기", detail: "받은 ZIP을 지금처럼 GCS에 올리기 (약 5분)" },
  { step: "ETL 실행", detail: "성공 로그 확인 → BigQuery DEV 적재 완료 (3~5분)" },
  { step: "rttr-publish 실행", detail: "DEV→PRD 반영 + 스냅샷 갱신이 한 번에 (1~2분)", cmd: "gcloud run jobs execute rttr-publish --region asia-northeast3 --wait" },
  { step: "웹에서 확인", detail: "10분 뒤 새로고침 → 이 화면 ⑤ 품질 체크가 모두 ✓ 인지 보기" },
  { step: "(새 결제수단이 생겼다면)", detail: "③ 경고의 SQL로 매핑 추가 → rttr-publish 한 번 더" },
  { step: "(원할 때) 월간 AI 리포트", detail: "특이사항(여행·상여금 등)과 함께 요청" },
];

/** Data Guide — 데이터 상태 · 아키텍처 · 결제수단 매핑 · 카드 지출 · 품질 · 용어 · 운영 */
export default function GuideDashboard({ snapshot, mode, userMenu }: { snapshot: Snapshot; mode: "demo" | "private"; userMenu?: React.ReactNode }) {
  const [owner, setOwner] = useState<OwnerFilter>("all");
  const owners = snapshot.owners as { id: OwnerId; label: string }[];
  const label = (id: string) => owners.find((o) => o.id === id)?.label ?? id;
  const showOwners: OwnerId[] = owner === "all" ? owners.map((o) => o.id) : [owner];

  const status = useMemo(() => dataStatus(snapshot), [snapshot]);
  const checks = useMemo(() => qualityChecks(snapshot, todayKst(), mode === "demo"), [snapshot, mode]);
  const pm = useMemo(() => pmMatrix(snapshot.payment_method ?? [], owner), [snapshot, owner]);
  const spend = useMemo(() => cardSpend(snapshot.payment_method_expense ?? [], owner), [snapshot, owner]);
  const warnCount = checks.filter((c) => c.level === "warn").length;

  const ownerFilter = (
    <div role="radiogroup" aria-label="소유자" className="flex h-8 items-center rounded-full border border-line bg-surface p-0.5">
      {[{ id: "all" as const, label: "전체" }, ...owners].map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={owner === o.id}
          onClick={() => setOwner(o.id)}
          className={`h-7 rounded-full px-3 text-xs font-medium transition ${owner === o.id ? "bg-[var(--accent)] text-[var(--surface)]" : "text-ink-2 hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <AppNav />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Data Guide</h1>
            {mode === "demo" && <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-3">DEMO</span>}
          </div>
          <p className="mt-1 text-sm text-ink-2">데이터가 어디서 와서 어떻게 화면이 되는지, 결제수단은 어떻게 분류되는지</p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-3 text-xs text-ink-3 sm:w-auto sm:justify-end sm:text-right">
          {userMenu}
          <div>
            <div>출처 · {snapshot.source === "demo" ? "합성 데이터" : "뱅크샐러드"}</div>
            {snapshot.data_updated_at && <div>데이터 기준일 · {snapshot.data_updated_at.slice(0, 10)}</div>}
          </div>
        </div>
      </header>

      {/* 목차 */}
      <nav aria-label="이 페이지 목차" className="mt-4 flex flex-wrap gap-1.5 text-[12px]">
        {[
          ["status", "① 데이터 상태"],
          ["arch", "② 아키텍처"],
          ["mapping", "③ 결제수단 매핑"],
          ["cards", "④ 카드별 지출"],
          ["quality", `⑤ 품질 체크${warnCount ? ` ⚠${warnCount}` : ""}`],
          ["terms", "⑥ 용어·지표"],
          ["ops", "⑦ 월간 운영"],
        ].map(([id, t]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-line bg-surface px-2.5 py-1 text-ink-2 hover:text-ink">
            {t}
          </a>
        ))}
      </nav>

      {/* ① 데이터 상태 */}
      <Section id="status" num="①" title="데이터 상태" subtitle="화면별로 어떤 데이터가 언제까지 들어 있는지 · 사람별 시작 시점">
        <div className="overflow-x-auto">
          <table className="tnum w-full min-w-[640px] border-collapse text-left text-[12.5px]">
            <thead className="bg-sunken text-[11.5px] text-ink-2">
              <tr>
                <th className="px-3 py-2 font-semibold">데이터</th>
                <th className="px-3 py-2 font-medium">쓰이는 화면</th>
                <th className="px-3 py-2 font-semibold">최신</th>
                {owners.map((o) => (
                  <th key={o.id} className="px-3 py-2 font-medium">
                    {o.label} 시작
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">비고</th>
              </tr>
            </thead>
            <tbody>
              {status.map((r) => (
                <tr key={r.key} className="border-t border-line">
                  <td className="px-3 py-2 font-medium">{r.label}</td>
                  <td className="px-3 py-2 text-ink-2">{r.screen}</td>
                  <td className={`px-3 py-2 font-semibold ${r.latest ? "" : "text-bad"}`}>{fmtLatest(r.latest)}</td>
                  {owners.map((o) => (
                    <td key={o.id} className="px-3 py-2 text-ink-2">
                      {r.starts[o.id] ? fmtLatest(r.starts[o.id]!.slice(0, r.starts[o.id]!.length === 4 ? 4 : 7)) : "–"}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-[11.5px] text-ink-3">{r.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-ink-3">
          ※ 스냅샷 생성 {snapshot.generated_at?.slice(0, 16).replace("T", " ")} · 사람마다 시작 시점이 다르면 &lsquo;전체&rsquo; 화면의 전월·전년 비교에서 그 사람은 빠져요.
        </p>
      </Section>

      {/* ② 아키텍처 */}
      <Section id="arch" num="②" title="파이프라인 아키텍처" subtitle="뱅크샐러드 → 이 화면까지 · 비유는 Tableau와 식당으로">
        <ArchitectureDiagram />
      </Section>

      {/* ③ 결제수단 매핑 */}
      <Section
        id="mapping"
        num="③"
        title="결제수단 매핑표"
        subtitle="사람별로 쓰는 계좌·체크카드·신용카드 · 기준은 BigQuery 매핑 테이블 payment_method_map"
        right={ownerFilter}
      >
        {snapshot.payment_method ? (
          <PaymentMethodTable model={pm} owners={owners} showOwners={showOwners} />
        ) : (
          <p className="py-8 text-center text-sm text-ink-3">스냅샷에 결제수단 데이터가 없어요 — 새 버전 rttr-publish 를 배포·실행하세요.</p>
        )}
      </Section>

      {/* ④ 카드별 지출 */}
      <Section
        id="cards"
        num="④"
        title="카드별 지출 (최근 3개월)"
        subtitle={`어떤 카드를 얼마나 쓰는지 · ${owner === "all" ? "두 사람 합계" : label(owner)}`}
        right={ownerFilter}
      >
        <CardSpendPanel model={spend} owners={owners} showOwners={showOwners} />
      </Section>

      {/* ⑤ 품질 체크 */}
      <Section id="quality" num="⑤" title="데이터 품질 체크" subtitle="갱신 후 모두 ✓ 이면 OK · ⚠ 는 조치 필요, ℹ 는 참고">
        <ul className="divide-y divide-line">
          {checks.map((c) => (
            <li key={c.key} className="flex items-start gap-3 py-2.5">
              <span aria-hidden className={`mt-0.5 w-4 text-center text-sm font-bold ${LEVEL_ICON[c.level].cls}`}>
                {LEVEL_ICON[c.level].icon}
              </span>
              <div className="min-w-0">
                <p className={`text-[13px] font-semibold ${c.level === "warn" ? "text-bad" : ""}`}>{c.title}</p>
                <p className="break-keep text-[12px] text-ink-3">{c.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {/* ⑥ 용어·지표 */}
      <Section id="terms" num="⑥" title="용어 · 지표 정의" subtitle="화면에서 숫자를 읽는 기준 — 화면별로 펼쳐 보기">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {DEFINITIONS.map((d) => (
            <details key={d.screen} className="rounded-xl border border-line px-3 py-2" open={d.screen === "공통"}>
              <summary className="cursor-pointer text-[13px] font-semibold">{d.screen}</summary>
              <dl className="mt-2 space-y-1.5 text-[12.5px]">
                {d.items.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[110px_1fr] gap-2">
                    <dt className="font-medium text-ink-2">{k}</dt>
                    <dd className="break-keep text-ink-3">{v}</dd>
                  </div>
                ))}
              </dl>
            </details>
          ))}
        </div>
      </Section>

      {/* ⑦ 월간 운영 */}
      <Section id="ops" num="⑦" title="월간 운영 체크리스트" subtitle="매달 초 데이터 갱신 순서 (관리자용)">
        <details className="rounded-xl border border-line px-3 py-2">
          <summary className="cursor-pointer text-[13px] font-semibold">펼쳐 보기 · 6단계, 약 15분</summary>
          <ol className="mt-3 space-y-2.5 text-[12.5px]">
            {OPS.map((o, i) => (
              <li key={o.step} className="flex gap-3">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sunken text-[11px] font-semibold">{i + 1}</span>
                <div className="min-w-0">
                  <p className="font-semibold">{o.step}</p>
                  <p className="text-ink-3">{o.detail}</p>
                  {o.cmd && <code className="mt-1 block overflow-x-auto whitespace-nowrap rounded-lg bg-sunken px-2 py-1 text-[11.5px] text-ink">{o.cmd}</code>}
                </div>
              </li>
            ))}
          </ol>
        </details>
      </Section>
    </main>
  );
}
