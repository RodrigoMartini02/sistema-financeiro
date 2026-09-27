# Rascunho: Painel financeiro novo — decisões e levantamento (Fase 1)

> Documento de trabalho (não é o plano de implementação). Consolida as decisões
> tomadas em conversa e o levantamento técnico da Fase 1. Substitui o plano
> `reorganizar-painel-financeiro-pf.md` (superado: a reorganização do painel
> atual foi descartada em favor de refazer o painel do zero).
>
> Data: 2026-09-27

## Fases

1. **Levantamento** (em andamento): membros/permissões ✔ · conta empresa ✔ · qualidade dos dados em produção (pendente) · lista do que eliminar.
2. **Backend**: endpoint novo `/financial/painel` (regra do vencimento, Drizzle, visibilidade respeitada).
3. **Frontend**: painel novo do zero consumindo o endpoint novo.
4. **Limpeza**: remover `/financial/panorama`, `/financial/anual` (sem consumidor em telas), `PanoramaGeralView`, código morto.

Fases 2, 3 e 4 vão numa única branch e num único merge (decisão 10), para não existir período com o painel quebrado em produção.

## Decisões de produto (conta pessoal)

### Regra de datas — mês do vencimento (decidido)
- Regra única no sistema inteiro: a despesa pertence ao **mês do vencimento** (`mes`/`ano`), paga ou não — a mesma regra de Movimentações, Relatórios e Panorama Geral. Números batem entre telas.
- Crédito já nasce com o vencimento da fatura (`utils/cardDueDate.ts`), então para o crédito vencimento ≈ quando o dinheiro sai.
- O painel sempre separa **pago × a pagar** dentro do mês: o card "Saiu" mostra o total do mês e embaixo "R$ X pago · R$ Y a pagar"; o "Resultado" vira "como o mês vai fechar".
- Pagamentos atrasados aparecem no bloco "Em dia com as contas?" ("pago de outros meses", que compara `data_pagamento` com o mês do vencimento).
- Receita: mês da receita (`mes`/`ano`), só status `ativa`.
- Regime de caixa (data de pagamento) foi considerado e descartado: resolveria ~10% das despesas ao custo de divergir de todas as outras telas.

### Estrutura do painel (ordem)
1. **Cards do topo** (proposta, confirmação pendente): Entrou · Saiu · Resultado · Comprometimento · Saldo acumulado (saldo final + anterior).
2. **Receita × despesa mês a mês** — barras agrupadas + linha de resultado, sempre últimos 12 meses, período selecionado destacado. Não é pizza (receita e despesa não formam um todo; quebra com déficit).
3. **Como o dinheiro saiu**
   - Linha 1: **Forma de pagamento** (pizza grande, ~60%) com lista: forma, %, valor, nº de compras, ticket médio, juros · **Cartões de crédito** (pizza, ~40%) com valor e % do limite. Cartões só aparecem com gasto em cartão.
   - Linha 2: **À vista × parcelado** (pizza) · **Tipo de gasto: fixo × parcela × livre** (pizza).
   - Linha 3: **Uso do crédito mês a mês** (% do gasto no crédito, 12 meses).
4. **Em dia com as contas?** — números do mês: cadastrado no mês (por vencimento) · pago em dia · ficou em aberto · pago de outros meses · em atraso total (qualquer período) · próximos 30 dias; + barras cadastrado × pago (12 meses). Substitui a pizza "pago × a pagar", o card "Saúde financeira" e os banners de alerta.
5. **Estou dentro do planejado?** — metas × gasto por categoria (barras de progresso).
6. **O que já está comprometido?** — futuro: parcelas + não pagas com vencimento futuro, próximos meses.
7. **Quem gastou o quê** — com membros.
8. **Quanto perdi com atraso** — juros × descontos.
9. **Categorias** — detalhamento, no final, top 5 + "ver mais".

Sai: Cascata · banners de alerta (papel da central de notificações; totais vão para o bloco 4) · "Saúde financeira" · card de barras receitas × despesas · linha de resumo do cabeçalho.

### Filtros
- **Período**: seletor de mês como padrão + atalhos (trimestre, ano, intervalo). Abrir no mês atual: *pendente de confirmação*.
- **Membros**: multisseleção; **sempre aparece** (decisão).
- **Visão**: Esta conta / Panorama Geral.
- Forma de pagamento, cartão e categoria **não** são filtros: clicar na fatia leva à lista filtrada.
- Blocos que ignoram o período declaram isso no título ("últimos 12 meses", "hoje").

## Decisões de membros/permissões
1. O endpoint novo exige a permissão **Painel** (`acesso_painel`) e ela vale para todos os blocos — inclusive "quem gastou o quê" (hoje exige `acesso_relatorios`).
2. **Limite dos cartões**: quem tem "ver lançamentos da família" vê também os limites. No painel, `acesso_cartoes_familia` não é usado (continua valendo só para usar o cartão ao lançar).
3. **Orçamento**: só com a permissão de Planejamento (`acesso_planejamento`).
4. **Filtro Membros**: sempre visível.

Regra central preservada (`utils/familyVisibility.ts`): por padrão cada um vê só o que lançou; família só com conta pessoal + vínculo ativo + permissão (membro) + pedido explícito. Conta empresa nunca compartilha.

## Levantamento técnico

