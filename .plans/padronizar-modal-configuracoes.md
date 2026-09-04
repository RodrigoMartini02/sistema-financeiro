# Plano de Implementação: Padronização Visual do Modal de Configurações

## Origem

- Arquivo de especificação: nenhum `.md` de feature — pedido direto do usuário a partir de um screenshot da aba "Usuários" do modal de Configurações, com levantamento de escopo feito por agente Explore (somente leitura) cobrindo todas as 12 abas do modal.
- Data do planejamento: 2026-09-04
- Classificação: `frontend-only`

## Resumo

O modal "Configurações" (`src/layout/ConfigPanel.tsx`, um `Drawer` com navegação lateral de abas) acumulou, ao longo de várias implementações incrementais, pelo menos 4 padrões diferentes de toolbar/filtro, 3 padrões diferentes de item de lista, 3 padrões diferentes de empty state, e 2 outliers estruturais fortes — sem nenhum componente compartilhado de toolbar/empty-state/banner que force consistência. O resultado visível (screenshot da aba "Usuários") é uma toolbar grande, com filtros e botão de tamanhos distintos, ocupando espaço vertical desproporcional ao conteúdo.

Este plano padroniza as 13 telas do modal (12 abas + o componente `Button` compartilhado que todas usam) em torno do padrão mais limpo já existente no próprio código (Serviços/Representantes/Sócios), introduzindo poucos componentes novos compartilhados em vez de deixar cada aba reinventar sua própria toolbar/lista/banner.

## Escopo

### Dentro do escopo

**Componentes compartilhados (base para tudo abaixo):**
- `src/ui/button.tsx`: adicionar prop opcional `size?: 'sm' | 'md'` (default `'md'`, preservando exatamente o comportamento/tamanho atual — nenhuma das 21 telas existentes que usam `Button` sem essa prop muda). `size="sm"` ≈ 36px de altura (`px-3.5 py-2 text-sm`, mantendo os mesmos `variant`s de cor já existentes).
- `src/ui/form.tsx`: recalibrar `ToggleGroup` para ≈36px de altura (`h-9` em vez de `h-10`), para bater com `Button size="sm"` quando usados na mesma linha.
- Novo componente de **toolbar de lista** (busca opcional + filtros opcionais + botão de ação), com todos os elementos na mesma altura (~36px), para substituir as implementações manuais divergentes de Usuários/Membros/Contas/Acessos.
- Novo componente de **empty state** padrão (ícone 28px, `py-10`, mesma tipografia), para substituir as 3 variações atuais (texto puro / ícone+texto com tamanhos diferentes / card com CTA embutido).
- Novo componente de **banner informativo** (cor variável: info/aviso), para substituir as 4 implementações manuais idênticas hoje espalhadas em Contas/Serviços/Representantes/Sócios.

**Abas a atualizar (usando os componentes acima):**
- `UsuariosTab.tsx` — toolbar (busca + 2 `ToggleGroup` + botão) recalibrada para altura única; espaçamento `gap-5` → `gap-3`/`gap-4`.
- `MembrosTab.tsx` — corrigir descompasso de altura entre busca (~36px) e `Button` (~42px); aplicar `size="sm"`.
- `ContasTab.tsx` — substituir o segmentado customizado (`p-0.5`/`px-2.5 py-1`) pelo `ToggleGroup` padrão recalibrado; alinhar altura do `Button` "Nova conta"; migrar o banner de aviso amber para o componente de banner compartilhado.
- `CategoriasTab.tsx` — **remover o double-boxing** (card externo duplicado `rounded-2xl border p-5` envolvendo tudo); trocar o botão vermelho customizado (`px-3 py-1.5`) pelo `Button size="sm"` variant apropriada; migrar `CategoriaRow` customizado para reaproveitar `ConfigListRow` (preservando a indentação de subcategoria).
- `CartaoTab.tsx` — simplificar os cards de cartão de crédito/débito: reduzir do visual "cartão físico" gradiente grande para um card mais compacto e discreto (mantendo a cor de identificação do cartão como um acento, não como fundo gradiente cobrindo o card inteiro); alinhar altura de botões de ação (editar/excluir hoje `h-8 w-8`) ao padrão do restante.
- `ServicosTab.tsx`, `RepresentantesTab.tsx`, `SociosTab.tsx` — já são o padrão de referência; ajuste mínimo (migrar banner para o componente compartilhado, `size="sm"` no `Button`, revisar `gap-4` → `gap-3` se aplicável).
- `AcessosTab.tsx` — substituir o segmentado customizado de período (7/30/90 dias, `p-1`/`px-3 py-1.5`) pelo `ToggleGroup` padrão recalibrado; alinhar altura do `Button variant="secondary"` "Atualizar"; migrar a linha de lista customizada (avatar `h-9 w-9` + texto) para reaproveitar `ConfigListRow` onde a informação exibida permitir.
- `IntegracoesIaTab.tsx` — aplicar `rounded-xl` em banners e `<section>` cards (hoje sem nenhum arredondamento); substituir a cor hardcoded `#0C9EAF` pelos tokens `C.primary`/`brand-*` já usados no resto do sistema; remover o `max-w-4xl` isolado (nenhuma outra aba do modal limita largura).
- `ConfigPanel.tsx` — nenhuma mudança estrutural necessária além de possíveis ajustes de `gap`/padding do container principal, se a compactação das abas internas deixar folgas inconsistentes.

