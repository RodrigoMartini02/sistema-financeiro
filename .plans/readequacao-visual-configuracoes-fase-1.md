# Plano de Implementação: Readequação visual da tela de Configurações — Fase 1

## Origem

- Arquivo de especificação: `.portal/tasks/Readequacao visual da tela de Configuracoes com base em mockup.md`
- Mockup de referência: `Configuracoes Compacto.html` (fornecido pelo usuário)
- Data do planejamento: `2026-09-05`
- Branch atual: `refactor/R/padronizar-modal-configuracoes`
- Classificação: `frontend-only`

## Resumo

Readequar a tela de Configurações ao padrão visual extraído do mockup: sidebar agrupada em 4 seções, listas compactas de 38–40px no modelo "cards separados", modais padronizados, tipografia Figtree + JetBrains Mono escopada à tela, e preview visual de cartões.

A estratégia ataca primeiro os **componentes compartilhados** (`ConfigListRow`, `Dialog`, `ListToolbar`, `InfoBanner`, `EmptyState`, tokens) — que propagam o padrão inclusive para telas que o mockup não desenhou — e só depois as telas PF/gerais. As 5 telas desenhadas no mockup (Contas, Categorias, Cartões, Acessos, Assinatura) são **referência de padrão, não escopo fechado**.

## Classificação e motivo

`frontend-only`. Nenhuma rota, service, schema ou migration é tocada:

- `AcessosTab` já consome `fetchAnalyticsOverview` com os KPIs reais (logins, contas criadas, usuários ativos) e seletor de período 7/30/90
- `CartaoTab` já tem `cor`, `numero_cartao`, `validade`, `limite`, `tipo` no tipo `Cartao` — o preview visual é renderização de dados que já existem
- As demais telas apenas mudam de aparência

## Escopo

### Dentro do escopo

**Bloco A — Base compartilhada (propaga para todas as telas)**

1. Carregar Figtree + JetBrains Mono em `index.html` e `app.html`
2. Criar `src/ui/configTokens.ts` + bloco CSS de custom properties em `src/styles/globals.css` (claro + escuro)
3. `src/ui/ConfigListRow.tsx` — linha compacta 38–40px, modelo cards separados
4. `src/ui/dialog.tsx` — X circular, espaçamentos do mockup, preservando classes `dark:`
5. `src/ui/ListToolbar.tsx`, `src/ui/InfoBanner.tsx`, `src/ui/EmptyState.tsx` — reestilo
6. `src/layout/ConfigPanel.tsx` — sidebar agrupada + aplicação da classe de escopo

**Bloco B — Telas PF/gerais**

7. `src/screens/config/ContasTab.tsx` — listagem + parte PF do formulário
8. `src/screens/config/CategoriasTab.tsx`
9. `src/screens/config/CartaoTab.tsx` + preview visual de cartão (feature nova)
10. `src/screens/config/AcessosTab.tsx`
11. `src/screens/config/SecurityTab.tsx` — linguagem visual (é formulário, não lista)
12. `src/screens/planos/PlanosScreen.tsx` — apenas o caminho `embedded`

### Fora do escopo

- Alterar os tokens `C` em `dialogFormTokens.tsx` (decisão 2 — ver "Decisões aplicadas")
- Telas PJ, que ficam para a Fase 2: parte PJ do `ContaDialog` (razão social, CNPJ, enquadramento, `CategoryPreview`), `SociosTab`, `UsuariosTab`, `IntegracoesIaTab`, `ServicosTab`/`CatalogoTab`
- `RepresentantesTab` e `MembrosTab` — **não são editadas diretamente**; já consomem `ConfigListRow` + tokens `C` e devem herdar o visual novo automaticamente do Bloco A
- Backend, banco de dados, migrations, `.env`, CI/CD
- Uso standalone de `PlanosScreen` (fora do modo `embedded`)

## Decisões aplicadas

- **Decisão 1 — Dark mode:** manter funcionando. Os tokens novos ganham variante escura.
- **Decisão 2 — Tokens de cor:** criar conjunto novo escopado só a Configurações; **não** alterar `C` global em `dialogFormTokens.tsx`.
- **Decisão 3 — Fatiamento:** Fase 1 inteira em um único ciclo `/implementar` → `/finalizar`.

Decisões anteriores, já registradas na task:

