# Plano de Implementação: Categorias e cartões na carteira compartilhada

## Origem

- Arquivo de especificação: conversa com o usuário no chat, após a entrega da carteira compartilhada (commit `d7d9b27`) — "ajuste a lacuna que encontrou, e os cartões vão precisar ter vínculo com membro também né? pois um membro pode ter seu próprio cartão, e o cartão vinculado a ele vai ser apresentado para cadastrar a despesa"
- Data do planejamento: 2026-09-07
- Classificação: `frontend + backend + database`
- Branch: `refactor/R/padronizar-modal-configuracoes`

## Resumo

Dois ajustes que completam a carteira compartilhada da família:

1. **Categorias** — fechar a lacuna deixada pela entrega anterior: o membro deixou de receber cópias das categorias do gestor, mas o filtro continua por `usuario_id`, então ele não veria categoria nenhuma ao lançar.
2. **Cartões** — o membro pode ter cartão próprio. Com uma permissão específica, os membros passam a enxergar os cartões uns dos outros, tanto no modal de despesa quanto no card de limite de crédito.

Vale somente para conta pessoal. Conta empresa mantém o isolamento atual.

## Decisões aplicadas

- Cartões: **opção B** — todos os membros veem todos os cartões da conta, para que uma pessoa possa registrar um gasto feito no cartão de outra.
- Permissão de cartões: **separada** da permissão de ver lançamentos. Nasce em `false`, como as demais.
- Card de limite de crédito: **mostra todos os cartões visíveis** — se o membro enxerga o cartão, enxerga também o limite dele.
- Categorias: **sem permissão nova**. Categorias comuns são a premissa da carteira compartilhada, não uma escolha do gestor.

## Contexto: a lacuna herdada

O commit `d7d9b27` removeu a cópia de categorias na criação do membro — com a carteira compartilhada, duas categorias de mesmo nome apareceriam separadas no mesmo relatório.

Mas o filtro de `GET /categorias` continua sendo `WHERE c.usuario_id = $1`. O efeito prático: **o primeiro membro criado não verá categoria alguma** ao lançar uma despesa ou receita.

Isso não afeta ninguém hoje (não há membros cadastrados), mas afetará o próximo. É uma lacuna real, registrada no resumo daquela entrega.

## Diagnóstico dos cartões

Levantado por leitura de código.

### O vínculo já existe

`cartoes` tem `usuario_id` e `conta_id`. Quando um membro cadastrar um cartão, ele nasce com o `usuario_id` dele — o vínculo com a pessoa já está resolvido pelo schema.

### O problema é o filtro

`GET /cartoes` monta `WHERE c.usuario_id = $1`. Cada um vê apenas os próprios cartões.

Três consequências no fluxo de despesa:
- O modal de despesa lista só os cartões do próprio usuário.
- `validateCardId` (`expenses.ts:25`) recusa qualquer cartão que não seja do solicitante — então nem adiantaria o frontend exibir.
- `getCardLimits` filtra `WHERE c.usuario_id = $1`, então o card de limite mostra só os cartões do próprio usuário.

### Diferença conceitual entre categorias e cartões

**Categorias são comuns por natureza.** "Mercado" é uma só; duplicá-la por pessoa quebra o relatório.

**Cartões são pessoais por natureza.** O Nubank de um membro não é o de outro. O que a carteira compartilhada exige é poder *usar* o cartão de outro ao registrar um gasto — não que o cartão deixe de ter dono.

Por isso categorias mudam sem permissão, e cartões mudam com permissão explícita.

### O consumo do limite segue o cartão, não o autor

Se A lança R$ 500 no cartão de B, o limite consumido é o de B — o cartão é de B, a fatura é de B. A query de `getCardLimits` já agrupa por cartão, então esse comportamento sai naturalmente ao ajustar o filtro. Não há regra nova a inventar aqui, apenas a de não quebrar a existente.

## Escopo

### Dentro do escopo

- Filtro de `GET /categorias` passa a considerar os usuarios da conta em conta pessoal.
- Nova permissao "ver cartoes dos outros membros", com migration.
- `GET /cartoes` respeitando a permissao nova.
- `getCardLimits` respeitando a permissao nova.
- `validateCardId` aceitando cartao visivel ao solicitante, nao apenas o proprio.
- Toggle novo na tela de Permissoes, no grupo "Carteira da familia".

### Fora do escopo

- Editar ou excluir cartao de outro membro — apenas visualizar e usar em lancamentos.
- Reservas, contratos e clientes: seguem isolados por usuario.
- Conta empresa: nenhum comportamento alterado.
- Criacao de categoria por membro — ja coberta pela permissao `accessCategories` existente.
- As demais rotas que usam `buildOwnerAndAccountWhere` (compromissos, contratos, clientes, meses, relatorios).

