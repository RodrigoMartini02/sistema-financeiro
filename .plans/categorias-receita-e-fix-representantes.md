# Plano de Implementação: Categorias de Receita + Fix 404 Representantes

## Origem

- Contexto: discussão em sessão (sem arquivo .md de spec)
- Data do planejamento: 2026-06-28
- Classificação: `frontend + backend + database`

## Resumo

Dois problemas a resolver em conjunto:

1. **Bug crítico**: O backend em produção local roda `backend/server.js` (JS antigo), que não tem a rota `/api/representantes`. O backend TypeScript moderno (`backend/src/server.ts`) existe e tem todas as rotas, mas nunca é iniciado. Isso causa o erro "Rota não encontrada" ao salvar representantes.

2. **Feature**: Criar lista configurável de Tipos de Receita, gerenciada pelo usuário em Configurações → Categorias (nova aba "Receitas"). Essa lista substitui os tipos hardcoded em `RepresentantesTab.tsx` e alimenta o campo "Tipo" no `IncomeDialog.tsx`.

## Escopo

### Dentro do escopo

- Corrigir `backend/package.json` para iniciar o servidor TS em dev
- Verificar quais rotas do `server.js` antigo ainda não foram portadas para o TS (antes de trocar)
- Nova tabela `tipos_receita` no banco (migration — confirmar antes de executar)
- Novo endpoint `/api/income-types` com alias `/api/tipos-receita` no backend TS
- Nova aba "Receitas" em `CategoriasTab.tsx` (abas Despesas / Receitas)
- `RepresentantesTab.tsx`: substituir array `TIPOS_RECEITA` hardcoded por lista dinâmica da API
- `IncomeDialog.tsx`: campo tipo usando lista dinâmica (sem tipos hardcoded)
- Novo `queryKeys.incomeTypes` em `queryKeys.ts`

### Fora do escopo

- Migração completa do `server.js` antigo para TS (risco alto, tarefa separada)
- Batch rows no `IncomeDialog` (feature separada, plano próprio)
- Hierarquia/subcategorias de receita
- Exportação ou relatório por tipo de receita

## Leitura de contexto

- `/AGENT.md` — lido ✓
- `backend/src/server.ts` — lido ✓
- `backend/src/routes/representatives.ts` — lido ✓
- `backend/src/routes/categories.ts` — lido ✓
- `backend/package.json` — lido ✓
- `src/screens/config/CategoriasTab.tsx` — lido ✓
- `src/screens/config/RepresentantesTab.tsx` — lido ✓
- `src/screens/finance/IncomeDialog.tsx` — lido ✓
- `src/services/apiClient.ts` — lido ✓
- `src/services/queryKeys.ts` — lido ✓
- `vite.config.ts` — lido ✓

## Impacto por área

### Frontend

**Telas afetadas:**
- `src/screens/config/CategoriasTab.tsx` — adicionar aba interna "Despesas" / "Receitas"
- `src/screens/config/RepresentantesTab.tsx` — trocar `TIPOS_RECEITA` hardcoded por `useQuery(incomeTypes)`
- `src/screens/finance/IncomeDialog.tsx` — `ToggleGroup` ou `Select` alimentado pela lista dinâmica

**Componentes novos:**
- Nenhum — reutilizar `Dialog`, `Field`, `Input`, `Button` já existentes

**Novos arquivos:**
- `src/services/incomeTypesService.ts` — `fetchIncomeTypes`, `saveIncomeType`, `deleteIncomeType`, `toggleIncomeType`

**queryKeys:**
- Adicionar `incomeTypes: ['income-types'] as const` em `src/services/queryKeys.ts`

**Loading/error/empty:**
- Seguir o mesmo padrão de `CategoriasTab.tsx` — lista vazia com mensagem, loading inline

### Backend

**Novos arquivos:**
- `backend/src/routes/income-types.ts` — CRUD completo

**Rotas:**
```
GET    /api/income-types        → lista tipos ativos do usuário
POST   /api/income-types        → cria novo tipo
PUT    /api/income-types/:id    → edita nome
PATCH  /api/income-types/:id/toggle → ativa/desativa
DELETE /api/income-types/:id    → exclui (se não estiver em uso)
```

**Registro em `backend/src/server.ts`:**
```ts
import incomeTypeRoutes from './routes/income-types';
app.use('/api/income-types', incomeTypeRoutes);
app.use('/api/tipos-receita', incomeTypeRoutes); // PT alias
```

**Middleware:** usar `authenticate` em todas as rotas (padrão existente)

**Multi-tenant:** filtrar sempre por `usuario_id` derivado do token (`req.user!.id`). Nunca confiar em `usuario_id` vindo do client.

**Fix 404:**
- Atualizar `backend/package.json` scripts `dev` e `start` para rodar o servidor TS
- **Antes de trocar**: comparar rotas do `server.js` com as do `backend/src/server.ts` para identificar gaps

### Banco de dados

**Nova tabela:**
```sql
CREATE TABLE tipos_receita (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome        VARCHAR(100) NOT NULL,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id, nome)
);

CREATE INDEX idx_tipos_receita_usuario ON tipos_receita(usuario_id);
```

**Impacto em colunas existentes:**
- `comissoes.tipo_receita` (text) — continua como texto livre; valores antigos não quebram
- `receitas.tipo_receita` (text) — idem

> ⚠️ **Atenção**: migration não deve ser executada sem confirmação explícita do usuário.
> O ambiente atual pode estar apontando para produção.

### Infra/Deploy

