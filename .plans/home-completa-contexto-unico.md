# Plano de Implementação: Home pública — visão completa e unificada

## Origem

- Arquivo de especificação: `docs/features/home-completa-contexto-unico.md`
- Data do planejamento: `2026-08-15`
- Classificação: `frontend-only`

## Resumo

Rodadas anteriores trataram a Home em pedaços (retoques visuais soltos, depois modal, depois
réplica simplificada rejeitada, depois decisão técnica de telas reais) e isso gerou resultado
fragmentado. Este plano trata a Home como uma peça única e coesa: substitui a seção interativa
rejeitada (`src/screens/public/components/demo-app/*`) pela implementação definitiva com as telas
reais do sistema (`FinanceDashboard`, `MovimentacoesScreen`, `ExpenseDialog`, `IncomeDialog`,
dentro de `AppShell`) rodando com dados fake resolvidos via interceptação condicional em
`apiRequest`; adiciona um indicador de scroll no hero guiando o olhar para a seção interativa; e
adiciona um bloco de CTA final após as avaliações, para a página terminar em conversão em vez de
terminar abruptamente. Paleta de cores e identidade visual (`site-*`/`brand-*`) são preservadas.

## Escopo

### Dentro do escopo

**1. Seção interativa real (peça central, maior esforço)**

- `DemoModeProvider`: contexto React com banco fake em memória, usando os tipos `Raw*` já
  existentes nos services reais (`RawIncome`, `RawExpense`, `Categoria`, `Cartao`, `Reserva`,
  etc.), para que o parsing já existente em cada service (`incomeFromApi`, `expenseFromApi`, etc.)
  funcione sem duplicação.
- Interceptador condicional em `apiRequest` (`src/services/apiClient.ts`): quando dentro do
  contexto demo, resolve o endpoint/verbo contra o banco fake em memória em vez de fazer `fetch`
  real. Cobre os ~14 endpoints mapeados em
  `.portal/tasks/real-screens-with-fake-data-provider-in-home.md`.
- Ações sem sentido em uma demo sem histórico persistente (fechar mês, faturar contrato) recebem
  resposta fake de sucesso genérica, sem lógica de negócio real por trás.
- `AppShell.tsx`: pequenas adaptações condicionais (prop ou contexto) para que logout e
  notificações reais virem no-op no modo demo, sem alterar seu comportamento fora dele.
- Nova seção em `HomePage.tsx`, envolvida pelo `DemoModeProvider`, renderizando `AppShell` +
  `FinanceDashboard`/`MovimentacoesScreen` (com `ExpenseDialog`/`IncomeDialog` reais acionáveis a
  partir delas), com badge/indicador permanente de "Demonstração".
- Remoção definitiva de `src/screens/public/components/demo-app/*` (implementação anterior
  rejeitada pelo usuário).

**2. Hero — indicador de continuidade**

- Adicionar um indicador visual de scroll (ex. seta com animação sutil de "bounce" infinito, ou
  texto curto tipo "veja funcionando abaixo") no final do hero (`SitePageHero.tsx`), guiando o
  olhar do visitante para a seção interativa logo a seguir. Implementado com `framer-motion`,
  respeitando `prefers-reduced-motion` (já usado no restante do hero).
- Não redesenhar o hero além disso — a animação de entrada existente (label/título/descrição já
  animados) é mantida como está.

**3. Bloco de CTA final**

- Novo bloco entre a seção de avaliações e o `SiteFooter`, com título curto e botão de conversão,
  seguindo o padrão visual já estabelecido no projeto (`site-neon-light-button`, `ScrollReveal`
  para entrada ao rolar).

### Fora do escopo

- Reabrir a decisão técnica de como a seção interativa busca dados — já validada (interceptação
  em `apiRequest`), tratada como resolvida.
- Redesenho do hero além do indicador de scroll.
- Mudanças na composição da seção de avaliações além do que já existe hoje (`ScrollReveal` já
  aplicado).
- Mudança de paleta de cores ou tokens do Tailwind.
- Persistência real, autenticação real, conta demo no banco, multi-perfil (Pessoal/Empresa) na
  seção interativa.
- Anexos de arquivo funcionais na versão fake.
- Réplica de regras de negócio complexas (cálculo real de comissão, faturamento completo de
  contrato).
