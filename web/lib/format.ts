/** 숫자 표시 규칙 */

const won = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });

/** 148,508,477 */
export function formatWon(v: number | null | undefined): string {
  return v === null || v === undefined ? "–" : won.format(Math.round(v));
}

/** 축·라벨용 한국식 축약: 1.49억 / 5,000만 / 3.2만 / 850 */
export function formatCompactKRW(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e8) return `${sign}${trim(abs / 1e8, abs >= 1e9 ? 1 : 2)}억`;
  if (abs >= 1e4) return `${sign}${won.format(Math.round(abs / 1e4))}만`;
  return `${sign}${won.format(abs)}`;
}

export function formatPct(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? "–" : `${(v * 100).toFixed(digits)}%`;
}

/** '2026-09' → '26.09' (축 라벨), 연도 바뀌는 달만 연도 표시는 차트에서 처리 */
export function formatMonthShort(ym: string): string {
  return ym.slice(5);
}

export function formatMonthLong(ym: string): string {
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월`;
}

function trim(n: number, digits: number): string {
  return String(Number(n.toFixed(digits)));
}
