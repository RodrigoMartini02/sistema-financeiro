# Plano de Implementação: Painel por família e por membro

## Origem

- Arquivo de especificação: `.portal/tasks/Graficos de receita e despesa por membro da familia.md`
- Data do planejamento: `2026-09-08`
- Classificação: `frontend + backend` (sem migration)

O escopo cresceu durante o planejamento. A task original pedia gráficos de composição por membro; a investigação revelou que o painel nunca somou a família, e o usuário optou por resolver as duas coisas na mesma entrega.

## Resumo

O painel principal passa a ter dois modos de leitura — **Família** (soma todos os membros da conta) e **Membro** (um membro específico) — selecionáveis no topo da tela. Junto disso, ganha um card comparativo sempre visível com receita, despesa e saldo de cada membro, e a repartição por pessoa nos gráficos de composição.

## O achado que define o tamanho desta entrega

**O painel hoje não soma a família.** Verificado por leitura direta: há **18 ocorrências de `usuario_id = $1`** em [financial.ts](../backend/src/routes/financial.ts) e **zero** uso de `resolveVisibleUserIds` — o helper que resolve quais usuários a carteira compartilhada permite enxergar.

Ou seja: mesmo com a carteira compartilhada ativa e membros vinculados, o painel sempre mostrou apenas os lançamentos do solicitante. A tabela de despesas já respeita a carteira (usa `resolveVisibleUserIds`), mas o painel ficou de fora.

Isso significa que o modo "Família" **também é construção nova**, não apenas os gráficos por membro. É a maior parte do trabalho desta entrega.

## Decisões aplicadas

- **Decisão 1 (encaminhamento):** uma entrega só — modo família, filtro por membro, card comparativo, donuts e barras divididas
- **Decisão 2 (metas nas barras):** no modo Família a meta **não aparece**, porque cada membro tem a sua e somá-las não produz número com significado. A cor da barra fica livre para os membros. No modo Membro, a meta dele volta e a barra volta a ser inteira

Decisões anteriores, tomadas antes deste plano e que permanecem válidas:

- Os gráficos vivem no painel principal (`FinanceDashboard`)
- Barras de categoria: top 8 por valor, mesmo padrão do gráfico de categorias existente
- A cor de cada membro é a mesma em todos os gráficos

## Comportamento por modo

| Elemento | Modo Família | Modo Membro |
|---|---|---|
| Cards do painel (saldo, receitas, despesas) | Soma dos membros | Só o membro selecionado |
| Card comparativo por membro | Visível | Visível |
| Donut de receitas por membro | Visível | Oculto |
| Donut de despesas por membro | Visível | Oculto |
| Barras de categoria | Divididas por membro, cores dos membros | Inteiras, cor do status |
| Marcador e texto de meta | Ocultos | Visíveis |
| Contador "N sem meta" | Oculto | Visível |

O card comparativo permanece nos dois modos de propósito: é a referência que permite entender o número individual em relação ao conjunto.

## Escopo

### Dentro do escopo

**Backend**

- `financial.ts`: aceitar escopo de leitura — família (autores visíveis) ou membro específico
- `/account-members/summary`: aceitar intervalo de período (`deMes`/`deAno`/`ateMes`/`ateAno`), mantendo `mes`/`ano`
- `/account-members/summary`: retornar o **nome** de cada membro, não apenas `usuario_id`
- `/account-members/summary`: agrupar despesas por membro **e** categoria (dado das barras divididas)
- **Corrigir defeito encontrado**: a query do summary filtra apenas por `usuario_id`, sem `conta_id` — soma lançamentos do usuário em qualquer conta

**Frontend**

- Seletor de escopo no topo do painel (Família · nome de cada membro)
- Card comparativo: uma linha por membro com receita, despesa e saldo
- Dois donuts (receitas e despesas por membro), visíveis apenas no modo Família
- Barras de categoria divididas por membro em `MonthCategoriesOverview`, apenas no modo Família
- Paleta determinística de cores por membro, compartilhada entre os três gráficos
- Ocultar meta (marcador, texto e contador) no modo Família

