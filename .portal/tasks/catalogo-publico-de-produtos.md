# Task: Criar catálogo público de produtos com gestão interna

## Contexto

O `sistema financas` é um sistema financeiro multi-conta (não multi-tenant/multi-prefeitura — isolamento é por `usuario_id`/conta autenticada, não por organização). O backend é Express + TypeScript + PostgreSQL (via `pg`/Drizzle conforme o módulo), com rotas protegidas por `authenticate` + `requireActivePlan` em `backend/src/server.ts`, e um padrão já estabelecido de módulos adicionais isolados dentro do mesmo backend (ex.: `backend/src/modules/futebol`, montado em `/api/futebol`).

O projeto já expõe páginas públicas sem autenticação (ex.: `src/screens/public/FuncionalidadesPage.tsx`, `SobrePage.tsx`) servidas pelo mesmo frontend Vite.

Existe hoje uma tabela/rota `servicos` (`backend/src/routes/services.ts`, `/api/servicos`) — mas ela é usada no contexto de contratos/consultoria (campos como `nome`, `valor_mensal_padrao`, sem suporte a imagens ou exibição pública) e não deve ser reaproveitada diretamente para este catálogo, que é de natureza diferente (produtos com fotos, preço e descrição, voltados à venda pública).

## Problema

Não existe hoje nenhuma forma de cadastrar produtos (com imagens, valores e informações descritivas) nem de expor esse catálogo publicamente para clientes. Qualquer divulgação de produtos hoje dependeria de processo manual fora do sistema.

## Objetivo

Criar duas frentes conectadas pelo mesmo catálogo de dados:

1. Uma tela de gestão interna (atrás de login, no mesmo padrão das telas administrativas já existentes) para cadastrar/editar/remover produtos, subir imagens e definir valores.
2. Uma página pública (sem autenticação) que exibe esse catálogo para clientes, no formato de uma vitrine — com fotos, preço, nome e descrição, similar ao que se vê em sites de e-commerce simples.

## Decisão Técnica Desejada

A decisão de arquitetura (novo módulo dentro do backend unificado do `sistema financas` vs. projeto totalmente separado) ainda não foi fechada pelo usuário — ver "Perguntas Para o Planejamento". A intenção expressa até aqui é reaproveitar o padrão já usado no projeto (tela de gestão interna semelhante às existentes em `src/screens/config/`, e página pública semelhante às já existentes em `src/screens/public/`), evitando criar um sistema paralelo do zero se não for necessário.

Sem carrinho de compra ou checkout definido como necessário nesta fase — o pedido do usuário foi especificamente sobre catálogo/vitrine com dados do produto (fotos, valor, informação), não sobre fluxo de compra completo. Isso deve ser confirmado no planejamento.

## Escopo Funcional

### Dentro do escopo

- Cadastro de produto: nome, descrição, valor, uma ou mais imagens
- Listagem/edição/remoção de produtos na tela de gestão interna
- Upload e armazenamento de imagens de produto
- Página pública somente leitura, sem autenticação, listando os produtos ativos com suas informações e imagens
- Definir se produtos têm algum estado (ativo/inativo, disponível/indisponível) para controlar o que aparece na página pública

### Fora do escopo inicial

- Carrinho de compra, checkout ou pagamento online do produto (o pedido do usuário foi sobre catálogo/vitrine, não sobre fluxo de compra)
- Controle de estoque/quantidade
- Variações de produto (tamanho, cor, etc.)
- Categorização/filtros avançados de produtos na vitrine
- Integração com o módulo de contratos/serviços existente (`servicos`, `contratos`)
- SEO avançado, analytics de visualização, ou qualquer funcionalidade de marketing além da exibição do catálogo

## Requisitos de Frontend

- Nova tela de gestão em `src/screens/config/` (ou local equivalente a definir), seguindo o padrão visual e de componentes já usado em telas administrativas do sistema (ex.: `ServicosTab.tsx`, `ClientesTab.tsx`)
- Formulário de cadastro/edição de produto com upload de imagem(ns), reaproveitando o padrão de upload já existente no projeto (ver `AvatarUploadDialog.tsx` como referência de fluxo de upload de imagem, se aplicável)
- Nova página pública (rota sem autenticação), seguindo o padrão visual das páginas públicas existentes (`src/screens/public/`)
- Tratar estados de loading, erro e vazio (nenhum produto cadastrado) tanto na tela de gestão quanto na página pública
- Usar React Query (`useQuery`/`useMutation`) para todo acesso a dados, com query keys centralizadas em `src/services/queryKeys.ts`

## Requisitos de Backend

- Nova rota/módulo para produtos, seguindo o padrão de autenticação existente: rotas de gestão exigem `authenticate` (e possivelmente `requireActivePlan`, a confirmar), rota pública de listagem não exige autenticação
- Definir onde armazenar as imagens (disco local, bucket externo, ou outro mecanismo já usado no projeto — verificar se já existe padrão de storage de imagem, já que o sistema tem upload de avatar/foto de perfil)
- Toda query de gestão deve filtrar pelo `usuario_id`/conta autenticada, seguindo o padrão de isolamento por usuário já usado em outras rotas do projeto (ex.: `services.ts`)
- Validar payload (nome, valor, formato/tamanho de imagem) no backend, não confiar apenas em validação do frontend

## Requisitos de Banco de Dados

Provável necessidade de nova tabela de produtos (nome, descrição, valor, imagens, status ativo/inativo, referência ao usuário/conta dono do produto) e, dependendo da abordagem de imagens, uma tabela ou coluna para armazenar referências/URLs de imagem.