## Leitura de contexto

- `CLAUDE.md` da raiz e do `sistema financas`
- `.plans/carteira-compartilhada-familia.md` (plano anterior, que originou a lacuna)
- `backend/src/utils/familyVisibility.ts` (`resolveVisibleUserIds`, criado na entrega anterior)
- `backend/src/routes/categories.ts` (filtro atual)
- `backend/src/routes/cards.ts` (filtro atual)
- `backend/src/routes/expenses.ts` (`validateCardId`)
- `backend/src/services/cardLimitService.ts` (`getCardLimits`)
- `backend/src/db/schema/memberPermissions.ts` e `cards.ts`
- `src/services/permissoesService.ts`
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` neste projeto: o `CLAUDE.md` da raiz cobre todo o repositório.

## Impacto por área

### Frontend

**`src/services/permissoesService.ts`**
- Uma flag nova no tipo `PermissionFlag`.
- Um item novo no grupo `familia`.

Nenhuma outra alteração: o modal de despesa e o card de limite já consomem o que o backend devolve. Passando a devolver mais cartões, eles exibem mais cartões.

### Backend

**Migration** — uma coluna em `membro_permissoes`, `NOT NULL DEFAULT false`.

**`backend/src/db/schema/memberPermissions.ts`** — a coluna correspondente.

**`backend/src/utils/familyVisibility.ts`**
- Nova função para resolver os usuários cujos cartões o solicitante pode ver, seguindo o mesmo desenho de `resolveVisibleUserIds`: toda falha restringe em vez de ampliar.
- Avaliar generalizar `resolveVisibleUserIds` para receber qual permissão consultar, em vez de duplicar a lógica de vínculo e conta.

**`backend/src/routes/categories.ts`**
- O filtro passa a aceitar os usuários da conta quando ela for pessoal.
- Atenção: a rota tem duas cláusulas (`c.tipo` e `c.conta_id`) mais a de órfãs adicionada hoje. O filtro por usuário é adicional a essas, não substitutivo.

**`backend/src/routes/cards.ts`**
- `GET /` respeitando a permissão nova.

**`backend/src/services/cardLimitService.ts`**
- `WHERE c.usuario_id = $1` passa a aceitar o conjunto de usuários visíveis.
- Cuidado: esta query foi alterada hoje (commit `ab4dd44`) para corrigir dois defeitos. Mexer de novo exige conferir que aquelas correções continuam valendo.

**`backend/src/routes/expenses.ts`**
- `validateCardId` passa a aceitar cartão de usuário visível, mantendo a recusa para qualquer outro.

### Banco de dados

Migration nova (próximo número: `0032`):

```sql
ALTER TABLE membro_permissoes
  ADD COLUMN IF NOT EXISTS acesso_cartoes_familia BOOLEAN NOT NULL DEFAULT false;
