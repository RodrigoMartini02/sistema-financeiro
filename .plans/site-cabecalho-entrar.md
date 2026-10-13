# Plano de Implementação: cabeçalho só com "Entrar" e menu fixo

## Origem

- **Arquivo de especificação:** não há. O pedido foi feito na conversa de 2026-10-13: deixar só o "Entrar" no cabeçalho e fazer o botão aparecer "sem alteração de posições no cabeçalho", com uma navegação suave.
- **Data do planejamento:** 2026-10-13.
- **Classificação:** `frontend-only`.

## Resumo

1. **"Começar grátis":** sai do cabeçalho, no computador e no celular. O cadastro continua no topo da página da solução ("Teste grátis por 15 dias"), nos cards de planos e na chamada final.
2. **O menu para de pular.** Na produção, ele anda 115 px para a esquerda nas páginas das soluções, porque o bloco da direita com os dois botões (229 px) empurra o menu. Medição feita com o Chrome:

   | Largura | Início, Sobre e Contato | Finanças e Licitações |
   |---|---|---|
   | 1024 px | x=391 | x=276 |
   | 1280 px | x=519 | x=404 |
   | 1440 px | x=599 | x=484 |

   Com a grade de três colunas, o menu fica centralizado e na mesma posição em todas as páginas.
3. **"Entrar":** fica sozinho à direita, só nas páginas das soluções, como botão com borda e com um esmaecer de 0,2 s na entrada.

## Decisões aplicadas

1. **Estilo:** o "Entrar" vira um botão com borda (`SECONDARY_BUTTON`), no mesmo estilo de "Já sou cliente".
2. **Celular:** o menu do celular também fica só com "Entrar".
3. **Entrada:** o "Entrar" aparece com um esmaecer de 0,2 s. Com "reduzir movimento" ligado, aparece direto.

## Escopo

### Dentro do escopo

- A grade de três colunas no cabeçalho do computador: logo, menu centralizado e ações.
- A saída do "Começar grátis" do cabeçalho, no computador e no menu do celular.
- O "Entrar" como botão com borda e com o esmaecer de entrada.

### Fora do escopo

- Os botões de cadastro e "Já sou cliente" no corpo das páginas, que continuam como estão.
- O menu em si: os itens, os textos e o destaque.
- O rodapé e as outras páginas.

## Leitura de contexto

- `CLAUDE.md` e `AGENT.md` da raiz. Não existem `frontend/AGENT.md` nem `backend/AGENT.md`.
- `src/screens/public/components/SiteHeader.tsx`, `siteStyles.ts`, `SolutionHero.tsx` (onde está o "Já sou cliente", com `SECONDARY_BUTTON`) e `HeroVideo.tsx` (que já usa `motion` e `useReducedMotion`).
- Medição na produção da posição do menu e da largura do logo (181 px) e das ações (229 px ou 0), nas 5 páginas e em 3 larguras.

## Impacto por área

### Frontend

Todas as mudanças ficam em `SiteHeader.tsx`:

- **Linha do cabeçalho:**
  - a classe atual `${SITE_CONTAINER} flex h-[72px] items-center justify-between gap-5` ganha `lg:grid lg:grid-cols-[1fr_auto_1fr]`;
  - no celular, continua `flex`, com o logo e o botão do menu.
- **Logo:** ganha `lg:justify-self-start`, para não se esticar na coluna da grade.
- **Menu:** continua igual e ocupa a coluna do meio (`auto`).
- **Bloco de ações:**
  - fica como `hidden items-center justify-end gap-5 lg:flex lg:justify-self-end`;
  - existe em todas as páginas, mesmo vazio, para a coluna da direita nunca mudar.
- **"Entrar" no computador:**
  - vira `motion.button` (`framer-motion`), com a classe `${SECONDARY_BUTTON} min-h-11 px-5`;
  - entra com `initial={{ opacity: 0 }}`, `animate={{ opacity: 1 }}` e `transition={{ duration: 0.2 }}`;
  - com `useReducedMotion()` ligado, usa `initial={false}` e aparece sem efeito;
  - o `aria-label` e o `onClick` continuam os mesmos.
