# Plano de Implementação: Correção de Posicionamento dos Balões de Guia de Primeiro Acesso

## Origem

- Arquivo de especificação: solicitação direta do usuário no chat, a partir de bug reportado visualmente (balão do guia "Movimentar" em Reservas aparecendo por baixo do próximo card) e auditoria completa feita nesta conversa
- Data do planejamento: 2026-08-04
- Classificação: `frontend-only`

## Resumo

Uma auditoria completa dos ~42 usos de `FirstAccessGuideCard` (implementados nas sessões anteriores para cobrir guias de primeiro acesso) revelou 3 problemas sistêmicos de padrão, não um bug isolado:

1. **Corte por `overflow-hidden`**: balões renderizados dentro de `Card` (que sempre tem `overflow-hidden`) ou dentro de "pill toggles" com `overflow-hidden` no próprio wrapper imediato — o balão é cortado ou fica atrás do próximo elemento. 16 casos confirmados.
2. **Posicionamento errado (`top-full` vs `bottom-full`)**: balões no fim de formulários dentro de `Dialog` (que tem scroll) usando `top-full` (desce) em vez de `bottom-full` (sobe) — nascem fora da área visível do scroll. Já existe um padrão correto usado em 2 lugares (`ClienteDetail.tsx:892`, `UsuariosTab.tsx:199`) que não foi replicado nos outros 5 casos.
3. **Herança de negrito em `<th>`**: o balão do guia `loteGuide` (tabela de Despesas) está dentro de um elemento `<th>`, que tem `font-weight: bold` nativo do navegador — o texto do balão herda esse negrito sem querer.

Também há 1 caso à parte (`FinanceDashboard.tsx`, guia "painel:mes") onde o balão pode não ter um wrapper `relative` correto como ancestral imediato — possível bug de posicionamento incorreto, não de overflow.

Este plano corrige todos os pontos identificados (os 16 "em risco" + os "incerto" + o caso especial do Dashboard), com ajustes pontuais e mínimos por padrão — sem reescrever a arquitetura do componente `FirstAccessGuideCard` (sem portal/JS de posicionamento).

## Escopo

### Dentro do escopo

**Padrão 1 — `Card` com `overflow-hidden` (ancestral distante):**
- `ReservasScreen.tsx` (moveGuide) — bug original relatado
- `DespesasScreen.tsx` (loteGuide, pagarSelecionadasGuide, filterGuide, moverMesGuide)
- `MesesScreen.tsx` (fecharReabrirGuide)
- `ReceitasScreen.tsx` (contratosGuide, searchGuide)
- Correção: mover o balão para fora do elemento `Card`/`th`/tabela quando estrutural, ou reposicionar/usar `bottom-full` quando o elemento está no topo de uma lista/grid.

**Padrão 1b — `overflow-hidden` no wrapper imediato (mais grave, corte garantido):**
- `RepresentantesTab.tsx` (tipoGuide, dentro de `ComissaoRow`)
- `BatchPaymentModal.tsx` (tabGuide)
- Correção: mover o balão para fora do elemento com `overflow-hidden` (ancorar num wrapper `relative` externo ao pill toggle, não dentro dele).

**Padrão 1c — sub-Dialog com `scrollBody={false}`:**
- `ClienteDetail.tsx` (servicosVinculoGuide)
- Correção: reposicionar para não conflitar com a lista rolável interna do sub-modal.

**Padrão 2 — `top-full` no fim de Dialog com scroll:**
- `CategoriasTab.tsx` (desativarGuide)
- `UsuariosTab.tsx` (desativarGuide)
- `ExpenseDialog.tsx` (duplicataGuide, loteGuide)
- `IncomeDialog.tsx` (replicarGuide)
- Correção: trocar `top-full`/`mt-3` por `bottom-full`/`mb-3`, replicando o padrão já correto de `ClienteDetail.tsx:892`.

