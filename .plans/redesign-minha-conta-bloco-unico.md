# Plano de Implementação: Redesign "Minha conta" — bloco único centralizado com todos os campos da conta

## Origem

- Arquivo de especificação: nenhum `.md` de feature — pedido direto do usuário a partir de screenshot da tela atual, com esclarecimentos coletados via perguntas.
- Data do planejamento: 2026-08-20
- Classificação: `fullstack` (backend + frontend, sem migration)

## Resumo

A tela "Minha conta" (`MinhaContaTab.tsx`) hoje tem 3 blocos visuais separados: um card de info (nome, email, badges tipo/status, documento exibido mas não editável), um `<form>` "Dados pessoais" (só nome e email), e um `<form>` "Alterar senha" (senha atual/nova/confirmar) — dois formulários, dois botões de submit, duas validações independentes. O usuário considera essa duplicação desnecessária e quer tudo consolidado em um único bloco centralizado.

Além do redesign visual, o usuário quer que todos os campos de cadastro da conta apareçam e sejam editáveis: nome, email, documento (CPF/CNPJ), país, estado, cidade — hoje só nome e email são editáveis, apesar de país/estado/cidade já serem suportados pela API. Documento deve ser editável (decisão confirmada com o usuário), o que exige adicionar validação de formato e unicidade no backend, que hoje ignora esse campo silenciosamente em `PUT /usuarios/me`.

Escopo confirmado com o usuário: os campos aqui tratados pertencem à tabela `usuarios` (dados da conta). Campos específicos de empresa (razão social, nome fantasia, atividade, enquadramento), que pertencem à tabela `perfis`, continuam fora desta tela e seguem geridos pela tela "Perfis" já existente.

## Escopo

### Dentro do escopo

- **Backend**: `PUT /api/users/me` passa a aceitar `documento` no body, validando formato (CPF ou CNPJ) via a função já existente `validateDocument` e checando unicidade contra outros usuários (mesmo padrão já usado para verificar email duplicado na mesma rota), persistindo o documento limpo (só dígitos).
- **Frontend**: remover a estrutura atual de 3 blocos (card info isolado + 2 `<form>` separados) e aplicar um único card/bloco centralizado contendo:
  - Cabeçalho com avatar, nome, email, badges de tipo/status.
  - Um único `<form>` com os campos: Nome completo, E-mail, Documento, País, Estado, Cidade.
  - Uma seção "Alterar senha" (Senha atual, Nova senha, Confirmar senha) separada visualmente por `SectionDivider` (componente já existente em `src/ui/form.tsx`), mas dentro do mesmo formulário.
  - Um único botão "Salvar": envia sempre os dados cadastrais; se os campos de senha estiverem preenchidos, valida (nova senha == confirmação, mínimo 8 caracteres, senha atual obrigatória) e envia tudo junto na mesma chamada a `updateMe`, que já aceita esse payload combinado hoje.
- Duas etapas sequenciais explícitas na implementação: (1) remover a estrutura visual antiga (dois `<form>`, card de info separado, botões duplicados); (2) aplicar o layout novo unificado — não reescrever tudo de uma vez misturando remoção e criação.
- Validação visual local: carregar a conta "Aether Software" (CNPJ, país/estado/cidade possivelmente vazios), editar e salvar campos, trocar senha, tentar salvar um documento já usado por outra conta (deve retornar erro claro).

### Fora do escopo

- Campos específicos de empresa (razão social, nome fantasia, atividade, enquadramento, aporte inicial) — continuam exclusivamente na tela "Perfis" (`sistema financas/backend/src/routes/profiles.ts` e sua UI correspondente).
- Máscara de input para CPF/CNPJ — mantém input de texto livre, consistente com o formulário de cadastro atual (`RegisterScreen`/tela de criar conta), que também não usa máscara.
- Qualquer mudança em `GET /api/users/me` — já retorna `documento` corretamente desde o plano anterior `corrigir-contrato-nome-usuarios-me`.
- Qualquer mudança na tela "Usuários" (admin) — fora do escopo deste plano.

## Leitura de contexto

