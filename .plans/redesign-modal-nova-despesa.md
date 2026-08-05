# Plano de Implementação: Redesenhar o modal "Nova despesa" com automações inteligentes

## Origem

- Arquivo de especificação: `.plans/tasks/redesign-modal-nova-despesa.md`
- Data do planejamento: `2026-08-05`
- Classificação: `frontend + backend`

## Resumo

Reescrever o modal de lançamento de despesa (`ExpenseDialog.tsx`) seguindo a especificação de comportamento e o mockup fornecidos: estrutura em 4 blocos (Identificação, Valores, Pagamento, Recorrência e data), campo único "Isso se repete?" substituindo os toggles "Já pago/Recorrente/Parcelado", forma de pagamento e cartão pré-selecionados por frequência real de uso, autocomplete de descrição por histórico real, categoria em menu flutuante com busca, data de vencimento/status sempre derivados, e detecção de duplicata como aviso não bloqueante.

As duas automações que dependem de histórico (autocomplete de descrição e forma de pagamento mais usada por categoria) usam uma rota nova no backend, porque o cache client atual (`queryKeys.dashboard(month, year)`) só cobre os meses já visitados nesta sessão e não é confiável como fonte de histórico completo. A recorrência "Todo mês" passa a gerar um lote fixo de ocorrências futuras ao salvar, reaproveitando a mesma mecânica que hoje já existe para parcelamento (`createFutureInstallments`).

## Escopo

### Dentro do escopo

- Reestruturar o modal nos 4 blocos com header e rodapé fixos e miolo rolável.
- Substituir os toggles "Já pago / Recorrente / Parcelado" por "Isso se repete?" (Não repete / Parcelas / Todo mês), com "Já pago" derivado de forma + data.
- Autocomplete de descrição por histórico real (rota backend), com navegação por teclado e preenchimento de descrição+valor+categoria+forma de pagamento.
- Sugestão de categoria por palavra-chave com casamento de palavra inteira (reaproveitando/ajustando `categorySuggestions.ts`).
- Novo menu de categoria flutuante (`position: fixed`, busca, recentes+alfabética, criação inline).
- Máscara de moeda pt-BR (direita→esquerda) no campo Valor.
- Campo "Valor final" oculto por padrão, com badges de juros/desconto.
- Forma de pagamento pré-selecionada por frequência real na categoria (fallback: geral → PIX), calculada via nova rota backend.
- Painel de cartões (pré-seleção por uso, texto único com 1 cartão, limite disponível em crédito, conta vinculada em débito).
- Painel "Parcelas": quantidade de parcelas (2-360) e já pagas (0 a parcelas-1) como campos livres, com geração de N registros filhos e K pagos.
- Painel "Todo mês": dia do mês livre (não-crédito) ou vencimento de fatura (crédito), gerando um lote fixo de N meses futuros ao salvar.
- Data única "Data da compra" com vencimento e selo de status (Pago/Agendado/Entra na fatura) sempre derivados; link "alterar" para data manual.
- Detecção de duplicata como aviso não bloqueante no rodapé (mesma lógica de comparação atual).
- Rodapé com lote (chips removíveis, soma, contagem), validação de descrição+valor, confirmação temporária pós-salvar.
- Atalhos de teclado (Enter, Shift+Enter, Tab, setas, Esc).
- Preservar fluxos existentes: edição de despesa, anexos, bloco de Nota Fiscal (perfil empresa), lote, criação rápida de categoria.

### Fora do escopo

- Qualquer migration ou alteração de schema (nenhuma é necessária — todas as colunas usadas já existem).
- Mudanças em `DespesasScreen.tsx` além do necessário para consumir o novo formato de submit, se houver.
- Alterações em `BatchPaymentModal.tsx`.
- Mudanças no cadastro/edição de cartões e categorias além de leitura de `dia_fechamento`/`dia_vencimento` e listagem.
- Internacionalização ou suporte a outras moedas além de BRL.
- Geração de PDF/relatórios envolvendo os novos campos.
- Qualquer trabalho de infraestrutura ou deploy.
- Job agendado de recorrência (a geração é em lote fixo no momento do salvamento, não um cron).

## Leitura de contexto

- `sistema financas/AGENT.md`
- `CLAUDE.md` (raiz e `sistema financas/CLAUDE.md`)
- `.plans/tasks/redesign-modal-nova-despesa.md` (task de origem, com especificação completa e mockup descrito)
- `src/screens/finance/ExpenseDialog.tsx`
- `src/ui/CategoryChipSelector.tsx`
- `src/ui/form.tsx`
- `src/utils/categorySuggestions.ts`
- `src/services/configService.ts`
- `src/services/queryKeys.ts`
- `src/services/financeService.ts`
- `src/types/finance.ts`
- `src/types/config.ts`
- `backend/src/routes/expenses.ts`