- Nenhuma env var nova necessária
- Backend TS já tem scripts de build — verificar se `tsc` compila corretamente antes de trocar o script de dev

## Estratégia de implementação

### Etapa 1 — Diagnóstico de rotas (pré-requisito)

Comparar o que existe em `backend/routes/*.js` (antigo) com `backend/src/routes/*.ts` (novo).
Listar rotas que existem no antigo mas não no novo. Reportar ao usuário antes de prosseguir.

### Etapa 2 — Fix do backend (correção do 404)

Atualizar `backend/package.json`:
```json
"dev": "ts-node-dev --respawn src/server.ts"
```
ou equivalente já configurado no projeto.

Confirmar que o servidor TS sobe sem erros antes de continuar.

### Etapa 3 — Migration da tabela `tipos_receita`

Apresentar o SQL ao usuário e aguardar confirmação explícita antes de executar.

### Etapa 4 — Backend: rota `/api/income-types`

Criar `backend/src/routes/income-types.ts` com CRUD completo.
Registrar em `backend/src/server.ts`.
Testar manualmente via curl ou Insomnia.

### Etapa 5 — Frontend: service

Criar `src/services/incomeTypesService.ts`.
Adicionar `incomeTypes` em `queryKeys.ts`.

### Etapa 6 — Frontend: aba Receitas em Categorias

Adicionar controle de aba interno em `CategoriasTab.tsx`.
- Aba "Despesas" → comportamento atual sem mudança
- Aba "Receitas" → lista simples: nome + toggle ativo + editar + excluir + "Nova categoria de receita"
- Form simplificado (só nome, sem cor, sem cartão, sem parent)

### Etapa 7 — Frontend: RepresentantesTab

Remover `const TIPOS_RECEITA = [...]`.
Adicionar `useQuery({ queryKey: queryKeys.incomeTypes, queryFn: fetchIncomeTypes })`.
Popular o `Select` de comissão com a lista dinâmica.

### Etapa 8 — Frontend: IncomeDialog

Substituir `TIPOS` hardcoded por `useQuery(incomeTypes)`.
Manter `ToggleGroup` — só troca a fonte dos dados.
Fallback: se a lista estiver vazia, mostrar campo texto livre.

## Regras de negócio identificadas

- Um tipo de receita pertence a um usuário (não a um perfil específico) — lista compartilhada entre perfis do mesmo usuário
- Não permitir excluir tipo que esteja em uso em receitas ou comissões existentes
- Nome de tipo único por usuário (constraint `UNIQUE (usuario_id, nome)`)
- Desativar (soft delete) é preferível a excluir quando há registros associados

## Regras multi-tenant e segurança

- `usuario_id` sempre vem de `req.user!.id` (token JWT validado pelo middleware `authenticate`)
- Nunca aceitar `usuario_id` do body da requisição
- Todas as queries filtram por `usuario_id`
- Ao excluir, verificar ownership antes de deletar

## Validações necessárias

**Backend:**
- `nome` obrigatório, string, max 100 chars
- `nome` único por usuário (retornar 400 se duplicado)
- Verificar uso antes de excluir: consultar `receitas.tipo_receita` e `comissoes.tipo_receita`

**Frontend:**
- Campo nome obrigatório antes de submeter
- Feedback de erro inline no dialog

## Arquivos provavelmente afetados

```
backend/package.json
backend/src/routes/income-types.ts        ← novo
backend/src/server.ts
src/services/incomeTypesService.ts        ← novo
src/services/queryKeys.ts
src/screens/config/CategoriasTab.tsx
src/screens/config/RepresentantesTab.tsx
src/screens/finance/IncomeDialog.tsx
```

## Comandos de validação sugeridos

```bash
# Build do backend TS
cd backend && npx tsc --noEmit

# Build do frontend
npx vite build

# Typecheck frontend
npx tsc --noEmit
```

## Riscos e pontos de atenção

- **Risco alto**: Trocar `server.js` por TS sem mapear gaps de rotas pode derrubar funcionalidades que só existem no antigo. Etapa 1 é obrigatória antes de qualquer mudança.
- **Risco médio**: A tabela `tipos_receita` em produção requer migration. Se o ambiente for produção, executar a migration sem backup pode ser destrutivo.
- **Risco baixo**: Valores antigos em `comissoes.tipo_receita` e `receitas.tipo_receita` não serão migrados automaticamente para a nova tabela — ficam como texto livre sem vínculo. Isso é aceitável para registros históricos.

## Perguntas em aberto

- Os tipos de receita são **por usuário** (mesma lista em todos os perfis) ou **por perfil** (empresa e pessoal com listas separadas)? → assumido: por usuário (mais simples), ajustar se necessário.

## Critérios de aceite

- `POST /api/representantes` retorna 201 sem erros
- Usuário consegue criar/editar/excluir tipos de receita em Configurações → Categorias → aba Receitas
- Form de representante mostra tipos vindos da API (não hardcoded)
- `IncomeDialog` exibe tipos vindos da API
- Nenhum endpoint anteriormente funcional quebra após a troca do backend

## Observações para a skill implementar

- Começar sempre pela Etapa 1 (diagnóstico de gaps do backend antigo) antes de qualquer alteração
- Não executar migrations sem confirmação explícita do usuário
- Seguir `/AGENT.md` — queries filtradas por `usuario_id` do token, nunca do body
- Reutilizar padrões de `backend/src/routes/categories.ts` e `src/screens/config/CategoriasTab.tsx`
- Não alterar `.env`
