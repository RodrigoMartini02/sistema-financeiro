# Plano de Implementação: Renomear papéis de usuário (gestor/padrao → titular/membro) e remover heranças

## Origem

- Arquivo de especificação: discussão direta em conversa (sem arquivo `.md` de feature — levantamento e decisões feitos interativamente)
- Data do planejamento: 2026-09-20
- Classificação: `backend + database` (impacto pontual no frontend: 1 arquivo de comparação ativo + remoção de 1 arquivo órfão)

## Resumo

O sistema usa hoje três valores para `usuarios.tipo`: `'gestor'`, `'padrao'`, `'admin'`. Essa nomenclatura mistura duas dimensões diferentes: papel de *plataforma* (admin = dono do sistema) e papel *dentro de uma conta* (gestor = dono da conta, padrao = membro vinculado ou usuário independente). O nome `padrao` é ambíguo — cobre tanto "membro real vinculado a uma conta" quanto "usuário que se cadastrou sozinho e é dono da própria conta".

Este plano renomeia os valores para deixar a nomenclatura precisa:
- `'gestor'` → `'titular'` (dono de uma conta)
- `'padrao'` → `'membro'` (vinculado à conta de um titular)
- `'admin'` permanece `'admin'` (backoffice da plataforma, dimensão separada)

Também corrige uma inconsistência descoberta durante a investigação: o CHECK constraint real de produção (`usuarios_tipo_check`) está desatualizado e hoje só permite `('padrao', 'admin', 'master')` — **não permite `'gestor'`**, valor usado ativamente em todo o código. Isso nunca gerou erro porque, na prática, nenhum usuário com `tipo = 'gestor'` foi inserido no banco (confirmado por consulta direta): o único usuário titular do sistema tem `tipo = 'admin'`, que já passa em todas as checagens de `requireGestor`. O valor legado `'master'` (de uma migração de papéis anterior, `0027_redefinir_papeis_usuarios.sql`) também será removido do constraint.

Por fim, remove-se a tela órfã `UsuariosTab.tsx` (não importada em nenhum lugar do frontend atual).

## Escopo

### Dentro do escopo

- Migration de dados: `UPDATE usuarios SET tipo = 'membro' WHERE tipo = 'padrao'` (afeta 1 linha na produção atual).
- Recriar o CHECK constraint `usuarios_tipo_check` com exatamente `('membro', 'titular', 'admin')`, removendo `'master'` e adicionando `'titular'` (que hoje nem consta).
- Atualizar `DEFAULT` da coluna `tipo` de `'gestor'` para `'titular'`.
- Backend: atualizar todo ponto que lê/escreve `'gestor'`/`'padrao'` como literal de `usuarios.tipo` (schema Drizzle, middleware de auth, rotas de registro/login/criação de membro/administração de usuários).
- Renomear `requireGestor` → `requireTitular` (e seus usos).
- Atualizar mocks de teste (`plan-access.test.ts`) que usam `'padrao'` como valor de `userType`.
- Frontend: atualizar `ConfigPanel.tsx` (única comparação ativa: `meTipo === 'gestor'` → `meTipo === 'titular'`).
- Remover `src/screens/config/UsuariosTab.tsx` (código morto, não importado em lugar nenhum).
- Definir e implementar uma estratégia de invalidação de sessão (forçar logout geral no deploy), já que tokens JWT já emitidos carregam o valor antigo (`'gestor'`/`'padrao'`) codificado e teriam validade de até 7 dias contra um backend que já espera os novos valores.

### Fora do escopo

- `contas.tipo` (`'pessoal'`/`'empresa'`) — não é afetado, é uma dimensão diferente (tipo de conta, não papel de usuário).
- Sentinela de UI local `'gestor'` em `ContasTab.tsx` (linhas ~129, 132, 163 — select de "transferir pendências para"). É uma string desacoplada do banco (nunca enviada como valor de `usuarios.tipo`), puramente cosmética. Pode ser tratada depois por consistência de glossário, mas não bloqueia nem faz parte desta migração.
- Aliases de resposta `gestor_users`/`standard_users` em `GET /api/users/stats/general` — sem consumidor frontend confirmado; não serão renomeados neste plano (ver Perguntas em aberto).
- O plano de "visibilidade de lançamentos por padrão" discutido anteriormente na mesma conversa — assunto independente, tratado à parte.
- As rotas backend `requireAdmin` de administração de usuários (`users.ts`) — permanecem ativas mesmo com a remoção da tela órfã que as consumia.

## Leitura de contexto

