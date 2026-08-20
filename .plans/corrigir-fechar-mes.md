# Plano de Implementação: Corrigir botão "Fechar mês"

## Origem

- Arquivo de especificação: pedido direto do usuário no chat, seguido de investigação read-only (subagente Explore) no fluxo completo frontend → backend → banco
- Data do planejamento: 2026-08-20
- Classificação: `backend + database` (com ajuste leve de frontend)

## Resumo

**Atualização pós-diagnóstico (2026-08-20):** a causa raiz suspeitada originalmente (constraint UNIQUE ausente em `meses`) foi **descartada** após diagnóstico real no banco de produção (autorizado explicitamente pelo usuário). A constraint `meses_usuario_ano_mes_perfil_unique` já existe e é compatível com o `ON CONFLICT` usado em `POST /:ano/:mes/fechar`; não há linhas duplicadas; a tabela já tem 46 registros, 39 deles com `fechado = true`, distribuídos em 3 perfis diferentes do usuário — ou seja, **o fechamento de mês já funciona e persiste corretamente no banco**.

A causa raiz real é outra: o frontend (`MovimentacoesScreen.tsx:152-160` e `DespesasScreen.tsx:212-220`) consulta `GET /api/meses?perfil_id=X` para saber o status `fechado` de cada mês (`mesStatusQuery`), mas essa rota **nunca foi implementada** no backend — `backend/src/routes/months.ts` só define `/:ano/:mes/saldo`, `/:ano/:mes/fechar` e `/:ano/:mes/reabrir`. Toda chamada a `GET /api/meses` retorna 404, o que faz `apiRequest` lançar erro e `mesStatusQuery.data` nunca ser preenchido — então `mesFechado` fica sempre `false`, e o botão sempre exibe "Fechar mês" (nunca "Reabrir mês"), mesmo quando o `POST /fechar` teve sucesso. É por isso que a ação "parece" não funcionar: ela funciona, mas a tela nunca reflete o resultado.

## Escopo

### Dentro do escopo

- ~~Diagnóstico no banco real~~ — já realizado; constraint confirmada existente, sem duplicatas (ver Resumo)
- Implementar a rota `GET /api/meses` (lista de status por mês, com filtro opcional de `perfil_id`) que o frontend já espera e nunca existiu no backend
- Adicionar tratamento de erro visível (`onError`) em `fecharMut` e `reabrirMut` no frontend, para que qualquer falha futura apareça como mensagem clara ao usuário, em vez de o botão "parecer" não fazer nada
- Melhorar o log de erro no backend (`months.ts`, rota `/fechar`) para incluir o código/detalhe do erro Postgres, sem vazar informação sensível na resposta ao cliente

### Fora do escopo

- Qualquer mudança na lógica de cálculo de saldo (`calculateBalanceBreakdown`, `calculateFinalBalance`) — permanece igual
- Qualquer migration de schema — não é mais necessária, já que a constraint já existe
- Mudanças no endpoint `/reabrir` além do `onError` no frontend
- Qualquer alteração em outras tabelas além de `meses`

## Leitura de contexto

- `/CLAUDE.md` e `/AGENT.md` (raiz do projeto "sistema financas") — regra explícita de nunca executar migrations sem confirmação explícita, ambiente pode estar apontando para produção
- `backend/src/routes/months.ts` (lido integralmente — rotas `/saldo`, `/fechar`, `/reabrir`; confirmado que não existia `GET /`)
- `backend/src/db/schema/months.ts` (lido integralmente)
- `.env` (raiz do monorepo `Particular/`, fora de `sistema financas/`) — confirmado que `DATABASE_URL` aponta para um Postgres gerenciado no Render, não um banco local
- Diagnóstico real executado no banco (autorizado explicitamente pelo usuário): `pg_constraint`/`pg_indexes` da tabela `meses` (constraint já existe), verificação de duplicatas (nenhuma encontrada), schema de colunas (bate com o Drizzle), contagem de linhas fechadas/abertas por perfil (39 fechadas, 7 abertas, 3 perfis)
- `src/screens/finance/MovimentacoesScreen.tsx` (lido: linhas 143-182 — `mesStatusQuery`, `fecharMut`/`reabrirMut`, sem `onError`)
- `src/screens/despesas/DespesasScreen.tsx` (lido: linhas 210-221 — mesmo padrão de `mesStatusQuery` chamando `GET /meses`)
- `src/services/apiClient.ts` (lido: `apiRequest`, confirmado que uma resposta não-OK como 404 lança exceção, explicando por que `mesStatusQuery.data` nunca é preenchido)
- `frontend/AGENT.md` e `backend/AGENT.md` dedicados: não existem como arquivos separados neste projeto; só o `AGENT.md` da raiz, genérico e voltado a um contexto multi-tenant/prefeitura não totalmente aplicável aqui

## Impacto por área

### Frontend

- `MovimentacoesScreen.tsx`: `fecharMut` (linhas 163-172) e `reabrirMut` (linhas 173-182) ganham `onError` exibindo mensagem de erro visível (toast ou equivalente ao padrão já usado em outras mutations do projeto, ex. `mutError` em `PerfisTab.tsx`)
- Sem mudança de UI além do feedback de erro

### Backend

