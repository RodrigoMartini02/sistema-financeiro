# Proposta — empresa, produtos e site

> v0.2 — 06/10/2026. Atualiza a v0.1 com as decisões tomadas depois: um domínio só, sistema com módulos e a divisão Starter × Premium (já em produção). Proposta para decisão, sem código: cada parte vira um `/planejar` próprio (seção 8).

---

## 1. Decidido

**Empresa e produtos**
- A empresa ganha nome novo. **FINGERENCE** continua como o módulo de finanças. Licitações ganha nome de produto.
- **Um sistema só, com dois módulos** vendidos à parte, na mesma base de usuários. Cada módulo tem assinatura e usuários próprios.

**FINGERENCE** (em produção desde 06/10/2026, merge `655b6802`; plano em `.plans/planos-starter-premium.md`)
- **Starter**, R$ 4,99/mês, e **Premium**, R$ 9,99/mês. Só mensal: o anual saiu.
- **Starter:** a Conta Padrão (pessoal ou empresa), só o titular, todo o financeiro.
- **Premium:** várias contas, equipe e a parte comercial.
- **Trava:** no backend (403 `PLAN_UPGRADE_REQUIRED`), com o aviso "Disponível no Premium" no app.
- **Teste:** 15 dias, com tudo do Premium.
- Não havia assinante no anual nem pagando o Plus com recurso do Premium: não houve regra de transição.

**Licitações**
- Sem permissões: o titular só cadastra os usuários.
- R$ 4,99/mês por conta, com até 2 usuários. Cada usuário a mais, R$ 2,99/mês.
- 15 dias grátis.

**Domínio e site**
- **Um domínio só**, o da empresa, com os dois módulos. Registro do domínio e pedidos no INPI ficam com o Rodrigo.
- `fin-gerence.com.br` continua até o site mudar de endereço. Depois, redireciona (seção 3).
- **Site:** home da empresa, moderna e genérica, com os dois módulos em cards, e uma página por módulo (seção 6).
- **Vídeo e imagens:** de bancos com uso comercial liberado.

---

## 2. Nomes (em aberto)

Domínios consultados no registro.br em 06/10/2026. A situação muda a qualquer hora: registrar logo depois de decidir. A busca na web não achou empresa nem software com estes nomes; a que vale é a do INPI (seção 4).

### Empresa

| Nome | Domínio | Ideia |
|---|---|---|
| **Claravia** (recomendado) | `claravia.com.br` livre | "Via clara": clareza e direção, a promessa dos dois módulos. Fácil de falar e de escrever. |
| Orvalis | `orvalis.com.br` livre | Inventado, sem significado: fácil de registrar, mas sem história para contar. |
| Lucevia | `lucevia.com.br` livre | "Luz" + "via". Parecido com Claravia, menos claro em português. |

### Produto de Licitações

| Nome | Domínio livre | Ideia |
|---|---|---|
| **Arauto** (recomendado) | `arautoeditais.com.br`, `arautolicitacoes.com.br` | O arauto é quem anuncia: o produto avisa o edital novo. Tom clássico, como o logo do FINGERENCE. O `arauto.com.br` é de outra pessoa. |
| Bateia | `bateiaeditais.com.br`, `usebateia.com.br` | A bateia do garimpo separa o ouro: o edital certo no meio de milhares. Bem brasileiro, mas pede explicação. |
| Certamia | `certamia.com.br` (exato) | Vem de "certame", a disputa da licitação. O "IA" no fim pode sugerir inteligência artificial, que o produto não tem. |
| Lince Editais | `linceeditais.com.br` | "Olhos de lince": não deixa passar edital. "Lince" sozinho é comum; a marca seria o conjunto. |

Assinatura: "FINGERENCE e Arauto são produtos Claravia."

---

## 3. Domínio

- **Um domínio só:** o da empresa (ex.: `claravia.com.br`).
  - Custa R$ 40/ano no registro.br.
  - O titular deve ser o CNPJ da empresa. O `.com.br` também pode passar do CPF para o CNPJ depois, com documentos dos dois e análise em 2 dias úteis.
- **Domínio do produto de Licitações:** opcional, só para proteger o nome (R$ 40/ano).
- **`fin-gerence.com.br`** (vence em 08/02/2027):
  - quando o site mudar de endereço, cada página antiga leva para a equivalente no domínio novo, com redirecionamento permanente (301) feito pela hospedagem. O redirecionamento do próprio registro.br é temporário (302);
  - o Google pede manter o redirecionamento por pelo menos 1 ano: renovar em fevereiro de 2027 por mais 1 ano e depois deixar vencer.
