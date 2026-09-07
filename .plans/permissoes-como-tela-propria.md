# Plano de Implementação: Permissões como tela própria

## Origem

- Arquivo de especificação: solicitação do usuário no chat — "permissões deve ser uma tela onde é vinculado usuários, ou seja tela em configurações que um membro disponibiliza telas para um indivíduo"
- Data do planejamento: 2026-09-06
- Classificação: `frontend-only`
- Branch: `refactor/R/padronizar-modal-configuracoes`

## Resumo

As permissões por tela existem e funcionam, mas ficam num modal escondido dentro de um badge da lista de membros. O usuário relatou nunca ter encontrado a funcionalidade.

Este plano transforma isso numa tela própria no menu de Configurações: à esquerda os membros ativos, à direita as permissões da pessoa selecionada.

Backend, endpoints e serviços já existem e não mudam.

## Decisões aplicadas

- Decisão 1: **opção 1** — remover o modal do badge. O acesso passa a ser apenas pela tela nova, um caminho só.
- Decisão 2: **opção 1** — listar apenas membros ativos. Convite pendente e membro desativado ficam de fora, mantendo o comportamento atual.

## Por que a funcionalidade não era encontrada

O gatilho é um `<span role="button">` na linha do membro (`MembrosTab.tsx:359`), com fonte 11.5px e a mesma cor dos demais badges informativos — sem borda, sem fundo, visualmente indistinguível de um rótulo.

Além disso, três condições precisam ser satisfeitas ao mesmo tempo:

1. Existir ao menos um membro cadastrado além do próprio usuário.
2. Esse membro estar com `membro_status === 'ativo'`.
3. O usuário reconhecer o texto "Permissões" como clicável.

## O que já existe e será reaproveitado

`src/services/permissoesService.ts` define **21 flags** em 4 grupos:

| Grupo | Flags |
|---|---|
| Financeiro | Despesas, Receitas, Fechamento de mês, Reservas, Planejamento/Orçamento, Calendário |
| Relatórios e Painel | Painel, Relatórios, Notificações, Assistente Financeiro |
| Configurações | Contas, Categorias, Cartões, Catálogo de Serviços, Representantes, Sócios, Membros, Assinatura |
| Comercial | (visível apenas em conta empresa) |

Endpoints prontos: `fetchMemberPermissions`, `fetchOwnPermissions`, `updateMemberPermissions`.

A lista de membros vem de `membrosService.ts` (`MembroListItem`), com `usuario_id`, `nome`, `email`, `documento` e `membro_status`.

## Escopo

### Dentro do escopo

- Nova entrada "Permissoes" no menu de Configuracoes, grupo Pessoas, visivel apenas para quem pode gerenciar membros (`isGestor`).
- Tela em duas colunas: membros ativos a esquerda, grupos de permissao da pessoa selecionada a direita.
- Toggle salvando imediatamente, como o modal ja faz.
- Grupo "Comercial" oculto em conta pessoal.
- Estado vazio explicando o proximo passo quando nao ha membros ativos.
- Remover o `PermissoesDialog` e o badge que o abria em `MembrosTab.tsx`.

### Fora do escopo

- Backend, endpoints e novos flags de permissao.
- A aba "Acessos", que e outra coisa (analytics de login).
- Alterar quem pode ser membro ou como o vinculo e criado.
- Permissoes para convites pendentes ou membros desativados.

## Leitura de contexto

- `CLAUDE.md` da raiz e do `sistema financas`
- `src/layout/ConfigPanel.tsx` (menu, filtros por tipo de conta e papel)
- `src/screens/config/MembrosTab.tsx` (modal atual, linhas 115-190 e o badge na 359)
- `src/services/permissoesService.ts` (flags, grupos, endpoints)
- `src/services/membrosService.ts` (lista de membros)
- Nao existem `frontend/AGENT.md` nem `backend/AGENT.md` neste projeto: o `CLAUDE.md` da raiz cobre todo o repositorio.

## Impacto por área

### Frontend

**`src/screens/config/PermissoesTab.tsx`** (novo)
- Query da lista de membros, filtrada por `membro_status === 'ativo'`.
- Estado local do membro selecionado; seleciona o primeiro por padrao.
- Query das permissoes do membro selecionado.
- Mutation por flag, invalidando a query do membro.
- Layout em duas colunas, reutilizando os tokens de configuracao existentes.
- Estados de loading, erro e vazio.

**`src/layout/ConfigPanel.tsx`**
- Novo id `permissoes` no tipo `ConfigItemId`.
- Nova entrada em `ITEMS`, grupo Pessoas.
- Filtro: `if (item.id === 'permissoes') return isGestor;`
- Nova condicao de renderizacao usando `current.id`.

**`src/screens/config/MembrosTab.tsx`**
- Remover o componente `PermissoesDialog`.
- Remover o badge que o abria e o estado `permissoesMembro`.
- Remover imports que ficarem orfaos (`PERMISSION_GROUPS`, `fetchMemberPermissions`, `updateMemberPermissions`, `ShieldCheck`, tipos).

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado. Nenhuma migration.

