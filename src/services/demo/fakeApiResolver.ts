import {
  createDemoFakeDatabase, generateId, todayIso, currentMonthYear,
  type DemoFakeDatabase,
} from './demoFakeDatabase';

export interface FakeApiRequestInit {
  method?: string;
  body?: string;
}

function parseBody<T>(init?: FakeApiRequestInit): T {
  return init?.body ? (JSON.parse(init.body) as T) : ({} as T);
}

function matchEndpoint(endpoint: string, pattern: RegExp) {
  const path = endpoint.split('?')[0];
  return path.match(pattern);
}

/**
 * Resolve um endpoint da API contra o banco fake em memória, no mesmo formato bruto
 * que a API real devolveria — para que o parsing existente nos services reais
 * (incomeFromApi, expenseFromApi, etc.) funcione sem duplicação.
 */
export function resolveFakeApiRequest(
  db: DemoFakeDatabase,
  endpoint: string,
  init?: FakeApiRequestInit,
): unknown {
  const method = (init?.method ?? 'GET').toUpperCase();

  // Receitas
  if (matchEndpoint(endpoint, /^\/receitas$/) && method === 'GET') {
    return db.receitas;
  }
  if (matchEndpoint(endpoint, /^\/receitas$/) && method === 'POST') {
    const body = parseBody<Record<string, unknown>>(init);
    const { mes, ano } = currentMonthYear();
    const novaReceita = {
      id: generateId(),
      descricao: String(body.descricao ?? ''),
      valor: Number(body.valor ?? 0),
      data_recebimento: String(body.data_recebimento ?? todayIso()),
      mes: Number(body.mes ?? mes),
      ano: Number(body.ano ?? ano),
      status: 'ativa',
      contrato_id: null,
      observacoes: (body.observacoes as string | null) ?? null,
      cliente: (body.cliente as string | null) ?? null,
      tipo_receita: (body.tipo_receita as string | null) ?? null,
      representante_id: null,
      representante_nome: null,
      valor_comissao: null,
      anexos: null,
    };
    db.receitas = [novaReceita, ...db.receitas];
    return novaReceita;
  }
  const receitaIdMatch = matchEndpoint(endpoint, /^\/receitas\/(\d+)$/);
  if (receitaIdMatch && method === 'DELETE') {
    const id = Number(receitaIdMatch[1]);
    db.receitas = db.receitas.filter((item) => item.id !== id);
    return undefined;
  }
  if (receitaIdMatch && method === 'PUT') {
    const id = Number(receitaIdMatch[1]);
    const body = parseBody<Record<string, unknown>>(init);
    db.receitas = db.receitas.map((item) =>
      item.id === id
        ? {
            ...item,
            descricao: String(body.descricao ?? item.descricao),
            valor: Number(body.valor ?? item.valor),
            data_recebimento: String(body.data_recebimento ?? item.data_recebimento),
          }
        : item,
    );
    return db.receitas.find((item) => item.id === id);
  }

  // Despesas
  if (matchEndpoint(endpoint, /^\/despesas$/) && method === 'GET') {
    return db.despesas;
  }
  if (matchEndpoint(endpoint, /^\/despesas$/) && method === 'POST') {
    const body = parseBody<Record<string, unknown>>(init);
    const { mes, ano } = currentMonthYear();
    const categoria = db.categorias.find((c) => c.id === Number(body.categoria_id));
    const valorFinal = Number(body.valor_final ?? body.valor_original ?? 0);
    const novaDespesa = {
      id: generateId(),
      descricao: String(body.descricao ?? ''),
      categoria_nome: categoria?.nome ?? null,
      categoria_id: categoria?.id ?? null,
      forma_pagamento: String(body.forma_pagamento ?? 'dinheiro'),
      cartao_id: (body.cartao_id as number | null) ?? null,
      data_vencimento: String(body.data_vencimento ?? todayIso()),
      data_compra: (body.data_compra as string | null) ?? null,
      data_pagamento: body.pago ? String(body.data_vencimento ?? todayIso()) : null,
      mes: Number(body.mes ?? mes),
      ano: Number(body.ano ?? ano),
      status: 'ativa',
      pago: Boolean(body.pago),
      parcelado: Boolean(body.parcelado),
      recorrente: Boolean(body.recorrente),
      numero_parcelas: (body.total_parcelas as number | null) ?? null,
      parcela_atual: body.parcelado ? 1 : null,
      observacoes: (body.observacoes as string | null) ?? null,
      valor_original: Number(body.valor_original ?? valorFinal),
      valor_final: valorFinal,
      numero_nf: null,
      data_emissao_nf: null,
      tipo_despesa: (body.tipo_despesa as string | null) ?? null,
      anexos: null,
    };
    db.despesas = [novaDespesa, ...db.despesas];
    return novaDespesa;
  }
  const despesaIdMatch = matchEndpoint(endpoint, /^\/despesas\/(\d+)$/);
  if (despesaIdMatch && method === 'DELETE') {
    const id = Number(despesaIdMatch[1]);
    db.despesas = db.despesas.filter((item) => item.id !== id);
    return undefined;
  }
  const despesaPayMatch = matchEndpoint(endpoint, /^\/despesas\/(\d+)\/pay$/);
  if (despesaPayMatch && method === 'POST') {
    const id = Number(despesaPayMatch[1]);
    const body = parseBody<Record<string, unknown>>(init);
    db.despesas = db.despesas.map((item) =>
      item.id === id
        ? { ...item, pago: true, data_pagamento: String(body.data_pagamento ?? todayIso()) }
        : item,
    );
    return undefined;
  }

  // Saldo do mês — calculado a partir do estado fake
  if (matchEndpoint(endpoint, /^\/meses\/\d+\/\d+\/saldo$/)) {
    const totalReceitas = db.receitas.reduce((sum, item) => sum + item.valor, 0);
    const totalDespesas = db.despesas.reduce((sum, item) => sum + item.valor_final, 0);
    return {
      saldo_anterior: 0,
      receitas: totalReceitas,
      despesas: totalDespesas,
      saldo_final: totalReceitas - totalDespesas,
    };
  }

  // Categorias
  if (matchEndpoint(endpoint, /^\/categorias$/) && method === 'GET') {
    return db.categorias;
  }
  if (matchEndpoint(endpoint, /^\/categorias$/) && method === 'POST') {
    const body = parseBody<Record<string, unknown>>(init);
    const novaCategoria = {
      id: generateId(),
      nome: String(body.nome ?? ''),
      cor: null,
      icone: null,
      forma_favorita: null,
      cartao_favorito_id: null,
      cartao_favorito_nome: null,
      parent_id: (body.parent_id as number | null) ?? null,
      tipo_despesa: null,
      ativo: true,
      data_criacao: todayIso(),
    };
    db.categorias = [...db.categorias, novaCategoria];
    return novaCategoria;
  }

  // Cartões
  if (matchEndpoint(endpoint, /^\/cartoes$/) && method === 'GET') {
    return db.cartoes;
  }

  // Reservas
  if (matchEndpoint(endpoint, /^\/reservas$/) && method === 'GET') {
    return db.reservas;
  }
  if (matchEndpoint(endpoint, /^\/reservas$/) && method === 'POST') {
    const body = parseBody<Record<string, unknown>>(init);
    const { mes, ano } = currentMonthYear();
    const novaReserva = {
      id: generateId(),
      observacoes: String(body.observacoes ?? ''),
      valor: 0,
      data: todayIso(),
      mes, ano,
      tipo_reserva: body.objetivo_valor ? ('objetivo' as const) : ('normal' as const),
      objetivo_valor: (body.objetivo_valor as number | null) ?? null,
      objetivo_atingido: false,
      data_objetivo: (body.data_objetivo as string | null) ?? null,
      cor: (body.cor as string | null) ?? null,
      icone: (body.icone as string | null) ?? null,
      perfil_id: null,
    };
    db.reservas = [...db.reservas, novaReserva];
    return novaReserva;
  }
  const reservaIdMatch = matchEndpoint(endpoint, /^\/reservas\/(\d+)$/);
  if (reservaIdMatch && method === 'DELETE') {
    const id = Number(reservaIdMatch[1]);
    db.reservas = db.reservas.filter((item) => item.id !== id);
    return undefined;
  }
  if (reservaIdMatch && method === 'PUT') {
    const id = Number(reservaIdMatch[1]);
    const body = parseBody<Record<string, unknown>>(init);
    db.reservas = db.reservas.map((item) =>
      item.id === id
        ? {
            ...item,
            observacoes: String(body.observacoes ?? item.observacoes),
            objetivo_valor: (body.objetivo_valor as number | null) ?? item.objetivo_valor,
            data_objetivo: (body.data_objetivo as string | null) ?? item.data_objetivo,
            cor: (body.cor as string | null) ?? item.cor,
            icone: (body.icone as string | null) ?? item.icone,
          }
        : item,
    );
    return db.reservas.find((item) => item.id === id);
  }
  const reservaMoveMatch = matchEndpoint(endpoint, /^\/reservas\/(\d+)\/move$/);
  if (reservaMoveMatch && method === 'POST') {
    const id = Number(reservaMoveMatch[1]);
    const body = parseBody<Record<string, unknown>>(init);
    const valor = Number(body.valor ?? 0);
    const delta = body.tipo === 'retirada' ? -valor : valor;
    db.reservas = db.reservas.map((item) =>
      item.id === id ? { ...item, valor: item.valor + delta } : item,
    );
    return { id: generateId(), reserva_id: id, tipo: body.tipo, valor, data_hora: new Date().toISOString() };
  }
  if (matchEndpoint(endpoint, /^\/reservas\/\d+\/movements$/)) {
    return [];
  }

  // Compromissos/agenda — sem dado relevante na demo
  if (matchEndpoint(endpoint, /^\/appointments$/) && method === 'GET') {
    return [];
  }
  if (matchEndpoint(endpoint, /^\/appointments$/) && method === 'POST') {
    const body = parseBody<Record<string, unknown>>(init);
    return { id: generateId(), ...body };
  }
  const appointmentIdMatch = matchEndpoint(endpoint, /^\/appointments\/(\d+)$/);
  if (appointmentIdMatch) {
    return undefined;
  }

  // Reabrir mês fechado — apenas simula sucesso
  if (matchEndpoint(endpoint, /^\/meses\/\d+\/\d+\/reabrir$/)) return undefined;

  // Sugestões de autocomplete — sem sugestões na demo
  if (matchEndpoint(endpoint, /^\/expenses\/suggestions$/)) {
    return { matches: [], forma_pagamento_sugerida: null, cartao_sugerido: null };
  }
  if (matchEndpoint(endpoint, /^\/incomes\/suggestions$/)) {
    return { matches: [], forma_pagamento_sugerida: null, cliente_sugerido: null };
  }

  // Listas auxiliares sem dado relevante na demo — devolver vazio
  if (matchEndpoint(endpoint, /^\/representantes$/)) return { success: true, data: [] };
  if (matchEndpoint(endpoint, /^\/income-types$/)) return { success: true, data: [] };
  if (matchEndpoint(endpoint, /^\/clientes$/)) return [];
  if (matchEndpoint(endpoint, /^\/contratos$/)) return [];
  if (matchEndpoint(endpoint, /^\/contratos\/faturamento$/)) return [];
  if (matchEndpoint(endpoint, /^\/meses$/)) return [];

  // Ações sem efeito real na demo (fechamento de mês, faturamento) — apenas simula sucesso
  if (matchEndpoint(endpoint, /^\/meses\/\d+\/\d+\/fechar$/)) return undefined;
  if (matchEndpoint(endpoint, /\/faturar$/)) return undefined;

  // Dashboard anual — agrega os lançamentos fake pelo mês de cada um (data_recebimento /
  // data_vencimento), refletindo corretamente onde o visitante lançar cada item.
  if (matchEndpoint(endpoint, /^\/financial\/anual$/)) {
    return Array.from({ length: 12 }, (_, mes) => {
      const receitasMes = db.receitas.filter((item) => new Date(item.data_recebimento).getMonth() === mes);
      const despesasMes = db.despesas.filter((item) => new Date(item.data_vencimento).getMonth() === mes);
      const totalReceitas = receitasMes.reduce((sum, item) => sum + item.valor, 0);
      const totalDespesas = despesasMes.reduce((sum, item) => sum + item.valor_final, 0);
      return {
        mes,
        receitas: totalReceitas,
        despesas: totalDespesas,
        saldo_final: totalReceitas - totalDespesas,
        receitas_previstas: 0,
      };
    });
  }

  // Parcelas futuras — sem dado relevante na demo
  if (matchEndpoint(endpoint, /^\/despesas\/parcelas-futuras$/)) return [];

  return undefined;
}

export const resolveDemoRequest = resolveFakeApiRequest;

export function createDemoDatabaseInstance(): DemoFakeDatabase {
  return createDemoFakeDatabase();
}
