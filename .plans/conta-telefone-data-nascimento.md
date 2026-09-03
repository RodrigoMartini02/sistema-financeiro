# Plano de Implementação: Telefone e Data de Nascimento na Conta principal

## Origem

- Arquivo de especificação: descrição textual do usuário (bug reportado ao vivo, sem `.md` de feature)
- Data do planejamento: 2026-09-02
- Classificação: `frontend + backend + database`

## Resumo

O modal "Minha conta" (Configurações → Perfis → item Conta) reaproveita o mesmo formulário usado para Perfis (`PerfilDialog` em `src/screens/config/PerfisTab.tsx`), que exibe os campos Telefone e Data de Nascimento para qualquer item do tipo `pessoal` — incluindo a Conta. O usuário preenche esses campos e clica em Salvar, mas eles nunca são persistidos: ao reabrir o modal, aparecem vazios novamente.

Causa raiz (dupla):

1. `handleSave` em `PerfisTab.tsx` descarta `telefone` e `data_nascimento` do payload antes de enviar, quando `dialog.isConta` é verdadeiro — só reenvia `nome`, `email`, `documento`, `pais`, `estado`, `cidade`.
2. Mesmo que fossem enviados, a tabela `usuarios` não tem colunas `telefone`/`data_nascimento`. Só a tabela `perfis` ganhou essas colunas, na migration `0021_perfis_telefone_email_data_nascimento.sql` (de outra sessão, parte da unificação conta-perfis). A rota `PUT /api/users/me` e o tipo `UsuarioMePutBody` também não suportam esses campos.

A correção estende para `usuarios` exatamente o mesmo padrão já aplicado em `perfis`, para que a Conta principal fique com paridade de campos com os Perfis — consistente com a direção já tomada pela unificação conta-perfis em andamento.

## Escopo

### Dentro do escopo

- Migration aditiva `ALTER TABLE usuarios ADD COLUMN telefone`, `ADD COLUMN data_nascimento`
- Schema Drizzle (`users.ts`) ganha `telefone` e `dataNascimento`
- `GET /api/users/me` passa a retornar os dois campos
- `PUT /api/users/me` passa a aceitar e persistir os dois campos
- `UsuarioMe` e `UsuarioMePutBody` (frontend) ganham os dois campos
- `PerfisTab.tsx`: `contaItem` passa a expor `telefone`/`data_nascimento`; `handleSave` para de descartar esses campos quando é Conta

### Fora do escopo

- Qualquer outra mudança na feature de unificação conta-perfis além do estritamente necessário para este bug
- A feature de foto por perfil (já implementada e testada nesta sessão) — não tocar
- `PUT /api/users/current` (rota legada separada, não usada pelo fluxo de "Minha conta" atual)
- Qualquer mudança de UI/UX além de fazer os campos existentes funcionarem

## Leitura de contexto

- `sistema financas/CLAUDE.md` (raiz do subprojeto, equivalente a `AGENT.md`)
- `backend/AGENT.md` — não existe como arquivo dedicado neste projeto; seguido apenas o `CLAUDE.md` da raiz do subprojeto, que cobre backend e frontend
- `backend/src/db/schema/users.ts` (schema atual, sem `telefone`/`data_nascimento`)
- `backend/src/db/schema/profiles.ts` (schema de referência, já com `telefone`/`dataNascimento`/`photo`)
- `backend/src/routes/users.ts` (rotas `GET /me`, `PUT /me`, `GET /current`, `PUT /current`, `PUT /current/photo`)
- `backend/src/routes/profiles.ts` (rota de referência, já lida e editada nesta sessão para a feature de foto)
- `backend/drizzle/0021_perfis_telefone_email_data_nascimento.sql` (migration de referência de estilo)
- `src/services/usuariosService.ts` (tipos `UsuarioMe`, `UsuarioMePutBody`, `updateMe`, `fetchMe`)
- `src/screens/config/PerfisTab.tsx` (formulário unificado `PerfilDialog`, `handleSave`, `contaItem`)

## Impacto por área

### Frontend

- `src/services/usuariosService.ts`:
  - `UsuarioMe` ganha `telefone?: string | null; data_nascimento?: string | null;`
  - `UsuarioMePutBody` ganha `telefone?: string; data_nascimento?: string;`
- `src/screens/config/PerfisTab.tsx`:
  - `contaItem` (linha ~472) passa a incluir `telefone: me.data.telefone, data_nascimento: me.data.data_nascimento`
  - `handleSave` (linha ~512-520), no branch `dialog.isConta`, passa a reenviar `telefone: v.telefone, data_nascimento: v.data_nascimento` junto com os campos já enviados
- Nenhuma mudança de layout ou de `PerfilDialog` em si — os campos e o `FormData` já existem e já capturam os valores corretamente; o problema é exclusivamente no roteamento do payload e na ausência de suporte no backend
- Sem impacto em loading/error/empty states além dos já existentes (`saveContaMut` já trata erro via `onError`)

### Backend

- `backend/src/db/schema/users.ts`: adicionar `telefone: varchar('telefone', { length: 20 })` e `dataNascimento: date('data_nascimento')` — requer importar `date` de `drizzle-orm/pg-core` (import já usado em `profiles.ts` como referência)
- `backend/src/routes/users.ts`:
  - `GET /me`: incluir `telefone: users.telefone, data_nascimento: users.dataNascimento` no `select`
  - `PUT /me`: desestruturar `telefone`, `data_nascimento` do body; incluir em `updateData` (`telefone: telefone ?? null, dataNascimento: data_nascimento ?? null`) e no `.returning()`
