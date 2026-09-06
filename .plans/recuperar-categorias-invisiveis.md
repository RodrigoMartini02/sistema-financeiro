# Plano de Implementação: Recuperar categorias invisíveis

## Origem

- Arquivo de especificação: relato do usuário no chat — categorias sumiram em produção; despesas anteriores a abril exibem categorias que não aparecem mais na lista de seleção
- Data do planejamento: 2026-09-06
- Classificação: `backend-only`
- Branch: `refactor/R/padronizar-modal-configuracoes`

## Resumo

Categorias criadas antes do modelo `tipo`/`conta_id` ficaram com os dois campos nulos e são filtradas para fora do select, embora continuem íntegras no banco. Este plano corrige o filtro de leitura para resgatá-las, sem tocar em nenhum dado.

Nenhuma migration, nenhuma coluna, nenhum `UPDATE`. Apenas dois filtros SQL de consulta.

## Decisões aplicadas

- Decisão 1: **opção 1** — escopo restrito às categorias. Despesas e receitas de meses anteriores ficam para investigação separada, por terem causa diferente.

## Diagnóstico

### O que foi verificado

- Nenhuma migration do histórico contém `DELETE FROM categorias`, `DELETE FROM despesas` ou `DELETE FROM receitas`. Os dados **não foram excluídos**.
- As únicas migrations com operações destrutivas são `0019` (DROP COLUMN em contratos) e `0030` (DROP TABLE membro_permissoes) — nenhuma toca dados do usuário.
- A migration `0018b_migrar_dados_categorias_existentes.sql` era quem preencheria `tipo` ou `conta_id` nas categorias antigas. O próprio arquivo diz "Do not execute automatically", e o projeto **não tem tabela de controle de migrations** — são aplicadas manualmente. Se ela não rodou em produção, as categorias antigas ficaram com ambos os campos nulos.
- A migration `0024` renomeou `perfil_id` para `conta_id` em categorias.

### A causa

O filtro de leitura de categorias exige que a categoria tenha `tipo` OU `conta_id`:

```sql
AND (c.tipo = <tipo da conta> OR c.conta_id = <id da conta>)
```

Uma categoria com `tipo` NULL **e** `conta_id` NULL não satisfaz nenhuma das duas condições — nunca aparece.

### A prova

O usuário observou que despesas anteriores a abril **exibem** nomes de categorias que não aparecem no select. Isso só é possível porque a consulta de despesas busca o nome por JOIN direto, sem filtro de conta (`backend/src/routes/expenses.ts:193`):

```sql
LEFT JOIN categorias c ON d.categoria_id = c.id
```

A mesma categoria passa no JOIN e é barrada no select. Confirma que o registro existe e está referenciado.

### A inconsistência de fundo

Despesas e receitas já possuem uma cláusula de resgate para registros órfãos (`backend/src/utils/accountFilter.ts:13`):

```sql
conta_id = $1 OR (conta_id IS NULL AND <a conta ativa é pessoal do dono>)
```

Categorias **não têm** esse resgate. É uma inconsistência entre dois filtros que deveriam se comportar igual — e é ela que este plano fecha.

## Escopo

### Dentro do escopo

- Adicionar a cláusula de resgate ao filtro de `GET /categorias` (`backend/src/routes/categories.ts:33`).
- Adicionar a mesma cláusula ao filtro duplicado em `GET /despesas/categories` (`backend/src/routes/expenses.ts:221`).

### Fora do escopo

- Executar a migration `0018b` — altera o banco e não é reversível.
- Remover o endpoint órfão `GET /despesas/categories` (assunto de limpeza, separado).
- Despesas e receitas de meses anteriores — o filtro delas já resgata órfãos, a causa é outra e ainda não foi investigada.
- Qualquer `UPDATE`, `DELETE` ou migration.

## Leitura de contexto

