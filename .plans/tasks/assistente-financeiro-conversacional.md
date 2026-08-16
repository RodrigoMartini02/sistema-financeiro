# Task: Assistente financeiro conversacional

## Contexto

O FinGerence ja possui fluxos de cadastro de receitas e despesas, anexos, sugestoes por historico, categorias, tipos de receita, perfis separados, recorrencias, parcelas, cartoes, reservas e relatorios. Tambem existem servicos iniciais no backend para OCR, leitura de QR Pix, parser de extrato e classificacao/sugestao de categoria.

Foi discutida a criacao de uma assistente financeira com experiencia inspirada no WhatsApp: conversa em balao, envio de texto, voz e anexos, interpretacao automatica e confirmacao antes de cadastrar receitas ou despesas. No desktop, a experiencia desejada e um widget/modal pequeno no canto da tela. No mobile, a assistente pode funcionar em tela cheia e ser um caminho principal de lancamento rapido.

## Problema

O cadastro manual de receitas e despesas exige preencher formularios com muitos criterios. Isso e seguro, mas pode ser lento para lancamentos simples, comprovantes, boletos, Pix, recibos, extratos ou rotinas de folha de pagamento. O usuario tambem pode perder informacoes importantes ao cadastrar manualmente a partir de documentos.

## Objetivo

Criar uma entrada conversacional para lancamentos financeiros que permita ao usuario informar receitas/despesas por texto, voz ou anexo, receba um rascunho estruturado com os campos necessarios e confirme antes de salvar no sistema.

## Escopo

### Dentro do escopo

- Criar assistente financeira interna no app, com layout inspirado em conversa estilo WhatsApp.
- Desktop: botao flutuante no canto da tela e modal compacto/lateral.
- Mobile: experiencia em tela cheia, priorizando uso por voz, texto e anexo.
- Permitir entrada por texto livre.
- Permitir entrada por voz via transcricao para texto.
- Permitir anexar comprovantes, boletos, imagens, PDFs, Pix copia e cola, extratos simples e documentos relacionados.
- Gerar rascunho de receita ou despesa com campos necessarios para cadastro.
- Exibir card de revisao antes de salvar.
- Permitir editar, salvar, descartar ou adicionar ao lote.
- Reaproveitar regras existentes de categorias, tipos de receita, perfil ativo, forma de pagamento, parcelas, recorrencia, cartao, data/vencimento e anexos.
- Usar confianca por campo quando possivel, destacando campos que precisam revisao.
- Detectar possiveis duplicidades antes de salvar.
- Garantir que nada seja salvo automaticamente sem confirmacao do usuario.

### Fora do escopo inicial

- Integracao real com WhatsApp Business/Cloud API.
- Pagamento de boletos ou Pix dentro do sistema.
- Open Finance, DDA ou integracao bancaria direta.
- Automacao total sem confirmacao humana.
- Folha de pagamento completa com calculos trabalhistas, impostos ou encargos.
- Treinamento de modelo proprio.
- Alteracoes em producao ou deploy sem confirmacao explicita.

## Impacto Previsto

### Frontend

- Nova experiencia de assistente conversacional no app.
- Inclusao de widget flutuante no desktop.
- Inclusao de tela cheia no mobile.
- Composer com texto, microfone, anexo e envio.
- Historico visual da conversa durante a sessao.
- Cards de rascunho de receita/despesa com revisao e acoes.
- Possivel integracao com dialogs ou services existentes de receitas/despesas.

### Backend

- Novo endpoint/service para interpretar entradas do assistente.
- Reaproveitamento dos services existentes de OCR, Pix, extrato e categoria.
- Possivel integracao com modelo de IA para extracao estruturada.
- Validacao de payloads de entrada e saida.
- Criacao de rascunhos financeiros sem persistir automaticamente como lancamento final.

### Banco de Dados

- A identificar durante o planejamento.
- Pode ser desnecessario no MVP se a conversa for apenas estado de UI e o rascunho for salvo somente como receita/despesa confirmada.
- Pode ser necessario futuramente se houver historico de conversas, auditoria de rascunhos, fila de processamento ou metricas de confianca.
- Nunca executar migrations sem confirmacao explicita.

### Infra/Deploy

