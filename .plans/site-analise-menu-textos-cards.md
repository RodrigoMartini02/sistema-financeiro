# Análise do site: menu, textos e cards

Análise de 2026-10-13, só de leitura, sem alterar código. Serve de base para o `/planejar`.

- **Escopo:**
  - páginas: Início, Finanças, Licitações, Sobre, Contato e Produtos;
  - partes comuns: cabeçalho, rodapé, SEO e componentes compartilhados.
- **Fora do escopo:** vitrine, app, Termos, Privacidade e modal de login (o texto do modal é funcional e está correto).
- **Tom pedido:** mais corporativo.

---

## Resumo

1. **Menu:** trocar "Produtos" por "Finanças" e "Licitações" é uma mudança pequena, que mexe em 9 arquivos. A decisão que pesa é o que fazer com a página `/produtos/`, que fica sem nenhum link no site.
2. **Textos:** os quatro problemas principais são estes.
   - O conceito "decidir com clareza" se repete umas 7 vezes e virou clichê.
   - Muitos títulos servem para qualquer empresa ("Duas soluções, o mesmo cuidado.", "Escolha o seu plano.").
   - O tom é coloquial: "a gente" aparece 6 vezes.
   - Os cards falam da função ("Favoritos", "Lançamento em lote") e não do ganho de quem compra.
3. **A Início é a página mais fraca.**
   - O título não diz o que a empresa faz.
   - Os cards das soluções são a versão mais pobre do site: só texto e uma seta. A versão rica, com imagem, benefícios e preço, aparece só nas páginas Produtos e Sobre.
4. **Ícones e cards:**
   - todos os cards do site usam o mesmo desenho: ícone de linha pequeno (20 px) num quadrado azul-claro, com pouco contraste;
   - alguns ícones não combinam com o texto ou passam uma imagem barata (coração para Favoritos, selo de desconto para Preço justo);
   - o mesmo card está copiado em 3 arquivos.
5. **Três erros de conteúdo:**
   - "Receitas recorrentes" contraria a regra de que recorrente é só do cartão de crédito;
   - "os seus dados ficam com você" é impreciso;
   - a pergunta "E se eu cancelar?" de Licitações só responde sobre o pagamento automático.

---

## 1. Menu e separação das abas

### Menu proposto

`Início · Finanças · Licitações · Sobre · Contato`, igual no computador e no celular.

- **Nomes curtos:** o logo FINGERENCE já fica ao lado no cabeçalho.
- **O destaque do menu:** cada página da solução acende o seu próprio item. Hoje, as duas acendem "Produtos".
- **A separação entre as soluções:** o cabeçalho é da empresa, e já hoje dá para ir de uma solução à outra pelo menu e pelo rodapé. A regra de "sem atalhos entre si" vale para os sistemas, não para o site.

### Onde mexer

| Arquivo | O que muda |
|---|---|
| [SiteHeader.tsx](../src/screens/public/components/SiteHeader.tsx) | `NAV_LINKS` com Finanças e Licitações. `isActive` deixa de tratar `/produtos/` como caso especial, porque `publicPageFor` já devolve a página da solução. |
| [publicPages.ts](../src/utils/publicPages.ts) | `isProductsArea` deixa de ser usada e sai. `PRODUCTS_PATH` sai se a página sair (decisão 1). |
| [publicPages.test.ts](../src/utils/publicPages.test.ts) | Sai o teste de `isProductsArea` (linhas 49 a 52). |
| [HomePage.tsx](../src/screens/public/HomePage.tsx) | 3 links para `/produtos/`: o botão do topo (linha 50), o "Ver detalhes e preços" (linha 96) e a chamada final (linha 131). |
| [ProductsPage.tsx](../src/screens/public/ProductsPage.tsx) | Fica ou sai (decisão 1). |
| [App.tsx](../src/App.tsx) | A rota `/produtos` (linha 86) e o redirecionamento de `/planos/*`, que hoje vai para `/produtos/` (linha 97). |
| [publicPages.json](../src/screens/public/publicPages.json) | A entrada `/produtos/` (decisão 1), além dos títulos e descrições novos (seção 2.6). |
| [sitemap.xml](../public/sitemap.xml) | `/produtos/` (decisão 1). |
| [index.html](../index.html) | A navegação de reserva, para quem abre sem JavaScript (linhas 40 a 42). |

