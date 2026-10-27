# Task: Catálogo padrão de categorias PF com subcategorias e categoria obrigatória

## Contexto

O sistema (React + TypeScript + Vite no frontend, Express + TypeScript + PostgreSQL com Drizzle no backend) guarda despesas em `despesas.categoria_id` e receitas em `receitas.classificacao_id`. Há dois catálogos paralelos:

- **Categorias de despesa** (`categorias`, schema em `backend/src/db/schema/categories.ts`): cada linha é **padrão** (`tipo` preenchido, `conta_id` nulo, uma cópia por `usuario_id`) ou **personalizada** (`conta_id` preenchido, `tipo` nulo). A subcategoria é uma categoria com `parent_id`, com um único nível.
- **Classificações de receita** (`classificacoes_receita`, `backend/src/db/schema/incomeClassifications.ts`): mesma ideia de padrão e personalizada, com `parent_id`. O comentário em `backend/src/services/incomeClassificationDefaults.ts` já define que a raiz com subcategorias é só o nome do grupo e não se escolhe ao lançar.

Como o catálogo padrão nasce hoje (verificado no código):

- `backend/src/services/defaultCategories.ts` grava só nomes **planos** (10 nomes pessoais, 14 de empresa), sempre com `parent_id` nulo, via `ensureDefaultCategories`, com `ON CONFLICT (usuario_id, LOWER(nome), tipo) WHERE conta_id IS NULL DO NOTHING`.
- `ensureDefaultCategories` e `ensureDefaultIncomeClassifications` são chamadas em `backend/src/routes/auth.ts`, `backend/src/routes/users.ts`, `backend/src/routes/accounts.ts`, `backend/src/routes/categories.ts` (`POST /default`) e `backend/src/services/accountBackfill.ts`.
- Unicidade: índices únicos por nome em minúsculas, `(usuario_id, LOWER(nome), tipo)` para padrão (migration 0018) e `(conta_id, LOWER(nome))` para personalizadas (migration 0040). Não consideram o `parent_id`.
- Validação da despesa: `backend/src/services/expenseCategoryCatalog.ts` (`isExpenseCategoryAllowed`) **aceita categoria nula** ("despesa sem categoria"). `backend/src/services/expenseInput.ts` lê `categoryId` como opcional.
- Classificação automática: `backend/src/services/categoryAI.ts` usa o fallback `availableCategories.find(c => /outros/i.test(c))` e guarda aprendizados por nome.

**Estado real da produção, verificado em 2026-10-18 (consultas só de leitura):**

- Há **uma conta PF** (id 17, "Rodrigo Martini", usuário 1, 1.378 despesas, 100 receitas, 12 metas de orçamento) e uma conta PJ (id 19, "Aether", 25 despesas), que não muda.
- As categorias padrão de hoje na conta 17 são Alimentação, Transporte, Moradia, Saúde, Lazer, Outros e duas "Encargos de cartão" duplicadas. As demais são personalizadas da conta 17 (Academia, Cuidados Pessoais, Empréstimo, Estudos, Streaming, Trabalho, Vestimenta, Sistema, Telefonia, Imposto, Encargos Cartão, Presentes, Lavanderia, Comissão) com cerca de 50 subcategorias.
- **108 despesas** estão lançadas direto em categoria pai que tem subcategorias, **166** estão no pai "Outros" e **7** estão sem categoria. Há **70 receitas PF** sem classificação.
- `orcamento_metas.categoria_id` tem `onDelete: 'cascade'`: apagar uma categoria apaga a meta.

## Problema

- O catálogo padrão é plano e genérico, então cada usuário monta o próprio em categorias personalizadas, e o resultado é um catálogo desencontrado (pais soltos como "Academia", "Telefonia" e "Presentes", e o pai "Outros" com 166 despesas).
- Despesas e receitas podem ser lançadas direto no pai ou sem categoria, o que quebra relatórios, metas e filtros por categoria.
- O nome de categoria deve ser único por usuário e tipo. Por isso uma sub "Outros" repetida em cada pai não cabe sem convenção de nome, e a IA que cai no primeiro "Outros" escolheria uma categoria qualquer.
- Os lançamentos já existentes na conta 17 estão espalhados entre pais, subcategorias personalizadas e o pai "Outros".

