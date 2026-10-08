import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { authenticate } from '../middleware/auth';
import { getTodayIsoInTimezone } from '../utils/date';
import { buildOwnerAndAccountWhere } from '../utils/ownerAndAccountWhere';
import { resolveVisibleUserIds, resolveOwnerForWrite, resolveVisibleCardOwnerIds } from '../utils/familyVisibility';
import { canWriteToAccount, ACCOUNT_ACCESS_DENIED } from '../utils/accountAccess';
import { RequestInputError, readQueryId, sendRequestError } from '../utils/requestInput';
import {
  readCreateExpenseInput,
  readDuplicateQuery,
  readSuggestionsQuery,
  readUpdateExpenseInput,
  type PaymentMethod,
} from '../services/expenseInput';
import { isExpenseCategoryAllowed } from '../services/expenseCategoryCatalog';
import {
  createExpense,
  findExpenseForUpdate,
  findRecentDuplicate,
  getExpenseSuggestions,
  updateExpense,
} from '../services/expenseService';
import { BudgetInputError, resolveFinancialAccount, type FinancialAccount } from '../services/budgetService';
import { despesasEmAberto } from '../services/assistantQueries';
import { MAX_PAYMENT_CANDIDATES, lastDayOfMonth, nextOpenPerGroup, toOpenExpense } from '../services/assistantPayment';
import { INVOICE_EXPENSE_METHOD, INVOICE_MESSAGES, invoiceEditRefusal } from '../services/cardInvoiceRules';
import { hasInvoiceProtectedRows, isCreditWithCardExpense } from '../services/cardInvoiceService';

const router = Router();

function buildWhereClause(
  userId: number,
  userType: string,
  queryUserId: string | undefined,
  mes: string | undefined,
  ano: string | undefined,
  accountId: string | undefined,
  tableAlias: string = 'd',
  visibleUserIds?: number[],
  cardOwnerColumn?: string,
): Promise<{ where: string; params: unknown[] }> {
  return buildOwnerAndAccountWhere(userId, userType, queryUserId, mes, ano, accountId, tableAlias, visibleUserIds, cardOwnerColumn);
}

const CATEGORY_NOT_AVAILABLE = 'Categoria indisponível para esta conta';
const CARD_NOT_AVAILABLE = 'Cartão indisponível para este lançamento: escolha um cartão seu ou compartilhado com você';

/**
 * Aceita o cartao apenas se ele pertencer ao solicitante ou a alguem cujos
 * cartoes ele pode usar na carteira compartilhada.
 *
 * Esta e a defesa na escrita: o frontend exibir um cartao nao pode ser
 * suficiente para lanca-lo. Sem conta_id, o conjunto volta com o proprio
 * usuario e o comportamento e identico ao anterior.
 */
async function validateCardId(cardId: unknown, userId: number, accountId: number | null): Promise<number | null> {
  if (!cardId) return null;
  // Lancar uma despesa pode usar um cartao de outro membro da familia (se a
  // permissao existir) mesmo que a listagem esteja restrita a "so eu" — usar
  // um cartao compartilhado e uma acao de escrita distinta de listar dados.
  const donosPermitidos = await resolveVisibleCardOwnerIds(userId, accountId, true);
  const result = await pool.query(
    'SELECT id FROM cartoes WHERE id = $1 AND usuario_id = ANY($2)',
    [cardId, donosPermitidos],
  );
  return result.rows.length > 0 ? Number(cardId) : null;
}

// Confirma que o cartao (quando informado) e compativel com a forma de
// pagamento da despesa. Cartoes sem tipo definido (ainda nao classificados)
// sao sempre aceitos, para nao bloquear cartoes cadastrados antes deste
// campo existir. Retorna null quando valido, ou uma mensagem de erro.
async function validateCardTypeCompatibility(
  cardId: number | null,
  formaPagamento: unknown,
  userId: number,
): Promise<string | null> {
  if (!cardId) return null;
  const result = await pool.query('SELECT tipo FROM cartoes WHERE id = $1 AND usuario_id = $2', [cardId, userId]);
  const tipo = (result.rows[0] as { tipo: string | null } | undefined)?.tipo;
  if (!tipo || tipo === 'ambos') return null;
  if (tipo !== formaPagamento) {
    return 'O cartão escolhido não aceita esta forma de pagamento';
  }
  return null;
}

/**
 * Cartão aceito para gravar: liberado para quem lança e compatível com a forma.
 * Na edição, manter o cartão que a despesa já tinha não é usar um cartão novo —
 * vale mesmo que hoje ele não esteja liberado para quem edita.
 */
