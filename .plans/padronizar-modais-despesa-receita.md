# Plano de Implementação: Padronizar modais de Despesa e Receita

## Origem

- Arquivo de especificação: não há `.md` de feature. A especificação é a screenshot
  enviada pelo usuário do modal "Nova despesa" e o pedido: *"não tem como melhorar
  os modais de despesa e receita? tem componentes diferentes em tamanho,
  desalinhados, poderiamos usar o mesmo formato que estamos fazendo"*.
  O padrão de referência é o já aplicado nas 10 telas de Configurações.
- Data do planejamento: `2026-09-05`
- Classificação: `frontend-only`
- Branch: `refactor/R/padronizar-modal-configuracoes`

## Resumo

`ExpenseDialog` e `IncomeDialog` receberam, na Fase 3, apenas o alinhamento dos
inputs e dos botões de rodapé. O corpo permaneceu no padrão antigo, o que faz
conviver **três alturas diferentes na mesma linha**.

Estado atual do `ExpenseDialog`:

| Componente | Altura hoje | Onde aparece |
|---|---|---|
| `fieldInputStyle` | 32px | "Ex: Conta de luz" |
| `chipStyle` | 32px | PIX / Dinheiro / Débito / Crédito |
| `MoneyField` / `MoneyFieldSmall` | 44px | Valor da compra / Valor pago |
| `CategoryFloatingSelect` | 54px | "Selecionar categoria" |

O campo Categoria é 22px mais alto que o campo Descrição imediatamente ao lado
dele — é a origem visível do desalinhamento. Somam-se a isso os `cardStyle` que
dividem o corpo em blocos com borda (3 no ExpenseDialog, 6 no IncomeDialog), que
são as linhas horizontais cortando o modal na screenshot.

## Decisões aplicadas

- **Decisão 1:** Campo de valor com moldura de 32px e número em 15px semibold —
  mantém hierarquia visual (o valor segue sendo o maior texto da linha) sem
  quebrar o alinhamento.
- **Decisão 2:** `MoneyField` muda o **default** para 32px, propagando para as 5
  telas que o consomem. Sem prop de variante — evita "customização sobre
  customização" e mantém um único padrão no sistema.
- **Decisão 3:** `ExpenseDialog` e `IncomeDialog` na **mesma rodada** — são irmãos
  estruturais e o padrão já está validado em 10 telas de Configurações.

## Escopo

### Dentro do escopo

**Etapa de deleção (primeiro, sem sobrepor):**

- Remover os 3 `cardStyle` do corpo do `ExpenseDialog` (linhas ~489, ~629, ~730)
- Remover os 6 `cardStyle` do corpo do `IncomeDialog` (linhas ~342, ~427, ~523,
  ~587, ~648, ~746)
- Converter rótulos CAIXA ALTA para sentence case: "DESCRIÇÃO" → "Descrição",
  "CATEGORIA", "FORMA DE PAGAMENTO", "VALOR DA COMPRA", "VALOR PAGO",
  "DATA DA COMPRA", "TIPO DE RECEITA", "REPRESENTANTE", "CONTRATO",
  "QUANTIDADE DE HORAS"
- Remover os textos "opcional" (ExpenseDialog:578, IncomeDialog:527)
- Corrigir o asterisco de obrigatório: `C.primary` (cyan) → `C.danger` (vermelho)
- Remover as margens `var(--dialog-px)` do corpo

**Etapa de aplicação (depois):**

- `MoneyField` e `MoneyFieldSmall`: moldura 44px → 32px, número 20px → 15px semibold
- `CategoryFloatingSelect`: 54px → 32px
- Corpo com padding próprio de 14px e separadores de 1px no lugar dos cards

**Propagação aceita (Decisão 2):** `ReservaDialog`, `PaymentModal` e `CatalogoTab`
passam a exibir o `MoneyField` de 32px.

### Fora do escopo

- Qualquer mudança de comportamento, validação ou submit
- Lote (batch), autocomplete de descrição, detecção de duplicata, anexos,
  sugestão automática de categoria — lógica intocada
- `cardStyle` de `BatchPaymentModal`, `AppointmentDialog` e `ReservaDialog`
  (apenas o `MoneyField` dessas telas muda)
- Modais de Assinatura (`PagamentoDialog` e `CancelarDialog` em `PlanosScreen.tsx`)
  — pendência separada, já levantada
- `PlanosPage.tsx` (página pública de planos)

## Leitura de contexto

- `CLAUDE.md` da raiz e de `sistema financas/` — regras de workflow aplicadas
- `AGENT.md` da raiz do projeto — **lido, com divergência registrada**: descreve um
  backend multi-prefeitura com arquitetura multi-tenant + RLS, que não corresponde
  a este projeto (sistema financeiro single-tenant, isolado por `usuario_id`). As
  regras de multi-tenant/RLS não se aplicam; as de código TypeScript sim.
- `frontend/AGENT.md` e `backend/AGENT.md` — **não existem** neste projeto; não há
  separação em pastas `frontend/`/`backend/` com AGENT.md dedicado
- Arquivos inspecionados: `ExpenseDialog.tsx`, `IncomeDialog.tsx`,
  `dialogFormTokens.tsx`, `CategoryFloatingSelect.tsx`, e levantamento de alcance
  em `ReservaDialog.tsx`, `PaymentModal.tsx`, `CatalogoTab.tsx`,
  `BatchPaymentModal.tsx`, `AppointmentDialog.tsx`

## Impacto por área

### Frontend

- **Telas:** modal de Nova/Editar despesa, modal de Nova/Editar receita
- **Componentes:** `MoneyField`, `MoneyFieldSmall`, `CategoryFloatingSelect`
- **Hooks / query keys / forms:** sem alteração — `react-hook-form` e os
  `Controller` permanecem como estão
