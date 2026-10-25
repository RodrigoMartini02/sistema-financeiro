# Estudo: fontes de contratos e licitações para uma busca completa

- Data: 2026-10-15
- Objetivo: saber se o PNCP basta para o cliente encontrar contratos e licitações (por CNPJ, órgão e demais filtros), onde estão os dados que ele não tem (contratos da Lei 8.666, prefeituras pequenas, estatais) e quais fontes dão dados completos.
- Escopo: estudo sem código. Consultas só de leitura a APIs e páginas públicas, arquivos baixados na pasta temporária da sessão e o banco local.
- Relacionados: `.plans/estudo-fontes-licitacoes.md` (06/10, editais), `.plans/licitacoes-contratos-a-vencer.md` (Partes A e B) e `.plans/licitacoes-contratos-coleta-sem-perda.md`.

## 1. O que o cliente precisa

| Uso | Pergunta do cliente | Dado necessário |
| --- | --- | --- |
| Licitações abertas | "Onde posso vender agora?" | Edital aberto: órgão, objeto, prazo, valor e plataforma da disputa |
| Contratos a vencer | "Que contrato vai acabar e virar licitação nova?" | Contrato vigente: fornecedor, valor, fim da vigência e aditivos |
| Histórico e concorrência | "Onde e por quanto esse CNPJ (concorrente, parceiro, eu) já contratou?" | Todos os contratos e resultados por fornecedor e por órgão, vigentes e encerrados |

Os três usos pedem uma **base própria**: a API do PNCP só filtra contratos por data de publicação e por órgão (conferido no OpenAPI de `/v1/contratos` e `/v1/contratos/atualizacao`). Achar os contratos de um CNPJ "na hora" exigiria ler os cerca de 5 milhões de registros desde 2021 (68 a 78 h, medido no piloto).

## 2. Caso de teste: Diretriz Informática Ltda (CNPJ 22.493.902/0001-40)

Empresa de Varginha (MG), de software de gestão pública.

- **Busca do portal do PNCP (navegador):** 35 contratos, 14 vigentes e 21 encerrados. Quase todos com prefeituras, câmaras e autarquias de MG; 1 em Caracaraí (RR).
- **Nossa base local (piloto):** zero. A base local tem setembro/2026 completo e uma amostra de 42 dias; os 14 vigentes foram publicados entre março e julho/2026. Todos passam nas regras da Parte A (termo inicial, 1 ano, vigentes) e entrariam com a carga completa.
- **Compras.gov.br, resultados da 14.133 (todas as esferas):** 26 itens vencidos desde 2023 (MG e RR), consulta por CNPJ em menos de 1 s.
- **Contratos da Diretriz pela 8.666 (antes de 2024):** não estão no PNCP (ver seção 3). Estariam no SICOM do TCE-MG, que não permite coleta automática (seção 4.5).

## 3. Por que o PNCP não basta

- **Sem busca por fornecedor na API** (seção 1).
- **Lei 8.666 fora do PNCP:** a tabela de amparos legais do PNCP tem 189 amparos ativos e nenhum inativo; nenhum da 8.666, da 10.520 (pregão) ou da 12.462 (RDC). Há 82 da 14.133 e 47 da 13.303 (estatais). Contrato da lei antiga não entra no PNCP, salvo cadastro irregular.
- **E esses contratos seguem vigentes:** quem optou pela lei antiga até o fim de 2023 assinou pela 8.666, e o contrato fica regido por ela durante toda a vigência (art. 191, parágrafo único, da Lei 14.133). Serviço contínuo pode ir a 60 meses, ou 72 em caráter excepcional (art. 57, II e § 4º, da 8.666): há contratos da 8.666 vigentes até 2028–2029.
- **Medido no federal (UFMG, Compras.gov.br):** 167 contratos (tipo "Contrato") terminam nos próximos 12 meses; só 104 (62%) têm número no PNCP. Dos 30 iniciados em 2020–2022, só 1 está no PNCP; 6 assinados em 2024, de um pregão de 2023, também não estão.
- **Medido no municipal (RS, LicitaCon do TCE-RS):** contratos assinados em 2022 e 2023 ainda vigentes hoje, pela data final do contrato:
  - 2022: 7.540 contratos, 801 órgãos, 4.706 fornecedores, R$ 9,8 bi; 6.607 terminam nos próximos 12 meses;
  - 2023: 9.533 contratos, 897 órgãos, 5.805 fornecedores, R$ 10,3 bi; 7.603 terminam nos próximos 12 meses;
  - quase todos pela lei antiga, fora do PNCP. É o melhor tipo de "contrato a vencer": no limite de prazo, o órgão é obrigado a licitar de novo.
- **Prefeituras até 20 mil habitantes:** até 1º/4/2027 podem publicar só no diário oficial, inclusive só o extrato (art. 176 da 14.133).
- **Estatais e Sistema S:** o PNCP aceita a 13.303 (algumas estatais publicam), mas não há obrigação; o Sistema S segue regulamento próprio (estudo de 06/10).

