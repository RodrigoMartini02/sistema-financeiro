# Plano de Implementação: Consolidar na conta 17 e separar ambientes

## Origem

- Arquivo de especificação: solicitações do usuário no chat, após a descoberta de que o `.env` do ambiente local aponta para o banco de produção no Render
- Data do planejamento: 2026-09-06
- Classificação: `database + infra`
- Branch: `refactor/R/padronizar-modal-configuracoes`

## Resumo

Dois itens independentes:

1. **Consolidar todos os dados do usuário na conta 17** e apagar as outras 13 contas do banco de produção, com seus dados.
2. **Criar um banco local de desenvolvimento**, separado do Render, para que `npm run dev` deixe de escrever em produção.

O item 1 envolve exclusão irreversível. O item 2 não altera o `.env` existente.

## Decisões aplicadas

- Contas: manter **apenas a 17**; apagar as outras 13.
- Dados das contas apagadas: **excluídos junto**, não migrados.
- 582 registros com `conta_id` NULL: **vinculados à conta 17** (opção 1 da decisão pendente).
- Tabela `meses`: **apagar todos os registros** — são saldos derivados, recalculáveis a partir dos lançamentos. Evita conflito de índice único e limpa a inconsistência existente (incluindo um `saldo_final = NaN` no id 250).

## Contexto: a descoberta que originou o plano

O `.env` da raiz do workspace aponta para o banco de produção:

```
DATABASE_URL=postgresql://sistema_financas_user:***@dpg-...oregon-postgres.render.com/sistema_financas
```

Existe **um único** `.env` no projeto. `backend/src/server.ts` e `backend/src/db/client.ts` carregam ambos de `../../.env`. Não há banco local configurado.

Consequência: rodar `npm run dev` e usar `localhost:5173` grava **direto em produção**. Foi o que aconteceu quando o usuário cadastrou 10 despesas e 6 receitas "no local" — elas foram para o Render e duplicaram com os registros que a migração conta 3 → 17 havia recuperado.

## Levantamento (somente leitura)

### Volume por destino

| Destino | Registros |
|---|---|
| Conta 17 (preservar) | 144 |
| Outras contas (apagar) | 83 |
| `conta_id` NULL (vincular à 17) | 582 |

### Os 582 órfãos

despesas 440, categorias 52, receitas 44, meses 28, movimentacoes_reservas 12, cartoes 3, reservas 2, clientes 1.

São a maior parte do histórico do usuário. Aparecem hoje na interface por causa da cláusula de resgate em `utils/accountFilter.ts` (registro sem conta pertence à conta pessoal do dono). Vinculá-los à conta 17 elimina essa dependência.

### As 13 contas a apagar

| Conta | Usuário | Nome | Registros |
|---|---|---|---|
| 3 | 1 | Pessoal (inativa) | 19 |
| 5 | 1 | PJ (inativa) | 26 |
| 8 | 1 | Aether (ativa) | 23 |
| 11 | 12 | Aether (ativa) | 15 |
| 2, 15, 6, 12, 7, 13, 10, 14, 16 | 4, 9, 10, 11, 12 | várias | **0 cada** |

Nove das treze estão completamente vazias.

### Chaves estrangeiras apontando para `contas`

`ON DELETE NO ACTION`: cartoes, categorias, compromissos, despesas, meses, movimentacoes_reservas, receitas, reservas.
`ON DELETE CASCADE`: conta_membros, copilot_conversas, ia_eventos_uso, orcamento_metas.
`ON DELETE SET NULL`: clientes, representantes, socios.

As `NO ACTION` impedem apagar uma conta que ainda tenha registros. Por isso a ordem das etapas importa: dados primeiro, contas depois.

## Escopo

### Dentro do escopo

**Item 1 — banco de produção:**
- Backup integral, em arquivo, de tudo que será alterado ou apagado.
- Apagar todos os registros de `meses`.
- Vincular os registros com `conta_id` NULL à conta 17.
- Apagar os dados das contas 3, 5, 8 e 11.
- Apagar as 13 contas.