**Casos "incerto" (dentro de Dialog com scroll padrão, corrigir por consistência e prevenção):**
- `CartaoTab.tsx` (limiteGuide, validadeGuide, fechamentoGuide)
- `CategoriasTab.tsx` (vincularGuide)
- `ClienteDetail.tsx` (reajusteGuide, representanteGuide, implantacaoGuide, horasGuide)
- `PerfisTab.tsx` (enquadramentoGuide)
- `RepresentantesTab.tsx` (comissoesGuide)
- `ExpenseDialog.tsx` (togglesGuide, categoriaSugeridaGuide)
- `IncomeDialog.tsx` (representanteGuide, horasGuide)
- `PlanosScreen.tsx` (tabsGuide)
- `ReservaDialog.tsx` (tabsGuide, contribuicaoGuide)
- Correção: validação visual leve + ajuste de `placement`/margem onde necessário para garantir folga segura dentro do scroll do Dialog.

**Caso especial — posicionamento incorreto:**
- `FinanceDashboard.tsx` (guide "painel:mes")
- Correção: garantir que o `FirstAccessGuideCard` esteja dentro do wrapper `relative` correto (mover para dentro do wrapper do `MonthSelector` ou envolver ambos em um novo `relative`).

**Negrito herdado:**
- `DespesasScreen.tsx` (loteGuide, dentro de `<th>`)
- Correção: junto com a correção estrutural do Padrão 1 (mover para fora do `<th>`), garantir `font-normal` explícito no texto do balão como reforço defensivo.

### Fora do escopo

- Reescrever `FirstAccessGuideCard` para usar Portal/posicionamento via JS — mudança de arquitetura não aprovada.
- Alterar o conteúdo/texto das mensagens em `firstAccessGuideMessages.ts`.
- Qualquer alteração de backend, schema, migrations.
- Casos já classificados "SEGURO" na auditoria (não serão tocados desnecessariamente): `CartaoTab.tsx:178`, `CategoriasTab.tsx` (subcategoryGuide, guideNovaCategoria), `ClienteDetail.tsx` (encerrarGuide, gerarPrevistasGuide), `ClientesTab.tsx`, `MinhaContaTab.tsx`, `PerfisTab.tsx` (createGuide), `RepresentantesTab.tsx` (createGuide), `ServicosTab.tsx`, `SociosTab.tsx`, `UsuariosTab.tsx` (filterGuide), `DespesasScreen.tsx` (fecharMesGuide, guide "nova despesa"), `FinanceDashboard.tsx` (comprometimentoGuide), `ReservasScreen.tsx` (guide "nova reserva"), `ReceitasScreen.tsx` (guide "nova receita"), `RelatoriosScreen.tsx`.

## Leitura de contexto

- `/AGENT.md`
- `sistema financas/AGENT.md`
- `src/components/FirstAccessGuideCard.tsx`
- `src/ui/card.tsx`
- `src/ui/dialog.tsx`
- Auditoria completa realizada nesta conversa, cobrindo leitura integral de: `ReservasScreen.tsx`, `DespesasScreen.tsx`, `MesesScreen.tsx`, `ReceitasScreen.tsx`, `RepresentantesTab.tsx`, `BatchPaymentModal.tsx`, `ClienteDetail.tsx`, `CategoriasTab.tsx`, `UsuariosTab.tsx`, `ExpenseDialog.tsx`, `IncomeDialog.tsx`, `CartaoTab.tsx`, `PerfisTab.tsx`, `PlanosScreen.tsx`, `ReservaDialog.tsx`, `FinanceDashboard.tsx`, `ClientesTab.tsx`, `MinhaContaTab.tsx`, `ServicosTab.tsx`, `SociosTab.tsx`, `RelatoriosScreen.tsx`

## Impacto por área

### Frontend

Ajustes pontuais de posicionamento CSS (`className`, estrutura de wrapper `relative`, troca `top-full`↔`bottom-full`) em aproximadamente 16 arquivos. Nenhuma mudança de lógica de negócio, nenhuma nova mensagem em `firstAccessGuideMessages.ts`, nenhuma nova prop obrigatória no componente base `FirstAccessGuideCard` (uma prop opcional de reforço, como `font-normal` explícito, pode ser adicionada via `className` se necessário).

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/reservas/ReservasScreen.tsx`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/meses/MesesScreen.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`
- `src/screens/config/RepresentantesTab.tsx`
- `src/screens/finance/BatchPaymentModal.tsx`
- `src/screens/config/ClienteDetail.tsx`
- `src/screens/config/CategoriasTab.tsx`
- `src/screens/config/UsuariosTab.tsx`
- `src/screens/finance/ExpenseDialog.tsx`
- `src/screens/finance/IncomeDialog.tsx`
- `src/screens/config/CartaoTab.tsx`
- `src/screens/config/PerfisTab.tsx`
- `src/screens/planos/PlanosScreen.tsx`
- `src/screens/reservas/ReservaDialog.tsx`
- `src/screens/finance/FinanceDashboard.tsx`

