import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../services/apiClient';
import { queryKeys } from '../../services/queryKeys';
import { Card } from '../../ui/card';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, cardStyle, chipStyle } from '../../ui/dialogFormTokens';
import {
  CheckCircle2, Crown, Loader2, Copy, Check, QrCode,
  CreditCard, ExternalLink, AlertTriangle, RefreshCw,
  Shield, RotateCcw, XCircle,
} from 'lucide-react';
import { ErrorState } from '../../ui/states';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';

// ─── types ───────────────────────────────────────────────────

declare global { interface Window { MercadoPago: any } }

type PlanTipo = 'mensal' | 'premium' | 'anual' | 'premium_anual';

interface PlanoStatus {
  status: 'trial' | 'ativo' | 'expirado';
  plano_tipo: PlanTipo | 'master' | null;
  plano_expiracao: string | null;
  dias_restantes_trial: number | null;
  data_cadastro: string;
}

interface PixData { payment_id: number; qr_code: string; qr_code_base64: string }
interface AssinarData { payment_url: string }

interface CardFormData {
  number: string; name: string; expiry: string; cvv: string; cpf: string; parcelas: number;
}

// ─── planos config ────────────────────────────────────────────

const PLANO_DEF = {
  plus: {
    nome: 'Plus',
    destaque: false,
    tipo: 'mensal' as PlanTipo,
    precoNum: 4.99,
    label: 'R$ 4,99/mês',
    periodo: 'Cobrado mensalmente',
    recursos: ['Controle mensal completo', 'Receitas e despesas ilimitadas', 'Reservas e metas', 'Categorias e cartões', 'Relatórios detalhados'],
  },
  premium: {
    nome: 'Premium',
    destaque: true,
    tipo: 'premium' as PlanTipo,
    precoNum: 9.99,
    label: 'R$ 9,99/mês',
    periodo: 'Cobrado mensalmente',
    recursos: ['Tudo do Plus', 'Perfis PF + PJ', 'Multi-usuários', 'Exportação de dados', 'Suporte prioritário'],
  },
};

type PlanKey = keyof typeof PLANO_DEF;

interface SelectedPlan {
  key: PlanKey;
  tipo: PlanTipo;
  precoNum: number;
  label: string;
  nome: string;
}

// ─── helpers ─────────────────────────────────────────────────

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

// ─── MP SDK loader ────────────────────────────────────────────

let mpInitPromise: Promise<any> | null = null;

function loadMpSdk(): Promise<any> {
  if (mpInitPromise) return mpInitPromise;
  mpInitPromise = new Promise((resolve) => {
    const load = async () => {
      try {
        if (!window.MercadoPago) {
          await new Promise<void>((res, rej) => {
            if (document.getElementById('mp-sdk')) {
              const existing = document.getElementById('mp-sdk') as HTMLScriptElement;
              if ((existing as any)._loaded) { res(); return; }
              existing.addEventListener('load', () => { (existing as any)._loaded = true; res(); });
              existing.addEventListener('error', rej);
              return;
            }
            const s = document.createElement('script');
            s.id = 'mp-sdk';
            s.src = 'https://sdk.mercadopago.com/js/v2';
            s.onload = () => { (s as any)._loaded = true; res(); };
            s.onerror = rej;
            document.head.appendChild(s);
          });
        }
        const config = await apiRequest<any>('/planos/config');
        const pubKey = config.public_key ?? config.data?.public_key ?? null;
        if (!pubKey) return resolve(null); // sem chave — não bloqueia a UI
        resolve(new window.MercadoPago(pubKey, { locale: 'pt-BR' }));
      } catch (e) {
        console.warn('[MP SDK] Falha ao carregar:', e);
        resolve(null); // graceful degradation
      }
    };
    load();
  });
  return mpInitPromise;
}

// ─── PIX panel ───────────────────────────────────────────────

