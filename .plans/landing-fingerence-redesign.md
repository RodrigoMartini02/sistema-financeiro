# Plano: Reestruturação da Landing Page FINGERENCE

## Origem

- Data do planejamento: `2026-07-03`
- Classificação: `frontend-only`

## Resumo

Reescrita completa da landing page pública do FINGERENCE, seguindo o modelo visual do Aether (dark monocromático, glassmorphism, `font-light`, labels em caps com tracking amplo). Cor base `#040E12` (dark teal), acento pontual `#0EC4D8`. 4 páginas com React Router. Login extraído para modal reutilizável.

## Decisões aplicadas

- Decisão 1: Login como **modal** (abre ao clicar em "Entrar" ou "Começar agora")
- Decisão 2: **4 páginas** — Home, Funcionalidades, Sobre, Planos
- Decisão 3: **Manter avaliações** adaptadas ao novo visual dark teal

## Escopo

### Dentro do escopo

- 4 páginas públicas com React Router: Home, Funcionalidades, Sobre, Planos
- Componentes compartilhados: SiteHeader, SiteFooter, SitePageHero, LoginModal
- Conteúdo novo em todas as páginas (copy de produto financeiro)
- Paleta dark teal substituindo a atual slate/indigo
- Avaliações de usuários adaptadas ao novo visual
- Modal de login/cadastro extraído da LandingPage atual

### Fora do escopo

- Alterações no app autenticado (`app.html`, `AppShell`, dashboards)
- Backend / endpoints
- Sistema de planos/pagamentos real (apenas UI estática)
- `TermosModal.tsx` — mantido como está, apenas importado onde necessário

## Sistema de cores

| Token | Valor |
|---|---|
| Fundo base | `#040E12` |
| Seções alt | `#061419` |
| Texto primário | `#EEF5F7` |
| Texto secundário | `#B2C4C8` |
| Texto muted | `#7A9099` |
| Bordas | `rgba(6,182,212,0.14)` a `rgba(6,182,212,0.28)` |
| Cards glass | `rgba(6,182,212,0.025)` a `rgba(6,182,212,0.045)` |
| Acento | `#0EC4D8` (linhas decorativas, hover glow) |
| Botão primário | borda `cyan/30` + bg `cyan/5%` |
| Hover glow | `shadow-[0_0_32px_rgba(14,196,216,0.18)]` |

## Estrutura das páginas

### Home (`/`)
- Header sticky: logo FINGERENCE (Cinzel italic) + nav + botão "Entrar" → abre LoginModal
- Hero: headline impactante + linha decorativa cyan + gradiente teal escuro
- 3 Pilares: Controle Total, Visibilidade Real, Inteligência Financeira
- Destaques de módulos: 3 cards principais (Despesas/Receitas/Reservas)
- Avaliações de usuários (estrelas + comentários, dark teal)
- CTA: "Comece agora" → abre LoginModal

### Funcionalidades (`/funcionalidades`)
- SitePageHero
- 6 módulos completos: Despesas, Receitas, Reservas, IA Gen, Relatórios, Cartão de Crédito
- Comparativo Antes/Depois financeiro (igual ao Aether solutions)
- Segurança e privacidade (TLS, bcrypt, JWT)
- CTA

### Sobre (`/sobre`)
- SitePageHero
- Descrição do sistema + posicionamento institucional
- Missão / Visão / Valores
- Diferenciais do FINGERENCE
- FAQ accordion (perguntas existentes na LandingPage atual)
- CTA

### Planos (`/planos`)
- SitePageHero
- Cards de planos (gratuito + premium — conteúdo estático)
- Tabela comparativa de funcionalidades por plano
- FAQ de planos
- CTA

## Impacto por área

### Frontend

**Arquivos afetados:**

