# Plano de Implementação: Vencimento do cartão com vigência e cor livre

## Origem

- Arquivo de especificação: conversa de 2026-10-05 (print do modal "Editar cartão").
  - Pedido 1: "para cartões, data e vencimento preciso de um campo para definir a partir de que mês a alteração será vigente, e sempre que for atualizar, as parcelas e despesas lançadas para esse cartão atualizam também".
  - Pedido 2: "aplicar um gradiente de cor em vez dessas opções fixas, aí o usuário pode selecionar qualquer cor".
  - Decisões: "1 - 1, 2 - 1, 3 - 1".
- Data do planejamento: `2026-10-05`
- Classificação: `fullstack`

## Resumo

Duas melhorias no cadastro do cartão (Configurações → Cartões).

1. **Vigência do vencimento.**
   - Quando o dia de vencimento muda, o modal pede "Vale a partir de" (mês/ano).
   - Ao salvar, as despesas no crédito desse cartão ainda não pagas, com vencimento nesse mês ou depois, passam para o dia novo no mesmo mês: cada uma continua na mesma fatura.
   - Mudar só o fechamento vale para as compras novas, sem mexer no que já foi lançado.
   - Hoje o vencimento de cada compra e de cada parcela é calculado uma única vez, ao lançar (`invoiceDueDate` em `src/utils/expenseSchedule.ts`), e mudar o cartão não atualiza nada.
2. **Cor livre.**
   - Um seletor (quadrado de cor + barra de matiz + campo do código) substitui as 8 cores fixas.
   - O texto do cartão fica escuro sozinho quando a cor é clara.
   - O servidor passa a aceitar só código de cor válido. A cor já é gravada como `#rrggbb` (`cartoes.cor varchar(7)`), então não há migration.

## Escopo

### Dentro do escopo

- **Campo "Vale a partir de"** no modal de edição do cartão:
  - aparece só quando o dia de vencimento muda em relação ao salvo;
  - sugere o mês da próxima fatura ainda não vencida, pelo dia salvo (se hoje já passou do dia de vencimento, o mês seguinte);
  - usa o `MonthYearPicker`.
- **Confirmação antes de salvar** (`useConfirm`, já usado no modal): "As despesas não pagas deste cartão, de {mês}/{ano} em diante, passam a vencer no dia {dia}."
- **Atualização das despesas, no servidor, numa transação junto com o cartão:**
  - entram as despesas deste cartão (qualquer autor), forma `credito`, status `ativa`, não pagas, com `data_vencimento` a partir do 1º dia do mês escolhido;
  - o vencimento novo é o dia novo no mesmo mês, limitado ao último dia do mês;
  - `mes` e `ano` não mudam.
- **Resposta do `PUT /cards/:id`** com `despesas_atualizadas` (contagem).
- **Atualização das telas** que dependem de despesas depois de salvar (`invalidateExpenseQueries`).
- **Seletor de cor:**
  - componente `ColorPicker` (quadrado saturação × brilho, barra de matiz, campo `#rrggbb`), com mouse, toque e teclado;
  - pré-visualização ao vivo.
- **Contraste:** o texto do cartão (pré-visualização e grade) fica claro ou escuro conforme a luminância da cor.
- **Validação da cor** no `POST` e no `PUT` de cartões (`^#[0-9a-fA-F]{6}$`). Sem cor, continua o padrão de hoje.

### Fora do escopo

- **Histórico dos dias do cartão:** compra antiga lançada depois da troca usa os dias atuais.
- **Mudar a fatura (o mês) de despesas já lançadas:** a opção 2 da decisão 1 não foi escolhida.
- **Despesas que não mudam:**
  - pagas: a opção 2 da decisão 2 não foi escolhida;
  - canceladas;
  - no débito, num cartão "Ambos";
  - de outros cartões.
- **Mudar só o dia de fechamento** não altera despesas lançadas.
- **Cor** de categorias e de outras telas.
- **Seletor nativo do navegador:** a opção 2 da decisão 3 não foi escolhida.

## Leitura de contexto