### Fora do escopo

- Alterar o `DonutChart`, que já atende ao pedido
- Criar membros da família ou alterar a tela de Configurações
- Modo família ou filtro por membro em outras telas (Movimentações, Relatórios, Copiloto)
- Barras de categoria divididas para receitas — a decisão cobre despesas
- Comparativo entre períodos ou evolução temporal por membro
- Alterar a lógica de metas (`orcamento_metas`) além de ocultá-las no modo Família
- Alterar a tabela de despesas, que já respeita a carteira compartilhada

## Leitura de contexto

- `CLAUDE.md` (raiz e projeto) — fluxo obrigatório `/planejar` → aprovação → `/implementar` → `/finalizar`
- `AGENT.md` — apenas as partes genéricas; a seção multi-tenant descreve um sistema multi-prefeitura que não corresponde a este projeto
- `frontend/AGENT.md` e `backend/AGENT.md` — **não existem** neste projeto
- `.portal/tasks/Graficos de receita e despesa por membro da familia.md` — especificação de entrada
- Arquivos inspecionados: `backend/src/routes/financial.ts`, `backend/src/routes/accountMembers.ts`, `backend/src/utils/familyVisibility.ts`, `backend/src/db/schema/copilot.ts`, `src/screens/finance/FinanceDashboard.tsx`, `src/screens/finance/MonthCategoriesOverview.tsx`, `src/screens/finance/charts/DonutChart.tsx`, `src/screens/finance/charts/MonthWaterfallChart.tsx`, `src/services/membrosService.ts`, `src/services/queryKeys.ts`

## Impacto por área

### Frontend

**Telas e componentes:**

- `FinanceDashboard.tsx` — seletor de escopo, card comparativo, dois donuts novos, propagação do escopo às queries
- `MonthCategoriesOverview.tsx` — barra dividida por membro e ocultação da meta no modo Família
- Novo módulo de paleta por membro (local a definir na implementação)

**Estados:** o seletor de escopo é estado local do painel. Tratar loading, erro e vazio como nos demais gráficos.

**Query keys:** `queryKeys.ts` **não tem chave para membros nem para o summary** — será preciso adicionar. O escopo selecionado precisa fazer parte da chave, senão o React Query serve dados do escopo anterior.

**Pontos de atenção:**

- A paleta precisa ser determinística: o mesmo membro recebe a mesma cor entre renders e entre gráficos
- `MonthCategoriesOverview` usa `<div>` com largura percentual, não `recharts` — a divisão por membro é feita com segmentos lado a lado, não com biblioteca
- Preservar as variantes `dark:` em tudo que for alterado
- Nomenclatura de código novo em inglês

### Backend

**`financial.ts`** — a mudança estrutural. As 18 queries com `usuario_id = $1` precisam aceitar um conjunto de usuários (modo família) ou um usuário específico (modo membro).

Recomenda-se um parâmetro único de escopo resolvido no início da rota, aplicado de forma uniforme — evitando 18 decisões independentes.

**`accountMembers.ts`** — estender o summary conforme listado no escopo.

