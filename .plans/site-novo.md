# Plano de Implementação: Site da empresa e soluções (Parte 3, versão 2)

## Origem

- Arquivo de especificação: `.plans/proposta-empresa-produtos-site.md` (seção 6) e a conversa de 07/10/2026 com o Rodrigo
- Data do planejamento: `07/10/2026` (versão 1: 06/10/2026, substituída por esta)
- Classificação: `fullstack` (site, mais um ajuste nos sistemas FINGERENCE e Licitações), sem migration

## Resumo

A versão 1 deste plano (implementada na branch `feat/R/site-novo`, sem commit) misturava a empresa com o sistema de finanças e tratava as soluções como "módulos" de um mesmo login. Esta versão separa bem as coisas:
- **Site da empresa:** Início · Produtos · Sobre · Contato.
  - a **Início** fala da empresa ("Soluções de tecnologia para decidir com clareza"), com um vídeo novo e mais impactante;
  - **Produtos** mostra dois cards inteiros clicáveis;
  - **cada solução** tem a sua página, com descrição, telas, planos e perguntas.
- **Botões:** "Entrar" e "Começar grátis" só nas páginas das soluções.
- **Texto:** comercial, sem "módulo", sem "produto" (só no menu), sem "mesmo login", e sem PNCP fora dos termos.
- **Sistemas:** sem ponte entre eles.
  - o cadastro de Licitações não abre o teste do FINGERENCE nem dispara o e-mail dele;
  - o teste do FINGERENCE começa quando a pessoa clica em "Começar meu teste";
  - nenhum sistema mostra atalho para o outro.

## Decisões

**Versão 2 (07/10/2026):**
1. **Frase da Início:** "Soluções de tecnologia para decidir com clareza."
2. **Páginas da empresa** (Início, Produtos, Sobre, Contato, Termos e Privacidade): um "Acessar ▾" discreto no menu, para quem já é cliente:
   - FINGERENCE Finanças abre o login;
   - FINGERENCE Licitações abre `/licitacoes/app`.
3. **Endereços das soluções:** `/produtos/financas` e `/produtos/licitacoes`. `/licitacoes` continua sendo só do sistema, como está na produção.
4. **PNCP:** só nos Termos de Uso e na Privacidade.
5. **Separação no site e nos sistemas:**
   - mesma base de usuários por baixo, sem migration;
   - status `sem_teste` para quem se cadastra por Licitações;
   - o teste do FINGERENCE começa no clique em "Começar meu teste";
   - sem atalhos entre os sistemas.
6. **Vídeo:** só na Início, trocado por um mais impactante. O Rodrigo escolhe entre 2 ou 3 candidatos.

**Combinado na conversa, antes do planejamento:**
- **Menu:** "Produtos" substitui "Módulos".
- **Vocabulário:** no texto não aparece "módulo" nem "produto". Usa-se o nome de cada solução e "soluções".
- **Planos:** ficam dentro de cada solução, e a página Planos sai.
- **Início:** só a empresa, com uma faixa levando a Produtos.
- **Demonstração de Finanças:** imagens do sistema na página e "Experimentar a demonstração" abrindo em outra aba.
- **Nomes:** seguem provisórios (versão 1, decisão 1). Empresa FINGERENCE, soluções "FINGERENCE Finanças" e "FINGERENCE Licitações".

**Da versão 1, continuam valendo:**
- termos e privacidade com texto novo para as duas soluções (decisão 4), agora sem "módulo" e sem "mesmo login";
- as regras de mídia;
- o `publicPages.json` único para SEO e build;
- um aviso de cookies só;
- avaliações tipadas.

## Escopo

### Dentro do escopo

**Site**
1. **Rotas:**
   - páginas: `/`, `/produtos/`, `/produtos/financas/`, `/produtos/licitacoes/`, `/sobre/`, `/contato/`, `/termos/` e `/privacidade/`;
   - no app, `/funcionalidades/*` leva a `/produtos/financas/` e `/planos/*` leva a `/produtos/`;
   - `/index.html` continua abrindo a Início (volta do login com Google).
2. **`/licitacoes` volta a ser do sistema** (desfazer a versão 1):
   - `appAddressFor` e os testes dele voltam;
   - `src/tenders/main.tsx` volta a trocar `/licitacoes` por `/licitacoes/app`;
   - o `vite.config.ts` volta a reescrever `/licitacoes` e `/licitacoes/*` para `tenders.html`;
   - a reescrita na Render não muda.
