# Plano de Implementação: Módulo de Clientes, Contratos e Receitas Previstas

## Origem

- Data do planejamento: `2026-07-04`
- Classificação: `frontend + backend + database`

## Resumo

Criar módulo de Clientes e Contratos integrado ao sistema financeiro. Cada contrato tem módulos com valores mensais, serviços técnicos e data de vencimento. Ao ativar um módulo como `faturando`, o sistema gera automaticamente receitas previstas na tabela `receitas` com `status = 'prevista'` mês a mês até o vencimento. O usuário dá baixa individualmente quando o pagamento entra. Reajuste atualiza as previstas futuras; aditivo encerra o contrato anterior e cria novo com novas previstas.

## Escopo

### Dentro do escopo

- Tabelas novas: `clientes`, `contratos`, `modulos_contrato`, `servicos_tecnicos_contrato`, `consumo_horas`
- Coluna `contrato_id` em `receitas` (FK opcional)
- Status `'prevista'` na tabela `receitas` (coluna já existe)
- Endpoints CRUD: `/api/clientes`, `/api/contratos`, `/api/modulos-contrato`, `/api/servicos-tecnicos`
- Endpoint `POST /api/contratos/:id/gerar-previstas` — gera receitas previstas
- Endpoint `PUT /api/contratos/:id/aditivo` — encerra contrato atual + gera novo
- Endpoint `PUT /api/contratos/:id/encerrar` — encerra contrato e cancela previstas futuras
- Endpoint `PUT /api/receitas/:id/receber` — marca prevista como recebida (status = 'ativa')
- Nova aba "Clientes" em Configurações (AppShell + ConfigScreen)
- Tela cliente: lista → detalhe com 4 sub-abas (Contrato, Módulos, Serviços Técnicos, Observações)
- ReceitasScreen: previstas com estilo diferenciado + botão "Receber" + KPIs Recebido/Previsto/Em atraso

### Fora do escopo

- Geração automática de NF/boleto
- Integração bancária
- Relatório PDF de contrato
- Portal do cliente
- Notificações automáticas de vencimento

## Leitura de contexto

- `/AGENT.md` — regras de multi-tenant, Drizzle, TypeScript, migrations
- `backend/src/routes/incomes.ts` — padrão existente (pool.query, authenticate, req.user!.id)
- `backend/src/routes/representatives.ts` — padrão de CRUD simples
- `backend/src/server.ts` — registro de rotas com aliases PT
- `backend/config/database.js` — sistema de migrations via `executarMigracoes()`
- `src/layout/AppShell.tsx` — ConfigTab, CONFIG_SUBS
- `src/screens/config/ConfigScreen.tsx` — renderização de abas
- `src/screens/config/RepresentantesTab.tsx` — padrão de tab de configuração
- `src/services/queryKeys.ts` — query keys centralizadas
- `src/types/finance.ts` — tipos Income, Expense, etc.
- `src/services/financeService.ts` — mapeamento API → tipos

## Impacto por área

### Backend

**Novos arquivos em `backend/src/routes/`:**

| Arquivo | Endpoints |
|---|---|
| `clients.ts` | GET `/api/clientes`, POST, PUT `/:id`, DELETE `/:id` |
| `contracts.ts` | GET `/api/contratos`, POST, PUT `/:id`, PUT `/:id/aditivo`, PUT `/:id/encerrar`, POST `/:id/gerar-previstas` |
| `contract-modules.ts` | GET `/api/modulos-contrato?contrato_id=X`, POST, PUT `/:id`, DELETE `/:id` |
| `technical-services.ts` | GET `/api/servicos-tecnicos?contrato_id=X`, POST, PUT `/:id` |

**Modificar `backend/src/routes/incomes.ts`:**
- Adicionar `PUT /:id/receber` — atualiza `status = 'ativa'`, registra `data_recebimento` e `valor_recebido`
- GET já retorna todas as receitas; filtrar por status no frontend conforme necessário

