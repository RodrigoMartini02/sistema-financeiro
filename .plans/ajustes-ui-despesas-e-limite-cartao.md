# Plano de Implementação: Ajustes de UI no modal de despesas e correção do limite de cartão

## Origem

- Arquivo de especificação: solicitações do usuário no chat, com screenshots do card de limite de crédito e do painel de cartão dentro do modal
- Data do planejamento: 2026-09-06
- Classificação: `fullstack`
- Branch: `refactor/R/padronizar-modal-configuracoes`

## Resumo

Sete ajustes pedidos pelo usuário: cinco de apresentação no modal de despesas e no card de limite, um de ordenação da tabela (que exige expor um campo do backend) e uma correção no cálculo do limite de cartão.

Nenhuma migration. O campo `data_criacao` já existe na tabela `despesas`; falta apenas expo-lo.

## Decisões aplicadas

- Dúvida 1: **opção 2, posicionada à direita** — o painel do cartão vira chips mais o limite disponível em texto discreto, ocupando a coluna direita ao lado da forma de pagamento, onde hoje há espaço vazio.
- Dúvida 2: **limite volta ao pagar a despesa**; em despesa parcelada, cada parcela paga libera a sua parte.
- Dúvida 3: **opção 1** — a despesa cadastrada mais recentemente aparece no topo da tabela, como ordenação padrão.
- Dúvida 4: **opção 1** — a ordem de salvamento do lote já está correta; nada a fazer.

## Escopo

### Dentro do escopo

1. Remover as descrições do tipo de cobranca ("Uma unica cobranca", "Numero fixo de parcelas", "Todo mes, ate cancelar").
2. Redesenhar o painel de cartao no modal: chips na escala 32px, sem moldura nem rotulo, posicionados na coluna direita ao lado da forma de pagamento, com o limite disponivel em texto pequeno.
4. Expor `data_criacao` das despesas e torna-la a ordenacao padrao da tabela (mais recente primeiro).
5. Modal de despesas com altura fixa de 80% da viewport, absorvendo a variacao no scroll interno.
6. Remover o rotulo "Limite de credito" do card.
7. Corrigir o calculo do limite de cartao.

### Fora do escopo

- Item 3 (ordem de salvamento do lote): verificado, ja esta correto.
- `IncomeDialog`.
- Migrations, alteracao de schema.
- Pendencias anteriores: tabela de receitas que nao atualiza, lancamentos de meses anteriores, decisao sobre a migration `0018b`.

## Leitura de contexto

- `CLAUDE.md` da raiz e do `sistema financas`
- `src/screens/finance/ExpenseDialog.tsx` (itens 1, 2, 5)
- `src/screens/despesas/DespesasScreen.tsx` (item 4 — ordenacao)
- `src/screens/finance/MovimentacoesScreen.tsx` (item 6 — card de limite)
- `src/ui/dialog.tsx` (item 5 — altura do modal)
- `src/ui/dialogFormTokens.tsx` (`panelStyle`, `chipStyle`)
- `backend/src/services/cardLimitService.ts` (item 7 — calculo do limite)
- `backend/src/routes/expenses.ts` (item 4 — SELECT e geracao de parcelas)
- `backend/src/db/schema/expenses.ts` (confirma que `data_criacao` existe)
- `src/types/finance.ts` e `src/services/financeService.ts` (item 4 — tipo e mapeamento)
- Nao existem `frontend/AGENT.md` nem `backend/AGENT.md` neste projeto: o `CLAUDE.md` da raiz cobre todo o repositorio.

## Diagnóstico do item 7 — limite de cartão

### O que ja esta correto

A regra descrita pelo usuario — ao pagar uma despesa o valor volta ao limite, e em parceladas cada parcela paga libera a sua parte — **ja esta implementada**. Cada parcela e uma linha independente em `despesas`, com seu proprio campo `pago` (o loop em `expenses.ts:58` gera uma linha por parcela). O filtro `d.pago = false` no JOIN produz exatamente esse comportamento.

A ausencia de filtro por mes tambem esta correta: parcela futura em aberto compromete limite hoje.

