# Task: Redesign estrutural do modal de contrato

## Contexto

O modal de contrato (`ContratoModal`, `ContratoForm`, `CatalogoServicoRow` e sub-`Dialog` de discriminação de serviços, todos em `src/screens/config/ClienteDetail.tsx`) passou recentemente por um redesign visual que alinhou sua aparência ao design system de `src/ui/dialogFormTokens.tsx` (mesmo padrão de `IncomeDialog`/`ExpenseDialog`), preservando a estrutura funcional anterior. Esse redesign está em produção (mergeado em `main`).

Esta task é uma segunda rodada de ajustes sobre esse mesmo modal, desta vez incluindo mudanças estruturais mais profundas: a tabela de "Valores" deixa de ser 4 linhas fixas com lógica hardcoded e passa a ser uma lista de itens editável (adicionar/remover linhas), o campo Representante perde a criação inline, Reajuste/Representante mudam de chips para `<select>`, o footer do modal passa a ser fixo (não rola junto com o conteúdo), e o botão de "Discriminação de prestação de serviço" muda de posição.

Arquivos já verificados e relevantes:

- `src/screens/config/ClienteDetail.tsx` — contém `ContratoForm`, `CatalogoServicoRow`, `ContratoAnexos`, `ContratoModal`, `AditivoModal`, `ClienteDetail` (componente pai que renderiza os modais e as mutations que os alimentam).
- `src/ui/dialog.tsx` — componente `Dialog` compartilhado; já suporta `scrollBody={false}` (usado hoje no sub-modal de serviços) para o padrão de header/footer fixos com área central rolável — é o mecanismo a reaproveitar para o footer fixo do `ContratoModal` principal.
- `src/ui/dialogFormTokens.tsx` — tokens de estilo compartilhados, incluindo os tokens novos adicionados no redesign anterior (`valuesTableCardStyle`, `valuesRowStyle`, `chipRowStyle`, etc.).
- `src/services/clientesService.ts` — tipos e chamadas de API: `Contrato` (campos `valor_mensal`, `implantacao_parcelas`, `implantacao_valor_parcela`, `horas_presenciais_valor`, `horas_presenciais_saldo_ini`, `horas_presenciais_saldo_atual`, `horas_remotas_*` equivalentes), `ServicoContrato` (tabela relacional `contratos_servicos`, já com `contrato_id` FK — precedente arquitetural para a nova lista de itens), `saveContrato`, `AditivoContratoValues`.
- `backend/src/routes/contracts.ts` — rotas de contrato em SQL raw (`pool.query`, não Drizzle — padrão pré-existente neste arquivo específico, não introduzido por esta task). Contém `gerarPrevistas` (gera receitas previstas a partir da soma de `contratos_servicos` com `faturando = true`, **não** a partir de `valor_mensal` do contrato diretamente) e a rota de receita de implantação (usa `implantacao_parcelas ?? 1` e `implantacao_valor_parcela` para calcular o valor total da implantação).
- Plano anterior `valor-total-contrato-derivado.md` (2026-07-05) mostra que o total do contrato já foi, em algum momento, derivado de um período em meses calculado a partir de `data_assinatura`/`vencimento` — isso não existe mais no código atual (o cálculo hoje é fixo em `* 12`), confirmando que essa abordagem foi substituída.

## Problema

A tabela de "Valores" do modal hoje representa 4 campos fixos e nomeados do contrato (`valor_mensal`, par de campos de implantação, dois pares de campos de horas), cada um com sua própria fórmula de cálculo (mensalidade × 12, implantação total ÷ parcelas, horas × saldo inicial). Isso não permite ao usuário representar contratos com itens adicionais (ex.: módulos de sistema, como em uma proposta comercial real), nem remover uma linha que não se aplica àquele contrato específico — ele só pode zerar o valor.

Separadamente, os campos de Reajuste e Representante ocupam espaço horizontal em formato de chips lado a lado, e Observações fica abaixo deles — layout que não aproveita bem o espaço vertical do modal. O Representante ainda carrega um atalho de criação inline ("+ novo") que adiciona complexidade ao componente sem necessidade clara, já que a criação de representantes tem seu próprio fluxo em Configurações.

Por fim, o footer do modal (resumo financeiro + ações de Salvar/Cancelar/Encerrar/Aditivo) rola junto com o conteúdo do modal, obrigando o usuário a rolar até o fim para acessar a ação principal em contratos com muito conteúdo — mesmo problema que o sub-modal de serviços já resolveu usando `scrollBody={false}` do `Dialog`.

## Objetivo

