# Plano de Implementação: Painel único de Reservas

## Origem

- Arquivo de especificação: não há `.md` de feature. A especificação vem das
  mensagens do usuário nesta conversa:
  *"reservas tem vários modais, telas... tudo desnecessário, análise para ficar
  prático em um modal só"* e, detalhando:
  *"continua pelo mesmo local que é hoje, ícone ao lado de adicionar despesa,
  ao abrir o modal deve conter tudo: criar nova reserva, adicionar/retirar,
  histórico de movimentação, valor reservado, data que foi adicionado a
  reserva, e a reserva é acumulativa se adicionar ou remover e de um mês para
  outro... igual nos bancos"*, e
  *"no modal apresenta as reservas, na mesma reserva o valor, adicionar,
  retirar, um histórico único informando as movimentações de entrada e saída,
  horários, datas, reserva... lembrando que isso influência no saldo atual da
  conta"*.
- Data do planejamento: `2026-09-05`
- Classificação: `frontend-only`
- Branch: `refactor/R/padronizar-modal-configuracoes`

## Resumo

Hoje Reservas está espalhada em três arquivos, com duas implementações do mesmo
formulário de movimentação:

| Arquivo | Linhas | Papel |
|---|---|---|
| `ReservasScreen.tsx` | 281 | Tela da sidebar, cards grandes |
| `ReservaDialog.tsx` | 405 | Modal com abas Configurações / Movimentar |
| `ReserveMovementDialog.tsx` | 162 | Modal só de movimentar |

`ReserveMovementDialog` é uma segunda implementação da aba "Movimentar" que já
existe em `ReservaDialog`, escrita de forma completamente diferente:

| | ReservaDialog (aba) | ReserveMovementDialog |
|---|---|---|
| Estado | react-hook-form + zod | 5 useState soltos |
| Validação | schema `movSchema` | `if (!Number.isInteger(...)) return` (falha em silêncio) |
| Valor | `MoneyField` | `<input type="number">` |
| Estilo | tokens `C` | Tailwind, campos `h-11` |
| Rodapé | só "Salvar" | "Gerenciar reservas" + "Cancelar" + submit |

A única diferença funcional é o seletor de reserva, porque o de Movimentações é
aberto sem reserva escolhida.

O ícone do cofrinho em Movimentações (ao lado de "Nova despesa") continua sendo
a porta de entrada, mas o modal deixa de ser um formulário raso de uma única
movimentação e passa a ser um painel completo:

- topo com total reservado e saldo disponível
- lista de reservas, cada uma com saldo e ações de adicionar/retirar inline
- criação de nova reserva no próprio painel
- histórico único consolidando as movimentações de todas as reservas, com data,
  hora, reserva, tipo e valor

## O que já existe no backend (verificado)

Três pontos da descrição do usuário **já funcionam** — o trabalho é de
interface, não de regra de negócio:

| Descrição | Estado |
|---|---|
| "acumulativa de um mês para outro, igual banco" | `reservas.valor` é saldo único; cada movimentação soma ou subtrai e grava o novo saldo. Sem reset mensal — `mes`/`ano` da reserva são só data de criação |
| "histórico, horários, datas" | `GET /reservas/:id/movements` pronto, devolve `data_hora`. `fetchMovimentacoes()` existe em `reservasService.ts` e **nenhuma tela consome hoje** |
| "influencia no saldo atual da conta" | `checkAvailableBalance` (reserves.ts:71) calcula o disponível e recusa depósito acima dele |

## Decisões aplicadas

- **Decisão 1:** Histórico único montado no frontend, buscando por reserva (N
  requisições paralelas, cacheadas por React Query). Sem endpoint novo.
- **Decisão 2:** `ReservasScreen` mantida, enxuta em linhas compactas — o painel
  é o acesso rápido, a tela é onde se vê tudo com calma.

## Escopo

### Dentro do escopo

**Deleção (primeiro, sem sobrepor):**

- `src/screens/reservas/ReserveMovementDialog.tsx` inteiro (162 linhas)
- `calcContribuicao` duplicada — corpo idêntico em `ReservasScreen.tsx:18` e
  `ReservaDialog.tsx:67`
