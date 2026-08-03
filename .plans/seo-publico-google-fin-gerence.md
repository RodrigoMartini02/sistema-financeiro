# Plano: SEO Público do FinGerence

## Origem

- Demanda: ajustar o site público do FinGerence para o Google identificar melhor o sistema e deixá-lo visível na web.
- Site público: `https://fin-gerence.com.br/`
- Área privada: `https://fin-gerence.com.br/app.html`
- Data do planejamento: `2026-08-03`
- Classificação: `frontend + infra/deploy + SEO técnico`

## Resumo

Ajustar o site público do FinGerence para que as páginas institucionais sejam rastreáveis, coerentes e acessíveis diretamente pelo Google, sem expor a área privada do sistema.

A rota `/app.html` deve continuar privada para indexação, com `noindex,nofollow`, e fora do sitemap. O foco da implementação é corrigir rotas públicas, sitemap, robots, páginas legais públicas e metadados por rota.

## Escopo

### Dentro do escopo

- Corrigir acesso direto às rotas públicas:
  - `/`
  - `/funcionalidades`
  - `/sobre`
  - `/planos`
  - `/contato`
  - `/termos`
  - `/privacidade`
- Remover do sitemap a URL quebrada `/termoPrivacidade.html`.
- Manter `/app.html` fora do sitemap e bloqueado para indexação.
- Manter em `/app.html` a meta tag `robots` com `noindex,nofollow`.
- Criar ou ajustar metadados por rota pública:
  - `title`
  - `description`
  - `canonical`
  - Open Graph básico
- Criar páginas públicas reais para Termos e Privacidade.
- Ajustar o footer para apontar para páginas públicas reais de Termos e Privacidade.
- Validar o build gerado.

### Fora do escopo

- Alterar backend financeiro.
- Alterar banco de dados.
- Executar migrations.
- Alterar `.env`.
- Alterar login, assinatura, pagamentos ou regras de planos.
- Indexar qualquer tela privada da área autenticada.
- Fazer push/deploy para produção sem confirmação explícita.

## Leitura de Contexto

Arquivos e fontes considerados:

- `AGENT.md`
- `CLAUDE.md`
- `package.json`
- `vite.config.ts`
- `index.html`
- `app.html`
- `robots.txt`
- `sitemap.xml`
- `src/App.tsx`
- `src/main.tsx`
- `src/screens/public/HomePage.tsx`
- `src/screens/public/FuncionalidadesPage.tsx`
- `src/screens/public/SobrePage.tsx`
- `src/screens/public/PlanosPage.tsx`
- `src/screens/public/ContatoPage.tsx`
- `src/screens/public/TermosModal.tsx`
- `src/screens/public/components/SiteHeader.tsx`
- `src/screens/public/components/SiteFooter.tsx`
- Documentação oficial do Google Search Central sobre JavaScript SEO, canonical e sitemap.

## Impacto por Área

### Frontend

- Ajustar rotas públicas em `src/App.tsx`.
- Criar páginas públicas reais para `/termos` e `/privacidade`, reaproveitando o conteúdo atual de `TermosModal` quando possível.
- Ajustar o footer para usar links reais em vez de depender apenas de modal.
- Adicionar ou reaproveitar um helper/componente para SEO por rota pública.
- Garantir que as páginas públicas tenham conteúdo institucional claro e não dependam de login.
- Preservar a área privada `/app.html` e o comportamento de redirecionamento/login.

### Backend

Sem impacto backend esperado inicialmente.

### Banco de Dados

Sem alteração de banco esperada.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

- Corrigir o comportamento de acesso direto às rotas públicas em produção.
- Avaliar a melhor solução técnica para o ambiente Render:
  - gerar HTML estático por rota pública no build; ou
  - configurar rewrite/fallback com cuidado para não criar soft 404.
- Garantir que `/app.html` continue privado para indexação.
- Não fazer push/deploy sem confirmação explícita.

## Arquivos Provavelmente Afetados

- `src/App.tsx`
- `src/screens/public/HomePage.tsx`
- `src/screens/public/FuncionalidadesPage.tsx`
- `src/screens/public/SobrePage.tsx`
- `src/screens/public/PlanosPage.tsx`
- `src/screens/public/ContatoPage.tsx`
- `src/screens/public/TermosModal.tsx`
- `src/screens/public/components/SiteFooter.tsx`
- `index.html`
- `robots.txt`
- `sitemap.xml`
- `vite.config.ts`, se necessário para build/rotas estáticas
- possíveis arquivos novos em `src/screens/public/` para Termos, Privacidade e SEO helper