### O que esta errado

**Defeito 1 — despesas de cartao sem classificacao nao somam.**

A condicao do JOIN e:

```sql
AND (c.tipo = 'credito' OR d.forma_pagamento = 'credito')
```

Um cartao com `tipo` NULL (cadastrado antes desse campo existir) aparece na listagem, porque a clausula do WHERE permite `c.tipo IS NULL`. Mas suas despesas so entram na soma se tiverem `forma_pagamento = 'credito'` gravado. Despesa antiga sem esse valor nao conta, e a barra fica travada num numero baixo — o sintoma relatado pelo usuario.

E o mesmo padrao de dado orfao encontrado nas categorias: registro anterior ao modelo atual, sem o campo que o filtro exige.

**Defeito 2 — despesa de outra conta soma no limite.**

O cartao e filtrado por conta (`accountClause`), mas o JOIN com `despesas` nao tem filtro equivalente. Uma despesa de outra conta, apontando para o mesmo cartao, entra na soma.

### Correcao proposta

- Tratar cartao com `tipo` NULL como cartao de credito para efeito de soma, mantendo o criterio ja usado no WHERE.
- Aplicar filtro de conta ao JOIN de despesas, espelhando o criterio de `utils/accountFilter.ts` (registro sem conta pertence a conta pessoal do dono).

## Impacto por área

### Frontend

**`src/screens/finance/ExpenseDialog.tsx`** (itens 1, 2)
- Remover o campo `ajuda` de `repeticaoOptions` e sua renderizacao.
- Mover o painel de cartao para a coluna direita, ao lado da forma de pagamento; trocar `panelStyle` por layout sem moldura; chips de 36px para 32px (padrao `chipStyle`); limite disponivel em texto pequeno.

**`src/ui/dialog.tsx`** (item 5)
- Altura fixa de 80vh para o modal de despesas, preservando o scroll interno ja existente (`scrollBody={false}`).

**`src/screens/despesas/DespesasScreen.tsx`** (item 4)
- Nova ordenacao padrao por data de criacao decrescente.
- Adicionar a opcao correspondente no seletor de ordenacao, se houver.

**`src/screens/finance/MovimentacoesScreen.tsx`** (item 6)
- Remover o `<span>` com o texto "Limite de credito".

**`src/types/finance.ts` e `src/services/financeService.ts`** (item 4)
- Expor `dataCriacao` no tipo `Expense` e no mapeamento `expenseFromApi`.

### Backend

**`backend/src/routes/expenses.ts`** (item 4)
- Incluir `data_criacao` no retorno da listagem. O `SELECT d.*` ja traz a coluna; confirmar se ela chega ao payload ou se ha projecao explicita em algum ponto.

**`backend/src/services/cardLimitService.ts`** (item 7)
- Corrigir os dois defeitos descritos no diagnostico.

### Banco de dados

Sem impacto esperado. `data_criacao` ja existe na tabela `despesas` (`backend/src/db/schema/expenses.ts:50`). Nenhuma migration.

Atencao: migrations nao devem ser executadas sem confirmacao explicita do usuario, pois o ambiente atual pode estar apontando para producao.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/finance/ExpenseDialog.tsx`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/finance/MovimentacoesScreen.tsx`
- `src/ui/dialog.tsx`
- `src/types/finance.ts`
- `src/services/financeService.ts`
- `backend/src/services/cardLimitService.ts`
- `backend/src/routes/expenses.ts`

## Estratégia de implementação

1. Item 1: remover as descricoes do tipo de cobranca.
2. Item 6: remover o rotulo do card de limite.
3. Item 2: redesenhar o painel de cartao na coluna direita.
4. Item 5: fixar a altura do modal em 80vh.
5. Item 7: corrigir a query do limite (backend).
6. Item 4: expor `data_criacao` no backend, no tipo e no mapeamento; trocar a ordenacao padrao da tabela.
7. Validar com `tsc`, build e a suite do backend.

## Regras de negócio identificadas

