# Plano de Implementação: Mensagens de login e recuperação, e logo nova nas prévias

## Origem

- Arquivo de especificação: nenhum `.md`. O pedido veio da conversa de 2026-10-01 e 02, a partir de três situações: o login da Aether que falhou, a logo antiga IGen no favorito do Chrome e o "Reenviar código" que volta de tela. As 5 decisões estão abaixo.
- Data do planejamento: `2026-10-02`
- Classificação: `fullstack` (front e servidor, sem banco)

## Resumo

1. **Login.** Quando a senha está errada, a tela mostra "Sessao expirada". Isso acontece porque o `apiRequest` trata qualquer 401 como sessão vencida, e o login errado responde 401. Além disso, as mensagens do servidor estão em inglês e não dizem se o problema é o documento ou a senha.
2. **Recuperação de senha.**
   - Com um e-mail não cadastrado, a tela avança para "digite o código" e nenhum código chega.
   - Se o envio do e-mail falha, o erro é engolido e a pessoa não fica sabendo.
   - O "Reenviar código" apenas volta para a tela do e-mail, sem reenviar nada.
3. **Logo.**
   - O Google, o WhatsApp e o favorito do Chrome mostram a logo antiga IGen. A imagem de compartilhamento continua no endereço `/icons/logo.png`, e quem guardou a cópia antiga por esse endereço não busca de novo.
   - Esse mesmo arquivo pesa 2,1 MB e é baixado no cabeçalho, no rodapé, no login e no menu.

## Decisões registradas

- **Decisão 1: mensagens explícitas em português.**
  - No login:
    - "CPF, CNPJ ou e-mail não cadastrado";
    - "Senha incorreta";
    - conta bloqueada;
    - excesso de tentativas;
    - as mensagens do login com Google.
  - Na recuperação:
    - "E-mail não cadastrado";
    - falha no envio do e-mail.
  - A recuperação ganha um limite de tentativas igual ao do login.
- **Decisão 2:** nenhuma espera entre reenvios. O único freio é o limite de tentativas da rota.
- **Decisão 3:** a imagem de compartilhamento é quadrada, só com o "F" recortado, sem o fundo vermelho. Formato PNG 512×512, com nome de arquivo novo.
- **Decisão 4:** a logo do site passa a ser uma versão leve da atual, com o brilho, em WebP de 192 px.
- **Decisão 5:** apagar `public/icons/logo.png` e `icons/logo.png`.

## Escopo

### Dentro do escopo

- **`apiRequest`:**
  - Ganha um modo "anônimo" para as sete chamadas públicas de autenticação: login, cadastro com CPF, cadastro com CNPJ, login com Google, pedir código, conferir código e redefinir senha.
  - Nesse modo, a chamada não envia o token, e um 401 mostra a mensagem do servidor em vez de encerrar a sessão.
  - "Sessão expirada" ganha o acento.
- **Login:**
  - documento ou e-mail inexistente e senha incorreta passam a ter mensagens separadas;
  - conta bloqueada e excesso de tentativas passam para português.
- **Login com Google:** "E-mail do Google não cadastrado no sistema" e "Conta desativada", em português.
- **`forgot-password`:**
  - E-mail não cadastrado responde 404 com "E-mail não cadastrado. Confira o e-mail usado no cadastro.".
  - Falha no envio responde 502 com "Não foi possível enviar o código agora. Tente de novo em instantes.".
  - Limite de 5 pedidos a cada 15 minutos por IP e e-mail, com bloqueio de 30 minutos.
- **`authRateLimiter`:**
  - recebe por parâmetro o campo usado na chave: `documento` no login, `email` na recuperação;
  - passa a responder em português.
- **Tela do código:**
  - "Reenviar código" pede um código novo para o mesmo e-mail, continua na tela e mostra "Código reenviado para {e-mail}".
  - Um link "Trocar e-mail" volta ao primeiro passo.
- **Imagens:**
  - Gerar `public/icons/fingerence-share.png` e `public/icons/fingerence-logo.webp` a partir da arte atual.
  - A imagem de compartilhamento vai para `index.html`, `PublicSeo.tsx` e `scripts/generate-public-route-html.mjs`.
  - A logo leve vai para `SiteHeader`, `SiteFooter`, `LoginModal` e `AppShell`.
  - Apagar os dois `logo.png`.

### Fora do escopo

- Mudar o que é aceito como login. Continua valendo CPF, CNPJ ou e-mail.
- A mensagem genérica "Validation error" das outras rotas.
- Favicon e ícones do app (PWA).
- Membro desativado conseguir entrar (achado registrado em "Perguntas em aberto").

## Leitura de contexto

