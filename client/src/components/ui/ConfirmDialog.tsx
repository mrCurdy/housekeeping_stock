import { useState, type ReactNode } from 'react';
import { useI18n } from '@/context/I18nContext';
import { Button } from './Button';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

/** Yes/no modal. Shows a spinner while an async onConfirm runs, then closes. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  danger = true,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const confirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t.common.cancel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={confirm} loading={pending}>
            {confirmLabel ?? t.common.confirm}
          </Button>
        </>
      }
    />
  );
}
