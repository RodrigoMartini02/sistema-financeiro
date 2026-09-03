# Plano de Implementação: Foto de perfil por Perfil (Pessoal/Empresa)

## Origem

- Pedido direto do usuário (sem arquivo `.md` de especificação): "alterar foto não tem opção para perfis, eu já tinha solicitado para aplicar igual a conta original".
- Data do planejamento: 2026-09-02.
- Classificação: `frontend + backend + database`.

## Resumo

Hoje só a Conta (usuário/login) tem foto de perfil, armazenada em `usuarios.photo` (base64), com upload via `PUT /api/usuarios/current/photo` e o componente `AvatarUploadDialog` (crop circular). Cada `Perfil` (Pessoal/Empresa, tabela `perfis`) não tem coluna de foto, e o bloco de upload em `PerfilDialog` (dentro de `PerfisTab.tsx`) está condicionado a `isConta && onSaveFoto` — por isso a opção nunca aparece ao editar um perfil normal. Esta feature adiciona uma coluna `foto` em `perfis`, uma rota de backend equivalente à da conta, e libera a mesma UI de upload para perfis, incluindo exibição do avatar na lista de perfis e no avatar do perfil ativo no header.

## Escopo

### Dentro do escopo

- Migration: `ALTER TABLE perfis ADD COLUMN foto TEXT`.
- Schema Drizzle: adicionar `photo: text('foto')` em `backend/src/db/schema/profiles.ts`.
- Backend: nova rota `PUT /api/perfis/:id/photo` (mesmo padrão de `PUT /api/usuarios/current/photo` em `backend/src/routes/users.ts:258-267`), validando que o perfil pertence a `req.user!.id` antes de gravar.
- `GET /api/perfis` (`backend/src/routes/profiles.ts:11-24`) passa a incluir a coluna `foto` no `SELECT`.
- Frontend: `Perfil` e `ContaPrincipalItem` (`src/types/config.ts`) ganham `foto?: string | null`.
- `configService.ts`: nova função `updateFotoPerfil(id: number, foto: string | null)`, espelhando `updateFoto` de `usuariosService.ts`.
- `PerfisTab.tsx` (`PerfilDialog`): liberar o bloco de upload (hoje `isConta && onSaveFoto`) também quando `!isConta`, roteando o `onSaveFoto` para `updateFotoPerfil(perfil.id, ...)` em vez de `updateFoto` quando o alvo é um perfil normal.
- `ConfigListRow` (`src/ui/ConfigListRow.tsx`): nova prop opcional `foto?: string | null`, renderizando avatar circular (foto ou iniciais como fallback) quando presente; demais consumidores do componente (Categorias, Cartões, Sócios, etc.) não passam essa prop e não têm mudança visual.
- `AccountProfileMenu.tsx`: o avatar do perfil ativo (hoje `getInitials(activePerfil.nome)`) passa a checar `activePerfil.foto` primeiro, com fallback para iniciais — mesmo padrão já usado para a foto da conta no mesmo componente.

### Fora do escopo

- Alterar `AvatarUploadDialog.tsx` (componente de crop) — será só reaproveitado, sem mudança de comportamento ou de limite de tamanho.
- Foto em perfis arquivados/inativos (`ativo = false`) — sem tratamento especial; a coluna simplesmente persiste o último valor gravado.
- Qualquer reestruturação de `PerfilDialog`/`PerfisTab.tsx` além do estritamente necessário para plugar a foto — o arquivo tem ~300 linhas de trabalho em andamento não commitado de outra sessão (branch `feat/R/unificar-conta-perfis`) e a área tocada deve ser mínima.
- Correção de qualquer outro bug ou pendência dessa branch paralela não relacionado a foto (não é escopo desta feature).

## Leitura de contexto

