# Estudo: ampliar as fontes de dados do módulo de Licitações

- Data: 2026-10-06
- Objetivo: decidir, com evidência, se e por onde ampliar as fontes além do PNCP, antes do plano único de ampliação.
- Escopo: estudo sem código. Medições só de leitura no banco local e consultas a APIs e páginas públicas.

## 1. Situação atual: o que o PNCP já traz

A base local tem a mesma coleta da produção (varredura de editais com proposta aberta).

**Totais:**
- 24.867 editais;
- 5.986 órgãos;
- 3.746 municípios.

**Editais por esfera:**

| Esfera | Editais | Órgãos |
| --- | --- | --- |
| Municipal (M) | 16.392 | 4.754 |
| Estadual (E) | 4.900 | 519 |
| Federal (F) | 2.487 | 366 |
| Não se aplica (N) | 1.033 | 329 |
| Distrital (D) | 55 | 18 |

**Municípios com edital municipal na base**, cruzados com a população do Censo 2022 (IBGE):

| População | Municípios | Com edital na base |
| --- | --- | --- |
| até 5 mil | 1.324 | 707 (53%) |
| 5 a 10 mil | 1.170 | 655 (56%) |
| 10 a 20 mil | 1.367 | 840 (61%) |
| 20 a 50 mil | 1.052 | 856 (81%) |
| 50 a 100 mil | 338 | 315 (93%) |
| acima de 100 mil | 319 | 306 (96%) |

- **Leitura:** quase todo município grande tem edital aberto na base (96%), então a medição chega perto do teto para quem publica. Nos municípios com até 20 mil habitantes, só 57% aparecem (2.202 de 3.861).
- **Ressalva:** o número subestima a adoção, porque município pequeno faz poucas licitações e pode não ter nenhuma aberta agora. Mesmo assim, a diferença para os grandes é grande.
- **Municípios até 20 mil por UF, do menor para o maior percentual:** AM 23%, TO 30%, MA 34%, AL 38%, AC 40%, PI 42%, PA, BA, RR e AP 45%, MT 46%, PB 46%, GO 49%… até SC 74%, RO 86% e PR 89%. A lacuna se concentra no Norte e no Nordeste.

**Estatais e Sistema S na base** (busca pelo nome do órgão):

| Grupo | Editais | Órgãos |
| --- | --- | --- |
| Petrobras, Banco do Brasil, BNDES, Eletrobras | 0 | 0 |
| Caixa | 10 | 1 |
| Correios | 23 | 1 |
| Serpro e Dataprev | 18 | 2 |
| Embrapa | 55 | 1 |
| Ebserh | 205 | 1 |
| Saneamento e energia estaduais (Sabesp, Copasa, Cemig, Copel, Casan e outras) | 73 | 3 |
| SESI, SENAI, SESC, SENAC, SEBRAE, SENAR, SEST, SENAT e SESCOOP | 72 no total | 22 |

As grandes estatais compradoras não aparecem. O Sistema S, com centenas de unidades regionais, aparece com 22 órgãos.

## 2. Por que existem essas lacunas

- **Municípios com até 20 mil habitantes:** o art. 176 da Lei 14.133 dá a eles 6 anos, contados da publicação da lei, ou seja, até **1º de abril de 2027**, para cumprir as regras de divulgação em sítio eletrônico oficial. Até lá, podem publicar no **diário oficial**, inclusive só o extrato. Depois dessa data, a lacuna tende a fechar por lei. Faltam cerca de 6 meses.
- **Estatais (Lei 13.303/2016):** seguem regime próprio. Os procedimentos são divulgados em "portal específico mantido pela empresa pública ou sociedade de economia mista" (art. 39 da Lei 13.303). A lacuna é permanente.
- **Sistema S:** entidades de direito privado, com regulamento próprio e sem obrigação de usar o PNCP. Divulgam nos ambientes de cada entidade. A lacuna também é permanente.
- **Fora da nossa coleta por decisão do projeto:** editais sem prazo de proposta, como credenciamento e dispensa sem disputa.

## 3. Fontes candidatas

### 3.1 Diários oficiais dos municípios

- **O que traz:** avisos de licitação dos municípios pequenos que ainda não usam o PNCP, concentrados no Norte e no Nordeste.
- **Querido Diário (Open Knowledge Brasil):**
  - projeto aberto com API pública de busca em diários municipais, que devolve trecho, data e PDF;
  - a documentação (jan/2026) não informa a cobertura atual: fala em "aumentar a cobertura" rumo aos 5.570 municípios. Material mais antigo citava mais de 350 municípios;
  - **estabilidade:** a API falhou nas duas tentativas de hoje (503 e 502), e o site abriu.
- **Associações estaduais de municípios:** muitas publicam um diário único para todas as prefeituras do estado (exemplo encontrado: o Diário Oficial das Prefeituras do Piauí). Seria um coletor por estado.
- **Formato:** texto livre, em geral em PDF. Prazo, valor, modalidade e objeto teriam que ser extraídos do texto, com regras ou IA. Não há os campos organizados do PNCP.
- **Esforço:** alto. Um coletor por fonte, extração de texto e deduplicação com o PNCP, porque muitos municípios publicam nos dois lugares.
- **Duração do ganho:** curta. A partir de abril de 2027, esses municípios passam a ter obrigação de publicar no PNCP.

### 3.2 Portais de estatais e do Sistema S

- **O que traz:** compradores grandes e permanentes que a lei não obriga a usar o PNCP. Exemplos:
  - Petrobras, no Petronect;
  - Banco do Brasil e BNDES;
  - Eletrobras;
  - as unidades regionais do Sistema S.