- Páginas públicas além da Home.

## Leitura de contexto

- `/AGENT.md` (raiz do projeto) — lido em ciclos anteriores desta mesma sessão. Majoritariamente
  backend/multi-tenant/Drizzle; sem impacto direto nesta feature frontend-only. Não existem
  `frontend/AGENT.md` nem `backend/AGENT.md` separados.
- `docs/features/home-completa-contexto-unico.md` — especificação desta rodada, consolidando
  decisões de rodadas anteriores.
- `.portal/tasks/real-screens-with-fake-data-provider-in-home.md` — mapeamento técnico completo
  já realizado das ~14 fontes de dados usadas pelas 4 telas reais (`FinanceDashboard`,
  `MovimentacoesScreen`, `ExpenseDialog`, `IncomeDialog`), incluindo services de origem e formato
  bruto (`Raw*`) esperado por cada um.
- `src/screens/public/HomePage.tsx` — lido por completo; estado atual confirmado (Header → Hero →
  `HomeInteractiveDemo` → Avaliações condicionais → Footer).
- `src/screens/public/components/SitePageHero.tsx` — lido por completo; já tem animação de
  entrada via `framer-motion` (label/título/descrição/linha decorativa, com
  `useReducedMotion`), em ambos os tons (`dark`/`light`). Mantida como está, só recebe o novo
  indicador de scroll.
- `src/screens/public/components/ScrollReveal.tsx` — helper de animação de entrada ao rolar já
  existente e reaproveitável para o novo bloco de CTA final.
- `src/screens/public/components/SiteFooter.tsx` — lido por completo; enxuto, sem necessidade de
  alteração.
- `src/services/apiClient.ts` — lido por completo; ponto único de convergência de todos os
  services (`apiRequest`), confirmando ser o melhor ponto de interceptação (menor blast radius,
  reaproveita parsing já existente em cada service).
- `src/layout/AppShell.tsx` — lido por completo; referência de moldura real (sidebar, header,
  logout, notificações, `PerfilSwitcher`) a ser adaptada condicionalmente para o modo demo.
- `src/hooks/useFinanceDashboard.ts`, `src/services/configService.ts` — lidos em ciclos
  anteriores; confirmam padrão de services simples (`Promise<T>` tipada) que facilita a
  interceptação sem duplicar lógica de parsing.
- `vite.config.ts` — lido; confirma dois entry points (`app.html` autenticado, `index.html`
  público) compartilhando o mesmo código-fonte — importar as telas reais na Home as inclui também
  no bundle público, sem necessidade de configuração de build adicional.
- `src/screens/public/components/demo-app/*` — implementação anterior rejeitada pelo usuário,
  identificada para remoção nesta rodada.

## Impacto por área

### Frontend

- **Novo**: `src/services/demo/demoModeContext.tsx` — `DemoModeProvider` e hook de acesso ao
  contexto (flag de modo demo ativo + acesso ao banco fake em memória).
- **Novo**: `src/services/demo/fakeApiResolver.ts` — resolvedor que, dado um endpoint e método,
  devolve dados do banco fake no formato bruto (`Raw*`) esperado pelos services reais, ou aplica
  mutações (adicionar despesa, criar categoria, etc.) sobre o estado em memória.
- **Editado**: `src/services/apiClient.ts` — `apiRequest` ganha um desvio condicional: se o
  `DemoModeProvider` sinaliza modo demo ativo (via contexto acessado por um mecanismo a definir
  na implementação, ex. variável de módulo setada pelo provider ou parâmetro opcional), resolve
  contra o banco fake em vez de fazer `fetch` real. Fora do modo demo, comportamento 100%
  inalterado.
- **Editado**: `src/layout/AppShell.tsx` — logout e notificações reais tornam-se no-op quando
  renderizado dentro do contexto demo; `PerfilSwitcher` omitido/desabilitado (sem impacto fora do
  modo demo).
- **Editado**: `src/screens/public/HomePage.tsx` — nova seção interativa substituindo
  `HomeInteractiveDemo` (versão antiga); novo bloco de CTA final entre avaliações e footer.
- **Editado**: `src/screens/public/components/SitePageHero.tsx` — novo indicador de scroll
  animado ao final do conteúdo do hero, em ambos os tons.
