# Plano: Guia de Equilibrio e Planejamento em Movimentacoes

## Origem

- Task/arquivo de origem: descricao aprovada pelo usuario durante a revisao do copiloto financeiro e do painel.
- Classificacao: fullstack.

## Resumo

Separar dois conceitos que hoje ocupam a mesma area do painel:

1. O Painel passara a mostrar um guia visual e educativo de equilibrio financeiro, baseado na distribuicao observada de despesas de consumo da POF/IBGE. O guia nao sera uma meta editavel nem uma recomendacao financeira individual obrigatoria.
2. As metas pessoais ja existentes permanecerao editaveis, mas serao exibidas em uma nova aba Planejamento, ao lado de Receitas e Despesas dentro de Movimentacoes.

O guia sera exclusivo para perfis pessoais. Perfis empresariais continuarao com os indicadores financeiros proprios e nao receberao faixas de consumo pessoal.

## Escopo

### Dentro do escopo

- Remover a tabela de metas do Painel financeiro.
- Criar um componente visual de guia de equilibrio da renda no Painel, com grafico de distribuicao, indicadores de situacao e barras de comparacao por categoria.
- Exibir leitura em portugues: Abaixo da referencia, Dentro da faixa de referencia, Atencao, Risco de comprometimento e Sem referencia.
- Tornar explicito que a referencia e uma comparacao estatistica, nunca uma meta cientifica obrigatoria ou uma recomendacao individual.
- Criar uma terceira aba Planejamento em Movimentacoes, ao lado das abas Receitas e Despesas.
- Reaproveitar a tela atual de metas no contexto da aba Planejamento, preservando criacao, edicao, exclusao, sugestao pelo historico e dados ja persistidos.
- Ocultar ou adaptar controles que nao se aplicam ao planejamento, como modo calendario e acoes de nova receita ou nova despesa enquanto essa aba estiver ativa.
- Adicionar ao resumo de orcamento a classificacao de categoria e a faixa de referencia necessarias para o guia do Painel.
- Mapear, de forma deterministica, categorias pessoais conhecidas para grupos de consumo e manter categorias nao reconhecidas como Sem referencia, sem alterar o cadastro do usuario.
- Cobrir o mapeamento e a classificacao em testes sem chamadas externas.

### Fora do escopo

- Alterar, criar ou apagar metas existentes de usuarios.
- Criar migration ou modificar o schema do banco.
- Aplicar faixas pessoais de consumo a perfis empresariais.
- Alterar planos comerciais, cobranca, integracoes de IA ou fluxos do copiloto.
- Transformar a referencia estatistica em recomendacao de investimento, credito ou aconselhamento financeiro individual.

## Leitura de Contexto

- `src/screens/finance/FinanceDashboard.tsx` renderiza `BudgetPanel` diretamente abaixo dos KPIs do Painel.
- `src/screens/finance/BudgetPanel.tsx` concentra a tabela, o formulario de metas e as mutacoes de salvar/remover meta.
- `src/screens/finance/MovimentacoesScreen.tsx` ja possui o componente segmentado entre Receitas e Despesas e repassa esse controle como `toolbarStart` para as telas embutidas.
- `backend/src/services/budgetService.ts` resolve o perfil autenticado, filtra receitas/despesas pelo perfil e devolve metas, gasto realizado, projetado e sugestao historica.
- `backend/src/routes/budget.ts` protege as rotas com autenticacao e delega a validacao de perfil ao servico.
- `src/types/budget.ts` espelha o contrato do resumo de orcamento no frontend.
- A base estatistica sera a POF 2017-2018 do IBGE. Ela apresenta distribuicao observada de despesas de consumo, e nao limites prescritivos de renda. Referencia: https://agenciadenoticias.ibge.gov.br/agencia-sala-de-imprensa/2013-agencia-de-noticias/releases/25598-pof-2017-2018-familias-com-ate-r-1-9-mil-destinam-61-2-de-seus-gastos-a-alimentacao-e-habitacao

## Impacto por Area

### Frontend

- Criar um componente dedicado ao Guia de equilibrio da renda, usando os componentes de grafico ja adotados no projeto.
- O guia exibira receita do periodo, total de despesas classificadas, comprometimento e a distribuicao por grupos de consumo.
- Cada grupo reconhecido tera valor projetado, percentual da receita como contexto, percentual da distribuicao classificada como base de comparacao e uma faixa visual com seu indicador.
- O valor e o percentual da receita podem ser exibidos como contexto; a classificacao deve se apoiar na participacao entre despesas de consumo classificadas, para manter fidelidade metodologica a POF.
- Para categorias sem correspondencia estatistica, o guia exibira o gasto normalmente, mas sem atribuir status economico artificial.
- `BudgetPanel` sera reutilizado somente na aba Planejamento, com texto e acoes coerentes com metas pessoais.
- `MovimentacoesScreen` incluirá Planejamento no tipo de aba, no seletor e no render condicional. Ao selecionar essa aba, a visualizacao sera lista, pois planejamento nao possui calendario de lancamentos.
- Os controles de periodo e atualizacao permanecerao acessiveis no planejamento; os comandos de cadastrar receita/despesa e o seletor de calendario nao aparecerao nesse contexto.

### Backend

- Criar um helper puro de referencias de consumo para normalizar nomes de categoria e associar grupos como Habitacao, Alimentacao, Transporte, Saude, Educacao, Vestuario, Higiene e cuidados pessoais e Lazer e cultura.
- O helper retornara a referencia percentual e um estado de classificacao apenas para perfis pessoais com dados suficientes.
- Estender `BudgetOverviewItem` e a resposta de `getBudgetOverview` com os campos de referencia, sem alterar os endpoints existentes nem as operacoes de meta.
- Manter o uso de `resolveFinancialProfile` e dos filtros atuais por usuario e perfil. Nenhuma referencia pode fazer consultas que misturem perfis.

