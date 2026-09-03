# Plano: PWA mobile centrado no assistente e identidade visual

## Origem

- Task/arquivo de origem: `.plans/tasks/pwa-assistente-mobile-identidade-e-icone.md`
- Classificacao: `frontend-only` + `infra/deploy`

## Resumo

Transformar a instalacao PWA do FinGerence em uma experiencia mobile centrada no assistente financeiro. O aplicativo instalado abrira uma entrada propria e leve, sem carregar o painel financeiro completo ate que a pessoa o solicite. O acesso ao sistema completo continuara disponivel a partir da assistente.

Ao mesmo tempo, corrigir a identidade de instalacao: substituir o uso incorreto de `public/icons/logo.png` (1536x1024 declarado como 512x512) por icones quadrados reais para Android, iOS e navegadores, e usar `icons/perfilassistente.png` como avatar da assistente no lugar do simbolo de robo.

O PWA tera uma unica identidade instalavel: abrir o icone no celular levara a assistente em tela cheia. O painel web continuara abrindo normalmente em `app.html`.

## Escopo

### Dentro do escopo

- Criar uma entrada Vite `assistant.html` e um bootstrap React dedicado ao PWA da assistente.
- Reaproveitar autenticacao, sessao, verificacao de plano, tema, mes/perfil selecionado e providers ja usados no aplicativo principal, sem duplicar as regras.
- Adaptar `FinancialAssistant` para suportar os modos `floating` e `standalone`.
- No modo instalado, exibir a assistente em tela cheia e oferecer acao clara para abrir o painel financeiro completo.
- Carregar o painel, graficos e telas financeiras somente quando a pessoa acessar o sistema completo; a entrada da assistente nao pode importar estaticamente o dashboard.
- Manter texto, voz, anexos, conversas, consultas, rascunhos, descarte e confirmacao humana de lancamentos.
- Preparar variantes quadradas da identidade FinGerence para `192x192`, `512x512`, `maskable` e Apple Touch Icon, com dimensoes declaradas de acordo com os arquivos reais.
- Atualizar manifesto, metatags e favicon para `FINGERENCE Assistente`, `start_url` da nova entrada e cores atuais do produto.
- Substituir a remocao incondicional de service workers por registro controlado de um service worker gerado no build.
- Configurar cache somente para arquivos estaticos versionados da interface e assets publicos. Requisicoes de `/api`, autenticacao e dados financeiros ficarao sempre em rede.
- Copiar/versionar a imagem fornecida como asset do frontend e aplica-la no cabecalho da assistente com recorte circular, `object-fit: cover` e texto alternativo.

### Fora do escopo

- Alterar APIs, banco, migrations, regras de IA, voz, documentos ou lancamentos financeiros.
- Persistir rascunhos, conversas, sessao ou qualquer dado financeiro para uso offline.
- Criar fila de sincronizacao offline, notificacoes push ou publicacao em lojas.
- Alterar planos comerciais, provedor de IA ou configuracoes do `master`.
- Deploy sem nova confirmacao explicita do usuario.

## Leitura de Contexto

- `public/manifest.json` ainda identifica o produto como `IGen`, inicia em `app.html` e declara `public/icons/logo.png` como icone quadrado, embora a imagem seja 1536x1024. Esta divergencia causa a deformacao no lancador do aparelho.
- `src/main.tsx` desregistra todos os service workers existentes, portanto o manifesto nao resulta em uma experiencia PWA persistente.
- `vite.config.ts` ja possui multiplas entradas HTML (`app.html`, `index.html`, `demo.html`), permitindo adicionar a entrada da assistente sem converter a aplicacao em uma SPA nova.
- `src/App.tsx` importa telas financeiras de forma estatica; usar a mesma entrada para o PWA manteria o custo do painel completo no primeiro carregamento.
- `src/components/financial-assistant/FinancialAssistant.tsx` concentra a experiencia do chat e hoje apresenta o robo no cabecalho. O asset novo `icons/perfilassistente.png` e quadrado (1254x1254) e apropriado para o avatar.

## Impacto por Area

### Frontend

- Extrair ou reutilizar o bootstrap autenticado e os providers compartilhados pelo painel e pela nova entrada da assistente.
- Criar a tela mobile standalone sem montar `App.tsx` ou os dashboards na carga inicial.
- Preservar o componente flutuante no desktop e no aplicativo financeiro tradicional.
- Atualizar cabecalho, acoes de navegacao e acessibilidade da assistente.
- Incluir o avatar e os novos assets quadrados da marca.

