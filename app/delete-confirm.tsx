'use client';
import { Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
export function DeleteConfirm({
  count,
  label,
  busy,
  error,
  cancel,
  confirm,
  title,
  description,
  confirmLabel = '移入回收站',
  cancelLabel = '保留记录',
  className = '',
}: {
  count: number;
  label: string;
  busy: boolean;
  error?: string;
  cancel: () => void;
  confirm: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  className?: string;
}) {
  return (
    <Dialog
      open={count > 0}
      onOpenChange={(v) => {
        if (!v && !busy) cancel();
      }}
    >
      <DialogContent
        className={`dialog-popup delete-dialog ${className}`}
        showCloseButton={false}
      >
        <div className="delete-symbol">
          <Trash2 size={26} />
        </div>
        <DialogTitle>
          {title ?? `将 ${count} 条${label}记录移入回收站？`}
        </DialogTitle>
        <DialogDescription>
          {description ??
            '记录会从看板和统计中移除。之后可以从页面顶部的回收站恢复。'}
        </DialogDescription>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={cancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={busy}
            onClick={confirm}
          >
            {busy ? '正在处理…' : confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
