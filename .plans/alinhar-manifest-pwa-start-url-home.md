# Plano de Implementação: Alinhar manifest PWA (start_url/id) com a página que solicita instalação

## Origem

- Arquivo de especificação: conversa com o usuário (relato de que o app não aparece para baixar/instalar ao acessar o site pelo celular)
- Data do planejamento: 2026-08-20
- Classificação: `frontend-only`

## Resumo

O `manifest.json` tem `id`/`start_url` fixados em `/assistant.html`, mas o prompt de instalação (`InstallPwaBanner`) é exibido na página pública raiz (`index.html` → `fin-gerence.com.br/`), onde o usuário entra primeiro ao acessar o site. Essa incompatibilidade entre a página que solicita a instalação e o `start_url` declarado no manifest é a causa mais provável do Chrome/Android não disparar `beforeinstallprompt` de forma confiável na home — o usuário relatou nunca ver a opção de instalar, mesmo em visitas normais via Chrome Android.

A correção realinha o manifest para ter `/` como `start_url`/`id` (compatível com a página onde o prompt é solicitado), mantendo `scope: "/"` (que já cobre todas as páginas do site). Para preservar a experiência atual de "instalar = abrir o assistente financeiro", a home pública passa a redirecionar automaticamente para `/assistant.html` quando aberta em modo standalone (ou seja, quando o usuário abre o ícone do app já instalado).

## Escopo

### Dentro do escopo

- Alterar `id` e `start_url` do `manifest.json` de `/assistant.html` para `/?source=pwa`
- Em `src/main.tsx`, antes de montar o React: checar se a página está rodando em modo standalone (`window.matchMedia('(display-mode: standalone)').matches` ou `(navigator as any).standalone` no iOS) e se o path atual é `/` — se sim, redirecionar via `window.location.replace('/assistant.html?source=pwa')` antes da renderização
- Validar que `scope: "/"` continua cobrindo `app.html`, `assistant.html` e `index.html` sem regressão
- Testar visualmente em mobile (Chrome Android) após deploy: acessar a home direto deve mostrar o prompt de instalação sem precisar navegar; instalar e abrir o ícone deve abrir direto no assistente

### Fora do escopo

- Mudar texto/design do `InstallPwaBanner`
- Mudar onde o banner é montado (continua em `PublicSite()`, renderizado a partir de `index.html`)
- Lógica de update do service worker (`usePwaUpdate.ts`) — já funciona corretamente, não é a causa do problema relatado
- Mudanças em `app.html` ou no painel financeiro em si
- Configuração de Redirect/Rewrite Rules do Render (foi auditada durante o diagnóstico e não apresentou regra catch-all `/*` que pudesse ser a causa)
- Mudança de estratégia de cache do service worker (`sw.ts`)

## Leitura de contexto

- `c:\Users\rodri\Music\Particular\CLAUDE.md` (raiz) — regras de workflow (sequência /planejar → aprovação → /implementar → /finalizar)
- `c:\Users\rodri\Music\Particular\AGENT.md` (raiz) — não aplicável a este projeto (boilerplate genérico, ignorado)
- `sistema financas/CLAUDE.md` — regras específicas do projeto, consistente com a raiz
- `frontend/AGENT.md` e `backend/AGENT.md` dedicados **não existem** neste projeto
- `sistema financas/public/manifest.json` — arquivo alterado
- `sistema financas/src/main.tsx` — arquivo alterado (redirect standalone)
- `sistema financas/index.html`, `app.html`, `assistant.html` — lidos para confirmar entry points e uso do manifest
- `sistema financas/src/App.tsx` — lido para confirmar onde `InstallPwaBanner` é montado (`PublicSite()`, ativo quando a rota não é `app.html`)
- `sistema financas/src/components/InstallPwaBanner.tsx` — lido, lógica de exibição já correta (checa `isStandalone`, `beforeinstallprompt`, mobile-only)
- `sistema financas/src/pwa/usePwaUpdate.ts` e `UpdatePwaBanner.tsx` — lidos, mecanismo de atualização de SW já funcional, não relacionado à causa raiz
- `sistema financas/src/sw.ts` — lido, precache via Workbox `injectManifest`, sem regra que intercepte `/manifest.json` incorretamente
- `sistema financas/vite.config.ts` — lido, confirma `injectManifest.globPatterns` inclui `manifest.json`
- `sistema financas/public/robots.txt` — lido, confirma `/` é a página pública canônica (SEO `index, follow`) e `/app.html` é `Disallow` (área logada)
- Diagnóstico interativo com o usuário: confirmado que o Render Redirect/Rewrite Rules não tem regra catch-all `/*`; confirmado que limpar dados do site no celular fez a faixa de cookies reaparecer (cache antigo existia), mas o prompt de instalação ainda não é o foco central testado após a limpeza — a causa raiz mais provável identificada é a incompatibilidade start_url/página de solicitação

## Impacto por área

### Frontend

Arquivo: `sistema financas/public/manifest.json`:

- `id`: `/assistant.html` → `/?source=pwa`
- `start_url`: `/assistant.html?source=pwa` → `/?source=pwa`
- Demais campos (`scope`, `icons`, `shortcuts`, `display`, cores) permanecem inalterados

Arquivo: `sistema financas/src/main.tsx`:

- Adicionar checagem de modo standalone antes da renderização do React: se `display-mode: standalone` (ou `navigator.standalone` no iOS) e `window.location.pathname === '/'`, redirecionar para `/assistant.html?source=pwa` via `window.location.replace`
- Sem impacto em navegação normal (browser tab), já que a checagem só age em modo standalone

Sem impacto em hooks, query keys, services ou schema.

### Backend

`Sem impacto esperado`

### Banco de dados

`Sem impacto esperado`

### Infra/Deploy

- Nenhuma mudança de configuração do Render necessária neste plano
- Após deploy, usuários que já tentaram instalar antes (mesmo sem sucesso) devem limpar dados do site no navegador para que o Chrome reavalie o novo manifest, já que ele pode ter cacheado uma tentativa anterior com o manifest antigo

## Arquivos provavelmente afetados

- `sistema financas/public/manifest.json`
- `sistema financas/src/main.tsx`

## Estratégia de implementação

1. Atualizar `manifest.json`: `id` e `start_url` para `/?source=pwa`
2. Em `main.tsx`, antes do `ReactDOM.createRoot(...).render(...)` (ou equivalente), adicionar a checagem de standalone + path `/` com redirect para `/assistant.html?source=pwa`
3. Rodar `npx tsc --noEmit` e `npx vite build` para validar
4. Informar ao usuário que, após o deploy em produção, ele deve limpar os dados do site no celular (Chrome → Configurações do site → Excluir dados) antes de testar novamente, para descartar qualquer manifest/SW cacheado da tentativa anterior
5. Validar manualmente no celular: acessar `fin-gerence.com.br/` do zero, confirmar que o prompt de instalação aparece; instalar e confirmar que o ícone abre direto no assistente

## Regras de negócio identificadas

- O prompt de instalação deve aparecer ao acessar o site pela primeira vez, na home, sem exigir navegação para uma aba específica
- Instalar o PWA deve abrir o assistente financeiro diretamente, não a home pública nem o painel completo

## Regras multi-tenant e segurança

Não aplicável — mudança é puramente de configuração PWA/client-side, sem alteração de dados, autenticação ou payload enviado ao backend.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário. (Não aplicável a este plano, que não envolve banco de dados.)

## Validações necessárias

- Confirmar que `manifest.json` continua sendo um JSON válido após a edição
- Confirmar que o redirect em `main.tsx` não entra em loop (só redireciona quando path é exatamente `/` e está em modo standalone; `/assistant.html` não corresponde a essa condição, então não há redirect circular)
- Confirmar que a navegação normal (fora do modo standalone) na home continua funcionando sem redirecionamento indevido

## Testes necessários

### Frontend

- Teste manual: build local, confirmar `dist/manifest.json` reflete os novos valores
- Teste manual pós-deploy no celular (Chrome Android): limpar dados do site, acessar a home, confirmar aparição do prompt de instalação
- Teste manual pós-deploy: instalar o PWA, confirmar que o ícone abre diretamente no assistente (`/assistant.html`), não na home
- Teste manual: acessar a home normalmente pelo navegador (não instalado) e confirmar que não há redirecionamento indevido para o assistente

### Backend

`Sem impacto esperado`

### E2E

Não há suíte E2E para este fluxo — validação manual em dispositivo real é obrigatória, já que `beforeinstallprompt` não é simulável de forma confiável em ambiente de desenvolvimento local.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

(Executados a partir de `sistema financas/`, já que não há scripts `lint`/`typecheck` dedicados no `package.json`.)

## Riscos e pontos de atenção

- Médio-baixo: mudar `start_url`/`id` do manifest é uma mudança de "identidade" do PWA. Como o problema relatado é que ninguém conseguiu instalar ainda, não há instalações existentes que precisem migrar — risco prático é baixo
- O comportamento de `beforeinstallprompt` não é 100% determinístico nem documentado exaustivamente pelo Google — mesmo com o manifest corrigido, pode haver atraso de alguns segundos ou exigir interação mínima com a página antes do Chrome disparar o evento
- Testes locais (dev server) não conseguem validar `beforeinstallprompt` real nem modo standalone de forma confiável — validação final depende de deploy em produção e teste em dispositivo físico
- Usuários que testaram antes desta correção precisam limpar dados do site no navegador para descartar cache de manifest/SW da tentativa anterior

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- `manifest.json` tem `id` e `start_url` apontando para `/?source=pwa`
- Acessar a home (`/`) em modo standalone redireciona automaticamente para `/assistant.html?source=pwa`
- Acessar a home normalmente (browser tab, não instalado) não sofre nenhum redirecionamento
- Build (`tsc --noEmit`, `vite build`) passa sem novos erros
- Validação manual em dispositivo Android confirma o prompt de instalação aparecendo na home e o app instalado abrindo no assistente

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Este projeto não separa `frontend/AGENT.md`/`backend/AGENT.md` — seguir apenas `sistema financas/CLAUDE.md` e o `CLAUDE.md` da raiz
- Manter alterações pequenas e focadas em `manifest.json` e `main.tsx`
- Ramo atual do projeto: `feat/R/relatorio-pdf-duas-tabelas` — consolidar esta mudança nessa branch ativa em vez de criar uma nova, a menos que o usuário peça branch separada
- Ao final, lembrar o usuário explicitamente que ele precisa limpar os dados do site no celular antes de testar novamente em produção, e que a validação final só é possível após deploy real (não é testável localmente)
