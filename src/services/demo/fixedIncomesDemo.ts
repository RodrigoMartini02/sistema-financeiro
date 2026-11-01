import type { ClassificacaoReceita } from '../../types/config';
import type { IncomeCreateInput, IncomeOccurrenceDto, IncomeUpdateInput } from '../../types/finance';
import { brDateToIso, isoToBrDate } from '../../utils/date';
import { addMonthsClamped } from '../../utils/expenseSchedule';
import { generateId, getOrCreateList, todayIso, type DemoFakeDatabase, type RawIncomeDemo } from './demoFakeDatabase';

interface DemoIncomeSource {
  id: number;
  accountId: number;
  description: string;
  categoryId: number;
  grossAmount: number;
  netAmount: number;
  receiptDate: string;
  endMonth: string;
  clientId: number | null;
  representativeId: number | null;
}

const sourcesByDatabase = new WeakMap<DemoFakeDatabase, DemoIncomeSource[]>();
const categoriesByDatabase = new WeakMap<DemoFakeDatabase, ClassificacaoReceita[]>();

interface DemoIncomeRequest extends Partial<IncomeCreateInput> {
  ids?: number[];
  deferred?: boolean;
  changes?: IncomeUpdateInput;
  data_recebimento?: string;
  valor_recebido?: number;
  nome?: string;
  parent_id?: number | null;
  subcategories?: string[];
}

function sourcesOf(db: DemoFakeDatabase): DemoIncomeSource[] {
  return getOrCreateList(sourcesByDatabase, db);
}

export function demoIncomeCategories(db: DemoFakeDatabase): ClassificacaoReceita[] {
  let categories = categoriesByDatabase.get(db);
  if (!categories) {
    categories = [
      { id: 1, nome: 'Trabalho', parent_id: null, tipo: 'pessoal', conta_id: null, ativo: true, selectable: false, data_criacao: '2020-01-01' },
      { id: 2, nome: 'Salário', parent_id: 1, tipo: 'pessoal', conta_id: null, ativo: true, selectable: true, data_criacao: '2020-01-01' },
      { id: 3, nome: 'Outras receitas', parent_id: null, tipo: 'pessoal', conta_id: null, ativo: true, selectable: true, data_criacao: '2020-01-01' },
    ];
    categoriesByDatabase.set(db, categories);
  }
  return categories;
}

function requireFields(input: IncomeUpdateInput): void {
  if (!input.description?.trim() || !Number.isFinite(input.grossAmount) || input.grossAmount <= 0
    || !Number.isFinite(input.netAmount) || input.netAmount <= 0 || input.netAmount > input.grossAmount) {
    throw new Error('Informe descrição e valores válidos para a receita');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.receiptDate) || brDateToIso(isoToBrDate(input.receiptDate)) !== input.receiptDate) {
    throw new Error('Data do recebimento inválida');
  }
}

function requireEndMonth(value: string | null | undefined, firstMonth: string): string {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || value < firstMonth || value < '2000-01' || value > '2100-12') {
    throw new Error('Escolha o mês final da receita fixa');
  }
  const count = (Number(value.slice(0, 4)) - Number(firstMonth.slice(0, 4))) * 12
    + Number(value.slice(5, 7)) - Number(firstMonth.slice(5, 7));
  if (count > 36) throw new Error('A repetição permite até 36 meses após o primeiro');
  return value;
}

function rowFor(source: DemoIncomeSource, offset: number, received: boolean, attachments: IncomeCreateInput['attachments']): RawIncomeDemo {
  const date = addMonthsClamped(source.receiptDate, offset);
  return {
    id: generateId(), descricao: source.description, valor_bruto: source.grossAmount, valor_liquido: source.netAmount,
    data_recebimento: date, mes: Number(date.slice(5, 7)) - 1, ano: Number(date.slice(0, 4)),
    status: received ? 'ativa' : 'prevista', contrato_id: null, observacoes: null,
    cliente_id: source.clientId, cliente_nome: null, classificacao_id: source.categoryId, classificacao_nome: null,
    representante_id: source.representativeId, representante_nome: null, valor_comissao: null,
    usuario_id: 0, conta_id: source.accountId, anexos: attachments,
    classificacao_fixa_id: source.id || null,
    fixa_competencia: source.id ? `${date.slice(0, 7)}-01` : null,
    fixa_mes_final: source.id ? `${source.endMonth}-01` : null,
    adiada: false, data_criacao: new Date().toISOString(),
  };
}