function PixPanel({ tipo, onSuccess }: { tipo: PlanTipo; onSuccess: () => void }) {
  const [copied, setCopied] = useState(false);

  const pixMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest<any>('/planos/pix', { method: 'POST', body: JSON.stringify({ tipo }) });
      return (r.data ?? r) as PixData;
    },
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
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 22px', borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', background: C.primary, color: '#fff', boxShadow: '0 6px 16px -6px rgba(8,145,178,0.75)', cursor: 'pointer' }}
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
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '12px 22px', borderRadius: 11, fontSize: 14, fontWeight: 600, border: `1px solid ${C.borderInput}`, background: '#fff', color: C.textSoft, cursor: 'pointer' }}
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

// ─── card form ────────────────────────────────────────────────

function CardPaymentForm({
  tipo, mode, onSuccess, onError,
}: {
  tipo: PlanTipo; mode: 'one-time' | 'recurring';
  onSuccess: () => void; onError: (msg: string) => void;
}) {
  const [form, setForm] = useState<CardFormData>({
    number: '', name: '', expiry: '', cvv: '', cpf: '', parcelas: 1,
  });
  const [loading, setLoading] = useState(false);
  const mpRef = useRef<any>(null);

  useEffect(() => { loadMpSdk().then((mp) => { mpRef.current = mp; }); }, []);

  const set = (field: keyof CardFormData, val: string | number) =>
    setForm((f) => ({ ...f, [field]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!mpRef.current) {
        throw new Error('SDK de pagamento não disponível. Recarregue a página e tente novamente.');
      }

      const [month, year] = form.expiry.split('/').map((s) => s.trim());
      const tokenResult = await mpRef.current.createCardToken({
        cardNumber: form.number.replace(/\D/g, ''),
        cardholderName: form.name.trim(),
        cardExpirationMonth: month,
        cardExpirationYear: year.length === 2 ? `20${year}` : year,
        securityCode: form.cvv.trim(),
        ...(form.cpf ? { identificationType: 'CPF', identificationNumber: form.cpf.replace(/\D/g, '') } : {}),
      });

      if (!tokenResult?.id) throw new Error('Falha ao tokenizar cartão. Verifique os dados.');

      if (mode === 'one-time') {
        const r = await apiRequest<any>('/planos/pay-card', {
          method: 'POST',
          body: JSON.stringify({ tipo, card_token: tokenResult.id, installments: form.parcelas, cpf: form.cpf }),
        });
        const data = r.success !== undefined ? r : r.data ?? r;
        if (data.success === false) throw new Error(data.message || 'Pagamento recusado.');
      } else {
        const r = await apiRequest<any>('/planos/subscribe-recurring', {
          method: 'POST',
          body: JSON.stringify({ tipo, card_token: tokenResult.id }),
        });
        const data = r.success !== undefined ? r : r.data ?? r;
        if (data.success === false) throw new Error(data.message || 'Falha ao criar assinatura.');
      }

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
          padding: '12px 22px', borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none',
          background: C.primary, color: '#fff', boxShadow: '0 6px 16px -6px rgba(8,145,178,0.75)',
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

// ─── checkout redirect panel ──────────────────────────────────

function CheckoutRedirectPanel({ tipo, onError }: { tipo: PlanTipo; onError: (msg: string) => void }) {
  const [formaPag, setFormaPag] = useState<'cartao' | 'debito'>('cartao');

  const checkoutMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest<any>('/planos/subscribe', {
        method: 'POST',
        body: JSON.stringify({ tipo, forma_pagamento: formaPag }),
      });
      return (r.data ?? r) as AssinarData;
    },
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
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 22px', borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', background: C.primary, color: '#fff', boxShadow: '0 6px 16px -6px rgba(8,145,178,0.75)', cursor: checkoutMut.isPending ? 'not-allowed' : 'pointer', opacity: checkoutMut.isPending ? 0.6 : 1 }}
      >
        {checkoutMut.isPending
          ? <><Loader2 size={16} className="animate-spin" /> Gerando link...</>
          : <><ExternalLink size={16} /> Ir para o checkout</>}
      </button>
      <p style={{ margin: 0, textAlign: 'center', fontSize: 12, color: C.textMuted }}>Abre em nova aba. Retorna automaticamente após o pagamento.</p>
    </div>
  );
}

// ─── payment dialog ───────────────────────────────────────────

type PayTab = 'pix' | 'cartao' | 'recorrente';