- `/AGENT.md`
- `/CLAUDE.md`
- `/frontend/AGENT.md`: não existe no projeto
- `/backend/AGENT.md`: não existe no projeto
- `src/screens/config/CartaoTab.tsx` (modal, `COR_OPCOES`, `CartaoPreview` com texto branco fixo, `saveMut` que só invalida `['cartoes']`)
- `src/utils/expenseSchedule.ts` (`invoiceDueDate`, `dateInMonth`, `installmentDueDates`)
- `backend/src/routes/cards.ts`:
  - `PUT /:id`: só o dono do cartão; `canWriteToAccount`; SQL cru legado; `cor` sem validação;
  - `POST /`: `cor ?? '#3498db'`.
- `backend/src/db/schema/cards.ts` (`cor varchar(7)`)
- `backend/src/routes/expenses.ts`:
  - `POST /:id/mover`: `mes` = mês do vencimento contado a partir de 0, e despesa paga não se move.
- `src/screens/finance/MonthYearPicker.tsx` (mês contado a partir de 0, ano)
- `src/services/queryKeys.ts` (`invalidateExpenseQueries`)
- `src/context/ConfirmContext` (`useConfirm`)
- Onde a cor do cartão aparece: só em `CartaoTab.tsx` (grade e pré-visualização).

## Impacto por área

### Frontend

- **`CartaoTab.tsx`:**
  - estado do mês de vigência;
  - o campo aparece quando o vencimento difere do salvo;
  - confirmação;
  - `vigente_desde` no envio;
  - `invalidateExpenseQueries` no sucesso, além de `['cartoes']`.
  - Cor: saem `COR_OPCOES` e as bolinhas; entra o `ColorPicker`. O `CartaoPreview` usa a cor de texto calculada.
- **`src/ui/ColorPicker.tsx` (novo):**
  - quadrado e barra com eventos de ponteiro (mouse e toque);
  - `role="slider"` com setas no teclado;
  - campo do código que aceita `#rgb`/`#rrggbb` e normaliza.
- **`src/utils/color.ts` (novo):**
  - `hexToHsv`, `hsvToHex`, `normalizeHex`, `readableTextColor`;
  - teste em `color.test.ts`.
- **`src/utils/cardSchedule.ts` (ou junto de `expenseSchedule.ts`):** mês sugerido para a vigência, com teste.
- **`src/services/configService.ts`:**
  - `saveCartao` envia `vigente_desde`;
  - tipos de `CartaoFormValues`.
- **Estados:**
  - erro do servidor aparece no lugar de hoje (`error` do modal);
  - salvando: `isSaving`, como hoje.

### Backend

- **`PUT /cards/:id`:**
  - lê `vigente_desde` (opcional, AAAA-MM; inválido → 400 "Mês de vigência inválido");
  - valida `cor` (inválida → 400 "Cor inválida");
  - com o dia de vencimento mudando e `vigente_desde` presente: transação, com o update do cartão mais o das despesas, em Drizzle;
  - devolve `despesas_atualizadas`.
- **`POST /cards`:** valida `cor`.
- **Módulo puro novo** (ex.: `backend/src/services/cardDueDate.ts`) com teste:
  - `moveDueDateToDay(isoDate, day)`: mesmo mês, dia limitado ao último dia;
  - `parseEffectiveMonth('AAAA-MM')`.
- **Permissões:** como hoje. Só o dono do cartão edita (`cards.userId = req.user.id`) e a conta passa por `canWriteToAccount`. As despesas são escolhidas pelo id desse cartão.

### Banco de dados

Sem impacto esperado: nenhuma coluna nova. As despesas existentes recebem `data_vencimento` novo pela aplicação, e a cor cabe em `varchar(7)`.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `backend/src/routes/cards.ts`
- `backend/src/services/cardDueDate.ts` e `cardDueDate.test.ts` (novos)
- `src/screens/config/CartaoTab.tsx`
- `src/services/configService.ts`
- `src/ui/ColorPicker.tsx` (novo)
- `src/utils/color.ts` e `color.test.ts` (novos)
- `src/utils/cardSchedule.ts` e teste (novos), ou acréscimo em `expenseSchedule.ts`
- `src/screens/finance/MonthYearPicker.tsx` (reuso; só mexer se precisar abrir por cima do modal)

