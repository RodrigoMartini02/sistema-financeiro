import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../services/apiClient';
import { fetchPlanStatus } from '../../services/planosService';
import { queryKeys } from '../../services/queryKeys';
import { activePlanLabel, PLAN_TIER, planTierOf, type PlanTier } from '../../utils/planFeatures';
import { Card } from '../../ui/card';
import { Dialog } from '../../ui/dialog';
import { C, cardStyle, dangerButtonStyle } from '../../ui/dialogFormTokens';
import {
  CheckCircle2, Crown, Loader2, CreditCard, AlertTriangle, RefreshCw, XCircle,
} from 'lucide-react';
import { ErrorState } from '../../ui/states';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { PaymentDialog } from '../../components/payments/PaymentDialog';
import { loadPlatformMercadoPago, type PaymentEndpoints } from '../../components/payments/paymentRequests';

// ─── planos config ────────────────────────────────────────────

// Starter e Premium, só mensais (.plans/planos-starter-premium.md, regras 3 e 4).
const PLANO_DEF: Record<PlanTier, {
  nome: string; destaque: boolean; label: string; periodo: string; recursos: string[];
}> = {
  [PLAN_TIER.starter]: {
    nome: 'Starter',
    destaque: false,
    label: 'R$ 4,99/mês',
    periodo: 'Cobrado mensalmente',
    recursos: [
      'Uma conta (pessoal ou empresa)',
      'Receitas, despesas e lançamento em lote',
      'Cartões, painel, planejamento e relatórios',
      'Agenda e avisos de vencimento',
      'Assistente Juca',
    ],
  },
  [PLAN_TIER.premium]: {
    nome: 'Premium',
    destaque: true,
    label: 'R$ 9,99/mês',
    periodo: 'Cobrado mensalmente',
    recursos: [
      'Tudo do Starter',
      'Várias contas (pessoal e empresas)',
      'Membros e colaboradores, com setores e cargos',
      'Clientes e contratos',
      'Produtos, estoque, vitrine e pedidos',
      'Suporte prioritário',
    ],
  },
};

const PLAN_PAYMENT_ENDPOINTS: PaymentEndpoints = {
  pix: '/planos/pix',
  card: '/planos/pay-card',
  checkout: '/planos/subscribe',
  recurring: '/planos/subscribe-recurring',
};

/** Guia de primeiro acesso das formas de pagamento (só no FINGERENCE, que tem o provedor do guia). */
function PaymentTabsGuide() {
  const tabsGuide = useFirstAccessGuide('planos:formas-pagamento-v1');
  if (!tabsGuide.isVisible) {
    return null;
  }

  return (
    <FirstAccessGuideCard
      floating
      placement="bottom"
      className="w-[min(24rem,calc(100vw-2rem))]"
      icon={CreditCard}
      description={firstAccessGuideMessages.planosFormasPagamento}
      onDismiss={tabsGuide.dismiss}
      onSilenceAll={tabsGuide.silenceAll}
    />
  );
}

// ─── cancel dialog ────────────────────────────────────────────

// Só mensal: o acesso termina na hora e não há reembolso.
function CancelarDialog({ onClose, onCanceled }: { onClose: () => void; onCanceled: () => void }) {
  const [confirmado, setConfirmado] = useState(false);
  const [erro, setErro] = useState('');

  const cancelarMut = useMutation({
    mutationFn: () => apiRequest<{ success: boolean }>('/planos/cancel', { method: 'POST' }),
    onSuccess: () => { onCanceled(); },
    onError: (err) => setErro(err instanceof Error ? err.message : 'Erro ao cancelar.'),
  });

  return (
    <Dialog open title="Cancelar assinatura" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'flex-start', gap: 8, background: C.warnBg, border: `1px solid ${C.warnBorder}` }}>
          <AlertTriangle size={16} style={{ marginTop: 2, flexShrink: 0, color: C.warn }} />
          <div style={{ fontSize: 13, color: C.warn }}>
            <p style={{ margin: '0 0 2px', fontWeight: 700 }}>Atenção</p>
            <p style={{ margin: 0 }}>Ao cancelar, seu acesso será encerrado imediatamente.</p>
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
              background: C.danger, color: '#fff',
              cursor: (!confirmado || cancelarMut.isPending) ? 'not-allowed' : 'pointer',
              opacity: (!confirmado || cancelarMut.isPending) ? 0.4 : 1,
            }}
          >
            {cancelarMut.isPending
              ? <><Loader2 size={14} className="animate-spin" /> Cancelando...</>
              : <><XCircle size={14} /> Cancelar assinatura</>}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

// ─── main screen ──────────────────────────────────────────────

