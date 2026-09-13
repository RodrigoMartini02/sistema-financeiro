import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { catalogoProdutos, catalogoMovimentacoesEstoque } from '../modules/catalogo/db/schema';

export type TipoMovimentacaoEstoque = 'entrada' | 'saida';

export class EstoqueError extends Error {
  code: 'PRODUTO_NAO_ENCONTRADO' | 'QUANTIDADE_INVALIDA' | 'SALDO_INSUFICIENTE';

  constructor(code: EstoqueError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export function isValidQuantidadeEstoque(quantidade: unknown): boolean {
  const numero = Number(quantidade);
  return Number.isFinite(numero) && numero > 0;
}

interface RegistrarMovimentacaoInput {
  produtoId: string;
  usuarioId: number;
  tipo: TipoMovimentacaoEstoque;
  quantidade: number;
  motivo?: string | null;
  receitaId?: number | null;
  /** Transacao em andamento; sem ela a operacao abre a propria. */
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0];
}

/**
 * Aplica uma entrada ou saida e grava o historico, sempre juntos.
 *
 * Saida nunca deixa o saldo negativo: o estoque so registra o que existe de
 * fato, entao vender mais do que ha em maos e erro de digitacao ou entrada
 * nao lancada — os dois casos pedem correcao, nao um saldo impossivel.
 *
 * O saldo e atualizado com expressao SQL (`quantidade_estoque + $x`) em vez
 * de ler-somar-gravar: duas baixas simultaneas do mesmo produto no fluxo
 * ler-somar-gravar perderiam uma delas.
 */
export async function registrarMovimentacaoEstoque(input: RegistrarMovimentacaoInput): Promise<{ saldoAtual: number }> {
  if (!isValidQuantidadeEstoque(input.quantidade)) {
    throw new EstoqueError('QUANTIDADE_INVALIDA', 'Quantidade deve ser maior que zero');
  }

  const executar = async (tx: NonNullable<RegistrarMovimentacaoInput['tx']>) => {
    const [produto] = await tx
      .select({ id: catalogoProdutos.id, quantidadeEstoque: catalogoProdutos.quantidadeEstoque })
      .from(catalogoProdutos)
      .where(and(eq(catalogoProdutos.id, input.produtoId), eq(catalogoProdutos.usuarioId, input.usuarioId)))
      .limit(1);

    if (!produto) {
      throw new EstoqueError('PRODUTO_NAO_ENCONTRADO', 'Produto não encontrado');
    }

    const saldoAnterior = Number(produto.quantidadeEstoque);
    const delta = input.tipo === 'entrada' ? input.quantidade : -input.quantidade;
    const saldoAtual = saldoAnterior + delta;

    if (saldoAtual < 0) {
      throw new EstoqueError(
        'SALDO_INSUFICIENTE',
        `Saldo insuficiente: há ${saldoAnterior} em estoque e a saída é de ${input.quantidade}.`,
      );
    }

    await tx
      .update(catalogoProdutos)
      .set({
        quantidadeEstoque: sql`${catalogoProdutos.quantidadeEstoque} + ${delta}`,
        updatedAt: new Date(),
      })
      .where(eq(catalogoProdutos.id, produto.id));

    await tx.insert(catalogoMovimentacoesEstoque).values({
      produtoId: produto.id,
      usuarioId: input.usuarioId,
      tipo: input.tipo,
      quantidade: String(input.quantidade),
      motivo: input.motivo ?? null,
      receitaId: input.receitaId ?? null,
    });

    return { saldoAtual };
  };

  if (input.tx) return executar(input.tx);
  return db.transaction(executar);
}

/** Conexao pg em transacao aberta pelo chamador (padrao das rotas de receita). */
interface PgTransactionClient {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Mesma baixa da funcao acima, porem dentro de uma transacao `pg` ja aberta
 * pelo chamador — as rotas de receita usam `pool.connect()` + BEGIN/COMMIT,
 * e a baixa precisa entrar nessa MESMA transacao: com duas conexoes
 * separadas, falhar ao gravar a receita deixaria o estoque baixado.
 */
export async function registrarMovimentacaoEstoqueNaTransacao(
  client: PgTransactionClient,
  input: {
    produtoId: string;
    usuarioId: number;
    tipo: TipoMovimentacaoEstoque;
    quantidade: number;
    motivo?: string | null;
    receitaId?: number | null;
  },
): Promise<void> {
  if (!isValidQuantidadeEstoque(input.quantidade)) {
    throw new EstoqueError('QUANTIDADE_INVALIDA', 'Quantidade deve ser maior que zero');
  }

  const produtoResult = await client.query(
    `SELECT id, quantidade_estoque FROM catalogo.produtos WHERE id = $1 AND usuario_id = $2`,
    [input.produtoId, input.usuarioId],
  );
  const produto = produtoResult.rows[0] as { id: string; quantidade_estoque: string } | undefined;

  if (!produto) {
    throw new EstoqueError('PRODUTO_NAO_ENCONTRADO', 'Produto não encontrado');
  }

  const saldoAnterior = Number(produto.quantidade_estoque);
  const delta = input.tipo === 'entrada' ? input.quantidade : -input.quantidade;

  if (saldoAnterior + delta < 0) {
    throw new EstoqueError(
      'SALDO_INSUFICIENTE',
      `Saldo insuficiente: há ${saldoAnterior} em estoque e a saída é de ${input.quantidade}.`,
    );
  }

  await client.query(
    `UPDATE catalogo.produtos SET quantidade_estoque = quantidade_estoque + $1, updated_at = NOW() WHERE id = $2`,
    [delta, produto.id],
  );

  await client.query(
    `INSERT INTO catalogo.movimentacoes_estoque (produto_id, usuario_id, tipo, quantidade, motivo, receita_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [produto.id, input.usuarioId, input.tipo, input.quantidade, input.motivo ?? null, input.receitaId ?? null],
  );
}