async function resolveCardForWrite(
  requestedCardId: number | null,
  paymentMethod: PaymentMethod,
  userId: number,
  accountId: number | null,
  currentCardId: number | null = null,
): Promise<number | null> {
  if (requestedCardId === null) return null;
  const allowedCardId = await validateCardId(requestedCardId, userId, accountId);
  const cardId = allowedCardId ?? (currentCardId === requestedCardId ? requestedCardId : null);
  if (cardId === null) {
    throw new RequestInputError(CARD_NOT_AVAILABLE);
  }
  const compatibilityError = await validateCardTypeCompatibility(cardId, paymentMethod, userId);
  if (compatibilityError) {
    throw new RequestInputError(compatibilityError);
  }
  return cardId;
}

// GET /api/expenses
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { mes, ano, usuario_id, conta_id, escopo } = req.query as Record<string, string | undefined>;
    // Carteira compartilhada: por padrao a lista traz so o proprio
    // solicitante. Só amplia para os demais membros da conta quando o
    // cliente pede explicitamente (escopo=familia) E o solicitante tem a
    // permissao correspondente.
    const visiveis = await resolveVisibleUserIds(req.user!.id, conta_id ? parseInt(conta_id) : null, escopo === 'familia');
    // Com o dono do cartão: quem paga a fatura vê também o que outros lançaram no cartão dele.
    const { where, params } = await buildWhereClause(req.user!.id, req.user!.type, usuario_id, mes, ano, conta_id, 'd', visiveis, 'ct.usuario_id');

    const result = await pool.query(
      // COALESCE com a conta padrao do autor: dono pode ter corrigido o nome
      // na conta sem isso refletir no cadastro de login (usuarios.nome).
      `SELECT d.*, c.nome AS categoria_nome, p.nome AS categoria_pai_nome,
              ct.nome AS cartao_nome, ct.tipo AS cartao_tipo, ct.usuario_id AS cartao_dono_id,
              COALESCE(conta_autor.nome, TRIM(CONCAT(u.nome, ' ', u.sobrenome))) AS autor_nome,
              COALESCE(conta_dono_cartao.nome, TRIM(CONCAT(dono_cartao.nome, ' ', dono_cartao.sobrenome))) AS cartao_dono_nome,
              pf.forma AS pagamento_fatura_forma, pf.numero_parcelas AS pagamento_fatura_parcelas,
              pf.mes AS pagamento_fatura_mes, pf.ano AS pagamento_fatura_ano
       FROM despesas d
       LEFT JOIN categorias c ON d.categoria_id = c.id
       LEFT JOIN categorias p ON c.parent_id = p.id
       LEFT JOIN cartoes ct ON d.cartao_id = ct.id
       LEFT JOIN usuarios u ON u.id = d.usuario_id
       LEFT JOIN contas conta_autor ON conta_autor.usuario_id = u.id AND conta_autor.eh_padrao = true
       LEFT JOIN usuarios dono_cartao ON dono_cartao.id = ct.usuario_id
       LEFT JOIN contas conta_dono_cartao ON conta_dono_cartao.usuario_id = dono_cartao.id AND conta_dono_cartao.eh_padrao = true
       -- Pagamento da fatura que pagou ou renegociou a compra: a lista mostra "Renegociada" com a nota.
       LEFT JOIN pagamentos_fatura pf ON pf.id = d.pagamento_fatura_id
       ${where}
       ORDER BY d.data_vencimento ASC`,
      params,
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List expenses error:', error);
    res.status(500).json({ success: false, message: 'Failed to list expenses' });
  }
});

// GET /api/expenses/categories (dropdown helper)
router.get('/categories', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { conta_id } = req.query as Record<string, string | undefined>;

    let whereClause = 'WHERE usuario_id = $1';
    const params: unknown[] = [req.user!.id];

    if (conta_id) {
      const accountResult = await pool.query('SELECT tipo FROM contas WHERE id = $1 AND usuario_id = $2', [parseInt(conta_id), req.user!.id]);
      if (accountResult.rows.length > 0) {
        // Uniao: categorias PADRAO do tipo da conta ativa OU categorias
        // CUSTOM exclusivas deste conta_id especifico.
        //
        // O terceiro caso resgata categorias ORFAS (tipo e conta_id nulos,
        // anteriores a este modelo). Mesmo criterio de GET /categorias — os
        // dois filtros precisam concordar.
        const accountType = (accountResult.rows[0] as { tipo: string }).tipo;
        params.push(accountType, parseInt(conta_id));
        const orfaClause = accountType === 'pessoal'
          ? ' OR (tipo IS NULL AND conta_id IS NULL)'
          : '';
        whereClause += ` AND (tipo = $${params.length - 1} OR conta_id = $${params.length}${orfaClause})`;
      }
    }

    const result = await pool.query(
      `SELECT * FROM categorias ${whereClause} ORDER BY nome ASC`,
      params,
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, message: 'Failed to get categories' });
  }
});

