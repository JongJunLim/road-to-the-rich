"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DataMode } from "@/lib/data";
import { LIMITS, newRowId, parseAmount, planTotals, SECTIONS, type Plan, type PlanRow, type PlanSection } from "@/lib/plan";
import { formatPct, formatWon } from "@/lib/format";
import AppNav from "../AppNav";

/**
 * 화면 3 — Monthly Plan
 * - 보기: 수익 · 저축 · 고정 지출 표 + 합계 + 수익 배분 막대
 * - 편집(편집자만): 칸 바로 수정 · 행 추가/삭제/순서 변경 → [저장] 한 번에 반영
 */

type Editable = "yes" | "no" | "demo";

interface Draft {
  id: string;
  section: PlanSection;
  item: string;
  amountText: string;
  memo: string;
}

const COLOR: Record<PlanSection | "remain", string> = {
  income: "var(--series-1)",
  saving: "var(--series-3)",
  expense: "var(--series-2)",
  remain: "var(--axis)",
};

const toDraft = (r: PlanRow): Draft => ({
  id: r.id,
  section: r.section,
  item: r.item,
  amountText: r.amount === null ? "" : formatWon(r.amount),
  memo: r.memo,
});

function formatUpdated(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** 입력 중인 행 → 저장용 행 (금액 해석 실패 시 null 반환) */
function draftToRow(d: Draft): PlanRow | null {
  const amount = parseAmount(d.amountText);
  if (amount === undefined) return null;
  return { id: d.id, section: d.section, item: d.item.trim(), amount, memo: d.memo.trim() };
}

function rowError(d: Draft): string | null {
  if (!d.item.trim()) return "항목 이름을 입력해 주세요";
  if (parseAmount(d.amountText) === undefined) return "금액은 숫자만 입력해 주세요";
  return null;
}

export default function PlanBoard({
  initial,
  token: initialToken,
  mode,
  editable,
  userMenu,
}: {
  initial: Plan;
  token: string;
  mode: DataMode;
  editable: Editable;
  userMenu?: React.ReactNode;
}) {
  const [saved, setSaved] = useState<Plan>(initial);
  const [token, setToken] = useState(initialToken);
  const [drafts, setDrafts] = useState<Draft[]>(() => initial.rows.map(toDraft));
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "ok" | "error"; msg?: string; conflict?: boolean }>({ kind: "idle" });

  // 보기 화면·합계는 입력 중인 값 기준 (금액이 잘못된 칸은 0으로 계산)
  const rows: PlanRow[] = useMemo(
    () => (editing ? drafts.map((d) => draftToRow(d) ?? { id: d.id, section: d.section, item: d.item, amount: null, memo: d.memo }) : saved.rows),
    [editing, drafts, saved.rows],
  );
  const totals = useMemo(() => planTotals(rows), [rows]);

  const savedJson = useMemo(() => JSON.stringify(saved.rows.map(toDraft)), [saved.rows]);
  const dirty = editing && JSON.stringify(drafts) !== savedJson;
  const errors = drafts.map(rowError);
  const hasError = errors.some(Boolean);

  // 저장하지 않고 창을 닫거나 새로고침하면 경고
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const startEdit = () => {
    setDrafts(saved.rows.map(toDraft));
    setStatus({ kind: "idle" });
    setEditing(true);
  };
  const cancel = () => {
    if (dirty && !window.confirm("저장하지 않은 변경 내용을 버릴까요?")) return;
    setDrafts(saved.rows.map(toDraft));
    setEditing(false);
    setStatus({ kind: "idle" });
  };

  const save = useCallback(async () => {
    if (!dirty || hasError || status.kind === "saving") return;
    if (editable === "demo") {
      setStatus({ kind: "error", msg: "데모 모드에서는 저장되지 않아요. (화면 확인용)" });
      return;
    }
    const payload = drafts.map(draftToRow).filter((r): r is PlanRow => r !== null);
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload, token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setStatus({ kind: "error", msg: data.error ?? `저장 실패 (${res.status})`, conflict: data.reason === "conflict" });
        return;
      }
      setSaved(data.plan);
      setToken(data.token);
      setDrafts((data.plan as Plan).rows.map(toDraft));
      setEditing(false);
      setStatus({ kind: "ok", msg: "저장했어요" });
    } catch {
      setStatus({ kind: "error", msg: "네트워크 오류로 저장하지 못했어요. 다시 시도해 주세요." });
    }
  }, [dirty, hasError, status.kind, editable, drafts, token]);

  // Ctrl/Cmd + S 저장
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, save]);

  // "저장했어요" 안내는 잠시 후 사라짐
  useEffect(() => {
    if (status.kind !== "ok") return;
    const t = setTimeout(() => setStatus({ kind: "idle" }), 2500);
    return () => clearTimeout(t);
  }, [status.kind]);

  /* ---------------- 행 조작 ---------------- */
  // 다시 고치기 시작하면 이전 오류 안내는 지움 (동시 수정 충돌 안내는 유지)
  const touch = () => setStatus((st) => (st.kind === "error" && !st.conflict ? { kind: "idle" } : st));
  const update = (id: string, patch: Partial<Draft>) => {
    touch();
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };
  const remove = (id: string) => {
    touch();
    setDrafts((ds) => ds.filter((d) => d.id !== id));
  };
  const add = (section: PlanSection) => {
    if (drafts.length >= LIMITS.rows) return;
    const id = newRowId();
    setDrafts((ds) => {
      // 같은 구분의 마지막 행 바로 뒤에 추가
      const lastIdx = ds.map((d) => d.section).lastIndexOf(section);
      const next = [...ds];
      next.splice(lastIdx === -1 ? ds.length : lastIdx + 1, 0, { id, section, item: "", amountText: "", memo: "" });
      return next;
    });
    requestAnimationFrame(() => document.getElementById(`item-${id}`)?.focus());
  };
  /** 같은 구분 안에서 위/아래로 이동 */
  const move = (id: string, dir: -1 | 1) =>
    setDrafts((ds) => {
      const i = ds.findIndex((d) => d.id === id);
      let j = i + dir;
      while (j >= 0 && j < ds.length && ds[j].section !== ds[i].section) j += dir;
      if (j < 0 || j >= ds.length) return ds;
      const next = [...ds];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const updated = formatUpdated(saved.updatedAt);
  const changedCount = dirty ? countChanges(saved.rows.map(toDraft), drafts) : 0;

  return (
    <main className={`mx-auto w-full max-w-[1100px] px-4 pt-6 sm:px-6 lg:px-8 ${editing ? "pb-32" : "pb-16"}`}>
      <AppNav />

      {/* ---------- 헤더 ---------- */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Monthly Plan</h1>
            {mode === "demo" && (
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-3">DEMO</span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-2">매달 고정으로 들어오고 나가는 돈 · 수익 − (저축 + 지출)</p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-3 text-xs text-ink-3 sm:w-auto sm:justify-end sm:text-right">
          {userMenu}
          <div>
            <div>업데이트 · {updated ?? "아직 없음"}</div>
            <div>{editable === "no" ? "보기 전용" : editable === "demo" ? "데모 · 저장 안 됨" : "직접 입력 데이터"}</div>
          </div>
          {editable !== "no" && !editing && (
            <button
              type="button"
              onClick={startEdit}
              className="h-8 rounded-full bg-[var(--accent)] px-4 text-[13px] font-semibold text-[var(--surface)] transition hover:opacity-85"
            >
              편집
            </button>
          )}
        </div>
      </header>

      {/* ---------- 합계 ---------- */}
      <section className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="합계">
        <TotalCard label="수익 합계" value={totals.income} color={COLOR.income} />
        <TotalCard label="저축 합계" value={totals.saving} color={COLOR.saving} share={share(totals.saving, totals.income)} />
        <TotalCard label="고정 지출 합계" value={totals.expense} color={COLOR.expense} share={share(totals.expense, totals.income)} />
        <TotalCard
          label="남는 금액"
          value={totals.remain}
          color={totals.remain < 0 ? "var(--delta-bad)" : COLOR.remain}
          share={share(totals.remain, totals.income)}
          strong
        />
      </section>
      <AllocationBar income={totals.income} saving={totals.saving} expense={totals.expense} remain={totals.remain} />

      {/* ---------- 구분별 표 ---------- */}
      <div className="mt-4 flex flex-col gap-4">
        {SECTIONS.map((s) => {
          const list = editing ? drafts.filter((d) => d.section === s.key) : null;
          const view = rows.filter((r) => r.section === s.key);
          const total = s.key === "income" ? totals.income : s.key === "saving" ? totals.saving : totals.expense;
          return (
            <section key={s.key} className="card overflow-hidden" aria-labelledby={`sec-${s.key}`}>
              <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
                <h2 id={`sec-${s.key}`} className="flex items-center gap-2 text-[15px] font-semibold">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[s.key] }} />
                  {s.label}
                  <span className="text-xs font-medium text-ink-3">{view.length}개</span>
                </h2>
                <p className="tnum text-[15px] font-bold">
                  <span className="mr-2 text-xs font-medium text-ink-3">{s.total}</span>
                  {formatWon(total)}
                  <span className="ml-0.5 text-xs font-medium text-ink-3">원</span>
                </p>
              </header>

              {list ? (
                <EditList
                  section={s.key}
                  list={list}
                  errors={Object.fromEntries(drafts.map((d, i) => [d.id, errors[i]]))}
                  onUpdate={update}
                  onRemove={remove}
                  onMove={move}
                  onAdd={() => add(s.key)}
                  canAdd={drafts.length < LIMITS.rows}
                />
              ) : (
                <ViewList rows={view} />
              )}
            </section>
          );
        })}
      </div>

      {!editing && status.kind === "ok" && (
        <p role="status" className="fixed bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--surface)] shadow-lg">
          ✓ {status.msg}
        </p>
      )}

      {/* ---------- 저장 막대 (편집 중) ---------- */}
      {editing && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-[var(--surface)]/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-8">
            <p className={`min-w-0 text-[13px] ${status.kind === "error" ? "text-bad" : "text-ink-2"}`} role="status">
              {status.kind === "error"
                ? status.msg
                : status.kind === "saving"
                  ? "저장 중…"
                  : hasError
                    ? "빨간 칸을 확인해 주세요"
                    : dirty
                      ? `저장하지 않은 변경 ${changedCount}건`
                      : "변경 사항 없음"}
              {status.conflict && (
                <button type="button" onClick={() => window.location.reload()} className="ml-2 font-semibold underline">
                  새로고침
                </button>
              )}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancel}
                className="h-9 rounded-full border border-line px-4 text-[13px] font-semibold text-ink-2 transition hover:bg-sunken"
              >
                {dirty ? "취소" : "닫기"}
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={!dirty || hasError || status.kind === "saving"}
                className="h-9 rounded-full bg-[var(--accent)] px-5 text-[13px] font-semibold text-[var(--surface)] transition enabled:hover:opacity-85 disabled:opacity-35"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ */

function share(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

function countChanges(before: Draft[], after: Draft[]): number {
  const b = new Map(before.map((d) => [d.id, JSON.stringify(d)]));
  const a = new Map(after.map((d) => [d.id, JSON.stringify(d)]));
  let n = 0;
  for (const [id, v] of a) if (b.get(id) !== v) n++;
  for (const id of b.keys()) if (!a.has(id)) n++;
  // 순서만 바뀐 경우
  if (n === 0 && before.map((d) => d.id).join() !== after.map((d) => d.id).join()) n = 1;
  return n;
}

function TotalCard({
  label,
  sub,
  value,
  color,
  share,
  strong,
}: {
  label: string;
  sub?: string;
  value: number;
  color: string;
  share?: number | null;
  strong?: boolean;
}) {
  return (
    <div className={`card flex min-w-0 flex-col gap-2 p-3.5 sm:p-5 ${strong ? "ring-1 ring-[var(--border)]" : ""}`}>
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 sm:text-sm">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="truncate">{label}</span>
      </p>
      <p className={`tnum min-w-0 truncate font-bold leading-none tracking-tight text-[19px] min-[400px]:text-[21px] sm:text-[26px] ${value < 0 ? "text-bad" : ""}`}>
        {formatWon(value)}
        <span className="ml-1 hidden text-base font-medium text-ink-3 sm:inline">원</span>
      </p>
      <p className="truncate text-[11px] text-ink-3 sm:text-xs">
        {share !== undefined && share !== null ? `수익의 ${formatPct(share)}` : sub ?? "월 기준"}
      </p>
    </div>
  );
}

/** 수익이 어디로 가는지 — 저축 · 고정 지출 · 남는 금액 비율 */
function AllocationBar({ income, saving, expense, remain }: { income: number; saving: number; expense: number; remain: number }) {
  if (income <= 0) return null;
  const parts = [
    { key: "saving", label: "저축", value: Math.max(0, saving), color: COLOR.saving },
    { key: "expense", label: "고정 지출", value: Math.max(0, expense), color: COLOR.expense },
    { key: "remain", label: "남는 금액", value: Math.max(0, remain), color: COLOR.remain },
  ];
  const sum = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <section className="card mt-3 p-4 sm:p-5" aria-label="수익 배분">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-ink-2 sm:text-sm">수익 배분</h2>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {parts.map((p) => (
            <span key={p.key} className="flex items-center gap-1.5 text-xs text-ink-2">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              {p.label} <span className="tnum font-semibold text-ink">{formatPct(p.value / income)}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-sunken" role="img" aria-label={parts.map((p) => `${p.label} ${formatPct(p.value / income)}`).join(", ")}>
        {parts.map((p) =>
          p.value > 0 ? <span key={p.key} style={{ width: `${(p.value / sum) * 100}%`, background: p.color }} className="h-full" /> : null,
        )}
      </div>
      {remain < 0 && <p className="mt-2 text-xs font-medium text-bad">저축 + 고정 지출이 수익보다 {formatWon(-remain)}원 많아요</p>}
    </section>
  );
}

function ViewList({ rows }: { rows: PlanRow[] }) {
  if (rows.length === 0) return <p className="px-4 py-6 text-center text-sm text-ink-3 sm:px-5">항목이 없어요</p>;
  return (
    <ul className="divide-y divide-[var(--border)]">
      {rows.map((r) => (
        <li key={r.id} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(140px,220px)_150px_1fr] sm:items-start sm:px-5">
          <span className="min-w-0 text-[14px] font-medium">{r.item}</span>
          <span className={`tnum text-right text-[14px] font-semibold ${r.amount === null ? "font-normal text-ink-3" : ""}`}>
            {r.amount === null ? "미정" : formatWon(r.amount)}
          </span>
          {r.memo ? (
            <span className="col-span-2 whitespace-pre-line text-[12px] leading-relaxed text-ink-3 sm:col-span-1 sm:text-[13px] sm:text-ink-2">{r.memo}</span>
          ) : (
            <span className="hidden sm:block" />
          )}
        </li>
      ))}
    </ul>
  );
}

const inputCls =
  "w-full rounded-lg border bg-[var(--page)] px-2.5 py-1.5 text-[14px] outline-none transition focus:border-[var(--series-1)]";

function EditList({
  section,
  list,
  errors,
  onUpdate,
  onRemove,
  onMove,
  onAdd,
  canAdd,
}: {
  section: PlanSection;
  list: Draft[];
  errors: Record<string, string | null>;
  onUpdate: (id: string, patch: Partial<Draft>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onAdd: () => void;
  canAdd: boolean;
}) {
  return (
    <div>
      <div className="hidden grid-cols-[minmax(140px,220px)_150px_1fr_92px] gap-3 border-b border-line bg-sunken px-5 py-2 text-[11px] font-semibold text-ink-3 sm:grid">
        <span>항목</span>
        <span className="text-right">금액 (원)</span>
        <span>메모</span>
        <span className="sr-only">순서 · 삭제</span>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {list.map((d, i) => {
          const err = errors[d.id];
          const amountBad = parseAmount(d.amountText) === undefined;
          const itemBad = !d.item.trim();
          return (
            <li key={d.id} className="grid grid-cols-[1fr_120px] gap-2 px-4 py-3 sm:grid-cols-[minmax(140px,220px)_150px_1fr_92px] sm:items-start sm:gap-3 sm:px-5">
              <input
                id={`item-${d.id}`}
                value={d.item}
                maxLength={LIMITS.item}
                onChange={(e) => onUpdate(d.id, { item: e.target.value })}
                placeholder="항목"
                aria-label="항목"
                aria-invalid={itemBad}
                className={`${inputCls} ${itemBad ? "border-[var(--delta-bad)]" : "border-line"}`}
              />
              <input
                value={d.amountText}
                inputMode="numeric"
                onChange={(e) => onUpdate(d.id, { amountText: e.target.value })}
                onBlur={() => {
                  const v = parseAmount(d.amountText);
                  if (v !== undefined) onUpdate(d.id, { amountText: v === null ? "" : formatWon(v) });
                }}
                placeholder="미정"
                aria-label="금액"
                aria-invalid={amountBad}
                className={`tnum ${inputCls} text-right ${amountBad ? "border-[var(--delta-bad)]" : "border-line"}`}
              />
              <textarea
                value={d.memo}
                maxLength={LIMITS.memo}
                rows={Math.min(4, Math.max(1, d.memo.split("\n").length))}
                onChange={(e) => onUpdate(d.id, { memo: e.target.value })}
                placeholder="메모 (줄바꿈 가능)"
                aria-label="메모"
                className={`${inputCls} col-span-2 resize-none border-line text-[13px] leading-relaxed sm:col-span-1`}
              />
              <div className="col-span-2 flex items-center justify-end gap-1 sm:col-span-1 sm:pt-0.5">
                {err && <span className="mr-auto text-[11px] text-bad sm:hidden">{err}</span>}
                <IconBtn label="위로" disabled={i === 0} onClick={() => onMove(d.id, -1)}>
                  ↑
                </IconBtn>
                <IconBtn label="아래로" disabled={i === list.length - 1} onClick={() => onMove(d.id, 1)}>
                  ↓
                </IconBtn>
                <IconBtn label={`${d.item || "행"} 삭제`} danger onClick={() => onRemove(d.id)}>
                  ×
                </IconBtn>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-line px-4 py-2.5 sm:px-5">
        <button
          type="button"
          onClick={onAdd}
          disabled={!canAdd}
          className="rounded-full px-2 py-1 text-[13px] font-semibold text-ink-2 transition hover:bg-sunken hover:text-ink disabled:opacity-40"
          data-section={section}
        >
          + 행 추가
        </button>
      </div>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid h-8 w-8 place-items-center rounded-full border border-line text-[14px] text-ink-2 transition hover:bg-sunken disabled:opacity-30 ${
        danger ? "hover:border-[var(--delta-bad)] hover:text-bad" : ""
      }`}
    >
      {children}
    </button>
  );
}
