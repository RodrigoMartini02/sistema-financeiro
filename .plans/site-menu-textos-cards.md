# Plano de Implementação: Site com menu por solução, textos corporativos e cards novos

## Origem

- **Especificação:** `.plans/site-analise-menu-textos-cards.md`, a análise de 2026-10-13. As decisões e os ajustes deste plano valem por cima dela.
- **Data do planejamento:** 2026-10-13.
- **Classificação:** `frontend-only`. O passo de infra é feito pelo usuário, no painel do Render.

## Resumo

1. **Menu:** o "Produtos" sai, e "Finanças" e "Licitações" entram direto no menu.
2. **Página `/produtos/`:** sai do site. Quem abrir o endereço vai para a seção de soluções da Início (`/#solucoes`).
3. **Rolagem:** ao trocar de página, o site passa a abrir no topo.
4. **Textos:** a Início, o Finanças, o Licitações, a Sobre e o Contato ganham textos corporativos. O título da Início passa a falar da empresa (inovação e automação), não das soluções.
5. **Cards:**
   - todos ganham um padrão visual único, com os ícones do Phosphor no estilo de dois tons;
   - o card que estava copiado em 3 arquivos passa a ser um componente só.
6. **Infra:** o painel do Render recebe a regra de `/produtos/` e a correção dos endereços antigos `/planos/` e `/funcionalidades/`. Na produção, os dois estão hoje em loop de redirecionamento: o 301 aponta para o próprio endereço.

## Decisões aplicadas

1. **`/produtos/`:** a página sai e o endereço redireciona para `/#solucoes`. O ajuste da rolagem do site entra junto.
2. **Título da Início:** "Inovação e automação para uma gestão mais eficiente.". A mesma frase vai para o rodapé, e o subtítulo também não cita as soluções.
3. **Ícones:** os cards usam o Phosphor (`@phosphor-icons/react` 2.1.10) no estilo de dois tons (`weight="duotone"`). Os ícones pequenos de interface continuam no lucide: menu, fechar, setas, check, mais e estrelas.
4. **Assistente Juca:** o card "Assistente Juca" entra no lugar do "Lançamento em lote" nos recursos do Finanças.
5. **Usuários do plano de Licitações:** o item fica "Uso em equipe, com cobrança adicional por usuário acima do limite do plano".
6. **Prazo de resposta:** a promessa de resposta em até 1 dia útil fica no Contato e passa a aparecer também na Início.

## Escopo

### Dentro do escopo

- O menu do cabeçalho, no computador e no celular.
- A remoção da página `/produtos/`, com o redirecionamento e a rolagem do site.
- Os textos da Início, do Finanças, do Licitações, da Sobre e do Contato. Também entram os componentes compartilhados: cards das soluções, planos, passos, avaliações, telas do Finanças e rodapé.
- O padrão visual dos cards com ícone, dos passos e do bloco "Como trabalhamos".
- O SEO: `publicPages.json`, `sitemap.xml` e `index.html`.
- A dependência nova `@phosphor-icons/react`.
- Os testes de `publicPages.test.ts`.
- O passo de infra no Render, que é feito pelo usuário, com a conferência depois do deploy.

### Fora do escopo

- A vitrine (`/loja/`), o app de Finanças e o app de Licitações.
- Os Termos e a Privacidade, que são texto jurídico.
- O modal de login, que tem texto funcional.
- A `TendersPreview`, inclusive o comentário com "módulo".
- Os ícones pequenos de interface, que continuam no lucide.
- Os textos que a análise não cobriu, como as outras perguntas frequentes, as listas de recursos dos planos e a tabela de comparação. Eles ficam como estão.
- Backend e banco.

## Leitura de contexto

- `CLAUDE.md` e `AGENT.md` da raiz. Não existem `frontend/AGENT.md` nem `backend/AGENT.md` no projeto.
- **Especificação:** `.plans/site-analise-menu-textos-cards.md`.
- **Planos anteriores:**
  - `.plans/site-novo.md`, cujas decisões 1 (frase da Início), Início com faixa para Produtos e menu "Produtos" este plano revê;
  - `.plans/site-novo-ajustes-licitacoes.md` e `.plans/proposta-empresa-produtos-site.md`.
- **Memórias do projeto:**
  - regras de negócio do site, para as palavras proibidas e a separação das soluções;
  - pendências do site v2, para os 301 do Render;
  - como trabalhar.
- **Código lido:**
  - em `src/screens/public/`: Home, Finance, Tenders, About, Contact, Products, Login e LoginModal;
  - em `components/`: SiteHeader, SiteFooter, PublicLayout, PublicSeo, SolutionCards, SolutionHero, FeatureGrid, StepsSection, PriceTables, ReviewsSection, FinanceScreens, TendersPreview, HeroVideo, CallToAction, PageIntro, FaqSection, siteStyles e siteMedia;
  - em `src/`: `brand.ts`, `utils/publicPages.ts`, `utils/publicPages.test.ts`, `utils/sitePricing.ts` e `App.tsx`;
  - na raiz: `index.html`, `vite.config.ts`, `scripts/generate-public-route-html.mjs`, `public/sitemap.xml`, `public/robots.txt` e `package.json`.
- **Conferências feitas no planejamento, todas só de leitura:**
  - `backend/src/routes/plans.ts:256`: no Finanças, o cancelamento encerra o acesso na hora;
  - `backend/src/modules/tenders/routes/billing.ts:249`: no Licitações, o acesso vai até o fim do teste ou do período pago;
  - `src/screens/finance/painel/Comprometido.tsx`: o Painel mostra os compromissos dos próximos meses, não uma projeção do saldo;
  - os ícones do lucide 1.23 instalado;
  - os 18 ícones do Phosphor 2.1.10, pela lista de arquivos do pacote;
  - os metadados do Phosphor no npm: engines `node >=10`, peer `react >=16.8`, nenhuma dependência e publicação em 2025-05-22;
  - o site na produção, com `curl`: `/planos/` e `/funcionalidades/` em loop de 301; endereço sem arquivo responde 404 e não volta para a Início; `/produtos/` responde 200, porque o arquivo existe.

## Impacto por área

### Frontend