**Modificar `backend/src/server.ts`:**
- Registrar as 4 novas rotas com aliases PT (`/api/clientes`, `/api/contratos`, `/api/modulos-contrato`, `/api/servicos-tecnicos`)

**Lógica de geração de previstas (`POST /contratos/:id/gerar-previstas`):**
1. Calcular valor mensal = soma de `modulos_contrato.valor_mensal` onde `faturando = true`
2. Iterar de `data_inicio_faturamento` até `vencimento` mês a mês
3. Para cada mês: `INSERT INTO receitas (usuario_id, descricao, valor, data_recebimento, mes, ano, status, contrato_id, ...)`
4. `status = 'prevista'`, `descricao = "Mensalidade - {nome_cliente}"`, `data_recebimento = dia 1 do mês`

**Lógica de aditivo (`PUT /contratos/:id/aditivo`):**
1. Cancela previstas futuras do contrato atual: `UPDATE receitas SET status = 'cancelada' WHERE contrato_id = $1 AND status = 'prevista' AND data_recebimento >= NOW()`
2. Marca contrato como encerrado: `UPDATE contratos SET status = 'encerrado'`
3. Cria novo contrato com mesmos dados + novo número de aditivo + nova data de vencimento
4. Copia módulos do contrato anterior
5. Gera novas previstas

**Lógica de reajuste:**
- Quando `PUT /modulos-contrato/:id` atualiza `valor_mensal`:
  - Recalcular valor total mensal do contrato
  - `UPDATE receitas SET valor = {novo_total} WHERE contrato_id = $1 AND status = 'prevista' AND data_recebimento >= NOW()`

### Frontend

**Novos arquivos:**

| Arquivo | Responsabilidade |
|---|---|
| `src/services/clientesService.ts` | fetch/save clientes, contratos, módulos, serviços técnicos |
| `src/screens/config/ClientesTab.tsx` | lista de clientes com card resumo + botão novo |
| `src/screens/config/ClienteDetail.tsx` | detalhe do cliente com 4 sub-abas |

**Modificações:**

- `src/layout/AppShell.tsx`:
  - `ConfigTab`: adicionar `'clientes'`
  - `CONFIG_SUBS`: adicionar `{ id: 'clientes', label: 'Clientes', icon: Building2 }`

- `src/screens/config/ConfigScreen.tsx`:
  - `TAB_TITLES`: adicionar `clientes: 'Clientes'`
  - Renderizar `<ClientesTab />` quando `activeTab === 'clientes'`

- `src/types/finance.ts`:
  - `Income.status`: incluir `'prevista'`
  - Novo interface `ClienteContrato` (ou em `clientesService.ts`)

- `src/services/financeService.ts`:
  - `incomeFromApi`: mapear `status = 'prevista'`

- `src/services/queryKeys.ts`:
  - Adicionar: `clientes`, `contratos`, `modulosContrato`, `servicosTecnicos`

- `src/screens/receitas/ReceitasScreen.tsx`:
  - KPIs separados: **Recebido** (status ativa) | **Previsto** (status prevista) | **Em atraso** (prevista + data passada)
  - Linha com `status = 'prevista'`: fundo diferenciado (ex: `bg-blue-50 border-l-2 border-blue-300`), badge "Prevista" ou "Em atraso"
  - Botão "Receber" (ícone Check) em vez de "Cancelar" para previstas
  - Ao clicar Receber: modal simples para confirmar valor e data

### Banco de dados

