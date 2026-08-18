import { Dialog } from '../../ui/dialog';
import { C } from '../../ui/dialogFormTokens';
import type { Expense } from '../../types/finance';

interface DeleteInstallmentDialogProps {
  open: boolean;
  expense: Expense | null;
  isLoading?: boolean;
  onClose: () => void;
  onDeleteOne: () => void;
  onDeleteGroup: () => void;
}

export function DeleteInstallmentDialog({
  open, expense, isLoading = false, onClose, onDeleteOne, onDeleteGroup,
}: DeleteInstallmentDialogProps) {
  if (!expense) return null;

  return (
    <Dialog open={open} title="Excluir despesa parcelada" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <p style={{ margin: '0 26px', fontSize: 14, color: C.textSoft }}>
          {`"${expense.descricao}" (${expense.parcela}) faz parte de um parcelamento. O que deseja excluir?`}
        </p>

        <div style={{ margin: '0 26px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={onDeleteOne}
            disabled={isLoading}
            style={{
              padding: '12px 20px', borderRadius: 11, fontSize: 14, fontWeight: 600,
              border: `1px solid ${C.borderInput}`, background: '#fff', color: C.text,
              cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.5 : 1, textAlign: 'left',
            }}
          >
            Excluir só esta parcela
          </button>
          <button
            type="button"
            onClick={onDeleteGroup}
            disabled={isLoading}
            style={{
              padding: '12px 20px', borderRadius: 11, fontSize: 14, fontWeight: 700,
              border: 'none', background: C.danger, color: '#fff',
              boxShadow: '0 6px 16px -6px rgba(180,35,24,0.5)',
              cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.5 : 1, textAlign: 'left',
            }}
          >
            Excluir parcelamento inteiro
          </button>
        </div>

        <div style={{ margin: '0 26px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            style={{ padding: '12px 20px', borderRadius: 11, fontSize: 14, fontWeight: 600, border: `1px solid ${C.borderInput}`, background: '#fff', color: C.textSoft, cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.5 : 1 }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </Dialog>
  );
}