- Limite de cartao e reduzido por despesa em aberto e devolvido quando a despesa e paga.
- Em despesa parcelada, cada parcela e uma linha com seu proprio `pago`; pagar uma parcela libera apenas o valor dela.
- Parcela futura em aberto compromete limite no momento presente — a soma nao deve ser recortada por mes.
- Cartao sem `tipo` definido deve ser tratado como credito, criterio ja adotado na listagem.
- Despesa de uma conta nao deve somar no limite de cartao de outra conta.
- A despesa cadastrada mais recentemente deve aparecer no topo da tabela.

## Regras multi-tenant e segurança

O projeto nao e multi-tenant por organizacao: o isolamento e por `usuario_id`, e permanece intacto — as clausulas alteradas sao adicionais ao filtro de dono, nunca substitutivas.

A correcao do defeito 2 do item 7 **reforca** o isolamento por conta, que hoje esta ausente no JOIN de despesas do limite.

## Validações necessárias

Nenhuma validacao de input nova. As rotas alteradas sao de leitura e ja validam os parametros contra o `usuario_id`.

## Testes necessários

### Frontend

Nao ha suite de teste de componente no projeto. Verificacao manual:

- Modal de despesas mantem a mesma altura com e sem lote, com scroll interno.
- Painel de cartao aparece a direita da forma de pagamento, na escala dos demais chips.
- Tabela de despesas mostra a ultima cadastrada no topo.

### Backend

Suite existente deve continuar passando (23 testes). Avaliar teste novo para `getCardLimits`, se houver infraestrutura de teste com banco — verificar durante a implementacao.

Verificacao manual do item 7:
- Cadastrar despesa no cartao e conferir que o limite disponivel diminui.
- Marcar a despesa como paga e conferir que o limite volta.
- Em parcelada, pagar uma parcela e conferir que só o valor dela e liberado.

### E2E

Nao aplicavel — projeto nao tem E2E configurado.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
cd backend && npm run build && npm test
```

Observacao: `src/screens/despesas/DespesasScreen.tsx:727` tem um erro de tipo pre-existente, nao relacionado a esta alteracao.

## Riscos e pontos de atenção

- **Medio (item 7):** o limite de cartao e um numero usado para decisao de compra. Alterar o calculo muda o que o usuario ve; a correcao deve ser conferida com casos reais antes do merge.
- **Medio (item 7):** corrigir o defeito 1 fara o valor usado **subir**, possivelmente muito, se houver despesas antigas sem `forma_pagamento`. Isso e o valor correto, mas pode surpreender.
- **Medio (item 4):** trocar a ordenacao padrao muda a tela mais consultada do sistema.
- **Baixo:** itens 1, 2, 5 e 6 sao apresentacao.

## Perguntas em aberto

- O item 4 deve manter as demais opcoes de ordenacao no seletor? Assumido que sim: apenas o padrao muda.
- Existe infraestrutura de teste com banco no backend para cobrir `getCardLimits`? A verificar durante a implementacao.

## Critérios de aceite do plano

- As tres descricoes do tipo de cobranca nao aparecem mais.
- O painel de cartao fica a direita da forma de pagamento, com chips de 32px, sem moldura e sem rotulo em caixa alta.
- O modal de despesas mantem altura de 80% da viewport independentemente do conteudo.
- O card de limite nao exibe mais o rotulo "Limite de credito".
- Despesa em cartao reduz o limite disponivel; pagar a despesa devolve o valor; em parcelada, cada parcela paga devolve so a sua parte.
- Despesa de outra conta nao soma no limite do cartao.
- A tabela de despesas mostra a mais recente cadastrada no topo.
- `tsc --noEmit`, `vite build` e os 23 testes do backend passam.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Nao implementar o item 3: verificado, ja esta correto.
- Nao executar migrations. Nao alterar `.env`.
- Reutilizar `chipStyle` de `dialogFormTokens.tsx` no painel de cartao; nao criar tokens novos.
- No item 7, espelhar o criterio de conta de `utils/accountFilter.ts`, sem inventar variacao.
- Preservar o isolamento por `usuario_id` em toda query alterada.
- Registrar no resumo final se o valor "usado" do limite mudou significativamente apos a correcao, para o usuario conferir.
