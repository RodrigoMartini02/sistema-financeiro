# Plano de Implementação: Correção completa de Receitas — backend salvar campos + tabela mostrar comissão

## Origem

- Arquivo de especificação: conversa — análise dos campos da tabela de receitas
- Data do planejamento: 2026-07-04
- Classificação: `fullstack`

## Resumo

O backend `receitas.js` descarta silenciosamente `cliente`, `tipo_receita`, `representante_id` e `valor_comissao` no POST e PUT. O GET não faz JOIN com `representantes` para trazer o nome. As colunas já existem no banco — nenhuma migration é necessária.

## Escopo

### Dentro do escopo

- `backend/routes/receitas.js` — corrigir GET (JOIN), POST (salvar campos), PUT (atualizar campos)
- `src/types/finance.ts` — adicionar `valorComissao` em `Income` e `IncomeFormValues`
- `src/services/financeService.ts` — mapear `valor_comissao` e `representante_nome` da API, enviar `valor_comissao` no save
- `src/screens/finance/IncomeDialog.tsx` — passar `valorComissao` calculado no submit
- `src/screens/receitas/ReceitasScreen.tsx` — adicionar coluna "Comissão" na tabela

### Fora do escopo

- `valor_imposto` e `aliquota_aplicada` — existem no banco mas não há UI para isso
- Nenhuma migration necessária — colunas já existem

## Leitura de contexto

- `/AGENT.md`
- `backend/routes/receitas.js`
- `backend/routes/representantes.js`
- `src/types/finance.ts`
- `src/services/financeService.ts`
- `src/screens/finance/IncomeDialog.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`

## Impacto por área

### Frontend

- `src/types/finance.ts`: adicionar `valorComissao?: number | null` em `Income` e `IncomeFormValues`
- `src/services/financeService.ts`:
  - `RawIncome`: adicionar `valor_comissao?: number | null`
  - `incomeFromApi`: mapear `valorComissao: r.valor_comissao ?? null` e `representanteNome: r.representante_nome ?? null`
  - `saveIncome`: incluir `valor_comissao: values.valorComissao ?? null` no body
- `src/screens/finance/IncomeDialog.tsx`:
  - No `handleSubmit`, incluir `valorComissao` calculado (`valorComissao` já existe como variável local)
- `src/screens/receitas/ReceitasScreen.tsx`:
  - Adicionar coluna "Comissão" entre Tipo e Valor
  - Exibir `formatCurrency(item.valorComissao)` quando > 0, senão `—`
  - Ajustar `colSpan` do tfoot de 4 para 5

### Backend

- `GET /receitas`:
  - Mudar `SELECT r.*` para `SELECT r.*, rep.nome AS representante_nome`
  - Adicionar `LEFT JOIN representantes rep ON rep.id = r.representante_id AND rep.usuario_id = r.usuario_id`
- `POST /receitas`:
  - Adicionar `cliente`, `tipo_receita`, `representante_id`, `valor_comissao` ao destructuring do `req.body`
  - Adicionar esses campos ao INSERT e VALUES
- `PUT /receitas/:id`:
  - Adicionar `cliente`, `tipo_receita`, `representante_id`, `valor_comissao` ao destructuring
  - Adicionar ao SET do UPDATE

### Banco de dados

Sem impacto — colunas já existem:
- `cliente` (character varying)
- `tipo_receita` (character varying)
- `representante_id` (integer)
- `valor_comissao` (numeric)

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `backend/routes/receitas.js`
- `src/types/finance.ts`
- `src/services/financeService.ts`
- `src/screens/finance/IncomeDialog.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`

## Estratégia de implementação

1. **backend/routes/receitas.js — GET**: adicionar LEFT JOIN com representantes e selecionar `rep.nome AS representante_nome`
2. **backend/routes/receitas.js — POST**: incluir `cliente`, `tipo_receita`, `representante_id`, `valor_comissao` no INSERT
3. **backend/routes/receitas.js — PUT**: incluir os mesmos campos no UPDATE SET
4. **src/types/finance.ts**: adicionar `valorComissao?: number | null` em `Income` e `IncomeFormValues`
5. **src/services/financeService.ts**: mapear `valor_comissao` e `representante_nome`; enviar no body do save
6. **src/screens/finance/IncomeDialog.tsx**: passar `valorComissao` calculado no handleSubmit
7. **src/screens/receitas/ReceitasScreen.tsx**: adicionar coluna Comissão; ajustar colSpan do tfoot
8. **Build**: `npx vite build` para validar

## Regras de negócio identificadas

- `valor_comissao` é calculado no frontend: `(valor × percentual_do_representante) / 100`
- A comissão só existe quando há `representanteId` selecionado e `tipoReceita` com percentual cadastrado
- Dados antigos (receitas já salvas) terão `valor_comissao = null` — exibir `—`
- O JOIN de representantes deve filtrar por `usuario_id` para evitar vazamento entre usuários

## Regras multi-tenant e segurança

- O `LEFT JOIN representantes` deve incluir `AND rep.usuario_id = r.usuario_id` para garantir que o nome retornado pertence ao mesmo usuário
- `representante_id` vindo do body não é validado contra o banco — o INSERT/UPDATE é seguro pois o `WHERE usuario_id = $N` garante que a receita pertence ao usuário autenticado
- Não há risco de vazar comissões entre usuários pois o JOIN é filtrado

## Validações necessárias

- `valor_comissao`: aceitar null ou número >= 0
- `representante_id`: aceitar null ou inteiro
- `cliente`: aceitar null ou string
- `tipo_receita`: aceitar null ou string

## Comandos de validação sugeridos

```bash
npx vite build
```

## Riscos e pontos de atenção

- Backend aponta para produção — operação segura: nenhum dado é apagado, apenas campos que antes eram null passam a ser preenchidos
- Dados antigos continuarão com `valor_comissao = null` — a coluna exibirá `—` para eles
- O JOIN adicional no GET tem impacto mínimo de performance (chave primária indexada)

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- `POST /receitas` salva `cliente`, `tipo_receita`, `representante_id`, `valor_comissao` no banco
- `PUT /receitas/:id` atualiza esses mesmos campos
- `GET /receitas` retorna `representante_nome` via JOIN
- A tabela de Receitas exibe a coluna Comissão com valor ou `—`
- Build passa sem erros

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Não executar migrations — colunas já existem no banco
- Backend usa raw SQL com `query()` — seguir esse padrão, não introduzir Drizzle
- O `LEFT JOIN representantes` deve incluir `AND rep.usuario_id = r.usuario_id`
- `valorComissao` no frontend já é calculado como variável local em `IncomeDialog` — apenas incluí-la no objeto `IncomeFormValues` no submit
- Ajustar `colSpan` do tfoot em `ReceitasScreen` de 4 para 5 ao adicionar coluna Comissão
