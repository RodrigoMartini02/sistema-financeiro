# Plano de Implementação: Modal de despesa/receita compatível com o tamanho do card da demo

## Origem

- Arquivo de especificação: `docs/features/demo-escala-compacta.md`
- Data do planejamento: `2026-08-15`
- Classificação: `frontend-only`

## Resumo

O modal de despesa/receita (`Dialog`, usado por `ExpenseDialog`/`IncomeDialog`) foi desenhado para
o app real em tela cheia, usando `max-h-[92vh]` (relativo à viewport do documento). Dentro da
demo interativa (`demo.html`, isolada via iframe conforme
`.plans/demo-isolamento-via-iframe.md`), isso ainda funciona tecnicamente (o iframe tem seu
próprio viewport), mas o espaço disponível é menor e mais apertado que uma tela cheia real,
fazendo o modal ficar desproporcional ao card da Home, com scroll interno visível mesmo para
formulários com poucos campos preenchidos.

Escopo confirmado com o usuário: **apenas o modal** precisa se ajustar ao espaço do card — não é
para escalar/reduzir a sidebar, as telas ou qualquer outro elemento da demo. O card deve ser
tratado como se fosse a "tela do sistema" que o modal precisa respeitar.

## Escopo

### Dentro do escopo

- Ajustar `src/ui/dialog.tsx`: revisar a altura máxima do modal (`max-h-[92vh]`) e, se necessário,
  os tamanhos `maxWSize`/`minHSize` para os tamanhos `lg`/`xl`/`xxl`, de forma que o modal caiba
  adequadamente dentro do espaço vertical/horizontal realmente disponível no card da demo, sem
  depender de scroll interno excessivo para formulários comuns (ex. despesa, receita).
- Validar que a mudança não altera negativamente o comportamento do `Dialog` no app real (fora da
  demo), já que é um componente compartilhado.

### Fora do escopo

- `transform: scale()` ou qualquer redução visual proporcional da sidebar, telas ou demais
  elementos da demo — decisão explícita do usuário de manter esses elementos como estão.
- Qualquer alteração em `ExpenseDialog.tsx`, `IncomeDialog.tsx` ou outras telas reais (campos
  internos, espaçamento, tipografia).
- Mudanças na Home fora do comportamento do modal dentro do card.
- A seção de benefícios/venda pedida anteriormente (spec separada, ainda pendente).

## Leitura de contexto

- `/AGENT.md` (raiz do projeto) — lido em ciclos anteriores desta sessão. Sem impacto direto
  (frontend-only). Não existem `frontend/AGENT.md`/`backend/AGENT.md` separados.
- `docs/features/demo-escala-compacta.md` — especificação desta feature; escopo revisado durante
  este ciclo de planejamento (de "escala geral" para "só o modal") a partir de esclarecimento do
  usuário.
- `src/demoMain.tsx` — lido por completo; confirma que a demo roda isolada dentro de `demo.html`,
  com `AppShell` em modo `isDemoMode` ocupando `h-screen` (100% do documento/iframe).
- `src/screens/public/components/demo-app/HomeInteractiveDemo.tsx` — lido por completo; confirma
  que o card na Home tem `h-[680px] max-h-[80vh]`, e o iframe ocupa 100% desse espaço
  (`h-full w-full`).
- `src/ui/dialog.tsx` — lido em ciclos anteriores desta sessão; usa `max-h-[92vh]` fixo e
  `maxWSize`/`minHSize` por `size` (`md`/`lg`/`xl`/`xxl`), sem diferenciação entre app real e demo.

## Impacto por área

### Frontend

- `src/ui/dialog.tsx`: ajustar a altura máxima do modal. Como o modal já usa `92vh` (relativo ao
  viewport do documento — que dentro do iframe da demo é o próprio iframe, não a janela do
  navegador), o ajuste deve considerar que o card da demo tem overhead de header/padding que reduz
  o espaço útil real abaixo dos 680px totais do card. Avaliar reduzir a porcentagem (ex. de `92vh`
  para algo como `88vh` ou um valor calculado) ou adicionar uma constante de compensação, mantendo
  o resultado visualmente correto tanto no app real (tela cheia, onde `92vh` já funciona bem)
  quanto dentro do iframe da demo (onde o espaço total é menor).
