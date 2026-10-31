"use client";

import { cn } from "@/lib/utils";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label?: string;
  hint?: string;
  className?: string;
  inputClassName?: string;
};

/** 自定义外观输入框 */
export function Field({
  label,
  hint,
  className,
  inputClassName,
  id,
  ...props
}: Props) {
  const inputId = id || props.name;
  return (
    <label className={cn("block text-sm", className)}>
      {label ? (
        <span className="mb-1.5 block text-xs font-medium tracking-wide text-[#5b7a99]">
          {label}
        </span>
      ) : null}
      <span className="ui-field-shell block">
        <input
          id={inputId}
          className={cn("ui-field", inputClassName)}
          {...props}
        />
      </span>
      {hint ? <span className="mt-1 block text-xs text-[#7b8da0]">{hint}</span> : null}
    </label>
  );
}
