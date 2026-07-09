---
name: criar-task
description: Cria uma task técnica estruturada a partir de uma descrição livre fornecida pelo usuário.
---

## Descrição

Cria uma task técnica estruturada a partir de uma descrição livre fornecida pelo usuário.

A task gerada deve seguir um formato rico e detalhado, semelhante a uma especificação de entrada para planejamento técnico. Ela deve ser adequada para ser usada depois pela skill `planejar`.

A skill não implementa código, não cria plano de execução e não altera arquivos. Ela apenas transforma uma descrição informal em uma task técnica clara, contextualizada e acionável, criando um arquivo no formato `{titulo}.md` em `.portal/tasks`.

---

# Quando usar

Use esta skill quando o usuário fornecer uma descrição de:

* problema técnico
* melhoria
* refactor
* migração
* bug
* dívida técnica
* decisão arquitetural
* mudança de padrão
* melhoria de segurança
* melhoria de performance

Exemplo de entrada:

```txt
Hoje existem diversas strings mágicas no código, o que quebra confiança e aumenta chance de erro. Precisamos padronizar o uso de enum nos lugares que fazem sentido.
```

---

# Objetivo

Gerar uma task em Markdown contendo contexto suficiente para que a skill `planejar` consiga criar um plano de implementação seguro, pequeno e revisável.

A task deve explicar:

* o problema
* o contexto atual
* o objetivo
* a decisão técnica desejada, quando houver
* o escopo
* o que está fora de escopo
* requisitos por camada
* regras de segurança
* impacto multi-tenant
* requisitos de migração
* requisitos de testes
* possíveis arquivos afetados
* critérios de aceite
* perguntas para planejamento
* instruções para a skill `planejar`

---

# Fluxo obrigatório

## 1. Ler instruções do projeto

Antes de criar a task, ler obrigatoriamente:

```txt
/AGENT.md
/frontend/AGENT.md
/backend/AGENT.md
```

Se algum arquivo não existir:

* continuar com os arquivos disponíveis
* mencionar na seção final quais arquivos foram considerados
* não inventar regras ausentes

---

## 2. Interpretar a descrição do usuário

A skill deve identificar:

* problema principal
* motivação
* impacto técnico
* área afetada
* se envolve frontend
* se envolve backend
* se envolve banco de dados
* se envolve infraestrutura
* se envolve segurança
* se envolve performance
* se envolve multi-tenant
* se envolve migração
* se envolve testes
* se existe decisão técnica já sugerida pelo usuário

---

## 3. Inspecionar o projeto quando necessário

Quando a descrição mencionar arquivos, módulos, páginas, endpoints, tabelas, funções ou fluxos existentes, a skill deve inspecionar o projeto antes de gerar a task.

Exemplos:

* “o editor atual”
* “a geração de PDF”
* “o fluxo de protocolo”
* “as strings mágicas no backend”
* “a importação financeira”
* “o módulo de documentos”

A task não deve inventar caminhos de arquivos sem verificar.

Se não for possível verificar os arquivos:

* não inventar caminhos
* escrever que os arquivos devem ser identificados durante o planejamento

---

# Formato obrigatório da task gerada

A saída deve ser um arquivo Markdown com a seguinte estrutura.

Nem todas as seções precisam ter grande conteúdo, mas a estrutura deve ser preservada quando fizer sentido.

---

# Template da task

