# Task: Ajustes no cadastro de conta: colaborador com CPF já cadastrado, logo no topo e sócios no modal

## Contexto

Três ajustes pedidos pelo usuário em 2026-10-02, todos na área de contas, colaboradores e sócios das Configurações:

1. **Colaborador com CPF já cadastrado.**
   - O gestor (titular) cria colaboradores pelo modal "Novo colaborador".
   - O servidor (`POST /api/account-members`, `backend/src/routes/accountMembers.ts`, ~l.128–200) sempre cria **um usuário novo** (`usuarios.tipo = 'membro'`) e o vincula à conta em `conta_membros`.
   - Antes disso, recusa se o e-mail ou o CPF já existem em **qualquer** usuário do sistema (~l.147–169), com mensagens em inglês ("Email already registered", "Document already registered").
   - O CPF é opcional no formulário.
2. **Modal "Editar conta"** (`src/screens/config/ContasTab.tsx`, `Dialog` em ~l.394, título "Editar conta"/"Nova conta"):
   - o envio do logo ("Toque no logo para enviar · PNG ou SVG, até 1 MB") fica no bloco "Acesso", no fim do modal (`photoHeader` em ~l.530), acima de E-mail e Nova senha.
3. **Sócios:**
   - Hoje são cadastrados numa tela própria das Configurações: `src/screens/config/SociosTab.tsx`, item `socios` do `src/layout/ConfigPanel.tsx` (grupo "Pessoas").
   - O serviço do frontend é `src/services/sociosService.ts`, e as rotas ficam em `backend/src/routes/partners.ts`.
   - A tabela é `socios` (`backend/src/db/schema/partners.ts`), com os campos `usuario_id`, `conta_id`, `nome`, `percentual` e `ativo`. Não há campo de capital.

## Problema

1. **Colaborador com CPF já cadastrado.**
   - O usuário tentou cadastrar como colaborador de uma conta PJ uma pessoa que já tem conta própria no sistema, sem relação com essa conta.
   - O cadastro foi recusado com "Document already registered".
   - Hoje uma pessoa não pode ser colaboradora de outra conta se o CPF dela já estiver em qualquer login.
   - A mensagem também aparece em inglês.
2. **Logo no fim do modal:** no "Editar conta", o logo fica no meio dos campos de acesso, quando deveria abrir o modal.
3. **Sócios fora do modal da conta:**
   - os sócios ficam numa tela separada da conta da empresa;
   - não dá para definir a participação de cada um e o capital inicial no próprio modal da conta;
   - o capital nem existe no modelo de dados.

## Objetivo

1. Permitir que a mesma pessoa (mesmo CPF) seja colaboradora de uma conta mesmo tendo conta própria, sem quebrar o login nem as permissões. As mensagens de erro desse cadastro passam a ser em português.
2. Levar o logo para o topo do modal da conta.
3. Cadastrar os sócios no modal da conta, com a participação (%) e o capital inicial de cada um.

## Decisão Técnica Desejada

- **Item 1 — DECIDIDO PELO USUÁRIO (2026-10-02): caminho (a).** O colaborador ganha um login próprio, com o mesmo CPF e outro e-mail, e entra pelo e-mail. O planejamento detalha como o login por CPF se comporta quando dois usuários têm o mesmo CPF. Os caminhos avaliados foram:
  - **(a) Outro login com o mesmo CPF:** o colaborador ganha um login próprio, com outro e-mail, e o CPF deixa de ser único entre usuários `membro`. Esse login seria feito por e-mail, porque o login por CPF busca um único usuário (`backend/src/routes/auth.ts`, ~l.95).
  - **(b) Vincular o usuário existente à outra conta:** a mesma pessoa e o mesmo login passam a ter várias contas, com troca de conta e permissões por conta.
  - O sistema hoje assume que um usuário é membro de, no máximo, uma conta e que um membro não tem conta própria: `resolveMemberAccountId` com `limit(1)` e `hasScreenAccess` em `backend/src/middleware/permissions.ts`, `resolvePlanHolder` em `plan-lifecycle.ts` e `isActiveFamilyMember` em `utils/familyVisibility.ts`.
