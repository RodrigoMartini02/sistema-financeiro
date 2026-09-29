# Plano de Implementação: Padronizar Todos os Modais do Sistema no Estilo Aprovado

## Origem

- Arquivo de especificação: `.portal/tasks/padronizar-todos-modais-sistema.md`
- Data do planejamento: `2026-08-05`
- Classificação: `frontend-only`

## Resumo

Cria um novo componente `Dialog` compartilhado, mantendo a API atual (`open, title, description?, onClose, children, size?, scrollBody?`), incorporando o vocabulário visual aprovado em `ExpenseDialog.tsx`/`IncomeDialog.tsx` como shell padrão: overlay com blur, container `borderRadius: 18`, sombra com anel, header (título+subtítulo+botão fechar circular), footer com borda superior, com suporte a dark mode. Extrai os tokens de cor e sub-componentes de formulário hoje duplicados em 3 lugares (`ExpenseDialog`, `IncomeDialog`, `CategoryFloatingSelect`) para um módulo compartilhado. Migra `ExpenseDialog`/`IncomeDialog` para usar esse shell (preservando 100% da lógica interna) e os ~16 modais restantes do sistema, trocando apenas a moldura externa — os componentes de campo (`Field`/`Input`/`Select` de `ui/form.tsx`) permanecem como estão, por decisão explícita do usuário de reduzir risco de regressão.

## Escopo

### Dentro do escopo

- Módulo de tokens/sub-componentes de formulário compartilhado (paleta de cores, `labelStyle`, `fieldInputStyle`, `cardStyle`, `panelStyle`, `chipStyle`, `MoneyField`, `MoneyFieldSmall`).
- Novo componente `Dialog` (shell do modal) com o vocabulário visual aprovado, mesma API do atual, suporte a dark mode.
- Migração de `ExpenseDialog.tsx` e `IncomeDialog.tsx` para o novo shell.
- Migração dos ~16 modais restantes do inventário para o novo shell (apenas o shell — sem alterar componentes de campo internos).
- Unificação da paleta de cores duplicada em `CategoryFloatingSelect.tsx`.

### Fora do escopo

- Redesenho dos componentes de campo `Field`/`Input`/`Select`/`Textarea`/`ToggleRow`/`ToggleGroup` de `ui/form.tsx` (decisão explícita do usuário — só o shell do modal muda, não os campos internos dos ~16 modais simples).
- `OnboardingChecklistModal.tsx`, `TermosModal.tsx`, `LoginModal.tsx`, drawers/painéis de `AppShell.tsx` — fora do escopo (guia de onboarding, área pública/marketing, painéis de navegação).
- Qualquer alteração de regra de negócio, validação, endpoints ou comportamento funcional dos formulários.
- Backend — nenhuma alteração esperada.
- Migrations ou alterações de banco de dados.

## Leitura de contexto

- `/AGENT.md` e `sistema financas/AGENT.md` — ambos descrevem contexto genérico "multi-prefeitura, multi-tenant + RLS" que não se aplica a este projeto pessoal solo-dev; seções de tenant/RLS desconsideradas.
- `.portal/tasks/padronizar-todos-modais-sistema.md` (especificação de entrada, já contém investigação completa do sistema de modais feita nesta sessão).
- `sistema financas/src/screens/finance/ExpenseDialog.tsx` (lido na íntegra nesta rodada — 1095 linhas, padrão aprovado).
- `sistema financas/src/screens/finance/IncomeDialog.tsx` (padrão aprovado, réplica do Expense).
- `sistema financas/src/ui/dialog.tsx` (componente atual, lido na íntegra — API e estilo Tailwind).
- `sistema financas/src/screens/config/SociosTab.tsx` (exemplo de modal simples usando `Dialog`+`Field`/`Input`/`Button`).
- `sistema financas/src/screens/config/ClienteDetail.tsx` (exemplo de modal complexo — `size="xxl"`, sub-modal `size="xl" scrollBody={false}`, confirma que a API atual do `Dialog` cobre esses casos e deve ser preservada).

## Impacto por área

### Frontend

