# Plano de Implementação: Catálogo de Serviços + Redesign da aba de Serviços + Horas Técnicas

## Origem

- Data do planejamento: 2026-07-04
- Classificação: `frontend + backend + database`

## Resumo

Três entregas no mesmo contexto de Clientes/Contratos:
1. Catálogo de serviços reutilizáveis (nova aba "Serviços" nas configurações)
2. Aba "Módulos" do cliente redesenhada como "Serviços" — tabela inline com checkboxes e vinculação pelo catálogo
3. Aba "Serv. Técnicos" redesenhada com tabela de saldo de horas (contratado / consumido / saldo final) e Dialog para lançar horas — substituindo o `prompt()` atual

## Decisões confirmadas pelo usuário

- **Dados existentes**: não há nada em `modulos_contrato` para migrar — começo limpo
- **Valor mensal**: override por contrato — catálogo tem o padrão, o vínculo pode sobrescrever
- **Toggle inline**: salvo de forma explícita por linha (botão Salvar aparece quando a linha é modificada)
- **Campos do catálogo**: apenas `nome` e `valor_mensal_padrao`

## Escopo

### Dentro do escopo

- Nova tabela `servicos` no banco (catálogo global por usuário)
- Nova tabela `contratos_servicos` (vínculo servico ↔ contrato com override de valor + flags)
- Nova rota backend `/api/servicos` (CRUD catálogo)
- Nova rota backend `/api/contratos-servicos` (vincular, listar, atualizar, desvincular)
- Nova aba "Serviços" na sidebar (AppShell) + `ServicosTab.tsx` (catálogo)
- Redesign aba "Módulos" → "Serviços" em `ClienteDetail` como tabela com inline edit
- Migração de dados de `modulos_contrato` **não necessária** (tabela sem dados relevantes)
- Geração de previstas deve continuar funcionando — soma de `valor_mensal` dos `contratos_servicos` onde `faturando = true`

- Redesign aba "Serv. Técnicos" com tabela de saldo de horas por tipo (presencial, remoto, desenvolvimento, estada, deslocamento)
- Dialog "Lançar horas" que registra em `consumo_horas` e incrementa `qtde_consumida`
- Endpoint `POST /api/servicos-tecnicos/:id/lancar` para lançamento de horas

### Fora do escopo

- Histórico detalhado de lançamentos de horas (listar `consumo_horas` individualmente)
- Alteração no comportamento de receitas previstas além da nova origem do valor
- Migração da tabela `modulos_contrato` (mantida no banco por compatibilidade, mas sem uso no frontend)

---

## Banco de dados

### Nova tabela: `servicos`

```sql
CREATE TABLE IF NOT EXISTS servicos (
  id                 SERIAL PRIMARY KEY,
  usuario_id         INT REFERENCES usuarios(id) ON DELETE CASCADE,
  nome               VARCHAR(200) NOT NULL,
  valor_mensal_padrao NUMERIC(12,2) NOT NULL DEFAULT 0,
  ativo              BOOLEAN NOT NULL DEFAULT true,
  criado_em          TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_servicos_usuario ON servicos(usuario_id);
```

### Nova tabela: `contratos_servicos`

```sql
CREATE TABLE IF NOT EXISTS contratos_servicos (
  id                      SERIAL PRIMARY KEY,
  contrato_id             INT REFERENCES contratos(id) ON DELETE CASCADE,
  servico_id              INT REFERENCES servicos(id) ON DELETE RESTRICT,
  usuario_id              INT REFERENCES usuarios(id) ON DELETE CASCADE,
  valor_mensal            NUMERIC(12,2) NOT NULL DEFAULT 0,
  implantado              BOOLEAN NOT NULL DEFAULT false,
  faturando               BOOLEAN NOT NULL DEFAULT false,
  data_inicio_faturamento DATE,
  UNIQUE (contrato_id, servico_id)
);
CREATE INDEX IF NOT EXISTS idx_contratos_servicos_contrato ON contratos_servicos(contrato_id);
```

Ambas adicionadas em `executarMigracoes()` em `backend/config/database.js`.

**Migration segura** — ambas são `CREATE TABLE IF NOT EXISTS`, sem risco para dados existentes.

---

## Backend

### `/api/servicos` — `backend/src/routes/services.ts` (novo)

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/` | Lista serviços do usuário (filtra por `ativo` se `?ativo=true`) |
| POST | `/` | Cria serviço (`nome`, `valor_mensal_padrao`) |
| PUT | `/:id` | Atualiza nome/valor |
| DELETE | `/:id` | Desativa (`ativo = false`) ou deleta se sem vínculos |

Todos filtram por `usuario_id = req.user!.id`.

### `/api/contratos-servicos` — `backend/src/routes/contract-services.ts` (novo)

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/?contrato_id=X` | Lista serviços vinculados ao contrato (JOIN com `servicos`) |
| POST | `/` | Vincula serviço a contrato (`contrato_id`, `servico_id`, `valor_mensal`) |
| PUT | `/:id` | Atualiza `valor_mensal`, `implantado`, `faturando`, `data_inicio_faturamento` |
| DELETE | `/:id` | Remove vínculo |

