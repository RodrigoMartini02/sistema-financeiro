import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { catalogoMovimentacoesEstoque, catalogoProdutos } from '../modules/catalogo/db/schema';
import { RequestInputError } from '../utils/requestInput';
import type { StockMovementType } from './productInput';

/**
 * Executor do Drizzle em que a movimentação roda: a transação do `db` ou o
 * `drizzle(client)` da transação da receita. Entrada, saída e histórico
 * precisam cair na MESMA transação de quem os provocou — com duas conexões,
 * falhar ao gravar a receita deixaria o estoque baixado.
 */
export type StockExecutor = Pick<typeof db, 'select' | 'insert' | 'update'>;

/** Motivos gravados pelo próprio sistema no histórico do produto. */
export const STOCK_REASONS = {
  initialStock: 'Estoque inicial',
  incomeSale: 'Venda registrada em receita',
  incomeCancelled: 'Estorno — receita cancelada',
  incomeDeleted: 'Estorno — receita excluída',
  yearDeleted: 'Estorno — ano excluído',
} as const;

export type StockErrorCode = 'PRODUCT_NOT_FOUND' | 'PRODUCT_INACTIVE' | 'INVALID_QUANTITY' | 'INSUFFICIENT_STOCK';

/** Erro de quem lança: volta com a mensagem dele, como os demais erros do pedido. */
export class StockError extends RequestInputError {
  constructor(readonly code: StockErrorCode, message: string) {
    super(message, code === 'PRODUCT_NOT_FOUND' ? 404 : 400);
  }
}

/** As quantidades têm 3 casas: arredondar evita 6.999999 depois de somar. */
function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

interface StockMovementInput {
  productId: string;
  /** Dono do catálogo (o titular da conta do produto). */
  ownerId: number;
  type: StockMovementType;
  quantity: number;
  reason: string | null;
  /** Só na venda e no estorno dela; movimentação manual fica sem receita. */
  incomeId?: number | null;
}

/**
 * Aplica uma entrada ou saída e grava o histórico, sempre juntos.
 *
 * O produto fica travado (`FOR UPDATE`) até o fim da transação: duas vendas
 * simultâneas da última unidade esperam uma pela outra, e a segunda encontra o
 * saldo já baixado. Sem a trava, as duas liam o mesmo saldo e passavam.
 *
 * Saída nunca deixa o saldo negativo: vender mais do que há em mãos é erro de
 * digitação ou entrada não lançada, e os dois casos pedem correção.
 */
export async function recordStockMovement(
  executor: StockExecutor,
  input: StockMovementInput,
): Promise<{ currentBalance: number }> {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new StockError('INVALID_QUANTITY', 'Quantidade deve ser maior que zero');
  }

  const [product] = await executor
    .select({ id: catalogoProdutos.id, quantidadeEstoque: catalogoProdutos.quantidadeEstoque })
    .from(catalogoProdutos)
    .where(and(eq(catalogoProdutos.id, input.productId), eq(catalogoProdutos.usuarioId, input.ownerId)))
    .limit(1)
    .for('update');

  if (!product) {
    throw new StockError('PRODUCT_NOT_FOUND', 'Produto não encontrado');
  }

  const previousBalance = Number(product.quantidadeEstoque);
  const delta = input.type === 'entrada' ? input.quantity : -input.quantity;
  const currentBalance = roundQuantity(previousBalance + delta);

  if (currentBalance < 0) {
    throw new StockError(
      'INSUFFICIENT_STOCK',
      `Saldo insuficiente: há ${previousBalance} em estoque e a saída é de ${input.quantity}.`,
    );
  }

  await executor
    .update(catalogoProdutos)
    .set({
      quantidadeEstoque: sql`${catalogoProdutos.quantidadeEstoque} + ${delta}`,
      updatedAt: new Date(),
    })
    .where(eq(catalogoProdutos.id, product.id));

  await executor.insert(catalogoMovimentacoesEstoque).values({
    produtoId: product.id,
    usuarioId: input.ownerId,
    tipo: input.type,
    quantidade: String(input.quantity),
    motivo: input.reason,
    receitaId: input.incomeId ?? null,
  });

  return { currentBalance };
}

interface ProductSaleInput {
  productId: string;
  /** Dono do catálogo da conta da receita. */
  ownerId: number;
  /** Conta da receita: o produto precisa ser dela. */
  accountId: number | null;
  quantity: number;
  incomeId: number;
}

/**
 * Venda lançada numa receita. O produto precisa ser da conta da receita e
 * estar ativo — vender de uma PJ o produto de outra misturaria os estoques.
 * Sem controle de estoque, a venda fica só na receita (produto e quantidade)
 * e não mexe no saldo.
 */
export async function sellProductInIncome(executor: StockExecutor, input: ProductSaleInput): Promise<void> {
  const [product] = await executor
    .select({
      id: catalogoProdutos.id,
      contaId: catalogoProdutos.contaId,
      ativo: catalogoProdutos.ativo,
      controlaEstoque: catalogoProdutos.controlaEstoque,
    })
    .from(catalogoProdutos)
    .where(and(eq(catalogoProdutos.id, input.productId), eq(catalogoProdutos.usuarioId, input.ownerId)))
    .limit(1)
    .for('update');

  if (!product || product.contaId === null || product.contaId !== input.accountId) {
    throw new StockError('PRODUCT_NOT_FOUND', 'Produto não encontrado');
  }
  if (!product.ativo) {
    throw new StockError('PRODUCT_INACTIVE', 'Produto desativado: ative o produto para vendê-lo');
  }
  if (!product.controlaEstoque) {
    return;
  }

  await recordStockMovement(executor, {
    productId: product.id,
    ownerId: input.ownerId,
    type: 'saida',
    quantity: input.quantity,
    reason: STOCK_REASONS.incomeSale,
    incomeId: input.incomeId,
  });
}

/**
 * Devolve ao estoque o que a receita vendeu: a quantidade da SAÍDA gravada na
 * venda, não um número vindo do pedido. Uma vez só — o índice único da
 * migration 0064 impede uma segunda entrada para a mesma receita.
 *
 * Venda feita sem controle de estoque não gravou saída, então não há o que
 * devolver; produto apagado leva o histórico junto (cascade). Nos dois casos,
 * nada acontece. Desligar o controle depois da venda não impede o estorno: o
 * saldo continua guardado.
 */
export async function returnSoldStock(
  executor: StockExecutor,
  input: { incomeId: number; reason: string },
): Promise<void> {
  const movements = await executor
    .select({
      produtoId: catalogoMovimentacoesEstoque.produtoId,
      usuarioId: catalogoMovimentacoesEstoque.usuarioId,
      tipo: catalogoMovimentacoesEstoque.tipo,
      quantidade: catalogoMovimentacoesEstoque.quantidade,
    })
    .from(catalogoMovimentacoesEstoque)
    .where(eq(catalogoMovimentacoesEstoque.receitaId, input.incomeId));

  const sale = movements.find((movement) => movement.tipo === 'saida');
  const alreadyReturned = movements.some((movement) => movement.tipo === 'entrada');
  if (!sale || alreadyReturned) {
    return;
  }

  await recordStockMovement(executor, {
    productId: sale.produtoId,
    ownerId: sale.usuarioId,
    type: 'entrada',
    quantity: Number(sale.quantidade),
    reason: input.reason,
    incomeId: input.incomeId,
  });
}