```

Nenhuma alteração em `cartoes` ou `categorias`: as colunas necessárias já existem.

**Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual aponta para produção.**

### Infra/Deploy

Sem impacto além de aplicar a migration antes do deploy. A ordem importa: o código lê a coluna nova; subir antes da migration quebra as rotas de permissão.

## Arquivos provavelmente afetados

- `backend/drizzle/0032_*.sql` (novo)
- `backend/src/db/schema/memberPermissions.ts`
- `backend/src/utils/familyVisibility.ts`
- `backend/src/routes/categories.ts`
- `backend/src/routes/cards.ts`
- `backend/src/routes/expenses.ts`
- `backend/src/services/cardLimitService.ts`
- `src/services/permissoesService.ts`

## Estratégia de implementação

1. Criar a migration e atualizar o schema Drizzle. **Não executar** — apresentar ao usuário.
2. Estender `familyVisibility.ts` com a resolução de cartões visíveis, reaproveitando a validação de vínculo e tipo de conta já existente.
3. Categorias: aplicar o filtro por conta, preservando as cláusulas atuais.
4. Cartões: aplicar o filtro em `GET /cartoes`.
5. Limite: aplicar em `getCardLimits`, conferindo que as duas correções de hoje seguem válidas.
6. `validateCardId`: aceitar cartão visível.
7. Frontend: a flag nova no serviço de permissões.
8. Validar: `tsc`, build, suíte do backend.

## Regras de negócio identificadas

- Categorias em conta pessoal pertencem à conta; todos os membros usam as mesmas.
- Criar categoria continua dependendo da permissão `accessCategories` já existente.
- Cartões pertencem a quem os cadastrou; a permissão libera ver e usar, não editar.
- Lançar despesa no cartão de outro membro consome o limite do dono do cartão.
- Sem a permissão de cartões, o membro vê e usa apenas os próprios.
- Conta empresa mantém o isolamento por usuário em tudo.

## Regras multi-tenant e segurança

O isolamento do projeto é por `usuario_id`, e este plano o flexibiliza mais um passo — agora em categorias e cartões.

Salvaguardas obrigatórias, as mesmas da entrega anterior:

1. O conjunto de usuários visíveis vem sempre de `conta_membros` daquela conta específica.
2. O solicitante precisa pertencer à conta antes de qualquer ampliação — informar um `conta_id` alheio não pode abrir dados de terceiros.
3. Toda falha na resolução retorna apenas o próprio usuário, nunca uma lista aberta.
4. Conta empresa não pode ser afetada em nenhum caminho.
5. `validateCardId` continua sendo a defesa na escrita: o frontend exibir um cartão não pode ser suficiente para usá-lo.

## Validações necessárias

- `validateCardId` deve recusar cartão que não seja do solicitante nem de um usuário visível.
- A permissão precisa ser verificada no backend; esconder o cartão na interface não é proteção.
- O filtro de categorias não pode perder as cláusulas atuais (tipo, conta, órfãs).

## Testes necessários

### Frontend

Não há suíte de teste de componente no projeto. Verificação manual:

- O toggle novo aparece no grupo "Carteira da família", só em conta pessoal.
- Com a permissão, os cartões do outro membro aparecem no modal de despesa e no card de limite.

### Backend

A suíte atual tem 23 testes. Avaliar cobertura para a resolução de cartões visíveis, que é função de segurança.

Verificação manual, com dois usuários:

- Membro vê as categorias da conta ao lançar.
- Sem a permissão de cartões, vê apenas os próprios.
- Com a permissão, vê os do outro membro.
- Lançar no cartão do outro consome o limite do dono.
- `validateCardId` recusa um cartão de usuário fora da conta.
- Em conta empresa, nada muda.

### E2E

Não aplicável — projeto não tem E2E configurado.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
cd backend && npm run build && npm test
```

Observação: `src/screens/despesas/DespesasScreen.tsx` tem um erro de tipo pré-existente, não relacionado a esta alteração.

## Riscos e pontos de atenção

- **Alto — visibilidade de dados:** categorias e cartões passam a cruzar entre usuários. Um filtro errado expõe dados de terceiros. Mitigação: reaproveitar a validação já escrita em `familyVisibility.ts`, sem duplicar a lógica.
- **Médio — `validateCardId`:** é a defesa na escrita. Afrouxar demais permitiria lançar despesa em cartão de qualquer usuário do sistema; afrouxar de menos quebra o recurso.
- **Médio — `getCardLimits`:** a query foi corrigida hoje (`ab4dd44`) para dois defeitos: cartão com `tipo` nulo e vazamento entre contas. Alterá-la de novo exige confirmar que ambas as correções permanecem.
- **Médio — filtro de categorias:** a rota acumula três cláusulas hoje, uma delas adicionada nesta mesma sessão. O filtro novo é adicional, não substitutivo.
- **Baixo — migration:** uma coluna aditiva com default, sem risco de perda.

## Perguntas em aberto

- `resolveVisibleUserIds` deve ser generalizada para receber a permissão a consultar, ou é melhor uma função irmã? A decidir na implementação, com preferência por generalizar — duplicar a validação de vínculo e tipo de conta seria duplicar código de segurança.
- O card de limite deve identificar de quem é cada cartão quando houver cartões de várias pessoas? Não definido; avaliar durante a implementação se a ausência do nome gera confusão.

## Critérios de aceite do plano

- Membro em conta pessoal vê as categorias da conta ao lançar despesa ou receita.
- Sem a permissão de cartões, o membro vê apenas os próprios.
- Com a permissão, vê os cartões dos demais membros no modal de despesa e no card de limite.
- Lançar despesa no cartão de outro membro consome o limite do dono do cartão.
- `validateCardId` aceita cartão visível e recusa qualquer outro.
- Conta empresa mantém exatamente o comportamento atual.
- As correções aplicadas hoje em `getCardLimits` continuam válidas.
- As rotas fora do escopo permanecem intactas.
- `tsc --noEmit`, `vite build` e os testes do backend passam.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- **Não executar a migration.** Apresentá-la e aguardar confirmação explícita.
- Reaproveitar `familyVisibility.ts` em vez de reescrever a validação de vínculo e conta.
- Ao mexer em `getCardLimits`, conferir que as duas correções do commit `ab4dd44` seguem válidas — o comentário no código as descreve.
- O filtro novo de categorias é adicional às cláusulas existentes, não substitutivo.
- Conta empresa não pode ser afetada em nenhum caminho de código.
- Não alterar `.env`. Não executar comandos destrutivos.
- Registrar no resumo final quais rotas foram tocadas e quais permaneceram intactas.
