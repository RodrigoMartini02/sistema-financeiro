# Plano de Implementação: Painel de filtros multi-seleção em Despesas

## Origem

- Arquivo de especificação: nenhum (originado de discussão direta na conversa)
- Data do planejamento: 2026-09-20
- Classificação: `frontend-only`

## Resumo

Criar um componente genérico e reutilizável de "painel de filtros multi-seleção" em `src/ui/`, e usá-lo para substituir a fileira de 6 `FilterChip`s single-select da tela de Despesas por um único botão no canto direito da toolbar (mesma posição de hoje) que abre um card com checkboxes agrupados por filtro. Cada seleção aplica instantaneamente, sem botão "Aplicar". O componente nasce pensado para ser reaproveitado depois em Receitas e outras telas, padronizando como filtros de listagem são definidos e renderizados no projeto — hoje cada tela reimplementa o próprio padrão do zero.

## Escopo

### Dentro do escopo

- Novo componente genérico `src/ui/MultiFilterPanel.tsx`: recebe uma lista tipada de "grupos de filtro" (id, label, opções, valores selecionados, callback de mudança) e renderiza o botão + card popover, com estado de abrir/fechar e fechar-ao-clicar-fora já embutidos.
- `DespesasScreen.tsx`: remover a fileira de `FilterChip`s (exceto Ordenação, que continua fora do painel); migrar os 6 filtros (Status, Categoria, Forma de pagamento, Cartão, Data de pagamento, Escopo família, Autor) de estado `string` único para `Set<string>`/`string[]`; montar a lista de grupos e passar para o novo componente; atualizar a lógica de `.filter()` para checar pertencimento em conjunto.
- Indicador visual de "tem filtro ativo" no botão, reaproveitando o mesmo padrão de cor já usado nos chips atuais (sem badge numérico).
- Atualizar "Limpar filtros" para zerar todos os conjuntos.

### Fora do escopo

- Aplicar o novo componente em Receitas ou qualquer outra tela nesta rodada — só a criação do componente genérico e sua aplicação em Despesas. Reuso futuro fica para quando solicitado.
- Qualquer filtro novo exclusivo de PJ.
- Ordenação (`ordenar`) — continua como está, fora do painel.
- Mudança de contrato de API/backend.

## Leitura de contexto

- `/AGENT.md` (raiz do monorepo).
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados neste projeto.
- Investigação nesta sessão: `src/screens/despesas/DespesasScreen.tsx` (linhas 31-33, 135-196, 240-268, 343-388, 480-599), `src/screens/despesas/DeleteInstallmentDialog.tsx` (referência de multi-seleção com `Set`), `src/ui/KebabMenu.tsx`, `src/ui/ListToolbar.tsx` (não reaproveitável — é wrapper de layout de outras telas, não seletor de filtro), `src/ui/CategoryFloatingSelect.tsx` (não reaproveitável — single-select de formulário, mas referência de popover ancorado via `getBoundingClientRect`), `src/layout/AccountMenu.tsx` (referência de acessibilidade), `src/ui/zIndex.ts`.

## Impacto por área

### Frontend

- **Novo arquivo** `src/ui/MultiFilterPanel.tsx`: componente genérico. Proposta de API:
  ```ts
  interface FilterGroup<T extends string = string> {
    id: string;
    label: string;
    options: { value: T; label: string }[];
    selected: Set<T>;
    onChange: (next: Set<T>) => void;
  }
  interface MultiFilterPanelProps {
    groups: FilterGroup[];
    hasActiveFilters: boolean;
    onClear: () => void;
  }
  ```
  Renderiza um botão de ícone (ex: `SlidersHorizontal` ou `Filter` do lucide-react) + card popover com cada grupo como uma seção com checkboxes, seguindo o mesmo padrão técnico já usado por `FilterChip` (useState + useRef + listener `mousedown`, z-index de `src/ui/zIndex.ts`), mas com acessibilidade melhor (`role="group"`, `aria-expanded` no botão, seguindo o nível já usado em `AccountMenu.tsx`).
- `src/screens/despesas/DespesasScreen.tsx`: troca de tipos de estado (`string` → `Set<string>`), montagem do array de `FilterGroup[]`, ajuste de `.filter()` (linhas 358-369) e de `hasFilter2`.
- Sem mudança de query keys, hooks de dados, ou schemas de formulário — reorganização de UI e lógica local.

### Backend

`Sem impacto esperado`.

### Banco de dados