Ficam como estão:
- `/produtos/financas/`, `/produtos/licitacoes/` e os endereços de login (`authOrigin.ts`);
- o rodapé, que já lista as duas soluções.

### Decisão 1: a página `/produtos/`

Com o menu novo e a Início apontando direto para as soluções, nenhum link do site leva mais a `/produtos/`. Ela só abriria por link antigo ou pelo Google.

- **A. Manter, fora do menu.** Os botões da Início continuam levando a ela. É o caminho mais seguro, mas a página repete o que a Início e a Sobre já mostram.
- **B. Remover e redirecionar `/produtos/` para a seção de soluções da Início (`/#solucoes`). Recomendado.**
  - Assim não sobra uma página órfã nem conteúdo repetido.
  - Também mudam o `/planos/*` em `App.tsx` e o 301 pendente do Render, que passam a apontar para a Início.

---

## 2. Textos

### 2.1 Diagnóstico geral

- **Slogan gasto:** "decidir com clareza" ou "decisão clara" aparece em:
  - o título da Início;
  - o texto da seção "A FINGERENCE";
  - a chamada final da Início;
  - o título e o texto da Sobre;
  - "Clareza antes de tudo";
  - o título do Google.

  Repetido assim, o conceito perde a força. A proposta deixa só uma ocorrência, no rodapé.
- **Títulos genéricos:**
  - na Início: "Duas soluções, o mesmo cuidado.";
  - na Sobre: "Feitas para o seu dia a dia.";
  - nas avaliações: "Quem usa, recomenda.";
  - no Finanças: "Tudo o que o dia a dia financeiro pede.", "Simples de usar desde o primeiro dia." e "Escolha o seu plano.";
  - no Licitações: "Um plano, sem surpresa.";
  - na chamada final da Sobre: "Quer conversar?".
- **Tom coloquial, contra o pedido de tom corporativo:**
  - "a gente" e "Fale com a gente" aparecem 6 vezes (Início, Sobre e Contato);
  - "sem robô no caminho", "num relance" e "sem planilha".
- **Função em vez de ganho:** "Lançamento em lote", "Favoritos", "Itens e arquivos" e "Busca completa" dizem o que existe, não o que a empresa ganha com isso.
- **Diferenciais que não aparecem no Finanças:**
  - o assistente Juca, que transforma uma frase em lançamento;
  - o pagamento da fatura (total, parcial ou parcelado);
  - a projeção do saldo dos próximos meses.

  Hoje eles aparecem só na tabela de planos, ou nem aparecem.
- **Regras que todas as sugestões abaixo respeitam:**
  - nenhuma usa "módulo", "produto", "mesmo login", PNCP, "titular", "cortesia" nem "assinatura recorrente";
  - nenhuma promete aviso por e-mail ou WhatsApp em Licitações, outras fontes de editais ou IA;
  - os preços e os 15 dias seguem `sitePricing.ts`.

### 2.2 Início ([HomePage.tsx](../src/screens/public/HomePage.tsx))