- `CLAUDE.md` da raiz e do `sistema financas`
- `backend/src/routes/categories.ts` (filtro principal)
- `backend/src/routes/expenses.ts` (filtro duplicado e JOIN sem filtro)
- `backend/src/utils/accountFilter.ts` (cláusula de resgate existente)
- `backend/src/utils/ownerAndAccountWhere.ts`
- `backend/src/services/commissionService.ts` e `backend/src/routes/representatives.ts` (outros consumidores de categorias)
- `backend/drizzle/0017`, `0018`, `0018b`, `0024` (evolução do modelo)
- `src/services/configService.ts` (confirma que o frontend só usa `/categorias`)
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` neste projeto: o `CLAUDE.md` da raiz cobre todo o repositório.

## Impacto por área

### Frontend

Sem impacto esperado. Nenhum arquivo alterado. As categorias resgatadas chegam pelo mesmo endpoint e formato que já são consumidos.

### Backend

Dois filtros de consulta, ambos somente leitura:

- `backend/src/routes/categories.ts` — `GET /`, usado pelo frontend.
- `backend/src/routes/expenses.ts` — `GET /categories`, sem consumidor conhecido no frontend, mas corrigido para não deixar armadilha.

Nenhuma rota de escrita é alterada. Categorias novas continuam nascendo com `conta_id` preenchido (`categories.ts:184`), então o problema é exclusivo do acervo antigo.

### Banco de dados

Sem impacto esperado. Nenhuma migration, nenhum `UPDATE`, nenhum `DELETE`.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `backend/src/routes/categories.ts`
- `backend/src/routes/expenses.ts`

## Estratégia de implementação

1. Ajustar o filtro em `categories.ts`, acrescentando a cláusula de resgate para categorias com `tipo` e `conta_id` nulos quando a conta ativa for pessoal e pertencer ao dono.
2. Aplicar a mesma cláusula ao filtro duplicado em `expenses.ts`, mantendo os dois com o mesmo comportamento.
3. Comentar no código por que a cláusula existe, referenciando a paridade com `accountFilter.ts`.
4. Validar com `tsc --noEmit`, `vite build` e a suíte do backend.

## Regras de negócio identificadas

- Categoria PADRÃO: `tipo` preenchido, `conta_id` nulo — global por tipo de conta.
- Categoria CUSTOM: `conta_id` preenchido, `tipo` nulo — exclusiva de uma conta.
- Categoria ÓRFÃ (o caso deste plano): ambos nulos — criada antes do modelo atual.
- Órfã deve ser tratada como pertencente à conta pessoal do dono, que é exatamente o tratamento que despesas e receitas órfãs já recebem.
- Categorias de conta empresa não podem vazar para conta pessoal, nem o contrário.

## Regras multi-tenant e segurança

O projeto não é multi-tenant por organização: o isolamento é por `usuario_id`, e ele permanece intacto — a cláusula nova é adicional ao `WHERE c.usuario_id = $1`, nunca substitutiva.

A cláusula de resgate exige que a conta ativa seja do tipo pessoal E pertença ao mesmo `usuario_id`, seguindo o padrão já validado em `accountFilter.ts`. Não há caminho para uma categoria de um usuário aparecer para outro.

## Validações necessárias

Nenhuma validação de input nova: as rotas alteradas são de leitura e já validam `conta_id` contra o `usuario_id` antes de usar.

## Testes necessários

### Frontend

Não há suíte de teste de componente no projeto. Verificação manual: abrir uma despesa anterior a abril, conferir que a categoria exibida na lista agora também aparece no select.

### Backend

Suíte existente deve continuar passando (23 testes). Nenhum teste novo previsto — o projeto não tem teste de integração com banco para estas rotas.

### E2E

Não aplicável — projeto não tem E2E configurado.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
cd backend && npm run build && npm test
```

Observação: `src/screens/despesas/DespesasScreen.tsx:727` tem um erro de tipo pré-existente, não relacionado a esta alteração.

## Riscos e pontos de atenção

- **Baixo e reversível:** a alteração é somente de leitura. Reverter o deploy desfaz o efeito. Nenhum dado é tocado.
- **Efeito colateral esperado:** as categorias órfãs passam a aparecer em contas pessoais. Se o usuário tiver mais de uma conta pessoal, aparecem em todas — o mesmo comportamento que as despesas órfãs já têm hoje.
- **Atenção:** a correção trata o sintoma. A causa de origem (categorias sem classificação) só desaparece rodando a `0018b`, que está fora do escopo por alterar o banco.

## Perguntas em aberto

- Quais meses exatamente tiveram despesas e receitas sumidas? Necessário para a investigação seguinte, que é separada deste plano.
- O usuário tem mais de uma conta pessoal? Se tiver, as categorias órfãs aparecerão em todas elas.

## Critérios de aceite do plano

- As categorias exibidas em despesas anteriores a abril voltam a aparecer no select de categorias.
- Categorias de conta empresa não aparecem em conta pessoal, nem o contrário.
- O isolamento por `usuario_id` permanece intacto.
- Nenhum dado foi alterado no banco.
- Os dois endpoints ficam com o mesmo comportamento de filtro.
- `tsc --noEmit`, `vite build` e os 23 testes do backend passam.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations, em especial a `0018b` — está fora do escopo.
- Não executar nenhum `UPDATE` ou `DELETE` no banco.
- Espelhar a cláusula de resgate de `accountFilter.ts`, sem inventar variação.
- Corrigir os dois endpoints, não apenas o usado pelo frontend.
- Não alterar rotas de escrita de categorias.
- Não alterar `.env`.
