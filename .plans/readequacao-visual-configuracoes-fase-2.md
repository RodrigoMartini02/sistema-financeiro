# Plano de Implementação: Readequação visual da tela de Configurações — Fase 2

## Origem

- Arquivo de especificação: `.portal/tasks/Readequacao visual da tela de Configuracoes com base em mockup.md`
- Plano anterior: `.plans/readequacao-visual-configuracoes-fase-1.md` (implementado, commit `96d551d`)
- Mockup de referência: `Configuracoes Compacto.html`
- Data do planejamento: `2026-09-05`
- Branch atual: `refactor/R/padronizar-modal-configuracoes`
- Classificação: `frontend-only`

## Resumo

Concluir a readequação visual da tela de Configurações: extrair o cabeçalho de tela — repetido de forma idêntica em 9 tabs — para um componente `ConfigTabHeader`, aplicá-lo a todas elas, redesenhar `IntegracoesIaTab` (única tab que não herdou nada do Bloco A da Fase 1), e fazer uma revisão a fundo de cada tab em busca de divergências visuais que a auditoria por grep não detecta.

## Classificação e motivo

`frontend-only`. Apenas apresentação: nenhuma rota, service, schema, tipo ou migration é alterado. Mesma justificativa da Fase 1.

## Resultado da auditoria inicial

O plano da Fase 1 determinava que a Fase 2 começasse auditando o que de fato sobrou, em vez de assumir que cada tab precisaria ser reescrita. A auditoria foi feita e o resultado é:

| Tab | Usa `ConfigListRow` | Usa tokens `C` | Tailwind residual |
|---|---|---|---|
| `SociosTab` | sim | sim | 2 (contador, loading) |
| `RepresentantesTab` | sim | sim | 2 (contador, loading) |
| `ServicosTab` | sim | sim | 2 (contador, loading) |
| `CatalogoTab` | sim | sim | 3 (contador, loading, vazio) |
| `MembrosTab` | sim | sim | 3 (loading, botão, "Inativo") |
| `UsuariosTab` | sim | sim | 4 (loading, paginação) |
| `IntegracoesIaTab` | **não** | **não** | **11 (tela inteira)** |

Três conclusões que moldaram este plano:

1. **Correção de um diagnóstico anterior.** Durante a Fase 1 eu afirmei que a parte PJ do `ContaDialog` ficaria "visualmente inconsistente até a Fase 2". **Isso estava errado.** A verificação direta do código (`ContasTab.tsx`, linhas ~307-340) mostra que os campos PJ (razão social, nome fantasia, CNPJ, enquadramento) já usam `cardStyle`, `labelStyle` e `fieldInputStyle` — exatamente os mesmos tokens da parte PF. A diferença entre PF e PJ é apenas *quais campos são exibidos*, não *como são estilizados*. Por isso o `ContaDialog` sai do escopo desta fase.

2. **As 6 tabs restantes já herdaram as listagens** do redesenho de `ConfigListRow`/`Dialog` feito na Fase 1, como o plano previa. O que sobrou em cada uma é pequeno e repetitivo: o contador do cabeçalho, o texto de "Carregando..." e detalhes soltos.

3. **`IntegracoesIaTab` é a única tab realmente divergente.** Não usa `ConfigListRow` nem os tokens `C`. É uma tela de formulário (configuração de 3 provedores de IA), não de lista, então o padrão "barra de ações + lista" não se aplica — o que se aplica é a linguagem visual.

## Decisões aplicadas

- **Decisão 1 — Extensão da fase:** Fase 2 ampliada. Além de padronizar cabeçalho/loading das 6 tabs e redesenhar `IntegracoesIaTab`, fazer uma revisão a fundo de cada tab procurando divergências que a auditoria por grep não pegou (modais internos, estados de erro, paginação, toggles).
- **Decisão 2 — Cabeçalho repetido:** criar um componente `ConfigTabHeader` e migrar as 9 tabs para ele (as 6 desta fase **e** as 3 já entregues na Fase 1), eliminando a duplicação de vez. Descartadas: repetir o bloco manualmente (mais duplicação) e adicionar variante ao `Button` global (acoplaria estilo de Configurações a um componente usado em 20 arquivos).
- **Decisão 3 — Sequenciamento:** implementar a Fase 2 agora, sem esperar a validação visual da Fase 1. A validação será única, cobrindo as duas fases juntas.

