# Plano de Implementação: Corrigir "Failed to create expense" — coluna legada `valor` não preenchida

## Origem

- Reportado pelo usuário via print do DevTools: `POST /api/despesas` retornando `{success:false, message:"Failed to create expense"}` (500) ao registrar qualquer despesa nova, em qualquer perfil
- Confirmado via log de produção (Render) colado pelo usuário em 2026-07-17, 01:49 AM:
  ```
  error: null value in column "valor" of relation "despesas" violates not-null constraint
  code: '23502'
  detail: 'Failing row contains (18893, 1, wqwqw, null, 2026-07-17, ...)'
  at async <anonymous> (/opt/render/project/src/backend/src/routes/expenses.ts:183:22)
  ```
- Data do planejamento: 2026-07-17
- Classificação: `backend`

## Resumo

A tabela `despesas` em produção ainda tem a coluna legada `valor` com constraint `NOT NULL`, sem default. O plano `.plans/refatorar-campos-valor-despesa.md` (2026-07-02) já previa substituí-la por `valor_original`/`valor_final` e incluía `ALTER TABLE despesas DROP COLUMN valor;` como último passo — mas essa migration exige confirmação explícita antes de rodar (regra do projeto, produção) e não foi executada.

O código, no entanto, já foi atualizado como se a coluna não existisse mais: nem o schema Drizzle (`backend/src/db/schema/expenses.ts`) nem os dois `INSERT` em `backend/src/routes/expenses.ts` (o principal na rota `POST /` e o de parcelas futuras em `createFutureInstallments`) referenciam `valor`. Toda tentativa de `INSERT` tenta gravar `valor = NULL`, violando a constraint, caindo no catch genérico (`expenses.ts:217-220`) — daí o erro sistemático em qualquer perfil/categoria (é estrutural, não depende do dado do usuário).

Provavelmente passou despercebido por ~15 dias porque edições de despesas existentes usam `UPDATE` (que não referencia `valor`, então não quebra); só a criação de despesa **nova** aciona o `INSERT` afetado.

**Decisão do usuário:** corrigir via código (voltar a preencher `valor` no INSERT), sem tocar no schema de produção agora. A migration `DROP COLUMN valor` pendente fica de fora deste plano — pode ser retomada depois, mediante confirmação explícita separada, se o usuário quiser finalizar aquele refactor.

## Escopo

### Dentro do escopo

- `backend/src/routes/expenses.ts`:
  - `POST /` (rota principal, linhas 183-208): incluir a coluna `valor` no INSERT, preenchida com o mesmo valor final computado usado para `valor_final` (que já cai para `valor_original` quando `valor_final` não vem no payload) — garante não-nulo, já que `valor_original` é obrigatório na validação (`body('valor_original').isFloat({min:0.01})`, linha 156).
  - `createFutureInstallments` (linhas 47-112): incluir `valor` no INSERT de parcelas futuras, preenchido com `valorPorParcela` (já calculado na linha 71 e usado para `valor_original`/`valor_final` daquele INSERT) — sem isso, criar uma despesa parcelada continuaria falhando ao gerar as parcelas seguintes pelo mesmo motivo.

### Fora do escopo

- `PUT /:id` (edição): o `UPDATE` não referencia `valor`, então não quebra por NOT NULL (a linha existente já tem valor preenchido). Deixar `valor` "congelado" no valor da criação em edições é uma inconsistência de dado pré-existente, não o bug reportado — fica fora deste plano.
- Migration `DROP COLUMN valor` em produção — decisão explícita do usuário de não mexer no schema agora.
- Qualquer alteração em `categoria_id`/`perfil_id` — hipótese anterior descartada pela evidência do log (o erro é sobre a coluna `valor`, não FK de categoria/perfil).

## Leitura de contexto

- `backend/src/routes/expenses.ts` (lido integralmente)
- `backend/src/db/schema/expenses.ts` (confirmado: schema Drizzle não declara `valor` — só `valor_original`/`valor_final`/`valor_pago`)
- `.plans/refatorar-campos-valor-despesa.md` (plano original que removeu `valor` do código sem confirmar a migration em produção)
- Log de produção colado pelo usuário (evidência direta do erro `23502` na coluna `valor`)

