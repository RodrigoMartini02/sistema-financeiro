# Plano: Acolhimento e comandos do assistente

## Origem

- Solicitação: tornar a abertura da assistente mais amigável, orientar registro e consulta por texto/voz e corrigir o fluxo que interpretou um gasto como resumo.
- Classificação: `fullstack`, sem alteração de banco.

## Resumo

Ao iniciar uma conversa nova, a assistente apresentará uma orientação acolhedora e três ações: registrar despesa, registrar receita ou fazer uma pergunta. A escolha será enviada como dica de intenção ao backend, mas todo lançamento continuará dependente de rascunho revisável e confirmação explícita.

O interpretador determinístico passará a distinguir declarações de gasto de perguntas sobre gastos, aceitar variações comuns da transcrição por voz e continuar um rascunho incompleto a partir da resposta seguinte.

## Escopo

### Dentro do escopo

- Exibir acolhimento e atalhos de intenção apenas ao iniciar uma conversa nova.
- Definir contexto visual para despesa, receita ou consulta, com exemplo apropriado no campo de texto.
- Enviar uma dica de intenção validada pelo backend junto da mensagem.
- Corrigir a prioridade entre cadastro e consulta para frases como "fiz compras no mercado hoje gastei R$ 100".
- Normalizar, apenas para interpretação, variações de voz como "pics" para Pix; manter a transcrição visível para revisão.
- Considerar compras/gastos declarados como despesa já paga quando o texto indicar que a compra ocorreu.
- Permitir que uma resposta curta complete um rascunho pendente, preservando os demais campos já extraídos.
- Acrescentar cobertura automatizada do resolvedor de intenção e parser determinístico.

### Fora do escopo

- Palavra de ativação permanente, gravação de áudio, transcrição no backend ou envio de áudio a provedores externos.
- Salvamento automático de receitas ou despesas.
- Novas integrações de IA, mudanças de planos, migrations ou alterações de ambiente.

## Leitura de Contexto

- `FinancialAssistant.tsx` concentra a abertura, mensagem inicial, atalhos, entrada de voz e confirmação manual do rascunho.
- `copilotIntent.ts` atualmente classifica a palavra "gastei" como resumo antes de avaliar verbos de cadastro.
- `financialCopilot.ts` recebe o contexto do rascunho, resolve o perfil autenticado e decide entre consulta e rascunho.
- `financialAssistant.ts` extrai valor, descrição, data, forma de pagamento e estado de pagamento a partir do texto.

## Impacto por Área

### Frontend

- Criar os três atalhos de intenção na mensagem de boas-vindas de uma conversa nova.
- Exibir o modo ativo de forma compacta, com opção de removê-lo, e ajustar placeholder/exemplo para o modo escolhido.
- Após a fala, mostrar uma confirmação breve de transcrição no próprio composer, mantendo o envio manual.
- Limpar a dica de intenção após a resposta, preservando-a apenas para completar o rascunho em curso.

### Backend

- Estender o contrato do chat com uma dica opcional de intenção validada na rota.
- Priorizar essa dica ao resolver intenção, sem permitir escrita direta no banco.
- Refatorar o classificador determinístico para identificar perguntas antes de usar palavras ambíguas como "gastei" e reconhecer frases declarativas de cadastro.
- Usar o contexto de rascunho incompleto para tratar respostas curtas como continuação de cadastro.
- Centralizar a normalização de texto de voz para que a mesma regra seja usada na intenção e na montagem do rascunho.

### Banco de Dados

- Nenhuma alteração de schema ou migration.

### Infra/Deploy

- Nenhuma alteração de variáveis, chaves, permissões ou deploy.

## Arquivos Provavelmente Afetados

- `src/components/financial-assistant/FinancialAssistant.tsx`
- `src/services/assistantService.ts`
- `src/types/financialCopilot.ts`
- `backend/src/routes/assistant.ts`
- `backend/src/services/copilotIntent.ts`
- `backend/src/services/financialCopilot.ts`
- `backend/src/services/financialAssistant.ts`
- `backend/src/services/copilotIntent.test.ts`
- Novo teste determinístico do parser financeiro, se a extração puder ser isolada sem acessar banco.

## Estratégia de Implementação

1. Criar o tipo de dica de intenção compartilhado pelo contrato de chat e validá-lo no backend.
2. Adicionar na interface uma mensagem de acolhimento com ações compactas e um estado local do modo escolhido.
3. Fazer as ações definirem contexto de despesa, receita ou consulta sem preencher artificialmente a mensagem da pessoa.
4. Exibir a última transcrição de voz antes do envio e manter o envio manual, para preservar a revisão humana.
5. Reordenar e tornar explícitas as regras de intenção: perguntas são consultas; declarações de compra/gasto com valor são registros; uma dica escolhida prevalece sobre a inferência ambígua.
6. Normalizar aliases de voz de alta confiança para forma de pagamento e ampliar os verbos de despesa já paga.
7. Ao existir rascunho sem descrição ou valor, interpretar a resposta curta seguinte como complemento, salvo quando houver uma pergunta clara.
8. Adicionar testes regressivos para o caso mostrado, consulta legítima, Pix transcrito incorretamente, estado pago e continuação de rascunho.

## Segurança, Dados e Multi-Tenant

- A dica de intenção é apenas contexto de interface; usuário, perfil e acesso continuam resolvidos no backend autenticado.
- A rota do chat continuará apenas preparando rascunhos. A gravação permanece exclusivamente no fluxo de confirmação existente.
- A transcrição continua sendo texto no navegador e não haverá armazenamento ou envio de áudio.
- Consultas e conversas continuam filtradas pelo usuário autenticado e perfil financeiro resolvido no servidor.

## Validações Necessárias

- Build do frontend.
- Checagem TypeScript do backend.
- Testes existentes e novos do backend.
- Teste manual: abrir conversa nova, usar cada atalho, falar uma despesa, conferir transcrição, gerar rascunho e confirmar que nenhum lançamento ocorre antes da confirmação.
- Teste manual: abrir conversa restaurada, sem repetir a orientação de primeiro uso.

## Riscos e Pontos de Atenção

- A transcrição do navegador pode continuar cometer erros; a correção por alias deve ser limitada a variações inequívocas e sempre revisável no rascunho.
- Palavras como "gastei" são ambíguas. O resolvedor deve privilegiar sinais de pergunta para consultas e sinais de ação/valor para cadastro.
- O estado de rascunho pendente não deve transformar uma consulta explícita em lançamento; perguntas claras devem continuar anulando a continuação.

## Perguntas em Aberto

- Nenhuma para esta entrega. O texto de acolhimento será genérico, sem usar nome pessoal, e poderá ser refinado depois com base no uso real.

## Critérios de Aceite

- Uma conversa nova abre com orientação amigável e os três atalhos pedidos.
- "Fiz compras no mercado hoje, gastei R$ 100 no Pix" gera rascunho de despesa, não resumo.
- "Quanto gastei este mês?" retorna consulta, não rascunho.
- A transcrição "pics" é interpretada como Pix no rascunho e permanece revisável.
- Uma resposta curta completa um rascunho incompleto sem perder campos já entendidos.
- Nenhuma despesa ou receita é salva sem confirmação explícita.

## Instruções Para /implementar

- Verificar o git antes de editar, pois há outro agente trabalhando no repositório.
- Não alterar migrations, banco, `.env`, chaves, plano de assinatura ou deploy.
- Reutilizar o componente atual, sem introduzir dependências.
- Não incluir o arquivo de plano não relacionado `corrigir-scroll-horizontal-mobile.md` em alterações desta entrega.
