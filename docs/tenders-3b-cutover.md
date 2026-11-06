# Etapa 3B — troca de identidade e banco de Licitações

Plano aprovado: `.plans/separar-etapa-3-identidade-e-banco.md`. Este roteiro prepara a troca; não autoriza executar passos na produção. A 3C só começa depois da conferência da 3B em uso.

## Resultado esperado

Licitações usa `fingerence_licitacoes`, com identidade própria em `public`, tabelas do produto em `licitacoes`, `TENDERS_DATABASE_URL` e `TENDERS_JWT_SECRET`. Não há cópia de usuários, contas, editais nem progresso do banco anterior. O cadastro cria uma empresa com teste de 15 dias; o primeiro administrador é criado pela CLI com uma conta em cortesia.

O site e os dois apps continuam no mesmo deploy nesta etapa. Sessões usam `finance.*` e `tenders.*`; todos fazem novo login uma vez. A separação dos serviços é a etapa 4.

## Preparação local

Rodar um comando por vez. Os testes de banco exigem os destinos locais conhecidos no `.env.dev`; nenhum comando abaixo aplica migrations.

```powershell
npm run typecheck
npm test
npm run build
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run test:tenders-db
npm --prefix backend run test:finance-db
npm --prefix backend run migrations:status -- --banco local
npm --prefix backend run migrations:status -- --banco local --projeto tenders
```

Os testes de Licitações usam `localhost:5433/fingerence_licitacoes_dev`, e Finanças usa `localhost:5433/sistema_financas_dev`. O primeiro banco já recebeu a baseline local com a autorização anterior. Não reaplicar nem editar `0001_baseline.sql`.

## Preparação antecipada e momento da pausa

Banco, papéis, extensões, baseline e primeiro administrador podem ser preparados enquanto o coletor antigo continua a carga, mediante a autorização específica de cada passo. O envio da branch também independe da conclusão da carga. O usuário pode deixar a carga atual continuar até a janela escolhida.

A pausa é necessária na troca das conexões e antes de iniciar um novo escritor no mesmo armazém R2. API 3B lendo o R2 e coletor antigo publicando nele podem coexistir, mas os editais, o progresso e as notificações continuariam no banco antigo. A API nova não receberia essas atualizações. A troca coordenada evita esse intervalo; concluir a carga antiga não dispensa a recarga do progresso no banco novo, que começa do zero conforme a decisão aprovada.

Preparar o `.env` local do runner não altera o serviço ativo na Render. A versão 3A já usa `TENDERS_DATABASE_URL` quando definida; portanto, não ativar essa variável antecipadamente no serviço. Ativar as variáveis da Render na janela da troca, com banco e admin prontos, junto da publicação da versão 3B. Se um Export foi feito durante a preparação e a carga continuou, fazer um Export atualizado após a pausa na janela da troca.

## Dia da troca

Cada passo que grava exige o “sim” explícito do usuário. O painel e as variáveis da Render são alterados pelo usuário. Não fazer merge antes da preparação do banco e das variáveis.

1. **Pausar os escritores antigos.** O usuário pausa o coletor da máquina de 24 h e qualquer rotina agendada que escreva no banco ou no manifesto do R2. Confirmar que a execução em andamento terminou. A trava de coleta é por banco: dois coletores em bancos diferentes não se bloqueiam.
2. **Guardar os pontos de retorno.** Fazer Export manual do banco na Render; registrar o commit/deploy anterior, o nome do banco antigo e, sem credenciais, a revisão e os totais do manifesto atual do armazém. Não apagar nenhum dado antigo.
3. **Criar o banco próprio.** O usuário cria `fingerence_licitacoes` e o papel `licitacoes_app`, com o banco a partir de `template0`, collation `en_US.UTF8` e extensões `pg_trgm` e `unaccent`. Conferir permissões de criação/owner antes da baseline. O papel do coletor precisa das permissões descritas no README de Licitações, agora no banco novo.
4. **Preparar os valores do ambiente.** Preparar `TENDERS_DATABASE_URL` e um `TENDERS_JWT_SECRET` próprio (ao menos 32 caracteres, diferente do segredo de Finanças) para o runner local. Cada edição de `.env`/`.env.dev` exige confirmação separada com os nomes que serão alterados; nunca imprimir valores. A configuração de desenvolvimento existente não precisa ser alterada. O usuário ativa as variáveis do serviço Render somente na janela coordenada da etapa 7, pois a versão antiga já reconhece a URL nova.
5. **Conferir e aplicar a baseline.** Só depois do “sim” para acesso à produção, executar o status. Após conferir o destino e receber o “sim” para gravar, aplicar somente `0001` e conferir novamente:

   ```powershell
   npm --prefix backend run migrations:status -- --banco producao --projeto tenders
   npm --prefix backend run migrations:aplicar -- 0001 --banco producao --projeto tenders --confirmo
   npm --prefix backend run migrations:status -- --banco producao --projeto tenders
   ```

   Conferir tabelas de identidade, tabela de recuperação, 15 tabelas do schema `licitacoes`, 9 funções e chaves estrangeiras. Antes do primeiro admin/coletor, todas as tabelas de negócio devem estar vazias. Apenas o registro da baseline estará preenchido.
