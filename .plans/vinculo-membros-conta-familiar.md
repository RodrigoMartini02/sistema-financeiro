# Plano de Implementação: Vínculo Membro↔Conta Familiar — Fase 2 de 3

## Origem

- Arquivo de especificação: nenhum `.md` de feature — pedido direto do usuário em conversa, com análise profunda feita por agente Explore (somente leitura) e decisões coletadas via perguntas ao longo da sessão.
- Data do planejamento: 2026-09-04
- Classificação: `frontend + backend + database`
- Este é o **plano 2 de 3**. Depende de `.plans/redefinicao-papeis-admin-gestor-padrao.md` (Fase 1) estar implementada e validada em produção primeiro. O próximo é `.plans/permissoes-configuraveis-por-membro.md` (Fase 3).

## Resumo

Hoje o sistema não tem nenhum conceito de família/dependente/sub-usuário: cada linha de `usuarios` é um login totalmente independente, e `contas` (`accounts`) pertence a exatamente um `usuario_id` (dono único, sem estrutura de múltiplos donos/membros).

Esta fase introduz o vínculo real: um usuário `gestor` (papel definido na Fase 1) pode criar membros (`padrao`) com login e senha próprios, vinculados à sua conta. As despesas/receitas lançadas pelo membro entram na **mesma `conta_id`** do gestor — a discriminação de quem lançou o quê usa o campo `usuario_id` (autor) que já existe nas tabelas `despesas`/`receitas`. A visão agregada familiar é a soma de todos os lançamentos daquela conta, independente do autor; a visão individual filtra por autor.

Por padrão (antes de qualquer configuração de permissão — isso é Fase 3), um membro só vê/edita os próprios lançamentos. O vínculo criado nesta fase dá **acesso à conta compartilhada**, mas a visibilidade de dados de outros autores dentro dela só é liberada na Fase 3.

Esta fase também cobre o fluxo de **desativação de membro**, incluindo o modal de transferência de despesas parceladas/recorrentes em aberto (decisão do usuário: tratar com cuidado, não é um simples soft-delete).

**Isso reabre uma decisão de escopo anterior**: `.plans/unificar-perfil-conta-renomeacao-completa.md` (linha 33) e `.plans/unificar-conta-perfis-login-documento.md` (linha 39) registraram explicitamente como fora de escopo "múltiplas senhas/autenticação independente" e "autenticação multi-usuário por conta". Esta fase reverte essa decisão de propósito.

## Escopo

### Dentro do escopo

**Vínculo membro↔conta:**
- Nova tabela `conta_membros`: `id`, `conta_id` (FK `contas.id`), `usuario_id` (FK `usuarios.id`), `status` (`ativo`/`inativo`), timestamps. Um `usuario_id` pode estar vinculado a no máximo 1 `conta_id` (membro pertence a uma família só).
- Endpoint: `gestor` cria membro — recebe nome/email/senha (definidos pelo gestor diretamente, sem fluxo de convite por email) e documento **opcional**. Cria a linha em `usuarios` (`tipo = 'padrao'`) e a linha correspondente em `conta_membros` vinculando à conta do gestor, numa transação.
- Endpoint: listar membros de uma conta (visão do gestor).
- Migration: `usuarios.document` passa a aceitar `NULL`; constraint `UNIQUE` vira parcial (`WHERE document IS NOT NULL`), para permitir membros sem CPF cadastrado (ex.: filho menor de idade). Usuários com documento já preenchido não são afetados.

**Login do membro:**
- Sem mudança na rota de login (`POST /api/auth/login`) além do necessário para aceitar usuários sem `document` cadastrado tentando logar — login continua por `document` já que é o identificador de login atual do sistema. **Ponto a decidir na implementação**: se membro pode não ter `document`, como ele loga? Ver "Perguntas em aberto".
- `POST /api/auth/register` (cadastro público externo) **não muda** — continua criando contas independentes normais. Membro nunca é criado por esse fluxo, só pelo endpoint novo do gestor.

**Resolução de conta ativa para o membro:**
- `GET /contas` (e fluxo equivalente de `useActiveAccount`) passa a resolver contas por vínculo: se o usuário logado é um membro (existe linha em `conta_membros` para ele), a conta retornada é a do gestor ao qual está vinculado — não uma conta própria separada. Membro não tem contas pessoais adicionais nesta fase.
- Se o usuário logado é um `gestor` (ou `padrao` não vinculado, ou `admin`), comportamento atual é preservado (`accounts.usuario_id = req.user.id`).

