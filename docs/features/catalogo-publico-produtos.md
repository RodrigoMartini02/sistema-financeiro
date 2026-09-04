# Catálogo Público de Produtos

## Objetivo

Duas frentes conectadas pelo mesmo catálogo de dados:

1. **Tela de gestão interna** (atrás de login, no mesmo padrão das telas administrativas já existentes em `src/screens/config/`) — cadastrar/editar/remover produtos, subir imagens, definir valores.
2. **Página pública** (sem autenticação) — vitrine exibindo os produtos ativos, com fotos, nome, descrição e preço, no estilo de um site de e-commerce simples (sem carrinho/checkout).

## Escopo confirmado

### Produto

- Nome
- Descrição
- Valor
- Uma ou mais imagens (múltiplas desde o início — schema já preparado para N imagens por produto, com ordem/capa, mesmo que a UI v1 mostre só a capa em algumas listagens)
- Estado ativo/inativo

### Fora de escopo (fase atual)

- Carrinho de compras / checkout
- Controle de estoque
- Variações (tamanho, cor, etc.)
- Categorização avançada

## Decisões já tomadas (validadas em análise prévia com Claude)

- **Módulo isolado no backend**: novo módulo `catalogo`, com Postgres schema próprio (`catalogo`), tabelas próprias (`catalogo.produtos`, `catalogo.produto_imagens`). Sem relação, FK ou dependência com dados de futebol ou financeiro — isolamento total de dados, compartilhando apenas o processo Express e o Postgres físico, como os módulos existentes já fazem entre si.
- **Múltiplas imagens por produto** desde a v1 (não só uma).
- **Armazenamento de imagem**: disco local, seguindo o padrão de `backend/src/routes/contract-attachments.ts` (multer diskStorage), **acrescentando processamento com `sharp`** (resize + conversão para WebP) — lacuna que não existe em nenhuma rota de upload do projeto hoje e é necessária por se tratar de imagens expostas publicamente (performance/SEO).
- **CTA na vitrine**: link do WhatsApp (`wa.me`) com nome do produto pré-preenchido na mensagem — sem checkout, sem formulário de pedido.
- **URL/localização da vitrine**: nova rota dentro do site público existente (`index.html`, ao lado de `/funcionalidades`, `/sobre`, etc.), entrando no pipeline de pré-renderização de SEO já usado por essas páginas (`scripts/generate-public-route-html.mjs`).
- **Identificador público**: a vitrine deve ser acessada por um slug/UUID público dedicado (não o `usuario_id` sequencial), para evitar enumeração de contas via URL.
- **Gestão** entra no painel logado (`app.html`), como nova tab em `src/screens/config/`, seguindo o padrão de `ServicosTab.tsx` (Dialog + TanStack Query + `ConfigListRow`).

## Contexto técnico já levantado

- Projeto é **single-tenant** (isolamento por `usuario_id`/conta, sem RLS no Postgres — confirmado que não há `ROW LEVEL SECURITY`/`CREATE POLICY` em nenhuma migration). O `AGENT.md` da raiz descreve "multi-prefeitura + RLS", mas isso não corresponde à realidade do código deste projeto — essa seção do `AGENT.md` deve ser ignorada ao planejar esta feature.
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` dedicados — apenas o `AGENT.md`/`CLAUDE.md` da raiz, cobrindo todo o repositório.
- Auth é aplicada por rota (mount em `backend/src/server.ts`), não globalmente — cada router decide se leva `authenticate`/`requireActivePlan`. Rotas públicas sem autenticação alguma já existem no projeto (ex.: sub-rotas `public` de outros módulos, guardadas apenas por verificação de existência do identificador de conta, sem JWT/sessão) — esse é o padrão a seguir para a rota pública da vitrine.
- Existe uma tabela/rota `servicos` (`backend/src/routes/services.ts`) hoje, mas é de precificação de contratos/consultoria (`nome` + `valor_mensal_padrao`, sem imagem, sem descrição, sem exibição pública) — **não reaproveitar diretamente**, é uma tabela auxiliar de contrato, não um catálogo.
- `sharp` (`^0.34.5`) e `multer` (`^2.1.1`) já estão instalados no backend — não requer nova dependência.
- Frontend não é um SPA único: há dois HTMLs de entrada Vite (`index.html` = site público com React Router + pré-render de SEO; `app.html` = painel logado, navegação por `useState`, sem React Router interno). A vitrine pública entra no primeiro; a gestão entra no segundo.
- Componentes de upload existentes (`AvatarUploadDialog.tsx` — crop circular single-image; `AttachmentSection.tsx` — multi-file genérico, base64) não servem como estão para galeria de produto (múltiplas imagens retangulares) — servem como referência de padrão de picker/preview/validação, não para reaproveitamento direto.
- Nenhuma rota de upload existente no projeto valida mimetype no backend hoje (só no frontend) — para uma rota pública-facing isso precisa ser tratado como requisito desta feature, não herdado como está.
- A rota pública deve filtrar `ativo = true` no backend (na query SQL), nunca apenas no frontend.

## Decisões adicionais tomadas durante o planejamento

- **Query builder**: Drizzle ORM, seguindo o padrão do módulo `futebol` (schema próprio `pgSchema('catalogo')`) e o `AGENT.md`, não o padrão SQL raw legado de `services.ts`.
- **Migration**: escrita manualmente como arquivo `.sql` sequencial em `backend/drizzle/` (ex.: `0026_catalogo_produtos.sql`), seguindo o padrão existente do projeto — sem `drizzle-kit generate` automático (não está configurado no projeto) e **sem execução automática** (fica pendente de confirmação explícita do usuário).
- **SEO da vitrine pública**: como a vitrine é dinâmica por conta (`/catalogo/:accountId`), não entra no script estático `generate-public-route-html.mjs` (que gera HTML fixo por rota fixa). Em vez disso, uma rota Express nova fora de `/api` (ex.: `GET /catalogo/:accountId`) monta um HTML mínimo sob demanda com meta tags dinâmicas (title/description/og:image a partir do primeiro produto ativo da conta) e injeta o mesmo shell React para hidratar — SSR leve, sem acoplar o build ao estado do banco.
- **Testes**: seguir exatamente o padrão existente (`node:test`, funções puras) — testes de regras/validações do catálogo (ex.: normalização de slug/accountId público, validação de preço, validação de tipo/tamanho de imagem) colocados em `backend/src/services/` para o script `test` atual (glob `src/services/*.test.ts`) cobrir sem precisar editar o script. Sem teste de rota HTTP nem de componente React — não há infraestrutura para isso no projeto hoje, e criá-la está fora do escopo desta feature.
