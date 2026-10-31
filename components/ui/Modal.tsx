"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const WIDTH = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
};

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = "md",
  className,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="关闭遮罩"
        className="absolute inset-0 bg-[#0b1f36]/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative w-full rounded-2xl bg-white shadow-[0_28px_80px_-24px_rgba(15,55,100,0.55)] border border-[#d7e4f2] anim-fade-up",
          WIDTH[width],
          className
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#e4ebf3] px-5 py-4">
          <h3 className="text-lg font-bold text-[#1f2d42]">{title}</h3>
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>
            关闭
          </Button>
        </div>
        <div className="px-5 py-4 max-h-[70vh] overflow-auto">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-3 border-t border-[#e4ebf3] px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
