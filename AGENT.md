# AGENT.md

## ⚠️ REGRA ABSOLUTA: Nenhum código sem autorização

Antes de qualquer alteração de arquivo, siga obrigatoriamente:

```
/planejar → aprovação do usuário → /implementar → /finalizar
```

Nunca edite, crie ou delete arquivos de código sem aprovação explícita.
Leia o `CLAUDE.md` na raiz para as regras completas de workflow.

---

## Contexto do Projeto

Este projeto é um backend para um sistema multi-prefeitura, com arquitetura multi-tenant + RLS. Cada prefeitura deve ter seus dados isolados logicamente, e qualquer funcionalidade nova precisa respeitar esse isolamento.

A aplicação possui fluxos frequentes de emissão de relatórios e geração de PDFs, portanto qualidade, eficiência, previsibilidade e segurança são prioridades.

## Objetivos do Agente

Ao implementar, alterar ou revisar código neste projeto, siga estas prioridades:

1. Manter isolamento correto entre prefeituras/tenants.
2. Escrever código legível, moderno, sustentável e testável.
3. Evitar queries inseguras, ambíguas ou difíceis de auditar.
4. Preservar performance em rotas críticas, especialmente relatórios e geração de PDFs.
5. Seguir os padrões já existentes no projeto antes de introduzir novos padrões.

## Stack e Convenções Gerais

- Backend em TypeScript.
- Runtime padrão: Node.js `v22.17.0` com npm `10.9.2`.
- Banco de dados PostgreSQL.
- ORM/query builder: Drizzle ORM.
- Usar ECMAScript moderno, mas sempre priorizando legibilidade.
- Evitar abstrações desnecessárias.
- Preferir código explícito quando isso facilitar manutenção e auditoria.

## Dependências e Compatibilidade

- Não adicionar ou atualizar dependências que exijam Node maior que `22.17.0`.
- Antes de instalar uma biblioteca, conferir a faixa `engines.node` publicada e o impacto no lockfile.
- Se o pacote mais recente exigir Node maior que `22.17.0`, escolher uma versão compatível ou parar e reportar o bloqueio.
- Não usar warnings de engine como ruído ignorável: eles indicam incompatibilidade que deve ser resolvida antes de concluir a tarefa.

## Regras Obrigatórias de Banco de Dados

### 1. Toda query nova deve usar o padrão do Drizzle

Sempre use a API do Drizzle para queries novas.

Bom exemplo:

```ts
const posts = await db
  .select()
  .from(postsTable);
```

Evite SQL raw quando não for estritamente necessário.

SQL raw só deve ser usado quando:

- O Drizzle não suportar bem a operação.
- Houver ganho claro de performance ou simplicidade.
- A query for parametrizada corretamente.
- O motivo estiver claro no código ou no PR.

### 2. Toda query multi-tenant deve filtrar por prefeitura/tenant

Qualquer query que leia, altere, delete ou agregue dados tenant-specific precisa conter filtro explícito de tenant, normalmente por `tenantId`, `tenantId` ou campo equivalente usado no projeto.

Bom exemplo:

```ts
const users = await db
  .select()
  .from(usersTable)
  .where(eq(usersTable.tenantId, tenantId));
```

Mau exemplo:

```ts
const users = await db
  .select()
  .from(usersTable);
```

Apenas tabelas realmente globais podem não ter filtro de tenant. Se uma tabela for global, isso deve estar claro pelo nome, schema ou uso.

### 3. Nunca confiar no tenant vindo livremente do client

Não assuma que `tenantId`, `tenantId` ou valores semelhantes enviados pelo client são confiáveis.

O tenant deve ser derivado de uma fonte confiável, como:

- Sessão autenticada.
- JWT validado.
- Contexto interno da request.
- Middleware de tenant resolution.
- Subdomínio/domínio validado, caso o projeto use esse padrão.

### 4. Evitar queries que misturam dados entre prefeituras

Tenha cuidado especial com:

- Relatórios agregados.
- Joins.
- Counts.
- Exports.
- Geração de PDF.
- Dashboards administrativos.
- Jobs assíncronos.

Sempre confirme se o filtro de tenant foi aplicado em todas as tabelas necessárias.

## Regras de Código TypeScript

### 1. Usar nomes claros e sugestivos

Use nomes que expliquem intenção.

Bom exemplo:

```ts
const authenticateUser = async () => {
  // ...
};
```

Mau exemplo:

```ts
const t = async () => {
  // ...
};
```

Evite abreviações obscuras como `cfg`, `usr`, `tmp`, `x`, `data2`, exceto quando o contexto for extremamente claro.