- **Removido**: `src/screens/public/components/demo-app/` (diretório inteiro: `DemoAppShell.tsx`,
  `HomeInteractiveDemo.tsx`, `MovimentacoesDemo.tsx`, `PainelDemo.tsx`, `ReservasDemo.tsx`,
  `RelatoriosDemo.tsx`, `useDemoFinanceState.ts`).
- Sem impacto em query keys reais, hooks reais ou services reais além da interceptação
  condicional em `apiRequest` — as 4 telas e os ~14 services mantêm seu código-fonte inalterado.
- Estados de loading/error/empty: preservados automaticamente, já que as telas reais já os tratam;
  o banco fake deve responder de forma síncrona/rápida o suficiente para não expor esses estados
  de forma estranha (ex. sem delay artificial desnecessário).

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado. Sem novas dependências (`framer-motion` já instalado).

## Arquivos provavelmente afetados

- `src/services/apiClient.ts`
- Novo: `src/services/demo/demoModeContext.tsx`
- Novo: `src/services/demo/fakeApiResolver.ts`
- `src/layout/AppShell.tsx`
- `src/screens/public/HomePage.tsx`
- `src/screens/public/components/SitePageHero.tsx`
- Removido: `src/screens/public/components/demo-app/*`

## Estratégia de implementação

Dividida em sub-etapas com checkpoint de validação intermediária, dado o tamanho da mudança
técnica central.

1. Criar `DemoModeProvider` e o banco fake em memória (estrutura de dados nos formatos `Raw*`,
   seed inicial com 1-2 exemplos por entidade relevante — despesa, receita, categoria, cartão).
2. Implementar o resolvedor de banco fake para o núcleo: receitas, despesas, categorias, cartões
   (cobre `FinanceDashboard` + `MovimentacoesScreen` + `ExpenseDialog`).
3. Adicionar o interceptador condicional em `apiRequest`, testando que fora do modo demo nada
   muda.
4. Adaptar `AppShell.tsx` (logout/notificações no-op, `PerfilSwitcher` omitido no modo demo).
5. Montar a seção interativa em `HomePage.tsx` com o núcleo acima (Dashboard + Movimentações +
   diálogo de despesa), remover `demo-app/*` antigo.
6. **Checkpoint**: validar com o usuário via `/run` que o núcleo funciona (lançar despesa, ver
   refletir no dashboard) antes de expandir para o restante.
7. Expandir o resolvedor de banco fake: representantes, tipos de receita, contratos, clientes
   (cobre `IncomeDialog` completo).
8. Expandir o resolvedor: reservas e ações fake de sucesso (fechar mês, faturar contrato).
9. Adicionar indicador de scroll animado no hero (`SitePageHero.tsx`).
10. Adicionar bloco de CTA final após avaliações em `HomePage.tsx`.
11. Rodar `npx tsc --noEmit` e `npx vite build`.
12. Validação visual e funcional final com o usuário via `/run`, cobrindo: lançar despesa/receita
    reais refletindo entre telas, criar categoria, hero com indicador de scroll, CTA final
    visível, e confirmação de que nenhuma chamada de rede real ocorre a partir do modo demo
    (inspecionável via aba de rede do navegador).

## Regras de negócio identificadas

- Nenhum dado inserido no modo demo deve ser persistido ou enviado à API real, sob nenhuma
  circunstância.
- Fora do modo demo, o comportamento do app autenticado real deve permanecer 100% inalterado —
  qualquer regressão aqui é considerada crítica, dado que `apiRequest` é usado por todo o sistema
  em produção.
- A demonstração deve deixar claro, de forma permanente e visível, que é uma demonstração.
- Categorias/cartões/etc. na demo são pré-definidos no seed; não há necessidade de replicar fluxo
  de onboarding real.

## Regras multi-tenant e segurança

Não aplicável no sentido de tenant/prefeitura (projeto usa `perfil_id`/`usuario_id`, não é
multi-prefeitura). Pontos de atenção:

- Garantir que a interceptação em `apiRequest` seja estritamente condicional e não vaze para
  requisições fora do contexto demo — risco de maior impacto deste plano, já que afeta um arquivo
  usado por todo o app em produção.
- Garantir que nenhuma leitura/escrita do modo demo toque `localStorage`/`sessionStorage` de forma
  que colida com uma sessão real do mesmo navegador (ex. token de autenticação, perfil ativo).
