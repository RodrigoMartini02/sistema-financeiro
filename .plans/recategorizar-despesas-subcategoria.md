# Plano de Implementação: Recategorizar despesas do pai para a subcategoria

## Origem

- Arquivo de especificação: conversa de 2026-10-06.
  - Consulta só de leitura na produção: despesas lançadas direto numa categoria pai que tem subcategorias.
  - Respostas do usuário: "1 c, 2 sim, 3 sim, 4 a, 5 sim".
- Data do planejamento: `2026-10-06`
- Classificação: correção de dados na produção. Não muda código nem schema e não tem migration.

## Resumo

Na conta pessoal Rodrigo Martini (id 17), 426 despesas estão lançadas direto numa categoria pai que tem subcategorias.

Este plano move **316** delas para a subcategoria certa, pela lista do Anexo. As outras **110** não têm subcategoria adequada e ficam no pai.

## Decisões aplicadas

- **Decisão 1:** as 45 de Trabalho sem destino claro vão para **Bauhaus**.
  - No total, Trabalho fica assim: 48 vão para Bauhaus e 2 para Aether (Google e EmailJS).
- **Decisão 2:** os critérios que seguem o padrão do usuário estão confirmados:
  - restaurante e padaria → Mercado;
  - estacionamento → Pedágio;
  - lavacar → Mecânica;
  - licenciamento e emplacamento → IPVA.
- **Decisão 3:** as duas lançadas no pai errado mudam de pai:
  - Auto Posto Villa (19101) → Transporte › Combustível;
  - MI Raia (18794) → Saúde › Farmácia.
- **Decisão 4:** Claude roda na produção fora do auto mode, e o usuário aprova cada comando.
- **Decisão 5:** plano salvo.

## Escopo

### Dentro do escopo

- Trocar `despesas.categoria_id` das 316 despesas do Anexo: do pai para a subcategoria.
- Isso inclui:
  - as parcelas e os meses futuros que já estão gravados (ex.: Amazon Prime até 09/2027, Big Box Home, CamaBox);
  - as duas canceladas: Microsoft (Xbox) e Amazon (Prime).
- Ensaio, gravação e conferência.

### Fora do escopo

- As 110 despesas que ficam no pai, entre elas as 50 de Lazer (Lazer só tem a sub Xbox).
- Criar subcategorias novas.
- Impedir que despesas sejam lançadas direto no pai, pelo modal ou pelo assistente. Isso já estava fora do escopo em `.plans/categoria-pai-e-receitas-assistente.md`.
- Outras contas e categorias sem subcategoria.
- Apagar a possível duplicata "Casa Gustato" (ver Riscos).

## Leitura de contexto

- `/AGENT.md`: regras de banco (l. 441–451): confirmar antes de comandos no banco e conferir o ambiente alvo.
- `/CLAUDE.md`
- `/frontend/AGENT.md` e `/backend/AGENT.md`: não existem no projeto.
- `backend/src/db/schema/categories.ts` e `backend/src/db/schema/expenses.ts`
- `backend/src/routes/categories.ts`: quais categorias cada conta vê (padrão do tipo, custom da conta e órfãs).
- `backend/src/services/budgetService.ts` (l. 308–321): o total do pai inclui as subcategorias.
- `.plans/categoria-pai-e-receitas-assistente.md`: o filtro do grupo traz o pai e as subcategorias.
- `backend/scripts/migrations.ts` (l. 27–30): checagem da URL de produção.

## Impacto por área

### Frontend

Sem impacto esperado.

### Backend

Sem impacto esperado: nenhum arquivo muda.

### Banco de dados

- **O que muda:** tabela `despesas`, coluna `categoria_id`, em 316 linhas da conta 17. Não há mudança de schema nem migration.
- **Orçamento:**
  - o total de cada pai continua igual, porque soma as subcategorias;
  - a exceção são as duas despesas que mudam de pai, cada uma no seu mês:
    - Alimentação perde R$ 40,00 e R$ 16,89;
    - Transporte ganha R$ 40,00;
    - Saúde ganha R$ 16,89;
  - as metas por subcategoria passam a contar essas despesas (ex.: a meta de Mercado conta as 110).
