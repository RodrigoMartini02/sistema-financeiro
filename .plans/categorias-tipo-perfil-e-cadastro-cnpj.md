# Plano de Implementação: Categorias por tipo de perfil (PF/PJ) + autocadastro por CNPJ + ícone do assistente flutuante

## Origem

- Arquivo de especificação: nenhum `.md` de feature fornecido — plano originado de pedido direto do usuário e investigação de código/banco de produção.
- Data do planejamento: `2026-08-18`
- Classificação: `fullstack + database`

## Resumo

Três itens sem relação técnica entre si, empacotados neste plano a pedido do usuário para implementação em sequência num único arquivo:

**1. Corrigir modelo de categorias PF/PJ** — retrabalho de um plano anterior (`.plans/separar-categorias-pf-pj.md`) que foi parcialmente implementado (não commitado, não enviado a produção, migration não executada) seguindo um modelo errado: categoria vinculada a um `perfil_id` específico, fazendo cada empresa ter sua própria lista isolada. O modelo correto, esclarecido pelo usuário: categorias PF pertencem à pessoa física (uma lista só, sempre); categorias PJ são **compartilhadas entre todas as empresas** do mesmo usuário (não uma lista por empresa individual).

**2. Autocadastro por CNPJ** — o formulário público de "Criar conta" já rotula o campo como "CPF ou CNPJ", mas o backend rejeita qualquer CNPJ com a mensagem "Only CPF is allowed for self-registration. To register a company, contact the admin." — uma inconsistência real entre UI e comportamento. Este plano libera o autocadastro por CNPJ, criando automaticamente um perfil `empresa` (com as categorias padrão de empresa, já usando o modelo corrigido) em vez do perfil pessoal padrão. Confirmado com o usuário: sem necessidade de aprovação manual, liberação direta.

**3. Ícone do assistente financeiro no botão flutuante** — o botão flutuante que abre o assistente (`FinancialAssistant.tsx`) hoje usa um ícone genérico do lucide-react (`MessageCircleMore`), enquanto o cabeçalho do chat já aberto usa a imagem real do assistente (`/icons/assistente-perfil.webp`). Este item aplica a mesma imagem no botão flutuante, dando identidade visual consistente. Confirmado com o usuário: reaproveitar a imagem já em uso (`assistente-perfil.webp`), não o arquivo solto `icons/perfilassistente.png` (não commitado, não referenciado em nenhum lugar do código).

## Escopo

### Dentro do escopo

**Categorias por tipo de perfil:**
- Reverter as mudanças de código já feitas (não commitadas) na branch `feat/R/categorias-pf-pj`, que seguiam o modelo errado (`perfil_id` individual).
- Nova coluna `categorias.tipo` (`'pessoal' | 'empresa'`, nullable — `NULL` continua significando "legado, cai no pessoal por fallback").
- Nova constraint de unicidade: `(usuario_id, LOWER(nome), COALESCE(tipo, 'pessoal'))`, substituindo a constraint real confirmada em produção (`categorias_nome_usuario_unique`).
- A coluna `categorias.perfil_id` (descoberta já existente em produção, 100% `NULL`, fora de controle de migrations versionadas) não é removida neste plano — fica sem uso funcional, documentada como legado.
- Backend: `categories.ts` (`GET /`, `POST /`) e o endpoint duplicado em `expenses.ts` (`GET /categories`) resolvem o `tipo` do perfil ativo (a partir do `perfil_id` recebido, consultando `perfis`) e filtram/gravam categorias por esse `tipo`.
- Backend: `defaultCategories.ts`/`ensureDefaultCategories` grava `tipo` em vez de `perfil_id` ao inserir (mantém a lista revisada de 14 categorias empresa já decidida anteriormente: Fornecedores, Folha de Pagamento, Impostos e Taxas, Aluguel/Condomínio, Pró-labore/Retiradas, Marketing, Tecnologia, Transporte, Contabilidade, Bancário, Seguros, Jurídico/Consultoria, Operacional, Outros).
- Backend: `profiles.ts` reverte a passagem de `created.id`, já que `ensureDefaultCategories` volta a receber `profileType` (`tipo`), não `profileId`.
- Backend: `incomes.ts` (categoria "Comissão" automática) ajustado para considerar `tipo`, não `perfil_id` individual.
- Frontend: `configService.ts` (`saveCategoria`) resolve o `tipo` do perfil ativo e envia isso em vez de `perfil_id`.
- Frontend: `types/config.ts` — `Categoria.tipo?: 'pessoal' | 'empresa' | null` substitui `Categoria.perfil_id`.

