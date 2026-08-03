---
name: criar-task
description: "Cria uma task técnica para o projeto FinGerence a partir de uma descrição livre. Use quando o usuário pedir para criar task, registrar escopo, preparar demanda para /planejar ou organizar uma melhoria antes do plano."
---

# Criar Task

Crie uma task em Markdown para orientar o planejamento técnico do FinGerence.

## Contexto do Projeto

- Projeto: FinGerence.
- Estrutura principal: React + TypeScript + Vite + Tailwind no frontend; Express + TypeScript + PostgreSQL/Drizzle no backend.
- Fluxo local obrigatório: `/criar-task` -> `/planejar` -> aprovação -> `/implementar` -> `/finalizar`.
- Não existe PR nem branch `staging` neste projeto.
- O trabalho é feito por um único desenvolvedor.
- Produção roda no Render; qualquer ação que envie para produção deve pedir confirmação explícita.
- Nunca alterar `.env`, secrets ou executar migrations sem confirmação explícita.

## Antes de Escrever

1. Ler `AGENT.md` e `CLAUDE.md` na raiz, quando existirem.
2. Se a descrição citar arquivos, páginas, endpoints, tabelas ou fluxos, inspecionar o projeto antes de listar caminhos.
3. Não implementar código.
4. Não criar plano de execução detalhado.
5. Salvar a task somente se o usuário pedir ou aprovar.

## Local de Saída

Salvar tasks em:

```txt
.plans/tasks/{slug-da-task}.md
```

Se a pasta não existir, ela pode ser criada.

## Formato da Task

```md
# Task: <título curto>

## Contexto

<Contexto factual do problema ou melhoria.>

## Problema

<O que precisa ser resolvido e por que importa.>

## Objetivo

<O resultado esperado, sem detalhar implementação.>

## Escopo

### Dentro do escopo

- ...

### Fora do escopo inicial

- ...

## Impacto Previsto

### Frontend

- ... ou `Sem impacto frontend identificado inicialmente.`

### Backend

- ... ou `Sem impacto backend identificado inicialmente.`

### Banco de Dados

- ... ou `Sem alteração de banco identificada inicialmente.`

### Infra/Deploy

- ... ou `Sem impacto de infra/deploy identificado inicialmente.`

## Segurança e Dados

- Considerar autenticação, autorização, dados sensíveis e isolamento quando aplicável.
- Nunca executar migrations sem confirmação explícita.
- Nunca alterar `.env`.

## Arquivos Provavelmente Afetados

Liste apenas caminhos verificados. Se não houver certeza, escreva `A identificar durante o planejamento`.

## Critérios de Aceite

- Critério verificável 1.
- Critério verificável 2.
- Critério verificável 3.

## Perguntas Para o Planejamento

- ...

## Instruções Para /planejar

- Usar esta task como especificação de entrada.
- Ler `AGENT.md` e `CLAUDE.md`.
- Inspecionar arquivos citados antes de propor alterações.
- Gerar plano em `.plans/`.
- Não implementar código durante o planejamento.
- Não assumir staging ou PR.
```

## Saída

Apresente o caminho do arquivo criado e um resumo curto do escopo registrado.