- **Modelo de lista:** "Cards separados" (cada linha é um card com borda/sombra própria e `gap` entre elas), não "Tabela unificada". Preserva a estrutura atual do `ConfigListRow`; o que muda é a compactação e o estilo.
- **Tipografia:** Figtree apenas na tela de Configurações, mantendo o resto do app como está.
- **Telas não desenhadas no mockup:** implementar direto seguindo o padrão, sem mockup intermediário. Validação via `/run`.

## Leitura de contexto

Arquivos de contexto lidos:

- `/AGENT.md` (raiz do monorepo) — existe
- `sistema financas/AGENT.md` — existe. **Observação:** seu conteúdo descreve um backend multi-tenant/multi-prefeitura com Drizzle, herdado de outro projeto; não se aplica a esta task, que é frontend-only e cujo projeto não é multi-tenant.
- `sistema financas/CLAUDE.md` — regras de workflow obrigatório
- `frontend/AGENT.md` — **não existe** neste projeto (não há pasta `frontend/`; o código do front vive em `src/`)
- `backend/AGENT.md` — **não existe** neste projeto (há pasta `backend/`, mas sem AGENT.md próprio)
- `.portal/tasks/Readequacao visual da tela de Configuracoes com base em mockup.md` — especificação da feature

Arquivos do projeto inspecionados durante a investigação:

- `src/layout/ConfigPanel.tsx`, `src/ui/dialog.tsx`, `src/ui/dialogFormTokens.tsx`, `src/ui/ConfigListRow.tsx`, `src/ui/ListToolbar.tsx`, `src/ui/InfoBanner.tsx`, `src/ui/EmptyState.tsx`, `src/ui/form.tsx` (`ToggleGroup`)
- `src/screens/config/`: `ContasTab.tsx`, `CategoriasTab.tsx`, `CartaoTab.tsx`, `AcessosTab.tsx`, `SecurityTab.tsx`, `RepresentantesTab.tsx`, `MembrosTab.tsx`
- `src/context/AppContext.tsx` (tema), `tailwind.config.cjs`, `index.html`

## Descobertas da investigação

Quatro achados que moldaram este plano:

1. **A cor primária já está sincronizada.** `tailwind.config.cjs` define `brand-600: #0891b2` e `brand-700: #0e7490` — valores idênticos a `C.primary`/`C.primaryDark` em `dialogFormTokens.tsx`. Tailwind e tokens inline não conflitam na cor principal; a divergência está apenas nos tons de texto e borda.

2. **`Plus Jakarta Sans` nunca foi carregada.** `index.html`, `app.html`, `demo.html` e `assistant.html` importam somente `Cinzel`. O `Dialog.tsx` declara `fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif"` mas cai no fallback `system-ui`. Adicionar Figtree é portanto uma **correção**, não uma quebra de consistência.

3. **Dark mode está ativo e funcional** — `src/context/AppContext.tsx` persiste o tema em `localStorage` e alterna a classe `dark` no `<html>`; `tailwind.config.cjs` usa `darkMode: 'class'`. `Dialog`, `EmptyState` e `ToggleGroup` têm classes `dark:`. O mockup é light-only com cores hardcoded — daí a decisão 1.

4. **`ListToolbar` já é a "barra de ações" do padrão** (contador + filtros + ação alinhada à direita), hoje usada por `MembrosTab`. Precisa apenas de reestilo, não de redesenho estrutural. `ContasTab`, `CategoriasTab` e `RepresentantesTab` montam essa barra manualmente — convergi-las para o `ListToolbar` é oportunidade, mas fica como item opcional para não inflar a Fase 1.

## Impacto por área

### Frontend

**Solução técnica central — CSS custom properties escopadas**

A combinação das decisões 1 (dark mode) e 2 (tokens escopados) define a abordagem. Tokens como objeto JS estático não reagem à classe `.dark` no `<html>`; a forma correta é CSS custom properties:

```css
/* src/styles/globals.css */
.config-scope {
  --cfg-text:      #0f172a;
  --cfg-muted:     #64748b;
  --cfg-border:    #e9eef3;
  --cfg-border-soft: #eef2f6;
  --cfg-surface:   #ffffff;
  --cfg-surface-alt: #fcfdfe;
  --cfg-primary:   #0891b2;
  --cfg-primary-dark: #0e7490;
  --cfg-primary-soft: #e0f2f7;
  /* ... demais tokens do mockup */
  font-family: 'Figtree', system-ui, sans-serif;
}

.dark .config-scope {
  --cfg-text:      #e8eef2;
  --cfg-muted:     #94a3b8;
  --cfg-border:    #334155;
  /* ... derivados dos tons slate-* já usados nas classes dark: existentes */
}
```

