# Plano de Implementação: Filtro de Membros com usuário logado marcável (Despesas + Receitas) + ajuste visual da tabela de Receitas

## Origem

- Arquivo de especificação: nenhum (originado de pedido direto na conversa)
- Data do planejamento: 2026-09-20
- Classificação: `frontend-only`

## Resumo

Elimina o conceito de "Só eu/Família" como toggle separado. O usuário logado passa a ser mais uma opção marcável dentro do grupo "Membros" do painel de filtro, exibida com seu nome real, sempre iniciando marcada — mas passível de ser desmarcada manualmente. O mesmo modelo é levado de Despesas para Receitas, que ganha o `MultiFilterPanel` (só o grupo Membros) e perde busca por texto, o toggle antigo e o totalizador do rodapé da tabela. Além disso, a tabela de Receitas (desktop) é ajustada visualmente para igualar altura de linha e peso de fonte ao padrão já usado em Despesas.

## Escopo

### Dentro do escopo

**Despesas (`DespesasScreen.tsx`)**:
- Grupo "Membros" do painel passa a incluir o próprio usuário como opção, rotulada com seu nome real (`meQ.data.nome`).
- Estado inicial: usuário logado marcado, demais membros desmarcados.
- Marcar o próprio usuário no estado inicial **não conta como filtro ativo**; marcar/desmarcar qualquer coisa além disso conta como filtro ativo.
- "Limpar filtros" zera todos os demais grupos, mas **preserva o próprio usuário marcado** no grupo Membros.
- Lógica de filtragem client-side recalculada: reflete literalmente quem está marcado.
- `escopoFamilia`/pedido de `escopo=familia` ao servidor: enviado sempre que há 1+ *outro* membro selecionado além do próprio usuário.
- Remoção de qualquer resquício do antigo conceito "Só eu" como toggle/label/variável dedicada.

**Receitas (`ReceitasScreen.tsx`)**:
- Adicionar `meQ` (`useQuery` de `fetchMe`, query key `['usuario-me']`, cache compartilhado).
- Adicionar `MultiFilterPanel` com um único grupo "Membros", mesmo modelo de Despesas.
- Remover: campo de busca por texto (estado, input, `searchGuide`, entrada `receitasBusca` em `firstAccessGuideMessages.ts`), toggle "Só eu/Família", `<tfoot>` totalizador do rodapé da tabela desktop.
- Estado vazio (nenhum membro selecionado): mensagem "Nenhum membro selecionado".
- Remover import órfão de `Search` (lucide-react).
- `toolbarStart` permanece inalterado.

**Ajuste visual da tabela de Receitas (novo item)**:
- Remover `font-semibold` da coluna Descrição e `font-bold` da coluna Valor — peso de fonte normal.
- Igualar padding vertical ao padrão de Despesas: `<th>` de `py-2.5` para `py-2`; `<td>` de `py-3` para `py-1.5`, em todas as colunas da tabela desktop.

### Fora do escopo

- Outros grupos de filtro de Despesas (Status, Categoria, Forma de pagamento, Cartão, Data de pagamento) não são replicados em Receitas.
- Telas de Cartões e Orçamento, que ainda usam o toggle antigo "Só eu/Família" — não fazem parte deste plano.
- Mudança de contrato de API/backend.
- Alteração em `MultiFilterPanel.tsx` (componente genérico).
- Ajuste visual na versão mobile (cards) de Receitas — só a tabela desktop.

## Leitura de contexto

- `/AGENT.md` (raiz do monorepo).
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados neste projeto.
- Investigação nesta sessão: `src/screens/despesas/DespesasScreen.tsx` (linhas 96-97, 249, 261-280, 375-410, 464-475, `TD_CLASS`/`TH_CLASS`), `src/screens/receitas/ReceitasScreen.tsx` (arquivo completo, incluindo linhas 318-334 do `<thead>` e 360/395 dos pesos de fonte), `src/ui/MultiFilterPanel.tsx`, `src/components/firstAccessGuideMessages.ts`.

## Impacto por área

### Frontend

- `src/screens/despesas/DespesasScreen.tsx`:
  - Grupo "Membros" em `filterGroups` passa a incluir a opção do próprio usuário.
  - Estado `filtroMembros` inicializado com o id do próprio usuário assim que `meQ.data` carregar (via `useEffect` com guarda contra sobrescrever seleção manual).
  - `nomesVisiveis` simplificado: reflete só os ids marcados em `filtroMembros`.
  - Lógica de filtragem: sempre checa contra `nomesVisiveis`, sem gate de `size > 0`.
  - `escopoFamilia`: `true` quando `filtroMembros` contém algum id que não seja o do próprio usuário.
  - `hasFilter2`: considera o grupo Membros "ativo" só quando difere do estado inicial (`{próprio usuário}`).
  - `handleClearFilters`: reseta `filtroMembros` para `{id do próprio usuário}`, não vazio.

