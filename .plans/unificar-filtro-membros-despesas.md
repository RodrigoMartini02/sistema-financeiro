# Plano de Implementação: Unificar filtro de Escopo Família e Autor em um único grupo "Membros"

## Origem

- Arquivo de especificação: nenhum (originado de discussão direta na conversa)
- Data do planejamento: 2026-09-20
- Classificação: `frontend-only`

## Resumo

Unificar dois mecanismos redundantes hoje na tela de Despesas — "Escopo família" (Só eu/Família, server-side) e "Autor" (filtro por nome, client-side) — em um único grupo "Membros" dentro do painel de filtro multi-seleção já existente (`MultiFilterPanel`). O grupo lista apenas os *outros* membros da conta (nunca o usuário logado, que é a base fixa sempre visível). Nenhuma seleção = comportamento atual (só os próprios lançamentos). Uma ou mais seleções = lançamentos do usuário logado **mais** os das pessoas marcadas — acionando automaticamente `escopo=familia` no servidor quando necessário, já que essa é a única forma de obter dados de outros membros.

## Escopo

### Dentro do escopo

- Remover os grupos separados "Lançamentos" (Só eu/Família) e "Autor" do painel de filtro.
- Adicionar um único grupo "Membros" com checkbox por outro membro da conta (excluindo o próprio usuário logado da lista de opções).
- Buscar o usuário logado (`fetchMe`, mesma query key `['usuario-me']` já usada em `ConfigPanel.tsx`, cache compartilhado) para identificar e excluir da lista.
- Ajustar a lógica: `escopoFamilia` passa a ser derivado automaticamente (`true` quando o Set de membros selecionados tem 1+ itens), em vez de um estado independente controlado por toggle.
- Ajustar a filtragem client-side final: quando há membros selecionados, mostrar só os lançamentos do próprio usuário + dos selecionados (não todos os "família" trazidos pelo servidor).
- O grupo "Membros" só aparece no painel quando `temMembros` (mais de 1 pessoa vinculada à conta) — mesma condição de hoje.

### Fora do escopo

- Qualquer mudança no backend/rota `/despesas` (o parâmetro `escopo=familia` já existe e continua sendo usado do mesmo jeito).
- Aplicar essa mudança em Receitas (permanece fora, como nas rodadas anteriores).
- Mudanças em `accessFamilyEntries`/permissões (já tratadas em plano anterior).
- Atalho "selecionar todos" no grupo "Membros" — marcar membro por membro é o comportamento esperado.

## Leitura de contexto

- `/AGENT.md` (raiz do monorepo).
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados neste projeto.
- Investigação nesta sessão: `src/screens/despesas/DespesasScreen.tsx` (linhas 246-272, 344-353), `src/services/membrosService.ts` (interface `MembroListItem`), `src/layout/ConfigPanel.tsx` (padrão de `fetchMe` com query key `['usuario-me']`), `src/ui/MultiFilterPanel.tsx` (componente já existente, reaproveitado sem alteração de API).

## Impacto por área

### Frontend

- `src/screens/despesas/DespesasScreen.tsx`:
  - Novo `useQuery` para `fetchMe` (query key `['usuario-me']`, cache compartilhado com `ConfigPanel.tsx`).
  - Novo estado `filtroMembros: Set<string>` (ids de `usuario_id`, como string, dos outros membros selecionados), substituindo `escopoFamilia` (boolean) e `filtroAutor` (Set<string> por nome).
  - `escopoFamilia` deixa de ser um `useState` independente e passa a ser calculado: `filtroMembros.size > 0`.
  - Lista de opções do grupo "Membros": `membrosQ.data` filtrado para excluir `usuario_id === me?.id`, mapeado para `{ value: String(usuario_id), label: nome }`.
  - Filtragem final client-side: quando `filtroMembros.size > 0`, um lançamento passa se `autorNome` corresponder ao próprio usuário OU a um dos membros selecionados (por id, cruzando com a lista de membros para obter o nome, já que `Expense.autorNome` é string).
  - Remover o grupo "Lançamentos" (Só eu/Família) e o grupo "Autor" do array `filterGroups`; adicionar o novo grupo "Membros" no lugar.
  - Sem mudança de `MultiFilterPanel.tsx` — a API genérica já suporta esse caso.

### Backend

`Sem impacto esperado` — a rota já aceita `escopo=familia`.

### Banco de dados

`Sem impacto esperado`.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. (Não aplicável aqui — este plano não gera migration.)

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `src/screens/despesas/DespesasScreen.tsx`

## Estratégia de implementação

