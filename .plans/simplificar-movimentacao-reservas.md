# Plano de Implementação: Simplificar movimentação de reservas e corrigir criação

## Origem

- Arquivo de especificação: não há `.md` de feature. A especificação vem da
  mensagem do usuário após conferência visual em ambiente local, com cinco
  pontos: (1) não é possível salvar reserva, (2) eliminar o botão "Fechar" do
  canto inferior e o "Cancelar" do modal de confirmar pagamento, (3) ícone
  quebrado na prévia da reserva, (4) scroll deve rolar somente o histórico,
  (5) para adicionar ou retirar valor não deveria ser preciso informar data e
  descrição — apenas o valor, num campo sempre disponível ao lado dos botões.
- Data do planejamento: `2026-09-06`
- Classificação: `fullstack (frontend + backend)`
- Branch: `refactor/R/padronizar-modal-configuracoes`

## Decisão aplicada

- **Um campo de valor por linha de reserva**, ao lado dos botões de adicionar e
  retirar. Deixa claro a qual reserva o valor se aplica, ao custo de mais campos
  na tela quando houver muitas reservas.

## Os cinco itens

### 1. Não é possível salvar reserva (bug bloqueante)

`saveReserva` envia sempre o mês corrente (`hoje.getMonth()`), e o backend
recusa a criação se esse mês estiver fechado (`backend/src/routes/reserves.ts`,
linha 202). Setembro/2026 está fechado na conta do usuário, então nenhuma
reserva pode ser criada.

A checagem faz sentido em movimentação, onde dinheiro entra ou sai de um mês
contábil. Em criação não: a reserva é um contêiner, `mes`/`ano` ali são apenas
data de cadastro, e criar uma reserva vazia não altera o saldo de mês nenhum.

Correção: remover `isMonthClosed` da criação, mantendo-a na movimentação.

### 2. Movimentação com campo único

Hoje o fluxo é: clicar na seta, abrir um formulário com valor, data e descrição,
confirmar. Passa a ser: campo de valor sempre visível na linha; digitar e clicar
na seta correspondente.

Elimina o componente `MovimentoInline` (cerca de 90 linhas) e a máquina de
estado `movimentoAberto`. A data passa a ser sempre hoje e a descrição deixa de
existir.

### 3. Botões inúteis

- "Fechar" no rodapé do painel de Reservas
- "Cancelar" em `PaymentModal` e `BatchPaymentModal`

O X do cabeçalho já fecha os três. Aproveitar para alinhar os rodapés desses
dois modais ao padrão: hoje usam `padding: 12px 20px, borderRadius: 11`, escala
anterior à padronização.

### 4. Scroll apenas no histórico

Hoje o corpo inteiro do painel rola. Passa a: total reservado, lista de reservas
e formulário de criação fixos; apenas o histórico de movimentações rola.

### 5. Ícone quebrado — fallback, sem tocar no banco

Investigação registrada:

| Fato | Status |
|---|---|
| `cor` e `icone` no schema Drizzle de `reservas` | não existem |
| `INSERT` grava `cor`/`icone` | não |
| `GET` usa `SELECT *` | devolveria, se existissem no banco |
| Emojis no código-fonte | UTF-8 válido |
| Emojis da grade de ícones na tela | corretos |
| Emoji da lista de reservas | corrompido |

O usuário optou por corrigir os dados no banco, mas isso depende de confirmar se
as colunas existem — a consulta de leitura ficou pendente.

Solução que não depende dela: exibir o emoji padrão quando o valor não for um
emoji válido. As reservas antigas passam a mostrar o padrão em vez do lixo, sem
alterar o banco. Se depois for confirmado que as colunas existem, a correção de
raiz (migration ou UPDATE) entra em plano próprio.

## Escopo

### Dentro do escopo

**Backend:**

- Remover `isMonthClosed` da criação de reserva (mantida na movimentação)

**Frontend:**

- Deletar `MovimentoInline` e o estado `movimentoAberto`
- Campo de valor por linha, com os botões aplicando a movimentação direto
- Deletar o botão "Fechar" do painel
- Deletar o "Cancelar" de `PaymentModal` e `BatchPaymentModal`, alinhando os
  rodapés ao padrão
- Restringir o scroll ao histórico
- Fallback de emoji inválido para o padrão

### Fora do escopo

- Migration para criar `cor`/`icone`
- UPDATE corretivo no banco
- Alterar `checkAvailableBalance` ou o bloqueio de mês fechado na movimentação

## Leitura de contexto

- `CLAUDE.md` da raiz e de `sistema financas/` — regras de workflow aplicadas
- `AGENT.md` da raiz — lido, com divergência registrada: descreve um backend
  multi-prefeitura com multi-tenant + RLS que não corresponde a este projeto
- `frontend/AGENT.md` e `backend/AGENT.md` — não existem neste projeto
- Inspecionados: `src/screens/reservas/ReservasPanel.tsx`,
  `src/services/reservasService.ts`, `backend/src/routes/reserves.ts`,
  `backend/src/db/schema/reserves.ts`, `src/screens/finance/PaymentModal.tsx`,
  `src/screens/finance/BatchPaymentModal.tsx`