O container de Configurações (`ConfigPanel`) recebe `className="config-scope"`; os componentes consomem `var(--cfg-text)` etc. Isso resolve três requisitos de uma vez:

- **Variante escura** funciona via CSS puro, sem JS e sem duplicar objetos de token
- **Escopo restrito**: fora de `.config-scope` as variáveis não existem, então `ExpenseDialog`, `IncomeDialog` e `ClienteDetail` ficam intocados
- **Tipografia escopada**: a fonte entra na mesma classe, resolvendo o escopo tipográfico sem precisar de prop nova no `Dialog` (a fonte é herdada do ancestral)

`src/ui/configTokens.ts` exporta os nomes das variáveis como constantes tipadas, para os componentes não espalharem strings mágicas de `var(--cfg-*)`.

Os valores do modo escuro devem ser **derivados dos tons já usados nas classes `dark:` existentes** do projeto (`slate-800`, `slate-700`, `slate-300`), não inventados do zero.

**Componentes**

- `ConfigListRow.tsx` — reescrever para linha compacta de 38–40px: índice em JetBrains Mono (`01`, `02`), avatar/badge opcional, nome, data, slot para badges de status, chevron. Manter o modelo de card separado (borda + sombra próprias, `gap` entre linhas). **Preservar a assinatura de props** (`index`, `nome`, `dataCriacao`, `dataAtualizacao`, `colorScheme`, `foto`, `onClick`) para que `RepresentantesTab` e `MembrosTab` herdem sem edição.
- `dialog.tsx` — botão X circular com fundo `#f1f5f9`, espaçamentos do mockup. Remover o `fontFamily` inline de `Plus Jakarta Sans` (fonte morta, ver descoberta 2) para que a fonte seja herdada do escopo. **Preservar todas as classes `dark:` existentes** e a API (`size`, `scrollBody`, `description`).
- `ListToolbar.tsx`, `InfoBanner.tsx`, `EmptyState.tsx` — reestilo com as variáveis, mantendo as variantes dark.
- `ConfigPanel.tsx` — sidebar agrupada em 4 seções com headers uppercase: **Geral** (Contas, Assinatura, Segurança), **Finanças** (Categorias, Cartões, Catálogo de serviços), **Pessoas** (Usuários, Membros/Colaboradores, Acessos), **Avançado** (Integrações de IA). Item ativo em pill `--cfg-primary-soft` / texto `--cfg-primary-dark`. **Preservar integralmente** a lógica de visibilidade condicional (`canViewAnalytics`, `isAdmin`, `isGestor`, `contaTipo !== 'pessoal'`) e o rótulo dinâmico Membros→Colaboradores. Grupos que ficarem vazios após a filtragem não devem renderizar seu header.

**Telas**

- `ContasTab` — cabeçalho (contador + toggle Ativas/Desativadas + botão "Nova conta"), `InfoBanner` âmbar, lista. No `ContaDialog`, readequar apenas os campos comuns e os de PF (nome, CPF, telefone, e-mail, data de nascimento). **A parte PJ do mesmo formulário fica visualmente como está** até a Fase 2, mas não pode quebrar.
- `CategoriasTab` — árvore raiz + subcategorias com indentação, badge "N sub", botão "Subcategoria", caret de expansão. `CategoriaDialog`.
- `CartaoTab` — grid de cards com preview visual (gradiente na cor do cartão, chip, últimos 4 dígitos em mono, nome, validade, limite, badge de tipo) + card tracejado "Adicionar cartão". No `CartaoDialog`, preview ao vivo ao lado dos campos. Usar as 8 cores já existentes em `COR_OPCOES`.
- `AcessosTab` — cards de KPI compactos, seletor de período em pill, lista de últimas contas criadas. Avaliar o banner de aviso do mockup (ver "Perguntas em aberto").
- `SecurityTab` — é formulário, não lista. Aplicar a linguagem visual (variáveis, `cardStyle`, campos, botão primário), sem a estrutura "barra de ações + lista".
- `PlanosScreen` — apenas o caminho `embedded`: cards de plano lado a lado (Plus / Premium destacado), card de plano ativo, ação de cancelamento.

**Estados e acessibilidade**

