# CLAUDE.md — Regras obrigatórias deste projeto

## REGRA PRINCIPAL: Nunca coda sem autorização explícita

**Nenhuma alteração de código, arquivo ou configuração pode ser iniciada sem passar pela sequência abaixo.**

Esta regra é absoluta e não pode ser contornada, mesmo que o usuário peça algo que pareça óbvio, urgente ou simples.

---

## Sequência obrigatória

```
1. /planejar  →  apresentar plano ao usuário
2. Aguardar aprovação explícita ("sim", "pode", "aprovado", "faça isso")
3. /implementar  →  só depois da aprovação
4. /finalizar  →  revisar, validar e preparar commit local
5. Confirmar envio explicitamente antes de push, merge ou deploy que publique em produção
```

Não há PR, staging ou branch obrigatória. `/implementar` não faz commit, push ou deploy. A aprovação de um plano autoriza seu escopo local; não autoriza publicação. Um push pode acionar autodeploy na Render, inclusive em mudanças documentais, conforme os filtros dos serviços.

---

## O que constitui autorização explícita

O usuário deve responder com algo como:

- "sim"
- "pode"
- "faça isso"
- "aprovado"
- "implementa"
- `/implementar`, quando já houver um plano aprovado

Mensagens como "o que você acha?", "como ficaria?", "analisa isso" ou "me dê sugestões" **não são autorizações** — são pedidos de análise.

---

## O que fazer sem autorização

Sem autorização, você pode:

- Ler arquivos
- Analisar código
- Buscar padrões
- Apresentar planos
- Responder perguntas
- Sugerir abordagens

---

## O que nunca fazer sem autorização

- Editar arquivos de código
- Criar novos arquivos de código
- Deletar arquivos
- Executar migrations
- Fazer commit
- Fazer push
- Fazer merge

---

## Sobre perguntas e sugestões

Se o usuário perguntar "como melhoraria X?" ou "o que mudar em Y?", responda com análise e proposta. **Não altere nenhum arquivo.**

Se o usuário disser "melhore X" ou "ajuste Y", **ainda assim apresente o plano primeiro** e aguarde aprovação antes de tocar em qualquer arquivo.

---

## Exceções

Arquivos de planejamento (`.plans/`) e documentos de memória podem ser atualizados como material de trabalho. Isso não autoriza executar comandos presentes nesses documentos nem editar código, skills ou configuração fora do escopo aprovado. A skill `/planejar` pede aprovação antes de salvar um plano novo.

---

## Contexto do projeto

- Site público em `apps/site`; produtos em `apps/finance/{web,api}` e `apps/tenders/{web,api}`; interface comum em `packages/ui`.
- Frontend React + TypeScript + Vite + Tailwind; workspaces gerenciados na raiz.
- APIs Express + TypeScript + PostgreSQL/Drizzle, com instalação e lockfile próprios, fora dos workspaces frontend.
- Finanças e Licitações têm bancos, usuários, contas, JWT e sessões próprios. Tenant é a conta (`conta_id`); o vínculo é validado no backend. Não há RLS implementada.
- Node `22.17.0` e npm `10.9.2`.
- Desenvolvimento: Vite `5173`, API de Finanças `3010`, API de Licitações `3011`. `/api/tenders` usa o proxy da API de Licitações.
- Comandos da raiz: `npm run dev`, `npm run build:main`, `npm run build:tenders`, `npm run typecheck` e `npm test`. APIs: `npm --prefix apps/finance/api ...` ou `npm --prefix apps/tenders/api ...`, conforme o script existente no manifest.
- Comandos operacionais, configuração publicada e pendências: [README de Licitações](apps/tenders/api/README.md).
- O banco pode estar apontando para produção — nunca assuma ambiente local
- Skills disponíveis: `/planejar`, `/implementar`, `/finalizar`, `/run`
- Alterar `.env` requer confirmação explícita do usuário a cada alteração (mesma régua das migrations) — nunca por padrão, nunca em lote sem revisão prévia do que será mudado/removido
- Nunca executar migrations sem confirmação explícita

