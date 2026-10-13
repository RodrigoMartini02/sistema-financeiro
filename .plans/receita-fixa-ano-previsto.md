# Plano de Implementação: Receita fixa por pessoa, com o ano previsto

## Origem

- Arquivo de especificação: anotações do usuário na conversa de 07/10/2026.
  - "categoria de receita que tiver receita fixa, deve ficar registrada em todo o ano vigente como prevista, o mesmo com 'replicar até'";
  - "mas somente para o usuário, cada usuário configura seu salário a categoria; se não for possível, removemos de lá e deixamos essa função direto no modal de lançamento de receita".
- Data do planejamento: `2026-10-13`
- Classificação: `frontend + backend + database`

Decisões do usuário em 13/10/2026:

1. **Onde fica a fixa:** na categoria de receita, por pessoa. Cada uma configura e vê só o próprio salário.
2. **Ano inteiro:**
   - ligar ou salvar a fixa grava as previstas de cada mês até dezembro, no lugar do lançamento mês a mês;
   - a primeira é a do mês atual, se o dia ainda não passou; senão, a do mês seguinte;
   - o "Lançar automaticamente" sai.
3. **Virada do ano:** a partir de 1º de dezembro, um modal pergunta se cada fixa continua no ano seguinte, como nas despesas recorrentes.
4. **Mudar ou desligar:** mudar o valor ou o dia atualiza as previstas em aberto. Desligar apaga as previstas em aberto. As recebidas não mudam.
5. **"Repetir até":** as cópias novas nascem previstas. As 2 já gravadas como recebidas na produção, de 07/11 e 07/12, viram previstas pela migration 0083.
6. **Dia do recebimento:** a prevista continua prevista até a confirmação, com o aviso "confirme o recebimento" no dia, como hoje.

Definido no plano: **não renovar** encerra a fixa em dezembro. A configuração sai, e as previstas do ano ficam.

## Resumo

- **Hoje:**
  - **Configuração:** a fixa é única por categoria e conta (`uq_classificacoes_receita_fixas_conta`). Numa conta com várias pessoas, cabe um salário por categoria. A configuração guarda quem a fez (`usuario_id`).
  - **Com "Lançar automaticamente":** a rotina diária e a checagem ao abrir o app lançam uma prevista por mês, no dia, com o push "confirme o recebimento".
  - **Sem "Lançar automaticamente":** a fixa só preenche o modal de receita e a projeção do Painel.
  - **"Repetir até":** as cópias nascem recebidas, com o status padrão `ativa`, e entram nas somas antes de o dinheiro cair.
- **Com este plano:**
  - a fixa é de cada pessoa;
  - ligar a fixa grava o ano como previsto;
  - em dezembro, o modal de renovação pergunta se ela continua;
  - as cópias do "Repetir até" nascem previstas;
  - a prevista só vira recebida com a confirmação.

## Escopo

### Dentro do escopo

- **Fixa por pessoa:** a configuração passa a ser única por categoria, conta e pessoa. A rota e a tela da categoria mostram e gravam só a configuração de quem está logado.
- **Ano previsto:**
  - salvar a fixa grava as previstas até dezembro;
  - mudar atualiza as previstas em aberto a partir de hoje;
  - desligar apaga as previstas em aberto a partir de hoje;
  - sai o "Lançar automaticamente".
- **Renovação da fixa:**
  - a lista das pendentes e a gravação das decisões;
  - a seção "Receitas fixas" no modal de renovação que já existe para as despesas.
- **Rotina diária:**
  - grava o ano das fixas que ainda não têm, como a configuração que já existe;
  - manda o push no dia;
  - deixa de lançar mês a mês.
- **Checagem ao abrir o app:** só garante o ano gravado.
- **"Repetir até":** cópias previstas.
- **Painel:** a projeção da fixa olha a pessoa.
- **Migrations:**
  - a 0083, antes do deploy: a unicidade por pessoa, o `ano_registrado` e as futuras recebidas que viram previstas;
  - a 0084, depois do deploy: remove as colunas do automático.
- **Demo:** a rota da renovação da fixa responde vazia.

### Fora do escopo

