import type { NextConfig } from "next";

const isRailwayBuild =
  process.env.RAILWAY_BUILD === "1" ||
  Boolean(process.env.RAILWAY_ENVIRONMENT_ID);

const nextConfig: NextConfig = {
  // Railway self-hosted Preview만 standalone output을 사용합니다.
  // Vercel Production/Preview에는 기존 Next.js 설정을 그대로 유지합니다.
  ...(isRailwayBuild ? { output: "standalone" as const } : {}),
};

export default nextConfig;