Reestruturar a tabela de "Valores" do `ContratoModal` para funcionar como uma lista de itens (linhas estruturais + linhas livres adicionadas pelo usuário, todas editáveis e removíveis), simplificar os controles de Reajuste/Representante para `<select>` empilhados com Observações ao lado, fixar o footer do modal, e reposicionar o botão de discriminação de serviços para maior destaque junto ao total "Faturando".

## Decisão Técnica Desejada

Decisões já definidas pelo usuário durante a análise:

- **Todas as linhas da tabela de Valores são removíveis**, inclusive as que hoje correspondem a Mensalidade, Implantação, Hora presencial e Hora remoto — não há distinção entre "linhas fixas sem remover" e "linhas livres". Isso implica tratar a tabela de Valores como uma lista genérica de itens, não mais como 4 campos fixos do `Contrato`. A skill `planejar` deve avaliar se isso significa migrar para uma tabela relacional nova (padrão análogo a `contratos_servicos`) ou se pode ser representado de outra forma compatível com o schema atual — ver "Requisitos de Banco de Dados".
- Cada item da tabela tem: Descrição (com subtítulo opcional, ex. "recorrente"/"taxa única"/"banco de horas"), Und (unidade — **texto livre**, não lista fixa de opções), Qtde, Valor unitário, e um "Calculado" (resultado da fórmula daquele item).
- **A fórmula de cálculo é sempre `valor_unitario × quantidade = calculado`, sem exceção, para todas as linhas (fixas e livres).** Isso resolve a divergência que a Implantação tinha hoje (onde o usuário digitava um Total e o sistema derivava o valor por parcela, uma divisão): a partir desta mudança, o usuário passa a digitar o **valor da parcela** como "Valor unitário" e a **quantidade de parcelas** como "Qtde", e o "Calculado" exibido é o total (`valor_parcela × qtde_parcelas`) — o inverso do fluxo de preenchimento atual, mas consistente com Mensalidade (`valor_mensal × 12 meses`) e Horas (`valor_hora × horas`).
- Itens de banco de horas (equivalentes às atuais Hora presencial/Hora remoto) mostram, dentro da célula "Calculado", uma segunda linha menor com o saldo atual restante (ex. "R$ 3.800,00" em cima, "12,5h restantes" embaixo) — não uma coluna separada.
- A linha de totais fica dentro da própria tabela (não mais no footer do modal), sem a palavra "SUBTOTAL", mostrando três blocos lado a lado nesta ordem: **Total do contrato**, **Mensal**, **Faturando**.
- Reajuste e Representante mudam de chips para `<select>` HTML simples, empilhados um abaixo do outro (uma coluna), com Observações ocupando a coluna ao lado (lado a lado com o par Reajuste/Representante, não abaixo deles).
- Representante perde completamente a criação inline ("+ novo", `onCreateRepresentante`, `isCreatingRepresentante`, `showRepForm`) — criação de representantes continua existindo apenas na tela de Configurações.
- O footer do `ContratoModal` (ações: Encerrar, Registrar aditivo, Cancelar, Criar contrato/Salvar) fica fixo, usando o mesmo padrão de `scrollBody={false}` já usado no sub-modal de serviços — a área central (Dados do contrato + Valores + botão de serviços + Anexos) rola independentemente.
- O botão "Discriminação de prestação de serviço" muda de posição: sai de abaixo da tabela de Valores e vai para o canto direito da própria linha do título "Valores" (mesma linha da label + linha divisória), mantendo o badge de contagem de serviços vinculados.
- **"Discriminação de prestação de serviço" (sub-modal, `contratos_servicos`, catálogo de serviços) permanece exatamente como é hoje em termos de modelo de dados e comportamento** — cogitou-se fundir esse conceito com a nova lista de itens de Valores, mas essa ideia foi descartada explicitamente pelo usuário. Os dois continuam sendo estruturas de dados distintas e paralelas: "Valores" é a composição interna de cálculo do contrato; "Discriminação de serviços" é o vínculo com o catálogo de serviços que alimenta `gerarPrevistas`/receitas/relatórios (`porOrigem: contrato/avulsa` em `financial.ts`). Esta task não deve alterar `contratos_servicos`, `CatalogoServicoRow` ou a lógica de `gerarPrevistas` além do já necessário para a Implantação (ver "Requisitos de Backend").

## Escopo Funcional

### Dentro do escopo

