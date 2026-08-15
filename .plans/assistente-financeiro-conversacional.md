# Plano: Assistente financeiro conversacional

## Origem

- Task de origem: `.plans/tasks/assistente-financeiro-conversacional.md`
- Classificacao: `fullstack + possivel infra/deploy`
- Objetivo: permitir registrar e preparar lancamentos financeiros por conversa, voz e anexos, com revisao humana obrigatoria antes de salvar.

## Resumo

Criar uma assistente financeira interna com uma experiencia familiar de chat: janela flutuante no desktop e tela inteira no mobile. A pessoa podera escrever, falar ou enviar documentos para gerar um rascunho de receita ou despesa.

O fluxo deve combinar leitura deterministica de Pix, PDF, OCR e regras financeiras ja existentes com uma camada opcional de IA para interpretar linguagem natural e devolver dados estruturados. Em todos os casos, a assistente apenas prepara o rascunho; o lancamento so entra no sistema depois da revisao e confirmacao da pessoa.

## Escopo

### Dentro do escopo

- Assistente acessivel nas telas autenticadas do sistema.
- Botao flutuante e modal/painel no desktop.
- Experiencia em tela cheia no mobile.
- Conversa por texto para receitas e despesas.
- Entrada por voz, convertida em texto e processada pelo mesmo fluxo de conversa.
- Envio de imagem, PDF e texto para extracao inicial de dados financeiros.
- Leitura de QR Code Pix e Pix copia e cola quando fornecidos.
- Uso de OCR, leitura de PDF e heuristicas existentes para valor, data, favorecido, descricao e categoria.
- Rascunho estruturado de receita ou despesa, com campos faltantes e nivel de confianca.
- Perguntas de complemento quando nao houver dados suficientes para montar o lancamento.
- Cartao de revisao que permita corrigir os dados antes de confirmar.
- Gravacao final reaproveitando os fluxos ja existentes de receitas e despesas.
- Aviso de possivel duplicidade antes da confirmacao.
- Acesso protegido por autenticacao e plano ativo.

### Fora do escopo do MVP

- Integracao com WhatsApp real ou outro mensageiro externo.
- Conexao bancária/Open Finance, DDA, consulta automatica de boletos ou pagamento de Pix/boletos.
- Salvamento automatico de lancamentos sem confirmacao.
- Processamento completo e generico de folha de pagamento.
- Historico persistente de conversas e auditoria detalhada da conversa.
- Importacao completa de planilhas, OFX ou CSV; isso fica como evolucao posterior.
- Resposta falada da assistente; o MVP contempla voz como entrada.

## Leitura de Contexto

- O frontend ja possui formularios e servicos de receitas, despesas, categorias e anexos.
- O backend ja contem servicos para OCR/PDF (`ocrService.ts`), leitura de Pix (`pixReader.ts`), extrato (`extratoParser.ts`) e sugestao de categoria (`categoryAI.ts`).
- As rotas atuais de receitas e despesas ja recebem anexos e devem continuar sendo a fonte de persistencia dos lancamentos.
- O backend ja possui SDKs de OpenAI e Anthropic instalados, mas a primeira versao nao deve depender de chave externa para funcionar de forma basica.
- A politica atual do servidor bloqueia microfone; sera necessario permitir microfone somente para a origem do app quando a captura de voz for implementada.

## Impacto por Area

### Frontend

- Criar os componentes da assistente: acionador, painel, lista de mensagens, compositor, envio de anexos, gravacao de voz e cartao de revisao.
- Integrar o acionador no `AppShell` para que a assistente esteja disponivel nas rotas internas.
- Criar um servico de API e tipos para mensagens, anexos e rascunhos financeiros.
- Reaproveitar o padrao visual, tokens, icones e componentes existentes do FinGerence.
- Adaptar a experiencia responsiva: painel compacto no desktop e tela inteira no mobile.
- Mostrar estados claros para carregamento, falha de leitura, permissao de microfone negada, dados incompletos, possivel duplicidade e confirmacao.

### Backend

