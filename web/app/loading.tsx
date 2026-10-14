/**
 * 화면 전환·첫 접속 중 바로 보이는 자리 표시 화면
 * (페이지가 요청마다 로그인·데이터를 확인하는 동적 페이지라, 이게 없으면 클릭 후 응답이 올 때까지 화면이 그대로 멈춰 보임)
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-6 sm:px-6 lg:px-8" aria-busy="true" aria-label="불러오는 중">
      <div className="mb-4 h-10 w-72 max-w-full animate-pulse rounded-full bg-sunken" />
      <div className="h-8 w-64 max-w-full animate-pulse rounded-lg bg-sunken" />
      <div className="mt-2 h-4 w-48 animate-pulse rounded bg-sunken" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-[120px] animate-pulse" />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-[300px] animate-pulse" />
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-ink-3">불러오는 중…</p>
    </main>
  );
}
