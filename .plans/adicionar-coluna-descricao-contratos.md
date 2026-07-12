# Plano de Implementação: Adicionar coluna `descricao` faltante em `contratos`

## Origem

- Erro reportado pelo usuário: `GET /api/contratos/faturamento` retornando 500 ("Failed to get faturamento")
- Data do planejamento: 2026-07-12
- Classificação: `backend + database`

## Resumo

A rota `GET /api/contratos/faturamento` (`backend/src/routes/contracts.ts:135`) seleciona `c.descricao AS contrato_descricao`, mas a tabela `contratos` nunca teve essa coluna. Confirmei via consulta read-only direta no banco de produção que `descricao` não está entre as 24 colunas existentes. Essa coluna passou despercebida na auditoria de schema realizada mais cedo nesta sessão — refiz a checagem cruzando cada `c.`/`ct.` referenciado em todo `contracts.ts` contra o schema real; é a única lacuna restante.

Durante a investigação também foi identificado que **nenhuma rota do módulo de contratos/clientes/serviços filtra por `perfil_id`** — decisão do usuário: tratar isso como um plano separado, fora deste escopo.

## Escopo

### Dentro do escopo

- Adicionar `ALTER TABLE contratos ADD COLUMN IF NOT EXISTS descricao VARCHAR(255);` ao banco de produção.

### Fora do escopo

- Amarração de `perfil_id` no módulo de contratos/clientes/serviços — fica para um plano dedicado futuro, por decisão explícita do usuário.
- Qualquer endpoint que defina/edite `descricao` — hoje nenhuma rota escreve nesse campo; ele nasce sempre `NULL`. Adicionar essa funcionalidade não está neste escopo (só destravar o erro 500 existente).

## Leitura de contexto

- `backend/src/routes/contracts.ts` (linha 135, rota `/faturamento`)
- Consulta read-only em `information_schema.columns` para `contratos` (produção)
- Consistência de tipo: `despesas.descricao` e `receitas.descricao` usam `VARCHAR(255)`

## Impacto por área

### Frontend

Sem impacto de código — a tela de faturamento volta a carregar assim que a coluna existir.

### Backend

Sem impacto de código — a query já está correta, só falta a coluna.

### Banco de dados

```sql
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS descricao VARCHAR(255);
```

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual é produção. Aplicação só ocorre após confirmação separada e explícita.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `backend/drizzle/0004_contratos_descricao.sql` (novo)

## Estratégia de implementação

1. Criar a migration.
2. Aplicar contra produção mediante confirmação explícita.
3. Verificar (read-only) que a coluna existe.
4. Pedir para o usuário recarregar e testar o card de faturamento.
5. Commit da migration.

## Regras de negócio identificadas

Nenhuma nova.

## Regras multi-tenant e segurança

Não aplicável — coluna nova, sem dado sensível, sem mudança de autorização.

## Validações necessárias

- Coluna presente em `information_schema` após aplicar.
- `GET /api/contratos/faturamento` deixa de retornar 500.

## Testes necessários

### Backend

- Testar manualmente o card "Faturamento" do painel após o deploy.

## Comandos de validação sugeridos

Verificação read-only pós-migration (script temporário, apagado após uso).

## Riscos e pontos de atenção

- Risco mínimo — `ADD COLUMN IF NOT EXISTS`, sem afetar dados existentes.
- Coluna fica `NULL` para todos os contratos, já que nenhuma rota a escreve hoje — o card de faturamento vai mostrar a descrição vazia até existir uma forma de preenchê-la (fora do escopo deste plano).

## Perguntas em aberto

Nenhuma — amarração de perfil explicitamente adiada para plano futuro por decisão do usuário.

## Critérios de aceite do plano

- Coluna `contratos.descricao` existe em produção.
- `GET /api/contratos/faturamento` responde 200.

## Observações para a skill implementar

- Confirmar explicitamente com o usuário antes de executar contra produção.
- Não expandir escopo para a amarração de perfil — fica para plano separado.