**Discriminação de autoria e visão agregada/individual:**
- `buildOwnerAndAccountWhere` (`backend/src/utils/ownerAndAccountWhere.ts`) e equivalentes em `expenses.ts`/`incomes.ts`: passam a resolver o conjunto de `usuario_id` visíveis a partir do vínculo de conta, não apenas do `req.user.id` isolado. **Nesta fase**, sem o sistema de permissões da Fase 3, o comportamento padrão continua sendo "cada autor só vê o que lançou" — a mudança aqui é de infraestrutura (a query já sabe navegar por conta/membros), não de visibilidade ainda liberada.
- Novo endpoint (ou parâmetro em endpoint existente) para visão agregada por conta: soma de despesas/receitas de todos os autores vinculados àquela `conta_id`. Este endpoint é visível apenas ao `gestor` nesta fase (membro `padrao` não acessa agregados até a Fase 3 liberar via permissão).

**Desativação de membro:**
- Endpoint: gestor desativa um membro (`conta_membros.status = 'inativo'`, e/ou `usuarios.status = 'inativo'` no membro — decidir consistência na implementação, reaproveitando o campo `status` que já existe em `usuarios`).
- Login do membro desativado passa a ser bloqueado (mesma lógica que já existe para `status !== 'ativo'`, se houver — confirmar tratamento atual em `auth.ts` durante a implementação).
- Dados históricos do membro (despesas/receitas já lançadas) **não são deletados** — ficam ocultos das visões normais assim que ele é desativado (não aparecem mais no dia a dia do gestor/outros membros ativos), mas continuam no banco e podem ser consultados via relatório/auditoria, se existir.
- **Modal de transferência (pré-condição para confirmar a desativação)**: antes de desativar, o sistema identifica despesas do membro que são:
  - parceladas com parcelas futuras em aberto (`installmentGroupId` preenchido, parcelas com `currentInstallment` ainda não pagas/vencidas no futuro);
  - recorrentes (`recurring = true`) ainda ativas.
  O gestor escolhe, para cada grupo de pendências (ou em lote), para qual `usuario_id` da mesma conta (o próprio gestor ou outro membro ativo) essas despesas passam a pertencer. A desativação só é efetivada depois que todas as pendências têm um destino escolhido — operação atômica (transação: reatribuir `usuario_id` das despesas pendentes + marcar membro como inativo, tudo ou nada).
  - Cartões vinculados ao membro (`cards.usuario_id`) ficam **fora do escopo desta fase** (confirmado com o usuário) — não fazem parte do modal de transferência.

### Fora do escopo

- Sistema de permissões granular/configurável (o que cada `padrao` pode ou não ver/fazer) — Fase 3.
- Tela de permissões — Fase 3.
- Transferência/tratamento de cartões (`cards`) vinculados a um membro desativado — não implementado nesta fase.
- Reativação de membro desativado — não mencionado pelo usuário; se necessário, tratar como extensão futura simples (reverter `status`), fora deste plano.
- Limite de quantidade de membros por plano/billing — decisão confirmada do usuário: sem limite técnico agora.
- Fluxo de convite por email (link para o próprio membro definir senha) — decisão confirmada: gestor define tudo diretamente.
- Membro ter contas adicionais próprias, além da conta do gestor — fora de escopo, não pedido.
- Exclusão definitiva (hard delete) de membro — só desativação (soft) nesta fase.

## Leitura de contexto

- `sistema financas/CLAUDE.md`, `sistema financas/AGENT.md` — mesmas notas da Fase 1 (modelo multi-prefeitura do `AGENT.md` não se aplica literalmente; princípios gerais aplicados).
- `frontend/AGENT.md`, `backend/AGENT.md` — não existem como arquivos dedicados neste projeto.
- `backend/src/db/schema/users.ts`, `accounts.ts`, `expenses.ts`, `incomes.ts` — lidos por completo (estrutura de `usuario_id`/`conta_id`, `installmentGroupId`, `recurring`, `document` NOT NULL UNIQUE).
- `backend/src/routes/users.ts` — inventário completo dos 17 endpoints (via agente Explore), usado para não duplicar/colidir com rotas existentes (ex.: `POST /` de criação de usuário via backoffice é uma rota **diferente** da nova rota de criação de membro por gestor).
- `backend/src/utils/ownerAndAccountWhere.ts` — lido por completo, ponto central que esta fase precisa generalizar.
- `src/hooks/useActiveAccount.ts`, `src/layout/AccountMenu.tsx` — mapeados via agente Explore (troca de conta hoje é 100% client-side via `localStorage` + reload; sem noção de "membro").
- `.plans/redefinicao-papeis-admin-gestor-padrao.md` (Fase 1 deste conjunto) — pré-requisito, define os papéis usados aqui.
- `.plans/unificar-perfil-conta-renomeacao-completa.md`, `.plans/unificar-conta-perfis-login-documento.md` — decisões anteriores sendo revertidas nesta fase.