`Sem impacto esperado`.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. (Não aplicável aqui — este plano não gera migration.)

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `src/ui/MultiFilterPanel.tsx` (novo)
- `src/screens/despesas/DespesasScreen.tsx`

## Estratégia de implementação

1. Criar `src/ui/MultiFilterPanel.tsx` com a API genérica de `FilterGroup[]`, botão + card popover, checkboxes por opção, "selecionar todas"/"limpar" por grupo opcional (a definir se necessário na implementação), fechar ao clicar fora, indicador visual de filtro ativo no botão.
2. Em `DespesasScreen.tsx`, trocar os 6 estados `string` por `Set<string>` (ou tipo apropriado por filtro).
3. Montar o array `FilterGroup[]` a partir dos dados já existentes (categorias, formas, cartõesUsados, autores) e renderizar `<MultiFilterPanel groups={...} />` no lugar da fileira de `FilterChip`s.
4. Ajustar a lógica de `.filter()` (linhas 358-369) para usar `.has()`/`.size === 0` (conjunto vazio = sem filtro, todos passam) em vez de comparação de igualdade com string vazia.
5. Ajustar `hasFilter2` e o botão "Limpar" para verificar se algum conjunto tem itens.
6. Rodar build (`tsc --noEmit`, `vite build`) e validar visualmente: abrir o painel, marcar múltiplas opções em um mesmo grupo (ex: duas categorias), confirmar que a tabela reflete a união; combinar grupos diferentes e confirmar que é interseção entre grupos.

## Regras de negócio identificadas

- Selecionar múltiplas opções dentro do mesmo grupo = OR (ex: Status "Pago" OU "Atrasada").
- Selecionar opções em grupos diferentes = AND (ex: Categoria "Moradia" E Status "Pago").
- Grupos condicionais (Cartão, Escopo família, Autor) continuam só aparecendo quando as condições atuais forem verdadeiras (existência de cartões usados, múltiplos membros, múltiplos autores).
- Filtro aplica instantaneamente a cada mudança de seleção, sem confirmação.

## Regras multi-tenant e segurança

`Sem impacto esperado` — mudança de UI e lógica de filtro client-side, sem tocar em autorização, propriedade de dados ou rotas.

## Validações necessárias

- Confirmar que nenhum filtro problemático (ex: grupo vazio de opções, como Categoria sem nenhuma despesa cadastrada) quebra a renderização do painel.
- Confirmar visualmente que a extração para `Set` não introduz re-render desnecessário ou perda de referência entre renders (evitar recriar `Set` em toda renderização sem necessidade).

## Testes necessários

### Frontend

- Selecionar múltiplas opções no mesmo grupo (ex.: 2 categorias) → tabela mostra união dos dois.
- Selecionar opções em 2+ grupos diferentes → tabela mostra interseção.
- Botão "Limpar" zera todos os grupos e o indicador de filtro ativo desaparece.
- Grupos condicionais (Cartão/Família/Autor) continuam aparecendo/somem nas mesmas condições de hoje.
- Fechar o painel ao clicar fora continua funcionando.

### Backend

Não aplicável — sem impacto de backend.

### E2E

Não aplicável — mudança de UI isolada, sem justificar teste E2E dedicado nesta rodada.

## Comandos de validação sugeridos

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Card com 6 grupos pode ficar denso — pode precisar de scroll interno dependendo do volume de opções (ex: muitas categorias).
- Perda de visibilidade imediata dos filtros ativos (mitigada pelo indicador visual já decidido, mas ainda exige abrir o painel para ver exatamente o que está marcado).
- Ao desenhar a API genérica antes de ter um segundo consumidor real (Receitas), há risco de super-generalizar ou sub-generalizar — mitigado por manter a API mínima (`FilterGroup[]` + clear) e ajustar quando o segundo uso aparecer, em vez de prever tudo agora.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Componente `MultiFilterPanel` criado em `src/ui/`, genérico o suficiente para receber qualquer lista de grupos de filtro.
- `DespesasScreen.tsx` usa o novo componente no lugar da fileira de chips, no canto direito da toolbar.
- Multi-seleção funciona (OR dentro do grupo, AND entre grupos), instantânea, com indicador visual de filtro ativo.
- Ordenação continua fora do painel, como está hoje.
- Build (`tsc --noEmit`, `vite build`) passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- O componente novo deve ser genérico (não deve importar nada específico de Despesas), mesmo sendo usado só ali por enquanto.
- Não migrar Receitas nem qualquer outra tela nesta rodada — só criar e aplicar em Despesas.
- Não executar migrations (não há nenhuma neste plano).
