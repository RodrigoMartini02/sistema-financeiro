# Plano de Implementação: Corrigir callback do Google OAuth preso na Home

## Origem

- Arquivo de especificação: relato direto do usuário ("autenticação funcionou, mas ela volta pra home e só entra se clicar em algum botão de entrar")
- Data do planejamento: 2026-07-12
- Classificação: `frontend-only`

## Resumo

Depois de corrigir o `VITE_GOOGLE_CLIENT_ID` (env var de build ausente no Static Site do Render) e confirmar que as Authorized redirect URIs do Google Cloud Console já estavam corretas, o login com Google passou a autenticar de verdade — mas o usuário precisa clicar manualmente em "Entrar" depois do redirect do Google para o login realmente completar.

Causa raiz: o Google redireciona para `https://fin-gerence.com.br/index.html?code=...&state=google-oauth`. A rota `/index.html` (e `/` e o catch-all `*`) em `src/App.tsx` sempre renderiza `<HomePage />` com o `LoginModal` fechado por padrão. A lógica que processa `code`/`state` da URL e chama `googleLogin(...)` só existe dentro de um `useEffect` em `LoginPage.tsx` (`src/screens/public/LoginPage.tsx:65-88`), componente que só é montado quando o `LoginModal` abre. Como o modal não abre sozinho no retorno do Google, o `code`/`state` ficam parados na URL sem processamento até o usuário clicar em "Entrar" e montar a `LoginPage` manualmente — só aí o `useEffect` roda e completa o login.

`HomePage.tsx` já tem um mecanismo pronto para abrir o modal automaticamente: `const [loginOpen, setLoginOpen] = useState(!!notice)` (linha 77), onde `notice` é uma prop opcional. Esse mesmo padrão será estendido para também detectar o retorno do Google.

## Escopo

### Dentro do escopo

- Alterar a inicialização de `loginOpen` em `src/screens/public/HomePage.tsx` para também ser `true` quando a URL contiver `state=google-oauth`, abrindo o `LoginModal` automaticamente nesse caso.

### Fora do escopo

- Qualquer alteração em `LoginPage.tsx` ou no `useEffect` que processa `code`/`state` — essa lógica já está correta e será reaproveitada sem modificação.
- Qualquer alteração em `authService.ts`, backend `/api/auth/google`, ou configuração do Google Cloud Console — já confirmados corretos nesta sessão.
- Qualquer alteração em outras rotas públicas (`/funcionalidades`, `/sobre`, `/planos`, `/contato`) — o Google só redireciona para `/index.html`.

## Leitura de contexto

- `AGENT.md` / `frontend/AGENT.md` / `backend/AGENT.md`: não existem no repositório atual (não encontrados)
- `src/App.tsx` — confirma que `/`, `/index.html` e `*` renderizam `<HomePage />` sem passar `notice`
- `src/screens/public/HomePage.tsx` — confirma o padrão existente `useState(!!notice)` para auto-abrir o modal
- `src/screens/public/components/LoginModal.tsx` — confirma que `<LoginPage />` só monta quando `isOpen=true`
- `src/screens/public/LoginPage.tsx` (linhas 64-88) — confirma o `useEffect` que processa `code`/`state` da URL e chama `googleLogin`
- `src/services/authService.ts` — confirma `getGoogleRedirectUri()` retorna `${window.location.origin}/index.html`, consistente com a URI cadastrada no Google Cloud Console

## Impacto por área

### Frontend

- `HomePage.tsx`: inicialização de `loginOpen` passa a considerar também `new URLSearchParams(window.location.search).get('state') === 'google-oauth'`, além da condição `!!notice` já existente.
- Sem novos componentes, hooks, query keys ou estados de loading/error adicionais — reaproveita o fluxo de login já existente por completo.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado — não depende de nenhuma env var ou configuração adicional além das já corrigidas nesta sessão (`VITE_GOOGLE_CLIENT_ID`, redirect URIs do Google Cloud Console).

## Arquivos provavelmente afetados

- `src/screens/public/HomePage.tsx`

## Estratégia de implementação

1. Em `HomePage.tsx`, mudar `useState(!!notice)` para uma inicialização lazy que também verifica `state=google-oauth` na URL.
2. Rodar `npx vite build` para validar.
3. Testar localmente ou orientar teste manual em produção: clicar em "Continuar com Google", completar o consentimento, confirmar que a sessão abre direto em `/app.html` sem precisar de um segundo clique.

## Regras de negócio identificadas

Nenhuma nova — comportamento esperado já documentado pelo usuário (login com Google deve completar automaticamente após o redirect, sem clique adicional).

## Regras multi-tenant e segurança

Não aplicável — mudança de UI pura, sem tocar em autenticação, tokens ou dados de usuário. O processamento do `code` continua exclusivamente dentro da `LoginPage`, já validado nesta sessão.

## Validações necessárias

- Confirmar que `loginOpen` inicia `true` quando `state=google-oauth` está presente na URL, e `false` no caso normal (sem `notice` nem callback do Google).

## Testes necessários

### Frontend

- Teste manual: acessar `/index.html?code=teste&state=google-oauth` localmente e confirmar que o `LoginModal` abre sozinho (mesmo que a chamada ao backend falhe com um código fake, o modal deve abrir).

### Backend

Não aplicável.

### E2E

- Fluxo completo manual em produção: clicar em "Continuar com Google" → autenticar → confirmar redirecionamento direto para `/app.html` sem clique adicional.

## Comandos de validação sugeridos

```bash
npx vite build
```

## Riscos e pontos de atenção

- Risco baixo — mudança de uma linha, reaproveita padrão já existente e testado (`notice`).
- Se o usuário chegar em `/index.html` com `state=google-oauth` mas sem `code` válido (ex.: usuário cancelou o consentimento do Google), o modal abre e a `LoginPage` já trata esse caso exibindo erro (comportamento já existente, não alterado por este plano).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Login com Google completa automaticamente após o redirect, sem exigir clique manual em "Entrar".
- `npx vite build` passa sem erros.
- Nenhum outro fluxo de login (usuário/senha, recuperação de senha) é afetado.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Alteração mínima e focada — não expandir escopo para outras partes do fluxo de autenticação.
- Isolar o commit de qualquer alteração pendente não relacionada já presente no working tree.