3. **Cabeçalho:**
   - Início · Produtos · Sobre · Contato, com "Produtos" marcado também nas páginas das soluções;
   - nas páginas da empresa, "Acessar ▾" (decisão 2), sem "Começar grátis";
   - nas soluções, "Entrar" e "Começar grátis" daquela solução;
   - o menu do celular segue a mesma regra;
   - saem o `ModuleChooser` e o `chooseModule`.
4. **Início:**
   - topo em tela cheia, com o vídeo ao fundo e a frase da decisão 1 em branco sobre um degradê escuro;
   - botão de pausar o vídeo;
   - no celular e com "reduzir movimento", a imagem de capa;
   - botões "Conheça nossas soluções" (`/produtos/`) e "Fale com a gente" (`/contato/`);
   - seções: no que acreditamos, como trabalhamos (15 dias grátis, preço justo, atendimento direto) e a faixa que leva a Produtos;
   - avaliações e chamada final.
5. **Produtos:**
   - abertura e os dois cards;
   - cada card é um link só, inteiro clicável, com efeito ao passar o mouse e "Ver detalhes →";
   - sem botões dentro, para funcionar pelo teclado.
6. **FINGERENCE Finanças (`/produtos/financas/`):**
   - topo com uma tela do sistema e "Começar grátis";
   - benefícios e a galeria de telas (painel, lançamentos e relatórios);
   - "Experimentar a demonstração", que abre `/demo.html` em outra aba;
   - Starter × Premium com o comparativo, perguntas e chamada final.
7. **FINGERENCE Licitações (`/produtos/licitacoes/`):**
   - topo com a prévia de telas que já existe (`TendersPreview`, dados fictícios);
   - benefícios, como funciona, preço e chamada final;
   - perguntas sem a fonte dos dados e sem "mesmo login".
8. **Sobre e Contato:** da empresa. O formulário de contato continua abrindo o e-mail.
9. **Termos e privacidade (`legalContent.ts`):**
   - "módulos Finanças e Licitações" vira "as soluções FINGERENCE Finanças e FINGERENCE Licitações";
   - sai "O mesmo login dá acesso aos dois";
   - o PNCP fica (decisão 4).
10. **Texto comercial:**
    - benefício antes de recurso e chamada de ação clara;
    - palavras proibidas no texto do site: "módulo", "produto" (só no menu), "mesmo login", "PNCP" (fora dos termos), "titular", "conta habilitada", "cortesia" e "assinatura recorrente" (vira "pagamento automático no cartão").
11. **Mídia:**
    - **vídeo novo** (decisão 6): 2 ou 3 candidatos de bancos com uso comercial liberado (Pexels, Unsplash, Pixabay), mostrados ao Rodrigo pela imagem de capa;
      - linha: impacto e movimento (cidade vista de cima ao entardecer, rastros de luz no trânsito à noite, ou algo abstrato de tecnologia nos tons da marca);
      - sem marcas, sem pessoa recomendando e sem tela de outro sistema;
      - até uns 4 MB e capa em webp;
    - **capturas de Finanças:** tiradas da demonstração com o Chrome em modo headless (que o projeto já usou para conferir o site). O `demoMain.tsx` passa a aceitar `?secao=painel|movimentacoes|relatorios` para abrir em cada tela;
    - `CREDITS.md` atualizado;
    - saem os arquivos que deixarem de ser usados (vídeo e capa atuais, `finance-section.webp` e `tenders-section.webp`, se não entrarem em outra página).
12. **Nomes no código:** `SiteModule` → `SiteSolution`, `MODULE_NAMES` → `SOLUTION_NAMES`, `pageOfModule` → `pageOfSolution`, o campo `module` do JSON vira `solution`.
13. **Saem:** `ModuleChooser.tsx`, `PlansPage.tsx`, `demo-app/HomeInteractiveDemo.tsx` e o que mais ficar sem uso (regra do redesign: sem sobras).