## Impacto por área

### Frontend

- Novo hook/serviço para listar/criar/desativar membros (ex.: `src/services/membrosService.ts`), seguindo o padrão de `usuariosService.ts`.
- `src/hooks/useActiveAccount.ts`: ajustar para refletir que, se o usuário logado for um membro vinculado, a conta ativa é sempre a do gestor (sem seletor de múltiplas contas para ele, a menos que o gestor tenha mais de uma conta — a decidir/confirmar durante a implementação como isso interage com o modelo de múltiplas `contas` por usuário já existente).
- Nova tela (dentro de Configurações, ex.: nova aba "Membros"): lista de membros da conta, botão de criar membro (form: nome, email, senha, documento opcional), ação de desativar com o modal de transferência de pendências.
- `src/layout/AccountMenu.tsx`: possível indicação visual de "conta compartilhada"/quem é o gestor, se fizer sentido na UX (a definir na implementação, sem gold-plating).
- Telas de despesas/receitas: nenhuma mudança obrigatória nesta fase para exibir autor (não é pedido explícito), mas a estrutura de dados já suporta — avaliar se vale mostrar "lançado por" discretamente, sem expandir escopo além do pedido.

### Backend

- `backend/src/db/schema/`: nova tabela `contaMembros` (arquivo `accountMembers.ts` ou `contaMembros.ts`, seguindo convenção de nomes em inglês nos arquivos/camelCase e nomes de coluna em português como o restante do projeto).
- `backend/src/db/schema/users.ts`: `document` deixa de ter `.notNull()`.
- `backend/src/routes/`: novo arquivo de rotas para membros (ex.: `accountMembers.ts`), montado com `authenticate` + novo guard `requireGestor` (da Fase 1) nas rotas de criação/listagem/desativação.
- `backend/src/utils/ownerAndAccountWhere.ts`: estender para resolver o conjunto de autores visíveis via `conta_membros`, mantendo compatibilidade com o comportamento atual quando não há vínculo.
- `backend/src/routes/accounts.ts` (ou onde `GET /contas` estiver implementado — confirmar nome exato do arquivo na implementação, já que o rename para `accounts.ts` veio do plano de unificação perfil→conta): ajustar resolução para membros vinculados.
- Novo endpoint de desativação de membro com lógica transacional de transferência de pendências (parcelas futuras + recorrências).
- Novo endpoint (ou extensão de endpoint existente de relatório/dashboard) para visão agregada por conta.

### Banco de dados

**Nova tabela** (`backend/drizzle/00XX_conta_membros.sql`):

```sql
CREATE TABLE conta_membros (
  id SERIAL PRIMARY KEY,
  conta_id INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'ativo',
  data_criacao TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conta_membros_conta ON conta_membros(conta_id);
```

(`usuario_id UNIQUE` garante que um membro pertence a no máximo 1 conta — a confirmar como regra definitiva na implementação.)

**Alteração de coluna existente** (mesma migration ou separada):

```sql
ALTER TABLE usuarios ALTER COLUMN documento DROP NOT NULL;
ALTER TABLE usuarios DROP CONSTRAINT usuarios_documento_key; -- nome exato a confirmar via information_schema
CREATE UNIQUE INDEX usuarios_documento_unique_partial ON usuarios(documento) WHERE documento IS NOT NULL;
```

