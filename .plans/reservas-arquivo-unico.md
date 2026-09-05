# Plano de Implementação: Reservas em um arquivo só

## Origem

- Arquivo de especificação: não há `.md` de feature. A especificação vem da
  pergunta do usuário após o painel ter sido entregue — *"eliminou
  completamente as telas antigas?"* — e da confirmação de que quer ir até o
  fim, eliminando também a tela e o modal de cadastro para que Reservas fique
  em um único arquivo.
- Data do planejamento: `2026-09-05`
- Classificação: `frontend-only`
- Branch: `refactor/R/padronizar-modal-configuracoes`
- Continuação de: `.plans/painel-unico-reservas.md`

## Resumo

O plano anterior criou o `ReservasPanel` e removeu o `ReserveMovementDialog`,
mas manteve `ReservasScreen` e `ReservaDialog` por decisão explícita do usuário
na época (Decisão 2 daquele plano: "manter a tela, enxuta em linhas
compactas").

O usuário agora optou por concluir a consolidação: Reservas passa a existir em
um único arquivo, `ReservasPanel.tsx`.

## Descoberta que simplifica o plano

**"Reservas" não está na sidebar.** Verificado em `AppShell.tsx`: os itens de
navegação são Painel, Movimentações, Relatórios e Clientes. A rota `'reservas'`
existe em `App.tsx`, mas o único caminho até ela é o botão "Gerenciar reservas"
dentro do próprio painel.

A tela já é um beco — ninguém chega nela navegando, só saindo do painel e
voltando. Isso derruba o custo levantado na conversa anterior ("Reservas sai da
sidebar"): ela nunca esteve lá.

## O que falta ao painel

Apenas duas capacidades existem somente na tela:

| Ação | Painel hoje | Tela |
|---|---|---|
| Criar reserva | sim | sim |
| Adicionar / retirar | sim | não (abre o painel) |
| Histórico | sim | não |
| **Editar** (nome, ícone, cor, meta) | não | sim |
| **Excluir** | não | sim |

Levando as duas para o painel, a tela perde a razão de existir.

## Decisões aplicadas

- **Escopo de edição:** editar tudo — nome, ícone, cor e meta. O usuário
  confirmou querer os quatro campos; a meta é o que mais muda com o tempo (o
  alvo de uma viagem ou de uma troca de carro é revisto), e sem edição a única
  saída seria excluir a reserva e perder o histórico junto.
- **Forma de editar:** o formulário de criação vira criar/editar, aberto pelo
  ícone de lápis na linha. Um formulário para os dois casos, em vez de um
  terceiro formulário inline na linha (que já abriga adicionar e retirar).

## Escopo

### Dentro do escopo

**Adicionar ao painel:**

- Formulário de criação passa a ser criar/editar, com o campo cor incluído,
  abrindo preenchido quando acionado pelo lápis da linha
- Exclusão de reserva, usando o `useConfirm` já existente no projeto, com aviso
  explícito de que o histórico de movimentações se perde junto

**Deleção:**

- `src/screens/reservas/ReservasScreen.tsx` (231 linhas)
- `src/screens/reservas/ReservaDialog.tsx` (200 linhas)
- Rota `'reservas'` em `src/App.tsx` e `src/demoMain.tsx`
- `'reservas'` do tipo `AppSection` em `src/layout/AppShell.tsx`
- Prop `onManageReserves` de `MovimentacoesScreen`
- Botão "Gerenciar reservas" do rodapé do painel e a prop `onGerenciar` — não
  há mais destino para onde ir

**Resultado:** Reservas em um único arquivo, `ReservasPanel.tsx`.

### Fora do escopo

- Backend, endpoints, tipos (`reservasService.ts` e `types/reservas.ts` ficam
  intactos)
- Alterar as regras de saldo disponível, saldo da reserva ou bloqueio de mês
  fechado
- Adicionar "Reservas" à sidebar (nunca esteve lá)

## Leitura de contexto

- `CLAUDE.md` da raiz e de `sistema financas/` — regras de workflow aplicadas
- `AGENT.md` da raiz — **lido, com divergência registrada**: descreve um backend
  multi-prefeitura com multi-tenant + RLS que não corresponde a este projeto.
  Sem impacto aqui, já que o plano é frontend-only.
- `frontend/AGENT.md` e `backend/AGENT.md` — **não existem** neste projeto
- Arquivos inspecionados: `ReservasPanel.tsx`, `ReservasScreen.tsx`,
  `ReservaDialog.tsx`, `MovimentacoesScreen.tsx`, `App.tsx`, `demoMain.tsx`,
  `AppShell.tsx`

## Impacto por área

### Frontend

- **Telas:** Reservas deixa de ter rota própria; tudo passa pelo painel
- **Componentes:** `ReservasPanel` ganha editar e excluir; dois arquivos
  removidos
- **Query keys:** inalteradas
- **Forms:** o formulário de criação passa a servir também à edição
- **Estados:** loading, error e empty já tratados no painel
- **Testes:** o projeto não possui suíte de frontend

### Backend

`Sem impacto esperado`

### Banco de dados

`Sem impacto esperado`

Atenção: migrations não devem ser executadas sem confirmação explícita do
usuário, pois o ambiente atual pode estar apontando para produção. Este plano
não envolve nenhuma migration.

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

| Arquivo | Alteração |
|---|---|
| `src/screens/reservas/ReservasPanel.tsx` | ganha editar e excluir; perde `onGerenciar` |
| `src/screens/reservas/ReservasScreen.tsx` | **removido** |
| `src/screens/reservas/ReservaDialog.tsx` | **removido** |
| `src/screens/finance/MovimentacoesScreen.tsx` | remove `onManageReserves` |
| `src/App.tsx` | remove a rota `'reservas'` |
| `src/demoMain.tsx` | remove a rota `'reservas'` |
| `src/layout/AppShell.tsx` | remove `'reservas'` do tipo `AppSection` |

## Estratégia de implementação

1. No painel: transformar o formulário de criação em criar/editar,
   acrescentando o campo cor e preenchendo os valores quando for edição.
2. No painel: adicionar exclusão com `useConfirm`, avisando sobre a perda do
   histórico.
3. Remover do painel o botão "Gerenciar reservas" e a prop `onGerenciar`.
4. **Deletar** `ReservasScreen.tsx` e `ReservaDialog.tsx`.
5. Remover a rota de `App.tsx` e `demoMain.tsx`, e `'reservas'` de
   `AppSection`.
6. Remover `onManageReserves` de `MovimentacoesScreen`.
7. Validar com `tsc --noEmit`, `vite build` e, no backend, `npm run build` +
   `npm test`.

## Regras de negócio identificadas

Todas preservadas:

- Depósito recusado quando excede o saldo disponível do mês
- Retirada recusada quando excede o saldo da reserva
- Movimentação bloqueada em mês fechado
- `tipo_reserva` derivado de `objetivo_valor` no `saveReserva`
- Saldo acumulativo, sem reset mensal
- Excluir uma reserva remove o histórico de movimentações junto — a confirmação
  precisa deixar isso claro

## Regras multi-tenant e segurança

O projeto **não é multi-tenant** no sentido do `AGENT.md` da raiz: não há
prefeituras, `tenantId` nem RLS. O isolamento é por `usuario_id` combinado com
`conta_id`, já aplicado nas rotas de reservas e **não alterado por este plano**.

## Validações necessárias

Nenhuma validação nova. As existentes seguem:

- nome da reserva com no mínimo 2 caracteres
- valor de movimentação maior que zero
- data obrigatória

## Testes necessários

### Frontend

- Não aplicável — o projeto não possui suíte de testes de frontend. Validação
  por typecheck, build e conferência visual.

### Backend

- Intocado. Os 23 testes existentes devem continuar passando.

### E2E

- Conferência manual: criar reserva, editar os quatro campos, excluir,
  adicionar, retirar e verificar o histórico.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build

cd backend && npm run build
cd backend && npm test
```

## Riscos e pontos de atenção

- **`ReservasPanel` cresce** ao ganhar editar e excluir. Mitigar reaproveitando
  o formulário de criação em vez de duplicá-lo.
- **Perda de um lugar "amplo"** para ver as reservas: o painel é um modal. Como
  a tela já era inalcançável pela navegação, o impacto real é baixo.
- **`AppSection` muda de tipo** — o `tsc` acusa qualquer referência esquecida, o
  que funciona como rede de segurança.
- **Escopo de tokens:** o painel vive fora do `.config-scope` e usa os tokens
  `C`, que são valores literais. Funciona, mas exige conferência visual — nem
  typecheck nem build detectam cor que não resolve.
- **Erro pré-existente** em `src/screens/despesas/DespesasScreen.tsx:727`
  continuará aparecendo no `tsc --noEmit`; não é regressão e está fora do
  escopo.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. As decisões foram respondidas pelo
usuário e estão registradas em "Decisões aplicadas".

## Critérios de aceite do plano

- `ReservasScreen.tsx` e `ReservaDialog.tsx` não existem mais
- Nenhuma referência a esses arquivos nem à rota `'reservas'` em todo o `src/`
- O painel permite criar, editar (nome, ícone, cor e meta), excluir, adicionar,
  retirar e ver o histórico
- A exclusão pede confirmação avisando que o histórico se perde
- Nenhuma regra de bloqueio alterada
- `tsc --noEmit` sem erros novos; `vite build` passando; backend `npm test` com
  23/23

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- **Deletar antes de aplicar**, em etapas explícitas — nunca sobrepor.
- Não tocar em backend, endpoints, `.env` ou migrations.
- Preservar as três regras de bloqueio e suas mensagens de erro.
- Conferir visualmente que as cores resolvem no painel, que vive fora do
  `.config-scope`.
- Manter as alterações restritas aos arquivos listados.