**Sistemas (decisão 5)**
14. **Backend:**
    - `PLAN_STATUS.notStarted = 'sem_teste'`:
      - o `normalizePlanStatus` passa a reconhecer `sem_teste` (hoje, valor desconhecido vira `trial`);
      - o `getEffectivePlanAccess` devolve `sem_teste` sem acesso;
      - o `isPlanAccessActive` continua falso para ele;
    - **fim do teste:** quando o teste começa depois do cadastro, termina na `plano_expiracao`. Sem ela, segue o cálculo de hoje (data do cadastro + 15 dias);
    - **cadastro** (`routes/auth.ts`): com `modulo: 'licitacoes'`, o usuário nasce com `plano_status = 'sem_teste'`;
    - **`POST /api/planos/start-trial`** (`authenticate`, `requireNotAccountMember`):
      - só em `sem_teste`; passa para `trial`, com `plano_inicio` = agora e `plano_expiracao` = agora + 15 dias;
      - qualquer outro status dá 409;
    - **`requireActivePlan`:** para `sem_teste`, 403 com código e mensagem próprios (`PLAN_TRIAL_NOT_STARTED`);
    - **rotina diária** (`processPlanLifecycle`): conferir que só pega `trial` e `ativo` (já pega) e que o vencimento do teste usa a mesma regra da `plano_expiracao`. Assim, `sem_teste` não recebe o e-mail de "acesso suspenso";
    - o tipo de `users.planStatus` passa a aceitar `sem_teste`.
15. **FINGERENCE (front):**
    - `PlanoStatus.status` passa a aceitar `sem_teste`;
    - `planGateReason` ganha o motivo `notStarted`;
    - o `PlanExpiredGate` mostra ao titular "Comece seu teste grátis de 15 dias", com botão que chama o `start-trial` e confere o plano de novo. O membro vê um aviso;
    - saem o atalho "Licitações" do `AppShell` (com a consulta `tendersAccess`) e o "Ir para Licitações" do `PlanExpiredGate`. Ficando sem uso, saem `src/services/tendersService.ts` e `queryKeys.tendersAccess`;
    - sem sessão (`App.tsx`) e ao sair (`AccountMenu.tsx`), a pessoa vai para `/produtos/financas/?entrar=1`. A moldura do site abre o login de Finanças, gravando a origem `app`.
16. **Licitações (front):**
    - `GateScreens.tsx`: sai "Ir para o FINGERENCE" e fica "Sair";
    - `TendersSidebar.tsx`: sai o link "FINGERENCE" do rodapé;
    - `TendersUserMenu.tsx`: sai "Controle financeiro" e a regra `showFinanceLink`.
17. **Documentação:**
    - README do módulo de Licitações: endereços como na produção e caminhos até o sistema sem os atalhos do FINGERENCE, com a página `/produtos/licitacoes/`;
    - nota no `.plans/licitacoes-produto.md`: as decisões 4 (teste do FINGERENCE no cadastro por Licitações) e 14 ("Ir para Licitações") foram trocadas por esta decisão 5;
    - situação da Parte 3 na proposta.

### Fora do escopo

- Contas totalmente separadas por solução.
- Nome definitivo da empresa e das soluções, domínio e INPI (Parte 4).
- Demonstração interativa de Licitações.
- Vídeo nas páginas das soluções.
- Vitrines (`/loja/*`, `/catalogo/*`).
- Aviso aos usuários atuais sobre os termos novos (tarefa do Rodrigo, fora do código).
- Mudar o texto do aviso de cookies (observação da versão 1).

## Leitura de contexto

- `/AGENT.md`: lido.
- `/frontend/AGENT.md`: não existe no projeto.
- `/backend/AGENT.md`: não existe no projeto.
- `CLAUDE.md`, memória do projeto, `.plans/proposta-empresa-produtos-site.md`, `.plans/licitacoes-produto.md` e a versão 1 deste plano.
- **Código lido:**
  - `backend/src/services/plan-access.ts` (status, `normalizePlanStatus`, teste contado de `createdAt`, `TRIAL_DURATION_DAYS`);
  - `backend/src/services/plan-lifecycle.ts` (rotina diária com candidatos `trial` e `ativo`; e-mail "Seu acesso foi suspenso");
  - `backend/src/db/schema/users.ts` (`plano_status` varchar(20), padrão `trial`, sem CHECK no banco; `plano_inicio`, `plano_expiracao`);
  - `backend/src/routes/auth.ts` (cadastro com `modulo`; o único e-mail do cadastro é o de recuperação de senha);
  - `backend/src/middleware/auth.ts` (`requireActivePlan` com 403 `PLAN_EXPIRED`);
  - `src/App.tsx` (sem sessão vai para `/index.html`), `src/layout/AccountMenu.tsx` (sair vai para `/index.html`), `src/layout/AppShell.tsx` (atalho "Licitações");
  - `src/components/auth/PlanExpiredGate.tsx`, `src/utils/planFeatures.ts`, `src/services/planosService.ts`;
  - `src/tenders/screens/GateScreens.tsx`, `layout/TendersSidebar.tsx`, `layout/TendersUserMenu.tsx`, `utils/modulePaths.ts`, `main.tsx`;
  - `src/demoMain.tsx`, `src/services/demo/*` (cerca de 520 linhas e 40 desvios no app; o demo baixa ~408 KB comprimidos);
  - o site da versão 1 em `src/screens/public/`.