### Banco de Dados

- Nenhuma mudanca de schema ou migration.
- As metas em `orcamento_metas` permanecem como dados de planejamento individual e os lancamentos existentes continuam sendo a fonte dos valores realizados e projetados.

### Infra/Deploy

- Nenhuma alteracao de ambiente, chaves, variaveis ou provedor externo.
- A entrega local nao exige migration. Qualquer deploy posterior continua exigindo confirmacao explicita do usuario.

## Arquivos Provavelmente Afetados

- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/finance/BudgetPanel.tsx`
- `src/screens/finance/MovimentacoesScreen.tsx`
- `src/screens/finance/IncomeBalanceGuide.tsx` (novo)
- `src/types/budget.ts`
- `backend/src/services/budgetService.ts`
- `backend/src/services/budgetReference.ts` (novo)
- `backend/src/services/budgetReference.test.ts` (novo)

## Estrategia de Implementacao

1. Extrair a classificacao de referencias para um helper puro no backend. A normalizacao sera tolerante a acentos e variacoes comuns de nomes, mas nao alterara categorias cadastradas.
2. Definir faixas de comparacao de produto ao redor do valor de referencia e nomes que deixem claro seu carater estatistico. A faixa mostrara abaixo, dentro, atencao ou risco; ela nao sera chamada de meta nem de recomendacao obrigatoria.
3. Incluir os dados de referencia apenas no resumo de perfis pessoais e preservar a resposta empresarial sem faixas pessoais.
4. Atualizar os tipos e criar o Guia de equilibrio da renda, com visualizacao responsiva por grafico e barras de comparacao, sem tabela de metas no Painel.
5. Mover o uso de `BudgetPanel` para Movimentacoes e adicionar a aba Planejamento ao controle existente.
6. Ajustar estados de interface para impedir que Planejamento fique ativo no modo calendario e para exibir somente comandos relevantes a cada aba.
7. Validar build, tipagem e cenarios de isolamento e classificacao.

## Seguranca, Dados e Multi-Tenant

- O perfil solicitado continuara sendo confirmado pelo backend com usuario autenticado e perfil ativo. IDs enviados pelo cliente nao concedem acesso por si so.
- Receitas, despesas, metas e referencias sempre serao derivados do mesmo usuario e perfil resolvidos pelo servico atual.
- O guia nao tera acesso a dados de outro perfil, nem misturara perfil pessoal com empresa.
- Nenhum dado financeiro sera enviado a servico externo.
- O texto da interface deve evitar promessas de resultado ou tratamento da referencia como aconselhamento financeiro individual.

## Validacoes Necessarias

- `npm run build` no frontend.
- `npm run build` no backend.
- `npm run test` no backend.
- Verificacao manual em desktop e mobile: Painel sem tabela de metas, graficos sem sobreposicao e estados vazios claros.
- Verificacao manual: aba Planejamento aparece entre Receitas e Despesas, preserva a edicao de meta e nao exibe controles de calendario incompativeis.
- Verificacao manual: perfil pessoal mostra referencias; perfil empresa nao recebe referencias pessoais.

## Testes Recomendados

- Categoria reconhecida retorna grupo e percentual de referencia esperados.
- Categoria com acento ou sinonimo comum continua sendo reconhecida.
- Categoria desconhecida nao recebe indicador prescritivo.
- Perfil sem receita nao recebe classificacao de risco baseada em divisao invalida.
- Valores abaixo, dentro da faixa, em atencao e em risco recebem estados consistentes.
- A resposta de metas existente continua funcional para criar, editar e remover metas no perfil pessoal.
- O perfil empresarial continua bloqueado para metas pessoais.

## Riscos e Pontos de Atencao

- Os dados da POF descrevem distribuicao de despesas de consumo e nao uma proporcao obrigatoria da renda. A interface e a regra devem deixar essa diferenca visivel.
- Categorias personalizadas podem nao corresponder aos grupos do IBGE. Elas devem permanecer sem referencia em vez de serem classificadas de forma imprecisa.
- O workspace contem alteracoes de outro agente em areas publicas e de demo. A implementacao deve se limitar aos arquivos financeiros e trabalhar com quaisquer mudancas ja presentes em `AppShell`.
- Como o contrato do resumo sera expandido, frontend e backend devem ser atualizados em conjunto antes de qualquer deploy.

## Perguntas em Aberto

- Nenhuma para iniciar. A implementacao adotara a comparacao estatistica conservadora descrita acima, sem apresentar a POF como limite individual de gasto.

## Criterios de Aceite

- O Painel nao exibe a tabela de metas por categoria.
- O Painel pessoal exibe um guia visual com dados reais do periodo, referencias reconheciveis e estados claros.
- A referencia aparece como leitura estatistica, nao como meta ou regra financeira obrigatoria.
- A tabela de metas fica acessivel em Movimentacoes, na aba Planejamento, ao lado de Receitas e Despesas.
- Criar, editar e remover metas continuam funcionando no perfil pessoal.
- Nenhuma migration e executada ou necessaria.
- Perfis e usuarios permanecem isolados em todas as consultas.
- Frontend e backend constroem com sucesso e os testes do backend passam.

## Instrucoes Para /implementar

- Implementar somente este plano e preservar alteracoes nao relacionadas existentes no workspace.
- Usar `apply_patch` para edicoes manuais.
- Nao executar migration, alterar `.env`, fazer commit, push ou deploy durante a implementacao.
- Ao concluir, executar as validacoes definidas e reportar os resultados.