## Impacto por área

### Backend

`backend/src/routes/expenses.ts`:
- `POST /`: adicionar `valor` à lista de colunas e valores do INSERT (linhas 184-208), usando o mesmo valor computado de `valor_final`.
- `createFutureInstallments`: adicionar `valor` à lista de colunas do INSERT (linhas 97-103), ao placeholder count (linha 69, de 19 para 20) e aos params (linha 90-91, adicionando `valorPorParcela` uma terceira vez).

### Frontend

Sem impacto — o frontend não referencia `valor` desde o refactor de 02/07.

### Banco de dados

Sem impacto — nenhuma migration, apenas volta a popular uma coluna que já existe fisicamente em produção.

### Infra/Deploy

Sem impacto.

## Arquivos provavelmente afetados

- `backend/src/routes/expenses.ts`

## Estratégia de implementação

1. No `POST /`, calcular uma variável única para o valor final (ex.: `valorFinalCalculado = valor_final ? parseFloat(String(valor_final)) : parseFloat(String(valor_original))`) e reutilizá-la tanto para `valor_final` quanto para a nova coluna `valor` no INSERT.
2. Adicionar `valor` à lista de colunas e ao array de params do INSERT principal.
3. Em `createFutureInstallments`, adicionar `valor` à lista de colunas, ajustar o número de placeholders (19 → 20) e adicionar `valorPorParcela` como valor de `valor` no array de params.
4. Rodar `cd backend && npm run build` (ou `npx tsc --noEmit`) para validar que compila.

## Regras de negócio identificadas

- `valor` (coluna legada) passa a ser tratado como espelho de `valor_final` para todo registro novo — mesma regra que despesas legadas já seguem no sentido inverso (`valor_final` ausente cai para `valor_original` cai para `valor`, ver `.plans/corrigir-fallback-valor-final-despesas.md`).

## Regras multi-tenant e segurança

Não aplicável — mudança não altera nenhum filtro de `usuario_id`/`perfil_id`.

## Validações necessárias

- Criar uma despesa simples (não parcelada) deve gravar com sucesso, com `valor = valor_final` no banco.
- Criar uma despesa parcelada (2+ parcelas) deve gravar a parcela base e todas as parcelas futuras com sucesso, cada uma com `valor = valorPorParcela` daquela parcela.
- Fluxo de edição (`PUT`) continua funcionando sem alteração de comportamento.

## Testes necessários

### Backend

- Teste manual local (`npm run dev`): criar despesa simples e despesa parcelada, confirmar 201 em vez de 500.

### Frontend

- Repetir o cenário do print original (categoria "Sistema", forma de pagamento "Aether Software", valor 2121) e confirmar que salva com sucesso.

### E2E

- Não aplicável.

## Comandos de validação sugeridos

```bash
cd backend && npm run build
```

## Riscos e pontos de atenção

- Risco baixo: reintroduz preenchimento de uma coluna que já existe fisicamente no banco; não altera schema nem comportamento de leitura (nenhuma query de SELECT usa `valor` hoje, então não há efeito colateral em relatórios/painéis).
- Este fix é uma correção "de fato" (mantém a coluna legada viva), não conclui o refactor de 02/07. Se o usuário quiser eventualmente concluir o `DROP COLUMN valor`, será um plano separado com confirmação explícita de migration.

## Perguntas em aberto

Nenhuma — causa raiz confirmada via log de produção, abordagem escolhida explicitamente pelo usuário.

## Critérios de aceite do plano

- INSERT principal (`POST /`) preenche `valor` com o mesmo valor de `valor_final`.
- INSERT de parcelas futuras preenche `valor` com `valorPorParcela`.
- Build do backend passa sem erros.
- Criação de despesa (simples e parcelada) volta a funcionar em produção após deploy.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não é necessária nenhuma migration nem alteração de `.env`.
- Isolar o commit de qualquer alteração pendente não relacionada já presente no working tree.
