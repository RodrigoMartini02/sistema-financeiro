# Plano de Implementação: Reverter manifest PWA para abrir direto no assistente

## Origem

- Arquivo de especificação: conversa com o usuário (o app instala agora, mas abre a home pública em vez do assistente financeiro)
- Data do planejamento: 2026-08-20
- Classificação: `frontend-only`

## Resumo

A mudança anterior (`.plans/alinhar-manifest-pwa-start-url-home.md`) alterou `manifest.json` para `start_url: "/?source=pwa"` e adicionou um redirect client-side em `main.tsx` para tentar corrigir o prompt de instalação não aparecendo na home pública. Essa mudança funcionou — o app agora instala — mas trouxe um efeito colateral não desejado: o app instalado abre a home pública (`index.html`) em vez do assistente financeiro diretamente, e o redirect client-side não disparou como esperado.

Como o requisito real é que o app instalado **seja** o assistente financeiro (não a home com um redirect por cima), este plano reverte `manifest.json` para `start_url`/`id` = `/assistant.html` (configuração original, antes do plano anterior) e remove o redirect artificial de `main.tsx`. A causa original do prompt de instalação não aparecer na home provavelmente era cache antigo do service worker no celular — confirmado durante o diagnóstico anterior que limpar os dados do site resolveu o aparecimento do prompt, então a mudança de `start_url` pode não ter sido a correção real necessária.

## Escopo

### Dentro do escopo

- Reverter `id` e `start_url` do `manifest.json`:
  - `id`: `/?source=pwa` → `/assistant.html`
  - `start_url`: `/?source=pwa` → `/assistant.html?source=pwa`
- Remover completamente a lógica de redirect adicionada em `main.tsx` (função `isStandaloneDisplayMode`, condicional `if (window.location.pathname === '/' && isStandaloneDisplayMode())`), restaurando o arquivo ao comportamento original (render direto do React sem checagem de standalone)
- Rodar `tsc --noEmit` e `vite build` para validar
- Informar claramente ao usuário que, após o deploy, é necessário desinstalar o app atualmente instalado (se houver) e limpar os dados do site no celular antes de testar novamente, já que o `id` do manifest está mudando de identidade pela segunda vez

### Fora do escopo

- Mudanças no `InstallPwaBanner.tsx` (continua funcionando como está — já checa `isStandalone`, `beforeinstallprompt`, mobile-only)
- Mudanças no `ExpenseDialog.tsx` (checkbox "Pago") — fica para um plano separado, já em andamento
- Qualquer nova tentativa de redirect client-side entre páginas do PWA
- Mudanças em `assistant.html`, `app.html` ou `sw.ts`
- Configuração de Redirect/Rewrite Rules do Render (já auditada anteriormente, sem regra catch-all relevante)

## Leitura de contexto

- `c:\Users\rodri\Music\Particular\CLAUDE.md` (raiz) — regras de workflow
- `sistema financas/CLAUDE.md` — regras específicas do projeto
- `frontend/AGENT.md` e `backend/AGENT.md` dedicados **não existem** neste projeto
- `sistema financas/public/manifest.json` — arquivo revertido
- `sistema financas/src/main.tsx` — arquivo revertido
- `.plans/alinhar-manifest-pwa-start-url-home.md` — plano anterior sendo parcialmente revertido; motivo documentado nesta seção de Resumo
- Diagnóstico anterior com o usuário: confirmado que instalar funcionou após a mudança de `start_url`, mas o app abre a home em vez do assistente — o usuário confirmou explicitamente que quer o app = assistente financeiro, não a home com redirect

## Impacto por área

### Frontend

Arquivo: `sistema financas/public/manifest.json`:
- `id` e `start_url` revertidos para apontar a `/assistant.html`

Arquivo: `sistema financas/src/main.tsx`:
- Remoção da função `isStandaloneDisplayMode` e da condicional de redirect, restaurando o render direto do React

Sem impacto em hooks, query keys, services ou schema.

### Backend

`Sem impacto esperado`

### Banco de dados

`Sem impacto esperado`

### Infra/Deploy

- Nenhuma mudança de configuração do Render necessária
- Usuário precisa desinstalar o app já instalado e limpar dados do site após o deploy, antes de testar novamente

## Arquivos provavelmente afetados

- `sistema financas/public/manifest.json`
- `sistema financas/src/main.tsx`

## Estratégia de implementação

1. Reverter `manifest.json`: `id` → `/assistant.html`, `start_url` → `/assistant.html?source=pwa`
2. Reverter `main.tsx`: remover a função `isStandaloneDisplayMode` e a condicional de redirect, restaurando o `createRoot(...).render(...)` direto, sem branch condicional
3. Rodar `npx tsc --noEmit` e `npx vite build` para validar
4. Ao final, instruir o usuário: desinstalar o app atual, limpar dados do site (Chrome → Configurações do site → Excluir dados), testar de novo — o prompt de instalação deve continuar aparecendo (já que o `scope: "/"` do manifest cobre a home), e o app instalado deve abrir direto no assistente

## Regras de negócio identificadas

- O app instalado deve abrir diretamente o assistente financeiro (`/assistant.html`), não a home pública
- O prompt de instalação deve continuar aparecendo ao acessar a home, sem exigir navegação

## Regras multi-tenant e segurança

Não aplicável — mudança é puramente de configuração PWA/client-side.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário. (Não aplicável a este plano.)

## Validações necessárias

- Confirmar que `manifest.json` continua sendo um JSON válido após a reversão
- Confirmar que `main.tsx` volta a montar o React normalmente em qualquer página (`/`, `/app.html`, `/assistant.html`)

## Testes necessários

### Frontend

- Build local, confirmar `dist/manifest.json` reflete os valores revertidos
- Teste manual pós-deploy: desinstalar app atual, limpar dados do site, acessar a home, confirmar que o prompt de instalação aparece
- Teste manual pós-deploy: instalar o PWA, confirmar que o ícone abre diretamente no assistente (`/assistant.html`)

### Backend

`Sem impacto esperado`

### E2E

Não há suíte E2E para este fluxo — validação manual em dispositivo real é obrigatória.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Baixo: reverte para uma configuração já testada anteriormente (antes do plano `alinhar-manifest-pwa-start-url-home`)
- Como o `id` do manifest muda de identidade pela segunda vez, qualquer instalação já existente no celular do usuário não vai migrar automaticamente — é necessário desinstalar e reinstalar
- Se o prompt de instalação voltar a não aparecer na home após esta reversão, a causa raiz real precisa ser investigada novamente (pode não ter sido resolvida, e sim mascarada pela limpeza de cache que o usuário fez)

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- `manifest.json` tem `id` e `start_url` apontando para `/assistant.html`
- `main.tsx` não contém mais lógica de redirect condicional
- Build (`tsc --noEmit`, `vite build`) passa sem novos erros
- Validação manual pós-deploy confirma: prompt de instalação aparece na home, app instalado abre no assistente

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Ramo atual do projeto: `feat/R/relatorio-pdf-duas-tabelas` — consolidar esta mudança nessa branch ativa
- Ao final, lembrar o usuário explicitamente: desinstalar o app atual e limpar dados do site no celular antes de testar novamente
- Após esta implementação, retomar o plano pendente do checkbox "Pago" em `ExpenseDialog.tsx`
