# Plano de Implementação: Carteira compartilhada da família

## Origem

- Arquivo de especificação: conversa com o usuário no chat — "a intenção de membros da família é justamente usar as mesmas categorias, as despesas cair na mesma tabela, assim como receita, registrando o membro que cadastrou para ter um controle do que cada membro tem de entrada e saída"
- Data do planejamento: 2026-09-06
- Classificação: `frontend + backend + database`
- Branch: `refactor/R/padronizar-modal-configuracoes`

## Resumo

Hoje cada membro da família tem lançamentos e categorias separados: o filtro de visibilidade é `usuario_id`, então ninguém vê o que o outro cadastrou. O usuário quer o oposto — caixa único da família, com registro de quem lançou cada despesa e receita.

A coluna de autoria já existe (`despesas.usuario_id`, `receitas.usuario_id`). O problema é que ela acumula dois papéis: identifica o autor **e** filtra a visibilidade. Este plano separa esses papéis — o filtro passa a ser por conta, e `usuario_id` fica apenas como autoria.

Vale somente para conta pessoal. Conta empresa mantém o isolamento atual.

## Decisões aplicadas

- Decisão 1: duas permissões novas — **ver** lançamentos de outros membros e **editar/excluir** lançamentos de outros membros.
- Decisão 2: **categorias da conta** — uma só, compartilhada. Deixa de existir a cópia por membro.
- Decisão 3: membros **só em conta pessoal**. Se a conta padrão for PJ, o menu não aparece.
- Decisão 4: **coluna de autoria visível** nas tabelas de despesas e receitas, com filtro por membro.
- Decisão 5: ambas as permissões novas nascem em **`false`**, seguindo a regra existente de que membro novo não acessa nada.

## Diagnóstico do estado atual

Levantado por leitura de código e consulta somente-leitura ao banco.

### Como funciona hoje

1. O gestor cria o membro informando nome, e-mail, senha e CPF opcional. Não há convite por e-mail — a credencial é definida pelo gestor.
2. Numa transação, o sistema cria: um usuário `tipo=padrao`, o vínculo em `conta_membros`, um registro em `membro_permissoes` com tudo `false`, e uma **cópia das categorias do gestor** para o novo usuário.
3. O membro entra com o próprio login e vê apenas as telas liberadas.
4. Os lançamentos são isolados: `buildOwnerAndAccountWhere` monta `WHERE usuario_id = $1`.
5. Existe um endpoint `/summary` que agrega totais por pessoa entre os vinculados à conta — é a única visão consolidada.

### O que isso é na prática

Contas paralelas com visão consolidada, não carteira compartilhada. Cada pessoa lança no próprio caixa; o gestor vê o total de cada uma.

### Estado dos dados

Consulta em produção confirmou: **nenhum vínculo em `conta_membros`** e a conta padrão do usuário 1 é pessoal (conta 17). A limpeza executada hoje removeu tudo.

Consequência importante: **não há dados a migrar**. Nenhum membro existente, nenhuma categoria copiada para consolidar. Tudo nasce sob a regra nova, o que elimina a parte mais arriscada da mudança.

### Um conflito com a regra nova

`resolveGestorAccountId` hoje resolve a conta padrão do gestor **sem verificar o tipo**. E o menu de Configurações troca o rótulo para "Colaboradores" quando a conta é empresa — ou seja, o código atualmente suporta membros em PJ.

A decisão 3 elimina esse caminho: membros passam a ser exclusivos de PF.

## Escopo

### Dentro do escopo

- Migration adicionando duas colunas em `membro_permissoes`, ambas `NOT NULL DEFAULT false`.
- Filtro de despesas e receitas por conta (em vez de por usuário) quando a conta ativa for pessoal e o usuário tiver a permissão de ver lançamentos de outros.
- Autorizacao de edicao e exclusao: alterar lancamento de outro membro exige a permissao correspondente.
- Restringir a criacao de membro a conta padrao do tipo pessoal.
- Parar de copiar categorias na criacao do membro; o membro passa a usar as categorias da conta.
- Ocultar o menu "Membros da familia" e "Permissoes" quando a conta ativa for empresa.
- Remover o tratamento de rotulo "Colaboradores".
- Coluna "quem cadastrou" nas tabelas de despesas e receitas, com filtro por membro.
- Dois toggles novos na tela de Permissoes.