## Estratégia de implementação

1. **Branch:** `git checkout main && git pull`, depois `git checkout -b feat/R/cartao-vigencia-e-cor`.
2. **Servidor, regras puras:** `cardDueDate.ts` (`moveDueDateToDay`, `parseEffectiveMonth`) com teste.
3. **Servidor, rotas:**
   - `PUT /cards/:id`:
     - `vigente_desde` opcional; sem ele, só o cartão é gravado, como hoje;
     - com o dia de vencimento mudando, uma transação grava o cartão e as despesas;
     - a resposta traz `despesas_atualizadas`;
     - mês inválido → 400.
   - Validação da cor no `POST` e no `PUT`.
   - Consultas novas em Drizzle.
   - Commit.
4. **Tela, vigência:**
   - mês sugerido (função pura com teste);
   - o campo com o `MonthYearPicker`, que aparece só quando o vencimento muda;
   - confirmação;
   - `vigente_desde` no envio e `invalidateExpenseQueries` no sucesso.
   - Commit.
5. **Tela, cor, primeiro tirar o antigo:** saem `COR_OPCOES` e a fileira de bolinhas. Fica só a constante da cor padrão de cartão novo (`#1e40af`).
6. **Tela, cor, depois colocar o novo:**
   - `color.ts` com teste;
   - `ColorPicker`;
   - o `CartaoPreview` com a cor de texto pelo contraste, na pré-visualização e na grade.
   - Commit.
7. **Roteiro no banco local** (backend em outra porta; usuários `*@roteiro-cartao.test` apagados no fim):
   - **Montagem:**
     - titular A e membro B;
     - cartão de A tipo "Ambos", fechamento 29, vencimento 4;
     - outro cartão de A.
   - **Despesas no cartão:**
     - crédito não paga com vencimento 04/10 (não muda);
     - crédito não paga 04/11 (→ 10/11);
     - parcelado 3x com parcelas em 04/11, 04/12 e 04/01/2027 (→ dia 10);
     - crédito paga 04/11 (não muda);
     - cancelada 04/11 (não muda);
     - débito 15/11 (não muda);
     - de B no cartão de A, 04/11 (→ 10/11);
     - do outro cartão, 04/11 (não muda).
   - **Conferências:**
     - `PUT` com vencimento 10 e `vigente_desde` 2026-11 → `despesas_atualizadas` = 5, e `mes`/`ano` iguais;
     - mudar só o fechamento → nada muda;
     - vencimento 31 a partir de 2026-11 → novembro em 30/11; dezembro e janeiro em 31;
     - `vigente_desde` 2026-13 → 400;
     - cor `azul` → 400; cor `#12ab9f` → 200.
   - Registro no plano.
8. **Validação:**
   - verificação de tipos, testes e builds do front e do back;
   - tela no jsdom:
     - o campo aparece só quando o vencimento muda;
     - a confirmação mostra mês e dia;
     - o pedido leva `vigente_desde`;
     - o seletor muda a pré-visualização;
     - o código digitado é aceito;
     - cor clara deixa o texto escuro.
   - Registro no plano.
9. **Prints** (computador e celular) do modal com a vigência e com o seletor de cor. **A implementação para aqui** até o usuário aprovar.
10. **`/finalizar`:** sem migration.

## Regras de negócio identificadas

- **"Vale a partir de":**
  - só com mudança do dia de vencimento;
  - mês/ano;
  - sugestão: o mês da próxima fatura ainda não vencida, pelo dia salvo.
- **Despesas atualizadas:**
  - deste cartão, de qualquer autor (quem paga é o dono do cartão);
  - forma `credito`, status `ativa`, não pagas;
  - vencimento a partir do 1º dia do mês escolhido.
- **Novo vencimento:**
  - o dia novo no mesmo mês da despesa, limitado ao último dia do mês;
  - `mes` e `ano` iguais (a despesa continua na mesma fatura).
- **Mudar só o fechamento:** vale para compras novas, que sempre usam os dias atuais do cartão.
- **Cor:**
  - qualquer `#rrggbb`;
  - texto escuro quando a cor é clara (contraste pela luminância);
  - cartão novo começa com a cor padrão.