| Trecho | Atual | Proposta |
|---|---|---|
| Título do topo (h1) | Soluções de tecnologia para decidir com clareza. | **Tecnologia para controlar o caixa e conquistar contratos públicos.** (as alternativas estão na decisão 2) |
| Texto do topo | Criamos ferramentas simples para quem precisa decidir bem: sobre o dinheiro da casa e da empresa, e sobre novas oportunidades de negócio. | A FINGERENCE desenvolve duas soluções independentes: o FINGERENCE Finanças, para a gestão financeira pessoal e empresarial, e o FINGERENCE Licitações, para encontrar e acompanhar editais sem perder prazos. |
| Botões do topo | Conheça nossas soluções · Fale com a gente | Conhecer as soluções (desce até a seção) · Falar com a equipe |
| Seção 1, rótulo | A FINGERENCE | Por que a FINGERENCE |
| Seção 1, título | Informação espalhada vira decisão clara. | Do dado disperso à gestão com método. |
| Seção 1, texto | Contas, cartões, editais e prazos costumam ficar em planilhas e anotações soltas. A gente organiza tudo num sistema simples, que funciona no computador e no celular. / Você enxerga o que importa e decide com segurança, no seu ritmo. | Lançamentos, cartões, editais e prazos costumam se espalhar por planilhas, e-mails e anotações. Nossas soluções reúnem essas informações em um só ambiente, acessível pelo computador e pelo celular. / O resultado é previsibilidade: saber o que entra, o que sai e qual oportunidade merece a sua atenção. |
| Seção Soluções, título | Duas soluções, o mesmo cuidado. | Uma solução para cada frente do seu negócio. |
| Seção Soluções, cards | Cards só com texto e seta, mais o link "Ver detalhes e preços" | Os cards completos (`SolutionCards`), com imagem, 3 benefícios, preço e "Ver detalhes". O link "Ver detalhes e preços" sai. |
| Como trabalhamos, título | Simples de começar, justo no preço. | Condições claras desde o primeiro acesso. |
| Card 1 | 15 dias grátis / Teste qualquer solução antes de pagar. Sem cartão de crédito. | **15 dias** de avaliação gratuita / Acesso completo para avaliar a solução, sem cadastrar cartão de crédito. |
| Card 2 | A partir de R$ 4,99/mês / Preço justo e sem surpresa, por Pix ou cartão. Cancele quando quiser. | **R$ 4,99/mês** é o plano de entrada / Mensalidade sem fidelidade, paga por Pix ou cartão e cancelada pelo próprio sistema. |
| Card 3 | Atendimento direto / Fale com a gente por e-mail ou WhatsApp, sem robô no caminho. | **1 dia útil** é o prazo de resposta / Atendimento humano por e-mail e WhatsApp. |
| Botão | Quem somos | Conheça a FINGERENCE |
| Avaliações | O que dizem os usuários / Quem usa, recomenda. | Avaliações / Avaliado por quem usa todos os dias. |
| Chamada final | Pronto para decidir com mais clareza? / Escolha a solução certa e teste grátis por 15 dias. | Comece sua avaliação gratuita hoje. / 15 dias de acesso completo, sem cartão de crédito. |
| Botões finais | Conheça nossas soluções · Fale com a gente | FINGERENCE Finanças · FINGERENCE Licitações (cada um leva à sua página) |

**Cards das soluções** ([SolutionCards.tsx](../src/screens/public/components/SolutionCards.tsx)), usados na Início e na Sobre:

| Solução | Atual | Proposta |
|---|---|---|
| Finanças, frase | O dinheiro da casa e da empresa organizados, sem planilha. | Gestão financeira completa, da conta pessoal à empresa. |
| Finanças, benefícios | Receitas, despesas, cartões e parcelas num lugar só · Saldo de cada mês calculado sozinho · Relatórios claros para decidir | Receitas, despesas, cartões e parcelamentos em um único painel · Saldo do mês e projeção dos próximos meses, atualizados a cada lançamento · Relatórios por categoria e período, com exportação em PDF |
| Licitações, frase | Os editais que interessam, com aviso antes do prazo. | Os editais certos para a sua empresa, sem perder nenhum prazo. |
| Licitações, benefícios | Busca por região, órgão, modalidade e valor · Aviso quando sai edital novo · Lembrete antes do fim do prazo | Buscas por região, órgão, modalidade e faixa de valor · Notificação de novos editais que correspondem às suas buscas · Lembretes automáticos 3 dias e 1 dia antes do prazo |