## Escopo

### Dentro do escopo

1. Criar `src/ui/ConfigTabHeader.tsx` — contador + filtros opcionais + botão de ação em pill.
2. Migrar as 3 tabs da Fase 1 para o novo componente: `ContasTab`, `CategoriasTab`, `CartaoTab`.
3. Aplicar o componente às 6 tabs restantes: `SociosTab`, `RepresentantesTab`, `ServicosTab`, `CatalogoTab`, `UsuariosTab`, `MembrosTab`.
4. Padronizar estados de loading e vazio nessas 6 tabs.
5. Redesenhar `IntegracoesIaTab` com os tokens e a linguagem visual do padrão.
6. Revisão a fundo (decisão 1) das 9 tabs: modais internos, estados de erro, paginação, toggles e demais elementos que o grep não detecta.

### Fora do escopo

- **`ContaDialog` (PF e PJ)** — já usa os tokens `C` em ambos os ramos; nada a fazer (ver "Resultado da auditoria", ponto 1).
- **Componente `Button` global** (`src/ui/button.tsx`) — usado em 20 arquivos, metade fora de Configurações. Não pode ser reestilizado sem sair do escopo.
- `ClienteDetail.tsx` — tem tasks e planos próprios em `.portal/`.
- Backend, banco de dados, migrations, `.env`, CI/CD.
- Uso standalone de `PlanosScreen`.

## Leitura de contexto

- `/AGENT.md` (raiz do monorepo) — existe
- `sistema financas/AGENT.md` — existe. Descreve um backend multi-tenant/multi-prefeitura herdado de outro projeto; **não se aplica** a esta task frontend-only.
- `sistema financas/CLAUDE.md` — regras de workflow obrigatório
- `frontend/AGENT.md` — **não existe** neste projeto (sem pasta `frontend/`; o front vive em `src/`)
- `backend/AGENT.md` — **não existe** (há pasta `backend/`, mas sem AGENT.md próprio)
- `.portal/tasks/Readequacao visual da tela de Configuracoes com base em mockup.md`
- `.plans/readequacao-visual-configuracoes-fase-1.md`

Arquivos inspecionados na auditoria: as 7 tabs da tabela acima, `src/ui/button.tsx`, `src/ui/configTokens.ts`, `src/screens/config/ContasTab.tsx` (ramo PJ do `ContaDialog`).

## Impacto por área

### Frontend

**`ConfigTabHeader` (novo)**

API mínima, para não virar abstração genérica demais:

- `countLabel: string` — texto do contador ("3 contas ativas", "7 representantes cadastrados")
- `filters?: ReactNode` — slot opcional (ex.: `ToggleGroup` de Ativas/Desativadas em `ContasTab`)
- `actionLabel?: string` e `onAction?: () => void` — botão primário em pill com ícone `+`
- `children?: ReactNode` — escape hatch para casos que fujam do padrão (ex.: `FirstAccessGuideCard` ancorado no botão)

Se alguma tab não couber nessa API, ela mantém o cabeçalho próprio em vez de forçar o componente.

**Tabs**

As 9 tabs passam a consumir `ConfigTabHeader`. Loading e vazio padronizados com os tokens `--cfg-*`.

**`IntegracoesIaTab`**

É formulário, não lista. Aplicar tokens, `cardStyle`, tipografia e estilo de campo/botão do padrão — sem a estrutura "barra de ações + lista". Preservar os fluxos de salvar/testar provedor e as mensagens de feedback e erro.

**Estados e acessibilidade**

Preservar em todas as tabs: loading, vazio, erro, e todos os pontos de ancoragem de `FirstAccessGuideCard`/`useFirstAccessGuide`.

### Backend

`Sem impacto esperado`

### Banco de dados

`Sem impacto esperado`

Nenhuma migration é necessária.

