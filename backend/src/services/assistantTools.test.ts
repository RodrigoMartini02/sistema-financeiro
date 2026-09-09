import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ASSISTANT_TOOLS,
  ASSISTANT_TOOL_NAMES,
  AssistantToolError,
  runAssistantTool,
} from './assistantTools';
import type { QueryScope } from './assistantQueries';

// Escopo qualquer: os casos abaixo param na validacao de parametro, antes de
// qualquer consulta ao banco.
const scope: QueryScope = {
  userId: 1,
  account: { id: 1, type: 'pessoal', name: 'Pessoal' },
};

test('as 16 ferramentas da spec estao declaradas', () => {
  const esperadas = [
    'resumo_periodo', 'saldo_atual', 'saude_financeira',
    'gastos_por_categoria', 'maiores_gastos', 'buscar_lancamentos',
    'gastos_por_forma_pagamento', 'comparativo_periodos',
    'contas_a_pagar', 'contas_a_receber', 'recorrentes_previstas',
    'parcelamentos_abertos', 'posicao_parcelamento', 'comprometimento_futuro',
    'projecao_saldo', 'simular_nova_parcela', 'progresso_meta',
    'variacao_por_categoria',
  ];
  for (const nome of esperadas) {
    assert.ok(ASSISTANT_TOOL_NAMES.has(nome), `faltou ${nome}`);
  }
  assert.equal(ASSISTANT_TOOLS.length, esperadas.length);
});

test('toda ferramenta declara descricao e schema', () => {
  for (const tool of ASSISTANT_TOOLS) {
    assert.ok(tool.description.length > 10, tool.name);
    for (const required of tool.required) {
      assert.ok(tool.parameters[required], `${tool.name}: obrigatorio ${required} sem schema`);
    }
  }
});

test('ferramenta desconhecida e recusada', async () => {
  await assert.rejects(
    () => runAssistantTool(scope, 'apagar_tudo', {}),
    AssistantToolError,
  );
});

test('parametro obrigatorio ausente vira erro tratado', async () => {
  await assert.rejects(
    () => runAssistantTool(scope, 'buscar_lancamentos', {}),
    AssistantToolError,
  );
  await assert.rejects(
    () => runAssistantTool(scope, 'posicao_parcelamento', {}),
    AssistantToolError,
  );
});

test('periodo invertido ou longo demais e recusado', async () => {
  await assert.rejects(
    () => runAssistantTool(scope, 'resumo_periodo', { inicio: '2026-09-30', fim: '2026-09-01' }),
    AssistantToolError,
  );
  await assert.rejects(
    () => runAssistantTool(scope, 'resumo_periodo', { inicio: '2000-01-01', fim: '2026-12-31' }),
    AssistantToolError,
  );
});

test('simular_nova_parcela recusa valores impossiveis', async () => {
  await assert.rejects(
    () => runAssistantTool(scope, 'simular_nova_parcela', { valor_parcela: 0, num_parcelas: 10 }),
    AssistantToolError,
  );
  await assert.rejects(
    () => runAssistantTool(scope, 'simular_nova_parcela', { valor_parcela: 100 }),
    AssistantToolError,
  );
});

test('enum de status so aceita os valores previstos', () => {
  const contas = ASSISTANT_TOOLS.find((tool) => tool.name === 'contas_a_pagar');
  assert.deepEqual(contas?.parameters['status']?.enum, ['aberto', 'vencido', 'todos']);
});

test('limite de linhas e declarado com teto', () => {
  const maiores = ASSISTANT_TOOLS.find((tool) => tool.name === 'maiores_gastos');
  assert.ok(maiores?.parameters['limite']?.description.includes('50'));
});
