import { useEffect, useMemo, useState, type ElementType } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, CircleCheck, CircleX, Clock, Copy, Hourglass, Link2, Loader2, Undo2 } from 'lucide-react';
import {
  ORDER_STATUS_LABELS, fetchPublicOrder, storefrontBasePath,
  type DeliveryType, type OrderStatus, type PublicOrder,
} from '../../../services/storefrontService';
import { queryKeys } from '../../../services/queryKeys';
import { formatCountdown } from '../../../utils/storefrontCheckout';
import { formatCurrency } from '../../finance/formatters';
import { CartButton, StorefrontFooter, StorefrontMessage, StorefrontTopBar, usePublicStorefront } from './StorefrontLayout';
import { PriceSummary } from './StorefrontSummary';
import { useStorefrontCart } from './useStorefrontCart';

/** Pendente: a página pergunta ao servidor, que confere no Mercado Pago. */
const POLL_INTERVAL_MS = 5000;
const COPIED_FEEDBACK_MS = 2000;

/** Relógio da contagem regressiva do Pix; parado quando não há o que contar. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyButton({ text, label, icon: Icon, primary = false }: { text: string; label: string; icon: ElementType; primary?: boolean }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => void copyText(text).then(setCopied)}
      className={primary
        ? 'flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-600 text-sm font-semibold text-white transition hover:bg-brand-700'
        : 'flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50'}
    >
      {copied ? <><Check size={16} /> Copiado</> : <><Icon size={16} /> {label}</>}
    </button>
  );
}

const TRACKING_STEPS: Record<DeliveryType, Array<{ status: OrderStatus; label: string }>> = {
  entrega: [
    { status: 'pago', label: 'Pagamento aprovado' },
    { status: 'enviado', label: 'A caminho' },
    { status: 'entregue', label: 'Entregue' },
  ],
  retirada: [
    { status: 'pago', label: 'Pagamento aprovado' },
    { status: 'pronto_retirada', label: 'Pronto para retirada' },
    { status: 'entregue', label: 'Retirado' },
  ],
};

/** Andamento do pedido pago, como nos marketplaces: aprovado → a caminho (ou pronto) → entregue. */
function OrderTracking({ order }: { order: PublicOrder }) {
  const steps = TRACKING_STEPS[order.entregaTipo];
  const currentIndex = steps.findIndex((step) => step.status === order.situacao);
  return (
    <ol className="flex items-start">
      {steps.map((step, index) => {
        const reached = index <= currentIndex;
        return (
          <li key={step.status} className="flex flex-1 flex-col items-center gap-1.5 text-center">
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${index === 0 ? 'invisible' : reached ? 'bg-emerald-500' : 'bg-slate-200'}`} />
              <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full ${reached ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                <Check size={14} strokeWidth={3} />
              </span>
              <span className={`h-0.5 flex-1 ${index === steps.length - 1 ? 'invisible' : index < currentIndex ? 'bg-emerald-500' : 'bg-slate-200'}`} />
            </div>
            <span className={`text-xs ${reached ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function PixPayment({ order, now }: { order: PublicOrder; now: number }) {
  const pix = order.pix!;
  const remaining = pix.expiraEm ? new Date(pix.expiraEm).getTime() - now : null;
  if (remaining !== null && remaining <= 0) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <Clock size={32} className="text-amber-500" />
        <p className="text-base font-semibold text-slate-900">O prazo do Pix acabou</p>
        <p className="text-sm text-slate-500">Se você pagou agora há pouco, aguarde: a confirmação chega em instantes.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-slate-900">Pague com Pix para confirmar</h2>
        <p className="text-sm text-slate-500">No app do seu banco, escolha Pix Copia e Cola e cole o código.</p>
      </div>
      {remaining !== null && (
        <p className="rounded-full bg-amber-50 px-4 py-1.5 text-sm font-semibold text-amber-800">
          Vence em <span className="tabular-nums">{formatCountdown(remaining)}</span>
        </p>
      )}
      <div className="w-full max-w-sm">
        <CopyButton text={pix.qrCode} label="Copiar código Pix" icon={Copy} primary />
      </div>
      <p className="w-full max-w-sm break-all rounded-xl bg-slate-50 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-500">
        {pix.qrCode}
      </p>
      <div className="flex flex-col items-center gap-2">
        <p className="text-xs font-medium text-slate-500">Ou leia o QR Code com outro aparelho</p>
        <img
          src={`data:image/png;base64,${pix.qrCodeBase64}`}
          alt="QR Code do Pix"
          className="h-52 w-52 rounded-xl border border-slate-200 bg-white p-2"
        />
      </div>
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 size={14} className="animate-spin" /> Aguardando o pagamento. Esta página atualiza sozinha.
      </p>
    </div>
  );
}

const STATUS_MESSAGES: Partial<Record<OrderStatus, { icon: ElementType; tone: string; title: string; description: string }>> = {
  recusado: {
    icon: CircleX,
    tone: 'text-red-500',
    title: 'Pagamento recusado',
    description: 'Nenhum valor foi cobrado. Faça o pedido de novo com outra forma de pagamento.',
  },
  expirado: {
    icon: Clock,
    tone: 'text-amber-500',
    title: 'Pagamento expirado',
    description: 'O prazo para pagar acabou e o pedido foi cancelado. Faça o pedido de novo.',
  },
  estornado: {
    icon: Undo2,
    tone: 'text-slate-500',
    title: 'Pagamento estornado',
    description: 'O valor foi devolvido pelo Mercado Pago.',
  },
};

/** O que fazer depois da aprovação: onde retirar ou para onde vai a entrega. */
function NextSteps({ order }: { order: PublicOrder }) {
  if (order.entregaTipo === 'retirada') {
    return (
      <div className="rounded-xl bg-slate-50 px-4 py-3 text-left text-sm text-slate-600">
        <p className="font-semibold text-slate-800">Retirada na loja</p>
        {order.entregaResumo && <p>{order.entregaResumo}</p>}
        {order.retiradaHorario && <p>{order.retiradaHorario}</p>}
        <p className="mt-1 text-xs text-slate-500">Informe o número do pedido (#{order.numero}) na retirada.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3 text-left text-sm text-slate-600">
      <p className="font-semibold text-slate-800">Entrega</p>
      {order.entregaResumo && <p>{order.entregaResumo}</p>}
    </div>
  );
}

function OrderStatusPanel({ order, now, basePath }: { order: PublicOrder; now: number; basePath: string }) {
  if (order.situacao === 'aguardando_pagamento') {
    if (order.pix) {
      return <PixPayment order={order} now={now} />;
    }
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <Hourglass size={32} className="text-amber-500" />
        <p className="text-base font-semibold text-slate-900">Pagamento em análise</p>
        <p className="text-sm text-slate-500">O Mercado Pago está analisando o pagamento. Esta página atualiza sozinha.</p>
      </div>
    );
  }

  const message = STATUS_MESSAGES[order.situacao];
  if (message) {
    const Icon = message.icon;
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <Icon size={36} className={message.tone} />
        <p className="text-lg font-bold text-slate-900">{message.title}</p>
        <p className="text-sm text-slate-500">{message.description}</p>
        <Link to={basePath} className="mt-2 flex h-11 items-center rounded-full bg-brand-600 px-6 text-sm font-semibold text-white transition hover:bg-brand-700">
          Voltar para a loja
        </Link>
      </div>
    );
  }

  // Pago, enviado, pronto para retirada ou entregue.
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <CircleCheck size={40} className="text-emerald-500" />
      <div className="flex flex-col gap-1">
        <p className="text-lg font-bold text-slate-900">
          {order.situacao === 'pago' ? 'Pedido confirmado!' : ORDER_STATUS_LABELS[order.situacao]}
        </p>
        <p className="text-sm text-slate-500">O comprovante do pagamento foi enviado pelo Mercado Pago para o seu e-mail.</p>
      </div>
      <div className="w-full max-w-md">
        <OrderTracking order={order} />
      </div>
      <div className="w-full max-w-md">
        <NextSteps order={order} />
      </div>
    </div>
  );
}

/**
 * Página do pedido feito na vitrine: o endereço (com o id do pedido) é o
 * acesso. Mostra o Pix com a contagem regressiva enquanto o pagamento está
 * pendente, confere a situação a cada 5 s e, pago, os próximos passos.
 */
export function StorefrontOrderPage() {
  const { storefront: storefrontParam = '', pedidoId = '' } = useParams<{ storefront: string; pedidoId: string }>();
  const storefrontQuery = usePublicStorefront(storefrontParam);
  const store = storefrontQuery.data?.loja;
  const products = useMemo(() => storefrontQuery.data?.produtos ?? [], [storefrontQuery.data]);
  const cart = useStorefrontCart(store?.id, products);

  const orderQuery = useQuery({
    queryKey: queryKeys.publicOrder(storefrontParam, pedidoId),
    queryFn: () => fetchPublicOrder(storefrontParam, pedidoId),
    enabled: storefrontParam !== '' && pedidoId !== '',
    retry: false,
    refetchInterval: (query) => (query.state.data?.situacao === 'aguardando_pagamento' ? POLL_INTERVAL_MS : false),
    // Quem paga no app do banco volta para esta aba: confere na hora.
    refetchOnWindowFocus: true,
  });
  const order = orderQuery.data;
  const now = useNow(order?.situacao === 'aguardando_pagamento' && order.pix !== null);

  useEffect(() => {
    if (store && order) document.title = `Pedido #${order.numero} · ${store.nome}`;
  }, [store, order]);

  if (storefrontQuery.isError || storefrontParam === '') {
    return <StorefrontMessage title="Loja não encontrada" description="Confira o link com quem o enviou." />;
  }
  const basePath = store ? storefrontBasePath(store) : null;
  if (orderQuery.isError || pedidoId === '') {
    return (
      <StorefrontMessage
        title="Pedido não encontrado"
        description="Confira o link do pedido."
        action={basePath && (
          <Link to={basePath} className="flex h-11 items-center rounded-full bg-brand-600 px-6 text-sm font-semibold text-white">
            Ver a loja
          </Link>
        )}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <StorefrontTopBar
        store={store}
        basePath={basePath}
        right={basePath ? <CartButton to={`${basePath}/sacola`} count={cart.count} /> : undefined}
      />

      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-10 pt-5">
        {!order || !basePath ? (
          <div className="flex justify-center py-20 text-slate-400">
            <Loader2 size={28} className="animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h1 className="text-xl font-bold text-slate-900">Pedido #{order.numero}</h1>
              <span className="text-sm text-slate-500">
                {new Date(order.criadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <OrderStatusPanel order={order} now={now} basePath={basePath} />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-slate-900">Resumo</h2>
              <ul className="mb-4 flex flex-col gap-2">
                {order.itens.map((item, index) => (
                  <li key={`${item.nome}-${index}`} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 text-slate-700">
                      <span className="font-semibold tabular-nums">{item.quantidade}×</span> {item.nome}
                    </span>
                    <span className="flex-none tabular-nums text-slate-900">{formatCurrency(item.subtotal)}</span>
                  </li>
                ))}
              </ul>
              <PriceSummary
                itemCount={order.itens.reduce((sum, item) => sum + item.quantidade, 0)}
                subtotal={order.subtotal}
                savings={order.desconto}
                delivery={{ label: order.entregaTipo === 'retirada' ? 'Retirada na loja' : 'Entrega', fee: order.taxaEntrega }}
                total={order.total}
              />
              <p className="mt-3 text-xs text-slate-500">
                Pagamento: {order.formaPagamento === 'pix' ? 'Pix' : 'Cartão de crédito'}
              </p>
            </section>

            <div className="flex flex-col items-center gap-2 text-center">
              <p className="text-xs text-slate-500">Guarde o link desta página para acompanhar o pedido.</p>
              <CopyButton text={window.location.href} label="Copiar link do pedido" icon={Link2} />
              <Link to={basePath} className="mt-1 text-sm font-semibold text-brand-700 hover:underline">
                Continuar comprando
              </Link>
            </div>
          </>
        )}
      </main>

      <StorefrontFooter className="pb-8" />
    </div>
  );
}
