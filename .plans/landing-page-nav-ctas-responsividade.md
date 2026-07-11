# Plano de Implementação: Landing Page — Nav, CTAs e Responsividade

## Origem

- Arquivo de especificação: conversa — análise direta de `src/screens/public/LandingPage.tsx`
- Data do planejamento: `2026-06-25`
- Classificação: `frontend-only`

## Resumo

Melhorias na LandingPage focadas em três frentes: (1) adicionar navegação por âncoras no header para que o usuário possa saltar para seções da página; (2) eliminar CTAs redundantes — "Acessar painel" no hero duplicava o "Entrar" do header; (3) corrigir detalhes de footer (link LGPD duplicado, texto do botão CTA) e ajustar padding do painel de login em mobile.

## Escopo

### Dentro do escopo

- Adicionar `id` de âncora nas seções: `funcionalidades`, `avaliacoes`, `contato`
- Adicionar links de navegação no header (`hidden md:flex`) — Funcionalidades, Avaliações, Contato
- Hero: remover botão "Acessar painel", elevar "Criar conta grátis" a CTA primário (estilo brand gradient)
- Footer legal: remover botão "LGPD" e seus separadores `·` (TermosModal tipo `privacidade` já exibe "Política de Privacidade e LGPD" no título)
- Footer CTA section: renomear botão "Criar conta grátis" → "Criar minha conta"
- Login panel: `p-7` → `p-5 sm:p-7` (responsividade mobile)

### Fora do escopo

- Hamburger menu para mobile
- Criar nova modal LGPD separada
- Alterar conteúdo das modais legais (TermosModal)
- Alterar conteúdo das seções (features, stats, avaliações)
- Qualquer alteração de backend ou banco de dados

## Leitura de contexto

- `/AGENT.md` — lido
- `src/screens/public/LandingPage.tsx` — lido integralmente
- `src/screens/public/TermosModal.tsx` — lido (confirma que `tipo='privacidade'` já exibe "Política de Privacidade e LGPD")

## Impacto por área

### Frontend

**Arquivo único:** `src/screens/public/LandingPage.tsx`

Alterações:
- Seções `<section>` e `<footer>` recebem atributo `id` para âncoras
- Header: novo `<nav>` com links de âncora entre logo e botão "Entrar"
- Hero CTAs: remoção do `<Button>` "Acessar painel" + promoção visual do botão "Criar conta grátis"
- Footer legal: remoção do `<button>LGPD</button>` e seus `<span>·</span>` adjacentes
- Footer CTA section: texto do botão alterado
- Login panel: ajuste de padding

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/public/LandingPage.tsx` — único arquivo

## Estratégia de implementação

1. **IDs de âncora** — adicionar atributos `id` nas seções:
   - `<section className="border-t ... py-14">` de Features → adicionar `id="funcionalidades"`
   - `<section className="border-t ... py-14">` de Avaliações → adicionar `id="avaliacoes"`
   - `<footer ...>` → adicionar `id="contato"`

2. **Nav no header** — dentro do `<div className="mx-auto flex max-w-7xl ...">`, adicionar entre o bloco do logo e o botão "Entrar":
   ```tsx
   <nav className="hidden md:flex items-center gap-6 text-sm text-slate-400">
     <a href="#funcionalidades" className="hover:text-white transition">Funcionalidades</a>
     <a href="#avaliacoes" className="hover:text-white transition">Avaliações</a>
     <a href="#contato" className="hover:text-white transition">Contato</a>
   </nav>
   ```

3. **Hero CTAs** — no bloco `<div className="mt-8 flex flex-wrap gap-3">`:
   - Remover completamente o `<Button>` que renderiza "Acessar painel"
   - O botão "Criar conta grátis" (atualmente `<button>` com estilo ghost/border) deve ser promovido a CTA primário com estilo brand gradient, similar ao botão do footer CTA:
     ```tsx
     <button
       onClick={openRegister}
       className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-600/30 hover:opacity-90 transition"
     >
       <ArrowRight size={17} />
       Criar conta grátis
     </button>
     ```

4. **Footer legal** — localizar e remover exatamente:
   ```tsx
   <span>·</span>
   <button
     onClick={() => setModalAberto('privacidade')}
     className="hover:text-slate-300 transition"
   >
     LGPD
   </button>
   ```
   (os separadores `·` adjacentes ao botão LGPD também devem ser removidos para não deixar `··` no footer)

5. **Footer CTA section** — trocar texto do botão:
   - De: `Criar conta grátis`
   - Para: `Criar minha conta`

6. **Login panel padding** — linha do `<section id="login-panel" ...>`:
   - De: `p-7`
   - Para: `p-5 sm:p-7`

7. **Validação** — rodar `npm run build` para confirmar typecheck sem erros

## Regras de negócio identificadas

- Nav links em mobile devem ficar ocultos (`hidden md:flex`) — sem hamburger menu
- O único CTA de registro visível no hero deve ser "Criar conta grátis" (primário)
- O botão "Entrar" no header é o único ponto de entrada para login
- TermosModal tipo `privacidade` já cobre LGPD no título — link separado é redundante

## Regras multi-tenant e segurança

Não aplicável — landing page pública sem dados de tenant.

## Validações necessárias

- TypeScript: sem novos tipos introduzidos — validação de build é suficiente
- Visual: verificar que nav links aparecem em desktop e somem em mobile
- Visual: verificar que footer não fica com separadores duplicados após remoção do LGPD

## Testes necessários

### Frontend
- Verificar visualmente que os links de navegação saltam para as seções corretas
- Verificar que o botão "Entrar" do header rola para o painel de login
- Verificar que "Criar conta grátis" no hero abre o painel em modo registro

### Backend
Não aplicável.

### E2E
Não aplicável (escopo de UI simples).

## Comandos de validação sugeridos

```bash
npm run build
```

## Riscos e pontos de atenção

- **Risco baixo:** usuários que usavam "Acessar painel" para login precisarão usar "Entrar" no header — fluxo equivalente
- **Nav oculta em mobile (< md):** usuários mobile não terão acesso aos links de âncora — aceitável para landing page simples onde o conteúdo é linear

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- Header exibe links Funcionalidades / Avaliações / Contato em viewport ≥ md; header limpo em mobile
- Hero tem um único CTA primário com estilo brand gradient ("Criar conta grátis")
- Footer CTA button exibe "Criar minha conta"
- Link "LGPD" removido do footer legal sem deixar separadores órfãos
- Clicar "Política de Privacidade" abre modal com título "Política de Privacidade e LGPD"
- Login panel tem padding reduzido em mobile (`p-5`) e normal em sm+ (`sm:p-7`)
- `npm run build` passa sem erros de TypeScript

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Arquivo único: `src/screens/public/LandingPage.tsx`
- Não alterar `TermosModal.tsx` — o modal já está correto
- Seguir `/AGENT.md`
- Alterações são cirúrgicas — sem refactor oportunista
- Atenção especial à remoção dos separadores `·` adjacentes ao botão LGPD para não deixar `··` visível