- Garantir que nenhum dado da demo seja enviado à API real, mesmo que uma função de service real
  seja acidentalmente referenciada durante a implementação.

## Validações necessárias

- Formulários das telas reais (`ExpenseDialog`, `IncomeDialog`) já têm validação própria — deve
  continuar funcionando normalmente contra o banco fake (mesma UX de erro/sucesso).

## Testes necessários

### Frontend

- Verificação manual: nenhuma chamada de rede real ocorre a partir do modo demo (aba de rede do
  navegador).
- Verificação manual: lançar despesa/receita via diálogos reais reflete no dashboard e nas
  movimentações da demo.
- Verificação manual: fora do modo demo, o app autenticado real (`app.html`) continua funcionando
  normalmente — checar ao menos um fluxo de login/dashboard real após a mudança em `apiRequest`.
- Verificação visual: hero com indicador de scroll, seção interativa, CTA final — em mobile,
  tablet e desktop.

### Backend

Não aplicável.

### E2E

Não aplicável — funcionalidade de marketing/demonstração, sem fluxo de negócio real.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- **Risco mais crítico do plano**: `apiRequest` é o ponto central de acesso a dados de todo o
  sistema em produção (autenticado e público). Qualquer erro na condicional de interceptação pode
  afetar o app real. Mitigação: implementar e testar o desvio de forma estritamente aditiva,
  validar explicitamente que o comportamento fora do modo demo não muda em nenhum cenário antes de
  prosseguir.
- Mapear os ~14 formatos `Raw*` com precisão é trabalho fino — divergência de formato pode quebrar
  uma tela silenciosamente ou gerar erro confuso ao visitante da demo.
- Esta é a maior mudança já feita nesta Home ao longo de toda a série de iterações desta sessão.
- Sem ferramenta de screenshot automatizado neste ambiente — toda validação visual final depende
  do usuário conferir no navegador via `/run`.
- Checkpoint intermediário (passo 6 da estratégia) existe justamente para não repetir o padrão de
  entregar tudo de uma vez e descobrir tarde que não é o que o usuário queria.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. Decisões sobre composição do hero (indicador de scroll)
e reforço da seção de avaliações (CTA final) foram confirmadas pelo usuário nesta rodada. Decisão
técnica da seção interativa (interceptação em `apiRequest`) já estava validada em rodada anterior.

## Critérios de aceite do plano

- As 4 telas reais (Dashboard, Movimentações, diálogo de despesa, diálogo de receita) funcionam
  embutidas na Home, idênticas em código-fonte às telas de produção, sem nenhuma chamada de rede
  real.
- Lançamentos feitos na demo refletem corretamente entre as telas (Dashboard, Movimentações).
- Fora do modo demo, o comportamento do app autenticado real permanece 100% inalterado.
- Hero exibe indicador de scroll guiando para a seção interativa.
- Bloco de CTA final está presente e visível após a seção de avaliações.
- Badge/indicador de "Demonstração" está sempre visível dentro da seção interativa.
- `src/screens/public/components/demo-app/*` não existe mais no projeto.
- Build (`vite build`) e checagem de tipos (`tsc --noEmit`) passam sem erros.
- Usuário validou visualmente e funcionalmente no navegador antes de considerar a implementação
  concluída.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto, junto com o mapeamento técnico já feito em
  `.portal/tasks/real-screens-with-fake-data-provider-in-home.md`.
- Seguir a ordem de sub-etapas descrita na estratégia, respeitando o checkpoint de validação
  intermediária antes de expandir a cobertura de dados fake para `IncomeDialog`/reservas/ações
  avançadas.
- Não reabrir a decisão de arquitetura da interceptação em `apiRequest` — já validada.
- Não alterar as 4 telas reais nem os ~14 services além do que for estritamente necessário; a
  interceptação deve viver em `apiClient.ts` e no novo módulo de dados fake.
- Não instalar novas dependências (`framer-motion` já disponível).
- Não persistir nenhum dado da demo em backend/API real, em nenhuma circunstância.
- Validar explicitamente, antes de finalizar, que o comportamento do app autenticado real não foi
  afetado pela mudança em `apiRequest`.
- Validar visualmente com `/run` antes de considerar a implementação concluída.
