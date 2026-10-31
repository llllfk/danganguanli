"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/talent", match: ["/talent", "/talent/stats"], label: "信息统计" },
  { href: "/talent/portrait", match: ["/talent/portrait"], label: "人才画像" },
  { href: "/talent/match", match: ["/talent/match"], label: "人岗匹配" },
  {
    href: "/talent/reminders",
    match: ["/talent/reminders"],
    label: "节点提醒",
  },
];

export function TalentNav() {
  const pathname = usePathname();
  return (
    <div className="relative">
      <div className="flex gap-8 text-[15px]">
        {TABS.map((t) => {
          const active = t.match.includes(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "relative pb-3 font-medium transition",
                active ? "text-[#2E5E9E]" : "text-[#8A9BB0] hover:text-[#2E5E9E]"
              )}
            >
              {t.label}
              {active ? (
                <span className="absolute left-1/2 -translate-x-1/2 bottom-0 h-1.5 w-14 rounded-full bg-[#3D7EDB]" />
              ) : null}
            </Link>
          );
        })}
      </div>
      <div className="h-0.5 bg-[#4a9eff]/25" />
    </div>
  );
}