- Criar rota autenticada para interpretar mensagens e anexos, por exemplo `POST /api/assistant/financial-draft`.
- Proteger a rota com `authenticate` e `requireActivePlan`.
- Criar um servico orquestrador que escolha a melhor fonte de extracao: Pix, texto de PDF, OCR, regras de extrato, heuristicas e IA opcional.
- Validar payloads e limitar tipos e tamanhos de anexo aceitos pela assistente.
- Retornar somente rascunhos estruturados; a rota da assistente nao deve gravar receitas ou despesas diretamente.
- Evitar logs de documentos, audio, base64 e conteudo financeiro sensivel.

### Banco de Dados

- Nenhuma migration e necessaria no MVP: a conversa pode ficar apenas em memoria no frontend e os lancamentos confirmados usam as tabelas atuais.
- Um historico de conversas, auditoria e limites de uso podem ser avaliados em uma fase posterior com modelo de dados proprio.

### Infra/Deploy

- Ajustar cuidadosamente a `Permissions-Policy` para microfone quando a captura de voz estiver pronta.
- Confirmar que producao opera em HTTPS, requisito de navegadores para captura de audio.
- Configurar provedores de transcricao/IA somente por variaveis de ambiente existentes e sem expor chaves ao frontend.
- Avaliar custo, timeout e limites do provedor antes de ativar IA ou transcricao em producao.

## Arquivos Provavelmente Afetados

- `src/layout/AppShell.tsx`
- `src/components/financial-assistant/FinancialAssistantLauncher.tsx` (novo)
- `src/components/financial-assistant/FinancialAssistantPanel.tsx` (novo)
- `src/components/financial-assistant/AssistantComposer.tsx` (novo)
- `src/components/financial-assistant/AssistantMessageList.tsx` (novo)
- `src/components/financial-assistant/AssistantDraftCard.tsx` (novo)
- `src/components/financial-assistant/AssistantVoiceInput.tsx` (novo)
- `src/services/assistantService.ts` (novo)
- `src/types/finance.ts`
- `src/services/apiClient.ts`
- `src/ui/AttachmentSection.tsx` ou componente dedicado de anexo/voz
- `backend/src/server.ts`
- `backend/src/routes/assistant.ts` (novo)
- `backend/src/services/financialAssistant.ts` (novo)
- `backend/src/services/ocrService.ts`
- `backend/src/services/pixReader.ts`
- `backend/src/services/extratoParser.ts`
- `backend/src/services/categoryAI.ts`

## Estrategia de Implementacao

1. Construir a casca visual da assistente e sua responsividade, sem alterar os formularios atuais.
2. Definir tipos de mensagem e de rascunho financeiro compatveis com `IncomeFormValues` e `ExpenseFormValues`.
3. Criar endpoint autenticado que receba texto e anexos e devolva um rascunho, campos pendentes, justificativas curtas e sinais de confianca.
4. Implementar primeiro o caminho local e deterministico: texto simples, QR Pix, Pix copia e cola, texto de PDF, OCR e heuristicas existentes.
5. Usar IA somente como fallback opcional para linguagem livre ou documentos pouco estruturados, exigindo resposta JSON validada antes de chegar ao frontend.
6. Exibir uma conversa objetiva, com perguntas para os dados obrigatorios que faltarem.
7. Mostrar cartao de revisao editavel, detectar candidatos a duplicidade e exigir confirmacao explicita.
8. Ao confirmar, chamar os servicos existentes de salvar receita ou despesa, mantendo as regras de perfil e anexos atuais.
9. Adicionar captura de voz e transcricao para alimentar o mesmo fluxo textual; tratar permissao negada e indisponibilidade do provedor.
10. Validar comportamento no desktop e no mobile, incluindo estados de erro e limites de plano.

## Seguranca e Dados

- Nunca criar lancamento automaticamente a partir de IA, OCR ou audio.
- Tratar anexos, comprovantes, boletos e voz como dados financeiros sensiveis.
- Manter os dados dentro do usuario e perfil ativos usados pelas rotas atuais.
- Nao registrar em log conteudo de anexos, transcricoes completas, valores ou identificadores financeiros desnecessarios.
- Validar tipo, tamanho e quantidade de arquivos antes do processamento.
- Sanitizar qualquer texto retornado por provedores externos e validar rigorosamente o JSON estruturado.
- Oferecer aviso claro quando a leitura tiver baixa confianca ou faltar informacao essencial.

