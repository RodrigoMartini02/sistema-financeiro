# Plano de Implementação: Controle das migrations aplicadas

## Origem

- **Arquivo de especificação:** nenhum `.md`. A origem é a comparação de estrutura entre o banco local e a produção, feita em 2026-10-02, que encontrou dois problemas:
  - a produção estava sem a 0014 (`plan_notification_events`) desde agosto, o que quebrava a rotina de vencimento de plano;
  - o banco local estava 8 migrations atrás.
- **Data do planejamento:** `2026-10-02`
- **Classificação:** `backend + database`. O plano cria uma tabela nova por migration e um script do backend. Não há rota nova nem mudança no front.

## Resumo

As 50 migrations de `backend/drizzle/` são aplicadas à mão, e nada registra o que já entrou em cada banco. O plano faz o seguinte:

- cria a tabela `schema_migrations`;
- cria um script com três comandos:
  - `status`: só lê;
  - `aplicar`: uma migration por vez, sempre nomeada;
  - `registrar-existentes`: registro inicial;
- registra as migrations 0000–0056 como já aplicadas nos dois bancos;
- inclui o `status` como passo do `/finalizar`.

A aplicação continua dependendo da confirmação do usuário.

## Decisões registradas

- **Decisão 1:** a tabela se chama `schema_migrations`, com colunas em inglês.
- **Decisão 2:** o `aplicar` executa uma migration por vez, sempre nomeada, nos dois bancos.

## Escopo

### Dentro do escopo

- **`backend/drizzle/0057_registro_migrations.sql`.** Cria a tabela `schema_migrations` com três colunas:
  - `filename`: nome do arquivo, chave primária;
  - `checksum`: SHA-256 do conteúdo, calculado com as quebras de linha normalizadas para LF, porque o git no Windows converte para CRLF;
  - `applied_at`: data da aplicação.
- **`backend/src/utils/migrationStatus.ts`**, lógica pura com teste:
  - ordena as migrations pelo número do arquivo; número pulado é aceito, número repetido é erro;
  - calcula o status: pendentes (arquivo sem registro), editadas (assinatura diferente da registrada) e registros sem arquivo;
  - valida o `aplicar`: recusa migration já aplicada, número inexistente e migration com outra pendente antes dela, listando qual.
- **`backend/scripts/migrations.ts`**, rodado com tsx:
  - **Escolha do banco:**
    - `--banco local`: lê o `.env.dev` e exige `localhost:5433/sistema_financas_dev`;
    - `--banco producao`: lê o `.env` e exige `render.com`. Qualquer escrita exige também `--confirmo`; sem ele, o script recusa antes de conectar.
  - **`status`:** roda numa transação READ ONLY. Se a tabela ainda não existir, avisa e lista tudo como pendente.
  - **`aplicar NNNN`:** executa o SQL da migration e grava o registro na mesma transação.
  - **`registrar-existentes --ate NNNN`:** registra as migrations até NNNN sem executá-las. Pula as que já estão registradas e informa quantas registrou.
- **`backend/package.json`:** novos comandos `migrations:status`, `migrations:aplicar` e `migrations:registrar-existentes`.
- **`.claude/skills/finalizar/SKILL.md`, seção 7:** quando houver migration, rodar o `status` nos dois bancos e mostrar as pendentes antes de pedir confirmação. A aplicação é uma por vez; na produção, só depois do deploy e com `--confirmo`.

### Fora do escopo

- Trocar pelo `drizzle-kit`, renumerar ou reescrever migrations antigas.
- Aplicar migrations automaticamente no deploy ou na subida do servidor.
- O script antigo `backend/scripts/setup-dev-db.js`, que está desatualizado.

## Leitura de contexto

- `/AGENT.md`: Drizzle nas consultas novas, SQL raw só com motivo claro, código em inglês.
- `/CLAUDE.md`: migration só com confirmação; o banco pode ser a produção.
- `/backend/AGENT.md` e `/frontend/AGENT.md` não existem; o `AGENT.md` da raiz cobre o repositório.
- **`backend/drizzle/*.sql`:** 50 arquivos, de 0000 a 0056. Faltam números depois de 0005, 0018 e 0020. Não há journal do drizzle-kit.
- **`backend/src/db/client.ts`:** SSL só fora do localhost; `search_path` vem de `DB_SCHEMA`.
- **`backend/package.json`:** `tsx` disponível. Os testes rodam `src/services/*.test.ts` e `src/utils/*.test.ts`.
- **`backend/scripts/`:** já tem scripts de manutenção.
- **`.claude/skills/finalizar/SKILL.md`:** seção 7, regra para migrations.
- **Scripts de 2026-10-02 no scratchpad da sessão**, que servem de referência para as guardas de URL e as transações:
  - `compare_local_prod.cjs`
  - `apply_0014_prod.cjs`
  - `apply_local_migrations.cjs`

## Impacto por área

### Frontend

Sem impacto esperado.

### Backend