function sourceRows(source: DemoIncomeSource): RawIncomeDemo[] {
  const count = (Number(source.endMonth.slice(0, 4)) - Number(source.receiptDate.slice(0, 4))) * 12
    + Number(source.endMonth.slice(5, 7)) - Number(source.receiptDate.slice(5, 7));
  return Array.from({ length: count + 1 }, (_, offset) => rowFor(source, offset, false, null));
}

function belongsToAccount(row: RawIncomeDemo, accountId: number): boolean {
  return (row.usuario_id ?? 0) === 0 && (row.conta_id ?? 1) === accountId;
}

function pendingDto(db: DemoFakeDatabase, row: RawIncomeDemo): IncomeOccurrenceDto {
  const category = demoIncomeCategories(db).find(item => item.id === row.classificacao_id);
  return {
    id: row.id, userId: 0, accountId: row.conta_id ?? 1, description: row.descricao,
    grossAmount: row.valor_bruto, netAmount: row.valor_liquido, receiptDate: row.data_recebimento,
    month: row.mes, year: row.ano, status: row.status as 'prevista' | 'faturada',
    categoryId: row.classificacao_id!, categoryName: category?.nome ?? row.classificacao_nome,
    parentCategoryName: demoIncomeCategories(db).find(item => item.id === category?.parent_id)?.nome ?? null,
    clientId: row.cliente_id, clientName: row.cliente_nome, representativeId: row.representante_id,
    representativeName: row.representante_nome, commissionAmount: row.valor_comissao, contractId: row.contrato_id,
    attachments: row.anexos, createdAt: row.data_criacao ?? null,
    fixedIncomeId: row.classificacao_fixa_id ?? null, fixedCompetence: row.fixa_competencia ?? null,
    endMonth: row.fixa_mes_final?.slice(0, 7) ?? null, deferred: row.adiada === true,
  };
}

function updateRow(db: DemoFakeDatabase, current: RawIncomeDemo, input: IncomeUpdateInput, receive: boolean): RawIncomeDemo {
  requireFields(input);
  if (current.status === 'cancelada') throw new Error('Receita cancelada');
  if (receive && (!['prevista', 'faturada'].includes(current.status) || current.adiada)) {
    throw new Error(current.adiada ? 'Desmarque Adiar antes de receber' : 'Receita já recebida');
  }
  const source = current.classificacao_fixa_id == null ? undefined
    : sourcesOf(db).find(item => item.id === current.classificacao_fixa_id);
  if (input.endMonth != null && !source) throw new Error('O mês final é só para uma receita fixa');
  const nextSource = source && input.endMonth != null
    ? { ...source, endMonth: requireEndMonth(input.endMonth, source.receiptDate.slice(0, 7)) } : null;
  const updated = {
    ...current, descricao: input.description.trim(), valor_bruto: input.grossAmount, valor_liquido: input.netAmount,
    data_recebimento: input.receiptDate, mes: Number(input.receiptDate.slice(5, 7)) - 1, ano: Number(input.receiptDate.slice(0, 4)),
    cliente_id: current.contrato_id ? current.cliente_id : input.clientId, classificacao_id: input.categoryId,
    representante_id: input.representativeId, anexos: input.attachments,
    ...(receive ? { status: 'ativa', adiada: false } : {}),
  };
  let rows = db.receitas.map(row => row.id === updated.id ? updated : row);
  if (nextSource) {
    // Reduzir apaga as previstas futuras além do novo limite; as canceladas à mão continuam ocupando a competência.
    rows = rows
      .filter(row => row.classificacao_fixa_id !== nextSource.id || !(row.status === 'prevista' && row.data_recebimento >= todayIso()
        && (row.fixa_competencia ?? '').slice(0, 7) > nextSource.endMonth))
      .map(row => row.classificacao_fixa_id !== nextSource.id ? row : { ...row, fixa_mes_final: `${nextSource.endMonth}-01` });
    if (nextSource.endMonth > source!.endMonth) {
      const competences = new Set(rows.filter(row => row.classificacao_fixa_id === nextSource.id).map(row => row.fixa_competencia));
      rows.push(...sourceRows(nextSource).filter(row => row.data_recebimento >= todayIso() && !competences.has(row.fixa_competencia)));
    }
    Object.assign(source!, nextSource);
  }
  db.receitas = rows;
  return rows.find(row => row.id === updated.id)!;
}

