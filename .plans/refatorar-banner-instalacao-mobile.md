# Plano de Implementação: Refatorar banner de instalação mobile

## Origem

- Arquivo de especificação: não há `.md` de feature — origem é pedido direto do usuário para refatorar o comportamento do `InstallPwaBanner`.
- Data do planejamento: 2026-08-19
- Classificação: `frontend-only`

## Resumo

Substituir o cooldown de 7 dias em `localStorage` por um dismiss de sessão em `sessionStorage`, e adicionar uma checagem geral de dispositivo móvel (ausente hoje) para impedir que o banner apareça em desktop Chrome/Edge — que hoje dispara o mesmo evento `beforeinstallprompt` usado para acionar o ramo Android do banner, fazendo com que o banner apareça incorretamente em desktop.

## Escopo

### Dentro do escopo

- Remover o cooldown de 7 dias (`DISMISS_KEY`, `DISMISS_DAYS`, `isDismissed()`, `dismiss()`) em `InstallPwaBanner.tsx`
- Adicionar dismiss por sessão via `sessionStorage` (fecha só até a aba ser fechada/recarregada, reaparece em nova visita)
- Adicionar função `isMobileDevice()` (regex de User-Agent cobrindo Android + iOS) e usá-la como guarda geral de visibilidade
- Manter intacta a checagem `isStandalone()` (não mostrar se o PWA já estiver instalado)
- Manter intacto o gate de consentimento de cookies (`cookiesResolved`)

### Fora do escopo

- `UpdatePwaBanner.tsx` (banner de atualização de versão — assunto não relacionado, confirmado na investigação)
- Qualquer alteração em `CookieBanner.tsx` (usado apenas como dependência, sem modificação)
- Testes automatizados (projeto não possui suíte frontend)
- Qualquer alteração de backend, banco de dados ou infra

## Leitura de contexto

- `sistema financas/AGENT.md` — lido. Nota já registrada em plano anterior desta sessão: as regras de multi-tenant/RLS descritas nesse arquivo não se aplicam a este projeto; seguidas apenas as regras gerais de código (nomes claros, early return, evitar `any`, não usar catch silencioso onde há efeito colateral relevante — mantendo o padrão existente de catch silencioso apenas para falhas de `localStorage`/`sessionStorage`, que já é o padrão do arquivo).
- `sistema financas/frontend/AGENT.md` — não existe como arquivo dedicado.
- `sistema financas/backend/AGENT.md` — não existe como arquivo dedicado.
- `src/components/InstallPwaBanner.tsx` — lido por completo (135 linhas).
- `src/App.tsx` — consultado via agente de investigação para confirmar ponto de montagem (dentro de `PublicSite()`, fora de `<Routes>`, montado uma vez por carregamento de página do site público).
- `src/components/CookieBanner.tsx` — não lido diretamente; seu contrato (`getConsent`, `CONSENT_RESOLVED_EVENT`) é consumido sem alteração.

## Impacto por área

### Frontend

Arquivo `src/components/InstallPwaBanner.tsx`:

- Remover: constantes `DISMISS_KEY`, `DISMISS_DAYS` (linhas 5-6) e funções `isDismissed()`, `dismiss()` (linhas 25-40)
- Adicionar: constante `SESSION_DISMISS_KEY` (ex.: `'pwa_install_dismissed_session'`) e funções `isDismissedThisSession()`/`dismissThisSession()` usando `sessionStorage`, seguindo o mesmo padrão try/catch já usado nas funções removidas
- Adicionar: função `isMobileDevice()` — regex de UA cobrindo `/Android/` para o ramo Android e reaproveitando o padrão iOS já usado em `isIosSafari()` (linhas 18-23) para o ramo iOS
- Atualizar guarda de visibilidade (linha 82: `if (installed || dismissed || !cookiesResolved) return null;`) para incluir `!isMobileDevice()`
- Atualizar `handleDismiss` (linhas 70-73) para chamar `dismissThisSession()` em vez de `dismiss()`
- Estado `dismissed` (linha 44) passa a ser inicializado com `isDismissedThisSession` em vez de `isDismissed`

Sem impacto em rotas, hooks compartilhados, ou outros componentes — alteração isolada a este arquivo.
Sem impacto em `UpdatePwaBanner.tsx`.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `sistema financas/src/components/InstallPwaBanner.tsx`