```md
# Task: <Título da task>

## Contexto

<Explique o contexto atual do problema. Descreva o sistema, módulo, fluxo ou padrão afetado. Quando houver arquivos conhecidos e verificados, liste-os.>

## Problema

<Explique claramente o problema atual, por que ele é ruim, quais riscos ele cria e qual dívida técnica ele representa.>

## Objetivo

<Explique o objetivo da task sem transformar isso em plano de implementação detalhado.>

## Decisão Técnica Desejada

<Descreva a direção técnica desejada, quando existir. Se o usuário não forneceu uma decisão técnica clara, escrever que a decisão deve ser avaliada durante o planejamento.>

## Escopo Funcional

### Dentro do escopo

- <Item de escopo>
- <Item de escopo>

### Fora do escopo inicial

- <Item fora de escopo>
- <Item fora de escopo>

## Requisitos de Frontend

<Preencher quando houver impacto no frontend. Caso não haja impacto conhecido, escrever “Sem impacto frontend identificado inicialmente.”>

## Requisitos de Backend

<Preencher quando houver impacto no backend. Caso não haja impacto conhecido, escrever “Sem impacto backend identificado inicialmente.”>

## Requisitos de Banco de Dados

<Preencher quando houver impacto no banco. Caso não haja impacto conhecido, escrever “Sem alteração de banco identificada inicialmente.”>

## Requisitos de Segurança e Multi-Tenant

<Descrever cuidados de segurança, permissão, tenant isolation, dados sensíveis, validação e riscos de vazamento entre prefeituras.>

## Requisitos de Migração ou Compatibilidade

<Descrever como preservar compatibilidade com código, dados, contratos ou fluxos existentes. Se não houver migração identificada, informar isso.>

## Requisitos de Testes

### Frontend

- <Teste esperado ou “Não aplicável inicialmente.”>

### Backend

- <Teste esperado ou “Não aplicável inicialmente.”>

### E2E

- <Teste esperado ou “Não aplicável inicialmente.”>

## Arquivos Provavelmente Afetados

### Frontend

- <Arquivo, módulo ou “A identificar durante o planejamento.”>

### Backend

- <Arquivo, módulo ou “A identificar durante o planejamento.”>

### Banco de Dados

- <Arquivo, migration, schema ou “A identificar durante o planejamento.”>

## Critérios de Aceite

- <Critério objetivo>
- <Critério objetivo>
- <Critério objetivo>

## Perguntas Para o Planejamento

- <Pergunta relevante>
- <Pergunta relevante>

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `/AGENTS.md`, `/frontend/AGENTS.md` e `/backend/AGENTS.md`.
- Inspecione os arquivos citados antes de escrever o plano.
- Classifique a implementação como `frontend`, `backend`, `database`, `infra` ou combinação deles.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations.
- Gere um plano em `.portal/plans/` com etapas pequenas, revisáveis e seguras para staging/produção.
```

---

# Regras de escrita

* Escrever a task em português.
* Ser técnico, claro e objetivo.
* Não exagerar o escopo.
* Não transformar a task em plano.
* Não criar etapas de implementação detalhadas.
* Não inventar arquivos.
* Não inventar decisões técnicas não dadas pelo usuário.
* Não assumir que uma mudança é apenas frontend ou apenas backend sem evidência.
* Quando houver dúvida, registrar em “Perguntas Para o Planejamento”.
* Manter a task rica o suficiente para guiar a skill `planejar`.

---

# Regras de nomenclatura

A task pode ser escrita em português, mas deve respeitar o padrão do projeto:

* código novo deve ser em inglês
* arquivos novos devem ser em inglês
* nomes técnicos devem seguir inglês quando forem nomes de código
* português existente no projeto deve ser tratado como legado

Se a task envolver criação ou renomeação de código, mencionar que a implementação deve seguir nomenclatura em inglês.

---

# Critérios para um bom título

O título deve ser:

* curto
* específico
* técnico
* orientado ao problema
* sem exagero de escopo

Bons exemplos:

```txt
Padronizar valores de domínio com enums
```

```txt
Migrar editor de documentos para Tiptap
```

```txt
Isolar geração de PDFs em jobs assíncronos
```

```txt
Criar pipeline auditável de importação financeira
```

Exemplos ruins:

```txt
Arrumar código
```

```txt
Melhorar tudo
```

```txt
Refatorar sistema inteiro
```

---

# Regras para escopo

A skill deve separar explicitamente:

## Dentro do escopo

Aquilo que precisa ser considerado para resolver o problema.

## Fora do escopo inicial

Aquilo que poderia ser relacionado, mas não deve entrar na primeira entrega.

Isso evita que a skill `planejar` gere planos grandes demais.

---

# Regras para arquivos afetados

A seção “Arquivos Provavelmente Afetados” deve seguir estas regras:

* listar arquivos apenas quando eles forem informados pelo usuário ou verificados no projeto
* não inventar caminhos
* se houver incerteza, usar “A identificar durante o planejamento”
* separar por frontend, backend e banco de dados

---

# Regras para critérios de aceite

Critérios de aceite devem ser verificáveis.

Bons exemplos:

```txt
- Valores de status conhecidos usam enum ou constante tipada centralizada.
- Não existem novas strings mágicas para domínios finitos nos arquivos alterados.
- Frontend e backend continuam compatíveis.
```

Exemplos ruins:

```txt
- Código melhorado.
- Sistema mais bonito.
- Tudo funcionando.
```

---

# Exemplo

Entrada:

```txt
Hoje existem diversas strings mágicas no código, o que quebra confiança e aumenta chance de erro. Precisamos padronizar o uso de enum nos lugares que fazem sentido.
```

Saída esperada:

````md
# Task: Padronizar valores de domínio com enums

## Contexto

O sistema possui frontend e backend em um monorepo multi-tenant para múltiplas prefeituras. Existem valores de domínio representados diretamente como strings literais em diferentes pontos do código, como status, labels, validações, tipos de documento, permissões e estados de fluxo.

Esse padrão torna o código mais frágil e dificulta a manutenção, especialmente quando o mesmo valor precisa ser usado em múltiplas camadas ou módulos.

## Problema

