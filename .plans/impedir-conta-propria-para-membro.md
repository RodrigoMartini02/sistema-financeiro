# Plano de Implementação: Impedir criação de conta/categorias próprias para membro vinculado

## Origem
- Origem: incidente real investigado em conversa (categorias duplicadas na conta da Mirian após "Limpar dados") — sem arquivo `.md` de especificação
- Data do planejamento: 2026-09-16
- Classificação: **backend-only**

## Resumo
`ensureUserHasAccount` (chamada em todo `GET /auth/verify`) e `DELETE /users/:id/clear-data` criam uma conta "Pessoal" própria + categorias padrão soltas (`conta_id = NULL`) para qualquer `userId`, sem checar se ele já é membro vinculado ativo (`conta_membros`) de uma conta de outra pessoa. Um membro nunca deveria ter conta/catálogo próprio — ele só enxerga o da conta a que está vinculado (`resolveAccountOwnerId`, já corrigido anteriormente para categorias). Isso foi a causa raiz do incidente de duplicação resolvido nesta conversa.

## Escopo

### Dentro do escopo
- `backend/src/services/accountBackfill.ts` (`ensureUserHasAccount`): pular criação de conta+categorias quando o `userId` for membro vinculado ativo.
- `backend/src/routes/users.ts` (`DELETE /:id/clear-data`): pular a recriação de categorias padrão (`ensureDefaultCategories`) quando o `userId` for membro vinculado ativo — o reset de dados dele continua limpando despesas/receitas/reservas/meses/cartões próprios, só não recria catálogo.
- `backend/src/routes/auth.ts` (registro de usuário novo): adicionar a mesma checagem por consistência/defesa em profundidade, mesmo sendo um caso que não deveria ocorrer na prática (usuário recém-criado nunca é membro de ninguém ainda).
- Novo helper `isActiveFamilyMember(userId)` em `backend/src/utils/familyVisibility.ts`, reaproveitando a query já usada em `accounts.ts:18-21`, em vez de duplicá-la nos 3 pontos.
- Diagnóstico (somente leitura, sem alterar nada): query contra todos os membros vinculados ativos do sistema, buscando categorias com `conta_id = NULL` e/ou contas próprias (`accounts.userId = membro`) que não deveriam existir — para decidir, depois de ver o resultado, se algum outro caso precisa da mesma limpeza manual feita para a Mirian.

### Fora do escopo
- Limpeza de dados retroativa automática — o diagnóstico só relata; qualquer limpeza adicional encontrada será tratada como uma decisão pontual separada, do mesmo jeito que foi feito para a Mirian nesta conversa.
- Mudança de comportamento para usuários que não são membros (dono normal) — fluxo continua idêntico.
- Qualquer alteração de `.env`, migration de schema ou execução de comando destrutivo.

## Leitura de contexto
- `sistema financas/AGENT.md` — já lido nesta sessão (sem mudanças desde a leitura anterior, confirmado via `git log`). Único AGENT.md do projeto; sem `frontend/AGENT.md`/`backend/AGENT.md` dedicados. Aplicados os mesmos princípios transferíveis já usados no plano anterior (Drizzle-first, escopo de dado explícito, validar no backend, nomes claros, sem `any`, sem `catch` silencioso).
- `CLAUDE.md` da raiz — mesmo fluxo `/planejar → aprovação → /implementar → /finalizar`, sem PR.
- Arquivos investigados nesta sessão: `backend/src/services/accountBackfill.ts`, `backend/src/routes/auth.ts` (linhas 190-215 e 255-280), `backend/src/routes/users.ts` (linhas 660-694), `backend/src/routes/accounts.ts` (linhas 1-46, padrão de checagem de membro), `backend/src/utils/familyVisibility.ts` (já conhecido do plano anterior).

## Impacto por área

### Frontend
`Sem impacto esperado` — nenhuma tela ou chamada de API muda de contrato; o comportamento correto passa a ser "membro não ganha conta/categorias soltas", que é invisível para a UI (ela já não deveria mostrar isso).

