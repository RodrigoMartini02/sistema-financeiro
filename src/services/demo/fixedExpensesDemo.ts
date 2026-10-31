import type { ExpenseUpdateInput, FixedExpenseCreateInput, FixedExpenseOccurrenceDto, PaymentMethod } from '../../types/finance';
import { addMonthsClamped, invoiceDueDate } from '../../utils/expenseSchedule';
import { brDateToIso, isoToBrDate } from '../../utils/date';
import { generateId, todayIso, type DemoFakeDatabase, type RawExpenseDemo } from './demoFakeDatabase';

interface DemoFixedSource {
  id: number;
  userId: number;
  accountId: number;
  description: string;
  categoryId: number;
  amount: number;
  paymentMethod: PaymentMethod;
  cardId: number | null;
  purchaseDate: string;
  dueDate: string;
  firstMonth: string;
  endMonth: string;
  active: boolean;
}

const sourcesByDatabase = new WeakMap<DemoFakeDatabase, DemoFixedSource[]>();

function sourcesOf(db: DemoFakeDatabase): DemoFixedSource[] {
  const sources = sourcesByDatabase.get(db) ?? [];
  sourcesByDatabase.set(db, sources);
  return sources;
}

function sourceOf(db: DemoFakeDatabase, id: number): DemoFixedSource {
  const source = sourcesOf(db).find((item) => item.id === id);
  if (!source) throw new Error('Despesa fixa não encontrada');
  return source;
}

function validateMonth(month: string, firstMonth: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < firstMonth || month < '2000-01' || month > '2100-12') {
    throw new Error('Informe o mês final da repetição, igual ou posterior ao primeiro vencimento');
  }
}

function validateFields(db: DemoFakeDatabase, input: Pick<FixedExpenseCreateInput,
  'description' | 'amount' | 'categoryId' | 'paymentMethod' | 'cardId' | 'purchaseDate' | 'dueDate'>, current?: RawExpenseDemo): void {
  if (!input.description?.trim() || !Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Informe descrição e valor positivo');
  if (![input.purchaseDate, input.dueDate].every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && brDateToIso(isoToBrDate(date)) === date)) throw new Error('Datas inválidas');
  const historical = current?.status === 'ativa';
  if (!db.categorias.some((category) => category.id === input.categoryId
    && (category.ativo || (historical && current.categoria_id === input.categoryId)))) throw new Error('Categoria indisponível');
  if (!['pix', 'dinheiro', 'debito', 'credito'].includes(input.paymentMethod)) throw new Error('Forma de pagamento inválida');
  if (input.paymentMethod === 'credito' && input.cardId === null) throw new Error('Escolha o cartão de crédito');
  if (input.cardId !== null && input.paymentMethod !== 'credito' && input.paymentMethod !== 'debito') throw new Error('O cartão só vale para débito ou crédito');
  if (input.cardId !== null && !db.cartoes.some((card) => card.id === input.cardId
    && ((historical && current.cartao_id === input.cardId && current.forma_pagamento === input.paymentMethod)
      || (card.ativo && (!card.tipo || card.tipo === 'ambos' || card.tipo === input.paymentMethod))))) {
    throw new Error('Cartão indisponível');
  }
}

function generateRows(db: DemoFakeDatabase, source: DemoFixedSource): RawExpenseDemo[] {
  const rows: RawExpenseDemo[] = [];
  const [year, month] = source.firstMonth.split('-').map(Number);
  const months = (Number(source.endMonth.slice(0, 4)) - year!) * 12 + Number(source.endMonth.slice(5, 7)) - month!;
  const card = db.cartoes.find((item) => item.id === source.cardId);
  const firstInvoice = card ? invoiceDueDate(source.purchaseDate, card) : source.dueDate;
  const invoiceOffset = (Number(source.dueDate.slice(0, 4)) - Number(firstInvoice.slice(0, 4))) * 12
    + Number(source.dueDate.slice(5, 7)) - Number(firstInvoice.slice(5, 7));
  for (let offset = 0; offset <= months; offset++) {
    const competence = addMonthsClamped(`${source.firstMonth}-01`, offset);
    if (db.despesas.some((row) => row.despesa_fixa_id === source.id && row.fixa_competencia === competence)) continue;
    const purchaseDate = addMonthsClamped(source.purchaseDate, offset);
    const dueDate = source.paymentMethod === 'credito' && card && offset !== 0
      ? addMonthsClamped(invoiceDueDate(purchaseDate, card), invoiceOffset) : addMonthsClamped(source.dueDate, offset);
    if (dueDate.slice(0, 7) > source.endMonth) break;
    const [dueYear, dueMonth] = dueDate.split('-').map(Number);
    rows.push({
      id: generateId(), descricao: source.description, categoria_id: source.categoryId,
      categoria_nome: db.categorias.find((category) => category.id === source.categoryId)?.nome ?? null,
      forma_pagamento: source.paymentMethod, cartao_id: source.cardId,
      cartao_nome: db.cartoes.find((item) => item.id === source.cardId)?.nome ?? null,
      data_compra: purchaseDate, data_vencimento: dueDate, data_pagamento: null,
      mes: dueMonth! - 1, ano: dueYear!, status: 'prevista', pago: false, parcelado: false, recorrente: false,
      numero_parcelas: null, parcela_atual: null, observacoes: null, valor_original: source.amount,
      valor_pago: null, numero_nf: null, data_emissao_nf: null, anexos: null,
      despesa_fixa_id: source.id, fixa_competencia: competence, valor_previsto: source.amount,
      fixa_mes_final: source.endMonth, adiada: false,
    });
  }
  return rows;
}

