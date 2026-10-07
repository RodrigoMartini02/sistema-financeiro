# Plano de Implementação: Ajustes do site antes da produção (acesso, login de Licitações e plano)

## Origem

- Arquivo de especificação: pedido do usuário na conversa de 07/10/2026 (ajustes do site novo v2 antes de ir para a produção, com duas capturas de tela: a prévia de Licitações e o card do plano de Licitações)
- Data do planejamento: `2026-10-07`
- Classificação: `frontend-only`

Decisões do usuário:

1. **"Acessar ▾":** sai das páginas da empresa (Início, Produtos, Sobre, Contato, Termos e Privacidade), no topo e no menu do celular.
2. **Login de Licitações em modal, igual ao de Finanças:**
   - o "Entrar" da página de Licitações abre o modal, sem sair do site;
   - sem sessão, com a sessão vencida ou ao clicar em "Sair", a pessoa vai para a página de Licitações com o modal aberto;
   - a tela de login de dentro do sistema de Licitações é apagada.
3. **Prévia de Licitações:** sai o card de notificação "Edital novo na sua busca".
4. **Card do plano de Licitações igual ao de Finanças, só no visual:**
   - saem as linhas sobre usuários e o exemplo de cálculo;
   - entra o benefício "Mais de um usuário por conta; acima do limite, cobrança adicional por usuário" (decisão pendente 1);
   - o card tem a largura de um card de Finanças, alinhado à esquerda (decisão pendente 2);
   - a cobrança não muda.

Este plano substitui, no `.plans/site-novo.md`:
- a decisão 2 ("Acessar ▾" nas páginas da empresa);
- o ajuste "`?entrar=1` só abre o login na página de Finanças; em Licitações, 'Entrar' leva direto a `/licitacoes/app`".

## Resumo

Quatro ajustes no site novo v2, na branch `feat/R/site-novo`, antes da ida para a produção:

1. tirar o "Acessar ▾" das páginas da empresa;
2. passar o login de Licitações para o mesmo modal de Finanças, inclusive na volta de quem está sem sessão ou saiu;
3. tirar o card de notificação da prévia de Licitações;
4. deixar o card do plano de Licitações no mesmo visual dos cards de Finanças, com os benefícios no lugar das linhas sobre usuários.

Nada muda no backend, no banco ou na cobrança.

## Escopo

### Dentro do escopo

- **Cabeçalho do site:** sem o "Acessar ▾" no computador e sem a seção "Acessar" no menu do celular.
- **Login de Licitações no modal:**
  - "Entrar" e "Já sou cliente" da página de Licitações abrem o modal "Entrar em Licitações";
  - o `?entrar=1` passa a abrir o login também na página de Licitações;
  - o app de Licitações sem sessão (ou com a sessão vencida), o "Sair" do menu e o "Sair" das telas de bloqueio levam a `/produtos/licitacoes/?entrar=1`;
  - a `TendersLoginScreen` é apagada.
- **Prévia de Licitações:** sem o card "Edital novo na sua busca".
- **Card do plano de Licitações:** no componente do card de Finanças, com os benefícios e a linha de usuários.
- **Documentação:** registro das mudanças no `.plans/site-novo.md`.

### Fora do escopo

- **Cobrança de Licitações:** continua igual (R$ 4,99 por conta com 2 usuários e R$ 2,99 por usuário a mais), no backend.
- **Pergunta frequente "Quantos usuários posso ter?":** continua com o valor por usuário a mais.
- **Login de Finanças:** não muda.
- **Ida para a produção:** fica para o `/finalizar`, na ordem já combinada:
  1. conferência só de leitura dos usuários em teste com data de fim gravada;
  2. a 0080 na produção;
  3. o merge.
- **Redirecionamentos 301 no Render e textos dos termos:** seguem com o usuário.

## Leitura de contexto

- `/AGENT.md`
- `/frontend/AGENT.md`: não existe no projeto
- `/backend/AGENT.md`: não existe no projeto
- `CLAUDE.md`, com o fluxo obrigatório
- Especificação: a conversa de 07/10/2026 e as decisões acima
- `.plans/site-novo.md`: decisões e ajustes do site v2
- `.plans/licitacoes-produto.md`: assinatura de Licitações e preço por usuário
- Código lido:
  - **Site:**
    - `src/screens/public/components/{SiteHeader,PublicLayout,publicSiteContext,LoginModal,PriceTables,TendersPreview,SiteFooter}.tsx/ts`;
    - `src/screens/public/{TendersPage,LoginPage}.tsx`;
    - `src/brand.ts`.
  - **Login e sessão:** `src/utils/{authOrigin,publicPages,sitePricing}.ts`, `src/services/session.ts` e `src/App.tsx` (entrada de Finanças sem sessão).
  - **Licitações:**
    - `src/tenders/TendersApp.tsx`;
    - `src/tenders/screens/{TendersLoginScreen,GateScreens}.tsx`;
    - `src/tenders/layout/TendersUserMenu.tsx`;
    - `src/tenders/services/tendersApi.ts`;
    - `src/tenders/utils/{gateState,modulePaths}.ts`.
  - **Testes:** `src/utils/{publicPages,sitePricing}.test.ts` e `src/tenders/utils/tendersUtils.test.ts`.

