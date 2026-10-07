import { useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog } from '../../ui/dialog';
import { C, cardStyle, chipStyle } from '../../ui/dialogFormTokens';
import { CardPaymentForm } from './CardPaymentForm';
import { CheckoutRedirectPanel } from './CheckoutRedirectPanel';
import { PixPanel } from './PixPanel';
import type { PaymentEndpoints, PaymentRequestBody } from './paymentRequests';

type PayTab = 'pix' | 'cartao' | 'recorrente';

const TABS: { id: PayTab; label: string }[] = [
  { id: 'pix', label: 'PIX' },
  { id: 'cartao', label: 'Cartão' },
  { id: 'recorrente', label: 'Recorrente' },
];

export interface PaymentSummary {
  name: string;
  priceLabel: string;
}

interface PaymentDialogProps {
  summary: PaymentSummary;
  endpoints: PaymentEndpoints;
  requestBody: PaymentRequestBody;
  /** Dica sobre as formas de pagamento, mostrada junto das abas (o FINGERENCE usa o guia de primeiro acesso). */
  tabsHint?: ReactNode;
  onClose: () => void;
  onSuccess: () => void;
}

/** Assinar: Pix, cartão avulso (ou checkout) e cartão recorrente, no Mercado Pago da plataforma. */
export function PaymentDialog({ summary, endpoints, requestBody, tabsHint, onClose, onSuccess }: PaymentDialogProps) {
  const [tab, setTab] = useState<PayTab>('pix');
  const [erro, setErro] = useState('');

  const handleSuccess = () => { onClose(); onSuccess(); };

  return (
    <Dialog open title={`Assinar ${summary.name}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Resumo */}
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.primarySoft, border: `1px solid ${C.primarySoftBorder}` }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: C.primaryDark }}>{summary.name}</p>
            <p style={{ margin: 0, fontSize: 12, color: C.primary }}>Cobrado mensalmente</p>
          </div>
          <p style={{ margin: 0, fontSize: 21, fontWeight: 700, color: C.primaryDark }}>{summary.priceLabel}</p>
        </div>

        {erro && (
          <div style={{ ...cardStyle, display: 'flex', alignItems: 'flex-start', gap: 8, background: C.dangerBg, border: `1px solid ${C.dangerBorder}` }}>
            <AlertTriangle size={15} style={{ marginTop: 2, flexShrink: 0, color: C.danger }} />
            <span style={{ fontSize: 13, color: C.danger }}>{erro}</span>
          </div>
        )}

        {/* Tabs */}
        <div style={{ ...cardStyle, position: 'relative' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {TABS.map(({ id, label }) => (
              <div key={id} onClick={() => { setTab(id); setErro(''); }} style={{ ...chipStyle(tab === id, { h: 38 }), flex: 1 }}>
                {label}
              </div>
            ))}
          </div>
          {tabsHint}
        </div>

        {/* Tab content */}
        <div style={{ margin: '0 26px 10px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tab === 'pix' && <PixPanel endpoint={endpoints.pix} requestBody={requestBody} onSuccess={handleSuccess} />}
          {tab === 'cartao' && (
            <>
              <p style={{ margin: 0, fontSize: 11, color: C.textMuted, textAlign: 'center' }}>Pagamento único — seu plano é renovado manualmente.</p>
              <CardPaymentForm
                endpoint={endpoints.card} requestBody={requestBody} mode="one-time"
                onSuccess={handleSuccess} onError={setErro}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, borderTop: `1px solid ${C.border}` }} />
                <span style={{ fontSize: 10, color: C.textMuted }}>ou</span>
                <div style={{ flex: 1, borderTop: `1px solid ${C.border}` }} />
              </div>
              <CheckoutRedirectPanel endpoint={endpoints.checkout} requestBody={requestBody} onError={setErro} />
            </>
          )}
          {tab === 'recorrente' && (
            <>
              <div style={{ borderRadius: 12, border: `1px solid ${C.successBorder}`, background: C.successBg, padding: '12px 14px' }}>
                <p style={{ margin: '0 0 2px', fontSize: 13.5, fontWeight: 600, color: C.success }}>Débito automático mensal</p>
                <p style={{ margin: 0, fontSize: 12, color: C.success }}>Seu cartão é cobrado automaticamente a cada período. Cancele a qualquer momento.</p>
              </div>
              <CardPaymentForm
                endpoint={endpoints.recurring} requestBody={requestBody} mode="recurring"
                onSuccess={handleSuccess} onError={setErro}
              />
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