## Estratégia de implementação

1. Corrigir primeiro os 2 casos mais graves (overflow-hidden no wrapper imediato, corte garantido): `RepresentantesTab.tsx`, `BatchPaymentModal.tsx`.
2. Corrigir o bug original relatado: `ReservasScreen.tsx`.
3. Corrigir os demais casos de `Card` com overflow-hidden (Despesas, Meses, Receitas), incluindo especificamente o caso do `<th>` com negrito herdado em `DespesasScreen.tsx`.
4. Corrigir o sub-Dialog aninhado: `ClienteDetail.tsx` (servicosVinculoGuide).
5. Trocar `top-full`→`bottom-full` nos 5 casos identificados no fim de Dialogs com scroll (`CategoriasTab.tsx`, `UsuariosTab.tsx`, `ExpenseDialog.tsx` ×2, `IncomeDialog.tsx`).
6. Revisar/ajustar os casos "incerto" com validação visual leve, garantindo folga suficiente dentro do scroll de cada Dialog.
7. Corrigir o wrapper `relative` do `FinanceDashboard.tsx` para o guia "painel:mes".
8. Rodar `npm run build` ao final.
9. Testar visualmente no navegador (subir o sistema local) pelo menos os casos mais críticos: Reservas, Despesas (tabela), Representantes, BatchPaymentModal, Meses, Receitas.

## Regras de negócio identificadas

Nenhuma regra de negócio nova — mudança é puramente de apresentação visual/posicionamento dos guias já existentes.

## Regras multi-tenant e segurança

Não aplicável — sistema pessoal sem arquitetura multi-tenant. Mudança puramente visual/CSS, sem impacto de segurança.

## Validações necessárias

Nenhuma validação de formulário nova.

## Testes necessários

### Frontend

- Validar visualmente cada um dos 16 casos "em risco" + o caso do Dashboard, confirmando que o balão aparece completo, sem corte, sem sobreposição indevida e sem herdar negrito indesejado.
- Confirmar que os casos já "seguros" continuam funcionando sem regressão (não foram tocados).
- Confirmar especificamente: balão do `moveGuide` em Reservas aparece por cima, sem ser cortado pelo card seguinte (bug original).
- Confirmar que o balão `loteGuide` na tabela de Despesas não exibe mais texto em negrito.
- Build TypeScript sem erros.

### Backend

Sem impacto esperado.

### E2E

Não aplicável — sem suíte E2E identificada no projeto.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
```

## Riscos e pontos de atenção

- Volume considerável de arquivos tocados novamente (~16 arquivos) — risco de introduzir nova inconsistência se a correção não for cuidadosa arquivo a arquivo.
- Em alguns casos (ex.: `loteGuide` dentro do `<th>` em Despesas), a correção pode exigir mudança estrutural pequena (mover o balão para um wrapper fora da tabela), não só troca de classe CSS.
- Validação visual é especialmente importante aqui — diferente do plano anterior (que era só "conectar guia"), este plano corrige bugs visuais que só se confirmam olhando a tela renderizada, não apenas pelo build passar.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Nenhum balão de guia fica cortado por `overflow-hidden` de um ancestral (direto ou distante).
- Nenhum balão nasce fora da área visível do scroll de um `Dialog`.
- O balão do `loteGuide` (Despesas) não exibe mais o texto em negrito indevido.
- O guia do `FinanceDashboard` aparece ancorado corretamente perto do `MonthSelector`.
- Build do frontend (`npm --prefix "sistema financas" run build`) passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto, junto com a auditoria completa já realizada na conversa que originou este plano.
- Priorizar os casos mais graves primeiro (overflow-hidden no wrapper imediato: `RepresentantesTab.tsx`, `BatchPaymentModal.tsx`).
- Validar visualmente sempre que possível antes de considerar um item concluído (subir o sistema local com a skill `/run` se necessário).
- Não alterar a arquitetura do componente `FirstAccessGuideCard` nem o conteúdo de `firstAccessGuideMessages.ts`.
- Manter alterações pequenas e focadas em posicionamento/CSS.