**Item 2 — ambiente local:**
- Criar a base `sistema_financas_dev` no PostgreSQL local (porta 5433).
- Aplicar o schema a partir das migrations em `backend/drizzle/`.
- Criar `.env.local` apontando para a base local.
- Ajustar o script `dev` do backend para usar `DOTENV_CONFIG_PATH` com o `.env.local`.

### Fora do escopo

- Alterar o `.env` existente (permanece apontando para produção, usado no deploy).
- Recalcular os saldos mensais — o sistema os recompõe a partir dos lançamentos.
- Copiar dados de produção para o banco local (começa vazio).
- Código de aplicação.
- Pendências de UI e o merge do commit `ab4dd44`.

## Leitura de contexto

- `CLAUDE.md` da raiz e do `sistema financas`
- `.env` da raiz (leitura do `DATABASE_URL`, sem alteração)
- `backend/src/server.ts` e `backend/src/db/client.ts` (carregamento do dotenv)
- `backend/src/utils/accountFilter.ts` (cláusula de resgate de órfãos)
- `backend/drizzle/` (migrations, para montar o schema local)
- `backend/package.json` (script `dev`)
- Banco de produção, via consultas somente-leitura
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` neste projeto: o `CLAUDE.md` da raiz cobre todo o repositório.

## Impacto por área

### Frontend

Sem impacto esperado.

### Backend

Item 1: sem alteração de código.

Item 2: possível ajuste no script `dev` do `backend/package.json` para apontar ao `.env.local`. Nenhuma lógica alterada.

### Banco de dados

**Produção** — item 1, todas as operações em transação única:

```sql
DELETE FROM meses;
UPDATE <tabelas> SET conta_id = 17 WHERE conta_id IS NULL;
DELETE FROM <tabelas> WHERE conta_id <> 17;
DELETE FROM contas WHERE id <> 17;
```

**Local** — item 2: criação da base `sistema_financas_dev` e aplicação do schema. Nenhuma migration é executada em produção.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário. As migrations do item 2 rodam **apenas no banco local**, nunca no Render.

### Infra/Deploy

O `.env` atual permanece intocado, então o deploy no Render continua funcionando igual.

O `.env.local` é novo e serve apenas ao desenvolvimento. Deve entrar no `.gitignore` se ainda não estiver coberto.

## Estratégia de implementação

### Item 1 — consolidação (produção)

1. Gerar backup em arquivo JSON: conteúdo integral de todas as linhas que serão apagadas ou alteradas, mais a lista das 13 contas.
2. Abrir transação.
3. `DELETE FROM meses` (58 registros: 28 órfãos + 26 de outras contas + 4 da conta 17).
4. `UPDATE ... SET conta_id = 17 WHERE conta_id IS NULL` nas tabelas com órfãos.
5. `DELETE` dos registros das contas 3, 5, 8 e 11 nas tabelas com `NO ACTION`.
6. `DELETE FROM contas WHERE id <> 17`.
7. Conferir: nenhuma conta além da 17; nenhum `conta_id` NULL ou apontando para conta inexistente; contagem de despesas e categorias do usuário preservada.
8. Se qualquer conferência falhar, `ROLLBACK` e reportar. Caso contrário, `COMMIT`.

### Item 2 — ambiente local

9. Verificar o PostgreSQL local na porta 5433.
10. Criar a base `sistema_financas_dev`.
11. Aplicar as migrations de `backend/drizzle/` **na base local**.
12. Criar `.env.local` com `DATABASE_URL` apontando para a base local, copiando as demais variáveis do `.env` atual.
13. Ajustar o script `dev` do backend para carregar o `.env.local`.
14. Subir o backend e confirmar que `/health` responde conectado à base local.

## Regras de negócio identificadas

- Registro com `conta_id` NULL é tratado como pertencente à conta pessoal do dono (`utils/accountFilter.ts`). Vinculá-lo explicitamente à conta 17 preserva o comportamento e remove a ambiguidade.
- A tabela `meses` guarda saldo derivado por mês. É recalculável a partir de despesas e receitas, portanto seguro apagar.
- Chaves `NO ACTION` exigem que os dados sejam removidos antes das contas.
- O índice único `meses_usuario_ano_mes_conta_unique` cobre `(usuario_id, ano, mes, COALESCE(conta_id, 0))` — apagar a tabela inteira evita qualquer conflito ao consolidar.

## Regras multi-tenant e segurança

O projeto não é multi-tenant por organização; o isolamento é por `usuario_id`.

O usuário confirmou explicitamente que as contas dos demais usuários (4, 9, 10, 11, 12) são dados de teste dele próprio e devem ser removidas. Nove dessas contas já estão vazias; apenas a conta 11 (usuário 12) tem 15 registros.

Após a execução, o banco de produção conterá apenas a conta 17. Os usuários continuam existindo na tabela `usuarios` — este plano não os remove.

## Validações necessárias

Conferências obrigatórias dentro da transação, antes do `COMMIT`:

- `SELECT COUNT(*) FROM contas` deve retornar 1.
- Nenhuma tabela pode ter `conta_id` NULL.
- Nenhuma tabela pode ter `conta_id` apontando para conta inexistente.
- A contagem de despesas do usuário 1 deve ser 440 + 109 = 549 (órfãs + as já na conta 17).
- A contagem de categorias do usuário 1 deve ser 52 + 19 = 71.

## Testes necessários

### Frontend

Verificação manual após a execução:
- A troca de contas mostra apenas a conta 17.
- As despesas e categorias continuam visíveis.
- Os saldos aparecem recalculados (ou zerados até o primeiro recálculo).

### Backend

A suíte existente (23 testes) não é afetada — nenhuma lógica muda.

Para o item 2: `curl http://localhost:3010/health` deve responder com `database: Connected`, apontando para a base local.

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
# item 2 — apos configurar o ambiente local
curl -s http://localhost:3010/health

