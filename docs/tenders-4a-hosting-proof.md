# Prova de hospedagem da etapa 4A

Esta prova decide se Licitações pode ser servido por um segundo Static Site mantendo o endereço público na mesma origem do login. O teste usa somente `/__tenders_probe` e seus descendentes. As aplicações e as regras de `/licitacoes/app/*`, `/loja/*`, `/catalogo/*` e páginas públicas continuam como estão.

O código preparado localmente não autoriza publicação nem alterações no painel. Antes dos passos na Render, concluir `/finalizar` e obter autorização específica para publicar a prova e adicionar/remover as regras temporárias. O usuário executa os passos no painel. Não há necessidade de alterar `.env`, credenciais, APIs ou `ALLOWED_ORIGINS`.

## Builds locais

| Comando | Artefato | Conteúdo |
|---|---|---|
| `npm run build` | `dist` | Build combinado compatível com a publicação atual |
| `npm run build:main` | `dist/main` | Site, Finanças, loja e PWA |
| `npm run build:tenders` | `dist/tenders/licitacoes/app` | App de Licitações, CSS, JavaScript e seus ícones |
| `npm run build:probe` | `dist/probe` | Prova estática isolada |

`build:main` e `build:tenders` verificam os módulos compilados para recusar imports do outro produto. O CSS usa somente o alvo e a interface compartilhada. Licitações não compila o service worker de Finanças nem copia páginas públicas ou seu manifesto.

Para validar os quatro artefatos, executar nessa ordem e depois `npm run test:build`. O build combinado limpa `dist`; portanto ele deve vir antes dos outros. Os testes abrem servidores locais temporários e conferem HTML, assets, MIME, query e rotas profundas. As prévias dos apps estão em `npm run preview:main` e `npm run preview:tenders`.

As APIs e as URLs de produção continuam as atuais. A decisão entre publicação separada e artefato montado depende da prova real abaixo.

## Artefato e prévia local

Na raiz do repositório:

```powershell
npm run build:probe
npm run preview:probe
```

Abrir o endereço local mostrado pelo comando de prévia, acrescentando `/__tenders_probe/?case=local&value=a%20b`. A prévia precisa servir `dist/probe` e devolver `/__tenders_probe/index.html` para rotas profundas dessa prova. A reprodução dessa reescrita local não comprova o comportamento da Render.

O script `scripts/build-hosting-probe.mjs` não usa dependências e escreve apenas:

```text
dist/probe/
  __tenders_probe/
    index.html
    probe.js
    probe.css
    assets/marker.svg
```

O HTML tem o marcador `tenders-hosting-probe-v1`. O JavaScript mostra origem, caminho, query e sua própria URL usando `textContent`; também confirma CSS e SVG. A base `/__tenders_probe/` mantém os links relativos dentro da prova mesmo ao abrir o caminho sem barra final. Não há chamadas de API, leitura de sessão, registro de service worker nem acesso a banco.

## Publicar somente a prova no Static Site existente

Recurso já existente: **`licitacoes`**, `https://licitacoes-rfxl.onrender.com`.

Antes de mudar qualquer campo, registrar os valores atuais de build, publicação, branch/revisão e regras. Na fotografia do planejamento, o site usa a raiz do repositório, publica `dist`, não tem rewrites e está com autodeploy desligado. Conferir o estado atual; não sobrescrever uma configuração diferente sem revisão.

Após a autorização, configurar temporariamente apenas esse site:

| Campo | Valor da prova |
|---|---|
| Root Directory | Raiz do repositório, sem subpasta |
| Build Command | `npm run build:probe` |
| Publish Directory | `dist/probe` |
| Auto-Deploy | Permanecer desligado |

Não publicar diretamente `dist/probe/__tenders_probe`, pois isso removeria o prefixo físico dos assets. Publicar a revisão previamente revisada e autorizada. Não mudar o build ou a pasta de publicação do site principal para esta prova.

No site **`licitacoes`**, acrescentar somente estas regras, com ação **Rewrite**:

| Source | Destination |
|---|---|
| `/__tenders_probe` | `/__tenders_probe/index.html` |
| `/__tenders_probe/*` | `/__tenders_probe/index.html` |

