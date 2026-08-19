# Plano de Implementação: Corrigir paths quebrados (planos e toggle categoria)

## Origem

- Arquivo de especificação: não há `.md` de feature — origem é investigação de bug encontrada durante auditoria `/limpar` do backend unificado (rotas/schema), nesta mesma sessão.
- Data do planejamento: 2026-08-19
- Classificação: `fullstack` (frontend + backend), sem impacto em banco de dados

## Resumo

Quatro chamadas de API do frontend usam paths que o backend nunca definiu, causando 404 em produção:

1. Assinatura de plano via checkout redirecionado (Pix/link Mercado Pago) — frontend chama `/planos/assinar`, backend define `/subscribe`
2. Pagamento com cartão tokenizado — frontend chama `/planos/pagar-cartao`, backend define `/pay-card`
3. Assinatura recorrente (débito automático) — frontend chama `/planos/assinar-recorrente`, backend define `/subscribe-recurring`
4. Ativar/desativar categoria — frontend chama `/categorias/:id/toggle-ativo`, backend define `/toggle-active`

A lógica de cada handler backend bate perfeitamente com o que a tela espera (payload, resposta) — não é bug de lógica de negócio, é puramente mismatch de string de rota. Provavelmente introduzido numa refatoração anterior que padronizou nomes de rota em inglês no backend sem atualizar os callers do frontend.

## Escopo

### Dentro do escopo

- Corrigir as 4 strings de chamada de API no frontend para bater com os paths já existentes no backend
- Validar com typecheck que nada mais foi afetado

### Fora do escopo

- Qualquer alteração no backend (`plans.ts`, `categories.ts`) — paths do backend ficam como estão
- Qualquer alteração em `notification_url` do webhook Mercado Pago (não relacionado a este bug)
- Qualquer outra rota/endpoint fora dos 4 identificados
- Migrations ou schema de banco (não há impacto)
- Limpeza adicional de dead code (tratada separadamente na sessão de `/limpar`)

## Leitura de contexto

- `sistema financas/AGENT.md` — lido. Nota: este AGENT.md descreve um "sistema multi-prefeitura com RLS", mas o domínio real do projeto (usuarios, perfis, planos, categorias, Mercado Pago pessoa física) não corresponde a esse contexto — parece ser um AGENT.md genérico não específico a este projeto. As regras gerais de código (nomes claros, evitar `any`, early return, não usar catch silencioso) foram consideradas; as regras de tenant/RLS não se aplicam pois não há tabela/campo de tenant identificado no schema revisado.
- `sistema financas/frontend/AGENT.md` — não existe como arquivo dedicado (projeto não usa subpasta `frontend/`; o frontend fica na raiz em `src/`).
- `sistema financas/backend/AGENT.md` — não existe como arquivo dedicado (apenas o `AGENT.md` da raiz cobre todo o repositório).
- Investigação de código: `src/screens/planos/PlanosScreen.tsx`, `src/services/configService.ts`, `backend/src/routes/plans.ts`, `backend/src/routes/categories.ts` — lidos integralmente para confirmar o mismatch e validar que a lógica dos handlers corresponde ao que cada tela espera.
- `git log`/`git show` em `PlanosScreen.tsx` — não foi conclusivo para identificar o commit exato que introduziu a divergência; não é necessário para a correção.

## Impacto por área

### Frontend

Arquivo `src/screens/planos/PlanosScreen.tsx`:
- Linha ~252 (dentro de `handleSubmit`, fluxo `mode === 'one-time'`): `apiRequest<any>('/planos/pagar-cartao', ...)` → trocar para `'/planos/pay-card'`
- Linha ~259 (mesmo `handleSubmit`, fluxo `else`/recorrente): `apiRequest<any>('/planos/assinar-recorrente', ...)` → trocar para `'/planos/subscribe-recurring'`
- Linha ~360 (dentro de `checkoutMut`/`CheckoutRedirectPanel`): `apiRequest<any>('/planos/assinar', ...)` → trocar para `'/planos/subscribe'`

Arquivo `src/services/configService.ts`:
- Linha 25 (`toggleCategoria`): `apiRequest<void>(\`/categorias/${id}/toggle-ativo\`, ...)` → trocar para `\`/categorias/${id}/toggle-active\``

Nenhuma mudança em tipos, payload, hooks, query keys ou componentes — apenas a string do path em cada chamada.

Sem impacto em telas adicionais, testes automatizados (não há suíte cobrindo esses fluxos), ou estados de loading/error/empty (já existentes e corretos).

### Backend

Sem impacto esperado. As rotas `/subscribe`, `/pay-card`, `/subscribe-recurring` (em `plans.ts`) e `/toggle-active` (em `categories.ts`) já existem, já implementam a lógica correta, e não serão alteradas.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado. Nenhuma env var, build, job ou worker envolvido.

