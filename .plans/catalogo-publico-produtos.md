# Plano de Implementação: Catálogo Público de Produtos

## Origem

- Arquivo de especificação: `docs/features/catalogo-publico-produtos.md`
- Data do planejamento: `2026-09-03`
- Classificação: `frontend + backend + database`

## Resumo

Implementar duas frentes conectadas pelo mesmo catálogo de dados: (1) uma tela de gestão interna, atrás de login, para cadastrar/editar/remover produtos com nome, descrição, valor, múltiplas imagens e estado ativo/inativo; (2) uma página pública, sem autenticação, exibindo os produtos ativos de uma conta em formato de vitrine simples (sem carrinho/checkout), com CTA via WhatsApp. A feature é implementada como um módulo novo e isolado (`catalogo`) no mesmo backend do sistema financas, sem relação com dados de futebol ou financeiro — apenas compartilhando processo Express e Postgres físico, como os módulos existentes já fazem entre si.

## Escopo

### Dentro do escopo

- CRUD autenticado de produtos (nome, descrição, valor, múltiplas imagens, ativo/inativo) na tela de gestão do painel.
- Upload de imagem de produto com resize/otimização via `sharp` (lacuna que não existe em nenhuma rota de upload do projeto hoje).
- Rota pública sem autenticação, filtrada por identificador de conta (UUID), listando apenas produtos com `ativo = true`.
- Página pública de vitrine (`/catalogo/:accountId`) com fotos, nome, descrição, preço e CTA de WhatsApp (`wa.me`).
- SSR leve sob demanda para meta tags dinâmicas de SEO na vitrine.
- Testes de funções puras (validação de slug/accountId, preço, tipo/tamanho de imagem) seguindo o padrão `node:test` já existente.

### Fora do escopo

- Carrinho de compras / checkout.
- Controle de estoque.
- Variações de produto (tamanho, cor, etc.).
- Categorização avançada de produtos.
- Testes de rota HTTP (integração) ou de componente React — não há infraestrutura para isso no projeto hoje; criá-la está fora do escopo desta feature.
- Alteração do script `generate-public-route-html.mjs` para suportar geração estática — decidido explicitamente que a vitrine usa SSR leve sob demanda em vez de pré-render estático.
- Qualquer alteração em `services.ts`/`ServicosTab.tsx` — servem apenas como referência de padrão, não são tocados.

## Leitura de contexto

- `/AGENT.md` (raiz do projeto) — lido. Nota: descreve contexto "multi-prefeitura + RLS" que não corresponde à realidade deste projeto (single-tenant por `usuario_id`/conta, sem RLS no Postgres — confirmado ausência de `ROW LEVEL SECURITY`/`CREATE POLICY` em todas as migrations). Essa seção específica do AGENT.md é ignorada nesta implementação; as demais regras (Drizzle para queries novas, sem `any`, sem catch silencioso, validação backend, nomes claros, early return) se aplicam normalmente.
- `/CLAUDE.md` (raiz) — lido. Regras de workflow (`/planejar → aprovação → /implementar → /finalizar`), stack (React+TS+Vite+Tailwind / Express+TS+Postgres), proibição de alterar `.env` e de rodar migrations sem confirmação.
- `frontend/AGENT.md` — **não existe** como arquivo dedicado neste projeto (sem separação de pastas `frontend/`/`backend/` na raiz para o frontend).
- `backend/AGENT.md` — **não existe** como arquivo dedicado; apenas o `AGENT.md` da raiz, que cobre todo o repositório.
- `docs/features/catalogo-publico-produtos.md` — especificação da feature, escrita nesta sessão consolidando a conversa com o usuário.
- Arquivos de referência de padrão explorados: `backend/src/server.ts`, `backend/src/modules/futebol/routes/public.ts`, `backend/src/modules/futebol/db/schema.ts`, `backend/drizzle.config.ts`, `backend/src/routes/services.ts`, `backend/src/routes/contract-attachments.ts`, `src/screens/config/ServicosTab.tsx`, `src/layout/ConfigPanel.tsx`, `src/App.tsx`, `scripts/generate-public-route-html.mjs`, `src/components/AvatarUploadDialog.tsx`, `backend/src/services/plan-access.test.ts`, `backend/package.json`, `package.json` (raiz).

## Impacto por área