// GET /api/expenses/suggestions?description=&account_id=&category_id=
router.get('/suggestions', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const query = readSuggestionsQuery(req.query as Record<string, unknown>);
    res.json({ success: true, data: await getExpenseSuggestions(req.user!.id, query) });
  } catch (error) {
    sendRequestError(res, error, 'Expense suggestions error:', req.user?.id, 'Não foi possível buscar as sugestões');
  }
});

// GET /api/expenses/duplicate?description=&amount=&payment_method=&installment_count=&account_id=&exclude_id=
router.get('/duplicate', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const query = readDuplicateQuery(req.query as Record<string, unknown>);
    res.json({ success: true, data: { duplicate: await findRecentDuplicate(req.user!.id, query) } });
  } catch (error) {
    sendRequestError(res, error, 'Expense duplicate check error:', req.user?.id, 'Não foi possível conferir se a despesa já foi lançada');
  }
});

/** Quantas despesas a lista do chip "Pagar despesa" traz: o padrão cabe na conversa. */
function readOpenExpensesLimit(value: unknown): number {
  if (value === undefined || value === '') return MAX_PAYMENT_CANDIDATES;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new RequestInputError('Limite inválido');
  }
  return limit;
}

async function resolveAccountForQuery(userId: number, accountId: number | null): Promise<FinancialAccount> {
  try {
    return await resolveFinancialAccount(userId, accountId);
  } catch (error) {
    if (error instanceof BudgetInputError) throw new RequestInputError(error.message, 404);
    throw error;
  }
}

// GET /api/expenses/em-aberto?conta_id=&limite= — despesas a pagar pelo chip "Pagar despesa" do
// assistente: vencidas e as do mês corrente, só a próxima de cada parcelamento ou recorrência.
router.get('/em-aberto', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query as Record<string, unknown>;
    const accountId = readQueryId(query['conta_id'], 'Conta inválida');
    const limit = readOpenExpensesLimit(query['limite']);
    const account = await resolveAccountForQuery(req.user!.id, accountId);
    const today = getTodayIsoInTimezone();
    const rows = await despesasEmAberto({ userId: req.user!.id, account }, lastDayOfMonth(today));
    res.json({ success: true, data: nextOpenPerGroup(rows).slice(0, limit).map((row) => toOpenExpense(row, today)) });
  } catch (error) {
    sendRequestError(res, error, 'Open expenses error:', req.user?.id, 'Não foi possível buscar as despesas em aberto');
  }
});

// POST /api/expenses — despesa única, mensal (12 ocorrências) ou parcelada (uma linha por parcela)
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const input = readCreateExpenseInput(req.body);
    if (!(await canWriteToAccount(input.accountId, req.user!.id))) {
      throw new RequestInputError(ACCOUNT_ACCESS_DENIED);
    }
    if (!(await isExpenseCategoryAllowed(req.user!.id, input.accountId, input.categoryId))) {
      throw new RequestInputError(CATEGORY_NOT_AVAILABLE);
    }
    const cardId = await resolveCardForWrite(input.cardId, input.paymentMethod, req.user!.id, input.accountId);
    const created = await createExpense(req.user!.id, { ...input, cardId }, getTodayIsoInTimezone());
    res.status(201).json({ success: true, message: 'Expense created', data: created });
  } catch (error) {
    sendRequestError(res, error, 'Create expense error:', req.user?.id, 'Não foi possível registrar a despesa. Tente novamente.');
  }
});