### Backend

- Sem mudancas previstas. A nova entrada chamara as mesmas APIs autenticadas ja usadas pela assistente.

### Banco de Dados

- Sem mudancas previstas.

### Infra/Deploy

- Adicionar `vite-plugin-pwa` como dependencia de desenvolvimento, desde que a versao escolhida seja compativel com o Node e o Vite do repositorio.
- Configurar a geracao do manifesto e do service worker no build de producao, com atualizacao automatica dos assets.
- Remover o comportamento que desregistra o service worker a cada inicializacao.
- Confirmar que o Render continua entregando os arquivos estaticos gerados e que a aplicacao esta sob HTTPS, requisito para service workers fora de `localhost`.

## Arquivos Provavelmente Afetados

- `public/manifest.json`
- `public/icons/` (novas variantes de icone PWA e Apple Touch Icon)
- `icons/perfilassistente.png` ou um destino versionado equivalente dentro de `public/icons/`
- `app.html`
- novo `assistant.html`
- `index.html`
- `src/main.tsx`
- novo `src/assistantMain.tsx`
- `src/App.tsx`
- novo componente ou modulo compartilhado de bootstrap autenticado, se a extracao for necessaria
- novo shell/tela standalone da assistente
- `src/components/financial-assistant/FinancialAssistant.tsx`
- `vite.config.ts`
- `package.json`
- arquivo de lock correspondente

## Estrategia de Implementacao

1. Confirmar a versao de Node, Vite e o gerenciador de pacotes para escolher uma versao compativel de `vite-plugin-pwa`; instalar somente como dependencia de desenvolvimento.
2. Separar o bootstrap atualmente em `src/main.tsx` em uma composicao compartilhada de providers e protecoes autenticadas. O painel continua chamando `App`; a nova entrada chama apenas a tela standalone da assistente.
3. Adicionar `assistant.html` aos inputs do Vite e criar `src/assistantMain.tsx`. Sem sessao valida, a entrada deve redirecionar para a tela de login existente; com plano indisponivel, deve usar a mesma protecao do produto principal.
4. Evoluir `FinancialAssistant` para aceitar um modo de apresentacao. No modo standalone, remover o modal sobreposto, ocupar todo o viewport e trocar a acao de fechar por uma acao acessivel para abrir `app.html`.
5. Eliminar importacoes estaticas do dashboard na cadeia da entrada da assistente. A tela PWA deve receber somente os dados que o chat ja consulta pelas APIs; relatorios e graficos ficarao no caminho do painel completo.
6. Preparar os icones quadrados a partir da marca atual em fundos e margens adequados. Declarar arquivos distintos para `any` e `maskable`, acrescentar Apple Touch Icon e atualizar favicon/metatags. O avatar da assistente nao sera usado como icone do aplicativo.
7. Ajustar o manifesto com identidade `FINGERENCE Assistente`, `id`, `scope`, `start_url` para `assistant.html` e atalho opcional para o painel financeiro.
8. Configurar `vite-plugin-pwa` para gerar e registrar o service worker. O precache deve conter apenas shell, JS/CSS com hash, fontes e imagens estaticas. Nenhuma rota `/api/**`, resposta autenticada ou dado financeiro entrara em runtime cache.
9. Criar uma experiencia de indisponibilidade de rede honesta: a interface pode abrir com os assets cacheados, mas consultas, voz e confirmacoes devem informar que precisam de conexao, sem dados antigos apresentados como atuais.
10. Verificar em build de producao que os chunks da assistente nao incluem telas e bibliotecas exclusivas de dashboard; corrigir qualquer importacao compartilhada que force esse carregamento.

## Seguranca, Dados e Multi-Tenant

- A nova entrada usara a mesma sessao e verificacao de plano do aplicativo principal. Ela nao podera contornar autenticacao, permissao, perfil selecionado ou isolamento de dados.
- O service worker e capaz de interceptar requisicoes; por isso, o cache sera deliberadamente restrito a recursos estaticos. Nenhuma resposta que contenha receitas, despesas, documentos, conversas, token ou perfil sera gravada nele.
- Logout continuara removendo a sessao pelo fluxo atual. O cache residual contera somente codigo e imagens publicas, sem informacao do usuario.
- Nao havera modificacao de `.env`, segredo, configuracao de IA, banco ou migration.

