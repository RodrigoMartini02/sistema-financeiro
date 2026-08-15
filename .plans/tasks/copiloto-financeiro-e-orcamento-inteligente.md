# Task: Copiloto financeiro e orcamento inteligente

## Contexto

O FinGerence ja possui uma assistente financeira conversacional no frontend e uma rota backend para preparar rascunhos de receitas e despesas a partir de texto, voz e anexos. Ela ainda interpreta toda mensagem como tentativa de cadastro. Por isso, perguntas como "quanto gastei?" acabam gerando um rascunho inadequado em vez de uma resposta baseada nos lancamentos reais.

O dashboard financeiro ja apresenta receitas, despesas, saldo, comprometimento, categorias, parcelas e outros indicadores. A proxima evolucao deve unir esses dados a um copiloto financeiro e a uma area de orcamento com metas configuraveis, referencias explicadas e alertas uteis.

## Problema

O fluxo atual nao distingue intencoes de conversa nem consulta os dados financeiros pelo backend. Tambem faltam metas de gasto por categoria e uma leitura clara de realizado versus meta, projetado para o fim do mes e possiveis acoes. Percentuais de referencia devem apoiar a decisao do usuario, sem serem apresentados como regra financeira universal ou recomendacao individual.

## Objetivo

Transformar a assistente em um copiloto financeiro orientado por intencao e por dados autorizados do usuario, capaz de responder consultas, preparar rascunhos sob confirmacao e apoiar um orcamento inteligente no dashboard com metas pessoais ajustaveis.

## Escopo

### Dentro do escopo

- Corrigir o fluxo de conversa para separar ao menos as intencoes de consultar, cadastrar, organizar e pedir ajuda.
- Permitir que perguntas financeiras retornem respostas e cards de dados baseados exclusivamente nos lancamentos do usuario autenticado.
- Manter a criacao e alteracao de receitas ou despesas como rascunho sujeito a revisao e confirmacao explicita.
- Definir contratos de ferramentas internas para o copiloto consultar resumo mensal, extrato lancado, gastos por categoria, contas a vencer e dados necessarios a rascunhos.
- Criar uma base de instrucoes, exemplos de conversa e criterios de seguranca para o copiloto, sem copiar prompts proprietarios nem treinar com dados pessoais sem consentimento.
- Adicionar um orcamento inteligente ao dashboard: realizado versus meta por categoria, percentual da receita, projecao mensal e alertas compreensiveis.
- Permitir metas pessoais ajustaveis por categoria e uma configuracao inicial baseada em historico disponivel e faixas de referencia claramente identificadas como referencia, nao prescricao.
- Diferenciar regras e indicadores de perfil pessoal e empresarial quando o produto ja disponibilizar essa distincao no contexto do usuario.
- Prever entradas por texto, voz e documentos como formas de iniciar o mesmo fluxo de intencao e revisao.
- Definir testes de cenarios reais, incluindo perguntas de consulta que nao podem criar rascunhos de lancamento.

### Fora do escopo inicial

- Integracao com Open Finance, contas bancarias, cartoes ou pagamento de transacoes.
- Execucao automatica de transacoes ou alteracoes financeiras sem confirmacao do usuario.
- Recomendacoes de investimento, credito ou aconselhamento financeiro individualizado.
- Treinar ou hospedar um modelo de IA proprio.
- Migracoes, alteracoes de schema ou novas dependencias sem avaliacao e confirmacao explicita durante a implementacao.

## Impacto Previsto

### Frontend

- Evolucao do componente da assistente para mostrar respostas de consulta, estados de conversa e cards de dados sem exibir formulario de lancamento quando nao houver rascunho.
- Evolucao do dashboard financeiro para exibir acompanhamento de orcamento e metas por categoria em desktop e mobile.
- Possivel ampliacao dos tipos e servicos do frontend para contratos de conversa, consultas e metas.

### Backend