// PUT /api/expenses/:id — edita uma linha; parcela, recorrência e conta não mudam
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const expenseId = Number(req.params['id']);
    // Carteira compartilhada: alterar lancamento de outro membro exige a
    // permissao correspondente. Sem ela, o dono resolvido volta null e a
    // resposta e a mesma de registro inexistente — nao revela que existe.
    const ownerId = Number.isInteger(expenseId)
      ? await resolveOwnerForWrite('despesas', expenseId, req.user!.id)
      : null;
    const current = ownerId === null ? null : await findExpenseForUpdate(ownerId, expenseId);
    if (ownerId === null || current === null) {
      throw new RequestInputError('Despesa não encontrada', 404);
    }

    const input = readUpdateExpenseInput(req.body);
    // Compra paga pela fatura e linha gerada por ela têm campos travados; no
    // crédito com cartão, o pagamento só muda pela fatura.
    const lockRefusal = invoiceEditRefusal(current.invoiceEditLock, current.lockableFields, {
      amount: input.amount,
      dueDate: input.dueDate,
      paymentMethod: input.paymentMethod,
      cardId: input.cardId,
      paid: input.paid,
      paymentDate: input.paymentDate,
      amountPaid: input.amountPaid,
    });
    if (lockRefusal) {
      throw new RequestInputError(lockRefusal);
    }
    // A categoria que a despesa já tem continua aceita: lançamentos antigos podem
    // apontar para categorias de antes do catálogo da conta.
    if (input.categoryId !== current.categoryId
      && !(await isExpenseCategoryAllowed(req.user!.id, current.accountId, input.categoryId))) {
      throw new RequestInputError(CATEGORY_NOT_AVAILABLE);
    }
    const cardId = await resolveCardForWrite(input.cardId, input.paymentMethod, req.user!.id, current.accountId, current.cardId);
    // Numa série, a edição alcança as outras linhas: no mensal, as próximas em
    // aberto; no parcelado, o alcance escolhido no modal (applyTo).
    const result = await updateExpense(ownerId, expenseId, { ...input, cardId }, current, getTodayIsoInTimezone());
    if (!result) {
      throw new RequestInputError('Despesa não encontrada', 404);
    }
    res.json({ success: true, message: 'Expense updated', data: result.updated, seriesUpdated: result.seriesUpdated });
  } catch (error) {
    sendRequestError(res, error, 'Update expense error:', req.user?.id, 'Não foi possível salvar a despesa. Tente novamente.');
  }
});

// GET /api/expenses/group/:grupoId — todas as parcelas de um parcelamento,
// para a grade de exclusao com multi-selecao. Mesmo criterio de agrupamento
// usado no DELETE com delete_group=true: a propria 1a parcela tem
// grupo_parcelamento_id apontando pra si mesma (ver expenseService.createExpense).
router.get('/group/:grupoId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const grupoId = parseInt(req.params['grupoId']!);

    const donoGrupo = await resolveOwnerForWrite('despesas', grupoId, req.user!.id);
    if (donoGrupo === null) {
      res.status(404).json({ success: false, message: 'Expense group not found' });
      return;
    }

    const result = await pool.query(
      `SELECT * FROM despesas
       WHERE (id = $1 OR grupo_parcelamento_id = $1) AND usuario_id = $2
       ORDER BY parcela_atual ASC NULLS LAST, data_vencimento ASC`,
      [grupoId, donoGrupo],
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List expense group error:', error);
    res.status(500).json({ success: false, message: 'Failed to list expense group' });
  }
});