- `src/screens/public/LandingPage.tsx` — reescrita completa como `HomePage`
- `src/screens/public/FuncionalidadesPage.tsx` — novo
- `src/screens/public/SobrePage.tsx` — novo
- `src/screens/public/PlanosPage.tsx` — novo
- `src/screens/public/components/SiteHeader.tsx` — novo
- `src/screens/public/components/SiteFooter.tsx` — novo
- `src/screens/public/components/SitePageHero.tsx` — novo
- `src/screens/public/components/LoginModal.tsx` — extraído do LandingPage atual
- `src/App.tsx` — React Router para rotas públicas
- `tailwind.config.cjs` — tokens dark teal
- `package.json` — verificar/instalar `react-router-dom`

### Backend

Sem impacto esperado. O endpoint `/avaliacoes` existente continua sendo consumido normalmente.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado. Vite já serve SPA com fallback.

## Estratégia de implementação

1. Verificar se `react-router-dom` está no `package.json`; instalar se não estiver
2. Atualizar `tailwind.config.cjs` com tokens dark teal
3. Criar `src/screens/public/components/SiteHeader.tsx`
4. Criar `src/screens/public/components/SiteFooter.tsx`
5. Criar `src/screens/public/components/SitePageHero.tsx`
6. Extrair `LoginModal` do `LandingPage.tsx` → `src/screens/public/components/LoginModal.tsx`
7. Reescrever `LandingPage.tsx` como `HomePage` (Home `/`)
8. Criar `FuncionalidadesPage.tsx`
9. Criar `SobrePage.tsx`
10. Criar `PlanosPage.tsx`
11. Ajustar `src/App.tsx` — envolver rotas públicas com `<Router>` sem quebrar fluxo autenticado
12. Rodar `vite build` para validar

## Referência visual

O site em `c:\Users\rodri\Music\site` (Aether Software Engineering) é a referência direta de linguagem visual.

Padrões a replicar do Aether:
- `font-light` em títulos grandes com `tracking-[0.025em]`
- Labels em `uppercase tracking-[0.28em~0.42em]` em `text-[11px]`
- Cards com `border border-[cyan]/24 bg-white/[0.02]` e hover com glow
- Linha decorativa: `h-px bg-gradient-to-r from-[#0EC4D8]/80 via-[cyan]/38 to-transparent`
- `[text-shadow:0_0_28px_rgba(14,196,216,0.26)]` nos headings do hero
- Hover: `hover:-translate-y-[3px] hover:shadow-[0_0_32px_rgba(14,196,216,0.18)]`

## Regras de negócio identificadas

- Login/cadastro deve continuar funcionando — apenas a UI muda
- Avaliações são buscadas via `GET /avaliacoes` (unauthenticated) — manter `useQuery`
- Termos e Privacidade abrem `TermosModal` — manter comportamento
- Planos page é estática (sem integração real por ora)

## Riscos e pontos de atenção

- `App.tsx` usa `window.location.pathname` para decidir entre landing e app — integrar React Router deve respeitar essa lógica sem quebrar o fluxo autenticado (`app.html`)
- `react-router-dom` pode não estar instalado no FINGERENCE (está no Aether, projetos separados)
- O `vite.config.ts` pode precisar de ajuste para servir SPA com múltiplas rotas públicas

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite

- [ ] 4 páginas públicas funcionando com React Router
- [ ] Visual dark teal `#040E12` consistente em todas as páginas
- [ ] LoginModal abre ao clicar em "Entrar" ou "Começar agora"
- [ ] Avaliações renderizando no novo visual
- [ ] `vite build` sem erros
- [ ] Fluxo autenticado (`app.html`) não quebrado

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Referenciar visualmente `c:\Users\rodri\Music\site\src\Site\AetherSite.tsx` e `AetherSolutionsPage.tsx`
- Não executar migrations — sem impacto em banco
- Seguir `/AGENT.md` da raiz
- Manter alterações focadas no diretório `src/screens/public/`
- Não alterar nada dentro do fluxo autenticado (`AppShell`, dashboards, screens de finance)
- Instalar `react-router-dom` via `npm install` se não estiver presente
