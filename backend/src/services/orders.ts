// Pedidos da vitrine: criação com os itens separados, cobrança no Mercado Pago
// com o token da loja, sincronização da situação (webhook e conferência
// ativa), aprovação em receitas "Vendas" com baixa do estoque, estorno e as
// consultas da loja e do cliente.
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { incomes } from '../db/schema';
import {
  catalogoContas, catalogoPedidoItens, catalogoPedidos, catalogoProdutos,
  type CatalogoPedido,
} from '../modules/catalogo/db/schema';
import { getMonthYearFromIsoDate, getTodayIsoInTimezone } from '../utils/date';
import { RequestInputError } from '../utils/requestInput';
import { isUuid } from './catalogo';
import { ensureCompanyIncomeClassification } from './incomeClassificationCatalog';
import { SALES_INCOME_CLASSIFICATION } from './incomeClassificationDefaults';
import { cancelIncomeInTransaction } from './incomeService';
import { getStoreMercadoPago } from './mercadoPagoAccounts';
import type { OrderInput } from './orderInput';
import { mercadoPagoGateway, type OrderPaymentGateway, type PaymentSnapshot } from './orderPaymentGateway';
import {
  PAID_ORDER_STATUSES, RESERVATION_MINUTES,
  availableQuantity, calculateOrderTotals, canChangeOrderStatus, lineSubtotal, orderStatusFromPayment, paymentMatchesTotal,
  type DeliveryType, type OrderPaymentMethod, type OrderStatus,
} from './orderPricing';
import { buildProductPricing } from './productPricing';
import { StockError, sellProductInIncome, type StockExecutor } from './stock';
import type { PublicStorefront } from './storefront';
import { sendPushToUser } from './webPush';

/** Entre uma conferência ativa e outra da página do pedido. */
const ACTIVE_CHECK_INTERVAL_MS = 30_000;
const MAX_INCOME_DESCRIPTION = 255;
const STORE_ORDERS_LIMIT = 200;

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function toDecimal(value: number): string {
  return value.toFixed(2);
}

function backendUrl(): string {
  return process.env['BACKEND_URL'] ?? 'https://sistema-financeiro-backend-o199.onrender.com';
}

/** O Mercado Pago só avisa endereço público (https); em ambiente local fica sem aviso. */
function webhookUrl(orderId: string): string | null {
  const base = backendUrl();
  return base.startsWith('https://') ? `${base}/api/catalogo/public/mercado-pago/webhook?pedido=${orderId}` : null;
}

/** Itens separados por pedidos pendentes dentro da validade, por produto. */
export async function reservedQuantities(executor: StockExecutor, productIds: string[]): Promise<Map<string, number>> {
  if (productIds.length === 0) {
    return new Map();
  }
  const rows = await executor
    .select({
      produtoId: catalogoPedidoItens.produtoId,
      quantidade: sql<string>`sum(${catalogoPedidoItens.quantidade})`,
    })
    .from(catalogoPedidoItens)
    .innerJoin(catalogoPedidos, eq(catalogoPedidos.id, catalogoPedidoItens.pedidoId))
    .where(and(
      inArray(catalogoPedidoItens.produtoId, productIds),
      eq(catalogoPedidos.situacao, 'aguardando_pagamento'),
      sql`${catalogoPedidos.reservadoAte} > now()`,
    ))
    .groupBy(catalogoPedidoItens.produtoId);
  return new Map(rows.flatMap((row) => (row.produtoId ? [[row.produtoId, Number(row.quantidade)]] : [])));
}

// ── Visões ────────────────────────────────────────────────────────────────

export interface OrderItemView {
  id: string;
  produtoId: string | null;
  nome: string;
  quantidade: number;
  precoOriginal: number;
  precoUnitario: number;
  subtotal: number;
  semEstoque: boolean;
  receitaId: number | null;
}