**Permissões:** reaproveitar `resolveVisibleUserIds` ([familyVisibility.ts:78](../backend/src/utils/familyVisibility.ts#L78)), que já valida tipo de conta, vínculo ativo e a permissão `acesso_lancamentos_familia`. **Não escrever regra nova de visibilidade.**

O summary já tem checagem própria de `accessReports` para membros ([accountMembers.ts:330](../backend/src/routes/accountMembers.ts#L330)) — preservar.

### Banco de dados

`Sem alteração esperada.`

Verificado: `orcamento_metas` tem chave única em `usuario_id` + `conta_id` + `categoria_id` ([copilot.ts:79](../backend/src/db/schema/copilot.ts#L79)) — **a meta já é por usuário**, exatamente como a decisão 2 pressupõe. Nenhuma migration é necessária.

Os demais dados também já existem: `despesas.usuario_id`, `despesas.categoria_id`, `receitas.usuario_id`, `conta_membros`.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado.` `recharts` já está instalado; nenhuma dependência nova.

## Arquivos provavelmente afetados

**Frontend:**

- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/finance/MonthCategoriesOverview.tsx`
- `src/services/membrosService.ts`
- `src/services/queryKeys.ts`
- `src/services/financeService.ts` (propagação do escopo ao panorama)
- Novo componente/módulo de paleta por membro
- `src/screens/finance/charts/DonutChart.tsx` — apenas consumido

**Backend:**

- `backend/src/routes/financial.ts`
- `backend/src/routes/accountMembers.ts`

**Banco:** sem alteração.

## Estratégia de implementação

**Etapa 1 — Escopo no backend do painel**

1. Resolver o escopo no início da rota do panorama: família (via `resolveVisibleUserIds`) ou membro específico
2. Aplicar o escopo de forma uniforme nas 18 queries de `financial.ts`
3. Validar que um membro só consegue pedir escopo que a permissão dele autoriza

**Etapa 2 — Summary estendido**

4. Aceitar intervalo de período, mantendo `mes`/`ano` por compatibilidade
5. Incluir o nome de cada membro na resposta
6. Adicionar o agrupamento por membro e categoria
7. Corrigir o filtro para considerar `conta_id`

**Etapa 3 — Base do frontend**

8. Paleta determinística por membro
9. Chaves novas em `queryKeys.ts`, incluindo o escopo
10. Estado do seletor no painel e propagação às queries

**Etapa 4 — Componentes**

11. Seletor de escopo no topo
12. Card comparativo por membro
13. Dois donuts, reaproveitando `DonutChart`
14. Barras divididas em `MonthCategoriesOverview`, com ocultação da meta no modo Família

**Etapa 5 — Validação**

15. `npx vite build` e `npm run build` no backend
16. Testar no ambiente local com pelo menos dois membros e lançamentos de ambos

## Regras de negócio identificadas

- Em conta pessoal com membros vinculados, os lançamentos pertencem à conta; `usuario_id` registra a autoria
- A meta de categoria é **individual** (`orcamento_metas` por `usuario_id`), por isso não faz sentido no modo Família
- Um membro só enxerga lançamentos dos outros se tiver `acesso_lancamentos_familia`
- Um membro só acessa o summary se tiver `accessReports`
- O dono da conta sempre enxerga a carteira inteira
- Sem membros vinculados, o painel se comporta exatamente como hoje

## Regras multi-tenant e segurança

Projeto não é multi-tenant de organizações; sem isolamento de tenant a considerar. O isolamento relevante é por `usuario_id` e conta.

- **A origem confiável é o token autenticado.** O escopo pedido pelo cliente deve ser validado contra `resolveVisibleUserIds`, nunca aceito como veio
- Pedir escopo de um membro que o solicitante não pode ver deve falhar — não retornar dados parciais nem silenciosamente cair no próprio usuário
- Preservar a checagem `accessReports` do summary
- Não alterar `familyVisibility.ts`, `resolveVisibleUserIds` nem `resolveVisibleCardOwnerIds`
- Esta entrega **amplia** o que o painel mostra; qualquer erro aqui expõe dados de outra pessoa. É o risco central do plano

## Validações necessárias

- Escopo ausente: assume família (comportamento padrão)
- Escopo "família" sem membros vinculados: equivale ao usuário sozinho
- Escopo de membro que o solicitante pode ver: aceito
- Escopo de membro que o solicitante **não** pode ver: rejeitado
- Escopo de usuário fora da conta: rejeitado
- Intervalo de período inválido: mesmo tratamento que o painel já dá

## Testes necessários

### Frontend

- Alternar entre Família e cada membro, conferindo que todos os cards mudam
- Conferir que os donuts somem no modo Membro
- Conferir que as barras de categoria ficam divididas no modo Família e inteiras no modo Membro
- Conferir que a meta some no modo Família e volta no modo Membro
- Conferir que a cor de cada membro é a mesma nos três gráficos
- Conferir que a soma das fatias de cada donut bate com o centro
- Conferir que a soma dos segmentos de cada barra bate com o total da categoria
- Conta sem membros: seletor e gráficos por membro não aparecem
- Modo escuro e responsividade

### Backend

- Panorama com escopo família soma os lançamentos de todos os membros
- Panorama com escopo de membro traz apenas os dele
- Membro sem `acesso_lancamentos_familia` não consegue escopo de outro
- Membro sem `accessReports` recebe 403 no summary
- Summary com intervalo retorna o mesmo que a soma dos meses correspondentes

### E2E

Não aplicável — sem infraestrutura de E2E no projeto.

## Comandos de validação sugeridos

```bash
npx vite build
cd backend && npm run build
npx tsc --noEmit
```

Validação funcional via `/run`, com o backend no banco local (`npm run dev` usa `.env.dev`).

## Riscos e pontos de atenção

| Risco | Gravidade | Mitigação |
|---|---|---|
| **Vazamento de dados entre membros** | **Alta** | Escopo sempre validado por `resolveVisibleUserIds`; nunca confiar no que o cliente pede |
| **18 queries num arquivo central** | **Alta** | Parâmetro de escopo único resolvido uma vez e aplicado de forma uniforme; conferir cada query |
| Modo família mudar números que o usuário já conhece | Média | É a correção pretendida, mas os totais vão mudar quando houver membros — avisar |
| React Query servir dados do escopo anterior | Média | O escopo precisa fazer parte da query key |
| Barras ilegíveis com muitos membros | Baixa | Segmentos com cor sólida distinta; avaliar rótulo no hover |
| `conta_membros` vazia hoje | Baixa | Sem membros o painel segue idêntico; validar com dados de teste no local |

## Perguntas em aberto

- Um membro sem `acesso_lancamentos_familia` deve ver o seletor de escopo, ou ele só aparece para quem pode alternar?
- O modo selecionado deve persistir entre sessões (localStorage) ou reiniciar sempre em "Família"?
- No card comparativo, membro sem lançamento no período aparece com zeros ou é omitido?
- As barras divididas no modo Família mantêm o corte em top 8, ou o modo família pede outro corte?

## Critérios de aceite do plano

- O painel exibe seletor com Família e o nome de cada membro vinculado
- No modo Família, os cards somam os lançamentos de todos os membros visíveis
- No modo Membro, os cards mostram apenas os daquele membro
- O card comparativo exibe receita, despesa e saldo por membro nos dois modos
- Os dois donuts aparecem apenas no modo Família, com o total no centro
- As barras de categoria ficam divididas por membro no modo Família e inteiras no modo Membro
- A meta (marcador, texto e contador) some no modo Família e volta no modo Membro
- A cor de cada membro é idêntica nos três gráficos
- Um membro sem permissão não consegue escopo de outro
- Conta sem membros vinculados se comporta exatamente como hoje
- `npx vite build`, build do backend e `npx tsc --noEmit` concluem sem erros

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- **O risco central é vazamento entre membros.** Todo escopo pedido pelo cliente deve passar por `resolveVisibleUserIds` antes de virar filtro
- Não escrever regra nova de visibilidade: `familyVisibility.ts` já resolve tipo de conta, vínculo e permissão
- Em `financial.ts`, resolver o escopo **uma vez** no início da rota e aplicá-lo de forma uniforme — não decidir query a query
- `MonthCategoriesOverview` usa `<div>` com largura percentual, não `recharts`
- A meta já é por usuário no banco; não é preciso alterar `orcamento_metas`
- **Validar no banco local com pelo menos dois membros criados** — `conta_membros` está vazia em produção
- Não alterar `.env`
- Manter as alterações focadas: sem refactor oportunista