## Impacto por área

### Frontend

- Telas: painel de Reservas, modais de confirmar pagamento (individual e lote)
- Componentes: `MovimentoInline` removido; a linha da reserva ganha o campo
- Query keys e services: inalterados
- Estados: loading, error e empty preservados
- Testes: o projeto não possui suíte de frontend

### Backend

- Uma checagem removida em `routes/reserves.ts` (criação)
- Nenhuma query nova, nenhuma alteração de contrato

### Banco de dados

`Sem impacto esperado`

Atenção: migrations não devem ser executadas sem confirmação explícita do
usuário, pois o ambiente atual pode estar apontando para produção. Este plano
não envolve nenhuma migration nem UPDATE.

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

| Arquivo | Alteração |
|---|---|
| `backend/src/routes/reserves.ts` | remove checagem de mês fechado na criação |
| `src/screens/reservas/ReservasPanel.tsx` | campo inline, scroll, sem Fechar, fallback de emoji |
| `src/screens/finance/PaymentModal.tsx` | remove Cancelar, alinha rodapé |
| `src/screens/finance/BatchPaymentModal.tsx` | remove Cancelar, alinha rodapé |

## Estratégia de implementação

1. Backend: remover a checagem de mês fechado da criação de reserva.
2. Painel: deletar `MovimentoInline` e o estado `movimentoAberto`.
3. Painel: adicionar campo de valor por linha, com os botões aplicando direto.
4. Painel: restringir o scroll ao histórico, remover o botão Fechar e aplicar
   o fallback de emoji.
5. Remover o Cancelar de `PaymentModal` e `BatchPaymentModal` e alinhar os
   rodapés ao padrão.
6. Validar com `tsc --noEmit`, `vite build` e, no backend, `npm run build` +
   `npm test`.

## Regras de negócio identificadas

Preservadas:

- Depósito recusado quando excede o saldo disponível do mês
- Retirada recusada quando excede o saldo da reserva
- Movimentação bloqueada em mês fechado
- Saldo acumulativo, sem reset mensal

Alterada:

- Criação de reserva deixa de ser bloqueada por mês fechado

## Regras multi-tenant e segurança

O projeto não é multi-tenant no sentido do `AGENT.md` da raiz: não há
prefeituras, `tenantId` nem RLS. O isolamento é por `usuario_id` combinado com
`conta_id`, e não é alterado.

Remover a checagem de mês fechado na criação não afeta isolamento — é regra de
negócio sobre mês contábil, não sobre acesso a dados.

## Validações necessárias

Nenhuma validação nova. Sai a de data obrigatória na movimentação, já que o
campo deixa de existir. Permanece: valor maior que zero, nome da reserva com no
mínimo 2 caracteres.

## Testes necessários

### Frontend

- Não aplicável — o projeto não possui suíte de testes de frontend. Validação
  por typecheck, build e conferência visual.

### Backend

- Os 23 testes existentes devem continuar passando.

### E2E

- Conferência manual: criar reserva com o mês corrente fechado (era o bug),
  depositar, retirar, verificar o histórico e o comportamento do scroll.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build

cd backend && npm run build
cd backend && npm test
```

## Riscos e pontos de atenção

- **Sem data na movimentação:** toda entrada ou saída fica registrada no dia de
  hoje. Aporte retroativo deixa de ser possível pelo painel — é a troca pela
  simplicidade pedida.
- **Descrição sai:** movimentações antigas mantêm a que têm; as novas ficam sem,
  e a coluna some do histórico.
- **`PaymentModal` e `BatchPaymentModal` são de Despesas**, não de Reservas —
  mexer neles amplia o escopo para além do painel.
- **O ícone recebe paliativo**, não correção de raiz, enquanto a consulta sobre
  as colunas `cor`/`icone` não for respondida.
- Erro pré-existente em `src/screens/despesas/DespesasScreen.tsx:727` continuará
  aparecendo no `tsc --noEmit`; não é regressão.

## Perguntas em aberto

A consulta de leitura sobre `cor`/`icone` no banco segue pendente:

```sql
SELECT id, observacoes, cor, icone, octet_length(icone) AS bytes_icone
FROM reservas ORDER BY id LIMIT 5;
```

Não bloqueia este plano — o fallback resolve o sintoma visível.

## Critérios de aceite do plano

- Reserva pode ser criada mesmo com o mês corrente fechado
- Nenhum `MovimentoInline` nem `movimentoAberto` no código
- Campo de valor visível em cada linha, com os botões aplicando direto
- Sem botão Fechar no painel; sem Cancelar nos dois modais de pagamento
- Scroll restrito ao histórico
- Emoji inválido exibe o padrão
- As três regras de bloqueio na movimentação continuam valendo
- `tsc --noEmit` sem erros novos; `vite build` passando; backend `npm test` com
  23/23

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Deletar antes de aplicar, em etapas explícitas — nunca sobrepor.
- Não executar migrations nem UPDATE no banco.
- Preservar as três regras de bloqueio na movimentação e suas mensagens.
- Conferir visualmente o painel e os dois modais de pagamento.