- **Menu (`SiteHeader.tsx`):**
  - `NAV_LINKS` fica Início · Finanças · Licitações · Sobre · Contato, com `pageOfSolution('finance').path` e `pageOfSolution('tenders').path`;
  - o destaque passa a ser só `currentPath === to`;
  - saem `isProductsArea`, `inProducts` e `PRODUCTS_PATH`.
- **Rolagem (`PublicLayout.tsx`):** uma função `useScrollOnNavigate` no próprio arquivo, com estes casos:
  - **ida (PUSH ou REPLACE) com âncora:** `document.getElementById(...)?.scrollIntoView()`;
  - **ida sem âncora:** `window.scrollTo(0, 0)`;
  - **voltar ou avançar (POP):** não mexe, e o navegador restaura a posição;
  - **primeiro carregamento com âncora:** desce até a seção. É o caso de quem chega pelo 301 do Render;
  - **primeiro carregamento sem âncora:** não mexe.
  - Usa `useLocation` e `useNavigationType`.
- **Rotas (`App.tsx`):**
  - saem o import e a rota da `ProductsPage`;
  - no bloco de endereços antigos, `/produtos` passa para `<Navigate to="/#solucoes" replace />`, e `/planos/*` também passa a levar a `/#solucoes`;
  - `/funcionalidades/*` não muda.
- **Página removida:** `src/screens/public/ProductsPage.tsx`.
- **Início (`HomePage.tsx`):**
  - o topo usa `COMPANY_TAGLINE`, com o subtítulo novo;
  - "Conhecer as soluções" vira `<a href="#solucoes">`;
  - a seção "Por que a FINGERENCE" ganha o texto novo;
  - a seção `id="solucoes"`, com `scroll-mt-20`, passa a usar o `SolutionCards`, e saem os cards simples e o "Ver detalhes e preços";
  - "Como trabalhamos" vira 3 blocos de número;
  - as avaliações ganham título novo;
  - a chamada final ganha um botão para cada solução.
- **Páginas Finanças, Licitações, Sobre e Contato:** recebem os textos e os ícones do Apêndice A.
- **Sobre:** passa a usar o `FeatureGrid` com 4 colunas, e saem a interface `Principle` e o card copiado.
- **Componentes compartilhados:**
  - `FeatureGrid.tsx`:
    - o tipo `FeatureItem.icon` passa a ser `Icon`, do `@phosphor-icons/react`;
    - ganha a propriedade `columns?: 3 | 4`, que tem 3 como padrão e um mapa de classes `lg:grid-cols-3` e `lg:grid-cols-4`;
    - o card ganha uma sombra leve e o `ICON_TILE`, com o ícone em `size={26}` e `weight="duotone"`;
    - não tem efeito ao passar o mouse;
    - o comentário deixa de dizer "módulo".
  - `StepsSection.tsx`: o número sai de 13 px e vai para cerca de 44 px, fino e na cor da marca, com uma linha de 1 px (`bg-brand-200`) ao lado até a borda do card.
  - `SolutionCards.tsx`, `PriceTables.tsx` (com o comentário da linha 137 sem "módulo"), `ReviewsSection.tsx` e `FinanceScreens.tsx`: recebem os textos do Apêndice A.
  - `siteStyles.ts` ganha `ICON_TILE = 'flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#08343d] to-brand-600 text-white'`, usado no `FeatureGrid` e no Contato.
- **Constantes:**
  - `brand.ts`:
    - `COMPANY_TAGLINE` passa a ser "Inovação e automação para uma gestão mais eficiente.", e o comentário cita este plano;
    - `SOLUTION_TAGLINES` sai, porque fica sem uso;
    - `SUPPORT_CONTACT` ganha `responseTime: '1 dia útil'`.
  - `sitePricing.ts` ganha `STARTING_PRICE_CENTS`, o menor preço entre as soluções, que sai da `HomePage`. A Início e a Sobre passam a usá-lo.
- **Nomes:** nos textos escritos em TSX, a empresa e as soluções vêm de `COMPANY_NAME` e `SOLUTION_NAMES`, quando o texto já é montado com template.
- **Testes:** os da seção "Testes necessários".

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. Este plano não tem migration.

### Infra/Deploy

- **Dependência nova:** `npm install @phosphor-icons/react@^2.1.10`, que muda o `package.json` e o lockfile.
  - É compatível com o Node 22.17 e o React 19.
  - Ocupa 33 MB no `node_modules`, mas o build leva só os ícones importados.
- **Build:** o `generate-public-route-html.mjs` não muda. Com a entrada `/produtos/` fora do `publicPages.json`, o `dist/produtos/index.html` deixa de ser gerado.
- **Painel do Render (site estático, regras de Redirects/Rewrites), feito pelo usuário:**
  1. **Corrigir os loops. Feito em 2026-10-13 e conferido com `curl`: os dois endereços respondem 301 e terminam em 200.** As duas regras que já existiam foram editadas, sem criar outras:
     - `/planos` passa a ir para `/#solucoes`, como Redirect;
     - `/funcionalidades` passa a ir para `/produtos/financas/`, como Redirect.
     - Não é preciso criar regra com `/*`: os sitemaps antigos no git mostram que o site nunca teve subpáginas nesses endereços.
  2. **Regra nova, antes do merge:** `/produtos` e `/produtos/` para `/#solucoes`, com 301.
     - **Nunca** usar `/produtos/*`, porque a regra pegaria `/produtos/financas/` e `/produtos/licitacoes/`.
  3. **O `#` no destino funciona:** a regra de `/planos` devolve `location: /#solucoes`, conferido em 2026-10-13.
  4. **Por que antes do merge:** o Render responde 404 para endereço sem arquivo. Sem a regra 2, `/produtos/` dá 404 assim que o deploy entrar.
- **Conferência depois do deploy:**
  - `curl -sIL https://fin-gerence.com.br/produtos/`, e o mesmo para `/planos/` e `/funcionalidades/`: devem terminar em 200;
  - `/produtos/financas/` e `/produtos/licitacoes/` devem continuar em 200;
  - no navegador, `/produtos/` deve abrir a Início na seção de soluções.

## Arquivos provavelmente afetados

**Removido:**
- `src/screens/public/ProductsPage.tsx`

