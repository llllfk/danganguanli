import { Suspense } from "react";
import { LoginClient } from "@/components/auth/LoginClient";

/** Coze 构建环境无法访问 Google Fonts，登录页用系统中文字体 */
export default function LoginPage() {
  return (
    <div style={{ fontFamily: "var(--font-login-body)" }}>
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-[#0b1f36] text-[#8ec5ff]">
            加载登录页…
          </div>
        }
      >
        <LoginClient />
      </Suspense>
    </div>
  );
}
