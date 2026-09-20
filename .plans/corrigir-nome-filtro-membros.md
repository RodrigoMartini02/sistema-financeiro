# Plano de Implementação: Corrigir bug crítico no filtro de Membros por divergência de nome entre fontes

## Origem

- Arquivo de especificação: nenhum (originado de bug relatado com prints na conversa)
- Data do planejamento: 2026-09-20
- Classificação: `fullstack`

## Resumo

Corrigir um bug real que torna a tela de Despesas/Receitas aparentemente vazia mesmo com dados existentes: o filtro de "Membros" busca o nome do próprio usuário via `GET /users/me`, que retorna `usuarios.nome` puro (nome de login, ex: "RODRIGO MARTINI"), enquanto os lançamentos (`autorNome`) usam `COALESCE(contas.nome, usuarios.nome)` (nome editado na conta, ex: "Rodrigo Martini"). A comparação de string exata nunca bate, escondendo tudo. Corrigido adicionando um campo novo `nomeExibicao` em `GET /users/me` (mesmo `COALESCE` já usado em despesas/receitas), sem tocar no campo `nome` existente — evitando o efeito colateral de sobrescrever o nome de login ao trocar senha (consumidor identificado em `ContasTab.tsx`).

## Escopo

### Dentro do escopo

- `backend/src/routes/users.ts`, rota `GET /me`: adicionar campo `nomeExibicao` à resposta, resolvido via SQL raw pontual com `LEFT JOIN contas` e `COALESCE(conta.nome, usuarios.nome)` — mesmo padrão já usado em `expenses.ts`/`incomes.ts`.
- `src/services/usuariosService.ts`: adicionar `nomeExibicao?: string` à interface `UsuarioMe`.
- `src/screens/despesas/DespesasScreen.tsx`: usar `meQ.data?.nomeExibicao ?? meQ.data?.nome` em vez de `meQ.data?.nome` (rótulo da opção no painel + montagem de `nomesVisiveis`).
- `src/screens/receitas/ReceitasScreen.tsx`: mesma troca.

### Fora do escopo

- `ContasTab.tsx`/fluxo de troca de senha — não tocado; campo `nome` de `GET /users/me` permanece intocado.
- Normalização de dados existentes em `usuarios.nome` (ex: capitalização).
- Mudança na lógica de `COALESCE` já existente em `expenses.ts`/`incomes.ts`.
- `GET /account-members` — nomes dos outros membros já vêm corretos dessa rota.

## Leitura de contexto

- `/AGENT.md` (raiz do monorepo).
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados neste projeto.
- Investigação nesta sessão: consulta real ao banco confirmando a divergência de nome (`usuarios.nome` = "RODRIGO MARTINI", `contas.nome` = "Rodrigo Martini", `autor_nome` de despesas = "Rodrigo Martini"); `backend/src/routes/expenses.ts:217` (padrão `COALESCE` de referência); `backend/src/routes/users.ts:15-49` (rota `GET /me` atual, via Drizzle query builder); `backend/src/db/schema/accounts.ts` (schema de `contas`, campo `name`/`isDefault`); `src/screens/config/ContasTab.tsx:1113-1122` (consumidor que reenvia `nome` em `PUT /users/me` ao trocar senha — motivo de não tocar no campo existente).

## Impacto por área

### Frontend

- `src/services/usuariosService.ts`: `UsuarioMe.nomeExibicao?: string` adicionado.
- `src/screens/despesas/DespesasScreen.tsx` e `src/screens/receitas/ReceitasScreen.tsx`: toda referência usada para (a) montar a opção do próprio usuário no grupo "Membros" e (b) resolver `nomesVisiveis` passa a usar `meQ.data?.nomeExibicao ?? meQ.data?.nome` em vez de só `meQ.data?.nome`.
- Sem mudança de query keys (mesma `['usuario-me']` já usada) — só o shape do dado retornado ganha um campo novo.

### Backend

- `backend/src/routes/users.ts`, rota `GET /me`: query trocada de Drizzle query builder para SQL raw pontual (via `pool`, já importado), com `LEFT JOIN contas conta_padrao ON conta_padrao.usuario_id = usuarios.id AND conta_padrao.eh_padrao = true` e `COALESCE(conta_padrao.nome, usuarios.nome) AS nome_exibicao` adicionado ao SELECT existente. Nenhuma outra coluna/comportamento muda.
- Sem mudança de permissões, validação ou schema Drizzle.

### Banco de dados