Essas regras oferecem fallback para a rota profunda. Os arquivos existentes, como `probe.js`, `probe.css` e `assets/marker.svg`, devem ser servidos diretamente, com seus próprios tipos de conteúdo. A sintaxe de wildcard, o destino externo e a precedência dos arquivos estão descritos na [documentação de redirects e rewrites da Render](https://render.com/docs/redirects-rewrites).

Conferir primeiro o site direto:

```text
https://licitacoes-rfxl.onrender.com/__tenders_probe?case=exact&value=a%20b
https://licitacoes-rfxl.onrender.com/__tenders_probe/?case=slash&value=a%20b
https://licitacoes-rfxl.onrender.com/__tenders_probe/deep/route?case=deep&value=a%20b
```

Nessa fase, a origem exibida será `https://licitacoes-rfxl.onrender.com`; a indicação de origem principal deve ser “Não”. O HTML, CSS, JavaScript e SVG precisam carregar antes de acrescentar a regra externa.

## Testar o rewrite pelo domínio principal

Com a autorização específica para o site principal, acrescentar apenas estas duas regras experimentais, antes de qualquer fallback geral que as interceptaria. Manter todas as regras já usadas pelas aplicações. A ação é **Rewrite**, não Redirect:

| Source | Destination |
|---|---|
| `/__tenders_probe` | `https://licitacoes-rfxl.onrender.com/__tenders_probe/index.html` |
| `/__tenders_probe/*` | `https://licitacoes-rfxl.onrender.com/__tenders_probe/*` |

A segunda regra preserva o trecho capturado pelo wildcard, incluindo o caminho dos assets; o fallback de rota profunda fica no site de destino.

Abrir em janela privativa para evitar o cache de um service worker financeiro já instalado. Não é necessário desregistrar o PWA existente. Verificar:

```text
https://fin-gerence.com.br/__tenders_probe?case=exact&value=a%20b
https://fin-gerence.com.br/__tenders_probe/?case=slash&value=a%20b
https://fin-gerence.com.br/__tenders_probe/deep/route?case=deep&value=a%20b
```

Critérios da prova:

1. A barra de endereço e “Origem da página” permanecem em `https://fin-gerence.com.br`. Não há resposta de redirecionamento ao domínio `.onrender.com`.
2. “Caminho da página” preserva a rota solicitada, inclusive a profunda. “Query recebida” preserva os parâmetros e sua codificação.
3. “URL do JavaScript” aponta para `https://fin-gerence.com.br/__tenders_probe/probe.js`; CSS e SVG aparecem carregados.
4. Os links relativos permanecem em `/__tenders_probe/`. Abrir a rota profunda diretamente e atualizar a página continua funcionando.
5. Os assets devolvem o corpo correto; um HTTP 200 com HTML no lugar de JavaScript ou CSS é falha.
6. O resultado se mantém em duas leituras seguidas, com cache frio/quente quando disponível. Registrar os cabeçalhos e qualquer intervalo de propagação observado.

Inspeção HTTP em PowerShell, sem autenticação:

```powershell
curl.exe -sS -D - -o NUL "https://fin-gerence.com.br/__tenders_probe?case=exact&value=a%20b"
curl.exe -sS -D - -o NUL "https://fin-gerence.com.br/__tenders_probe/deep/route?case=deep&value=a%20b"
curl.exe -sS -D - -o NUL "https://fin-gerence.com.br/__tenders_probe/probe.js"
curl.exe -sS -D - -o NUL "https://fin-gerence.com.br/__tenders_probe/probe.css"
curl.exe -sS -D - -o NUL "https://fin-gerence.com.br/__tenders_probe/assets/marker.svg"
```

Esperado: HTTP 200; HTML `text/html`; JavaScript `text/javascript` ou `application/javascript`; CSS `text/css`; SVG `image/svg+xml`. Conferir também o conteúdo, não somente os cabeçalhos. Registrar `Location` quando presente, `Cache-Control`, `Age`, `CF-Cache-Status`, `ETag` e `Last-Modified`. Uma query diferente não deve ser tratada como garantia de invalidar o cache da plataforma.

## Resultado e reversão

Registrar data, revisão publicada, regras adicionadas, URLs consultadas, origem/caminho/query observados, MIME dos assets, cabeçalhos de cache e o resultado da rota profunda. Não guardar cookies, tokens nem HTML de páginas autenticadas.

Se todos os critérios passarem, registrar **dois Static Sites** como caminho escolhido para a futura 4C. Se a plataforma não atender à prova, registrar **um Static Site com os builds montados juntos**, alternativa já aprovada no plano. Falha na prova não autoriza criar Worker, proxy pago, domínio novo nem alterar a autenticação.

Ao encerrar, remover dos dois sites **somente as regras de `/__tenders_probe` e `/__tenders_probe/*` adicionadas por esta prova**. Não remover regras preexistentes nem alterar `/licitacoes/app/*`. Manter o autodeploy de `licitacoes` desligado. Se for necessário restaurar seus campos temporários de build/publicação ou o deploy anterior, usar os valores registrados antes do teste e a autorização correspondente.

A 4A não troca o frontend real nem separa as APIs. A preparação da 4B e a publicação da 4C continuam dependendo de suas autorizações e da sequência do [plano da etapa 4](../.plans/separar-etapa-4-servico-proprio.md).