**Riscos de schema:**
- Nome exato da constraint `UNIQUE` atual de `usuarios.documento` precisa ser confirmado via `information_schema`/`pg_constraint` antes de escrever o `DROP CONSTRAINT` definitivo (mesma cautela já usada no plano de rename perfil→conta).
- Nenhum dado existente é afetado pela mudança de `NOT NULL` para nullable (só afrouxa a constraint, não força re-validação de linhas existentes).

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/db/schema/users.ts`
- `backend/src/db/schema/` (novo arquivo `accountMembers.ts`)
- `backend/src/db/schema/index.ts` (barrel export)
- `backend/src/routes/` (novo arquivo de rotas de membros)
- `backend/src/routes/accounts.ts` (ou nome equivalente atual)
- `backend/src/routes/auth.ts` (avaliação do fluxo de login sem documento)
- `backend/src/utils/ownerAndAccountWhere.ts`
- `backend/src/routes/expenses.ts`, `incomes.ts` (transferência de pendências na desativação)
- `src/services/` (novo `membrosService.ts`)
- `src/hooks/useActiveAccount.ts`
- `src/layout/AccountMenu.tsx`
- Nova tela em `src/screens/config/`
- Novas migrations em `backend/drizzle/`

## Estratégia de implementação

1. Confirmar nome exato da constraint `UNIQUE` de `usuarios.documento` via consulta somente leitura ao banco.
2. Escrever (sem executar) as migrations: nova tabela `conta_membros` + alteração de `documento` para nullable/unique parcial.
3. Backend: criar schema Drizzle da nova tabela.
4. Backend: criar rotas de gestão de membros (criar, listar, desativar) com o guard `requireGestor` da Fase 1.
5. Backend: resolver a questão de login sem documento (ver "Perguntas em aberto" — decisão necessária antes de codar essa parte).
6. Backend: estender `ownerAndAccountWhere` e `GET /contas` para considerar vínculo.
7. Backend: implementar endpoint de desativação com lógica transacional de transferência de pendências (parcelas + recorrências).
8. Backend: endpoint de visão agregada por conta.
9. Rodar `cd backend && npm run build`.
10. Frontend: `membrosService.ts`, ajuste em `useActiveAccount.ts`.
11. Frontend: nova tela de gestão de membros (listar, criar, desativar com modal de transferência).
12. Rodar build do frontend.
13. Apresentar resumo, pedir confirmação explícita separada para aplicar as migrations em produção.
14. Testes manuais completos: criar membro, logar como membro, lançar despesa como membro, ver que gestor consegue ver a conta compartilhada, desativar membro com pendências (parcelas e recorrências) e confirmar transferência correta.

## Regras de negócio identificadas

- Um `gestor` pode ter múltiplos membros vinculados à sua conta.
- Um `usuario_id` só pode ser membro de uma conta por vez.
- Membro lança despesas/receitas na mesma `conta_id` do gestor; autoria é discriminada pelo `usuario_id` já existente nessas tabelas.
- Por padrão (sem permissões configuradas — Fase 3), membro só vê os próprios lançamentos.
- Visão agregada da conta (todos os autores) é exclusiva do gestor nesta fase.
- Desativação de membro é soft (não deleta dados), mas exige resolver pendências financeiras futuras (parcelas em aberto, recorrências ativas) antes de confirmar — transferindo-as para outro `usuario_id` da mesma conta.
- Cartões do membro não são tratados no fluxo de desativação desta fase.

## Regras multi-tenant e segurança

- O equivalente a "tenant" aqui é `conta_id` — todo endpoint novo desta fase deve garantir que um `gestor` só gerencia membros da própria conta, nunca de outra.
- Vínculo de membro deve ser validado sempre a partir do JWT do `gestor` autenticado, nunca de um `conta_id` enviado livremente pelo client.
- A criação de membro deve verificar que quem está chamando é de fato `gestor` (ou `admin`) e que a conta-alvo pertence a ele.
- A transferência de pendências na desativação deve validar que o `usuario_id` de destino também pertence à mesma conta (não permitir transferir despesas para um usuário fora da família).
- Login sem documento: qualquer solução escolhida (ver pergunta em aberto) não pode enfraquecer a segurança do login de usuários que têm documento — mudança deve ser aditiva, não alterar o caminho de autenticação existente.

## Validações necessárias

- `POST` de criação de membro: nome e senha obrigatórios; email obrigatório e único (reaproveita constraint existente); documento opcional, mas se enviado, deve ser único (respeitando o índice parcial).
- Desativação: não permitir confirmar sem que todas as pendências (parcelas futuras + recorrências ativas) tenham destino escolhido.
- Transferência: `usuario_id` de destino deve estar ativo e pertencer à mesma `conta_id`.
- `GET /contas` para membro: deve retornar exatamente a conta do gestor ao qual está vinculado, nunca uma lista vazia nem uma conta de outra família.

## Testes necessários

### Backend

- Gestor cria membro com documento → sucesso, membro consegue logar.
- Gestor cria membro sem documento → sucesso, membro consegue logar (conforme solução escolhida na pergunta em aberto).
- Tentativa de criar membro com email já usado → erro claro.
- Membro lança despesa → `usuario_id` do lançamento é o do membro, `conta_id` é o da conta do gestor.
- `GET` de despesas como membro → só retorna as do próprio `usuario_id` (comportamento padrão preservado nesta fase).
- `GET` agregado da conta como gestor → soma despesas de todos os autores vinculados.
- `GET` agregado da conta como membro → deve ser bloqueado nesta fase (Fase 3 libera).
- Desativar membro sem pendências → sucesso direto.
- Desativar membro com parcelas futuras/recorrências sem destino escolhido → bloqueado, retorna as pendências para o frontend resolver.
- Desativar membro com destino escolhido → despesas pendentes reatribuídas ao novo `usuario_id`, membro marcado inativo, tudo numa transação (falha em qualquer etapa não deixa estado parcial).
- Login de membro desativado → bloqueado.

### Frontend

- Tela de membros lista corretamente os membros da conta.
- Criar membro pelo formulário funciona e reflete na lista.
- Fluxo de desativação com pendências abre o modal de transferência corretamente, exige seleção de destino antes de confirmar.
- Membro logado vê a conta do gestor automaticamente, sem precisar selecionar nada.

### E2E

- Fluxo completo: gestor cria membro → membro loga em outro navegador/dispositivo → lança despesa → gestor vê a despesa na visão agregada → gestor desativa o membro (com uma parcela futura pendente) → escolhe transferir para si mesmo → membro não consegue mais logar → despesa parcelada continua ativa, agora sob o `usuario_id` do gestor.

## Comandos de validação sugeridos

```bash
cd backend && npm run build
npx tsc --noEmit -p .
npm --prefix "sistema financas" run build
```

## Riscos e pontos de atenção

- **Lógica de transferência de pendências é a parte mais delicada deste plano** — precisa ser transação atômica; falha parcial pode deixar despesas com `usuario_id` órfão ou duplicar reatribuições. Testar exaustivamente em ambiente controlado antes de considerar pronta.
- Login sem documento é uma mudança que toca autenticação — mesmo risco de categoria da Fase 1, tratar com o mesmo cuidado (não alterar o caminho de quem já tem documento).
- `usuario_id UNIQUE` em `conta_membros` (membro só pertence a 1 conta) é uma decisão de design que impede cenários futuros como "pertencer a duas famílias" — aceitável para este escopo, mas deve ficar registrado como decisão consciente, não esquecimento.
- Constraint `UNIQUE` parcial em `documento` precisa ter nome exato de constraint atual confirmado no banco antes do `DROP CONSTRAINT`.
- Working tree pode ter mudanças em andamento de outras frentes — reler arquivos antes de editar.

## Perguntas em aberto

1. **Login de membro sem documento**: hoje `POST /api/auth/login` busca por `documento`. Se um membro não tem documento cadastrado, como ele loga? Duas opções a decidir no início da implementação (não foi fechado nesta rodada de perguntas):
   - (a) login por `email` como alternativa quando não há documento (exige estender a query de login para aceitar email OU documento);
   - (b) documento continua obrigatório para login funcionar, então na prática o campo "documento opcional" só é opcional para *cadastro*, mas o gestor é orientado a preenchê-lo assim que possível, e o membro sem documento fica temporariamente sem conseguir logar sozinho (cenário ruim, provavelmente não é o que o usuário quer).
   A opção (a) parece mais alinhada à intenção original (permitir cadastrar filho sem CPF e mesmo assim ele conseguir usar o sistema), mas precisa ser confirmada explicitamente antes de implementar essa parte, dado que mexe em autenticação.

## Critérios de aceite do plano

- Gestor consegue criar, listar e desativar membros vinculados à própria conta.
- Membro tem login/senha próprios e independentes.
- Despesas/receitas do membro entram na conta do gestor, discriminadas por autor.
- Por padrão, membro só vê os próprios lançamentos; gestor vê a visão agregada.
- Desativação de membro com pendências financeiras futuras exige resolução explícita (transferência) antes de confirmar, em transação atômica.
- Nenhuma migration executada sem confirmação explícita separada do usuário.
- Pergunta em aberto sobre login sem documento resolvida antes de implementar essa parte específica.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Depende da Fase 1 (`redefinicao-papeis-admin-gestor-padrao.md`) estar concluída — confirmar isso antes de iniciar.
- Resolver a pergunta em aberto (login sem documento) com o usuário antes de codar essa parte específica.
- Não executar migrations sem confirmação explícita separada — confirmar nome exato da constraint de `documento` no banco antes de escrever o `DROP CONSTRAINT` final.
- Tratar a lógica de transferência de pendências com o máximo de cuidado — usar transação, testar cenários de falha no meio do caminho.
- Seguir `sistema financas/CLAUDE.md` (não há `backend/AGENT.md`/`frontend/AGENT.md` dedicados).
- Este plano é a Fase 2 de 3. A Fase 3 (`permissoes-configuraveis-por-membro.md`) depende desta.
