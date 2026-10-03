# Plano de Implementação: setores e cargos padrão nas contas PJ

## Origem

- **Especificação:** não há arquivo `.md`. O pedido veio do chat em 2026-10-03, depois do merge `c055c1db` (telas de Setores e Cargos): "lista padrão de setores e cargos ... só os mais globais". O usuário escolheu deixar a lista padrão em todas as contas PJ, novas e existentes.
- **Data do planejamento:** `2026-10-03`
- **Classificação:** `backend + database`

## Resumo

Toda conta PJ passa a começar com uma lista padrão de setores e de cargos. Os itens são normais, ou seja, podem ser renomeados e desativados como qualquer outro.

- **Setores (8):** Administrativo, Financeiro, Comercial, Marketing, Recursos Humanos, Operacional, Atendimento, TI.
- **Cargos (10):** Diretor, Gerente, Coordenador, Supervisor, Analista, Assistente, Auxiliar, Estagiário, Vendedor, Atendente.

As contas novas recebem as listas no momento em que são criadas. As que já existem recebem por uma migration de dados.

## Escopo

### Dentro do escopo

- Constantes com as duas listas, com teste.
- Uma função idempotente que grava as listas numa conta PJ. Ela é chamada na criação da conta PJ, tanto no cadastro com CNPJ quanto na "Nova conta", dentro da transação que já existe.
- A migration 0063, só com dados: grava as listas em todas as contas PJ que já existem.

### Fora do escopo

- Botão "restaurar padrões".
- Listas padrão em conta PF.
- Mudanças em tela. As telas e o modal do colaborador já mostram o que estiver nas listas.

## Leitura de contexto

- **Arquivos de instrução:**
  - `/AGENT.md`, só as regras transversais;
  - `/CLAUDE.md`;
  - `/frontend/AGENT.md` e `/backend/AGENT.md` não existem neste projeto.
- **Padrão de listas padrão:**
  - `backend/src/services/incomeClassificationDefaults.ts` e o teste dele;
  - `ensureDefaultIncomeClassifications` em `incomeClassificationCatalog.ts`;
  - migration `0054_classificacao_receita_vale_refeicao.sql`, que leva um item padrão às contas existentes.
- **Criação de conta:** os únicos lugares que criam conta PJ são `backend/src/routes/auth.ts` (cadastro com CNPJ, ~l.251) e `backend/src/routes/accounts.ts` (POST, Nova conta). `accountBackfill.ts` só cria conta PF.
- **Tabelas:** `setores` e `cargos` (migration 0062), cada uma com índice único `(conta_id, LOWER(nome)) WHERE ativo`.
- **Diagnóstico na produção, só leitura, em 2026-10-03:** 1 conta PJ ativa, 0 setores e 0 cargos.

## Impacto por área

### Frontend

Sem impacto esperado.

### Backend

- **`backend/src/services/accountNameCatalogDefaults.ts`** (novo, puro):
  - `DEFAULT_SECTORS`, com os 8 nomes, e `DEFAULT_JOB_TITLES`, com os 10;
  - um comentário avisa que a migration 0063 tem uma cópia fixa dessas listas.
- **`backend/src/services/accountNameCatalogDefaults.test.ts`** (novo):
  - quantidade de itens;
  - nenhum nome vazio;
  - até 100 caracteres;
  - sem repetição, sem diferenciar maiúscula.
- **`backend/src/services/accountNameCatalogSeed.ts`** (novo):
  - assinatura: `ensureDefaultAccountNames(executor: Pick<typeof db, 'execute'>, { ownerId, accountId })`.
  - **SQL:** um `INSERT ... SELECT ... FROM unnest(${nomes}::text[]) ... WHERE NOT EXISTS (mesmo nome na conta, ativo ou desativado, sem diferenciar maiúscula)` para `setores` e outro para `cargos`.
  - **Por que SQL cru:** é o mesmo motivo de `ensureDefaultIncomeClassifications`, já que o insert com `NOT EXISTS` e `unnest` não tem expressão boa na API do Drizzle. O comentário no código explica.
  - **Idempotência:** chamar de novo não duplica nada nem reativa item desativado.
- **`backend/src/routes/auth.ts`** (cadastro com CNPJ):
  - o insert da conta `empresa` passa a usar `.returning({ id: accounts.id })`;
  - em seguida, chama `ensureDefaultAccountNames(transaction, { ownerId: createdUser.id, accountId })`, na mesma transação.
- **`backend/src/routes/accounts.ts`** (POST, Nova conta): depois do insert da conta e das categorias padrão, chama `ensureDefaultAccountNames(transaction, { ownerId, accountId: account.id })`, antes de `saveAccountPartners`.

### Banco de dados

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

**`backend/drizzle/0063_setores_cargos_padrao.sql`**, só com dados e idempotente:

```sql
INSERT INTO setores (usuario_id, conta_id, nome)
SELECT c.usuario_id, c.id, padrao.nome
  FROM contas c
 CROSS JOIN (VALUES ('Administrativo'), ('Financeiro'), ('Comercial'), ('Marketing'),
                    ('Recursos Humanos'), ('Operacional'), ('Atendimento'), ('TI')) AS padrao(nome)
 WHERE c.tipo = 'empresa'
   AND NOT EXISTS (SELECT 1 FROM setores s WHERE s.conta_id = c.id AND LOWER(s.nome) = LOWER(padrao.nome));
-- cargos: o mesmo, com Diretor, Gerente, Coordenador, Supervisor, Analista,
-- Assistente, Auxiliar, Estagiário, Vendedor e Atendente.
```

