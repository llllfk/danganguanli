"use client";

import { cn } from "@/lib/utils";

type Props = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "className"
> & {
  label?: string;
  hint?: string;
  className?: string;
  areaClassName?: string;
};

export function TextArea({
  label,
  hint,
  className,
  areaClassName,
  id,
  ...props
}: Props) {
  const areaId = id || props.name;
  return (
    <label className={cn("block text-sm", className)}>
      {label ? (
        <span className="mb-1.5 block text-xs font-medium tracking-wide text-[#5b7a99]">
          {label}
        </span>
      ) : null}
      <span className="ui-field-shell block !p-0 overflow-hidden">
        <textarea
          id={areaId}
          className={cn("ui-field ui-textarea", areaClassName)}
          {...props}
        />
      </span>
      {hint ? <span className="mt-1 block text-xs text-[#7b8da0]">{hint}</span> : null}
    </label>
  );
}
