import { Suspense } from "react";
import { Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";
import { LoginClient } from "@/components/auth/LoginClient";

const display = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-login-display",
  display: "swap",
});

const body = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-login-body",
  display: "swap",
});

export default function LoginPage() {
  return (
    <div
      className={`${display.variable} ${body.variable} font-[family-name:var(--font-login-body)]`}
    >
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