// PUT /api/expenses/:id/cancelar
//
// Dois modos, convivendo pela mesma rota (mesmo espirito do DELETE):
//   (nenhum parametro)   cancela so a parcela :id
//   ?ids=1,2,3           cancela exatamente essas parcelas do mesmo grupo —
//                        usado pela grade de selecao multipla; :id continua
//                        sendo a parcela ancora (resolve dono/grupo)
//
// A regra "nunca cancelar parcela ja paga ao usar o atalho selecionar tudo"
// e responsabilidade do CLIENTE: quando o usuario aciona "selecionar todas",
// o frontend so inclui parcelas pendentes na lista de ids. Uma parcela paga
// selecionada manualmente e individualmente continua podendo ser cancelada —
// e uma escolha explicita do usuario sobre aquele item especifico, nao uma
// automacao. O servidor so garante grupo/propriedade, igual ao DELETE.
router.put('/:id/cancelar', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const expenseId = parseInt(req.params['id']!);
    const { ids } = req.query as { ids?: string };

    const donoCancel = await resolveOwnerForWrite('despesas', expenseId, req.user!.id);
    if (donoCancel === null) {
      res.status(404).json({ success: false, message: 'Expense not found' });
      return;
    }

    if (ids !== undefined) {
      const selectedIds = ids.split(',').map((v) => parseInt(v.trim())).filter((v) => Number.isInteger(v));
      if (selectedIds.length === 0) {
        res.status(400).json({ success: false, message: 'No valid ids provided' });
        return;
      }

      // Mesma checagem de grupo usada no DELETE em lote: nunca confiar que o
      // client mandou so ids do mesmo grupo/dono.
      const groupCheck = await pool.query(
        `SELECT COUNT(*) AS total FROM despesas
         WHERE id = ANY($1) AND usuario_id = $2
           AND (id = $3 OR grupo_parcelamento_id = $3 OR grupo_parcelamento_id = (
             SELECT grupo_parcelamento_id FROM despesas WHERE id = $3
           ))`,
        [selectedIds, donoCancel, expenseId],
      );
      const validCount = parseInt((groupCheck.rows[0] as { total: string }).total);
      if (validCount !== selectedIds.length) {
        res.status(400).json({ success: false, message: 'All ids must belong to the same expense group' });
        return;
      }

      // Compra paga pela fatura e linha gerada por ela só mudam desfazendo o pagamento da fatura.
      if (await hasInvoiceProtectedRows(donoCancel, { ids: selectedIds })) {
        res.status(400).json({ success: false, message: INVOICE_MESSAGES.lockedRow });
        return;
      }

      await pool.query(
        `UPDATE despesas SET status = 'cancelada' WHERE id = ANY($1) AND usuario_id = $2`,
        [selectedIds, donoCancel],
      );
    } else {
      if (await hasInvoiceProtectedRows(donoCancel, { ids: [expenseId] })) {
        res.status(400).json({ success: false, message: INVOICE_MESSAGES.lockedRow });
        return;
      }
      const result = await pool.query(
        "UPDATE despesas SET status = 'cancelada' WHERE id = $1 AND usuario_id = $2 RETURNING id",
        [expenseId, donoCancel],
      );
      if (result.rows.length === 0) {
        res.status(404).json({ success: false, message: 'Expense not found' });
        return;
      }
    }

    res.json({ success: true, message: 'Expense cancelled' });
  } catch (error) {
    console.error('Cancel expense error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel expense' });
  }
});

// DELETE /api/expenses/:id
//
// Tres modos, todos convivendo pela mesma rota:
//   (nenhum parametro)     exclui so a parcela :id
//   ?delete_group=true     exclui id + todo o grupo (comportamento antigo)
//   ?ids=1,2,3             exclui exatamente essas parcelas do mesmo grupo —
//                          usado pela grade de selecao multipla; :id continua
//                          sendo a parcela ancora (usada so pra resolver o dono
//                          e o grupo, nao precisa estar necessariamente na lista)
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const expenseId = parseInt(req.params['id']!);
    const { delete_group, ids } = req.query as { delete_group?: string; ids?: string };

    const donoDelete = await resolveOwnerForWrite('despesas', expenseId, req.user!.id);
    if (donoDelete === null) {
      res.status(404).json({ success: false, message: 'Expense not found' });
      return;
    }

    if (ids !== undefined) {
      const selectedIds = ids.split(',').map((v) => parseInt(v.trim())).filter((v) => Number.isInteger(v));
      if (selectedIds.length === 0) {
        res.status(400).json({ success: false, message: 'No valid ids provided' });
        return;
      }

      // Nunca confiar que o client mandou so ids do mesmo grupo: confere no
      // servidor que cada um pertence ao dono resolvido E ao mesmo grupo da
      // parcela ancora (id = grupo_parcelamento_id OU grupo_parcelamento_id
      // igual ao da ancora) — impede excluir parcelas de outro parcelamento
      // numa mesma chamada.
      const groupCheck = await pool.query(
        `SELECT COUNT(*) AS total FROM despesas
         WHERE id = ANY($1) AND usuario_id = $2
           AND (id = $3 OR grupo_parcelamento_id = $3 OR grupo_parcelamento_id = (
             SELECT grupo_parcelamento_id FROM despesas WHERE id = $3
           ))`,
        [selectedIds, donoDelete, expenseId],
      );
      const validCount = parseInt((groupCheck.rows[0] as { total: string }).total);
      if (validCount !== selectedIds.length) {
        res.status(400).json({ success: false, message: 'All ids must belong to the same expense group' });
        return;
      }

      // Compra paga pela fatura e linha gerada por ela só mudam desfazendo o pagamento da fatura.
      if (await hasInvoiceProtectedRows(donoDelete, { ids: selectedIds })) {
        res.status(400).json({ success: false, message: INVOICE_MESSAGES.lockedRow });
        return;
      }

      await pool.query(
        `DELETE FROM despesas WHERE id = ANY($1) AND usuario_id = $2`,
        [selectedIds, donoDelete],
      );
    } else if (delete_group === 'true') {
      if (await hasInvoiceProtectedRows(donoDelete, { groupAnchorId: expenseId })) {
        res.status(400).json({ success: false, message: INVOICE_MESSAGES.lockedRow });
        return;
      }
      await pool.query(
        `DELETE FROM despesas WHERE (id = $1 OR grupo_parcelamento_id = $1) AND usuario_id = $2`,
        [expenseId, donoDelete],
      );
    } else {
      if (await hasInvoiceProtectedRows(donoDelete, { ids: [expenseId] })) {
        res.status(400).json({ success: false, message: INVOICE_MESSAGES.lockedRow });
        return;
      }
      const result = await pool.query(
        'DELETE FROM despesas WHERE id = $1 AND usuario_id = $2 RETURNING id',
        [expenseId, donoDelete],
      );
      if (result.rows.length === 0) {
        res.status(404).json({ success: false, message: 'Expense not found' });
        return;
      }
    }

    res.json({ success: true, message: 'Expense deleted' });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete expense' });
  }
});