Observação: este projeto não tem `frontend/AGENT.md` nem `backend/AGENT.md` separados — só o `AGENT.md` único na raiz de `sistema financas`, que não descreve arquitetura multi-tenant/RLS (esse projeto é single-tenant, solo-dev, ver memória do projeto). As regras seguidas são as do `AGENT.md` e `CLAUDE.md` reais deste projeto.

## Impacto por área

### Frontend

- **`ExpenseDialog.tsx`**: reescrita seguindo os 4 blocos. Mantido como componente único (não dividir em subcomponentes de arquivo separado) para minimizar risco de regressão em um fluxo que já concentra lote, anexos, NF e duplicata funcionando hoje — nova UI interna organizada em seções dentro do mesmo arquivo.
- **Schema `zod`**: novos campos — `repeticao: 'nao' | 'parcelas' | 'mensal'` (substitui `recorrente`/`parcelado` como campos independentes, que continuam existindo no tipo de saída por compatibilidade com o backend), `parcelasJaPagas`, `diaRecorrencia`, `dataVencimentoManual` (para o link "alterar").
- **Novo componente de menu de categoria flutuante**: substitui o uso de `CategoryChipSelector` dentro do modal (o componente em si pode continuar existindo para outros usos, mas o modal passa a usar um novo componente com busca + `position: fixed`).
- **Novo componente de máscara de moeda**: input controlado que formata centavos da direita para a esquerda.
- **Utilitário de cálculo de fatura**: função pura `calcularVencimentoFatura(cartao, dataCompra)` extraída para arquivo de utils, testável isoladamente.
- **`categorySuggestions.ts`**: ajustar o casamento de palavras-chave para usar tokenização por palavra inteira (hoje usa `includes`, que pode casar substring — precisa virar comparação por token, conforme regra explícita da especificação: "99" não pode casar em "1999").
- **`services/configService.ts` ou novo `services/expenseSuggestionsService.ts`**: nova função de fetch para a rota de sugestões.
- **`services/queryKeys.ts`**: nova query key para as sugestões (com debounce no hook de busca, não no query key em si).
- Estados de loading/error/empty do autocomplete: lista vazia não mostra menu; erro na rota de sugestões não bloqueia o formulário (autocomplete e pré-seleção falham silenciosamente para PIX/sem sugestão).

### Backend

- **Ajustar `createFutureInstallments`** ([expenses.ts:47-113](../backend/src/routes/expenses.ts)): hoje sempre marca `pago: true` fixo para as parcelas 2..N (linha 82). Precisa aceitar um parâmetro de quantas parcelas nascem pagas (a partir da 1ª) e propagar corretamente esse status por parcela, sem alterar o comportamento para quem não passar esse parâmetro (compatibilidade retroativa).
- **Generalizar a função para também suportar recorrência mensal**: mesmo mecanismo de geração de N registros filhos, mas com vencimento mensal fixo (dia informado, ou dia de vencimento de fatura se crédito) em vez de +1 mês a partir da data de vencimento da parcela, sem "K já pagas" (todas nascem não pagas, exceto possivelmente a primeira ocorrência se a data já passou — seguindo a mesma regra de status derivado do frontend). Número de meses gerados: **12** (fixo, mesmo padrão de "lote antecipado" usado em parcelamento).
- **Nova rota `GET /api/expenses/suggestions`**: parâmetros `descricao` (opcional) e `categoria_id` (opcional). Retorna:
  - `matches`: até 4 despesas cuja `descricao` casa por prefixo ou conteúdo com o parâmetro, ordenadas por frequência de descrição normalizada e depois por `data_vencimento` mais recente, cada uma com `descricao`, `valorFinal`, `categoria_id`, `forma_pagamento`.
  - `formaPagamentoSugerida`: forma de pagamento mais frequente nas despesas do usuário filtradas por `categoria_id` (se informado); se não houver histórico na categoria, mais frequente no geral; se não houver histórico nenhum, `null` (frontend aplica fallback final para PIX).
  - Tudo filtrado por `usuario_id` da sessão autenticada (mesmo padrão de `buildWhereClause` já usado nas outras rotas do arquivo).