Contexto multi-tenant: o `AGENT.md` fala em "prefeitura"; aqui não há dado de conta envolvido. As mudanças são de telas públicas e de navegação, e a sessão continua a mesma (o token compartilhado entre o FINGERENCE e Licitações).

## Impacto por área

### Frontend

- **Cabeçalho (`SiteHeader.tsx`):**
  - **Saem:**
    - o menu "Acessar ▾" do computador;
    - o estado dele (`accessOpen`), as referências do botão e do painel e o efeito de fechar com Esc ou clique fora;
    - a função `access`;
    - a seção "Acessar" do menu do celular.
  - **Páginas da empresa:**
    - no computador, o bloco da direita fica vazio;
    - no celular, a parte de baixo do menu só aparece nas páginas das soluções, com "Começar grátis" e "Entrar".
  - **Imports:** saem `ChevronDown`, `SITE_SOLUTIONS` e `SOLUTION_TAGLINES`.
  - **Comentário de `pageSolution`:** atualizado.
- **`brand.ts`:** o comentário de `SOLUTION_TAGLINES` deixa de citar o menu "Acessar". Ele continua nos cards da página inicial.
- **Moldura do site (`PublicLayout.tsx`):**
  - `enter(solution)` abre o login da solução nas duas soluções: `openLogin({ solution, mode: 'login' })`, que grava a origem `tenders` em Licitações;
  - o `?entrar=1` abre o login na página de qualquer solução (`pageSolution !== null`), com a solução da página, e é limpo do endereço; nas páginas da empresa continua ignorado;
  - sai o import de `destinationForAuthOrigin`, se não sobrar uso.
- **Comentários:**
  - `publicSiteContext.ts`: "`enter`: abre o login da solução, sobre o site";
  - `LoginModal.tsx`: a prop `solution` deixa de falar em "login próprio".
- **`authOrigin.ts`:** ganha `TENDERS_LOGIN_ADDRESS = '/produtos/licitacoes/?entrar=1'`, ao lado de `FINANCE_LOGIN_ADDRESS`, com o comentário de quando é usado.
- **App de Licitações:**
  - **`TendersApp.tsx`:** no estado `login`, faz `window.location.replace(TENDERS_LOGIN_ADDRESS)` e mostra "Redirecionando", como o `App.tsx` de Finanças. Sai o import da `TendersLoginScreen`.
  - **"Sair":** em `TendersUserMenu.tsx` e `GateScreens.tsx`, o `signOut` leva para `TENDERS_LOGIN_ADDRESS`. Sai o import de `TENDERS_APP_BASE` onde não sobrar uso.
  - **Sessão vencida:** `tendersApi.ts` não muda. O 401 já faz `logout()`, e o estado vira `login`, que agora redireciona.
  - **`TendersLoginScreen.tsx`:** apagado.
- **Prévia (`TendersPreview.tsx`):**
  - sai o card "Edital novo na sua busca" e o `Bell` do import;
  - sai o `relative` do quadro, que só servia ao card;
  - o `aria-label` deixa de citar "o aviso de edital novo".
- **Planos (`PriceTables.tsx`):**
  - **Card comum:** o `article` dos cards de Finanças vira um componente `PlanCard` (nome, selo opcional, preço com sufixo, descrição, benefícios e botão), usado pelos dois. O visual de Finanças não muda.
  - **`TendersPlanCard`:**
    - **Posição:** o mesmo grid de Finanças (`grid gap-6 md:grid-cols-2`), com um card só, que fica com a largura de um card de Finanças, alinhado à esquerda.
    - **Estilo:** o destacado (o fundo de hoje), sem o selo "Mais completo".
    - **Conteúdo:**
      - nome `SOLUTION_NAMES.tenders`;
      - preço "R$ 4,99" com "/mês por conta";
      - descrição "Busca, avisos e acompanhamento dos editais, num só lugar.".
    - **Benefícios:** os cinco de hoje mais "Mais de um usuário por conta; acima do limite, cobrança adicional por usuário".
    - **Botão:** "Teste grátis por 15 dias", primário, na largura do card.
  - **Saem:** as linhas "Com 2 usuários…", o exemplo de 4 usuários, `EXAMPLE_USERS`, o título "Tudo incluso, para todos os usuários:" e o import de `tendersMonthlyCents`.