`Sem impacto esperado` — nenhuma alteração de schema, tabela ou coluna.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. (Não aplicável aqui — este plano não gera migration.)

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/routes/users.ts`
- `src/services/usuariosService.ts`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`

## Estratégia de implementação

1. Em `backend/src/routes/users.ts`, reescrever a query da rota `GET /me` usando `pool.query` com SQL raw (`SELECT u.*, COALESCE(c.nome, u.nome) AS nome_exibicao FROM usuarios u LEFT JOIN contas c ON c.usuario_id = u.id AND c.eh_padrao = true WHERE u.id = $1`), mapeando explicitamente as colunas para o mesmo shape de resposta já usado (incluindo o novo campo `nomeExibicao`).
2. Em `src/services/usuariosService.ts`, adicionar `nomeExibicao?: string` à interface `UsuarioMe`.
3. Em `DespesasScreen.tsx`, localizar as ocorrências de `meQ.data?.nome`/`meQ.data.nome` usadas no filtro (montagem da opção do grupo "Membros" e resolução de `nomesVisiveis`) e trocar para `meQ.data?.nomeExibicao ?? meQ.data?.nome`.
4. Repetir o passo 3 em `ReceitasScreen.tsx`.
5. Rodar build (`tsc --noEmit` backend e frontend, `vite build`) e validar via consulta direta ao banco que `GET /users/me` retorna `nomeExibicao: "Rodrigo Martini"` para o usuário 1.
6. Testar visualmente: marcar o próprio usuário no filtro de Despesas/Receitas deve voltar a exibir os lançamentos existentes.

## Regras de negócio identificadas

- O "nome de exibição" de um usuário em qualquer lista de lançamentos/filtros deve priorizar o nome cadastrado na conta pessoal (`contas.nome`, `eh_padrao=true`) sobre o nome de cadastro/login (`usuarios.nome`) — regra já estabelecida em `expenses.ts`/`incomes.ts`, agora replicada para o próprio usuário logado no contexto do filtro.
- O nome de login (`usuarios.nome`) nunca deve ser sobrescrito implicitamente por uma ação que não seja a edição explícita do perfil de login.

## Regras multi-tenant e segurança

`Sem impacto esperado` — mudança aditiva (novo campo) numa rota já autenticada (`authenticate`), sem alterar autorização, filtro de propriedade ou dados expostos a terceiros.

## Validações necessárias

- Confirmar que a query SQL raw nova filtra corretamente por `req.user!.id` (equivalente ao `where(eq(users.id, req.user!.id))` atual).
- Confirmar que o mapeamento de colunas da query raw preserva exatamente os mesmos nomes de campo já usados pelo frontend (`nome`, `email`, `documento`, `pais`, `estado`, `cidade`, `telefone`, `data_nascimento`, `tipo`, `status`, `plano_status`, `plano_tipo`, `plano_expiracao`, `data_cadastro`), sem quebrar nenhum consumidor existente.

## Testes necessários

### Frontend

- Marcar só o próprio usuário no filtro de Membros (Despesas e Receitas): lançamentos aparecem normalmente.
- Marcar o próprio usuário + outro membro: união aparece corretamente.
- Fluxo de troca de senha em `ContasTab.tsx` continua funcionando sem alterar `usuarios.nome`.

### Backend

- `GET /api/users/me` retorna `nomeExibicao` igual ao `autor_nome` já usado em `GET /api/expenses`/`GET /api/incomes` para o mesmo usuário.

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
cd backend && NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Baixo risco: mudança aditiva no backend (campo novo), e troca de fonte de leitura pontual no frontend (2 arquivos, mesma variável já em uso).
- Atenção ao converter a query de Drizzle para SQL raw: preservar exatamente o mesmo shape de resposta para não quebrar os outros 11 consumidores de `fetchMe()`/`GET /users/me` que não usam `nomeExibicao`.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- `GET /api/users/me` retorna `nomeExibicao` com o mesmo valor que `autor_nome` das despesas/receitas do usuário.
- Filtro de Membros em Despesas/Receitas volta a exibir dados corretamente com o próprio usuário marcado.
- Nenhum outro consumidor de `fetchMe()` quebra (build passa, `ContasTab.tsx` continua funcionando).
- Build (`tsc --noEmit` backend e frontend, `vite build`) passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não tocar em `ContasTab.tsx` nem no fluxo de troca de senha.
- Não normalizar dados existentes em `usuarios.nome`.
- Não executar migrations (não há nenhuma neste plano).