## Objetivo

Substituir o catálogo padrão pessoal por um catálogo **enxuto de 12 pais amplos com subcategorias padrão** (despesas) e **6 pais com subcategorias** (receitas), tornar a **categoria obrigatória** em todo lançamento, bloquear lançamento direto em categoria pai e migrar os dados da conta 17 para o catálogo novo sem perder metas nem histórico.

## Decisão Técnica Desejada

Decisões já tomadas em conversa com o usuário (2026-10-18):

1. **Catálogo padrão com subcategorias.** O catálogo padrão passa a incluir subcategorias (hoje só existem pais planos). A planejadora deve verificar como representar subcategoria padrão (linha com `tipo` preenchido, `conta_id` nulo e `parent_id` preenchido) e como ajustar `ensureDefaultCategories` e os índices únicos.
2. **Sub "Outros de <pai>" em todo pai** (por exemplo "Outros de Moradia"). O nome distinto resolve a unicidade sem mudar os índices. O pai "Outros" de hoje deixa de existir.
3. **Cadastro direto no pai fica bloqueado**, no backend e no frontend. Só se lança em subcategoria. As receitas já seguem essa regra para raízes com subcategorias.
4. **Categoria obrigatória em despesas e receitas**, inclusive em lote, importação, leitura de QR Pix, assistente e recorrências. Não há "sem categoria" nem fallback automático: quando a IA ou o assistente não souberem classificar, **perguntam ao usuário** antes de salvar.
5. **Juros nunca são categoria.** A categoria padrão "Encargos de cartão" deixa de ser selecionável. A despesa "Encargos da fatura" gerada pelo pagamento da fatura (`backend/src/services/cardInvoiceService.ts`) fica com uma **categoria de sistema oculta**, que o usuário não escolhe.
6. **Migração dos dados da conta 17 na mesma task**, com as metas acompanhando a subcategoria nova (mesmo valor).
7. **Aplicável a contas novas**: toda conta PF nova nasce com o catálogo padrão novo.

Outros detalhes (como representar a categoria de sistema oculta, como tornar `categoria_id` obrigatório com segurança) ficam para o planejamento.

### Catálogo de despesas PF (cada pai tem também "Outros de <pai>")

| Pai | Subcategorias |
|---|---|
| Moradia | Aluguel, Condomínio, Energia, Água e Gás, Internet, Telefone, IPTU e Taxas, Manutenção e Reparos, Móveis e Decoração, Eletrodomésticos, Lavanderia e Limpeza, Seguro Residencial/Fiança |
| Alimentação | Mercado, Restaurantes e Bares, Delivery, Padaria e Lanches |
| Transporte | Combustível, Aplicativo e Táxi, Pedágio e Estacionamento, Manutenção do Veículo, IPVA e Licenciamento, Multas, Seguro do Veículo, Financiamento do Veículo, Transporte Público |
| Saúde | Consultas, Exames, Farmácia, Plano de Saúde, Dentista, Terapia, Academia |
| Cuidados Pessoais | Salão, Barbearia, Estética, Cosméticos e Perfumaria |
| Vestuário e Compras | Roupas e Calçados, Acessórios, Eletrônicos, Compras Online |
| Lazer e Viagens | Viagens, Eventos e Passeios, Jogos, Esportes e Hobbies, Bares e Festas |
| Assinaturas | Streaming de Vídeo, Música, Software e Apps |
| Educação | Cursos, Livros e Material, Mensalidade |
| Trabalho e Negócios | Ferramentas e Software, Equipamentos, Despesas Profissionais |
| Família e Social | Presentes, Doações, Filhos, Pets |
| Finanças e Impostos | Empréstimos, Tarifas Bancárias, Impostos, Seguros Pessoais (sem sub de juros e encargos) |

### Catálogo de receitas PF (cada pai tem também "Outros de <pai>")

