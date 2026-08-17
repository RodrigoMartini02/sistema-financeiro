# Plano de Implementação: Reordenar "Leitura das despesas" para o final do Painel

## Origem

- Arquivo de especificação: pedido direto do usuário no chat, após comparação linha a linha entre o mockup ("Painel Fingerence.html") e o código atual do Painel financeiro
- Data do planejamento: 2026-08-16
- Classificação: `frontend-only`

## Resumo

O painel financeiro já implementa toda a estrutura do mockup ("Painel Fingerence.html"), mas duas seções estão fora de ordem em relação a ele. O componente `IncomeBalanceGuide` ("Leitura das despesas") está posicionado logo após o resumo consolidado em `FinanceDashboard.tsx` (linha 339), antes de contratos/gráfico anual/cascata/categorias/análise de despesas. No mockup, essa seção é a última da página. Isso faz a tela parecer "fora de ordem" ao carregar. A correção é mover o bloco `<IncomeBalanceGuide />` para o final do JSX, reproduzindo a ordem exata do mockup.

## Escopo

### Dentro do escopo

- Mover o bloco `<IncomeBalanceGuide month={month} year={year} />` de `src/screens/finance/FinanceDashboard.tsx` (linha 339) para o final do `return`, após a última seção ("Forma de pagamento", linha ~621), antes do fechamento do `<div className="grid gap-5">`.
- Nenhuma alteração no componente `IncomeBalanceGuide.tsx` em si — apenas na posição onde é chamado.

### Fora do escopo

- Legenda "Previsto" (linha tracejada) e barra tracejada de mês futuro no `AnnualTrendChart.tsx` — presentes no mockup mas ausentes no código atual; puramente cosmético, não tratado neste plano.
- Qualquer mudança de dados, hooks ou lógica de negócio.
- Qualquer outro componente do painel.

## Leitura de contexto

- `/CLAUDE.md` (raiz do projeto)
- `src/screens/finance/FinanceDashboard.tsx` (lido integralmente nesta conversa)
- `src/screens/finance/IncomeBalanceGuide.tsx` (lido integralmente)
- `src/screens/finance/MonthCategoriesOverview.tsx` (lido integralmente)
- `src/screens/finance/charts/MonthWaterfallChart.tsx` (lido integralmente)
- `src/screens/finance/charts/AnnualTrendChart.tsx` (lido integralmente)
- Mockup completo fornecido pelo usuário ("Painel Fingerence.html") — comparado seção a seção com o código atual

## Impacto por área

### Frontend

- `FinanceDashboard.tsx`: mover uma linha (`<IncomeBalanceGuide ... />`) de posição no JSX. Sem mudança de props, sem mudança de imports, sem mudança de lógica.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/finance/FinanceDashboard.tsx` (único arquivo)

## Estratégia de implementação

1. Remover a linha `<IncomeBalanceGuide month={month} year={year} />` da posição atual (logo após o resumo consolidado).
2. Inserir a mesma linha no final do conteúdo, após a seção "Saúde financeira / Forma de pagamento".
3. Rodar `npx tsc --noEmit` e `npx vite build`.
4. Conferir visualmente que a ordem final bate com o mockup.

## Regras de negócio identificadas

Nenhuma — mudança de ordenação visual apenas.

## Regras multi-tenant e segurança

Não aplicável — reordenação de componente já existente, sem alteração de dados ou permissões.

## Validações necessárias

Nenhuma validação de formulário nova.

## Testes necessários

### Frontend

- Verificação visual manual: ordem das seções no Painel deve bater com o mockup (Saldo projetado → Análise de despesas → Gráfico anual → Cascata → Categorias do mês → Despesas por categoria/Receitas por origem → Saúde financeira/Forma de pagamento → Leitura das despesas).

### Backend

Sem impacto esperado.

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Risco muito baixo — mudança de posição de um único componente já testado, sem alterar props, hooks ou dados.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- `IncomeBalanceGuide` ("Leitura das despesas") passa a ser renderizado como última seção do Painel, igual ao mockup.
- Nenhum outro componente ou ordem é alterado.
- `npx tsc --noEmit` e `npx vite build` passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Único arquivo afetado: `src/screens/finance/FinanceDashboard.tsx` — mudança pequena e focada, não expandir escopo.
- Ao finalizar localmente, perguntar ao usuário se deseja enviar para produção, seguindo o fluxo padrão do projeto (`/finalizar`).