## Estratégia de implementação

1. Adicionar função `isMobileDevice()` (UA regex, Android + iOS) próxima às demais funções de detecção do arquivo.
2. Remover a lógica de cooldown de 7 dias (`DISMISS_KEY`, `DISMISS_DAYS`, `isDismissed`, `dismiss`).
3. Adicionar lógica de dismiss por sessão (`SESSION_DISMISS_KEY`, `isDismissedThisSession`, `dismissThisSession`), usando `sessionStorage` no mesmo padrão try/catch das funções removidas.
4. Atualizar `handleDismiss` para usar `dismissThisSession()`.
5. Atualizar a inicialização do estado `dismissed` para usar `isDismissedThisSession`.
6. Atualizar a guarda de visibilidade (linha 82) somando `!isMobileDevice()`.
7. Rodar `npx tsc --noEmit` no frontend para validar.
8. Reportar quais linhas foram alteradas e resultado do typecheck; recomendar teste manual em Android Chrome, iOS Safari, e desktop Chrome/Edge antes de considerar concluído.

## Regras de negócio identificadas

- Banner só aparece em dispositivo móvel real (Android ou iOS Safari), nunca em desktop — mesmo quando o evento `beforeinstallprompt` dispara em desktop.
- Banner não aparece se o PWA já estiver instalado (`isStandalone()` inalterado).
- Banner reaparece a cada nova sessão/visita ao site, exceto se o usuário já o fechou nesta mesma sessão (aba atual).
- Consentimento de cookies continua sendo pré-requisito para exibição (comportamento existente, não alterado).

## Regras multi-tenant e segurança

Não aplicável — componente de UI pública sem dado de usuário/tenant envolvido.

## Validações necessárias

Nenhuma validação de schema/payload — é lógica de exibição client-side pura, sem chamada de API.

## Testes necessários

### Frontend

- Não há suíte automatizada no projeto para este componente (confirmado nesta sessão: projeto não possui testes frontend configurados).

### Backend

- Não aplicável.

### E2E

- Teste manual recomendado após a implementação:
  - Android Chrome real (ou emulado): confirmar que o banner aparece e o botão "Instalar" funciona.
  - iOS Safari real: confirmar que o banner aparece com as instruções de "Adicionar à Tela de Início".
  - Desktop Chrome/Edge: confirmar que o banner NÃO aparece, mesmo que `beforeinstallprompt` dispare.
  - Fechar o banner ("Agora não" ou "X") e recarregar a página na mesma aba: confirmar que NÃO reaparece.
  - Fechar o banner e abrir o site em nova aba/nova sessão: confirmar que reaparece.
  - Instalar o PWA e revisitar o site: confirmar que o banner não aparece mais.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Regex de UA pode ter falsos negativos em navegadores/dispositivos exóticos — mesma limitação que já existe hoje em `isIosSafari()`, não é uma regressão nova introduzida por este plano.
- Sem teste automatizado, a validação real de "aparece só em mobile real" depende de teste manual em dispositivos/emuladores reais antes de considerar o comportamento definitivamente correto em produção.
- Sem cooldown de dias, o banner aparece em toda nova sessão em mobile — comportamento intencional conforme pedido do usuário, mas vale monitorar se gera reclamação de usuários recorrentes (fora do escopo deste plano, seria um ajuste futuro).

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Banner nunca aparece em desktop, mesmo quando `beforeinstallprompt` dispara.
- Banner aparece em toda nova sessão em dispositivo móvel (Android ou iOS Safari), respeitando apenas o fechamento da sessão atual.
- Banner continua oculto quando o PWA já está instalado ou quando o consentimento de cookies ainda não foi resolvido.
- `tsc --noEmit` passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto — não há `.md` de especificação de feature associado.
- Manter a alteração restrita a `InstallPwaBanner.tsx` — não tocar em `UpdatePwaBanner.tsx` nem `CookieBanner.tsx`.
- Seguir o padrão try/catch silencioso já existente no arquivo para acesso a `localStorage`/`sessionStorage` (falhas de storage não devem quebrar a renderização do banner).
- Rodar `tsc --noEmit` ao final e reportar resultado.
- Recomendar explicitamente o teste manual em dispositivos reais/emulados no resumo final, já que não há cobertura automatizada.