**Alterados:**
- **Menu, rotas e rolagem:**
  - `src/screens/public/components/SiteHeader.tsx`
  - `src/screens/public/components/PublicLayout.tsx`
  - `src/App.tsx`
  - `src/utils/publicPages.ts`
  - `src/utils/publicPages.test.ts`
- **Páginas:**
  - `src/screens/public/HomePage.tsx`
  - `src/screens/public/FinancePage.tsx`
  - `src/screens/public/TendersPage.tsx`
  - `src/screens/public/AboutPage.tsx`
  - `src/screens/public/ContactPage.tsx`
- **Componentes:**
  - `src/screens/public/components/SolutionCards.tsx`
  - `src/screens/public/components/FeatureGrid.tsx`
  - `src/screens/public/components/StepsSection.tsx`
  - `src/screens/public/components/PriceTables.tsx`
  - `src/screens/public/components/ReviewsSection.tsx`
  - `src/screens/public/components/FinanceScreens.tsx`
  - `src/screens/public/components/siteStyles.ts`
- **Constantes:**
  - `src/brand.ts`
  - `src/utils/sitePricing.ts`
- **SEO e estáticos:**
  - `src/screens/public/publicPages.json`
  - `public/sitemap.xml`
  - `index.html`
- **Dependências:**
  - `package.json`
  - `package-lock.json`

**Sem mudança:**
- `SiteFooter.tsx`, que lê a `COMPANY_TAGLINE`;
- `robots.txt`, porque o `Allow: /produtos` cobre as páginas das soluções;
- `authOrigin.ts`, porque os endereços de login não mudam;
- `generate-public-route-html.mjs`.

## Estratégia de implementação

1. **Preparação:**
   - Confirmar com o usuário se o outro chat terminou de usar esta pasta. Se não terminou, trabalhar numa cópia separada da pasta (`git worktree`).
   - Criar a branch `feat/R/site-menu-textos-cards` a partir da `main` atualizada.
2. **Dependência:** `npm install @phosphor-icons/react@^2.1.10`. Conferir que não aparece aviso de engine.
3. **Apagar primeiro o que sai**, sem deixar sobras:
   - `ProductsPage.tsx` e a rota dela;
   - `PRODUCTS_PATH`, `isProductsArea` e o teste dela;
   - `SOLUTION_TAGLINES`;
   - os cards simples da Início e o link "Ver detalhes e preços";
   - a interface `Principle` e o card copiado da Sobre;
   - os imports do lucide que ficarem sem uso;
   - a entrada `/produtos/` no `publicPages.json`, no `sitemap.xml` e no `index.html`.
4. **Menu:** os novos `NAV_LINKS` e a regra de destaque do `SiteHeader`.
5. **Rotas e rolagem:**
   - os `Navigate` de `/produtos` e `/planos/*` no `App.tsx`;
   - o `useScrollOnNavigate` no `PublicLayout`.
6. **Constantes:**
   - `COMPANY_TAGLINE` e `SUPPORT_CONTACT.responseTime` no `brand.ts`;
   - `STARTING_PRICE_CENTS` no `sitePricing.ts`;
   - `ICON_TILE` no `siteStyles.ts`.
7. **Componentes:** `FeatureGrid` com `columns` e o estilo novo, e `StepsSection` com o número grande.
8. **Páginas e componentes de texto:** aplicar o Apêndice A, nesta ordem: Início, `SolutionCards`, Finanças (página, `FinanceScreens` e `PriceTables`), Licitações (página e `PriceTables`), Sobre, Contato e `ReviewsSection`.
9. **SEO:** `publicPages.json`, `index.html` e `sitemap.xml`, conforme o Apêndice B.
10. **Testes:** atualizar `publicPages.test.ts`, com o teste novo das palavras proibidas.
11. **Validações automáticas:** `npm test`, `npx tsc --noEmit` e `npm run build`.
    - Depois do build, conferir que `dist/produtos/index.html` não existe.
    - Conferir também que `dist/produtos/financas/index.html` e `dist/produtos/licitacoes/index.html` existem.
12. **Conferência visual:** subir só o Vite (o site público não precisa do backend; sem a API, as avaliações só não aparecem). Se a 5173 estiver ocupada pelo outro chat, usar outra porta, por exemplo `npx vite --port 5180`.
    - Conferir o computador e o celular, com a lista de testes manuais abaixo.
    - No fim, encerrar a árvore inteira de processos do servidor.
13. **Infra:** lembrar o usuário do painel do Render. As regras do loop podem ser feitas já, e a de `/produtos/` precisa entrar antes do merge. Depois do deploy, fazer a conferência com `curl`.

## Regras de negócio identificadas

- **Separação das soluções:** os sistemas não têm atalhos entre si. O cabeçalho e o rodapé do site são da empresa e podem mostrar as duas soluções.
- **"Entrar" e "Começar grátis":** só nas páginas das soluções, sempre em modal. Não muda.
- **Palavras proibidas no texto do site:** "módulo", "produto", "mesmo login", "PNCP" (fora dos Termos e da Privacidade), "titular", "conta habilitada", "cortesia" e "assinatura recorrente", que vira "pagamento automático no cartão".
  - Com o menu novo, "produto" não aparece em lugar nenhum do texto. Fica só no endereço `/produtos/...`.
- **Licitações não promete:** aviso por e-mail ou WhatsApp, outras fontes de editais nem IA.
- **Card do plano de Licitações:** cita o uso em equipe com cobrança adicional, sem números. O valor por usuário a mais fica nas perguntas frequentes.
- **Recorrente é só do cartão de crédito:** nas despesas, o texto é "recorrentes no cartão"; nas receitas, "fixas".
- **Preços e 15 dias:** sempre vêm do `sitePricing.ts`. Os nomes vêm do `brand.ts`.
- **Cancelamento:** no Finanças, o acesso termina na hora. No Licitações, vai até o fim do período pago.
- **Avisos de edital novo:** valem só para as buscas salvas com o aviso ligado.
- **Prazo de resposta:** a promessa de 1 dia útil vale no Contato e na Início.

## Regras multi-tenant e segurança

- Sem impacto multi-tenant. É o site público, sem dados de conta. A única chamada à API é a lista de avaliações, que não muda.
- **Dependência nova:** a versão é de 2025-05-22, não tem dependências e é a 2.1.10, a mais recente publicada.
- **Âncora:** o `useScrollOnNavigate` só usa o `#` do endereço para procurar o elemento pelo id (`getElementById`), sem inserir nada na página.

