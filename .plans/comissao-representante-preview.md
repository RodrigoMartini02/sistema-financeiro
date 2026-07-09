# Plano de Implementação: Comissão de Representantes — Tipo e Preview

## Origem

- Arquivo de especificação: conversa direta com o usuário (2026-06-29)
- Data do planejamento: 2026-06-29
- Classificação: `frontend + backend + database`

## Resumo

Implementar o fluxo completo de comissão de representantes:
1. Adicionar coluna `tipo` (`'mensal' | 'unica'`) na tabela `comissoes` do banco
2. Expor toggle mensal/única na configuração de cada comissão do representante
3. Exibir preview automático de comissão no modal de receita ao combinar valor + tipo + representante
4. Corrigir JOIN faltando em `GET /api/receitas` para retornar `representante_nome`

## Escopo

### Dentro do escopo

- Coluna `tipo VARCHAR(10) DEFAULT 'mensal'` na tabela `comissoes` (migration)
- Schema Drizzle atualizado para refletir o novo campo
- Rota `PUT /api/representatives` incluindo `tipo` no upsert de comissões
- Rota `GET /api/receitas` com `LEFT JOIN representantes` para retornar `representante_nome`
- Toggle "Mensal / Única" no `ComissaoRow` em `RepresentantesTab.tsx`
- Interface `Comissao` no service com campo `tipo`
- Bloco de preview no `IncomeDialog` usando `useWatch`

### Fora do escopo

- Tabela de registro histórico de comissões pagas
- Relatório de comissões por representante
- Cálculo automático no backend ao salvar receita
- Aprovação/pagamento/liquidação de comissões

## Leitura de contexto

- `/AGENT.md` — lido
- `backend/src/db/schema/representatives.ts` — analisado via agente
- `backend/src/routes/representatives.ts` — analisado via agente
- `backend/src/routes/incomes.ts` — analisado via agente
- `src/screens/finance/IncomeDialog.tsx` — lido diretamente
- `src/screens/config/RepresentantesTab.tsx` — lido diretamente
- `src/services/representantesService.ts` — analisado via agente

## Impacto por área

### Frontend

**Arquivos afetados:**

- `src/services/representantesService.ts`
  - Adicionar `tipo: 'mensal' | 'unica'` na interface `Comissao`

- `src/screens/config/RepresentantesTab.tsx` — `ComissaoRow`
  - Adicionar toggle `ToggleGroup` com opções `[{ value: 'mensal', label: 'Mensal' }, { value: 'unica', label: 'Única' }]`
  - Valor controlado via `comissao.tipo`, padrão `'mensal'`
  - Repassar `tipo` no `onChange`

- `src/screens/finance/IncomeDialog.tsx`
  - Adicionar `useWatch` nos campos `['valor', 'tipoReceita', 'representanteId']`
  - Derivar `comissaoPreview`:
    ```ts
    const rep = representantes.find(r => r.id === representanteId)
    const comissao = rep?.comissoes?.find(c => c.tipo_receita === tipoReceita)
    const valorComissao = comissao ? (valor * comissao.percentual) / 100 : null
    ```
  - Exibir bloco discreto abaixo do campo de representante:
    ```
    💰 Mirian receberá R$ 250,00 · 5% · mensal
    ```
  - Só exibir quando: representante selecionado + tipo de receita selecionado + valor > 0 + comissão encontrada

- `src/types/finance.ts`
  - Verificar se `Income` tem `representanteNome` — adicionar se não tiver

### Backend

**`backend/src/routes/representatives.ts`:**
- No `PUT /:id` (upsert de comissões), incluir `tipo` no INSERT:
  ```sql
  INSERT INTO comissoes (representante_id, tipo_receita, percentual, tipo)
  VALUES ($1, $2, $3, $4)
  ```
- No `GET /` (lista com `json_agg`), incluir `tipo` nos campos retornados de `comissoes`

**`backend/src/routes/incomes.ts`:**
- No `GET /api/receitas`, adicionar:
  ```sql
  LEFT JOIN representantes rep ON rep.id = r.representante_id
  ```
  E incluir `rep.nome AS representante_nome` no SELECT

### Banco de dados

**Migration necessária (NÃO executar sem confirmação explícita do usuário):**