Atencao: migrations nao devem ser executadas sem confirmacao explicita do usuario, pois o ambiente atual pode estar apontando para producao.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/config/PermissoesTab.tsx` (novo)
- `src/layout/ConfigPanel.tsx`
- `src/screens/config/MembrosTab.tsx`

## Estratégia de implementação

Segue a regra do projeto para redesign: remover antes de aplicar.

### Etapa 1 — remover

1. Remover o `PermissoesDialog`, o badge que o abria e o estado `permissoesMembro` de `MembrosTab.tsx`.
2. Remover os imports que ficarem sem uso.

### Etapa 2 — aplicar

3. Criar `PermissoesTab.tsx` com a lista de membros ativos e o painel de permissoes.
4. Registrar a entrada no `ConfigPanel`, com filtro por `isGestor`.
5. Adicionar a condicao de renderizacao usando `current.id`.

### Etapa 3 — validar

6. `tsc --noEmit`, `vite build`, suite do backend.

## Regras de negócio identificadas

- Por padrao um membro nao acessa nenhuma tela; o gestor libera individualmente.
- O grupo "Comercial" so faz sentido em conta empresa (`contaTipo === 'empresa'`).
- As permissoes salvam a cada toggle — nao ha acao de confirmar.
- Apenas membros com `membro_status === 'ativo'` tem permissoes configuraveis.
- A tela e uma ferramenta de gestao: so quem gerencia membros (`isGestor`) deve alcança-la.

## Regras multi-tenant e segurança

O projeto nao e multi-tenant por organizacao; o isolamento e por `usuario_id`, aplicado no backend.

**Ponto critico:** a entrada no menu precisa respeitar `isGestor`, o mesmo criterio ja usado para "Membros". Uma tela de permissoes acessivel a quem nao gerencia seria uma brecha de autorizacao — e o backend continua sendo a defesa real, mas a interface nao deve oferecer o caminho.

O backend ja valida a permissao em `updateMemberPermissions`; esta alteracao nao afrouxa nada.

## Validações necessárias

Nenhuma validacao de input nova: os toggles enviam booleanos para um endpoint que ja valida.

## Testes necessários

### Frontend

Nao ha suite de teste de componente no projeto. Verificacao manual:

- A entrada "Permissoes" aparece no menu para gestor.
- Nao aparece para usuario que nao gerencia membros.
- A lista mostra apenas membros ativos.
- Selecionar um membro carrega suas permissoes.
- Um toggle salva e persiste apos recarregar.
- O grupo "Comercial" aparece so em conta empresa.
- Sem membros ativos, a tela explica o proximo passo.
- O badge "Permissoes" nao existe mais em Membros.

### Backend

Suite existente deve continuar passando (23 testes). Nenhum teste novo: o backend nao muda.

### E2E

Nao aplicavel — projeto nao tem E2E configurado.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
cd backend && npm run build && npm test
```

Observacao: `src/screens/despesas/DespesasScreen.tsx` tem um erro de tipo pre-existente, nao relacionado a esta alteracao.

## Riscos e pontos de atenção

- **Medio — autorizacao:** a entrada precisa filtrar por `isGestor`. Sem isso, qualquer usuario alcancaria a tela de permissoes; o backend recusaria a escrita, mas oferecer o caminho ja e um defeito.
- **Medio — remocao do modal:** quem ja usava o badge perde o atalho. Como o usuario relatou nunca ter encontrado, o impacto pratico e baixo.
- **Baixo — imports orfaos:** remover o `PermissoesDialog` deixa varios imports sem uso em `MembrosTab`. O `tsc` acusa, entao o risco e de esquecer, nao de quebrar.
- **Baixo:** a tela nova reusa queries e mutations existentes, sem logica de dominio nova.

## Perguntas em aberto

- A tela deve permitir configurar as permissoes do proprio usuario dono da conta? Assumido que nao: o dono tem acesso total por definicao, e listar a si mesmo com toggles sugeriria que ele pode se auto-restringir.

## Critérios de aceite do plano

- "Permissoes" aparece no menu de Configuracoes, grupo Pessoas, apenas para gestor.
- A tela lista os membros ativos vinculados a conta.
- Selecionar um membro mostra os 4 grupos de permissao (3 em conta pessoal).
- Cada toggle salva imediatamente e persiste.
- Sem membros ativos, a tela explica que e preciso cadastrar alguem em Membros.
- Nenhum residuo do `PermissoesDialog` ou do badge permanece em `MembrosTab.tsx`.
- Nenhum import orfao.
- `tsc --noEmit`, `vite build` e os 23 testes do backend passam.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir a ordem: remover o modal antes de criar a tela.
- **Nao esquecer o filtro `isGestor`** na entrada do menu — e o ponto de seguranca deste plano.
- Usar `current.id` na condicao de renderizacao, seguindo o padrao ja corrigido no `ConfigPanel`.
- Reutilizar os tokens de configuracao existentes; nao criar tokens novos.
- Nao alterar backend, endpoints ou flags de permissao.
- Preservar acessibilidade: a lista de membros precisa ser navegavel por teclado.
- Nao executar migrations. Nao alterar `.env`.
