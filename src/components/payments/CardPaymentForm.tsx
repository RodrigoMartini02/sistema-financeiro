import { useEffect, useRef, useState } from 'react';
import { CreditCard, Loader2, RotateCcw, Shield } from 'lucide-react';
import { C, fieldInputStyle, labelStyle } from '../../ui/dialogFormTokens';
import type { MercadoPagoInstance } from '../../utils/mercadoPagoSdk';
import { loadPlatformMercadoPago, postPayment, type PaymentRequestBody } from './paymentRequests';

interface CardFormData {
  number: string; name: string; expiry: string; cvv: string; cpf: string;
}

function maskCard(v: string) {
  return v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}
function maskExpiry(v: string) {
  const n = v.replace(/\D/g, '').slice(0, 4);
  return n.length > 2 ? `${n.slice(0, 2)}/${n.slice(2)}` : n;
}
function maskCpf(v: string) {
  const n = v.replace(/\D/g, '').slice(0, 11);
  if (n.length <= 3) return n;
  if (n.length <= 6) return `${n.slice(0, 3)}.${n.slice(3)}`;
  if (n.length <= 9) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6)}`;
  return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
}

interface CardPaymentFormProps {
  /** Pagamento avulso ou assinatura recorrente. */
  endpoint: string;
  requestBody: PaymentRequestBody;
  mode: 'one-time' | 'recurring';
  onSuccess: () => void;
  onError: (msg: string) => void;
}

/** Cartão: vira token no navegador (o número nunca passa pelo servidor) e segue para o endereço da assinatura. */
export function CardPaymentForm({ endpoint, requestBody, mode, onSuccess, onError }: CardPaymentFormProps) {
  const [form, setForm] = useState<CardFormData>({
    number: '', name: '', expiry: '', cvv: '', cpf: '',
  });
  const [loading, setLoading] = useState(false);
  const mpRef = useRef<MercadoPagoInstance | null>(null);

  useEffect(() => { loadPlatformMercadoPago().then((mp) => { mpRef.current = mp; }); }, []);

  const set = (field: keyof CardFormData, val: string) =>
    setForm((f) => ({ ...f, [field]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!mpRef.current) {
        throw new Error('SDK de pagamento não disponível. Recarregue a página e tente novamente.');
      }

      const [month = '', year = ''] = form.expiry.split('/').map((s) => s.trim());
      const tokenResult = await mpRef.current.createCardToken({
        cardNumber: form.number.replace(/\D/g, ''),
        cardholderName: form.name.trim(),
        cardExpirationMonth: month,
        cardExpirationYear: year.length === 2 ? `20${year}` : year,
        securityCode: form.cvv.trim(),
        ...(form.cpf ? { identificationType: 'CPF', identificationNumber: form.cpf.replace(/\D/g, '') } : {}),
      });

      if (!tokenResult?.id) throw new Error('Falha ao tokenizar cartão. Verifique os dados.');

      const cardBody = mode === 'one-time'
        ? { ...requestBody, card_token: tokenResult.id, cpf: form.cpf }
        : { ...requestBody, card_token: tokenResult.id };
      await postPayment<unknown>(endpoint, cardBody);

      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro desconhecido. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <label style={labelStyle}>NÚMERO DO CARTÃO</label>
        <input
          required maxLength={19} placeholder="0000 0000 0000 0000"
          style={fieldInputStyle}
          value={form.number}
          onChange={(e) => set('number', maskCard(e.target.value))}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <label style={labelStyle}>NOME NO CARTÃO</label>
        <input
          required placeholder="Como aparece no cartão"
          style={{ ...fieldInputStyle, textTransform: 'uppercase' }}
          value={form.name}
          onChange={(e) => set('name', e.target.value.toUpperCase())}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={labelStyle}>VALIDADE</label>
          <input
            required placeholder="MM/AA" maxLength={5}
            style={fieldInputStyle}
            value={form.expiry}
            onChange={(e) => set('expiry', maskExpiry(e.target.value))}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={labelStyle}>CVV</label>
          <input
            required type="password" placeholder="•••" maxLength={4}
            style={fieldInputStyle}
            value={form.cvv}
            onChange={(e) => set('cvv', e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <label style={labelStyle}>CPF DO TITULAR <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: C.textMuted }}>(recomendado)</span></label>
        <input
          placeholder="000.000.000-00" maxLength={14}
          style={fieldInputStyle}
          value={form.cpf}
          onChange={(e) => set('cpf', maskCpf(e.target.value))}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4,
          padding: '0 16px', height: 30, borderRadius: 999, fontSize: 12.5, fontWeight: 600, border: 'none',
          background: C.primary, color: '#fff',
          cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
        }}
      >
        {loading
          ? <><Loader2 size={15} className="animate-spin" /> Processando...</>
          : mode === 'one-time'
            ? <><CreditCard size={15} /> Pagar agora</>
            : <><RotateCcw size={15} /> Assinar com débito automático</>
        }
      </button>

      <p style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, textAlign: 'center', fontSize: 11, color: C.textMuted }}>
        <Shield size={11} /> Pagamento seguro via Mercado Pago
      </p>
    </form>
  );
}
