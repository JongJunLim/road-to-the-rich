// Firebase 로그인 핸들러가 있는 원래 주소.
// 모바일(특히 iPhone Safari)은 "다른 사이트" 저장소를 막기 때문에, 로그인 핸들러(/__/auth/*)를
// 우리 앱 주소 아래로 대신 전달(프록시)해 같은 사이트처럼 동작하게 한다.
// ※ rewrites 는 빌드 시점에 굳고(Cloud Build 에는 런타임 환경변수가 없음) 기본값을 코드에 둔다.
//   Firebase 프로젝트 주소는 로그인 화면에서 브라우저에 그대로 보이는 공개 식별자라 비밀값이 아님.
//   직접 배포할 때는 FIREBASE_AUTH_PROXY_TARGET 으로 바꾸거나 이 기본값을 본인 프로젝트로 수정.
const FIREBASE_AUTH_PROXY_TARGET =
  process.env.FIREBASE_AUTH_PROXY_TARGET || "https://project-7fa653f6-d7a3-40a0-893.firebaseapp.com";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // Cloud Run용 최소 이미지
  // 실데이터 개발 서버(npm run dev:real)는 빌드 폴더를 분리해 데모 서버와 동시에 띄울 수 있게 함
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // 데모 JSON은 서버에서만 읽으므로 파일 추적에 포함
  outputFileTracingIncludes: { "/*": ["./data/**/*"] }, // 모든 화면 (데모 스냅샷 · 데모 계획표)
  async rewrites() {
    return [
      { source: "/__/auth/:path*", destination: `${FIREBASE_AUTH_PROXY_TARGET}/__/auth/:path*` },
      { source: "/__/firebase/:path*", destination: `${FIREBASE_AUTH_PROXY_TARGET}/__/firebase/:path*` },
    ];
  },
};

export default nextConfig;