**Redução geral de espaçamento vertical:**
- Espaçamentos genéricos `gap-5`/`gap-6` entre blocos (toolbar → lista, seções internas) revisados para `gap-3`/`gap-4` onde a legibilidade não for prejudicada, nas 11 abas do tipo "lista CRUD".

### Fora do escopo

- `SecurityTab.tsx` e `PlanosScreen.tsx` (aba "Assinatura", renderizada com `embedded`) — são estruturalmente formulário/fluxo de pagamento, não listas CRUD; recebem apenas alinhamento pontual de espaçamento/altura de botão se necessário durante a implementação, sem redesenho de layout.
- Qualquer mudança de comportamento, chamada de API, contrato de dados ou lógica de negócio — este plano é puramente visual/CSS/estrutura de componente.
- As 21 telas fora do modal de Configurações que também usam `Button`/`ToggleGroup`/`ConfigListRow` (ex.: `MovimentacoesScreen.tsx`, `DespesasScreen.tsx`, `ReceitasScreen.tsx`, `LoginPage.tsx`, etc.) — não são tocadas; a nova prop `size` do `Button` é opcional com default preservado exatamente para isolar esse impacto.
- Migração de dados, banco de dados, endpoints — nenhum impacto de backend.
- Dark mode: preservar as classes `dark:` já existentes onde houver, sem introduzir regressão, mas não é objetivo deste plano auditar cobertura de dark mode em abas que hoje não têm (ex.: `MembrosTab.tsx` não tem estilos dark hoje — não será adicionado agora, só não puxado para trás caso já exista).

## Leitura de contexto

- `sistema financas/CLAUDE.md`, `sistema financas/AGENT.md` — mesmas notas de plano anteriores (modelo multi-prefeitura do `AGENT.md` não se aplica; princípios gerais de qualidade aplicados).
- `frontend/AGENT.md`, `backend/AGENT.md` — não existem como arquivos dedicados neste projeto.
- `src/layout/ConfigPanel.tsx` — lido por completo (estrutura do Drawer, lista de abas, visibilidade condicional por papel).
- `src/screens/config/UsuariosTab.tsx`, `MembrosTab.tsx` — lidos por completo (toolbar pesada, mismatch de altura, base do pedido original).
- `src/screens/config/CategoriasTab.tsx` (trecho inicial) — confirmação do double-boxing.
- Levantamento completo via agente Explore (somente leitura) das 9 abas restantes (`ContasTab`, `CategoriasTab` completo, `CartaoTab`, `ServicosTab`, `RepresentantesTab`, `SociosTab`, `AcessosTab`, `IntegracoesIaTab`, `SecurityTab`) e `PlanosScreen.tsx` (trecho inicial), catalogando estrutura de toolbar, alturas, espaçamento, empty state e padrão de item de lista de cada uma.
- `src/ui/ConfigListRow.tsx`, `src/ui/dialogFormTokens.tsx`, `src/ui/form.tsx`, `src/ui/button.tsx` — lidos por completo (primitivos compartilhados, base de todo o plano).
- Grep de uso de `ui/button` em todo `src/` — confirmado 21 arquivos consumidores, usado para dimensionar o risco da mudança na prop `size`.