## Impacto por área

### Frontend

**Site:**
- **Páginas:** `HomePage` (empresa), `ProductsPage` (nova), `FinancePage` e `TendersPage` (em `/produtos/...`, com planos), `AboutPage`, `ContactPage`, `LegalPage`.
- **Moldura:**
  - `PublicLayout`: as ações `enter` e `startFree` por solução, o "Acessar ▾" e a abertura do login com `?entrar=1` em Finanças;
  - `SiteHeader`, `SiteFooter`, `LoginModal`.
- **Peças:**
  - `HeroVideo` vira o topo em tela cheia;
  - `ModuleCards` vira o card-link (nome novo, por exemplo `SolutionCards`);
  - uma galeria de telas de Finanças (nova);
  - `PriceTables`, `FaqSection`, `CallToAction`, `PageIntro`, `FeatureGrid`, `StepsSection` e `TendersPreview` são reaproveitadas.
- **Estados:**
  - avaliações: sem dados ou com erro, a seção some;
  - vídeo indisponível: fica a capa;
  - o "Acessar ▾" fecha com Esc e com clique fora, como o painel atual de "Módulos".
- **Acessibilidade:**
  - card-link com nome acessível;
  - foco visível e menu pelo teclado;
  - vídeo com botão de pausar;
  - contraste do texto branco sobre o vídeo garantido pelo degradê.

**FINGERENCE:** `planosService`, `planFeatures` e seu teste, `PlanExpiredGate`, `App.tsx`, `AccountMenu`, `AppShell`, e a remoção de `tendersService` e da chave `tendersAccess`.

**Licitações:** `GateScreens`, `TendersSidebar`, `TendersUserMenu`; `modulePaths` e `main.tsx` voltam ao que eram.

**Testes:** `publicPages`, `legalText` (palavras proibidas), `planFeatures` (motivo `notStarted`) e `tendersUtils` (`appAddressFor` de volta).

### Backend

- **`plan-access.ts`:** status `sem_teste`, normalização e fim do teste pela `plano_expiracao`.
- **`plan-lifecycle.ts`:** conferir candidatos e vencimento com a regra nova.
- **`routes/auth.ts`:** cadastro por Licitações nasce `sem_teste`.
- **`routes/plans.ts`:** `POST /start-trial` (titular, só em `sem_teste`, 409 nos demais).
- **`middleware/auth.ts`:** 403 `PLAN_TRIAL_NOT_STARTED` para `sem_teste`.
- **`db/schema/users.ts`:** tipo do `planStatus`.
- **Testes:** unitários de `plan-access` (status e fim do teste) e do `start-trial` onde houver padrão de teste de rota.
- **Permissões:** o `start-trial` só vale para o próprio usuário (titular). Membro não começa teste, porque o plano dele é o do titular.

### Banco de dados

Sem migration:
- `sem_teste` cabe no `varchar(20)` de `plano_status`, que não tem CHECK;
- o teste que começa depois usa as colunas que já existem (`plano_inicio` e `plano_expiracao`).

**Conferência antes do deploy (só leitura, com a confirmação do Rodrigo na produção):** se há usuário com `plano_status = 'trial'` e `plano_expiracao` preenchida. Com a regra nova, o teste dele terminaria nessa data.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- **Render:** a reescrita de `/licitacoes` e `/licitacoes/*` para `/tenders.html` **não muda**. Recomendado (opcional), para o Google: 301 de `/funcionalidades` e `/funcionalidades/*` para `/produtos/financas/`, e de `/planos` e `/planos/*` para `/produtos/`.
- **Build:** o gerador cria `dist/produtos/index.html`, `dist/produtos/financas/index.html` e `dist/produtos/licitacoes/index.html`, e deixa de criar `financas`, `licitacoes` e `planos`.
- **Ordem:** a branch leva a Parte 2. A 0080 tem que estar na produção antes do merge.
- Sem variável de ambiente nova.