- **`sitePricing.ts`:** sai `tendersMonthlyCents`, que fica sem uso. `TENDERS_PRICE` continua, porque o card e a pergunta frequente usam.
- **Estados de carregamento, erro e vazio:** o "Redirecionando" do app de Licitações segue o de Finanças.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado. Nenhuma migration.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- Sem impacto esperado: nenhuma variável de ambiente, serviço ou job novo.
- **Build:** o `tenders.html` deixa de carregar o `LoginPage` (a tela de login sai do app de Licitações).
- **Ordem na produção:** não muda. A branch continua levando a Parte 2, e a 0080 entra antes do merge.

## Arquivos provavelmente afetados

- `src/screens/public/components/SiteHeader.tsx`
- `src/brand.ts`
- `src/screens/public/components/PublicLayout.tsx`
- `src/screens/public/components/publicSiteContext.ts`
- `src/screens/public/components/LoginModal.tsx`
- `src/utils/authOrigin.ts`
- `src/utils/publicPages.test.ts`
- `src/tenders/TendersApp.tsx`
- `src/tenders/layout/TendersUserMenu.tsx`
- `src/tenders/screens/GateScreens.tsx`
- `src/tenders/screens/TendersLoginScreen.tsx` (apagado)
- `src/screens/public/components/TendersPreview.tsx`
- `src/screens/public/components/PriceTables.tsx`
- `src/utils/sitePricing.ts` e `src/utils/sitePricing.test.ts`
- `.plans/site-novo.md`
- `.plans/site-novo-ajustes-licitacoes.md` (este plano)

## Estratégia de implementação

1. **Branch:** conferir que a branch ativa é a `feat/R/site-novo` e que a árvore está limpa (só os arquivos soltos de sempre). Os commits entram depois do `bc773b22`.
2. **Apagar o que sai, primeiro (regra do redesign):**
   - o "Acessar ▾" e a seção do celular no `SiteHeader`;
   - a `TendersLoginScreen`;
   - o card de notificação da prévia;
   - as linhas de usuários e o exemplo do card de Licitações;
   - `tendersMonthlyCents` e o teste dela.
3. **Login de Licitações:**
   - `TENDERS_LOGIN_ADDRESS` em `authOrigin.ts`, com teste em `publicPages.test.ts`;
   - `enter` e `?entrar=1` no `PublicLayout`;
   - o redirecionamento no `TendersApp` e o "Sair" nos dois lugares;
   - os comentários.
4. **Card do plano:** extrair o `PlanCard` dos cards de Finanças e montar o `TendersPlanCard` com ele, no grid de duas colunas.
5. **Prévia:** ajustar o quadro (`relative`) e o `aria-label`.
6. **Documentação:** no `.plans/site-novo.md`, uma seção "Mudança posterior: ajustes antes da produção (07/10/2026)", apontando para este plano.
7. **Validação:** os comandos abaixo e a conferência no local (`/run`).

## Regras de negócio identificadas

1. **Login:**
   - o login de cada solução é feito no modal do site, na página da solução;
   - o modal de Licitações mostra "Entrar em Licitações", e o cadastro por ele continua abrindo o teste de 15 dias de Licitações.
2. **Sem sessão, sessão vencida ou "Sair":**
   - Finanças vai para `/produtos/financas/?entrar=1` (como hoje);
   - Licitações vai para `/produtos/licitacoes/?entrar=1`.
3. **`?entrar=1`:**
   - abre o login na página da solução e some do endereço;
   - nas páginas da empresa, é ignorado.
4. **Páginas da empresa:** não têm atalho de login. Quem já é cliente entra pela página da solução ou pelo endereço do sistema.
5. **Preço de Licitações no site:**
   - R$ 4,99/mês por conta;
   - os usuários a mais aparecem como benefício, sem valor no card;
   - o valor por usuário a mais fica na pergunta frequente;
   - a cobrança não muda.
6. **Prévia de Licitações:** mostra só a busca e os editais, com dados fictícios.

## Regras multi-tenant e segurança