**Fase 1 — Tokens compartilhados + novo shell + migração Expense/Income**
- Novo módulo (ex.: `sistema financas/src/ui/dialogFormTokens.ts`, nome a confirmar na implementação) com: paleta `C` (cores hex extraídas de `ExpenseDialog.tsx:44-70`, unificando as chaves `danger*` que faltam hoje em `IncomeDialog.tsx`), `labelStyle`, `fieldInputStyle`, `smallInputStyle`, `numericInputStyle`, `cardStyle`, `panelStyle`, `chipStyle(active, opts?)`, `formatCents`/`digitsOnly`, `MoneyField`, `MoneyFieldSmall`.
- Reescrita de `sistema financas/src/ui/dialog.tsx`: mantendo a assinatura `{ open, title, description?, onClose, children, size?, scrollBody? }`, trocando a implementação interna para o vocabulário aprovado — overlay `rgba(15,23,42,0.5)` + blur, container `borderRadius: 18`, sombra `0 32px 80px -24px rgba(13,47,63,0.38), 0 0 0 1px rgba(13,47,63,0.06)`, header com título (19px/700/-0.01em) + subtítulo (13px, cor suave) + botão fechar circular 32px, footer com `borderTop` e fundo levemente diferenciado. Adicionar variante dark mode equivalente (paleta escura correspondente). Preservar o uso correto de `Z_MODAL` (já presente no componente atual) e a lógica de `size`/`scrollBody`/fechamento por Escape já existentes.
- `ExpenseDialog.tsx`/`IncomeDialog.tsx`: substituir a estrutura própria de overlay/container/header/footer (linhas 597-628 e 1023-1090 do Expense, equivalentes no Income) pelo novo `Dialog`, passando `title`/`description` conforme o texto atual do header. Importar tokens/`MoneyField`/`MoneyFieldSmall`/`cardStyle`/`panelStyle`/`chipStyle` do novo módulo compartilhado em vez de definições locais. Manter 100% da lógica de formulário interna (React Hook Form, watchers, sugestões, duplicata, parcelamento) intacta — mudança é estrutural na moldura, não na lógica.
- `CategoryFloatingSelect.tsx`: trocar a cópia local parcial da paleta pela importação do módulo compartilhado.

**Fase 2 — Migração dos ~16 modais restantes (apenas shell)**
Para cada modal, trocar somente a chamada ao componente `Dialog` (que já muda de estilo automaticamente com a Fase 1) — nenhuma alteração de `Field`/`Input`/`Select`/lógica de negócio é necessária, já que a API do `Dialog` não muda. Agrupamento sugerido para revisão incremental:
- Grupo A (Finance): `sistema financas/src/screens/finance/PaymentModal.tsx`, `sistema financas/src/screens/finance/BatchPaymentModal.tsx`
- Grupo B (Config — cadastros simples): `sistema financas/src/screens/config/SociosTab.tsx`, `ServicosTab.tsx`, `CategoriasTab.tsx`, `CartaoTab.tsx`
- Grupo C (Config — cadastros com mais campos): `UsuariosTab.tsx`, `ClientesTab.tsx`, `RepresentantesTab.tsx`, `PerfisTab.tsx`
- Grupo D (Complexos): `ClienteDetail.tsx`, `sistema financas/src/screens/planos/PlanosScreen.tsx`
- Grupo E (Utilitários): `sistema financas/src/ui/ConfirmDialog.tsx`, `sistema financas/src/ui/AttachmentPreviewDialog.tsx`, `sistema financas/src/screens/reservas/ReservaDialog.tsx`

Como esses modais já consomem `<Dialog>` importado de `sistema financas/src/ui/dialog.tsx`, a migração de cada grupo consiste em validar visualmente que a troca do componente interno não quebrou nenhum layout específico (ex.: `scrollBody={false}` em sub-modais, `size="xxl"`), sem necessidade de editar o JSX interno de cada tela.

**Fase 3 — Limpeza**
- Confirmar (grep) que não sobrou nenhuma referência à implementação antiga do `Dialog` ou a paletas de cor duplicadas.
- Build final do frontend.

### Backend

`Sem impacto esperado` — task estritamente de frontend/UI.

### Banco de dados

`Sem impacto esperado`.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `sistema financas/src/ui/dialog.tsx` (reescrito)
- `sistema financas/src/ui/dialogFormTokens.ts` (novo, nome a confirmar)
- `sistema financas/src/screens/finance/ExpenseDialog.tsx`
- `sistema financas/src/screens/finance/IncomeDialog.tsx`
- `sistema financas/src/ui/CategoryFloatingSelect.tsx`
- `sistema financas/src/ui/ConfirmDialog.tsx`
- `sistema financas/src/ui/AttachmentPreviewDialog.tsx`
- `sistema financas/src/screens/finance/PaymentModal.tsx`
- `sistema financas/src/screens/finance/BatchPaymentModal.tsx`
- `sistema financas/src/screens/reservas/ReservaDialog.tsx`
- `sistema financas/src/screens/config/CategoriasTab.tsx`
- `sistema financas/src/screens/config/UsuariosTab.tsx`
- `sistema financas/src/screens/config/SociosTab.tsx`
- `sistema financas/src/screens/config/ServicosTab.tsx`
- `sistema financas/src/screens/config/RepresentantesTab.tsx`
- `sistema financas/src/screens/config/PerfisTab.tsx`
- `sistema financas/src/screens/config/ClientesTab.tsx`
- `sistema financas/src/screens/config/ClienteDetail.tsx`
- `sistema financas/src/screens/config/CartaoTab.tsx`
- `sistema financas/src/screens/planos/PlanosScreen.tsx`

## Estratégia de implementação

**Fase 1:**
1. Criar módulo de tokens/sub-componentes compartilhado com o conteúdo extraído de `ExpenseDialog.tsx`.
2. Reescrever `sistema financas/src/ui/dialog.tsx` com o vocabulário visual aprovado, mantendo a API atual e adicionando dark mode.
3. Migrar `ExpenseDialog.tsx` para o novo `Dialog`, importando os tokens do módulo compartilhado.
4. Migrar `IncomeDialog.tsx` da mesma forma.
5. Atualizar `CategoryFloatingSelect.tsx` para usar a paleta compartilhada.
6. Rodar build; validar visualmente Expense e Income (dado o caráter visual da mudança).