### Frontend

- Nova tab de gestão **"Catálogo de produtos"** em `src/screens/config/CatalogoTab.tsx`, seguindo o padrão de `ServicosTab.tsx` (Dialog de criar/editar + lista com `ConfigListRow`, `useQuery`/`useMutation` do TanStack Query, query keys centralizadas).
- Registro da nova tab em `src/layout/ConfigPanel.tsx`: adicionar id ao tipo `ConfigItemId`, entrada no array `ITEMS`, e render condicional no corpo.
- Novo `src/services/catalogoService.ts`, usando o helper `apiRequest` existente (mesmo padrão de `servicosService.ts`) para as rotas autenticadas, e `fetch`/`FormData` direto para upload de imagem (mesmo padrão usado em `clientesService.ts` para anexos multipart).
- Novo componente de upload de imagem de produto, derivado de `AvatarUploadDialog.tsx`: reaproveita picker de arquivo, validação de tipo (`image/jpeg`, `image/png`, `image/webp`) e tamanho, e a lógica de canvas com zoom/drag — mas troca a máscara de crop circular (`ctx.arc`) por retangular/sem crop, e suporta múltiplas imagens (galeria com reorder simples, uma marcada como capa).
- Nova página pública `src/screens/public/CatalogoPublicoPage.tsx`, em `src/screens/public/`, com grid de produtos ativos (foto, nome, descrição, preço) e CTA de WhatsApp (`wa.me/<numero>?text=...` com nome do produto pré-preenchido).
- Nova rota `/catalogo/:accountId` em `src/App.tsx`, dentro de `PublicSite()`, adicionada antes do catch-all `<Route path="*">`.
- Estados de loading/error/empty tratados na tela de gestão (lista de produtos) e na vitrine pública (conta inexistente → 404; sem produtos ativos → estado vazio amigável).
- Sem testes de componente React (fora de escopo, conforme decisão registrada).

### Backend

- Novo módulo `backend/src/modules/catalogo/`, isolado, com:
  - `db/schema.ts` — `pgSchema('catalogo')`, tabelas `produtos` e `produto_imagens` via Drizzle.
  - `routes/produtos.ts` — CRUD autenticado (`authenticate`, `requireActivePlan` aplicados por rota, seguindo o padrão de `services.ts`), filtrando sempre por `usuario_id`. Inclui rota de upload de imagem (multer diskStorage + `sharp` para resize/conversão WebP), com validação de mimetype no backend (lacuna que hoje só existe no frontend em outras rotas de upload).
  - `routes/public.ts` — rota pública sem autenticação, replicando o padrão `accountExists` do módulo futebol: middleware que valida existência da conta (usuário dono do catálogo) via UUID na URL, popula `req.catalogoAccountId` (via `declare global` augmentation do Express, mesmo padrão de `req.user`), e toda query subsequente filtra por esse id. `select()` explícito de colunas (nunca `select *`) e filtro `ativo = true` sempre na query SQL/Drizzle, nunca só no frontend.
  - `routes/index.ts` — agrega os sub-routers, montando `/public` sem auth dentro do próprio módulo (mesmo padrão de `modules/futebol/routes/index.ts`).
- Registro em `backend/src/db/schema/index.ts`: `export * from '../../modules/catalogo/db/schema';` para o `drizzle-kit`/tooling enxergar o schema novo.
- Mount em `backend/src/server.ts`: `app.use('/api/catalogo', catalogoRoutes)`.
- **Correção descoberta durante a implementação**: o backend Express não serve o build do frontend (sem `express.static`/`sendFile` em `server.ts`, sem config de deploy no repo) — são dois deploys separados (frontend em hosting estático, backend à parte). A rota SSR leve planejada originalmente (Express injetando meta tags no `index.html` buildado do Vite, no mesmo processo) não é tecnicamente viável. Decisão tomada: meta tags dinâmicas (title/description) são atualizadas **client-side via React**, seguindo o padrão de `PublicSeo.tsx` já usado nas demais páginas públicas — sem SSR, sem nova rota no backend. SEO fica mais fraco para crawlers sem JS e para preview de redes sociais (og:image não funciona bem sem HTML pré-renderizado), mas isso é aceito nesta fase. Não usa o script `generate-public-route-html.mjs` (rota dinâmica não se encaixa no pré-render estático de rota fixa).
- Sem alteração em `services.ts`, `contract-attachments.ts` ou qualquer rota existente — usados apenas como referência de padrão.