### 2.3 Finanças ([FinancePage.tsx](../src/screens/public/FinancePage.tsx))

| Trecho | Atual | Proposta |
|---|---|---|
| h1 | O dinheiro da casa e da empresa organizados, sem planilha. | Controle financeiro completo, para você e para a sua empresa. |
| Texto do topo | Lance receitas e despesas em segundos, controle cartões e parcelas, veja o saldo de cada mês e decida com relatórios claros. | Registre receitas e despesas em segundos, acompanhe faturas e parcelamentos, projete o saldo dos próximos meses e decida com base em relatórios por categoria. |
| Recursos, rótulo e título | Benefícios / Tudo o que o dia a dia financeiro pede. | Recursos / Os recursos que a sua gestão financeira exige. |
| Card | Despesas sob controle / Simples, parceladas ou recorrentes, cada uma no mês certo e na categoria certa. | Despesas organizadas / À vista, parceladas ou recorrentes no cartão, cada uma no mês e na categoria corretos. |
| Card (**erro de regra**) | Receitas sempre à vista / Entradas únicas ou **recorrentes**, com o histórico de cada período. | Receitas previsíveis / Entradas avulsas ou fixas, com confirmação do recebimento e histórico por período. |
| Card (decisão 4) | Lançamento em lote / Várias receitas ou despesas de uma vez, para quem tem muito movimento. | **Assistente Juca** / Descreva a movimentação em uma frase e o lançamento é preenchido para você. (o lote passa para o card das despesas ou fica só na tabela de planos) |
| Card | Cartão sem surpresa / Limite real, parcelas e recorrências antes de a fatura chegar. | Cartões e faturas sob controle / Limite disponível, parcelas e cobranças recorrentes antes do fechamento, com pagamento total, parcial ou parcelado da fatura. |
| Card | Relatórios que ajudam a decidir / Para onde o dinheiro vai, por categoria e por mês. | Relatórios gerenciais / Visão por categoria e por período, com exportação em PDF. |
| Card | Casa e empresa separadas / Contas independentes para a vida pessoal e para cada empresa, no Premium. | Pessoal e empresarial separados / Contas independentes para as finanças pessoais e para cada empresa, no plano Premium. |
| Telas, título | Por dentro / Simples de usar desde o primeiro dia. | Por dentro / Uma interface objetiva, pensada para o uso diário. |
| Tela Calendário | O mês inteiro num relance: o que entrou, o que saiu e o que vence. | Visão mensal de entradas, saídas e vencimentos, dia a dia. |
| Tela Lançamentos | Receitas e despesas do mês, com saldo, categoria e forma de pagamento. | Todas as movimentações do mês, com saldo, categoria e forma de pagamento. |
| Tela Relatórios | Quanto entrou, quanto saiu e o saldo do período, lançamento por lançamento. | Entradas, saídas e saldo do período, com o detalhe de cada lançamento. |
| Link | Experimentar a demonstração | Acessar a demonstração |
| Passos, título | Comece em três passos. | Comece a usar em três etapas. |
| Passo 1 | Crie sua conta / Grátis por 15 dias, sem cartão de crédito. | Crie sua conta / Cadastro em minutos, com 15 dias de acesso completo e sem cartão de crédito. |
| Passo 2 | Lance o que entra e o que sai / No computador ou no celular, em poucos segundos. | Registre as movimentações / Pelo computador ou pelo celular, uma a uma, em lote ou pelo assistente Juca. |
| Passo 3 | Acompanhe e decida / Saldo do mês, cartões e relatórios sempre atualizados. | Acompanhe os resultados / Saldo, faturas e relatórios atualizados a cada lançamento. |
| Planos, título | Escolha o seu plano. | Planos para cada estágio da sua gestão. |
| Planos, texto | O teste de 15 dias tem tudo do Premium. Depois, você escolhe o plano dentro do sistema. | A avaliação gratuita inclui todos os recursos do Premium. Ao final, escolha o plano diretamente no sistema. |
| Starter | Uma conta, pessoal ou da empresa, com todo o financeiro. | Para a gestão de uma conta, pessoal ou empresarial, com todos os recursos financeiros. |
| Premium | Para quem tem empresa, equipe e vendas. | Para empresas com equipe, carteira de clientes e operação de vendas. |
| Pergunta sobre o banco (**impreciso**) | Não. Você lança o que quiser, e nada é ligado ao seu banco. Os seus dados ficam com você. | Não. O FINGERENCE Finanças não se conecta ao seu banco: você registra as movimentações, e nenhuma senha bancária é pedida. |
| Pergunta sobre o celular | Sim. Funciona no navegador do computador, do celular e do tablet. | Sim. O acesso é pelo navegador, no computador, no celular ou no tablet, sem instalar nada. |
| Pergunta sobre o pagamento | É mensal, por Pix, cartão ou pagamento automático no cartão. Você cancela quando quiser, e o acesso termina no cancelamento. | A cobrança é mensal, por Pix, cartão ou pagamento automático no cartão, sem fidelidade. O cancelamento pode ser feito a qualquer momento e encerra o acesso na hora. (confere com `backend/src/routes/plans.ts:256`) |
| Chamada final | Organize as suas finanças a partir de hoje. | Assuma o controle das suas finanças hoje. |

