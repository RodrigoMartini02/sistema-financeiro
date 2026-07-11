# Plano de Implementação: Redesign UI das Listas de Configuração

## Origem

- Data do planejamento: `2026-06-28`
- Classificação: `frontend + backend`

## Resumo

Padronizar as telas de listagem das 5 tabs de configuração (Categorias, Representantes, Sócios, Perfis, Usuários) com um padrão visual unificado: row inteira clicável, numeração sequencial, nome em negrito, datas de criação e atualização. Botão Excluir sai das rows e vai para dentro do modal de edição. CartaoTab permanece inalterada.

## Escopo

### Dentro do escopo

- Novo componente `src/ui/ConfigListRow.tsx` — row clicável reutilizável
- 5 tabs refatoradas: CategoriasTab (Despesas + Receitas), RepresentantesTab, SociosTab, PerfisTab, UsuariosTab
- Delete movido para o modal de edição (rodapé esquerdo)
- Layout responsivo: mobile stack / lg grid com mais colunas
- Backend: adicionar `data_criacao` e `data_atualizacao` ao SELECT de representantes e sócios

### Fora do escopo

- CartaoTab — mantida como está
- Mudança de campos ou lógica dos modais
- Paginação
- Novas colunas no banco (apenas expor campos existentes no SELECT)
- Badges de status
- Subtextos contextuais

## Anatomia do ConfigListRow

**Preview da row (o que aparece na lista):**
- Número sequencial (`01`, `02`, `03`...)
- Nome em negrito
- Data de criação
- Data de atualização (quando disponível)

**Mobile:** empilhado (número + nome na primeira linha, datas na segunda)
**lg (≥1024px):** grid horizontal com colunas: número | nome | criado em | atualizado em

## Arquivos afetados

### Frontend
- `src/ui/ConfigListRow.tsx` — novo componente
- `src/screens/config/CategoriasTab.tsx`
- `src/screens/config/RepresentantesTab.tsx`
- `src/screens/config/SociosTab.tsx`
- `src/screens/config/PerfisTab.tsx`
- `src/screens/config/UsuariosTab.tsx`
- `src/services/representantesService.ts` — adicionar campos de data na interface
- `src/services/sociosService.ts` — idem

### Backend
- `backend/src/routes/representatives.ts` — adicionar `data_criacao`, `data_atualizacao` ao SELECT
- `backend/src/routes/partners.ts` — idem

## Disponibilidade de datas por entidade

| Entidade | criado_em | atualizado_em | Observação |
|----------|-----------|---------------|------------|
| Categoria | `data_criacao` ✓ | — | Sem data de atualização no schema |
| IncomeType | `criado_em` ✓ | `atualizado_em` ✓ | Nossa tabela nova |
| Representante | não exposto | não exposto | Backend retorna `r.*` mas TS não expõe — adicionar ao SELECT |
| Sócio | não exposto | não exposto | Idem |
| Perfil | `data_criacao` ✓ (backend) | — | Não exposto no tipo TS — adicionar ao tipo |
| Usuário | `data_cadastro` ✓ | `data_atualizacao` ✓ | Já disponível |

## Estratégia de implementação

### 1. Backend — expor datas em representantes e sócios
- `representatives.ts`: adicionar `data_criacao`, `data_atualizacao` no SELECT
- `partners.ts`: idem

### 2. Services — atualizar tipos TS
- `representantesService.ts`: adicionar `data_criacao?: string; data_atualizacao?: string` na interface `Representante`
- `sociosService.ts`: idem para `Socio`
- Perfis: verificar interface `Perfil` e adicionar `data_criacao` se ausente

### 3. Componente ConfigListRow
Criar `src/ui/ConfigListRow.tsx`:

```tsx
interface ConfigListRowProps {
  index: number;
  nome: string;
  dataCriacao?: string;
  dataAtualizacao?: string;
  onClick: () => void;
}
```

Layout mobile (flex column):
```
[01]  Nome em negrito
      Criado 28/06/2026 · Atualizado 28/06/2026
```

Layout lg (grid):
```
[01] | Nome               | 28/06/2026 | 28/06/2026
```

Row inteira é um `<button>` com `onClick`. Sem ícones de ação inline.

### 4. Refatorar cada tab

Para cada tab:
- Substituir o bloco de listagem pelo `ConfigListRow`
- Remover botões Pencil/Trash2 das rows
- Adicionar botão "Excluir" no rodapé esquerdo do modal de edição (só aparece em modo edição, não em criação)
- Confirmar deleção com modal de confirmação (substituir `confirm()` nativo por dialog ou inline)

**Ordem de implementação:**
1. CategoriasTab (Despesas e Receitas) — mais simples
2. PerfisTab — sem deleção exposta
3. SociosTab
4. RepresentantesTab — mais complexo (comissões no modal)
5. UsuariosTab — tem paginação, cuidado extra

### 5. Responsividade
- `ConfigListRow` usa Tailwind: `grid-cols-[auto_1fr]` mobile, `lg:grid-cols-[auto_1fr_160px_160px]` desktop
- Container usa `divide-y` e `rounded-xl border`

## Riscos e pontos de atenção

- **UsuariosTab tem paginação** — preservar lógica de paginação ao refatorar
- **`confirm()` nativo para deletar** — substituir por confirmação dentro do modal (botão Excluir no rodapé com estado de confirmação inline)
- **Categorias sem `data_atualizacao`** — exibir apenas "Criado em" nessa tab
- **Datas nulas** — renderizar `—` quando data não disponível
- **Não executar migrations** — apenas SELECT changes, sem schema change

## Banco de dados

Sem alterações de schema. Apenas adição de colunas existentes ao SELECT nas rotas de representantes e sócios.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

## Critérios de aceite

- [ ] Row inteira clicável em todas as 5 tabs
- [ ] Numeração sequencial visível
- [ ] Nome em negrito
- [ ] Datas visíveis (criação e atualização onde disponível)
- [ ] Nenhum botão de ação nas rows
- [ ] Botão Excluir presente no modal de edição
- [ ] Delete com confirmação (não `confirm()` nativo)
- [ ] Layout responsivo: mobile stack, lg grid
- [ ] CartaoTab inalterada
- [ ] TypeScript sem erros novos

## Observações para a skill implementar

- Usar `ConfigListRow` como componente único reutilizado em todas as tabs
- Não alterar layout, campos ou validações dos modais existentes (só adicionar Excluir no rodapé)
- Não alterar CartaoTab
- Seguir padrão de data formatting já usado no projeto (`toLocaleDateString('pt-BR')`)
- UsuariosTab: preservar paginação existente intacta
