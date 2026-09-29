# Plano de Implementação: Corrigir card "Categorias do mês" que desaparece do painel financeiro

## Origem

- Arquivo de especificação: não houve `.md` de feature fornecido — origem foi relato do usuário ("e o gráfico de categorias que ficava abaixo de cascata? foi removido?"), seguido de investigação de código via agente Explore.
- Data do planejamento: 2026-08-19
- Classificação: `frontend-only`

## Resumo

O card "Categorias do mês" (`MonthCategoriesOverview`), que fica logo abaixo do card "Cascata do período" no painel financeiro, só é renderizado quando a variável `singleMonth` é truthy. Essa variável só é calculada quando `period.mode === 'mes'`. Dois problemas fazem o card sumir sem que o usuário tenha feito nada de errado: (1) o painel abre, por padrão, em `mode: 'ano'` (Ano corrente), então o card já nasce escondido; (2) um "Intervalo personalizado" onde De = Até (mesmo mês/ano) é, na prática, um único mês, mas a lógica atual não reconhece esse caso. Essa regressão foi introduzida junto com a feature "painel financeiro com filtro de período próprio e panorama completo" (commit `df018ff`, 2026-08-19), no mesmo dia da correção de "valor pago" já mergeada em `main`.

## Escopo

### Dentro do escopo

- Trocar o estado inicial do painel (`useState<DashboardPeriod>`) de `{ mode: 'ano', ano: THIS_YEAR }` para `{ mode: 'mes', mes: THIS_MONTH, ano: THIS_YEAR }`, replicando o shape usado pelo botão "Mês atual" do `DashboardPeriodFilter`.
- Adicionar a constante local `THIS_MONTH` em `FinanceDashboard.tsx` (hoje só existe `THIS_YEAR`).
- Generalizar a lógica de `singleMonth` para também reconhecer `period.mode === 'intervalo'` quando `period.mes === period.ateMes && period.ano === period.ateAno`, extraindo `{ mes, ano }` nesse caso.

### Fora do escopo

- Qualquer alteração no componente `DashboardPeriodFilter.tsx` (o seletor de período em si não tem bug — os modos e o shape que ele produz estão corretos).
- Qualquer alteração em `MonthCategoriesOverview.tsx`, `MonthWaterfallChart.tsx` ou outros cards do painel.
- Qualquer alteração de backend, schema ou endpoints — o problema é puramente de estado/condição de renderização no frontend.
- Revisão de outros cards que também dependem de `singleMonth` (`contratosQ`, `parcelasQ`) além de confirmar que continuam funcionando com a nova lógica — não serão alterados, apenas devem seguir se beneficiando da correção automaticamente por dependerem da mesma variável.

## Leitura de contexto

- `/AGENT.md` — já lido em plano anterior nesta mesma sessão (regras gerais de TypeScript, nomes claros, evitar `any`, etc. — aplicável mesmo sendo mudança pequena).
- `frontend/AGENT.md` — não existe como arquivo dedicado neste projeto (mesma observação já registrada no plano anterior desta sessão); `AGENT.md` da raiz e de `sistema financas/` cobrem tudo.
- `backend/AGENT.md` — não aplicável, sem impacto de backend nesta correção.
- `sistema financas/CLAUDE.md` — já lido em plano anterior (regras de fluxo /planejar → /implementar → /finalizar).
- Arquivos de código lidos: `sistema financas/src/screens/finance/FinanceDashboard.tsx` (linhas 1-70 e 590-618), `sistema financas/src/screens/finance/DashboardPeriodFilter.tsx` (completo).

## Impacto por área

### Frontend

- **`sistema financas/src/screens/finance/FinanceDashboard.tsx`**:
  - Linha 24-25: já existe `THIS_YEAR`; adicionar `THIS_MONTH = now.getMonth()` ao lado (mesmo padrão usado em `DashboardPeriodFilter.tsx:24-25`).
  - Linha 40: trocar `useState<DashboardPeriod>({ mode: 'ano', ano: THIS_YEAR })` para `useState<DashboardPeriod>({ mode: 'mes', mes: THIS_MONTH, ano: THIS_YEAR })`.
  - Linha 54: trocar a condição estrita `period.mode === 'mes' ? { mes: period.mes!, ano: period.ano! } : null` por uma que também cubra `period.mode === 'intervalo' && period.mes === period.ateMes && period.ano === period.ateAno`, retornando `{ mes: period.mes!, ano: period.ano! }` nesse caso também.
- Sem impacto em query keys, hooks de fetch, formulários ou estados de loading/error/empty além do já existente (o `enabled: !!singleMonth` das queries `contratosQ`/`parcelasQ` continua funcionando sem alteração, só passa a ficar `true` com mais frequência, que é o comportamento correto).

### Backend

`Sem impacto esperado`.