## 4. Fontes avaliadas

### 4.1 PNCP, API de consulta (já usada)

- **Tem:** contratações, atas e contratos da 14.133 de todas as esferas, desde 2021 (cerca de 5 milhões de registros de contratos).
- **Filtros:** só data e órgão.
- **Uso:** coletar tudo para a base própria. Hoje guardamos só os vigentes (termo inicial, 180 dias ou mais); para o histórico, guardar todos (cerca de 9 GB pelo tamanho medido no piloto).

### 4.2 PNCP, busca do portal

- Tem busca por CNPJ em todos os documentos (achou os 35 da Diretriz), mas não é a API pública e recusa conexão vinda de programa (só respondeu num navegador). **Não usar** como fonte do produto.

### 4.3 Compras.gov.br, dados abertos (API oficial, sem chave)

| Módulo | O que tem | Filtros | Verificado |
| --- | --- | --- | --- |
| `modulo-contratos` | Contratos do Contratos.gov.br, **inclusive da 8.666**: fornecedor, objeto, vigência, valor, valor acumulado, número no PNCP quando existe | Fornecedor e **fim da vigência**; exige o órgão (1.158 órgãos federais) | UFMG: 1.575 registros com fim nos próximos 12 meses (167 contratos, o resto empenhos). Prefeitura de Albertina (MG): zero, então na prática é federal |
| `modulo-contratacoes` (resultados) | Resultado de cada item da 14.133, **todas as esferas**: fornecedor vencedor, valor homologado, porte | **Fornecedor, sem órgão**, janela de até 365 dias | Diretriz: 26 itens, em menos de 1 s |
| `modulo-legado` | Licitações federais antigas: pregões com vencedor, dispensas, RDC | Fornecedor e datas | Não testado com caso real |
| `modulo-arp` | Itens de atas de registro de preço | Fornecedor e vigência | Não testado |
| `modulo-uasg` | 12.083 órgãos ativos (8.229 municipais, 2.664 estaduais, 1.158 federais) | Situação | Baixado |

- **Cuidado:** um contrato federal pode estar no PNCP e no Compras.gov.br. O campo `numeroControlePncpContrato` resolve a duplicidade.

### 4.4 Portal da Transparência (CGU)

- `GET /api-de-dados/contratos/cpf-cnpj`: contratos federais por CNPJ do fornecedor, sem precisar do órgão. Exige chave gratuita (cadastro com conta gov.br). Mesmos dados federais do 4.3; útil para busca na hora por CNPJ no federal. Não testado (sem chave).

### 4.5 Tribunais de contas (estados e municípios, 8.666 e 14.133)

São a única fonte estruturada dos contratos municipais e estaduais da lei antiga. O acesso varia muito. Levantamento dos 32 tribunais feito em 15/10/2026 (páginas iniciais, especificações de API e consultas de teste, só leitura).

**A. Abertos, com API ou arquivo (coleta automática):**

| Tribunal | Municípios | O que tem | Testado |
| --- | --- | --- | --- |
| TCE-RS (LicitaCon) | 497 | Portal CKAN, consolidado por ano e por órgão, atualizado todo dia: licitações, **licitantes e propostas de todos**, contratos, aditivos (dias de novo prazo), itens, fornecedores (CNPJ) e documentos, desde 2013 | Sim: 2022 e 2023 baixados e medidos; Erechim com 24 licitações por abrir |
| TCE-RJ (API) | 91 (sem a capital) e o estado | API com CSV ou JSON, sem chave: contratos municipais e estaduais (CNPJ, objeto, assinatura, vencimento, valor contratado, empenhado e pago, e se usou a 14.133), licitações, compras diretas, **licitantes vencedores e perdedores**, empenhos e obras | Sim: contratos de 2023 em 9,5 s |
| TCE-PE (API) | 184 e o estado | Contratos com filtro por CNPJ do contratado (vigência, valor, situação, link do PDF), licitações com licitantes, aditivos e empenhos | Sim, mas lenta (52 s) e com objeto truncado |
| TCE-CE (API "SIM") | 184 | Ciclo inteiro: processos de contratação, **publicações dos editais**, licitantes, itens, contratos e contratados; por município e período, JSON paginado | Especificação lida; tempo de chegada a medir |
| TCE-PR (Portal Informação para Todos) | 399 | Download por município e ano, e consolidado, com contratos e licitações; Mural de Licitações em dados abertos | Página sem captcha; formato a medir |
| TCE-PB (dados abertos) | 223 | Download por município e consolidado: licitações (desde 2015) e despesas com empenhos por credor (desde 2003). Sem conjunto de contratos | Lista de conjuntos lida no código da página |
| TCE-ES (no catálogo do governo do ES) | 78 | 28 conjuntos no `dados.es.gov.br`, entre eles "Contratações - Controle Externo": contratações, instrumentos contratuais de 2021 a 2026, contratos com medições e alterações, itens por ano e obras; também empenhos, receitas e despesas dos municípios | Lista de conjuntos e arquivos lida (segunda rodada) |

