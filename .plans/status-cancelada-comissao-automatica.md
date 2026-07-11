# Plano de Implementação: Status Cancelada + Comissão Automática

## Origem

- Data do planejamento: `2026-07-04`
- Classificação: `frontend + backend + database`

## Resumo

Introduzir o conceito de status (`ativa` / `cancelada`) em despesas e receitas, substituindo editar e deletar pelo cancelamento. Ao cancelar, o registro fica no histórico mas não contabiliza no saldo. Paralelamente, ao criar uma receita com representante vinculado, o sistema auto-gera uma despesa de comissão (categoria "Comissão", criada automaticamente junto com o primeiro representante). Ao cancelar a receita, a despesa de comissão é cancelada junto.

## Escopo

### Dentro do escopo

- Coluna `status` em `despesas` e `receitas` (`'ativa'` | `'cancelada'`, DEFAULT `'ativa'`)
- Endpoint `PUT /despesas/:id/cancelar`
- Endpoint `PUT /receitas/:id/cancelar` (cancela a receita + despesa de comissão se houver representante)
- Saldo (meses.js): excluir `status = 'cancelada'` dos cálculos de SUM
- Frontend despesas: remover Editar e Excluir, adicionar Cancelar, visual diferenciado para canceladas
- Frontend receitas: remover Editar e Excluir, adicionar Cancelar, visual diferenciado para canceladas
- Categoria "Comissão": criada automaticamente ao criar um representante (se não existir)
- Despesa de comissão: criada automaticamente ao salvar receita com representante vinculado

### Fora do escopo

- Cadastro de cliente como entidade separada
- Renomear abas (Movimentação / Lançamentos)
- Qualquer forma de edição de despesas ou receitas
- Geração automática de comissão em replicação de receitas

## Leitura de contexto