- `/AGENT.md` (raiz do monorepo)
- `backend/AGENT.md`, `frontend/AGENT.md` — não existem como arquivos dedicados neste projeto; seguido apenas o `/AGENT.md` da raiz
- Levantamento por agentes Explore nesta conversa: mapeamento de tipos de usuário/conta, heranças de nomenclatura (migration `0027_redefinir_papeis_usuarios.sql`, rename `perfis`→`contas` na `0024`), e superfície completa de ocorrências de `'gestor'`/`'padrao'` no código
- Consulta direta (somente leitura) ao banco de produção: confirmação do CHECK constraint real (`usuarios_tipo_check`) e da distribuição atual de dados (2 usuários: id 1 `admin`, id 15 `padrao`, ambos `status = 'ativo'`; nenhum `conta_membros` além do vínculo do id 15 à conta 17)

## Impacto por área

### Frontend

- `src/layout/ConfigPanel.tsx:78` — `const isGestor = meTipo === 'gestor' || isAdmin;` passa a `meTipo === 'titular' || isAdmin`. Nome da variável local `isGestor` pode ser mantido (é só um identificador React, não afeta a migração) ou renomeado para `isTitular` por consistência — decisão de implementação, não bloqueia o plano.
- `src/screens/config/UsuariosTab.tsx` — remoção completa do arquivo. Confirmado sem imports em nenhum outro lugar do projeto.
- Nenhum outro ponto ativo do frontend compara literalmente `usuarios.tipo` com `'gestor'`/`'padrao'` (confirmado por grep exaustivo). Estados de loading/error/empty não são afetados — não há nova tela nem novo fluxo assíncrono introduzido.
- Query keys, hooks e services não precisam de nova estrutura — é troca de valor de string em comparações já existentes.

### Backend

- `backend/src/db/schema/users.ts:21-23` — `.$type<'padrao' | 'gestor' | 'admin'>()` → `.$type<'membro' | 'titular' | 'admin'>()`; `.default('gestor')` → `.default('titular')`.
- `backend/src/middleware/auth.ts`:
  - Linhas 8-9 (`TokenPayload.type`/`tipo`): união de tipo TS atualizada.
  - Linha 42 (fallback de decodificação de JWT): `decoded.type ?? decoded.tipo ?? 'padrao'` → `?? 'membro'`.
  - Linha 60 (`requireGestor`): renomear para `requireTitular`; comparação `type !== 'gestor' && type !== 'admin'` → `type !== 'titular' && type !== 'admin'`.
  - Linha 69 (`requireAdmin`): sem alteração de valor (só compara `'admin'`), mas atualizar comentários/nome se fizer referência cruzada ao guard renomeado.
- `backend/src/routes/auth.ts:187` — `POST /register`: default `?? 'padrao'` → `?? 'titular'` (quem se cadastra sozinho é titular da própria conta, nunca membro por padrão).
- `backend/src/routes/accountMembers.ts:162` — `POST /account-members`: `type: 'padrao'` hardcoded → `type: 'membro'`.
- `backend/src/routes/users.ts`:
  - Linhas 283-284 (SQL raw de `GET /stats/general`): `WHEN tipo = 'padrao'` → `'membro'`, `WHEN tipo = 'gestor'` → `'titular'`.
  - Linha 354 (`POST /`, admin cria usuário): default do body `tipo = 'gestor'` → `tipo = 'titular'`.
  - Linha 391 (cast de tipo TS na inserção): união atualizada.
  - Linha 570 (`PUT /:id`, cast de tipo TS na atualização): união atualizada.
- `backend/src/services/plan-access.test.ts` (linhas 19, 31, 43, 54) — mocks `userType: 'padrao'` → `'membro'` (mantém o mesmo significado de teste: "usuário não-admin").
- Middleware de permissões (`permissions.ts`) — sem alteração de código; comentários de prosa podem ser atualizados por clareza, não é obrigatório.
- Serviços de plano (`plan-access.ts`, `plan-lifecycle.ts`) — sem alteração; usam apenas `=== 'admin'`, não afetados.
- Testes E2E/integração relacionados a login e criação de membro devem ser reexecutados após a mudança para confirmar que nenhum ponto ficou destoante.

### Banco de dados

Nova migration, ex. `backend/drizzle/0042_renomear_papeis_titular_membro.sql`:

```sql
-- 1. Atualiza dados existentes (afeta 1 linha na produção atual: usuário id 15)
UPDATE usuarios SET tipo = 'membro' WHERE tipo = 'padrao';

-- 2. Recria o CHECK constraint com o domínio correto (remove 'master', adiciona 'titular')
ALTER TABLE usuarios DROP CONSTRAINT usuarios_tipo_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_tipo_check
  CHECK (tipo IN ('membro', 'titular', 'admin'));

-- 3. Atualiza o default da coluna
ALTER TABLE usuarios ALTER COLUMN tipo SET DEFAULT 'titular';
```