- Reestruturar a tabela de Valores do `ContratoModal` para lista de itens editável: adicionar item, remover item (qualquer um, incluindo os que hoje são Mensalidade/Implantação/Horas), editar Descrição/Und/Qtde/Valor unitário por item.
- Preservar a lógica de cálculo específica de cada tipo de item existente hoje (mensalidade recorrente × meses, implantação total ÷ parcelas, horas × saldo com exibição de saldo atual) — a generalização da estrutura de dados não deve descartar essas fórmulas, apenas deixar de fixá-las como 4 campos nomeados obrigatórios.
- Migrar o cálculo de "Total do contrato" para somar o "Calculado" de todos os itens da lista.
- Mover a linha de totais (Total do contrato / Mensal / Faturando) para dentro da tabela, sem "SUBTOTAL".
- Trocar Reajuste e Representante de chips para `<select>`, reorganizar layout (Reajuste + Representante empilhados em uma coluna, Observações na coluna ao lado).
- Remover fluxo de criação inline de Representante do modal de contrato (função, estado e UI relacionados).
- Fixar o footer de ações do `ContratoModal` usando o padrão `scrollBody={false}` do `Dialog`.
- Reposicionar o botão "Discriminação de prestação de serviço" para o canto direito da linha do título "Valores".
- Preservar toda a lógica de modo leitura/edição (`isEditing`), guias de onboarding (`useFirstAccessGuide`), mutations existentes (`vincularMut`, `atualizarServicoMut`, `desvincularMut`) e o fluxo de aditivo/encerramento.

### Fora do escopo inicial

- Remoção do campo `data_assinatura` — tratada em task separada (`Remover campo data de assinatura do contrato`), pois envolve banco/migration e tem impacto próprio a investigar.
- Alterações no filtro de período do dashboard (`DashboardPeriodFilter.tsx`) — tratada em task separada.
- Mudança na regra de geração de receitas previstas (`gerarPrevistas`) além do necessário para a tabela continuar alimentando esse fluxo corretamente — a soma usada por `gerarPrevistas` vem de `contratos_servicos`, não da tabela de Valores; não deve ser confundida nem unificada nesta task sem decisão explícita.
- Alteração da tela de Configurações onde representantes são criados — permanece como está.
- Redesign do `AditivoModal` além do necessário para manter compatibilidade com a nova estrutura de itens (se o aditivo copiar valores do contrato anterior, precisa copiar a nova lista de itens; ver "Requisitos de Migração ou Compatibilidade").

## Requisitos de Frontend

- Redesenhar a tabela de Valores em `ContratoModal` como lista de itens com controles de adicionar (botão dashed "+ Adicionar item" abaixo da última linha) e remover (ícone `⊗` por linha, alinhado à célula "Calculado").
- Cada linha de item precisa de inputs para Descrição, Und (texto livre), Qtde, Valor unitário — todos editáveis quando `isEditing`, todos somente leitura quando não.
- Itens de banco de horas precisam continuar expondo saldo inicial (editável) e saldo atual (somente leitura, vindo do backend) — decidir durante o planejamento como esses dois conceitos (Qtde genérica da lista vs. saldo inicial/atual específico de horas) coexistem sem perder informação.
- Substituir chips de Reajuste/Representante por `<select>` nativo, reaproveitando `fieldInputStyle`/`labelStyle` de `dialogFormTokens.tsx`.
- Remover código de criação inline de representante em `ContratoForm` (estado `showRepForm`, prop `onCreateRepresentante`, prop `isCreatingRepresentante`, e a mutation `criarRepresentanteMut` em `ContratoModal` se não for usada em outro lugar).
- Ajustar `Dialog` do `ContratoModal` para `scrollBody={false}` e reestruturar o JSX interno em área rolável + footer fixo, seguindo o padrão já usado no sub-modal de serviços dentro do mesmo arquivo.
- Mover o botão de "Discriminação de prestação de serviço" para a linha do título "Valores".
- Preservar todos os pontos de ancoragem de `FirstAccessGuideCard` que hoje dependem de posições específicas (reajuste, representante, implantação, horas, serviços, encerrar) — reposicionar conforme o novo layout, sem removê-los.

## Requisitos de Backend

A generalização da tabela de Valores para lista de itens editável provavelmente exige mudança de schema (ver "Requisitos de Banco de Dados") e, portanto, mudança nas rotas de `backend/src/routes/contracts.ts`:

- Novos endpoints (ou extensão dos existentes) para CRUD de itens do contrato, análogos aos já existentes para `contratos_servicos` (`vincularServico`, `atualizarServicoContrato`, `desvincularServico` no frontend, rotas correspondentes no backend).
- `gerarPrevistas` (não depende de Implantação, já usa `contratos_servicos` — sem impacto direto desta mudança) e a rota de receita de implantação (`criarReceitaImplantacao`) precisam continuar funcionando corretamente após a mudança. `criarReceitaImplantacao` hoje calcula `valorTotal = parcelas * valorParcela` a partir de `implantacao_parcelas`/`implantacao_valor_parcela` como colunas diretas do contrato (ver `backend/src/routes/contracts.ts`, linhas ~653-655) — com a fórmula genérica `valor_unitario × quantidade` adotada para a linha de Implantação (valor da parcela × qtde de parcelas), essa rota já calcula exatamente essa mesma multiplicação, então a lógica de cálculo em si não muda; o que muda é de onde `parcelas`/`valorParcela` são lidos (colunas diretas do contrato hoje vs. o item "Implantação" da nova tabela de itens).
- Seguir o padrão de multi-tenant do projeto: toda query nova deve filtrar por `usuario_id` (e `perfil_id` quando aplicável, seguindo o padrão de `profileWhere` já usado em `contracts.ts`).

## Requisitos de Banco de Dados

Provável necessidade de nova tabela relacional para os itens de valores do contrato (nome sugerido a definir no planejamento, ex. `contratos_itens` ou `contrato_valores`), similar em espírito a `contratos_servicos`: `id`, `contrato_id` (FK), `descricao`, `unidade`, `quantidade`, `valor_unitario`, `tipo` (para diferenciar itens especiais como banco de horas, que precisam de `saldo_atual`, dos itens genéricos), `usuario_id`.

Isso é uma migration de schema real, não apenas um ajuste visual. **Migrations não devem ser executadas sem confirmação explícita do usuário a cada vez** — o ambiente atual pode estar apontando para produção. A skill `planejar` deve dimensionar a migration necessária, incluindo:

- Como migrar dados de contratos já existentes (que hoje têm `valor_mensal`, `implantacao_*`, `horas_*` como colunas diretas) para a nova tabela de itens, sem perda de dado.
- Se as colunas antigas (`valor_mensal`, `implantacao_parcelas`, `implantacao_valor_parcela`, `horas_presenciais_*`, `horas_remotas_*`) são removidas da tabela `contratos` após a migração de dados, ou mantidas por um período de transição.

## Requisitos de Segurança e Multi-Tenant

Projeto não é multi-tenant no sentido de múltiplas organizações isoladas (é uso pessoal do usuário, com o conceito de "perfil" — pessoal/PJ — já presente no schema via `perfil_id`). Toda query nova (CRUD de itens do contrato) deve seguir o padrão já existente de filtrar por `usuario_id` e respeitar `perfil_id` quando aplicável, conforme `profileWhere` em `contracts.ts`. Nenhuma mudança de permissão/autorização é esperada além disso.

## Requisitos de Migração ou Compatibilidade

- Contratos já existentes em produção têm dados nas colunas atuais (`valor_mensal`, `implantacao_*`, `horas_*`) — a migration de schema precisa converter esses dados em itens da nova tabela sem perda, preservando os cálculos e saldos de horas já em uso (incluindo `horas_presenciais_saldo_atual`/`horas_remotas_saldo_atual`, que refletem consumo real já ocorrido).
- `AditivoModal` hoje "copia valores, horas e serviços vinculados" ao criar um novo contrato a partir de um encerrado (mensagem já existente no componente) — esse comportamento de cópia precisa ser adaptado para copiar a nova lista de itens.
- Nomenclatura nova de código (endpoints, tabela, tipos TypeScript) deve seguir inglês; nomes em português já existentes no projeto (`contrato`, `valor_mensal`, etc.) são tratados como legado.

## Requisitos de Testes

### Frontend

- Testar manualmente (via `/run`): criar contrato novo com itens variados (incluindo remover uma das linhas que hoje são fixas, ex. remover Implantação inteira), editar contrato existente, adicionar item livre, remover item livre, verificar que "Total do contrato"/"Mensal"/"Faturando" recalculam corretamente.
- Verificar que banco de horas (saldo inicial/atual) continua exibindo e calculando corretamente dentro do novo formato de item.
- Verificar `<select>` de Reajuste e Representante funcionam sem o atalho de criação inline.
- Verificar footer fixo não rola junto com o conteúdo, mesmo com muitos itens na tabela.
- Verificar posição nova do botão de Discriminação de serviços.

### Backend

- Testar `gerarPrevistas` e `criarReceitaImplantacao` continuam funcionando após a mudança de onde vêm `implantacao_parcelas`/`implantacao_valor_parcela`.
- Testar CRUD de itens do contrato (criar, editar, remover) filtra corretamente por `usuario_id`.

### E2E

Não aplicável — sem infraestrutura de E2E no projeto.

## Arquivos Provavelmente Afetados

### Frontend

