# Plano de Implementação: Padronizar fonte de Descrição e Valor na tabela de Receitas

## Origem

- Arquivo de especificação: nenhum (originado de pedido direto na conversa)
- Data do planejamento: 2026-09-20
- Classificação: `frontend-only`

## Resumo

Padronizar tamanho e cor de fonte das colunas Descrição e Valor na tabela de Receitas para igualar o padrão já usado em Despesas: Descrição passa a `text-xs` com cor fixa `text-slate-600 dark:text-slate-300` (sem variar por status, diferente de Despesas que muda conforme pago); Valor passa do tom `text-green-700` para `text-green-600 dark:text-green-400` (mesmo tom do status "pago" em Despesas), mantendo-se sempre verde e fixo (sem virar dinâmico por status, diferente de Despesas).

## Escopo

### Dentro do escopo

- `src/screens/receitas/ReceitasScreen.tsx`, coluna Descrição (linhas 359-364): trocar `text-slate-900` por `text-xs text-slate-600 dark:text-slate-300`.
- `src/screens/receitas/ReceitasScreen.tsx`, coluna Valor (linhas 395-397): trocar `text-green-700` por `text-xs text-green-600 dark:text-green-400`.

### Fora do escopo

- Não tocar em Despesas — é só a referência de padrão.
- Não replicar `getStatusColor`/`STATUS_TEXT_COLOR` (cor dinâmica por status) em Receitas — Valor continua sempre verde fixo, só muda o tom.
- Não replicar a variação de cor por status na Descrição de Receitas — cor fixa única.
- Não mexer em `IncomeCard.tsx` (cards mobile).
- Não mexer em nenhuma outra coluna de Receitas (Data, Cliente/Representante, Tipo, Usuário, Comissão, Anexos, Ações).

## Leitura de contexto

- `/AGENT.md` (raiz do monorepo).
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados neste projeto.
- Investigação nesta sessão: `src/screens/despesas/DespesasScreen.tsx` (linhas 53-63 `STATUS_TEXT_COLOR`, 770-773 Descrição, 829-838 Valor — padrão de referência); `src/screens/receitas/ReceitasScreen.tsx` (linhas 359-364 Descrição, 395-397 Valor — estado atual confirmado).

## Impacto por área

### Frontend

- `src/screens/receitas/ReceitasScreen.tsx`: duas trocas de classe CSS (Tailwind), sem alteração de estrutura JSX, lógica de dados, ou comportamento condicional.

### Backend

`Sem impacto esperado`.

### Banco de dados

`Sem impacto esperado`.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. (Não aplicável aqui — este plano não gera migration.)

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `src/screens/receitas/ReceitasScreen.tsx`

## Estratégia de implementação

1. Trocar a classe do `<p>` de Descrição (linha 360) de `text-slate-900` para `text-xs text-slate-600 dark:text-slate-300`.
2. Trocar a classe do `<td>` de Valor (linha 395) de `text-green-700` para `text-xs text-green-600 dark:text-green-400`.
3. Rodar build (`tsc --noEmit`, `vite build`) e conferir visualmente que a tabela de Receitas tem o mesmo tamanho/cor de fonte de Despesas nessas duas colunas, sem variar por status.

## Regras de negócio identificadas

- Nenhuma regra de negócio nova — ajuste puramente visual.

## Regras multi-tenant e segurança

`Sem impacto esperado` — mudança visual isolada.

## Validações necessárias

- Confirmar visualmente que a mudança de tamanho de fonte na Descrição não quebra o `truncate max-w-[180px]` já existente.

## Testes necessários

### Frontend

- Abrir Receitas: Descrição aparece em `text-xs`, cor cinza fixa (igual Despesas em tamanho, sem variar por status).
- Valor aparece no mesmo tom de verde do "pago" de Despesas, sempre, independente do status da receita (recebida/prevista/cancelada).

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

- Risco muito baixo — troca de classes CSS, sem lógica nova.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Descrição de Receitas usa `text-xs`, cor fixa `text-slate-600 dark:text-slate-300`.
- Valor de Receitas usa `text-green-600 dark:text-green-400`, sempre fixo (sem variar por status).
- Build (`tsc --noEmit`, `vite build`) passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não tocar em Despesas nem em `IncomeCard.tsx`.
- Não executar migrations (não há nenhuma neste plano).