- `/AGENT.md` e `/CLAUDE.md`.
- `/frontend/AGENT.md` e `/backend/AGENT.md` não existem; o `AGENT.md` da raiz cobre o repositório.
- **Front:**
  - `src/services/apiClient.ts`, `authService.ts` e `session.ts`, em `src/services/`;
  - `src/screens/public/LoginPage.tsx`;
  - `PublicSeo.tsx`, `SiteHeader.tsx`, `SiteFooter.tsx` e `LoginModal.tsx`, em `src/screens/public/components/`;
  - `src/layout/AppShell.tsx`.
- **Servidor:**
  - `backend/src/routes/auth.ts` (login, Google, forgot-password, verify-recovery-code, reset-password);
  - `backend/src/middleware/validation.ts` (`authRateLimiter`).
- **Outros:**
  - `index.html` e `scripts/generate-public-route-html.mjs`;
  - `public/icons/logo.png` (1536×1024, 2,1 MB) e a cópia sem uso em `icons/logo.png`.

## Impacto por área

### Frontend

- **`apiClient.ts`:**
  - Nova assinatura `apiRequest(endpoint, init, { anonymous: true })`.
  - No modo anônimo, o pedido sai sem o cabeçalho `Authorization` e um 401 não conta como sessão vencida.
  - Nos demais pedidos, o 401 continua levando a "Sessão expirada", agora com acento.
- **`authService.ts`:** passam a ser anônimas:
  - `login`;
  - `register`;
  - `registerCompany`;
  - `googleLogin`;
  - `forgotPassword`;
  - `verifyRecoveryCode`;
  - `resetPassword`.
  
  O `verifySession` continua autenticado.
- **`LoginPage.tsx`:**
  - Na tela do código, "Reenviar código" chama `forgotPassword(recoveryEmail)` e mostra "Código reenviado para {e-mail}" ou o erro.
  - "Trocar e-mail" faz o que o botão faz hoje: volta ao primeiro passo.
  - No primeiro passo, o erro do servidor aparece e a tela continua no mesmo passo.
- **Logo:** os quatro `<img>` passam a usar `/icons/fingerence-logo.webp`.

### Backend

- **`/auth/login`:**
  - não encontrado: 401 "CPF, CNPJ ou e-mail não cadastrado";
  - senha errada: 401 "Senha incorreta";
  - bloqueado: 403 "Conta bloqueada. Fale com o suporte.".
- **`authRateLimiter(campo)`:**
  - a chave passa a ser IP mais o campo informado;
  - as mensagens 429 passam para português.
- **`/auth/forgot-password`:**
  - passa pelo limitador;
  - e-mail não cadastrado: 404;
  - falha no envio: 502;
  - com sucesso, cada pedido continua gerando um código novo, que invalida o anterior e zera as tentativas.
- **`/auth/google`:** as mensagens de "não cadastrado" e "desativado" passam para português.

### Banco de dados

Sem impacto esperado.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- Nenhuma variável nova.
- Se o EmailJS não estiver configurado no Render, a recuperação passa a mostrar a falha de envio, em vez de fingir que mandou. Vale conferir as variáveis `EMAILJS_*` no Render.
- Depois do deploy, o usuário pede a reindexação no Google Search Console (Inspeção de URL → Solicitar indexação).

## Arquivos provavelmente afetados

- `backend/src/routes/auth.ts`
- `backend/src/middleware/validation.ts`
- `src/services/apiClient.ts`
- `src/services/authService.ts`
- `src/screens/public/LoginPage.tsx`
- `src/screens/public/components/PublicSeo.tsx`
- `src/screens/public/components/SiteHeader.tsx`
- `src/screens/public/components/SiteFooter.tsx`
- `src/screens/public/components/LoginModal.tsx`
- `src/layout/AppShell.tsx`
- `index.html`
- `scripts/generate-public-route-html.mjs`
- Novos: `public/icons/fingerence-share.png` e `public/icons/fingerence-logo.webp`
- Apagados: `public/icons/logo.png` e `icons/logo.png`

## Estratégia de implementação

**Fase 0 — Branch**

1. Atualizar a `main` e criar a branch `fix/R/login-recuperacao-e-logo`.

**Fase 1 — Remover**

2. Remover o tratamento de 401 como sessão vencida nas chamadas públicas de autenticação.
3. Remover a mensagem única "Invalid document or password" e as mensagens em inglês do login, do limitador e do Google.
4. Remover a resposta genérica do `forgot-password` e o tratamento que engole o erro de envio.
5. Remover o "Reenviar código" que só volta de tela.
6. Remover as referências a `/icons/logo.png` e apagar os dois arquivos.

**Fase 2 — Aplicar**

7. Implementar o modo anônimo no `apiRequest` e no `authService`.
8. Escrever as mensagens novas do login, do limitador e do Google.
9. Ligar o limitador ao `forgot-password` e incluir as respostas 404 e 502.
10. Fazer o reenvio de verdade e incluir o link "Trocar e-mail" na tela do código.
11. Gerar as duas imagens com o `sharp`, usando um script fora do projeto, e conferir o recorte do quadrado do "F" visualmente. Depois, trocar as referências no código.