**B. Murais ou consultas públicas, sem captcha e sem API (coleta lendo as páginas públicas, conferindo antes os termos de uso):**

| Tribunal | Municípios | O que tem |
| --- | --- | --- |
| TCE-PI (murais) | 224 | Mural de licitações com filtro "Divulgada (abertura futura)" e mural de contratos com filtro "Em vigência", "Vigência até" e **CNPJ da contratada** |
| TCE-MA (Mural SACOP) | 217 | Murais públicos de contratações (licitações, diretas e adesões) e de contratos (com aditivos). A API pública do SACOP existe, mas respondeu com erro interno do próprio servidor no teste |
| TCM-PA (Mural de Licitações) | 144 | Mural obrigatório das prefeituras do Pará (o tribunal já reprovou contas por falta de publicação nele) |
| TCE-TO (Portal do Cidadão) | 139 | Portal público (exige JavaScript); conteúdo a medir |
| TCE-RN (SIAI Consultas) | 167 | Consulta pública com os anexos de editais municipais |
| TCE-RR (SAGRES Licitações) | 15 | Pesquisa pública de licitações |
| TCE-AC (Portal das Licitações) | 22 | Portal público de licitações |
| TCE-AL (busca de diários) | 102 | Portal de busca em diários oficiais (exige JavaScript); conteúdo a medir |

**C. Só painéis (sem arquivo nem API):** TCE-MT, com o Radar de Controle Público (painéis de preços, obras e despesas); 141 municípios.

**D. Fechados, restritos ou sem dado encontrado:**

| Tribunal | Municípios | Situação |
| --- | --- | --- |
| TCE-MG (SICOM) | 853 | Dados abertos atrás de reCAPTCHA (401 sem o token). Pedido formal (o usuário vai solicitar) |
| TCE-SP (Audesp) | 644 | Sem dados abertos; em 2021, cobertura de 33% dos municípios (o usuário vai solicitar) |
| TCE-SC (e-Sfinge) | 295 | Restrito aos jurisdicionados (o usuário vai solicitar) |
| TCM-BA | 417 | Página de controle social com captcha |
| TCM-GO | 246 | Só balancetes e índices; em 2021, dados só por pedido |
| TCE-RO | 52 | Portal do Cidadão exige login (gov.br) |
| TCE-MS | 79 | Só portal restrito do jurisdicionado |
| TCE-AM | 62 | Nada encontrado para jurisdicionados |
| TCE-AP | 16 | Só a transparência do próprio tribunal |
| TCE-SE | 75 | A API só traz os contratos do próprio tribunal |
| TCDF e TCE-PA | DF e estado do PA | Firewall bloqueia acesso automático |
| TCE-GO e TCE-BA | Só estado | Sem portal de dados de jurisdicionados encontrado |
| TCM-RJ | Capital do RJ | Site em JavaScript; não verificado |
| TCM-SP | Capital de SP | Remete ao PNCP; "solicitação de dados" |

**Cobertura municipal por tribunal (aproximada):** grupo A, cerca de 1.660 municípios (30%); grupo B, cerca de 1.030 (19%). Fechados ou sem dado: cerca de 2.880 (52%), concentrados em MG, SP, BA, SC e GO.

**Capitais com tribunal próprio:** a cidade de São Paulo tem 33 conjuntos de contratos no catálogo da prefeitura, espalhados por subprefeitura e secretaria; o catálogo da cidade do Rio não foi conferido (não respondeu como catálogo).

### 4.9 Governos estaduais (contratos do Executivo estadual)

Fonte própria dos contratos estaduais, inclusive onde o tribunal é fechado (MG e SC). Não traz as prefeituras. Levantado em 15/10/2026 (catálogos CKAN e páginas iniciais dos portais de transparência, só leitura).

| Situação | Estados | Detalhe |
| --- | --- | --- |
| **Conjunto aberto de contratos (arquivo ou API)** | MG, SC, ES, PE, RS, AL e RO | MG: contratos do Executivo de 2022 a 2026, com itens, em CSV (SEPLAG, atualizado em 14/10). SC: contratos do Executivo em JSON e CSV, atualizados em 15/10 (sem a Secretaria da Saúde). ES: contratos do SIGA desde 2008, com alterações e empenhos. PE: contratos por ano, de 2020 a 2026. RS: contratos por tipo (bens, locações, obras, serviços). AL: API/WebService, download de dados e licença de uso. RO: conjunto de 2025 |
| **Conjuntos por órgão (fragmentados)** | RJ, GO, PB e MT | RJ e GO por órgão (no RJ, a API do TCE-RJ já traz os contratos estaduais); PB só "Compras"; MT só os contratos da Covid |
| **Consulta ou painel, sem download confirmado** | SP, PR, CE, MA, SE, BA e DF | SP: menu de contratos e portal de dados com painéis. PR: contratos e uma seção de downloads, a conferir. CE: Ceará Transparente com contratos e catálogo de dados abertos (em JavaScript). MA e SE: consulta de contratos e página de dados abertos. BA: painel de contratos. DF: portal de dados abertos com catálogo a conferir |
| **Não conferidos** | PI, TO, RR, MS, PA, AM e AP | Portais em JavaScript (PI, TO, RR, MS) ou falha de conexão e de certificado (PA, AM, AP) |

