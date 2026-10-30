import type { ExpenseUpdateInput, FixedExpense, FixedExpenseCreateInput, FixedExpenseOccurrenceDto, FixedExpenseUpdateInput } from '../../types/finance';
import { addMonthsClamped, invoiceDueDate } from '../../utils/expenseSchedule';
import { generateId, todayIso, type DemoFakeDatabase, type RawExpenseDemo } from './demoFakeDatabase';

const sourcesByDatabase = new WeakMap<DemoFakeDatabase, FixedExpense[]>();

function sourcesOf(db: DemoFakeDatabase): FixedExpense[] {
  const sources = sourcesByDatabase.get(db) ?? [];
  sourcesByDatabase.set(db, sources);
  return sources;
}

function sourceOf(db: DemoFakeDatabase, id: number): FixedExpense {
  const source = sourcesOf(db).find((item) => item.id === id);
  if (!source) throw new Error('Despesa fixa não encontrada');
  return source;
}

function validateInput(db: DemoFakeDatabase, input: FixedExpenseCreateInput): void {
  if (!input.description?.trim() || !Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Informe descrição e valor positivo');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.firstMonth)) throw new Error('Mês inicial inválido');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.purchaseDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new Error('Datas inválidas');
  if (!db.categorias.some((category) => category.id === input.categoryId && category.ativo)) throw new Error('Categoria indisponível');
  if (!['pix', 'dinheiro', 'debito', 'credito'].includes(input.paymentMethod)) throw new Error('Forma de pagamento inválida');
  if (input.paymentMethod === 'credito' && input.cardId === null) throw new Error('Escolha o cartão de crédito');
  if (input.cardId !== null && input.paymentMethod !== 'credito' && input.paymentMethod !== 'debito') throw new Error('O cartão só vale para débito ou crédito');
  if (input.cardId !== null && !db.cartoes.some((card) => card.id === input.cardId && card.ativo && (!card.tipo || card.tipo === 'ambos' || card.tipo === input.paymentMethod))) {
    throw new Error('Cartão indisponível');
  }
}

function datesOf(db: DemoFakeDatabase, source: FixedExpense, competence: string) {
  const [year, month] = competence.split('-').map(Number);
  const offset = (year! - Number(source.firstMonth.slice(0, 4))) * 12 + month! - Number(source.firstMonth.slice(5, 7));
  const purchaseDate = addMonthsClamped(source.purchaseDate, offset);
  const card = db.cartoes.find((item) => item.id === source.cardId);
  const dueDate = source.paymentMethod === 'credito' && card && offset !== 0
    ? invoiceDueDate(purchaseDate, card) : addMonthsClamped(source.dueDate, offset);
  return { purchaseDate, dueDate };
}

function generateYear(db: DemoFakeDatabase, source: FixedExpense, year: number, after?: string): void {
  const firstYear = Number(source.firstMonth.slice(0, 4));
  if (year < firstYear) return;
  const first = year === firstYear ? Number(source.firstMonth.slice(5, 7)) : 1;
  for (let month = first; month <= 12; month++) {
    const competence = `${year}-${String(month).padStart(2, '0')}-01`;
    if (after && competence <= after) continue;
    if (db.despesas.some((row) => row.despesa_fixa_id === source.id && row.fixa_competencia === competence)) continue;
    const { purchaseDate, dueDate } = datesOf(db, source, competence);
    const [dueYear, dueMonth] = dueDate.split('-').map(Number);
    db.despesas.push({
      id: generateId(), descricao: source.description, categoria_id: source.categoryId,
      categoria_nome: db.categorias.find((category) => category.id === source.categoryId)?.nome ?? null,
      forma_pagamento: source.paymentMethod, cartao_id: source.cardId,
      cartao_nome: db.cartoes.find((card) => card.id === source.cardId)?.nome ?? null,
      data_compra: purchaseDate, data_vencimento: dueDate, data_pagamento: null,
      mes: dueMonth! - 1, ano: dueYear!, status: 'prevista', pago: false, parcelado: false, recorrente: false,
      numero_parcelas: null, parcela_atual: null, observacoes: null, valor_original: source.amount,
      valor_pago: null, numero_nf: null, data_emissao_nf: null, anexos: null,
      despesa_fixa_id: source.id, fixa_competencia: competence, valor_previsto: source.amount,
    });
  }
  source.registeredYear = Math.max(source.registeredYear, year);
}

function toPending(db: DemoFakeDatabase, row: RawExpenseDemo): FixedExpenseOccurrenceDto {
  const source = sourceOf(db, row.despesa_fixa_id!);
  const category = db.categorias.find((item) => item.id === row.categoria_id);
  return {
    id: row.id, userId: source.userId, accountId: source.accountId, description: row.descricao,
    amount: row.valor_original ?? 0, estimatedAmount: row.valor_previsto ?? null,
    categoryId: row.categoria_id, categoryName: category?.nome ?? null,
    parentCategoryName: db.categorias.find((item) => item.id === category?.parent_id)?.nome ?? null,
    paymentMethod: row.forma_pagamento as FixedExpense['paymentMethod'], cardId: row.cartao_id, cardName: row.cartao_nome ?? null,
    purchaseDate: row.data_compra, dueDate: row.data_vencimento, month: row.mes, year: row.ano,
    status: 'prevista', fixedExpenseId: source.id, fixedCompetence: row.fixa_competencia!,
    attachments: row.anexos, invoiceNumber: row.numero_nf, invoiceDate: row.data_emissao_nf,
  };
}

export function updateDemoExpense(db: DemoFakeDatabase, id: number, input: ExpenseUpdateInput, confirm = false): RawExpenseDemo {
  const row = db.despesas.find((item) => item.id === id);
  if (!row || row.status === 'cancelada') throw new Error('Despesa não encontrada');
  if (confirm && row.status !== 'prevista') throw new Error('Esta previsão já foi confirmada. Atualize a lista.');
  if (row.status === 'prevista' && !confirm && (input.paid || input.paymentDate !== null || input.amountPaid !== null)) {
    throw new Error('Confirme a previsão antes de registrar o pagamento');
  }
  if (row.despesa_fixa_id != null) {
    validateInput(db, { accountId: sourceOf(db, row.despesa_fixa_id).accountId, description: input.description,
      categoryId: input.categoryId, amount: input.amount, paymentMethod: input.paymentMethod, cardId: input.cardId,
      purchaseDate: input.purchaseDate, dueDate: input.dueDate, firstMonth: row.fixa_competencia!.slice(0, 7) });
  }
  if (!input.description?.trim() || !Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Informe descrição e valor positivo');
  if (input.paymentMethod === 'credito' && input.paid) throw new Error('Despesa no crédito é paga pela fatura do cartão.');
  const predicted = row.status === 'prevista' && !confirm;
  const paid = !predicted && input.paid;
  const [year, month] = input.dueDate.split('-').map(Number);
  Object.assign(row, {
    descricao: input.description, categoria_id: input.categoryId,
    categoria_nome: db.categorias.find((category) => category.id === input.categoryId)?.nome ?? null,
    forma_pagamento: input.paymentMethod, cartao_id: input.cardId,
    cartao_nome: db.cartoes.find((card) => card.id === input.cardId)?.nome ?? null,
    valor_original: input.amount, data_compra: input.purchaseDate, data_vencimento: input.dueDate,
    ano: year!, mes: month! - 1, status: confirm ? 'ativa' : row.status,
    pago: paid, data_pagamento: paid ? input.paymentDate ?? input.dueDate : null,
    valor_pago: paid ? input.amountPaid ?? input.amount : null,
    numero_nf: input.invoiceNumber, data_emissao_nf: input.invoiceDate, anexos: input.attachments,
  });
  return row;
}

export function resolveFixedExpensesDemo(
  db: DemoFakeDatabase, endpoint: string, method: string, body: string | undefined,
): { handled: boolean; data?: unknown } {
  const url = new URL(endpoint, 'https://demo.invalid');
  const input = (): FixedExpenseCreateInput => JSON.parse(body ?? '{}') as FixedExpenseCreateInput;
  if (url.pathname === '/expenses/fixed/pending' && method === 'GET') {
    const month = url.searchParams.get('month');
    const account = url.searchParams.get('accountId');
    return { handled: true, data: db.despesas.filter((row) => row.status === 'prevista'
      && row.fixa_competencia?.slice(0, 7) === month
      && (!account || sourceOf(db, row.despesa_fixa_id!).accountId === Number(account)))
      .map((row) => toPending(db, row)) };
  }
  if (url.pathname === '/expenses/fixed') {
    if (method === 'GET') {
      const account = url.searchParams.get('accountId');
      return { handled: true, data: sourcesOf(db).filter((source) => !account || source.accountId === Number(account)) };
    }
    if (method === 'POST') {
      const fields = input();
      validateInput(db, fields);
      const existing = fields.sourceExpenseId ? db.despesas.find((row) => row.id === fields.sourceExpenseId) : undefined;
      if (fields.sourceExpenseId && (!existing || existing.status !== 'ativa' || existing.despesa_fixa_id || existing.parcelado || existing.recorrente || existing.origem_pagamento_fatura_id)) {
        throw new Error('Somente uma despesa única comum pode originar uma fixa');
      }
      const { sourceExpenseId: _sourceId, ...values } = fields;
      const source: FixedExpense = { ...values, id: generateId(), userId: 0, active: true, registeredYear: Number(fields.firstMonth.slice(0, 4)) };
      sourcesOf(db).push(source);
      if (existing) {
        existing.despesa_fixa_id = source.id;
        existing.fixa_competencia = `${fields.firstMonth}-01`;
        existing.valor_previsto = existing.valor_original;
      }
      generateYear(db, source, source.registeredYear, existing?.fixa_competencia ?? undefined);
      return { handled: true, data: source };
    }
  }
  const match = url.pathname.match(/^\/expenses\/fixed\/(\d+)(?:\/(deactivate|renew))?$/);
  if (match) {
    const source = sourceOf(db, Number(match[1]));
    if (method === 'PUT' && !match[2]) {
      const values = JSON.parse(body ?? '{}') as FixedExpenseUpdateInput;
      validateInput(db, values);
      if (values.accountId !== source.accountId || values.firstMonth !== source.firstMonth) throw new Error('Conta e mês inicial não podem mudar');
      const { sourceExpenseId: _sourceId, applyToFuture, ...fields } = values;
      Object.assign(source, fields);
      if (applyToFuture) {
        for (const row of db.despesas.filter((item) => item.despesa_fixa_id === source.id && item.status === 'prevista' && item.data_vencimento >= todayIso())) {
          const dates = datesOf(db, source, row.fixa_competencia!);
          Object.assign(row, { descricao: source.description, categoria_id: source.categoryId, categoria_nome: db.categorias.find((c) => c.id === source.categoryId)?.nome ?? null,
            forma_pagamento: source.paymentMethod, cartao_id: source.cardId, cartao_nome: db.cartoes.find((c) => c.id === source.cardId)?.nome ?? null,
            valor_original: source.amount, valor_previsto: source.amount, data_compra: dates.purchaseDate, data_vencimento: dates.dueDate,
            mes: Number(dates.dueDate.slice(5, 7)) - 1, ano: Number(dates.dueDate.slice(0, 4)) });
        }
      }
      return { handled: true, data: source };
    }
    if (method === 'POST' && match[2] === 'deactivate') {
      source.active = false;
      for (const row of db.despesas) if (row.despesa_fixa_id === source.id && row.status === 'prevista' && row.data_vencimento >= todayIso()) row.status = 'cancelada';
      return { handled: true, data: source };
    }
    if (method === 'POST' && match[2] === 'renew') {
      const year = (JSON.parse(body ?? '{}') as { year: number }).year;
      if (!source.active || !Number.isInteger(year) || (year !== source.registeredYear && year !== source.registeredYear + 1)) throw new Error('Escolha o próximo ano da fixa ativa');
      generateYear(db, source, year);
      return { handled: true, data: source };
    }
  }
  const confirm = url.pathname.match(/^\/expenses\/(\d+)\/confirm$/);
  if (confirm && method === 'POST') return { handled: true, data: updateDemoExpense(db, Number(confirm[1]), JSON.parse(body ?? '{}') as ExpenseUpdateInput, true) };
  return { handled: false };
}