Preservar em todas as telas: loading, vazio (`EmptyState`), erro (`ErrorState` em `AcessosTab`), e todos os pontos de ancoragem de `FirstAccessGuideCard`/`useFirstAccessGuide`.

### Backend

`Sem impacto esperado`

### Banco de dados

`Sem impacto esperado`

Nenhuma migration é necessária nesta Fase 1.

> **Atenção:** migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Impacto mínimo: duas famílias de fontes novas (Figtree, JetBrains Mono) carregadas via Google Fonts em `index.html` e `app.html`, seguindo o padrão de `preconnect` + `stylesheet` já usado por `Cinzel`. Sem env vars, jobs, workers ou storage.

Considerar limitar os pesos carregados (ex. Figtree 400/500/600/700 e JetBrains Mono 500) para não penalizar o carregamento inicial.

## Arquivos provavelmente afetados

### Bloco A — Base

- `index.html`, `app.html` (fontes)
- `src/styles/globals.css` (custom properties claro/escuro)
- `src/ui/configTokens.ts` (**novo**)
- `src/ui/ConfigListRow.tsx`
- `src/ui/dialog.tsx`
- `src/ui/ListToolbar.tsx`
- `src/ui/InfoBanner.tsx`
- `src/ui/EmptyState.tsx`
- `src/layout/ConfigPanel.tsx`

### Bloco B — Telas

- `src/screens/config/ContasTab.tsx`
- `src/screens/config/CategoriasTab.tsx`
- `src/screens/config/CartaoTab.tsx`
- `src/screens/config/AcessosTab.tsx`
- `src/screens/config/SecurityTab.tsx`
- `src/screens/planos/PlanosScreen.tsx`

### Não editados, mas afetados por herança (validar)

- `src/screens/config/RepresentantesTab.tsx`
- `src/screens/config/MembrosTab.tsx`
- `src/screens/config/ClienteDetail.tsx` (usa o mesmo `Dialog`)

## Estratégia de implementação

A ordem é por alavancagem: base primeiro, telas depois. Em **cada arquivo**, aplicar a regra de redesign do projeto — **remover o estilo/código antigo primeiro, depois aplicar o novo**, como dois sub-passos distintos, nunca sobrepondo Tailwind antigo com estilo novo.

1. **Fontes** — adicionar Figtree + JetBrains Mono em `index.html` e `app.html` (padrão do `Cinzel`).
2. **Tokens** — criar o bloco `.config-scope` (claro + escuro) em `globals.css` e o módulo `src/ui/configTokens.ts` com as constantes das variáveis.
3. **`ConfigListRow.tsx`** — remover o estilo Tailwind atual, aplicar a linha compacta. Preservar assinatura de props e os 3 `colorScheme`.
4. **`dialog.tsx`** — remover o `fontFamily` morto e o estilo do X atual; aplicar X circular e espaçamentos. Preservar API e classes `dark:`.
5. **`ListToolbar.tsx`, `InfoBanner.tsx`, `EmptyState.tsx`** — reestilo com as variáveis.
6. **`ConfigPanel.tsx`** — aplicar `.config-scope` no container; reestruturar a nav em grupos preservando toda a lógica de visibilidade condicional.
7. **Checkpoint** — validar via `/run` que Configurações renderiza corretamente e que `RepresentantesTab`/`MembrosTab` já herdaram o visual, **antes** de seguir para as telas. Um problema de fundação aparece aqui, não depois de 6 telas mexidas.
8. **`ContasTab`** — cabeçalho, lista, parte comum/PF do `ContaDialog`.
9. **`CategoriasTab`** — árvore e `CategoriaDialog`.
10. **`CartaoTab`** — grid com preview visual + preview ao vivo no `CartaoDialog`.
11. **`AcessosTab`** — KPIs, período, lista.
12. **`SecurityTab`** — linguagem visual.
13. **`PlanosScreen`** (`embedded`) — cards de plano.
14. **Validação final** — `/run` completo em tema claro e escuro + `npm run build`.

## Regras de negócio identificadas

Esta é uma task de apresentação; as regras abaixo existem hoje e **devem ser preservadas sem alteração**:

- Visibilidade de abas: `acessos` só quando `canViewAnalytics` (documento em `ANALYTICS_ALLOWED_DOCUMENT`); `integracoes-ia` só admin; `membros` só gestor/admin; `representantes` e `socios` só quando `contaTipo !== 'pessoal'`
- Rótulo dinâmico: "Membros da família" (PF) vs "Colaboradores" (PJ), mesma tela e mesmo dado (`conta_membros`)
- `isContaIncompleta()` — badge "Conta incompleta" quando falta e-mail, ou razão social/enquadramento (PJ), ou telefone/data de nascimento (PF)
- Conta padrão (`eh_padrao`) não pode ser arquivada
- Contas inativas exibem ação "Reativar"
- Categorias inativas aparecem com opacidade reduzida e texto riscado
- `CategoryPreview` por enquadramento no cadastro de conta PJ

## Regras multi-tenant e segurança

**Este projeto não é multi-tenant** no sentido de organizações isoladas — é uso pessoal, com o conceito de "conta"/perfil (PF vs PJ). O `AGENT.md` do subprojeto descreve um cenário multi-prefeitura herdado de outro projeto que não se aplica aqui.

Cuidados desta task:

- **Nenhuma lógica de autorização pode ser alterada.** `canViewAnalytics`, `isAdmin`, `isGestor` e o filtro por `contaTipo` são apenas reorganizados visualmente ao agrupar a sidebar — o comportamento deve permanecer idêntico.
- Ao agrupar a nav, garantir que nenhum item passe a aparecer para quem não o via antes. O agrupamento é puramente visual, aplicado **sobre** a lista já filtrada.
- Sem exposição de dados novos: nenhuma tela passa a exibir informação que já não exibisse.

## Validações necessárias

Nenhuma validação de input, schema ou payload é alterada. Os formulários mantêm exatamente as validações atuais (`required`, `type="email"`, `maxLength` de CPF/CNPJ, formato de validade de cartão em `formatValidade`, força de senha em `SecurityTab`).

## Testes necessários

O projeto **não tem infraestrutura de testes automatizados**; a validação é manual via `/run`, conforme prática registrada nos planos anteriores.

### Frontend (manual, via `/run`)

Executar **em tema claro e em tema escuro**:

- **Contas** — listagem, toggle Ativas/Desativadas, criar e editar conta PF, badges "Conta padrão"/"Conta incompleta", ação Reativar
- **Categorias** — árvore, expandir/recolher, criar categoria e subcategoria, desativar/ativar
- **Cartões** — grid com preview, card "Adicionar", criar e editar cartão, preview ao vivo refletindo nome/últimos 4/cor/validade/limite/tipo
- **Acessos** — KPIs, troca de período 7/30/90, lista de contas criadas
- **Segurança** — troca de senha, indicador de força, mensagens de erro
- **Assinatura** — cards de plano, plano ativo, cancelamento
- **Sidebar** — 4 grupos, item ativo, e visibilidade condicional testada em conta PF e conta PJ
- Responsividade do drawer nas larguras suportadas

### Regressão obrigatória (telas não editadas)

- **Representantes** e **Membros/Colaboradores** — devem ter herdado o visual novo de `ConfigListRow`/`Dialog` sem quebra
- **`ClienteDetail`** (fora de Configurações) — usa o mesmo `Dialog`; confirmar que **não** mudou de aparência e que não herdou Figtree

### Guias de primeiro acesso

Verificar ancoragem correta de: `perfis:novo-v1`, `contas:enquadramento-v1`, `categorias:nova-v1`, `categorias:sub-v1`, `categorias:desativar-v1`, `cartoes:limite-v1`, `cartoes:validade-v1`, `cartoes:fechamento-vencimento-v1`.

### Backend

`Não aplicável` — sem mudança de backend.

### E2E

`Não aplicável` — sem infraestrutura de E2E no projeto.

## Comandos de validação sugeridos

```bash
npm run build
```

Verificar também se o projeto tem lint/typecheck configurados em `package.json` antes de assumir os comandos:

```bash
npm run lint
npm run typecheck
```

## Riscos e pontos de atenção