- `src/screens/receitas/ReceitasScreen.tsx`:
  - Novo `useQuery` para `fetchMe`; novo estado `filtroMembros`, mesmo padrão de inicialização/limpeza.
  - Novo `MultiFilterPanel` com grupo único "Membros".
  - Lógica de filtragem trocada de busca por texto para filtro por `nomesVisiveis`.
  - Remoção de `busca`, input de busca, `searchGuide`, `<tfoot>` totalizador.
  - `EmptyState` ajustado para "Nenhum membro selecionado" quando `filtroMembros.size === 0`.
  - Remoção do import de `Search`.
  - Remoção de `font-semibold`/`font-bold` nas colunas Descrição/Valor.
  - Padding de `<th>`/`<td>` da tabela desktop igualado ao padrão de Despesas (`py-2`/`py-1.5`).

- `src/components/firstAccessGuideMessages.ts`: remoção da chave `receitasBusca`.

### Backend

`Sem impacto esperado`.

### Banco de dados

`Sem impacto esperado`.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. (Não aplicável aqui — este plano não gera migration.)

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`
- `src/components/firstAccessGuideMessages.ts`

## Estratégia de implementação

1. Em `DespesasScreen.tsx`: adicionar inicialização de `filtroMembros` com o id do próprio usuário via `useEffect` guardado.
2. Ajustar o grupo "Membros" em `filterGroups` para incluir a opção do próprio usuário.
3. Simplificar `nomesVisiveis` e a condição de filtragem.
4. Recalcular `escopoFamilia` e `hasFilter2` para o novo modelo.
5. Ajustar `handleClearFilters` para preservar o próprio usuário marcado.
6. Remover nomenclatura antiga "só eu/família" remanescente em comentários.
7. Em `ReceitasScreen.tsx`: adicionar `meQ`, `filtroMembros`, `MultiFilterPanel` com grupo Membros.
8. Remover busca, toggle antigo, totalizador `<tfoot>`; ajustar `EmptyState`.
9. Remover import órfão de `Search`; remover `receitasBusca` de `firstAccessGuideMessages.ts`.
10. Ajustar pesos de fonte (Descrição/Valor) e padding (`<th>`/`<td>`) da tabela desktop de Receitas para igualar a Despesas.
11. Rodar build (`tsc --noEmit`, `vite build`) e revisar visualmente: comportamento do filtro em ambas as telas, e a altura/peso visual da tabela de Receitas comparada a Despesas.

## Regras de negócio identificadas

- O usuário logado sempre inicia marcado no filtro de Membros (Despesas e Receitas).
- O usuário logado pode ser desmarcado manualmente, resultando em não ver os próprios lançamentos.
- Nenhuma seleção no grupo Membros = nenhum dado exibido.
- "Limpar filtros" nunca desmarca o próprio usuário.
- Estado inicial (só o próprio usuário) não conta como "filtro ativo"; qualquer desvio disso conta.
- `escopo=familia` só é solicitado ao servidor quando há pelo menos 1 outro membro selecionado.

## Regras multi-tenant e segurança

`Sem impacto esperado`.

## Validações necessárias

- Confirmar que a inicialização de `filtroMembros` não é refeita a cada render.
- Confirmar que `hasFilter2` não fica "sempre ativo" por causa do próprio usuário marcado por padrão.

## Testes necessários

### Frontend

- Abrir Despesas/Receitas: painel de Membros mostra o próprio usuário marcado, nome real, sem indicador de "filtro ativo".
- Desmarcar o próprio usuário: tabela fica vazia (Receitas mostra "Nenhum membro selecionado").
- Marcar outro membro: tabela mostra união; `escopo=familia` solicitado ao servidor.
- "Limpar": outros filtros zeram, próprio usuário continua marcado.
- Receitas: sem busca, sem toggle antigo, sem totalizador; `toolbarStart` no lugar de sempre.
- Receitas: coluna Descrição e Valor sem negrito; altura de linha da tabela visualmente igual à de Despesas.

### Backend

Não aplicável.

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- A inicialização de `filtroMembros` depende de `meQ.data` estar carregado — precisa de tratamento cuidadoso para não conflitar com seleção manual em re-renders.
- Mudança de semântica do filtro é significativa — vale teste manual cuidadoso, especialmente desmarcar o próprio usuário.
- Ajuste de padding na tabela de Receitas afeta todas as colunas, não só Descrição/Valor — mudança visual perceptível em toda a tabela.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Grupo "Membros" em Despesas e Receitas inclui o próprio usuário como opção com nome real, sempre iniciando marcado.
- Desmarcar tudo esconde todos os dados.
- "Limpar filtros" preserva o próprio usuário marcado.
- Receitas ganha `MultiFilterPanel` (só grupo Membros) e perde busca, toggle antigo e totalizador.
- Tabela de Receitas sem negrito em Descrição/Valor, com altura de linha igual à de Despesas.
- Build (`tsc --noEmit`, `vite build`) passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Eliminar completamente qualquer resquício de nomenclatura/lógica "Só eu/Família" como toggle separado.
- Não adicionar outros grupos de filtro em Receitas além de Membros.
- Não executar migrations (não há nenhuma neste plano).