- `src/screens/config/ClienteDetail.tsx` (`ContratoModal`, `ContratoForm`, possivelmente `AditivoModal` para a lógica de cópia de itens)
- `src/services/clientesService.ts` (tipos `Contrato`, novo tipo para item de contrato, novas funções de API)
- `src/ui/dialogFormTokens.tsx` (possíveis tokens novos para linha de item com botão remover — avaliar se os tokens já adicionados no redesign anterior, como `valuesRowStyle`, `valuesInlineFieldStyle`, são suficientes ou precisam de extensão)

### Backend

- `backend/src/routes/contracts.ts` (rotas de contrato, `gerarPrevistas`, receita de implantação)
- Novo arquivo de rota para CRUD de itens do contrato — a identificar durante o planejamento, seguindo o padrão de nomenclatura já usado (ex. `backend/src/routes/contract-items.ts`, análogo a como `contratos_servicos` é tratado)

### Banco de Dados

- Nova tabela para itens do contrato — a definir durante o planejamento (migration necessária).
- Possível alteração/remoção de colunas em `contratos` (`valor_mensal`, `implantacao_parcelas`, `implantacao_valor_parcela`, `horas_presenciais_*`, `horas_remotas_*`) — a confirmar durante o planejamento se é removido ou mantido por transição.

## Critérios de Aceite

- Usuário consegue adicionar uma linha de item livre na tabela de Valores, com Descrição/Und/Qtde/Valor unitário editáveis.
- Usuário consegue remover qualquer linha da tabela, incluindo as que hoje correspondem a Mensalidade/Implantação/Hora presencial/Hora remoto.
- Linhas de banco de horas exibem saldo atual restante dentro da célula "Calculado", sem coluna dedicada.
- Linha de totais aparece dentro da tabela (Total do contrato / Mensal / Faturando), sem "SUBTOTAL", e os três valores continuam matematicamente corretos.
- Reajuste e Representante são `<select>`, empilhados, sem atalho de criação inline; Observações fica ao lado.
- Footer do modal (ações) permanece visível sem scroll, mesmo com conteúdo extenso.
- Botão de Discriminação de serviços aparece na linha do título "Valores", canto direito.
- `gerarPrevistas` e a receita de implantação continuam gerando valores corretos para contratos criados após a mudança.
- Nenhuma migration é executada sem confirmação explícita do usuário.
- `npm run build` (frontend) e o build do backend concluem sem erros.

## Perguntas Para o Planejamento

- A nova tabela de itens ainda precisa de um campo `tipo` (enum: `mensalidade`/`implantacao`/`hora_presencial`/`hora_remoto`/`livre`) para diferenciar apenas os itens de banco de horas (que precisam de `saldo_inicial`/`saldo_atual`, únicos campos que fogem do par `valor_unitario`/`quantidade` genérico), já que a fórmula de cálculo em si passou a ser sempre `valor_unitario × quantidade` para todas as linhas, inclusive Implantação.
- Como o saldo de horas (`saldo_atual`) deve ser recalculado/preservado quando um item de hora é editado ou quando o contrato passa por aditivo?
- A migration deve rodar em uma janela específica, ou o usuário prefere revisar o SQL gerado antes de qualquer execução?
- Contratos com aditivo (`num_aditivo > 0`) devem ter suas listas de itens do contrato anterior sempre copiadas integralmente, ou o usuário quer poder editar a lista durante a criação do aditivo?
- Com a inversão do fluxo de preenchimento da Implantação (usuário agora digita valor da parcela, não mais o total), o rótulo "Total" que hoje aparece como referência auxiliar deixa de existir como campo de entrada — confirmar se isso é aceitável ou se o usuário quer manter uma exibição auxiliar do total ao lado do "Calculado" (que, com a nova fórmula, já É o total).

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `/AGENT.md` (raiz) e `sistema financas/AGENT.md` (regras específicas deste projeto — este projeto não é multi-tenant no sentido de organizações isoladas, apesar do texto genérico herdado no AGENT.md).
- Inspecione `src/screens/config/ClienteDetail.tsx`, `src/services/clientesService.ts`, `backend/src/routes/contracts.ts` e a estrutura de `contratos_servicos` (como precedente de tabela relacional) antes de escrever o plano.
- Classifique a implementação como `frontend + backend + database`.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations.
- Considere dividir a estratégia de implementação em fases pequenas e revisáveis (ex.: 1. migration + backend de itens, 2. frontend consumindo a nova estrutura, 3. remoção das colunas antigas), já que esta é uma mudança de schema não trivial.
- Gere um plano em `.plans/` com etapas pequenas, revisáveis e seguras para produção.