## Validações necessárias

- **Entradas de usuário:** nenhuma nova. O formulário do Contato só troca o rótulo "Sobre" por "Assunto".
- **Conferências de conteúdo:**
  - nenhuma palavra proibida;
  - os preços, os 15 dias e o prazo de resposta vindos das constantes;
  - nenhum texto citando o "Lançamento em lote" como card.
- **Sobras:** nenhum import sem uso e nenhuma referência a `ProductsPage`, `PRODUCTS_PATH`, `isProductsArea` ou `SOLUTION_TAGLINES`.

## Testes necessários

### Frontend (`src/utils/publicPages.test.ts`)

- **Lista de páginas:** sem `/produtos/`.
- **Endereços:**
  - `publicPageFor('/produtos/')` e `publicPageFor('/produtos')` resolvem para `/`, com a mensagem "a página Produtos saiu: as soluções ficam na Início";
  - o resto do teste continua igual.
- **Solução da página:** a linha de `/produtos/` passa a usar `/sobre/`, com resultado `null`.
- **`isProductsArea`:** o teste sai, junto com o import.
- **Teste novo:**
  - os campos `title`, `description`, `fallback.label`, `fallback.heading` e `fallback.body` de todas as páginas não podem ter `/m[óo]dulo/i`, `/\bprodutos?\b/i`, `/mesmo login/i`, `/PNCP/`, `/titular/i`, `/conta habilitada/i`, `/cortesia/i` nem `/assinatura recorrente/i`.

### Backend

Sem impacto esperado.

### E2E (manual, no navegador)

- **Menu:**
  - aparecem os 5 itens, no computador e no celular;
  - o item da página aberta fica destacado: Finanças em `/produtos/financas/` e Licitações em `/produtos/licitacoes/`;
  - endereço desconhecido destaca a Início.
- **Rolagem:**
  - rolar a Início até o meio e clicar em "Finanças" no cabeçalho: a página abre no topo;
  - voltar no navegador: a Início volta para a posição de antes.
- **Âncoras:**
  - "Conhecer as soluções" desce até a seção de soluções, com o título visível abaixo do cabeçalho;
  - `/produtos` e `/planos/` no ambiente local abrem a Início na seção de soluções.
- **Cards e blocos:**
  - os cards de recursos do Finanças e do Licitações, os princípios da Sobre (4 colunas no computador, 2 no tablet e 1 no celular) e os canais do Contato aparecem com o ícone de dois tons no quadrado de degradê;
  - nenhum card muda ao passar o mouse.
- **Passos:** o número fica grande, com a linha, no Finanças e no Licitações.
- **Início:**
  - "Como trabalhamos" mostra 15 dias, R$ 4,99/mês e 1 dia útil;
  - os cards das soluções aparecem com imagem, benefícios e preço;
  - a chamada final tem os dois botões, e cada um leva à sua solução.
- **Rodapé:** mostra a frase nova.
- **Leitura dos textos:** conferir os textos contra o Apêndice A, nas 5 páginas.
- **Celular** (cerca de 400 px de largura): nada estoura a largura, e os números grandes cabem.

## Comandos de validação sugeridos

```bash
npm test
npx tsc --noEmit
npm run build
```

## Riscos e pontos de atenção

- **Ordem do deploy:** sem a regra de `/produtos/` no Render, o endereço dá 404 para links antigos e para o Google. A regra entra antes do merge.
- **Loop atual na produção:** `/planos/` e `/funcionalidades/` dão "redirecionamentos demais". A correção é no painel e não depende do código.
- **Pasta compartilhada:** o outro chat usa esta mesma pasta. Não trocar de branch sem confirmar.
- **Decisões revistas:** o plano muda decisões do `site-novo.md` (a frase da Início, a faixa para Produtos e o menu "Produtos"). As memórias de regras e de pendências do site precisam ser atualizadas no `/finalizar`.
- **Dependência nova:** o pacote é grande no `node_modules`. No modo dev, o Vite pré-empacota a biblioteca inteira na primeira execução.
- **Conferência manual:** o site não tem teste de tela, então o visual depende da conferência E2E.
- **Ícones de duas bibliotecas na mesma página:** é intencional, porque os ícones de interface são pequenos e os dos cards são ilustrativos. Se destoar na conferência, ajustar o peso ou o tamanho antes de trocar de biblioteca.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- O menu mostra Início · Finanças · Licitações · Sobre · Contato no computador e no celular, com o item da página aberta destacado.
- `/produtos/` leva à seção de soluções da Início: pela rota no ambiente local e pela regra do Render na produção.
- A página aberta pelo menu começa no topo, voltar mantém a posição, e a âncora `#solucoes` não fica escondida atrás do cabeçalho.
- Os textos seguem o Apêndice A e o SEO segue o Apêndice B, sem palavras proibidas.
- Os cards com ícone usam o Phosphor de dois tons no `ICON_TILE`. O card existe num só componente (`FeatureGrid`), e a Sobre usa esse componente.
- Não sobra código nem import sem uso. `ProductsPage`, `PRODUCTS_PATH`, `isProductsArea` e `SOLUTION_TAGLINES` não existem mais.
- `npm test`, `npx tsc --noEmit` e `npm run build` passam.
- As regras do Render estão corrigidas, e `/produtos/`, `/planos/` e `/funcionalidades/` terminam em 200 depois do deploy.

## Observações para a skill implementar

- Usar este plano como fonte principal. Os textos são os dos Apêndices A e B, que valem por cima da análise.
- Não trocar de branch nem mexer na pasta sem confirmar o outro chat. Se ele ainda estiver ativo, usar uma cópia separada da pasta (`git worktree`).
- Apagar o código antigo antes de aplicar o novo, sem sobras.
- Não rodar migrations, não mexer no `.env` e não tocar no backend.
- `.portal/` e `GLOSSARIO.md` nunca entram em commit.
- No `/finalizar`, atualizar estas memórias:
  - **regras de negócio do site:** estrutura com Início · Finanças · Licitações · Sobre · Contato, sem a página Produtos; a frase nova da Início; "produto" fora do texto inteiro;
  - **pendências do site v2:** os 301 do Render.

