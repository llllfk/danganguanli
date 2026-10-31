"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string };

type Props = {
  label?: string;
  hint?: string;
  value: string;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onChange: (value: string) => void;
};

/** 自定义下拉（无原生 select） */
export function Select({
  label,
  hint,
  value,
  options,
  placeholder = "请选择",
  disabled,
  className,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative text-sm", className)}>
      {label ? (
        <div className="mb-1.5 text-xs font-medium tracking-wide text-[#5b7a99]">
          {label}
        </div>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={cn(
          "ui-field-shell flex w-full items-center justify-between gap-2 text-left",
          open && "ui-field-shell-open",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span className={cn("ui-field-static truncate", !current && "text-[#94a3b8]")}>
          {current?.label || placeholder}
        </span>
        <span
          className={cn(
            "text-[#7b8da0] text-xs transition-transform",
            open && "rotate-180"
          )}
        >
          ▼
        </span>
      </button>
      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute z-[90] mt-1.5 w-full max-h-56 overflow-auto rounded-xl border border-[#cfe0f5] bg-white shadow-[0_16px_40px_-16px_rgba(15,55,100,0.45)] py-1 anim-fade-up"
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                className={cn(
                  "w-full text-left px-3 py-2.5 text-sm transition",
                  active
                    ? "bg-[#eef6fe] text-[#1a4b7a] font-medium"
                    : "text-[#1f2d42] hover:bg-[#f5f9fd]"
                )}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      ) : null}
      {hint ? <div className="mt-1 text-xs text-[#7b8da0]">{hint}</div> : null}
    </div>
  );
}