- **Contratos:** continuam lançando as próprias mensalidades. A categoria usada por contrato ativo não pode ser fixa.
- **Despesas:** a renovação delas não muda, só passa a dividir o modal.
- **Receita única recebida com data futura no modal:** continua como está. Só as cópias do "Repetir até" mudam.
- **Aviso de duplicata** entre a prevista da fixa e um lançamento manual do mesmo salário: fica para depois (ver riscos).
- **Permissão:** configurar a própria fixa continua exigindo o acesso às categorias de receita.

## Leitura de contexto

- `/AGENT.md`
- `/frontend/AGENT.md`: não existe no projeto
- `/backend/AGENT.md`: não existe no projeto
- `CLAUDE.md`, com o fluxo obrigatório
- Especificação: as anotações de 07/10/2026 e as decisões de 13/10/2026
- Planos relacionados, já na produção: `.plans/recorrente-ano-e-contagem.md` (o modal de renovação) e `.plans/recorrente-so-credito.md`
- Código lido:
  - **Backend, a fixa:**
    - `backend/src/services/fixedIncomes.ts`, com o `processFixedIncomes`;
    - `backend/src/services/fixedIncomeSchedule.ts`, com o teste;
    - `backend/src/routes/income-classifications.ts`, com o `PUT /:id/fixa` e a trava do contrato ativo.
  - **Backend, as receitas:**
    - `backend/src/routes/incomes.ts`, com o `POST /fixas/processar` e o `PUT /:id/receber`;
    - `backend/src/routes/internal-jobs.ts`, com a rotina diária;
    - `backend/src/services/incomeService.ts`, com as cópias do "Repetir até" e a comissão no recebimento.
  - **Backend, o Painel:** `backend/src/services/painelService.ts` (`buscarFixas`) e `painelCalculos.ts` (`projetarFixas`).
  - **Backend, os schemas:**
    - `backend/src/db/schema/incomeClassifications.ts`;
    - `backend/src/db/schema/incomes.ts`, em que `classificacao_fixa_id` é `set null` e o índice único é (`classificacao_fixa_id`, `fixa_competencia`);
    - `backend/src/server.ts`, a montagem das rotas.
  - **Front:**
    - `src/screens/config/ClassificacoesReceitaTab.tsx`;
    - `src/screens/finance/income-dialog/draftRules.ts`, no `fixedCategoryPatch`;
    - `src/services/incomeClassificationsService.ts`;
    - `src/layout/AppShell.tsx`;
    - `src/screens/finance/SeriesRenewalModal.tsx`;
    - `src/screens/finance/LancamentosTable.tsx`, com o "Confirmar recebimento".
- Produção, em só leitura em 07/10/2026:
  - 1 configuração de fixa, com o automático ligado;
  - 2 receitas futuras gravadas como recebidas, de 07/11 e 07/12, do mesmo dono;
  - nenhuma prevista da fixa em aberto.

Contexto multi-tenant: o `AGENT.md` fala em "prefeitura"; aqui o isolamento é por **dono e conta**. A fixa passa a ser filtrada também por pessoa, e a renovação mexe só nas fixas de quem pede.

## Impacto por área

### Frontend

- **Tela da categoria (`ClassificacoesReceitaTab.tsx`):**
  - sai o "Lançar automaticamente todo mês?" e o campo `automatico`;
  - o "Receita fixa" passa a dizer: "Valor e dia em que costuma entrar: o ano fica registrado como previsto, e o valor preenche o lançamento.";
  - na categoria usada por contrato ativo, a fixa fica indisponível, com o aviso do contrato;
  - o selo fica "Fixa · R$ X · dia N".
- **`incomeClassificationsService.ts` e o tipo da classificação de receita:** a fixa perde o `lancar_automatico`.
- **Modal de renovação (`SeriesRenewalModal.tsx`):**
  - ganha a seção "Receitas fixas", com categoria, valor e dia, e cada fixa marcada;
  - "Renovar selecionadas" e "Não renovar nenhuma" valem para as duas seções, e fechar deixa para depois;
  - cada seção só aparece com a permissão dela: "Despesas recorrentes" com `accessExpenses`, "Receitas fixas" com `accessIncomes`;
  - depois de decidir, invalida as consultas de despesa, as de receita (`invalidateIncomeQueries`) e a lista das categorias de receita.