function toPending(db: DemoFakeDatabase, row: RawExpenseDemo): FixedExpenseOccurrenceDto {
  const source = sourceOf(db, row.despesa_fixa_id!);
  const category = db.categorias.find((item) => item.id === row.categoria_id);
  return {
    id: row.id, userId: source.userId, accountId: source.accountId, description: row.descricao,
    amount: row.valor_original ?? 0, estimatedAmount: row.valor_previsto ?? null,
    categoryId: row.categoria_id, categoryName: category?.nome ?? null,
    parentCategoryName: db.categorias.find((item) => item.id === category?.parent_id)?.nome ?? null,
    paymentMethod: row.forma_pagamento as PaymentMethod, cardId: row.cartao_id, cardName: row.cartao_nome ?? null,
    purchaseDate: row.data_compra, dueDate: row.data_vencimento, month: row.mes, year: row.ano,
    status: 'prevista', fixedExpenseId: source.id, fixedCompetence: row.fixa_competencia!,
    endMonth: source.endMonth, deferred: row.adiada === true,
    attachments: row.anexos, invoiceNumber: row.numero_nf, invoiceDate: row.data_emissao_nf,
  };
}

export function updateDemoExpense(db: DemoFakeDatabase, id: number, input: ExpenseUpdateInput, confirm = false): RawExpenseDemo {
  const row = db.despesas.find((item) => item.id === id);
  if (!row || row.status === 'cancelada') throw new Error('Despesa não encontrada');
  if (confirm && row.status !== 'prevista') throw new Error('Esta previsão já foi confirmada. Atualize a lista.');
  if (confirm && row.adiada) throw new Error('Desmarque Adiar antes de lançar esta previsão');
  if (row.status === 'prevista' && !confirm && (input.paid || input.paymentDate != null || input.amountPaid != null)) {
    throw new Error('Confirme a previsão antes de registrar o pagamento');
  }
  if (!input.description?.trim() || !Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Informe descrição e valor positivo');
  const source = row.despesa_fixa_id == null ? null : sourceOf(db, row.despesa_fixa_id);
  if (source) validateFields(db, input, row);
  const activeCredit = source !== null && row.status === 'ativa' && row.forma_pagamento === 'credito' && row.cartao_id !== null;
  if (activeCredit) {
    const changedPayment = input.paid !== row.pago || input.paymentDate !== row.data_pagamento
      || (input.amountPaid ?? null) !== (row.valor_pago ?? null);
    const changedInvoice = row.pagamento_fatura_id != null && (input.amount !== row.valor_original
      || input.dueDate !== row.data_vencimento || input.paymentMethod !== row.forma_pagamento || input.cardId !== row.cartao_id);
    if (changedPayment || changedInvoice) throw new Error('Despesa no crédito é paga pela fatura do cartão.');
  } else if (input.paymentMethod === 'credito' && input.paid) throw new Error('Despesa no crédito é paga pela fatura do cartão.');
  if (input.endMonth != null) {
    if (!source) throw new Error('Esta despesa não pertence a uma fixa');
    validateMonth(input.endMonth, source.firstMonth);
  }
  const endMonthChanged = source !== null && input.endMonth != null && input.endMonth !== source.endMonth;
  if (source && input.endMonth != null && input.endMonth > source.endMonth) validateFields(db, source);
  const nextSource = source && endMonthChanged ? { ...source, endMonth: input.endMonth! } : null;
  const generated = nextSource ? generateRows(db, nextSource).filter((item) => item.data_vencimento >= todayIso()) : [];
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
    ...(confirm ? { adiada: false } : {}),
    pago: paid, data_pagamento: paid ? input.paymentDate ?? input.dueDate : null,
    valor_pago: paid ? input.amountPaid ?? input.amount : null,
    numero_nf: input.invoiceNumber, data_emissao_nf: input.invoiceDate, anexos: input.attachments,
  });
  if (source && nextSource) {
    source.endMonth = nextSource.endMonth;
    db.despesas.push(...generated);
    for (const item of db.despesas.filter((entry) => entry.despesa_fixa_id === source.id)) {
      item.fixa_mes_final = source.endMonth;
      if (item.status === 'prevista' && item.data_vencimento >= todayIso() && item.data_vencimento.slice(0, 7) > source.endMonth) item.status = 'cancelada';
    }
  }
  return row;
}

