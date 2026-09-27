# Plano de Implementação: Remover card de barras Receitas × Despesas do Painel

## Origem

- Arquivo de especificação: pedido direto do usuário (print do card)
- Data do planejamento: `2026-09-26`
- Classificação: `frontend-only`

## Resumo

Remover do Painel financeiro o card com as barras horizontais de Receitas e
Despesas e o texto "Você gastou X% do que entrou", junto com a variável que só
servia a ele.

## Escopo

### Dentro do escopo

- Remover o `<Card>` de barras Receitas × Despesas em `src/screens/finance/FinanceDashboard.tsx` (~542-566).
- Remover `const pctGasto` (~165), usado apenas nesse card.

### Fora do escopo

- `healthBase`, `receitas`, `despesas` — permanecem (usados em "Saúde financeira" e outros cards).
- Card "Comprometimento" — permanece (já mostra a relação despesa/receita em %).
- Backend, tipos e services — sem alteração.

## Leitura de contexto

- `/AGENT.md` e `sistema financas/AGENT.md`
- `/frontend/AGENT.md` e `/backend/AGENT.md`: não existem como arquivos dedicados
- `src/screens/finance/FinanceDashboard.tsx`

## Impacto por área

### Frontend

- `FinanceDashboard.tsx`: remover o card e `pctGasto`.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `sistema financas/src/screens/finance/FinanceDashboard.tsx`

## Estratégia de implementação

1. Remover o `<Card>` de barras Receitas × Despesas.
2. Remover `const pctGasto`.
3. Confirmar via `grep` que não há referência restante a `pctGasto` e que `healthBase` continua em uso.
4. Rodar `npx vite build`.

## Regras de negócio identificadas

Nenhuma — remoção visual.

## Regras multi-tenant e segurança

Sem impacto.

## Validações necessárias

Nenhuma.

## Testes necessários

### Frontend

- Build sem erros.
- Visual: card ausente; cards de resumo, "Carteira de contratos" e "Análise do período" intactos.

## Comandos de validação sugeridos

```bash
cd "sistema financas" && npx vite build
```

## Riscos e pontos de atenção

Nenhum relevante.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- O card de barras Receitas × Despesas não aparece mais no Painel.
- Nenhuma referência restante a `pctGasto`.
- Build passa.

## Observações para a skill implementar

- Trabalhar na branch ativa `fix/R/traduzir-mensagens-recuperacao-senha`.
- Remover, não ocultar.
- Não alterar outros arquivos.
