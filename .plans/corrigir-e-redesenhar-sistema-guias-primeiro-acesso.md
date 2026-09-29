# Plano de Implementação: Corrigir e Redesenhar Sistema de Guias de Primeiro Acesso

## Origem

- Arquivo de especificação: `.portal/tasks/corrigir-e-redesenhar-sistema-guias-primeiro-acesso.md`
- Data do planejamento: `2026-08-05`
- Classificação: `frontend-only`

## Resumo

O sistema de guias de primeiro acesso (`useFirstAccessGuide` + `FirstAccessGuideCard` + `firstAccessGuideMessages`) tem 49 usos ativos espalhados em ~20 telas. Um plano anterior (`correcao-posicionamento-baloes-guia.md`, 2026-08-04) já havia diagnosticado 12 casos concretos de bugs de posicionamento/negrito, mas a reinvestigação feita nesta sessão confirmou que **apenas 1 dos 12 foi corrigido** (o bug original relatado, em `ReservasScreen.tsx`). Este plano retoma e conclui essa correção, adiciona uma escala de z-index consistente, e introduz um mecanismo de coordenação entre guias com uma trilha de prioridade por módulo — resolvendo os 5 problemas relatados pelo usuário: negrito inconsistente, balões cobertos por outros elementos, balões competindo entre si, balões fora da tela, e ausência de ordem lógica de exibição.

## Escopo

### Dentro do escopo

**Fase 1 — Concluir correção de posicionamento e negrito:**
- Corrigir os 11 casos pendentes do plano anterior (overflow cortando balão, `top-full` vs `bottom-full`, wrapper `relative` ausente).
- Aplicar `font-normal` explícito no componente base como reforço contra herança de negrito.
- Resolver as mensagens órfãs de `ExpenseDialog.tsx` em `firstAccessGuideMessages.ts`.

**Fase 2 — Escala de z-index consistente:**
- Criar constantes centralizadas de z-index.
- Aplicar aos ~49 call sites de guia e aos elementos concorrentes já identificados (dialogs, dropdowns, header, drawers).

**Fase 3 — Coordenação entre guias + trilha por módulo:**
- Mecanismo central (Context) garantindo no máximo 1 guia visível por vez, em toda a tela.
- Tabela de prioridade por módulo (não por guia individual), seguindo o fluxo natural de uso do sistema.
- Migração do hook `useFirstAccessGuide` para consumir esse mecanismo, preservando a assinatura pública atual.

### Fora do escopo

- Adotar biblioteca de positioning (ex.: Floating UI) — decisão explícita do usuário de manter correção via CSS manual, reaproveitando os padrões já corretos existentes no próprio projeto.
- Redesenho visual do card (cores, ícones, animações) além do necessário para resolver os problemas relatados.
- Sequenciamento manual guia-a-guia dentro do mesmo módulo — a prioridade é definida por módulo/nível, não por guia individual.
- Adicionar novos scopes/guias de conteúdo que ainda não existem.
- Sistema de analytics/telemetria sobre uso das guias.
- Persistência de estado de onboarding no backend — a solução permanece 100% client-side (`localStorage`), como hoje.
- Testes E2E automatizados.

## Leitura de contexto

- `/AGENT.md` e `sistema financas/AGENT.md` — ambos descrevem contexto genérico "multi-prefeitura, multi-tenant + RLS" que não se aplica a este projeto pessoal solo-dev; seções de tenant/RLS desconsideradas, mantidas as práticas gerais (nomes claros, não mascarar erros, seguir padrões existentes).
- Não foram encontrados `frontend/AGENT.md` nem `backend/AGENT.md` separados.
- `.portal/tasks/corrigir-e-redesenhar-sistema-guias-primeiro-acesso.md` (especificação de entrada).
- `.plans/guias-primeiro-acesso-cobertura-completa.md` — plano anterior de cobertura, aparentemente implementado (49 scopes confirmados ativos no código atual).
- `.plans/correcao-posicionamento-baloes-guia.md` — plano anterior de correção de posicionamento, diagnóstico ainda válido; reinvestigação confirmou que 11 dos 12 casos mapeados continuam sem correção.
- `sistema financas/src/hooks/useFirstAccessGuide.ts`, `sistema financas/src/components/FirstAccessGuideCard.tsx`, `sistema financas/src/components/firstAccessGuideMessages.ts`.
- `sistema financas/src/ui/card.tsx`, `sistema financas/src/ui/dialog.tsx`, `sistema financas/src/context/ConfirmContext.tsx` (padrão de Context a seguir).
- Reinvestigação completa (via subagente) de todos os 12 casos do plano anterior, confirmando arquivo:linha de cada um.
- Levantamento completo dos 49 scopes ativos hoje (`grep` em `sistema financas/src/screens`).