- `/AGENT.md`
- `backend/routes/despesas.js`
- `backend/routes/receitas.js`
- `backend/routes/representantes.js`
- `backend/routes/meses.js`
- `backend/routes/categorias.js`
- `src/types/finance.ts`
- `src/services/financeService.ts`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`
- `src/services/queryKeys.ts`

## Impacto por área

### Frontend

**`src/types/finance.ts`**
- `Income`: adicionar `status?: 'ativa' | 'cancelada'`
- `Expense`: adicionar `status?: 'ativa' | 'cancelada'`

**`src/services/financeService.ts`**
- `RawIncome`: adicionar `status?: string | null`
- `RawExpense`: adicionar `status?: string | null`
- `incomeFromApi`: mapear `status: r.status as 'ativa' | 'cancelada' | undefined`
- `expenseFromApi`: mapear `status: r.status as 'ativa' | 'cancelada' | undefined`

**`src/screens/despesas/DespesasScreen.tsx`**
- Remover botão Editar (Pencil) e botão Excluir (Trash2)
- Adicionar botão Cancelar (ícone `Ban`) — desabilitado se `status === 'cancelada'` ou mês fechado
- Mutation `cancelarDespesa`: `PUT /despesas/:id/cancelar` via `apiRequest`
- Após sucesso: `qc.invalidateQueries({ queryKey: queryKeys.dashboard(...) })`
- Linhas com `status === 'cancelada'`: classe `opacity-50`, texto `line-through`, badge "Cancelada" em vermelho
- Total do rodapé: `items.filter(i => i.status !== 'cancelada').reduce(...)`

**`src/screens/receitas/ReceitasScreen.tsx`**
- Remover botão Editar (Pencil) e botão Excluir (Trash2)
- Adicionar botão Cancelar (ícone `Ban`) — desabilitado se `status === 'cancelada'` ou mês fechado
- Mutation `cancelarReceita`: `PUT /receitas/:id/cancelar` via `apiRequest`
- Após sucesso: `qc.invalidateQueries({ queryKey: queryKeys.dashboard(...) })`
- Linhas com `status === 'cancelada'`: visual idêntico ao de despesas
- Total do rodapé: só ativas

### Backend

**`backend/routes/despesas.js`**

Novo endpoint `PUT /:id/cancelar`:
```js
router.put('/:id/cancelar', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const result = await query(
        `UPDATE despesas SET status = 'cancelada' WHERE id = $1 AND usuario_id = $2 RETURNING *`,
        [parseInt(id), req.usuario.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Despesa não encontrada' });
    res.json({ success: true, message: 'Despesa cancelada', data: result.rows[0] });
});
```

**`backend/routes/receitas.js`**

Novo endpoint `PUT /:id/cancelar`:
- Busca a receita (para pegar representante_id, mes, ano)
- Atualiza `status = 'cancelada'` na receita
- Se `representante_id` presente: busca e cancela despesa de comissão:
  ```sql
  UPDATE despesas SET status = 'cancelada'
  WHERE usuario_id = $1 AND mes = $2 AND ano = $3
    AND descricao LIKE 'Comissão - %' AND status = 'ativa'
  ```

Atualizar `POST /` — após criar receita, se `representante_id` e `valor_comissao` presentes:
1. Busca categoria "Comissão" do usuário: `SELECT id FROM categorias WHERE usuario_id = $1 AND LOWER(nome) = 'comissão' LIMIT 1`
2. Se não existir, cria a categoria
3. Insere despesa de comissão:
   ```sql
   INSERT INTO despesas (usuario_id, descricao, valor_original, valor_final,
       data_vencimento, mes, ano, categoria_id, forma_pagamento, pago, recorrente, perfil_id, numero)
   VALUES ($1, $2, $3, $3, $4, $5, $6, $7, 'dinheiro', false, false, $8, $9)
   ```
   - `descricao = 'Comissão - {rep_nome}'`
   - `data_vencimento = data_recebimento da receita`
   - `numero` = próximo número via `obterProximoNumero` (reutilizar função auxiliar ou duplicar a lógica)

**`backend/routes/representantes.js`**

Atualizar `POST /` — após criar representante:
```js
await query(
    `INSERT INTO categorias (usuario_id, nome, cor, icone)
     SELECT $1, 'Comissão', '#f59e0b', 'handshake'
     WHERE NOT EXISTS (
         SELECT 1 FROM categorias WHERE usuario_id = $1 AND LOWER(nome) = 'comissão'
     )`,
    [req.usuario.id]
);
```

**`backend/routes/meses.js`**

Saldo — adicionar filtro nas queries de SUM:
```sql
-- Receitas
SELECT COALESCE(SUM(valor), 0) as total FROM receitas
WHERE usuario_id = $1 AND ano = $2 AND mes = $3 AND status = 'ativa' ...

-- Despesas
SELECT COALESCE(SUM(valor_final), 0) as total FROM despesas
WHERE usuario_id = $1 AND ano = $2 AND mes = $3 AND status = 'ativa' ...
```

### Banco de dados

**Migrations necessárias (requerer confirmação do usuário antes de executar):**

```sql
ALTER TABLE despesas ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ativa';
ALTER TABLE receitas ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ativa';
```

Seguras: DEFAULT aplicado a todos os registros existentes, sem perda de dados.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `backend/routes/despesas.js`
- `backend/routes/receitas.js`
- `backend/routes/representantes.js`
- `backend/routes/meses.js`
- `src/types/finance.ts`
- `src/services/financeService.ts`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`

## Estratégia de implementação

1. **Pedir confirmação** para executar as migrations em despesas e receitas
2. **Executar migrations** após confirmação
3. **Backend — meses.js**: adicionar `AND status = 'ativa'` nas queries de saldo
4. **Backend — representantes.js**: auto-criar categoria "Comissão" no POST
5. **Backend — despesas.js**: adicionar endpoint `PUT /:id/cancelar`
6. **Backend — receitas.js**: adicionar endpoint `PUT /:id/cancelar` + auto-criar despesa de comissão no POST
7. **Frontend — types/finance.ts**: adicionar campo `status`
8. **Frontend — financeService.ts**: mapear `status` nos fromApi
9. **Frontend — DespesasScreen.tsx**: substituir ações de editar/excluir por cancelar + visual cancelada
10. **Frontend — ReceitasScreen.tsx**: substituir ações de editar/excluir por cancelar + visual cancelada
11. **Build** para validar

## Regras de negócio identificadas

- `status = 'ativa'` é o estado padrão de qualquer registro novo
- Registros `status = 'cancelada'` não contam no saldo (receitas e despesas)
- Registros cancelados são exibidos na UI com visual diferenciado (sem desaparecer)
- Cancelar receita com representante vinculado → cancelar automaticamente a despesa de comissão associada
- Categoria "Comissão" criada automaticamente ao criar um representante (idempotente: não cria se já existir)
- Despesa de comissão: `pago = false`, `data_vencimento = data_recebimento da receita`, usuário marca como paga manualmente
- Não existe mais editar nem excluir receitas ou despesas

## Regras multi-tenant e segurança

- Toda query filtra por `usuario_id = req.usuario.id` (extraído do JWT via authMiddleware)
- Endpoint de cancelar valida `WHERE id = $1 AND usuario_id = $2` — impede cancelar registro de outro usuário
- Despesa de comissão criada com o mesmo `usuario_id` e `perfil_id` da receita

## Validações necessárias

- Cancelar despesa já cancelada: retornar 404 (WHERE status = 'ativa' implícito no UPDATE)
- Cancelar receita já cancelada: mesmo padrão
- Comissão só criada se `representante_id != null AND valor_comissao != null AND valor_comissao > 0`

## Comandos de validação sugeridos

```bash
npx vite build
cd backend && node -e "require('./server')" 2>&1 | head -5
```

## Riscos e pontos de atenção

- Migration em produção: colunas com DEFAULT são seguras, mas confirmar ambiente antes
- Busca de comissão por `descricao LIKE 'Comissão - %'` + mês + ano: pode cancelar comissão errada se houver dois representantes diferentes na mesma receita (não é o caso atual, mas atenção futura)
- `GET /despesas` retorna todas (ativas + canceladas): frontend deve filtrar totais localmente e exibir canceladas com visual diferente
- Ao replicar receitas (`replicarAte`): o código atual não repassa o fluxo de comissão para as réplicas — fora do escopo, mas a registrar como dívida técnica

## Perguntas em aberto

- Confirmar execução das migrations antes de iniciar a implementação

## Critérios de aceite

- Migração executada sem erro
- Registros existentes mantêm `status = 'ativa'`
- Criar receita com representante → despesa de comissão aparece na tela de despesas
- Cancelar receita com representante → ambos aparecem como "Cancelada" na UI
- Cancelar despesa avulsa → aparece como "Cancelada", não conta no saldo
- Saldo do mês não inclui registros cancelados
- Primeiro representante criado → categoria "Comissão" criada automaticamente
- Build TypeScript sem erros

## Observações para a skill implementar

- Backend usa raw SQL com `query()` — NÃO usar Drizzle (padrão atual das rotas existentes)
- Toda query filtra por `usuario_id` do JWT
- Reutilizar `obterProximoNumero(usuarioId)` de despesas.js ao criar a despesa de comissão (ou duplicar a função localmente na receita)
- Migrations devem ser apresentadas ao usuário para confirmação ANTES de executar
- Não alterar `.env`
- Não fazer commit/push sem solicitação explícita do usuário