- `sistema financas/AGENT.md` — lido (mesma ressalva já registrada em planos anteriores deste projeto: descreve contexto multi-tenant/multi-prefeitura genérico não totalmente aplicável a este projeto single-tenant; aplicadas as diretrizes gerais de qualidade — Drizzle, nomes claros, evitar `any`, seguir padrão existente — e ignoradas as específicas de isolamento multi-prefeitura).
- `frontend/AGENT.md` — não existe como arquivo separado neste projeto.
- `backend/AGENT.md` — não existe como arquivo separado neste projeto.
- `sistema financas/src/screens/config/MinhaContaTab.tsx` — lido por completo (componente a ser redesenhado).
- `sistema financas/src/services/usuariosService.ts` — lido (interfaces `UsuarioMe`, `UsuarioMePutBody` já suportam país/estado/cidade; `documento` já está em `UsuarioMe` desde o plano anterior).
- `sistema financas/backend/src/routes/users.ts` — lido (rota `PUT /me`, que precisa aceitar `documento`).
- `sistema financas/backend/src/middleware/validation.ts` — lido (função `validateDocument` já existente e exportada, reaproveitável).
- `sistema financas/backend/src/routes/auth.ts` — lido (padrão de limpeza de documento `cleanDoc = documento.replace(/[^\d]+/g, '')` e checagem de duplicidade, usado como referência).
- `sistema financas/backend/src/db/schema/users.ts` — lido (confirma constraint `unique()` na coluna `document`).
- `sistema financas/src/ui/form.tsx` — lido por completo (componentes reutilizáveis `Field`, `Input`, `SectionDivider` — este último ideal para separar visualmente "Senha" dentro do bloco único sem precisar de dois `<form>`).
- `sistema financas/backend/src/routes/profiles.ts` — lido em plano anterior (confirma que campos de empresa pertencem a `perfis`, fora do escopo).

## Impacto por área

### Frontend

- `sistema financas/src/screens/config/MinhaContaTab.tsx`:
  - Remover a estrutura de 3 blocos (card de info + 2 `<form>` com 2 botões de submit e 2 estados de erro/sucesso separados).
  - Novo layout: 1 card único, cabeçalho de identidade (avatar/nome/email/badges) + 1 `<form>` com todos os campos cadastrais e a seção de senha (usando `SectionDivider`), com 1 único botão "Salvar" e 1 único estado de erro/sucesso.
  - Novos campos no formulário: Documento, País, Estado, Cidade (usando `Field`/`Input` já existentes, mesmo padrão visual dos campos atuais).
  - Lógica de submit: sempre inclui nome/email/documento/pais/estado/cidade; inclui senha_atual/nova_senha somente se os campos de senha estiverem preenchidos, com validação client-side prévia (senha nova == confirmação, mínimo 8 caracteres, senha atual obrigatória se for trocar) antes de chamar a mutation.
  - Após sucesso, limpar os campos de senha (não re-exibir senha antiga em texto).
  - Mantém uso de React Query (`useQuery`/`useMutation`) já existente, sem introduzir fetch direto.
- `sistema financas/src/services/usuariosService.ts`:
  - `UsuarioMePutBody` precisa incluir `documento?: string` (hoje não está no tipo, apesar do backend passar a aceitar).

### Backend

- `sistema financas/backend/src/routes/users.ts`, rota `PUT /me` (linhas ~46-122):
  - Aceitar `documento` no destructuring do body.
  - Se `documento` for enviado: limpar (`replace(/[^\d]+/g, '')`), validar com `validateDocument` (importar de `../middleware/validation`), retornar 400 com mensagem clara se inválido.
  - Checar unicidade: se o documento limpo já pertencer a outro usuário (`ne(users.id, req.user!.id)`), retornar 400 "Document already in use" — mesmo padrão já usado para email duplicado nessa rota.
  - Incluir `document: cleanDoc` em `updateData` quando aplicável.
  - Incluir `documento: updated.document` (ou equivalente já remapeado para português, seguindo o plano anterior de contrato) na resposta.
- Nenhuma mudança de autenticação/permissão — a rota já é autenticada e edita apenas o próprio usuário (`req.user!.id`).

### Banco de dados

`Sem impacto esperado`. Nenhuma migration necessária — a coluna `document` já existe e já é `unique()` no schema (`sistema financas/backend/src/db/schema/users.ts`).

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `sistema financas/backend/src/routes/users.ts`
- `sistema financas/src/services/usuariosService.ts`
- `sistema financas/src/screens/config/MinhaContaTab.tsx`

## Estratégia de implementação

1. **Backend primeiro** (a UI depende do contrato): em `users.ts`, ajustar `PUT /me` para aceitar, validar (formato + unicidade) e persistir `documento`, seguindo o padrão já usado para `email` na mesma rota.
2. Atualizar `UsuarioMePutBody` em `usuariosService.ts` para incluir `documento?: string`.
3. **Etapa de remoção** (frontend): em `MinhaContaTab.tsx`, remover a estrutura visual antiga — o card de info isolado, os dois `<form>` separados, os dois botões de submit, os dois blocos de estado de erro/sucesso — deixando o componente num estado mínimo/limpo antes de reconstruir.
4. **Etapa de aplicação** (frontend): reconstruir o componente como um único card centralizado: cabeçalho de identidade + um único `<form>` com todos os campos cadastrais + seção de senha via `SectionDivider` + um único botão "Salvar" com a lógica de submit combinada (dados sempre, senha condicional).
5. Rodar o projeto localmente (`/run`) e validar manualmente:
   - Login com a conta Aether Software, conferir que todos os campos aparecem preenchidos corretamente (nome, email, documento; país/estado/cidade provavelmente vazios, já que não foram preenchidos no cadastro original).
   - Editar nome/email/país/estado/cidade e salvar sem tocar em senha — confirmar que salva sem exigir senha atual.
   - Tentar trocar a senha (preenchendo os 3 campos) — confirmar que funciona e que os campos de senha são limpos após sucesso.
   - Tentar salvar um documento já usado por outra conta de teste — confirmar erro claro, sem quebrar a UI.
   - Conferir estado de loading/erro/sucesso do formulário único.

