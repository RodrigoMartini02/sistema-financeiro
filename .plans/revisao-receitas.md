# Plano de Implementação: Revisão Completa do Módulo de Receitas

## Origem

- Data do planejamento: `2026-06-30`
- Classificação: `frontend + backend + database`

## Resumo

Expandir o módulo de receitas para diferenciar PF de Empresa, adicionar cálculo de deduções (imposto + comissão → valor líquido), mostrar novas colunas na tabela de receitas e migrar a funcionalidade "Replicar até" do JS legado para o React.

## Escopo

### Dentro do escopo

- Migrations: adicionar `enquadramento` e `aliquota_imposto` em `perfis`; `aliquota_aplicada`, `valor_imposto`, `valor_comissao` em `receitas`
- Backend: atualizar GET/POST/PUT de perfis e receitas para os novos campos
- PerfisTab: conectar enquadramento + alíquota ao backend (hoje o dropdown não salva)
- IncomeDialog: diferenciação PF vs Empresa — seção de Deduções (imposto + comissão + valor líquido) visível apenas para empresa
- ReceitasScreen: novas colunas "Receita Bruta | Imposto | Comissão | Valor Líquido" para perfil empresa
- "Replicar até": migrar do JS legado para o IncomeDialog React (checkbox + selects mês/ano)

### Fora do escopo

- Relatórios ou PDFs
- Cálculo automático de alíquota por tipo de enquadramento (MEI = X%, etc.) — alíquota é sempre manual
- Retroativamente recalcular receitas existentes com os novos campos
- Alterações em despesas

## Diagnóstico atual

| Área | Situação |
|------|----------|
| `perfis` schema | Sem `enquadramento` e `aliquota_imposto` — não existem no DB |
| `receitas` schema | Sem `aliquota_aplicada`, `valor_imposto`, `valor_comissao` |
| PerfisTab.tsx | Dropdown enquadramento na UI mas **não salva** (sem campo no backend) |
| IncomeDialog | Mesmo formulário para PF e empresa, sem deduções |
| ReceitasScreen | Colunas: Data, Descrição, Cliente, Tipo, Valor, Anexos, Ações |
| "Replicar até" | Só em `js/receita.js` (legacy), não migrado para React |

## Estratégia de implementação

### Etapa 1 — Criar branch
```bash
git checkout -b feat/R/revisao-receitas
```

### Etapa 2 — Schema Drizzle (backend/src/db/schema/)

**profiles.ts** — adicionar:
```ts
enquadramento: varchar('enquadramento', { length: 10 }).$type<'MEI' | 'ME' | 'EPP' | 'SLU' | 'EIRELI' | 'LTDA' | 'SA'>(),
aliquotaImposto: decimal('aliquota_imposto', { precision: 5, scale: 2 }),
```

**incomes.ts** — adicionar:
```ts
aliquotaAplicada: decimal('aliquota_aplicada', { precision: 5, scale: 2 }),
valorImposto:     decimal('valor_imposto',     { precision: 10, scale: 2 }),
valorComissao:    decimal('valor_comissao',    { precision: 10, scale: 2 }),
```

### Etapa 3 — Migrations SQL (apresentar ao usuário para aprovação antes de executar)

```sql
-- perfis
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS enquadramento VARCHAR(10);
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS aliquota_imposto DECIMAL(5,2);

-- receitas
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS aliquota_aplicada DECIMAL(5,2);
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS valor_imposto DECIMAL(10,2);
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS valor_comissao DECIMAL(10,2);
```

> **ATENÇÃO: NÃO executar migrations automaticamente. Apresentar o SQL ao usuário e aguardar confirmação explícita. O banco pode estar apontando para produção.**

### Etapa 4 — Backend: perfis (backend/src/routes/profiles.ts)

- **GET** → adicionar `enquadramento, aliquota_imposto` ao SELECT
- **POST** empresa → receber e inserir `enquadramento`, `aliquota_imposto`
- **PUT** → receber e atualizar `enquadramento`, `aliquota_imposto`

### Etapa 5 — Backend: receitas (backend/src/routes/incomes.ts)

- **POST** → receber e inserir `aliquota_aplicada`, `valor_imposto`, `valor_comissao`
- **PUT** → receber e atualizar `aliquota_aplicada`, `valor_imposto`, `valor_comissao`

### Etapa 6 — Tipos + service (frontend)

**src/types/finance.ts**
- `Income`: adicionar `aliquotaAplicada?: number | null`, `valorImposto?: number | null`, `valorComissao?: number | null`
- `IncomeFormValues`: adicionar `aliquota_aplicada?: number`, `valor_imposto?: number`, `valor_comissao?: number`
- Perfil (usado em contexto/store): adicionar `enquadramento?: string | null`, `aliquotaImposto?: number | null`