### `backend/src/server.ts`

Importar e registrar as duas novas rotas.

### `backend/src/routes/contracts.ts`

A função `gerarPrevistas` precisa ser ajustada para buscar o valor total de `contratos_servicos WHERE faturando = true` em vez de `modulos_contrato`.

### `backend/src/routes/technical-services.ts` (existente — adicionar endpoint)

Novo endpoint de lançamento de horas:

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/:id/lancar` | Insere em `consumo_horas` + incrementa `qtde_consumida` no serviço |

Payload: `{ data: string, qtde: number, descricao?: string }`

Lógica:
```ts
// 1. Verificar que o servico_tecnico pertence ao usuario
// 2. INSERT INTO consumo_horas (contrato_id, usuario_id, tipo, data, qtde, descricao)
// 3. UPDATE servicos_tecnicos_contrato SET qtde_consumida = qtde_consumida + qtde WHERE id = :id
// 4. Retornar o servico_tecnico atualizado
```

---

## Frontend

### `src/layout/AppShell.tsx`

- Adicionar `'servicos'` ao tipo `ConfigTab`
- Adicionar entrada em `CONFIG_SUBS`:
  ```ts
  { id: 'servicos', label: 'Serviços', icon: Layers } // ou BoxSelect, Grid
  ```

### `src/screens/config/ConfigScreen.tsx`

- `TAB_TITLES['servicos'] = 'Serviços'`
- Renderizar `<ServicosTab />` quando `activeTab === 'servicos'`

### `src/screens/config/ServicosTab.tsx` (novo)

Segue exatamente o padrão de `SociosTab.tsx`:

- `ServicoDialog` — Dialog com `Field`+`Input`, `confirmDelete`
- Lista com `ConfigListRow` (nome + valor padrão + data criação)
- Botão "Novo serviço"

### `src/screens/config/ClienteDetail.tsx`

**Aba "Módulos" renomeada para "Serviços".**

Layout da aba (tabela):

```
┌────────────────────────────────────────────────────────────┐
│ VALOR TOTAL   │   IMPLANTADO   │   FATURANDO               │
├────────────────────────────────────────────────────────────┤
│ Serviços / Produtos           [+ Vincular serviço]         │
├───────────────────┬────────────┬────────────┬──────────────┤
│ Serviço           │   Valor    │ Implantado │  Faturando   │
├───────────────────┼────────────┼────────────┼──────────────┤
│ CRM               │ R$ 500,00  │    [✓]     │    [✓]       │ [Salvar] [X]
│ Suporte           │ R$ 200,00  │    [ ]     │    [✓]       │
└───────────────────────────────────────────────────────────-┘
```

- Checkboxes visíveis inline na tabela
- Quando algum campo da linha é alterado → botões "Salvar" e "✕ Cancelar" aparecem naquela linha
- Salvar envia `PUT /api/contratos-servicos/:id` com os valores da linha
- Cancelar restaura os valores originais
- "Vincular serviço" abre Dialog: dropdown dos serviços do catálogo + campo de valor (pré-preenchido com o padrão)

### `src/services/clientesService.ts`

Adicionar interfaces e funções:
```ts
interface ServicoContrato {
  id: number;
  contratoId: number;
  servicoId: number;
  servicoNome: string;
  valorMensal: number;
  implantado: boolean;
  faturando: boolean;
  dataInicioFaturamento?: string | null;
}

fetchContratosServicos(contratoId: number): Promise<ServicoContrato[]>
vincularServico(contratoId: number, servicoId: number, valorMensal: number): Promise<ServicoContrato>
atualizarServicosContrato(id: number, data: Partial<ServicoContrato>): Promise<ServicoContrato>
desvincularServico(id: number): Promise<void>
```

Novo `servicosService.ts`:
```ts
fetchServicos(): Promise<Servico[]>
saveServico(data, id?): Promise<Servico>
deleteServico(id: number): Promise<void>
```

### `src/screens/config/ClienteDetail.tsx` — aba Serv. Técnicos (redesign)

Layout da aba (tabela):

```
┌──────────────────────────────────────────────────────────────────────┐
│ Tipo               │ Valor/h    │ Contratado │ Consumido │  Saldo    │
├────────────────────┼────────────┼────────────┼───────────┼───────────┤
│ Hora Presencial    │ R$ 150,00  │   20h      │    8h     │   12h ✅  │ [Lançar]
│ Hora Remoto        │ R$ 100,00  │   40h      │   15h     │   25h ✅  │ [Lançar]
│ Desenvolvimento    │ R$ 120,00  │   10h      │    0h     │   10h ✅  │ [Lançar]
│ Estada             │ R$  80,00  │    5h      │    2h     │    3h ✅  │ [Lançar]
│ Deslocamento       │ R$  60,00  │    3h      │    0h     │    3h ✅  │ [Lançar]
└──────────────────────────────────────────────────────────────────────┘
         [+ Adicionar tipo de hora]