- **Serviço e chave:**
  - `fetchFixedIncomeRenewals()` e `decideFixedIncomeRenewals(decisions)`;
  - `queryKeys.fixedIncomeRenewals(accountId)`, que entra na invalidação de receitas.
- **`AppShell.tsx`:** monta o modal com a permissão de despesas ou a de receitas. A checagem ao abrir continua chamando `processarReceitasFixas`, que agora só garante o ano.
- **Modal de receita:** a regra não muda. O `fixedCategoryPatch` passa a usar a fixa da própria pessoa, que é a que a lista devolve.
- **Demo:** `GET /incomes/fixed-renewals` responde `[]`, e a fixa da demo perde o `lancar_automatico`.

### Backend

- **Schema (`incomeClassifications.ts`):**
  - a unicidade passa a ser (classificação, conta, pessoa);
  - entra o `registeredYear` (`ano_registrado`): até que ano as previstas foram gravadas;
  - saem o `autoLaunch` e o `autoSince`. As colunas ficam no banco até a 0084, com o padrão delas.
- **Regras puras (`fixedIncomeSchedule.ts`, com teste):**
  - **`competenciasAteDezembro(inicio, diaRecebimento)`:** da `primeiraCompetencia` até dezembro do ano dela;
  - **`competenciasDaRenovacao(hoje, ano, diaRecebimento)`:** janeiro a dezembro de `ano`. Se `hoje` já estiver em `ano`, vale a mesma regra de quando a fixa é ligada;
  - **`renovacaoPendente(anoRegistrado, hoje)`:** hoje é 1º de dezembro do `anoRegistrado` ou depois. Não há fim, porque a fixa continua ligada até alguém decidir;
  - **sai o `competenciaParaLancar`**, o lançamento mês a mês, com os testes dele.
- **Serviço da fixa (`fixedIncomes.ts`):**
  - **`syncFixedIncomeYear`:** grava as previstas das competências com `onConflictDoNothing`, pelo índice único (`classificacao_fixa_id`, `fixa_competencia`), e atualiza o `ano_registrado`. A descrição continua "Raiz › Nome";
  - **`updateOpenFixedIncomes`:** nas previstas em aberto a partir de hoje, atualiza o valor e a data pelo dia novo;
  - **`removeOpenFixedIncomes`:** apaga as previstas em aberto a partir de hoje. As vencidas em aberto e as recebidas ficam;
  - **`ensureFixedIncomeYears({ userId? })`:** grava o ano corrente das fixas sem `ano_registrado`;
  - **`sendFixedIncomeReminders(hoje)`:** push "confirme o recebimento" para as previstas da fixa com data de hoje;
  - **sai o `processFixedIncomes`.**
- **`routes/income-classifications.ts`:**
  - **GET:** a fixa da conta e da pessoa logada.
  - **`PUT /:id/fixa`:**
    - a configuração é da pessoa logada;
    - salvar grava o ano e atualiza as previstas em aberto, numa transação;
    - desligar apaga as previstas em aberto e depois a configuração;
    - a categoria de contrato ativo é recusada com 400;
    - sai o `lancar_automatico` do corpo.
- **Renovação da fixa:**
  - **Rota nova `routes/fixedIncomeRenewals.ts`:** montada em `/api/incomes/fixed-renewals`, antes de `/api/incomes`, com `authenticate`, `requireActivePlan` e `requireScreenAccess('accessIncomes')`:
    - **`GET /?conta_id=`:** as pendentes;
    - **`POST /`:** as decisões.
  - **Leitura do corpo, com teste:** `{ decisions: [{ fixedId, renew }] }`, de 1 a 100 itens, no padrão do `seriesRenewalInput`.
  - **Serviço (`fixedIncomeRenewalService.ts`):**
    - **Listar:** as fixas da pessoa na conta com `ano_registrado` e `renovacaoPendente`, mais a categoria, o valor e o dia. Fora de dezembro e sem fixa pendente, volta vazio.
    - **Decidir:** numa transação, com a configuração travada (`FOR UPDATE`):
      - **renovar** grava `competenciasDaRenovacao` do ano seguinte e atualiza o `ano_registrado`;
      - **não renovar** apaga a configuração, e as previstas do ano ficam, desligadas da fixa pelo `set null`;
      - fixa de outra pessoa ou já decidida é ignorada.