## Regras multi-tenant e segurança

- **Quem edita:** só o dono do cartão (`cards.userId = req.user.id`), com a conta validada por `canWriteToAccount`, como hoje.
- **Escopo:** as despesas atualizadas são escolhidas pelo id do cartão já validado. Nenhum id de despesa vem do cliente.
- **Transação:** cartão e despesas mudam juntos ou nada muda.
- **Mensagens de erro:** não expõem dados de outras contas.

## Validações necessárias

- **`vigente_desde`:** texto `AAAA-MM`, com mês de 01 a 12 e ano de 4 dígitos; opcional. Inválido → 400.
- **`cor`:** `^#[0-9a-fA-F]{6}$`; opcional (padrão de hoje). Inválida → 400.
- **Dias de fechamento e vencimento:** como hoje.

## Testes necessários

### Frontend

- **`color.test.ts`:**
  - ida e volta hex ↔ HSV;
  - normalização de `#rgb` e de maiúsculas;
  - código inválido;
  - cor de texto para claras e escuras.
- **Teste do mês sugerido:** antes e depois do dia de vencimento, e na virada do ano.
- **Tela no jsdom:** os cenários da etapa 8.

### Backend

- **`cardDueDate.test.ts`:**
  - mesmo mês com o dia novo;
  - dia 31 em mês de 30 e em fevereiro (inclusive bissexto);
  - `parseEffectiveMonth` com valores válidos e inválidos.
- **Roteiro no banco local:** etapa 7.

### E2E