## Impacto por área

### Frontend

**Fase 1:**
- `sistema financas/src/screens/config/RepresentantesTab.tsx` (`tipoGuide`, linhas ~117-141): mover balão para fora do wrapper `overflow-hidden` do pill toggle.
- `sistema financas/src/screens/finance/BatchPaymentModal.tsx` (`tabGuide`, linhas ~80-114): mesmo tratamento.
- `sistema financas/src/screens/despesas/DespesasScreen.tsx` (`loteGuide`, `pagarSelecionadasGuide`, `filterGuide`, `moverMesGuide`): mover os quatro para fora do `<Card>` que envolve a tabela; aplicar `font-normal` no `loteGuide` (dentro de `<th>`, linhas 589-608) como reforço.
- `sistema financas/src/screens/meses/MesesScreen.tsx` (`fecharReabrirGuide`, linhas ~109-182): mover para fora do `<Card>`.
- `sistema financas/src/screens/receitas/ReceitasScreen.tsx` (`contratosGuide`, `searchGuide`, linhas ~261-349): mover ambos para fora dos respectivos `<Card>`.
- `sistema financas/src/screens/config/ClienteDetail.tsx` (`servicosVinculoGuide`, linhas ~899-975): reposicionar para não conflitar com o sub-Dialog `scrollBody={false}`.
- `sistema financas/src/screens/config/CategoriasTab.tsx` (`desativarGuide`, linhas ~213-221) e `sistema financas/src/screens/config/UsuariosTab.tsx` (`desativarGuide`, linhas ~115-123): trocar `top-full`/`mt-3` por `bottom-full`/`mb-3`.
- `sistema financas/src/screens/finance/IncomeDialog.tsx` (`replicarGuide`, linhas ~845-854): mesma troca.
- `sistema financas/src/screens/finance/FinanceDashboard.tsx` (`painel:mes-v1`, linhas ~204-218): mover o `FirstAccessGuideCard` para dentro da `<div className="relative">` que envolve o `MonthSelector`.
- `sistema financas/src/components/firstAccessGuideMessages.ts`: remover as chaves órfãs `despesasDuplicata`/`despesasAdicionarLote` (guia desconectado de `ExpenseDialog.tsx`, sem hook/card correspondente hoje).
- `sistema financas/src/components/FirstAccessGuideCard.tsx`: adicionar `font-normal` explícito no parágrafo de descrição (linha ~62).

**Fase 2:**
- Novo arquivo `sistema financas/src/ui/zIndex.ts` com constantes/tokens de camada (ex.: `Z_DROPDOWN`, `Z_GUIDE`, `Z_MODAL`, `Z_OVERLAY_SYSTEM`).
- Aplicar essas constantes nos ~49 call sites de `FirstAccessGuideCard` e nos arquivos com z-index concorrente: `sistema financas/src/ui/dialog.tsx`, `sistema financas/src/layout/AppShell.tsx`, `sistema financas/src/ui/CategoryCombobox.tsx`, e demais dropdowns identificados.