### 2. Usar ECMAScript moderno com legibilidade

Bom exemplo:

```ts
if (condition) {
  return value;
}
```

Evite compactar demais a lógica apenas para reduzir linhas.

Mau exemplo:

```ts
if (condition) return value;
```

Esse padrão pode ser aceitável em casos muito simples, mas não deve ser usado quando reduzir clareza, debuggabilidade ou consistência visual.

### 3. Preferir early return quando melhorar clareza

Bom exemplo:

```ts
if (!user) {
  throw new UnauthorizedError('User not found');
}

return buildUserResponse(user);
```

### 4. Evitar `any`

Não use `any`, exceto quando for inevitável.

Prefira:

- Tipos explícitos.
- Tipos inferidos pelo Drizzle.
- `unknown` com validação.
- Schemas de validação quando existirem no projeto.

### 5. Não mascarar erros importantes

Evite `catch` silencioso.

Mau exemplo:

```ts
try {
  await generatePdf();
} catch {}
```

Bom exemplo:

```ts
try {
  await generatePdf();
} catch (error) {
  logger.error({ error }, 'Failed to generate PDF');
  throw error;
}
```

## Multi-Tenant e Segurança

### 1. Toda regra de negócio deve considerar prefeitura

Antes de implementar qualquer feature, verifique:

- Essa informação pertence a uma prefeitura específica?
- Essa rota pode acessar dados de outra prefeitura?
- Existe usuário global/admin?
- Existe diferença entre usuário interno da prefeitura e contribuinte?
- O tenant está sendo validado no backend, não apenas no frontend?
- Essa alteração na tabela precisa de RLS?

### 2. Evitar vazamento por mensagens de erro

Mensagens de erro não devem revelar dados de outra prefeitura.

Exemplo ruim:

```ts
throw new Error('User exists in Prefeitura X');
```

Exemplo melhor:

```ts
throw new Error('User already exists');
```

### 3. Cuidado com IDs sequenciais

Se o projeto usa IDs numéricos, nunca assuma que acessar `/resource/123` é seguro apenas porque o ID existe.

Sempre valide tenant + permissão.

## Relatórios e PDFs

Como emissão de relatórios e geração de PDFs são fluxos frequentes, siga estas regras:

### 1. Evitar buscar dados desnecessários

Não use `.select()` amplo se a feature só precisa de alguns campos.

Prefira selecionar explicitamente os campos necessários em relatórios pesados.

```ts
const reportRows = await db
  .select({
    id: documentsTable.id,
    title: documentsTable.title,
    createdAt: documentsTable.createdAt,
  })
  .from(documentsTable)
  .where(eq(documentsTable.tenantId, tenantId));
```

### 2. Evitar processamento pesado dentro da request quando possível

Para PDFs ou relatórios grandes, prefira arquitetura assíncrona quando o processamento puder exceder o tempo aceitável da API.

Padrão recomendado:

1. Criar solicitação de relatório/PDF.
2. Enfileirar job.
3. Processar em worker/background job.
4. Salvar resultado.
5. Retornar status ou URL de download.

### 3. Pensar em paginação, streaming ou batches

Para relatórios grandes, evite carregar tudo em memória de uma vez.

Considere:

- Paginação.
- Cursores.
- Processamento em lotes.
- Streaming quando aplicável.
- Cache para relatórios repetidos.

### 4. PDFs devem ser determinísticos

A geração de PDF deve produzir resultado previsível para a mesma entrada.

Evite depender de:

- Estado global mutável.
- Datas sem controle.
- Ordem não determinística de arrays ou queries.
- Dados sem ordenação explícita.

Sempre adicione `orderBy` em relatórios quando a ordem importar.

## Performance

### 1. Evitar N+1 queries

Cuidado com loops que fazem queries internas.

Mau exemplo:

```ts
for (const prefeitura of prefeituras) {
  const users = await getUsersByPrefeitura(prefeitura.id);
}
```

Prefira buscar em lote quando possível.

### 2. Índices devem acompanhar filtros importantes

Ao criar queries frequentes filtrando por tenant, status, datas ou chaves de busca, avalie se existe índice adequado.

Exemplos de filtros que geralmente precisam de atenção:

- `tenantId`
- `createdAt`
- `status`
- `documentType`
- `userId`
- Combinações como `tenantId + status` ou `tenantId + createdAt`

### 3. Evitar trabalho desnecessário em rotas críticas

Não faça dentro da request principal:

- Geração pesada de PDF.
- Processamento massivo de imagens.
- Loops grandes síncronos.
- Transformações custosas sem necessidade.