6. **Criar o administrador.** Definir com o usuário e-mail, CNPJ e razão social. Com o “sim” para a criação e o ambiente de produção explicitamente carregado, usar `tenders:create-admin`. O comando não carrega `.env` automaticamente; mostra destino e pede `sim`. A senha é digitada pelo usuário no terminal, sem eco; não passá-la em argumento, arquivo ou conversa. Exemplo local de uso (não é o comando da produção):

   ```powershell
   npm --prefix backend run tenders:create-admin:dev -- --email admin@empresa.example --cnpj 11222333000181 --razao-social "Empresa exemplo"
   ```

7. **Finalizar a entrega e publicar.** Invocar `/finalizar`. Rever somente os arquivos da 3B; `.portal/`, `GLOSSARIO.md`, arquivos de ambiente e artefatos temporários ficam fora. Com o banco/admin prontos e o coletor antigo pausado, o usuário ativa as variáveis na Render imediatamente antes da publicação, salvando sem antecipar o deploy quando o painel permitir. Se a alteração provocar reinício imediato da versão antiga, considerar esse período parte da janela de implantação. O merge em `main` exige confirmação explícita e dispara o deploy do site e backend. Confirmar os dois serviços como concluídos na Render; durante a implantação, versões diferentes podem coexistir por alguns minutos.
8. **Atualizar e religar o coletor.** O usuário atualiza o código/script na máquina de 24 h para a versão da 3B e aponta `TENDERS_COLLECTOR_DATABASE_URL` para o banco novo. Preservar bucket e `TENDERS_STORAGE_PREFIX`. Garantir que nenhuma instância antiga está ativa antes de religar. O progresso recomeça do zero; contratos retomam desde 2021 conforme as configurações aprovadas. Não copiar tabelas de progresso.
9. **Conferir os fluxos de fora.** Executar a lista abaixo. Registrar o commit, o deploy e o resultado. Só considerar a troca concluída após essa conferência.

## Conferência após o deploy

- Abrir o login de cada solução; Licitações oferece cadastro somente com CNPJ e cria teste de 15 dias.
- Entrar nos dois produtos no mesmo navegador. Sair de um preserva o outro; um token de um produto é recusado no outro.
- Finanças: login, seleção de conta, assistente instalado e logout. O novo login único é esperado pela troca das chaves.
- Licitações: login por documento/e-mail, Google em usuário já cadastrado, bloqueio de usuário, recuperação com envio real do EmailJS e redefinição da senha. Conferir marca e assunto do template (`sistema_nome` e `assunto`).
- Primeiro admin: entrar e abrir Contas habilitadas, equipe e cortesia.
- Editais: buscar, abrir detalhe, salvar busca e favoritar. A base começa vazia até a coleta avançar.
- Pagamento: conferir a chave pública por `/api/tenders/billing/config`; validar Pix/cartão/retorno e webhook com autorização antes de gerar cobrança real.
- Contratos: aguardar o aquecimento da cópia local e conferir resultados, detalhes e totais do manifesto; depois da primeira nova publicação, conferir nova revisão, dados anteriores e dados atualizados.
- Coletor: confirmar gravação somente no banco novo, execução sem erro e progresso novo. Contas de cortesia antigas não devem aparecer.

