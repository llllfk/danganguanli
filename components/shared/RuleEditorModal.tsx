"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TextArea } from "@/components/ui/TextArea";

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

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      width="xl"
      footer={
        <>
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
        </>
      }
    >
      <TextArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        areaClassName="!min-h-[360px]"
        hint="修改后写入数据库规则表，业务引擎按对应规则执行。"
      />
    </Modal>
  );
}