- **Cabeçalho:** o mesmo padrão da 0054. Explica o motivo e que a lista do código cuida das contas novas. Avisa que não recria um item desativado e que não deve ser executada sem confirmação.
- **Ordem:** pode entrar a qualquer momento, porque as tabelas são da 0062, que já está nas duas bases. Na produção, vai depois do deploy, para cobrir também as contas criadas antes dele.

### Infra/Deploy

Sem impacto além do deploy normal pelo merge na `main`. A 0063 é aplicada na produção depois do deploy, com confirmação.

## Arquivos provavelmente afetados

- Novos:
  - `backend/src/services/accountNameCatalogDefaults.ts`
  - `backend/src/services/accountNameCatalogDefaults.test.ts`
  - `backend/src/services/accountNameCatalogSeed.ts`
  - `backend/drizzle/0063_setores_cargos_padrao.sql`
- Alterados:
  - `backend/src/routes/auth.ts`
  - `backend/src/routes/accounts.ts`

## Estratégia de implementação

1. Criar a branch: `git checkout main && git pull`, depois `git checkout -b feat/R/setores-cargos-padrao`. `.portal/` e `GLOSSARIO.md` ficam fora do commit.
2. Escrever as constantes e o teste, `ensureDefaultAccountNames` e as chamadas em `auth.ts` e `accounts.ts`.
3. Escrever a 0063 e aplicá-la no banco local, com confirmação.
4. Validar:
   - testes e checagem de tipos do backend, mais o `vite build`;
   - roteiro local com o backend na porta 3013.
5. Fechar com o resumo e a pergunta sobre a produção. No `/finalizar`, a ordem é: merge, deploy e, depois, a 0063 na produção com confirmação.

## Regras de negócio identificadas

- **Conteúdo das listas:** toda conta PJ tem os 8 setores e os 10 cargos padrão, ativos, salvo se a conta já tiver um item com o mesmo nome, ativo ou não.
- **Itens padrão são itens normais:** podem ser renomeados e desativados. Um item desativado não volta sozinho.
- **Conta PF:** não ganha nada.

## Regras multi-tenant e segurança

- O isolamento é por conta. As listas são gravadas só na conta que está sendo criada, e o dono é o da própria conta.
- Não há rota nova nem permissão nova.

## Validações necessárias

- **Nenhuma entrada de usuário nova.**
- **Constantes:** o teste garante nomes únicos, sem nome vazio e com até 100 caracteres.

## Testes necessários

### Frontend

- Não se aplica.

### Backend

- **`accountNameCatalogDefaults.test.ts`:**
  - 8 setores e 10 cargos;
  - nomes únicos, sem diferenciar maiúscula;
  - nenhum nome vazio;
  - até 100 caracteres.

### E2E

Roteiro local `roteiro_padrao.mjs`, com o backend na porta 3013 e usuários em `@roteiro-padrao.test`:

1. **Cadastro PJ com CNPJ:** `GET /api/sectors` traz os 8 setores ativos, e `GET /api/job-titles` traz os 10 cargos.
2. **"Nova conta" de um titular PF:** a conta nova vem com as mesmas listas.
3. **Conta PF:** não tem setores nem cargos, e a rota continua respondendo 400 para conta PF.
4. **Desativar um item padrão:** ele continua desativado. Criar de novo o mesmo nome continua funcionando.
5. **Migration 0063 no banco local:**
   - uma conta PJ criada antes, sem listas, passa a ter todas;
   - uma conta que já tinha "Financeiro" não ganha duplicado.

## Comandos de validação sugeridos

```bash
npm --prefix backend test
npm --prefix backend run build
npx vite build
npm --prefix backend run migrations:aplicar -- 0063 --banco local
# Produção — no /finalizar, depois do deploy e com confirmação:
npm --prefix backend run migrations:aplicar -- 0063 --banco producao --confirmo
```

## Riscos e pontos de atenção

- **Listas fixas na migration:** se a lista do código mudar no futuro, a 0063 continua com a lista original. É o mesmo caso da 0054.
- **Contas antigas:** só recebem as listas pela 0063. Sem ela, só as contas novas têm os padrões.
- **Impacto na produção:** hoje só 1 conta PJ recebe as listas.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- **Contas novas:**
  - uma conta PJ nova, pelo cadastro ou pela "Nova conta", já vem com os 8 setores e os 10 cargos, ativos e editáveis;
  - uma conta PF não ganha nada.
- **Contas que já existem:** a 0063 grava as listas nas contas PJ existentes, sem duplicar e sem reativar item desativado.
- **Validação técnica:** testes, checagem de tipos, build e roteiro local passam. A 0063 é aplicada com confirmação, e na produção depois do deploy.

## Observações para a skill implementar

- Usar este plano como fonte principal.
- Pedir confirmação antes da 0063, mesmo no banco local.
- Manter a execução enxuta, só com status curto.
- A função que grava as listas recebe o executor da transação, porque precisa gravar junto com a conta.
- No fim do roteiro, conferir se sobrou processo na porta 3013 e avisar o usuário.
- Terminar com "A implementação está pronta localmente. Deseja enviar para produção?".

## Notas da implementação (2026-10-03)

- **Validação local:**
  - a 0063 foi aplicada no banco local com a confirmação do usuário;
  - roteiro de API (`roteiro_padrao.mjs`, backend local na porta 3014): fase "antes" 6/6 e fase "depois" 4/4;
  - os usuários de teste `@roteiro-padrao.test` foram apagados.
- **Como as listas são gravadas:** `ensureDefaultAccountNames` usa um `VALUES` com os nomes e casts explícitos (`::int`, `::text`), sem passar a lista como array, que o `sql` do Drizzle expandiria em parâmetros separados.
- **Porta do roteiro:** foi a 3014 porque a 3013 ainda estava ocupada pelo backend de teste da entrega anterior (PID 15976).