## Impacto por área

### Frontend

**Componentes compartilhados (`src/ui/`):**
- `button.tsx`: nova prop `size?: 'sm' | 'md'` (default `'md'`), novo bloco de classes Tailwind para `sm`.
- `form.tsx`: `ToggleGroup` recalibrado para `h-9`.
- Novo arquivo (nome a definir na implementação, ex.: `src/ui/ListToolbar.tsx`): componente de toolbar (busca opcional + filtros opcionais + ação), altura única.
- Novo arquivo (ex.: `src/ui/EmptyState.tsx`): componente de empty state padrão.
- Novo arquivo (ex.: `src/ui/InfoBanner.tsx`): componente de banner informativo (variantes de cor: info/aviso).
- `ConfigListRow.tsx`: revisado se necessário para suportar os casos de uso de `CategoriasTab` (indentação de subcategoria) e `AcessosTab` (avatar circular) sem quebrar os consumidores atuais.

**Abas (`src/screens/config/`):** conforme listado em "Dentro do escopo" — `UsuariosTab.tsx`, `MembrosTab.tsx`, `ContasTab.tsx`, `CategoriasTab.tsx`, `CartaoTab.tsx`, `ServicosTab.tsx`, `RepresentantesTab.tsx`, `SociosTab.tsx`, `AcessosTab.tsx`, `IntegracoesIaTab.tsx`.

### Backend

`Sem impacto esperado`.

### Banco de dados

`Sem impacto esperado`.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `src/ui/button.tsx`
- `src/ui/form.tsx`
- `src/ui/ConfigListRow.tsx`
- Novo: `src/ui/ListToolbar.tsx` (ou nome equivalente definido na implementação)
- Novo: `src/ui/EmptyState.tsx`
- Novo: `src/ui/InfoBanner.tsx`
- `src/layout/ConfigPanel.tsx`
- `src/screens/config/UsuariosTab.tsx`
- `src/screens/config/MembrosTab.tsx`
- `src/screens/config/ContasTab.tsx`
- `src/screens/config/CategoriasTab.tsx`
- `src/screens/config/CartaoTab.tsx`
- `src/screens/config/ServicosTab.tsx`
- `src/screens/config/RepresentantesTab.tsx`
- `src/screens/config/SociosTab.tsx`
- `src/screens/config/AcessosTab.tsx`
- `src/screens/config/IntegracoesIaTab.tsx`

## Estratégia de implementação

1. Criar os 3 componentes compartilhados novos (`ListToolbar`, `EmptyState`, `InfoBanner`) isolados, sem tocar em nenhuma aba ainda.
2. Adicionar `size` opcional ao `Button` e recalibrar `ToggleGroup`; rodar build para confirmar que nenhuma tela existente quebra (a prop é opcional, mudança aditiva).
3. Migrar as 3 abas já mais próximas do padrão (`ServicosTab`, `RepresentantesTab`, `SociosTab`) primeiro — menor risco, valida os componentes novos antes de tocar nas abas mais divergentes.
4. Migrar `UsuariosTab` e `MembrosTab` (o par que motivou o pedido original) — toolbar unificada, alturas alinhadas.
5. Migrar `ContasTab` e `AcessosTab` — trocar segmentados customizados pelo `ToggleGroup` recalibrado.
6. Migrar `CategoriasTab` — remover double-boxing, migrar `CategoriaRow` para `ConfigListRow` com suporte a indentação.
7. Migrar `CartaoTab` — simplificar visual dos cards mantendo identidade de cor.
8. Migrar `IntegracoesIaTab` — corrigir cantos/cores/largura.
9. Revisão final de espaçamento em `ConfigPanel.tsx` se necessário.
10. Rodar `npx tsc --noEmit -p .` e `npx vite build`.
11. Validação manual: abrir o modal de Configurações no navegador (dev server) e conferir visualmente cada uma das 12 abas, em especial os empty states (podem exigir dados de teste ou apenas inspeção do código de fallback).

## Regras de negócio identificadas

Não aplicável — este plano não altera regras de negócio, apenas apresentação visual.

## Regras multi-tenant e segurança