- **O que a mudança de endereço custa (uma vez):**
  - o navegador guarda login, app instalado e notificações por endereço: quem já usa entra de novo, reinstala o app do Juca e reativa as notificações push;
  - a posição no Google oscila durante a mudança e depois se acomoda;
  - configuração: origens liberadas no backend (`ALLOWED_ORIGINS`), `FRONTEND_URL`, login com Google, retorno do Mercado Pago e hospedagem.
- **Login:** num domínio só, o login vale para o sistema todo. Quem entra em um módulo já está logado no outro, se tiver aquele módulo. O sistema já funciona assim: `/app.html`, `/licitacoes/app` e o menu "Módulos".

---

## 4. INPI

- **Não é obrigatório para funcionar, mas é recomendado antes de divulgar os nomes.**
  - No Brasil, a marca é de quem pede primeiro, com poucas exceções.
  - Domínio e razão social não protegem a marca; a marca vale mesmo sem domínio próprio.
- **O que registrar:** o nome do produto de Licitações, o da empresa e FINGERENCE (se ainda não tiver pedido).
- **Classe:**
  - a 42 (software como serviço) é a principal para cada marca;
  - cada classe é um pedido e uma taxa;
  - reforços comuns: 9 (aplicativo), 35 (informação comercial, para Licitações) e 36 (finanças, para o FINGERENCE). Um agente de propriedade industrial confirma.
- **Custo** (tabela vigente desde 20/09/2025):
  - pedido com especificação pré-aprovada: R$ 880 por classe, ou **R$ 440 com o desconto de 50%** (pessoa física, MEI, ME e EPP, entre outros);
  - a taxa de concessão acabou: se aprovado, o certificado sai sem custo;
  - renovação a cada 10 anos: R$ 1.000 por classe (R$ 500 com desconto);
  - **três marcas na classe 42, com desconto: R$ 1.320.**