| Pai | Subcategorias |
|---|---|
| Emprego | Salário, 13º, Férias, Vale Refeição/Alimentação, Bônus e PLR |
| Renda Extra | Freelance, Serviços e Bicos, Vendas, Comissões |
| Benefícios | Aposentadoria, Pensão, Auxílios, Seguro-Desemprego, FGTS (uma sub só) |
| Investimentos e Rendimentos | Juros, Dividendos, Aluguéis, Venda de Ativos |
| Reembolsos e Restituições | Reembolso de Despesas, Restituição de IR, Cashback e Estornos |
| Outras Entradas | Presentes Recebidos, Venda de Bens Usados, Empréstimos Recebidos |

## Escopo Funcional

### Dentro do escopo

- Novo catálogo padrão pessoal de despesas e de receitas, com subcategorias, usado ao criar conta PF nova.
- Convenção de nome "Outros de <pai>" e remoção do pai "Outros" no catálogo padrão pessoal.
- Bloqueio de lançamento em categoria pai (despesas e receitas) e obrigatoriedade da categoria (backend e frontend), incluindo assistente, QR Pix, séries e renovações, comissão e demais pontos que criam despesa.
- Fluxo de "perguntar ao usuário" quando a IA ou o assistente não souberem classificar.
- Categoria de sistema oculta para "Encargos da fatura" e fim da seleção da categoria "Encargos de cartão".
- Migração da conta 17 (categorias, despesas, receitas e metas) conforme o Anexo, com ensaio e conferência.
- Remoção das categorias personalizadas absorvidas e das categorias soltas "Presentes" (979) e "Lavanderia" (980), depois de movidas as despesas e repontadas as metas.

### Fora do escopo inicial

- Campos de valor bruto e líquido nas receitas e o gráfico de juros (task 2).
- Cadastro de Empréstimo com parcelas e juros por parcela (task 3).
- Catálogo e classificações de conta PJ (Aether) e de contratos/vitrine.
- Separar principal e juros nas parcelas já lançadas dos 42 empréstimos antigos.
- Limpeza de branches e stashes antigos, e a conferência da possível duplicata "Casa Gustato" (id 19270).

## Requisitos de Frontend

- Os seletores de categoria e de classificação mostram só subcategorias selecionáveis (pai como grupo, sem seleção).
- Campo categoria obrigatório nos formulários de despesa e de receita, com mensagem clara quando faltar.
- Assistente financeiro e leitura de QR Pix: quando faltar categoria, perguntar ao usuário antes de salvar.
- Telas de configuração de categorias e de classificações devem refletir a nova regra (pai não recebe lançamento; "Outros de <pai>" fica visível).
- Metas de orçamento, filtros e relatórios continuam funcionando com o catálogo novo.
- Sem mudar o layout do painel nem a tela de lançamentos além do necessário.

## Requisitos de Backend

- `ensureDefaultCategories` e `ensureDefaultIncomeClassifications` passam a gravar o catálogo com subcategorias, de forma idempotente.
- `isExpenseCategoryAllowed` e a validação de receita deixam de aceitar categoria nula e rejeitam categoria pai que tenha subcategorias. Os lançamentos antigos já existentes continuam editáveis.
- `categoryAI.ts` deixa de usar o fallback `/outros/i`: sem certeza, devolve "precisa perguntar".
- Revisar todos os pontos que gravam despesa ou receita sem passar pela validação: `backend/src/services/cardInvoiceService.ts` (encargos da fatura), `backend/src/services/commissionService.ts` (cria a categoria "Comissão" sob demanda), `backend/src/services/seriesRenewalService.ts` (renovação de séries), `backend/src/services/expenseService.ts`, `backend/src/services/financialAssistant.ts` e `backend/src/services/fixedIncomes.ts`.
- Nomenclatura nova de código em inglês; os nomes das categorias são dados em português.

## Requisitos de Banco de Dados

