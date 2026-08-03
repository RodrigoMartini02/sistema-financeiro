---
name: implementar
description: "Implementa no FinGerence um plano aprovado em .plans/*.md. Use após /planejar e aprovação do usuário; não faz commit, push, PR, staging ou deploy."
---

# Implementar

Transforme um plano aprovado em alterações pequenas e verificáveis no FinGerence.

## Pré-condição

Só implemente após aprovação explícita do usuário sobre um plano em `.plans/*.md` ou plano colado no chat.

## Leitura Obrigatória

1. Ler o plano completo.
2. Ler `AGENT.md` e `CLAUDE.md`.
3. Inspecionar os arquivos citados no plano.
4. Identificar padrões existentes antes de criar novos componentes, hooks, rotas, services ou helpers.

## Regras do Projeto

- Não existe PR nem staging.
- Não criar branch obrigatória.
- Não fazer commit.
- Não fazer push.
- Não mandar para produção.
- Não alterar `.env`, secrets, CI/CD ou Render sem pedido explícito.
- Não executar migrations, seeds ou comandos que escrevam no banco sem confirmação explícita.
- O banco pode estar apontando para produção; sempre tratar operações de banco como sensíveis.
- Manter escopo pequeno e fiel ao plano.
- Não fazer refactor oportunista.

## Cuidados Técnicos

### Frontend

- Seguir padrões atuais em `src/`, `css/`, `js/` e `public/`.
- Preservar rotas públicas e privadas.
- Não expor dados da área autenticada em páginas públicas.
- Validar SEO somente nas páginas públicas.

### Backend

- Usar Drizzle para queries novas quando aplicável.
- Garantir filtro de tenant/prefeitura em dados tenant-specific.
- Não confiar em tenant vindo livremente do client.
- Não vazar dados sensíveis em erros ou logs.
- Evitar N+1 e queries amplas em relatórios.

### Banco de Dados

- Não editar migrations antigas aplicadas.
- Não executar migrations automaticamente.
- Parar e pedir confirmação antes de qualquer operação que altere schema ou dados.

## Validações

Rodar apenas comandos existentes no `package.json` ou nos packages relevantes. Exemplos possíveis:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Se um script não existir, registrar no resumo. Se falhar, explicar a falha e não mascarar o resultado.

## Saída Final

Responder com:

- O que foi implementado.
- Arquivos alterados.
- Validações executadas e resultados.
- Riscos ou pendências.
- Aviso claro de que nada foi enviado para produção.