**Autocadastro por CNPJ:**
- Backend: `POST /api/auth/register` remove a checagem `cleanDoc.length !== 11` — aceita CPF (11 dígitos) ou CNPJ (14 dígitos), ambos já validados por `validateDocument` (que já implementa dígito verificador para os dois formatos).
- Backend: ao registrar com CNPJ, cria o perfil como `type: 'empresa'` (em vez de sempre `'pessoal'`), com `name` vindo de um campo de nome fantasia do formulário, e dispara `ensureDefaultCategories(userId, 'empresa')` (já usando o modelo corrigido de `tipo`).
- Frontend: `LoginPage.tsx` — formulário de registro detecta automaticamente se o documento tem 11 ou 14 dígitos e exibe campo adicional (nome fantasia, obrigatório) quando é CNPJ — reaproveitando o padrão de campos já usado em `PerfisTab.tsx`.
- Frontend: `authService.ts`/`register()` passa a aceitar e enviar o campo extra condicionalmente.

**Ícone do assistente flutuante:**
- Frontend: `src/components/financial-assistant/FinancialAssistant.tsx` — botão flutuante (linhas 592-600) passa a exibir `/icons/assistente-perfil.webp` (mesma imagem já usada no cabeçalho do chat, linha 624) em vez do ícone `MessageCircleMore`, mantendo formato circular (`rounded-full`) e tamanho atual (`h-14 w-14`).

### Fora do escopo

- Migrar/duplicar dados de categorias existentes: confirmado que nenhuma das 175 categorias hoje em produção tem `perfil_id` preenchido (todas `NULL`), então não há necessidade de backfill de conteúdo — só a mudança estrutural (constraint + nova coluna).
- Múltiplas empresas por conta criada via autocadastro CNPJ — o autocadastro cria só o primeiro perfil empresa; empresas adicionais continuam sendo criadas manualmente via `PerfisTab.tsx` (fluxo já existente, autenticado).
- Enquadramento/CNAE obrigatórios no autocadastro — ficam de fora do formulário de registro público; só nome fantasia é exigido, mesmo padrão mínimo de `PerfisTab.tsx` (nome fantasia obrigatório, resto opcional).
- Fluxo de aprovação manual para cadastro de empresas — confirmado com o usuário que não é necessário.
- Qualquer mudança na tela "Assinantes"/métricas discutida anteriormente na sessão — fica para um plano à parte.
- Remover a coluna `categorias.perfil_id` órfã do banco — fica documentada como pendência, não removida aqui.
- Aplicar `icons/perfilassistente.png` (arquivo solto, não commitado) — decisão do usuário foi reaproveitar `assistente-perfil.webp`, já em uso.
- Qualquer outra mudança visual no assistente financeiro (cores, animações, tamanho do botão) além da troca do ícone/imagem.

## Leitura de contexto

