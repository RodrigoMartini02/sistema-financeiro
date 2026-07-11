---
name: planejar
description: Planeja a implementação de uma solução a partir de um arquivo Markdown (.md). Use quando o usuário fornecer/linkar um .md com especificação, user story, requisitos, critérios de aceite, endpoints, UI/UX ou regras de negócio e pedir um plano de implementação antes de codar.
---


# Planejar implementação a partir de um .md

Planejamento é um processo iterativo.

A primeira versão do plano deve ser tratada como proposta de implementação e não como versão final.

O usuário deve ter oportunidade de revisar, corrigir, reduzir escopo ou adicionar requisitos antes que o plano seja persistido.

Você é responsável por planejar a implementação de uma feature antes de qualquer alteração de código.

Esta skill NÃO deve implementar código.

O objetivo é entender completamente o escopo, identificar impactos no monorepo e salvar um plano de implementação em um arquivo Markdown dentro de `.portal/plans/`.

---

## Entrada esperada

O usuário deve fornecer ou linkar um arquivo `.md` com o contexto da feature.

Exemplos:

```txt
/planejar FEATURE_FILE=docs/features/emissao-alvara.md
```

```txt
/planejar docs/features/novo-relatorio.md
```

```txt
Use a skill planejar com o arquivo docs/features/cadastro-contribuinte.md
```

---

## Regras obrigatórias

Antes de criar o plano:

1. Leia completamente o arquivo `.md` fornecido pelo usuário.
2. Leia o `AGENT.md` da raiz do projeto.
3. Identifique se a implementação exige alterações em:
   - frontend
   - backend
   - ambos
   - banco de dados
   - infra/deploy
   - documentação
   - testes
4. Se houver impacto no frontend, leia também `frontend/AGENT.md`.
5. Se houver impacto no backend, leia também `backend/AGENT.md`.
6. Se houver impacto em banco de dados, considere as regras do backend e as regras operacionais da raiz.
7. Não implemente código nesta etapa.
8. Não execute migrations.
9. Não altere arquivos fora da pasta `.portal/plans/`, a menos que o usuário peça explicitamente.
10. Crie um plano claro, revisável e usável pela skill `implementar`.

---

## Objetivo da análise

Ao ler a especificação, entenda:

- qual problema a feature resolve
- qual é o comportamento esperado
- quais usuários/roles são afetados
- quais telas são afetadas
- quais endpoints são necessários
- quais dados precisam ser lidos/criados/alterados
- se existe impacto multi-tenant/prefeitura
- se existe impacto em permissões/autorização
- se existe impacto em relatórios/PDFs
- se existe impacto em performance
- se existe impacto em deploy/env vars
- quais testes serão necessários
- quais riscos existem

---

## Leitura dos AGENT.md

A leitura dos AGENT.md deve seguir esta hierarquia:

1. `/AGENT.md`
   - regras globais
   - git flow
   - deploy
   - CI/CD
   - monorepo safety
   - staging/produção

2. `/frontend/AGENT.md`
   - somente se houver impacto no frontend
   - React
   - React Query
   - query keys
   - hooks
   - forms
   - UX
   - testes frontend

3. `/backend/AGENT.md`
   - somente se houver impacto no backend
   - multi-tenant
   - banco de dados
   - Drizzle
   - relatórios
   - PDFs
   - testes backend

Se a feature for fullstack, leia todos os AGENT.md relevantes.

---

## Análise de escopo

Classifique a feature como uma das opções:

```txt
frontend-only
backend-only
fullstack
backend + database
frontend + backend + database
infra/deploy
documentação
```

Explique o motivo da classificação.

---

## Investigação do projeto

Antes de escrever o plano, inspecione o projeto para encontrar padrões existentes.

Procure por:

- módulos similares
- rotas similares
- hooks similares
- schemas similares
- query keys similares
- services similares
- testes similares
- componentes reutilizáveis
- padrões de validação
- padrões de erro
- padrões de permissão
- padrões de relatório/PDF

Não invente uma arquitetura nova se já existir um padrão equivalente.

---

## Aprovação obrigatória antes de salvar

Após concluir a análise e gerar o plano preliminar, a skill NÃO deve criar imediatamente o arquivo em `.portal/plans/`.

Ela deve primeiro apresentar o plano ao usuário para revisão.

Fluxo obrigatório:

```txt
Ler contexto
→ Analisar projeto
→ Gerar plano preliminar
→ Apresentar plano ao usuário
→ Receber feedback
→ Ajustar plano se necessário
→ Solicitar aprovação explícita
→ Salvar arquivo
```

---

## Apresentação do plano

Antes de salvar qualquer arquivo, apresentar ao usuário:

### Classificação

Exemplo:

```txt
Classificação:
frontend + backend + database
```

### Resumo

Explicar brevemente:

* o que será implementado
* quais áreas serão afetadas
* quais riscos foram identificados

### Estratégia proposta

Apresentar as etapas principais.

