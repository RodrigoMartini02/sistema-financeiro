import { useState, useEffect } from 'react';
import { CircleCheck } from 'lucide-react';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, cardStyle, MoneyField } from '../../ui/dialogFormTokens';
import type { Expense } from '../../types/finance';

interface PaymentModalProps {
  open: boolean;
  expense: Expense | null;
  onClose: () => void;
  onConfirm: (dataPagamento: string, valorPago: number) => void;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function PaymentModal({ open, expense, onClose, onConfirm }: PaymentModalProps) {
  const [dataPagamento, setDataPagamento] = useState(today);
  const [valorPago, setValorPago] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setDataPagamento(today());
      setValorPago(undefined);
    }
  }, [open]);

  if (!expense) return null;

  const valorSugerido = expense.valorFinal;
  const valorPagoNum = valorPago ?? valorSugerido;
  const diferenca = valorPagoNum - valorSugerido;

  function handleConfirm() {
    const vp = valorPago ?? valorSugerido;
    if (!Number.isFinite(vp) || vp <= 0) return;
    onConfirm(dataPagamento, vp);
  }

  return (
    <Dialog
      open={open}
      title="Confirmar Pagamento"
      description={expense.descricao}
      onClose={onClose}
      scrollBody={false}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 -26px' }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}>DATA DE PAGAMENTO</label>
              <input
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
                style={{ ...fieldInputStyle, fontSize: 14 }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}>VALOR PAGO</label>
              <MoneyField value={valorPago} onChange={setValorPago} />
            </div>
          </div>

          {valorPago !== undefined && diferenca !== 0 && (
            <div style={{
              margin: '0 26px 10px', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600,
              ...(diferenca < 0
                ? { background: C.successBg, color: C.success, border: `1px solid ${C.successBorder}` }
                : { background: C.warnBg, color: C.warn, border: `1px solid ${C.warnBorder}` }),
            }}>
              {diferenca < 0
                ? `Economia de ${fmt(Math.abs(diferenca))}`
                : `Acréscimo de ${fmt(diferenca)}`}
            </div>
          )}

          <div style={{ margin: '0 26px 14px', borderRadius: 12, background: '#f8fafb', padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.textMuted }}>
              <span>Valor original</span>
              <span style={{ fontWeight: 600, color: C.text }}>{fmt(valorSugerido)}</span>
            </div>
            {expense.dataVencimento && (
              <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.textMuted }}>
                <span>Vencimento</span>
                <span style={{ fontWeight: 600, color: C.text }}>
                  {new Date(expense.dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                </span>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 'none', borderTop: '1px solid #eef3f6', background: '#fafcfd', padding: '14px 26px 16px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '12px 20px', borderRadius: 11, fontSize: 14, fontWeight: 600, border: `1px solid ${C.borderInput}`, background: '#fff', color: C.textSoft, cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '12px 22px', borderRadius: 11, fontSize: 14, fontWeight: 700,
              border: 'none', cursor: 'pointer', background: C.success, color: '#fff', boxShadow: '0 6px 16px -6px rgba(6,118,71,0.6)',
            }}
          >
            <CircleCheck size={16} />
            Confirmar Pagamento
          </button>
        </div>
      </div>
    </Dialog>
  );
}