- `AGENT.md` da raiz do projeto `sistema financas` — lido. Mesma ressalva de planos anteriores: descreve contexto multi-tenant/multi-prefeitura com RLS que não se aplica a este projeto. Regras genéricas de qualidade seguidas; seções de "prefeitura" ignoradas.
- `CLAUDE.md` da raiz — lido.
- Não existem `frontend/AGENT.md`/`backend/AGENT.md` dedicados neste projeto.
- Arquivos inspecionados nesta sessão: `backend/src/routes/auth.ts` (POST /register, linhas 129-212), `backend/src/middleware/validation.ts` (`validateDocument`, já suporta CPF e CNPJ com dígito verificador), `src/screens/public/LoginPage.tsx` (formulário de registro, linhas 103-129 e 239+), `src/screens/config/PerfisTab.tsx` (campos de perfil empresa, linhas 112-360), `backend/src/db/schema/categories.ts`, `backend/src/routes/categories.ts`, `backend/src/routes/expenses.ts` (endpoint duplicado), `backend/src/services/defaultCategories.ts`, `backend/src/routes/profiles.ts`, `src/services/configService.ts`, `src/services/queryKeys.ts`. Também investigação ao vivo do banco de produção (schema real de `categorias` via consulta a `pg_constraint`/`pg_indexes`/`information_schema`), que confirmou: coluna `perfil_id` já existente (100% NULL, 175 linhas de 18 usuários), constraint real `categorias_nome_usuario_unique`, nenhuma duplicidade de nome dentro do mesmo usuário.

## Impacto por área

### Frontend

- `src/screens/public/LoginPage.tsx`: formulário de registro ganha detecção de CNPJ (14 dígitos) e exibe campo de nome fantasia condicionalmente (obrigatório quando CNPJ).
- `src/services/authService.ts`: `register()` passa a aceitar parâmetro opcional de nome fantasia e enviá-lo ao backend quando presente.
- `src/services/configService.ts`: `saveCategoria` resolve `tipo` do perfil ativo em vez de `perfil_id`.
- `src/types/config.ts`: `Categoria.tipo?: 'pessoal' | 'empresa' | null` substitui `Categoria.perfil_id` (adicionado no plano anterior, a reverter).
- Sem mudança em `CategoriasTab.tsx` além do já necessário — a lista já vem filtrada do backend.
- `PerfisTab.tsx` não muda — continua sendo o único lugar para criar empresas adicionais após o cadastro inicial.
- `src/components/financial-assistant/FinancialAssistant.tsx`: botão flutuante passa a usar `<img src="/icons/assistente-perfil.webp" />` dentro do `<button>` circular, em vez do ícone `MessageCircleMore`.

### Backend

- `backend/src/db/schema/categories.ts`: reverter `profileId` (do plano anterior), adicionar `type: varchar('tipo', { length: 10 })`.
- `backend/src/routes/categories.ts`: `GET /` e `POST /` resolvem `tipo` a partir do `perfil_id` recebido (consulta a `perfis` para achar o `tipo` do perfil ativo), filtram/gravam categorias por `tipo`.
- `backend/src/routes/expenses.ts`: mesmo ajuste no `GET /categories` (dropdown helper duplicado).
- `backend/src/routes/incomes.ts`: categoria "Comissão" automática usa `tipo` em vez de `perfil_id`.
- `backend/src/services/defaultCategories.ts`: `ensureDefaultCategories` volta a gravar `tipo` (reverte a mudança para `profileId` do plano anterior).
- `backend/src/routes/profiles.ts`: reverter a passagem de `created.id`; volta a chamar `ensureDefaultCategories(userId, tipo)` como no código original.
- `backend/src/routes/auth.ts`: `POST /register` remove o bloqueio de CNPJ (`cleanDoc.length !== 11`); cria perfil com `type` correspondente ao documento informado; aceita campo opcional de nome fantasia quando é CNPJ.

### Banco de dados