- **Passo a passo:**
  1. busca de marcas no INPI ([pePI](https://busca.inpi.gov.br/pePI/)), na classe 42, pelo nome exato e pelos parecidos;
  2. GRU e pedido pelo e-Marcas, com especificação pré-aprovada;
  3. acompanhar a Revista da Propriedade Industrial: prazo de oposição de 60 dias e exigências;
  4. aprovado, o certificado vale 10 anos.
- **Enquanto espera:** a data do pedido já garante a prioridade, e o nome pode ser usado.
- **Nome que só descreve o serviço é recusado** (ex.: "Alerta de Licitações"). Por isso a lista da seção 2 evita esse tipo.

---

## 5. Produtos e preços

### FINGERENCE (em produção)

| | Starter — R$ 4,99/mês | Premium — R$ 9,99/mês |
|---|---|---|
| Contas | Só a Conta Padrão (pessoal ou empresa) | Várias (pessoal e empresas) |
| Pessoas | Só o titular | Membros e colaboradores, com setores e cargos |
| Lançamentos, lote, cartões, painel, planejamento, relatórios, agenda e avisos | ✓ | ✓ |
| Assistente Juca | ✓ | ✓ |
| Categorias, representantes e sócios | ✓ | ✓ |
| Clientes, contratos e catálogo de serviços | — | ✓ |
| Produtos, estoque, vitrine e pedidos | — | ✓ |
| Suporte prioritário | — | ✓ |

- Sem Premium (Starter ou plano vencido), a loja pública sai do ar. Pedidos já feitos seguem consultáveis.
- O membro de um titular sem Premium não entra no app.

### Licitações (Arauto)

- **Plano único:** R$ 4,99/mês por conta, com 2 usuários. Cada usuário a mais, R$ 2,99/mês.
  - Exemplo: 4 usuários = R$ 4,99 + 2 × R$ 2,99 = **R$ 10,97/mês**.
- **Tudo incluso:**
  - busca no PNCP com filtros (UF, município, órgão, modalidade, valor, datas, número ou processo);
  - buscas salvas que avisam o edital novo;
  - favoritos;
  - quadro de acompanhamento (Analisar, Vou participar, Descartado), com histórico;
  - lembretes de prazo, 3 dias e 1 dia antes;
  - itens e arquivos do edital.
- **Sem permissões:** todos os usuários usam tudo. O titular cadastra e remove usuários e cuida da assinatura.
- Teste de 15 dias.
- **O que a página não promete** (hoje não existe): aviso por e-mail ou WhatsApp (o aviso é só dentro do sistema), outras fontes além do PNCP e IA. Os concorrentes vendem aviso por e-mail e WhatsApp.

### Comum aos dois

- Pagamento pelo Mercado Pago: Pix, cartão e cartão recorrente. Só mensal.
- A referência do pagamento já leva o módulo (`fin:<usuário>:<plano>`). Licitações terá a sua (ex.: `lic:<conta>`), para o webhook nunca confundir os módulos.

---

## 6. Site

Atualizada pela versão 2 do site novo (07/10/2026, plano `.plans/site-novo.md`).

### Estrutura (um domínio)

```
/                       Início (empresa): vídeo, frase, como trabalhamos, quem somos, avaliações
/produtos               as duas soluções em cards; o card inteiro leva aos detalhes
/produtos/financas      FINGERENCE Finanças: benefícios, telas, planos, perguntas, "Começar grátis"
/produtos/licitacoes    FINGERENCE Licitações: como funciona, benefícios, preço, perguntas, "Começar grátis"
/sobre  /contato  /termos  /privacidade
/loja/<nome>            vitrines das lojas (não muda)
```

- **Sistemas:** continuam em `/app.html` (FINGERENCE Finanças) e `/licitacoes/app` (Licitações). `/licitacoes` continua abrindo o sistema, sem mudança na hospedagem.
- **Endereços antigos:** `/funcionalidades/` leva a `/produtos/financas/` e `/planos/` a `/produtos/`, pelo próprio site (301 na hospedagem é opcional).
- **Cabeçalho:** Início, Produtos, Sobre e Contato. "Entrar" e "Começar grátis" só nas páginas de cada solução; nas páginas da empresa, um "Acessar" discreto para quem já é cliente.
- **"Começar grátis":** cria a conta na solução da página. As soluções ficam separadas no site e nos sistemas: sem atalhos de uma para a outra, e o cadastro por Licitações não abre o teste do FINGERENCE.
- **Textos:** comerciais, sem "módulo"; "produto" só no menu. A fonte dos dados de Licitações (PNCP) só aparece nos termos e na privacidade.
- **Termos e privacidade:** da empresa, cobrindo as duas soluções.

**Por que não só os cards, nem só duas páginas:**
- card não vende nem aparece no Google: cada módulo precisa de página própria, com preço, recursos e perguntas, para buscas como "alerta de licitações" e "controle financeiro";
- a home da empresa dá a identidade e orienta quem chega sem saber qual módulo procura.

### Home da empresa (estilo Claude)

1. **Topo:** vídeo em loop, sem som (cidade à noite vista de cima, 12,5 s), a frase "Soluções de tecnologia para decidir com clareza." e dois botões: "Conheça nossas soluções" e "Fale com a gente".
2. **A empresa:** "Informação espalhada vira decisão clara.", com as duas soluções em destaque, cada uma levando aos detalhes.
3. **Como trabalhamos:** três cards ("Simples de começar, justo no preço.").
4. **Avaliações** (as que já existem) e **chamada final**.

Os cards das duas soluções, com imagem, ficam em Produtos (e em Sobre).

- No celular, uma imagem no lugar do vídeo, para economizar dados. Quem pede "reduzir movimento" vê o vídeo parado.
- As páginas dos módulos seguem o mesmo molde, com as telas do produto.

### Visual

- **Sem modelo comprado:** feito com o que o projeto já tem (React, Tailwind e as animações do framer-motion), com inspiração na home do Claude.
  - Letras grandes, bastante espaço em branco, vídeo no topo, cards e animações leves ao rolar a página.
- Modelos prontos costumam vir em outra tecnologia e deixariam código sobrando (regra do redesign).

### Mídia

- **Fontes:** Pexels, Unsplash e Pixabay (uso comercial liberado, sem crédito obrigatório).
- **Cuidados:**
  - sem marcas ou logos visíveis;
  - sem pessoa parecendo recomendar o produto;
  - sem telas de outros sistemas;
  - um arquivo de créditos guarda a origem e a licença de cada mídia.
- **Vídeo:** até uns 4 MB, 720p ou 1080p, com imagem de capa.
- **Telas do produto:** tiradas da demonstração, que só tem dados fictícios.
- Se algum banco bloquear o download automático, os links vão para o Rodrigo baixar.

### Reaproveitar e apagar

- **Fica:**
  - cabeçalho, rodapé, login e aviso de cookies;
  - Contato, termos e privacidade (com texto novo);
  - SEO, animação de entrada das seções e a demonstração (em outra aba, pelo link "Experimentar a demonstração" na página de Finanças, que mostra as telas em imagem);
  - o gerador de páginas do build (`scripts/generate-public-route-html.mjs`), que cria título, descrição e prévia do link no WhatsApp por página: ganha as rotas novas, assim como o `sitemap.xml`.
- **Sai, antes de montar o novo** (regra do redesign: sem sobras): as páginas Home, Funcionalidades, Planos e Sobre atuais, os destaques da home, o topo com imagem fixa e a imagem `icons/home-hero-bg.png`.

---

## 7. O que muda no sistema (para o `/planejar` de cada parte)

### Parte 2 — Licitações como produto

- **Assinatura da conta no módulo:** tabela no schema `licitacoes`. Exige migration.
- **Cadastro aberto** pela entrada do módulo, com a marca do módulo.
- **Tela de usuários:** o titular cadastra e remove, sem permissões. Limite de 2 incluídos e cobrança do usuário extra.
- **Cobrança** pelo Mercado Pago, com referência própria do módulo, e rotina diária vencendo as assinaturas.
- **Teste** de 15 dias.
- **Contas habilitadas hoje pelo admin:** destino a decidir (seção 9).
- **Ponto de atenção:** hoje todo cadastro nasce com o teste do FINGERENCE (`usuarios.plano_status` = `trial`, contado da data do cadastro).

### Parte 3 — Site novo

Seção 6.

### Parte 4 — Marca e domínio

- Nomes da empresa e do módulo num arquivo de marca.
- E-mails (EmailJS), app instalável e descrição da cobrança no Mercado Pago.
- Termos e privacidade da empresa.
- Troca de domínio (seção 3).

---

## 8. Ordem

1. ~~Planos do FINGERENCE~~: feito em 06/10/2026.
2. Licitações como produto: implementada na branch `feat/R/licitacoes-produto` (plano `.plans/licitacoes-produto.md`). Falta aplicar a 0080 na produção e fazer o merge.
3. Site novo: versão 2 implementada na branch `feat/R/site-novo` (plano `.plans/site-novo.md`), feita a partir da parte 2. Vai ao ar depois dela. Não muda as regras da hospedagem.
4. Marca e domínio.

- **Em paralelo (Rodrigo):** nomes, busca no INPI, registro do domínio e pedidos no INPI.
- **Por que a parte 2 vem antes da 3:** o site vende Licitações com "Começar grátis", que precisa do cadastro do módulo.

---

## 9. Em aberto

1. **Nomes:** Claravia (empresa) e Arauto (Licitações)? Até a parte 4, o site usa FINGERENCE como empresa e os módulos "Finanças" e "Licitações", num arquivo de marca (`src/brand.ts`).
2. ~~Licitações: os 2 usuários incluídos contam o titular?~~ Sim (plano da parte 2).
3. ~~Usuário extra: valor novo a partir da próxima cobrança?~~ Sim, sem cobrar a diferença (plano da parte 2).
4. ~~Contas já habilitadas em Licitações viram cortesia?~~ Sim (plano da parte 2).
5. ~~Teste do FINGERENCE no cadastro por Licitações?~~ Não abre mais: o FINGERENCE nasce `sem_teste`, e o teste começa quando a pessoa pede dentro dele (site novo v2, decisão 5; antes, na parte 2, o cadastro abria os dois testes).
6. ~~Site: endereços e "Começar grátis"?~~ `/produtos/financas/` e `/produtos/licitacoes/`, com `/licitacoes` ainda abrindo o sistema; "Começar grátis" só nas páginas de cada solução, criando a conta naquela solução (site novo v2).

---

## Fontes

- INPI, perguntas e respostas da tabela de retribuições: https://www.gov.br/inpi/pt-br/inpi-data/precificacao-dos-servicos/PerguntaseRespostas
- Valores do INPI em 2026: https://oficialmarca.com.br/blog/quanto-custa-registrar-marca-2026/
- Preço do domínio: https://registro.br/ajuda/pagamento-de-dominio/
- Registro.br: novo domínio (o nome não muda: https://registro.br/ajuda/registro-de-novos-dominios/), transferência de titularidade (https://registro.br/ajuda/procedimentos-administrativos/transferencia-de-titularidade/), categorias (https://registro.br/dominio/categorias/) e redirecionamento (https://registro.br/ajuda/gerenciamento-de-conta/redirecionamento-dns-avancado/).
- Disponibilidade e vencimento dos domínios: RDAP do registro.br (`https://rdap.registro.br/domain/<domínio>`), em 06/10/2026.
- Mudança de endereço no Google: https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes
- Concorrentes de Licitações: https://www.b2bstack.com.br/product/alerta-licitacoes, https://licitagov.org/, https://monitoralicitacoes.com.br/guia-busca/software-alerta-novos-editais/
