# Plano de Implementação: Migração configuracao.js → src/settings.ts

## Origem

- Arquivo de especificação: `js/configuracao.js`
- Data do planejamento: `2026-06-22`
- Classificação: `frontend-only`

## Resumo

Migrar `js/configuracao.js` (4061 linhas) para `src/settings.ts` em TypeScript, seguindo os padrões estabelecidos nas migrações anteriores (`main.ts`, `income.ts`, `reports.ts`). O arquivo cobre 10 módulos funcionais distintos e exporta ~60 funções para `window.*`.

## Escopo

### Dentro do escopo

- Todos os 10 módulos do arquivo (categorias, cartões, usuários, export/import, tabs, empresas, representantes, sócios, minha conta, column-resizer)
- Renomeação de todas as funções para inglês
- Tipagem de todos os parâmetros, retornos e variáveis de módulo
- Atualização de `src/types/globals.d.ts` com os novos exports
- Manutenção da compatibilidade via `window.*` registrations

### Fora do escopo

- Refatoração de lógica — tradução fiel, sem alterar comportamento
- Telas HTML — Phase 3 planejada separadamente
- `despesas.js` — próxima migração independente

## Leitura de contexto

- `/AGENT.md` — lido
- `js/configuracao.js` — lido integralmente (4061 linhas)
- `src/types/globals.d.ts` — lido (globals já declarados)
- `src/main.ts` — padrões de migração consultados
- `src/income.ts`, `src/reports.ts` — padrões de migração consultados

## Módulos mapeados

| Módulo | Linhas | Descrição |
|---|---|---|
| Estado do módulo + validações | 1–65 | variáveis globais, `formatCardExpiry`, `validateExpiry` |
| Categorias | 66–493 | CRUD de categorias com subcategorias |
| Cartões | 494–1087 | CRUD de cartões de crédito via API |
| Permissões de usuário | 1088–1252 | `canViewUser`, `canEditUser`, etc. |
| Gestão de usuários | 1253–1932 | tabela admin, filtro, edição, bloqueio |
| Export / Import / Limpar | 1933–2915 | exportação JSON/Excel, importação, limpeza |
| Config tabs + Event wiring | 2916–3213 | `setupConfigTabs`, `setupEventListeners`, `initSettings` |
| Empresas | 3214–3379 | CRUD de perfis empresa |
| Representantes | 3380–3541 | CRUD com comissões |
| Sócios | 3543–3659 | CRUD de sócios |
| Minha conta + Alterar senha | 3700–3951 | perfil do usuário, troca de senha, cancelar conta |
| Column resizer (IIFE) | 3953–4061 | redimensionamento de colunas da grade de categorias |

## Impacto por área

### Frontend

- **Arquivo novo**: `src/settings.ts`
- **Arquivo modificado**: `src/types/globals.d.ts` — adição de ~30 declarações `window`
- Todos os 10 módulos migrados com renomeação PT → EN
- Window registrations preservam os nomes PT para compatibilidade com HTML/JS não migrados

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/settings.ts` (novo)
- `src/types/globals.d.ts` (atualização)

## Renomeação de funções (PT → EN)

```
categoriasUsuario           → userCategories
carregarCategoriasLocal     → loadCategoriesLocal
buscarCategoriasAPI         → fetchCategoriesAPI
atualizarDropdowns          → updateDropdowns
adicionarCategoria          → addCategory
atualizarListaCategorias    → updateCategoryList
editarCategoria             → editCategory
toggleAtivoCategoria        → toggleCategoryActive
removerCategoria            → removeCategory
salvarEdicaoCategoria       → saveCategoryEdit

carregarCartoesLocal        → loadCardsLocal
criarCartaoAPI              → createCardAPI
atualizarCartaoAPI          → updateCardAPI
excluirCartaoAPI            → deleteCardAPI
salvarCartoes               → saveCards
recarregarEAtualizarCartoes → reloadAndUpdateCards
atualizarOpcoesCartoes      → updateCardOptions
popularSelectPerfilCartao   → populateProfileCardSelect
renderizarListaCartoes      → renderCardList
adicionarCartao             → addCard
abrirModalEditarCartao      → openEditCardModal
salvarEdicaoCartao          → saveCardEdit
excluirCartao               → deleteCard
fecharModalCartao           → closeCardModal