- **`routes/incomes.ts`:** o `POST /fixas/processar` chama `ensureFixedIncomeYears({ userId })` e continua completando os contratos.
- **`routes/internal-jobs.ts`:** a rotina diária chama `ensureFixedIncomeYears()` e `sendFixedIncomeReminders(hoje)`.
- **`incomeService.createIncome`:** as cópias do "Repetir até" nascem com `status: 'prevista'`. A comissão continua nascendo no lançamento, e o `receiveIncome` não a duplica, porque só gera comissão de receita de contrato.
- **Painel:**
  - `buscarFixas` passa a ler a pessoa;
  - em `projetarFixas`, a chave do mês com receita passa a ser pessoa, classificação e mês.

### Banco de dados

**Migration `backend/drizzle/0083_receita_fixa_por_pessoa.sql`**, antes do deploy, com o cabeçalho no padrão do projeto:

1. **Unicidade por pessoa:** sai a `uq_classificacoes_receita_fixas_conta` e entra a `uq_classificacoes_receita_fixas_conta_usuario`, em (`classificacao_id`, `conta_id`, `usuario_id`). A configuração atual fica com quem a fez.
2. **Coluna nova:** `ADD COLUMN IF NOT EXISTS ano_registrado INTEGER`, nula. O código grava o ano das fixas antigas na primeira rotina ou na checagem ao abrir.
3. **Futuras recebidas viram previstas:** `UPDATE receitas SET status = 'prevista' WHERE status = 'ativa' AND data_recebimento > CURRENT_DATE`. Na produção, são as 2 de 07/11 e 07/12; a contagem é conferida em só leitura antes de aplicar.

- **Compatível com o código antigo:** a unicidade nova é mais larga, e o código antigo ignora a coluna nova.

**Migration `backend/drizzle/0084_receita_fixa_sem_automatico.sql`**, depois do deploy: `DROP COLUMN lancar_automatico` e `DROP COLUMN automatico_desde`. O código novo já não lê nem grava essas colunas.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- Não há variável de ambiente nova nem job novo: a rotina diária (`expense-alerts`) continua a mesma.
- **Ordem na produção:**
  1. a 0083, com `--confirmo`, fora do auto mode;
  2. o deploy;
  3. a 0084, com `--confirmo`.

## Arquivos provavelmente afetados

- **Backend:**
  - `backend/drizzle/0083_receita_fixa_por_pessoa.sql` e `backend/drizzle/0084_receita_fixa_sem_automatico.sql` (novos);
  - `backend/src/db/schema/incomeClassifications.ts`;
  - `backend/src/services/fixedIncomeSchedule.ts` e `fixedIncomeSchedule.test.ts`;
  - `backend/src/services/fixedIncomes.ts`;
  - `backend/src/services/fixedIncomeRenewalService.ts`, `fixedIncomeRenewalInput.ts` e `fixedIncomeRenewalInput.test.ts` (novos);
  - `backend/src/routes/fixedIncomeRenewals.ts` (novo) e `backend/src/server.ts`;
  - `backend/src/routes/income-classifications.ts`, `incomes.ts` e `internal-jobs.ts`;
  - `backend/src/services/incomeService.ts`;
  - `backend/src/services/painelService.ts`, `painelCalculos.ts` e `painelCalculos.test.ts`.
- **Front:**
  - `src/screens/config/ClassificacoesReceitaTab.tsx`;
  - `src/services/incomeClassificationsService.ts` e o tipo da classificação de receita;
  - `src/screens/finance/SeriesRenewalModal.tsx`, `src/services/fixedIncomeRenewalsService.ts` (novo) e `src/services/queryKeys.ts`;
  - `src/layout/AppShell.tsx`;
  - `src/types/finance.ts`;
  - `src/services/demo/fakeApiResolver.ts`.
- `.plans/receita-fixa-ano-previsto.md` (este plano)

## Estratégia de implementação

