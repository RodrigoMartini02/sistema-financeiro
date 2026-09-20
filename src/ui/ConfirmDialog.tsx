import { Dialog } from './dialog';
import { C, saveButtonStyle, dangerButtonStyle } from './dialogFormTokens';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'default';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  variant = 'danger',
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} title={title} onClose={onCancel}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <p style={{ margin: '0 26px', fontSize: 14, color: C.textSoft }}>{message}</p>
        <div style={{ margin: '0 26px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            style={{
              ...(variant === 'danger' ? dangerButtonStyle : saveButtonStyle),
              cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.5 : 1,
            }}
          >
            {isLoading ? 'Aguarde...' : confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
