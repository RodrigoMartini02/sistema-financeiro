# Task: PWA do assistente mobile e identidade visual

## Contexto

O FinGerence possui manifesto para instalacao mobile e inicia por `app.html`, que abre o sistema autenticado completo. Hoje nao ha service worker ativo, pois `src/main.tsx` remove os registros existentes. A direcao desejada e uma experiencia mobile centrada no assistente, com acesso posterior ao painel completo quando necessario.

O icone atual do PWA usa `public/icons/logo.png`, uma imagem de `1536x1024`, mas o manifesto a declara como `512x512` e `maskable`. Isso causa deformacao ou achatamento no icone instalado em aparelhos moveis.

Foi adicionada a imagem quadrada `icons/perfilassistente.png` (`1254x1254`) para dar identidade visual ao assistente financeiro no lugar do icone de robo exibido no cabecalho atual.

## Problema

- A instalacao mobile abre o aplicativo financeiro inteiro e carrega o bundle principal, em vez de priorizar o fluxo de assistente.
- O icone instalado em dispositivos moveis nao respeita o formato esperado de um app.
- O assistente ainda usa um simbolo generico de robo, sem uma identidade propria.

## Objetivo

Definir e implementar uma versao mobile instalada que inicie pelo assistente financeiro em tela cheia, carregue o painel completo somente quando solicitado e mantenha o acesso autenticado aos recursos financeiros. Corrigir os assets e metadados de icone do PWA e aplicar a nova identidade visual do assistente.

## Escopo

### Dentro do escopo

- Criar uma experiencia de entrada mobile centrada no assistente, com acesso claro ao painel financeiro completo.
- Reduzir o carregamento inicial da instalacao mobile por meio de separacao de entrada e/ou carregamento sob demanda avaliado no planejamento.
- Revisar manifesto, identidade de instalacao, icones `any` e `maskable`, favicon e metadados relacionados ao PWA.
- Gerar ou preparar icones quadrados corretos a partir da identidade aprovada do FinGerence, sem achatamento em Android e iOS.
- Substituir o `Bot` no cabecalho do assistente por `icons/perfilassistente.png`, com recorte circular adequado, alternativa textual e boa leitura em temas claro e escuro.
- Preservar todas as capacidades atuais do assistente: texto, voz, anexos, conversas, rascunhos e confirmacao humana antes de salvar.

### Fora do escopo inicial

- Publicacao em lojas de aplicativos.
- Alterar regras de negocio, endpoints financeiros ou banco de dados.
- Prometer funcionamento offline de consultas, voz ou lancamentos sem projetar fila e sincronizacao especificas.
- Alterar a escolha global de provedor de IA pelo master.

## Impacto Previsto

### Frontend

- Alteracoes em entradas/rotas da aplicacao, carregamento de modulos, shell mobile e componente `FinancialAssistant`.
- Novos assets de icone PWA ou derivados do logo atual.

### Backend

- Sem alteracao de API prevista inicialmente.

### Banco de Dados

- Sem alteracao de banco identificada inicialmente.

### Infra/Deploy

- Possivel configuracao de service worker, cache de assets e manifestos de instalacao; deve ser avaliada sem alterar secrets ou Render automaticamente.

## Seguranca e Dados

- A entrada centrada no assistente deve manter autenticacao e as mesmas protecoes de plano existentes em `App.tsx`.
- Nenhum dado financeiro deve ser armazenado offline sem estrategia explicita de seguranca, expiracao e sincronizacao.
- Nunca executar migrations sem confirmacao explicita.
- Nunca alterar `.env`.

## Arquivos Provavelmente Afetados

- `public/manifest.json`
- `app.html`
- `index.html`
- `src/main.tsx`
- `src/App.tsx`
- `src/components/financial-assistant/FinancialAssistant.tsx`
- `public/icons/logo.png`
- `icons/perfilassistente.png`
- `vite.config.ts`

## Critérios de Aceite

- A instalacao mobile exibe um icone nitido, quadrado e sem distorcao no lancador do aparelho.
- O PWA mobile abre diretamente em uma experiencia completa do assistente, com caminho visivel para o painel financeiro.
- O painel completo nao precisa ser carregado no primeiro acesso ao assistente quando nao for necessario.
- O cabecalho do assistente mostra a nova imagem de perfil no lugar do icone de robo, sem corte inadequado do rosto.
- Texto, voz, anexos, historico, rascunhos e confirmacao de lancamentos continuam funcionando.
- Desktop e acesso web tradicional continuam abrindo o painel completo sem regressao.
- Build do frontend passa e a experiencia e verificada em viewport mobile e desktop.

## Perguntas Para o Planejamento

- A instalacao do assistente deve ser uma segunda experiencia instalavel ou o unico PWA do FinGerence com comportamento responsivo por dispositivo?
- O acesso ao painel completo sera por botao na barra superior, navegacao inferior ou comando dentro da conversa?
- O service worker deve iniciar apenas com cache de assets da interface ou incluir suporte offline futuro para rascunhos locais?
- A nova imagem deve aparecer somente no cabecalho do assistente ou tambem no botao flutuante de abertura?

## Instruções Para /planejar

- Usar esta task como especificacao de entrada.
- Ler `AGENT.md` e `CLAUDE.md`.
- Inspecionar arquivos citados antes de propor alteracoes.
- Avaliar a arquitetura de entradas Vite, manifestos e identidade PWA antes de definir o fluxo mobile.
- Gerar plano em `.plans/`.
- Nao implementar codigo durante o planejamento.
- Nao assumir staging ou PR.