1. **Branch:** `feat/R/receita-fixa-ano-previsto`, a partir da `main` atualizada.
2. **Regras puras, testes primeiro:** as competências até dezembro, as da renovação e a pendência, em `fixedIncomeSchedule`. Sai o `competenciaParaLancar`.
3. **Banco:** a 0083, a 0084 e o schema. Aplicar a 0083 no local só com confirmação.
4. **Serviço da fixa:** gravar o ano, atualizar e apagar as previstas em aberto, garantir o ano e mandar o push. Sai o `processFixedIncomes`.
5. **Rotas da categoria:** a fixa por pessoa, a gravação do ano na transação e a recusa do contrato ativo.
6. **Renovação:** a leitura com teste, o serviço, a rota e a montagem.
7. **Rotina e checagem:** a rotina diária e o `POST /fixas/processar`.
8. **"Repetir até" e Painel:** as cópias previstas e a projeção por pessoa, com teste.
9. **Front:** a tela da categoria, o serviço e a chave, o modal de renovação com as duas seções, o `AppShell` e a demo.
10. **Validação:** os comandos abaixo e a conferência no local (`/run`).

## Regras de negócio identificadas

1. **Fixa por pessoa:** cada pessoa tem a própria receita fixa por categoria e conta, e vê só a sua.
2. **Ano previsto:**
   - ligar ou salvar a fixa grava as previstas até dezembro;
   - a primeira é a do mês atual, se o dia ainda não passou; senão, a do mês seguinte.
3. **Mudar a fixa:** atualiza o valor e a data das previstas em aberto a partir de hoje.
4. **Desligar a fixa:** apaga as previstas em aberto a partir de hoje. As vencidas em aberto e as recebidas ficam.
5. **Renovação:**
   - a partir de 1º de dezembro do último ano gravado, o modal pergunta se a fixa continua;
   - renovar grava o ano seguinte;
   - não renovar encerra a fixa em dezembro e mantém as previstas do ano;
   - fechar deixa para depois.
6. **Recebimento:** a prevista só vira recebida com o "Confirmar recebimento", e o push avisa no dia.
7. **"Repetir até":** as cópias nascem previstas. A receita original segue o que foi escolhido no modal.
8. **Contrato:** a categoria usada por contrato ativo não pode ser fixa.
9. **Painel:** a projeção da fixa só cobre o mês sem receita da mesma pessoa e categoria.

## Regras multi-tenant e segurança

- **Configuração:** é sempre da pessoa logada, na conta validada por `resolveIncomeClassificationCatalog`. Ninguém vê nem muda a fixa de outra pessoa.
- **Renovação:** lista e decide só as fixas de quem pede, numa transação, com a configuração travada.
- **Previstas:** são gravadas com o autor e a conta da configuração.
- **Erros:** em português, sem dado de outra pessoa, e sem `catch {}` silencioso.

## Validações necessárias

- **`PUT /api/income-classifications/:id/fixa`:**
  - valor maior que zero e dia de 1 a 31;
  - a categoria não pode ter subcategoria ativa nem ser usada por contrato ativo;
  - sem `lancar_automatico`.
- **`POST /api/incomes/fixed-renewals`:**
  - `decisions` com 1 a 100 itens;
  - `fixedId` como id inteiro;
  - `renew` booleano;
  - fora disso, a resposta é 400.

## Testes necessários

### Frontend

Não há regra pura nova. A conferência é no `/run`: o modal com as duas seções e a tela da categoria sem o automático.

### Backend

- **`fixedIncomeSchedule.test.ts`:**
  - **competências até dezembro:** o dia ainda não passou, o dia já passou, o ano começa em dezembro e o dia 31 em mês curto;
  - **renovação:** janeiro a dezembro, e a decisão já dentro do ano novo;
  - **pendência:** antes e depois de 1º de dezembro, e anos depois.
- **`fixedIncomeRenewalInput.test.ts`:** pedido válido, vazio, acima de 100 e tipos errados.
- **`painelCalculos.test.ts`:** a projeção por pessoa. A receita de outra pessoa na mesma categoria não esconde a fixa.

### E2E

Conferência manual no banco local (`/run`):

