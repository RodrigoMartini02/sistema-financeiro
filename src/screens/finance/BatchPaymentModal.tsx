import { useState, useEffect } from 'react';
import { CircleCheck, AlertCircle } from 'lucide-react';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, cardStyle, chipStyle } from '../../ui/dialogFormTokens';
import { pagarDespesa } from '../../services/financeService';
import type { Expense } from '../../types/finance';
import { formatCurrency } from './formatters';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { GUIDE_LAYER_MODAL } from '../../context/FirstAccessGuideContext';
import { getLocalTodayIso } from '../../utils/date';

interface BatchPaymentModalProps {
  open: boolean;
  expenses: Expense[];
  onClose: () => void;
  onSuccess: () => void;
}

type Tab = 'original' | 'personalizado';

export function BatchPaymentModal({ open, expenses, onClose, onSuccess }: BatchPaymentModalProps) {
  const [tab, setTab] = useState<Tab>('original');
  const [dataPagamento, setDataPagamento] = useState(getLocalTodayIso);
  const [valoresPorId, setValoresPorId] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const tabGuide = useFirstAccessGuide('despesas:batch-valor-v1', {
    enabled: open && expenses.length > 0,
    layer: GUIDE_LAYER_MODAL,
  });

  useEffect(() => {
    if (open) {
      setTab('original');
      setDataPagamento(getLocalTodayIso());
      setValoresPorId({});
      setLoading(false);
      setErro(null);
    }
  }, [open]);

  async function handleConfirm() {
    if (!dataPagamento) return;
    setLoading(true);
    setErro(null);
    let ok = 0;
    for (const expense of expenses) {
      const rawVal = tab === 'original'
        ? expense.valorFinal
        : parseFloat((valoresPorId[expense.id] ?? '').replace(',', '.') || String(expense.valorFinal));
      const valor = Number.isFinite(rawVal) && rawVal > 0 ? rawVal : expense.valorFinal;
      try {
        await pagarDespesa(expense.id, dataPagamento, valor);
        ok++;
      } catch {
        setErro(`Erro após ${ok} de ${expenses.length} pagamento(s). Verifique as demais despesas.`);
        setLoading(false);
        return;
      }
    }
    setLoading(false);
    onSuccess();
    onClose();
  }

  const totalOriginal = expenses.reduce((s, e) => s + e.valorFinal, 0);
  const totalPersonalizado = expenses.reduce((s, e) => {
    const v = parseFloat((valoresPorId[e.id] ?? '').replace(',', '.'));
    return s + (Number.isFinite(v) && v > 0 ? v : e.valorFinal);
  }, 0);

  return (
    <Dialog
      open={open}
      title={`Pagamento em lote — ${expenses.length} despesa(s)`}
      onClose={() => { if (!loading) onClose(); }}
      scrollBody={false}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 calc(-1 * var(--dialog-px))' }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>

          <div style={{ ...cardStyle, position: 'relative' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}>FORMA DE COBRANÇA</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <div onClick={() => setTab('original')} style={{ ...chipStyle(tab === 'original', { h: 38 }), flex: 1 }}>
                  Valor original
                </div>
                <div onClick={() => setTab('personalizado')} style={{ ...chipStyle(tab === 'personalizado', { h: 38 }), flex: 1 }}>
                  Valor personalizado
                </div>
              </div>
            </div>
            {tabGuide.isVisible && (
              <FirstAccessGuideCard
                floating
                placement="bottom"
                className="w-[min(24rem,calc(100vw-2rem))]"
                icon={CircleCheck}
                description={tab === 'original' ? firstAccessGuideMessages.batchValorOriginal : firstAccessGuideMessages.batchValorPersonalizado}
                onDismiss={tabGuide.dismiss}
                onSilenceAll={tabGuide.silenceAll}
              />
            )}
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}>DATA DE PAGAMENTO</label>
              <input
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
                style={{ ...fieldInputStyle, fontSize: 14 }}
              />
            </div>
          </div>

          <div style={{ margin: '0 var(--dialog-px) 10px', borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', maxHeight: 224, overflowY: 'auto' }}>
            {tab === 'original' ? (
              expenses.map((e, i) => (
                <div
                  key={e.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', fontSize: 13,
                    background: i % 2 === 0 ? '#fff' : C.cardBg,
                  }}
                >
                  <span style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{e.descricao}</span>
                  <span style={{ fontWeight: 700, color: C.danger, flexShrink: 0, marginLeft: 12 }}>
                    {formatCurrency(e.valorFinal)}
                  </span>
                </div>
              ))
            ) : (
              expenses.map((e, i) => (
                <div
                  key={e.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', fontSize: 13,
                    background: i % 2 === 0 ? '#fff' : C.cardBg,
                  }}
                >
                  <span style={{ flex: 1, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.descricao}</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder={e.valorFinal.toFixed(2)}
                    value={valoresPorId[e.id] ?? ''}
                    onChange={(ev) =>
                      setValoresPorId((prev) => ({ ...prev, [e.id]: ev.target.value }))
                    }
                    style={{ width: 110, height: 32, borderRadius: 8, border: `1.5px solid ${C.borderInput}`, padding: '0 8px', textAlign: 'right', fontSize: 13, color: C.text, outline: 'none' }}
                  />
                </div>
              ))
            )}
          </div>

          <div style={{ margin: '0 var(--dialog-px) 14px', borderRadius: 12, background: '#f8fafb', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: C.textMuted }}>Total a pagar</span>
            <span style={{ fontWeight: 700, color: C.danger }}>
              {formatCurrency(tab === 'original' ? totalOriginal : totalPersonalizado)}
            </span>
          </div>

          {erro && (
            <div style={{ margin: '0 var(--dialog-px) 14px', display: 'flex', alignItems: 'flex-start', gap: 8, borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '10px 14px', fontSize: 13, color: C.danger }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{erro}</span>
            </div>
          )}
        </div>

        <div style={{ flex: 'none', borderTop: '1px solid #eef3f6', background: '#fafcfd', padding: '14px var(--dialog-px) 16px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{ padding: '12px 20px', borderRadius: 11, fontSize: 14, fontWeight: 600, border: `1px solid ${C.borderInput}`, background: '#fff', color: C.textSoft, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || !dataPagamento}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', height: 30, borderRadius: 999, fontSize: 12.5, fontWeight: 600,
              border: 'none', cursor: loading || !dataPagamento ? 'not-allowed' : 'pointer',
              background: C.success, color: '#fff',
              opacity: loading || !dataPagamento ? 0.5 : 1,
            }}
          >
            <CircleCheck size={16} />
            {loading ? 'Processando...' : `Pagar ${expenses.length} despesa(s)`}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
