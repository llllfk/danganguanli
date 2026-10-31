"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/policy", label: "政策问答", icon: "问" },
  { href: "/archive", label: "智能整编", icon: "编" },
  { href: "/audit", label: "审核查验", icon: "核" },
  { href: "/talent", label: "人才分析", icon: "才" },
];

export function SideNav() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => setIsAdmin(j.data?.user?.role === "admin"))
      .catch(() => setIsAdmin(false));
  }, []);

  const items = isAdmin
    ? [...NAV, { href: "/users", label: "用户管理", icon: "管" }]
    : NAV;

  return (
    <aside className="w-[88px] shrink-0 bg-white border-r border-[#e4ebf3] flex flex-col items-center py-4 gap-3">
      <div className="flex flex-col items-center gap-3 flex-1 w-full">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative w-[72px] h-[84px] rounded-2xl flex flex-col items-center justify-center gap-2 transition",
                active
                  ? "bg-gradient-to-b from-[#eef6fe] to-[#ddeafb] text-[#1a4b7a]"
                  : "text-[#7b8da0] hover:bg-[#f5f8fc]"
              )}
            >
              {active ? (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-12 w-1.5 rounded-r bg-[#2f6fc0]" />
              ) : null}
              <span
                className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center text-sm font-bold",
                  active
                    ? "bg-[#4a9eff] text-white"
                    : "bg-[#e8eef5] text-[#94a3b8]"
                )}
              >
                {item.icon}
              </span>
              <span className="text-[13px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
      <div
        className="mb-2 h-11 w-11 rounded-full bg-gradient-to-b from-[#3d82d0] to-[#1f5ea0] opacity-80"
        aria-hidden
      />
    </aside>
  );
}