### Fora do escopo

- Colaboradores em conta empresa — o isolamento atual permanece intocado.
- Grupos de permissao (RBAC): o controle segue individual por membro.
- Historico de quem editou um lancamento; apenas o autor original e registrado.
- Convite por e-mail para membros.
- Alterar a visibilidade de cartoes, reservas, contratos ou clientes.

## Leitura de contexto

- `CLAUDE.md` da raiz e do `sistema financas`
- `backend/src/routes/accountMembers.ts` (criacao de membro, permissoes, summary)
- `backend/src/utils/ownerAndAccountWhere.ts` e `backend/src/utils/accountFilter.ts` (o filtro compartilhado)
- `backend/src/routes/expenses.ts` e `backend/src/routes/incomes.ts`
- `backend/src/db/schema/memberPermissions.ts` (25 flags atuais)
- `backend/src/db/schema/expenses.ts` e `categories.ts`
- `backend/src/middleware/auth.ts` (`requireGestor`)
- `src/services/permissoesService.ts` (flags e grupos no frontend)
- `src/layout/ConfigPanel.tsx` (menu e filtros)
- `src/screens/config/MembrosTab.tsx` e `PermissoesTab.tsx`
- `src/screens/despesas/DespesasScreen.tsx` e `src/screens/receitas/ReceitasScreen.tsx`
- Banco de producao, via consultas somente-leitura
- Nao existem `frontend/AGENT.md` nem `backend/AGENT.md` neste projeto: o `CLAUDE.md` da raiz cobre todo o repositorio.

## Impacto por área

### Frontend

**`src/services/permissoesService.ts`**
- Duas flags novas no tipo `PermissionFlag`.
- Novo grupo (ou itens num grupo existente) para as permissoes de colaboracao.

**`src/layout/ConfigPanel.tsx`**
- `membros` e `permissoes` passam a exigir conta pessoal, alem de `isGestor`.
- Remover o `.map` que troca o rotulo para "Colaboradores".

**`src/screens/despesas/DespesasScreen.tsx` e `src/screens/receitas/ReceitasScreen.tsx`**
- Coluna com o nome de quem cadastrou.
- Filtro por membro na barra de filtros, seguindo o padrao dos filtros existentes.
- A coluna so faz sentido quando ha mais de uma pessoa lancando; avaliar exibir apenas nesse caso.

**`src/types/finance.ts` e `src/services/financeService.ts`**
- Expor o nome do autor no tipo `Expense` e `Income`, e no mapeamento.

### Backend

**`backend/src/db/schema/memberPermissions.ts`**
- Duas colunas novas, espelhando o padrao das 25 existentes.

**`backend/src/utils/ownerAndAccountWhere.ts`**
- Ponto central da mudanca. Quando a conta ativa for pessoal e o solicitante tiver a permissao de ver lancamentos de outros, o filtro passa de `usuario_id = $1` para o conjunto de usuarios vinculados aquela conta.
- **Oito rotas usam esse utilitario** (`appointments`, `cards`, `clients`, `contracts`, `expenses`, `incomes`, `months`, `reports`). O escopo deste plano cobre apenas despesas e receitas — as demais devem continuar com o comportamento atual, o que exige um parametro explicito em vez de mudar o comportamento padrao do utilitario.

**`backend/src/routes/expenses.ts` e `incomes.ts`**
- Listagem: aplicar o filtro novo.
- `PUT` e `DELETE`: verificar a permissao de editar antes de alterar lancamento de outro membro.
- `SELECT`: incluir o nome do autor via join com `usuarios`.

**`backend/src/routes/accountMembers.ts`**
- `resolveGestorAccountId` passa a exigir conta padrao do tipo pessoal.
- Remover o bloco que copia as categorias do gestor.
- As rotas de permissao ganham as duas flags novas.

**Categorias**
- O membro precisa enxergar as categorias da conta. Verificar durante a implementacao se o filtro de `GET /categorias` ja resolve isso pela conta, ou se exige ajuste equivalente ao das despesas.

### Banco de dados