Não aplicável — sem mudança de acesso a dados, permissões ou queries. As mesmas condições de visibilidade de aba (`isAdmin`, `isGestor`, `canViewAnalytics`, `contaTipo`) em `ConfigPanel.tsx` permanecem inalteradas.

## Validações necessárias

- Nenhuma tela fora do modal de Configurações deve mudar visualmente após a introdução da prop `size` em `Button` (validar por inspeção visual rápida de 2-3 telas fora do modal, ex.: `DespesasScreen.tsx`, `LoginPage.tsx`).
- Cada aba migrada deve preservar exatamente o mesmo comportamento funcional (busca, filtros, paginação, criação, edição, exclusão) — só a apresentação muda.
- `CategoriasTab`: a migração de `CategoriaRow` para `ConfigListRow` precisa preservar a distinção visual entre categoria-pai e subcategoria (indentação), e a funcionalidade de expandir/colapsar.

## Testes necessários

### Frontend

- Abrir cada uma das 12 abas do modal de Configurações e conferir: toolbar compacta e alinhada, empty state (quando aplicável) consistente, item de lista com o mesmo componente visual nas abas que usam lista.
- Confirmar que os botões de ação principais (criar/editar/excluir) continuam funcionando em cada aba após a migração visual.
- Testar responsividade do modal (drawer) em telas estreitas, já que a compactação pode interagir com a navegação lateral que já usa `overflow-x-auto` em mobile.
- Testar dark mode nas abas que já o suportavam antes da mudança, para confirmar que não regrediu.

### E2E

- Não aplicável — mudança puramente visual, sem novo fluxo de dados a testar ponta a ponta.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit -p .
npx vite build
```

## Riscos e pontos de atenção

- Escopo toca 3 componentes compartilhados usados amplamente (`Button`, `ToggleGroup`, `ConfigListRow`) — qualquer regressão ali se propaga silenciosamente para telas fora deste plano; validar a prop `size` do `Button` como estritamente aditiva antes de prosseguir.
- `CategoriasTab` é a migração de maior risco funcional (reimplementação de `CategoriaRow` para `ConfigListRow` com suporte a hierarquia pai/subcategoria) — testar expansão/colapso e indentação com atenção redobrada.
- `CartaoTab`: "simplificar o visual gradiente/realista" é uma decisão de design com grau de subjetividade — like a implementação deve preservar a cor de identificação do cartão como âncora visual, evitando que os cards fiquem indistinguíveis entre si.
- Migração ampla (13 arquivos) aumenta a chance de divergência pontual entre abas mesmo após o plano — revisão visual final aba por aba é obrigatória antes de considerar o trabalho concluído.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisões de abordagem (prop `size` opcional no `Button`, escopo total das 12 abas, inclusão de `CartaoTab` na compactação) já confirmadas com o usuário.

## Critérios de aceite do plano

- As 12 abas do modal de Configurações usam altura consistente (~36px) para busca, filtros e botão de ação principal, quando presentes na mesma toolbar.
- Empty states, banners informativos e itens de lista seguem um único componente compartilhado cada, com as exceções documentadas como fora de escopo (`CartaoTab` mantém identidade visual própria, porém compactada; `SecurityTab`/`PlanosScreen` não são listas).
- `CategoriasTab` não tem mais double-boxing; `IntegracoesIaTab` usa cantos arredondados e tokens de cor consistentes com o resto do sistema.
- Nenhuma tela fora do modal de Configurações muda visualmente.
- `npx tsc --noEmit -p .` e `npx vite build` passam sem erros novos.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir `sistema financas/CLAUDE.md` (não há `backend/AGENT.md`/`frontend/AGENT.md` dedicados).
- Trabalhar na ordem sugerida em "Estratégia de implementação" (componentes compartilhados → abas já próximas do padrão → pares que motivaram o pedido → outliers estruturais) para minimizar retrabalho.
- Ao final, oferecer para subir o dev server (`/run` ou equivalente) e revisar visualmente cada aba antes de considerar a tarefa concluída — mudança visual não é validável só por `tsc`/`vite build`.
- Não expandir escopo para `SecurityTab`/`PlanosScreen` além de ajustes pontuais de espaçamento, mesmo que pareça "fácil" durante a implementação.