/** Receitas e fontes vivem no mesmo banco fake, com os contratos da API real. */
export function resolveFixedIncomesDemo(db: DemoFakeDatabase, endpoint: string, method: string, body?: string): { handled: boolean; data?: unknown } {
  const [path, query] = endpoint.split('?');
  const input: DemoIncomeRequest = body ? JSON.parse(body) as DemoIncomeRequest : {};
  if (path === '/incomes/pending' && method === 'GET') {
    const params = new URLSearchParams(query);
    const month = params.get('month') ?? todayIso().slice(0, 7);
    const accountId = Number(params.get('accountId') ?? 1);
    return { handled: true, data: db.receitas.filter(row => belongsToAccount(row, accountId)
      && ['prevista', 'faturada'].includes(row.status) && row.data_recebimento.slice(0, 7) === month && row.data_recebimento <= todayIso())
      .map(row => pendingDto(db, row)) };
  }
  if (path === '/incomes/defer' && method === 'PATCH') {
    const ids: number[] = Array.isArray(input.ids) ? [...new Set<number>(input.ids)] : [];
    if (!ids.length || typeof input.deferred !== 'boolean') throw new Error('Informe as receitas e o adiamento');
    const selected = ids.map(id => db.receitas.find(row => row.id === id && belongsToAccount(row, Number(input.accountId)) && ['prevista', 'faturada'].includes(row.status)));
    if (selected.some(row => !row)) throw new Error('Receita não encontrada ou já recebida');
    db.receitas = db.receitas.map(row => ids.includes(row.id) ? { ...row, adiada: input.deferred } : row);
    return { handled: true, data: ids };
  }
  if (path === '/incomes' && method === 'POST') {
    const fields = input as IncomeCreateInput;
    requireFields(fields);
    const fixed = fields.billingType === 'fixed';
    if (fields.categoryId == null || !demoIncomeCategories(db).some(category => category.id === fields.categoryId && category.ativo && category.selectable !== false)) {
      throw new Error('Escolha uma categoria disponível');
    }
    const source: DemoIncomeSource = {
      id: fixed ? generateId() : 0, accountId: fields.accountId ?? 1,
      description: fields.description.trim(), categoryId: fields.categoryId,
      grossAmount: fields.grossAmount, netAmount: fields.netAmount, receiptDate: fields.receiptDate,
      endMonth: fixed ? requireEndMonth(fields.endMonth, fields.receiptDate.slice(0, 7)) : fields.receiptDate.slice(0, 7),
      clientId: fields.clientId, representativeId: fields.representativeId,
    };
    const created = fixed ? sourceRows(source) : [rowFor(source, 0, true, fields.attachments)];
    if (fixed) {
      const first = created[0]!;
      first.status = fields.received === true ? 'ativa' : 'prevista';
      first.anexos = fields.attachments;
      sourcesOf(db).push(source);
    }
    db.receitas = [...created, ...db.receitas];
    return { handled: true, data: created[0] };
  }
  if (path === '/income-classifications' && method === 'GET') return { handled: true, data: demoIncomeCategories(db) };
  if (path === '/income-classifications' && method === 'POST') {
    const names: string[] = Array.isArray(input.subcategories) ? input.subcategories : [];
    const category: ClassificacaoReceita = { id: generateId(), nome: String(input.nome ?? '').trim(), parent_id: input.parent_id ?? null,
      tipo: null, conta_id: 1, ativo: true, selectable: names.length === 0, data_criacao: new Date().toISOString() };
    if (!category.nome) throw new Error('Informe o nome da categoria');
    const children = names.map(name => ({ ...category, id: generateId(), nome: name.trim(), parent_id: category.id, selectable: true }));
    demoIncomeCategories(db).push(category, ...children);
    return { handled: true, data: { ...category, subcategories: children } };
  }
  const received = path?.match(/^\/incomes\/(\d+)\/receber$/);
  const edited = path?.match(/^\/incomes\/(\d+)$/);
  if ((received && method === 'PUT') || (edited && ['PUT', 'DELETE'].includes(method))) {
    const id = Number((received ?? edited)![1]);
    const current = db.receitas.find(row => row.id === id && (row.usuario_id ?? 0) === 0);
    if (!current) throw new Error('Receita não encontrada');
    if (method === 'DELETE') {
      if (current.classificacao_fixa_id != null) current.status = 'cancelada';
      else db.receitas = db.receitas.filter(row => row.id !== id);
      return { handled: true, data: null };
    }
    const fields: IncomeUpdateInput = received ? input.changes ?? {
      description: current.descricao, categoryId: current.classificacao_id, grossAmount: Math.max(current.valor_bruto, input.valor_recebido ?? current.valor_liquido),
      netAmount: input.valor_recebido ?? current.valor_liquido, receiptDate: input.data_recebimento ?? current.data_recebimento,
      clientId: current.cliente_id, representativeId: current.representante_id, attachments: current.anexos,
    } : input as IncomeUpdateInput;
    return { handled: true, data: updateRow(db, current, fields, !!received) };
  }
  return { handled: false };
}