- Evolucao da rota e do servico da assistente para classificar intencoes e executar ferramentas internas autorizadas.
- Novas consultas agregadas aos dados financeiros do usuario autenticado, respeitando autorizacao e isolamento dos dados.
- Validacao estruturada de entradas e respostas do copiloto, com operacoes de escrita permanecendo em modo rascunho ate confirmacao.

### Banco de Dados

- A identificar durante o planejamento: metas persistentes por categoria podem exigir armazenamento proprio ou reutilizacao de estruturas existentes.
- Nenhuma migration deve ser executada sem confirmacao explicita.

### Infra/Deploy

- Sem impacto de infra/deploy identificado inicialmente.
- O uso futuro de um provedor de IA generativa deve ser decidido separadamente, com avaliacao de custo, privacidade, LGPD e configuracao segura.

## Seguranca e Dados

- Toda consulta deve considerar apenas dados do usuario autenticado e jamais confiar em identificadores financeiros enviados livremente pelo client.
- Dados financeiros, anexos e transcricoes sao sensiveis: limitar dados enviados a qualquer modelo externo e registrar somente o necessario para auditoria e suporte.
- O copiloto deve informar dados calculados a partir de fontes rastreaveis e nunca inventar valores, saldos ou transacoes.
- Operacoes de escrita devem exigir confirmacao explicita do usuario antes do salvamento.
- Referencias de gasto devem ser apresentadas como parametros editaveis e contextualizados, nao como recomendacao individual ou diagnostico financeiro.
- Nunca executar migrations sem confirmacao explicita.
- Nunca alterar `.env`.

## Arquivos Provavelmente Afetados

- `src/components/financial-assistant/FinancialAssistant.tsx`
- `src/services/assistantService.ts`
- `src/types/financialAssistant.ts`
- `src/screens/finance/FinanceDashboard.tsx`
- `src/hooks/useFinanceDashboard.ts`
- `backend/src/routes/assistant.ts`
- `backend/src/services/financialAssistant.ts`

## Critérios de Aceite

- Ao perguntar sobre gastos, receitas, categorias ou lancamentos, o usuario recebe uma resposta baseada nos dados do periodo selecionado e nenhum rascunho e aberto indevidamente.
- Ao informar uma receita, despesa, voz ou comprovante, a assistente prepara um rascunho revisavel e so salva apos confirmacao explicita.
- O dashboard mostra realizado, meta, percentual da receita e estado de acompanhamento para categorias que tenham meta configurada.
- O usuario pode ajustar suas metas e compreender que qualquer faixa inicial e uma referencia, nao uma regra obrigatoria.
- Consultas e operacoes do copiloto respeitam autenticacao, autorizacao, isolamento de dados e validacao no backend.
- Existem cenarios automatizados ou verificaveis para consultas, rascunhos, confirmacao e ausencia de dados.

## Perguntas Para o Planejamento

- Onde o produto atualmente identifica o perfil pessoal ou empresarial e como essa informacao chega ao dashboard e a assistente?
- Quais categorias existentes podem receber metas sem alterar o modelo de dados, e qual armazenamento sera necessario para metas personalizadas?
- Quais consultas entram no primeiro corte do copiloto para entregar valor sem ampliar demais o escopo?
- Qual estrategia de IA generativa sera usada na primeira versao: regras deterministicas, provedor externo com tool calling ou abordagem hibrida?
- Como sera apresentada a fonte e a linguagem das faixas de referencia, incluindo a separacao entre dados observados e metas definidas pelo usuario?
- Quais indicadores de negocio devem existir para medir uso, correcao de rascunhos, qualidade de resposta e confianca do usuario?

## Instruções Para /planejar

- Usar esta task como especificacao de entrada.
- Ler `AGENT.md` e `CLAUDE.md`.
- Inspecionar arquivos citados antes de propor alteracoes.
- Gerar plano em `.plans/`.
- Nao implementar codigo durante o planejamento.
- Nao assumir staging ou PR.
