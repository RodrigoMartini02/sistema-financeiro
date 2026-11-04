# Plano de Implementação: Render sem disco e limpeza do que a Etapa C deixou sem uso

## Origem

- Arquivo de especificação: `.plans/unificar-anexos-no-r2.md` (Etapa D e o registro da Etapa C, com as sobras listadas em 04/11/2026).
- Data do planejamento: 2026-11-04
- Classificação: `infra/deploy` (com limpeza de backend e documentação)
- Aprovação: opção 1 ("Aprovar e salvar") do usuário em 04/11/2026, depois de responder a decisão pendente. A implementação só começa com `/implementar`.

Motivo da classificação: não há tela, rota nem migration. O que muda é código de backend que ficou sem uso, uma regra no `AGENT.md` e ações do usuário no painel do Render (apagar o disco, trocar de plano, suspender outro serviço).

## Resumo

As Etapas A, B e C passaram todos os arquivos persistentes (anexos de lançamentos, de contratos e imagens do catálogo) para o R2. Em 04/11/2026 a produção ficou sem migration pendente (100 registradas), com 26 anexos de lançamentos na tabela `anexos`, sem as colunas `despesas.anexos` e `receitas.anexos` e sem as tabelas `comercial.anexos` e `catalogo.produto_imagens`.

Sobram dois blocos:

1. **Limpeza:** a ferramenta de cópia dos anexos antigos (`migrate-entries`, `verify-entries`, `attachmentLegacy*.ts`), o filtro do `anexos` antigo em `withEntryAttachments` e a trava de abas antigas (`rejectLegacyAttachments`) não servem mais. Os comandos de cópia quebrariam se rodados, porque a coluna não existe.
2. **Etapa D (Render sem disco):** o backend não lê nem grava mais em `uploads/`. Falta registrar a regra no `AGENT.md` e o usuário agir no painel do Render, com uma semana de uso no plano gratuito. A economia é de até ~US$ 7,23/mês, e só vale se o teste passar.

Nenhum comportamento visível ao usuário muda com o código deste plano.

## Decisões aplicadas

- **Decisão 1:** remover agora a trava `rejectLegacyAttachments`. O usuário aceitou o risco: uma aba aberta, ou um app instalado, com a versão antiga do site que mande arquivo em base64 passa a perder o anexo sem aviso, porque o backend ignora o campo.

## Escopo

### Dentro do escopo

1. `backend/scripts/attachments.ts`: saem `migrate-entries`, `verify-entries` e o que só eles usam (relatórios, `readUserIds`, as flags `--aplicar` e `--usuario=`, `formatBytes`, `printIssues`, `ENTRY_LABELS`). Ficam `check-r2`, `sweep` e `orphans`. Cabeçalho e texto de uso atualizados.
2. Apagar `attachmentLegacy.ts`, `attachmentLegacy.test.ts`, `attachmentLegacyMigration.ts` e `attachmentLegacyMigration.db.test.ts`.
3. `findAttachmentOrphans` vai para um arquivo próprio, `attachmentOrphans.ts`, reescrita em Drizzle (hoje usa SQL cru, porque nasceu na ferramenta de cópia), com teste de banco. O `orphans --apagar` continua igual: confere duas vezes, com pausa, e só remove arquivo sem linha.
4. `withEntryAttachments` (`attachmentService.ts`): sai o filtro do `anexos` antigo e o `Omit<Row, 'anexos'>`.
5. Sai `rejectLegacyAttachments`: a função e o teste dela em `attachmentModel.ts` e `attachmentModel.test.ts`, e as duas chamadas em `expenseInput.ts` e `incomeInput.ts`, com os imports.
6. `AGENT.md`: seção nova com a regra de arquivos persistentes (texto abaixo; aprovar este plano é aprovar o texto).
7. Apagar as pastas locais vazias `backend/uploads/catalogo`, `backend/uploads/contratos` e `backend/uploads`. Elas não estão no git.
8. Guia do painel do Render e roteiro da semana de uso (abaixo), como instruções ao usuário.
9. Registro no plano mestre e na memória do projeto.

### Fora do escopo