- Sem impacto em hooks, query keys ou lógica de dados — mudança é puramente de dimensionamento
  CSS.
- Testes: verificação visual manual (ver seção "Testes necessários").

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/ui/dialog.tsx`

## Estratégia de implementação

1. Medir/calcular o espaço vertical realmente disponível dentro do iframe da demo (680px de altura
   do card, descontando o header do `AppShell` de ~56px e paddings do `main`) para entender o
   overhead real que o modal precisa respeitar.
2. Ajustar `max-h-[92vh]` em `src/ui/dialog.tsx` para um valor que funcione bem em ambos os
   contextos (app real em tela cheia e demo dentro do card) — preferencialmente um ajuste que não
   dependa de saber em qual contexto está rodando (mantendo o componente simples e sem lógica
   condicional adicional), a menos que se mostre necessário durante a validação visual.
3. Validar visualmente dentro da demo: abrir modal de nova despesa e nova receita, confirmar que
   cabem sem scroll excessivo dentro do card.
4. Validar visualmente no app real (`/app.html`, se houver conta de teste disponível): confirmar
   que o modal continua com comportamento correto em tela cheia.
5. Rodar `npx tsc --noEmit` e `npx vite build`.

## Regras de negócio identificadas

- O modal deve continuar sendo o mesmo componente (`Dialog`) usado tanto no app real quanto na
  demo — sem duplicar lógica ou criar uma variante separada, a menos que a validação mostre que é
  estritamente necessário.
- Nenhuma alteração deve ser feita nas telas reais (`ExpenseDialog`, `IncomeDialog`) — apenas no
  componente de moldura do modal.

## Regras multi-tenant e segurança

Não aplicável — mudança é puramente visual/CSS, sem relação com dados, sessão ou tenant.

## Validações necessárias

Não aplicável — sem mudança de payload, formulário ou lógica de negócio.

## Testes necessários

### Frontend

- Verificação manual: modal de nova despesa dentro da demo cabe adequadamente no card, sem scroll
  excessivo.
- Verificação manual: modal de nova receita dentro da demo, mesmo critério.
- Verificação manual: modal no app real (`/app.html`) continua funcionando com a mesma aparência
  de antes da mudança.
- Verificação visual em diferentes tamanhos de tela (mobile, tablet, desktop) tanto na demo quanto
  no app real.

### Backend

Não aplicável.

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- `Dialog` é um componente compartilhado entre o app real e a demo — qualquer ajuste de altura
  máxima precisa ser validado nos dois contextos para não introduzir regressão visual no app real
  em produção.
- Risco baixo dado o escopo reduzido (só dimensionamento do modal, sem tocar campos internos).
- Sem ferramenta de screenshot automatizado neste ambiente — validação visual final depende do
  usuário conferir no navegador via `/run`.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. Escopo foi esclarecido e reduzido pelo usuário durante
este ciclo de planejamento (de escala geral para ajuste específico do modal).

## Critérios de aceite do plano

- Modal de despesa/receita cabe adequadamente dentro do espaço do card da demo, sem scroll interno
  excessivo para o conteúdo padrão dos formulários.
- Comportamento do modal no app real (`/app.html`) permanece visualmente inalterado.
- Nenhuma tela real (`ExpenseDialog`, `IncomeDialog`, etc.) foi modificada.
- Build (`vite build`) e checagem de tipos (`tsc --noEmit`) passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Escopo é intencionalmente pequeno — resistir à tentação de expandir para escala geral da demo
  ou edição das telas reais, mesmo que pareça que ajudaria; isso foi explicitamente descartado
  pelo usuário nesta rodada.
- Validar visualmente com `/run` em ambos os contextos (demo e app real) antes de considerar a
  implementação concluída.
- Não instalar novas dependências.
