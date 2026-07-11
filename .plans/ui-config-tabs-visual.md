# Plano de Implementação: Visual das Tabs de Configuração

## Origem

- Arquivo de especificação: conversa — análise de UI/responsividade (2026-06-25)
- Data do planejamento: `2026-06-25`
- Classificação: `frontend-only`

## Resumo

Melhora visual de duas telas de configuração que estão com layout genérico e sem hierarquia clara:

1. **CartaoTab** — lista de linhas → grid de cards visuais estilo cartão físico
2. **CategoriasTab** — dots de cor invisíveis e hierarquia flat → borda colorida por categoria + fundo diferenciado para subcategorias
3. **ConfigScreen** — `max-w-5xl` → `max-w-7xl` para melhor aproveitamento em telas largas (1440px+)

Nenhum endpoint, schema ou migration envolvidos. Apenas alterações de apresentação em componentes React existentes.

## Escopo

### Dentro do escopo

- `ConfigScreen.tsx` — aumentar max-width para `max-w-7xl`
- `CartaoTab.tsx` — substituir lista linear por grid de cards visuais estilo cartão físico
- `CategoriasTab.tsx` / `CategoriaRow` — substituir dot de cor por borda esquerda colorida; diferenciar visualmente subcategorias

### Fora do escopo

- `PerfisTab`, `SociosTab`, `RepresentantesTab`, `UsuariosTab` — não solicitado
- Lógica de dados, queries, mutations — sem alteração
- Backend, banco de dados, infra — sem impacto

## Leitura de contexto

- `/AGENT.md`
- `src/screens/config/ConfigScreen.tsx`
- `src/screens/config/CartaoTab.tsx`
- `src/screens/config/CategoriasTab.tsx`
- `src/layout/AppShell.tsx` (referência para padrões de cor/gradient já usados)

## Impacto por área

### Frontend

**`src/screens/config/ConfigScreen.tsx`**
- Linha 32: `max-w-5xl` → `max-w-7xl`

**`src/screens/config/CartaoTab.tsx`**

Substituir o bloco de lista (`divide-y divide-slate-100 rounded-xl border...`) por:
- `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4`
- Cada item renderizado como card visual com:
  - Fundo: `linear-gradient(135deg, ${c.cor}, ${c.cor}cc)` — mesma lógica do preview do dialog
  - Topo: ícone de cartão (branco) + botões editar/excluir (fundo `bg-white/15`, hover `bg-white/25`)
  - Número: `•••• •••• •••• ${c.numero_cartao ?? '????'}` em fonte mono, cor `text-white/60`
  - Nome: `text-lg font-bold text-white`
  - Rodapé com dois grupos: Limite (esquerda) e Vencimento (direita), label `text-[10px] uppercase text-white/50`, valor `text-sm font-bold text-white`
  - Empty state com ícone `CreditCard` + texto descritivo

**`src/screens/config/CategoriasTab.tsx` — `CategoriaRow`**

Categoria raiz (não `isChild`):
- Adicionar `border-l-4` na div da row
- `style={{ borderLeftColor: cat.cor ?? '#94a3b8' }}`
- Remover `h-3.5 w-3.5 rounded-full` (dot antigo — substituído pela borda)
- Manter expand toggle, nome, badges e botões

Subcategoria (`isChild`):
- Manter `pl-8`
- Adicionar `bg-slate-50/70`
- Borda: `border-l-4` com `style={{ borderLeftColor: \`${cat.cor ?? '#94a3b8'}70\` }}` (opacidade)
- Remover dot

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/config/ConfigScreen.tsx` — 1 linha
- `src/screens/config/CartaoTab.tsx` — bloco de renderização da lista (`CartaoTab` function, linha ~144–175)
- `src/screens/config/CategoriasTab.tsx` — componente `CategoriaRow` (linha ~129–229)

## Estratégia de implementação

1. **`ConfigScreen.tsx`** — trocar `max-w-5xl` por `max-w-7xl` (1 linha)

2. **`CartaoTab.tsx`** — substituir o `<div className="divide-y ...">` completo por grid de cards visuais
   - Manter o mesmo `CartaoDialog` e mutations — sem toque na lógica
   - Reutilizar o padrão de gradient já presente no `CartaoDialog` (preview do cartão)
   - Garantir que botões editar/excluir fiquem acessíveis sobre o fundo colorido

3. **`CategoriasTab.tsx`** — editar `CategoriaRow`
   - Remover `<span className="h-3.5 w-3.5 shrink-0 rounded-full shadow-sm" style={{ background: cat.cor }} />`
   - Adicionar `border-l-4` + `style borderLeftColor` na div principal da row
   - Para `isChild`: adicionar `bg-slate-50/70` + borda com opacidade
   - Manter toda a lógica de expand, botões e subcategorias

4. **Validar** com `npm run build`

## Regras de negócio identificadas

- O campo `cat.cor` pode ser `null` → sempre usar fallback `'#94a3b8'`
- O campo `c.numero_cartao` pode ser `null` → usar `'????'` no display
- O campo `c.limite` pode ser `null`/`0` → exibir `—` ou omitir
- A hierarquia de categoria é no máximo 2 níveis (root + subcategorias diretas) — não há subcategorias de subcategorias

## Regras multi-tenant e segurança

Sem impacto — alterações puramente visuais. Nenhum dado novo é exposto ou modificado.

## Validações necessárias

- Fallback de cor em `CartaoTab`: `c.cor ?? '#1e293b'`
- Fallback de cor em `CategoriasTab`: `cat.cor ?? '#94a3b8'`
- Garantir que o card de cartão não quebre quando `limite`, `dia_vencimento` ou `numero_cartao` forem nulos

## Testes necessários

### Frontend

- Verificar que grid de cartões aparece com 1 coluna em mobile, 2 em tablet, 3 em desktop
- Verificar que cartão sem número mostra `????`
- Verificar que cartão sem limite mostra campo vazio/`—`
- Verificar que borda colorida de categoria aparece corretamente
- Verificar que subcategorias têm fundo diferenciado e borda com opacidade
- Verificar empty states de Cartões e Categorias

### Backend

Sem testes necessários.

### E2E

Não aplicável para este escopo.

## Comandos de validação sugeridos

```bash
npm run build
```

## Riscos e pontos de atenção

- **Risco mínimo — campos nulos**: `numero_cartao`, `limite` e `dia_vencimento` podem ser nulos; tratar com fallbacks
- **Risco mínimo — cor nula**: `cat.cor` e `c.cor` podem ser nulos; já existem fallbacks no código atual, manter o padrão
- **Sem risco de regressão na lógica**: mutations, queries e dialogs não são tocados

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- Cartões aparecem em grid visual (não lista) com fundo colorido e informações organizadas como cartão físico
- Botões editar e excluir são acessíveis sobre o fundo colorido do card
- Categorias têm borda esquerda colorida identificando a cor de cada uma
- Subcategorias têm fundo levemente diferenciado e borda com opacidade reduzida
- Layout de `ConfigScreen` se expande em telas largas sem quebrar em mobile
- `npm run build` passa sem erros

## Observações para a skill implementar

- Seguir `/AGENT.md` — código explícito, sem abstrações desnecessárias.
- Não tocar em lógica de dados, queries ou mutations.
- Reutilizar o padrão de gradient `linear-gradient(135deg, ${cor}, ${cor}cc)` já presente no `CartaoDialog`.
- O `CategoriaRow` renderiza recursivamente subcategorias — editar apenas a div de apresentação, não a lógica de recursão.
- Não alterar `ConfigScreen` além do `max-w`.
- Não abrir PR sem instrução explícita do usuário.