## Arquivos provavelmente afetados

- **Site:**
  - `src/brand.ts`, `src/screens/public/publicPages.json`, `src/utils/publicPages.ts` e o teste;
  - `src/App.tsx`;
  - páginas em `src/screens/public/`: `HomePage`, `ProductsPage` (nova), `FinancePage`, `TendersPage`, `AboutPage`, `ContactPage`, `LegalPage`, `legalContent.ts`;
  - peças em `src/screens/public/components/`: `PublicLayout`, `publicSiteContext`, `SiteHeader`, `SiteFooter`, `LoginModal`, `HeroVideo`, `ModuleCards` (renomeado), galeria de telas (nova), `siteMedia`, `siteStyles`, `PriceTables`;
  - `index.html`, `public/sitemap.xml`, `public/robots.txt`, `public/media/site/*` e `CREDITS.md`;
  - `src/utils/legalText.test.ts`.
- **Saem:**
  - `src/screens/public/PlansPage.tsx`, `components/ModuleChooser.tsx`, `components/demo-app/HomeInteractiveDemo.tsx`;
  - `src/services/tendersService.ts`;
  - a mídia sem uso.
- **FINGERENCE:**
  - `src/App.tsx`, `src/layout/AccountMenu.tsx`, `src/layout/AppShell.tsx`, `src/components/auth/PlanExpiredGate.tsx`;
  - `src/utils/planFeatures.ts` e o teste, `src/services/planosService.ts`, `src/services/queryKeys.ts`;
  - `src/demoMain.tsx`.
- **Licitações:** `src/tenders/screens/GateScreens.tsx`, `layout/TendersSidebar.tsx`, `layout/TendersUserMenu.tsx`, `utils/modulePaths.ts`, `utils/tendersUtils.test.ts`, `main.tsx`; `vite.config.ts`.
- **Backend:** `services/plan-access.ts` e o teste, `services/plan-lifecycle.ts`, `routes/auth.ts`, `routes/plans.ts`, `middleware/auth.ts`, `db/schema/users.ts`.
- **Documentação:** `backend/src/modules/tenders/README.md`, `.plans/licitacoes-produto.md`, `.plans/proposta-empresa-produtos-site.md`.

## Estratégia de implementação

1. **Branch:** continuar em `feat/R/site-novo`, que já leva a Parte 2.
2. **Desfazer a mudança de `/licitacoes`:** `appAddressFor` e testes, `main.tsx`, `vite.config.ts` e o texto do README de endereço e hospedagem.
3. **Backend, com os testes antes:**
   - `sem_teste` e fim do teste em `plan-access.ts`;
   - `requireActivePlan`;
   - `start-trial`;
   - cadastro por Licitações;
   - conferência da rotina diária.
4. **FINGERENCE:** `planosService`, `planFeatures` com o teste, `PlanExpiredGate` ("Começar meu teste"), remoção do atalho e do `tendersService`, redirecionamentos para `/produtos/financas/?entrar=1`.
5. **Licitações:** remover os atalhos para o FINGERENCE.
6. **Site:**
   - renomear "módulo" para "solução" no código e atualizar o `publicPages.json` com as rotas novas;
   - moldura e cabeçalho ("Acessar ▾", botões por solução, `?entrar=1`);
   - páginas (Início, Produtos, Finanças, Licitações, Sobre, Contato) com o texto comercial revisado;
   - remover `ModuleChooser`, `PlansPage` e `HomeInteractiveDemo`;
   - termos e privacidade;
   - SEO: `index.html`, `sitemap.xml` e `robots.txt` (`Disallow: /licitacoes`).
7. **Mídia:**
   - buscar 2 ou 3 vídeos, mostrar a capa de cada um ao Rodrigo e **esperar a escolha**;
   - capturas de Finanças pela demonstração (`?secao=`);
   - créditos e limpeza.
8. **Validar:**
   - `npx tsc --noEmit`, `npm test`, `npm --prefix backend run build`, `npm --prefix backend test` e `npm run build`;
   - conferir em `dist/` as páginas novas;
   - capturas no navegador (computador e 500 px).