## Validação e Erros

### 1. Validar entrada no backend

Nunca dependa apenas da validação do frontend.

Valide:

- Body.
- Params.
- Query string.
- Headers relevantes.
- Tenant/contexto da request.

### 2. Erros devem ser claros e úteis

Mensagens devem ajudar o usuário/desenvolvedor sem vazar informações sensíveis.

Bom exemplo:

```ts
throw new BadRequestError('Invalid report date range');
```

Mau exemplo:

```ts
throw new Error('Error');
```

### 3. Logs devem ter contexto suficiente

Ao logar erros, inclua contexto útil:

- `tenantId` quando seguro.
- `userId` quando seguro.
- Nome da operação.
- ID do relatório/job, se existir.

Não logue dados sensíveis desnecessariamente.

## Organização de Código

### 1. Respeitar a estrutura existente

Antes de criar novas pastas, services, repositories ou helpers, procure padrões existentes no projeto.

### 2. Separar responsabilidades

Evite handlers/controllers com lógica demais.

Preferir separação clara entre:

- Handler/controller da rota.
- Validação.
- Regras de negócio.
- Acesso ao banco.
- Geração de PDF/relatório.
- Jobs/background processing.

### 3. Helpers devem ter propósito claro

Não crie helpers genéricos demais como:

```ts
function handleData(data: unknown) {}
```

Prefira nomes específicos:

```ts
function normalizeReportDateRange(dateRange: ReportDateRange) {}
```

## Anti-patterns

Evite os seguintes padrões:

### Banco de dados

- Nunca altere o arquivo .env
- Fazer query sem filtro de tenant/prefeitura em dados tenant-specific.
- Caso altere alguma tabela ou adicione uma nova, verifique a necessidade de RLS
- Usar SQL raw quando Drizzle resolver bem o caso.
- Buscar todos os campos com `.select()` em relatórios pesados sem necessidade.
- Fazer queries dentro de loops causando N+1.
- Editar migrations antigas já aplicadas.
- Confiar em `tenantId` ou `tenantId` vindo diretamente do client sem validação.
- NUNCA executar migrations sem confirmação explícita do usuário.
- O ambiente atual pode estar apontando para produção.
- Sempre pedir confirmação antes de:
  - executar migrations
  - aplicar alterações de schema
  - executar comandos destrutivos no banco
  - resetar bancos
  - truncar tabelas
  - executar seeds em ambientes desconhecidos
- Nunca assumir que o banco atual é local ou staging.
- Sempre verificar o ambiente alvo antes de executar operações no banco.

### Multi-tenant

- Assumir que o ID de um recurso é suficiente para autorizar acesso.
- Misturar dados de múltiplas prefeituras em relatórios, exports ou PDFs.
- Aplicar filtro de tenant apenas na tabela principal e esquecer joins.
- Fazer validação de tenant apenas no frontend.

### Código

- Criar services/helpers genéricos demais sem propósito claro.
- Usar `any` para contornar erro de tipagem.
- Fazer `catch {}` silencioso.
- Retornar mensagens de erro que vazam informação sensível.
- Criar abstrações novas antes de verificar padrões existentes.

### Performance

- Gerar PDFs grandes dentro da request principal sem avaliar timeout.
- Carregar datasets grandes inteiros em memória.
- Fazer processamento pesado síncrono em rotas críticas.
- Não usar paginação/batches em relatórios grandes.

## Checklist Antes de Finalizar uma Alteração

Antes de concluir qualquer implementação, revise:

- [ ] Todas as queries novas usam Drizzle.
- [ ] Queries tenant-specific filtram por prefeitura/tenant.
- [ ] O tenant não vem de fonte não confiável sem validação.
- [ ] Não há risco de vazamento entre prefeituras.
- [ ] Não há `any` desnecessário.
- [ ] Variáveis e funções possuem nomes claros.
- [ ] Código usa ECMAScript moderno sem perder legibilidade.
- [ ] Relatórios/PDFs evitam carregamento excessivo em memória.
- [ ] Queries pesadas evitam N+1.
- [ ] Erros são claros e não vazam informação sensível.
- [ ] Logs possuem contexto útil e seguro.
- [ ] A estrutura existente do projeto foi respeitada.

## Quando Tiver Dúvida

Se houver dúvida sobre uma implementação, prefira a opção que:

1. Seja mais segura para multi-tenant.
2. Seja mais explícita e fácil de auditar.
3. Seja mais simples de manter.
4. Evite impacto em performance.
5. Siga o padrão já existente no projeto.

Nunca introduza uma solução complexa sem necessidade clara.