podeVisualizarUsuario       → canViewUser
podeEditarUsuario           → canEditUser
podeExcluirUsuario          → canDeleteUser
podeBloquearUsuario         → canBlockUser
podeCriarUsuario            → canCreateUser
podeLimparLogs              → canClearLogs
obterTiposPermitidos        → getAllowedTypes

obterTipoUsuarioAtual       → getCurrentUserType
ajustarVisibilidadeElementos → adjustElementVisibility
filtrarUsuarios             → filterUsers
_executarFiltrarUsuarios    → _executeFilterUsers
renderizarUsuarios          → renderUsers
_renderProximoLoteUsuarios  → _renderNextUserBatch
criarLinhaUsuario           → createUserRow
alternarBloqueioUsuario     → toggleUserBlock
excluirUsuario              → deleteUser
confirmarExclusaoUsuario    → confirmDeleteUser
abrirModalEditarUsuario     → openEditUserModal
configurarDropdownTipos     → setupTypeDropdown
preencherDadosUsuario       → fillUserData
salvarEdicaoUsuario         → saveUserEdit
garantirUsuarioMaster       → ensureMasterUser

exportarDadosMesAMes        → exportMonthlyData
exportarDados               → exportData
importarDados               → importData
limparDados                 → clearData

onAbaAtivada                → onTabActivated
ativarConfigTab             → activateConfigTab
setupConfigTabs             → setupConfigTabs
setupEventListeners         → setupEventListeners
inicializarConfiguracoes    → initSettings

carregarEmpresas            → loadCompanies
renderizarEmpresas          → renderCompanies
formatarCNPJ                → formatCNPJ
abrirModalNovaEmpresa       → openNewCompanyModal
abrirModalEditarEmpresa     → openEditCompanyModal
salvarEmpresa               → saveCompany
excluirEmpresa              → deleteCompany

carregarRepresentantes      → loadRepresentatives
_renderizarRepresentantes   → _renderRepresentatives
_popularSelectRepresentante → _populateRepresentativeSelect
_abrirFormRepresentante     → _openRepresentativeForm
_salvarRepresentante        → _saveRepresentative
_excluirRepresentante       → _deleteRepresentative
setupRepresentantes         → setupRepresentatives

carregarSocios              → loadPartners
_renderizarSocios           → _renderPartners
_abrirFormSocio             → _openPartnerForm
_salvarSocio                → _savePartner
_excluirSocio               → _deletePartner
setupSocios                 → setupPartners

carregarMinhaConta          → loadMyAccount
_renderizarMinhaConta       → _renderMyAccount
abrirModalEditarMinhaConta  → openEditMyAccountModal
abrirModalAlterarSenha      → openChangePasswordModal
setupMinhaConta             → setupMyAccount
cancelarConta               → cancelAccount
```

## Tipos locais a definir em settings.ts

```typescript
interface CategoryItem {
  id?: number;
  nome: string;
  cor?: string;
  icone?: string;
  parent_id?: number | null;
  parent_nome?: string;
  ativo?: boolean;
  numero?: number;
  [key: string]: unknown;
}

interface CardItem {
  id: number;
  banco: string;
  limite: number;
  validade?: string;
  ativo: boolean;
  numero_cartao?: number;
  [key: string]: unknown;
}

interface UserItem {
  id: number;
  nome: string;
  email: string;
  tipo: string;
  status: string;
  documento?: string;
  [key: string]: unknown;
}

interface CompanyItem {
  id: number;
  nome: string;
  documento?: string;
  razao_social?: string;
  nome_fantasia?: string;
  atividade?: string;
  [key: string]: unknown;
}

interface RepresentativeItem {
  id: number;
  nome: string;
  email?: string;
  telefone?: string;
  comissoes?: CommissionItem[];
  [key: string]: unknown;
}

interface CommissionItem {
  tipo_receita: string;
  percentual: number;
  [key: string]: unknown;
}

