# Plano de Implementação: Auditoria completa de schema — módulo de contratos/serviços

## Origem

- Continuação do incidente de produção (tabelas/colunas faltantes após unificação de banco)
- Usuário pediu explicitamente para parar de corrigir aos pedaços e fazer uma análise completa antes de qualquer nova migration
- Data do planejamento: 2026-07-12
- Classificação: `backend + database`

## Resumo

Depois de corrigir `representantes`/`comissoes`/`tipos_receita`/`socios` (tabelas) e `categorias.parent_id`/`receitas.*`/`despesas.*`/`perfis.enquadramento` (colunas), o usuário pediu uma auditoria completa em vez de continuar descobrindo problemas um de cada vez.

Fiz uma varredura sistemática de **todos os 24 arquivos de rota** do backend (`backend/src/routes/*.ts`), extraindo cada `FROM`, `INSERT INTO` e `UPDATE ... SET` usado em SQL cru, e comparei contra a lista real de tabelas/colunas do banco de produção (consulta read-only em `information_schema`).

Resultado: o módulo de **contratos/serviços** (a feature mais recente do app, adicionada depois do dump/restauração usado na unificação de banco) está com lacunas muito maiores do que as já corrigidas — 3 tabelas inteiras faltando e a tabela `contratos` faltando 11 colunas. Todo o resto do backend (meses, anos, usuários, avaliações, cartões, planos, paypal, auth, reservas, sócios, representantes) foi conferido e está **completo** — nenhuma lacuna adicional encontrada fora do módulo de contratos.

## Escopo

### Dentro do escopo

Criar `backend/drizzle/0003_schema_completo_contratos_servicos.sql` substituindo a versão anterior (mais estreita) do 0003, cobrindo:

**Tabelas novas:**
- `servicos` (catálogo de serviços do usuário)
- `contratos_servicos` (vínculo N:N entre contratos e serviços, com valor mensal e status de faturamento por vínculo)
- `contrato_anexos` (arquivos anexados a contratos)

**Colunas novas em tabelas existentes:**
- `categorias`: `parent_id`
- `receitas`: `cliente`, `tipo_receita`, `representante_id`, `valor_comissao`
- `despesas`: `numero_nf`, `data_emissao_nf`, `tipo_despesa`
- `perfis`: `enquadramento`
- `contratos`: `representante_id`, `perfil_id`, `implantacao_parcelas`, `implantacao_valor_parcela`, `horas_presenciais_valor`, `horas_presenciais_saldo_ini`, `horas_presenciais_saldo_atual`, `horas_remotas_valor`, `horas_remotas_saldo_ini`, `horas_remotas_saldo_atual`, `valor_mensal`

Aplicar tudo em uma única transação contra produção, mediante confirmação explícita.

### Fora do escopo

- Qualquer alteração de código — todas as rotas já estão corretas, só o banco está incompleto
- Popular dados (tabelas/colunas novas nascem vazias/NULL)
- `aliquota_aplicada`, `valor_imposto`, `aliquota_imposto` — confirmado, via grep, que não são usadas em nenhuma rota ativa; não serão recriadas

## Leitura de contexto

- Todos os 24 arquivos em `backend/src/routes/*.ts` (varredura completa de SQL cru)
- Dump read-only de `information_schema.columns` para todas as tabelas `public.*` do banco de produção
- `backend/src/db/schema/*.ts` (14 arquivos) — usados como referência para as tabelas que passam por Drizzle; o módulo de contratos/serviços não tem schema Drizzle (é 100% SQL cru), então as colunas foram reconstruídas por engenharia reversa direto das queries

## Impacto por área

### Frontend

Sem impacto de código — as telas de Contratos, Serviços e Anexos devem passar a funcionar assim que o banco tiver as tabelas/colunas.

### Backend

Sem impacto de código — confirmado que todas as rotas já esperam exatamente essas tabelas/colunas.

### Banco de dados