- Novas linhas de catálogo (categorias e classificações) com `parent_id`; possível alteração de schema para tornar `despesas.categoria_id` e `receitas.classificacao_id` obrigatórios (hoje aceitam nulo). A forma exata fica para o planejamento.
- Migração de dados da conta 17 numa transação, com **ensaio** (desfaz no fim) e **gravação** separados, travas por `id`, `conta_id` e categoria de origem, e conferência por contagem (modelo do plano `.plans/recategorizar-despesas-subcategoria.md`).
- **Repontar `orcamento_metas` antes de apagar qualquer categoria** (a coluna tem `ON DELETE CASCADE`).
- Antes de tornar o campo obrigatório: classificar as 7 despesas e as 70 receitas hoje sem categoria (ver Anexo).
- **Nenhuma migration nem comando no banco roda sem confirmação explícita do usuário.** O `.env` da raiz aponta para a **produção**; o `.env` não é alterado.

## Requisitos de Segurança e Multi-Tenant

Projeto não é multi-prefeitura: o `AGENT.md` descreve um backend multi-prefeitura com RLS, mas não há RLS nem "prefeitura" no código do Finanças. O isolamento real é por `usuario_id` do **dono da conta** e por `conta_id` (conta compartilhada com membros e colaboradores, resolvida por `resolveAccountOwnerId`).

- Toda gravação e leitura de categoria continua filtrada por dono e conta; um id de categoria vindo do pedido deve pertencer ao catálogo da conta.
- A categoria de sistema oculta não pode ser escolhida nem editada pelo usuário.
- Validação de entrada no backend, não só no frontend.
- Não vazar nome de categoria de outro usuário.

## Requisitos de Migração ou Compatibilidade

- Lançamentos antigos já existentes continuam editáveis; a categoria que o lançamento já tem continua aceita na edição, como hoje.
- Série e renovação de séries copiam a categoria da última parcela: não podem quebrar com a nova validação.
- As 12 metas da conta 17 acompanham a subcategoria nova com o mesmo valor (ver Anexo).
- Subcategorias personalizadas com equivalente padrão são absorvidas (despesas e metas movidas, a personalizada apagada); as sem equivalente ficam como personalizadas sob o pai padrão novo (Bauhaus, Aether e Particular em Trabalho e Negócios).
- Compatibilidade com o painel, relatórios, PDF de relatório, assistente (`assistantQueries.ts`) e `budgetService.ts`.

## Requisitos de Testes

### Frontend

- Testes de regra dos diálogos de despesa e de receita (`src/screens/finance/expense-dialog/*.test.ts`, `src/screens/finance/income-dialog/*.test.ts`): categoria obrigatória, pai não selecionável.
- Testes do assistente financeiro (`src/components/financial-assistant/*.test.ts`): pergunta quando faltar categoria.
- Executar a suíte com `npm test` na raiz (`tsx --test`).

### Backend

- Testes do catálogo padrão novo (idempotência, subcategorias, nomes únicos).
- Testes da validação: categoria nula rejeitada, pai com subcategorias rejeitado, lançamento antigo editável.
- Testes de `categoryAI.ts` sem fallback `Outros`.
- Teste da migração com banco local, incluindo o repontamento das metas antes de apagar categorias.

### E2E

- Manual pelo usuário: criar despesa e receita nas telas; tentar salvar sem categoria e no pai; conferir metas do orçamento, painel e filtros da conta 17 depois da migração.

## Arquivos Provavelmente Afetados

### Frontend

- `src/screens/finance/expense-dialog/` (`ExpenseDialog.tsx`, `ExpenseRow.tsx`, `draftRules.ts`, `draftState.ts`, `useExpenseSuggestions.ts`)
- `src/screens/finance/income-dialog/` (`IncomeDialog.tsx`, `IncomeRow.tsx`, `draftRules.ts`, `draftState.ts`)
- `src/components/financial-assistant/` (`FinancialAssistant.tsx`, `cardDraft.ts`)
- `src/screens/config/CategoriasTab.tsx`, `ClassificacoesReceitaTab.tsx`, `CatalogoEmArvore.tsx`
- `src/screens/finance/BudgetPanel.tsx`, `LancamentosTable.tsx`, `useEntryFilters.ts`
- `src/utils/categorySuggestions.ts`, `src/utils/incomeClassificationSuggestions.ts`
- `src/services/demo/` (dados de demonstração com categorias)