### 2.4 Licitações ([TendersPage.tsx](../src/screens/public/TendersPage.tsx) e [PriceTables.tsx](../src/screens/public/components/PriceTables.tsx))

| Trecho | Atual | Proposta |
|---|---|---|
| h1 | Os editais certos para o seu negócio, com aviso antes do prazo. | Encontre as licitações certas e não perca nenhum prazo. |
| Texto do topo | Encontre licitações abertas em todo o Brasil, receba aviso quando sai edital novo e acompanhe a participação da sua equipe num só lugar. | Monitore editais abertos em todo o Brasil, receba notificações de novas oportunidades e conduza a participação da sua equipe, da análise ao prazo final, em um único ambiente. |
| Passos, título | Da busca ao prazo, sem planilha. | Da busca ao prazo final, em três etapas. |
| Passo 1 | Diga o que procura / Palavras, região, órgão, modalidade e faixa de valor. Cada pessoa da equipe salva as suas buscas. | Defina o perfil de busca / Palavras-chave, região, órgão, modalidade e faixa de valor. Cada integrante da equipe salva as próprias buscas. |
| Passo 2 | Receba os avisos / Quando sai edital novo que combina com a sua busca, o aviso aparece no sistema. | Receba as oportunidades / Quando um novo edital corresponde à sua busca, a notificação aparece no sistema. |
| Passo 3 | Acompanhe até o fim / Leve o edital para o quadro (Analisar, Vou participar, Descartado) e receba lembretes antes do prazo. | Gerencie a participação / Classifique cada edital em Analisar, Vou participar ou Descartado e receba lembretes antes do prazo. |
| Recursos, rótulo e título | Benefícios / Tudo incluso, para toda a sua equipe. | Recursos / Recursos completos, para toda a equipe. |
| Card | Busca completa / Frases, exclusões e filtros de região, município, órgão, modalidade, valor e datas. | Busca avançada / Frases exatas, termos excluídos e filtros por região, município, órgão, modalidade, valor e datas. |
| Card | Aviso de edital novo / Cada busca salva avisa quando aparece edital que combina com ela. | Alertas de novos editais / Cada busca salva notifica quando surge um edital que corresponde a ela. |
| Card | Lembrete de prazo / Três dias e um dia antes do fim do prazo dos editais em que você vai participar. | Lembretes de prazo / Avisos 3 dias e 1 dia antes do encerramento dos editais em que a sua empresa vai participar. |
| Card | Quadro de acompanhamento / Analisar, Vou participar e Descartado, com observações e histórico. | Gestão da participação / Situação de cada edital (Analisar, Vou participar, Descartado), com observações e histórico compartilhados pela equipe. |
| Card | Favoritos / Cada pessoa guarda os editais que quer acompanhar de perto. | Favoritos individuais / Cada integrante destaca os editais que quer acompanhar de perto. |
| Card | Itens e arquivos / Os itens da compra e os arquivos do edital, a um clique. | Itens e documentos / Os itens da compra e os arquivos oficiais do edital, a um clique. |
| Preço, título | Um plano, sem surpresa. | Plano único, com todos os recursos. |
| Card do plano | Busca, avisos e acompanhamento dos editais, num só lugar. | Busca, alertas e gestão da participação em editais, em um único ambiente. |
| Item do plano (decisão 5) | Mais de um usuário por conta; acima do limite, cobrança adicional por usuário | Uso em equipe, com cobrança adicional por usuário acima do limite do plano |
| Pergunta "E se eu cancelar?" (**incompleta**) | No pagamento automático no cartão, o acesso continua até o fim do período já pago. As suas buscas e o acompanhamento ficam guardados. | O acesso continua até o fim do período já pago, em qualquer forma de pagamento, e as suas buscas e o acompanhamento ficam guardados. (conferir no `billing.ts` de Licitações antes de gravar) |
| Chamada final | Comece a acompanhar os editais hoje. | Sua próxima licitação pode estar publicada hoje. |

