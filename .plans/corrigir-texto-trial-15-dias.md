# Plano de Implementação: Corrigir texto de marketing "60 dias" para "15 dias"

## Origem

- Pedido direto do usuário: "alterar todo e qualquer lugar, o teste grátis de 60 para 15 dias"
- Data do planejamento: 2026-07-12
- Classificação: `frontend-only`

## Resumo

A lógica real que aplica o período de teste grátis (`backend/src/routes/plans.ts:10`, `TRIAL_DAYS = 15`, e o cron de cobrança criado nesta sessão) já usa 15 dias — confirmado inclusive no cron legado via histórico do git, ou seja, essa é uma inconsistência pré-existente, não introduzida hoje. O que está desatualizado é só o texto de marketing nas páginas públicas (`HomePage.tsx`, `PlanosPage.tsx`), que ainda promete "60 dias grátis".

## Escopo

### Dentro do escopo

Atualizar os 7 textos abaixo, de "60 dias" para "15 dias":

- `src/screens/public/HomePage.tsx:120` — "60 dias grátis — sem cartão de crédito."
- `src/screens/public/HomePage.tsx:128` — "Começar — 60 dias grátis"
- `src/screens/public/PlanosPage.tsx:60` — "...use o sistema completo por 60 dias."
- `src/screens/public/PlanosPage.tsx:61` — "O que acontece depois dos 60 dias de avaliação?"
- `src/screens/public/PlanosPage.tsx:78` — `description="60 dias grátis ao criar conta..."`
- `src/screens/public/PlanosPage.tsx:85` — "Todos os planos incluem 60 dias grátis..."
- `src/screens/public/PlanosPage.tsx:204` — "60 dias grátis para explorar tudo."

### Fora do escopo

- Qualquer lógica de backend (`plans.ts`, `cobrancas.ts`) — já está correta em 15 dias, não será tocada.
- Templates de e-mail do EmailJS — configurados na plataforma externa do EmailJS, fora deste repositório. Fica como item para o usuário verificar manualmente fora deste plano.
- `TermosModal.tsx` e demais páginas públicas (`LandingPage.tsx`, `SobrePage.tsx`, `ContatoPage.tsx`, `FuncionalidadesPage.tsx`) — confirmado via busca que não mencionam "60 dias".

## Leitura de contexto

- Busca completa por "60" em `backend/src` e `src` (frontend), cruzada com contexto de trial/dias/grátis
- `backend/src/routes/plans.ts` (confirma `TRIAL_DAYS = 15` já correto)
- `backend/src/cron/cobrancas.ts` (confirma `TRIAL_DURACAO_DIAS = 15` já correto)
- Histórico do git (`git show` do cron legado) — confirma que o valor 15 já existia antes da migração para TypeScript

## Impacto por área

### Frontend

Troca de texto estático em `HomePage.tsx` e `PlanosPage.tsx`. Sem mudança de lógica, estado, hooks ou componentes.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/public/HomePage.tsx`
- `src/screens/public/PlanosPage.tsx`

## Estratégia de implementação

1. Substituir os 7 textos listados, trocando "60" por "15".
2. Rodar `npx vite build` para validar.

## Regras de negócio identificadas

O período de teste grátis é de 15 dias (já era a regra real aplicada pelo backend; o texto só estava desatualizado).

## Regras multi-tenant e segurança

Não aplicável.

## Validações necessárias

Nenhuma além da build — mudança de texto estático.

## Testes necessários

### Frontend

- Conferir visualmente a Home e a página de Planos após a build.

## Comandos de validação sugeridos

```bash
npx vite build
```

## Riscos e pontos de atenção

- Nenhum risco técnico — mudança de texto isolada.
- Fora do alcance deste repositório: verificar manualmente se algum template de e-mail do EmailJS (boas-vindas, cobrança) menciona "60 dias".

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Nenhum texto visível nas páginas públicas menciona mais "60 dias" em relação ao teste grátis.
- `npx vite build` passa sem erros.

## Observações para a skill implementar

- Mudança pequena e isolada — apenas os 7 textos listados.
- Isolar o commit de qualquer alteração pendente não relacionada já presente no working tree.