> **Atenção:** migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`. As fontes já foram carregadas na Fase 1.

## Arquivos provavelmente afetados

### Novo

- `src/ui/ConfigTabHeader.tsx`

### Migração das tabs da Fase 1

- `src/screens/config/ContasTab.tsx`
- `src/screens/config/CategoriasTab.tsx`
- `src/screens/config/CartaoTab.tsx`

### Tabs da Fase 2

- `src/screens/config/SociosTab.tsx`
- `src/screens/config/RepresentantesTab.tsx`
- `src/screens/config/ServicosTab.tsx`
- `src/screens/config/CatalogoTab.tsx`
- `src/screens/config/UsuariosTab.tsx`
- `src/screens/config/MembrosTab.tsx`
- `src/screens/config/IntegracoesIaTab.tsx`

### Possível

- `src/ui/configTokens.ts` — tokens novos que a revisão a fundo revelar

## Estratégia de implementação

Em **cada arquivo**, aplicar a regra de redesign do projeto: **remover o estilo/código antigo primeiro, depois aplicar o novo**, como sub-passos distintos.

1. Criar `src/ui/ConfigTabHeader.tsx` com a API mínima descrita acima.
2. Migrar `ContasTab`, `CategoriasTab` e `CartaoTab` (telas da Fase 1) para o componente, removendo o bloco de cabeçalho manual que a Fase 1 introduziu.
3. **Checkpoint de build** — as 3 telas da Fase 1 devem continuar íntegras antes de seguir. Este checkpoint é a mitigação do risco da decisão 3 (refatorar telas ainda não validadas visualmente).
4. Aplicar o componente às 6 tabs restantes, uma a uma, padronizando também loading e vazio.
5. Redesenhar `IntegracoesIaTab`.
6. Revisão a fundo (decisão 1): abrir cada uma das 9 tabs e seus modais, procurando divergências residuais — estados de erro, paginação, toggles, badges. Corrigir o que for divergência visual real; registrar o que não for.
7. `npm run build` final e relato honesto do resultado.

## Regras de negócio identificadas

Esta é uma task de apresentação; as regras abaixo já existem e **devem ser preservadas sem alteração**:

- Visibilidade de abas por permissão/tipo de conta (`canViewAnalytics`, `isAdmin`, `isGestor`, `contaTipo !== 'pessoal'`)
- Rótulo dinâmico "Membros da família" (PF) vs "Colaboradores" (PJ), mesma tela e mesmo dado (`conta_membros`)
- `IntegracoesIaTab`: somente uma integração de IA fica ativa por vez; a chave permanece cifrada no servidor
- `UsuariosTab` e `MembrosTab`: paginação e estados ativo/inativo próprios
- `RepresentantesTab`: comissões por tipo de receita, com criação inline de tipo

## Regras multi-tenant e segurança

**Este projeto não é multi-tenant** no sentido de organizações isoladas — é uso pessoal, com o conceito de conta/perfil (PF vs PJ). O `AGENT.md` do subprojeto descreve um cenário multi-prefeitura herdado de outro projeto, que não se aplica aqui.

Cuidados desta fase:

- Nenhuma lógica de autorização pode ser alterada. As tabs PJ (`SociosTab`, `RepresentantesTab`) continuam visíveis apenas quando `contaTipo !== 'pessoal'`; `IntegracoesIaTab` continua restrita a admin.
- `IntegracoesIaTab` lida com tokens de API de provedores de IA: **não exibir, logar ou persistir o token em claro** ao mexer no layout. O campo hoje é limpo após salvar (`token: ''`) — esse comportamento deve ser preservado.
- Sem exposição de dados novos: nenhuma tela passa a exibir informação que já não exibisse.

## Validações necessárias

Nenhuma validação de input, schema ou payload é alterada. Os formulários mantêm as validações atuais.

## Testes necessários

O projeto **não tem infraestrutura de testes automatizados**; validação manual via `/run`.

Como a decisão 3 juntou as duas fases numa revisão única, esta validação cobre **Fase 1 + Fase 2**.

### Frontend (manual, via `/run`)

Executar **em tema claro e em tema escuro**:

- **Fase 1:** Contas (listagem, toggle, criar/editar PF **e PJ**), Categorias (árvore, sub, desativar), Cartões (grid, preview ao vivo, criar/editar), Acessos (KPIs, períodos), Segurança, Assinatura
- **Fase 2:** Sócios, Representantes (comissões, criação inline de tipo), Catálogo de serviços, Serviços, Usuários (paginação), Membros/Colaboradores, Integrações de IA (salvar/testar provedor, feedback, erro)
- **Sidebar:** 4 grupos, item ativo, visibilidade condicional testada em conta PF **e** PJ

### Regressão obrigatória

- `ClienteDetail` — usa o mesmo `Dialog`; confirmar que não mudou de aparência
- Telas fora de Configurações que consomem `Button`, `EmptyState`, `InfoBanner`, `ListToolbar`
- Guias de primeiro acesso em todas as tabs
- Responsividade do drawer

### Backend / E2E

`Não aplicável` — sem mudança de backend e sem infraestrutura de E2E.

## Comandos de validação sugeridos

```bash
npm run build
```

Não há `lint` nem `typecheck` configurados no `package.json` deste projeto (apenas `dev`, `build`, `preview`).

## Riscos e pontos de atenção

| Risco | Mitigação |
|---|---|
| **Refatorar telas da Fase 1 ainda não validadas** (decisões 2 e 3) | Checkpoint de build na etapa 3; validação única no fim cobre ambas as fases |
| `ConfigTabHeader` virar abstração genérica demais e não servir a todos os casos | API mínima + escape hatch `children`; se uma tab não couber, mantém cabeçalho próprio em vez de forçar |
| `CatalogoTab`/`ServicosTab` acopladas a `ClienteDetail` | Mudança apenas no nível da tab; `ClienteDetail` não é tocado |
| Revisão a fundo (decisão 1) inflar o escopo indefinidamente | Registrar achados; alterar só divergência visual real, não refactor oportunista |
| `MembrosTab`/`UsuariosTab` têm paginação e toggles próprios | Tratar caso a caso na etapa 6 |
| `IntegracoesIaTab` manipula tokens de API | Não alterar o fluxo de salvar/limpar token; apenas estilo |
| Dark mode nas telas novas | Consumir as variáveis `--cfg-*`, que já têm variante escura definida na Fase 1 |
| Ancoragem de `FirstAccessGuideCard` ao trocar o cabeçalho | Escape hatch `children` no `ConfigTabHeader`; validar guias no `/run` |

## Perguntas em aberto

`Nenhuma pergunta em aberto identificada.`

As três decisões pendentes foram respondidas antes de salvar este plano.

## Critérios de aceite do plano

A implementação da Fase 2 está pronta quando:

- As 9 tabs de Configurações usam `ConfigTabHeader`, sem duplicação do bloco de cabeçalho
- Loading e estado vazio padronizados em todas as tabs tocadas
- `IntegracoesIaTab` visualmente coerente com o restante de Configurações
- **Dark mode funciona** em tudo que foi tocado
- **Nenhuma alteração visual fora de Configurações** — `ClienteDetail`, `ExpenseDialog`, `IncomeDialog` e telas que usam `Button` permanecem idênticas
- Revisão a fundo documentada: divergências encontradas foram corrigidas ou registradas explicitamente
- Guias de primeiro acesso continuam ancorados corretamente
- Nenhum componente mistura estilo antigo e novo simultaneamente
- `npm run build` conclui sem erros

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto, junto com a task em `.portal/tasks/` e o plano da Fase 1.
- Seguir `/AGENT.md` (raiz). Observar que `sistema financas/AGENT.md` descreve um cenário backend multi-tenant que **não se aplica** a esta task frontend-only.
- **Regra remove-then-apply**: em cada arquivo, remover o estilo antigo como um passo e aplicar o novo como outro. Nunca deixar Tailwind antigo convivendo com estilo novo no mesmo componente.
- **Não tocar em `ContaDialog`** (nem PF nem PJ) — já está padronizado; alterá-lo seria refactor oportunista.
- **Não alterar `src/ui/button.tsx`** — componente global usado em 20 arquivos.
- **Não alterar** lógica de autorização, queries, mutations ou tipos.
- Preservar todos os `useFirstAccessGuide`/`FirstAccessGuideCard`.
- Fazer o checkpoint de build da etapa 3 antes de seguir para as 6 tabs.
- Em `IntegracoesIaTab`, não alterar o tratamento do token da API.
- Ao final, rodar `npm run build` e **reportar o resultado honestamente**, deixando claro que build passando não equivale a validação visual.