- **Petronect:**
  - a própria Petrobras informa que as oportunidades públicas aparecem na área pública do portal, **sem cadastro e sem taxa** para consultar;
  - para participar é preciso o cadastro (CRC), e há taxa de transação para o fornecedor;
  - o portal é SAP, montado por JavaScript, e exige um coletor de páginas.
- **Sistema S:** muito fragmentado, com um portal por entidade e por estado.
- **Formato:** cada portal tem o seu. Em geral dá para extrair objeto, número, datas e situação. Valor nem sempre.
- **Esforço:** médio a alto por portal, com manutenção quando o site muda. É preciso conferir os termos de uso de cada portal antes de coletar.
- **Duração do ganho:** permanente.

### 3.3 Plano de Contratações Anual (PCA), no próprio PNCP

- **O que traz:** o que cada órgão pretende comprar no ano, item a item, antes do edital. É um "radar de compras previstas". Não são editais.
- **API:** `GET /v1/pca/atualizacao` (por data de atualização) e `GET /v1/pca/` (por ano e classificação), na mesma API de consulta que já usamos.
- **Campos:** órgão, unidade, ano, descrição do item, categoria (material ou serviço), classe, quantidade, valor unitário e total, **data desejada da compra** e grupo de contratação.
- **Volume:** a janela de 1 a 7 de janeiro de 2026 devolveu **51.361 itens**. É o período em que os planos do ano são publicados.
- **Estabilidade:**
  - janela de 30 dias (setembro): erro 500 depois de 50 s;
  - janelas de 1 dia: vazias (204);
  - janela de 7 dias: deu certo, mas levou 44 s;
  - conclusão: a coleta teria que ser lenta, com janelas curtas e novas tentativas.
- **Esforço:** baixo a médio. O cliente da API e a rotina diária já existem. Falta uma tabela nova e uma tela própria de compras previstas, com busca e alertas por palavra-chave.
- **Duração do ganho:** permanente, e diferencia o produto: mostra a oportunidade antes do edital.

## 4. Comparação

| Critério | Diários municipais | Estatais e Sistema S | PCA do PNCP |
| --- | --- | --- | --- |
| Traz editais novos | Sim | Sim | Não (compras previstas) |
| Tamanho da lacuna | Grande hoje (cerca de 1.650 municípios pequenos sem edital na base) | Poucos compradores, contratos grandes | Não se aplica |
| Formato | Texto livre ou PDF | Um formato por portal | Organizado (JSON) |
| Estabilidade de acesso | Baixa (API do Querido Diário fora do ar hoje) | Varia por portal | Média (lenta, com erros) |
| Esforço | Alto | Médio a alto por portal | Baixo a médio |
| Duração do ganho | Até abr/2027 | Permanente | Permanente |
| Risco | Extração errada de prazo e valor | Mudança de layout e termos de uso | Lentidão da API |

## 5. Recomendação

1. **Não começar pelos diários municipais.** A lacuna é real, mas o esforço é alto, a fonte aberta está instável e a lei fecha boa parte da lacuna em abril de 2027. Vale repetir a medição da seção 1 depois dessa data. Se muitos municípios pequenos continuarem fora do PNCP, aí faz sentido.
2. **Fazer um piloto com uma estatal**, de preferência o Petronect: a maior compradora ausente da base, com consulta pública sem cadastro. O piloto mede volume, formato e esforço real antes de ampliar para outros portais (Banco do Brasil, BNDES, Sistema S).
3. **Considerar o PCA como função própria, não como fonte de editais:** um "radar de compras previstas", com esforço baixo e dado organizado. Fica a critério do usuário se entra neste plano ou num separado.

## 6. Perguntas para o plano

- O plano inclui o piloto com o Petronect, o radar do PCA, os dois, ou outro caminho?
- No piloto de estatal, os editais entram na mesma tela de Buscar, com a fonte indicada no card, ou numa área separada?
- Para o PCA: uma tela nova de "Compras previstas" com busca e alertas, ou só alertas a partir das buscas salvas?
- Repetimos a medição dos municípios pequenos em abril de 2027 (anotar na memória do projeto)?

## Fontes

- Lei 14.133/2021, art. 176, comentado pelo TCE-SP: https://www.tce.sp.gov.br/legislacao-comentada/lei-14133-1o-abril-2021/176
- Lei 13.303/2016 (Planalto): https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2016/lei/l13303.htm
- Petronect, guia "Como acessar uma licitação pública (fornecedor não cadastrado)": https://www.petronect.com.br/irj/go/km/docs/documents/Petronect/Conteudo_Publico/por/GuiasRapidos/guias/ComoacessarumaLicitacaoPublicaFornecedornaoCadastrado-v2.pdf
- Petronect, taxa de transação do fornecedor: https://www.petronect.com.br/irj/go/km/docs/documents/Petronect/Conteudo_Publico/por/GuiasRapidos/guias/ATD-MT-0015%20-%20TAXA%20DE%20TRANSACAO%20-%20FORNECEDOR(16)_45761492.pdf
- Sistema S e licitações: https://conlicitacao.com.br/licitacao-no-sistema-s/ e https://sollicita.com.br/Noticia/19225/o-portal-nacional-de-contrata%C3%A7%C3%B5es-p%C3%BAblicas-(pncp)
- Querido Diário, API (GitHub): https://github.com/okfn-brasil/querido-diario-api; documentação (PDF, jan/2026): https://docs.queridodiario.ok.org.br/_/downloads/pt-br/latest/pdf/
- PNCP, API de consulta (OpenAPI): https://pncp.gov.br/api/consulta/v3/api-docs
- IBGE, Censo 2022, população por município (SIDRA, tabela 4709): https://apisidra.ibge.gov.br/values/t/4709/n6/all/v/93/p/2022
- Medições locais: scripts `estudo_base_local.cjs` e cruzamento com o IBGE, na pasta temporária da sessão.
