/**
 * ② 파이프라인 아키텍처 — 데이터가 뱅크샐러드에서 이 화면까지 오는 길
 * 그림 라이브러리 없이 카드 + 화살표로 그림 (PC: 왼쪽 → 오른쪽 5단계, 모바일: 위 → 아래)
 * 비유는 노션 「🔰 처음 읽는 사람을 위한 큰 그림」과 같은 표현 (Tableau · 식당)
 */

interface Node {
  icon: string;
  title: string;
  tech: string;
  analogy: string;
  manual?: string; // 내가 직접 하는 일 (없으면 자동)
  tone?: "store" | "run" | "screen";
}

interface Stage {
  step: string;
  name: string;
  nodes: Node[];
}

const STAGES: Stage[] = [
  {
    step: "1",
    name: "원천",
    nodes: [
      { icon: "🧾", title: "뱅크샐러드 내보내기", tech: "ZIP (거래·자산·투자)", analogy: "장 봐 온 식재료 · 원천 시스템 export", manual: "매월 앱에서 내보내기" },
      { icon: "📦", title: "원본 보관함", tech: "Cloud Storage (GCS)", analogy: "창고 · 파일 서버", manual: "ZIP 업로드", tone: "store" },
    ],
  },
  {
    step: "2",
    name: "적재",
    nodes: [
      { icon: "🔧", title: "ETL", tech: "Cloud Run · Python", analogy: "재료 손질 · Tableau Prep 흐름", manual: "실행", tone: "run" },
      { icon: "🧪", title: "BigQuery DEV", tech: "banksalad.*", analogy: "손질대 · 스테이징 테이블", tone: "store" },
    ],
  },
  {
    step: "3",
    name: "검수 · 집계",
    nodes: [
      {
        icon: "👨‍🍳",
        title: "rttr-publish",
        tech: "Cloud Run Job · 트랜잭션",
        analogy: "매달 한 번 출근하는 셰프 · 예약 새로 고침",
        manual: "명령 1줄",
        tone: "run",
      },
      { icon: "✅", title: "BigQuery PRD", tech: "banksalad_prd.prd_*", analogy: "검수 끝난 진열장 · 운영 마트", tone: "store" },
      { icon: "🗂️", title: "결제수단 매핑표", tech: "banksalad_prd.payment_method_map", analogy: "그룹 필드 정의 · 이 화면 ③", tone: "store" },
    ],
  },
  {
    step: "4",
    name: "추출",
    nodes: [
      { icon: "🍱", title: "스냅샷 latest.json", tech: "GCS 비공개 버킷 · 월별 합계만", analogy: "포장된 도시락 · .hyper 추출", tone: "store" },
      { icon: "📝", title: "계획표 plan.json", tech: "GCS monthly_plan · 버전 관리", analogy: "화이트보드 · Monthly Plan 화면", manual: "웹에서 편집", tone: "store" },
    ],
  },
  {
    step: "5",
    name: "화면",
    nodes: [
      { icon: "🖥️", title: "rttr-web", tech: "Next.js · Cloud Run", analogy: "홀 직원 · Tableau Server", tone: "screen" },
      { icon: "🔑", title: "Google 로그인", tech: "Firebase Auth + 허용 명단", analogy: "입구 신분증 확인 · SSO", tone: "screen" },
      { icon: "🎪", title: "공개 데모 rttr-demo", tech: "같은 이미지 · 합성 데이터", analogy: "모형 음식 트럭 · Tableau Public", tone: "screen" },
    ],
  },
];

const toneCls: Record<NonNullable<Node["tone"]> | "default", string> = {
  default: "border-line bg-surface",
  store: "border-line bg-[var(--page)]",
  run: "border-[var(--series-2)]/50 bg-surface",
  screen: "border-[var(--series-1)]/50 bg-surface",
};

function NodeCard({ n }: { n: Node }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${toneCls[n.tone ?? "default"]}`}>
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-lg leading-6">
          {n.icon}
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-5">{n.title}</div>
          <div className="text-[11px] leading-4 text-ink-2">{n.tech}</div>
          <div className="mt-0.5 text-[11px] leading-4 text-ink-3">{n.analogy}</div>
          {n.manual && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--series-1-wash)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--series-1)]">
              👤 {n.manual}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ArchitectureDiagram() {
  return (
    <div>
      <ol className="grid grid-cols-1 gap-2 lg:grid-cols-[repeat(5,minmax(0,1fr))] lg:gap-0">
        {STAGES.map((s, i) => (
          <li key={s.step} className="relative flex flex-col lg:px-2.5">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink-2">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--accent)] text-[10px] text-[var(--surface)]">{s.step}</span>
              {s.name}
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {s.nodes.map((n) => (
                <NodeCard key={n.title} n={n} />
              ))}
            </div>
            {i < STAGES.length - 1 && (
              <>
                {/* PC: 오른쪽 화살표 */}
                <span aria-hidden className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-lg text-ink-3 lg:block">
                  ›
                </span>
                {/* 모바일: 아래 화살표 */}
                <span aria-hidden className="mt-1 block text-center text-lg leading-none text-ink-3 lg:hidden">
                  ↓
                </span>
              </>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-4 grid grid-cols-1 gap-2 text-[12px] text-ink-2 sm:grid-cols-3">
        <p className="rounded-xl bg-[var(--page)] px-3 py-2">
          <b className="text-ink">👤 매월 내가 하는 일 3가지</b>
          <br />
          ZIP 업로드 → ETL 실행 → rttr-publish 명령 1줄. 웹은 다시 배포하지 않아도 10분 안에 새 숫자를 보여줘요.
        </p>
        <p className="rounded-xl bg-[var(--page)] px-3 py-2">
          <b className="text-ink">🔒 웹은 BigQuery에 직접 붙지 않아요</b>
          <br />
          미리 집계한 스냅샷 파일 1개만 읽어요. 조회 비용이 없고, 로그인 전에는 그 파일도 읽지 않아요.
        </p>
        <p className="rounded-xl bg-[var(--page)] px-3 py-2">
          <b className="text-ink">💰 거의 0원</b>
          <br />
          아무도 안 보면 서버가 0대로 줄고, BigQuery는 한 달에 한 번만 조회해요. 예산 알림은 월 5,000원.
        </p>
      </div>
    </div>
  );
}