- Resíduo de padrão em `ReservaDialog`: 4 `cardStyle` dentro de modal, rótulos
  em CAIXA ALTA (ÍCONE, NOME DA RESERVA, TIPO DE MOVIMENTAÇÃO, VALOR (R$),
  DATA, DESCRIÇÃO), `margin: '0 26px'`, texto "opcional", asterisco em cyan,
  botões de rodapé inline
- Cards grandes de `ReservasScreen`

**Criação:**

- Painel único acionado pelo ícone em Movimentações, contendo:
  - total reservado e saldo disponível no topo
  - lista de reservas com saldo e ações de adicionar/retirar inline
  - criação de nova reserva
  - histórico consolidado (data, hora, reserva, tipo, valor), ordenado por
    `data_hora` desc
- `fetchMovimentacoes` finalmente ligado, com query key própria
- `ReservasScreen` em linhas compactas, preservando barra de progresso das metas
  e o total reservado

### Fora do escopo

- Backend, endpoints, tipos (`reservasService.ts` e `types/reservas.ts` ficam
  intactos)
- Alterar as regras de saldo disponível, saldo da reserva ou bloqueio de mês
  fechado — preservadas exatamente como estão
- Transformar Reservas em aba de Configurações (o usuário optou por manter a
  tela)
- Endpoint consolidado de movimentações (excluído pela Decisão 1)

## Leitura de contexto

- `CLAUDE.md` da raiz e de `sistema financas/` — regras de workflow aplicadas
- `AGENT.md` da raiz — **lido, com divergência registrada**: descreve um backend
  multi-prefeitura com multi-tenant + RLS que não corresponde a este projeto.
  Sem impacto aqui, já que o plano é frontend-only.
- `frontend/AGENT.md` e `backend/AGENT.md` — **não existem** neste projeto
- Arquivos inspecionados: `ReservasScreen.tsx`, `ReservaDialog.tsx`,
  `ReserveMovementDialog.tsx`, `MovimentacoesScreen.tsx`,
  `services/reservasService.ts`, `types/reservas.ts`,
  `backend/src/routes/reserves.ts`

## Impacto por área

### Frontend

- **Telas:** aba Movimentações (troca do modal), tela Reservas
- **Componentes:** painel novo, `ReservaDialog` reescrito, `ReservasScreen`
  enxuta
- **Query keys:** nova key para movimentações consolidadas
- **Forms:** criação de reserva e movimentação seguem em `react-hook-form` + zod
- **Estados:** loading, error e empty tratados — inclusive "nenhuma movimentação
  ainda", que é o estado inicial mais comum
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
| `src/screens/reservas/ReserveMovementDialog.tsx` | **removido** |
| `src/screens/reservas/ReservaDialog.tsx` | vira o painel completo |
| `src/screens/reservas/ReservasScreen.tsx` | linhas compactas; usa `calcContribuicao` compartilhada |
| `src/screens/finance/MovimentacoesScreen.tsx` | passa a abrir o painel |
| `src/services/queryKeys.ts` | key para movimentações |

## Estratégia de implementação

1. Extrair `calcContribuicao` para um módulo compartilhado, eliminando a
   duplicata entre tela e modal.
2. Adicionar query key e hook que busca as movimentações de cada reserva em
   paralelo e mescla ordenando por `data_hora` desc.
3. **Deletar** de `ReservaDialog` os 4 `cardStyle`, rótulos em caixa alta,
   margens `0 26px`, "opcional" e asterisco cyan.
4. Reescrever `ReservaDialog` como painel: totais no topo, lista com ações
   inline, criação de reserva, histórico consolidado.
5. Apontar `MovimentacoesScreen` para o painel e **deletar**
   `ReserveMovementDialog.tsx`.
6. Enxugar `ReservasScreen` para linhas compactas, preservando progresso e
   total.
7. Validar com `tsc --noEmit`, `vite build` e, no backend, `npm run build` +
   `npm test`.

## Regras de negócio identificadas

Todas preservadas, nenhuma alterada:

- Depósito é recusado se exceder o saldo disponível do mês
  (`checkAvailableBalance`)
- Retirada é recusada se exceder o saldo da reserva
- Movimentação é bloqueada quando o mês está fechado
- Reserva com `objetivo_valor > 0` é tratada como "meta"; sem, é reserva simples
- Saldo é acumulativo e não reinicia entre meses
- `saveReserva` deriva `tipo_reserva` de `objetivo_valor`

## Regras multi-tenant e segurança

O projeto **não é multi-tenant** no sentido do `AGENT.md` da raiz: não há
prefeituras, `tenantId` nem RLS. O isolamento é por `usuario_id` combinado com
`conta_id`, já aplicado nas rotas de reservas e **não alterado por este plano**.

O histórico consolidado agrega apenas reservas que a API já devolve para o
usuário autenticado — não há acesso novo a dados.

## Validações necessárias

Nenhuma validação nova. As já existentes seguem:

- valor da movimentação maior que zero (schema `movSchema`)
- nome da reserva com no mínimo 2 caracteres
- data obrigatória

As mensagens de erro vindas do backend (saldo insuficiente, mês fechado) passam
a ser exibidas dentro do painel.

## Testes necessários

### Frontend

- Não aplicável — o projeto não possui suíte de testes de frontend. Validação
  por typecheck, build e conferência visual.

### Backend

- Intocado. Os 23 testes existentes devem continuar passando.

### E2E

- Conferência manual: criar reserva, depositar, retirar, ver o histórico
  consolidado, tentar depósito acima do saldo disponível e confirmar a mensagem
  de erro.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build

cd backend && npm run build
cd backend && npm test
```

## Riscos e pontos de atenção

- **N+1 aceito (Decisão 1):** uma requisição por reserva para montar o
  histórico. Irrelevante no volume atual; vira problema com dezenas de reservas.
  Se isso acontecer, a saída é o endpoint consolidado descartado na Decisão 1.
- **Ações duplicadas (Decisão 2):** painel e tela oferecem as mesmas ações;
  mudanças futuras precisam ser feitas nos dois lugares.
- **`ReservaDialog` cresce bastante** — de formulário para painel. Mitigar
  isolando lista, formulário e histórico em componentes próprios dentro do
  arquivo, em vez de um bloco único.
- **Escopo de tokens:** o painel vive em Movimentações, fora do
  `.config-scope`. É a mesma armadilha que deixou o botão invisível em
  `ClientesTab` — exige conferência visual, porque typecheck e build não
  detectam cor que não resolve.
- **Erro pré-existente** em `src/screens/despesas/DespesasScreen.tsx:727`
  continuará aparecendo no `tsc --noEmit`; não é regressão e está fora do
  escopo.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. As duas decisões pendentes foram
respondidas pelo usuário e estão registradas em "Decisões aplicadas".

## Critérios de aceite do plano

- `ReserveMovementDialog.tsx` não existe mais
- O ícone do cofrinho em Movimentações abre o painel completo
- O painel permite criar reserva, adicionar e retirar valores
- O painel exibe histórico único com data, hora, reserva, tipo e valor
- Total reservado e saldo disponível visíveis no topo
- `calcContribuicao` existe em um único lugar
- `ReservasScreen` em linhas compactas, sem cards grandes, preservando a barra
  de progresso das metas
- Nenhum `cardStyle` dentro de modal; nenhum rótulo em caixa alta
- As três regras de bloqueio (saldo disponível, saldo da reserva, mês fechado)
  continuam valendo, com suas mensagens exibidas no painel
- `tsc --noEmit` sem erros novos; `vite build` passando; backend `npm test`
  com 23/23

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- **Deletar antes de aplicar**, em etapas explícitas — nunca sobrepor a
  estrutura nova sobre a antiga. Duas versões do mesmo elemento significa tarefa
  incompleta.
- Não tocar em backend, endpoints, `.env` ou migrations.
- Preservar as três regras de bloqueio e suas mensagens de erro.
- Conferir visualmente que as cores resolvem no painel, que vive fora do
  `.config-scope`.
- Manter as alterações restritas aos arquivos listados.