### Backend
- **`backend/src/utils/familyVisibility.ts`**: adicionar `isActiveFamilyMember(userId: number): Promise<boolean>` — verifica `conta_membros WHERE usuario_id = $1 AND status = 'ativo'`, reaproveitando a mesma query já usada em `accounts.ts:18-21`.
- **`backend/src/services/accountBackfill.ts`** (`ensureUserHasAccount`): antes de criar a conta "Pessoal" + categorias padrão, checar `isActiveFamilyMember(userId)`; se verdadeiro, retornar `{ created: false }` sem criar nada.
- **`backend/src/routes/users.ts`** (`clear-data`): antes de `ensureDefaultCategories(userId, 'pessoal')`, checar `isActiveFamilyMember(userId)`; se verdadeiro, pular essa chamada (o reset das próprias despesas/receitas/reservas/meses/cartões do membro continua acontecendo normalmente).
- **`backend/src/routes/auth.ts`** (registro): mesma checagem antes de `ensureDefaultCategories`/criação de conta padrão, como defesa em profundidade (não deve disparar na prática).
- Diagnóstico (script pontual, não vira código de produção): listar membros vinculados ativos que têm `accounts.userId = seu id` e/ou categorias com `conta_id = NULL` — roda uma vez durante a implementação, não fica no repositório como rota ou comando permanente, a menos que você prefira o contrário.

### Banco de dados
`Sem impacto esperado` — nenhuma migration de schema. Nenhum dado será alterado sem que você veja o resultado do diagnóstico primeiro e aprove explicitamente uma limpeza pontual (mesmo fluxo desta conversa).

### Infra/Deploy
`Sem impacto esperado`.

## Arquivos provavelmente afetados
- `backend/src/utils/familyVisibility.ts`
- `backend/src/services/accountBackfill.ts`
- `backend/src/routes/users.ts`
- `backend/src/routes/auth.ts`

## Estratégia de implementação
1. Adicionar `isActiveFamilyMember` em `familyVisibility.ts`.
2. Aplicar a checagem em `ensureUserHasAccount` (`accountBackfill.ts`).
3. Aplicar a checagem em `clear-data` (`users.ts`).
4. Aplicar a checagem no registro (`auth.ts`), por consistência.
5. Rodar o diagnóstico somente leitura contra todos os membros vinculados ativos do banco de produção (autorização já dada nesta sessão para leituras de diagnóstico; confirmar antes de qualquer escrita adicional, como já é praxe).
6. Reportar o resultado do diagnóstico; se houver outros casos, tratá-los como decisão pontual separada (não incluída automaticamente nesta implementação).
7. Rodar build/typecheck do backend.

## Regras de negócio identificadas
- Membro vinculado ativo (`conta_membros.status = 'ativo'`) nunca deve ter conta própria (`accounts.userId = seu id`) nem categorias soltas (`conta_id = NULL`) — ele opera inteiramente dentro da conta do gestor ao qual está vinculado.
- Reset de dados (`clear-data`) de um membro continua limpando os dados que são dele por autoria (despesas, receitas, etc.), só não deve recriar catálogo próprio.

## Regras multi-tenant e segurança
- A checagem de "é membro" deve vir sempre do banco (`conta_membros`), nunca de informação enviada pelo client.
- Nenhuma mudança nesta correção amplia acesso a dados de terceiros — é estritamente uma correção de "não criar dado onde não deveria".

## Validações necessárias
- Confirmar que `isActiveFamilyMember` retorna `false` corretamente para um dono normal (sem vínculo nenhum) e `true` para o membro real (usuário 15) usado no incidente.

## Testes necessários

### Backend
- Sem teste automatizado novo, seguindo a mesma decisão já tomada no plano anterior (projeto não tem padrão de mock de banco) — validação manual/funcional direta, como já foi feito para a correção de categorias.

### Frontend
`Sem impacto esperado`.

### E2E
`Sem impacto esperado`.

## Comandos de validação sugeridos
```bash
npm --prefix "sistema financas/backend" run build
npm --prefix "sistema financas/backend" test
```

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

## Riscos e pontos de atenção
- `ensureUserHasAccount` é chamada com alta frequência (todo `/auth/verify`) — qualquer erro na checagem nova pode impactar login/sessão de todos os usuários; validar cuidadosamente que donos normais continuam funcionando sem regressão.
- Banco atual é produção — qualquer escrita do diagnóstico (se encontrar outros casos) exige nova aprovação explícita, não incluída automaticamente nesta implementação.

## Perguntas em aberto
Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano
- Membro vinculado ativo nunca mais recebe conta própria nem categorias soltas via `/auth/verify`, `clear-data` ou registro.
- Dono normal (sem vínculo de família) continua com comportamento idêntico ao atual.
- Diagnóstico rodado e reportado antes de fechar a implementação.

## Observações para a skill implementar
- Usar este plano como fonte principal de contexto.
- Rodar o diagnóstico como leitura pontual, sem criar rota/comando permanente no código, a menos que seja pedido.
- Se o diagnóstico encontrar outros membros afetados, reportar e aguardar decisão explícita antes de qualquer limpeza — não assumir a mesma estratégia da Mirian automaticamente.
- Seguir o AGENT.md da raiz nos princípios transferíveis já aplicados no plano anterior.