---

## Apêndice A: textos finais das páginas

Os textos com `${...}` são montados a partir das constantes. Os trechos não citados ficam como estão.

### Início (`HomePage.tsx`)

**Topo**
- **Título:** `COMPANY_TAGLINE`, "Inovação e automação para uma gestão mais eficiente.".
- **Subtítulo:** "A FINGERENCE desenvolve sistemas que eliminam tarefas manuais, organizam a informação e entregam a visão necessária para decidir com segurança."
- **Botões:**
  - "Conhecer as soluções", em `<a href="#solucoes">` com `ON_DARK_BUTTON`;
  - "Falar com a equipe", que leva a `/contato/`, com `ON_DARK_SECONDARY_BUTTON`.

**Seção 1**
- **Rótulo:** "Por que a FINGERENCE"
- **Título:** "Do dado disperso à gestão com método."
- **Parágrafo 1:** "Lançamentos, cartões, editais e prazos costumam se espalhar por planilhas, e-mails e anotações. Nossos sistemas automatizam o que é repetitivo e reúnem essas informações em um só ambiente, acessível pelo computador e pelo celular."
- **Parágrafo 2:** "O resultado é previsibilidade: saber o que entra, o que sai e qual oportunidade merece a sua atenção."

**Soluções** (`id="solucoes"`)
- **Rótulo:** "Soluções"
- **Título:** "Uma solução para cada frente do seu negócio."
- **Conteúdo:** o `<SolutionCards />`.

**Como trabalhamos**

Cada bloco tem o número grande, uma linha curta e o texto.

- **Rótulo:** "Como trabalhamos"
- **Título:** "Condições claras desde o primeiro acesso."
- **Bloco 1:**
  - número: `${FREE_TRIAL_DAYS} dias`;
  - linha: "de avaliação gratuita";
  - texto: "Acesso completo para avaliar a solução, sem cadastrar cartão de crédito."
- **Bloco 2:**
  - número: `${formatPriceCents(STARTING_PRICE_CENTS)}/mês`;
  - linha: "no plano de entrada";
  - texto: "Sem fidelidade, com pagamento por Pix ou cartão."
- **Bloco 3:**
  - número: `${SUPPORT_CONTACT.responseTime}`;
  - linha: "de prazo de resposta";
  - texto: "Atendimento humano por e-mail e WhatsApp."
- **Botão:** "Conheça a FINGERENCE", que leva a `/sobre/`, com `SECONDARY_BUTTON`.

**Avaliações** (`ReviewsSection.tsx`)
- **Rótulo:** "Avaliações"
- **Título:** "Avaliado por quem usa todos os dias."

**Chamada final**
- **Título:** "Comece sua avaliação gratuita hoje."
- **Texto:** `${FREE_TRIAL_DAYS} dias de acesso completo, sem cartão de crédito.`
- **Botões:** `SOLUTION_NAMES.finance` e `SOLUTION_NAMES.tenders`, cada um levando a `pageOfSolution(...).path`. Os dois usam `ON_DARK_BUTTON`.

### Cards das soluções (`SolutionCards.tsx`)

**Finanças**
- **Frase:** "Gestão financeira completa, da conta pessoal à empresa."
- **Benefícios:**
  - "Receitas, despesas, cartões e parcelamentos em um único painel"
  - "Saldo do mês e compromissos dos próximos meses, atualizados a cada lançamento"
  - "Relatórios por categoria e período, com exportação em PDF"

**Licitações**
- **Frase:** "Os editais certos para a sua empresa, sem perder nenhum prazo."
- **Benefícios:**
  - "Buscas por região, órgão, modalidade e faixa de valor"
  - "Notificação de novos editais que correspondem às suas buscas"
  - "Lembretes automáticos 3 dias e 1 dia antes do prazo"

### Finanças (`FinancePage.tsx`, `FinanceScreens.tsx` e `PriceTables.tsx`)

**Topo**
- **Título:** "Controle financeiro completo, para você e para a sua empresa."
- **Texto:** "Registre receitas e despesas em segundos, acompanhe faturas e parcelamentos, veja os compromissos dos próximos meses e decida com base em relatórios por categoria."

**Recursos** (`FeatureGrid`)
- **Rótulo:** "Recursos"
- **Título:** "Os recursos que a sua gestão financeira exige."

| Ícone | Título | Texto |
|---|---|---|
| `Receipt` | Despesas organizadas | À vista, parceladas ou recorrentes no cartão, cada uma no mês e na categoria corretos. |
| `HandCoins` | Receitas previsíveis | Entradas avulsas ou fixas, com confirmação do recebimento e histórico por período. |
| `ChatCircleText` | Assistente Juca | Descreva a movimentação em uma frase, e o lançamento chega preenchido para você conferir. |
| `CreditCard` | Cartões e faturas sob controle | Limite disponível, parcelas e cobranças recorrentes antes do fechamento, com pagamento total, parcial ou parcelado da fatura. |
| `ChartPieSlice` | Relatórios gerenciais | Visão por categoria e por período, com exportação em PDF. |
| `Buildings` | Pessoal e empresarial separados | Contas independentes para as finanças pessoais e para cada empresa, no plano Premium. |

**Telas** (`FinanceScreens.tsx`)
- **Rótulo:** "Por dentro", sem mudança.
- **Título:** "Uma interface objetiva, pensada para o uso diário."
- **Calendário:** "Visão mensal de entradas, saídas e vencimentos, dia a dia."
- **Lançamentos:** "Todas as movimentações do mês, com saldo, categoria e forma de pagamento."
- **Relatórios:** "Entradas, saídas e saldo do período, com o detalhe de cada lançamento."
- **Link:** "Acessar a demonstração"

**Passos**
- **Rótulo:** "Como funciona", sem mudança.
- **Título:** "Comece a usar em três etapas."
- **Passo 1:** "Crie sua conta". Texto: `Cadastro em minutos, com ${FREE_TRIAL_DAYS} dias de acesso completo e sem cartão de crédito.`
- **Passo 2:** "Registre as movimentações". Texto: "Pelo computador ou pelo celular, uma a uma, em lote ou pelo assistente Juca."
- **Passo 3:** "Acompanhe os resultados". Texto: "Saldo, faturas e relatórios atualizados a cada lançamento."

