# Plano de Implementação: Botão "Consultar" em Relatórios

## Origem

- Data do planejamento: `2026-07-11`
- Classificação: `frontend-only`

## Resumo

A tela `RelatoriosScreen` dispara queries a cada mudança de `dataInicio`/`dataFim`, inclusive enquanto o usuário ainda está ajustando o período. Para "Este ano", isso dispara 12 requests em paralelo por clique.

A solução separa o estado de UI (`dataInicio`/`dataFim`) do estado de consulta (`queryDataInicio`/`queryDataFim`). Apenas o segundo controla as queries. Ao abrir a tela ambos os estados são iguais e o mês atual carrega automaticamente. Após isso, qualquer mudança de período — seja por atalho ou input manual — fica pendente até o clique em "Consultar".

## Escopo

### Dentro do escopo

- Estado separado `queryDataInicio`/`queryDataFim` controlando as queries
- Botão "Consultar" ao lado do input "Até:"
- Indicador visual quando período selecionado difere do período consultado (`hasPendingChange`)
- Botão desabilitado/dimmed quando não há mudança pendente
- Carga automática ao abrir a tela (mês atual) preservada

### Fora do escopo

- Filtros de tipo/forma/status (client-side, sem request — permanecem imediatos)
- Paginação ou virtualização da tabela
- Cache de longo prazo
- Alterações de backend ou banco de dados

## Arquivos afetados

- `src/screens/relatorios/RelatoriosScreen.tsx` (único arquivo)

## Decisões aplicadas

- **Decisão 1:** Atalhos (Este mês, Mês anterior, Trimestre, Este ano) e inputs manuais exigem clique em "Consultar" para disparar a query. Nenhuma mudança de período auto-consulta.

## Estratégia de implementação

1. Adicionar estados `queryDataInicio`/`queryDataFim` inicializados com os mesmos valores de `dataInicio`/`dataFim` (mês atual) — garante carga automática ao abrir
2. Derivar `mesesQueryRange` a partir de `queryDataInicio`/`queryDataFim` (separado do `mesesRange` que serve apenas a UI)
3. Trocar query keys de `['rel-desp-range', dataInicio, dataFim]` → `['rel-desp-range', queryDataInicio, queryDataFim]` (idem para receitas)
4. Trocar `queryFn` para mapear sobre `mesesQueryRange` em vez de `mesesRange`
5. Adicionar `const hasPendingChange = dataInicio !== queryDataInicio || dataFim !== queryDataFim`
6. Adicionar `handleConsultar`: `setQueryDataInicio(dataInicio); setQueryDataFim(dataFim)`
7. No label do período (`periodoLabel`): quando `hasPendingChange`, acrescentar indicador visual (ex: `· Não consultado` em cor amber ou `*` no texto)
8. Adicionar botão "Consultar" ao lado do input "Até:"; `disabled` e `opacity-50` quando `!hasPendingChange`

## Validações necessárias

- `dataInicio` e `dataFim` continuam sendo usados para calcular `mesesRange` (atalhos continuam marcando o botão ativo)
- `queryDataInicio`/`queryDataFim` controlam exclusivamente as queries
- `hasPendingChange` é derivado, não precisa de estado próprio

## Comandos de validação sugeridos

```bash
npx vite build
```

## Riscos e pontos de atenção

- Baixíssimo — mudança de estado puro em um único componente
- Sem alteração de backend, schema, services ou query keys globais
- `mesesRange` (UI) e `mesesQueryRange` (query) coexistem; não misturar

## Critérios de aceite

- Abrir a tela → mês atual carrega automaticamente
- Clicar em "Este ano" → dados NÃO mudam; botão "Consultar" fica ativo; label do período mostra indicador de pendência
- Clicar em "Consultar" → dados atualizam para o período selecionado; botão fica desabilitado
- Mudar input De/Até manualmente → mesmo comportamento dos atalhos
- Filtros tipo/forma/status continuam funcionando instantaneamente (sem "Consultar")

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Não criar novos arquivos
- Não alterar backend, services ou queryKeys centralizados
- Seguir o padrão de classes Tailwind já presente no componente
- Botão "Consultar" deve seguir o estilo visual já existente (ver classe do botão "Exportar PDF" como referência de tom)