### Backend

- `backend/src/services/defaultCategories.ts`, `incomeClassificationDefaults.ts`, `incomeClassificationCatalog.ts`
- `backend/src/services/expenseCategoryCatalog.ts`, `expenseInput.ts`, `incomeInput.ts`, `categoryAI.ts`, `financialAssistant.ts`
- `backend/src/services/cardInvoiceService.ts`, `commissionService.ts`, `seriesRenewalService.ts`, `expenseService.ts`, `incomeService.ts`, `fixedIncomes.ts`, `budgetService.ts`
- `backend/src/routes/categories.ts`, `income-classifications.ts`, `expenses.ts`, `incomes.ts`, `auth.ts`, `accounts.ts`, `users.ts`, `backend/src/services/accountBackfill.ts`

### Banco de Dados

- `backend/src/db/schema/categories.ts`, `expenses.ts`, `incomeClassifications.ts`, `incomes.ts`, `copilot.ts` (`orcamento_metas`)
- Nova migration em `backend/drizzle/` e script temporário de migração de dados da conta 17 (A identificar durante o planejamento)

## Critérios de Aceite

- Conta PF nova nasce com o catálogo padrão de despesas (12 pais) e de receitas (6 pais), todos com "Outros de <pai>".
- Não é possível salvar despesa ou receita sem categoria, nem em categoria pai que tenha subcategorias, pelo modal, pelo assistente, pelo QR Pix, em lote e em recorrências.
- A IA e o assistente perguntam ao usuário quando não souberem classificar, sem cair em "Outros".
- A categoria "Encargos de cartão" não aparece para escolha, e as despesas "Encargos da fatura" ficam com categoria de sistema oculta.
- Conta 17: nenhuma despesa fica em categoria pai com subcategorias; o pai "Outros" some; as 7 despesas e as 70 receitas sem categoria ficam classificadas; as 12 metas sobrevivem, repontadas com o mesmo valor.
- Totais por pai e por mês da conta 17 antes e depois da migração batem (a conferência compara por pai do catálogo novo).
- As categorias soltas "Presentes" (979) e "Lavanderia" (980) são excluídas depois de movidas.
- Contas PJ, contratos e vitrine não são afetados.
- `npm test` e as validações do backend passam; nomenclatura nova em inglês.

## Perguntas Para o Planejamento

- Como representar subcategoria **padrão** (linha com `tipo`, sem `conta_id`, com `parent_id`)? Os índices únicos atuais e `ensureDefaultCategories` aceitam isso ou precisam mudar?
- O catálogo padrão fica por usuário (como hoje) ou vira global? Como aplicar a mudança à conta 17, que já tem pais padrão antigos (Alimentação, Transporte, Moradia, Saúde, Lazer, Outros)?
- Como modelar a categoria de sistema oculta de "Encargos da fatura" e o que fazer com as 3 despesas de "Encargos Cartão" (957) e as duas "Encargos de cartão" padrão (981 e 982, 1 despesa cada)?
- O que fazer com a categoria "Comissão" (padrão 973, sem despesas) e com `commissionService.ts`, que cria "Comissão" personalizada sob demanda?
- Como tornar `categoria_id` e `classificacao_id` obrigatórios sem quebrar lançamentos antigos já editáveis e linhas geradas por contrato ou série?
- Destino das subcategorias de Streaming (Disney, Netflix, Prime, YouTube, Spotfy): absorvidas em "Streaming de Vídeo" e "Música" ou mantidas como personalizadas sob Assinaturas? E o de **Estudos** (6 despesas) em Educação?
- As receitas de contrato (empresa) e a vitrine usam classificações por nome (`CONTRACT_INCOME_CLASSIFICATION`, `SALES_INCOME_CLASSIFICATION`): alguma dependência por nome no PF que o novo catálogo quebre?
- Importação em lote e QR Pix: onde o usuário escolhe a categoria quando há várias linhas?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `/AGENT.md` e `/CLAUDE.md` (os arquivos `/frontend/AGENT.md`, `/backend/AGENT.md` e `/AGENTS.md` não existem neste projeto).
- Inspecione os arquivos citados antes de escrever o plano.
- Classifique a implementação como `frontend + backend + database`.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations nem comandos no banco de produção; o `.env` da raiz é de **produção** e não pode ser alterado.
- Gere o plano em `.plans/` (padrão deste projeto; o template original cita `.portal/plans/`), com etapas pequenas, revisáveis e seguras para produção.
- Recheque no banco (só leitura) os ids do Anexo antes de fixar o mapeamento, porque o banco pode ter mudado.
- Considerações de memória: as decisões desta task estão em `catalogo_categorias_pf.md` na memória do projeto.