**Planos**
- **Título:** "Planos para cada estágio da sua gestão."
- **Texto:** "A avaliação gratuita inclui todos os recursos do Premium. Ao final, escolha o plano diretamente no sistema."
- **Starter:** "Para a gestão de uma conta, pessoal ou empresarial, com todos os recursos financeiros."
- **Premium:** "Para empresas com equipe, carteira de clientes e operação de vendas."

**Perguntas frequentes** (só as três abaixo mudam)
- **"O sistema acessa minha conta do banco?":** `Não. O ${SOLUTION_NAMES.finance} não se conecta ao seu banco: você registra as movimentações, e nenhuma senha bancária é pedida.`
- **"Funciona no celular?":** "Sim. O acesso é pelo navegador, no computador, no celular ou no tablet, sem precisar instalar nada."
- **"Como funciona o pagamento?":** "A cobrança é mensal, por Pix, cartão ou pagamento automático no cartão, sem fidelidade. O cancelamento pode ser feito a qualquer momento e encerra o acesso na hora."

**Chamada final**
- **Título:** "Assuma o controle das suas finanças hoje."
- O texto e o botão não mudam.

### Licitações (`TendersPage.tsx` e `PriceTables.tsx`)

**Topo**
- **Título:** "Encontre as licitações certas e não perca nenhum prazo."
- **Texto:** "Monitore editais abertos em todo o Brasil, receba notificações de novas oportunidades e conduza a participação da sua equipe, da análise ao prazo final, em um único ambiente."

**Passos**
- **Rótulo:** "Como funciona", sem mudança.
- **Título:** "Da busca ao prazo final, em três etapas."
- **Passo 1:** "Defina o perfil de busca". Texto: "Palavras-chave, região, órgão, modalidade e faixa de valor. Cada integrante da equipe salva as próprias buscas."
- **Passo 2:** "Receba as oportunidades". Texto: "Quando um novo edital corresponde a uma busca com aviso ligado, a notificação aparece no sistema."
- **Passo 3:** "Gerencie a participação". Texto: "Classifique cada edital em Analisar, Vou participar ou Descartado e receba lembretes antes do prazo."

**Recursos** (`FeatureGrid`)
- **Rótulo:** "Recursos"
- **Título:** "Recursos completos, para toda a equipe."

| Ícone | Título | Texto |
|---|---|---|
| `MagnifyingGlass` | Busca avançada | Frases exatas, termos excluídos e filtros por região, município, órgão, modalidade, valor e datas. |
| `BellRinging` | Alertas de novos editais | As buscas salvas com aviso ligado notificam quando surge um edital que corresponde a elas. |
| `Alarm` | Lembretes de prazo | Avisos 3 dias e 1 dia antes do encerramento dos editais em que a sua empresa vai participar. |
| `Kanban` | Gestão da participação | Situação de cada edital (Analisar, Vou participar, Descartado), com observações e histórico compartilhados pela equipe. |
| `BookmarkSimple` | Favoritos individuais | Cada integrante destaca os editais que quer acompanhar de perto. |
| `Files` | Itens e documentos | Os itens da compra e os arquivos oficiais do edital, a um clique. |

**Preço**
- **Rótulo:** "Preço", sem mudança.
- **Título:** "Plano único, com todos os recursos."
- **Card do plano:** "Busca, alertas e gestão da participação em editais, em um único ambiente."
- **Último item de `TENDERS_FEATURES`:** "Uso em equipe, com cobrança adicional por usuário acima do limite do plano"

**Perguntas frequentes** (só esta muda)
- **"E se eu cancelar?":** "O pagamento automático no cartão pode ser cancelado a qualquer momento, e o acesso continua até o fim do período já pago. No Pix e no cartão, cada pagamento vale por um período, sem renovação automática. As suas buscas e o acompanhamento ficam guardados."

**Chamada final**
- **Título:** "Sua próxima licitação pode estar publicada hoje."
- O texto e os botões não mudam.

### Sobre (`AboutPage.tsx`)

**Abertura**
- **Rótulo:** "Sobre", sem mudança.
- **Título:** "Tecnologia que transforma informação em gestão."
- **Texto:** "A FINGERENCE nasceu para organizar finanças sem depender de planilhas soltas. Hoje, também apoia empresas na busca e no acompanhamento de licitações públicas. Nas duas frentes, o compromisso é o mesmo: automatizar o que é repetitivo e entregar informação confiável, organizada e pronta para a decisão."

**Princípios** (`FeatureGrid` com `columns={4}`)
- **Rótulo:** "Nossos princípios"
- **Título:** "O que orienta o nosso trabalho."

| Ícone | Título | Texto |
|---|---|---|
| `Eye` | Transparência | Saldos, prazos e valores sempre visíveis, sem custos ocultos. |
| `ShieldCheck` | Segurança e privacidade | Sem conexão com a sua conta bancária, e os dados de cartão são processados pelo Mercado Pago. |
| `Wallet` | Preço acessível | `Planos a partir de ${formatPriceCents(STARTING_PRICE_CENTS)} por mês, com ${FREE_TRIAL_DAYS} dias de avaliação gratuita.` |
| `TrendUp` | Evolução contínua | As soluções evoluem a partir do uso real e do retorno de quem as utiliza. |

**Soluções**
- **Rótulo:** "Nossas soluções"
- **Título:** `Conheça as soluções da ${COMPANY_NAME}.`
- **Conteúdo:** o `<SolutionCards />`, sem mudança.

**Chamada final**
- **Título:** "Fale com a nossa equipe."
- **Texto:** "Dúvidas comerciais, suporte ou parcerias: estamos à disposição."
- **Botão:** "Falar com a equipe", que leva a `/contato/`.

### Contato (`ContactPage.tsx`)

- **Título:** "Fale com a nossa equipe."
- **Texto:** `Dúvidas comerciais, suporte técnico ou sugestões: a nossa equipe responde em até ${SUPPORT_CONTACT.responseTime}.`
- **Ícones dos canais:**
  - `Envelope`, para o e-mail;
  - `WhatsappLogo`, para o WhatsApp;
  - os dois no estilo de dois tons, dentro do `ICON_TILE`.
- **Rótulo do campo do assunto:** troca "Sobre" por "Assunto".
- O resto do formulário não muda.