## Arquivos provavelmente afetados

- `sistema financas/src/screens/planos/PlanosScreen.tsx`
- `sistema financas/src/services/configService.ts`

## Estratégia de implementação

1. Abrir `PlanosScreen.tsx` e corrigir a string do path na linha ~252 (`/planos/pagar-cartao` → `/planos/pay-card`).
2. Corrigir a string do path na linha ~259 (`/planos/assinar-recorrente` → `/planos/subscribe-recurring`).
3. Corrigir a string do path na linha ~360 (`/planos/assinar` → `/planos/subscribe`).
4. Abrir `configService.ts` e corrigir a string do path na linha 25 (`/categorias/${id}/toggle-ativo` → `/categorias/${id}/toggle-active`).
5. Rodar typecheck do frontend (`npm run typecheck` ou equivalente) para confirmar que nada quebrou.
6. Reportar ao usuário quais 4 linhas foram alteradas, resultado do typecheck, e recomendar teste manual dos fluxos de pagamento antes de considerar resolvido em produção.

## Regras de negócio identificadas

- Fluxo "one-time" (pagamento único com cartão tokenizado) deve chamar o endpoint de cobrança direta com `card_token`, `installments`, `cpf`.
- Fluxo recorrente (débito automático) deve chamar o endpoint de assinatura recorrente com `card_token`.
- Fluxo de checkout redirecionado (Pix/boleto/link) deve chamar o endpoint que gera `payment_url` via Mercado Pago Preference.
- Toggle de categoria deve alternar o campo `ativo`/`active` da categoria via PATCH.

Nenhuma regra de negócio nova — apenas restaurar o comportamento já implementado nos dois lados, que está atualmente desconectado por causa do mismatch de string.

## Regras multi-tenant e segurança

Não aplicável — não foi identificado campo de tenant/prefeitura nas rotas ou tabelas envolvidas (`usuarios`, `planos`, `categorias`). Ver nota em "Leitura de contexto" sobre o AGENT.md genérico.

Nenhuma mudança de autenticação/autorização — as 4 rotas backend já usam `authenticate` como estão hoje; a correção não adiciona nem remove middleware.

## Validações necessárias

- Nenhuma validação de schema/payload nova — os payloads enviados pelo frontend já correspondem ao que cada handler backend espera (confirmado na investigação: `card_token`/`installments`/`cpf` para pay-card; `card_token` para subscribe-recurring; `tipo`/`forma_pagamento` para subscribe).

## Testes necessários

### Frontend

- Nenhum teste automatizado existente cobre esses fluxos (não encontrada suíte para `PlanosScreen.tsx` ou `configService.ts`).

### Backend

- Sem impacto — nenhuma mudança no backend.

### E2E

- Teste manual recomendado após a correção, antes de considerar resolvido:
  - Testar assinatura via Pix/checkout redirecionado (mensal e anual)
  - Testar pagamento único com cartão tokenizado
  - Testar assinatura recorrente com cartão
  - Testar toggle de ativar/desativar categoria

## Comandos de validação sugeridos

```bash
npm run typecheck
npm run build
```

(ajustar conforme scripts reais do `package.json` da raiz do frontend, a confirmar durante `/implementar` se o nome do script divergir)

## Riscos e pontos de atenção

- Risco baixo: mudança de 4 strings literais, sem alteração de lógica, tipos, payload ou contrato de dados.
- Atenção: são fluxos de pagamento real (Mercado Pago) — recomenda-se teste manual antes de considerar o bug resolvido em produção, já que não há cobertura de teste automatizado.
- Nenhum risco de afetar o webhook do Mercado Pago (`notification_url` aponta para `/api/plans/webhook`, que não é um dos 4 paths corrigidos).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- As 4 chamadas de API no frontend (`PlanosScreen.tsx` x3, `configService.ts` x1) usam exatamente os mesmos paths definidos no backend (`/subscribe`, `/pay-card`, `/subscribe-recurring`, `/toggle-active`).
- Nenhum outro path de API foi alterado.
- Typecheck do frontend passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto — não há `.md` de especificação de feature associado, a origem é a investigação descrita no resumo.
- Não executar migrations (não aplicável a este plano, mas reforçando a regra padrão do projeto).
- Seguir o `AGENT.md` da raiz para convenções gerais de código, ignorando as seções de multi-tenant/RLS que não se aplicam a este projeto (ver nota em "Leitura de contexto").
- Manter a alteração mínima: apenas as 4 strings de path, nenhum refactor adicional.
- Rodar typecheck/build ao final e reportar resultado.