Strings mágicas espalhadas pelo código reduzem a segurança de tipagem, dificultam refactors e aumentam o risco de bugs causados por erros de digitação ou inconsistências entre frontend e backend.

Exemplo ruim:

```ts
const isExpired = bankSlip.status === 'expired';
````

Exemplo desejado:

```ts
const isExpired = bankSlip.status === PaymentStatus.EXPIRED;
```

## Objetivo

Padronizar o uso de enums ou constantes de domínio tipadas para valores finitos e conhecidos, reduzindo strings mágicas nos pontos onde isso fizer sentido.

## Decisão Técnica Desejada

Preferir enums para valores finitos e estáveis, como status, roles, labels, tipos, permissões e estados de processamento.

Quando enum não for a melhor opção, avaliar constantes tipadas centralizadas, desde que eliminem strings literais espalhadas pelo código.

## Escopo Funcional

### Dentro do escopo

* Identificar strings mágicas usadas como valores de domínio.
* Centralizar valores finitos em enums ou constantes tipadas.
* Atualizar comparações e validações afetadas.
* Preservar compatibilidade entre frontend e backend.
* Evitar refactors desnecessários em código não relacionado.

### Fora do escopo inicial

* Renomear todos os valores legados do sistema.
* Alterar comportamento funcional.
* Alterar contratos públicos sem necessidade.
* Criar migrações de banco sem confirmação explícita.
* Refatorar módulos inteiros apenas por estilo.

## Requisitos de Frontend

* Substituir strings mágicas por enums ou constantes tipadas quando representarem domínio finito.
* Evitar duplicar enums já existentes no backend ou em módulos compartilhados.
* Preservar comportamento visual e funcional existente.

## Requisitos de Backend

* Substituir strings mágicas por enums ou constantes tipadas quando representarem domínio finito.
* Garantir que validações e regras de negócio usem a fonte centralizada.
* Evitar quebrar contratos de API existentes.

## Requisitos de Banco de Dados

Sem alteração de banco identificada inicialmente.

Se durante o planejamento for identificada necessidade de enum no banco, migration ou alteração de schema, isso deve ser tratado separadamente e nenhuma migration deve ser executada sem confirmação explícita.

## Requisitos de Segurança e Multi-Tenant

* Garantir que alterações em roles, permissões, status ou validações não quebrem isolamento entre tenants.
* Não alterar regras de autorização sem necessidade explícita.
* Verificar fluxos sensíveis antes de substituir valores relacionados a permissões.

## Requisitos de Migração ou Compatibilidade

* Preservar valores serializados já existentes.
* Evitar alterar payloads de API sem necessidade.
* Manter compatibilidade com dados persistidos em banco.
* Tratar português existente como legado e usar inglês para novos identificadores de código.

## Requisitos de Testes

### Frontend

* Testar fluxos impactados por status, labels ou validações alteradas.

### Backend

* Testar regras de negócio e validações impactadas.

### E2E

* Avaliar necessidade conforme os fluxos afetados forem identificados.

## Arquivos Provavelmente Afetados

### Frontend

* A identificar durante o planejamento.

### Backend

* A identificar durante o planejamento.

### Banco de Dados

* A identificar durante o planejamento, se necessário.

## Critérios de Aceite

* Valores de domínio finitos nos arquivos alterados usam enum ou constante tipada centralizada.
* Não são adicionadas novas strings mágicas para status, roles, labels, tipos ou permissões.
* Comportamento existente é preservado.
* Frontend e backend continuam compatíveis.
* Nomenclatura nova de código está em inglês.
* Testes/checks relevantes passam.

## Perguntas Para o Planejamento

* Já existem enums ou constantes de domínio reutilizáveis no projeto?
* Existe pacote shared para tipos entre frontend e backend?
* Quais domínios devem ser priorizados primeiro?
* Algum valor está persistido no banco e exige compatibilidade especial?
* Algum contrato de API depende diretamente dessas strings?

## Instruções Para a Skill Planejar

* Use este arquivo como especificação de entrada.
* Leia `/AGENTS.md`, `/frontend/AGENTS.md` e `/backend/AGENTS.md`.
* Inspecione os arquivos citados antes de escrever o plano.
* Classifique a implementação como `frontend + backend`, salvo se a investigação mostrar outro escopo.
* Não implemente código durante o planejamento.
* Não instale dependências durante o planejamento.
* Não execute migrations.
* Gere um plano em `.portal/plans/` com etapas pequenas, revisáveis e seguras para staging/produção.

```

---

# Restrições absolutas

A skill `criar-task` não deve:

- implementar código
- alterar arquivos do projeto
- criar branch
- criar commit
- abrir PR
- executar migrations
- instalar dependências
- rodar comandos destrutivos
- transformar a task em plano de implementação
- inventar arquivos ou módulos
```
