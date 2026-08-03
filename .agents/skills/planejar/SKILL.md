---
name: planejar
description: "Planeja uma implementação no FinGerence a partir de uma task ou arquivo Markdown. Use antes de qualquer alteração de código, banco ou configuração; gera plano em .plans/ após aprovação do usuário."
---

# Planejar

Planeje mudanças no FinGerence antes de qualquer implementação.

## Regra Principal

Nunca codar nesta etapa. A skill apenas analisa, propõe e, após aprovação, salva um plano em `.plans/`.

Fluxo do projeto:

```txt
/criar-task -> /planejar -> aprovação -> /implementar -> /finalizar
```

Não existe PR nem staging. O projeto é conduzido por um único desenvolvedor. Produção é no Render e qualquer envio para produção exige confirmação explícita.

## Entrada Esperada

- Um arquivo em `.plans/tasks/*.md`.
- Um Markdown fornecido pelo usuário.
- Uma descrição clara do problema, se ainda não houver task.

## Leitura Obrigatória

1. Ler `AGENT.md` e `CLAUDE.md`.
2. Ler a task/arquivo informado.
3. Inspecionar arquivos citados antes de listar caminhos no plano.
4. Se houver frontend, mapear padrões em `src/`, `css/`, `js/`, `public/` ou estrutura equivalente.
5. Se houver backend, mapear padrões em `backend/` e respeitar multi-tenant, Drizzle, RLS e segurança.

## Regras

- Não implementar código.
- Não alterar arquivos fora de `.plans/`.
- Não executar migrations.
- Não alterar `.env`.
- Não assumir ambiente local quando houver banco.
- Não propor PR, staging ou fluxo de branch obrigatório.
- Para deploy/produção, planejar apenas a confirmação necessária.

## Plano Preliminar

Antes de salvar, apresente ao usuário:

- Classificação: `frontend-only`, `backend-only`, `fullstack`, `database`, `infra/deploy`, `documentação` ou combinação.
- Resumo da solução.
- Escopo dentro e fora.
- Arquivos provavelmente afetados, apenas se verificados.
- Riscos de segurança, dados, banco e produção.
- Validações sugeridas.
- Perguntas em aberto.

Pergunte se pode salvar o plano.

## Local de Saída

Após aprovação explícita, salvar em:

```txt
.plans/{slug-do-plano}.md
```

## Estrutura do Plano

```md
# Plano: <título>

## Origem

- Task/arquivo de origem: `<caminho ou descrição>`
- Classificação: `<tipo>`

## Resumo

## Escopo

### Dentro do escopo

### Fora do escopo

## Leitura de Contexto

## Impacto por Área

### Frontend
### Backend
### Banco de Dados
### Infra/Deploy

## Arquivos Provavelmente Afetados

## Estratégia de Implementação

## Segurança, Dados e Multi-Tenant

## Validações Necessárias

## Testes Recomendados

## Riscos e Pontos de Atenção

## Perguntas em Aberto

## Critérios de Aceite

## Instruções Para /implementar
```

## Saída

Se não aprovado, responda com o plano preliminar. Se aprovado, informe o caminho salvo.