function PagamentoDialog({ plano, onClose, onSuccess }: {
  plano: SelectedPlan; onClose: () => void; onSuccess: () => void;
}) {
  const [tab, setTab] = useState<PayTab>('pix');
  const [erro, setErro] = useState('');
  const tabsGuide = useFirstAccessGuide('planos:formas-pagamento-v1');

  const handleSuccess = () => { onClose(); onSuccess(); };

  const TABS: { id: PayTab; label: string }[] = [
    { id: 'pix', label: 'PIX' },
    { id: 'cartao', label: 'Cartão' },
    { id: 'recorrente', label: 'Recorrente' },
  ];

  return (
    <Dialog open title={`Assinar ${plano.nome}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Resumo */}
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.primarySoft, border: `1px solid ${C.primarySoftBorder}` }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: C.primaryDark }}>{plano.nome}</p>
            <p style={{ margin: 0, fontSize: 12, color: C.primary }}>Cobrado mensalmente</p>
          </div>
          <p style={{ margin: 0, fontSize: 21, fontWeight: 700, color: C.primaryDark }}>{plano.label}</p>
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
          {tabsGuide.isVisible && (
            <FirstAccessGuideCard
              floating
              placement="bottom"
              className="w-[min(24rem,calc(100vw-2rem))]"
              icon={CreditCard}
              description={firstAccessGuideMessages.planosFormasPagamento}
              onDismiss={tabsGuide.dismiss}
            />
          )}
        </div>

        {/* Tab content */}
        <div style={{ margin: '0 26px 10px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tab === 'pix' && <PixPanel tipo={plano.tipo} onSuccess={handleSuccess} />}
          {tab === 'cartao' && (
            <>
              <p style={{ margin: 0, fontSize: 11, color: C.textMuted, textAlign: 'center' }}>Pagamento único — seu plano é renovado manualmente.</p>
              <CardPaymentForm
                tipo={plano.tipo} mode="one-time"
                onSuccess={handleSuccess} onError={setErro}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, borderTop: `1px solid ${C.border}` }} />
                <span style={{ fontSize: 10, color: C.textMuted }}>ou</span>
                <div style={{ flex: 1, borderTop: `1px solid ${C.border}` }} />
              </div>
              <CheckoutRedirectPanel tipo={plano.tipo} onError={setErro} />
            </>
          )}
          {tab === 'recorrente' && (
            <>
              <div style={{ borderRadius: 12, border: `1px solid ${C.successBorder}`, background: C.successBg, padding: '12px 14px' }}>
                <p style={{ margin: '0 0 2px', fontSize: 13.5, fontWeight: 600, color: C.success }}>Débito automático mensal</p>
                <p style={{ margin: 0, fontSize: 12, color: C.success }}>Seu cartão é cobrado automaticamente a cada período. Cancele a qualquer momento.</p>
              </div>
              <CardPaymentForm
                tipo={plano.tipo} mode="recurring"
                onSuccess={handleSuccess} onError={setErro}
              />
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}

// ─── cancel dialog ────────────────────────────────────────────

interface CancelPreview {
  elegivel: boolean; meses_restantes: number; reembolso: number; tem_payment_id: boolean;
}

function CancelarDialog({ onClose, onCanceled }: { onClose: () => void; onCanceled: () => void }) {
  const [confirmado, setConfirmado] = useState(false);
  const [erro, setErro] = useState('');

  const previewQ = useQuery({
    queryKey: ['cancelar-preview'],
    queryFn: async () => {
      const r = await apiRequest<any>('/planos/cancelar/preview');
      return (r.data ?? r) as CancelPreview;
    },
  });

  const cancelarMut = useMutation({
    mutationFn: () => apiRequest<any>('/planos/cancelar', { method: 'POST' }),
    onSuccess: () => { onCanceled(); },
    onError: (err) => setErro(err instanceof Error ? err.message : 'Erro ao cancelar.'),
  });

  const preview = previewQ.data;

  return (
    <Dialog open title="Cancelar assinatura" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {previewQ.isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
            <Loader2 size={24} className="animate-spin" style={{ color: C.textMuted }} />
          </div>
        )}

        {preview && (
          <>
            <div style={{ ...cardStyle, display: 'flex', alignItems: 'flex-start', gap: 8, background: C.warnBg, border: `1px solid ${C.warnBorder}` }}>
              <AlertTriangle size={16} style={{ marginTop: 2, flexShrink: 0, color: C.warn }} />
              <div style={{ fontSize: 13, color: C.warn }}>
                <p style={{ margin: '0 0 2px', fontWeight: 700 }}>Atenção</p>
                <p style={{ margin: 0 }}>Ao cancelar, seu acesso será encerrado imediatamente.</p>
                {preview.elegivel && preview.reembolso > 0 && (
                  <p style={{ margin: '4px 0 0', fontWeight: 600 }}>
                    Reembolso proporcional: R$ {preview.reembolso.toFixed(2).replace('.', ',')}
                  </p>
                )}
              </div>
            </div>

            {erro && (
              <div style={{ ...cardStyle, display: 'flex', alignItems: 'flex-start', gap: 8, background: C.dangerBg, border: `1px solid ${C.dangerBorder}` }}>
                <AlertTriangle size={14} style={{ marginTop: 2, flexShrink: 0, color: C.danger }} />
                <span style={{ fontSize: 13, color: C.danger }}>{erro}</span>
              </div>
            )}

            <label style={{ margin: '0 26px 14px', display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)}
                style={{ marginTop: 2, width: 16, height: 16, accentColor: C.danger, cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13.5, color: C.text }}>
                Entendo que minha assinatura será cancelada e o acesso encerrado imediatamente.
              </span>
            </label>

            <div style={{ margin: '0 26px', display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={onClose}
                style={{ flex: 1, padding: '12px 20px', borderRadius: 11, fontSize: 14, fontWeight: 600, border: `1px solid ${C.borderInput}`, background: '#fff', color: C.textSoft, cursor: 'pointer' }}
              >
                Manter assinatura
              </button>
              <button
                disabled={!confirmado || cancelarMut.isPending}
                onClick={() => cancelarMut.mutate()}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  padding: '12px 20px', borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none',
                  background: C.danger, color: '#fff', boxShadow: '0 6px 16px -6px rgba(180,35,24,0.5)',
                  cursor: (!confirmado || cancelarMut.isPending) ? 'not-allowed' : 'pointer',
                  opacity: (!confirmado || cancelarMut.isPending) ? 0.4 : 1,
                }}
              >
                {cancelarMut.isPending
                  ? <><Loader2 size={14} className="animate-spin" /> Cancelando...</>
                  : <><XCircle size={14} /> Cancelar assinatura</>}
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

// ─── main screen ──────────────────────────────────────────────

export function PlanosScreen() {
  const qc = useQueryClient();
  const [pagDialog, setPagDialog] = useState<SelectedPlan | null>(null);
  const [cancelDialog, setCancelDialog] = useState(false);

  const statusQ = useQuery({
    queryKey: queryKeys.planStatus,
    queryFn: async () => {
      const r = await apiRequest<any>('/planos/status');
      return (r.data ?? r) as PlanoStatus;
    },
  });

  // preload SDK silently
  useEffect(() => { loadMpSdk(); }, []);

  const s = statusQ.data;
  const planoCurrent = s?.plano_tipo ?? null;

  const openDialog = (key: PlanKey) => {
    const def = PLANO_DEF[key];
    setPagDialog({ key, tipo: def.tipo, precoNum: def.precoNum, label: def.label, nome: def.nome });
  };

  const isAtual = (key: PlanKey) => planoCurrent === PLANO_DEF[key].tipo;

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-700">Assinatura</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">Planos e cobrança</h2>
        </div>
        <button
          onClick={() => { qc.invalidateQueries({ queryKey: queryKeys.planStatus }); }}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition"
        >
          <RefreshCw size={13} /> Atualizar status
        </button>
      </div>

      {/* Status atual */}
      {s && (
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <div className={[
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
              s.status === 'ativo' ? 'bg-amber-100' : s.status === 'trial' ? 'bg-blue-100' : 'bg-slate-100',
            ].join(' ')}>
              <Crown size={20} className={
                s.status === 'ativo' ? 'text-amber-500' : s.status === 'trial' ? 'text-blue-500' : 'text-slate-400'
              } />
            </div>
            <div className="flex-1">
              <p className="font-bold text-slate-900">
                {s.status === 'ativo'    ? `Plano ${s.plano_tipo === 'master' ? 'Master' : s.plano_tipo?.includes('premium') ? 'Premium' : 'Plus'} ativo` :
                 s.status === 'trial'   ? 'Período de teste gratuito' : 'Plano expirado'}
              </p>
              <p className="text-sm text-slate-500">
                {s.status === 'trial' && s.dias_restantes_trial !== null && `${s.dias_restantes_trial} dia(s) restante(s) no trial`}
                {s.status === 'ativo' && s.plano_expiracao && `Válido até ${new Date(s.plano_expiracao).toLocaleDateString('pt-BR')}`}
                {s.status === 'ativo' && !s.plano_expiracao && 'Assinatura ativa (renovação automática)'}
                {s.status === 'expirado' && 'Sua assinatura expirou. Renove para continuar usando.'}
              </p>
            </div>
            <span className={[
              'rounded-full px-3 py-1 text-xs font-bold',
              s.status === 'ativo' ? 'bg-green-100 text-green-700' :
              s.status === 'trial' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700',
            ].join(' ')}>
              {s.status === 'ativo' ? 'Ativo' : s.status === 'trial' ? 'Trial' : 'Expirado'}
            </span>
          </div>
        </Card>
      )}

      {statusQ.error && (
        <ErrorState title="Erro ao carregar status do plano" description={String(statusQ.error)} />
      )}

      {/* Plan cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {(Object.entries(PLANO_DEF) as [PlanKey, typeof PLANO_DEF[PlanKey]][]).map(([key, def]) => {
          const atual = isAtual(key);
          return (
            <Card key={key} className={['p-6 flex flex-col gap-4', def.destaque ? 'ring-2 ring-brand-600' : ''].join(' ')}>
              {def.destaque && (
                <span className="self-start rounded-full bg-brand-600 px-3 py-0.5 text-xs font-bold text-white">
                  Mais popular
                </span>
              )}
              <div>
                <p className="text-lg font-bold text-slate-950">{def.nome}</p>
                <p className="mt-0.5 text-2xl font-bold text-brand-700">{def.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{def.periodo}</p>
              </div>
              <ul className="flex-1 space-y-2">
                {def.recursos.map((r) => (
                  <li key={r} className="flex items-start gap-2 text-sm text-slate-700">
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-green-500" />
                    {r}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => { if (!atual) openDialog(key); }}
                className={[
                  'mt-auto w-full rounded-xl py-2.5 text-sm font-semibold transition',
                  atual
                    ? 'cursor-default bg-slate-100 text-slate-400'
                    : def.destaque
                      ? 'bg-brand-600 text-white hover:bg-brand-700'
                      : 'border border-slate-300 text-slate-700 hover:bg-slate-50',
                ].join(' ')}
              >
                {atual ? 'Plano atual' : 'Assinar agora'}
              </button>
            </Card>
          );
        })}
      </div>

      {/* Cancelar assinatura */}
      {s?.status === 'ativo' && (
        <div className="border-t border-slate-200 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-700">Cancelar assinatura</p>
              <p className="text-xs text-slate-400 mt-0.5">Seu acesso será encerrado imediatamente após o cancelamento.</p>
            </div>
            <button
              onClick={() => setCancelDialog(true)}
              className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition"
            >
              Cancelar plano
            </button>
          </div>
        </div>
      )}

      {pagDialog && (
        <PagamentoDialog
          plano={pagDialog}
          onClose={() => setPagDialog(null)}
          onSuccess={() => {
            setPagDialog(null);
            qc.invalidateQueries({ queryKey: queryKeys.planStatus });
          }}
        />
      )}

      {cancelDialog && (
        <CancelarDialog
          onClose={() => setCancelDialog(false)}
          onCanceled={() => {
            setCancelDialog(false);
            qc.invalidateQueries({ queryKey: queryKeys.planStatus });
          }}
        />
      )}
    </div>
  );
}
