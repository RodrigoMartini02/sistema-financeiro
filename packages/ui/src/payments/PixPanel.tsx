import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, Copy, Loader2, QrCode } from 'lucide-react';
import { C } from '../../ui/dialogFormTokens';
import { postPayment, type PixData, type PaymentRequestBody } from './paymentRequests';

interface PixPanelProps {
  endpoint: string;
  requestBody: PaymentRequestBody;
  onSuccess: () => void;
}

/** Pix: gera o QR Code e o copia e cola; a liberação vem pelo aviso do Mercado Pago. */
export function PixPanel({ endpoint, requestBody, onSuccess }: PixPanelProps) {
  const [copied, setCopied] = useState(false);

  const pixMut = useMutation({
    mutationFn: () => postPayment<PixData>(endpoint, requestBody),
  });

  const handleCopy = () => {
    if (!pixMut.data?.qr_code) return;
    navigator.clipboard.writeText(pixMut.data.qr_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!pixMut.data && !pixMut.isPending && !pixMut.error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: C.textMuted, textAlign: 'center' }}>
          Pague com PIX em qualquer app bancário. Confirmação automática em até 1 minuto.
        </p>
        <button
          type="button"
          onClick={() => pixMut.mutate()}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 16px', height: 30, borderRadius: 999, fontSize: 12.5, fontWeight: 600, border: 'none', background: C.primary, color: '#fff', cursor: 'pointer' }}
        >
          <QrCode size={16} /> Gerar QR Code PIX
        </button>
      </div>
    );
  }

  if (pixMut.isPending) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '24px 0' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: C.primary }} />
        <p style={{ margin: 0, fontSize: 13.5, color: C.textMuted }}>Gerando QR Code...</p>
      </div>
    );
  }

  if (pixMut.error) {
    return (
      <div style={{ borderRadius: 12, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '12px 14px', fontSize: 13, color: C.danger }}>
        {pixMut.error instanceof Error ? pixMut.error.message : 'Erro ao gerar PIX.'}
        <button onClick={() => pixMut.reset()} style={{ marginLeft: 8, textDecoration: 'underline', color: C.danger, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>Tentar novamente</button>
      </div>
    );
  }

  const d = pixMut.data!;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {d.qr_code_base64 && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <img src={`data:image/png;base64,${d.qr_code_base64}`} alt="QR Code PIX"
            style={{ height: 192, width: 192, borderRadius: 12, border: `1px solid ${C.border}`, padding: 8 }} />
        </div>
      )}
      <div style={{ borderRadius: 12, border: `1px solid ${C.border}`, background: C.cardBg, padding: '10px 12px' }}>
        <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textFaint }}>Copia e cola</p>
        <p style={{ margin: 0, fontSize: 11, fontFamily: 'monospace', color: C.text, lineHeight: 1.5, wordBreak: 'break-all' }}>{d.qr_code.slice(0, 80)}…</p>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '0 16px', height: 30, borderRadius: 999, fontSize: 12.5, fontWeight: 600, border: `1px solid ${C.borderInput}`, background: '#fff', color: C.textSoft, cursor: 'pointer' }}
      >
        {copied ? <><Check size={15} /> Copiado!</> : <><Copy size={15} /> Copiar código</>}
      </button>
      <p style={{ margin: 0, textAlign: 'center', fontSize: 12, color: C.textMuted }}>Seu plano é ativado automaticamente após o pagamento.</p>
      <button onClick={onSuccess} style={{ textAlign: 'center', fontSize: 13, color: C.primary, background: 'none', border: 'none', cursor: 'pointer' }}>
        Já paguei — verificar status
      </button>
    </div>
  );
}
