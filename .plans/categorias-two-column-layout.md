# Plano de Implementação: Categorias — Layout Duas Colunas

## Origem

- Arquivo de especificação: conversa direta com o usuário (2026-06-28)
- Data do planejamento: 2026-06-28
- Classificação: `frontend-only`

## Resumo

Substituir a navegação por abas (Despesas / Receitas) na tela de Categorias por um layout de duas colunas lado a lado. A coluna esquerda exibe categorias de Despesas com acento vermelho; a coluna direita exibe tipos de Receita com acento verde. Ambas ficam visíveis e operacionais simultaneamente, sem troca de aba.

## Escopo

### Dentro do escopo

- Remover `TabType`, `activeTab` e o bloco de tabs UI
- Layout `grid-cols-1` (mobile) / `grid-cols-2` (desktop) com `gap-6`
- Header de cada coluna: label colorido, contador de itens, botão de ação
- `CategoriaRow` (despesas): hover do badge e borda em vermelho
- `ConfigListRow`: nova prop opcional `colorScheme?: 'brand' | 'red' | 'green'`
- `IncomeTypesPanel`: botão "+ Novo tipo" verde, repassar `colorScheme='green'` ao `ConfigListRow`

### Fora do escopo

- Alterações de backend ou banco de dados
- Outros componentes fora do fluxo de Categorias
- Mudança na lógica de salvar/deletar/toggle

## Leitura de contexto

- `/AGENT.md` — lido
- `src/screens/config/CategoriasTab.tsx` — lido
- `src/ui/ConfigListRow.tsx` — lido

## Impacto por área

### Frontend

**Telas afetadas:** `src/screens/config/CategoriasTab.tsx`

Alterações:
- Remover `type TabType`, `useState<TabType>`, botões de tab e lógica `activeTab`
- Adicionar wrapper `<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">`
- Painel esquerdo (Despesas):
  - Header: `<span>` vermelho (ponto + label "Despesas") + contador + botão "+ Nova categoria" com cor vermelha
  - `CategoriaRow` recebe `colorScheme="red"` → aplica `group-hover:bg-red-50 group-hover:text-red-600` no badge e `hover:border-red-300` no card
- Painel direito (Receitas):
  - `IncomeTypesPanel` com `colorScheme="green"`
  - Header interno: ponto verde + "Receitas" + botão verde
  - `ConfigListRow` com `colorScheme="green"` → `group-hover:bg-green-50 group-hover:text-green-600`

**Componente `ConfigListRow`:**
- Adicionar prop `colorScheme?: 'brand' | 'red' | 'green'` (padrão `'brand'`)
- Mapa de classes por scheme:
  - `brand`: `hover:border-brand-300`, badge `group-hover:bg-brand-50 group-hover:text-brand-600`, chevron `group-hover:text-brand-400`
  - `red`: `hover:border-red-300`, badge `group-hover:bg-red-50 group-hover:text-red-600`, chevron `group-hover:text-red-400`
  - `green`: `hover:border-green-300`, badge `group-hover:bg-green-50 group-hover:text-green-600`, chevron `group-hover:text-green-400`

**Componente `CategoriaRow`:**
- Adicionar prop `colorScheme?: 'red' | 'brand'` (padrão `'brand'`)
- Aplicar hover vermelho no badge número e na borda do card

**Componente `IncomeTypesPanel`:**
- Adicionar prop `colorScheme?: 'green' | 'brand'` (padrão `'brand'`)
- Repassar ao `ConfigListRow`
- Aplicar cor verde ao botão "+ Novo tipo"

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/ui/ConfigListRow.tsx`
- `src/screens/config/CategoriasTab.tsx`

## Estratégia de implementação

1. Atualizar `src/ui/ConfigListRow.tsx`:
   - Adicionar tipo `ColorScheme = 'brand' | 'red' | 'green'`
   - Adicionar prop `colorScheme?: ColorScheme` (padrão `'brand'`)
   - Criar mapa de classes `SCHEME` com as variantes
   - Aplicar classes dinâmicas no badge, borda e chevron

2. Atualizar `src/screens/config/CategoriasTab.tsx`:
   a. Remover `type TabType`, `activeTab` state e bloco de tabs UI
   b. Adicionar prop `colorScheme` em `CategoriaRow` e aplicar hover vermelho
   c. Adicionar prop `colorScheme` em `IncomeTypesPanel` com suporte a verde
   d. Construir layout final:
      ```
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div> <!-- Despesas --> </div>
        <div> <!-- Receitas (IncomeTypesPanel) --> </div>
      </div>
      ```
   e. Header da coluna Despesas: indicador vermelho + "Despesas" + botão vermelho
   f. Header da coluna Receitas (dentro de IncomeTypesPanel): indicador verde + "Receitas" + botão verde

3. Rodar build para validar sem erros de tipo

## Regras de negócio identificadas

- Comportamento de CRUD (salvar, deletar, toggle) não muda
- Apenas a apresentação visual é alterada
- Em mobile: uma coluna por vez (a grid colapsa para 1 coluna)

## Regras multi-tenant e segurança

Sem impacto — alteração puramente de layout/UI.

## Validações necessárias

- Build Vite sem erros de TypeScript
- Visual responsivo: mobile exibe uma coluna, desktop exibe duas

## Testes necessários

### Frontend

- Verificar visualmente que ambas as colunas carregam dados ao mesmo tempo
- Verificar que CRUD (criar, editar, excluir, toggle) continua funcionando em ambas as colunas
- Verificar layout em viewport mobile (< lg) → coluna única

## Comandos de validação sugeridos

```bash
npx vite build
```

## Riscos e pontos de atenção

- `CategoriaRow` usa `borderLeftColor` via inline style (cor da categoria) — coexiste bem com hover vermelho
- Se a lista de categorias for muito longa, as colunas ficarão com alturas diferentes — comportamento esperado e aceitável

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Tabs removidas
- Duas colunas visíveis lado a lado em desktop
- Coluna esquerda com acento visual vermelho (Despesas)
- Coluna direita com acento visual verde (Receitas)
- CRUD de ambas as colunas funcionando normalmente
- Build passa sem erros

## Observações para a skill implementar

- Não executar migrations — sem impacto de banco
- Seguir `/AGENT.md`
- Alterações pequenas e focadas em dois arquivos apenas
- Não tocar em lógica de negócio, apenas layout e theming