Lembrete: os contratos estaduais da 14.133 (de 2024 em diante) já estão no PNCP. Os portais estaduais importam para os contratos estaduais da lei antiga e como conferência.

Estudo da Transparência Brasil (junho/2021, pedidos de 2019, 32 tribunais): só 28% publicavam contratos em formato aberto; em 40% os dados cobriam menos de 80% dos municípios. Melhores notas de qualidade: TCE-RS 90,5; TCM-GO e TCM-PA 83,3; TCE-PR 76,7; TCE-PE 69,6; TCE-MT 58,8; TCE-RJ 47,6; TCE-MG 46,7. Sete tribunais tiveram nota zero (TCDF, TCE-AL, TCE-AP, TCE-GO, TCE-MS, TCE-RO e TCE-SE). Bahia, Goiás e Pará têm tribunal próprio dos municípios (TCM).

### 4.6 Diários oficiais

- **Querido Diário (API aberta):** 955 municípios cobertos (MG: 55 de 853; SP: 240; RS: 40; BA: 109). A busca simples levou 24 s e a busca pelo CNPJ deu erro 500.
- **Diários das associações de municípios** (exemplo: o diário dos municípios mineiros): concentram muitas prefeituras pequenas, mas são texto livre ou PDF. Extrair contrato, fornecedor, vigência e valor exige regras ou IA, e um coletor por fonte.
- **Uso:** alternativa para estados fechados (como MG) e para as prefeituras pequenas até abril de 2027. Esforço alto.

### 4.7 Plataformas de disputa (BLL, Portal de Compras Públicas, Licitanet, BNC, Licitações-e e outras)

- Têm editais e disputas, mas cada uma com seus termos de uso. A 14.133 já obriga a publicação no PNCP. Não recomendadas como fonte.

### 4.8 Cadastro de CNPJ (Receita Federal, dados abertos)

- Razão social, nome fantasia, CNAE, porte e município de cada fornecedor. Não traz contratos; serve para a página do fornecedor e para filtros de concorrência.

## 5. Conclusão: dá para ter dados completos?

- **Contratações da 14.133 (de 2024 em diante, todas as esferas): sim.** PNCP (contratos) e Compras.gov.br (quem venceu cada item). É o núcleo, e a lacuna diminui sozinha com o tempo.
- **Federal da lei antiga: sim.** Compras.gov.br (contratos e legado), com a API oficial.
- **Estados e municípios da lei antiga: não existe fonte nacional.** Só tribunal por tribunal (seção 4.5):
  - abertos com API ou arquivo: RS, RJ, PE, CE, PR, PB e ES, cerca de 30% dos municípios;
  - murais públicos: PI, MA, PA, TO, RN, RR, AC e AL, cerca de 19%;
  - fechados ou sem dado: cerca de 52%, concentrados em MG, SP, BA, SC e GO;
  - os contratos dos governos estaduais têm fonte própria em vários estados, inclusive em MG e SC (seção 4.9).
  - É uma lacuna temporária (some até 2028–2029), mas grande hoje: só no RS, cerca de 17 mil contratos vigentes e 14 mil que terminam em 12 meses.
- **Prefeituras pequenas:** diário oficial até abril de 2027.
- **Estatais e Sistema S:** portais próprios (estudo de 06/10).

Ou seja: "completo" de verdade, hoje, só para a 14.133 e para o federal. O resto é cobertura por estado.

## 6. Recomendação

1. **Fase 1, núcleo nacional (fontes oficiais com API):**
   - PNCP com histórico completo: todos os tipos, vigentes e encerrados, desde 2021;
   - Compras.gov.br: contratos federais (inclui a 8.666) e resultados da 14.133 por fornecedor (quem venceu e por quanto);
   - busca por CNPJ na caixa principal, páginas de fornecedor e de órgão, e nenhuma menção à origem dos dados na tela.
   - Melhor antes da carga da Parte A na produção, para não carregar duas vezes.
2. **Fase 2, contratos municipais da lei antiga, por estado:** começar pelos estados com dado aberto (RS, PE, PR) e pelos estados onde estão os clientes. Para MG, pedido formal ao TCE-MG (LAI ou acordo de cooperação) pedindo acesso em lote aos contratos do SICOM; enquanto isso, o diário oficial como alternativa.
3. **Fase 3:** estatais e Sistema S (piloto do Petronect, do estudo de 06/10) e o radar do PCA.