---

## Anexo: mapeamento da conta 17 (decidido em 2026-10-18)

Os ids exatos devem ser relidos no banco durante o planejamento.

### Despesas: de categoria atual para subcategoria nova

| Origem | Destino |
|---|---|
| Alimentação › Mercado, Ifood | Mercado, Delivery |
| Transporte › Combustível, Uber, Pedágio, Mecânica, Lava Car, IPVA, Multas, Financiamento | Combustível, Aplicativo e Táxi, Pedágio e Estacionamento, Manutenção do Veículo (Mecânica e Lava Car juntas), IPVA e Licenciamento, Multas, Financiamento do Veículo |
| Moradia › Aluguel, Condomínio, Energia Elétrica, Internet, Manutenção, Móveis/Eletros/Decoração, Seguro Fiança, Lavanderias | Aluguel, Condomínio, Energia, Internet, Manutenção e Reparos, Móveis e Decoração, Seguro Residencial/Fiança, Lavanderia e Limpeza |
| Telefonia (pai, 11 despesas) | Moradia › Telefone |
| Saúde › Farmácia, Consultas, Exames; Academia (pai, 23 despesas) | Farmácia, Consultas, Exames; Saúde › Academia |
| Cuidados Pessoais › Salão, Barbearia | Salão, Barbearia |
| Vestimenta (pai, 152 despesas) | Vestuário e Compras › Roupas e Calçados |
| Lazer › Futebol, Viagens, Xbox | Esportes e Hobbies, Viagens, Jogos |
| Trabalho › Bauhaus, Aether, Particular | continuam personalizadas sob Trabalho e Negócios |
| Sistema › IA, Banco de Dados, Registro | Trabalho e Negócios › Ferramentas e Software |
| Imposto, INSS | Finanças e Impostos › Impostos |
| Empréstimo (pai, 42 despesas) | Finanças e Impostos › Empréstimos |
| Presentes (pai solto id 979, 9 despesas) | Família e Social › Presentes (e a 979 é excluída) |
| Lavanderia (pai solto id 980, 1 despesa) | Moradia › Lavanderia e Limpeza (e a 980 é excluída) |

### Despesas hoje no pai (108) e no "Outros" (166): destinos decididos