- **Filtros:**
  - marcar o grupo (pai e subcategorias) continua trazendo as mesmas despesas;
  - marcar só o pai passa a trazer menos.
- **Painel e Relatórios:** passam a mostrar os valores por subcategoria.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- Nenhum arquivo do projeto.
- Só um script temporário na pasta de rascunho da sessão, apagado no fim.

## Estratégia de implementação

1. **Script temporário** fora do repositório, em Node com `pg`, como as leituras de 2026-10-06:
   - lê `DATABASE_URL` do `.env` da raiz e só segue se o endereço for `.render.com/`, a mesma checagem de `backend/scripts/migrations.ts`;
   - usa as listas do Anexo;
   - faz tudo numa única transação.
   - **Checagens antes de gravar.** Se alguma falhar, ele desfaz tudo e para:
     - cada subcategoria de destino existe, é da conta 17, está ativa e é filha do pai indicado no Anexo;
     - cada despesa existe, é da conta 17 e ainda está no pai indicado no Anexo. As que não estiverem são puladas e aparecem no relatório.
   - **Gravação:** um comando por bloco do Anexo (23 blocos), sempre com as três travas:
     `UPDATE despesas SET categoria_id = <sub> WHERE id = ANY(<ids>) AND conta_id = 17 AND categoria_id = <pai> RETURNING id`
   - **Relatório:**
     - quantas mudaram em cada bloco;
     - quais foram puladas;
     - quantas sobram no pai, por categoria.
   - **Ensaio ou gravação:**
     - sem `--confirmo`, o script desfaz tudo no fim (ensaio);
     - com `--confirmo`, só grava se mudarem exatamente as 316; senão desfaz.
2. **Ensaio na produção**, com aprovação do comando.
   - Resultado esperado: 316 mudariam, nenhuma pulada e 110 sobram no pai.
   - Se alguma for pulada, parar e mostrar ao usuário antes de seguir.
3. **Gravação** com `--confirmo`. Só acontece depois que o usuário vê o ensaio e confirma, com aprovação do comando.
4. **Conferência:** refazer a leitura de 2026-10-06, só lendo.
   - Devem sobrar 110 no pai: Alimentação 13, Transporte 11, Moradia 13, Saúde 7, Lazer 50, Cuidados Pessoais 13 e Streaming 3.
   - Trabalho e Sistema devem ficar zerados.
5. **Registro** no fim deste plano, e os scripts temporários são apagados.

## Regras de negócio identificadas

- Uma despesa de categoria pai que tem subcategorias fica na subcategoria que corresponde ao gasto.
- Se não houver subcategoria adequada, a despesa fica no pai.
- Os critérios seguem o padrão do usuário (decisão 2).
- Canceladas e meses futuros também mudam, para o histórico ficar certo.

## Regras multi-tenant e segurança

- Toda gravação tem três travas: o id da despesa, `conta_id = 17` e o pai esperado.
- As subcategorias de destino são as custom da própria conta 17.
- 34 das despesas foram lançadas pela Mirian na conta 17. A troca não muda quem vê a despesa, porque a categoria é da conta.
- Nenhum comando na produção roda sem aprovação. O `.env` não é alterado.

## Validações necessárias

- As checagens do script (etapa 1).
- Não há entrada de usuário.

## Testes necessários

### Frontend

- Nenhum: não há código.

### Backend

- Nenhum teste automatizado: não há código. O ensaio e a conferência fazem o papel de teste.

### E2E

- Opcional, pelo usuário: em Lançamentos, filtrar por "Alimentação › Mercado" e ver Bistek, Angeloni e Giassi de 2025 e 2026.

## Comandos de validação sugeridos

```bash
node <rascunho>/recategorizar.cjs              # ensaio (desfaz no fim)
node <rascunho>/recategorizar.cjs --confirmo   # gravação
node <rascunho>/despesas_em_pai.cjs            # conferência, só leitura
```