## Regras de negócio identificadas

- Documento (CPF/CNPJ) deve ser único por usuário em todo o sistema — já garantido por constraint no banco; a validação de aplicação deve apenas antecipar esse erro com uma mensagem clara antes de depender do erro bruto do Postgres.
- Trocar senha continua exigindo senha atual correta, independente de estar no mesmo formulário que os dados cadastrais — não é permitido trocar senha sem informar a atual.
- Campos país/estado/cidade são opcionais (nullable no schema).

## Regras multi-tenant e segurança

Não aplicável — projeto não é multi-tenant. A rota `PUT /me` já opera exclusivamente sobre `req.user!.id` (identidade derivada do JWT autenticado), não há risco de um usuário editar dados de outro.

## Validações necessárias

- Backend: `documento` (quando enviado) deve passar em `validateDocument` (CPF ou CNPJ com dígito verificador válido) e não pode já pertencer a outro `usuario_id`.
- Frontend: antes de enviar troca de senha, validar client-side que `senhaNova === senhaConfirm` e `senhaNova.length >= 8` (lógica já existente em `handleSaveSenha`, a ser incorporada ao submit único) e que `senhaAtual` foi preenchida se `senhaNova` foi preenchida.

## Testes necessários

### Frontend

- Verificação manual: formulário único carrega todos os campos da conta corretamente.
- Verificação manual: salvar sem alterar senha não exige/envia campos de senha.
- Verificação manual: salvar com troca de senha exige e valida os 3 campos de senha antes de enviar.
- Verificação manual: mensagens de erro (documento duplicado, senha incorreta) aparecem claramente no bloco único.

### Backend

- Verificação manual (não há suíte automatizada para essas rotas): `PUT /usuarios/me` com documento válido e não duplicado → sucesso. Com documento de outro usuário → 400. Com documento em formato inválido → 400.

### E2E

- Não aplicável — sem framework E2E identificado no projeto.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas/backend" run build
npm --prefix "sistema financas/backend" run lint
npm --prefix "sistema financas" run build
npm --prefix "sistema financas" run lint
```

## Riscos e pontos de atenção

- Ambiente aponta para produção (banco Render, confirmado em plano anterior) — testes manuais de "documento duplicado" devem usar contas de teste descartáveis, removidas após validação, mesmo padrão já usado no plano anterior.
- Ao unificar em um único botão "Salvar", garantir que a UX não fique ambígua: se o usuário só quis editar o nome mas acidentalmente deixou um campo de senha parcialmente preenchido, a validação client-side deve bloquear o submit com mensagem clara, não silenciosamente ignorar ou falhar de forma confusa.
- `PUT /usuarios/me` hoje já lida com a combinação nome+senha numa única chamada (`updateMe({ nome, email, senha_atual, nova_senha })` já é usado assim em `handleSaveSenha` atual) — o backend já suporta o payload combinado; a mudança real de comportamento é só a adição de `documento`.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisão sobre botão único de salvar já confirmada com o usuário.

## Critérios de aceite do plano

- `PUT /api/users/me` aceita, valida (formato + unicidade) e persiste `documento`.
- Tela "Minha conta" é um único bloco/card centralizado, sem os dois `<form>` separados antigos.
- Todos os campos da conta (nome, email, documento, país, estado, cidade) aparecem e são editáveis no mesmo formulário.
- Um único botão "Salvar" processa dados cadastrais sempre, e senha quando preenchida.
- Campos de empresa (razão social, atividade, etc.) não aparecem nesta tela — continuam em "Perfis".

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations — nenhuma é necessária.
- Seguir `sistema financas/AGENT.md` para convenções de código (Drizzle, nomes claros, evitar `any`), ignorando as seções de multi-tenant/prefeitura que não se aplicam a este projeto.
- Seguir a ordem "remover então aplicar" na etapa de frontend: não misturar a remoção da estrutura antiga com a construção do novo layout no mesmo passo mental — são duas etapas distintas da implementação.
- Reaproveitar `validateDocument` de `middleware/validation.ts` no backend — não duplicar lógica de validação de CPF/CNPJ.
- Reaproveitar `SectionDivider`, `Field`, `Input` já existentes em `src/ui/form.tsx` — não criar componentes novos para isso.
- Testes de documento duplicado em produção devem usar contas descartáveis, removidas após validação.