Migration nova (proximo numero disponivel: `0031`), adicionando a `membro_permissoes`:

```sql
ALTER TABLE membro_permissoes
  ADD COLUMN IF NOT EXISTS acesso_lancamentos_familia BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS editar_lancamentos_familia BOOLEAN NOT NULL DEFAULT false;
```

Os nomes finais devem seguir o padrao das colunas existentes (`acesso_despesas`, `acesso_receitas`).

Nenhuma alteracao em `despesas`, `receitas` ou `categorias`: as colunas necessarias (`usuario_id`, `conta_id`) ja existem.

**Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual aponta para produção** — confirmado, o `DATABASE_URL` do `.env` aponta para o Render.

### Infra/Deploy

Sem impacto esperado, além de aplicar a migration em produção no momento do deploy.

## Arquivos provavelmente afetados

- `backend/drizzle/0031_*.sql` (novo)
- `backend/src/db/schema/memberPermissions.ts`
- `backend/src/utils/ownerAndAccountWhere.ts`
- `backend/src/routes/expenses.ts`
- `backend/src/routes/incomes.ts`
- `backend/src/routes/accountMembers.ts`
- `src/services/permissoesService.ts`
- `src/layout/ConfigPanel.tsx`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`
- `src/types/finance.ts`
- `src/services/financeService.ts`

## Estratégia de implementação

1. Criar a migration com as duas colunas e atualizar o schema Drizzle. **Não executar** — apresentar ao usuário e aguardar confirmação.
2. Backend — autorização: acrescentar as flags às rotas de permissão e criar o utilitário que resolve "quais usuários este solicitante pode ver nesta conta".
3. Backend — leitura: aplicar o filtro novo em despesas e receitas, com parâmetro explícito para não afetar as outras seis rotas que usam o mesmo utilitário.
4. Backend — escrita: bloquear edição e exclusão de lançamento de outro membro sem a permissão correspondente.
5. Backend — membro: restringir a criação a conta pessoal e remover a cópia de categorias.
6. Frontend — permissões: as duas flags novas na tela.
7. Frontend — menu: ocultar membros e permissões em conta empresa; remover o rótulo "Colaboradores".
8. Frontend — tabelas: coluna de autoria e filtro por membro.
9. Validar: `tsc`, build, suíte do backend.

## Regras de negócio identificadas

- O gestor cria o membro definindo a senha; não há convite por e-mail.
- Membro nasce sem nenhuma permissão — inclusive as duas novas.
- Membros existem apenas em conta pessoal.
- Em conta pessoal, os lançamentos pertencem à conta; `usuario_id` registra quem cadastrou.
- Sem a permissão de ver, o membro enxerga apenas os próprios lançamentos — o comportamento atual.
- Com a permissão de ver, enxerga os lançamentos de todos os vinculados à conta.
- Editar ou excluir lançamento de outro membro exige a permissão específica.
- As categorias são da conta: o membro usa as mesmas do gestor e, com permissão, cria novas no conjunto comum.
- Conta empresa mantém o isolamento por usuário, sem alteração.

## Regras multi-tenant e segurança

O projeto não é multi-tenant por organização; o isolamento é por `usuario_id`, e é exatamente esse isolamento que este plano flexibiliza — de forma controlada.

**Este é o ponto mais sensível do plano.** Três salvaguardas obrigatórias:

1. O conjunto de usuários visíveis deve ser derivado de `conta_membros` **daquela conta específica**, nunca de uma lista aberta.
2. O utilitário compartilhado atende oito rotas. A mudança precisa ser explícita (parâmetro), não implícita — alterar o comportamento padrão afetaria cartões, contratos, clientes, compromissos, meses e relatórios sem intenção.
3. Conta empresa não pode ser afetada em nenhuma hipótese. O filtro novo só se aplica quando a conta ativa é pessoal.

Um erro em qualquer um dos oito pontos vaza dados entre **usuários diferentes do sistema**, não apenas entre membros da mesma família.

## Validações necessárias

- A permissão precisa ser verificada no backend, nunca apenas escondendo a interface.
- `PUT` e `DELETE` de despesa/receita devem confirmar: ou o registro é do próprio solicitante, ou ele tem a permissão de editar lançamentos de outros **e** o registro pertence à mesma conta.
- A criação de membro deve recusar com mensagem clara quando a conta padrão for empresa.

## Testes necessários

### Frontend

Não há suíte de teste de componente no projeto. Verificação manual:

- Menu de membros e permissões não aparece em conta empresa.
- Os dois toggles novos aparecem e salvam.
- A coluna de autoria aparece nas tabelas e o filtro por membro funciona.

### Backend

A suíte atual tem 23 testes. Recomenda-se acrescentar cobertura para a resolução de quais usuários são visíveis, que é a função de segurança introduzida — verificar durante a implementação se há infraestrutura de teste adequada.

Verificação manual, com dois usuários:

- Membro sem permissão vê só os próprios lançamentos.
- Com a permissão de ver, enxerga os do gestor.
- Sem a permissão de editar, recebe erro ao tentar alterar lançamento do gestor.
- Com a permissão de editar, consegue alterar.
- Em conta empresa, nada muda.
- Membro criado usa as categorias da conta, sem cópias novas.

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

- **Alto — vazamento de dados:** oito rotas compartilham o utilitário de filtro. Um ponto errado expõe dados entre usuários diferentes. Mitigação: parâmetro explícito, sem mudar o comportamento padrão.
- **Alto — irreversível na prática:** depois que os membros passarem a lançar no caixa comum, separar novamente exigiria decidir manualmente a autoria de cada registro. O código é reversível; a decisão de uso, não.
- **Médio — duas regras convivendo:** PF compartilha, PJ isola. Cada consulta precisa saber em qual regra está.
- **Médio — migration em produção:** duas colunas com default `false`, sem risco de perda, mas exige confirmação explícita no momento da execução.
- **Médio — desempenho:** o filtro passa de `usuario_id = $1` para `usuario_id = ANY(...)`, com uma subconsulta em `conta_membros`. Verificar se os índices existentes atendem.
- **Baixo — coluna de autoria:** apresentação, com o dado já disponível.

## Perguntas em aberto

- O filtro de categorias já resolve a visibilidade pela conta, ou exige ajuste equivalente ao das despesas? A verificar no início da implementação.
- A coluna de autoria deve aparecer sempre, ou apenas quando houver mais de uma pessoa lançando na conta? Assumido: apenas quando houver membros vinculados, para não poluir a tabela de quem usa o sistema sozinho.
- Há infraestrutura de teste com banco no backend para cobrir a resolução de usuários visíveis? A verificar durante a implementação.

## Critérios de aceite do plano

- Membro só pode ser criado quando a conta padrão do gestor é pessoal.
- Menu "Membros da família" e "Permissões" não aparecem em conta empresa.
- O rótulo "Colaboradores" não existe mais.
- Membro criado não recebe cópias de categorias; usa as da conta.
- Sem a permissão de ver, o membro enxerga apenas os próprios lançamentos.
- Com a permissão de ver, enxerga os de todos os vinculados à conta.
- Sem a permissão de editar, não consegue alterar nem excluir lançamento de outro membro — bloqueado no backend.
- As tabelas de despesas e receitas mostram quem cadastrou e permitem filtrar por membro.
- Conta empresa mantém exatamente o comportamento atual.
- As seis rotas fora do escopo (cartões, contratos, clientes, compromissos, meses, relatórios) mantêm o comportamento atual.
- `tsc --noEmit`, `vite build` e os testes do backend passam.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- **Não executar a migration.** Apresentá-la ao usuário e aguardar confirmação explícita, conforme a regra do projeto.
- **A mudança no filtro deve ser por parâmetro explícito**, nunca alterando o comportamento padrão de `buildOwnerAndAccountWhere` — seis rotas fora do escopo dependem dele.
- Verificar a permissão no backend em toda operação de escrita; esconder a interface não é proteção.
- Conta empresa não pode ser afetada em nenhum caminho de código.
- Não alterar `IncomeDialog` nem `ExpenseDialog` além do necessário para a coluna de autoria.
- Não executar comandos destrutivos no banco. Não alterar `.env`.
- Registrar no resumo final quais rotas foram tocadas e quais permaneceram intactas.