export function PlanosScreen({ embedded = false }: { embedded?: boolean }) {
  const qc = useQueryClient();
  const [pagPlan, setPagPlan] = useState<PlanTier | null>(null);
  const [cancelDialog, setCancelDialog] = useState(false);

  const statusQ = useQuery({
    queryKey: queryKeys.planStatus,
    queryFn: fetchPlanStatus,
  });

  // preload SDK silently
  useEffect(() => { loadPlatformMercadoPago(); }, []);

  const s = statusQ.data;

  // Plano atual: só o pago e ativo (plano vencido pode ser assinado de novo).
  const isAtual = (key: PlanTier) =>
    s?.status === 'ativo' && !!s.plano_tipo && s.plano_tipo !== 'admin' && planTierOf(s) === key;

  return (
    <div className={embedded ? 'grid gap-2.5' : 'mx-auto grid max-w-4xl gap-6'}>
      <div className={embedded ? 'flex justify-end' : 'flex items-end justify-between'}>
        {!embedded && (
          <div>
            <p className="text-sm font-semibold text-brand-700">Assinatura</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">Planos e cobrança</h2>
          </div>
        )}
        <button
          onClick={() => { qc.invalidateQueries({ queryKey: queryKeys.planStatus }); }}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition"
        >
          <RefreshCw size={13} /> Atualizar status
        </button>
      </div>

      {/* Status atual */}
      {s && (
        <Card className="p-3">
          <div className="flex items-center gap-2.5">
            <div className={[
              'flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full',
              s.status === 'ativo' ? 'bg-amber-100' : s.status === 'trial' ? 'bg-blue-100' : 'bg-slate-100',
            ].join(' ')}>
              <Crown size={15} className={
                s.status === 'ativo' ? 'text-amber-500' : s.status === 'trial' ? 'text-blue-500' : 'text-slate-400'
              } />
            </div>
            <div className="flex-1">
              <p className="text-[12.5px] font-semibold text-[#0f172a]">
                {s.status === 'ativo'    ? `Plano ${activePlanLabel(s)} ativo` :
                 s.status === 'trial'   ? 'Período de teste gratuito' : 'Plano expirado'}
              </p>
              <p className="mt-0.5 text-[11.5px] font-medium text-[#64748b]">
                {s.status === 'trial' && s.dias_restantes_trial !== null && `${s.dias_restantes_trial} dia(s) restante(s) no trial`}
                {s.status === 'ativo' && s.plano_expiracao && `Válido até ${new Date(s.plano_expiracao).toLocaleDateString('pt-BR')}`}
                {s.status === 'ativo' && !s.plano_expiracao && 'Assinatura ativa (renovação automática)'}
                {s.status === 'expirado' && 'Sua assinatura expirou. Renove para continuar usando.'}
              </p>
            </div>
            <span className={[
              'rounded-full px-2.5 py-1 text-[10.5px] font-semibold leading-none',
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
      <div className={embedded ? 'grid gap-2.5 md:grid-cols-2' : 'grid gap-4 md:grid-cols-2'}>
        {(Object.entries(PLANO_DEF) as [PlanTier, typeof PLANO_DEF[PlanTier]][]).map(([key, def]) => {
          const atual = isAtual(key);
          return (
            <Card key={key} className={['p-3.5 flex flex-col gap-2.5', def.destaque ? 'ring-1 ring-brand-600' : ''].join(' ')}>
              {def.destaque && (
                <span className="self-start rounded-full bg-brand-600 px-2.5 py-1 text-[10px] font-semibold leading-none text-white">
                  Mais popular
                </span>
              )}
              <div>
                <p className="text-[13px] font-semibold text-[#0f172a]">{def.nome}</p>
                <p className="mt-1.5 text-[21px] font-bold leading-none text-brand-700">{def.label}</p>
                <p className="mt-1 text-[11.5px] font-medium text-[#64748b]">{def.periodo}</p>
              </div>
              <ul className="flex-1 space-y-1.5">
                {def.recursos.map((r) => (
                  <li key={r} className="flex items-start gap-1.5 text-[12px] font-medium text-[#334155]">
                    <CheckCircle2 size={13} className="mt-px shrink-0 text-emerald-600" />
                    {r}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => { if (!atual) setPagPlan(key); }}
                className={[
                  'mt-auto h-8 w-full rounded-full text-[12.5px] font-semibold transition',
                  atual
                    ? 'cursor-default bg-slate-100 text-slate-400'
                    : def.destaque
                      ? 'bg-brand-600 text-white hover:bg-brand-700'
                      : 'border border-[#d8e0e8] text-[#0f172a] hover:bg-slate-50',
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
        <div className="border-t border-[#eef2f6] pt-2.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold text-[#0f172a]">Cancelar assinatura</p>
              <p className="mt-0.5 text-[11.5px] font-medium text-[#64748b]">Seu acesso será encerrado imediatamente após o cancelamento.</p>
            </div>
            <button
              type="button"
              onClick={() => setCancelDialog(true)}
              style={dangerButtonStyle}
            >
              Cancelar plano
            </button>
          </div>
        </div>
      )}

      {pagPlan && (
        <PaymentDialog
          summary={{ name: PLANO_DEF[pagPlan].nome, priceLabel: PLANO_DEF[pagPlan].label }}
          endpoints={PLAN_PAYMENT_ENDPOINTS}
          requestBody={{ tipo: pagPlan }}
          tabsHint={<PaymentTabsGuide />}
          onClose={() => setPagPlan(null)}
          onSuccess={() => {
            setPagPlan(null);
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