### 2.5 Sobre e Contato

| Trecho | Atual | Proposta |
|---|---|---|
| Sobre, h1 | Tecnologia simples para decidir com clareza. | Tecnologia que transforma informação em gestão. |
| Sobre, texto | A FINGERENCE nasceu para organizar as finanças sem planilhas soltas. Hoje também ajuda empresas a encontrar as licitações certas. O que nos move é o mesmo: transformar informação espalhada em decisões claras. | A FINGERENCE nasceu para organizar finanças sem depender de planilhas soltas. Hoje, também apoia empresas na busca e no acompanhamento de licitações públicas. Nas duas frentes, o compromisso é o mesmo: entregar informação confiável, organizada e pronta para a decisão. |
| Princípios, título | O que nos guia / Clareza antes de tudo. | Nossos princípios / O que orienta o nosso trabalho. |
| Princípio 1 | Clareza / Saldos, prazos e valores à vista, sem números escondidos. | Transparência / Saldos, prazos e valores sempre visíveis, sem custos ocultos. |
| Princípio 2 | Privacidade / Nada ligado ao seu banco, e os dados do cartão ficam com o Mercado Pago. | Segurança e privacidade / Sem conexão com a sua conta bancária, e os dados de cartão são processados pelo Mercado Pago. |
| Princípio 3 | Preço justo / A partir de R$ 4,99 por mês… | Preço acessível / Planos a partir de R$ 4,99 por mês, com 15 dias de avaliação gratuita. (usar o mesmo menor preço da Início, e não só o de Licitações) |
| Princípio 4 | Melhoria contínua / Cada solução evolui com o uso real e com o retorno de quem usa. | Evolução contínua / As soluções evoluem a partir do uso real e do retorno de quem as utiliza. |
| Soluções, título | Nossas soluções / Feitas para o seu dia a dia. | Nossas soluções / Conheça as soluções da FINGERENCE. |
| Chamada final | Quer conversar? / Dúvidas, sugestões ou parcerias: fale com a gente. | Fale com a nossa equipe. / Dúvidas comerciais, suporte ou parcerias: estamos à disposição. |
| Contato, h1 | Fale com a gente. | Fale com a nossa equipe. |
| Contato, texto | Dúvidas, suporte ou sugestões: escreva para a gente. Respondemos em até 1 dia útil. | Dúvidas comerciais, suporte técnico ou sugestões: a nossa equipe responde em até 1 dia útil. (decisão 6) |
| Campo do formulário | Sobre | Assunto |