interface PartnerItem {
  id: number;
  nome: string;
  percentual: number;
  [key: string]: unknown;
}
```

## Estratégia de implementação

```
1.  Definir tipos locais (CategoryItem, CardItem, UserItem, etc.)
2.  Declarar estado do módulo (userCategories, nextCardId, filteredUsers, etc.)
3.  Migrar validações (formatCardExpiry, validateExpiry)
4.  Migrar módulo categorias (10 funções)
5.  Migrar módulo cartões (18 funções)
6.  Migrar módulo permissões de usuário (7 funções)
7.  Migrar módulo gestão de usuários (14 funções + IntersectionObserver)
8.  Migrar módulo export/import/clear (3 funções grandes)
9.  Migrar config tabs + setupEventListeners + initSettings
10. Migrar módulo empresas (7 funções)
11. Migrar módulo representantes (7 funções)
12. Migrar módulo sócios (7 funções)
13. Migrar minha conta + alterar senha (6 funções + DOMContentLoaded)
14. Migrar column resizer (IIFE → função chamada no DOMContentLoaded)
15. Bloco window registrations (todos os ~60 exports)
16. Atualizar globals.d.ts com novos tipos
17. npx tsc --noEmit — zero erros obrigatório
```

## Regras de negócio identificadas

- `canViewUser` / `canEditUser` / etc. — hierarquia: master > admin > padrao
- Admin não pode visualizar/editar usuários master
- Master pode criar qualquer tipo; admin só cria padrao
- Cartões têm IDs únicos gerados localmente (`nextCardId`) antes de persistir na API
- Categorias suportam subcategorias (`parent_id`) mas apenas 1 nível de profundidade
- Exportação mês-a-mês gera arquivo JSON com todos os dados financeiros por mês/ano
- Importação faz merge com dados existentes (não sobrescreve tudo)
- `filtrarUsuarios` usa debounce 300ms + AbortController (padrão já documentado em memory)

## Regras multi-tenant e segurança

Este arquivo é frontend-only. As regras de tenant são validadas no backend. No frontend:
- Token sempre lido de `sessionStorage.getItem('token')` (nunca hardcoded)
- `usuario.id` sempre derivado de `window.usuarioDataManager.getUsuarioAtual()`
- Nenhuma lógica de tenant cross-user no frontend

## Validações necessárias

- `formatCardExpiry`: aceita apenas MM/YYYY, máx 7 chars
- `validateExpiry`: mês 1–12, ano >= atual, data futura
- CNPJ: 14 dígitos numéricos após limpeza
- Senha: mínimo 6 caracteres para criação, 8 para alteração
- Percentual de sócio: 0.01 a 100

## Testes necessários

### Frontend
- `npx tsc --noEmit` — zero erros TypeScript
- Verificar no browser: carregar categorias, adicionar cartão, filtrar usuários

### Backend
Sem impacto esperado.

### E2E
Sem escopo neste plano.

## Comandos de validação sugeridos

```bash
cd "c:\Users\rodri\Music\sistema financas"
npx tsc --noEmit
```

## Riscos e pontos de atenção

| Risco | Mitigação |
|---|---|
| `window.cartoesUsuario` já declarado em `main.ts` — possível conflito de tipo | `settings.ts` sincroniza com a mesma referência; não redeclara o tipo, apenas escreve nela |
| `categoriasUsuario` consumido por `despesas.js` não migrado | Manter registro em `window.categoriasUsuario` idêntico ao original |
| IIFE do column resizer usa closures de variáveis locais | Converter para função `initColumnResizer()` com variáveis locais internas |
| `_usuariosObserver` (IntersectionObserver) precisa de tipagem | `IntersectionObserver` é nativo nos tipos DOM — sem problema |
| Export Excel (~400 linhas) usa DOM manipulation intensa | Migrar fielmente sem refatorar lógica |
| Arquivo tem 4061 linhas — maior migração individual | Seguir a ordem dos 17 passos para manter consistência |

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- `src/settings.ts` criado com zero erros TypeScript (`npx tsc --noEmit`)
- Todos os ~60 `window.*` exports registrados e tipados em `globals.d.ts`
- Nomes das funções todos em inglês
- Comportamento idêntico ao `js/configuracao.js` original

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations sem confirmação explícita.
- Seguir `/AGENT.md`.
- Não usar `any` — usar `unknown` com cast duplo `as unknown as T` quando necessário.
- Manter `window.*` registrations com nomes PT para retrocompatibilidade com HTML não migrado.
- `window.cartoesUsuario` já é tipado em `globals.d.ts` como `unknown[]` — não redeclarar o tipo.
- Seguir a ordem dos 17 passos da estratégia de implementação.
- Padrão de guard: `typeof window.fn === 'function'` para chamar funções opcionais de outros módulos.

**Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.**