### Banco de dados

**Correção descoberta durante a implementação**: `usuarios.id` é `serial` (integer sequencial), não UUID — diferente do módulo futebol, que tem seu próprio `footballUsers.id` em UUID nativo (conta própria do módulo). O catálogo reaproveita a conta existente do sistema financas (`usuarios.id`), então não havia um identificador não-sequencial pronto para expor na URL pública. Decisão tomada: criar uma tabela `catalogo.contas` com `id` UUID próprio, relação 1:1 com `usuario_id`, provisionada na primeira vez que o usuário acessa a gestão do catálogo. A URL pública usa esse UUID (`catalogo.contas.id`), nunca o `usuario_id` sequencial.

- Novas tabelas, no schema Postgres `catalogo` (schema dedicado, isolado de `public`/`futebol`):
  - `catalogo.contas`: `id` (uuid, pk, default random), `usuario_id` (fk para `usuarios.id`, not null, unique — garante 1:1, `onDelete: cascade`), `created_at`. Índice único em `usuario_id`.
  - `catalogo.produtos`: `id` (uuid, pk, default random), `usuario_id` (fk para `usuarios.id`, not null, `onDelete: cascade`), `nome` (varchar, not null), `descricao` (text), `valor` (numeric/decimal, not null), `ativo` (boolean, default true, not null), `created_at`, `updated_at`. Índice em `usuario_id` (consultas de gestão) e índice composto em `(usuario_id, ativo)` (consultas da vitrine pública).
  - `catalogo.produto_imagens`: `id` (uuid, pk), `produto_id` (fk para `catalogo.produtos.id`, `onDelete: cascade`), `nome_arquivo` (varchar), `ordem` (integer, para definir capa/sequência), `created_at`. Índice em `produto_id`.
- Migration escrita **manualmente** como arquivo `.sql`, seguindo a numeração sequencial existente em `backend/drizzle/` (próximo número disponível após o mais recente — verificar no momento da implementação, ex. `0026_catalogo_produtos.sql`). Este projeto não usa `drizzle-kit generate` automático (não está instalado nem configurado com script no `package.json`) — o padrão observado é escrever o SQL manualmente seguindo a forma dos arquivos existentes, incluindo comentário de cabeçalho indicando que não deve ser executado automaticamente.
- **Migration não será executada nesta etapa.** Fica pendente de confirmação explícita do usuário, conforme regra do projeto (ambiente pode estar apontando para produção).

### Infra/Deploy

- Nova pasta de armazenamento em disco para imagens de produto (ex.: `backend/uploads/catalogo/`), seguindo o padrão de `backend/uploads/contratos/` usado por `contract-attachments.ts`. Sem novas env vars, sem novos serviços externos, sem mudança de build/deploy pipeline além da rota SSR nova (que roda no mesmo processo Express, sem infra adicional).
- `sharp` e `multer` já estão instalados no backend (`^0.34.5` e `^2.1.1` respectivamente) — nenhuma dependência nova necessária.

## Arquivos provavelmente afetados

**Novos:**
- `backend/src/modules/catalogo/db/schema.ts`
- `backend/src/modules/catalogo/routes/index.ts`
- `backend/src/modules/catalogo/routes/produtos.ts`
- `backend/src/modules/catalogo/routes/public.ts`
- `backend/drizzle/0026_catalogo_produtos.sql` (número exato a confirmar no momento da implementação)
- `backend/src/services/catalogo.test.ts` (ou local equivalente coberto pelo glob `src/services/*.test.ts`)
- `src/screens/config/CatalogoTab.tsx`
- `src/screens/public/CatalogoPublicoPage.tsx`
- `src/services/catalogoService.ts`
- `src/components/ProductImageUploadDialog.tsx` (nome sugerido, a confirmar durante implementação)

**Editados:**
- `backend/src/db/schema/index.ts` (re-export do schema novo)
- `backend/src/server.ts` (mount do módulo + rota SSR leve)
- `src/layout/ConfigPanel.tsx` (registro da tab nova)
- `src/App.tsx` (rota pública nova)