// POST /api/expenses/:id/pay
router.post('/:id/pay', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const expenseId = parseInt(req.params['id']!);
    const { data_pagamento, valor_pago } = req.body as Record<string, unknown>;

    const paymentDate = data_pagamento ?? getTodayIsoInTimezone();

    // Despesa no credito com cartao e paga pela fatura, nunca sozinha (lote,
    // assistente). A condicao se repete no proprio UPDATE, contra corrida.
    if (Number.isInteger(expenseId) && await isCreditWithCardExpense(req.user!.id, expenseId)) {
      res.status(400).json({ success: false, message: INVOICE_MESSAGES.creditPayment });
      return;
    }

    // Sem valor informado, grava o proprio valor da compra. Deixar nulo obrigava
    // toda leitura a presumir o valor por COALESCE, e escondia juros e desconto
    // de quem quitou sem digitar nada.
    const result = await pool.query(
      `UPDATE despesas
       SET pago = true, data_pagamento = $1, valor_pago = COALESCE($2, valor_original)
       WHERE id = $3 AND usuario_id = $4
         AND NOT (COALESCE(forma_pagamento, '') = $5 AND cartao_id IS NOT NULL)
       RETURNING *`,
      [paymentDate, valor_pago ?? null, expenseId, req.user!.id, INVOICE_EXPENSE_METHOD],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Expense not found' });
      return;
    }

    const expense = result.rows[0] as Record<string, unknown>;

    res.json({ success: true, message: 'Payment processed', data: expense });
  } catch (error) {
    console.error('Pay expense error:', error);
    res.status(500).json({ success: false, message: 'Failed to process payment' });
  }
});

// POST /api/despesas/:id/mover — move vencimento para o mesmo dia do proximo mes
router.post('/:id/mover', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const expenseId = parseInt(req.params['id']!);

    const existing = await pool.query(
      `SELECT data_vencimento, pago FROM despesas WHERE id = $1 AND usuario_id = $2`,
      [expenseId, req.user!.id],
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Expense not found' });
      return;
    }

    const despesa = existing.rows[0] as { data_vencimento: string; pago: boolean };

    if (despesa.pago) {
      res.status(400).json({ success: false, message: 'Cannot move a paid expense' });
      return;
    }

    const [year, month, day] = despesa.data_vencimento.split('-').map(Number) as [number, number, number];

    let nextMonth = month + 1;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }

    // Ajusta o dia se o mes seguinte nao tiver esse dia (ex: 31/jan -> ultimo dia de fev)
    const lastDayOfNextMonth = new Date(nextYear, nextMonth, 0).getDate();
    const nextDay = Math.min(day, lastDayOfNextMonth);

    const newDueDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;

    const result = await pool.query(
      `UPDATE despesas SET data_vencimento = $1, mes = $2, ano = $3 WHERE id = $4 AND usuario_id = $5 RETURNING *`,
      [newDueDate, nextMonth - 1, nextYear, expenseId, req.user!.id],
    );

    res.json({ success: true, message: 'Expense moved to next month', data: result.rows[0] });
  } catch (error) {
    console.error('Move expense error:', error);
    res.status(500).json({ success: false, message: 'Failed to move expense' });
  }
});

export default router;