### 2.6 Rodapé e Google ([brand.ts](../src/brand.ts) e [publicPages.json](../src/screens/public/publicPages.json))

- **`COMPANY_TAGLINE`:** hoje é usado no título da Início e no rodapé.
  - Com o título novo, a frase do rodapé passa a ser "Tecnologia para gestão financeira e licitações públicas.".
  - Esse vira o único lugar do conceito, e ele é separado do título da Início.
- **Título da Início no Google:** de "FINGERENCE | Soluções de tecnologia para decidir com clareza" para "FINGERENCE | Gestão financeira e licitações públicas".
- **Descrições:** as de cada página acompanham os textos novos, e os textos de reserva (`fallback`) também.
- **`navLabel`:** os nomes completos ("FINGERENCE Finanças") continuam na navegação de reserva, que é só para quem abre sem JavaScript e para o Google.

---

## 3. Cards e ícones

### 3.1 O que existe hoje

| Onde | Ícones | Problema |
|---|---|---|
| Início, "Como trabalhamos" | CalendarCheck, Wallet, Headphones | Usa ícone onde o forte é o número (15 dias, R$ 4,99, 1 dia útil). |
| Início, Soluções | Seta | Card só com texto, mais pobre que o da Sobre e o da Produtos. |
| Finanças, recursos | ReceiptText, TrendingUp, ListPlus, CreditCard, BarChart3, Layers | Layers ("camadas") não tem relação com "Casa e empresa separadas". |
| Licitações, recursos | Search, BellRing, CalendarClock, Columns3, Heart, FileText | Heart (coração) tem cara de app de consumo. Columns3 lembra uma tabela, não um quadro de acompanhamento. |
| Sobre, princípios | Eye, ShieldCheck, BadgePercent, RefreshCw | BadgePercent passa a ideia de promoção e desconto, o que barateia a marca. RefreshCw parece o botão de "recarregar". |
| Contato | Mail, MessageCircle | O balão genérico não é reconhecido como WhatsApp. |
| Passos (Finanças e Licitações) | Número "01" em 13 px | O número é tão pequeno que some. Os passos parecem cards comuns. |

**O desenho é o mesmo em todo o site:**
- ícone de linha de 20 px num quadrado de 44 px azul bem claro (`bg-[#e6f6f8]`), dentro de um card branco sem sombra;
- todos os cards são iguais, então nada se destaca, e o resultado lembra um modelo pronto;
- o ícone pequeno e claro ainda perde contraste.

**O mesmo card está copiado em 3 lugares:**
- `FeatureGrid.tsx`, linhas 29 a 35;
- `AboutPage.tsx`, linhas 46 a 52;
- `HomePage.tsx`, linhas 112 a 118.

Com as cópias, qualquer melhoria visual precisa ser feita 3 vezes.

### 3.2 Padrão visual proposto

1. **Um componente só** para o card com ícone, usado na Início, no Finanças, no Licitações e na Sobre. Assim sai a cópia.
2. **Ícone em destaque:**
   - quadrado de 52 px com degradê da marca (do `#08343d` ao `brand-600`) e ícone branco de 24 px, com traço de 1,75;
   - o card ganha uma sombra leve e, ao passar o mouse, a borda fica azul e o card sobe 2 px (respeitando "reduzir movimento").
3. **"Como trabalhamos" da Início vira um bloco de números**, sem ícone:
   - o número grande e fino ("15 dias", "R$ 4,99", "1 dia útil"), com o texto embaixo;
   - é o formato comum em sites corporativos.