### Banco — tudo que o painel precisa já existe
`despesas`: data_pagamento, data_vencimento, data_compra, pago, valor_pago, valor_original, forma_pagamento, cartao_id, parcelado, parcela_atual, numero_parcelas, recorrente (fixa). Juros/descontos = valor_pago − valor_original.
`cartoes`: limite, dia_fechamento, dia_vencimento. `receitas`: data_recebimento, status (prevista/faturada/ativa/cancelada). `contas.aporte_inicial`. Metas de orçamento (valor fixo por categoria).
`despesas.mes` é base 0 e segue o mês do vencimento.

### APIs reaproveitáveis
`/cards/limites` (usado/limite/disponível) · `/budget/resumo` · `/account-members/summary` · `/despesas/parcelas-futuras` · `/contratos/faturamento` (mês base 1).

### Qualidade (banco LOCAL, cópia de 03/04 — repetir em produção)
- 466 despesas pagas: 4 sem data_pagamento.
- Mudança de mês com regime de caixa: crédito 26/289, pix 23/129 (~10%). 41 não pagas saem do "Saiu".
- Receitas: 53, todas `ativa` (previsto × recebido não se aplica a PF).

### Divergências encontradas
- Permissão Painel só é checada no frontend (`/financial/panorama` não confere).
- Resumo por membro exige Relatórios, não Painel.
- `/budget/resumo` não confere Planejamento na leitura.
- Cartões: gasto segue permissão de lançamentos, limite segue permissão de cartões.
- Filtro Membros com uma opção só para membro sem permissão.
- Estoque baixo usa filtro de conta diferente dos demais.
- Categorias repetem o filtro de conta à mão.
- `THIS_YEAR`/`THIS_MONTH` congelados no carregamento do módulo; ano de referência calculado de dois jeitos; mês base 0 × base 1 misturados; `primeiraData`/`ultimaData` mortos.
- **Panorama Geral** (`/account-members/overview`) e as demais telas (Movimentações, Relatórios) usam o mês do vencimento — mesma regra decidida para o painel novo, sem divergência.

### Conta empresa — o que o endpoint novo precisa respeitar
- "Entrou" = só receitas `ativa`, por data_recebimento. Obs.: `PUT /receitas/:id/receber` mantém a data prevista quando nenhuma data é informada.
- Orçamento não existe em conta empresa (bloco some).
- "Quem gastou o quê" e escopo família não existem em conta empresa.
- Visibilidade: em conta empresa **o dono também vê só os próprios lançamentos** (confirmar se é intencional).
- Manter até a rodada de conta empresa: Carteira de contratos, Receitas por origem, Estoque baixo.
- Previsto × recebido de receitas se aplica a conta empresa (prevista/faturada) — rodada própria.

## Decisões complementares (2026-09-27)
1. **Cards do topo** confirmados: Entrou · Saiu (com "pago / a pagar") · Resultado · Comprometimento · Saldo acumulado.
2. **"↑ vs mês anterior"** entra nos cards.
3. **Período**: o painel abre e trabalha **por mês** (confirmar se atalhos de trimestre/ano/intervalo saem).
4. **Receitas por origem**: em conta pessoal = **de qual membro veio a receita** (some sem membros); em conta empresa continua contratos × avulsas.
5. **Conta empresa**: o **dono vê todos os lançamentos** da conta (inclusive dos colaboradores) — diferente da conta pessoal. Muda a regra central de visibilidade (`resolveByScope`), que vale para todas as telas. Colaboradores: confirmar se continuam vendo só os próprios.
6. Checagens em produção autorizadas pelo usuário; a execução pelo agente foi bloqueada pela regra automática de permissões do Claude Code — rodar manualmente (script `diag-prod.mts`, somente leitura) ou liberar a permissão.

7. **Período**: só o seletor de mês — atalhos de trimestre/ano/intervalo saem.
8. **Conta empresa — colaboradores**: veem os próprios lançamentos; com permissão de visualizar os de outros membros, veem os dos demais (a permissão de "ver lançamentos de outros" passa a valer também em conta empresa, hoje ela é só de conta pessoal).

9. **Panorama Geral**: deixa de ser uma visão separada e vira um bloco do painel, "Todas as suas contas" (entrou × saiu × resultado por conta + total). É controlado por um checkbox **"Todas as contas"** num grupo "Contas" do filtro já existente (`ui/MultiFilterPanel.tsx` — mesmo padrão de grupos + checkboxes usado hoje em Membros; novos grupos entram na mesma estrutura). Desmarcado por padrão; **quando marcado, o bloco aparece no topo do painel** (acima dos cards), e o restante continua sendo da conta ativa. O grupo **aparece sempre**; para quem não tem a permissão `acesso_panorama_geral`, a opção fica desabilitada com a explicação "sem permissão" (confirmado). A opção "Visão" sai; `PanoramaGeralView` é removido.

### Filtros (atualizado)
- **Período**: seletor de mês (fora do filtro de checkbox).
- **Filtro de checkbox** (`MultiFilterPanel`), grupos sempre visíveis: **Membros** (uma opção por pessoa) · **Contas** ("Todas as contas").
10. **API**: endpoint novo `/financial/painel`; o `/financial/panorama` é excluído (usuário: ninguém usa). Como o painel atual depende dele, a exclusão vai **na mesma entrega** do painel novo — backend novo + frontend novo + remoções numa branch só, com um único merge, para não haver janela com o painel quebrado.

## Pendências
- Resultado das checagens em produção (usuário roda manualmente ou libera a permissão).
- Despesas pagas sem `data_pagamento` (4 no banco local): afetam só o "pago de outros meses"; tratar como pagas no próprio vencimento na leitura.