- **Alimentação › Mercado:** Giassi, Bistek, Mercado, Distribuidora, Mercantil Araujo, Avila.
- **Alimentação › Restaurantes e Bares:** Restaurante ×2, Restaurante Rosso, Restaurante Soka, Bistek/bar, Café Bistro, Seu Bragança, Trapiche, Baiuka, Noboru, Engenho, Casa Gustato, Bauhaus Bistro, Combo ×3.
- **Alimentação › Delivery:** Ifood (id 19045, sem categoria hoje). **Padaria e Lanches:** Lanchonete.
- **Moradia › Móveis e Decoração:** Amazon ×100, Havan/Cadeiras ×3. **Eletrodomésticos:** Cooler. **Lavanderia e Limpeza:** Lavanderia ×2. **Manutenção e Reparos:** MIRIAN - LIXO. **Internet:** Engeplus (id 18645, sem categoria hoje).
- **Transporte › Pedágio e Estacionamento:** Estacionamento ×2, Gerestar. **Multas:** MULTA ×7.
- **Saúde › Consultas:** Solumed e Solumedi ×6.
- **Cuidados Pessoais › Barbearia:** DonPetine e Donperine ×11. **Cosméticos e Perfumaria:** Maquiagem.
- **Vestuário e Compras:** Roupas e Calçados para Inkieta ×10, Shein ×7, Camisa Mirian e BKKO ×3 (ids 19254 a 19256, sem categoria hoje); **Compras Online** para Mercado Livre ×9, Shopee, RM Ecommerce e Loja; **Eletrônicos** para Kit Fone ×3, Conserto celular ×2 e Capinha ×2.
- **Lazer e Viagens:** Viagens para Praia, Balsa 2X, Governador C. Ramos e Lazer 21/12 a 22/12; Esportes e Hobbies para Futebol ×8; Eventos e Passeios para Cinema, Boliche e Zanni Convites.
- **Trabalho e Negócios:** Particular para Stream e Streamyard; Bauhaus para Técnológica - Willian (id 18939, sem categoria hoje); Despesas Profissionais para FaceBook ×2; Ferramentas e Software para Registro Domínio.
- **Família e Social:** Presentes para PRESENTE MIRIAN ×3 e Presentes; Doações para Fundação Cultural de Criciúma, FUNDAI e realize sociedade; **Outros de Família e Social** para Mirian ×7, Fatura Mirian e as pessoas no pix (Gilberto Souza, Tania, GKM, Jim, Mana, Gabriel, Hudson, Amauri Goulart, RuanAlves, 64Pedro, Varela, Lorany).
- **Finanças e Impostos:** Impostos para Darf CNPJ; Tarifas Bancárias para Mercado pago e MP; Empréstimos para EMPRÉSTIMO ×9 e Empréstimo Juliano; **Outros de Finanças e Impostos** para os Ajustes (Moradia ×3, Alimentação ×8, Outros ×3) e NuBank - Mirian.
- **Sem destino exato decidido** (vão para o "Outros de" do pai mais próximo e o usuário revisa depois): NÃO SEI, JOLOJADEVARI, TopSul Compressores, Multi 360 e Emergência.

### Metas de orçamento da conta 17 (12, mantêm o valor)

Ifood (R$ 100) e Mercado (R$ 1.300) vão para Delivery e Mercado; Aluguel (R$ 1.006,77), Condomínio (R$ 536,22) e Internet (R$ 120) ficam nas mesmas subs; IA (R$ 114) vai para Ferramentas e Software (junto com Banco de Dados); Combustível (R$ 300), Financiamento (R$ 0,50), IPVA (R$ 60), Mecânica (R$ 270, junto com Lava Car), Pedágio (R$ 5,33, junto com Estacionamento) e Uber (R$ 114,20) vão para as subs equivalentes de Transporte.

### Receitas PF: 94 na conta 17, sendo 70 sem classificação

- **Já classificadas (24; as 6 da PJ não mudam):** Dividendos ×2 permanece em Investimentos e Rendimentos › Dividendos; Comissões ×3 vai para Renda Extra › Comissões; Reembolsos ×3 para Reembolso de Despesas; Outros ×3 para Outras Entradas › Outros de Outras Entradas; Salário, 13º, Férias e Vale refeição permanecem em Emprego.
- **Sem classificação (70):** Salário, Salario, SALÁRIO, Sáraio (15) e reajuste (3) para Emprego › Salário; Vale, Vale alimentação, VALE ALIMENTAÇÃO, BeeVale e Bee (11) para Vale Refeição/Alimentação; FGTS (2) para Benefícios › FGTS; Presente Pai (2) para Presentes Recebidos; Reembolso Bauhaus (2) e Mirian (12, inclusive Mirian - Aluguel) para Reembolso de Despesas; Meli (4) para Renda Extra › Vendas; Empréstimo (1) para Empréstimos Recebidos; Bauhaus, Adiantamento Bauhaus, Tecnológica, Tecnológica - viajem, Chat (4), Whats, Conta@, Agência (15), mais Next, Ajuste e Outros (3), para Renda Extra › Comissões.
- Atenção: o Ajuste de R$ 5.366,78 (dez/2025) entra em Comissões por decisão do usuário e merece conferência pela tela depois da migração.
