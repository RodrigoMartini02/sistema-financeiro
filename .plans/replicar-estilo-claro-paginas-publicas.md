# Plano de Implementacao: Replicar Estilo Claro nas Paginas Publicas

## Origem

- Arquivo de especificacao: `.plans/replicar-estilo-claro-paginas-publicas.md`
- Data do planejamento: `2026-08-11`
- Classificacao: `frontend-only`

## Resumo

Replicar nas paginas publicas do FINGERENCE a direcao visual clara/colorida criada como exemplo em `FuncionalidadesPage`. A implementacao deve deixar Home, Planos, Sobre, Contato e paginas legais mais claras e harmonicas, sem transformar tudo em branco, usando fundos off-white/ciano, secoes alternadas, CTAs em teal profundo e cards com bom contraste.

O header publico tambem deve ser revisado para impedir o retorno do botao `Testar gratis` ao lado de `Entrar`, pois esse CTA ja havia sido removido anteriormente desse local.

## Escopo

### Dentro do escopo

- Replicar a direcao visual clara/colorida para as paginas publicas principais:
  - `HomePage.tsx`
  - `PlanosPage.tsx`
  - `SobrePage.tsx`
  - `ContatoPage.tsx`
  - `LegalPage.tsx`, quando fizer sentido visual
- Usar `FuncionalidadesPage.tsx` como referencia visual e tecnica.
- Consolidar o uso de `tone="light"` ou mecanismo equivalente nos componentes publicos compartilhados.
- Ajustar modais publicos para visual claro, normal e limpo, sem degrade decorativo e sem borda colorida chamativa.
- Garantir que o banner de cookies nao cubra modais abertos.
- Remover ou impedir que o botao `Testar gratis` apareca ao lado de `Entrar` no header publico.
- Manter paginas claras, mas com ritmo visual: secoes em branco, off-white, ciano claro e blocos teal quando agregarem peso.
- Validar responsividade desktop e mobile por navegador.

### Fora do escopo

- Alterar o app autenticado (`app.html`, dashboard, movimentacoes, configuracoes etc.).
- Alterar backend, banco de dados, endpoints ou autenticacao.
- Criar nova identidade visual diferente da referencia aprovada em `Funcionalidades`.
- Trocar logo, favicon, manifest ou assets globais de marca.
- Reescrever copy de produto alem do necessario para encaixar layout e contraste.
- Executar migrations, alterar schema ou mexer em ambiente de deploy.

## Leitura de contexto

- `/AGENT.md`
- `/CLAUDE.md`
- `.plans/replicar-estilo-claro-paginas-publicas.md`
- `src/screens/public/FuncionalidadesPage.tsx`
- `src/screens/public/HomePage.tsx`
- `src/screens/public/PlanosPage.tsx`
- `src/screens/public/SobrePage.tsx`
- `src/screens/public/ContatoPage.tsx`
- `src/screens/public/LegalPage.tsx`
- `src/screens/public/LoginPage.tsx`
- `src/screens/public/TermosModal.tsx`
- `src/screens/public/components/SiteHeader.tsx`
- `src/screens/public/components/SiteFooter.tsx`
- `src/screens/public/components/SitePageHero.tsx`
- `src/screens/public/components/LoginModal.tsx`
- `src/screens/public/components/HomeBenefitsSection.tsx`
- `src/components/CookieBanner.tsx`, se necessario na implementacao
- `src/styles/globals.css`, se necessario na implementacao

Nao existe `frontend/AGENT.md` nem `src/AGENT.md`; somente as regras da raiz se aplicam.

## Impacto por area

### Frontend

Havera impacto apenas na area publica do frontend React/Vite/Tailwind.

Telas afetadas:

- Home publica
- Funcionalidades como referencia e possivel ajuste fino
- Planos
- Sobre
- Contato
- Termos/Privacidade
- Login/Cadastro publicos

Componentes afetados:

- Header publico
- Footer publico
- Hero publico
- Modal de login/cadastro
- Modal de termos/privacidade
- Banner de cookies, se necessario para respeitar modal aberto

Estados que precisam ser validados:

- login aberto
- cadastro aberto
- recuperar senha aberto
- termos/privacidade aberto por cima do cadastro
- cookie banner com modal aberto
- menu mobile aberto

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

Atencao: migrations nao devem ser executadas sem confirmacao explicita do usuario, pois o ambiente atual pode estar apontando para producao.

### Infra/Deploy

Sem impacto esperado alem do build frontend normal.

## Arquivos provavelmente afetados

- `src/screens/public/HomePage.tsx`
- `src/screens/public/PlanosPage.tsx`
- `src/screens/public/SobrePage.tsx`
- `src/screens/public/ContatoPage.tsx`
- `src/screens/public/LegalPage.tsx`
- `src/screens/public/LoginPage.tsx`
- `src/screens/public/TermosModal.tsx`
- `src/screens/public/components/SiteHeader.tsx`
- `src/screens/public/components/SiteFooter.tsx`
- `src/screens/public/components/SitePageHero.tsx`
- `src/screens/public/components/LoginModal.tsx`
- `src/screens/public/components/HomeBenefitsSection.tsx`
- `src/components/CookieBanner.tsx`, se o banner precisar respeitar estado de modal
- `src/styles/globals.css`, se forem necessarios tokens/classes compartilhadas

## Estrategia de implementacao

1. Auditar as alteracoes locais existentes na branch `feat/R/funcionalidades-light-example` e trata-las como rascunho, nao como implementacao final aprovada.
2. Confirmar a pagina `FuncionalidadesPage.tsx` como referencia de paleta, espacamento, hero, secoes alternadas, cards e CTAs.
3. Revisar os componentes compartilhados (`SiteHeader`, `SiteFooter`, `SitePageHero`, `LoginModal`, `LoginPage`, `TermosModal`) para suportarem o tema claro sem quebrar o tema escuro legado.
4. Ajustar `SiteHeader` para que o botao `Testar gratis` nao apareca ao lado de `Entrar`, nem em desktop nem em mobile.
5. Atualizar `HomePage.tsx` para o novo sistema claro/colorido:
   - hero claro com presenca visual da marca;
   - preview financeiro legivel;
   - secoes alternadas;
   - beneficios e avaliacoes em cards claros;
   - CTA final coerente com a nova direcao.
6. Atualizar `PlanosPage.tsx`:
   - cards de plano em fundo claro;
   - plano destaque com teal/ciano;
   - comparativo e FAQ em estilo claro;
   - CTAs sem duplicar o header.
7. Atualizar `SobrePage.tsx`:
   - blocos institucionais claros;
   - valores/diferenciais em cards brancos;
   - secoes com fundos alternados para nao ficar tudo branco.
8. Atualizar `ContatoPage.tsx`:
   - formulario claro;
   - cards de canais em branco/ciano;
   - estados visuais coerentes para campos e CTAs.
9. Revisar `LegalPage.tsx` e `TermosModal.tsx` para manter consistencia visual em termos e privacidade.
10. Revisar modais publicos para visual normal, sem degrade decorativo e sem borda colorida chamativa.
11. Validar que cookie banner nao cobre modal e que overlays/fechamento funcionam com botao, overlay e `Esc`.
12. Rodar validacoes tecnicas (`npm run build`, `git diff --check`) e validacao visual em desktop/mobile.

## Regras de negocio identificadas

- A experiencia publica deve transmitir clareza e sofisticacao sem perder personalidade da marca.
- O estilo claro nao deve virar uma pagina inteiramente branca.
- `Funcionalidades` e a referencia visual principal.
- O botao `Testar gratis` nao deve voltar ao lado de `Entrar` no header publico.
- Login/cadastro/termos precisam continuar funcionais em qualquer pagina publica.
- O app autenticado deve permanecer fora do escopo.