9. **Documentar:** README do módulo, nota no plano da Parte 2 e situação na proposta.

## Regras de negócio identificadas

1. **A empresa e as soluções são coisas distintas.** O site não diz que o login é o mesmo, e os sistemas não se ligam.
2. **"Começar grátis"** cria a conta na solução da página:
   - em Finanças, o cadastro abre o teste do FINGERENCE como hoje;
   - em Licitações, abre o teste de Licitações e deixa o FINGERENCE em `sem_teste`.
3. **Teste do FINGERENCE para quem veio por Licitações:**
   - começa no clique em "Começar meu teste", dentro do FINGERENCE;
   - dura 15 dias e acontece uma vez só (`start-trial` só a partir de `sem_teste`);
   - quem fica em `sem_teste` não recebe o e-mail de "acesso suspenso".
4. **Preços exibidos** (iguais aos do backend):
   - FINGERENCE Finanças: Starter R$ 4,99 e Premium R$ 9,99 por mês;
   - FINGERENCE Licitações: R$ 4,99 por mês com 2 usuários e R$ 2,99 por usuário a mais;
   - 15 dias grátis, só mensal.
5. **O site não promete** aviso por e-mail ou WhatsApp, outras fontes nem IA para Licitações.
6. **Mídia:** só bancos com uso comercial liberado, sem marcas, sem pessoa recomendando e sem telas de outros sistemas, com créditos.

## Regras multi-tenant e segurança

- **Páginas públicas:** sem dados de conta. O "Acessar ▾" e o `?entrar=1` só abrem o login.
- **`start-trial`:**
  - age sobre o próprio usuário autenticado (`req.user`), nunca sobre um id vindo do corpo;
  - membro de conta recebe 403;
  - fora de `sem_teste`, 409, então não estende teste nem reinicia plano.
- **Trava do plano:** `sem_teste` continua sem acesso às rotas do FINGERENCE (403), e as rotas de Licitações não dependem desse plano (já não usam `requireActivePlan`).
- **Mensagens:** sem dados sensíveis.

## Validações necessárias

- **`POST /api/planos/start-trial`:** sem corpo. Status atual `sem_teste` dá 200; os demais, 409; membro, 403.
- **`?entrar=1`:** só abre o login em `/produtos/financas/`. Nas outras páginas, é ignorado.
- **Endereços:** barra no fim tratada igual; desconhecido abre a Início; `/funcionalidades/*` e `/planos/*` redirecionam.

## Testes necessários

### Frontend

- `publicPages`:
  - páginas e endereços (`/produtos/`, `/produtos/financas/`, `/produtos/licitacoes/`);
  - solução de cada página;
  - sem `/financas/`, `/licitacoes/` e `/planos/`.
- `legalText`: os textos legais sem "módulo" e sem "mesmo login", e com o PNCP.
- `planFeatures`: `sem_teste` dá o motivo `notStarted`.
- `tendersUtils`: os testes do `appAddressFor` voltam.

### Backend

- `plan-access`:
  - `sem_teste` sem acesso;
  - teste com `plano_expiracao` termina nela;
  - teste sem ela segue contando do cadastro.
- `start-trial`: só a partir de `sem_teste`, só o titular, e não repete.
- Cadastro com `modulo: 'licitacoes'` nasce `sem_teste`, onde houver teste de rota de cadastro.
- Rotina diária: `sem_teste` não entra nos candidatos, e o vencimento do teste adiado usa a `plano_expiracao`.

### E2E

