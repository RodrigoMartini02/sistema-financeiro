# Plano de Implementação: Filtros na mesma linha do título do Painel

## Origem

- Arquivo de especificação: pedido direto do usuário
- Data do planejamento: `2026-09-26`
- Classificação: `frontend-only`

## Resumo

Com a remoção da linha de resumo do cabeçalho, as `div`s que empilhavam título,
descrição e filtros ficaram sem função. O título "Painel financeiro" e os filtros
(período + filtro sanduíche) passam a ficar na mesma linha, e as `div`s
intermediárias são removidas.

## Escopo

### Dentro do escopo

- Remover a `div` de coluna (`flex min-w-0 flex-1 flex-col gap-[3px]`) do cabeçalho.
- Remover a `div` da linha de filtros (`mt-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5`).
- Remover os comentários desatualizados do cabeçalho.
- Transformar a `div` externa do cabeçalho na própria linha (`flex flex-wrap items-center gap-x-3 gap-y-2`), com `mr-auto` no `h1`.

### Fora do escopo

- `DashboardPeriodFilter`, `MultiFilterPanel`, `FirstAccessGuideCard` — sem alteração.
- Backend, tipos e services — sem alteração.

## Leitura de contexto

- `/AGENT.md` e `sistema financas/AGENT.md`
- `/frontend/AGENT.md` e `/backend/AGENT.md`: não existem como arquivos dedicados
- `src/screens/finance/FinanceDashboard.tsx`
- `src/components/FirstAccessGuideCard.tsx` (modo `floating` ancora num `<span absolute inset-0>` dentro do pai)

## Impacto por área

### Frontend

`src/screens/finance/FinanceDashboard.tsx`, bloco do cabeçalho:

Estrutura final:

```tsx
<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
  <h1 className="m-0 mr-auto text-[24px] font-bold tracking-[-0.02em] text-[#0f2b38] dark:text-white">Painel financeiro</h1>
  <DashboardPeriodFilter value={period} onChange={setPeriod} primeiraData={data?.primeiraData ?? null} />
  <MultiFilterPanel groups={filterGroups} hasActiveFilters={hasActiveFilters} onClear={handleClearFilters} />
  {guide.isVisible && hasNoEntries && visao === 'conta' && (
    <div className="relative">
      <FirstAccessGuideCard ... />
    </div>
  )}
</div>
```

- A `div relative` do guia permanece: é a âncora de posicionamento do `FirstAccessGuideCard` flutuante.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `sistema financas/src/screens/finance/FinanceDashboard.tsx`

## Estratégia de implementação

1. Remover: `div` de coluna, `div` da linha de filtros e os comentários desatualizados do cabeçalho.
2. Aplicar: `div` externa como linha única (`flex flex-wrap items-center gap-x-3 gap-y-2`) e `mr-auto` no `h1`.
3. Validar com `npx vite build` e conferência visual (desktop e tela estreita).

## Regras de negócio identificadas

Nenhuma — mudança apenas de layout.

## Regras multi-tenant e segurança

Sem impacto.

## Validações necessárias

Nenhuma.

## Testes necessários

### Frontend

- Build sem erros.
- Visual: título à esquerda e filtros à direita na mesma linha; em tela estreita os filtros quebram para baixo do título sem estourar o layout.
- Guia de primeiro acesso do painel continua abrindo ancorado à direita do cabeçalho.

## Comandos de validação sugeridos

```bash
cd "sistema financas" && npx vite build
```

## Riscos e pontos de atenção

- O balão do guia de primeiro acesso pode subir alguns pixels (âncora passa do rodapé do cabeçalho para o centro vertical da linha).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Título e filtros na mesma linha no desktop.
- Sem `div`s intermediárias sobrando no cabeçalho.
- Layout responsivo preservado.
- Build passa.

## Observações para a skill implementar

- Trabalhar na branch ativa `fix/R/traduzir-mensagens-recuperacao-senha`.
- Remover primeiro, depois aplicar — sem código sobreposto.
- Não alterar outros arquivos.