- `/AGENT.md` (raiz do workspace `Particular`) — regra de aprovação explícita, sequência `/planejar → /implementar → /finalizar`.
- `sistema financas/AGENT.md` — regras de Drizzle, isolamento por `usuario_id` (adaptado do template multi-tenant/prefeitura deste projeto, que aqui se aplica como isolamento por usuário/perfil), proibição de migration sem confirmação.
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` como arquivos dedicados neste projeto — apenas o `AGENT.md` único da raiz de `sistema financas`, já considerado.
- `backend/src/db/schema/profiles.ts` (schema completo da tabela `perfis`, lido — confirma ausência de coluna de foto).
- `backend/src/routes/profiles.ts` (rotas GET/POST/PUT/DELETE de perfis, lidas por completo — nenhuma referência a foto hoje).
- `backend/src/routes/users.ts:258-267` (rota `PUT /current/photo` existente, padrão de referência direto para a nova rota de perfil).
- `src/screens/config/PerfisTab.tsx` (arquivo completo, 582 linhas — `PerfilDialog`, `PerfisTab`, bloco de upload de foto hoje condicionado a `isConta`; confirmado trabalho em andamento não commitado de outra sessão).
- `src/types/config.ts` (tipos `Perfil`, `ContaPrincipalItem`, `PerfilOuConta` — `foto` já existe em `ContaPrincipalItem`, ausente em `Perfil`).
- `src/components/AvatarUploadDialog.tsx` (componente de crop circular já existente e funcional, será reaproveitado sem alteração).
- `src/services/usuariosService.ts` (`updateFoto`, padrão de referência direto para a nova função `updateFotoPerfil`).
- `src/ui/ConfigListRow.tsx` (componente genérico de linha de lista, usado por múltiplas Tabs de configuração — confirmado que aceitar uma prop nova opcional não afeta os demais consumidores).
- `src/layout/AccountProfileMenu.tsx` (lido em sessão anterior — ponto onde `getInitials(activePerfil.nome)` precisa ganhar o fallback de foto).

## Impacto por área

### Frontend

- `src/types/config.ts`: `foto?: string | null` em `Perfil`.
- `src/services/configService.ts`: nova função `updateFotoPerfil(id, foto)`.
- `src/screens/config/PerfisTab.tsx`: liberar bloco de upload para perfis normais; roteamento do `onSaveFoto` por contexto (conta vs. perfil); invalidação de `queryKeys.perfis` após salvar/remover foto de um perfil (e `queryKeys.session`/`['usuario-me']` permanecem exclusivos do fluxo de conta, já existentes).
- `src/ui/ConfigListRow.tsx`: nova prop opcional `foto`, com fallback de iniciais (reaproveitar a mesma lógica de `getInitials` já usada em `AccountProfileMenu.tsx`, extraindo se necessário para evitar duplicação, ou aceitando pequena duplicação pontual se a extração for desproporcional ao tamanho da mudança).
- `src/layout/AccountProfileMenu.tsx`: avatar do perfil ativo passa a checar `activePerfil.foto` antes de cair nas iniciais.
- Sem novo estado de loading/error/empty além do que `useMutation` já cobre nos padrões existentes (`fotoMut` em `PerfisTab.tsx`).

### Backend

- `backend/src/db/schema/profiles.ts`: adicionar `photo: text('foto')`.
- `backend/src/routes/profiles.ts`: `GET /` passa a selecionar `foto`; nova rota `PUT /:id/photo` (autenticada, valida `usuario_id` do perfil antes de gravar, aceita `{ foto: string | null }`).
- Nenhuma mudança em `POST /` nem `DELETE /:id`.
- Sem impacto em relatórios/PDFs.

### Banco de dados

```sql
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS foto TEXT;
```

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. Este plano não autoriza a execução automática.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `backend/drizzle/00XX_perfis_foto.sql` (nova migration)
- `backend/src/db/schema/profiles.ts`
- `backend/src/routes/profiles.ts`
- `src/types/config.ts`
- `src/services/configService.ts`
- `src/screens/config/PerfisTab.tsx`
- `src/ui/ConfigListRow.tsx`
- `src/layout/AccountProfileMenu.tsx`

## Estratégia de implementação

1. Criar a migration `perfis_foto` adicionando a coluna `foto TEXT` (não executar contra produção sem confirmação separada).
2. Atualizar `backend/src/db/schema/profiles.ts` com o campo `photo`.
3. Atualizar `backend/src/routes/profiles.ts`: incluir `foto` no `SELECT` de `GET /`; adicionar `PUT /:id/photo` seguindo exatamente o padrão de `PUT /current/photo` em `users.ts`.
4. Rodar `cd backend && npm run build` para validar o backend antes de seguir.
5. Atualizar `src/types/config.ts` com `foto?: string | null` em `Perfil`.
6. Adicionar `updateFotoPerfil` em `src/services/configService.ts`.
7. Em `PerfisTab.tsx`: liberar o bloco de upload de foto (hoje só `isConta`) para também aparecer quando `!isConta`; ajustar a mutation/callback de salvar foto para chamar `updateFotoPerfil(perfil.id, ...)` quando o alvo não for a conta, invalidando `queryKeys.perfis` no sucesso.
8. Adicionar prop opcional `foto` a `ConfigListRow.tsx`, renderizando avatar circular com fallback de iniciais; usar essa prop apenas na chamada feita por `PerfisTab.tsx`.
9. Em `AccountProfileMenu.tsx`: ajustar o avatar do perfil ativo para checar `activePerfil.foto` antes de `getInitials`.
10. Rodar `npx tsc --noEmit -p .` e `npx vite build` no frontend.
11. Pedir confirmação explícita separada para aplicar a migration em produção.
12. Pedir para o usuário testar manualmente: enviar foto em um perfil Pessoal e em um perfil Empresa, confirmar que aparece na lista de perfis e no header ao ativar aquele perfil, e que remover a foto volta para iniciais.

## Regras de negócio identificadas

- Foto por perfil é independente da foto da conta — cada `Perfil` tem sua própria coluna, sem herdar nem sobrescrever `usuarios.photo`.
- Perfis sem foto continuam usando iniciais como fallback, consistente com o padrão já estabelecido para a conta.
- Upload usa o mesmo componente de crop (`AvatarUploadDialog`) e o mesmo formato de armazenamento (base64 direto na coluna), sem introduzir um segundo padrão de armazenamento de imagem no projeto.

## Regras multi-tenant e segurança

- A nova rota `PUT /api/perfis/:id/photo` deve validar que o perfil pertence a `req.user!.id` antes de gravar (mesmo padrão de `PUT /api/profiles/:id` já existente em `profiles.ts:103-169`, que já filtra por `and(eq(profiles.id, profileId), eq(profiles.userId, req.user!.id))`) — nunca confiar apenas no `:id` da URL.
- Sem mudança de superfície de autorização além dessa validação de propriedade, já é o padrão dominante do arquivo.

## Validações necessárias

- `PUT /:id/photo` deve retornar 404 (ou erro equivalente) se o perfil não existir ou não pertencer ao usuário autenticado.
- Frontend deve impedir upload quando `perfil` ainda não foi salvo (perfil novo/`isNew`) — só perfis já persistidos (com `id` numérico real) podem receber foto, assim como hoje só a conta (que sempre existe) pode.

## Testes necessários

### Frontend
- Abrir um perfil Empresa existente, fazer upload de foto, confirmar que aparece na lista de perfis e no header ao selecioná-lo como ativo.
- Repetir para um perfil Pessoal.
- Remover a foto de um perfil e confirmar que volta a mostrar iniciais em todos os lugares (lista, header).
- Confirmar que a lista de Categorias/Cartões/Sócios (outros consumidores de `ConfigListRow`) não muda visualmente.

### Backend
- `PUT /api/perfis/:id/photo` com `{ foto: "<base64>" }` e com `{ foto: null }` (remoção).
- `PUT /api/perfis/:id/photo` com um `:id` que não pertence ao usuário autenticado — deve falhar.
- `GET /api/perfis` retorna o campo `foto` corretamente após o upload.

### E2E
- Fluxo completo: criar perfil Empresa → editar → enviar foto → trocar de perfil ativo no header → confirmar que a foto aparece → remover foto → confirmar fallback para iniciais.

## Comandos de validação sugeridos

```bash
cd backend && npm run build
npx tsc --noEmit -p .
npx vite build
```

## Riscos e pontos de atenção

- `PerfisTab.tsx` e `AccountProfileMenu.tsx` têm edição concorrente com a outra sessão (`feat/R/unificar-conta-perfis`, trabalho não commitado) — a implementação deve tocar a menor área possível desses arquivos e ser revisada contra o estado mais recente deles antes de aplicar, para minimizar risco de conflito ou sobrescrita.
- Migration em produção — banco pode estar apontando para produção; só executar com confirmação explícita separada.
- Base64 na coluna `foto` de cada perfil aumenta o payload de `GET /api/perfis` (que retorna todos os perfis ativos de uma vez) — mesmo trade-off já aceito para `usuarios.photo`, não é um risco novo introduzido por esta feature, mas escala com o número de perfis do usuário.
- Reaproveitar `getInitials` em `ConfigListRow.tsx` pode exigir extrair essa função para um util compartilhado (hoje vive só dentro de `AccountProfileMenu.tsx`) — avaliar na implementação se a extração é proporcional ao escopo, ou se uma duplicação pontual pequena é aceitável.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — as duas decisões de exibição (lista de perfis e header) já foram confirmadas pelo usuário antes deste plano.

## Critérios de aceite do plano

- [ ] `perfis.foto` existe em produção (após migration confirmada separadamente).
- [ ] `PUT /api/perfis/:id/photo` grava e remove a foto corretamente, validando propriedade do perfil.
- [ ] `GET /api/perfis` retorna `foto` para cada perfil.
- [ ] `PerfilDialog` mostra a opção de upload de foto tanto para a Conta quanto para perfis normais (Pessoal/Empresa).
- [ ] A lista de perfis exibe avatar (foto ou iniciais) por linha.
- [ ] O avatar do perfil ativo no header (`AccountProfileMenu`) reflete a foto do perfil quando existir, com fallback para iniciais.
- [ ] Outros consumidores de `ConfigListRow` (Categorias, Cartões, Sócios, etc.) permanecem visualmente inalterados.
- [ ] Build de frontend e backend passam sem erros novos.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Antes de editar `PerfisTab.tsx` e `AccountProfileMenu.tsx`, reler o estado atual desses arquivos no disco (podem ter mudado desde este planejamento, por causa do trabalho concorrente da outra sessão) e aplicar as mudanças da forma menos invasiva possível sobre o que já estiver lá.
- Seguir exatamente o padrão de `PUT /current/photo` (`users.ts`) para a nova rota de perfil — não inventar um formato de payload novo.
- Nunca aplicar a migration desta feature contra produção sem confirmação explícita separada, mesmo com este plano aprovado.
- Não corrigir nem alterar nada da feature de unificação conta-perfis que não seja estritamente necessário para plugar a foto.
