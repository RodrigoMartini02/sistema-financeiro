# Plano de Implementação: Despesas — Tabela, Filtros, Ações e Modal de Pagamento

## Origem

- Arquivo de especificação: conversa de planejamento (2026-07-03)
- Data do planejamento: 2026-07-03
- Classificação: `fullstack`

## Resumo

Refatorar a tela de Despesas para incluir 11 colunas na ordem definida pelo usuário, 5 filtros na toolbar (linha 2), 4 botões de ação sempre visíveis com cor fixa e estado de desabilitado conforme regras, e modal completo de pagamento com data, valor real pago, diferença calculada e campo de comprovante.

## Escopo

### Dentro do escopo

- Adicionar `recorrente: boolean` ao tipo `Expense` e mapear em `expenseFromApi`
- Novo endpoint backend `POST /despesas/:id/mover` (mover para próximo mês)
- Atualizar `pagarDespesa` no serviço frontend para aceitar `dataPagamento`, `valorPago`
- Adicionar `moverDespesa(id)` em `financeService.ts`
- Novo componente `PaymentModal.tsx` com data, valor pago, diferença e comprovante
- Refatoração completa de `DespesasScreen.tsx`:
  - Busca de status do mês (aberto/fechado)
  - Toolbar linha 2: selects de Status / Categoria / Pagamento / Data pagamento / Ordenar
  - Nova tabela com 11 colunas na ordem definida
  - Coluna Ações: 4 botões coloridos, sempre visíveis, desabilitados conforme regras

### Fora do escopo

- Alterações de schema de banco (todos os campos já existem)
- Salvar anexos de comprovante no endpoint `/pagar` (comprovante vai para Anexos da despesa manualmente)
- Paginação server-side (filtros são client-side)
- Mover parcelas em lote (mover apenas a parcela selecionada)

## Leitura de contexto

- `/AGENT.md` — lido
- `src/types/finance.ts` — lido
- `src/services/financeService.ts` — lido
- `src/hooks/useFinanceDashboard.ts` — lido
- `src/screens/despesas/DespesasScreen.tsx` — lido
- `src/screens/finance/ExpenseDialog.tsx` — lido
- `backend/routes/despesas.js` — lido

## Achados da investigação

| Achado | Impacto |
|--------|---------|
| `recorrente` existe em `RawExpense` mas não é mapeado em `expenseFromApi` nem está no tipo `Expense` | Fix simples — 2 linhas |
| Backend `POST /despesas/:id/pagar` já aceita `data_pagamento` e `valor_pago` | Modal de pagamento requer só mudança no frontend |
| Não existe endpoint de "mover para próximo mês" | Criar `POST /despesas/:id/mover` no backend |
| `DespesasScreen` não sabe se o mês está fechado — `mesFechado` só existe em `FinanceDashboard` | Buscar status via query existente `GET /meses/:ano/:mes/status` |
| Filtros são todos client-side | Sem impacto no backend para filtros |

## Impacto por área

### Frontend

**`src/types/finance.ts`**
- Adicionar `recorrente: boolean` na interface `Expense`

**`src/services/financeService.ts`**
- Mapear `recorrente: r.recorrente === true` em `expenseFromApi`
- Atualizar `pagarDespesa` para aceitar `{ dataPagamento, valorPago }` explicitamente
- Adicionar `moverDespesa(id: number): Promise<void>` chamando `POST /despesas/:id/mover`

**`src/screens/finance/PaymentModal.tsx`** (novo)
- Dialog com:
  - Campo data de pagamento (padrão: hoje)
  - Campo valor pago (padrão: `valorFinal` da despesa)
  - Linha de diferença calculada: economia (verde) ou juros (âmbar) quando `valorPago !== valorOriginal`
  - Botão confirmar / cancelar
- Props: `open`, `expense: Expense`, `onClose`, `onConfirm(dataPagamento, valorPago)`

**`src/screens/despesas/DespesasScreen.tsx`** (refatoração completa)

