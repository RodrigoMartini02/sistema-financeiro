# Plano de Implementação: Cobertura Completa de Guias de Primeiro Acesso

## Origem

- Arquivo de especificação: solicitação direta do usuário no chat (sem `.md` de feature associado), a partir de levantamento feito por agente de exploração cobrindo todas as telas de `src/screens/`
- Data do planejamento: 2026-08-04
- Classificação: `frontend-only`

## Resumo

Expandir a cobertura de guias de primeiro acesso (`useFirstAccessGuide` + `FirstAccessGuideCard` + `firstAccessGuideMessages`) para praticamente todo o sistema, cobrindo não só "clique em Novo X" mas também campos não óbvios, vínculos entre entidades, comportamentos automáticos/implícitos e distinções sutis (ex: desativar vs excluir, recorrente vs parcelado, IGPM/IPCA informativo). Também corrige 2 guias "órfãos" já preparados (hook chamado) mas nunca renderizados (`FirstAccessGuideCard` ausente).

## Escopo

### Dentro do escopo — por tela

**Correções de guias órfãos:**
- `src/screens/reservas/ReservasScreen.tsx`: renderizar `FirstAccessGuideCard` para `moveGuide` (`reservas:movimentar-v1`, já instanciado) ancorado no botão "Movimentar" do primeiro `ReservaCard` da lista.
- `src/screens/config/ServicosTab.tsx`: renderizar `FirstAccessGuideCard` para `createGuide` (`servicos:novo-v1`, já instanciado) perto do botão "Novo serviço".

**Despesas** (`src/screens/despesas/DespesasScreen.tsx`, `src/screens/finance/ExpenseDialog.tsx`, `src/screens/finance/PaymentModal.tsx`, `src/screens/finance/BatchPaymentModal.tsx`):
- Botão "Fechar mês"/"Reabrir mês" — explica que trava lançamentos do período.
- Seleção em lote + botão "Pagar selecionadas".
- Botão "Mover para próximo mês" (ícone `ArrowRight`).
- Toggles "Já pago"/"Recorrente"/"Parcelado" no `ExpenseDialog` (mutuamente exclusivos).
- Botão "Adicionar ao lote" no `ExpenseDialog`.
- Chip de "Categoria sugerida" (comportamento automático a partir de histórico/descrição).
- Aviso de "Possível duplicata detectada".
- `BatchPaymentModal`: abas "Valor original"/"Valor personalizado".

**Receitas** (`src/screens/receitas/ReceitasScreen.tsx`, `src/screens/finance/IncomeDialog.tsx`):
- Seção "Contratos — Faturamento" (fluxo Faturar → Recebido).
- Seção colapsável "Horas a faturar" (cálculo automático a partir do valor/hora do contrato).
- Seção colapsável "Replicar até" (duplicação automática da receita em meses futuros).
- Seletor de Representante + preview de comissão automática.

**Reservas** (`src/screens/reservas/ReservaDialog.tsx`):
- Abas "Configurações"/"Movimentar" (Movimentar só aparece após a reserva já existir).
- Cálculo automático de contribuição mensal sugerida (a partir de meta + prazo).