```sql
-- Todas as migrations são idempotentes via IF NOT EXISTS
-- Adicionadas em database.js executarMigracoes()

CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
  nome VARCHAR(200) NOT NULL,
  codigo VARCHAR(50),
  tipo_empresa VARCHAR(50),
  cnpj VARCHAR(20),
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contratos (
  id SERIAL PRIMARY KEY,
  usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id INT REFERENCES clientes(id),
  numero VARCHAR(50),
  data_assinatura DATE,
  vencimento DATE NOT NULL,
  num_aditivo INT DEFAULT 0,
  data_aditivo DATE,
  ajuste VARCHAR(50) DEFAULT 'NADA CONSTA',
  status VARCHAR(20) DEFAULT 'ativo',
  data_inicio_faturamento DATE,
  observacoes TEXT,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS modulos_contrato (
  id SERIAL PRIMARY KEY,
  contrato_id INT REFERENCES contratos(id) ON DELETE CASCADE,
  usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
  nome VARCHAR(200) NOT NULL,
  valor_mensal NUMERIC(12,2) NOT NULL DEFAULT 0,
  implantado BOOLEAN DEFAULT FALSE,
  faturando BOOLEAN DEFAULT FALSE,
  data_inicio_faturamento DATE
);

CREATE TABLE IF NOT EXISTS servicos_tecnicos_contrato (
  id SERIAL PRIMARY KEY,
  contrato_id INT REFERENCES contratos(id) ON DELETE CASCADE,
  usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,
  valor_hora NUMERIC(10,2) DEFAULT 0,
  qtde_contratada NUMERIC(10,2) DEFAULT 0,
  qtde_consumida NUMERIC(10,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS consumo_horas (
  id SERIAL PRIMARY KEY,
  contrato_id INT REFERENCES contratos(id) ON DELETE CASCADE,
  usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,
  data DATE NOT NULL,
  qtde NUMERIC(10,2) NOT NULL,
  descricao TEXT,
  criado_em TIMESTAMP DEFAULT NOW()
);

-- Coluna contrato_id em receitas
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS contrato_id INT REFERENCES contratos(id);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_contratos_usuario ON contratos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_contratos_cliente ON contratos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_modulos_contrato ON modulos_contrato(contrato_id);
CREATE INDEX IF NOT EXISTS idx_receitas_contrato ON receitas(contrato_id) WHERE contrato_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_receitas_status ON receitas(usuario_id, status);
```

**Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.**

### Infra/Deploy

Sem impacto. Migrations adicionadas ao sistema existente em `database.js`.

## Arquivos provavelmente afetados

**Backend:**
- `backend/config/database.js` — migrations das 5 tabelas + coluna contrato_id
- `backend/src/server.ts` — registrar 4 novas rotas
- `backend/src/routes/clients.ts` *(novo)*
- `backend/src/routes/contracts.ts` *(novo)*
- `backend/src/routes/contract-modules.ts` *(novo)*
- `backend/src/routes/technical-services.ts` *(novo)*
- `backend/src/routes/incomes.ts` — endpoint PUT /:id/receber

**Frontend:**
- `src/layout/AppShell.tsx`
- `src/screens/config/ConfigScreen.tsx`
- `src/screens/config/ClientesTab.tsx` *(novo)*
- `src/screens/config/ClienteDetail.tsx` *(novo)*
- `src/services/clientesService.ts` *(novo)*
- `src/services/queryKeys.ts`
- `src/types/finance.ts`
- `src/services/financeService.ts`
- `src/screens/receitas/ReceitasScreen.tsx`

## Estratégia de implementação

```
Etapa 1 — Migrations (database.js)
  → Adicionar 5 tabelas + coluna contrato_id em receitas
  → PARAR e pedir confirmação antes de executar

Etapa 2 — Backend: novos routes TypeScript
  → clients.ts (CRUD clientes)
  → contracts.ts (CRUD contratos + gerar-previstas + aditivo + encerrar)
  → contract-modules.ts (CRUD módulos)
  → technical-services.ts (CRUD serviços técnicos)
  → incomes.ts: adicionar PUT /:id/receber
  → server.ts: registrar rotas

Etapa 3 — Frontend: tipos e serviços
  → finance.ts: status 'prevista'
  → financeService.ts: mapear prevista
  → queryKeys.ts: clientes, contratos, modulos
  → clientesService.ts: todos os fetches

Etapa 4 — Frontend: UI de Configurações
  → AppShell.tsx: tab clientes
  → ConfigScreen.tsx: renderizar ClientesTab
  → ClientesTab.tsx: lista de clientes
  → ClienteDetail.tsx: 4 sub-abas

Etapa 5 — Frontend: ReceitasScreen
  → KPIs separados (recebido / previsto / em atraso)
  → Estilo diferenciado para previstas
  → Botão "Receber" + modal de confirmação

Etapa 6 — Validação
  → npx tsc --noEmit (backend)
  → npm run build (frontend)
```