### Banco de dados

`Sem impacto esperado`.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `sistema financas/src/screens/finance/FinanceDashboard.tsx` (único arquivo alterado)

## Estratégia de implementação

1. Em `FinanceDashboard.tsx`, adicionar a constante `THIS_MONTH` junto a `THIS_YEAR` (linhas 24-25).
2. Alterar o `useState` inicial de `period` (linha 40) para abrir em `mode: 'mes'` com `THIS_MONTH`/`THIS_YEAR`.
3. Alterar a expressão de `singleMonth` (linha 54) para reconhecer também `mode === 'intervalo'` com `mes === ateMes && ano === ateAno` como mês único.
4. Rodar `npx vite build` (frontend) para validar.
5. Testar manualmente no navegador: abrir o painel do zero (deve já mostrar "Mês atual" e o card de categorias visível), selecionar "Ano corrente" (card deve sumir, comportamento correto), selecionar "Intervalo personalizado" com De = Até no mesmo mês (card deve aparecer), selecionar intervalo de mais de um mês (card deve continuar ausente, comportamento correto).

## Regras de negócio identificadas

- O card "Categorias do mês" é estruturalmente mensal (assim como os cards de contratos e parcelas futuras que dependem da mesma variável `singleMonth`) — só deve aparecer quando o período filtrado corresponde exatamente a um único mês, seja porque o modo é `'mes'`, seja porque um `'intervalo'` colapsa em um único mês.
- O padrão de abertura do painel deve ser "Mês atual", não "Ano corrente" — para que o usuário veja esse card já na primeira tela, sem precisar interagir com o filtro.

## Regras multi-tenant e segurança

Não aplicável — mudança é de estado local de UI (React `useState`) e uma condição de renderização, sem leitura/escrita de dados, sem novo endpoint, sem alteração de query a banco.

## Validações necessárias

- Garantir que `period.mes`/`period.ateMes`/`period.ano`/`period.ateAno` estejam definidos antes de comparar (usar os mesmos operadores de non-null assertion já usados na linha 54 original, com cuidado para não introduzir `undefined === undefined` como falso positivo — só entrar nesse ramo quando `mode === 'intervalo'`, que já garante que todos os 4 campos foram preenchidos por `IntervalPicker`).

## Testes necessários

### Frontend

- Teste manual: abrir o painel financeiro do zero (F5) e confirmar que o filtro já mostra "Mês atual" e que o card "Categorias do mês" aparece.
- Teste manual: selecionar "Ano corrente" e confirmar que o card desaparece (comportamento esperado, não é regressão).
- Teste manual: selecionar "Intervalo personalizado" com De = Até no mesmo mês/ano e confirmar que o card aparece.
- Teste manual: selecionar "Intervalo personalizado" abrangendo mais de um mês e confirmar que o card continua ausente.
- Teste manual: selecionar "Todo o período" e confirmar que o card continua ausente.

### Backend

Não aplicável.

### E2E

Não há suíte E2E identificada no projeto; testes manuais via UI cobrem o fluxo.

## Comandos de validação sugeridos

```bash
npx vite build
```

(Executar a partir de `sistema financas/`, mesmo comando já usado na correção anterior desta sessão.)

## Riscos e pontos de atenção

- Mudar o default do painel de "Ano corrente" para "Mês atual" é uma mudança de comportamento visível: quem abre o painel agora verá dados de um mês em vez do ano inteiro na primeira tela — é o comportamento pedido pelo usuário, mas é bom confirmar visualmente após a implementação que a experiência ficou como esperado.
- Nenhum impacto em backend, banco ou outras telas.
- Risco técnico baixo: mudança isolada a um arquivo, sem alteração de contrato de API ou tipos compartilhados.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. Escopo já validado com o usuário (opção "Corrigir ambos os pontos").

## Critérios de aceite do plano

- Ao abrir o painel financeiro pela primeira vez, o filtro de período já está em "Mês atual" e o card "Categorias do mês" está visível.
- Ao selecionar um "Intervalo personalizado" com De = Até no mesmo mês/ano, o card "Categorias do mês" aparece.
- Ao selecionar "Ano corrente", "Todo o período" ou um intervalo de mais de um mês, o card continua ausente (comportamento correto, não uma regressão).
- `npx vite build` passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations — não aplicável a esta correção.
- Seguir `/AGENT.md` e `sistema financas/AGENT.md` (idênticos): nomes claros, evitar abreviações obscuras, ECMAScript moderno com legibilidade.
- Manter a alteração restrita a `FinanceDashboard.tsx` — não tocar em `DashboardPeriodFilter.tsx` nem em outros componentes do painel.
- Validar visualmente no navegador os 5 cenários listados em "Testes necessários" antes de considerar a tarefa concluída, conforme a diretriz geral do projeto para mudanças de UI.