**Não tocados (apenas referência):**
- `backend/src/routes/services.ts`
- `backend/src/routes/contract-attachments.ts`
- `src/screens/config/ServicosTab.tsx`
- `src/components/AvatarUploadDialog.tsx`
- `scripts/generate-public-route-html.mjs`

## Estratégia de implementação

1. Criar branch de feature: `feat/R/catalogo-publico-produtos`.
2. Backend — schema: criar `modules/catalogo/db/schema.ts` com `pgSchema('catalogo')`, tabelas `produtos` e `produto_imagens`, tipos `$inferSelect` exportados. Registrar re-export em `db/schema/index.ts`.
3. Backend — migration: escrever o `.sql` manualmente em `backend/drizzle/`, seguindo numeração e formato dos arquivos existentes. **Não executar.**
4. Backend — rotas autenticadas: `routes/produtos.ts` com CRUD completo (list/create/update/delete) + rota de upload de imagem (multer + sharp), tudo filtrado por `usuario_id`, seguindo o padrão de resposta `{ success, message?, data? }` visto em `services.ts`.
5. Backend — rota pública: `routes/public.ts` com middleware `accountExists` (adaptado do futebol, usando `usuario_id` como identificador de conta), rota de listagem de produtos ativos com `select()` explícito.
6. Backend — agregação e mount: `routes/index.ts` montando `/public` sem auth; `server.ts` fazendo `app.use('/api/catalogo', catalogoRoutes)`.
7. ~~Backend — SSR leve~~ (não viável, ver correção acima): meta tags dinâmicas ficam a cargo do frontend, item 11.
8. Frontend — service: `catalogoService.ts` com funções de list/create/update/delete/upload, usando `apiRequest` e `fetch`/`FormData` para upload.
9. Frontend — componente de upload: adaptar `AvatarUploadDialog.tsx` para crop retangular/sem crop e múltiplas imagens.
10. Frontend — tela de gestão: `CatalogoTab.tsx` (lista + dialog de criar/editar), registrar em `ConfigPanel.tsx`.
11. Frontend — vitrine pública: `CatalogoPublicoPage.tsx`, registrar rota em `App.tsx`, atualizar `document.title`/meta description client-side ao carregar (seguindo padrão de `PublicSeo.tsx`).
12. Testes: `catalogo.test.ts` cobrindo funções puras de validação (preço, tipo/tamanho de imagem, normalização de dados), seguindo `node:test`.
13. Rodar validações: `cd backend && npm run build` (typecheck), `cd backend && npm test`, `npm run build` (raiz).
14. Testar fluxo completo no navegador via `/run` (gestão: criar/editar/remover produto com imagem; vitrine: acessar `/catalogo/:accountId`, conferir só produtos ativos aparecem, CTA WhatsApp funcional).
15. Produzir resumo final e perguntar sobre envio para produção (fluxo do `/finalizar`, fora desta skill).

## Regras de negócio identificadas

- Produto tem nome, descrição, valor, uma ou mais imagens, estado ativo/inativo.
- Vitrine pública mostra **apenas** produtos com `ativo = true` — filtro obrigatório no backend, nunca só no frontend.
- Sem carrinho, checkout, estoque, variações ou categorização nesta fase — qualquer implementação desses itens está fora de escopo.
- CTA da vitrine é link do WhatsApp com nome do produto pré-preenchido na mensagem, sem fluxo de pedido/formulário.

## Regras multi-tenant e segurança

- Este projeto é single-tenant por `usuario_id`/conta (não multi-prefeitura) — a seção multi-tenant/RLS do `AGENT.md` genérico não se aplica; o equivalente aqui é sempre filtrar por `usuario_id` (dono do catálogo).
- Toda query autenticada do módulo (`routes/produtos.ts`) deve filtrar por `usuario_id = req.user.id`, nunca confiar em `usuario_id`/`accountId` vindo do client sem validação.
- A rota pública identifica a conta por UUID na URL (não por JWT) — o middleware `accountExists` deve validar a existência da conta antes de qualquer query de dados, e todo dado retornado deve ser explicitamente selecionado (nunca `select *`), evitando vazar campos internos (ex.: nunca expor `usuario_id` numérico sequencial, e-mail ou outros dados sensíveis do dono da conta na resposta pública).
- Filtro `ativo = true` sempre aplicado na query, nunca apenas no client, para impedir acesso a produto inativo via chamada direta à API pública.
- Mensagens de erro da rota pública não devem revelar se a conta existe de forma que ajude enumeração (usar mensagem genérica tipo "Catálogo não encontrado" para conta inexistente).
- Validação de mimetype e tamanho de imagem obrigatória no backend na rota de upload (não confiar apenas na validação client-side do dialog de upload).

