import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../services/apiClient';
import { Card } from '../../ui/card';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import {
  CheckCircle2, Crown, Loader2, Copy, Check, QrCode,
  CreditCard, ExternalLink, AlertTriangle, RefreshCw,
  Shield, RotateCcw, XCircle,
} from 'lucide-react';
import { ErrorState } from '../../ui/states';

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

function inputCls(extra?: string) {
  return `w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 ${extra ?? ''}`;
}

// ─── MP SDK loader ────────────────────────────────────────────

let mpInitPromise: Promise<any> | null = null;

function loadMpSdk(): Promise<any> {
  if (mpInitPromise) return mpInitPromise;
  mpInitPromise = new Promise((resolve, reject) => {
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
      <div className="grid gap-4">
        <p className="text-sm text-slate-500 text-center">
          Pague com PIX em qualquer app bancário. Confirmação automática em até 1 minuto.
        </p>
        <Button className="justify-center" onClick={() => pixMut.mutate()}>
          <QrCode size={16} className="mr-1.5" /> Gerar QR Code PIX
        </Button>
      </div>
    );
  }

  if (pixMut.isPending) {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <Loader2 size={32} className="animate-spin text-brand-600" />
        <p className="text-sm text-slate-500">Gerando QR Code...</p>
      </div>
    );
  }

  if (pixMut.error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {pixMut.error instanceof Error ? pixMut.error.message : 'Erro ao gerar PIX.'}
        <button onClick={() => pixMut.reset()} className="ml-2 underline text-red-600">Tentar novamente</button>
      </div>
    );
  }

  const d = pixMut.data!;
  return (
    <div className="grid gap-4">
      {d.qr_code_base64 && (
        <div className="flex justify-center">
          <img src={`data:image/png;base64,${d.qr_code_base64}`} alt="QR Code PIX"
            className="h-48 w-48 rounded-xl border border-slate-200 p-2" />
        </div>
      )}
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Copia e cola</p>
        <p className="break-all text-[11px] font-mono text-slate-700 leading-relaxed">{d.qr_code.slice(0, 80)}…</p>
      </div>
      <Button variant="secondary" className="justify-center" onClick={handleCopy}>
        {copied ? <><Check size={15} className="mr-1" /> Copiado!</> : <><Copy size={15} className="mr-1" /> Copiar código</>}
      </Button>
      <p className="text-center text-xs text-slate-400">Seu plano é ativado automaticamente após o pagamento.</p>
      <button onClick={onSuccess} className="text-center text-sm text-brand-600 hover:underline">
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
        const r = await apiRequest<any>('/planos/pagar-cartao', {
          method: 'POST',
          body: JSON.stringify({ tipo, card_token: tokenResult.id, installments: form.parcelas, cpf: form.cpf }),
        });
        const data = r.success !== undefined ? r : r.data ?? r;
        if (data.success === false) throw new Error(data.message || 'Pagamento recusado.');
      } else {
        const r = await apiRequest<any>('/planos/assinar-recorrente', {
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
    <form onSubmit={handleSubmit} className="grid gap-3">
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Número do cartão
        </label>
        <input
          required maxLength={19} placeholder="0000 0000 0000 0000"
          className={inputCls()}
          value={form.number}
          onChange={(e) => set('number', maskCard(e.target.value))}
        />
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Nome no cartão
        </label>
        <input
          required placeholder="Como aparece no cartão"
          className={inputCls('uppercase')}
          value={form.name}
          onChange={(e) => set('name', e.target.value.toUpperCase())}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Validade
          </label>
          <input
            required placeholder="MM/AA" maxLength={5}
            className={inputCls()}
            value={form.expiry}
            onChange={(e) => set('expiry', maskExpiry(e.target.value))}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            CVV
          </label>
          <input
            required type="password" placeholder="•••" maxLength={4}
            className={inputCls()}
            value={form.cvv}
            onChange={(e) => set('cvv', e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          CPF do titular <span className="font-normal text-slate-400">(recomendado)</span>
        </label>
        <input
          placeholder="000.000.000-00" maxLength={14}
          className={inputCls()}
          value={form.cpf}
          onChange={(e) => set('cpf', maskCpf(e.target.value))}
        />
      </div>


      <Button type="submit" disabled={loading} className="justify-center mt-1">
        {loading
          ? <><Loader2 size={15} className="mr-1.5 animate-spin" /> Processando...</>
          : mode === 'one-time'
            ? <><CreditCard size={15} className="mr-1.5" /> Pagar agora</>
            : <><RotateCcw size={15} className="mr-1.5" /> Assinar com débito automático</>
        }
      </Button>

      <p className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1">
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
      const r = await apiRequest<any>('/planos/assinar', {
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
    <div className="grid gap-4">
      <p className="text-sm text-slate-500 text-center">
        Você será redirecionado para o checkout seguro do Mercado Pago.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(['cartao', 'debito'] as const).map((f) => (
          <button
            key={f} type="button" onClick={() => setFormaPag(f)}
            className={[
              'rounded-xl border-2 px-4 py-3 text-sm font-semibold transition',
              formaPag === f ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300',
            ].join(' ')}
          >
            <CreditCard size={16} className="mx-auto mb-1" />
            {f === 'cartao' ? 'Crédito' : 'Débito'}
          </button>
        ))}
      </div>
      <Button className="justify-center" disabled={checkoutMut.isPending} onClick={() => checkoutMut.mutate()}>
        {checkoutMut.isPending
          ? <><Loader2 size={16} className="mr-1.5 animate-spin" /> Gerando link...</>
          : <><ExternalLink size={16} className="mr-1.5" /> Ir para o checkout</>}
      </Button>
      <p className="text-center text-xs text-slate-400">Abre em nova aba. Retorna automaticamente após o pagamento.</p>
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

  const handleSuccess = () => { onClose(); onSuccess(); };

  const TABS: { id: PayTab; label: string }[] = [
    { id: 'pix', label: 'PIX' },
    { id: 'cartao', label: 'Cartão' },
    { id: 'recorrente', label: 'Recorrente' },
  ];

  return (
    <Dialog open title={`Assinar ${plano.nome}`} onClose={onClose}>
      <div className="grid gap-5">
        {/* Resumo */}
        <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <div>
            <p className="font-bold text-brand-900">{plano.nome}</p>
            <p className="text-xs text-brand-600">Cobrado mensalmente</p>
          </div>
          <p className="text-xl font-bold text-brand-700">{plano.label}</p>
        </div>

        {erro && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0.5 rounded-xl border border-slate-200 bg-slate-50 p-1">
          {TABS.map(({ id, label }) => (
            <button
              key={id} type="button"
              onClick={() => { setTab(id); setErro(''); }}
              className={[
                'flex-1 rounded-lg py-2 text-xs font-semibold transition',
                tab === id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'pix' && <PixPanel tipo={plano.tipo} onSuccess={handleSuccess} />}
        {tab === 'cartao' && (
          <div className="grid gap-4">
            <p className="text-[11px] text-slate-400 text-center">Pagamento único — seu plano é renovado manualmente.</p>
            <CardPaymentForm
              tipo={plano.tipo} mode="one-time"
              onSuccess={handleSuccess} onError={setErro}
            />
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
              <div className="relative flex justify-center text-[10px] text-slate-400 bg-white px-2 mx-auto w-fit">ou</div>
            </div>
            <CheckoutRedirectPanel tipo={plano.tipo} onError={setErro} />
          </div>
        )}
        {tab === 'recorrente' && (
          <div className="grid gap-4">
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <p className="font-semibold mb-0.5">Débito automático mensal</p>
              <p className="text-xs text-green-700">Seu cartão é cobrado automaticamente a cada período. Cancele a qualquer momento.</p>
            </div>
            <CardPaymentForm
              tipo={plano.tipo} mode="recurring"
              onSuccess={handleSuccess} onError={setErro}
            />
          </div>
        )}
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
      <div className="grid gap-5">
        {previewQ.isLoading && (
          <div className="flex justify-center py-6">
            <Loader2 size={24} className="animate-spin text-slate-400" />
          </div>
        )}

        {preview && (
          <>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                <div className="text-sm text-amber-800">
                  <p className="font-bold mb-0.5">Atenção</p>
                  <p>Ao cancelar, seu acesso será encerrado imediatamente.</p>
                  {preview.elegivel && preview.reembolso > 0 && (
                    <p className="mt-1 font-semibold text-amber-900">
                      Reembolso proporcional: R$ {preview.reembolso.toFixed(2).replace('.', ',')}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {erro && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {erro}
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-red-600"
              />
              <span className="text-sm text-slate-700">
                Entendo que minha assinatura será cancelada e o acesso encerrado imediatamente.
              </span>
            </label>

            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1 justify-center" onClick={onClose}>
                Manter assinatura
              </Button>
              <button
                disabled={!confirmado || cancelarMut.isPending}
                onClick={() => cancelarMut.mutate()}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40 transition"
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
    queryKey: ['plano-status'],
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
          onClick={() => { qc.invalidateQueries({ queryKey: ['plano-status'] }); }}
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
            qc.invalidateQueries({ queryKey: ['plano-status'] });
          }}
        />
      )}

      {cancelDialog && (
        <CancelarDialog
          onClose={() => setCancelDialog(false)}
          onCanceled={() => {
            setCancelDialog(false);
            qc.invalidateQueries({ queryKey: ['plano-status'] });
          }}
        />
      )}
    </div>
  );
}
