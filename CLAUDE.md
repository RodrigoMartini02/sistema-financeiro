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
4. /finalizar  →  commit + push + perguntar sobre merge em main
```

---

## O que constitui autorização explícita

O usuário deve responder com algo como:

- "sim"
- "pode"
- "faça isso"
- "aprovado"
- "implementa"
- `/implementar`

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

A única exceção são alterações em arquivos de plano (`.plans/`) e memória (`.claude/`), que podem ser feitas sem aprovação de código, pois são documentos de trabalho, não código de produção.

---

## Contexto do projeto

- Frontend React + TypeScript + Vite + Tailwind
- Backend Express.js + TypeScript + PostgreSQL
- O banco pode estar apontando para produção — nunca assuma ambiente local
- Skills disponíveis: `/planejar`, `/implementar`, `/finalizar`, `/run`
- Nunca alterar `.env`
- Nunca executar migrations sem confirmação explícita
