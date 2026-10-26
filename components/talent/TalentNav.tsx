"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/talent", label: "综合看板" },
  { href: "/talent/portrait", label: "人才画像" },
  { href: "/talent/match", label: "人岗匹配" },
  { href: "/talent/reminders", label: "节点提醒" },
];

export function TalentNav() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition",
              active
                ? "bg-[#4a9eff] text-white shadow-sm"
                : "bg-white text-[#1a4b7a] border border-[#cfe0f5] hover:bg-[#eef6fe]"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