### Rodapé

- A frase sob o logo é a `COMPANY_TAGLINE`. O `SiteFooter` não muda.

## Apêndice B: SEO

### `publicPages.json`

As entradas de Termos e Privacidade não mudam, e os `navLabel` continuam os mesmos.

**`/`**
- **title:** "FINGERENCE | Inovação e automação em gestão financeira e licitações"
- **description:** "Sistemas que automatizam a gestão financeira pessoal e empresarial e o acompanhamento de licitações públicas. Teste grátis por 15 dias."
- **fallback.label:** "FINGERENCE"
- **fallback.heading:** "Inovação e automação para uma gestão mais eficiente."
- **fallback.body:** "A FINGERENCE desenvolve sistemas que eliminam tarefas manuais, organizam a informação e entregam a visão necessária para decidir com segurança: o FINGERENCE Finanças, para a gestão financeira pessoal e empresarial, e o FINGERENCE Licitações, para encontrar e acompanhar editais sem perder prazos."

**`/produtos/`**
- A entrada sai.

**`/produtos/financas/`**
- **title:** não muda.
- **description:** "Receitas, despesas, cartões, faturas e relatórios da vida pessoal e da empresa em um só lugar. Planos a partir de R$ 4,99/mês, com 15 dias grátis."
- **fallback.heading:** "Controle financeiro completo, para você e para a sua empresa."
- **fallback.body:** "Registre receitas e despesas em segundos, acompanhe faturas e parcelamentos, veja os compromissos dos próximos meses e decida com base em relatórios por categoria. Planos Starter e Premium, com 15 dias grátis."

**`/produtos/licitacoes/`**
- **title:** "FINGERENCE Licitações | Os editais certos, sem perder prazos"
- **description:** "Monitore licitações abertas em todo o Brasil, receba notificações de novos editais e acompanhe a participação da sua equipe até o prazo final. R$ 4,99/mês, com 15 dias grátis."
- **fallback.heading:** "Encontre as licitações certas e não perca nenhum prazo."
- **fallback.body:** "Monitore editais abertos em todo o Brasil, receba notificações de novas oportunidades e conduza a participação da sua equipe, da análise ao prazo final, em um único ambiente."

**`/sobre/`**
- **title:** não muda.
- **description:** "Conheça a FINGERENCE: sistemas que automatizam a gestão financeira e o acompanhamento de licitações, com transparência, segurança e preço acessível."
- **fallback.heading:** "Tecnologia que transforma informação em gestão."
- **fallback.body:** o mesmo texto da abertura da Sobre.

**`/contato/`**
- **title:** não muda.
- **description:** "Fale com a equipe da FINGERENCE por e-mail ou WhatsApp: dúvidas comerciais, suporte e parcerias, com resposta em até 1 dia útil."
- **fallback.heading:** "Fale com a nossa equipe."
- **fallback.body:** "Dúvidas comerciais, suporte técnico ou sugestões: escreva para fingerence@gmail.com ou chame no WhatsApp (49) 99955-4856. Respondemos em até 1 dia útil."

### `index.html`

- O `<title>`, a `description` e o `og:title` e `og:description` ficam iguais aos da entrada `/`.
- O conteúdo de reserva usa o `label`, o `heading` e o `body` da entrada `/`.
- Na navegação de reserva, sai o link "Produtos".

### `sitemap.xml`

- Sai o bloco de `/produtos/`.
- O `lastmod` da Início, de Finanças, de Licitações, da Sobre e do Contato passa para a data da implementação.

---

## Adendo 1: endereços limpos, sem rotas antigas (2026-10-13)

**Contexto:** a primeira entrega já está na branch e no GitHub (commit `b3d089d5`), sem merge. Depois dela, o usuário pediu que a reestruturação ficasse limpa: sem "produtos" nos endereços, sem rotas antigas e sem remendos.

Este adendo **vale por cima** das partes do plano que falam em `/produtos/...`, em `/#solucoes` como destino de endereço antigo e nas regras do Render para endereços antigos.

### Decisões

1. **Endereços das soluções:** `/financas/` e `/licitacoes/`. O sistema de Licitações fica só em `/licitacoes/app`, e o `/licitacoes` sozinho deixa de abrir o sistema.
2. **Endereços antigos** (`/produtos/...`, `/planos/`, `/funcionalidades/` e `/termoPrivacidade.html`): não ganham redirecionamento, nem no código nem no Render, e passam a dar 404. O motivo é que só o usuário e a Mirian usam o site.

### Estrutura final

- **Site:** `/`, `/financas/`, `/licitacoes/`, `/sobre/`, `/contato/`, `/termos/` e `/privacidade/`.
- **Sistemas:** `/app.html` (Finanças) e `/licitacoes/app` (Licitações), sem mudança.
- **Login sem sessão:** leva a `/financas/?entrar=1` e a `/licitacoes/?entrar=1`.
- **Backend:** nada muda. O retorno do Mercado Pago, o destino do login e os links das notificações já usam `/licitacoes/app`.

### Código

1. **`src/screens/public/publicPages.json`:** os `path` passam a ser `/financas/` (`file` `financas/index.html`) e `/licitacoes/` (`file` `licitacoes/index.html`).
2. **`src/App.tsx`:**
   - as rotas passam a ser `/financas` e `/licitacoes`;
   - saem as rotas de endereços antigos (`/funcionalidades/*`, `/planos/*` e `/produtos`), junto com o comentário delas;
   - o import de `Navigate` sai, se ficar sem uso.
3. **`src/utils/authOrigin.ts`:** `FINANCE_LOGIN_ADDRESS` passa a ser `/financas/?entrar=1`, e `TENDERS_LOGIN_ADDRESS` passa a ser `/licitacoes/?entrar=1`.
4. **`src/tenders/utils/modulePaths.ts`:** saem `appAddressFor`, `MODULE_ROOT` e `AddressParts`. Fica só `TENDERS_APP_BASE`, com o comentário da estrutura nova.
5. **`src/tenders/utils/tendersUtils.test.ts`:** saem os testes de `appAddressFor` e o import dele.
6. **`src/tenders/main.tsx`:** sai a troca de endereço (`appAddressFor` com `replaceState`). O comentário passa a dizer que o app é servido só em `/licitacoes/app/*`.
7. **`vite.config.ts`:** o servidor local entrega `tenders.html` só em `/licitacoes/app` e `/licitacoes/app/*`, e o comentário acompanha.
8. **`public/robots.txt`:**
   - `Allow: /produtos` vira `Allow: /financas` e `Allow: /licitacoes/`;
   - `Disallow: /licitacoes` vira `Disallow: /licitacoes/app`.
