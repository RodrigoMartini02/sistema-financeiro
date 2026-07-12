# Plano de Implementação: Criar tabelas faltantes (representantes, comissoes, tipos_receita, socios)

## Origem

- Arquivo de especificação: incidente de produção reportado pelo usuário (tela em branco → corrigida via Publish Directory do Render → novo erro 500 revelado)
- Data do planejamento: 2026-07-12
- Classificação: `backend + database`

## Resumo

Após corrigir o deploy do frontend (Publish Directory do Render apontava para a raiz do repo em vez de `dist/`), a aplicação passou a fazer chamadas reais autenticadas ao backend e revelou `500` em várias rotas. Conectei diretamente no banco de produção (`sistema_financas`, só leitura — `SELECT` em `information_schema`) e confirmei via log do Render (`relation "representantes" does not exist`, Postgres `42P01`) e via inspeção de código que **4 tabelas usadas ativamente pelo app não existem no banco unificado**: `representantes`, `comissoes`, `tipos_receita`, `socios`.

O banco `sistema_financas` foi consolidado com o do futebol no início desta sessão. Só existe uma migration versionada (`backend/drizzle/0001_futebol_schema.sql`, exclusiva do schema `futebol`) — as tabelas do financeiro nunca foram capturadas como migration formal; foram herdadas de uma cópia/restauração do banco antigo, que aparentemente não incluía essas 4 tabelas (provavelmente criadas manualmente no banco antigo depois do último backup usado na consolidação).

## Escopo

### Dentro do escopo

- Criar `backend/drizzle/0002_representantes_comissoes_tipos_receita_socios.sql`, com `CREATE TABLE IF NOT EXISTS` para as 4 tabelas, espelhando exatamente:
  - `representantes` e `comissoes`: `backend/src/db/schema/representatives.ts`
  - `socios`: `backend/src/db/schema/partners.ts`
  - `tipos_receita`: reconstruída por engenharia reversa das queries em `backend/src/routes/income-types.ts` (não existe schema Drizzle para essa tabela — é acessada só via SQL cru)
- Aplicar a migration no banco de produção (`sistema_financas`), **mediante confirmação explícita separada**, já que é execução de migration em produção

### Fora do escopo

- Qualquer alteração de código de rotas/schema — o código já está correto, só o banco está incompleto
- Popular dados nas tabelas novas (ficam vazias após a criação — representantes/sócios/tipos de receita precisarão ser recadastrados pelo usuário, já que não há backup dessas 4 tabelas para restaurar)
- Investigar se há outras tabelas faltantes além dessas 4 (verificação foi feita cruzando as 14 arquivos de schema Drizzle + as rotas que geraram erro; não há indício de mais tabelas ausentes, mas não é uma auditoria exaustiva de todas as rotas)

## Leitura de contexto

- `backend/src/db/schema/representatives.ts`, `partners.ts`, `profiles.ts`, `users.ts`
- `backend/src/routes/income-types.ts` (reconstrução de `tipos_receita`)
- `backend/drizzle/0001_futebol_schema.sql` (convenção de estilo a seguir)
- `backend/drizzle.config.ts` (schema aponta para `src/db/schema/index.ts`, sem pasta `meta/`/journal — confirma que não há tracking automático de migrations aplicadas)
- Inspeção read-only direta do banco de produção (`information_schema.tables`, `information_schema.schemata`) — 33 tabelas existentes catalogadas, nenhuma das 4 listada acima presente

## Impacto por área

### Frontend

Sem impacto esperado — nenhuma alteração de código; as telas que hoje mostram erro (Receitas, cadastro de representantes/sócios/tipos de receita) devem voltar a funcionar assim que as tabelas existirem.

### Backend

Sem alteração de código — o código das rotas já é o correto, só depende das tabelas existirem.

### Banco de dados

Criação de 4 tabelas novas via `CREATE TABLE IF NOT EXISTS` (idempotente, seguro rodar mais de uma vez):