/** O que o cliente vê na página do pedido: sem CPF, e-mail nem telefone. */
export interface PublicOrderView {
  id: string;
  numero: number;
  situacao: OrderStatus;
  formaPagamento: OrderPaymentMethod;
  entregaTipo: DeliveryType;
  /** Resumo do endereço digitado (entrega) ou o da loja (retirada). */
  entregaResumo: string | null;
  retiradaHorario: string | null;
  subtotal: number;
  desconto: number;
  taxaEntrega: number;
  total: number;
  itens: Array<Pick<OrderItemView, 'nome' | 'quantidade' | 'precoUnitario' | 'subtotal'>>;
  pix: { qrCode: string; qrCodeBase64: string; expiraEm: Date | null } | null;
  criadoEm: Date;
  pagoEm: Date | null;
}

export interface StoreOrderSummary {
  id: string;
  numero: number;
  situacao: OrderStatus;
  formaPagamento: OrderPaymentMethod;
  entregaTipo: DeliveryType;
  clienteNome: string;
  total: number;
  criadoEm: Date;
  pagoEm: Date | null;
  /** Pendente com a separação vencida: o pagamento não foi concluído a tempo. */
  reservaVencida: boolean;
  semEstoque: boolean;
}

export interface StoreOrderDetail extends StoreOrderSummary {
  cliente: { nome: string; email: string; telefone: string; cpf: string };
  endereco: {
    cep: string | null; rua: string | null; numero: string | null; complemento: string | null;
    bairro: string | null; cidade: string | null; uf: string | null;
  } | null;
  observacao: string | null;
  subtotal: number;
  desconto: number;
  taxaEntrega: number;
  mpPaymentId: string | null;
  receitaEntregaId: number | null;
  itens: OrderItemView[];
}

async function loadItems(executor: StockExecutor, orderId: string): Promise<OrderItemView[]> {
  const rows = await executor
    .select()
    .from(catalogoPedidoItens)
    .where(eq(catalogoPedidoItens.pedidoId, orderId))
    .orderBy(asc(catalogoPedidoItens.nome), asc(catalogoPedidoItens.id));
  return rows.map((row) => ({
    id: row.id,
    produtoId: row.produtoId,
    nome: row.nome,
    quantidade: row.quantidade,
    precoOriginal: Number(row.precoOriginal),
    precoUnitario: Number(row.precoUnitario),
    subtotal: Number(row.subtotal),
    semEstoque: row.semEstoque,
    receitaId: row.receitaId,
  }));
}

function addressSummary(order: CatalogoPedido): string | null {
  if (order.entregaTipo !== 'entrega' || !order.enderecoRua) {
    return null;
  }
  const complement = order.enderecoComplemento ? ` (${order.enderecoComplemento})` : '';
  return `${order.enderecoRua}, ${order.enderecoNumero}${complement} — ${order.enderecoBairro}, ${order.enderecoCidade}/${order.enderecoUf}`;
}

function toPublicView(order: CatalogoPedido, items: OrderItemView[], storefront: PublicStorefront): PublicOrderView {
  const pending = order.situacao === 'aguardando_pagamento';
  return {
    id: order.id,
    numero: order.numero,
    situacao: order.situacao,
    formaPagamento: order.formaPagamento,
    entregaTipo: order.entregaTipo,
    entregaResumo: order.entregaTipo === 'retirada' ? storefront.retirada?.endereco ?? null : addressSummary(order),
    retiradaHorario: order.entregaTipo === 'retirada' ? storefront.retirada?.horario ?? null : null,
    subtotal: Number(order.subtotal),
    desconto: Number(order.desconto),
    taxaEntrega: Number(order.taxaEntrega),
    total: Number(order.total),
    itens: items.map(({ nome, quantidade, precoUnitario, subtotal }) => ({ nome, quantidade, precoUnitario, subtotal })),
    pix: pending && order.formaPagamento === 'pix' && order.pixQrCode && order.pixQrCodeBase64
      ? { qrCode: order.pixQrCode, qrCodeBase64: order.pixQrCodeBase64, expiraEm: order.pixExpiraEm }
      : null,
    criadoEm: order.createdAt,
    pagoEm: order.pagoEm,
  };
}