1. Adicionar `useQuery` para `fetchMe` com query key `['usuario-me']`.
2. Trocar `const [escopoFamilia, setEscopoFamilia] = useState(false)` por `const [filtroMembros, setFiltroMembros] = useState<Set<string>>(new Set())` (ids como string, para casar com a API de `FilterGroup`, que trabalha com `Set<string>`) e derivar `const escopoFamilia = filtroMembros.size > 0`.
3. Remover o estado `filtroAutor` e a variável `autores`/`mostrarFiltroAutor` calculada a partir de `allItems` (não é mais necessária, pois a lista de opções agora vem de `membrosQ.data`, não dos lançamentos já carregados).
4. Construir a lista de "outros membros" a partir de `membrosQ.data`, excluindo `usuario_id === me?.id`.
5. Na filtragem client-side (`filtered = allItems.filter(...)`), adicionar a condição: se `filtroMembros.size > 0`, o item passa se `autorNome === me?.nome` OU `autorNome` corresponder ao nome de algum membro cujo id esteja em `filtroMembros`.
6. Atualizar `filterGroups`: remover as entradas `escopo-familia` e `autor`; adicionar a entrada `membros` (condicional a `temMembros`), com `onChange` que atualiza `filtroMembros` diretamente (sem a lógica especial de exclusividade que o grupo antigo "Lançamentos" precisava, já que agora é multi-seleção real).
7. Atualizar `handleClearFilters` para zerar `filtroMembros` também.
8. Atualizar `hasFilter2` para incluir `filtroMembros.size > 0`.
9. Rodar build (`tsc --noEmit`, `vite build`) e revisar a lógica manualmente: nenhum membro marcado → só próprios lançamentos, sem chamar `escopo=familia`; um membro marcado → busca família no servidor e filtra para mostrar só eu + o marcado; desmarcar todos → volta ao estado inicial.

## Regras de negócio identificadas

- O usuário logado sempre aparece nos resultados, independentemente do filtro de membros — não é uma opção removível.
- O grupo "Membros" no painel lista só os outros membros da conta, nunca a si mesmo.
- Selecionar 1+ membros soma os lançamentos deles aos do próprio usuário (união), não substitui.
- O parâmetro `escopo=familia` ao servidor é enviado sempre que houver ao menos 1 membro selecionado, mesmo que o usuário queira ver só 1 pessoa específica além de si — porque é a única forma de obter dados de terceiros da API atual.

## Regras multi-tenant e segurança

`Sem impacto esperado` — o backend já valida que `escopo=familia` só retorna dados de membros da própria conta autenticada (regra pré-existente, não alterada por este plano). A filtragem adicional (mostrar só os membros marcados) acontece inteiramente no cliente, sobre dados que o servidor já autorizou entregar.

## Validações necessárias

- Confirmar que a exclusão do próprio usuário da lista de opções funciona mesmo antes de `me` carregar (loading state do `fetchMe` não deve quebrar a renderização do grupo — tratar `me` como possivelmente `undefined`).
- Confirmar que trocar de "nenhum membro selecionado" para "1+ selecionado" dispara a nova busca ao servidor corretamente (já é o comportamento existente de `useFinanceDashboard` reagindo a mudança do parâmetro `escopo`).

## Testes necessários

### Frontend

- Nenhum membro marcado: tabela mostra só os lançamentos do próprio usuário (comportamento atual preservado).
- Marcar 1 outro membro: tabela mostra os lançamentos do próprio usuário + desse membro, nunca de um terceiro não marcado.
- Marcar todos os outros membros: tabela mostra todos os lançamentos da conta (equivalente ao antigo "Família").
- Desmarcar todos: volta ao estado "só eu".
- Botão "Limpar" no painel zera a seleção de membros junto com os demais filtros.
- Grupo "Membros" não aparece quando há só 1 pessoa na conta (`temMembros` falso).

### Backend

Não aplicável — sem impacto de backend.

### E2E

Não aplicável — mudança de UI/lógica client-side isolada.

## Comandos de validação sugeridos

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Comparação por nome (`autorNome`) em vez de id pode gerar falso-positivo se dois membros da mesma conta tiverem nomes idênticos — risco baixo e pré-existente (o filtro "Autor" atual já tem essa limitação).
- Marcar o primeiro membro dispara nova consulta ao servidor (mudança de `escopo`), podendo haver um instante de carregamento — mesmo comportamento já existente ao alternar para "Família" hoje.
- Sem atalho "selecionar todos", uma conta com muitos membros exige marcar um por um para ver a visão completa — aceito explicitamente pelo usuário.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Painel de filtro de Despesas tem um único grupo "Membros" no lugar dos antigos "Lançamentos" (Só eu/Família) e "Autor".
- Grupo "Membros" nunca lista o próprio usuário logado como opção.
- Nenhuma seleção = só próprios lançamentos; 1+ seleções = próprios + selecionados.
- Build (`tsc --noEmit`, `vite build`) passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não alterar `MultiFilterPanel.tsx` — a API genérica já cobre este caso, é só um novo `FilterGroup` na tela de Despesas.
- Não migrar Receitas nesta rodada.
- Não executar migrations (não há nenhuma neste plano).