## Validacoes Necessarias

- Build do frontend e do backend.
- Teste manual de abertura, fechamento e preservacao da conversa durante a sessao.
- Teste desktop e mobile para o painel responsivo.
- Cadastro por texto de uma receita e de uma despesa.
- Cadastro com dados incompletos, garantindo pergunta complementar antes da revisao.
- Leitura de Pix por QR Code e texto copia e cola.
- Leitura de PDF com texto e imagem/comprovante via OCR.
- Fluxo de voz com permissao concedida, negada e dispositivo indisponivel.
- Confirmacao final e persistencia por meio dos servicos existentes.
- Aviso de possivel duplicidade sem impedir correcao ou cancelamento.
- Bloqueio do endpoint para usuario sem sessao ou sem plano ativo.
- Garantia de que anexos e dados brutos nao aparecam nos logs da aplicacao.

## Testes Recomendados

- Testes unitarios do normalizador de rascunho e das regras de classificacao texto/Pix/documento.
- Testes de rota para autenticacao, plano ativo, payload invalido, anexo invalido e retorno estruturado.
- Testes de componentes para estados de conversa, revisao, confirmacao e erros de permissao de microfone.
- Teste manual de regressao nos formularios atuais de receitas e despesas.

## Riscos e Pontos de Atencao

- OCR e IA podem interpretar valor, data ou favorecido incorretamente; a revisao humana e obrigatoria.
- Documentos e audio podem aumentar latencia e custo; usar limite de tamanho, timeout e processamento progressivo.
- A IA deve ser opcional e ter fallback local para evitar bloquear o recurso por falta de chave ou indisponibilidade externa.
- Captura de audio exige HTTPS, permissao do navegador e politica de seguranca compativel.
- Anexos em base64 podem aumentar o tamanho das requisicoes; avaliar upload dedicado antes de expandir formatos e duracao de audio.
- Folha de pagamento tem regras e documentos muito variados; deve iniciar com extracao assistida e nao com automacao completa.
- Como ha outro agente trabalhando no projeto, conferir alteracoes recentes antes de editar arquivos compartilhados, especialmente `AppShell`, tipos e configuracao do servidor.

## Perguntas em Aberto

- A IA externa entra ja na primeira entrega ou apenas depois do fluxo local estar validado?
- Qual provedor deve transcrever voz e qual limite de duracao/uso sera adotado?
- A assistente fica disponivel para todos os planos ativos ou apenas para um plano especifico?
- O historico da conversa deve ser mantido entre sessoes em uma fase futura?
- Importacao de CSV, Excel e OFX entra na proxima fase ou continua fora do fluxo conversacional?

## Criterios de Aceite

- Uma pessoa autenticada com plano ativo abre a assistente em qualquer tela interna.
- No desktop, a assistente funciona como painel ou modal compacto; no mobile, como experiencia de tela inteira.
- Texto, voz e anexos suportados geram um rascunho de receita ou despesa quando houver dados suficientes.
- Dados faltantes geram perguntas objetivas e nao um lancamento incompleto.
- Toda gravacao exige revisao e confirmacao explicita.
- O salvamento respeita o perfil ativo, categorias e regras atuais de receitas/despesas.
- Um possivel duplicado e sinalizado antes da confirmacao.
- Usuarios sem plano ativo nao conseguem usar a rota da assistente.
- O sistema continua funcional quando OCR, transcricao ou IA estiverem indisponiveis.

## Instrucoes Para /implementar

- Ler este plano e a task de origem antes de alterar codigo.
- Verificar o estado do git e alteracoes recentes antes de tocar em arquivos compartilhados, pois ha outro agente trabalhando no projeto.
- Comecar pelo fluxo texto -> rascunho -> revisao -> confirmacao; tratar voz e IA como extensoes do mesmo contrato.
- Reutilizar `ocrService`, `pixReader`, `extratoParser`, `categoryAI` e os servicos de gravacao existentes sempre que possivel.
- Nao criar migrations, nao alterar `.env` e nao ativar cobranca de provedores sem nova autorizacao explicita.
- Nao fazer commit, push, PR ou deploy durante `/implementar`.