*Estado local:*
- `filtroStatus: 'todos' | 'pago' | 'em_dia' | 'atrasada'`
- `filtroCategoria: string` (nome da categoria ou '')
- `filtroFormaPagamento: string` ('')
- `filtroDataPagamento: 'qualquer' | 'hoje' | 'semana' | 'mes'`
- `ordenar: 'vencimento_asc' | 'vencimento_desc' | 'valor_asc' | 'valor_desc' | 'descricao'`
- `busca: string`
- `paymentModal: { open: boolean; item?: Expense }`

*Query status do mês:*
```ts
const mesStatusQuery = useQuery({
  queryKey: queryKeys.mesStatus(month, year),
  queryFn: () => apiRequest(`/meses/${year}/${month}/status`),
});
const mesFechado = mesStatusQuery.data?.fechado === true;
```

*Lógica de filtro/ordenação (client-side):*
1. Aplicar `filtroStatus` com base em `item.pago` e comparação `item.dataVencimento` vs hoje
2. Aplicar `filtroCategoria`
3. Aplicar `filtroFormaPagamento`
4. Aplicar `filtroDataPagamento` filtrando por `item.dataPagamento`
5. Aplicar `busca` em descrição, categoria, forma
6. Aplicar `ordenar`

*Toolbar — linha 1 (existente):*
- Busca textual (mantém)

*Toolbar — linha 2 (nova):*
- Select **Status**: Todos / Pago / Em dia / Atrasada
- Select **Categoria**: Todas + lista dinâmica de categorias presentes nos dados do mês
- Select **Pagamento**: Todas + formas presentes nos dados
- Select **Data pag.**: Qualquer / Hoje / Esta semana / Este mês
- Select **Ordenar**: Vencimento ↑ / Vencimento ↓ / Valor ↑ / Valor ↓ / Descrição A–Z
- Botão **Limpar** (visível apenas quando algum filtro linha 2 estiver ativo)

*Tabela — 11 colunas na ordem:*

| # | Header | Conteúdo |
|---|--------|----------|
| 1 | Descrição | `item.descricao` (bold) + observações truncadas como sub-linha |
| 2 | Tipo | Badge `X/Y` se parcelada · Badge `Recorrente` se `item.recorrente` · vazio se simples · Badge `OPEX`/`CAPEX` (empresa) |
| 3 | Vencimento | `item.dataVencimento` formatado · sub-linha `Pago em X` quando pago |
| 4 | Data compra | `item.dataCompra` formatado · `—` se ausente |
| 5 | Categoria | Chip com nome |
| 6 | Pagamento | Label da forma + nome do cartão se crédito |
| 7 | Status | Badge `Pago` (verde) · `Em dia` (âmbar) · `Atrasada` (vermelho) |
| 8 | Valor | `item.valorFinal` em destaque · sub-linha `Base: R$ X` quando `valorOriginal` diferente |
| 9 | NF *(empresa)* | Número NF clicável · `—` se ausente · coluna oculta perfil pessoal |
| 10 | Anexos | Contador clicável `📎 N` · `—` quando vazio |
| 11 | Ações | 4 botões sempre visíveis |

*Coluna Ações — regras de estado:*

| Botão | Cor | Visível quando | Desabilitado quando |
|-------|-----|----------------|---------------------|
| Pagar (CircleCheck) | Verde | `!item.pago` | `mesFechado` |
| Editar (Pencil) | Azul | sempre | `mesFechado` |
| Mover mês (ArrowRight) | Laranja | `!item.pago` | `mesFechado` |
| Excluir (Trash2) | Vermelho | sempre | `mesFechado` |

Quando desabilitado: `opacity-40 cursor-not-allowed`, sem hover effect.

### Backend

**`backend/routes/despesas.js`**

Novo endpoint:
```
POST /despesas/:id/mover
```

Comportamento:
1. Buscar a despesa pelo `id` validando `usuario_id`
2. Calcular mês/ano destino: se `mes === 12` → `mes=1, ano+1`; senão `mes+1`
3. Inserir nova despesa com os mesmos dados, `pago=false`, `data_pagamento=null`, `valor_pago=null`, no mês destino
4. Retornar `{ success: true, data: novaDespesa }`

### Banco de dados

Sem impacto. Todos os campos já existem nas tabelas.

### Infra/Deploy

Sem impacto.

## Arquivos provavelmente afetados