**Cuidados para o plano:**
- deduplicar entre fontes (PNCP × Compras.gov.br pelo número de controle; tribunais × PNCP pelo órgão, número e ano do contrato);
- conferir os termos de uso de cada fonte e se exigem citar a origem;
- medir volume e custo de banco por fonte (falta a resposta sobre o plano do Postgres no Render);
- qualidade de dado dos tribunais: preenchimento pelos próprios municípios, com erros conhecidos (estudo de 2021).

## 7. E para editais (licitações abertas)?

Edital pede **tempo**: o dado tem de chegar antes de a proposta fechar. Pela 14.133, o prazo mínimo entre a divulgação do edital e a abertura vai de 8 dias úteis (bens, menor preço) para cima (art. 55).

| Fonte | Serve para edital aberto? | O que acrescenta além do PNCP |
| --- | --- | --- |
| PNCP | Sim: é o núcleo (14.133, todas as esferas, com os arquivos do edital) | — (já coletado pela varredura diária) |
| Compras.gov.br | Pouco | O módulo de contratações é espelho do PNCP; o legado é só histórico da lei antiga. Serve para vencedores e preços |
| Portal da Transparência | Não | Licitações federais depois do fato |
| TCE-RS (LicitaCon) | **Sim, no RS** | Arquivo atualizado todo dia (regra de envio em até 5 dias úteis do evento). Erechim: 24 licitações de 2026 ainda por abrir, com objeto, abertura e valor. Traz também **licitantes e propostas de todos**, o que o PNCP não tem |
| TCE-PR (Mural de Licitações) | **Sim, no PR** | Mural oficial dos avisos municipais, primeiro conjunto dos dados abertos do tribunal. O ganho é pequeno: no estudo de 06/10, 89% dos municípios pequenos do PR já tinham edital no PNCP |
| TCE-PE (API) | A medir | Licitações com licitantes; tempo de chegada desconhecido |
| TCE-MG (SICOM) e demais | Não | Envio periódico, em geral depois do fato; MG ainda tem o captcha |
| Diários oficiais | **Sim, para prefeituras pequenas até abril/2027** | É onde elas podem publicar o aviso (art. 176). Texto livre, com extração e esforço altos (estudo de 06/10) |
| Plataformas de disputa (BLL e outras) | Têm os editais | Termos de uso de cada uma; a 14.133 já manda para o PNCP |
| Portais de estatais e do Sistema S | Sim | Editais que não vão ao PNCP (estudo de 06/10, piloto do Petronect) |
| PCA do PNCP | Antes do edital | Radar de compras previstas (estudo de 06/10) |

**Conclusão para editais:** o PNCP continua sendo o núcleo. Os tribunais trazem edital a tempo só onde exigem envio rápido (RS e PR, estados já bem cobertos pelo PNCP). Para as prefeituras pequenas, a fonte é o diário oficial, e a lacuna fecha por lei em abril de 2027. O valor maior dos tribunais está no histórico e na concorrência: licitantes e propostas de todos os participantes.

## 8. Produto comercial: mapa de cobertura máxima

Decisão do usuário (15/10/2026): é um produto para vender, então a meta é **tudo o que for possível obter**, de publicações (editais, avisos, atas, resultados) e contratos, no país inteiro, e não estados de clientes.

| Camada | Fontes | O que cobre | Coleta | Esforço |
| --- | --- | --- | --- | --- |
| 1. Nacional oficial | PNCP completo (editais, atas, contratos, resultados e PCA, vigentes e encerrados, desde 2021); Compras.gov.br (contratos federais com a 8.666, legado federal, resultados por fornecedor); cadastro de CNPJ da Receita | Tudo da 14.133, em todas as esferas; o federal inteiro, inclusive o antigo | API oficial, automática | Médio |
| 2. Tribunais de contas e governos estaduais | Governos estaduais com contratos abertos: MG, SC, ES, PE, RS, AL e RO (seção 4.9). Tribunais com API ou arquivo: TCE-RS, TCE-RJ, TCE-PE, TCE-CE, TCE-PR, TCE-PB e TCE-ES. Murais públicos: TCE-PI, TCE-MA, TCM-PA, TCE-TO, TCE-RN, TCE-RR, TCE-AC e TCE-AL. Fechados: MG, SP e SC (pedidos formais do usuário), TCM-BA, TCM-GO e outros (seção 4.5) | Contratos municipais e estaduais da 8.666; licitantes e propostas de todos (RS e RJ); editais a tempo onde há mural (RS, PR, PI, MA, PA; CE a medir) | Automática nos abertos; leitura de páginas públicas nos murais; pedido formal nos fechados | Alto (um coletor por tribunal) |
| 3. Diários oficiais | Associações estaduais de municípios e diários próprios; Querido Diário onde cobre | Prefeituras pequenas (até abril/2027) e estados fechados (MG, SP, SC) | Extração de texto com regras ou IA | Alto |
| 4. Estatais e Sistema S | Portais próprios (Petronect e outros) | Editais e contratos fora do PNCP | Um coletor por portal, conforme os termos de uso | Médio a alto |