## Validações necessárias

- Nome do produto: obrigatório, não vazio.
- Valor: obrigatório, numérico, maior que zero.
- Imagem: mimetype restrito a `image/jpeg`, `image/png`, `image/webp`; limite de tamanho de arquivo definido explicitamente (a confirmar durante implementação, referência: 2MB usado em `AvatarUploadDialog.tsx`, ou limite maior compatível com `sharp` processando antes de salvar).
- `accountId`/identificador público: validar formato UUID antes de consultar o banco.
- Estado `ativo`: boolean, default `true` na criação.

## Testes necessários

### Frontend

- Sem testes automatizados nesta fase (decisão registrada — sem infraestrutura de teste de componente no projeto).

### Backend

- Testes de funções puras em `backend/src/services/catalogo.test.ts` (ou arquivo equivalente coberto pelo glob `src/services/*.test.ts`), cobrindo: validação de valor/preço, validação de tipo/tamanho de imagem, normalização/validação de formato do identificador público (UUID).

### E2E

- Sem testes E2E automatizados — validação manual via `/run` (fluxo de gestão completo + acesso à vitrine pública).

## Comandos de validação sugeridos

```bash
cd backend && npm run build
cd backend && npm test
npm run build
```

Não há `lint` configurado em nenhum nível do projeto (sem ESLint) — não incluir esse comando nas validações.

## Riscos e pontos de atenção

- Migration manual sem `drizzle-kit generate` tem risco de drift entre o schema TypeScript e o SQL escrito à mão — revisar com cuidado antes de propor execução.
- Enumeração de conta via `accountId` público mitigada por ser UUID (não sequencial), gerado em `catalogo.contas` — manter esse padrão, nunca usar o `usuario_id` sequencial diretamente na URL pública.
- Rota SSR leve nova é um padrão que não existe hoje no projeto (todas as páginas públicas atuais são SPA puro ou pré-render estático em build-time) — precisa reaproveitar o HTML buildado do Vite sem duplicar/desatualizar o shell caso o build mude.
- Upload de imagem sem limites bem definidos de tamanho/dimensão pode virar vetor de abuso (upload de arquivos grandes) — `sharp` deve processar com limites explícitos antes de persistir.
- Nenhuma migration será executada nesta etapa; o ambiente pode estar apontando para produção.
- Risco de escopo indevido: não implementar carrinho/checkout/estoque/variações/categorização, mesmo que pareçam extensões naturais durante a implementação.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — todas as decisões pendentes (query builder, migration, SEO da vitrine, testes) foram resolvidas e registradas neste plano.

## Critérios de aceite do plano

- Módulo `catalogo` isolado, sem dependência de dados de futebol ou financeiro.
- CRUD de produtos funcional na tela de gestão, autenticado e filtrado por `usuario_id`.
- Upload de imagem com resize/otimização via `sharp`, validado no backend.
- Vitrine pública acessível sem login em `/catalogo/:accountId`, exibindo apenas produtos ativos.
- CTA de WhatsApp funcional na vitrine.
- Migration escrita mas não executada.
- Build e testes existentes passando (`backend build`, `backend test`, build raiz).

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar a migration SQL sob nenhuma circunstância sem confirmação explícita do usuário — o ambiente pode estar apontando para produção.
- Seguir o `AGENT.md`/`CLAUDE.md` da raiz (único existente no projeto), ignorando especificamente a seção de contexto multi-prefeitura/RLS por não se aplicar a este projeto.
- Manter o módulo `catalogo` isolado — não criar FK ou joins com tabelas de `futebol` ou tabelas financeiras existentes.
- Não implementar nada listado em "Fora do escopo".
- Ao final, seguir o fluxo de Git descrito na skill `implementar` (branch `feat/R/catalogo-publico-produtos`, sem push/merge automático) e perguntar sobre envio para produção apenas ao final, sem fazer commit/push por conta própria.