- **Extensão de dados de cartão**: a rota de sugestões (ou uma extensão pontual da rota de cartões, a avaliar durante a implementação qual fica mais coeso) deve expor, quando a forma de pagamento sugerida for crédito/débito, o cartão mais usado naquela forma e o limite disponível calculado (`limite - soma de despesas em aberto vinculadas ao cartão`).
- **Validação de entrada**: `descricao` e `categoria_id` tratados como opcionais e sanitizados (mesmo padrão de `express-validator` já usado nas outras rotas do arquivo); nenhuma query concatena string do usuário diretamente — segue os parâmetros posicionais (`$1`, `$2`, ...) já usados em todo o arquivo.
- Nenhuma rota existente muda de contrato — `DespesasScreen.tsx`, `FinanceDashboard.tsx` e `RelatoriosScreen.tsx` continuam consumindo os mesmos formatos.

### Banco de dados

`Sem alteração de banco identificada.` Todas as colunas necessárias já existem: `categoria_id`, `forma_pagamento`, `descricao`, `data_vencimento`, `pago`, `recorrente`, `parcelado`, `numero_parcelas`, `parcela_atual`, `grupo_parcelamento_id` (despesas) e `dia_fechamento`, `dia_vencimento`, `limite` (cartões).

Se, durante a implementação, o `EXPLAIN` da query de sugestões mostrar sequential scan custoso em volumes reais (ex: busca por `descricao` sem índice, ou agregação por `categoria_id + forma_pagamento` sem índice composto), isso será reportado como recomendação separada — **nenhum índice será criado ou migration executada sem confirmação explícita do usuário**, conforme regra do `AGENT.md`/`CLAUDE.md` deste projeto.

### Infra/Deploy

`Sem impacto esperado.`

## Arquivos provavelmente afetados

- `src/screens/finance/ExpenseDialog.tsx`
- `src/utils/categorySuggestions.ts`
- `src/utils/` — novo arquivo para cálculo de vencimento de fatura (nome exato a definir na implementação, ex: `cardDueDate.ts`)
- `src/ui/` — novo componente de menu de categoria flutuante e novo componente de máscara de moeda (nomes exatos a definir na implementação)
- `src/services/configService.ts` e/ou novo `src/services/expenseSuggestionsService.ts`
- `src/services/queryKeys.ts`
- `src/types/finance.ts`
- `backend/src/routes/expenses.ts`

## Estratégia de implementação

1. **Backend — generalizar geração de lote de registros filhos**: refatorar `createFutureInstallments` para aceitar um modo (`parcelas` vs. `recorrencia`) e o número de ocorrências já pagas (default 0), preservando o comportamento atual para o caso de parcelamento simples sem esse parâmetro.
2. **Backend — endpoint `GET /api/expenses/suggestions`**: implementar busca de matches de descrição e forma de pagamento mais frequente, com fallback em cascata (categoria → geral → null), sempre filtrado por `usuario_id`.
3. **Backend — dados de cartão para pré-seleção**: expor cartão mais usado por forma de pagamento e limite disponível calculado, reaproveitando a rota de sugestões ou uma extensão da rota de cartões (decidir durante a implementação, mantendo o menor número de chamadas do client).
4. **Frontend — utilitário de vencimento de fatura**: função pura testável, extraída para reuso entre o texto de vencimento derivado e o cálculo de "primeira parcela"/"primeira ocorrência".
5. **Frontend — ajustar `categorySuggestions.ts`** para tokenização por palavra inteira no casamento de palavras-chave.
6. **Frontend — novo componente de menu de categoria flutuante** com busca, `position: fixed`, fechamento por clique fora/Esc/scroll do modal.
7. **Frontend — novo componente de máscara de moeda** pt-BR.
8. **Frontend — service de sugestões**: função de fetch para a rota nova, com debounce no hook que a consome (2+ caracteres, delay curto antes de disparar a chamada).
9. **Frontend — reescrita de `ExpenseDialog.tsx`**: estrutura em 4 blocos, novo schema `zod`, integração com autocomplete, menu de categoria, máscara de moeda, painéis de Parcelas/Todo mês, data derivada com selo de status, duplicata não bloqueante, atalhos de teclado.
10. **Testes automatizados**: cálculo de vencimento de fatura (fechamento antes/depois do dia da compra, viradas de ano, dias 29-31), ajuste de "já pagas" ao reduzir parcelas, tokenização de palavra inteira em `categorySuggestions.ts`, fallbacks da rota de sugestões (sem histórico de categoria, sem histórico nenhum).
11. **Validação manual**: rodar via `/run`, testar perfil pessoa física e empresa (bloco de NF), lote de lançamentos, edição de despesa existente, parcelamento com parcelas já pagas, recorrência mensal em crédito e em PIX/débito.
12. **Comandos de validação finais**: lint, typecheck e build de frontend e backend antes de considerar a implementação pronta.