- `backend/src/routes/months.ts`: nova rota `GET /` — lista `{ ano, mes, fechado }[]` filtrando por `usuario_id` da sessão e, opcionalmente, `perfil_id` da query string (mesmo padrão `profileWhere` já usado em `/reabrir`)
- `backend/src/routes/months.ts`: rota `POST /:ano/:mes/fechar` — melhorar captura/log do erro para incluir código do erro Postgres (ex. `error.code`) no log do servidor, mantendo a mensagem ao cliente genérica e segura
- Nenhuma mudança na lógica de negócio de `/fechar`/`/reabrir`/`/saldo`

### Banco de dados

Sem impacto — a constraint já existe e a correção é 100% de rota/endpoint ausente, não de schema. Nenhuma migration necessária.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `backend/src/routes/months.ts`
- `backend/src/db/schema/months.ts` (se a migration for necessária)
- `backend/drizzle/` (novo arquivo de migration, se necessário)
- `src/screens/finance/MovimentacoesScreen.tsx`

## Estratégia de implementação

1. ~~Diagnóstico no banco~~ — concluído; causa raiz real confirmada (rota `GET /api/meses` ausente)
2. Implementar `router.get('/', authenticate, ...)` em `backend/src/routes/months.ts`, retornando `{ success: true, data: [{ ano, mes, fechado }, ...] }` filtrado por `usuario_id` e `perfil_id` opcional (reaproveitando `profileWhere`)
3. Adicionar `onError` em `fecharMut` e `reabrirMut`, seguindo o padrão de exibição de erro já usado em outras telas do projeto (ex. `mutError` em `PerfisTab.tsx`)
4. Melhorar o `catch` de `POST /:ano/:mes/fechar` para logar `error.code`/`error.detail` (Postgres) no servidor, sem alterar a mensagem genérica retornada ao cliente
5. Rodar `npx tsc --noEmit`/`npx vite build` (frontend) e `npm run build` (backend)
6. Testar: com o backend local apontado para o banco real (autorizado), confirmar que a nova rota retorna os dados esperados; pedir ao usuário para validar na UI real que o botão "Fechar mês" agora alterna corretamente para "Reabrir mês" após o clique, e vice-versa

## Regras de negócio identificadas

- Fechar um mês trava novos lançamentos/pagamentos no período (mensagem já existente em `firstAccessGuideMessages.despesasFecharMes`) — comportamento de negócio não muda, só a confiabilidade técnica de a UI refletir o estado real
- Cada combinação `(usuario_id, ano, mes, perfil_id)` deve ter no máximo um registro em `meses` — já garantido pela constraint existente

## Regras multi-tenant e segurança

Não aplicável no sentido multi-prefeitura do `AGENT.md` genérico — este é um projeto single-tenant por usuário autenticado. O cuidado real aqui é: toda operação de banco (diagnóstico e eventual migration) deve ser confirmada explicitamente antes de rodar, pois o ambiente pode estar apontando para produção, conforme regra do `CLAUDE.md`.

## Validações necessárias

Nenhuma validação de formulário nova. A validação necessária é de infraestrutura (constraint de banco).

## Testes necessários

### Backend

- `GET /api/meses` sem `perfil_id`: retorna todos os meses do usuário autenticado
- `GET /api/meses?perfil_id=X`: retorna apenas os meses daquele perfil (ou do perfil pessoal implícito, conforme `profileWhere`)
- Confirmar que a rota nova não quebra `POST /fechar`/`POST /reabrir` (sem alteração nelas além do log de erro)

### Frontend

- Clicar em "Fechar mês": confirmar que o botão muda para "Reabrir mês" após sucesso
- Simular uma falha (ex. desconectar rede momentaneamente) e confirmar que uma mensagem de erro aparece, em vez do botão "não fazer nada"

### E2E

Não aplicável inicialmente.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build

npm --prefix backend run typecheck
npm --prefix backend run build
```

## Riscos e pontos de atenção

- Risco baixo — a correção é aditiva (nova rota `GET /`) e não altera nenhuma rota/lógica existente além de logging
- A nova rota `GET /` precisa ser registrada antes de `/:ano/:mes/saldo` na ordem do arquivo para evitar qualquer ambiguidade de matching de rota no Express (embora `/` e `/:ano/:mes/saldo` não colidam de fato, manter a ordem clara)
- Mudança em `onError` das mutations é de baixo risco e reversível

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — causa raiz confirmada via diagnóstico real no banco.

## Critérios de aceite do plano

- `GET /api/meses` (com ou sem `perfil_id`) responde 200 com a lista de status por mês
- Botão "Fechar mês" funciona de ponta a ponta: fecha o mês, trava lançamentos do período (comportamento já existente), e a UI alterna corretamente para "Reabrir mês" logo após o clique
- Botão "Reabrir mês" continua funcionando e a UI volta a exibir "Fechar mês"
- Qualquer erro futuro nesse fluxo aparece como mensagem visível ao usuário, não mais silencioso
- `npx tsc --noEmit`, `npx vite build` e `npm --prefix backend run build` passam sem erros

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Diagnóstico já concluído — não é necessário rodar novas queries no banco além de testes pontuais de leitura, se úteis para validar a rota nova
- Nenhuma migration é necessária neste plano
- Ao finalizar localmente, perguntar ao usuário se deseja seguir para `/finalizar`