9. **`public/sitemap.xml`:** as entradas passam a ser `/financas/` e `/licitacoes/`.
10. **`index.html`:** recebe os links novos na navegação de reserva.
11. **`src/utils/publicPages.ts`:** o comentário de exemplo do `pageOfSolution` passa a usar o endereço novo.
12. **`src/utils/publicPages.test.ts`:**
    - a lista de páginas passa a ter `/financas/` e `/licitacoes/`;
    - `/licitacoes` passa a ser página do site, com a solução `tenders`;
    - saem as verificações de endereços antigos (`/produtos` e `/planos/`);
    - o resto continua igual.
13. **`backend/src/modules/tenders/README.md`:** as seções de endereço e de hospedagem passam a descrever a estrutura nova. É só documentação.

### Render (feito pelo usuário logo depois do deploy, nunca antes)

| Regra hoje | O que fazer |
|---|---|
| `/termoPrivacidade.html`, `/funcionalidades` e `/planos` | Apagar, porque são endereços antigos. |
| `/licitacoes` (Rewrite → `/tenders.html`) | Trocar para Redirect → `/licitacoes/`. |
| `/licitacoes/*` (Rewrite → `/tenders.html`) | Trocar o Source para `/licitacoes/app/*`. |
| Nova | `/licitacoes/app` → `/tenders.html`, como Rewrite. |
| Nova | `/financas` → `/financas/`, como Redirect. |
| `/sobre`, `/contato`, `/termos`, `/privacidade`, `/loja/*` e `/catalogo/*` | Continuam como estão. |

**Por que depois do deploy:** antes dele, `/licitacoes/` ainda não tem arquivo. Com a regra nova, `/licitacoes` → `/licitacoes/` cairia de novo na própria regra e entraria em loop, como aconteceu com `/planos/`.

**Conferência com `curl`, depois da troca:**
- `/financas/` e `/licitacoes/` respondem 200;
- `/financas` e `/licitacoes` respondem 301, para o endereço com barra;
- `/licitacoes/app` responde 200, com o `tenders.html`;
- `/produtos/financas/` responde 404.

### Riscos

- **Entre o deploy e a troca das regras,** `/licitacoes` sem barra fica com a página em branco por alguns minutos.
- **Os favoritos de `/licitacoes`** passam a abrir a página do site, e não mais o sistema, que agora fica em `/licitacoes/app`.
- **Regra de negócio revista:** "`/licitacoes` continua sendo só do sistema" passa a ser "`/licitacoes/` é a página do site, e o sistema fica em `/licitacoes/app`".

### Validação

- `npm test`, `npx tsc --noEmit` e `npm run build`. O build passa a gerar `dist/financas/index.html` e `dist/licitacoes/index.html`, e não gera mais nada em `dist/produtos/`.
- **No ambiente local:**
  - o menu leva a `/financas/` e `/licitacoes/`;
  - `/licitacoes/app` sem login cai em `/licitacoes/?entrar=1`, com a tela de login aberta;
  - `/produtos/financas/` não é mais página.

### Critérios de aceite

- Nenhum endereço do site tem "produtos", e o código não tem nenhuma rota de endereço antigo.
- Nos dois sistemas, quem está sem sessão vai para a página da solução, com o login aberto.
- As regras do Render estão como na tabela e foram conferidas com `curl`.

### Observações para a skill implementar

- Usar a mesma branch `feat/R/site-menu-textos-cards`, num segundo commit.
- Apagar primeiro o que sai (as rotas antigas e o `appAddressFor`) e depois aplicar o novo.
- No `/finalizar`, atualizar estas memórias:
  - regras do site: a estrutura nova e o `/licitacoes/` como página do site;
  - pendências do site v2: as regras do Render deste adendo.

### Revisão da decisão 2 (2026-10-13, depois do deploy)

**O que mudou:** a decisão 2 ("nenhum redirecionamento, endereços antigos dão 404") foi revista. Depois do deploy, o `curl` mostrou que **o Render guarda e continua entregando os arquivos dos deploys anteriores**. Sem regra, `/produtos/financas/` e `/produtos/licitacoes/` entregavam as páginas antigas, com o texto velho, e `/planos/index.html` e `/funcionalidades/index.html` ainda existiam, de 07/10. Como a regra vale antes desses arquivos antigos, os endereços antigos ganharam 301. Isso só existe no Render: o código continua sem nenhuma rota antiga.

**Regras finais no Render, conferidas com `curl`:**

| Source | Destination | Action |
|---|---|---|
| `/funcionalidades` | `/financas/` | Redirect |
| `/sobre` | `/sobre/` | Redirect |
| `/planos` | `/#solucoes` | Redirect |
| `/contato` | `/contato/` | Redirect |
| `/termos` | `/termos/` | Redirect |
| `/privacidade` | `/privacidade/` | Redirect |
| `/loja/*` | `/index.html` | Rewrite |
| `/catalogo/*` | `/index.html` | Rewrite |
| `/licitacoes` | `/licitacoes/` | Redirect |
| `/licitacoes/app/*` | `/tenders.html` | Rewrite |
| `/produtos` | `/#solucoes` | Redirect |
| `/licitacoes/app` | `/tenders.html` | Rewrite |
| `/financas` | `/financas/` | Redirect |
| `/produtos/financas` | `/financas/` | Redirect |
| `/produtos/licitacoes` | `/licitacoes/` | Redirect |

**Incidente:** durante a troca, a regra `/licitacoes/*` → `/licitacoes/app/*` (Rewrite) deixou o sistema de Licitações em branco por alguns minutos, porque o Render devolveu 200 vazio. Corrigida a regra, o `curl` confirmou o `tenders.html` em todos os endereços do sistema.

**Lição:** Rewrite só pode apontar para um arquivo que existe, como `/tenders.html` ou `/index.html`.