**Fase 3:**
- Novo `sistema financas/src/context/FirstAccessGuideContext.tsx`: Provider que centraliza quais scopes estão "elegíveis" (nunca dispensados) e expõe apenas o de maior prioridade como visível.
- `sistema financas/src/hooks/useFirstAccessGuide.ts`: adaptado para registrar/consultar o contexto central, preservando a assinatura pública `{ isVisible, dismiss }` — nenhuma das ~49 chamadas existentes precisa mudar de código.
- `sistema financas/src/App.tsx` ou `sistema financas/src/layout/AppShell.tsx`: envolver a árvore relevante com o novo Provider.
- Tabela de prioridade por módulo definida dentro do novo contexto (constante interna, não configurável via UI nesta entrega):
  1. Cadastros base: Cartões, Categorias, Perfis, Clientes, Representantes, Sócios, Serviços.
  2. Configuração da conta: Minha conta, Usuários.
  3. Lançamentos: Despesas, Receitas, Reservas.
  4. Visão consolidada: Painel, Meses, Planos.
  5. Análise: Relatórios.

### Backend

`Sem impacto esperado` — sistema inteiramente client-side.

### Banco de dados

`Sem impacto esperado`.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `sistema financas/src/screens/config/RepresentantesTab.tsx`
- `sistema financas/src/screens/finance/BatchPaymentModal.tsx`
- `sistema financas/src/screens/despesas/DespesasScreen.tsx`
- `sistema financas/src/screens/meses/MesesScreen.tsx`
- `sistema financas/src/screens/receitas/ReceitasScreen.tsx`
- `sistema financas/src/screens/config/ClienteDetail.tsx`
- `sistema financas/src/screens/config/CategoriasTab.tsx`
- `sistema financas/src/screens/config/UsuariosTab.tsx`
- `sistema financas/src/screens/finance/IncomeDialog.tsx`
- `sistema financas/src/screens/finance/FinanceDashboard.tsx`
- `sistema financas/src/components/firstAccessGuideMessages.ts`
- `sistema financas/src/components/FirstAccessGuideCard.tsx`
- `sistema financas/src/hooks/useFirstAccessGuide.ts`
- `sistema financas/src/ui/zIndex.ts` (novo)
- `sistema financas/src/ui/dialog.tsx`
- `sistema financas/src/layout/AppShell.tsx`
- `sistema financas/src/ui/CategoryCombobox.tsx`
- `sistema financas/src/context/FirstAccessGuideContext.tsx` (novo)
- `sistema financas/src/App.tsx` (ou `AppShell.tsx`, a confirmar durante implementação)
- Demais ~15 arquivos de tela com guias, apenas para aplicar as constantes de z-index (Fase 2), sem mudança estrutural.

## Estratégia de implementação

**Fase 1:**
1. Adicionar `font-normal` ao `FirstAccessGuideCard.tsx`.
2. Corrigir os dois casos mais graves (overflow-hidden no wrapper imediato): `RepresentantesTab.tsx`, `BatchPaymentModal.tsx`.
3. Corrigir os casos de `Card` com `overflow-hidden`: `DespesasScreen.tsx` (4 guias), `MesesScreen.tsx`, `ReceitasScreen.tsx` (2 guias).
4. Corrigir o sub-Dialog aninhado: `ClienteDetail.tsx` (`servicosVinculoGuide`).
5. Trocar `top-full`→`bottom-full`: `CategoriasTab.tsx`, `UsuariosTab.tsx`, `IncomeDialog.tsx`.
6. Corrigir o wrapper `relative` do `FinanceDashboard.tsx`.
7. Remover mensagens órfãs de `ExpenseDialog.tsx` em `firstAccessGuideMessages.ts`.
8. Rodar build.

**Fase 2:**
1. Criar `sistema financas/src/ui/zIndex.ts` com a escala de camadas.
2. Atualizar `ui/dialog.tsx`, `AppShell.tsx`, `ui/CategoryCombobox.tsx` para usar as novas constantes.
3. Substituir `z-50` hardcoded pelos tokens em todos os call sites de `FirstAccessGuideCard`.
4. Rodar build.

**Fase 3:**
1. Criar `FirstAccessGuideContext.tsx` com a lógica de elegibilidade + prioridade por módulo.
2. Adaptar `useFirstAccessGuide.ts` para consumir o contexto, mantendo a assinatura pública.
3. Envolver a árvore da aplicação com o novo Provider.
4. Validar que os scopes existentes continuam funcionando (dismiss, persistência) sem exigir alteração nos ~49 call sites.
5. Rodar build.

## Regras de negócio identificadas