**Fora:** a busca interna do portal do PNCP e as plataformas privadas de disputa (proteção contra robô e termos de uso). Não contornar captcha nem proteção de portal.

**O que muda no que já foi construído:**
- **Parte A (contratos):** guardar tudo (todos os tipos, vigentes e encerrados), não só o termo inicial vigente. Melhor decidir antes da carga na produção.
- **Editais:** guardar o histórico, não só os abertos.
- **Base unificada com a origem de cada registro** (sem mostrar a origem na tela) e deduplicação entre fontes.
- **Busca:** por CNPJ, órgão, objeto, valor e datas, sobre a base inteira, mais as páginas de fornecedor e de órgão.

**Volume e custo (print do Render recebido em 16/10/2026; preços da página pública do Render):**
- **Banco atual (`db-sistema-financeiro`):** PostgreSQL 18, Oregon, **1 GB de espaço com 35,75% usado** (cerca de 360 MB; sobram cerca de 640 MB), aumento automático desligado, sem pool de conexões. O tipo de instância (aba "Plan") ainda não foi visto.
- **Medido:**
  - edital: 5,1 KB por registro, com o JSON completo do PNCP;
  - contrato: 1,8 KB;
  - num dia útil (07/10/2026), o PNCP publicou cerca de 5.900 contratações (2.852 dispensas, 1.553 pregões, 1.054 inexigibilidades), cerca de 1,5 milhão por ano.
- **Estimativa por cenário (histórico desde 2021):**

| Cenário | Volume | Espaço no Render |
| --- | --- | --- |
| Parte A como está (só contratos vigentes) | cerca de 1 GB | Já não cabe: hoje sobram 640 MB |
| Camada 1 (PNCP completo: contratos, editais e resultados; Compras.gov.br federal) | 30 a 60 GB | 40 a 75 GB |
| Camadas 1 e 2 (com tribunais e governos estaduais) | 50 a 100 GB | 60 a 120 GB, crescendo de 10 a 20 GB por ano |

- **Preços do Render (outubro/2026):**
  - armazenamento: US$ 0,30 por GB por mês;
  - Basic-256mb: US$ 6; Basic-1gb: US$ 19; Basic-4gb: US$ 75;
  - Pro-4gb: US$ 55 (1 CPU, 4 GB); Pro-8gb: US$ 100 (2 CPU, 8 GB); Pro-16gb: US$ 200 (4 CPU, 16 GB).
- **Custo estimado do banco do produto:**
  - para começar: Pro-4gb com 50 GB, cerca de US$ 70 por mês;
  - com as camadas 1 e 2: Pro-8gb com 100 GB, cerca de US$ 130 por mês.
  - A busca sobre dezenas de milhões de registros pede memória para os índices; medir no plano.
- **Decisão para o plano:** um banco separado para os dados públicos de Licitações, para a carga não pesar no Finanças.
  - O coletor já tem a sua própria URL (`TENDERS_COLLECTOR_DATABASE_URL`).
  - Favoritos, buscas salvas e notificações apontam para contas e usuários do banco principal, então separar exige rever essas ligações.
- Talvez seja preciso um motor de busca dedicado mais adiante.

**Alternativas de custo (16/10/2026; o usuário não quer pagar US$ 70 a 130 por mês só de armazenamento):**

A conta de 50 a 100 GB supunha guardar tudo: o JSON bruto, todos os índices, todos os tipos, o histórico desde 2021 e os itens. Medido no edital, o registro tem 5,1 KB: linha de 2,7 KB, da qual o JSON bruto é 57% (1,56 KB); vetor de busca de 360 bytes; e índices de cerca de 1,6 KB.

| Caminho | Como | Espaço | Custo extra | Contra |
| --- | --- | --- | --- | --- |
| 1. Base enxuta | Sem o JSON bruto (o detalhe vem da fonte quando o usuário abre, com cache, como já é com itens e arquivos); só os campos de busca e filtro; menos índices; resultados agregados por licitação (quem venceu e por quanto); janela de histórico (ex.: 3 anos); começar pelos tipos que vendem (contrato termo inicial), com empenhos e dispensas sem disputa depois | 10 a 15 GB | US$ 4 a 5 por mês de espaço no Render; talvez subir a instância (Basic-1gb, US$ 19) se hoje for a de 256 MB | O detalhe completo depende da fonte estar no ar |
| 2. Consulta na hora por CNPJ | Vencedores da 14.133 (Compras.gov.br, testado em menos de 1 s); contratos federais (Portal da Transparência, chave grátis); contratos de PE (TCE-PE). Varredura sob demanda: das licitações que o CNPJ venceu, buscar os contratos de cada órgão no PNCP e guardar em cache | Quase zero | Nenhum | Primeira busca leva de segundos a dezenas de segundos; não cobre o que não tem resultado publicado |
| 3. Histórico frio em arquivo | Antigo (encerrados, editais antigos, tribunais) em arquivos Parquet no Cloudflare R2, consultados pelo backend com DuckDB; o Postgres fica só com o quente (abertos, vigentes, dados dos usuários) | Parquet compacta de 5 a 10 vezes | R2: 10 GB grátis por mês, depois US$ 0,015 por GB, sem custo de saída | Busca histórica mais lenta (1 a 3 s, a medir); tecnologia nova no projeto |
| 4. Outro provedor | Supabase Pro (US$ 25 por mês, com 8 GB e US$ 0,125 por GB adicional) ou servidor próprio | — | Supabase sai mais caro que o Render no tamanho enxuto | Hetzner subiu os preços em 2026 (nos EUA, em média 158%); na Europa fica longe do Render |

