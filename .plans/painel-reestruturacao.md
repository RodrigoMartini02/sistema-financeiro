# Plano de Implementação: Reestruturação do Painel Financeiro

## Origem

- Origem: análise de UX do painel pedida pelo usuário ("os gráficos e cards estão
  claros, repetidos, fazem sentido, falta algum?"), feita sobre os dados reais de
  produção
- Data do planejamento: `2026-09-09`
- Classificação: `fullstack` (frontend + backend, **sem alteração de banco**)
- Plano anterior relacionado: `.plans/painel-correcao-dados-e-limpeza.md`
  (implementado e em produção — corrigiu os números; este plano trata do que a
  tela comunica)

Motivo da classificação: o backend precisa devolver dados que hoje não calcula
(vencidas, próximos vencimentos, gasto por cartão, parcelas contratadas) e passar
a aceitar período nos blocos hoje restritos a mês único. Todas as colunas
necessárias já existem — nenhuma migration.

## Resumo

O painel tem 24 blocos sem hierarquia: chegando na tela, nada indica o que olhar
primeiro. Ao mesmo tempo, a informação mais acionável dos dados reais —
**R$ 7.527,30 em 25 contas vencidas** — não aparece em lugar nenhum.

Este plano corrige um card que dá conselho errado, remove uma duplicata, torna
visíveis três blocos que hoje somem no filtro padrão, acrescenta três blocos cujo
dado já existe no banco, e reordena a tela por urgência.

## Diagnóstico (medido nos dados de produção)

### Um card comunica o oposto do certo

"Composição das despesas" divide o gasto em fixas (`recorrente = true`) e
variáveis. Em 2026:

```
fixas      R$  1.860,05  ( 2,8%)
variáveis  R$ 63.799,49  (97,2%)
```

E o texto conclui: *"Quase todo o seu gasto é flexível — dá para cortar sem mexer
em compromissos fixos."*

Só que dentro das "variáveis" estão **85 parcelas somando R$ 23.789,73**. Parcela
de cartão é dívida contratada, não gasto flexível. O card chama de "cortável"
algo que em 37% já está comprometido.

### Dois gráficos com o mesmo dado

"Receitas × Despesas × Saldo" e "Receitas × Despesas por mês" consomem o mesmo
`chartData`, na mesma ordem, um logo abaixo do outro. O primeiro tem as barras
mais a linha de saldo acumulado; o segundo é o primeiro com menos informação.

### Três blocos invisíveis no filtro padrão

Carteira de contratos, Parcelas futuras e Metas por categoria só renderizam
quando `De = Até` (mês único). O painel abre em Janeiro–Dezembro — ou seja, na
visão padrão os três estão ausentes, e o usuário precisa saber que existem para
estreitar o filtro e encontrá-los.

### Quatro lacunas com dado disponível

| Lacuna | Dados reais | Situação no painel |
|---|---|---|
| Contas vencidas | 25 despesas, R$ 7.527,30 | **nada** |
| Gasto por cartão | 343 despesas com `cartao_id` | **nada** — a palavra "cartão" não existe na tela |
| Próximos vencimentos | 6 despesas em 30d, R$ 2.125,31 | só "Parcelas futuras", restrito a mês único |
| Parcelas como compromisso | R$ 23.789,73 em 2026 | contadas como "flexível" |

Concentração relevante: `Mercado-Pago` responde por R$ 69.192,23 dos R$ 70.915,03
gastos em cartão — 97,6% num cartão só, sem visibilidade no painel.

## Decisões aplicadas

- **Decisão 1 — Composição em três faixas:** Fixas recorrentes / Parcelas
  contratadas / Livre. Responde a pergunta certa: quanto do gasto dá para mexer.
- **Decisão 2 — Remover o segundo gráfico de barras.** O primeiro já tem as
  mesmas barras mais a linha de saldo.
- **Decisão 3 — Contratos, Parcelas futuras e Metas passam a aceitar período**,
  como o resto do painel.
- **Decisão 4 — Três blocos novos:** Contas vencidas, Gasto por cartão, Próximos
  vencimentos.
- **Decisão 5 — Reorganizar a hierarquia** por urgência, na mesma entrega.

## Escopo

### Dentro do escopo

- Composição das despesas em três faixas, com texto coerente
- Remoção do gráfico "Receitas × Despesas por mês"
- Bloco "Contas vencidas" com total, contagem e lista
- Bloco "Próximos vencimentos" (30 dias)
- Bloco "Gasto por cartão", com nome e total
- Contratos, Parcelas futuras e Metas funcionando em qualquer filtro
- Reordenação dos blocos por urgência
- Campos novos no `/panorama`: `vencidas`, `aVencer`, `porCartao`, `parceladas`

### Fora do escopo

- Migrations — todas as colunas necessárias existem
- Alterar o cálculo de saldo, receitas ou despesas (corrigido no plano anterior)
- Novos tipos de gráfico além dos componentes já existentes
- Distinguir receita prevista de recebida (falso positivo já apurado)
- Mudança de paleta ou de identidade visual

## Leitura de contexto

- `/AGENT.md` (raiz) — regras de banco, Drizzle, multi-tenant
- `/sistema financas/AGENT.md`
- `/CLAUDE.md` — workflow obrigatório
- **Não existem** `frontend/AGENT.md` nem `backend/AGENT.md` dedicados
- `.plans/painel-correcao-dados-e-limpeza.md` — plano anterior, já implementado

Código e dados inspecionados:

- `src/screens/finance/FinanceDashboard.tsx` (~820 linhas, 24 blocos)
- `src/screens/finance/charts/*`
- `backend/src/routes/financial.ts` (`/panorama`)
- Banco de produção (`sistema_financas`), consultas somente-leitura

## Nova hierarquia proposta

```
AÇÃO          Contas vencidas · Vence em 30 dias                    (novos)
SITUAÇÃO      Saldo · Anterior · Receitas · Despesas · Comprometimento
PARA ONDE VAI Cascata · Composição (3 faixas) · Categorias ·
              Forma de pagamento · Cartão                           (cartão novo)
QUEM          Comparativo · Receitas por membro · Despesas por membro
AO LONGO      Receitas × Despesas × Saldo · Contratos · Parcelas · Metas
DETALHE       Juros × Descontos · Origem · Saúde financeira
```

De 24 para ~22 blocos, ordenados para responder: *o que exige ação agora → como
estou → para onde foi o dinheiro → quem gastou → tendência → detalhe*.

## Impacto por área

### Frontend

`FinanceDashboard.tsx`:
- novo bloco de alerta no topo (vencidas + a vencer), visível em qualquer filtro
- "Composição das despesas" com três faixas e texto derivado da faixa dominante
- novo card "Gasto por cartão" (reusa `DonutChart`)
- remoção do bloco "Receitas × Despesas por mês"
- reordenação das seções conforme a hierarquia acima
- contratos, parcelas e metas deixam de depender de `singleMonth`

Estados de loading/error/empty: os blocos novos seguem o padrão já existente
(mensagem centralizada quando não há dados). O bloco de vencidas some quando não
há nada vencido — ausência de alerta é a informação.

`MonthlyComparisonBarChart.tsx` fica sem consumidor após a remoção; avaliar se
sai junto ou permanece para uso futuro.

### Backend

`routes/financial.ts`, endpoint `/panorama` — campos novos:

| Campo | Cálculo |
|---|---|
| `vencidas` | `pago = false AND data_vencimento < hoje` — total, contagem e lista curta |
| `aVencer` | `pago = false AND data_vencimento BETWEEN hoje AND hoje + 30` |
| `porCartao` | `GROUP BY cartao_id` com `JOIN cartoes` para o nome |
| `parceladas` | soma de `parcelado = true`, para a terceira faixa da composição |

`vencidas` e `aVencer` são **absolutos**, não filtrados pelo período do painel:
uma conta vencida em agosto continua vencida quando se olha dezembro. Essa é a
única exceção ao filtro de período, e é intencional.

Contratos, parcelas futuras e metas: adaptar as consultas para aceitar
`deChave`/`ateChave`, no mesmo padrão que `/panorama` já usa.

### Banco de dados

`Sem impacto esperado.` Todas as colunas existem: `data_vencimento`, `pago`,
`cartao_id`, `parcelado`. Os índices criados no plano anterior
(`idx_despesas_status`, `idx_despesas_periodo`) já cobrem as consultas novas.

Atenção: migrations não devem ser executadas sem confirmação explícita do
usuário, pois o ambiente atual pode estar apontando para produção — e o `.env`
da raiz aponta para o banco de produção no Render.

### Infra/Deploy

`Sem impacto esperado.`

## Arquivos provavelmente afetados

- `src/screens/finance/FinanceDashboard.tsx`
- `src/services/financeService.ts` (tipos do panorama)
- `src/screens/finance/charts/MonthlyComparisonBarChart.tsx` *(possível remoção)*
- `backend/src/routes/financial.ts`

## Estratégia de implementação

1. **Backend — vencidas e a vencer.** Duas agregações novas no `/panorama`,
   absolutas em relação ao filtro.
2. **Backend — por cartão.** `GROUP BY cartao_id` com join para o nome.
3. **Backend — parceladas.** Soma para a terceira faixa da composição.
4. **Backend — período nos três restritos.** Contratos, parcelas e metas passam a
   aceitar intervalo.
5. **Frontend — bloco de ação.** Vencidas e a vencer no topo, some quando vazio.
6. **Frontend — composição em três faixas**, com texto coerente com a faixa
   dominante.
7. **Frontend — card de cartão.**
8. **Frontend — remover o gráfico duplicado.**
9. **Frontend — reordenar as seções.**
10. **Validar** builds e testes.

Fases 1-4 (backend) e 5-9 (frontend) resolvem problemas diferentes e devem ir em
commits separados.

## Regras de negócio identificadas

- Despesa vencida = `pago = false` e vencimento anterior a hoje. Independe do
  filtro de período: continua vencida em qualquer visão.
- Parcela contratada é compromisso, não gasto flexível — mesmo não sendo
  `recorrente`.
- Fixa recorrente e parcela contratada são compromissos de naturezas diferentes:
  a primeira é permanente, a segunda termina.
- Cartão com concentração alta é informação de risco, não só de categorização.
- `receitas.status = 'ativa'` significa recebida (apurado no plano anterior).

## Regras multi-tenant e segurança

- As consultas novas seguem `usuario_id = ANY($1)` e o `contaFiltro` já usados no
  `/panorama` — nenhum padrão novo de acesso.
- `porCartao` faz join com `cartoes`: o join precisa respeitar o mesmo escopo de
  conta, para não expor cartão de outra conta.
- Nenhuma rota nova; nenhum campo sensível exposto.
- Lista de vencidas limitada a poucas linhas na resposta, como as demais.

## Validações necessárias

- Período: já validado no `/panorama`, sem parâmetro novo
- `vencidas` e `aVencer` não aceitam parâmetro do cliente — a janela de 30 dias é
  fixa no backend
- `porCartao` não recebe id do cliente: agrupa o que o escopo já permite ler
- Divisão por zero na composição quando não há despesas no período

## Testes necessários

### Backend

- vencidas conta apenas `pago = false` com vencimento anterior a hoje
- vencidas ignora o filtro de período (mesmo resultado em Jan–Dez e em mês único)
- `porCartao` não devolve cartão de outra conta
- `parceladas` + fixas + livre soma o total de despesas do período
- contratos, parcelas e metas devolvem dados em intervalo, não só em mês único

### Frontend

Não há teste de UI no projeto. Verificação manual:
- bloco de vencidas aparece no filtro padrão
- bloco some quando não há nada vencido
- composição não chama parcela de flexível
- nenhum gráfico repetido na tela

### E2E

- abrir o painel em Jan–Dez e conferir que vencidas, contratos, parcelas e metas
  aparecem
- conferir que o total das três faixas bate com o card "Despesas"

## Comandos de validação sugeridos

```bash
npm --prefix backend run test
npm --prefix backend run build
npm run build
```

## Riscos e pontos de atenção

- **Maior entrega do painel até agora:** 3 blocos novos, 1 removido, 1 corrigido,
  reordenação completa e 4 campos no backend. Vale considerar dividir em duas
  branches (backend e frontend) se a revisão ficar difícil.
- **A reordenação muda a tela inteira.** Quem já tem memória da posição dos
  blocos vai estranhar na primeira vez.
- **Este plano antecipa decisões de layout** que o usuário havia dito que tomaria
  com um modelo próprio. A ordem proposta é uma leitura a partir dos dados, não
  um mockup aprovado — vale revisar antes de considerar fechada.
- `vencidas` ignorar o filtro de período é uma exceção deliberada; se não ficar
  claro na tela, pode confundir ("por que aparece agosto se filtrei dezembro?").
  O rótulo do bloco precisa dizer isso.
- `porCartao` é a única query realmente nova; as outras derivam de dados que a
  mesma tabela já fornece.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Contas vencidas visíveis no filtro padrão, sem precisar estreitar o período
- Bloco de vencidas ausente quando não há nada vencido
- Composição em três faixas, sem chamar parcela de flexível, e somando o total
- Nenhum gráfico repetido
- Contratos, parcelas futuras e metas funcionam em qualquer filtro
- Gasto por cartão visível, com nome e total
- Blocos ordenados por urgência
- `npm --prefix backend run test`, `npm --prefix backend run build` e
  `npm run build` verdes

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Nenhuma migration é necessária; não executar nenhuma.
- O `.env` da raiz aponta para **produção** — não rodar script de dado.
- Seguir `/AGENT.md` da raiz (não existem AGENT.md de frontend/backend).
- Reaproveitar `DonutChart` e o padrão de card já existente; não criar
  componente de gráfico novo.
- Manter backend e frontend em commits separados.
- Antes de remover `MonthlyComparisonBarChart.tsx`, confirmar que nenhuma outra
  tela o consome.