- Nunca mais de 1 guia visível simultaneamente em toda a tela.
- Ordem de prioridade entre guias segue o nível do módulo (cadastros base → configuração da conta → lançamentos → visão consolidada → análise), não uma ordem manual guia-a-guia.
- Dismiss de guia continua sendo por scope individual, persistido em `localStorage` por perfil — sem alteração de comportamento nesse ponto.
- Texto de guia nunca deve variar peso de fonte dependendo do elemento pai onde é renderizado.

## Regras multi-tenant e segurança

Não aplicável — projeto solo-dev sem multi-tenancy. Sem dados sensíveis envolvidos; mudança é inteiramente de apresentação/UX no frontend.

## Validações necessárias

Nenhuma validação de formulário nova — mudança é de posicionamento visual, z-index e lógica de exibição/coordenação entre componentes informativos.

## Testes necessários

### Frontend

- Não aplicável nesta implementação (sem testes automatizados de frontend identificados no projeto para este fluxo). Validação por build/typecheck, conforme preferência já registrada pelo usuário nesta sessão de não exigir teste manual em tela.

### Backend

- Não aplicável.

### E2E

- Não aplicável.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
```

## Riscos e pontos de atenção

- Volume de arquivos tocados na Fase 1 (9 arquivos, 11 casos) — risco de nova inconsistência se a correção não for cuidadosa arquivo a arquivo; mitigar seguindo rigorosamente os padrões já corretos existentes no próprio projeto (`ClienteDetail.tsx:1047`, `UsuariosTab.tsx:205`, `ReservasScreen.tsx:125-135`).
- Fase 3 introduz uma peça de arquitetura nova (Context) que precisa ser mantida conforme novos guias forem adicionados no futuro — a tabela de prioridade por módulo deve ficar documentada de forma clara no próprio código para facilitar manutenção.
- Migrar `useFirstAccessGuide` para consumir um Context central é uma mudança de implementação interna do hook; qualquer regressão de comportamento (ex.: dismiss parar de persistir) afetaria todas as 49 chamadas ao mesmo tempo — validar cuidadosamente antes de considerar a Fase 3 concluída.
- Sem testes automatizados cobrindo este fluxo, a validação depende de build/typecheck e revisão cuidadosa do diff — risco de regressão visual não seria pego automaticamente.

## Perguntas em aberto

`Nenhuma pergunta em aberto identificada.` (As duas pendências levantadas na apresentação preliminar — mensagens órfãs de `ExpenseDialog.tsx` e a tabela de prioridade por módulo — foram resolvidas: mensagens órfãs serão removidas na Fase 1, e a tabela de prioridade proposta foi incorporada ao plano.)

## Critérios de aceite do plano

- Os 11 casos pendentes do plano anterior de posicionamento estão corrigidos, verificáveis no código.
- Nenhum balão de guia herda negrito indevido do elemento pai.
- Existe uma escala de z-index centralizada aplicada a todos os call sites de guia e aos elementos concorrentes mapeados.
- Nunca mais de 1 guia fica visível simultaneamente em qualquer tela do sistema.
- A ordem de exibição entre módulos segue a tabela de prioridade definida (cadastros base antes de lançamentos, lançamentos antes de análise).
- Build do frontend passa sem erros ao final de cada fase.
- Nenhuma migration é executada (não aplicável a este plano, mas mantido por padrão do projeto).

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto, incluindo os dois planos anteriores referenciados para entender o histórico e evitar repetir diagnóstico já feito.
- Implementar as três fases em sequência, validando build ao final de cada uma antes de avançar para a próxima.
- Seguir rigorosamente os padrões de posicionamento já corretos existentes no próprio projeto ao corrigir a Fase 1 (não inventar uma abordagem nova).
- Não adicionar biblioteca de positioning externa (decisão explícita do usuário).
- Não alterar a assinatura pública de `useFirstAccessGuide` (`{ isVisible, dismiss }`) na Fase 3, para não exigir tocar nas ~49 chamadas existentes.
- Não executar migrations (não aplicável, mas mantido por padrão do projeto).
- Manter alterações pequenas e revisáveis; considerar comunicar o progresso por fase, já que é um escopo grande.
