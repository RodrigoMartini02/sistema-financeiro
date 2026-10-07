import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { C, chipStyle } from '../../ui/dialogFormTokens';
import { postPayment, type CheckoutData, type PaymentRequestBody } from './paymentRequests';

interface CheckoutRedirectPanelProps {
  endpoint: string;
  requestBody: PaymentRequestBody;
  onError: (msg: string) => void;
}

/** Link do checkout do Mercado Pago (crédito ou débito), aberto em nova aba. */
export function CheckoutRedirectPanel({ endpoint, requestBody, onError }: CheckoutRedirectPanelProps) {
  const [formaPag, setFormaPag] = useState<'cartao' | 'debito'>('cartao');

  const checkoutMut = useMutation({
    mutationFn: () => postPayment<CheckoutData>(endpoint, { ...requestBody, forma_pagamento: formaPag }),
    onSuccess: (data) => {
      if (data?.payment_url) window.open(data.payment_url, '_blank', 'noopener');
      else onError('Link de pagamento não retornado. Tente novamente.');
    },
    onError: (err) => onError(err instanceof Error ? err.message : 'Erro ao gerar link.'),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 13.5, color: C.textMuted, textAlign: 'center' }}>
        Você será redirecionado para o checkout seguro do Mercado Pago.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {(['cartao', 'debito'] as const).map((f) => (
          <div key={f} onClick={() => setFormaPag(f)} style={{ ...chipStyle(formaPag === f, { h: 62, r: 12 }), flexDirection: 'column', gap: 4 }}>
            <CreditCard size={16} />
            {f === 'cartao' ? 'Crédito' : 'Débito'}
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={checkoutMut.isPending}
        onClick={() => checkoutMut.mutate()}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 16px', height: 30, borderRadius: 999, fontSize: 12.5, fontWeight: 600, border: 'none', background: C.primary, color: '#fff', cursor: checkoutMut.isPending ? 'not-allowed' : 'pointer', opacity: checkoutMut.isPending ? 0.6 : 1 }}
      >
        {checkoutMut.isPending
          ? <><Loader2 size={16} className="animate-spin" /> Gerando link...</>
          : <><ExternalLink size={16} /> Ir para o checkout</>}
      </button>
      <p style={{ margin: 0, textAlign: 'center', fontSize: 12, color: C.textMuted }}>Abre em nova aba. Retorna automaticamente após o pagamento.</p>
    </div>
  );
}