- Nova coluna `categorias.tipo` (`varchar(10)`, nullable).
- Nova constraint de unicidade: `(usuario_id, LOWER(nome), COALESCE(tipo, 'pessoal'))`, substituindo `categorias_nome_usuario_unique`.
- A coluna `categorias.perfil_id` (já existente em produção, 100% `NULL`, origem desconhecida/fora de migrations) **não é removida** neste plano — mantida como legado sem uso funcional.
- Nenhuma migração de dados de usuários/perfis/categorias necessária (nenhuma categoria existente tem `perfil_id` preenchido hoje).

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual está apontando para produção (confirmado nesta sessão).

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/db/schema/categories.ts`
- `backend/drizzle/0017_categorias_tipo.sql` (nova migration; a migration anterior `0017_categorias_perfil.sql`, gerada mas nunca executada, será descartada/substituída)
- `backend/src/routes/categories.ts`
- `backend/src/routes/expenses.ts`
- `backend/src/routes/incomes.ts`
- `backend/src/routes/profiles.ts`
- `backend/src/routes/auth.ts`
- `backend/src/services/defaultCategories.ts`
- `src/services/configService.ts`
- `src/services/authService.ts`
- `src/types/config.ts`
- `src/screens/public/LoginPage.tsx`
- `src/components/financial-assistant/FinancialAssistant.tsx`

## Estratégia de implementação

1. Reverter os arquivos já modificados (não commitados) na branch `feat/R/categorias-pf-pj` relacionados ao modelo antigo (`git checkout` nos arquivos específicos listados acima que já foram tocados), e remover `backend/drizzle/0017_categorias_perfil.sql` e os scripts de investigação temporários (`backend/check_*.mjs`).
2. Atualizar `backend/src/db/schema/categories.ts` com `type` (`tipo`) em vez de `profileId`.
3. Gerar nova migration `0017_categorias_tipo.sql` (não executar): trocar a constraint de unicidade real (`categorias_nome_usuario_unique`), adicionar coluna `tipo`.
4. Atualizar `defaultCategories.ts`: `ensureDefaultCategories` volta a usar `profileType` como parâmetro (grava em `tipo`).
5. Atualizar `profiles.ts`: reverter a passagem de `created.id`.
6. Atualizar `categories.ts`, `expenses.ts`, `incomes.ts`: resolver `tipo` a partir de `perfil_id` recebido, filtrar/gravar por `tipo`.
7. Atualizar `configService.ts`, `types/config.ts` no frontend.
8. Backend: `auth.ts` — remover bloqueio de CNPJ, aceitar campo de nome fantasia, criar perfil com `type` correto conforme o documento.
9. Frontend: `LoginPage.tsx` — detecção de CNPJ e campo condicional; `authService.ts` — enviar campo extra.
10. `FinancialAssistant.tsx`: trocar o ícone `MessageCircleMore` do botão flutuante pela imagem `/icons/assistente-perfil.webp`.
11. Rodar build de frontend e backend.
12. Parar antes de aplicar a migration — pedir confirmação explícita do usuário.
13. Teste manual: cadastrar conta nova com CPF (perfil pessoal, categorias PF); cadastrar conta nova com CNPJ (perfil empresa, categorias PJ); criar segunda empresa via `PerfisTab.tsx` e confirmar que ela vê as mesmas categorias PJ da primeira; criar categoria nova em cada tipo e confirmar isolamento; conferir visualmente o botão flutuante do assistente com a nova imagem.

## Regras de negócio identificadas

- Categoria PF pertence à pessoa física do usuário — sempre a mesma lista, independente de qual perfil está ativo (quando o pessoal está ativo).
- Categoria PJ é compartilhada entre todas as empresas do mesmo usuário — não há segmentação por empresa individual.
- Autocadastro aceita CPF (cria perfil pessoal) ou CNPJ (cria perfil empresa) — o tipo do primeiro perfil é determinado pelo documento informado no cadastro, sem necessidade de aprovação manual.
- Novas empresas adicionais (segunda, terceira...) continuam sendo criadas manualmente após o login, via `PerfisTab.tsx` — não fazem parte do fluxo de autocadastro.
- O botão flutuante do assistente financeiro deve exibir a imagem de identidade do assistente, dando consistência visual com o cabeçalho do chat já aberto.

## Regras multi-tenant e segurança

Não aplicável — projeto não é multi-tenant. Validar que o `perfil_id` usado para resolver `tipo` em `categories.ts`/`expenses.ts` sempre pertence ao `usuario_id` autenticado (mesma checagem já usada em `cartoes`/`categorias` hoje).

## Validações necessárias

- `documento` no `POST /register`: continua validado por `validateDocument` (CPF ou CNPJ com dígito verificador correto) — só a regra de negócio adicional (`length !== 11`) é removida.
- Nome fantasia obrigatório quando o cadastro é feito com CNPJ.
- Duplicidade de nome de categoria passa a ser verificada por `(usuario_id, nome, tipo)`.

## Testes necessários

### Frontend

- Formulário de registro mostra campo de nome fantasia quando o documento tem 14 dígitos (CNPJ), some quando volta a ter 11 (CPF).
- `CategoriasTab.tsx` mostra a lista correta conforme o tipo do perfil ativo.
- Botão flutuante do assistente exibe a imagem `assistente-perfil.webp` corretamente enquadrada no círculo, sem distorção.

### Backend

- `POST /register` com CNPJ válido cria perfil `type: 'empresa'` com nome vindo do campo de nome fantasia.
- `POST /register` com CNPJ inválido (dígito verificador errado) continua sendo rejeitado.
- `GET /categories?perfil_id=X` onde `X` é uma empresa retorna as categorias `tipo='empresa'` do usuário, não uma lista vazia nem a lista pessoal.
- Duas empresas diferentes do mesmo usuário veem exatamente a mesma lista de categorias PJ.

### E2E

- Cadastro novo com CNPJ → perfil empresa criado → categorias PJ (14 itens) visíveis.
- Criar segunda empresa manualmente → confirma que categorias PJ já criadas aparecem também nela (compartilhadas, não duplicadas).

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
npm --prefix "sistema financas/backend" run build
```