## Riscos e pontos de atenção

- **Gravação na produção:**
  - só roda fora do auto mode e com aprovação de cada comando;
  - se o comando for bloqueado, parar e entregar o SQL ao usuário.
- **Mudanças feitas pela tela até a execução:** a trava do pai pula essas despesas, e o ensaio mostra quais foram.
- **Possível duplicata:** "Casa Gustato" (19270, R$ 36,01, compra em 14/06) pode ser a mesma compra que já está em Bauhaus (R$ 35,60, mesma data). O plano só muda a categoria. O usuário confere pela tela.
- **Orçamento:** o total por pai muda só no mês de cada uma das duas despesas que mudam de pai.
- **Como desfazer:** o Anexo guarda o pai de cada despesa. Basta um `UPDATE` de volta para o pai, só com confirmação.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Ensaio: 316 mudariam e nenhuma é pulada.
- Gravação: 316 mudaram, numa transação só.
- Conferência: sobram 110 no pai, com a divisão da etapa 4.
- Nenhuma outra despesa ou categoria foi alterada.

## Observações para a skill implementar

- **Fonte:** usar este plano e seguir `/AGENT.md` e `/CLAUDE.md`.
- **Branch:** não há código, então não abrir branch nem fazer commit para isso. O arquivo do plano fica em `.plans/` e entra no commit da branch ativa.
- **Produção:**
  - o ensaio e a gravação são comandos separados, e cada um precisa de aprovação;
  - a gravação só acontece depois que o usuário vê o ensaio;
  - nunca usar outra ferramenta para contornar um bloqueio.
- **Proibido:** mexer no `.env`, em migrations ou no schema.
- **Arquivos temporários:** os scripts ficam na pasta de rascunho e são apagados no fim.
- **Registro:** no fim deste plano, a cada etapa concluída.

## Anexo: despesas por destino

Formato: `Pai (id) → Subcategoria (id): quantidade`, seguido dos ids das despesas. O pai é a categoria em que elas estão hoje.