**src/services/financeService.ts**
- Mapear campos novos de `RawIncome` → `Income` em `incomeFromApi`
- Passar campos novos em `saveIncome`

### Etapa 7 — PerfisTab.tsx

- Conectar dropdown `enquadramento` ao PUT do backend
- Adicionar campo "Alíquota de imposto (%)" no formulário empresa
- Carregar `enquadramento` e `aliquota_imposto` na resposta GET e pré-preencher o formulário

### Etapa 8 — IncomeDialog.tsx

**isEmpresa** (mesmo padrão do ExpenseDialog):
```ts
const isEmpresa = useMemo(() => localStorage.getItem('perfilAtivoTipo') === 'empresa', []);
```

**Seção Deduções** (empresa only, abaixo de Valor):
```
┌── Deduções ────────────────────────────────────────────┐
│ Alíquota imposto: [  6,00 %]   Imposto: R$ XX,XX      │
│ Comissão:                      R$ XX,XX                │
│ ────────────────────────────────────────────────────── │
│ Valor líquido:                 R$ XX,XX  (em destaque) │
└────────────────────────────────────────────────────────┘
```

- `aliquota_aplicada`: campo number editável, pre-preenchido com `perfil.aliquota_imposto` (lido via store/contexto)
- `valor_imposto`: calculado em real-time: `valor × aliquota / 100` (display + enviado no submit)
- `valor_comissao`: exibido (já calculado pelo representante), enviado no submit
- `valor_liquido`: `valor - valor_imposto - valor_comissao` (display only, não salvo)

**Seção "Replicar até"** (PF e Empresa, visível só em nova receita — não em edição):
```
□ Replicar até  [Mês ▼] [Ano ▼]
```
- Ao salvar: se checkbox marcado, após salvar a receita principal, chama POST para cada mês intermediário
- Exibe toast de progresso: "Replicando 3 meses..."
- Não aparece em modo edição (income existente)

### Etapa 9 — ReceitasScreen.tsx

Para perfil empresa, adicionar colunas após "Valor":

| Receita Bruta | Imposto | Comissão | Valor Líquido |
|---|---|---|---|
| R$ 10.000 | R$ 600 (6%) | R$ 500 (5%) | R$ 8.900 |

Para PF, manter colunas atuais.

### Etapa 10 — Build e validação

```bash
npx vite build
cd backend && npm run build
```

## Arquivos afetados

- `backend/src/db/schema/profiles.ts`
- `backend/src/db/schema/incomes.ts`
- `backend/src/routes/profiles.ts`
- `backend/src/routes/incomes.ts`
- `src/types/finance.ts`
- `src/services/financeService.ts`
- `src/screens/settings/PerfisTab.tsx`
- `src/screens/finance/IncomeDialog.tsx`
- `src/screens/finance/ReceitasScreen.tsx`

## Riscos e pontos de atenção

- **Banco pode estar em produção**: migrations NUNCA automáticas. Apresentar SQL e aguardar confirmação.
- **Enquadramento nulo em dados existentes**: perfis já criados ficam com `enquadramento = null`. O sistema deve tratar null graciosamente (sem quebrar cálculos).
- **valor_comissao divergente no futuro**: se o percentual do representante mudar depois, receitas antigas mostram o valor que foi salvo no cadastro — é o comportamento correto (snapshot no momento do registro).
- **"Replicar até" em erro parcial**: se o POST de um mês intermediário falhar, os meses anteriores já foram criados. Tratar com toast de erro indicando quantos foram criados.

## Questões em aberto

- **Alíquota default por enquadramento**: MEI = 6%? Lucro Presumido = 15,25%? Usuário não respondeu — implementar como campo manual sem sugestão automática por ora.
- **Enquadramento em dados existentes**: campos ficarão null, OK para agora.

## Critérios de aceite

- PF abre IncomeDialog sem ver seção de deduções
- Empresa abre IncomeDialog e vê campo de alíquota + imposto calculado + valor líquido
- Ao salvar uma receita empresa, os campos `aliquota_aplicada`, `valor_imposto`, `valor_comissao` são persistidos no banco
- ReceitasScreen empresa mostra colunas de Imposto, Comissão, Valor Líquido
- ReceitasScreen PF não mostra essas colunas
- PerfisTab salva `enquadramento` e `aliquota_imposto`
- "Replicar até" cria receitas nos meses seguintes via POST
- Build passa sem erros de TypeScript

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Não executar migrations sem confirmação explícita do usuário
- Seguir padrão de `pool.query` (raw SQL) já presente em `incomes.ts` e `profiles.ts` — não migrar para Drizzle ORM nessas rotas
- Usar `isEmpresa = useMemo(() => localStorage.getItem('perfilAtivoTipo') === 'empresa', [])` — padrão já estabelecido no ExpenseDialog
- Branch: `feat/R/revisao-receitas`
- Nunca alterar `.env`
- Nunca fazer push sem confirmação do usuário
