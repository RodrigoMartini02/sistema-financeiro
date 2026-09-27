# Plano de Implementação: Gráficos do Painel seguem o período filtrado

## Origem

- Arquivo de especificação: pedido do usuário ao avaliar o painel novo localmente (print do gráfico Receita × despesa)
- Data do planejamento: `2026-09-27`
- Classificação: `fullstack` (backend + frontend; sem banco)

## Resumo

O painel abre no mês atual, mas os gráficos de série mostravam os 12 meses
anteriores — duas histórias diferentes na mesma tela. Os três gráficos de
série (Receita × despesa, Uso do crédito, Cadastrado × pago) passam a mostrar
o próprio período do filtro, com granularidade que se ajusta ao tamanho dele
(semana, mês ou ano). O destaque do mês selecionado, que não aparecia, sai
junto por não ser mais necessário.

Entra na branch `feat/R/painel-financeiro-novo` (ainda não mergeada), sobre o
plano `painel-financeiro-novo.md`.

## Escopo

### Dentro do escopo

- Janela da série = período filtrado; granularidade semana (até 62 dias), mês (até 24 meses) ou ano (acima).
- Pontos da série com `inicio`/`fim` (datas) em vez de `ano`/`mes`.
- Rótulos por granularidade; títulos e rodapé por unidade.
- Remoção do destaque de mês (`ReferenceArea`/prop `destaque`) e de `rotuloDoMesFinal`.
- Renomear `BarrasMensaisChart` → `BarrasSerieChart` e `ReceitaDespesaMensal` → `ReceitaDespesa`.

### Fora do escopo

- Gráfico "O que já está comprometido" (continua mensal, 6 meses a partir de hoje).
- Demais blocos do painel.
- Qualquer alteração de banco.

## Leitura de contexto

- `/AGENT.md` e `sistema financas/AGENT.md`
- `/frontend/AGENT.md` e `/backend/AGENT.md`: não existem como arquivos dedicados
- `.plans/painel-financeiro-novo.md`
- `backend/src/services/painelCalculos.ts`, `painelCalculos.test.ts`, `painelService.ts`
- `src/types/finance.ts`, `src/screens/finance/charts/BarrasMensaisChart.tsx`, `src/screens/finance/painel/*`, `src/screens/finance/FinanceDashboard.tsx`

## Impacto por área

### Frontend

- `types/finance.ts`: `PainelPontoSerie` = `{ inicio, fim, receitas, despesas, credito, pago }`; `serie.granularidade`: `'semana' | 'mes' | 'ano'`.
- `charts/BarrasMensaisChart.tsx` → `charts/BarrasSerieChart.tsx`, sem `destaque` nem `ReferenceArea`.
- `painel/painelFormat.ts`: `rotuloDoPonto(inicio, fim, granularidade)`; remover `rotuloDoMesFinal`; manter um rótulo mensal para o gráfico de comprometido (`{ ano, mes }`).
- `painel/ReceitaDespesaMensal.tsx` → `painel/ReceitaDespesa.tsx`: detalhe "por semana/mês/ano do período"; rodapé "Melhor {unidade}", "Maior gasto", "N {unidades} no vermelho".
- `painel/ComoDinheiroSaiu.tsx` (uso do crédito) e `painel/EmDiaComContas.tsx` (cadastrado × pago): série nova, textos por unidade, sem destaque.
- `painel/Comprometido.tsx`: usar `BarrasSerieChart`.
- `FinanceDashboard.tsx`: import renomeado.

### Backend

- `services/painelCalculos.ts`:
  - `Granularidade` passa a `'semana' | 'mes' | 'ano'`.
  - `janelaDaSerie(periodo)`: janela = período; granularidade: `diasNoPeriodo <= 62` → semana; `mesesTocados <= 24` → mês; senão ano.
  - `baldesDaSerie(janela)`: devolve `{ inicio, fim }` recortados ao período — semanas de 7 dias a partir de `de` (última parcial); meses/anos com pontas recortadas.
  - `montarSerie`: cada lançamento cai no balde cujo intervalo contém a data (receita: recebimento; despesa/crédito: vencimento; pago: data de pagamento, ou vencimento se ausente).
  - `PontoSerie`: `{ inicio, fim, receitas, despesas, credito, pago }`.
  - `agregarContasEmAberto` (comprometido) continua com baldes mensais `{ ano, mes }`, sem depender de `baldesDaSerie`.