- **Validações:** sem alteração
- **Estados de loading/error/empty:** preservados; apenas o container de erro
  perde a margem lateral, acompanhando o novo padding do corpo
- **Testes:** o projeto não possui suíte de testes de frontend

### Backend

`Sem impacto esperado`

### Banco de dados

`Sem impacto esperado`

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário,
pois o ambiente atual pode estar apontando para produção. Este plano não envolve
nenhuma migration.

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

| Arquivo | Alteração |
|---|---|
| `src/ui/dialogFormTokens.tsx` | `MoneyField` e `MoneyFieldSmall` → 32px / 15px |
| `src/ui/CategoryFloatingSelect.tsx` | trigger 54px → 32px |
| `src/screens/finance/ExpenseDialog.tsx` | corpo: cards, rótulos, padding, asterisco |
| `src/screens/finance/IncomeDialog.tsx` | idem |
| `src/screens/reservas/ReservaDialog.tsx` | *(propagação — herda MoneyField)* |
| `src/screens/finance/PaymentModal.tsx` | *(propagação — herda MoneyField)* |
| `src/screens/config/CatalogoTab.tsx` | *(propagação — herda MoneyField)* |

## Estratégia de implementação

1. Ajustar `MoneyField` e `MoneyFieldSmall` em `dialogFormTokens.tsx` para
   moldura 32px e número 15px semibold.
2. Ajustar o trigger do `CategoryFloatingSelect` de 54px para 32px.
3. **ExpenseDialog — deletar:** os 3 `cardStyle`, os rótulos em caixa alta, o
   "opcional" e o asterisco cyan.
4. **ExpenseDialog — aplicar:** corpo com padding de 14px, separadores de 1px
   entre os grupos, rótulos em sentence case.
5. **IncomeDialog — deletar:** os 6 `cardStyle`, rótulos em caixa alta,
   "opcional", asterisco cyan.
6. **IncomeDialog — aplicar:** mesmo tratamento do passo 4.
7. Conferir visualmente as 3 telas de propagação (ReservaDialog, PaymentModal,
   CatalogoTab).
8. Validar com `tsc --noEmit` e `vite build`.

## Regras de negócio identificadas

Nenhuma regra de negócio é alterada. As regras existentes que o layout precisa
continuar refletindo:

- "Valor pago" só é preenchido quando difere do valor da compra (campo
  secundário, permanece desabilitado até marcação)
- Parcelas e recorrência são mutuamente exclusivas com "Não repete"
- Cartão de crédito só aparece quando a forma de pagamento é "Crédito"
- Descrição e valor são obrigatórios para habilitar o registro

## Regras multi-tenant e segurança

O projeto **não é multi-tenant** no sentido descrito no `AGENT.md` da raiz (não há
prefeituras, `tenantId` nem RLS). O isolamento relevante é por `usuario_id`, feito
no backend, e **não é tocado por este plano** — a alteração é exclusivamente de
apresentação no frontend.

Nenhum dado sensível passa a ser exibido, ocultado ou transmitido de forma
diferente.

## Validações necessárias

Nenhuma validação de input, schema, params ou payload é alterada. Os campos
obrigatórios seguem os mesmos (`descricao`, `valor`); a única mudança relacionada é
a **cor** do indicador de obrigatoriedade, de cyan para vermelho.

## Testes necessários

### Frontend

- O projeto não possui suíte de testes de frontend. Validação por typecheck,
  build e conferência visual.

### Backend

- Não aplicável (sem alteração de backend).

### E2E

- Não aplicável. Conferência manual dos fluxos: criar despesa, editar despesa,
  adicionar ao lote, criar receita com contrato, e as 3 telas de propagação.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- **Propagação para 3 telas fora do escopo** (aceito na Decisão 2): `ReservaDialog`,
  `PaymentModal` e `CatalogoTab` mudam de aparência sem terem sido pedidos.
  Mitigação: revisar as três antes de commitar.
- **Modais grandes e densos** (979 e 832 linhas) com layout condicional (parcelas,
  recorrência, cartão, contrato, horas). Risco de quebrar um ramo condicional.
  Mitigação: alterar apenas estilo, sem tocar em nenhuma condicional.
- **Erro pré-existente** em `DespesasScreen.tsx:726` (prop `disabled` faltando)
  continuará aparecendo no `tsc --noEmit`. Não é regressão deste trabalho e está
  fora do escopo autorizado.
- **Branch com trabalho acumulado**: 9 commits sem merge em `main`, mais as
  correções de `.config-scope` e `ComissaoRow` ainda não commitadas.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. As três decisões pendentes foram
respondidas pelo usuário e estão registradas em "Decisões aplicadas".

## Critérios de aceite do plano

- Nenhum `cardStyle` remanescente no corpo dos dois modais
- Todos os campos de uma mesma linha com 32px de altura
- Nenhum rótulo em caixa alta nos dois modais
- Nenhum texto "opcional"
- Asterisco de obrigatório em vermelho
- `ReservaDialog`, `PaymentModal` e `CatalogoTab` continuam funcionando com o
  `MoneyField` de 32px
- `tsc --noEmit` sem erros novos (o de `DespesasScreen.tsx:726` permanece)
- `vite build` passando

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- **Deletar antes de aplicar**, em duas etapas explícitas — nunca sobrepor estilo
  novo sobre estilo antigo. Duas versões do mesmo elemento significa tarefa
  incompleta.
- Não alterar lógica, validação, submit ou qualquer ramo condicional.
- Não executar migrations (não há nenhuma neste escopo).
- Não alterar `.env`.
- Não commitar sem antes revisar as 3 telas que recebem a propagação.
- Manter as alterações restritas aos arquivos listados.