- Editar o cabeçalho da migration 0095 (já aplicada; o `AGENT.md` proíbe editar migration aplicada). Ele cita os comandos que saem, e isso fica como histórico.
- Reduzir o limite de JSON de 50 MB em `server.ts`: o chat do assistente (arquivos em base64) e as fotos de perfil ainda dependem dele. Pede inventário à parte.
- Apagar os 4 arquivos de backup do JSON em `producao/backups/anexos-jsonb/` no R2.
- Trocar o Postgres do Render (o plano gratuito dele expira em 30 dias).
- Aviso de "servidor acordando" ou nova tentativa de chamadas no frontend: só se a espera atrapalhar na semana de uso.
- Criar um serviço novo se o painel recusar o plano Free: mudaria a URL fixa do backend (`src/services/apiClient.ts`) e o CORS, e pede outro plano.
- `backend/config/schema-dev.sql`: dump antigo que nada referencia, sem relação com este trabalho.

## Leitura de contexto

- `/AGENT.md`: sem código sem aprovação; identificadores em inglês; Drizzle nas consultas novas; sem `catch` silencioso; não editar migration aplicada; Node `22.17.0`.
- `/CLAUDE.md`: fluxo `/planejar` → aprovação → `/implementar` → `/finalizar`; `.env` e migrations só com confirmação explícita; o banco pode ser a produção.
- `frontend/AGENT.md` e `backend/AGENT.md`: não existem no projeto (o `AGENT.md` da raiz cobre o repositório todo).
- `.plans/unificar-anexos-no-r2.md`, lido inteiro.
- Código e arquivos lidos: `backend/scripts/attachments.ts`, `attachmentLegacy.ts`, `attachmentLegacyMigration.ts` (e os testes), `attachmentService.ts`, `attachmentModel.ts`, `expenseInput.ts`, `incomeInput.ts`, o uso de `withEntryAttachments` em `routes/expenses.ts` e `routes/incomes.ts`, `server.ts`, os pontos de escrita local do servidor (`tmpdir()`), `backend/uploads` local, `.gitignore` e `scripts/setup-dev-db.js`.
- Documentação do Render consultada em 04/11/2026: [Deploy for Free](https://render.com/docs/free), [Persistent Disks](https://render.com/docs/disks) e [Compute Plans](https://render.com/docs/compute-plans).

## Situação atual verificada (04/11/2026)

- **Produção:** nenhuma migration pendente (100 registradas); colunas e tabelas antigas apagadas; 25 anexos de despesas e 1 de receita; nenhum pendente; `orphans` dá 0 arquivos sem linha e 0 linhas sem arquivo.
- **Código:** nenhum arquivo do backend ou do frontend referencia `uploads/`; o multer só usa memória (`memoryStorage`); toda escrita local do servidor vai para `os.tmpdir()` (cache do armazém de contratos, leitura do assistente, coletor).
- **Documentação:** nenhuma cita o disco `uploads/`. Os textos sobre "disco" nas Licitações falam da pasta temporária.
- **Sem uso, por busca no código:** a ferramenta de cópia só é usada por `backend/scripts/attachments.ts` e pelos 4 arquivos `attachmentLegacy*`. `withEntryAttachments` é chamado em `routes/expenses.ts` (2 vezes) e `routes/incomes.ts` (1 vez). `rejectLegacyAttachments` é chamado só em `expenseInput.ts` e `incomeInput.ts`.
- **Render:** não existe `render.yaml`; a configuração está no painel. O servidor tem dois pontos que dependem de processo ligado: limpezas em memória (`setInterval`, inofensivas) e dois webhooks de pagamento (`routes/paypal.ts` e `routes/plans.ts`).
- **O que a documentação do Render confirma:**
  - Free: dorme após 15 minutos sem requisição, leva cerca de 1 minuto para acordar, tem 750 horas por mês para o workspace todo (o tempo dormindo não conta) e não aceita disco persistente.
  - Free: 0,1 CPU e 512 MB; Starter: 0,5 CPU e 512 MB.
  - Passar do limite de horas suspende todos os serviços Free do workspace até o mês seguinte.
  - A troca de plano é feita em Compute > Edit e só vale depois do primeiro deploy bem-sucedido.
  - Com disco, a troca de plano tem uma breve indisponibilidade.
- **O que a documentação NÃO confirma:** se um serviço pago pode voltar ao Free, e se dá para recuperar um disco depois de apagado (só se diz que os snapshots ficam 7 dias depois de criados). Trate o disco como irrecuperável.

## Impacto por área

### Frontend

Sem impacto esperado.

### Backend

- Remoções e ajustes descritos em "Dentro do escopo" (itens 1 a 5).
- `attachmentOrphans.ts` (novo): `findAttachmentOrphans(storage, executor = db)`, com `select` só das colunas necessárias (`id` e `storageKey`). Devolve os arquivos de `anexos/` sem linha e as linhas sem arquivo.
- O script precisa importar esse módulo **depois** do `dotenv`, de forma dinâmica, como o `sweep` faz, porque importar o cliente do banco abre a conexão.
- Sem rota nova, sem permissão nova e sem mudança de contrato da API.

### Banco de dados

Sem impacto esperado. Sem migration. O teste de banco novo usa o schema temporário do banco local (sem tocar no `public`).

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- Sem variável nova e sem mudança de build. A configuração do Render está só no painel.
- As ações no painel (guia abaixo) são do usuário e independem do código deste plano: o servidor no ar já não usa o disco. Podem ser feitas antes, durante ou depois da implementação, e o recomendado é já, para economizar mais cedo.
- O deploy da limpeza não muda o comportamento do servidor.

## Arquivos provavelmente afetados

- **Editar:** `backend/scripts/attachments.ts`, `backend/src/services/attachmentService.ts`, `attachmentModel.ts`, `attachmentModel.test.ts`, `expenseInput.ts`, `incomeInput.ts`, `AGENT.md`.
- **Apagar:** `backend/src/services/attachmentLegacy.ts`, `attachmentLegacy.test.ts`, `attachmentLegacyMigration.ts`, `attachmentLegacyMigration.db.test.ts`.
- **Novo:** `backend/src/services/attachmentOrphans.ts`. O teste de banco entra em `attachmentService.db.test.ts`, que já tem o cenário (usuários, lançamento e R2 simulado).
- **Local:** `backend/uploads/` (vazia, fora do git).
- **Documentos de trabalho:** `.plans/unificar-anexos-no-r2.md` (registro) e a memória do projeto em `.claude/`.
- **Não mexer:** `backend/drizzle/0095_drop_entry_attachments_json.sql`.

## Estratégia de implementação

1. Criar a branch `refactor/R/render-sem-disco` a partir da `main`. O plano mestre sugeria `chore/R/render-sem-disco`, mas o `/implementar` só conhece `feat`, `fix` e `refactor`.
2. Criar `attachmentOrphans.ts` (Drizzle) e o teste de banco dele em `attachmentService.db.test.ts`: arquivo sem linha, linha sem arquivo e arquivo com linha (que não é órfão). Só depois apagar a versão antiga.
3. Reescrever `scripts/attachments.ts`: remover os comandos de cópia e o que só eles usam; `orphans` passa a usar o módulo novo, importado depois do `dotenv`; atualizar o cabeçalho e o texto de uso; simplificar o que ficar com um único uso (por exemplo `withDatabaseAndStorage`). O `tsc` do projeto não cobre `scripts/`: conferir os tipos com uma configuração temporária fora do repositório.
4. Apagar os 4 arquivos legados.
5. Simplificar `withEntryAttachments` e ajustar o comentário. O `tsc` aponta o que mais depender do tipo antigo.
6. Remover `rejectLegacyAttachments`: função, teste, as 2 chamadas e os imports.
7. Acrescentar a seção "Arquivos Persistentes" ao `AGENT.md`, antes de "Regras Obrigatórias de Banco de Dados".
8. Remover as pastas locais vazias com `rmdir`, só depois de conferir que estão vazias.
9. Inventário por busca no código, que tem de dar zero fora do cabeçalho da 0095 e dos `.plans`: `migrate-entries`, `verify-entries`, `attachmentLegacy`, `LegacyDatabase`, `rejectLegacyAttachments`, `uploads/`.
10. Validar (seção abaixo).
11. Atualizar o registro do plano mestre e a memória do projeto.
12. `/finalizar`: commit e push da branch. O merge só com o "sim" do usuário.

## Texto da regra para o `AGENT.md`

Seção nova, antes de "Regras Obrigatórias de Banco de Dados":

```md
## Arquivos Persistentes

O backend roda sem disco persistente: o disco do servidor some a cada deploy, reinício ou hibernação. Todo arquivo que precisa durar vai para o R2, pelo serviço de arquivos (`backend/src/services/attachment*.ts`, tabela `anexos`, rotas `/api/attachments`).

- Não grave arquivo duradouro no disco local (`fs.writeFile`, `multer` com `diskStorage`, pastas como `uploads/`) nem dentro de coluna do banco (base64 em `jsonb` ou `text`).
- Arquivo temporário e recriável (OCR, conversão, cache de leitura) usa `os.tmpdir()`.
- Apagar o dono apaga o arquivo: colete as chaves antes de apagar as linhas e remova os objetos do R2 depois do commit.
- Arquivo privado abre por link assinado curto; a chave do R2 nunca sai na API.
```

## Etapa D: ações do usuário no painel do Render

Os nomes dos botões podem variar. Antes de começar, conferir que o deploy no ar é o da Etapa C (merge `4fac64d5` ou mais novo).

1. **Conferir:** nos Logs não deve haver menção a `uploads`. Em Environment, nada deve apontar para o disco. Anotar o caminho de montagem e o tamanho do disco.
2. **Apagar o disco:** tratar como irreversível. Só havia as 6 imagens de teste e nenhum anexo de contrato (medido e dispensado pelo usuário em 04/11/2026).
3. **Trocar o plano do backend para Free:** Compute > Edit > Free > Save. A troca só vale depois do primeiro deploy bem-sucedido, que a Render dispara sozinha; fazer fora do horário de uso. **Se a opção Free não aparecer, parar e avisar:** a documentação não confirma esse caminho, e o plano passa a ter outro desenho (serviço novo, URL e CORS).
4. **Suspender o `escalacao-futebol-1`:** as 750 horas gratuitas por mês valem para o workspace todo.
5. **Semana de uso, com este roteiro:**
   - Abrir o sistema depois de uns 20 minutos parado e anotar a espera (esperado: cerca de 1 minuto).
   - Lançar uma despesa com PDF e abrir o anexo.
   - Enviar uma imagem de produto (a conversão roda com 0,1 CPU) e ver na vitrine.
   - Abrir as telas de Licitações (painel, contratos a vencer, página do CNPJ), que leem o armazém no R2 com DuckDB.
   - Anotar qualquer erro, tempo esgotado ou tela lenta demais.
6. **Voltar ao pago, se a espera ou alguma tela atrapalhar:** Compute > Edit > Starter. Não precisa de disco.

## Regras de negócio identificadas

- Nenhuma regra de negócio muda. As regras de anexos (tipos, tamanhos, link curto, pendentes de 24 h, exclusão que apaga o R2) seguem as do plano mestre.
- `orphans`: só apaga arquivo de `anexos/` que continue sem linha numa segunda conferência, feita depois da pausa; nunca apaga linha. Linha sem arquivo só é reportada.
- Quem usa um plano Free precisa esperar o servidor acordar (cerca de 1 minuto) depois de 15 minutos sem uso.

## Regras multi-tenant e segurança

- O projeto não é multi-tenant; o isolamento é por `usuario_id` e `conta_id`. Nenhuma rota muda.
- `orphans` é uma ferramenta de operação (script), não uma API. Mantém as travas atuais: banco e pasta do R2 do mesmo ambiente, `--confirmo` fora do banco local e `DOTENV_CONFIG_PATH` obrigatório (o script nunca usa o `.env` de produção por padrão).
- Sem a trava de abas antigas, um pedido com arquivos em base64 no lançamento é aceito e os arquivos são ignorados (decisão 1).
- O texto do `AGENT.md` não contém segredo nem dado de produção.
- As ações no painel do Render são manuais e do usuário; nada disso é feito pelo código.

## Validações necessárias

- O script continua recusando flag desconhecida (`assertKnownFlags`). Um comando removido cai no texto de uso.
- `orphans --apagar` continua exigindo `--confirmo` fora do banco local e confere o ambiente antes.
- O comando `orphans` mantém a mesma saída e o mesmo código de saída de antes (0 quando não há nada fora do lugar).

## Testes necessários

### Frontend

- Nenhum teste novo (não há mudança). Os existentes continuam passando.

### Backend

- **Saem:** os testes unitários de `attachmentLegacy.test.ts`, os testes de banco de `attachmentLegacyMigration.db.test.ts` e o teste da trava em `attachmentModel.test.ts`.
- **Entra:** o teste de banco de `findAttachmentOrphans` em Drizzle (arquivo sem linha, linha sem arquivo e arquivo com linha), em `attachmentService.db.test.ts`.
- Os testes de entrada de lançamentos (`expenseInput`, `incomeInput`, `fixedExpenseInput`) continuam passando; nenhum deles testa a trava.
- Os testes de banco de anexos rodam no schema temporário, com o "sim" do usuário no momento, como nas etapas anteriores.

### E2E

- Não há suíte E2E. Verificações manuais: o script recusa os comandos removidos; `orphans` roda no banco local (schema temporário) e na produção, só leitura, com o "sim" do usuário, e deve dar 0 e 0; a semana de uso no Render é do usuário.

## Comandos de validação sugeridos

Um de cada vez, por causa da memória do computador:

```bash
npm --prefix backend run build
npm --prefix backend test
# teste de banco de anexos, no schema temporário (com o "sim" do usuário):
FINANCE_DB_TESTS=1 DOTENV_CONFIG_PATH=../.env.dev DB_SCHEMA=attachments_scratch npx tsx --test src/services/attachmentService.db.test.ts
npx vite build
npm test
```

O script também precisa de checagem de tipos com a configuração temporária (fora do repositório), porque o `tsc` do projeto só cobre `src/`.

## Riscos e pontos de atenção

1. **O painel pode não oferecer o Free para o serviço atual** (a documentação não confirma). Se o disco já tiver sido apagado, nada quebra: o serviço segue como Starter, sem disco. O plano muda de desenho só nesse caso.
2. **Apagar o disco é irreversível.** O risco é baixo: só havia imagens de teste e nenhum anexo de contrato, e o código no ar não lê mais o disco.
3. **Plano Free:** 0,1 CPU (o Starter tem 0,5) e a mesma RAM de 512 MB. Login, conversão de imagem e leitura do armazém de contratos ficam mais lentos. O cache temporário do armazém de contratos some a cada vez que o serviço dorme, então a primeira abertura de Licitações depois de acordar pode demorar mais.
4. **Webhooks de pagamento** (Mercado Pago e PayPal) podem chegar com o serviço dormindo e estourar o tempo de quem envia; eles tentam de novo depois. Não há clientes hoje. Antes de cobrar clientes, voltar a um plano pago.
5. **Horas gratuitas:** as 750 horas valem para o workspace. Se o `escalacao-futebol-1` não for suspenso e os dois serviços ficarem acordados o mês todo, passa do limite e a Render suspende os serviços Free até o mês seguinte.
6. **Tráfego de saída incomum** pode levar a Render a suspender um serviço Free. Os envios ao R2 são pequenos.
7. **Trava de abas antigas removida:** um anexo enviado por aba ou app com a versão antiga do site se perde sem aviso (decisão 1).
8. **Sem a ferramenta de cópia não há como reprocessar.** O único registro do base64 original é o backup do JSON no R2, e não existe comando de restauração.
9. **`orphans` em Drizzle:** risco baixo, coberto por teste de banco e conferido em leitura na produção.
10. **Limpezas em memória** (`setInterval`) e limites de taxa em memória zeram quando o serviço dorme. É aceitável.

## Perguntas em aberto

1. Por quanto tempo manter os 4 arquivos de backup do JSON no R2? O padrão proposto é manter até o usuário pedir para apagar; o custo é desprezível.
2. Se o painel recusar o Free, planejar o serviço novo (URL e CORS) só se isso acontecer.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- A busca no código dos termos do inventário dá zero (fora do cabeçalho da 0095 e dos `.plans`).
- O script `attachments.ts` só tem `check-r2`, `sweep` e `orphans`; um comando removido cai no texto de uso; `orphans` dá 0 e 0 na produção, em leitura.
- Build do backend, testes do backend e o teste de banco dos órfãos passam; `npx vite build` e `npm test` continuam passando.
- O `AGENT.md` tem a seção "Arquivos Persistentes".
- As pastas locais vazias de `backend/uploads` foram removidas.
- O usuário executou as ações do painel e usou o sistema por cerca de uma semana, e o resultado (ficar no Free ou voltar ao pago) foi registrado na memória do projeto.

## Observações para a skill implementar

- Usar este plano como fonte principal. Uma branch só: `refactor/R/render-sem-disco`.
- Não é necessária nenhuma migration. Não executar migrations. Não alterar `.env`. Não editar a migration 0095.
- Pedir o "sim" explícito do usuário para: criar o schema temporário no banco local, apagá-lo no fim, e rodar o `orphans` na produção (só leitura). Conferir ao final que não sobrou usuário de teste (`@example.test`) no banco local.
- Seguir o `AGENT.md`: identificadores em inglês, Drizzle nas consultas novas, sem `catch` silencioso.
- Manter as alterações pequenas e focadas. Build e testes um de cada vez.
- Não commitar `.portal/`, `CLAUDE.md` nem `GLOSSARIO.md`.
- As ações do painel do Render são do usuário e não podem ser feitas daqui; orientar quando ele pedir.
- Ao terminar, atualizar o registro do plano mestre e a memória (`estado_projeto.md`), e só então `/finalizar`.

## Registro de andamento

### Limpeza e regra do AGENT.md: implementadas em 04/11/2026 (branch `refactor/R/render-sem-disco`)

Entregue, como no plano:

- `backend/scripts/attachments.ts` ficou só com `check-r2`, `sweep` e `orphans`; o texto de uso e o cabeçalho foram atualizados. `migrate-entries` e `verify-entries` agora caem no texto de uso.
- Apagados `attachmentLegacy.ts`, `attachmentLegacy.test.ts`, `attachmentLegacyMigration.ts` e `attachmentLegacyMigration.db.test.ts`.
- `findAttachmentOrphans` foi para `attachmentOrphans.ts`, em Drizzle (`findAttachmentOrphans(storage, executor = db)`, com `orderBy`), e o script o importa depois do `dotenv`, como o `sweep`. `withDatabaseAndStorage` foi embora (ficou com um uso só).
- `withEntryAttachments` sem o filtro do `anexos` antigo.
- `rejectLegacyAttachments` removida (função, teste e as duas chamadas), conforme a decisão 1.
- `AGENT.md` com a seção "Arquivos Persistentes".
- Pastas locais vazias `backend/uploads/*` removidas (conferidas vazias antes).

Verificado: inventário por busca no código zerado (fora do cabeçalho da 0095 e dos `.plans`; no `AGENT.md` só o exemplo `uploads/` da regra nova); build do backend e dos tipos do script (com `--noUnusedLocals`); 1047 testes do backend, 0 falhas (saíram 6 testes do módulo legado); `npx vite build` e 514 testes do frontend; 11 de 11 testes de banco de anexos no schema temporário (os 10 que existiam e o novo dos órfãos), com o schema apagado e nenhum usuário de teste restante; `orphans` contra o schema temporário e o R2 `local/`: 0 e 0. O script recusa os comandos removidos e flags desconhecidas. **Não rodado, por escolha do usuário:** `orphans` na produção (leitura). O resultado de antes da limpeza (04/11, 0 e 0) é o último conferido lá.

Aberto, sem decisão do usuário: a exclusão de usuário pelo admin (`DELETE /api/users/:id`) só vale para quem não tem lançamentos, mas apaga em cascata contratos e produtos, e os arquivos deles ficam no R2 até `orphans --apagar`. Não entrou nesta limpeza.

### Etapa D no painel do Render (ações do usuário)

- Concluídas em 04/11/2026: disco apagado, `escalacao-futebol` e `escalacao-futebol-1` suspensos e plano do backend trocado de Starter para Free (Events: "Compute plan changed from Starter to Free" às 02:47, deploy do commit `4fac64d` live).
- A semana de uso começou em 04/11/2026; a decisão de ficar no Free ou voltar ao Starter é por volta de 11/11. O ping em horário comercial foi discutido, mas nada foi criado.