| Risco | Mitigação |
|---|---|
| **Dark mode quebrar** nas telas tocadas | Custom properties com bloco `.dark .config-scope`; validar as duas temas no `/run` (decisão 1) |
| **Vazamento de estilo** para fora de Configurações | Escopo por `.config-scope`; variáveis não existem fora dela. Validar `ExpenseDialog`, `IncomeDialog`, `ClienteDetail` |
| `Dialog` é **compartilhado** com `ClienteDetail` fora de Configurações | Mudanças estruturais neutras; a fonte vem por herança do ancestral, não de prop. Regressão obrigatória em `ClienteDetail` |
| `ConfigListRow` tem **4 consumidores** (Contas, Representantes, Membros + variante em Categorias) | Preservar assinatura de props; validar Representantes/Membros no checkpoint da etapa 7 |
| `FirstAccessGuideCard` **desancorar** ao reorganizar layout | Preservar todos os pontos de ancoragem; checklist de guias no `/run` |
| **Entrega grande** em ciclo único (decisão 3) | Ordem base→telas + checkpoint na etapa 7 permite detectar problema de fundação antes das 6 telas |
| Sidebar agrupada **alterar visibilidade** de itens | Agrupar apenas visualmente, sobre a lista já filtrada; testar em conta PF e PJ |
| `PlanosScreen` tem uso **standalone** além do `embedded` | Alterar somente o caminho `embedded` |
| Fontes novas penalizarem carregamento | Limitar pesos carregados; usar `display=swap` como já feito com `Cinzel` |
| Parte PJ do `ContaDialog` ficar **visualmente inconsistente** durante a Fase 1 | Aceito conscientemente — é resolvido na Fase 2; garantir apenas que não quebre |

## Perguntas em aberto

1. **Banner de aviso em `AcessosTab`** — o mockup mostra um banner âmbar ("Estatísticas de login ainda não disponíveis — contas criadas já aparecem abaixo"). Deve ser condicional (aparecer só quando não houver dados de login) ou fixo? Sugestão: condicional, para não poluir a tela quando os dados existirem.
2. **`ListToolbar` unificado** — `ContasTab`, `CategoriasTab` e `RepresentantesTab` montam a barra de ações manualmente hoje. Convergi-las para o `ListToolbar` é oportunidade de reduzir duplicação, mas amplia o diff da Fase 1. Sugestão: deixar para depois, não bloqueia o padrão visual.
3. **Pesos de fonte** — confirmar durante a implementação quais pesos de Figtree são realmente usados, para não carregar famílias inteiras à toa.

Nenhuma dessas bloqueia o início da implementação.

## Critérios de aceite do plano

A implementação da Fase 1 está pronta quando:

- As telas tocadas seguem o padrão do mockup: sidebar agrupada em 4 grupos, linhas de 38–40px em cards separados, modais com X circular e footer padronizado, paleta e tipografia Figtree/JetBrains Mono
- **Dark mode funciona** em todas as telas tocadas
- **Nenhuma alteração visual fora de Configurações** — `ExpenseDialog`, `IncomeDialog` e `ClienteDetail` permanecem idênticos
- `RepresentantesTab` e `MembrosTab` herdaram o visual novo sem regressão, **sem terem sido editadas**
- Todos os `FirstAccessGuideCard` continuam ancorados corretamente
- Toda a lógica de visibilidade condicional da sidebar funciona como antes, testada em conta PF e PJ
- Preview visual de cartão reflete corretamente os dados reais (nome, últimos 4, cor, validade, limite, tipo), na listagem e no formulário
- Nenhum componente mistura estilo antigo e novo simultaneamente
- `npm run build` conclui sem erros

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto, junto com a task em `.portal/tasks/`.
- Seguir `/AGENT.md` (raiz). Observar que `sistema financas/AGENT.md` descreve um cenário backend multi-tenant que **não se aplica** a esta task frontend-only.
- **Regra remove-then-apply**: em cada arquivo, remover o estilo/código antigo como um passo, e aplicar o novo como outro passo. Nunca deixar Tailwind antigo convivendo com estilo novo no mesmo componente.
- **Respeitar a ordem**: Bloco A (etapas 1–6) inteiro antes do Bloco B (etapas 8–13). Fazer o checkpoint da etapa 7 antes de seguir.
- **Não editar** `RepresentantesTab.tsx` nem `MembrosTab.tsx` — elas devem herdar. Se após o checkpoint ainda estiverem inconsistentes, reportar em vez de editar por conta própria.
- **Não alterar** os tokens `C` em `dialogFormTokens.tsx` (decisão 2).
- **Não alterar** nenhuma lógica de autorização, query, service ou tipo.
- Não executar migrations (nenhuma é necessária aqui).
- Não alterar `.env`.
- Preservar todos os `useFirstAccessGuide`/`FirstAccessGuideCard`.
- Ao final, rodar `npm run build` e reportar o resultado honestamente.