## Riscos e pontos de atenção

- **Ambiente é produção** (confirmado nesta sessão via consulta direta ao schema) — migration só após confirmação explícita do usuário.
- **Retrabalho**: este plano substitui o anterior (`.plans/separar-categorias-pf-pj.md`) — o código já escrito (não commitado) precisa ser revertido antes de reimplementar, para não deixar os dois modelos coexistindo.
- **Coluna `perfil_id` órfã em `categorias`**: já existe em produção sem explicação registrada em migrations (descoberta durante a sessão anterior), e este plano a deixa sem uso funcional (não remove). Vale investigar depois, fora deste escopo, de onde ela veio.
- **Mudança de UX no autocadastro**: usuários que hoje tentam se cadastrar com CNPJ e recebem erro passam a conseguir — confirmado que é a correção pretendida, sem necessidade de fluxo de aprovação adicional.
- **Item do ícone do assistente é independente dos outros dois** — risco técnico mínimo (troca de um elemento visual em um único arquivo), pode ser implementado e validado isoladamente sem depender da conclusão dos itens 1 e 2.

## Perguntas em aberto

`Nenhuma pergunta em aberto identificada.` (Decisão sobre aprovação manual de CNPJ já resolvida: não é necessária.)

## Critérios de aceite do plano

- Categoria PJ compartilhada entre todas as empresas de um usuário; categoria PF exclusiva da pessoa física.
- Autocadastro aceita CPF ou CNPJ, criando o tipo de perfil correspondente, sem aprovação manual.
- Nenhuma migration executada sem confirmação explícita.
- Botão flutuante do assistente financeiro exibe a imagem de identidade visual em vez do ícone genérico.
- Build de frontend e backend passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Reverter o trabalho do plano anterior (`.plans/separar-categorias-pf-pj.md`) antes de começar — arquivos e migration listados no passo 1 da "Estratégia de implementação".
- Gerar a migration mas não executá-la.
- Confirmar o nome real da constraint de unicidade em produção antes de escrever o `DROP CONSTRAINT` (já confirmado nesta sessão como `categorias_nome_usuario_unique`, mas reconfirmar não custa nada dado o histórico de drift de schema neste projeto).
- Manter alterações restritas aos arquivos listados.