```sql
CREATE TABLE IF NOT EXISTS representantes (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  perfil_id INTEGER REFERENCES perfis(id) ON DELETE SET NULL,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(150),
  telefone VARCHAR(20),
  ativo BOOLEAN DEFAULT true,
  data_criacao TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_representantes_usuario ON representantes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_representantes_perfil ON representantes(perfil_id);

CREATE TABLE IF NOT EXISTS comissoes (
  id SERIAL PRIMARY KEY,
  representante_id INTEGER NOT NULL REFERENCES representantes(id) ON DELETE CASCADE,
  tipo_receita VARCHAR(30) NOT NULL,
  percentual DECIMAL(5,2) NOT NULL,
  tipo VARCHAR(10) NOT NULL DEFAULT 'mensal',
  ativo BOOLEAN DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_comissoes_representante ON comissoes(representante_id);

CREATE TABLE IF NOT EXISTS tipos_receita (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tipos_receita_usuario ON tipos_receita(usuario_id);

CREATE TABLE IF NOT EXISTS socios (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  perfil_id INTEGER REFERENCES perfis(id) ON DELETE SET NULL,
  nome VARCHAR(100) NOT NULL,
  percentual DECIMAL(5,2) NOT NULL,
  ativo BOOLEAN DEFAULT true,
  data_criacao TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_socios_usuario ON socios(usuario_id);
```

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. Este é exatamente o caso aqui — o banco alvo É produção. A aplicação da migration só ocorre após confirmação separada e explícita, depois da criação do arquivo.

### Infra/Deploy

Sem impacto adicional (já resolvido nesta sessão: Build Command e Publish Directory do Static Site).

## Arquivos provavelmente afetados

- `backend/drizzle/0002_representantes_comissoes_tipos_receita_socios.sql` (novo)

## Estratégia de implementação

1. Criar o arquivo de migration com o SQL acima.
2. Apresentar o SQL final ao usuário e pedir confirmação explícita e específica para aplicar contra o banco de produção.
3. Aplicar via conexão direta (`psql`/script Node com `pg`) usando `DATABASE_URL` de produção.
4. Verificar (read-only) que as 4 tabelas foram criadas corretamente.
5. Confirmar nas telas do app (ou via curl autenticado, se possível) que as rotas voltam a responder `200`.
6. Commit do arquivo de migration (não é código executável, é documentação da alteração de schema).

## Regras de negócio identificadas

Nenhuma nova — as tabelas replicam exatamente as regras já implementadas no código das rotas e no schema Drizzle existente.

## Regras multi-tenant e segurança

Todas as tabelas novas seguem o padrão já usado no restante do schema: FK `usuario_id` com `ON DELETE CASCADE` para `usuarios(id)`, garantindo isolamento por usuário. Nenhuma mudança de autenticação/autorização.

## Validações necessárias

- Confirmar que as 4 tabelas aparecem em `information_schema.tables` após aplicar.
- Confirmar que os endpoints `/api/representantes`, `/api/socios`, `/api/income-types` (e o fluxo de comissão dentro de receitas) deixam de retornar 500.

## Testes necessários

### Backend

- Requisição autenticada real (ou teste manual na UI) em cada uma das 4 rotas afetadas, confirmando `200`/lista vazia em vez de `500`.

### E2E

- Testar manualmente na tela de Receitas: cadastrar um tipo de receita, um representante e conferir que não há mais erro no console.

## Comandos de validação sugeridos

Verificação read-only pós-migration (script temporário, mesmo padrão usado no diagnóstico, apagado após uso).

## Riscos e pontos de atenção

- **As tabelas ficam vazias** — não há backup dos dados antigos de representantes/sócios/tipos de receita para restaurar (essas tabelas nunca existiam no banco unificado). O usuário precisará recadastrar esses itens manualmente. Isso deve ficar muito claro antes de aplicar.
- `CREATE TABLE IF NOT EXISTS` é seguro mesmo se rodado mais de uma vez, mas **não é seguro assumir que a estrutura reconstruída de `tipos_receita` está 100% idêntica à original** (não existe schema Drizzle de referência para essa tabela — foi reconstruída via leitura das queries). Colunas usadas (`id`, `usuario_id`, `nome`, `ativo`, `criado_em`, `atualizado_em`) cobrem tudo que o código de fato usa, mas se havia alguma coluna extra não utilizada por nenhuma query, ela não será recriada (sem impacto funcional, já que nada no código a usaria mesmo).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — usuário já escolheu explicitamente "gerar migration formal e aplicar" como caminho.

## Critérios de aceite do plano

- As 4 tabelas existem em produção com a estrutura acima.
- Rotas de representantes, sócios, tipos de receita e comissão deixam de retornar 500.
- Migration documentada em `backend/drizzle/0002_....sql`, seguindo o padrão de `0001_futebol_schema.sql`.

## Observações para a skill implementar

- Confirmar explicitamente com o usuário antes de executar o SQL contra produção — não basta a aprovação deste plano.
- Usar `IF NOT EXISTS` em tudo (já incluído no SQL acima).
- Não popular dados — tabelas ficam vazias, prontas para o usuário recadastrar.