# nenhum build e necessario para o item 1
```

## Riscos e pontos de atenção

- **Muito alto:** exclusão irreversível em produção. Mitigado por backup integral em arquivo antes de qualquer escrita, e transação única com conferências antes do `COMMIT`.
- **Alto:** a conta 8 "Aether" está ativa e contém cartão, cliente, sócio e 11 despesas; a conta 11 (usuário 12) tem 2 cartões e 5 despesas. Se algum desses dados for real, será perdido. O usuário declarou que são de teste.
- **Médio:** apagar `meses` zera os saldos históricos até que o sistema os recalcule. Os lançamentos permanecem intactos, então o recálculo é possível.
- **Médio:** o item 2 depende de o PostgreSQL local aceitar a criação da base e de as migrations aplicarem sem erro. Se falhar, o ambiente local não sobe — mas produção não é afetada.
- **Baixo:** o `.env` atual não é alterado; o deploy continua funcionando.

## Perguntas em aberto

- O `.env.local` deve conter as mesmas chaves de API (IA, e-mail) do `.env` atual, ou ficar sem elas? A definir durante a implementação; sem elas, funcionalidades que dependem de serviços externos não funcionam no ambiente local.

## Critérios de aceite do plano

- A conta 17 é a única na tabela `contas`.
- Nenhum registro com `conta_id` NULL em qualquer tabela.
- Nenhum registro apontando para conta inexistente.
- As 440 despesas e 52 categorias antes órfãs estão vinculadas à conta 17.
- Backup em arquivo gerado antes da exclusão, com o conteúdo integral do que foi removido.
- A base local existe, com o schema aplicado.
- `npm run dev` no backend conecta à base local, não ao Render.
- O `.env` original permanece inalterado.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- **Pedir confirmação explícita do usuário antes de executar as exclusões em produção**, mesmo com o plano aprovado.
- Gerar o backup ANTES de qualquer escrita. Sem backup, não executar.
- Executar todo o item 1 em transação única, com `ROLLBACK` automático se qualquer conferência falhar.
- Respeitar a ordem: `meses` → vincular órfãos → apagar dados → apagar contas.
- **Não alterar o `.env` existente.** Criar `.env.local` como arquivo novo.
- Não executar migrations no banco de produção; as do item 2 rodam apenas na base local.
- Confirmar que `.env.local` está coberto pelo `.gitignore` antes de qualquer commit.
- Registrar no resumo final: contagens antes e depois, caminho do backup e resultado das conferências.