## Regras multi-tenant e seguranca

Sem impacto esperado, pois a mudanca e frontend-only em paginas publicas.

Mesmo assim, a implementacao nao deve tocar em:

- autenticacao backend;
- resolucao de tenant;
- queries;
- permissoes;
- RLS;
- endpoints;
- relatorios/PDFs.

## Validacoes necessarias

- Conferir contraste de textos, labels, botoes e links.
- Conferir que textos nao estouram botoes/cards em desktop e mobile.
- Conferir ausencia de overflow horizontal em mobile.
- Conferir header publico em desktop e mobile sem `Testar gratis` ao lado de `Entrar`.
- Conferir modais de login, cadastro, recuperar senha e termos/privacidade.
- Conferir cookie banner com modal aberto.
- Conferir fechamento por botao, overlay e `Esc`.
- Conferir que imagens/arte da marca aparecem no hero sem prejudicar leitura.

## Testes necessarios

### Frontend

- Validacao visual manual ou automatizada das rotas publicas.
- Smoke test dos fluxos de abrir/fechar modais.
- Build frontend completo.

### Backend

Sem testes backend necessarios.

### E2E

- Rota `/`
- Rota `/funcionalidades`
- Rota `/planos`
- Rota `/sobre`
- Rota `/contato`
- Rota `/termos`
- Rota `/privacidade`
- Fluxo de abrir login/cadastro/termos a partir do header e CTAs.

## Comandos de validacao sugeridos

```bash
npm run build
git diff --check
```

Se houver scripts especificos disponiveis no projeto durante a implementacao, considerar tambem:

```bash
npm run lint
npm run typecheck
npm run test
```

## Riscos e pontos de atencao

- Reaproveitar rascunhos locais sem auditar pode levar alteracoes incompletas para o plano.
- Exagerar no branco pode deixar a experiencia sem hierarquia visual.
- Exagerar na arte da marca pode prejudicar leitura do hero.
- O header pode voltar a duplicar CTA se `Testar gratis` estiver acoplado em algum componente compartilhado.
- Modais aninhados, especialmente termos dentro do cadastro, podem criar conflito de z-index/overlay.
- Cookie banner pode atrapalhar interacoes em mobile.
- Alteracoes globais em CSS podem afetar o app autenticado se nao forem bem escopadas.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Criterios de aceite do plano

A implementacao deve ser considerada pronta quando:

- Todas as paginas publicas principais usam a direcao clara/colorida aprovada.
- A experiencia nao parece "tudo branco"; as secoes possuem ritmo visual e fundos alternados.
- Header, footer, hero, CTAs e modais estao harmonizados.
- O header publico nao exibe `Testar gratis` ao lado de `Entrar` em desktop nem mobile.
- O CTA `Testar gratis` so aparece em pontos de conversao dentro da pagina, quando fizer sentido.
- Login/cadastro nao destoam do tema claro.
- Modais nao possuem degrade decorativo nem borda colorida chamativa.
- Termos/Privacidade abrem corretamente por cima do cadastro.
- Banner de cookies nao cobre modal aberto.
- Nao ha overflow horizontal em mobile.
- Textos nao se sobrepoem nem saem de botoes/cards.
- A arte da marca no hero permanece visivel em desktop e nao prejudica mobile.
- O app autenticado nao e alterado.
- `npm run build` passa.
- `git diff --check` passa.

## Observacoes para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir `/AGENT.md` e `/CLAUDE.md`.
- Manter as alteracoes pequenas e focadas nas paginas publicas.
- Tratar as mudancas locais existentes como rascunho: auditar, reaproveitar apenas o que estiver alinhado ao plano e corrigir o restante.
- Nao alterar backend, banco, `.env`, deploy ou migrations.
- Nao executar migrations.
- Fazer validacao visual por navegador em desktop e mobile.
- Garantir que o botao `Testar gratis` nao volte ao lado de `Entrar`.