- `src/types/finance.ts`
- `src/services/financeService.ts`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/finance/PaymentModal.tsx` *(novo)*
- `backend/routes/despesas.js`

## Estratégia de implementação

1. **`src/types/finance.ts`** — adicionar `recorrente: boolean` em `Expense`
2. **`src/services/financeService.ts`** — mapear `recorrente` em `expenseFromApi`; atualizar `pagarDespesa`; adicionar `moverDespesa`
3. **`backend/routes/despesas.js`** — novo endpoint `POST /:id/mover`
4. **`src/screens/finance/PaymentModal.tsx`** — criar componente
5. **`src/screens/despesas/DespesasScreen.tsx`** — refatoração completa: estado, filtros, tabela, ações
6. **Build** — `npx vite build` para validar

## Regras de negócio identificadas

- Status "Em dia": `!pago && dataVencimento >= hoje`
- Status "Atrasada": `!pago && dataVencimento < hoje`
- Valor base: exibir só quando `valorOriginal != null && valorOriginal !== valorFinal`
- NF e OPEX/CAPEX: visíveis só no perfil empresa (`localStorage.getItem('perfilAtivoTipo') === 'empresa'`)
- Mover mês: cria cópia da despesa no mês M+1, pago=false — move apenas a despesa selecionada, não grupo de parcelamento
- Virada de ano: mês 12 → mês 1 do ano seguinte
- Ações desabilitadas quando mês fechado: todas as 4

## Regras multi-tenant e segurança

- Backend `POST /:id/mover` deve filtrar por `usuario_id` do JWT — nunca confiar em ID vindo do client sem validação
- Validar `perfil_id` ao criar a despesa no mês destino
- Não expor dados de outros usuários em mensagens de erro

## Validações necessárias

- `POST /:id/mover`: id deve ser inteiro positivo; despesa deve pertencer ao `usuario_id` do token
- `PaymentModal`: valor pago deve ser número positivo; data de pagamento deve ser data válida

## Comandos de validação sugeridos

```bash
npx vite build
```

## Riscos e pontos de atenção

- `mesFechado` precisa ser buscado na `DespesasScreen` independentemente — reutilizar a mesma query de `/meses/:ano/:mes/status` que já existe em `FinanceDashboard`
- Virada de ano no endpoint "mover" deve ser tratada explicitamente (mês 12 → mês 1 do ano seguinte)
- A coluna NF deve ser condicionalmente renderizada com base no perfil — não apenas ocultar visualmente mas remover do DOM para não ocupar espaço

## Perguntas em aberto

- Comprovante no modal de pagamento: fora do escopo desta implementação. O anexo vai para a coluna Anexos da despesa manualmente após pagar.
- Mover parcelas: mover apenas a parcela selecionada (não o grupo de parcelamento).

## Critérios de aceite

- [ ] Campo `recorrente` aparece corretamente nos badges da tabela
- [ ] Filtros de status, categoria, forma, data de pagamento e ordenação funcionam client-side
- [ ] Botão "Limpar" aparece somente quando há filtros ativos na linha 2
- [ ] Tabela exibe 11 colunas na ordem definida
- [ ] Coluna NF visível apenas no perfil empresa
- [ ] Ações sempre visíveis com cor; desabilitadas quando mês fechado ou condição não atendida
- [ ] Modal de pagamento abre ao clicar em Pagar, salva data e valor corretos
- [ ] Endpoint `POST /despesas/:id/mover` cria despesa no mês correto, inclusive virada de ano
- [ ] Build passa sem erros TypeScript

## Observações para a skill implementar

- Seguir `/AGENT.md` — Drizzle não é usado aqui (backend usa SQL raw com `query()`), manter esse padrão
- Não executar migrations — sem alterações de schema
- Não alterar `.env`
- Implementar na ordem da estratégia: types → service → backend → PaymentModal → DespesasScreen → build
- `isEmpresa` = `localStorage.getItem('perfilAtivoTipo') === 'empresa'`
- Reutilizar `queryKeys.mesStatus` se já existir, ou criar seguindo o padrão de `queryKeys.ts`
- Reutilizar `AttachmentSection` e `AttachmentPreviewDialog` já existentes
- Reutilizar o componente `Dialog` existente para o `PaymentModal`
- Atenção: `moverDespesa` deve invalidar o query do dashboard após sucesso