**Categorias** (`src/screens/config/CategoriasTab.tsx`):
- Campo "Vincular a uma categoria principal" dentro do `CategoriaDialog" — o vínculo central pai/filho pedido explicitamente pelo usuário.
- Distinção Desativar vs exclusão (não existe exclusão de categoria no sistema).

**Cartões** (`src/screens/config/CartaoTab.tsx`) — sem nenhum guia hoje:
- Botão "Novo cartão".
- Campos "Dia de fechamento"/"Dia de vencimento" (agrupamento de despesas por fatura — comportamento não visível na tela).
- Campo "Validade" (informativo, sem efeito em lançamentos).
- Campo "Limite (R$)" (esclarecer se é informativo ou bloqueante).

**Perfis** (`src/screens/config/PerfisTab.tsx`):
- Seletor de "Enquadramento" — reforço de que cria categorias automaticamente ao salvar (decisão de impacto, ação não reversível facilmente).

**Usuários** (`src/screens/config/UsuariosTab.tsx`):
- Distinção Desativar (reversível, bloqueia login) vs Excluir (permanente, só master).

**Clientes/Contratos** (`src/screens/config/ClientesTab.tsx`, `src/screens/config/ClienteDetail.tsx`) — maior bloco, sem nenhum guia hoje:
- Botão "Novo cliente".
- Botão "Gerar previstas" (ícone `RefreshCw`) — gera receitas futuras a partir da data de início de faturamento.
- Campo "Reajuste" (NADA CONSTA/IGPM/IPCA) — hoje é apenas informativo, não aplicado automaticamente.
- Campo "Representante" no formulário de contrato — vínculo que gera comissão automática ao lançar receitas desse contrato.
- Bloco de vínculo Serviços↔Contrato (`CatalogoServicoRow`): checkboxes "Contratado", "Implantado", "Faturando".
- Bloco "Implantação" (Total/Nº de parcelas/Valor por parcela) — gera receita de implantação automaticamente ao salvar contrato novo.
- Blocos "Hora Presencial"/"Hora Remoto" (valor/hora + saldo) — saldo é consumido automaticamente no `IncomeDialog` ao lançar "Horas a faturar".
- Botão "Encerrar contrato".

**Representantes** (`src/screens/config/RepresentantesTab.tsx`) — sem nenhum guia hoje:
- Botão "Novo representante".
- Seção "Comissões por tipo de receita" — gera comissão automática quando uma receita desse tipo é lançada com este representante.
- Toggle "Mensal" vs "Única" dentro de `ComissaoRow`.

**Sócios** (`src/screens/config/SociosTab.tsx`):
- Botão "Novo sócio" + esclarecimento do propósito da entidade (cadastro de referência, não vinculado a lançamentos).

**Planos** (`src/screens/planos/PlanosScreen.tsx`) — sem nenhum guia hoje:
- Abas "PIX/Cartão/Recorrente" no `PagamentoDialog`.

**Meses** (`src/screens/meses/MesesScreen.tsx`) — sem nenhum guia hoje:
- Botão "Fechar"/"Reabrir" em cada card de mês.

**Painel** (`src/screens/finance/FinanceDashboard.tsx`):
- Card KPI "Comprometimento" — explicar os limiares de cor (70%/90%).

### Fora do escopo

- Gap funcional do campo `tipo_despesa` (OPEX/CAPEX) sem seletor visível no `ExpenseDialog` — é mudança de formulário/funcionalidade, não de guia. Registrado como pergunta em aberto, não implementado aqui.
- `src/screens/config/AcessosTab.tsx` (tela admin/interna, já com aviso estático suficiente para sua única "pegadinha").
- Alterações de backend, schema, endpoints ou migrations.
- Campos/botões já cobertos por `hint` inline: "Valor-alvo (R$)", "Prazo da meta", "Participação (%)", "CPF do titular", toggle Depósito/Retirada em Reservas, "Valor mensal padrão" em Serviços, campo Categoria no ExpenseDialog.
- Banners estáticos já existentes que já cumprem o papel de guia: aviso de Sócios sobre soma 100%, aviso de Serviços reutilizáveis, aviso de Perfis sobre separação de dados, aviso do `CancelarDialog` de Planos.

## Leitura de contexto

- `/AGENT.md`
- `sistema financas/AGENT.md`
- `src/hooks/useFirstAccessGuide.ts`
- `src/components/FirstAccessGuideCard.tsx`
- `src/components/firstAccessGuideMessages.ts`
- Levantamento completo feito por agente Explore, lendo integralmente: `DespesasScreen.tsx`, `ExpenseDialog.tsx`, `PaymentModal.tsx`, `BatchPaymentModal.tsx`, `ReceitasScreen.tsx`, `IncomeDialog.tsx`, `ReservasScreen.tsx`, `ReservaDialog.tsx`, `RelatoriosScreen.tsx`, `CategoriasTab.tsx`, `CartaoTab.tsx`, `PerfisTab.tsx`, `UsuariosTab.tsx`, `ClientesTab.tsx`, `ClienteDetail.tsx`, `RepresentantesTab.tsx`, `SociosTab.tsx`, `ServicosTab.tsx`, `AcessosTab.tsx`, `MinhaContaTab.tsx`, `PlanosScreen.tsx`, `MesesScreen.tsx`, `FinanceDashboard.tsx`

## Impacto por área

### Frontend

- Expansão de `src/components/firstAccessGuideMessages.ts` com aproximadamente 30 novas chaves (uma por oportunidade aprovada acima), seguindo o tom curto e direto já usado nas mensagens existentes.
- Em cada arquivo listado acima: import de `useFirstAccessGuide`/`FirstAccessGuideCard` quando ainda não importado, instanciação do(s) hook(s) com `scope` único e descritivo por ação (padrão `<area>:<acao>-v1`), e renderização do card ancorado ao elemento correto — seguindo o padrão visual já validado (`floating`, `placement="top"`, wrapper `relative` no elemento pai, `className="absolute right-0 top-full z-50 mt-3 w-[min(...,calc(100vw-2rem))]"`).
- Correção dos 2 guias órfãos identificados (Reservas, Serviços).

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/components/firstAccessGuideMessages.ts`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/finance/ExpenseDialog.tsx`
- `src/screens/finance/PaymentModal.tsx`
- `src/screens/finance/BatchPaymentModal.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`
- `src/screens/finance/IncomeDialog.tsx`
- `src/screens/reservas/ReservasScreen.tsx`
- `src/screens/reservas/ReservaDialog.tsx`
- `src/screens/config/CategoriasTab.tsx`
- `src/screens/config/CartaoTab.tsx`
- `src/screens/config/PerfisTab.tsx`
- `src/screens/config/UsuariosTab.tsx`
- `src/screens/config/ClientesTab.tsx`
- `src/screens/config/ClienteDetail.tsx`
- `src/screens/config/RepresentantesTab.tsx`
- `src/screens/config/SociosTab.tsx`
- `src/screens/config/ServicosTab.tsx`
- `src/screens/planos/PlanosScreen.tsx`
- `src/screens/meses/MesesScreen.tsx`
- `src/screens/finance/FinanceDashboard.tsx`

## Estratégia de implementação

1. Adicionar todas as novas chaves em `firstAccessGuideMessages.ts` de uma vez, com mensagens curtas e tom consistente com as existentes.
2. Corrigir os 2 guias órfãos primeiro (Reservas, Serviços) — menor risco, hook já instanciado.
3. Percorrer tela por tela na ordem listada no escopo, conectando hook + card em cada ponto identificado, reaproveitando exatamente o padrão visual/posicional já estabelecido em Categorias/Despesas/Receitas.
4. Para pontos que já têm `hint` inline cobrindo a mesma informação, não duplicar com guia (respeitar a lista de "fora do escopo").
5. Rodar `npm run build` ao final e revisar o diff por tela.

## Regras de negócio identificadas

- Guias continuam com dismiss independente por `scope`, persistido em localStorage por perfil ativo — comportamento herdado do hook existente, sem alteração.
- Nenhum guia deve aparecer sobreposto a um `hint` ou banner estático já existente cobrindo a mesma informação.
- Cada novo `scope` deve ser único e seguir o padrão `<area>:<acao>-v1` já usado (ex.: `cartoes:fechamento-v1`, `clientes:reajuste-v1`).

## Regras multi-tenant e segurança

Não aplicável — sistema pessoal (`sistema financas`) sem arquitetura multi-tenant. Mudança puramente visual/UX no frontend, sem novos endpoints, sem dados sensíveis expostos.

## Validações necessárias

Nenhuma validação de formulário nova — mudança é apenas de UX informativa (guias dispensáveis, sem alterar regras de submit).

## Testes necessários

### Frontend

- Para cada tela alterada, verificar visualmente que o guia aparece no primeiro acesso (sem dismiss registrado), é dispensável via botão X, e não reaparece após o dismiss (recarregar a página).
- Confirmar que nenhum guia novo quebra o layout existente (sobreposição de outros elementos, overflow horizontal, corte de texto).
- Confirmar que os 2 guias órfãos corrigidos (Reservas, Serviços) realmente aparecem agora.
- Rodar build TypeScript para garantir que nenhum import/prop ficou inconsistente.

### Backend

Sem impacto esperado.

### E2E

Não aplicável — sem suíte E2E identificada no projeto.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
```