- `services/painelService.ts`: janela de busca = menor data entre período, período anterior e início do ano; maior = fim do período.
- `services/painelCalculos.test.ts`: atualizar testes de janela e série; novos casos de semana.

### Banco de dados

Sem impacto esperado.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `sistema financas/backend/src/services/painelCalculos.ts`
- `sistema financas/backend/src/services/painelCalculos.test.ts`
- `sistema financas/backend/src/services/painelService.ts`
- `sistema financas/src/types/finance.ts`
- `sistema financas/src/screens/finance/charts/BarrasMensaisChart.tsx` → `BarrasSerieChart.tsx`
- `sistema financas/src/screens/finance/painel/painelFormat.ts`
- `sistema financas/src/screens/finance/painel/ReceitaDespesaMensal.tsx` → `ReceitaDespesa.tsx`
- `sistema financas/src/screens/finance/painel/ComoDinheiroSaiu.tsx`
- `sistema financas/src/screens/finance/painel/EmDiaComContas.tsx`
- `sistema financas/src/screens/finance/painel/Comprometido.tsx`
- `sistema financas/src/screens/finance/FinanceDashboard.tsx`

## Estratégia de implementação

1. Backend: remover a janela fixa de 12 meses e o modelo `{ ano, mes }` da série; aplicar janela = período, granularidade e baldes `{ inicio, fim }`; ajustar `montarSerie` e `agregarContasEmAberto`.
2. Backend: ajustar a janela de busca em `painelService.ts`.
3. Backend: atualizar testes e rodar `npm run build` + `npm test`.
4. Frontend: remover `destaque`/`ReferenceArea` e `rotuloDoMesFinal`; renomear o gráfico e o bloco de receita × despesa.
5. Frontend: tipos, rótulos, títulos e rodapés por unidade nos três blocos; `Comprometido` com o componente renomeado.
6. Validação: tipagem do frontend, `npx vite build`, conferência no navegador.

## Regras de negócio identificadas

- Os gráficos de série mostram exatamente o período do filtro.
- Até 62 dias: por semana (blocos de 7 dias a partir da data inicial; o último pode ser menor).
- Até 24 meses: por mês, pontas recortadas ao período.
- Acima de 24 meses: por ano.
- Rótulos: semana `01–07/09` (ou `29/09–05/10` quando cruza o mês); mês `set/26`; ano `2026`.
- "O que já está comprometido" continua mensal, 6 meses a partir de hoje.

## Regras multi-tenant e segurança

Sem impacto — mesmas consultas e escopos; só muda a janela e o agrupamento.

## Validações necessárias

Nenhuma nova (o período já é validado pela rota).

## Testes necessários

### Frontend

- Tipagem + build; conferência visual com o mês atual, 2 meses, 1 ano e 3 anos.

### Backend

- `janelaDaSerie`: mês atual → semana; 62 dias → semana; 63 dias → mês; 25 meses → ano.
- `baldesDaSerie`: setembro (30 dias) → 5 semanas, a última 29–30; outubro (31 dias) → 5 semanas, a última 29–31; período cruzando meses.
- `montarSerie`: lançamento no último dia da semana cai na semana certa; pago pela data de pagamento.

### E2E

- Não aplicável.

## Comandos de validação sugeridos

```bash
cd "sistema financas/backend" && npm run build && npm test
cd "sistema financas" && npx tsc --noEmit -p tsconfig.json && npx vite build
```

## Riscos e pontos de atenção

- Baixo risco: mudança contida no painel novo; contrato da série muda nos dois lados ao mesmo tempo.
- Semanas sem lançamento aparecem vazias (esperado: mostra ausência de movimento).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Com o painel no mês atual, os três gráficos mostram as semanas desse mês.
- Com períodos maiores, mostram meses (até 24) ou anos.
- Sem destaque de mês e sem resíduos de `rotuloDoMesFinal`/`destaque`/`BarrasMensaisChart`/`ReceitaDespesaMensal`.
- Builds e testes passam.

## Observações para a skill implementar

- Continuar na branch `feat/R/painel-financeiro-novo`.
- Remover o antigo antes de aplicar o novo (sem código sobreposto).
- Não executar migrations. Não alterar `.env`.
