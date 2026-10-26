"use client";

import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-sm",
        variant === "primary" &&
          "bg-[#4a9eff] text-white hover:bg-[#2f6fc0] shadow-sm",
        variant === "secondary" &&
          "bg-white text-[#1a4b7a] border border-[#a9cdf5] hover:bg-[#eef6fe]",
        variant === "ghost" && "bg-transparent text-[#2f6fc0] hover:bg-[#eef6fe]",
        variant === "danger" && "bg-rose-500 text-white hover:bg-rose-600",
        className
      )}
      {...props}
    />
  );
}