function toStoreSummary(order: CatalogoPedido, semEstoque: boolean): StoreOrderSummary {
  return {
    id: order.id,
    numero: order.numero,
    situacao: order.situacao,
    formaPagamento: order.formaPagamento,
    entregaTipo: order.entregaTipo,
    clienteNome: order.clienteNome,
    total: Number(order.total),
    criadoEm: order.createdAt,
    pagoEm: order.pagoEm,
    reservaVencida: order.situacao === 'aguardando_pagamento'
      && order.reservadoAte !== null && order.reservadoAte.getTime() < Date.now(),
    semEstoque,
  };
}

// ── Criação ───────────────────────────────────────────────────────────────

/**
 * Cria o pedido e a cobrança. Numa transação: trava os produtos (na ordem do
 * id, para duas compras não se travarem uma à outra), confere ativo, conta e
 * disponível (saldo menos o separado por outros pedidos), numera pela loja e
 * grava pedido e itens com os preços do banco — o navegador manda só produto
 * e quantidade. Depois, fora da transação, a cobrança no Mercado Pago com o
 * token da loja; se ela falhar, o pedido fica recusado e libera os itens.
 */
export async function createOrder(
  storefront: PublicStorefront,
  input: OrderInput,
  gateway: OrderPaymentGateway = mercadoPagoGateway,
): Promise<PublicOrderView> {
  const deliveryOption = input.delivery.type === 'entrega' ? storefront.entrega : storefront.retirada;
  if (!deliveryOption) {
    throw new RequestInputError('Essa forma de entrega não está disponível nesta loja');
  }
  const mercadoPago = await getStoreMercadoPago(storefront.contaId);
  if (!mercadoPago) {
    throw new RequestInputError('Esta loja ainda não recebe pagamento pela vitrine', 409);
  }
  const deliveryFee = input.delivery.type === 'entrega' ? storefront.entrega?.taxa ?? 0 : 0;

  const order = await db.transaction(async (transaction) => {
    const productIds = input.items.map((item) => item.productId);
    const products = await transaction
      .select({
        id: catalogoProdutos.id,
        nome: catalogoProdutos.nome,
        valor: catalogoProdutos.valor,
        descontoTipo: catalogoProdutos.descontoTipo,
        descontoValor: catalogoProdutos.descontoValor,
        controlaEstoque: catalogoProdutos.controlaEstoque,
        quantidadeEstoque: catalogoProdutos.quantidadeEstoque,
      })
      .from(catalogoProdutos)
      .where(and(
        inArray(catalogoProdutos.id, productIds),
        eq(catalogoProdutos.contaId, storefront.contaId),
        eq(catalogoProdutos.usuarioId, storefront.ownerId),
        eq(catalogoProdutos.ativo, true),
      ))
      .orderBy(asc(catalogoProdutos.id))
      .for('update');
    if (products.length !== productIds.length) {
      throw new RequestInputError('Um produto da sacola não está mais disponível. Atualize a página.', 409);
    }

    const reserved = await reservedQuantities(transaction, productIds);
    const productsById = new Map(products.map((product) => [product.id, product]));
    const lines = input.items.map((item) => {
      const product = productsById.get(item.productId)!;
      const available = availableQuantity(Number(product.quantidadeEstoque), reserved.get(product.id) ?? 0, product.controlaEstoque);
      if (available !== null && item.quantity > available) {
        throw new RequestInputError(`Não há estoque suficiente de "${product.nome}" para essa quantidade`, 409);
      }
      return {
        product,
        quantity: item.quantity,
        originalPrice: Number(product.valor),
        unitPrice: buildProductPricing(product).valorFinal,
      };
    });
    const totals = calculateOrderTotals(lines, deliveryFee);

    const [counter] = await transaction
      .update(catalogoContas)
      .set({ ultimoNumeroPedido: sql`${catalogoContas.ultimoNumeroPedido} + 1` })
      .where(eq(catalogoContas.id, storefront.id))
      .returning({ numero: catalogoContas.ultimoNumeroPedido });

    const address = input.delivery.address;
    const [created] = await transaction
      .insert(catalogoPedidos)
      .values({
        vitrineId: storefront.id,
        contaId: storefront.contaId,
        usuarioId: storefront.ownerId,
        numero: counter!.numero,
        situacao: 'aguardando_pagamento',
        formaPagamento: input.payment.method,
        clienteNome: input.customer.name,
        clienteEmail: input.customer.email,
        clienteTelefone: input.customer.phone,
        clienteCpf: input.customer.cpf,
        entregaTipo: input.delivery.type,
        enderecoCep: address?.cep ?? null,
        enderecoRua: address?.street ?? null,
        enderecoNumero: address?.number ?? null,
        enderecoComplemento: address?.complement ?? null,
        enderecoBairro: address?.district ?? null,
        enderecoCidade: address?.city ?? null,
        enderecoUf: address?.state ?? null,
        observacao: input.note,
        subtotal: toDecimal(totals.subtotal),
        desconto: toDecimal(totals.discount),
        taxaEntrega: toDecimal(totals.deliveryFee),
        total: toDecimal(totals.total),
        reservadoAte: sql`now() + make_interval(mins => ${RESERVATION_MINUTES})`,
      })
      .returning();

    await transaction.insert(catalogoPedidoItens).values(lines.map((line) => ({
      pedidoId: created!.id,
      produtoId: line.product.id,
      nome: line.product.nome,
      precoOriginal: toDecimal(line.originalPrice),
      precoUnitario: toDecimal(line.unitPrice),
      quantidade: line.quantity,
      subtotal: toDecimal(lineSubtotal(line)),
    })));
    return created!;
  });

  const charge = {
    orderId: order.id,
    description: `Pedido #${order.numero} — ${storefront.nome}`.slice(0, 250),
    amount: Number(order.total),
    payer: { email: order.clienteEmail, firstName: order.clienteNome.split(' ')[0] ?? order.clienteNome, cpf: order.clienteCpf },
    notificationUrl: webhookUrl(order.id),
  };
  try {
    if (input.payment.method === 'pix') {
      const pix = await gateway.createPix(mercadoPago.config, { ...charge, expiresAt: order.reservadoAte! });
      await db
        .update(catalogoPedidos)
        .set({
          mpPaymentId: pix.paymentId,
          pixQrCode: pix.qrCode,
          pixQrCodeBase64: pix.qrCodeBase64,
          pixExpiraEm: pix.expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(catalogoPedidos.id, order.id));
    } else {
      const card = await gateway.createCard(mercadoPago.config, {
        ...charge,
        cardToken: input.payment.cardToken!,
        paymentMethodId: input.payment.paymentMethodId,
      });
      await db.update(catalogoPedidos).set({ mpPaymentId: card.paymentId, updatedAt: new Date() }).where(eq(catalogoPedidos.id, order.id));
      // A resposta do cartão já traz a situação: aprovado vira receita na hora.
      await applyPaymentSnapshot(order.id, {
        paymentId: card.paymentId,
        status: card.status,
        statusDetail: card.statusDetail,
        externalReference: order.id,
        amount: Number(order.total),
      });
    }
  } catch (error) {
    console.error('Create order payment error:', { orderId: order.id, error });
    await db
      .update(catalogoPedidos)
      .set({ situacao: 'recusado', updatedAt: new Date() })
      .where(and(eq(catalogoPedidos.id, order.id), eq(catalogoPedidos.situacao, 'aguardando_pagamento')));
    throw new RequestInputError('Não foi possível gerar o pagamento. Confira os dados e tente de novo.', 502);
  }

  const view = await findPublicOrder(storefront, order.id);
  return view!;
}

// ── Pagamento ─────────────────────────────────────────────────────────────

function truncateDescription(prefix: string, name: string, suffix: string): string {
  const room = MAX_INCOME_DESCRIPTION - prefix.length - suffix.length;
  const fittedName = name.length > room ? `${name.slice(0, Math.max(0, room - 1))}…` : name;
  return `${prefix}${fittedName}${suffix}`;
}

/**
 * Pedido pago: uma receita "Vendas" por item (autor = dono, na conta PJ da
 * vitrine), que baixa o estoque; sem saldo na hora, a receita sai sem a
 * baixa e o item fica "sem estoque". A taxa de entrega vira outra receita.
 * Devolve a receita da entrega.
 */
async function approveOrder(executor: StockExecutor & Pick<typeof db, 'execute'>, order: CatalogoPedido): Promise<number | null> {
  const items = await loadItems(executor, order.id);
  const classificationId = await ensureCompanyIncomeClassification(executor, order.usuarioId, SALES_INCOME_CLASSIFICATION);
  const receiptDate = getTodayIsoInTimezone();
  const { mes, ano } = getMonthYearFromIsoDate(receiptDate);

  const insertIncome = async (description: string, amount: number, productSale: { productId: string; quantity: number } | null) => {
    const [income] = await executor
      .insert(incomes)
      .values({
        userId: order.usuarioId,
        accountId: order.contaId,
        description,
        amount: toDecimal(amount),
        receiptDate,
        month: mes,
        year: ano,
        client: order.clienteNome,
        classificationId,
        productId: productSale?.productId ?? null,
        soldQuantity: productSale ? String(productSale.quantity) : null,
      })
      .returning({ id: incomes.id });
    return income!.id;
  };

  for (const item of items) {
    const description = truncateDescription(`Pedido #${order.numero} — `, item.nome, ` (${item.quantidade}x)`);
    const sale = item.produtoId ? { productId: item.produtoId, quantity: item.quantidade } : null;
    const incomeId = await insertIncome(description, item.subtotal, sale);
    let semEstoque = false;
    if (sale) {
      try {
        await sellProductInIncome(executor, {
          productId: sale.productId,
          ownerId: order.usuarioId,
          accountId: order.contaId,
          quantity: sale.quantity,
          incomeId,
        });
      } catch (error) {
        // O dinheiro já entrou: a venda fica registrada e a loja resolve o estoque.
        if (!(error instanceof StockError)) {
          throw error;
        }
        semEstoque = true;
      }
    }
    await executor.update(catalogoPedidoItens).set({ receitaId: incomeId, semEstoque }).where(eq(catalogoPedidoItens.id, item.id));
  }

  return Number(order.taxaEntrega) > 0
    ? insertIncome(`Pedido #${order.numero} — entrega`, Number(order.taxaEntrega), null)
    : null;
}

/** Estorno ou contestação: cancela as receitas do pedido (o estoque vendido volta). */
async function refundOrder(executor: StockExecutor, order: CatalogoPedido): Promise<void> {
  const items = await executor
    .select({ receitaId: catalogoPedidoItens.receitaId })
    .from(catalogoPedidoItens)
    .where(eq(catalogoPedidoItens.pedidoId, order.id));
  const incomeIds = [...items.map((item) => item.receitaId), order.receitaEntregaId]
    .filter((id): id is number => id !== null);
  for (const incomeId of incomeIds) {
    await cancelIncomeInTransaction(executor, order.usuarioId, incomeId);
  }
}

async function notifyOrderPaid(order: CatalogoPedido): Promise<void> {
  try {
    await sendPushToUser(order.usuarioId, {
      title: `Pedido #${order.numero} pago`,
      body: `${order.clienteNome} · ${brl.format(Number(order.total))}`,
    });
  } catch (error) {
    console.error('Order paid push error:', { orderId: order.id, error });
  }
}

/**
 * Aplica a situação do pagamento ao pedido, uma vez só: o pedido fica travado
 * na transação e só sai de "aguardando pagamento" uma vez. Confere a
 * referência e o valor antes de aprovar.
 */
export async function applyPaymentSnapshot(orderId: string, snapshot: PaymentSnapshot): Promise<void> {
  if (snapshot.externalReference !== orderId) {
    console.warn('Payment reference does not match order', { orderId, paymentId: snapshot.paymentId });
    return;
  }
  const target = orderStatusFromPayment(snapshot.status, snapshot.statusDetail);

  const paidOrder = await db.transaction(async (transaction) => {
    const [order] = await transaction.select().from(catalogoPedidos).where(eq(catalogoPedidos.id, orderId)).limit(1).for('update');
    if (!order) {
      return null;
    }
    const updates: Partial<typeof catalogoPedidos.$inferInsert> = {
      conferidoEm: new Date(),
      updatedAt: new Date(),
      mpPaymentId: order.mpPaymentId ?? snapshot.paymentId,
    };
    let approved = false;

    if (target === 'pago' && order.situacao === 'aguardando_pagamento') {
      if (paymentMatchesTotal(snapshot.amount, Number(order.total))) {
        updates.receitaEntregaId = await approveOrder(transaction, order);
        updates.situacao = 'pago';
        updates.pagoEm = new Date();
        approved = true;
      } else {
        console.error('Paid amount does not match order total', { orderId, paid: snapshot.amount, total: order.total });
      }
    } else if ((target === 'recusado' || target === 'expirado') && order.situacao === 'aguardando_pagamento') {
      updates.situacao = target;
    } else if (target === 'estornado' && PAID_ORDER_STATUSES.includes(order.situacao)) {
      await refundOrder(transaction, order);
      updates.situacao = 'estornado';
    }

    await transaction.update(catalogoPedidos).set(updates).where(eq(catalogoPedidos.id, order.id));
    return approved ? order : null;
  });

  if (paidOrder) {
    await notifyOrderPaid(paidOrder);
  }
}

/**
 * Busca o pagamento no Mercado Pago com o token da loja e aplica ao pedido.
 * Chamado pelo webhook (que só informa ids — o corpo dele nunca é confiado) e
 * pela conferência ativa da página do pedido.
 */
export async function syncOrderPayment(
  orderId: string,
  paymentIdHint: string | null,
  gateway: OrderPaymentGateway = mercadoPagoGateway,
): Promise<void> {
  if (!isUuid(orderId)) {
    return;
  }
  const [order] = await db
    .select({ id: catalogoPedidos.id, contaId: catalogoPedidos.contaId, mpPaymentId: catalogoPedidos.mpPaymentId })
    .from(catalogoPedidos)
    .where(eq(catalogoPedidos.id, orderId))
    .limit(1);
  const paymentId = order?.mpPaymentId ?? paymentIdHint;
  if (!order || !paymentId) {
    return;
  }
  const mercadoPago = await getStoreMercadoPago(order.contaId);
  if (!mercadoPago) {
    return;
  }
  await applyPaymentSnapshot(order.id, await gateway.getPayment(mercadoPago.config, paymentId));
}

// ── Consultas ─────────────────────────────────────────────────────────────

async function findPublicOrder(storefront: PublicStorefront, orderId: string): Promise<PublicOrderView | null> {
  const [order] = await db
    .select()
    .from(catalogoPedidos)
    .where(and(eq(catalogoPedidos.id, orderId), eq(catalogoPedidos.vitrineId, storefront.id)))
    .limit(1);
  return order ? toPublicView(order, await loadItems(db, order.id), storefront) : null;
}

/**
 * Página do pedido (cliente, sem login: o id é o que dá acesso). Pedido ainda
 * pendente é conferido ativamente no Mercado Pago a cada 30 s, para não
 * depender só do webhook.
 */
export async function getPublicOrder(
  storefront: PublicStorefront,
  orderId: string,
  gateway: OrderPaymentGateway = mercadoPagoGateway,
): Promise<PublicOrderView | null> {
  if (!isUuid(orderId)) {
    return null;
  }
  const [order] = await db
    .select({ situacao: catalogoPedidos.situacao, mpPaymentId: catalogoPedidos.mpPaymentId, conferidoEm: catalogoPedidos.conferidoEm })
    .from(catalogoPedidos)
    .where(and(eq(catalogoPedidos.id, orderId), eq(catalogoPedidos.vitrineId, storefront.id)))
    .limit(1);
  if (!order) {
    return null;
  }
  const dueForCheck = !order.conferidoEm || Date.now() - order.conferidoEm.getTime() > ACTIVE_CHECK_INTERVAL_MS;
  if (order.situacao === 'aguardando_pagamento' && order.mpPaymentId && dueForCheck) {
    try {
      await syncOrderPayment(orderId, null, gateway);
    } catch (error) {
      console.error('Order active payment check error:', { orderId, error });
    }
  }
  return findPublicOrder(storefront, orderId);
}

export async function listStoreOrders(accountId: number, status: OrderStatus | null): Promise<StoreOrderSummary[]> {
  const orders = await db
    .select()
    .from(catalogoPedidos)
    .where(and(eq(catalogoPedidos.contaId, accountId), ...(status ? [eq(catalogoPedidos.situacao, status)] : [])))
    .orderBy(desc(catalogoPedidos.createdAt))
    .limit(STORE_ORDERS_LIMIT);
  if (orders.length === 0) {
    return [];
  }
  const withoutStock = await db
    .selectDistinct({ pedidoId: catalogoPedidoItens.pedidoId })
    .from(catalogoPedidoItens)
    .where(and(inArray(catalogoPedidoItens.pedidoId, orders.map((order) => order.id)), eq(catalogoPedidoItens.semEstoque, true)));
  const flagged = new Set(withoutStock.map((row) => row.pedidoId));
  return orders.map((order) => toStoreSummary(order, flagged.has(order.id)));
}

/** Pedido da loja pelo id; a conta é conferida por quem chama (ver resolveOrderAccount). */
export async function findStoreOrder(orderId: string): Promise<CatalogoPedido | null> {
  if (!isUuid(orderId)) {
    return null;
  }
  const [order] = await db.select().from(catalogoPedidos).where(eq(catalogoPedidos.id, orderId)).limit(1);
  return order ?? null;
}

export async function getStoreOrderDetail(order: CatalogoPedido): Promise<StoreOrderDetail> {
  const items = await loadItems(db, order.id);
  return {
    ...toStoreSummary(order, items.some((item) => item.semEstoque)),
    cliente: { nome: order.clienteNome, email: order.clienteEmail, telefone: order.clienteTelefone, cpf: order.clienteCpf },
    endereco: order.entregaTipo === 'entrega'
      ? {
        cep: order.enderecoCep,
        rua: order.enderecoRua,
        numero: order.enderecoNumero,
        complemento: order.enderecoComplemento,
        bairro: order.enderecoBairro,
        cidade: order.enderecoCidade,
        uf: order.enderecoUf,
      }
      : null,
    observacao: order.observacao,
    subtotal: Number(order.subtotal),
    desconto: Number(order.desconto),
    taxaEntrega: Number(order.taxaEntrega),
    mpPaymentId: order.mpPaymentId,
    receitaEntregaId: order.receitaEntregaId,
    itens: items,
  };
}

/** A loja avança a entrega: pago → enviado ou pronto para retirada → entregue. */
export async function changeStoreOrderStatus(order: CatalogoPedido, status: OrderStatus): Promise<StoreOrderDetail> {
  const updated = await db.transaction(async (transaction) => {
    const [current] = await transaction.select().from(catalogoPedidos).where(eq(catalogoPedidos.id, order.id)).limit(1).for('update');
    if (!current || !canChangeOrderStatus(current.situacao, status, current.entregaTipo)) {
      throw new RequestInputError('Essa mudança de situação não é permitida');
    }
    const [saved] = await transaction
      .update(catalogoPedidos)
      .set({ situacao: status, updatedAt: new Date() })
      .where(eq(catalogoPedidos.id, current.id))
      .returning();
    return saved!;
  });
  return getStoreOrderDetail(updated);
}