- **Script e lógica pura:** os descritos no escopo. Nenhuma rota usa a tabela, e o app não lê nem grava nela.
- **SQL raw:** é necessário, porque executar o conteúdo dos arquivos `.sql` é a função do script. O registro na tabela usa SQL parametrizado.

### Banco de dados

- **Tabela nova:** `schema_migrations`, criada pela 0057 nos dois bancos.
- **Registro inicial:** 50 linhas em cada banco, de 0000 a 0056.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- Nenhuma variável nova. O script usa o `.env.dev` e o `.env` que já existem.
- O deploy não executa nada do controle.

## Arquivos provavelmente afetados

- Novos:
  - `backend/drizzle/0057_registro_migrations.sql`
  - `backend/src/utils/migrationStatus.ts`
  - `backend/src/utils/migrationStatus.test.ts`
  - `backend/scripts/migrations.ts`
- Alterados:
  - `backend/package.json`
  - `.claude/skills/finalizar/SKILL.md`

## Estratégia de implementação

**Fase 0 — Branch**

1. Atualizar a `main` e criar `feat/R/controle-migrations`.

**Fase 1 — Remover**

2. Não há o que remover, porque hoje não existe controle de migrations.

**Fase 2 — Aplicar**

3. Criar `backend/src/utils/migrationStatus.ts` e o teste.
4. Criar `backend/drizzle/0057_registro_migrations.sql`.
5. Criar `backend/scripts/migrations.ts` e os comandos no `backend/package.json`.
6. Atualizar a seção 7 de `.claude/skills/finalizar/SKILL.md`.

**Fase 3 — Validar**

7. Rodar `npx tsc --noEmit`, `npm test`, `npm run build`, `npm --prefix backend run build` e `npm --prefix backend test`.
8. **No banco local:**
   - rodar `status`; sem a tabela, tudo aparece pendente;
   - rodar `aplicar 0057`, depois `registrar-existentes --ate 0056`, e conferir no `status` que não sobrou pendência;
   - conferir as recusas: aplicar de novo a 0057, um número inexistente e uma escrita na produção sem `--confirmo`.
9. **Na produção**, com a confirmação do usuário na hora e fora do modo automático:
   - identificar as migrations que só mexem em dados e conferir, só lendo, um sinal de cada uma;
   - rodar `aplicar 0057 --banco producao --confirmo`;
   - rodar `registrar-existentes --ate 0056 --banco producao --confirmo`;
   - rodar `status` e conferir que não sobrou pendência.

## Regras de negócio identificadas

- As migrations são aplicadas uma por vez, nomeadas, em ordem. Se houver pendente anterior, o `aplicar` recusa.
- Na produção, só se escreve com `--confirmo` e com o ok do usuário.
- Migrations que dependem do deploy continuam esperando o deploy; o script não decide quando aplicar.
- Arquivo editado depois de aplicado aparece como alerta no `status`, sem bloquear.

## Regras multi-tenant e segurança

- Cada `--banco` só aceita a URL esperada, então o script não age no banco errado.
- O script não imprime credenciais.
- Cada `aplicar` executa a migration e grava o registro na mesma transação. Em caso de erro, nada fica gravado.

## Validações necessárias

- `--banco` é obrigatório: `local` ou `producao`.
- O número da migration precisa existir e ser único.
- `--confirmo` é obrigatório para escrever na produção.

## Testes necessários

### Frontend

- Nenhum.

### Backend

- **Teste unitário de `migrationStatus`:**
  - ordenação com números pulados;
  - erro com número repetido;
  - pendentes, editadas e sem arquivo;
  - a assinatura não muda entre CRLF e LF;
  - as recusas do `aplicar`.
- **Roteiro no banco local** (passo 8).

### E2E

- Roteiro na produção (passo 9), com confirmação.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npm run build
npm --prefix backend run build
npm --prefix backend test
```

## Riscos e pontos de atenção

- **Migrations só de dados:** o registro inicial supõe que elas já foram aplicadas. A conferência só de leitura antes do registro reduz esse risco.
- **Uma migration por vez:** quando houver várias pendentes, serão vários comandos. Foi a decisão 2.
- **Modo automático:** o classificador bloqueia escrita na produção nesse modo.
- **Edição de arquivo aplicado:** a partir dela, o `status` aponta a migration como editada.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação está pronta quando:

- `status` mostra corretamente pendentes, editadas e sem arquivo;
- `aplicar NNNN` executa só aquela migration e grava o registro na mesma transação;
- `aplicar` recusa: já aplicada, número inexistente, pendente anterior e produção sem `--confirmo`;
- nos dois bancos, a `schema_migrations` existe com 0000–0057 registradas e o `status` mostra zero pendências;
- o `/finalizar` roda o `status` nos dois bancos quando há migration;
- tsc, testes e builds passam.

## Observações para a skill implementar

- **Ordem:** a Fase 1 remove e a Fase 2 aplica. Aqui a Fase 1 é vazia.
- **Produção:** nada é escrito lá sem a confirmação do usuário na hora.
- **Proibições:**
  - não fazer commit nem push;
  - não alterar o `.env`.