- Pode exigir configuracao de provedor de IA/transcricao, mas sem alterar `.env` sem confirmacao.
- Pode exigir limites de tamanho, timeout e custo por arquivo/audio.
- Pode exigir tratamento especial para processamento de imagem/PDF em ambiente Render.

## Seguranca e Dados

- A assistente lidara com dados financeiros sensiveis, documentos, comprovantes e possivelmente dados pessoais.
- Todo processamento deve exigir usuario autenticado e plano ativo quando aplicavel.
- O backend deve derivar usuario/perfil de fonte confiavel, nunca de payload livre.
- Anexos e transcricoes nao devem ser enviados a terceiros sem decisao explicita de arquitetura e cuidado com privacidade.
- Logs nao devem conter valores sensiveis completos, documentos, base64, tokens, chaves Pix, CPF/CNPJ ou conteudo integral de comprovantes.
- O usuario deve sempre confirmar antes de salvar qualquer receita/despesa.
- Erros nao devem vazar dados de outros usuarios.
- Avaliar LGPD, retencao de arquivos e minimizacao de dados no planejamento.
- Nunca alterar `.env`, secrets ou executar migrations sem confirmacao explicita.

## Arquivos Provavelmente Afetados

- `src/layout/AppShell.tsx`
- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/finance/ExpenseDialog.tsx`
- `src/screens/finance/IncomeDialog.tsx`
- `src/services/financeService.ts`
- `src/types/finance.ts`
- `src/ui/AttachmentSection.tsx`
- `backend/src/server.ts`
- `backend/src/routes/expenses.ts`
- `backend/src/routes/incomes.ts`
- `backend/src/services/ocrService.ts`
- `backend/src/services/pixReader.ts`
- `backend/src/services/extratoParser.ts`
- `backend/src/services/categoryAI.ts`

## Criterios de Aceite

- O usuario consegue abrir a assistente no desktop por um botao flutuante.
- No mobile, a assistente abre em tela cheia.
- O usuario consegue digitar uma frase simples e receber um rascunho de despesa ou receita.
- O usuario consegue gravar voz, ver a transcricao e receber um rascunho.
- O usuario consegue anexar ao menos imagem/PDF e receber um rascunho quando houver dados financeiros detectaveis.
- O rascunho mostra tipo, descricao, valor, data, perfil, categoria/tipo, forma de pagamento e status quando aplicavel.
- A assistente pergunta por campos obrigatorios ausentes antes de salvar.
- Nenhum lancamento e salvo sem confirmacao explicita.
- O lancamento confirmado aparece nos fluxos existentes de movimentacoes/dashboard.
- Possiveis duplicidades geram aviso nao bloqueante.
- Fluxo de erro e carregamento sao claros para texto, voz e arquivo.

## Perguntas Para o Planejamento

- O MVP deve usar IA externa desde a primeira versao ou comecar com regras locais + OCR/Pix/extrato?
- Qual provedor de transcricao de voz sera usado?
- O audio deve ser armazenado ou descartado apos transcricao?
- O historico da conversa precisa persistir ou pode existir apenas durante a sessao?
- Quais tipos de arquivo entram no MVP: imagem, PDF, TXT, CSV, XLSX?
- Boleto sera lido por OCR, linha digitavel digitada/copiada ou ambos?
- Folha de pagamento entra como rascunho em lote ou fica para fase posterior?
- A assistente deve ficar disponivel para todos os planos ou apenas Premium?
- Qual limite de tamanho/duracao para arquivos e audios?
- Como exibir custo/limite de uso se houver IA paga?

## Instrucoes Para /planejar

- Usar esta task como especificacao de entrada.
- Ler `AGENT.md` e `CLAUDE.md`.
- Inspecionar arquivos citados antes de propor alteracoes.
- Mapear os campos reais de `ExpenseFormValues`, `IncomeFormValues`, `despesas` e `receitas`.
- Avaliar se o MVP exige mudanca de banco ou pode funcionar sem migrations.
- Planejar desktop e mobile como experiencias diferentes: widget compacto no desktop e tela cheia no mobile.
- Planejar voz como entrada que vira texto e reaproveita o mesmo pipeline do chat.
- Planejar confirmacao obrigatoria antes de persistir qualquer lancamento.
- Gerar plano em `.plans/`.
- Nao implementar codigo durante o planejamento.
- Nao assumir staging ou PR.