**Atenção: esta migration não deve ser executada sem confirmação explícita do usuário — o ambiente atual aponta para produção (Render.com).**

Riscos de schema:
- Nenhuma outra tabela referencia `usuarios.tipo` como chave estrangeira ou depende do valor além das comparações de código já mapeadas — risco de cascata é baixo.
- O constraint anterior já estava incorreto (não permitia `'gestor'`, valor usado ativamente pelo código) — esta migration corrige uma falha pré-existente, não introduz uma nova.

### Infra/Deploy

- Estratégia de invalidação de sessão (forçar logout geral) precisa ser coordenada com o momento do deploy: se o código novo (que exige `'titular'`) subir antes que os usuários já logados sejam deslogados, `requireTitular` rejeitará tokens antigos que ainda carregam `'gestor'` — e vice-versa, se a migration rodar antes do deploy do código novo, o backend antigo (que ainda espera `'gestor'`) deixaria de reconhecer o usuário recém-migrado para `'titular'`.
- Opções técnicas para a invalidação (a decidir na implementação, já que envolve possivelmente `.env`/segredos, sujeito a confirmação explícita separada):
  - Trocar `JWT_SECRET` no deploy (invalida todos os tokens de uma vez, mais simples).
  - Introduzir um campo de versão/timestamp mínimo de emissão aceito pelo middleware.
- Recomendação: sequenciar deploy do backend + migration + invalidação de sessão o mais próximo possível no tempo, para minimizar a janela de inconsistência.

## Arquivos provavelmente afetados

- `backend/src/db/schema/users.ts`
- `backend/src/middleware/auth.ts`
- `backend/src/routes/auth.ts`
- `backend/src/routes/accountMembers.ts`
- `backend/src/routes/users.ts`
- `backend/src/services/plan-access.test.ts`
- `backend/drizzle/0042_renomear_papeis_titular_membro.sql` (nova, não executada nesta etapa)
- `src/layout/ConfigPanel.tsx`
- `src/screens/config/UsuariosTab.tsx` (removido)

## Estratégia de implementação

1. Atualizar `backend/src/db/schema/users.ts` (tipo TS e default da coluna).
2. Atualizar `backend/src/middleware/auth.ts` (tipo `TokenPayload`, fallback de decodificação, renomear `requireGestor` → `requireTitular`).
3. Atualizar `backend/src/routes/auth.ts`, `accountMembers.ts`, `users.ts` com os novos literais nos pontos mapeados.
4. Atualizar `backend/src/services/plan-access.test.ts`.
5. Atualizar `src/layout/ConfigPanel.tsx` no frontend.
6. Remover `src/screens/config/UsuariosTab.tsx`.
7. Escrever o arquivo da migration SQL em `backend/drizzle/` (sem executar).
8. Implementar a estratégia de invalidação de sessão escolhida.
9. Rodar builds (`tsc --noEmit` backend e frontend, `vite build`).
10. Buscar novamente por `'gestor'`/`'padrao'` como literais de `usuarios.tipo` em todo o código para confirmar que nada ficou destoante.
11. Produzir resumo final; pedir confirmação explícita antes de executar a migration em produção; coordenar com o usuário o momento do deploy e da invalidação de sessão.

## Regras de negócio identificadas

- `titular` é dono de uma ou mais contas (pessoal + N empresa); `admin` também passa em qualquer checagem de titular (bypass hierárquico mantido).
- `membro` é sempre vinculado a exatamente uma conta via `conta_membros`, sujeito a `membro_permissoes`.
- `admin` é uma dimensão de plataforma, ortogonal ao papel dentro de uma conta — um admin pode não ter conta nenhuma, ou ter contas como qualquer titular.
- Um usuário que se cadastra sozinho (sem ser convidado como membro) nasce `titular` da própria conta.

## Regras multi-tenant e segurança

- `usuarios.tipo` é usado em praticamente toda checagem de autorização do sistema — qualquer ponto não migrado corretamente pode causar bloqueio indevido (usuário legítimo barrado) ou vazamento de acesso (checagem que nunca mais bate com o valor real, caindo em um `else` permissivo). Validar exaustivamente após a implementação.
- A migration de dados é segura no estado atual (2 usuários, comportamento determinístico), mas o CHECK constraint deve ser criado ANTES ou DEPOIS do UPDATE de forma que nunca exista uma janela em que uma escrita concorrente insira um valor fora do novo domínio — a ordem proposta (UPDATE primeiro, depois DROP/ADD do constraint) evita erro de violação do constraint antigo durante o UPDATE.
- Nenhuma prevenção de vazamento entre contas é afetada por este plano — a lógica de `resolveVisibleUserIds`/`familyVisibility.ts` opera sobre `conta_membros`, não sobre o valor de `usuarios.tipo`.