**Recomendação:** 1 e 2 agora, sem trocar de provedor (de US$ 5 a 20 por mês a mais, conforme a instância atual); 3 quando o histórico crescer.

**HD local (proposta do usuário, 16/10/2026):**
- **Como banco do produto no ar: não.** O produto dependeria do computador ligado e com internet. Cada consulta faria ida e volta Oregon–Brasil (150 a 200 ms). O banco ficaria exposto na internet e sem backup fora do HD.
- **Modelo híbrido: sim.**
  - **No HD local:** o arquivo completo (histórico, JSON bruto, tribunais) e a carga pesada, como no piloto, com o Postgres do computador.
  - **Na nuvem:** só a base enxuta (10 a 15 GB) e a coleta diária, para o produto não depender do computador.
  - **Entre os dois:** uma rotina que publica do HD para a nuvem só o que o produto usa. Se for preciso, reprocessa a partir do HD, sem baixar de novo.
- **Tamanho medido em amostras reais do PNCP:**
  - por registro, bruto e compactado: contrato 1,84 KB e 0,35 KB; contratação 2,0 KB e 0,43 KB; item 1,1 KB e 0,23 KB; termo 1,27 KB;
  - itens por contratação (amostra de 07/10/2026): dispensa 3,8 em média (mediana 1); pregão 35,5 (mediana 17); ponderado, cerca de 12.

| Conjunto (2021 a outubro/2026) | Registros | Bruto | Compactado |
| --- | --- | --- | --- |
| Contratos do PNCP | 5 milhões (medido no piloto) | 9 GB | 1,7 GB |
| Termos (aditivos) | cerca de 3 milhões (estimativa) | 4 GB | 0,5 GB |
| Contratações (editais) | cerca de 5 milhões (estimativa: 1,5 milhão por ano hoje) | 10 GB | 2,2 GB |
| Itens das contratações | cerca de 60 milhões | 66 GB | 14 GB |
| Resultados por item (vencedores) | cerca de 40 milhões (estimativa) | 34 GB | 7 GB |
| Compras.gov.br federal | a medir | 5 a 10 GB | 1 a 2 GB |
| Tribunais e governos estaduais | a medir | 40 a 60 GB | 8 a 12 GB |
| **Total** | | **cerca de 170 a 190 GB** | **cerca de 35 a 40 GB** |

- **Postgres local com índices:** cerca de 100 GB sem itens e resultados (que ficam em arquivo compactado), ou 300 a 350 GB com tudo.
- **Crescimento:** cerca de 45 GB brutos por ano (9 GB compactados).
- **HD recomendado:** 1 TB, de preferência SSD para o Postgres local. Dá para o arquivo, o banco e de 3 a 5 anos de crescimento. 2 TB se tudo for para o Postgres por muitos anos.
- **Backup:** um segundo HD, ou o arquivo compactado no R2 (40 GB custam cerca de US$ 0,45 por mês, com 10 GB grátis).
- **Nuvem:** base enxuta de 10 a 15 GB no Render, de US$ 3 a 4,50 por mês de espaço.

**Decisões do usuário (16/10/2026):**
- **HD físico dispensado.**
- **Cloudflare R2 escolhido:** o usuário está criando a conta.
- **Papéis do R2:**
  - arquivo completo e backup desde o início: a coleta na nuvem grava o bruto compactado direto no R2; cerca de 40 GB custam cerca de US$ 0,45 por mês;
  - histórico consultável no produto (Parquet e DuckDB), depois de um piloto de velocidade;
  - a busca do dia a dia (abertos, vigentes, dados dos usuários) continua no Postgres do Render.
- **Bibliotecas conferidas para o plano:**
  - `@duckdb/node-api` 1.5.6, com binários para Linux x64 (Render) e Windows x64, sem restrição de Node;
  - `@aws-sdk/client-s3` exige Node 20 ou mais; usar uma versão com pelo menos 2 semanas (ex.: 3.1145.0, de 01/10/2026).
