# Plano de Implementação: Corrigir bug do filtro "Membros"/escopo família e tornar grupos do MultiFilterPanel colapsáveis

## Origem

- Arquivo de especificação: nenhum (originado de investigação de bug relatado + pedido de melhoria de UX, direto na conversa)
- Data do planejamento: 2026-09-20
- Classificação: `frontend-only`

## Resumo

Duas correções na mesma área de filtros por membro/família: (1) um bug real onde o filtro/toggle de família nunca aparece com apenas 1 membro vinculado à conta, porque a condição de exibição usa `length > 1` sobre uma lista que já exclui o titular por natureza — corrigido para `length > 0`, mesmo padrão já correto em `FinanceDashboard.tsx`; (2) os grupos dentro do `MultiFilterPanel` (painel de filtros de Despesas) passam a ser colapsáveis individualmente, todos fechados por padrão, com indicador visual discreto quando um grupo colapsado tem filtro ativo dentro.

## Escopo

### Dentro do escopo

- Corrigir `temMembros = (membrosQ.data?.length ?? 0) > 1` para `> 0` em:
  - `src/screens/despesas/DespesasScreen.tsx:273`
  - `src/screens/receitas/ReceitasScreen.tsx:67`
  - `src/screens/config/CartaoTab.tsx:411`
  - `src/screens/finance/BudgetPanel.tsx:277`
- Adicionar collapse por grupo em `src/ui/MultiFilterPanel.tsx`: cabeçalho clicável (chevron + label) por grupo, expande/colapsa individualmente; estado inicial de todos os grupos é colapsado; múltiplos grupos podem estar expandidos ao mesmo tempo (sem exclusividade).
- Indicador visual discreto (sem número) no cabeçalho do grupo quando ele tem filtro ativo, mesmo colapsado.

### Fora do escopo

- Qualquer mudança na lógica de filtragem em si (client-side ou server-side) — só a condição de exibição (`temMembros`) e a interação de collapse.
- `FilterChip` (usado só para Ordenação hoje) — não recebe collapse, não é afetado.
- Aplicar `MultiFilterPanel` em Receitas, Cartões ou Orçamento nesta rodada — essas telas continuam com o toggle "Só eu/Família" simples que já têm; só a condição de exibição é corrigida ali.
- Qualquer alteração de backend, rota `/account-members`, ou schema.

## Leitura de contexto

- `/AGENT.md` (raiz do monorepo).
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados neste projeto.
- Investigação nesta sessão: consulta real ao banco de produção confirmando o comportamento de `GET /account-members` (lista nunca inclui o titular); `grep` confirmando os 4 arquivos com a condição incorreta e 1 arquivo (`FinanceDashboard.tsx:60`) com a condição correta; leitura de `src/ui/MultiFilterPanel.tsx` (componente completo); leitura pontual de `ReceitasScreen.tsx:235-258` e `CartaoTab.tsx:455-474` confirmando que o uso de `temMembros` nessas telas é direto e sem outras dependências.

## Impacto por área

### Frontend

- `src/screens/despesas/DespesasScreen.tsx`, `src/screens/receitas/ReceitasScreen.tsx`, `src/screens/config/CartaoTab.tsx`, `src/screens/finance/BudgetPanel.tsx`: troca mecânica de `> 1` para `> 0` na definição de `temMembros`. Nenhuma outra linha muda nesses 4 arquivos.
- `src/ui/MultiFilterPanel.tsx`: novo estado interno `useState<Set<string>>` para ids de grupos expandidos (vazio por padrão = todos colapsados); cabeçalho de cada grupo vira um botão clicável com chevron indicando estado (`aria-expanded`); conteúdo do grupo (`options.map(...)`) só renderiza quando expandido; indicador visual (cor/destaque, sem número) no cabeçalho quando `group.selected.size > 0`, independente do estado de expansão.
- Sem mudança de query keys, hooks de dados, ou schemas — tudo client-side/UI.

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
- `src/screens/config/CartaoTab.tsx`
- `src/screens/finance/BudgetPanel.tsx`
- `src/ui/MultiFilterPanel.tsx`

## Estratégia de implementação

1. Corrigir a condição `temMembros` nos 4 arquivos listados (`> 1` → `> 0`).
2. Em `MultiFilterPanel.tsx`, adicionar `const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(new Set())`.
3. Transformar o cabeçalho de cada grupo (hoje um `<p>` estático) em um `<button>` clicável que alterna a presença do `group.id` em `gruposAbertos`, com chevron (`ChevronDown`/`ChevronRight` do lucide-react) indicando estado, e `aria-expanded`.
4. Renderizar o bloco de opções do grupo (`group.options.map(...)`) condicionalmente, só quando `gruposAbertos.has(group.id)`.
5. Adicionar destaque visual (ex: cor do texto do label do grupo) quando `group.selected.size > 0`, independente de estar expandido ou não.
6. Rodar build (`tsc --noEmit`, `vite build`) e revisar visualmente a lógica: painel abre com todos os grupos fechados; clicar em um expande só aquele; grupos com filtro ativo mostram o destaque mesmo fechados; grupo "Membros" e toggles de família agora aparecem com apenas 1 membro vinculado.

## Regras de negócio identificadas

- A lista de membros retornada pela API nunca inclui o titular — qualquer condição de "existem membros para filtrar" deve ser `length > 0`, não `> 1`.
- Grupos do painel de filtro são independentes entre si quanto ao estado de expansão (não é accordion exclusivo).

## Regras multi-tenant e segurança

`Sem impacto esperado` — mudança de condição de exibição e interação de UI, sem tocar em autorização, propriedade de dados ou rotas.

## Validações necessárias

- Confirmar visualmente que a correção do bug reflete no cenário real relatado (titular + 1 membro vinculado) nas 4 telas afetadas.
- Confirmar que o collapse não quebra a leitura por teclado/screen reader do painel (mesmo nível de cuidado do botão principal, que já usa `aria-haspopup`/`aria-expanded`).

## Testes necessários

### Frontend

- Com exatamente 1 membro vinculado à conta: grupo "Membros" aparece em Despesas; toggle "Só eu/Família" aparece em Receitas, Cartões e Orçamento.
- Painel de Despesas abre com todos os grupos colapsados.
- Expandir um grupo não colapsa os demais.
- Marcar uma opção dentro de um grupo, colapsar o grupo: destaque visual permanece indicando filtro ativo.
- Limpar filtros: destaque visual desaparece de todos os grupos.

### Backend

Não aplicável — sem impacto de backend.

### E2E

Não aplicável — mudança de UI/condição isolada.

## Comandos de validação sugeridos

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Baixíssimo risco na correção do bug — mesma condição já validada em produção via `FinanceDashboard.tsx`.
- Cuidado para manter acessibilidade do collapse (`aria-expanded`, navegação por teclado) no mesmo nível já existente no painel.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Grupo "Membros"/toggle "Família" aparece corretamente com 1+ membros vinculados nas 4 telas afetadas.
- Grupos do `MultiFilterPanel` colapsam/expandem individualmente, começando todos fechados.
- Indicador visual (sem número) aparece em grupo colapsado com filtro ativo.
- Build (`tsc --noEmit`, `vite build`) passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- A correção do bug é puramente mecânica (trocar `> 1` por `> 0`) — não alterar mais nada nesses 4 arquivos além dessa linha.
- Não migrar `MultiFilterPanel` para outras telas nesta rodada.
- Não executar migrations (não há nenhuma neste plano).