Conferência manual no ambiente local:
- cadastro por `/produtos/licitacoes/` cai em `/licitacoes/app` com o teste de Licitações;
- ao abrir o FINGERENCE, aparece "Começar meu teste", e depois do clique há 15 dias;
- cadastro por `/produtos/financas/` cai em `/app.html` com o teste de sempre;
- "Acessar ▾" e os botões das soluções;
- cards clicáveis, inclusive pelo teclado;
- sair do FINGERENCE cai em `/produtos/financas/` com o login aberto;
- login com Google;
- `/licitacoes` abre o sistema;
- Licitações sem links para o FINGERENCE e o FINGERENCE sem atalho para Licitações;
- celular (menu e vídeo trocado pela imagem).

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npm run build
npm --prefix backend run build
npm --prefix backend test
npx vite preview
```

## Riscos e pontos de atenção

- **Trava de acesso do FINGERENCE:** a mudança no status do plano pede testes e conferência manual dos quatro casos: teste normal, `sem_teste`, teste iniciado e vencido.
- **Dado antigo:** usuário em teste com `plano_expiracao` preenchida (ver Banco de dados). Conferir antes do deploy.
- **Ordem do deploy:** 0080 na produção, merge da branch (Partes 2 e 3) e, se o Rodrigo quiser, os 301 na Render.
- **Google:** a troca de endereços e títulos pode fazer a posição oscilar por um tempo.
- **Volta do login com Google:** continua passando por `/index.html`. O login abre sem gravar a origem, como na versão 1.
- **Capturas e vídeo:** as capturas precisam ser refeitas quando a tela mudar. O vídeo pesa até ~4 MB e não é carregado no celular.
- **Termos:** o aviso de 15 dias aos usuários atuais e a revisão jurídica seguem com o Rodrigo.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

Durante a implementação, a escolha do vídeo entre os candidatos é do Rodrigo (decisão 6). Textos, telas e vídeo são revistos por ele na prévia antes do `/finalizar`.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- As páginas estiverem na estrutura nova (Início, Produtos, as duas soluções, Sobre, Contato, Termos e Privacidade), com os cards inteiros clicáveis.
- "Entrar" e "Começar grátis" aparecerem só nas soluções, e o "Acessar ▾" nas páginas da empresa.
- Não sobrar "módulo", "produto" (fora do menu), "mesmo login" nem PNCP fora dos termos no texto do site.
- O cadastro por Licitações não abrir o teste do FINGERENCE nem disparar o e-mail dele, e o FINGERENCE oferecer "Começar meu teste" a quem estiver em `sem_teste`.
- Nenhum sistema mostrar atalho para o outro.
- Sem sessão ou ao sair, o FINGERENCE levar para `/produtos/financas/` com o login aberto.
- `/licitacoes` seguir abrindo o sistema e `/produtos/licitacoes/` mostrar a página.
- Vídeo novo escolhido pelo Rodrigo, e capturas de Finanças no lugar da demonstração embutida.
- Nada sobrar do que saiu (código e mídia).
- `npx tsc --noEmit`, `npm test`, `npm run build`, `npm --prefix backend run build` e `npm --prefix backend test` passarem.

## Observações para a skill implementar

- Usar este plano como fonte principal. Ele substitui a versão 1.
- Seguir o `/AGENT.md`:
  - identificadores e nomes de arquivo em inglês, textos em português;
  - sem `any`;
  - sem `catch {}` silencioso.
- Sem migration. A conferência do dado antigo na produção é só leitura e com a confirmação do Rodrigo.
- Não mexer em `.env`.
- Na mídia, **parar e mostrar os candidatos de vídeo ao Rodrigo** antes de escolher.
- Apagar o que sai antes de montar o novo (regra do redesign).
- `.portal/` e `GLOSSARIO.md` nunca entram em commit.

## Ajustes feitos na implementação (07/10/2026)

- **Vídeo (decisão 6):** o Rodrigo escolheu a cidade à noite vista de cima ([Pexels 2675508](https://www.pexels.com/video/aerial-footage-of-the-road-system-in-a-city-at-night-2675508/), Mixkit), em 720p, 12,5 s e 3,2 MB. A capa é o primeiro quadro do vídeo (`hero-poster.webp`, 52 KB). Os outros candidatos foram um mar de nuvens ao nascer do sol (parecido com o vídeo antigo) e uma rede de tecnologia vermelha (fora das cores da marca); vídeos de cidade com 9 a 17 MB ficaram de fora pelo peso.
- **Telas de Finanças:** calendário, lançamentos e relatórios, tirados da demonstração. O painel ficou de fora, porque a demonstração não tem os dados dele.
- **Demonstração:** ganhou a escolha da tela inicial pela `?secao=` (`painel`, `movimentacoes` ou `relatorios`) e lançamentos fictícios mais variados (2 receitas e 10 despesas), para as capturas e para quem abre a demonstração.
- **`?entrar=1`:** só abre o login na página de Finanças; nas outras páginas é ignorado. Em Licitações, "Entrar" leva direto a `/licitacoes/app`, que tem o próprio login.
