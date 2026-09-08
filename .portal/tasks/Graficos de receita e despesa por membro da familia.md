# Task: Gráficos de receita e despesa por membro da família

## Contexto

O `sistema financas` tem uma carteira compartilhada: em conta pessoal, os membros vinculados lançam despesas e receitas na mesma conta do gestor, e cada lançamento registra em `usuario_id` quem o cadastrou. A tabela de despesas já exibe essa autoria numa coluna "Quem lançou", que aparece quando há mais de uma pessoa lançando no período.

O painel principal (`FinanceDashboard`), porém, não separa nada por pessoa. Ele mostra o total da família, mas não permite ver quanto cada membro trouxe ou gastou.

Peças relevantes já existentes no projeto, verificadas por leitura direta:

- **`src/screens/finance/charts/DonutChart.tsx`** — componente de rosca que **já faz exatamente o que esta task pede**: valor no furo central (`centerLabel` + `centerValue`) e legenda lateral com nome, percentual e valor por item. Props: `data: Array<{name, value, color}>`, `centerLabel`, `centerValue`, `capitalizeLabels`. Não precisa ser alterado, apenas consumido.
- **`recharts`** já está no `package.json`; nenhuma dependência nova é necessária.
- **Barras empilhadas já são usadas** no projeto: `src/screens/finance/charts/MonthWaterfallChart.tsx` usa `stackId` no `<Bar>`.
- **`src/screens/finance/charts/ChartTooltip.tsx`** — tooltip compartilhado entre os gráficos.
- Outros gráficos como referência de padrão: `AnnualTrendChart.tsx`, `MonthlyComparisonBarChart.tsx`.
- **`GET /api/account-members/summary`** ([accountMembers.ts:317](../backend/src/routes/accountMembers.ts#L317)) — já existe e soma despesas (`SUM(valor_original)`) e receitas (`SUM(valor)`) agrupadas por `usuario_id`. Resolve os autores a partir do dono da conta mais os membros ativos ([linhas 342-352](../backend/src/routes/accountMembers.ts#L342-L352)). **Nunca foi consumido por nenhuma tela.**
- **`fetchAccountSummary(mes?, ano?)`** ([membrosService.ts:86](../src/services/membrosService.ts#L86)) — já existe e chama esse endpoint. A interface `AccountSummary` já está tipada. Também nunca foi consumida.
- **`fetchMembros()`** no mesmo service — lista os membros da conta, com `usuario_id` e `nome`.

## Problema

Com a carteira compartilhada, todos os lançamentos caem numa tabela só. O sistema ganhou o total da família e perdeu a leitura individual: não há como responder "quanto cada um gastou" nem "no que cada um gasta".

O dado existe — cada lançamento tem `usuario_id` — e o backend já sabe somá-lo por pessoa. O que falta é a visualização.

## Objetivo

Exibir, no painel principal, três recortes por membro da família: quanto cada um trouxe de receita, quanto cada um gastou, e como esse gasto se distribui entre as categorias.

## Decisão Técnica Desejada

Todas as decisões abaixo já foram tomadas pelo usuário e **não devem ser reabertas no planejamento**.

### Onde

No **painel principal** (`FinanceDashboard`), junto dos gráficos que já vivem lá.

### O que construir

Três elementos:

1. **Donut de receitas por membro**, com o total da família no centro
2. **Donut de despesas por membro**, com o total da família no centro
3. **Barras empilhadas**: uma barra por categoria, dividida internamente pelos membros, mostrando quanto cada membro corresponde dentro daquela categoria

A **cor de cada membro deve ser a mesma nos três gráficos**. É isso que liga a leitura: o usuário identifica a pessoa uma vez e a reconhece nos outros dois.

### Quantas categorias nas barras

**Top 8 por valor, em ordem decrescente** — exatamente o padrão que o gráfico de categorias do painel já usa ([FinanceDashboard.tsx:124-127](../src/screens/finance/FinanceDashboard.tsx#L124-L127)):

```ts
.map((c) => ({ name: c.categoria, value: c.total }))
.sort((a, b) => b.value - a.value)
.slice(0, 8)
```

O corte importa porque o painel abre no ano inteiro por padrão: em 2026 há 24 categorias com movimento.

### Quando exibir

Quando a conta for **pessoal e tiver membros vinculados** (`conta_membros` com `status = 'ativo'`). Em conta sem membros, os gráficos não aparecem — um donut de uma fatia só não informa nada.

## Escopo Funcional

### Dentro do escopo

- Backend: agrupar despesas por membro **e** categoria — hoje o endpoint agrupa só por membro
- Backend: expor o **nome** de cada membro junto dos totais (hoje retorna apenas `usuario_id`)
- Backend: reconciliar o filtro de período — o endpoint aceita apenas mês único, o painel filtra por intervalo
- Frontend: paleta de cores por membro, estável entre os três gráficos
- Frontend: componente de barras empilhadas por categoria/membro
- Frontend: seção no `FinanceDashboard` com os dois donuts e as barras
- Frontend: condicional de exibição (conta pessoal com membros vinculados)

### Fora do escopo inicial

- Alterar o `DonutChart`, que já atende ao que foi pedido
- Criar membros da família ou alterar a tela de Configurações
- Gráficos por membro em outras telas (Movimentações, Relatórios)
- Filtro ou detalhamento por membro na tabela de despesas — a coluna "Quem lançou" já existe
- Comparativo entre períodos ou evolução temporal por membro
- Saldo por membro (receita menos despesa) como quarto elemento
- Barras empilhadas para receitas — a decisão cobre apenas despesas por categoria

## Requisitos de Frontend

- Consumir `fetchAccountSummary` e `fetchMembros`, que já existem e nunca foram usados
- Usar React Query com query keys centralizadas. **`queryKeys.ts` não tem chave para membros nem para o summary** — será preciso adicionar
- Reaproveitar `DonutChart` sem alterá-lo
- O componente de barras empilhadas deve seguir o padrão dos gráficos existentes em `src/screens/finance/charts/` (uso de `recharts`, `ResponsiveContainer`, `ChartTooltip`)
- A paleta por membro precisa ser determinística: o mesmo membro deve receber a mesma cor entre renders e entre os três gráficos
- Tratar os estados de loading, erro e vazio, como os demais gráficos do painel
- Preservar acessibilidade: o `DonutChart` já usa `role="img"` com `aria-label`
- Nomenclatura de código novo em inglês; nomes em português existentes são legado

## Requisitos de Backend

- Estender `GET /api/account-members/summary`, ou criar endpoint irmão, para retornar as despesas agrupadas por **membro e categoria**
- Incluir o **nome** de cada membro na resposta. Hoje o endpoint retorna apenas `usuario_id`, e os gráficos precisam de rótulo legível
- **Reconciliar o filtro de período**: o endpoint aceita apenas `mes` e `ano` (mês único), enquanto o painel filtra por intervalo (`deMes`/`deAno`/`ateMes`/`ateAno`). Sem isso, os gráficos mostrariam um recorte diferente do resto da tela
- Preservar a resolução de autores já existente (dono da conta + membros ativos) e a checagem de permissão `accessReports` para membros ([accountMembers.ts:330-333](../backend/src/routes/accountMembers.ts#L330-L333))
- Usar `valor_original` como valor da despesa: é a única coluna de valor da tabela desde a limpeza recente

## Requisitos de Banco de Dados

`Sem alteração de banco identificada inicialmente.`

Os dados necessários já existem: `despesas.usuario_id`, `despesas.categoria_id`, `receitas.usuario_id` e `conta_membros`. O trabalho é de agregação, não de schema.

## Requisitos de Segurança e Multi-Tenant

Projeto não é multi-tenant de organizações; sem isolamento de tenant a considerar. O isolamento relevante é por `usuario_id` e conta.

- **Não inventar filtro novo de autores.** O endpoint já resolve corretamente: dono da conta mais membros ativos daquela conta
- Preservar a checagem de permissão `accessReports`: um membro sem essa permissão recebe 403 ao consultar o summary
- Os gráficos expõem quanto cada pessoa gastou — informação sensível dentro da família. A condicional de exibição e a permissão existente são o que controla isso
- Não alterar `resolveVisibleUserIds`, `resolveVisibleCardOwnerIds` nem `familyVisibility`

## Requisitos de Migração ou Compatibilidade

- Se a resposta do endpoint mudar de forma, atualizar a interface `AccountSummary` em `membrosService.ts`. Como ela nunca foi consumida, não há risco de quebrar tela existente
- Preferir estender o endpoint de forma aditiva a criar um segundo com responsabilidade sobreposta
- O painel usa intervalo de período; qualquer parâmetro novo deve conviver com `mes`/`ano` já aceitos

## Requisitos de Testes

### Frontend

- Verificar os dois donuts com dois ou mais membros lançando, conferindo que o total central bate com a soma das fatias
- Verificar as barras empilhadas: a soma dos segmentos de cada categoria deve bater com o total daquela categoria
- Verificar que a cor de cada membro é a mesma nos três gráficos
- Verificar o comportamento em conta sem membros: os gráficos não devem aparecer
- Verificar membro sem lançamento no período: deve aparecer com valor zero ou ser omitido, conforme o planejamento decidir
- Verificar modo escuro e responsividade, como nos demais gráficos do painel

### Backend

- Conferir que o agrupamento por membro e categoria soma corretamente
- Conferir que apenas autores da conta aparecem no resultado
- Conferir que um membro sem `accessReports` recebe 403

### E2E

Não aplicável — sem infraestrutura de E2E no projeto.

## Arquivos Provavelmente Afetados

### Frontend

- `src/screens/finance/FinanceDashboard.tsx` — nova seção
- `src/screens/finance/charts/` — novo componente de barras empilhadas
- `src/services/membrosService.ts` — tipos e, possivelmente, nova função
- `src/services/queryKeys.ts` — chaves novas
- `src/screens/finance/charts/DonutChart.tsx` — apenas consumido, não alterado

### Backend

- `backend/src/routes/accountMembers.ts` — endpoint de summary

### Banco de Dados

Sem alteração identificada.

## Critérios de Aceite

- O painel exibe dois donuts (receitas e despesas por membro), cada um com o total da família no centro
- O painel exibe barras empilhadas com as 8 maiores categorias por valor, cada barra dividida pelos membros
- A cor de cada membro é idêntica nos três gráficos
- A soma das fatias de cada donut equivale ao valor exibido no centro
- A soma dos segmentos de cada barra equivale ao total daquela categoria
- Os gráficos respeitam o mesmo período selecionado no filtro do painel
- Em conta sem membros vinculados, a seção não é renderizada
- Um membro sem permissão `accessReports` continua recebendo 403 no endpoint
- Os nomes dos membros aparecem como rótulo, não os ids
- `npx vite build` e o build do backend concluem sem erros
- `npx tsc --noEmit` continua limpo

## Perguntas Para o Planejamento

- O endpoint aceita apenas mês único e o painel filtra por intervalo. Estender o endpoint para receber intervalo, ou fazer o frontend agregar múltiplas chamadas? A primeira parece mais direta, mas muda a assinatura
- Um membro que não lançou nada no período deve aparecer com valor zero na legenda, ou ser omitido do gráfico?
- As barras empilhadas cobrem apenas despesas. Faz sentido um equivalente para receitas por categoria, ou receitas ficam só no donut?
- Qual paleta usar para os membros? Existe alguma sequência de cores já padronizada no projeto para séries de dados?
- Com o corte em 8 categorias, o restante deve virar uma barra "Outras" ou simplesmente não aparecer? O gráfico de categorias atual apenas corta, sem agrupar o resto
- Os gráficos devem respeitar `singleMonth` ([FinanceDashboard.tsx:51](../src/screens/finance/FinanceDashboard.tsx#L51)), como fazem os gráficos que só valem para mês único, ou funcionam em qualquer intervalo?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada. **As quatro decisões de produto já estão fechadas** — não reabrir onde, o quê, quantas categorias nem quando exibir
- Leia o `CLAUDE.md` da raiz e do projeto (fluxo obrigatório `/planejar` → aprovação → `/implementar` → `/finalizar`)
- Sobre o `AGENT.md`: existe apenas na raiz e em `sistema financas/` (idênticos). **Não existem** `frontend/AGENT.md` nem `backend/AGENT.md`. O conteúdo descreve um sistema multi-prefeitura com RLS que não corresponde a este projeto — usar apenas as partes genéricas e ignorar a seção de multi-tenant
- Inspecione `DonutChart.tsx`, `MonthWaterfallChart.tsx`, `FinanceDashboard.tsx`, `accountMembers.ts` e `membrosService.ts` antes de escrever o plano
- Classifique como `frontend + backend`, sem migration
- Resolva as perguntas em aberto com o usuário antes de fechar o plano, em especial a do filtro de período — ela afeta a assinatura do endpoint
- Não implemente código durante o planejamento
- Não instale dependências: `recharts` já está disponível
- Gere o plano em `.plans/` (convenção real deste projeto), com etapas pequenas e revisáveis

## Observação sobre o estado dos dados

`conta_membros` está **vazia** em produção — nenhum membro foi criado ainda. Os gráficos só se manifestam depois que o usuário criar um membro pela tela de Configurações → Membros da família.

Isso não bloqueia a implementação, mas significa que a validação visual precisará de um membro criado, ou de dados de teste no banco local.

Contexto adicional: uma limpeza feita em 07/09/2026 removeu lançamentos de outros usuários que estavam na conta 17 por resíduo de migração de contas. Hoje os 546 lançamentos da conta pertencem todos ao usuário 1.
