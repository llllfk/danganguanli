"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type Props = {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmModal({
  open,
  title = "请确认",
  message,
  confirmText = "确认",
  cancelText = "取消",
  danger,
  busy,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {cancelText}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            {busy ? "处理中…" : confirmText}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-7 text-[#1f2d42]">{message}</p>
    </Modal>
  );
}