## Regras de negócio identificadas

1. Receitas previstas criadas com `status = 'prevista'` e `contrato_id` — uma por mês de `data_inicio_faturamento` até `vencimento`
2. Valor por mês = soma de `modulos_contrato.valor_mensal` onde `faturando = true`
3. Reajuste: atualiza `valor` das receitas com `status = 'prevista' AND data_recebimento >= CURRENT_DATE` do mesmo contrato
4. Aditivo: marca contrato como `encerrado` → cancela previstas futuras → cria novo contrato → gera novas previstas
5. Receber: `PUT /receitas/:id/receber` → `status = 'ativa'`, salva data e valor real
6. Em atraso: prevista com `data_recebimento < CURRENT_DATE AND status = 'prevista'`
7. Encerrar contrato sem aditivo: apenas cancela previstas futuras e marca `status = 'encerrado'`

## Regras de segurança

- Toda query filtra por `usuario_id` derivado do JWT (`req.user!.id`) — nunca do body/query
- IDs numéricos: sempre validar `WHERE id = $X AND usuario_id = $Y`
- Sem vazamento entre usuários: clientes, contratos e módulos são isolados por `usuario_id`

## Validações necessárias

- `clientes.nome`: obrigatório, não vazio
- `contratos.vencimento`: obrigatório, data válida
- `contratos.data_inicio_faturamento`: obrigatório para geração de previstas, deve ser <= vencimento
- `modulos_contrato.valor_mensal`: >= 0
- `servicos_tecnicos_contrato.tipo`: enum (presencial, remoto, desenvolvimento, estada, deslocamento)
- `PUT /receitas/:id/receber`: só pode ser chamado se receita tem `status = 'prevista'`

## Comandos de validação sugeridos

```bash
cd backend && npx tsc --noEmit
npm run build
```

## Riscos e pontos de atenção

- Contrato longo (3 anos) gera 36 receitas de uma vez — aceitável como operação única
- Reajuste deve filtrar rigorosamente por `status = 'prevista' AND data >= CURRENT_DATE` para não alterar histórico
- Aditivo é operação destrutiva suave (cancela previstas) — deve ter confirmação no frontend
- Coluna `contrato_id` em receitas é NULL para receitas comuns — FK opcional, sem quebrar dados existentes
- Ambiente pode ser produção — confirmar antes de executar migrations

## Critérios de aceite

- [ ] Cadastrar cliente e contrato sem erro
- [ ] Ativar módulo como `faturando` e gerar previstas mês a mês até vencimento
- [ ] ReceitasScreen exibe previstas com badge e botão "Receber"
- [ ] Receber prevista → muda para status ativa → some o badge
- [ ] Reajustar valor do módulo → previstas futuras atualizam automaticamente
- [ ] Aditivo → contrato anterior encerrado → previstas futuras canceladas → novo contrato com novas previstas
- [ ] KPIs separados: Recebido / Previsto / Em atraso
- [ ] Build TypeScript sem erros

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Padrão de route: `pool.query()`, `authenticate`, `req.user!.id` (ver `incomes.ts` e `representatives.ts`)
- Migrations adicionadas em `database.js executarMigracoes()` como blocos `IF NOT EXISTS`
- NUNCA executar migrations sem confirmação explícita do usuário
- Seguir `/AGENT.md`: queries filtradas por usuario_id, sem `any`, sem catch silencioso
- Não alterar `.env`
- Não fazer push sem confirmação