- **Item 2:** só de layout. O logo vai para o topo do modal, e o bloco "Acesso" fica com E-mail e Nova senha.
- **Item 3:** sócios dentro do modal da conta, com o capital inicial guardado no banco (coluna nova, migration). Se a tela "Sócios" continua existindo, isso fica para o planejamento decidir.

## Escopo Funcional

### Dentro do escopo

- Cadastrar como colaborador uma pessoa cujo CPF já existe em outro login.
- Traduzir para o português as mensagens do cadastro de colaborador ("Email already registered", "Document already registered", "Invalid CPF/CNPJ" e "Account not found").
- Logo no topo do modal "Editar conta" (e do "Nova conta", que usa o mesmo componente).
- Seção de sócios no modal da conta (PJ): nome, participação (%) e capital inicial, com incluir, editar e excluir.
- Coluna de capital inicial no sócio.

### Fora do escopo inicial

- Mudar o login de titulares (CPF/CNPJ ou e-mail) além do necessário para o item 1.
- Relatórios ou cálculos de distribuição de lucro por participação.
- Histórico de alteração de capital.
- Mudanças em conta PF (pessoa física), salvo se o planejamento indicar necessidade.

## Requisitos de Frontend

- **Modal "Novo colaborador":** passa a aceitar o caso do item 1, conforme a decisão do planejamento, e mostra os erros em português.
- **`ContasTab.tsx`:** o logo vai para o topo do modal, sem mudar o envio (PNG ou SVG, até 1 MB) nem o comportamento de "Editar conta" e "Nova conta".
- **Seção "Sócios" no modal da conta (PJ):**
  - lista com nome, participação (%) e capital inicial (R$);
  - incluir, editar e excluir;
  - mostrar o total de participação, como a tela atual já faz (`totalPct` em `SociosTab.tsx`).
- **Padrões do projeto:** React Query e query keys centralizadas (`queryKeys.socios` já existe). Nomes novos de código em inglês.

## Requisitos de Backend

- **Item 1:** ajustar a criação de colaborador (`accountMembers.ts`) conforme a decisão, sem afrouxar a regra para titulares. Conferir os efeitos em `auth.ts` (login por CPF), `permissions.ts`, `familyVisibility.ts` e `plan-lifecycle.ts`.
- **Item 3:** rotas de sócios (`partners.ts`) com o campo de capital inicial, com validação de valor, e, se o modal salvar tudo de uma vez, com a operação adequada (uma rota ou várias).
- **Isolamento:** toda query continua filtrando por usuário e conta.

## Requisitos de Banco de Dados

- **Item 3:** coluna nova na tabela `socios` para o capital inicial (por exemplo `capital_inicial DECIMAL(12,2)`), por migration nova, depois da 0058.
- **Item 1:** pode exigir rever a unicidade do CPF em `usuarios` (hoje a checagem é feita pelo código; conferir se há índice único no banco).
- Migrations só com confirmação explícita, uma por vez, no banco local e depois na produção.
- Atenção: a 0058 (`DROP TABLE assistente_fluxos`) ainda está pendente na produção e será aplicada depois do deploy da limpeza. Toda migration nova vem depois dela.

## Requisitos de Segurança e Multi-Tenant

- O projeto não é multi-tenant: não há isolamento de tenant a considerar. O isolamento é por usuário e por conta.
- **Item 1:**
  - não pode permitir que um gestor vincule ou crie acesso para pessoa de outra conta de modo que veja dados que não deveria;
  - as permissões do colaborador na conta nova não podem vazar para a conta própria dele, nem o contrário;
  - o login não pode ficar ambíguo.
- **Item 3:** sócios e capital só são visíveis e editáveis para quem gerencia a conta, com as permissões atuais (por exemplo, `accessPartners`).

## Requisitos de Migração ou Compatibilidade