- **Menu do celular:** a parte de baixo mostra só "Entrar" (`SECONDARY_BUTTON`) e continua só nas páginas das soluções.
- **O que sai:**
  - os dois botões "Começar grátis";
  - o `startFree` do `usePublicSite()` no cabeçalho;
  - o import de `PRIMARY_BUTTON`, se ficar sem uso.
- **Testes:** o projeto não tem teste de layout. A conferência é por medição com o Chrome (ver "Testes necessários").

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. Este plano não tem migration.

### Infra/Deploy

Sem impacto esperado. Nenhuma regra do Render muda.

## Arquivos provavelmente afetados

- `src/screens/public/components/SiteHeader.tsx`

## Estratégia de implementação

1. Criar a branch `feat/R/site-cabecalho-entrar` a partir da `main` atualizada.
2. Em `SiteHeader.tsx`, apagar primeiro os dois "Começar grátis", o `startFree` e os imports que sobrarem.
3. Aplicar a grade de três colunas na linha do cabeçalho, com o alinhamento do logo e do bloco de ações.
4. Trocar o "Entrar" do computador pelo `motion.button` com `SECONDARY_BUTTON` e o esmaecer, respeitando o `useReducedMotion`.
5. Deixar o menu do celular só com "Entrar".
6. Rodar `npm test`, `npx tsc --noEmit` e `npx vite build`.
7. Conferir no ambiente local com o Chrome (ver "Testes necessários") e encerrar o servidor de teste, com toda a árvore de processos.

## Regras de negócio identificadas

- **Cabeçalho das páginas das soluções:** só "Entrar", que abre o login da solução em modal.
- **Cabeçalho das páginas da empresa:** sem atalho de login. A coluna da direita fica vazia.
- **Cadastro:** fica no corpo da página da solução: no topo, nos planos e na chamada final.
- **Regra antiga revista:** "'Entrar' e 'Começar grátis' só aparecem nas páginas das soluções". A memória de regras é atualizada no `/finalizar`.

## Regras multi-tenant e segurança

Sem impacto: é o site público, sem dados de conta. O login continua pelo mesmo modal.

## Validações necessárias

Não há entrada de usuário nova.

## Testes necessários

### Frontend

- `npm test` e `npx tsc --noEmit`.

### Backend

Sem impacto esperado.

### E2E

Conferência com o Chrome no ambiente local:

- **Posição do menu:** igual nas 5 páginas (`/`, `/financas/`, `/licitacoes/`, `/sobre/` e `/contato/`) em 1024, 1280 e 1440 px. Com o menu centralizado, o esperado é cerca de x=300, x=428 e x=508.
- **"Começar grátis":** não aparece no cabeçalho de nenhuma página.
- **"Entrar":**
  - aparece só em `/financas/` e `/licitacoes/`, como botão com borda;
  - com "reduzir movimento" ligado, aparece sem esmaecer;
  - abre o login da solução certa.
- **Celular (390 px):**
  - o menu das soluções mostra só "Entrar", e o das páginas da empresa não tem botão de login;
  - a página não transborda para os lados.
- **Capturas de tela:** do cabeçalho no computador e no celular.

## Comandos de validação sugeridos

```bash
npm test
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- **Mudança única nas páginas da empresa:** com o menu centralizado, ele muda de lugar uma única vez. Em 1440 px, sai de x=599 para cerca de x=508. Depois disso, fica fixo em todas as páginas.
- **Largura mínima:** em 1024 px, cada coluna lateral tem cerca de 248 px, o que cabe o logo (181 px) e o "Entrar".
- **Pasta compartilhada:** o outro chat usa a mesma pasta. Antes de criar a branch, confirmar com o usuário.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- O cabeçalho não tem "Começar grátis", nem no computador nem no celular.
- O menu fica na mesma posição nas 5 páginas, em 1024, 1280 e 1440 px.
- O "Entrar" aparece só nas páginas das soluções, como botão com borda e com o esmaecer de 0,2 s, ou sem efeito com "reduzir movimento".
- `npm test`, `npx tsc --noEmit` e `npx vite build` passam.

## Observações para a skill implementar

- Usar este plano como fonte principal. Mexer só em `SiteHeader.tsx`.
- Apagar o código antigo antes de aplicar o novo, sem deixar sobras.
- Não mudar o corpo das páginas nem o menu em si.
- No `/finalizar`, atualizar a regra do cabeçalho na memória de regras do site.
