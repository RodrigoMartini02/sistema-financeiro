# Plano de Implementação: Revisão e limpeza do modal de Valores (aba Serviços)

## Origem

- Data do planejamento: `2026-07-10`
- Classificação: `frontend-only`

## Resumo

O modal de Valores do contrato acumulou dead code e cálculos incorretos durante as sessões anteriores. Esta revisão remove variáveis mortas, corrige os cards de resumo (de 4 para 3, com cálculos corretos), e limpa campos que o backend não salva mais (`valor_contrato`).

## Escopo

### Dentro do escopo

- Remover `periodoMeses` (variável morta)
- Remover `somaCalc` (cálculo errado, substituído por `totalAnual`)
- Remover `diferencaFaturando` (card removido)
- Remover `vContrato` do tipo e body de `patchValoresMut`
- Remover `valor_contrato` de `handleSaveWithValores`
- Adicionar guarda null em `patchValoresMut.onSuccess`
- Corrigir cards: 4 cols → 3 cols com labels e valores corretos

### Fora do escopo

- Campos de entrada (Prestação, Implantação, Horas)
- Lógica de saldo atual de horas
- CatalogoServicoRow e discriminação de serviços
- Backend (nenhuma alteração necessária)

## Impacto por área

### Frontend

Arquivo: `src/screens/config/ClienteDetail.tsx`

**Variáveis a remover (linhas 433-445):**
- `periodoMeses` — IIFE que calcula duração via datas; usado só em `somaCalc`
- `somaCalc` — `vMensalNum * periodoMeses + ...`; cálculo incorreto, substituído por `totalAnual`

**`totalAnual` (linha 446) — manter, já correto:**
```ts
const totalAnual = vMensalNum * 12 + implTotalNum + hpIniNum * hpValorNum + hrIniNum * hrValorNum;
```

**`patchValoresMut` (linha 514):**
- Remover `vContrato: number` do tipo
- Remover `valor_contrato: v.vContrato` do body de `saveContrato`
- Adicionar guarda: `onSuccess: () => { if (!contrato) return; void qc.invalidateQueries(...) }`

**`handleSaveWithValores` (linha 466):**
- Remover `valor_contrato: somaCalc || 0`

**`saveValores` (linha 549) e `handleFooterSave` (linha 484):**
- Remover `vContrato: somaCalc` dos calls de `patchValoresMut.mutate`

**`diferencaFaturando` (linha 635):**
- Remover a constante e o 4º card

**Cards (linhas 639-655):**
- De `grid-cols-4` para `grid-cols-3`
- Card 1: label "Valor mensal", value `vMensalNum`
- Card 2: label "Valor total anual", value `totalAnual`
- Card 3: label "Faturando", value `totalFaturando`, color `text-blue-700`

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/config/ClienteDetail.tsx`

## Estratégia de implementação

1. Remover `periodoMeses` (IIFE, linhas ~433-438)
2. Remover `somaCalc` (linha ~445)
3. Remover `diferencaFaturando` do escopo interno do `activeTab === 'servicos'`
4. Limpar tipo de `patchValoresMut` — remover `vContrato`
5. Limpar body de `patchValoresMut` — remover `valor_contrato: v.vContrato`
6. Adicionar guarda null no `onSuccess` de `patchValoresMut`
7. Limpar `handleSaveWithValores` — remover `valor_contrato`
8. Limpar `saveValores` e `handleFooterSave` — remover `vContrato: somaCalc`
9. Corrigir cards: 3 cols, labels e valores corretos
10. Rodar `npx tsc --noEmit` para validar

## Riscos e pontos de atenção

- Baixo risco — remoção de dead code e correção de cálculos apresentados no frontend
- `valor_contrato` já não é salvo no banco há sessões; remover a passagem não quebra nada
- `totalAnual` já está declarado (linha 446), só precisa ser conectado aos cards

## Critérios de aceite

- TypeScript sem erros (`npx tsc --noEmit` limpo)
- Modal abre com 3 cards: Valor mensal / Valor total anual / Faturando
- Salvar na aba Serviços fecha o modal e atualiza os dados
- Nenhuma referência a `somaCalc`, `periodoMeses`, `diferencaFaturando`, `vContrato` no arquivo