```txt
Alimentação (809) → Transporte › Combustível (929): 1
  19101
Alimentação (809) → Saúde › Farmácia (938): 1
  18794
Alimentação (809) → Mercado (948): 110
  18141, 18142, 18144, 18158, 18160, 18169, 18170, 18173, 18176, 18201, 18206, 18207, 18209, 18221, 18238, 18242,
  18257, 18278, 18280, 18287, 18288, 18295, 18299, 18300, 18304, 18306, 18307, 18308, 18311, 18315, 18335, 18341,
  18361, 18386, 18387, 18388, 18465, 18487, 18602, 18603, 18605, 18609, 18651, 18665, 18674, 18677, 18684, 18695,
  18715, 18742, 18743, 18744, 18747, 18758, 18759, 18789, 18790, 18791, 18792, 18795, 18796, 18797, 18802, 18803,
  18809, 18810, 18811, 18812, 18813, 18814, 18815, 18816, 18817, 18818, 18819, 18832, 18834, 18835, 18837, 18838,
  18840, 18841, 18842, 18844, 18845, 18846, 18859, 18861, 18865, 18868, 18869, 18873, 18880, 18931, 19028, 19083,
  19087, 19089, 19096, 19097, 19098, 19099, 19126, 19208, 19315, 19384, 19434, 19450, 19521, 19545
Transporte (810) → Uber (928): 2
  18930, 19082
Transporte (810) → Mecânica (930): 6
  18120, 18121, 18122, 18136, 18757, 18871
Transporte (810) → Pedágio (937): 4
  18196, 18200, 18215, 18678
Transporte (810) → Financiamento (953): 1
  18765
Transporte (810) → IPVA (954): 3
  18115, 18131, 18940
Moradia (811) → Energia Elétrica (932): 11
  18155, 18162, 18212, 18231, 18255, 18296, 18346, 18362, 18613, 18746, 18848
Moradia (811) → Condomínio (933): 10
  18226, 18232, 18261, 18266, 18305, 18395, 18883, 18941, 19217, 19225
Moradia (811) → Internet (934): 14
  18161, 18239, 18262, 18303, 18347, 18639, 18640, 18641, 18642, 18646, 18647, 18648, 18649, 18936
Moradia (811) → Móveis/Eletros/Decoração (936): 20
  18942, 18943, 18944, 18945, 18946, 18947, 18948, 18949, 18950, 18951, 18957, 18958, 18959, 18960, 18961, 18962,
  18963, 18964, 18965, 18966
Moradia (811) → Seguro Fiança (949): 8
  18146, 18222, 18259, 18289, 18445, 18698, 18699, 18700
Saúde (812) → Farmácia (938): 12
  19241, 19242, 19243, 19251, 19268, 19358, 19429, 19433, 19475, 19500, 19548, 19550
Lazer (814) → Xbox (943): 2
  18787, 19272
Cuidados Pessoais (824) → Salão (945): 4
  18884, 19385, 19427, 19491
Cuidados Pessoais (824) → Barbearia (946): 5
  18139, 18208, 18220, 18253, 18281
Streaming (832) → Prime (939): 24
  19032, 19033, 19034, 19035, 19036, 19037, 19038, 19039, 19040, 19041, 19042, 19054, 19055, 19056, 19057, 19058,
  19059, 19060, 19061, 19062, 19063, 19064, 19065, 19153
Streaming (832) → YouTube (942): 3
  18147, 18258, 18286
Trabalho (833) → Bauhaus (955): 48
  18265, 18301, 18350, 18440, 18441, 18442, 18443, 18444, 18446, 18447, 18449, 18450, 18451, 18453, 18454, 18455,
  18464, 18466, 18467, 18468, 18469, 18470, 18475, 18476, 18477, 18478, 18479, 18480, 18481, 18482, 18483, 18485,
  18486, 18601, 18604, 18606, 18607, 18608, 18610, 18611, 18612, 18798, 19088, 19090, 19091, 19171, 19220, 19270
Trabalho (833) → Aether (956): 2
  19182, 19183
Sistema (849) → IA (950): 21
  18733, 18769, 18770, 18874, 18875, 18877, 18881, 18882, 19130, 19179, 19184, 19249, 19264, 19281, 19288, 19290,
  19323, 19328, 19363, 19415, 19541
Sistema (849) → Banco de Dados (951): 4
  18732, 18860, 18867, 19127
```

Total: 316 despesas em 23 blocos.

## Registro de andamento

- **Etapa 1 (script):** `recategorizar.cjs` na pasta de rascunho.
  - Lê os blocos direto deste Anexo e confere se são 23 blocos com 316 ids únicos.
  - O pai de destino das duas despesas que mudam de pai sai do nome no Anexo (Transporte 810, Saúde 812).
- **Etapa 2 (ensaio na produção, 2026-10-06):**
  - todas as subcategorias de destino passaram nas checagens;
  - 316 de 316 mudariam, nenhuma foi pulada, e os 23 blocos bateram com o Anexo;
  - sobram 110 no pai: Alimentação 13, Cuidados Pessoais 13, Lazer 50, Moradia 13, Saúde 7, Streaming 3 e Transporte 11;
  - nada foi gravado (ROLLBACK).
- **Etapa 3 (gravação, 2026-10-06):**
  - feita depois do "sim" do usuário ao ensaio, com `--confirmo`;
  - 316 de 316 mudaram, nenhuma foi pulada, numa transação só (COMMIT).
- **Etapa 4 (conferência, só leitura):**
  - as 316 despesas do Anexo estão na subcategoria de destino;
  - sobram 110 no pai, com a mesma divisão da etapa 2; Trabalho e Sistema zerados.
- **Etapa 5:** os scripts temporários foram apagados. Não houve código, branch nem migration.
- **Pendente com o usuário:** conferir pela tela a possível duplicata "Casa Gustato" (19270).