## Estratégia de Implementação

1. Criar um helper/componente de SEO público para atualizar `title`, `description`, `canonical` e Open Graph conforme a rota.
2. Criar páginas públicas reais:
   - `/termos`
   - `/privacidade`
3. Reaproveitar o conteúdo atual de `TermosModal`, mas renderizar também em páginas normais e indexáveis.
4. Ajustar `SiteFooter` para usar links reais:
   - `Privacidade` -> `/privacidade`
   - `Termos` -> `/termos`
5. Atualizar `src/App.tsx` com as novas rotas públicas.
6. Atualizar `sitemap.xml` com somente URLs públicas válidas.
7. Atualizar `robots.txt` para permitir páginas públicas e manter bloqueio da área privada.
8. Implementar solução para acesso direto às rotas públicas em produção, preferencialmente gerando HTML estático por rota pública no build se for viável sem dependências novas.
9. Rodar `npm run build`.
10. Validar o conteúdo gerado em `dist/`.

## Segurança, Dados e Multi-Tenant

- Não expor conteúdo, rotas ou dados da área autenticada no site público.
- Manter `/app.html` com `noindex,nofollow`.
- Não adicionar `/app.html` ao sitemap.
- Não alterar autenticação, sessão, tokens, pagamentos ou backend.
- Não alterar `.env`.
- Não executar migrations, seeds ou comandos com impacto no banco.
- Garantir que páginas legais e institucionais sejam públicas sem depender de dados do usuário.

## Validações Necessárias

- Confirmar que `/app.html` continua contendo `noindex,nofollow`.
- Confirmar que `sitemap.xml` não contém `/termoPrivacidade.html` nem `/app.html`.
- Confirmar que `robots.txt` bloqueia `/app.html` e não bloqueia páginas públicas.
- Confirmar que as rotas públicas diretas não retornam 404 no build/deploy.
- Confirmar que páginas públicas têm canonical próprio.
- Confirmar que metadados por rota são atualizados no navegador.

## Testes Recomendados

### Frontend

- Testar navegação pública entre Home, Funcionalidades, Planos, Sobre, Contato, Termos e Privacidade.
- Testar links do footer.
- Testar que login/modal continuam funcionando.
- Testar que `/app.html` mantém fluxo privado.

### Backend

- Não aplicável inicialmente.

### E2E

- Se houver Playwright disponível, validar acesso direto às rotas públicas e o bloqueio/indexação da área privada.

## Comandos de Validação Sugeridos

Scripts disponíveis no `package.json`:

```bash
npm run build
npm run preview
```

Não existem scripts `lint`, `typecheck` ou `test` configurados no `package.json` atual.

## Riscos e Pontos de Atenção

- Rewrite genérico demais pode transformar URLs inexistentes em `200`, criando risco de soft 404.
- Copiar o mesmo HTML para várias rotas sem canonical/metadados adequados pode gerar páginas fracas ou duplicadas.
- Remover acidentalmente `noindex` de `/app.html` pode expor a área privada ao índice.
- O deploy no Render pode ser acionado por push; confirmar antes de enviar para produção.
- O conteúdo de Termos/Privacidade hoje está em modal e com sinais de texto antigo/codificação que devem ser revisados com cuidado durante a implementação.

## Perguntas em Aberto

- Confirmar durante a implementação se a solução final será geração estática por rota pública ou fallback/rewrite no Render.
- Confirmar se Termos e Privacidade devem manter exatamente o texto atual ou receber revisão textual em etapa futura.

## Critérios de Aceite

- `/app.html` continua com `noindex,nofollow`.
- `/app.html` não aparece no sitemap.
- `/termoPrivacidade.html` é removido do sitemap.
- `sitemap.xml` contém apenas URLs públicas válidas.
- `robots.txt` não bloqueia rotas públicas e bloqueia a área privada.
- As rotas públicas principais podem ser acessadas diretamente sem 404.
- Termos e Privacidade existem como páginas públicas reais.
- Footer aponta para páginas reais de Termos e Privacidade.
- Cada página pública possui título, descrição e canonical coerentes.
- `npm run build` passa.

## Instruções Para /implementar

- Usar este plano como fonte principal de contexto.
- Ler `AGENT.md` e `CLAUDE.md` antes de alterar arquivos.
- Não executar migrations.
- Não alterar `.env`.
- Não alterar backend ou banco salvo se uma necessidade crítica for descoberta e aprovada.
- Manter `/app.html` privado para indexação.
- Preferir solução forte para Google: HTML inicial acessível e rotas públicas sem 404.
- Não fazer commit, push ou deploy nesta etapa.