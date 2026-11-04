import { useEffect, useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { IsoDateField } from '../../ui/DateField';
import { Dialog } from '../../ui/dialog';
import { C, fieldInputStyle, labelStyle, saveButtonStyle } from '../../ui/dialogFormTokens';
import { defaultReceiptDate } from '../../utils/cashDate';
import { getLocalTodayIso } from '../../utils/date';

interface ReceiptDateDialogProps {
  open: boolean;
  /** Descrição da receita que será confirmada. */
  description: string;
  /** Data prevista da receita: de onde sai a data sugerida. */
  plannedDate: string;
  isLoading: boolean;
  error?: string | null;
  onConfirm: (receivedDate: string) => void;
  onClose: () => void;
}

/**
 * Confirmar o recebimento de uma receita prevista com a data em que ela entrou: a receita conta no mês
 * dessa data (regime de caixa). A sugerida é a prevista, se é do mês atual; senão, hoje — assim a
 * confirmação não cai sozinha num mês que já fechou.
 */
export function ReceiptDateDialog({ open, description, plannedDate, isLoading, error, onConfirm, onClose }: ReceiptDateDialogProps) {
  const [receivedDate, setReceivedDate] = useState('');

  useEffect(() => {
    if (open) setReceivedDate(defaultReceiptDate(plannedDate, getLocalTodayIso()));
  }, [open, plannedDate]);

  return (
    <Dialog
      open={open}
      title="Confirmar recebimento"
      description={description}
      size="xs"
      onClose={() => { if (!isLoading) onClose(); }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <label style={labelStyle}>DATA DO RECEBIMENTO</label>
        <IsoDateField
          value={receivedDate}
          onChange={setReceivedDate}
          label="Data do recebimento"
          required
          inputStyle={{ ...fieldInputStyle, fontSize: 14 }}
        />
        <span style={{ fontSize: 11.5, color: C.textMuted }}>A receita conta no mês desta data.</span>
      </div>

      {error && (
        <div style={{ marginTop: 12, borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '10px 14px', fontSize: 13, color: C.danger }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button
          type="button"
          disabled={isLoading || !receivedDate}
          onClick={() => onConfirm(receivedDate)}
          style={{ ...saveButtonStyle, opacity: isLoading || !receivedDate ? 0.5 : 1, cursor: isLoading || !receivedDate ? 'not-allowed' : 'pointer' }}
        >
          <CircleCheck size={15} />
          {isLoading ? 'Confirmando...' : 'Confirmar'}
        </button>
      </div>
    </Dialog>
  );
}