export function resolveFixedExpensesDemo(
  db: DemoFakeDatabase, endpoint: string, method: string, body: string | undefined,
): { handled: boolean; data?: unknown } {
  const url = new URL(endpoint, 'https://demo.invalid');
  if (url.pathname === '/expenses/fixed/pending' && method === 'GET') {
    const month = url.searchParams.get('month') ?? '';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mês inválido');
    const account = url.searchParams.get('accountId');
    return { handled: true, data: db.despesas.filter((row) => row.status === 'prevista' && row.despesa_fixa_id != null
      && row.data_vencimento.slice(0, 7) === month && (row.data_compra ?? row.data_vencimento) <= todayIso()
      && (!account || sourceOf(db, row.despesa_fixa_id).accountId === Number(account)))
      .map((row) => toPending(db, row)) };
  }
  if (url.pathname === '/expenses/fixed/defer' && method === 'PATCH') {
    const fields = JSON.parse(body ?? '{}') as { accountId: number; ids: number[]; deferred: boolean };
    if (!Array.isArray(fields.ids) || !fields.ids.length || fields.ids.some((id) => !Number.isInteger(id)) || typeof fields.deferred !== 'boolean') throw new Error('Adiamento inválido');
    const ids = [...new Set(fields.ids)];
    const rows = ids.map((id) => db.despesas.find((row) => row.id === id && row.status === 'prevista' && row.despesa_fixa_id != null
      && sourceOf(db, row.despesa_fixa_id).accountId === fields.accountId));
    if (rows.some((row) => !row)) throw new Error('Previsão não encontrada ou já lançada');
    for (const row of rows) row!.adiada = fields.deferred;
    return { handled: true, data: { updated: rows.length } };
  }
  if (url.pathname === '/expenses/fixed' && method === 'POST') {
    const fields = JSON.parse(body ?? '{}') as FixedExpenseCreateInput;
    validateFields(db, fields);
    validateMonth(fields.endMonth, fields.dueDate.slice(0, 7));
    if (fields.paymentMethod === 'credito' && fields.paid) throw new Error('Despesa no crédito é paga pela fatura do cartão.');
    const existing = fields.sourceExpenseId ? db.despesas.find((row) => row.id === fields.sourceExpenseId) : undefined;
    if (fields.sourceExpenseId && (!existing || existing.status !== 'ativa' || existing.despesa_fixa_id || existing.parcelado || existing.recorrente || existing.origem_pagamento_fatura_id)) {
      throw new Error('Somente uma despesa única comum pode originar uma fixa');
    }
    const source: DemoFixedSource = {
      id: generateId(), userId: 0, accountId: fields.accountId ?? 1, description: fields.description,
      categoryId: fields.categoryId!, amount: fields.amount, paymentMethod: fields.paymentMethod, cardId: fields.cardId,
      purchaseDate: fields.purchaseDate, dueDate: fields.dueDate,
      firstMonth: fields.dueDate.slice(0, 7), endMonth: fields.endMonth, active: true,
    };
    const rows = generateRows(db, source);
    if (existing) {
      updateDemoExpense(db, existing.id, { ...fields, endMonth: undefined });
      existing.despesa_fixa_id = source.id;
      existing.fixa_competencia = `${source.firstMonth}-01`;
      existing.valor_previsto = existing.valor_original;
      existing.fixa_mes_final = source.endMonth;
    }
    const first = rows.find((row) => row.fixa_competencia === `${source.firstMonth}-01`)!;
    if (!existing) Object.assign(first, {
      status: 'ativa', pago: fields.paid === true,
      data_pagamento: fields.paid ? fields.paymentDate ?? fields.dueDate : null,
      valor_pago: fields.paid ? fields.amountPaid ?? fields.amount : null,
      anexos: fields.attachments ?? null, numero_nf: fields.invoiceNumber ?? null, data_emissao_nf: fields.invoiceDate ?? null,
    });
    sourcesOf(db).push(source);
    db.despesas.push(...rows.filter((row) => !existing || row !== first));
    return { handled: true, data: source };
  }
  const confirm = url.pathname.match(/^\/expenses\/(\d+)\/confirm$/);
  if (confirm && method === 'POST') return { handled: true, data: updateDemoExpense(db, Number(confirm[1]), JSON.parse(body ?? '{}') as ExpenseUpdateInput, true) };
  return { handled: false };
}
