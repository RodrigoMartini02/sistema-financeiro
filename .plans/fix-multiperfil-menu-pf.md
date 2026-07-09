# Plano de Implementação: Correções Multi-perfil e Menu PF

## Origem

- Arquivo de especificação: conversa — análise de pendências (2026-06-25)
- Data do planejamento: `2026-06-25`
- Classificação: `fullstack`

## Resumo

Corrige dois problemas identificados em revisão de pendências:

1. **Backend** — endpoint `PUT /cartoes` (bulk, sem ID) apaga todos os cartões do usuário sem respeitar `perfil_id`, risco de corrupção em multi-perfil. Endpoint não tem cliente ativo; solução é removê-lo.
2. **Frontend** — menu de Configurações exibe Representantes e Sócios para perfis do tipo `pessoal` (PF), o que não faz sentido pois esses recursos são exclusivos de perfis empresa.

Nenhuma migration é necessária — colunas `perfil_id` já existem nas tabelas afetadas.

## Escopo

### Dentro do escopo

- Remover o endpoint `PUT /` bulk de `backend/routes/cartoes.js`
- Salvar `perfilAtivoTipo` no localStorage ao trocar perfil (via `PerfilSwitcher`)
- Derivar o tipo do perfil ativo no mount/render
- Ocultar itens `representantes` e `socios` do submenu de Configurações quando perfil ativo for `pessoal`

### Fora do escopo

- Correção de `PUT /socios/:id` — `perfil_id` é imutável após criação, comportamento atual está correto
- Correção de `PUT /representantes/:id` — mesma razão
- `GET /representantes` — filtro `?perfil_id` já implementado corretamente
- "Minha conta" como hub — feature nova sem especificação aprovada
- Execução de migrations — nenhuma necessária

## Leitura de contexto

- `/AGENT.md`
- `backend/routes/cartoes.js`
- `backend/routes/socios.js`
- `backend/routes/representantes.js`
- `src/layout/AppShell.tsx`
- `src/screens/config/ConfigScreen.tsx`
- `src/services/configService.ts`
- `js/configuracao.js` (para confirmar que `salvarCartoes()` é stub — bulk PUT não é chamado)

## Impacto por área

### Frontend

**Arquivo:** `src/layout/AppShell.tsx`

Três mudanças no componente `PerfilSwitcher` e na renderização do submenu de Configurações:

1. **`select()`** — ao trocar de perfil, além de salvar `perfilAtivoId` e `perfilAtivoNome`, salvar também `perfilAtivoTipo` usando os dados do perfil selecionado (`p.tipo`).

2. **Derivar tipo no mount** — no render de `PerfilSwitcher`, calcular `activeTipo` a partir de `perfis.data` (usando `activePerfil?.tipo`) com fallback para `localStorage.getItem('perfilAtivoTipo') ?? 'pessoal'`. Expor esse valor para o contexto do submenu.

3. **Filtrar `CONFIG_SUBS`** — no bloco `{configOpen && ...}` de `AppShell`, filtrar o array antes de renderizar:
   ```tsx
   const visibleSubs = CONFIG_SUBS.filter((sub) => {
     if (sub.id === 'representantes' || sub.id === 'socios') {
       return perfilAtivoTipo !== 'pessoal';
     }
     return true;
   });
   ```
   Usar `visibleSubs.map(...)` no lugar de `CONFIG_SUBS.map(...)`.

**Comportamento esperado:**
- Perfil `pessoal`: Representantes e Sócios não aparecem no menu
- Perfil `empresa`: todos os itens aparecem normalmente
- Sessão sem `perfilAtivoTipo` no localStorage (usuário antigo): exibe tudo por padrão (fallback seguro)
- Trocar de perfil via `PerfilSwitcher` → `window.location.reload()` já existente recarrega o menu com o tipo correto

### Backend

**Arquivo:** `backend/routes/cartoes.js`

Remover o bloco do endpoint `router.put('/', ...)` (linhas 121–238 na versão atual).

Esse endpoint:
- Fazia `DELETE FROM cartoes WHERE usuario_id = $1` sem filtrar `perfil_id`
- Não é chamado por nenhum cliente (React usa `POST /cartoes` e `PUT /cartoes/:id`; o JS antigo tem `salvarCartoes()` como stub que retorna `true`)
- Representa risco de corrupção de dados se chamado diretamente

Após remover, os endpoints restantes de cartões ficam: `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id` — todos corretos.

### Banco de dados

Sem impacto esperado. Nenhuma migration necessária.

### Infra/Deploy

Sem impacto esperado. Nenhuma variável de ambiente nova.