## Regras de negócio identificadas

- Caminho mínimo de preenchimento: descrição + valor.
- "Já pago" nunca é perguntado — é sempre derivado de forma de pagamento + data da compra.
- Forma de pagamento pré-selecionada: mais usada na categoria → mais usada no geral → PIX, nessa ordem, sem travar escolha manual.
- Cartão pré-selecionado: mais usado na forma de pagamento escolhida (crédito ou débito); lista de cartões só aparece com 2+ cartões cadastrados.
- Vencimento é sempre derivado por regra (nunca perguntado diretamente, exceto via link "alterar" para casos de boleto com data própria).
- Cálculo de fatura: compra até o dia de fechamento entra na fatura do mês; depois do fechamento, na fatura seguinte; vencimento é o próximo dia de vencimento após o fechamento aplicável.
- Parcelamento: N parcelas (2-360), K já pagas (0 a N-1); reduzir N reajusta K para caber no novo limite; parcela pai guarda a compra, parcelas filhas entram no fluxo de caixa.
- Recorrência mensal: gera lote fixo de 12 ocorrências futuras ao salvar; crédito usa vencimento de fatura, demais formas usam dia do mês informado (1-31, ajustado para o último dia em meses curtos).
- Detecção de duplicata: mesma descrição + mesmo valor final + mesma forma de pagamento nos últimos 7 dias — vira aviso não bloqueante, não impede o salvamento.
- Nenhuma automação pode gravar algo que o usuário não viu na tela antes de salvar.
- Não inferir relação entre parcelamento e forma de pagamento (parcelamento pode ocorrer em qualquer meio, não é exclusivo de crédito).

## Regras multi-tenant e segurança

Este projeto é single-tenant (um usuário dono dos próprios dados, autenticado via `authenticate` middleware), não há isolamento entre "prefeituras" ou tenants como em outros projetos. Mesmo assim:

- Toda query nova na rota de sugestões deve filtrar por `req.user!.id`, seguindo o padrão já usado em `buildWhereClause` e nas demais rotas de `expenses.ts`.
- Não confiar em `usuario_id` vindo do client — sempre usar o `id` do usuário autenticado via middleware, como já é feito em todo o arquivo.
- Se o app tiver mais de um perfil ativo (`perfilAtivoTipo`), considerar filtrar sugestões por `perfil_id` também, seguindo o mesmo padrão condicional já usado em `buildWhereClause` (linha 32-36 de `expenses.ts`), para não misturar sugestões de perfil pessoal com perfil empresa.
- Nenhuma migration ou alteração de schema será executada sem confirmação explícita — o ambiente pode estar apontando para produção.
- Não alterar `.env`.

## Validações necessárias

- **Backend**: `descricao` e `categoria_id` como parâmetros de query opcionais e sanitizados; `categoria_id`, quando presente, validado como inteiro pertencente ao usuário autenticado (mesmo padrão de `validateCardId` já existente para `cartao_id`).
- **Frontend**: schema `zod` atualizado — `parcelasJaPagas` limitado a `0 <= K < parcelas`; `diaRecorrencia` limitado a `1-31`; `repeticao` como enum fechado (`'nao' | 'parcelas' | 'mensal'`); `descricao` e `valor_original` continuam obrigatórios.
- Reaproveitar a validação de duplicata já existente em `handleSubmit` (comparação de descrição normalizada + valor + forma de pagamento nos últimos 7 dias), apenas trocando o efeito de bloqueio por aviso.

## Testes necessários

### Frontend

- Cálculo de vencimento de fatura: compra antes do fechamento, depois do fechamento, viradas de mês/ano, cartão com fechamento/vencimento em datas-limite do mês.
- Ajuste de "parcelas já pagas" quando o número de parcelas é reduzido abaixo do valor atual de "já pagas".
- Tokenização por palavra inteira em `categorySuggestions.ts` (garantir que "99" não casa em "1999", conforme regra explícita da especificação).
- Geração do texto de status derivado (Pago/Agendado/Entra na fatura) para as combinações de forma de pagamento × data.

### Backend

- Rota de sugestões: fallback quando há histórico de categoria, quando não há (usa geral), e quando não há histórico nenhum (retorna `null`, sem erro).
- Ajuste em `createFutureInstallments`: parcelas geradas corretamente com K primeiras pagas e as demais não pagas, para diferentes combinações de N e K.
- Geração de lote de recorrência mensal: 12 ocorrências geradas com vencimento correto para crédito (fatura) e não-crédito (dia fixo, incluindo dias 29-31 em meses curtos).