- No navegador: editar o vencimento de um cartão com parcelas futuras e conferir Movimentações nos meses seguintes.
- Escolher uma cor clara e conferir o texto do cartão.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit -p tsconfig.json
npm test
npx vite build
npm --prefix backend run build
npm --prefix backend test
npx tsx <roteiro no banco local>
npx tsx tmpclaude-<cenarios>.tsx
```

## Riscos e pontos de atenção

- **Despesas de outra pessoa mudam:** o que outra pessoa lançou no seu cartão também passa para o dia novo. É coerente com "quem paga" (a fatura é do dono).
- **Compra antiga lançada depois da troca:** usa os dias novos, porque o cartão não guarda histórico.
- **Seletor de mês dentro do modal com rolagem:** pode ficar cortado. Conferir nos prints e, se preciso, abrir por cima, sem mexer em Movimentações.
- **Altura fixa do modal (306 px no corpo):** o seletor de cor é maior que a fileira de bolinhas. Conferir nos prints que nada fica escondido e que o celular continua usável.
- **Pagamento em lote:** as despesas movidas mudam de dia, não de mês, então os totais por mês não mudam.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- **Vencimento de 4 para 10 a partir de novembro/2026:**
  - as despesas não pagas no crédito de novembro em diante vencem no dia 10 do mesmo mês, inclusive as de outra pessoa no cartão;
  - outubro, pagas, canceladas, débito e outros cartões ficam iguais;
  - a resposta conta as atualizadas.
- **Mudar só o fechamento:** nenhuma despesa lançada muda.
- **Dia 31:** cai no último dia nos meses mais curtos.
- **Seletor de cor:**
  - aceita qualquer cor, pelo quadrado, pela barra ou pelo código;
  - a pré-visualização e a grade acompanham;
  - o texto fica legível em cores claras.
- **Servidor:** cor ou mês de vigência inválidos → 400.
- **Checks:** verificação de tipos, testes, builds, roteiro e teste de tela passando; prints aprovados.

## Observações para a skill implementar

- **Fonte e regras:** usar este plano como fonte principal; seguir `/AGENT.md` e `/CLAUDE.md`.
- **Branch e commits:** `feat/R/cartao-vigencia-e-cor`, a partir da `main` atualizada, com um commit por etapa.
- **Queries:** as consultas novas da rota de cartões vão em Drizzle, sem SQL cru novo. O SQL legado da rota só muda onde for preciso.
- **Redesign da cor:** primeiro tirar as cores fixas (etapa 5), depois colocar o seletor (etapa 6).
- **Código:**
  - identificadores em inglês e textos de tela em português;
  - nada de `any`;
  - regras puras com teste.
- **Arquivos temporários:** `tmpclaude-*` e os scripts do scratchpad, apagados no fim.
- **Roteiro:** os dados ficam só no banco **local** e são apagados no fim.
- **Servidores de teste:** derrubar a árvore de processos no fim (`taskkill /T`).
- **Migrations:** este plano não tem migration. Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.
- **Registro:** no fim deste plano, a cada etapa concluída.

## Registro de andamento

- **Etapa 1 (branch):** `feat/R/cartao-vigencia-e-cor`, a partir da `main` em `3e8845f1`.
- **Etapa 2 (regras puras):** `backend/src/services/cardDueDate.ts` (`moveDueDateToDay`, `parseEffectiveMonth`), com 4 testes.
- **Etapa 3 (servidor):** commit `38381b52`.
  - `PUT /cards/:id`: aceita `vigente_desde` opcional. Cartão e despesas mudam numa transação com Drizzle.
  - **Desvio:** o `UPDATE cartoes` em SQL cru virou Drizzle para entrar na mesma transação. A resposta mantém os mesmos campos e ganha `despesas_atualizadas`.
  - Despesas: uma atualização por data nova (no máximo uma por mês).
  - Cor validada no `POST` e no `PUT` ("Cor inválida"); mês inválido → "Mês de vigência inválido".
- **Etapa 4 (tela, vigência):** commit `3df01fe3`.
  - `src/utils/cardSchedule.ts` (`nextOpenInvoiceMonth`, `effectiveMonthParam`), com 5 testes.
  - Campo "Vale a partir de", confirmação, envio de `vigente_desde` e `invalidateExpenseQueries`.
  - **Correção** `ec4ef0a0`: o `ConfirmDialog` usa por padrão o botão vermelho; a confirmação do vencimento passou para o normal.
- **Etapas 5 e 6 (tela, cor):** commit `6052c0df`.
  - Primeiro saíram `COR_OPCOES` e as bolinhas; depois entraram `src/utils/color.ts` (5 testes) e `src/ui/ColorPicker.tsx`:
    - quadrado de saturação e brilho, barra de matiz e código;
    - mouse, toque e setas.
  - Texto do cartão pelo contraste, no modal e na grade. Corpo do modal de 306 para 372 px.
  - **Desvio:** o seletor fica na coluna da pré-visualização, embaixo do cartão, e não no lugar das bolinhas, para a cor mudar o cartão logo acima.
- **Etapa 7 (roteiro no banco local, backend na porta 3019):** 12/12; usuários de teste apagados e servidor derrubado.
  - Vencimento 4 → 10 a partir de 2026-11: 5 atualizadas (novembro, 3 parcelas, a de B), com mês e ano iguais.
  - Não mudaram: outubro, paga, cancelada, débito e outro cartão.
  - Só o fechamento: 0. Dia 31: 30/11, 31/12, 31/01. Sem vigência: só o cartão.
  - Mês 2026-13 → 400; cor "azul" → 400; `#12ab9f` gravada.
  - Membro sem acesso a Cartões → 403; com acesso, mas sem ser dono → 404.
- **Etapa 8 (validação):**
  - `tsc` do front ok; testes 175/175 (front) e 343/343 (back); builds ok.
  - Tela no jsdom 13/13.
- **Etapa 9 (prints):** `tmpclaude-prints/`, 5 de computador e 4 de celular. Achados corrigidos no commit `d0b63294`:
  - **Lista de meses cortada dentro do modal:** o `MonthYearPicker` ganhou `placement="top"`, e o padrão de Movimentações continua para baixo. Ao abrir, a lista rola para ficar inteira à vista; em Movimentações isso não muda nada, porque ela já fica à vista.
  - **Modal inutilizável no celular:** o problema já existia antes, com as duas colunas fixas e os campos de cerca de 120 px. Abaixo de 768 px (`useTelaDesktop`) os campos e o cartão ficam um embaixo do outro, e o cartão e o seletor ficam limitados a 300 px.
  - **Prints aprovados (o usuário rodou `/finalizar`, 2026-10-05).** Temporários apagados e servidores de teste derrubados.