```sql
CREATE TABLE IF NOT EXISTS servicos (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  valor_mensal_padrao DECIMAL(10,2) DEFAULT 0,
  ativo BOOLEAN DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_servicos_usuario ON servicos(usuario_id);

CREATE TABLE IF NOT EXISTS contratos_servicos (
  id SERIAL PRIMARY KEY,
  contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  servico_id INTEGER NOT NULL REFERENCES servicos(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  valor_mensal DECIMAL(10,2) NOT NULL DEFAULT 0,
  implantado BOOLEAN DEFAULT false,
  faturando BOOLEAN DEFAULT false,
  data_inicio_faturamento DATE,
  UNIQUE (contrato_id, servico_id)
);
CREATE INDEX IF NOT EXISTS idx_contratos_servicos_contrato ON contratos_servicos(contrato_id);

CREATE TABLE IF NOT EXISTS contrato_anexos (
  id SERIAL PRIMARY KEY,
  contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome_original VARCHAR(255) NOT NULL,
  nome_arquivo VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100),
  tamanho INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contrato_anexos_contrato ON contrato_anexos(contrato_id);

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS parent_id INTEGER;

ALTER TABLE receitas ADD COLUMN IF NOT EXISTS cliente VARCHAR(100);
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS tipo_receita VARCHAR(30);
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS representante_id INTEGER;
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS valor_comissao DECIMAL(10,2);

ALTER TABLE despesas ADD COLUMN IF NOT EXISTS numero_nf VARCHAR(50);
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS data_emissao_nf DATE;
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS tipo_despesa VARCHAR(10) DEFAULT 'opex';

ALTER TABLE perfis ADD COLUMN IF NOT EXISTS enquadramento VARCHAR(10);

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS representante_id INTEGER;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS perfil_id INTEGER;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS implantacao_parcelas INTEGER DEFAULT 1;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS implantacao_valor_parcela DECIMAL(10,2) DEFAULT 0;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS horas_presenciais_valor DECIMAL(10,2) DEFAULT 0;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS horas_presenciais_saldo_ini DECIMAL(10,2) DEFAULT 0;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS horas_presenciais_saldo_atual DECIMAL(10,2) DEFAULT 0;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS horas_remotas_valor DECIMAL(10,2) DEFAULT 0;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS horas_remotas_saldo_ini DECIMAL(10,2) DEFAULT 0;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS horas_remotas_saldo_atual DECIMAL(10,2) DEFAULT 0;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS valor_mensal DECIMAL(10,2) DEFAULT 0;
```

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual é produção. Aplicação só ocorre após confirmação separada e explícita do SQL final.

### Infra/Deploy

Sem impacto adicional.

## Arquivos provavelmente afetados

- `backend/drizzle/0003_schema_completo_contratos_servicos.sql` (substitui a versão estreita anterior do 0003, que ainda não havia sido aplicada)

## Estratégia de implementação

1. Substituir o arquivo `0003` pela versão completa acima.
2. Apresentar o SQL final consolidado ao usuário.
3. Aplicar em uma única transação contra produção, mediante confirmação explícita e específica.
4. Verificar (read-only) que todas as tabelas/colunas foram criadas.
5. Pedir para o usuário recarregar o app e testar as telas de Receitas, Despesas, Categorias, Contratos, Serviços.
6. Commit do arquivo de migration.

## Regras de negócio identificadas

Nenhuma nova — réplica exata do que o código das rotas já espera.

## Regras multi-tenant e segurança

Todas as tabelas novas seguem o padrão `usuario_id` com `ON DELETE CASCADE`. `contratos_servicos` tem `UNIQUE(contrato_id, servico_id)` porque o código trata erro `23505` (unique_violation) como "serviço já vinculado" — confirma que essa constraint é esperada pelo código.

## Validações necessárias

- Todas as tabelas/colunas listadas acima presentes em `information_schema` após aplicar.
- Nenhum erro `42P01` (undefined_table) ou `42703` (undefined_column) nos logs do backend após recarregar o app.

## Testes necessários

### Backend

- Testar manualmente: listar/criar contrato, vincular serviço a contrato, anexar arquivo a contrato, listar categorias, criar receita com representante e comissão, criar despesa com nota fiscal.

## Comandos de validação sugeridos

Verificação read-only pós-migration (script temporário, apagado após uso — mesmo padrão já usado nas migrations anteriores desta sessão).

## Riscos e pontos de atenção

- Migration maior que as anteriores (3 tabelas + 19 colunas), mas toda `IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS`, sem risco de perda de dado existente.
- `contratos` é a tabela com mais lacunas (11 colunas) — provavelmente porque é a mais recente do app (feature de contratos completos, git history mostra como uma das últimas features grandes antes da unificação de banco).
- Como o campo `perfil_id`/`representante_id`/`valor_mensal` etc. de `contratos` nascem `NULL`/`0` para contratos já existentes (se houver), qualquer contrato criado antes desta correção pode precisar de edição manual para preencher esses campos corretamente.

## Perguntas em aberto

Nenhuma — auditoria completa conforme solicitado; próximo passo é apresentar o SQL final consolidado para confirmação.

## Critérios de aceite do plano

- As 3 tabelas novas e as 19 colunas novas existem em produção.
- Nenhum erro `42P01`/`42703` nos logs ao usar as telas de Receitas, Despesas, Categorias, Contratos, Serviços.

## Observações para a skill implementar

- Substituir o arquivo `0003` estreito criado anteriormente (ainda não aplicado) por esta versão completa.
- Confirmar explicitamente com o usuário antes de executar contra produção.
- Usar `IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS` em tudo.