Exemplo:

```txt
1. Ajustar schema
2. Criar endpoint
3. Atualizar service
4. Atualizar frontend
5. Adicionar testes
```

### Arquivos provavelmente afetados

Listar os principais arquivos ou diretórios identificados.

### Riscos

Listar riscos relevantes.

### Perguntas em aberto

Listar dúvidas identificadas.

---

## Solicitação de confirmação

Após apresentar o plano, perguntar explicitamente:

```txt
O plano faz sentido?

Deseja:

1. Aprovar o plano e salvar em `.portal/plans/`
2. Solicitar alterações no plano
3. Cancelar o planejamento
```

---

## Proibição de salvar sem aprovação

A skill NÃO deve criar arquivos em:

```txt
.portal/plans/
```

sem aprovação explícita do usuário.

Aprovação explícita inclui respostas como:

```txt
sim
aprovado
pode salvar
salve o plano
prosseguir
```

---

## Ajustes antes da aprovação

Caso o usuário solicite alterações:

* atualizar o plano
* reapresentar o plano completo
* solicitar nova aprovação

Não salvar versões intermediárias.

---

## Salvamento do plano

Somente após aprovação explícita:

1. Gerar o arquivo final.
2. Salvar em:

```txt
.portal/plans/{nome-do-plano}.md
```

3. Informar:

```txt
Plano aprovado e salvo.

Arquivo:
.portal/plans/{nome-do-plano}.md
```

---

## Fluxo de decisões pendentes

Quando o plano preliminar possuir decisões pendentes, a skill deve coletar todas as respostas antes de atualizar o plano.

A skill NÃO deve atualizar, reescrever ou reapresentar o plano após cada resposta individual.

Fluxo obrigatório:

```txt
Gerar plano preliminar
→ Identificar decisões pendentes
→ Perguntar decisão 1
→ Registrar resposta em memória
→ Perguntar decisão 2
→ Registrar resposta em memória
→ Perguntar decisão 3
→ Registrar resposta em memória
→ Quando todas forem respondidas, atualizar o plano uma única vez
→ Reapresentar plano atualizado
→ Exibir menu final de aprovação
```

---

## Regras para decisões pendentes

Decisões pendentes são perguntas que alteram escopo, ordem de implementação, arquitetura, riscos ou critérios de aceite.

Elas devem ser tratadas separadamente de perguntas informativas.

Cada decisão deve ser apresentada uma por vez.

Formato obrigatório:

```md
## Decisão pendente {N} de {TOTAL}

**Pergunta:** <pergunta objetiva>

Escolha uma opção:

1. <opção objetiva>
2. <opção objetiva>
3. Outro — descrever manualmente

Responda apenas com o número da opção e, se escolher `Outro`, inclua a descrição.
```

---

## Coleta de respostas

Ao receber uma resposta do usuário:

1. Registrar a resposta.
2. Não atualizar o plano ainda.
3. Não salvar arquivo.
4. Não reapresentar o plano.
5. Exibir imediatamente a próxima decisão pendente.

Exemplo:

```txt
Resposta registrada.

Próxima decisão:
...
```

---

## Atualização única do plano

Somente após todas as decisões pendentes serem respondidas:

1. Aplicar todas as respostas no plano.
2. Recalcular:

   * escopo
   * fora do escopo
   * estratégia de implementação
   * riscos
   * arquivos afetados
   * critérios de aceite
   * perguntas em aberto
3. Reapresentar o plano atualizado.
4. Exibir o menu final de aprovação.

---

## Resumo das decisões aplicadas

Antes do menu final, incluir:

```md
## Decisões aplicadas

- Decisão 1: <resposta escolhida>
- Decisão 2: <resposta escolhida>
- Decisão 3: <resposta escolhida>
```

---

## Menu final após decisões

Após atualizar o plano uma única vez, exibir:

```txt
Escolha uma opção:

1. Aprovar e salvar o plano em `.portal/plans/`
2. Ajustar o plano antes de salvar
3. Reduzir o escopo do plano
4. Expandir o escopo do plano
5. Cancelar o planejamento
```

---

## Regra obrigatória

Enquanto houver decisões pendentes não respondidas:

* não salvar o plano
* não atualizar o arquivo
* não criar arquivo em `.portal/plans/`
* não chamar a skill `implementar`
* não exibir o menu final de aprovação

O menu final só deve aparecer depois que todas as decisões pendentes forem respondidas e o plano tiver sido atualizado uma única vez.


## Regras de saída

Se o plano ainda não foi aprovado:

* não criar arquivo
* não modificar arquivos do projeto
* não iniciar implementação
* não chamar a skill `implementar`

Se o plano foi aprovado:

* salvar o arquivo
* informar o caminho
* encerrar a skill

A skill continua proibida de implementar código.


---

## Estrutura obrigatória do plano

O arquivo do plano deve seguir esta estrutura:

```md
# Plano de Implementação: {Nome da Feature}

## Origem

- Arquivo de especificação: `{FEATURE_FILE}`
- Data do planejamento: `{DATA_ATUAL}`
- Classificação: `frontend-only | backend-only | fullstack | backend + database | frontend + backend + database | infra/deploy | documentação`

## Resumo

Explique em poucas frases o que será implementado e por quê.

## Escopo

### Dentro do escopo

- Item 1
- Item 2

### Fora do escopo

- Item 1
- Item 2

## Leitura de contexto

Liste os arquivos de contexto lidos:

- `/AGENT.md`
- `/frontend/AGENT.md` se aplicável
- `/backend/AGENT.md` se aplicável
- arquivo `.md` da feature
- arquivos relevantes encontrados no projeto

## Impacto por área

### Frontend

Descreva alterações necessárias no frontend, se houver.

Inclua:

- telas
- componentes
- hooks
- query keys
- forms
- validações
- estados de loading/error/empty
- testes

Se não houver impacto, escreva: `Sem impacto esperado`.

### Backend

Descreva alterações necessárias no backend, se houver.

Inclua:

- rotas/endpoints
- services
- validações
- permissões
- regras multi-tenant
- relatórios/PDFs
- testes

Se não houver impacto, escreva: `Sem impacto esperado`.

### Banco de dados

Descreva alterações de banco, se houver.

Inclua:

- tabelas
- colunas
- índices
- migrations necessárias
- riscos

Se não houver impacto, escreva: `Sem impacto esperado`.

Importante: este plano não autoriza executar migrations automaticamente.

### Infra/Deploy

Descreva impactos em infra/deploy, se houver.

Inclua:

- env vars
- Render
- build
- jobs
- workers
- storage
- filas
- timeouts

Se não houver impacto, escreva: `Sem impacto esperado`.

## Arquivos provavelmente afetados

Liste arquivos ou diretórios prováveis.

Exemplo:

- `frontend/src/hooks/...`
- `frontend/src/pages/...`
- `backend/src/modules/...`
- `backend/src/db/schema/...`

## Estratégia de implementação

Descreva o passo a passo recomendado para a skill `implementar`.

Use etapas numeradas.

## Regras de negócio identificadas

Liste regras de negócio extraídas do `.md`.

## Regras multi-tenant e segurança

Descreva os cuidados necessários.

Inclua especialmente:

- origem confiável do tenant/prefeitura
- permissões necessárias
- prevenção de vazamento entre prefeituras
- validações backend
- impacto em relatórios/PDFs

## Validações necessárias

Liste validações de input, regras de formulário, schemas, params, query strings e payloads.

## Testes necessários

Liste os testes recomendados:

### Frontend

- teste 1
- teste 2

### Backend

- teste 1
- teste 2

### E2E

- teste 1
- teste 2

## Comandos de validação sugeridos

Liste comandos prováveis, de acordo com o impacto.

Exemplo:

```bash
npm run lint
npm run typecheck
npm run test
npm run build

npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run test
npm --prefix frontend run build

npm --prefix backend run lint
npm --prefix backend run typecheck
npm --prefix backend run test
npm --prefix backend run build
```

## Riscos e pontos de atenção

Liste riscos técnicos e operacionais.

Exemplos:

- risco de vazamento multi-tenant
- risco de timeout em PDF
- risco de quebrar contrato frontend/backend
- risco de alterar migrations antigas
- risco de afetar staging/produção

## Perguntas em aberto

Liste dúvidas que precisam de confirmação antes ou durante a implementação.

Se não houver dúvidas, escreva:

`Nenhuma pergunta em aberto identificada.`

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- critério 1
- critério 2
- critério 3

## Observações para a skill implementar

Inclua instruções diretas para a próxima etapa.

Exemplo:

- Usar este plano como fonte principal de contexto.
- Não executar migrations sem confirmação explícita.
- Seguir `/AGENT.md`, `/frontend/AGENT.md` e/ou `/backend/AGENT.md`.
- Manter alterações pequenas e focadas.
- Atualizar testes conforme descrito.
```

---

## Regras sobre banco de dados e migrations

Durante o planejamento:

- identifique se migrations serão necessárias
- descreva quais mudanças de schema parecem necessárias
- descreva riscos
- mas NÃO execute migrations
- NÃO gere migration automaticamente, a menos que o usuário peça explicitamente

Inclua no plano:

```md
Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.
```


## Anti-patterns desta skill

Evite:

- implementar código durante o planejamento
- alterar arquivos fora de `.portal/plans/`
- ignorar AGENT.md relevantes
- assumir que a feature é frontend-only ou backend-only sem verificar
- ignorar impacto multi-tenant
- ignorar impacto em banco de dados
- criar plano genérico demais
- deixar de registrar riscos
- deixar de registrar dúvidas
- executar migrations
- rodar comandos destrutivos
- alterar `.env`
- alterar CI/CD
- abrir PR
- fazer commit