### E2E

`Não aplicável nesta entrega` — cobertura via testes unitários/de rota mais validação manual dos fluxos críticos (parcelamento, recorrência em crédito, lote).

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run lint
npm --prefix "sistema financas" run typecheck
npm --prefix "sistema financas" run test
npm --prefix "sistema financas" run build

npm --prefix "sistema financas/backend" run lint
npm --prefix "sistema financas/backend" run typecheck
npm --prefix "sistema financas/backend" run test
npm --prefix "sistema financas/backend" run build
```

(Os scripts exatos disponíveis em cada `package.json` devem ser confirmados no início da implementação — usar os comandos reais definidos no projeto se os nomes acima divergirem.)

## Riscos e pontos de atenção

- Ajustar `createFutureInstallments` é uma mudança em código que já roda em produção para parcelamento — qualquer regressão afeta lançamentos existentes. Precisa de testes cobrindo o caso atual (sem `parcelasJaPagas`) antes de estender.
- Gerar 12 meses de recorrência de uma vez aumenta o número de linhas por lançamento recorrente — mesmo padrão de escala que parcelamento já tem, risco de performance baixo, mas deve ser observado.
- Nova rota de sugestões pode ficar lenta sem índice adequado em volumes maiores de despesas — reportar recomendação de índice sem aplicar migration.
- Reescrever `ExpenseDialog.tsx` por inteiro (arquivo hoje com ~650 linhas concentrando formulário, lote, duplicata, NF, anexos, categorias) é uma mudança grande — risco de regressão nos fluxos que já funcionam. Mitigação: manter os mesmos pontos de integração (`onSave`, `ExpenseFormValues`, `expense` prop) e testar manualmente cada fluxo preservado antes de finalizar.
- Ambiente pode estar apontando para produção — nenhuma migration ou comando destrutivo de banco será executado.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. Não é esperado que esta implementação precise de migration alguma.

## Perguntas em aberto

- Nome exato dos novos arquivos/componentes (menu de categoria flutuante, máscara de moeda, utilitário de vencimento de fatura) — a definir durante a implementação seguindo a convenção de nomenclatura em inglês já usada no projeto para arquivos novos.
- Se a extensão de dados de cartão (cartão mais usado + limite disponível) deve viver na mesma rota de sugestões ou em endpoint separado — decidir durante a implementação com base no menor número de chamadas do client sem misturar responsabilidades.
- Confirmar os nomes reais dos scripts de lint/typecheck/test/build em cada `package.json` do projeto (frontend e backend) antes de rodar os comandos de validação.

## Critérios de aceite do plano

- O modal exibe os 4 blocos descritos, com header e rodapé fixos e miolo rolável, sem que nenhum menu/painel estique a altura a ponto de esconder o rodapé.
- É possível lançar uma despesa preenchendo apenas descrição e valor.
- "Isso se repete?" substitui integralmente os toggles antigos; "Já pago" nunca é perguntado.
- Autocomplete de descrição, sugestão de categoria por palavra inteira, menu de categoria flutuante, máscara de moeda, pré-seleção de forma de pagamento e cartão, painéis de Parcelas e Todo mês, data/vencimento/status derivados, lote e duplicata não bloqueante funcionam conforme a especificação da task de origem.
- Fluxos existentes preservados: edição de despesa, anexos, Nota Fiscal (perfil empresa), lote, criação rápida de categoria.
- Nenhuma migration foi executada; nenhuma alteração de schema foi feita sem confirmação explícita.
- Comandos de lint, typecheck, test e build (frontend e backend) passam.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto, junto com `.plans/tasks/redesign-modal-nova-despesa.md` para os detalhes completos da especificação de comportamento.
- Não executar migrations sem confirmação explícita — nenhuma é esperada para este plano.
- Seguir `AGENT.md` e `CLAUDE.md` da raiz de `sistema financas`.
- Manter alterações pequenas e revisáveis; considerar dividir a implementação em commits por etapa (backend primeiro, depois frontend) para facilitar revisão.
- Ao ajustar `createFutureInstallments`, garantir que o comportamento atual (sem `parcelasJaPagas` informado) continue idêntico ao de hoje.
- Atualizar testes conforme descrito na seção "Testes necessários".
- Confirmar nomes reais de scripts de validação (lint/typecheck/test/build) nos `package.json` antes de rodá-los.
- Este projeto não usa PR — ao final, seguir para `/finalizar`, que faz commit + push + merge direto em `main` após confirmação.