4. **Passos com número grande:**
   - "01", "02" e "03" com uns 44 px, na cor da marca;
   - no computador, uma linha fina liga um passo ao outro.
5. **Soluções na Início:** os cards completos (`SolutionCards`).
6. **Contato:** o símbolo do WhatsApp em SVG próprio, porque o lucide não tem marcas.

**Troca de ícones sugerida** (os nomes precisam ser conferidos na versão 1.23 do lucide, a instalada):

| Card | Atual | Sugerido |
|---|---|---|
| Despesas organizadas | ReceiptText | ReceiptText (mantém) |
| Receitas previsíveis | TrendingUp | HandCoins |
| Assistente Juca | ListPlus | MessageSquareText |
| Cartões e faturas | CreditCard | CreditCard (mantém) |
| Relatórios gerenciais | BarChart3 | ChartPie |
| Pessoal e empresarial | Layers | Building2 |
| Busca avançada | Search | FileSearch |
| Alertas de novos editais | BellRing | BellRing (mantém) |
| Lembretes de prazo | CalendarClock | CalendarClock (mantém) |
| Gestão da participação | Columns3 | SquareKanban |
| Favoritos individuais | Heart | Bookmark |
| Itens e documentos | FileText | Files |
| Transparência | Eye | ScanEye |
| Segurança e privacidade | ShieldCheck | ShieldCheck (mantém) |
| Preço acessível | BadgePercent | Wallet |
| Evolução contínua | RefreshCw | TrendingUp |

---

## 4. Coerência entre as páginas

1. **Conteúdo repetido:** as soluções aparecem na Início, na Produtos e na Sobre, em duas versões diferentes de card. Com a decisão 1B e a Início usando os cards completos, fica uma versão só.
2. **Preço "a partir de":** a Início usa o menor preço das duas soluções, e a Sobre usa só o de Licitações (`AboutPage.tsx:22`). Hoje os dois dão R$ 4,99, mas a conta deveria ser a mesma.
3. **Cancelamento diferente entre as soluções:** no Finanças, o acesso termina na hora; no Licitações, vai até o fim do período pago. O texto está certo nos dois casos. Só está registrado aqui porque é uma diferença que o cliente pode notar.
4. **"Respondemos em até 1 dia útil":** a promessa já está no Contato. Com a proposta, ela também vai para a Início (decisão 6).
5. **Comentários com "módulo" no código:** `FeatureGrid.tsx:17`, `PriceTables.tsx:137` e `TendersPreview.tsx:4`. Não aparecem para o visitante. Podem ser ajustados junto, se a implementação já mexer nesses arquivos.

---

## Decisões em aberto

1. **Página `/produtos/`:**
   - A. manter fora do menu;
   - **B. remover e redirecionar para `/#solucoes`. Recomendado.**
2. **Título do topo da Início:**
   - **a) "Tecnologia para controlar o caixa e conquistar contratos públicos." Recomendado: é concreto e fala dos dois ganhos.**
   - b) "Gestão financeira e licitações públicas, com método e previsibilidade." Mais neutro.
   - c) "Controle financeiro e licitações públicas em soluções feitas para a sua empresa crescer."
3. **Ícones:**
   - **A. Lucide, o pacote de hoje, com o estilo novo da seção 3.2. Recomendado: não adiciona dependência.**
   - B. Trocar pelo Phosphor no estilo duotone, de dois tons, que tem um visual mais rico, mas é uma biblioteca nova.
4. **Assistente Juca no lugar do "Lançamento em lote" nos recursos do Finanças?** Recomendado: sim, porque é o diferencial mais forte, e o lote continua na tabela de planos.
5. **Item de usuários do plano de Licitações:** pode ser reescrito como na seção 2.4, mantendo a regra de não mostrar o valor no card?
6. **"Resposta em até 1 dia útil":** é um compromisso que dá para cumprir? Se não for, o card 3 da Início vira "Atendimento humano", sem prazo.