## Preservação do armazém R2

Os writers de contratos e vencedores abrem o manifesto atual, combinam os arquivos existentes com as mudanças e publicam o manifesto por último. Um banco vazio não exige esvaziar o armazém. A recarga não substitui todo o histórico por uma carga parcial; contratos intocados e os conjuntos do outro writer são preservados.

Cada instância de writer acrescenta UUID à revisão da publicação. Assim, IDs de execução reiniciados no banco novo não colidem com arquivos ainda referenciados. O leitor continua aceitando manifestos antigos e troca de versão após preparar a nova cópia. Se houver falha de atualização, conserva a versão em uso. Depois do deploy, existe o período normal de primeiro download em que contratos respondem `CONTRACT_STORE_UPDATING`.

Não limpar bucket, manifesto, arquivos nem prefixo durante a troca. Não rodar os coletores de banco antigo e novo ao mesmo tempo: ambos publicariam no mesmo manifesto sem compartilhar a trava.

## Retorno ao estado anterior

Antes de qualquer rollback, pausar novamente coletores/rotinas para impedir dois escritores e registrar quais dados foram criados depois da troca. O banco antigo e o novo permanecem preservados durante a 3B.

Com autorização explícita, reverter o deploy pelo painel ou o merge via commit de reversão; o usuário restaura as variáveis anteriores e o coletor correspondente. Não apagar o banco novo nem o schema antigo como parte do retorno. Dados criados no banco novo não aparecem automaticamente no antigo; avaliar esse impacto antes de voltar. As sessões anteriores podem exigir novo login.

## Pendências para a troca

- Combinar a janela de implantação e definir e-mail/CNPJ/razão social do primeiro admin.
- Usuário confirmar Export, banco/papel/extensões e variáveis na Render.
- Validar o envio real e a marca no template EmailJS.
- Conferência visual dos apps, assistente e pagamento no ambiente adequado.
- Etapa 3C somente após a 3B conferida em uso, com dump e nova autorização para remover o schema antigo.

## Limpeza do banco antigo (3C)

A `0096_drop_legacy_tenders_schema.sql` remove somente o schema `licitacoes` de Finanças. As tabelas de identidade de Finanças, suas restrições de planos, o banco próprio de Licitações e o R2 são preservados. As migrations antigas ficam como histórico.

Antes da aplicação, guardar um `pg_dump --format=custom --schema=licitacoes --no-owner --no-privileges` do banco alvo. Conferir a leitura completa com `pg_restore --file NUL` (Windows) ou `/dev/null` e as 15 entradas `TABLE DATA` com `pg_restore --list`. Registrar em um JSON ignorado pelo Git: `database`, `schema: "licitacoes"`, `backupPath` absoluto, `backupSha256`, `archiveFullyReadable: true` e `tableDataEntries: 15`.

O runner exige esse registro por `--tenders-cleanup-proof`, confere o SHA-256 do arquivo disponível e acessa o banco próprio em modo somente leitura para conferir sua baseline. Em produção, exige também um registro de execução do coletor no banco novo. A migration recusa um coletor ativo no banco antigo, usuários em `sem_teste` ou chaves estrangeiras de outra área para as tabelas antigas. A aplicação e seu registro são uma transação só.

Com autorização para o banco local:

```powershell
npm --prefix backend run migrations:aplicar -- 0096 --banco local --projeto finance --tenders-cleanup-proof .plans/separar-etapa-3c-local-backup.json
```

Validar Finanças e Licitações localmente. Publicar o código da 3C antes de remover o schema em produção. Após conferir o deploy e receber autorização específica:

```powershell
npm --prefix backend run migrations:aplicar -- 0096 --banco producao --projeto finance --confirmo --tenders-cleanup-proof .plans/separar-etapa-3c-production-backup.json
```

Conferir a ausência do schema apenas em Finanças, o status dos dois projetos e as consultas dos dois produtos. Guardar o dump e seu registro; eles não entram no commit. Depois da 0096, uma reversão do código antigo também exige restaurar o schema pelo backup, sempre com autorização.