- **O usuário faz:** a chave de acesso do R2 restrita ao bucket e as variáveis no Render e no `.env.dev`. Nunca mandar a chave pelo chat.

**Cuidados legais:**
- dado público pode ser reutilizado, inclusive em produto comercial (LAI e política de dados abertos), mas é preciso conferir os termos e a licença de cada fonte e se exigem citação. O TCE-PR declara uso sem restrição específica;
- respeitar o ritmo de cada fonte;
- LGPD: CPF de fornecedor pessoa física só mascarado (já é assim) e nada de dados de sócios.

## 9. Perguntas para o plano

Respostas do usuário em 15/10/2026:
- **Plano:** esperar todas as informações antes do `/planejar`.
- **Levantamento dos tribunais:** feito (seção 4.5).
- **Tribunais fechados (MG, SP e SC):** o usuário vai fazer os pedidos formais; até lá, ficam de fora.
- **Plano do Postgres:** print recebido em 16/10/2026 (1 GB, 35,75% usado); falta a aba "Plan" com o tipo de instância.

Ainda em aberto:
1. Ordem da camada 2 depois da camada 1: sugestão por ganho e esforço, com RJ e RS primeiro (API ou arquivo e licitantes de todos), depois PE, CE, PR e PB; depois os murais do Norte e Nordeste (PI, MA, PA), onde o PNCP é mais fraco para editais.
2. Vale cadastrar a chave do Portal da Transparência, ou o Compras.gov.br basta?

## Fontes

- PNCP, amparos legais: `https://pncp.gov.br/api/pncp/v1/amparos-legais` (ativos e inativos, consultados em 15/10/2026).
- PNCP, API de consulta (OpenAPI no repositório): `backend/src/modules/tenders/collector/docs/pncp-openapi.json`.
- Compras.gov.br, dados abertos (OpenAPI): https://dadosabertos.compras.gov.br/v3/api-docs
- Portal da Transparência (OpenAPI): https://api.portaldatransparencia.gov.br/v3/api-docs
- TCE-RS, dados abertos (LicitaCon): https://dados.tce.rs.gov.br/dataset e https://dados.tce.rs.gov.br/group/licitacoes
- TCE-PE, API de dados abertos: https://sistemas.tcepe.tc.br/DadosAbertos/ e https://www.tcepe.tc.br/internet/index.php/dados-abertos/definicoes-da-api
- TCE-PR, dados abertos e download: https://www.tce.pr.gov.br/transparencia-do-tce-pr/dados-abertos-tce-pr.htm e https://pit.tce.pr.gov.br/Dados/DadosConsulta/Consulta
- TCE-MG, portal de dados abertos: https://dadosabertos.tce.mg.gov.br/ e notícia de lançamento: https://tce.mg.gov.br/noticia/Detalhe/1111622741
- TCE-SC, e-Sfinge: https://www.tcesc.tc.br/esfinge
- TCE-RJ, API de dados abertos: https://dados.tcerj.tc.br/api e https://dados.tcerj.tc.br/api/v1/openapi.json
- TCE-CE, API Dados Abertos (SIM): https://api-dados-abertos.tce.ce.gov.br/swagger-ui/
- TCE-PB, dados abertos: https://dados-abertos.tce.pb.gov.br/
- TCE-PI, murais: https://sistemas.tce.pi.gov.br/muralic/ e https://sistemas.tce.pi.gov.br/muralcon/
- TCE-MA, Mural SACOP: https://sacop-mural.apps.tcema.tc.br/ e API: https://tce-api.apps.tcema.tc.br/swagger-ui/index.html
- TCM-PA, Mural de Licitações: https://www.tcm.pa.gov.br/mural-de-licitacoes/
- TCE-RR, SAGRES Licitações: https://sagreslicitacoes.tcerr.tc.br/sagreslicitacoes
- TCE-AC, Portal das Licitações: https://externo.tceac.tc.br/portaldaslicitacoes/menu/
- TCE-TO, Portal do Cidadão: https://portaldocidadao.tceto.tc.br/
- TCE-RN, SIAI Consultas: https://siaiconsultas.tce.rn.gov.br/
- TCE-AL, busca de diários: https://consultadoe.tceal.tc.br/
- TCE-MT, Radar de Controle Público: https://radar.tce.mt.gov.br/
- Transparência Brasil, "Transparência e Qualidade de dados de contratos nos Tribunais de Contas" (jun/2021): https://www.transparencia.org.br/downloads/publicacoes/Transparencia_Qualidade_Dados_TCs.pdf
- Querido Diário, API: https://api.queridodiario.org.br/
- CNPJ da Diretriz (dados públicos do estabelecimento): https://publica.cnpj.ws/cnpj/22493902000140
- Lei 14.133/2021 (arts. 176, 191 e 193) e Lei 8.666/1993 (art. 57), Planalto.
- Medições: scripts na pasta temporária da sessão (`compras/`, `fontes/`, `tcers-measure.cjs`, `cdp-pncp-search.mjs`).