- Sem mudança em autenticação/autorização — rota já usa `authenticate` e opera sempre sobre `req.user!.id`
- Sem impacto em relatórios/PDFs

### Banco de dados

- Nova migration `backend/drizzle/0023_usuarios_telefone_data_nascimento.sql`:
  ```sql
  -- Adiciona telefone e data_nascimento a usuarios, espelhando as mesmas
  -- colunas ja existentes em perfis (migration 0021). O formulario unificado
  -- de "Minha conta" (PerfilDialog) ja exibe e captura esses campos, mas
  -- ate agora eram descartados silenciosamente por falta de coluna
  -- correspondente na tabela usuarios.
  --
  -- Do not execute automatically. Confirm the target database before applying.

  ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone VARCHAR(20);
  ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS data_nascimento DATE;
  ```
- Aditiva e não-destrutiva (`ADD COLUMN IF NOT EXISTS`), sem risco a dados existentes
- Mesmo cuidado já aplicado na migration `0022_perfis_foto.sql` desta sessão: **nunca executar sem confirmação explícita separada**, mesmo com este plano aprovado — o `.env` atual aponta para o banco de produção do Render

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

- `backend/drizzle/0023_usuarios_telefone_data_nascimento.sql` (novo)
- `backend/src/db/schema/users.ts`
- `backend/src/routes/users.ts`
- `src/services/usuariosService.ts`
- `src/screens/config/PerfisTab.tsx`

## Estratégia de implementação

1. Criar a migration `0023_usuarios_telefone_data_nascimento.sql` (não executar)
2. Atualizar `backend/src/db/schema/users.ts` com as duas novas colunas
3. Atualizar `backend/src/routes/users.ts`: `GET /me` (SELECT) e `PUT /me` (aceitar + persistir + retornar)
4. Rodar `cd backend && npm run build` para validar o backend
5. Atualizar `src/services/usuariosService.ts` (`UsuarioMe`, `UsuarioMePutBody`)
6. Atualizar `src/screens/config/PerfisTab.tsx` (`contaItem`, `handleSave`)
7. Rodar `npx tsc --noEmit -p .` e `npx vite build`
8. Pedir confirmação explícita separada antes de aplicar a migration em produção
9. Após aprovação, aplicar a migration e validar manualmente na UI (preencher, salvar, reabrir)

## Regras de negócio identificadas

- Telefone e Data de Nascimento são opcionais tanto em Perfil quanto (agora) em Conta — nenhuma validação de obrigatoriedade nova
- Formato de `telefone` e `data_nascimento` seguem exatamente o mesmo padrão já usado em `perfis` (sem máscara/validação server-side além do tamanho da coluna)

## Regras multi-tenant e segurança

- Não há dimensão multi-tenant/prefeitura neste projeto
- `PUT /api/users/me` já opera exclusivamente sobre `req.user!.id` (identidade do token autenticado) — nenhuma mudança nesse comportamento, sem novo vetor de acesso a dados de outro usuário
- Nenhum dado sensível novo exposto em mensagens de erro

## Validações necessárias

- `telefone`: string opcional, sem validação de formato adicional (mesmo padrão de `perfis`)
- `data_nascimento`: string de data opcional (`YYYY-MM-DD` vindo do `<input type="date">`), sem validação de idade mínima/máxima

## Testes necessários

### Frontend

- Preencher Telefone e Data de Nascimento em "Minha conta", salvar, fechar e reabrir o modal — valores devem persistir
- Confirmar que editar um Perfil normal (não-conta) continua funcionando sem regressão

### Backend

- `PUT /api/users/me` com `telefone`/`data_nascimento` no body — confirmar persistência via `GET /api/users/me` subsequente
- `PUT /api/users/me` sem esses campos — confirmar que não quebra (comportamento opcional mantido)

### E2E

- Fluxo completo: login → Configurações → Minha conta → preencher Telefone/Data de Nascimento → Salvar → fechar → reabrir → valores presentes

## Comandos de validação sugeridos

```bash
cd backend && npm run build
npx tsc --noEmit -p .
npx vite build
```

## Riscos e pontos de atenção

- `.env` atual aponta para produção (Render) — migration não deve ser executada sem confirmação explícita separada, mesmo após este plano aprovado
- Migration aditiva e não-destrutiva, risco baixo, mesmo padrão já usado e aprovado na `0021` e na `0022` desta sessão
- Nenhum risco de quebrar contrato frontend/backend existente — campos novos são opcionais em todos os pontos (schema, tipos TS, payload)

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Preencher Telefone e/ou Data de Nascimento em "Minha conta", salvar, fechar e reabrir o modal: os valores devem permanecer preenchidos
- Nenhuma regressão no fluxo de edição de Perfis (Pessoal/Empresa) nem na feature de foto por perfil
- `cd backend && npm run build`, `npx tsc --noEmit -p .` e `npx vite build` passam sem erros novos
- Migration só aplicada após confirmação explícita separada do usuário

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Não executar a migration sem confirmação explícita separada — pedir novamente mesmo que o usuário já tenha aprovado este plano
- Seguir `sistema financas/CLAUDE.md` (não há `backend/AGENT.md`/`frontend/AGENT.md` dedicados neste projeto)
- Manter alterações pequenas e focadas exatamente no escopo acima — não tocar na feature de foto por perfil nem em outras partes da unificação conta-perfis
- Espelhar o estilo e estrutura já usados em `perfis` (migration `0021`, schema, rotas) para manter consistência