```sql
ALTER TABLE comissoes
ADD COLUMN tipo VARCHAR(10) NOT NULL DEFAULT 'mensal'
CHECK (tipo IN ('mensal', 'unica'));
```

- `DEFAULT 'mensal'` garante que registros existentes não quebrem
- `CHECK constraint` garante integridade dos valores
- Nenhuma outra tabela é alterada

**Schema Drizzle (`backend/src/db/schema/representatives.ts`):**
```ts
tipo: varchar('tipo', { length: 10 }).notNull().default('mensal'),
```

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `backend/src/db/schema/representatives.ts`
- `backend/src/routes/representatives.ts`
- `backend/src/routes/incomes.ts`
- `src/services/representantesService.ts`
- `src/screens/config/RepresentantesTab.tsx`
- `src/screens/finance/IncomeDialog.tsx`
- `src/types/finance.ts` (verificar)

## Estratégia de implementação

1. **Parar e pedir confirmação** ao usuário antes de executar a migration
2. Executar migration `ALTER TABLE comissoes ADD COLUMN tipo ...`
3. Atualizar schema Drizzle em `representatives.ts`
4. Atualizar `PUT /api/representatives` para salvar `tipo` nas comissões
5. Atualizar `GET /api/representatives` para retornar `tipo` nas comissões
6. Atualizar `GET /api/receitas` com LEFT JOIN para `representante_nome`
7. Atualizar interface `Comissao` no service com campo `tipo`
8. Adicionar toggle mensal/única no `ComissaoRow`
9. Implementar preview no `IncomeDialog` com `useWatch`
10. Rodar `npx vite build` para validar

## Regras de negócio identificadas

- `tipo` pertence à regra de comissão (no representante), não à receita individual
- `mensal`: a comissão se aplica toda vez que uma receita daquele tipo é registrada
- `unica`: a comissão se aplica apenas na primeira receita daquele tipo (para efeito de preview, exibir apenas)
- O preview é apenas informativo — não gera registro de comissão no banco neste escopo
- Match entre `tipo_receita` da comissão e `tipoReceita` da receita é por igualdade de string (case-sensitive)
- Se não há comissão configurada para aquele tipo, o preview não aparece

## Regras multi-tenant e segurança

- Todas as queries filtram por `usuario_id` do JWT — sem risco de vazamento entre usuários
- O `tipo` é um campo de configuração interna, sem impacto em permissões

## Validações necessárias

- `tipo` deve ser `'mensal'` ou `'unica'` — validar no backend antes do INSERT
- `percentual` deve ser > 0 e ≤ 100 (já validado, manter)
- Preview só exibe quando `valor > 0 && tipoReceita && representanteId`

## Testes necessários

### Frontend
- Preview aparece ao selecionar representante + tipo + valor
- Preview não aparece quando tipo não tem comissão configurada
- Toggle mensal/única persiste ao salvar representante

### Backend
- `GET /api/receitas` retorna `representante_nome` quando há representante
- `PUT /api/representatives` salva `tipo` corretamente
- Migration não quebra registros existentes (DEFAULT 'mensal')

## Comandos de validação sugeridos

```bash
npx vite build
```

## Riscos e pontos de atenção

- **Migration em produção**: a tabela `comissoes` pode ter dados; `DEFAULT 'mensal'` mitiga o risco, mas confirmar antes
- **Match por string**: se o nome do tipo de receita foi digitado diferente (ex: "Mensalidade" vs "mensalidade"), o preview não aparece — considerar normalização futura
- **JOIN em incomes**: adicionar LEFT JOIN não quebra comportamento existente, mas aumenta custo da query

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite

- Toggle mensal/única aparece no `ComissaoRow` ao configurar representante
- Preview de comissão aparece no `IncomeDialog` ao combinar valor + tipo + representante com comissão configurada
- `GET /api/receitas` retorna `representante_nome`
- Migration executada sem erro e registros existentes intactos
- Build passa sem erros

## Observações para a skill implementar

- **Parar na etapa 1** e pedir confirmação explícita do usuário antes de qualquer migration
- Não executar migrations automaticamente
- Seguir `/AGENT.md`
- O preview é client-side puro — sem chamada extra à API
- Alterar apenas os arquivos listados