## Riscos e pontos de atenção

- Escopo grande: cerca de 20 arquivos tocados e 30 guias novos em uma única implementação — maior risco de inconsistência visual ou erro de digitação em algum `scope`/mensagem. Mitigação: seguir rigorosamente o padrão já validado em Categorias/Despesas/Receitas, revisando cada arquivo antes de passar para o próximo.
- `ClienteDetail.tsx` é o arquivo mais complexo do levantamento (mais vínculos concentrados) — maior chance de precisar ajuste fino de posicionamento dos guias dentro do modal de contrato.
- Risco de "fadiga de guia": com muitos cards novos, uma tela pode ficar visualmente poluída se vários guias aparecerem simultaneamente no primeiro acesso (ex.: `ClienteDetail` com contrato aberto pela primeira vez). Isso não será resolvido neste plano (não há mecanismo de "mostrar guias em sequência" hoje) — fica registrado como observação para eventual melhoria futura, fora deste escopo.

## Perguntas em aberto

- O gap funcional do campo `tipo_despesa` (OPEX/CAPEX sem seletor de UI no `ExpenseDialog`, sempre enviado como `'opex'` fixo) foi identificado durante o levantamento mas está fora deste escopo — confirmar com o usuário se deve virar um plano separado no futuro.

## Critérios de aceite do plano

- Todos os pontos listados no escopo têm guia conectado (hook instanciado + `FirstAccessGuideCard` renderizado) com mensagem específica e não genérica, adicionada em `firstAccessGuideMessages.ts`.
- Os 2 guias órfãos (Reservas `moveGuide`, Serviços `createGuide`) passam a renderizar corretamente.
- Nenhum guia novo duplica um `hint` inline ou banner estático já existente.
- Build do frontend (`npm --prefix "sistema financas" run build`) passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Escopo grande: considerar organizar a implementação internamente por área/tela para facilitar revisão do diff, mesmo sendo um único plano/commit lógico.
- Seguir exatamente o padrão visual/posicional já usado (`FirstAccessGuideCard` com `floating`, `placement="top"`, wrapper `relative`, classes de largura `w-[min(...,calc(100vw-2rem))]`).
- Não implementar o gap funcional do `tipo_despesa` — está fora do escopo deste plano.
- Não alterar backend, schema, migrations ou `.env`.
- Manter mensagens novas com o mesmo tom direto e curto das existentes em `firstAccessGuideMessages.ts`.