- **Sem dado de conta:** as páginas públicas não leem dado de conta.
- **Sessão:** continua a mesma. O token e a origem gravada (`auth_origin`) não mudam de formato.
- **Destino depois do login:** vem do mapa fixo de origens (`DESTINATION_BY_ORIGIN`). O `?entrar=1` só abre o modal e não aceita endereço de volta, então não abre brecha de redirecionamento.
- **Acesso a Licitações:** a trava (`GET /api/tenders/access`) continua no app depois do login. Conta sem o módulo e colaborador sem permissão seguem caindo nas telas de bloqueio.

## Validações necessárias

- Nenhuma entrada nova de usuário.
- O `?entrar=1` é só um sinal: vale na página de uma solução e é limpo do endereço.

## Testes necessários

### Frontend

- **`src/utils/publicPages.test.ts`:** "entrada de Licitações sem sessão: a página de Licitações, que abre o login". O endereço `TENDERS_LOGIN_ADDRESS` cai na página da solução `tenders`, com `entrar=1`.
- **`src/utils/sitePricing.test.ts`:** saem as verificações de `tendersMonthlyCents`. As outras continuam.
- **`src/tenders/utils/tendersUtils.test.ts`:** sem mudança, porque o estado `login` continua existindo.

### Backend

- Sem impacto esperado.

### E2E

Conferência manual no local (`/run`):

- **Páginas da empresa** (Início, Produtos, Sobre, Contato, Termos e Privacidade): sem "Acessar", no computador e no celular.
- **Página de Licitações:**
  - "Entrar" e "Já sou cliente" abrem o modal "Entrar em Licitações";
  - o login por e-mail leva para `/licitacoes/app`;
  - o login com Google também volta para `/licitacoes/app`;
  - "Criar nova conta" no modal cadastra com o teste de Licitações.
- **Sem sessão:** `/licitacoes/app` vai para `/produtos/licitacoes/` com o modal aberto, e o `?entrar=1` some do endereço.
- **"Sair":** no menu do usuário e nas telas de bloqueio, leva para a página de Licitações com o modal aberto.
- **Sessão vencida (401):** leva para o mesmo lugar.
- **Prévia:** sem o card de notificação, no computador e no celular.
- **Card do plano:** no visual dos cards de Finanças, com a largura de um card e alinhado à esquerda, com a linha de usuários. O botão abre o cadastro.
- **Finanças:** "Entrar", sem sessão e "Sair" continuam como hoje.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npx vite build
npm run build
```

## Riscos e pontos de atenção

- **Quem já é cliente:** perde o atalho nas páginas da empresa e passa a entrar pela página da solução ou pelo endereço do sistema.
- **Login com Google aberto pelo modal de Licitações:**
  - a volta passa pela página inicial e o destino vem da origem gravada ao abrir o modal (`tenders`);
  - conferir no local que volta para Licitações.
- **Redirecionamento sem fim:** não deve acontecer, porque a página de Licitações é pública e não pede sessão. Conferir no local com a sessão vencida.
- **Ida para a produção:** este plano não muda a ordem combinada (conferência na produção, 0080, merge) nem as pendências registradas (sandbox do Mercado Pago, aviso dos termos, mensagem do commit de trabalho).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- **Páginas da empresa:** nenhuma mostra "Acessar", nem no computador nem no celular.
- **Login de Licitações:** "Entrar" e "Já sou cliente" abrem o modal "Entrar em Licitações", e o login leva ao sistema de Licitações.
- **Sem sessão, "Sair" ou sessão vencida em Licitações:** levam à página de Licitações com o modal aberto.
- **Código antigo:** a `TendersLoginScreen` não existe mais e não sobra referência a ela.
- **Prévia:** aparece sem o card de notificação.
- **Card do plano de Licitações:**
  - tem o visual dos cards de Finanças, com a largura de um card e alinhado à esquerda;
  - mostra os benefícios e a linha "Mais de um usuário por conta; acima do limite, cobrança adicional por usuário";
  - não mostra as linhas de usuários nem o exemplo.
- **Finanças:** sem mudança de comportamento.
- **Checks:** os comandos acima passam.

## Observações para a skill implementar

- **Fonte:** usar este plano como fonte principal.
- **Branch:** `feat/R/site-novo` (a ativa), com commits depois do `bc773b22`.
- **Redesign:** apagar primeiro o que sai, depois montar o novo, sem sobras (imports, estados, funções e testes sem uso).
- **Seguir o `/AGENT.md`:**
  - identificadores em inglês e textos em português;
  - sem `any`;
  - sem `catch {}` silencioso.
- **Sem migration e sem mexer em `.env`.**
- **Commits:** `.portal/` e `GLOSSARIO.md` nunca entram.
- **Produção:** não faz parte desta etapa. Fica para o `/finalizar`, com a ordem já combinada.