**Fase 3 — Validar**

12. Rodar `npx tsc --noEmit`, `npm test`, `npm run build`, `npm --prefix backend run build` e `npm --prefix backend test`.
13. Roteiro da API com o backend local numa porta livre:
    - login com documento inexistente, senha errada, senha certa, conta bloqueada e a sexta tentativa;
    - recuperação com e-mail inexistente, e-mail cadastrado e o limite;
    - reenvio que gera um código novo, conferido no banco local.
    
    Sem EmailJS no `.env.dev`, o envio responde com a falha. Esse caminho também é conferido.
14. Teste de fumaça com jsdom:
    - senha errada mostra "Senha incorreta" e não "Sessão expirada";
    - e-mail inexistente fica no primeiro passo, com o aviso;
    - "Reenviar código" mostra "Código reenviado";
    - "Trocar e-mail" volta ao primeiro passo.
15. Imagens:
    - abrir as duas imagens geradas e conferir os tamanhos;
    - conferir o `og:image` novo no `dist/index.html` e nas páginas públicas geradas.
16. Apagar os dados de teste e encerrar o backend pela árvore de processos.

## Regras de negócio identificadas

- O login informa se o documento ou e-mail não existe e se a senha está errada.
- A recuperação informa quando o e-mail não está cadastrado e quando o envio falha.
- Cada pedido de código gera um código novo.
- Não há espera entre reenvios. Vale o limite de 5 pedidos a cada 15 minutos por IP e e-mail.

## Regras multi-tenant e segurança

- **Mensagens explícitas:** dizem se um documento ou e-mail tem conta. É uma escolha consciente, com limite de tentativas no login (já existia) e na recuperação.
- **Chamadas anônimas:** não levam token.
- **Rotas autenticadas:** um 401 continua encerrando a sessão.
- **Contas e permissões:** sem mudança.

## Validações necessárias

Login e recuperação mantêm as validações de hoje: documento e senha obrigatórios, e e-mail em formato válido.

## Testes necessários

### Frontend

- Teste de fumaça do passo 14.

### Backend

- Roteiro da API do passo 13.

### E2E

- Roteiro e teste de fumaça locais, com limpeza dos dados de teste no fim.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npm run build
npm --prefix backend run build
npm --prefix backend test
```

## Riscos e pontos de atenção

- **Exposição de contas:** as mensagens explícitas revelam quem tem conta. Só o limite de tentativas reduz o abuso.
- **Reenvio sem espera:** quem clicar muitas vezes chega ao limite e espera 30 minutos.
- **Prévias em cache:** Google e WhatsApp só atualizam a imagem quando buscam a página de novo, mesmo com o nome novo.
- **Recorte gerado por script:** precisa de conferência visual antes de entrar.
- **Modo anônimo:** vale só para as sete chamadas públicas listadas. As demais continuam autenticadas.
- **E-mail em produção:** se as variáveis `EMAILJS_*` faltarem no Render, a falha de envio passa a aparecer para o usuário, como esperado.

## Perguntas em aberto

- **Achado fora do escopo:** um membro desativado ainda consegue entrar com senha, porque o login só barra o status `bloqueado`. O login com Google já barra qualquer status diferente de `ativo`. Isso contradiz o aviso "O login dele será bloqueado" na tela de desativar membro. Fica para um plano separado.

## Critérios de aceite do plano

A implementação está pronta quando:

- **Login:**
  - senha errada mostra "Senha incorreta";
  - documento ou e-mail inexistente mostra "CPF, CNPJ ou e-mail não cadastrado";
  - nenhum dos dois mostra "Sessão expirada".
- **Recuperação:**
  - com e-mail inexistente, a tela fica no primeiro passo, com o aviso;
  - a falha de envio aparece como falha;
  - "Reenviar código" reenvia e continua na tela;
  - "Trocar e-mail" volta ao primeiro passo.
- **Limite:** o sexto pedido em 15 minutos recebe a mensagem em português.
- **Logo:**
  - nenhuma referência a `/icons/logo.png` sobra;
  - as duas imagens novas estão no lugar, cada uma com dezenas de KB;
  - o `og:image` aponta para `fingerence-share.png`.
- **Checks:** tsc, testes e builds passam.

## Observações para a skill implementar

- **Fonte de contexto:** usar este plano como fonte principal.
- **Ordem:** a Fase 1 remove e a Fase 2 aplica.
- **Imagens:** o script que gera as imagens fica fora do projeto. Só as imagens geradas entram no commit.
- **Backend local:** subir numa porta livre e encerrar pela árvore de processos.
- **Proibições:**
  - não fazer commit nem push;
  - não alterar o `.env`;
  - não executar migrations (este plano não tem nenhuma).
