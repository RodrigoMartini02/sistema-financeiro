import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReceiptText } from 'lucide-react';
import {
  ORDER_STATUS_LABELS, changeStoreOrderStatus, fetchStoreOrder, fetchStoreOrders,
  type OrderStatus, type StoreOrderDetail, type StoreOrderSummary,
} from '../../services/storefrontService';
import { getActiveAccountId } from '../../services/apiClient';
import { queryKeys } from '../../services/queryKeys';
import { Dialog } from '../../ui/dialog';
import { C, dialogFooterStyle, fieldInputStyle, saveButtonDisabledStyle, saveButtonStyle, successOutlineButtonStyle } from '../../ui/dialogFormTokens';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { ConfigTabHeader } from '../../ui/ConfigTabHeader';
import { CFG, cfgBadgeStyle, cfgDividerStyle } from '../../ui/configTokens';
import { InfoBanner } from '../../ui/InfoBanner';
import { EmptyState } from '../../ui/EmptyState';
import { formatCurrency } from '../finance/formatters';
import { formatCpf, formatPhone } from '../../utils/storefrontCheckout';

const STATUS_FILTERS: OrderStatus[] = [
  'aguardando_pagamento', 'pago', 'enviado', 'pronto_retirada', 'entregue', 'recusado', 'expirado', 'estornado',
];

type BadgeTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger';

const TONE_COLORS: Record<BadgeTone, { background: string; color: string }> = {
  neutral: { background: CFG.chipBg, color: CFG.chipText },
  info: { background: CFG.primarySoft, color: CFG.primaryDark },
  success: { background: CFG.successBg, color: CFG.success },
  warn: { background: CFG.warnBg, color: CFG.warnText },
  danger: { background: CFG.dangerBg, color: CFG.danger },
};

const STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  aguardando_pagamento: 'warn',
  pago: 'success',
  enviado: 'info',
  pronto_retirada: 'info',
  entregue: 'neutral',
  recusado: 'neutral',
  expirado: 'neutral',
  estornado: 'danger',
};

function badgeStyle(tone: BadgeTone): React.CSSProperties {
  return { ...cfgBadgeStyle, ...TONE_COLORS[tone] };
}

/** Pendente com a separação vencida: o cliente não pagou a tempo (o Mercado Pago ainda vai confirmar a expiração). */
function statusLabel(order: Pick<StoreOrderSummary, 'situacao' | 'reservaVencida'>): string {
  return order.reservaVencida ? 'Pagamento não concluído' : ORDER_STATUS_LABELS[order.situacao];
}

const PAYMENT_LABELS: Record<StoreOrderSummary['formaPagamento'], string> = { pix: 'Pix', cartao: 'Cartão' };

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Próximas situações que a loja marca, na ordem do botão: a entrega (ou retirada) e depois o fim. */
function nextStatuses(order: StoreOrderDetail): Array<{ status: OrderStatus; label: string }> {
  if (order.situacao === 'pago') {
    const handover = order.entregaTipo === 'entrega'
      ? { status: 'enviado' as const, label: 'Marcar como enviado' }
      : { status: 'pronto_retirada' as const, label: 'Pronto para retirada' };
    return [handover, { status: 'entregue', label: 'Marcar como entregue' }];
  }
  if (order.situacao === 'enviado' || order.situacao === 'pronto_retirada') {
    return [{ status: 'entregue', label: 'Marcar como entregue' }];
  }
  return [];
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.textFaint, marginBottom: 6,
};

const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5, color: C.text };

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={sectionTitleStyle}>{title}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
    </div>
  );
}

function OrderDetailDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const orderQ = useQuery({
    queryKey: queryKeys.storefrontOrder(orderId),
    queryFn: () => fetchStoreOrder(orderId),
  });
  const order = orderQ.data;

  const statusMut = useMutation({
    mutationFn: (status: OrderStatus) => changeStoreOrderStatus(orderId, status),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.storefrontOrder(orderId), updated);
      void qc.invalidateQueries({ queryKey: queryKeys.storefrontOrdersAll });
    },
  });

  const actions = order ? nextStatuses(order) : [];
  const address = order?.endereco;
  const incomeCount = order
    ? order.itens.filter((item) => item.receitaId !== null).length + (order.receitaEntregaId !== null ? 1 : 0)
    : 0;

  return (
    <Dialog
      open
      title={order ? `Pedido #${order.numero}` : 'Pedido'}
      description={order ? `${statusLabel(order)} · ${formatDateTime(order.criadoEm)}` : undefined}
      onClose={onClose}
      scrollBody={false}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {orderQ.isLoading && <p style={{ fontSize: 12.5, color: CFG.muted }}>Carregando...</p>}
          {orderQ.isError && <p style={{ fontSize: 12.5, color: C.danger }}>{orderQ.error.message}</p>}
          {order && (
            <>
              <DetailSection title="Itens">
                {order.itens.map((item) => (
                  <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={rowStyle}>
                      <span style={{ minWidth: 0 }}>
                        <strong>{item.quantidade}×</strong> {item.nome}
                      </span>
                      <span style={{ flex: 'none', fontWeight: 600 }}>{formatCurrency(item.subtotal)}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 11, color: CFG.muted }}>
                      <span>
                        {formatCurrency(item.precoUnitario)} cada
                        {item.precoOriginal > item.precoUnitario && <> (de {formatCurrency(item.precoOriginal)})</>}
                      </span>
                      {item.semEstoque && (
                        <span style={badgeStyle('danger')} title="Pago sem saldo no estoque: a receita foi lançada sem a baixa">
                          sem estoque
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </DetailSection>

              <DetailSection title="Valores">
                <div style={rowStyle}><span>Produtos</span><span>{formatCurrency(order.subtotal)}</span></div>
                {order.desconto > 0 && (
                  <div style={{ ...rowStyle, color: CFG.muted }}><span>Descontos já aplicados</span><span>{formatCurrency(order.desconto)}</span></div>
                )}
                <div style={rowStyle}>
                  <span>{order.entregaTipo === 'entrega' ? 'Entrega' : 'Retirada'}</span>
                  <span>{order.taxaEntrega > 0 ? formatCurrency(order.taxaEntrega) : 'Grátis'}</span>
                </div>
                <div style={{ ...rowStyle, fontWeight: 700 }}><span>Total</span><span>{formatCurrency(order.total)}</span></div>
              </DetailSection>

              <div style={cfgDividerStyle} />

              <DetailSection title="Cliente">
                <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>{order.cliente.nome}</span>
                <span style={{ fontSize: 12, color: CFG.textSoft }}>{order.cliente.email}</span>
                <span style={{ fontSize: 12, color: CFG.textSoft }}>{formatPhone(order.cliente.telefone)} · CPF {formatCpf(order.cliente.cpf)}</span>
              </DetailSection>

              <DetailSection title={order.entregaTipo === 'entrega' ? 'Entrega' : 'Retirada na loja'}>
                {address ? (
                  <span style={{ fontSize: 12.5, color: C.text }}>
                    {address.rua}, {address.numero}{address.complemento ? ` (${address.complemento})` : ''} — {address.bairro},{' '}
                    {address.cidade}/{address.uf} · CEP {address.cep}
                  </span>
                ) : (
                  <span style={{ fontSize: 12.5, color: C.text }}>O cliente retira no endereço da loja.</span>
                )}
                {order.observacao && <span style={{ fontSize: 12, color: CFG.textSoft }}>Observação: {order.observacao}</span>}
              </DetailSection>

              <DetailSection title="Pagamento">
                <span style={{ fontSize: 12.5, color: C.text }}>
                  {PAYMENT_LABELS[order.formaPagamento]}
                  {order.pagoEm && ` · pago em ${formatDateTime(order.pagoEm)}`}
                </span>
                {order.mpPaymentId && (
                  <span style={{ fontSize: 11.5, color: CFG.muted }}>Mercado Pago: pagamento {order.mpPaymentId}</span>
                )}
                {incomeCount > 0 && (
                  <span style={{ fontSize: 11.5, color: CFG.muted }}>
                    {incomeCount} {incomeCount === 1 ? 'receita lançada' : 'receitas lançadas'} na categoria Vendas.
                  </span>
                )}
                {order.situacao === 'estornado' && (
                  <span style={{ fontSize: 11.5, color: CFG.muted }}>Estornado no Mercado Pago: as receitas foram canceladas e o estoque voltou.</span>
                )}
              </DetailSection>
            </>
          )}
          {statusMut.error && (
            <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
              {statusMut.error.message}
            </div>
          )}
        </div>

        {actions.length > 0 && (
          <div style={dialogFooterStyle}>
            <div style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {actions.map((action, index) => {
                const primary = index === 0;
                const style = statusMut.isPending ? saveButtonDisabledStyle : primary ? saveButtonStyle : successOutlineButtonStyle;
                return (
                  <button
                    key={action.status}
                    type="button"
                    disabled={statusMut.isPending}
                    onClick={() => statusMut.mutate(action.status)}
                    style={style}
                  >
                    {action.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/**
 * Pedidos da vitrine da conta PJ: lista com filtro por situação e o detalhe,
 * onde a loja marca o envio (ou a retirada) e a entrega. Pagamento, receitas
 * e estorno vêm do Mercado Pago, sem ação aqui.
 */
export function PedidosTab() {
  const accountId = getActiveAccountId();
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  const ordersQ = useQuery({
    queryKey: queryKeys.storefrontOrders(accountId, status),
    queryFn: () => fetchStoreOrders(accountId!, status),
    enabled: accountId !== null,
  });
  const orders = ordersQ.data ?? [];

  return (
    <div className="grid gap-2.5">
      <ConfigTabHeader
        countLabel={`${orders.length} pedido${orders.length === 1 ? '' : 's'}`}
        filters={(
          <select
            aria-label="Situação do pedido"
            value={status ?? ''}
            onChange={(e) => setStatus(e.target.value === '' ? null : e.target.value as OrderStatus)}
            style={{ ...fieldInputStyle, width: 'auto', height: 30, fontSize: 12 }}
          >
            <option value="">Todas as situações</option>
            {STATUS_FILTERS.map((option) => <option key={option} value={option}>{ORDER_STATUS_LABELS[option]}</option>)}
          </select>
        )}
      />

      <InfoBanner>
        Compras pagas pela vitrine. Cada pedido pago vira receitas em Vendas e baixa o estoque; estornos são feitos no Mercado Pago.
      </InfoBanner>

      {ordersQ.isLoading && (
        <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>Carregando...</p>
      )}
      {ordersQ.isError && (
        <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: C.danger }}>{ordersQ.error.message}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {orders.map((order, index) => (
          <ConfigListRow
            key={order.id}
            index={index}
            nome={`#${order.numero} · ${order.clienteNome}`}
            dataCriacao={order.criadoEm}
            onClick={() => setOpenOrderId(order.id)}
            badges={(
              <>
                <span style={cfgBadgeStyle}>{formatCurrency(order.total)}</span>
                <span style={cfgBadgeStyle}>{PAYMENT_LABELS[order.formaPagamento]}</span>
                <span style={badgeStyle(order.reservaVencida ? 'neutral' : STATUS_TONES[order.situacao])}>{statusLabel(order)}</span>
                {order.semEstoque && <span style={badgeStyle('danger')}>sem estoque</span>}
              </>
            )}
          />
        ))}
        {orders.length === 0 && !ordersQ.isLoading && !ordersQ.isError && (
          <EmptyState
            icon={ReceiptText}
            title={status ? 'Nenhum pedido nesta situação' : 'Nenhum pedido ainda'}
            description={status ? undefined : 'Os pedidos feitos e pagos pela vitrine aparecem aqui.'}
          />
        )}
      </div>

      {openOrderId && <OrderDetailDialog key={openOrderId} orderId={openOrderId} onClose={() => setOpenOrderId(null)} />}
    </div>
  );
}