## Validacoes Necessarias

- Build de producao do frontend concluido sem erros.
- Verificacao do manifesto no navegador: nome, cores, `id`, `start_url`, escopo, icones `192x192`, `512x512`, `maskable` e Apple Touch Icon correspondem a arquivos reais.
- Instalar ou simular a instalacao no Chrome Android, confirmar icone quadrado sem achatamento e abertura direta na assistente.
- Conferir a tela standalone em `360x800` e `390x844`, e o painel tradicional em desktop e mobile.
- Conferir avatar no cabecalho com rosto visivel, sem distorcao, e texto alternativo.
- Testar texto, microfone, anexo, conversa nova, restauracao, descarte de rascunho, consulta e confirmacao de receita/despesa em ambos os modos do componente.
- Testar sem sessao, com sessao expirada e com plano bloqueado, garantindo o mesmo comportamento do aplicativo principal.
- Inspecionar o service worker e o Cache Storage: somente assets estaticos podem aparecer; chamadas `/api` devem permanecer fora do cache.
- Comparar a saida do build e a cadeia de imports para confirmar que a entrada da assistente nao carrega dashboards e graficos antes do acesso ao painel.

## Testes Recomendados

- Teste manual de instalacao, atualizacao do service worker e reabertura do aplicativo instalado.
- Teste de rede desconectada: shell abre se ja instalado; operacoes financeiras exibem estado de conexao e nao simulam sucesso.
- Teste de regressao do painel em `app.html`, inclusive botao flutuante da assistente.
- Teste de navegacao da assistente para o painel e retorno ao chat em dispositivo mobile.

## Riscos e Pontos de Atencao

- Browsers podem manter icones e manifestos em cache por bastante tempo. Os novos nomes de arquivos e a atualizacao do service worker reduzem esse problema; aparelhos que ja instalaram a versao antiga poderao exigir atualizacao ou reinstalacao uma unica vez.
- `start_url` e uma orientacao ao navegador, nao uma garantia absoluta. A tela de entrada tambem devera validar o estado de autenticacao e responder bem a acessos diretos.
- Service workers controlam o ciclo de atualizacao de arquivos. A configuracao usara atualizacao automatica, mas sera testada para evitar uma interface antiga com JS novo.
- A assistente hoje e intitulada “Assistente financeira” e o novo retrato tem uma identidade masculina. O texto atual sera mantido nesta entrega; uma definicao de nome/persona pode ser feita separadamente.
- O cache offline de dados seria um recurso sensivel e exigiria criptografia, expiracao, conflitos e sincronizacao; fica deliberadamente fora desta entrega.

## Perguntas em Aberto

- Nenhuma bloqueante para iniciar. Adotaremos uma unica instalacao PWA centrada no assistente, avatar apenas no cabecalho e acesso ao painel por acao explicita no topo da tela standalone.

## Criterios de Aceite

- O icone instalado e nitido, quadrado e sem deformacao em Android e iOS.
- Abrir o PWA no celular leva diretamente a assistente em tela cheia, sem carregar o painel completo antes de necessario.
- O usuario autenticado consegue abrir o painel financeiro completo a partir da assistente e retornar ao fluxo habitual sem perder seguranca ou sessao.
- O avatar fornecido substitui o robo no cabecalho da assistente, com recorte e acessibilidade adequados.
- Todas as funcoes atuais do assistente continuam funcionando em modo flutuante e standalone.
- Dados financeiros, respostas de API, sessao e conversas nao sao cacheados pelo service worker.
- `app.html` e a experiencia web atual continuam funcionando sem regressao.
- O build do frontend e as validacoes de PWA passam antes de qualquer deploy.

## Instrucoes Para /implementar

- Implementar apenas este plano e preservar alteracoes de outros agentes no worktree.
- Antes de instalar dependencias, verificar versoes existentes e registrar a escolha compativel.
- Usar assets locais e incluir os novos icones finais no repositorio; nao reutilizar `logo.png` retangular como icone quadrado.
- Nao alterar backend, banco, migrations, `.env` ou configuracoes do Render.
- Nao fazer commit, push ou deploy durante `/implementar`; a publicacao ficara para `/finalizar` apos revisao e confirmacao explicita.