**Fase 2:**
1. Migrar Grupo A, validar build.
2. Migrar Grupo B, validar build.
3. Migrar Grupo C, validar build.
4. Migrar Grupo D (atenção especial a `size="xxl"` e `scrollBody={false}` em `ClienteDetail.tsx`), validar build.
5. Migrar Grupo E, validar build.

**Fase 3:**
1. Grep por resíduos de paleta duplicada ou referências à estrutura antiga.
2. Build final completo.

## Regras de negócio identificadas

- Nenhuma regra de negócio nova — mudança é inteiramente de camada de apresentação/estrutura visual.
- A API pública do componente `Dialog` (`open, title, description?, onClose, children, size?, scrollBody?`) não muda — garante que a Fase 2 não exija reescrever o JSX interno de cada modal consumidor.

## Regras multi-tenant e segurança

Não aplicável — projeto solo-dev sem multi-tenancy. Sem impacto de segurança — mudança puramente visual/estrutural.

## Validações necessárias

Nenhuma validação de formulário nova. Validação relevante aqui é visual: confirmar que cada modal migrado mantém sua funcionalidade e aparência coerente com o novo padrão.

## Testes necessários

### Frontend

- Não aplicável (sem testes automatizados de frontend identificados no projeto). Validação por build a cada fase/grupo, e revisão visual pontual dos casos mais sensíveis (Expense/Income na Fase 1, `ClienteDetail.tsx` na Fase 2 por usar `scrollBody={false}` e sub-modal aninhado).

### Backend

- Não aplicável.

### E2E

- Não aplicável.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
```

## Riscos e pontos de atenção

- Migrar `ExpenseDialog`/`IncomeDialog` é o passo de maior risco desta task — os dois arquivos são grandes (~1000 linhas cada) e contêm lógica de negócio sensível (parcelamento, sugestões, detecção de duplicata); a migração deve tocar apenas na estrutura de shell (overlay/header/footer), preservando toda a lógica interna sem alteração.
- `ClienteDetail.tsx` usa `size="xxl"` e um sub-modal com `scrollBody={false}` — o novo `Dialog` precisa continuar suportando esses casos exatamente como hoje.
- Sem testes automatizados de UI — a validação depende de build (garante que não há erro de tipo/import) e revisão visual, que é mais lenta e sujeita a passar despercebido algum detalhe pontual.
- Ambiente pode estar apontando para produção — nenhuma migration ou comando destrutivo será executado (não aplicável a esta task).

## Perguntas em aberto

`Nenhuma pergunta em aberto identificada.` (Todas as 5 perguntas da task original foram resolvidas durante o planejamento: nome exato do módulo de tokens será decidido durante a implementação sem impacto no plano; agrupamento de modais definido acima; `OnboardingChecklistModal` fica fora do escopo; componentes de campo internos não mudam de visual; validação é build + revisão visual pontual nos casos mais sensíveis.)

## Critérios de aceite do plano

- Existe um módulo de tokens/sub-componentes de formulário compartilhado, sem duplicação de paleta de cores em múltiplos arquivos.
- O componente `Dialog` usa o vocabulário visual aprovado (cores, tipografia de header, radius 18px, sombra com anel, overlay com blur) e suporta dark mode.
- `ExpenseDialog.tsx` e `IncomeDialog.tsx` usam o novo `Dialog` como shell, com resultado visual idêntico ao aprovado atualmente, e toda a lógica de formulário preservada.
- Todos os ~16 modais do inventário usam o novo `Dialog`, sem alteração de `Field`/`Input`/`Select`/lógica de negócio.
- `CategoryFloatingSelect.tsx` usa a paleta compartilhada, sem cópia própria.
- `Z_MODAL` continua sendo usado corretamente pelo `Dialog`.
- Build do frontend passa sem erros ao final de cada fase.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Implementar as 3 fases em sequência, validando build ao final de cada uma (e de cada grupo dentro da Fase 2) antes de avançar.
- Ao migrar `ExpenseDialog.tsx`/`IncomeDialog.tsx`, isolar a mudança à camada de shell — não alterar nenhuma lógica de estado, validação, cálculo ou chamada de API existente.
- Ao migrar os modais da Fase 2, não é esperado editar `Field`/`Input`/`Select`/`ui/form.tsx` — a mudança deve ser automática pela troca de implementação do `Dialog`, exigindo no máximo ajustes pontuais se algum modal específico depender de algum detalhe do `Dialog` antigo não coberto pelo novo.
- Não executar migrations (não aplicável, mas mantido por padrão do projeto).
- Não realizar testes manuais extensivos em cada modal, mas dado o caráter visual desta task, priorizar uma verificação visual rápida pelo menos para Expense/Income (Fase 1) e `ClienteDetail.tsx` (Fase 2, por ser o caso mais complexo de `size`/`scrollBody`).
- Manter alterações pequenas e revisáveis por fase/grupo; comunicar progresso ao final de cada grupo, dado o volume total da task.