Nenhuma migration deve ser executada nesta fase — a definição de schema e a migration em si devem ser tratadas no planejamento e só executadas com confirmação explícita do usuário, já que o banco pode estar apontando para produção.

## Requisitos de Segurança e Multi-Tenant

Projeto não é multi-tenant; sem isolamento de tenant/prefeitura a considerar. O isolamento relevante é por usuário/conta autenticada:

- A gestão de produtos deve ser acessível apenas ao usuário dono (mesmo padrão de `usuario_id` usado nas demais rotas autenticadas)
- A página pública deve expor apenas os dados de produto destinados à exibição (nome, descrição, valor, imagem) — nunca dados internos, de conta ou de outros usuários
- Validar que a rota pública não permite nenhuma operação de escrita
- Validar tamanho e tipo de arquivo de imagem no upload para evitar abuso (upload de arquivos não-imagem, arquivos excessivamente grandes)

## Requisitos de Migração ou Compatibilidade

Não há dado legado a migrar — trata-se de funcionalidade nova. Não há impacto esperado em fluxos existentes (contratos, serviços, financeiro), desde que a nova tabela/rota seja isolada e não reaproveite `servicos` sem avaliação explícita no planejamento.

## Requisitos de Testes

### Frontend

- Testar fluxo de cadastro/edição/remoção de produto na tela de gestão, incluindo upload de imagem
- Testar a página pública com catálogo vazio, com produtos ativos e com produtos inativos (verificar que inativos não aparecem)

### Backend

- Testar que a rota de gestão exige autenticação e filtra por usuário/conta corretamente
- Testar que a rota pública não exige autenticação e não retorna dados sensíveis
- Testar validação de payload (nome/valor obrigatórios, formato de imagem)

### E2E

Não aplicável inicialmente — avaliar durante o planejamento se o fluxo público justifica um teste E2E dedicado.

## Arquivos Provavelmente Afetados

### Frontend

- A identificar durante o planejamento. Prováveis candidatos por convenção: novo arquivo em `src/screens/config/` (gestão) e novo arquivo em `src/screens/public/` (vitrine), `src/services/queryKeys.ts`, roteamento público existente (a localizar).

### Backend

- A identificar durante o planejamento. Prováveis candidatos por convenção: nova rota em `backend/src/routes/`, registro em `backend/src/server.ts` (seguindo o padrão de aliases PT/EN já usado), novo service se a complexidade justificar (ver padrão de `backend/src/services/`).

### Banco de Dados

- A identificar durante o planejamento. Provável nova tabela de produtos (e possivelmente uma tabela de imagens, se um produto puder ter múltiplas fotos).

## Critérios de Aceite

- Existe uma tela de gestão interna, atrás de autenticação, onde é possível cadastrar, editar e remover produtos com nome, descrição, valor e imagem(ns).
- Existe uma página pública, sem autenticação, que exibe os produtos ativos com suas informações e imagens.
- Produtos marcados como inativos não aparecem na página pública.
- Nenhum dado sensível (de conta, financeiro ou de outros módulos) é exposto na rota/página pública.
- Toda query de gestão respeita o isolamento por usuário/conta autenticada.
- Nenhuma migration foi executada sem confirmação explícita do usuário.

## Perguntas Para o Planejamento

- O catálogo deve viver dentro do backend/frontend unificado do `sistema financas` (novo módulo, como o `futebol`) ou como projeto separado no workspace?
- Um produto pode ter múltiplas imagens ou apenas uma foto principal?
- Onde as imagens devem ser armazenadas — já existe um mecanismo de storage (disco, S3/bucket, outro serviço) usado hoje para foto de perfil/avatar que deva ser reaproveitado?
- A página pública precisa de uma URL própria (ex.: `/produtos` ou subdomínio) ou deve ficar dentro da navegação pública já existente (ex.: ao lado de "Funcionalidades", "Sobre")?
- Existe necessidade de moeda/formatação de valor específica, ou reaproveita o `formatCurrency` já usado no sistema financeiro?
- Deve haver algum tipo de contato/CTA na vitrine (ex.: WhatsApp, e-mail, formulário) para o cliente agir sobre o produto, já que não há carrinho/checkout nesta fase?
- O cadastro de produto pertence a um único usuário/conta (dono do catálogo) ou deve ser uma entidade única do sistema, sem dono?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `sistema financas/CLAUDE.md` (raiz do subprojeto) e `sistema financas/AGENT.md`; não há `frontend/AGENT.md`/`backend/AGENT.md` dedicados neste subprojeto — considerar isso já registrado.
- Nota importante: o `AGENT.md` atual do `sistema financas` descreve um contexto genérico multi-tenant/multi-prefeitura que **não corresponde à realidade deste projeto** (confirmado por ausência de `tenantId`/`prefeituraId` no schema — isolamento real é por `usuario_id`/conta). Ignorar as seções de multi-tenant/RLS desse arquivo ao planejar esta task; seguir o padrão real de isolamento por usuário já usado em `backend/src/routes/services.ts` e demais rotas autenticadas.
- Inspecione os arquivos citados antes de escrever o plano, especialmente o padrão de upload de imagem existente (avatar/foto de perfil) e o padrão de módulo isolado (`backend/src/modules/futebol`).
- Classifique a implementação como `fullstack` ou `frontend + backend + database`, conforme a investigação confirmar.
- Resolva as perguntas em aberto com o usuário antes de finalizar o plano, especialmente a decisão de módulo unificado vs. projeto separado.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations.
- Gere um plano em `.plans/` (padrão de pasta já usado neste subprojeto) com etapas pequenas, revisáveis e seguras.