## Validações necessárias

- Confirmar que nenhuma rota aceita `tipo`/`type` como texto livre do cliente sem restringir ao novo enum (`'membro' | 'titular' | 'admin'`).
- Validar que o cast de tipo TS em `users.ts` (rotas de admin) rejeita valores fora do novo domínio antes de chegar ao banco (evitar depender só do CHECK constraint para essa validação).

## Testes necessários

### Backend

- Login com o usuário `admin` (id 1) e com o usuário `membro` (id 15, pós-migração) — confirmar que ambos autenticam e que `requireTitular`/`requireAdmin` respondem corretamente.
- Registro de um novo usuário público — confirmar que nasce com `tipo = 'titular'`.
- Criação de um novo membro via `POST /account-members` — confirmar que nasce com `tipo = 'membro'`.
- `GET /api/users/stats/general` — confirmar que os contadores continuam corretos com os novos valores nas cláusulas `CASE WHEN`.
- Reexecutar `plan-access.test.ts` após atualizar os mocks.

### Frontend

- Login como titular (admin) — confirmar que `isGestor`/`isTitular` continua liberando a aba "Permissões" e os controles de gestão de conta em `ContasTab`.
- Login como membro — confirmar que os controles administrativos continuam ocultos.

### E2E

- Fluxo completo: deploy simulado localmente (migration + código novo) → login de ambos os usuários reais → confirmar que nenhuma tela quebra.

## Comandos de validação sugeridos

```bash
cd backend && NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- **Risco principal:** algum ponto não mapeado que ainda compare `'gestor'`/`'padrao'` quebraria silenciosamente após a migração — a investigação foi exaustiva (grep completo em backend e frontend), mas vale repetir a busca já no código final antes do deploy.
- **Sessões ativas:** os 2 usuários reais do sistema serão deslogados no deploy — avisar previamente, é uma mudança perceptível mesmo sendo pequena em volume.
- **Constraint pré-existente já estava incorreto** (não permitia `'gestor'`) — este plano corrige uma falha anterior à mudança solicitada, não a introduz.
- **Ordem de deploy**: código, migration e invalidação de sessão devem ser sequenciados com cuidado para não haver janela de incompatibilidade (ver seção Infra/Deploy).

## Perguntas em aberto

1. Estratégia técnica exata para forçar logout geral (ex: trocar `JWT_SECRET`) será decidida durante a implementação; se envolver alteração de `.env`, requer confirmação explícita separada, conforme regra do projeto.
2. Renomear os aliases de resposta `gestor_users`/`standard_users` em `GET /api/users/stats/general`? Não há consumidor frontend confirmado hoje — proposta é não renomear neste plano, mantendo apenas a lógica interna (`WHERE tipo = ...`) atualizada. Pode ser revisitado se necessário.

## Critérios de aceite do plano

- Nenhum código-fonte ativo compara `usuarios.tipo` com os literais `'gestor'`/`'padrao'` — apenas `'titular'`/`'membro'`/`'admin'`.
- O CHECK constraint do banco reflete exatamente os 3 valores válidos, sem `'master'`.
- `UsuariosTab.tsx` removido, sem imports quebrados.
- Builds (`tsc` backend, `tsc` frontend, `vite build`) passam sem erros.
- Migration documentada e pronta, mas não executada até confirmação explícita do usuário.
- Estratégia de invalidação de sessão definida e implementada.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar a migration SQL sem confirmação explícita do usuário — o ambiente aponta para produção.
- Não alterar `.env`/segredos sem confirmação explícita separada, mesmo que a estratégia de invalidação de sessão escolhida dependa disso.
- Seguir `/AGENT.md` da raiz (não há `frontend/AGENT.md`/`backend/AGENT.md` dedicados neste projeto).
- Manter as alterações focadas exclusivamente na renomeação de valores e remoção do código órfão — não aproveitar para refatorar nomes de variáveis locais além do estritamente necessário (ex: renomear `isGestor` para `isTitular` é opcional, não obrigatório).
- Repetir a busca por `'gestor'`/`'padrao'` como literais de `usuarios.tipo` no código final antes de considerar a implementação concluída.