- Os sócios já cadastrados continuam valendo. A coluna nova aceita vazio ou zero nos registros antigos.
- O login e o acesso dos membros e colaboradores atuais continuam iguais.
- Se a tela "Sócios" sair, os dados continuam acessíveis pelo modal da conta.

## Requisitos de Testes

### Frontend

- Seção de sócios no modal: incluir, editar, excluir e o total de participação.
- Logo no topo do modal, com o envio funcionando.

### Backend

- Cadastro de colaborador com CPF que já existe em outro login, conforme a decisão.
- Login de quem tem conta própria e é colaborador de outra conta.
- Mensagens em português.
- Rotas de sócios com o capital inicial: validação e escopo por conta.

### E2E

- Roteiro local: titular A cria colaborador com o CPF de quem já tem conta B; os dois logins funcionam, e cada um vê só o que deve.

## Arquivos Provavelmente Afetados

### Frontend

- `src/screens/config/ContasTab.tsx`
- `src/screens/config/SociosTab.tsx` (mantida ou removida, a decidir)
- `src/services/sociosService.ts`
- `src/layout/ConfigPanel.tsx`, se a tela "Sócios" sair
- Modal "Novo colaborador": a identificar durante o planejamento

### Backend

- `backend/src/routes/accountMembers.ts`
- `backend/src/routes/partners.ts`
- `backend/src/routes/auth.ts`, se o item 1 mexer no login
- `backend/src/middleware/permissions.ts`, `backend/src/utils/familyVisibility.ts` e `backend/src/services/plan-lifecycle.ts`, conforme a decisão do item 1

### Banco de Dados

- `backend/src/db/schema/partners.ts` (coluna de capital)
- Migration nova em `backend/drizzle/`, depois da 0058
- `backend/src/db/schema/users.ts`, se a unicidade do CPF mudar

## Critérios de Aceite

- **Colaborador:**
  - uma pessoa com conta própria pode ser cadastrada como colaboradora de outra conta, informando o CPF dela;
  - os dois acessos funcionam e cada um vê só o que deve;
  - as mensagens de erro do cadastro de colaborador aparecem em português.
- **Logo:** no modal "Editar conta" (e "Nova conta"), o logo aparece no topo e o envio continua funcionando.
- **Sócios:**
  - o modal da conta PJ permite cadastrar sócios com participação (%) e capital inicial;
  - os sócios já existentes aparecem nele.
- **Validações técnicas:** checagem de tipos, testes e builds passam, e as migrations são aplicadas com confirmação.

## Perguntas Para o Planejamento

- **Item 1:**
  - qual caminho seguir: (a) login separado com o mesmo CPF, entrando por e-mail, ou (b) o mesmo login vinculado a várias contas?
  - no caminho (a), como fica o login por CPF quando dois usuários têm o mesmo CPF?
- **Item 3, tela "Sócios":** continua existindo nas Configurações ou passa a existir só no modal da conta?
- **Item 3, capital inicial:** é por sócio (cada um com o seu valor) ou o capital total da empresa, dividido pela participação?
- **Item 3, validação:** a soma das participações precisa dar 100% para salvar, ou só é exibida?
- **Item 3, tipo de conta:** os sócios aparecem só em conta PJ?
- **Item 2:** o logo também vai para o topo na "Nova conta" (mesmo componente)?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia o `/AGENT.md` da raiz. `frontend/AGENT.md` e `backend/AGENT.md` não existem neste projeto.
- Inspecione os arquivos citados antes de escrever o plano.
- Classifique a implementação. O mais provável é `frontend + backend + database`.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations.
- Gere o plano em `.plans/` (convenção deste projeto), com etapas pequenas e revisáveis. O projeto vai direto para a produção, sem staging.

---

Arquivos de contexto considerados: `/AGENT.md` (descreve um sistema multi-prefeitura que não corresponde a este projeto; foram usadas só as regras transversais). `frontend/AGENT.md` e `backend/AGENT.md` não existem.
