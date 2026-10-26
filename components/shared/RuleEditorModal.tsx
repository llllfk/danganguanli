"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type Props = {
  open: boolean;
  title: string;
  value: string;
  onClose: () => void;
  onSave: (next: string) => Promise<void> | void;
};

export function RuleEditorModal({
  open,
  title,
  value,
  onClose,
  onSave,
}: Props) {
  const [text, setText] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setText(value);
  }, [open, value]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-card anim-fade-up">
        <div className="flex items-center justify-between border-b border-[#e4ebf3] px-5 py-4">
          <h3 className="text-lg font-bold text-[#1f2d42]">{title}</h3>
          <button
            className="text-[#7b8da0] hover:text-[#1f2d42]"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
        <div className="p-5">
          <textarea
            className="h-[360px] w-full rounded-xl border border-[#cfe0f5] bg-[#f8fbff] p-4 text-sm leading-6 outline-none focus:border-[#4a9eff]"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="mt-2 text-xs text-[#7b8da0]">
            修改后立即生效（内存规则；接入数据库后可持久化）。
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t border-[#e4ebf3] px-5 py-4">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(text);
                onClose();
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "保存中..." : "保存并应用"}
          </Button>
        </div>
      </div>
    </div>
  );
}