```

- Saldo colorido: verde quando positivo, vermelho quando zero ou negativo
- Botão "Lançar" por linha → Dialog com: `data`, `quantidade` (h), `descrição`
- Dialog de lançamento chama `POST /api/servicos-tecnicos/:id/lancar`
- Botão "Adicionar tipo de hora" → Dialog para criar novo tipo no contrato (tipo, valor/hora, qtde contratada)
- Substituir o `prompt()` atual completamente

### `src/services/queryKeys.ts`

```ts
servicos: ['servicos'],
contratosServicos: (contratoId: number) => ['contratos-servicos', contratoId],
```

---

## Arquivos afetados

| Arquivo | Tipo de mudança |
|---|---|
| `backend/config/database.js` | +2 tabelas, +2 índices |
| `backend/src/routes/services.ts` | novo |
| `backend/src/routes/contract-services.ts` | novo |
| `backend/src/routes/contracts.ts` | ajuste em `gerarPrevistas` |
| `backend/src/server.ts` | +2 imports e rotas |
| `src/layout/AppShell.tsx` | +`servicos` em `ConfigTab` e `CONFIG_SUBS` |
| `src/screens/config/ConfigScreen.tsx` | +`ServicosTab` |
| `src/screens/config/ServicosTab.tsx` | novo |
| `src/screens/config/ClienteDetail.tsx` | redesign aba Módulos → Serviços (tabela) + redesign aba Serv. Técnicos |
| `src/services/clientesService.ts` | novas funções para contratos-servicos + lançar horas |
| `src/services/servicosService.ts` | novo |
| `src/services/queryKeys.ts` | +2 chaves |
| `backend/src/routes/technical-services.ts` | +endpoint `/:id/lancar` |

---

## Estratégia de implementação

**Parte 1 — Catálogo + Serviços do contrato**
1. Adicionar as 2 tabelas em `database.js` → executar migration (confirmar antes)
2. Criar `backend/src/routes/services.ts`
3. Criar `backend/src/routes/contract-services.ts`
4. Ajustar `contracts.ts` → `gerarPrevistas` usa `contratos_servicos`
5. Registrar as novas rotas em `server.ts`
6. Criar `src/services/servicosService.ts`
7. Atualizar `src/services/clientesService.ts` (funções de contratos-servicos)
8. Atualizar `src/services/queryKeys.ts`
9. Adicionar aba `servicos` em `AppShell.tsx` e `ConfigScreen.tsx`
10. Criar `ServicosTab.tsx`
11. Redesenhar aba Módulos → Serviços em `ClienteDetail.tsx` (tabela inline)

**Parte 2 — Horas Técnicas**
12. Adicionar endpoint `/:id/lancar` em `technical-services.ts`
13. Adicionar função `lancarHoras(id, data)` em `clientesService.ts`
14. Redesenhar aba Serv. Técnicos em `ClienteDetail.tsx` (tabela + Dialog de lançamento)
15. Build para validar

---

## Riscos

- `gerarPrevistas` hoje lê de `modulos_contrato` — se houver previstas existentes vinculadas a contratos com módulos, o reajuste ficará sem efeito. Como não há dados, o risco é zero.
- A constraint `UNIQUE(contrato_id, servico_id)` impede vínculos duplicados — tratar 409 no frontend com mensagem amigável.
- O mesmo serviço pode existir em múltiplos contratos do mesmo usuário com valores diferentes — correto pelo design.

---

## Critérios de aceite

- [ ] Catálogo de serviços acessível em Configurações → Serviços
- [ ] Criar, editar, excluir serviço no catálogo
- [ ] Em um contrato, vincular serviços do catálogo com valor override
- [ ] Checkboxes implantado/faturando visíveis na tabela sem abrir modal
- [ ] Alteração de checkbox mostra botão Salvar na linha; cancelar restaura o valor
- [ ] Totalizadores (Valor total / Implantado / Faturando) refletem os serviços vinculados
- [ ] Gerar previstas usa soma dos serviços `faturando = true`
- [ ] Aba "Serv. Técnicos" mostra tabela com Tipo / Valor/h / Contratado / Consumido / Saldo
- [ ] Saldo colorido (verde positivo, vermelho esgotado)
- [ ] Dialog "Lançar horas" com data + quantidade + descrição opcional
- [ ] Lançamento atualiza `qtde_consumida` e registra em `consumo_horas`
- [ ] Não usa mais `prompt()` em nenhum lugar
- [ ] Build passa sem erros

---

## Observações para implementar

- Não executar migrations sem confirmação explícita
- Padrão de Dialog: seguir `SociosTab.tsx` exatamente
- Padrão de tabela inline: criar novo padrão — não há equivalente no sistema ainda
- `modulos_contrato` permanece no banco sem uso no frontend (não deletar a tabela)