## Arquivos provavelmente afetados

- `backend/routes/cartoes.js` — remover linhas 121–238 (endpoint `PUT /` bulk)
- `src/layout/AppShell.tsx` — `PerfilSwitcher` + filtro `CONFIG_SUBS` no submenu

## Estratégia de implementação

1. **Remover endpoint bulk** em `backend/routes/cartoes.js`
   - Deletar o bloco `router.put('/', authMiddleware, async (req, res) => { ... })` completo
   - Confirmar que os endpoints `POST /` e `PUT /:id` permanecem intactos

2. **Salvar `perfilAtivoTipo` ao trocar perfil** em `AppShell.tsx`
   - Em `PerfilSwitcher.select()`, adicionar `localStorage.setItem('perfilAtivoTipo', ...)` com o `tipo` do perfil selecionado

3. **Derivar tipo do perfil ativo no mount** em `AppShell.tsx`
   - Calcular `activeTipo` dentro de `PerfilSwitcher` (ou `AppShell`) a partir de `perfis.data` + `activeId`
   - Propagar o valor via prop, state ou leitura direta do localStorage no render de `AppShell`

4. **Filtrar `CONFIG_SUBS`** no render do submenu
   - Criar `visibleSubs` filtrado pela condição de tipo
   - Substituir `CONFIG_SUBS.map` por `visibleSubs.map` no JSX

5. **Validar** com `npm run build` + `npm run typecheck`

## Regras de negócio identificadas

- Perfil `pessoal` (PF) não possui sócios nem representantes
- Perfil `empresa` (PJ) pode ter sócios e representantes
- O `perfil_id` de um sócio ou representante é definido na criação e não pode ser alterado via API — imutabilidade por design
- Se `perfilAtivoTipo` não estiver no localStorage, exibir todos os itens do menu (comportamento mais seguro que esconder por padrão)

## Regras multi-tenant e segurança

- O `usuario_id` nos endpoints de cartões vem sempre de `req.usuario.id` (JWT validado) — não do client
- A remoção do bulk `PUT /` elimina o único endpoint que fazia DELETE sem filtro de perfil
- O filtro de menu é apenas UX — o backend já protege os dados por `usuario_id` + `perfil_id` nas queries

## Validações necessárias

- Frontend: nenhuma validação de formulário nova
- Backend: após remover o endpoint, garantir que nenhum `require`/`import` referencia a função removida

## Testes necessários

### Frontend

- Verificar com perfil `pessoal` ativo: menu não exibe Representantes nem Sócios
- Verificar com perfil `empresa` ativo: menu exibe todos os itens
- Verificar troca de perfil: recarregamento atualiza o menu corretamente
- Verificar sessão sem `perfilAtivoTipo` no localStorage: menu exibe tudo

### Backend

- `PUT /api/cartoes` (sem ID) deve retornar 404 após remoção
- `POST /api/cartoes` e `PUT /api/cartoes/:id` devem continuar funcionando normalmente

### E2E

- Não aplicável para este escopo

## Comandos de validação sugeridos

```bash
npm run build
npm run typecheck
```

## Riscos e pontos de atenção

- **Risco baixo — endpoint bulk:** Confirmar que não há script externo, integração ou postman collection chamando `PUT /api/cartoes` sem ID. Se houver, o chamador receberá 404.
- **Risco mínimo — sessões abertas:** Usuários com sessão iniciada antes desta mudança não terão `perfilAtivoTipo` no localStorage. O fallback "exibir tudo" cobre esse caso sem quebrar a UX.
- **Sem risco de regressão** no fluxo de cartões — os endpoints individuais (POST, PUT/:id, DELETE/:id) não são tocados.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- `PUT /api/cartoes` (sem ID no path) retorna 404
- `POST /api/cartoes` e `PUT /api/cartoes/:id` funcionam normalmente
- Menu de Configurações com perfil `pessoal` ativo não exibe Representantes nem Sócios
- Menu de Configurações com perfil `empresa` ativo exibe todos os itens
- Trocar de perfil atualiza os itens do menu (via reload já existente)
- `npm run build` e `npm run typecheck` passam sem erros

## Observações para a skill implementar

- Seguir `/AGENT.md` — código explícito, sem abstrações desnecessárias.
- A remoção do endpoint é cirúrgica: deletar apenas o bloco `router.put('/', ...)` sem tocar nos demais.
- O filtro de `CONFIG_SUBS` deve ser calculado no render, não hardcoded num novo array estático.
- Não executar migrations — nenhuma é necessária.
- Não alterar `.env`.
- Não abrir PR sem instrução explícita do usuário.