- **Ligar a fixa em outubro, dia 5:** grava novembro e dezembro. Com dia 20, grava outubro a dezembro.
- **Mudar o valor:** as previstas em aberto mudam.
- **Desligar:** as previstas em aberto somem, e a recebida fica.
- **Conta com duas pessoas:** cada uma vê só a própria fixa na categoria.
- **Mudando a data do local para dezembro:**
  - o modal mostra as duas seções;
  - renovar grava o ano seguinte;
  - não renovar encerra a fixa e mantém as previstas do ano;
  - fechar volta a perguntar.
- **"Repetir até":** as cópias nascem previstas.
- **Confirmar recebimento:** a prevista vira recebida.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npx vite build
npm --prefix backend run build
npm --prefix backend test
```

Banco local, só com a confirmação do usuário:

```bash
npm --prefix backend run migrations:status -- --banco local
npm --prefix backend run migrations:aplicar -- 0083 --banco local
npm --prefix backend run migrations:aplicar -- 0084 --banco local
```

## Riscos e pontos de atenção

- **Somas:** as previstas do ano entram de uma vez na projeção de saldo e no "a receber". É o esperado.
- **Lançamento manual em duplicata:** quem lançar o salário à mão, em vez de confirmar a prevista, fica com a receita duplicada. O fluxo é o "Confirmar recebimento" na lista; o aviso de duplicata fica fora deste plano.
- **Ordem das migrations:** a 0083 vai antes do deploy e a 0084 depois, cada uma com a sua confirmação.
- **Conta com várias pessoas:** quem configurava a fixa pela conta inteira passa a ver só a própria.
- **Rotina e checagem juntas:** o índice único (`classificacao_fixa_id`, `fixa_competencia`) evita gravar a mesma prevista duas vezes.
- **Não renovar:** a configuração sai. As previstas que sobram do ano perdem o vínculo com a fixa e o push.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- **Fixa por pessoa:** cada pessoa configura e vê só a própria fixa.
- **Ano previsto:** ligar a fixa grava as previstas até dezembro, mudar atualiza as em aberto e desligar apaga as em aberto.
- **Renovação:** em dezembro, o modal pergunta pelas fixas junto com as despesas. Renovar grava o ano seguinte, e não renovar encerra a fixa.
- **"Repetir até":** as cópias nascem previstas, e as 2 futuras recebidas viram previstas pela 0083.
- **Recebimento:** a prevista espera a confirmação, com o push no dia.
- **Painel:** a projeção não esconde a fixa de uma pessoa por causa da receita de outra.
- **Checks:** os comandos acima passam.

## Observações para a skill implementar

- **Fonte:** usar este plano como fonte principal.
- **Branch:** `feat/R/receita-fixa-ano-previsto`, a partir da `main` atualizada.
- **Migrations:** não executar nenhuma sem a confirmação explícita do usuário. No local primeiro; na produção, a 0083 antes do deploy e a 0084 depois, com `--confirmo` e fora do auto mode.
- **Não mexer em `.env`.**
- **Seguir o `/AGENT.md`:**
  - identificadores em inglês e textos em português. As regras de `fixedIncomeSchedule` seguem os nomes em português que o arquivo já usa;
  - Drizzle nas queries (SQL cru só nas migrations);
  - sem `any`;
  - sem `catch {}` silencioso.
- **Código antigo:** apagar o lançamento mês a mês e o "Lançar automaticamente", sem sobras.
- **Commits:** `.portal/` e `GLOSSARIO.md` nunca entram.

## Notas da implementação (13/10/2026)

- **Modal de renovação:** manteve o nome `SeriesRenewalModal`, agora com as seções "Despesas recorrentes" e "Receitas fixas". As decisões das duas seguem juntas; se uma das gravações falhar, as listas são recarregadas.
- **Fixa antiga:** a configuração que já existe na produção ganha o ano na primeira rotina diária ou na primeira checagem ao abrir o app depois do deploy (`ensureFixedIncomeYears`).
- **Conferência da 0083 em só leitura na produção, em 13/10/2026:**
  - 2 receitas futuras recebidas viram previstas: "Bee Vale", de 07/11 e 07/12, do dono 1;
  - 1 configuração de fixa, com o automático ligado, fica com quem a fez;
  - nenhuma prevista estava ligada a fixa.
