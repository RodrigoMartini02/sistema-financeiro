# Plano de Implementação: Status de Faturamento por Contrato

## Origem

- Data do planejamento: `2026-07-09`
- Classificação: `frontend + backend + database`

## Resumo

Adicionar seção "Faturamento" na tela de Receitas que lista todos os contratos ativos do usuário com status visual por mês (Pendente / Faturado / Em atraso / Recebido). O usuário pode avançar o status de cada contrato com um clique. A receita é criada automaticamente no banco no momento do clique em "Faturar" (se ainda não existir), sem necessidade de rodar `gerar-previstas` antes.

## Decisões Aplicadas

- **Decisão 1:** Faturado ≠ Recebido — 4º status `faturada` no banco. Fluxo: `prevista → faturada → ativa`
- **Decisão 2:** Todos os contratos ativos aparecem sempre, independente de terem previsão gerada. "Faturar" cria a receita se não existir.

## Escopo

### Dentro do escopo

- Novo status `faturada` na tabela `receitas` (migration ALTER TABLE)
- Novo endpoint `GET /api/contratos/faturamento?mes=X&ano=Y`
- Novo endpoint `PATCH /api/receitas/:id/faturar` (muda `prevista → faturada`)
- Criação inline de receita com status `faturada` para contratos sem previsão
- Seção "Faturamento" em `ReceitasScreen.tsx` com card por contrato, badge de status e botões de ação
- Seletor de mês/ano sincronizado com o seletor existente da tela de receitas

### Fora do escopo

- Rastreamento de horas usadas para faturar (próxima iteração)
- Notificações automáticas de atraso
- Alteração ou dependência no fluxo `gerar-previstas`
- Envio de e-mail ou nota fiscal

## Impacto por Área

### Frontend

**Tela afetada:** `src/screens/receitas/ReceitasScreen.tsx`

Nova seção "Faturamento de Contratos" no topo da tela (antes da lista de receitas), renderizada apenas quando há contratos ativos.

**Componente da seção:**
- Header com título "Contratos — Faturamento {mês/ano}"
- Lista de cards, um por contrato ativo
- Cada card: nome do cliente, nome/tipo do contrato, valor mensal, badge de status, botão de ação

**Badges de status:**
- `prevista` + mês atual → **Pendente** (amarelo)
- `prevista` + mês passado → **Em atraso** (vermelho)
- `faturada` → **Faturado** (azul)
- `ativa` → **Recebido** (verde)
- sem receita + mês atual → **Pendente** (amarelo)
- sem receita + mês passado → **Em atraso** (vermelho)

**Botões por estado:**
- Pendente / Em atraso → botão "Faturar"
- Faturado → botão "Recebido" + botão "Reverter" (opcional, fora do escopo v1)
- Recebido → sem botão (ou "Ver Receita")

**Query key:** `['contratos-faturamento', mes, ano, usuarioId]`

**Service functions:**
- `getContratosFaturamento(mes: number, ano: number): Promise<ContratoFaturamento[]>`
- `faturarContrato(contratoId: number, mes: number, ano: number): Promise<void>` — cria receita ou muda status para `faturada`
- `marcarRecebido(receitaId: number): Promise<void>` — reutiliza `receberReceita` existente

**Estados:** loading skeleton, empty state ("Nenhum contrato ativo"), error

### Backend

**Arquivo principal:** `backend/src/routes/contracts.ts`

**Novo endpoint 1:**
```
GET /api/contratos/faturamento?mes=X&ano=Y
Authorization: Bearer token
```

Lógica:
1. Busca todos os contratos com `status = 'ativo'` e `usuario_id = req.user.id`
2. Para cada contrato, faz JOIN com `clientes` para obter o nome
3. Busca receita do mês/ano com `contrato_id = contrato.id` (se existir)
4. Retorna array de `{ contrato_id, cliente_nome, contrato_descricao, valor_mensal, receita_id?, receita_status? }`

Query SQL:
```sql
SELECT
  c.id AS contrato_id,
  cl.nome AS cliente_nome,
  c.descricao AS contrato_descricao,
  c.valor_mensal,
  r.id AS receita_id,
  r.status AS receita_status
FROM contratos c
JOIN clientes cl ON cl.id = c.cliente_id
LEFT JOIN receitas r
  ON r.contrato_id = c.id
  AND EXTRACT(MONTH FROM r.data) = $mes
  AND EXTRACT(YEAR FROM r.data) = $ano
  AND r.usuario_id = $usuario_id
WHERE c.status = 'ativo'
  AND c.usuario_id = $usuario_id
ORDER BY cl.nome, c.id
```

**Novo endpoint 2:**
```
POST /api/contratos/:id/faturar
Body: { mes: number, ano: number }
Authorization: Bearer token
```

Lógica:
1. Verifica se contrato pertence ao usuário
2. Busca receita do mês com `contrato_id = id`
3. Se existir com `status = 'prevista'` → UPDATE status para `faturada`
4. Se não existir → INSERT receita com `status = 'faturada'`, `contrato_id = id`, `valor = contrato.valor_mensal`, `data = {ano}-{mes}-01`, `descricao = "Mensalidade {cliente_nome}"`, `usuario_id`
5. Retorna receita criada/atualizada

**Arquivo secundário:** endpoint `PATCH /api/receitas/:id/faturar` pode ser adicionado em `backend/src/routes/receitas.ts` (se esse arquivo existir separado)

### Banco de Dados

**Migration necessária:** adicionar `'faturada'` ao check constraint do campo `status` em `receitas`.

O campo atual provavelmente tem:
```sql
CHECK (status IN ('ativa', 'prevista', 'cancelada'))
```

Mudança necessária:
```sql
ALTER TABLE receitas DROP CONSTRAINT IF EXISTS receitas_status_check;
ALTER TABLE receitas ADD CONSTRAINT receitas_status_check
  CHECK (status IN ('ativa', 'prevista', 'cancelada', 'faturada'));
```

**Atenção:** esta migration deve ser executada com confirmação explícita do usuário. O banco pode estar apontando para produção.

**Operação é aditiva** — não altera dados existentes, apenas expande os valores válidos.

### Infra/Deploy

Sem impacto em infra, env vars, ou deploy. É uma feature puramente de aplicação.

## Arquivos Provavelmente Afetados

- `backend/src/routes/contracts.ts` — endpoint GET faturamento + POST faturar
- `backend/src/routes/receitas.ts` (se existir) — PATCH receber já existente, verificar
- `src/services/financeService.ts` — tipos `IncomeStatus`, `ContratoFaturamento`, funções novas
- `src/screens/receitas/ReceitasScreen.tsx` — nova seção UI
- Migration SQL — a confirmar antes de executar

## Estratégia de Implementação

1. **Investigar** tipos existentes: localizar `IncomeStatus` e verificar onde é usado
2. **Investigar** estrutura da tabela `receitas` no banco (check constraint atual)
3. **Migration** — preparar o SQL, apresentar ao usuário e aguardar confirmação explícita antes de rodar
4. **Atualizar types** — `IncomeStatus` adiciona `'faturada'`; criar interface `ContratoFaturamento`
5. **Backend endpoint GET** — `GET /api/contratos/faturamento?mes=X&ano=Y`
6. **Backend endpoint POST** — `POST /api/contratos/:id/faturar` com lógica criar-ou-atualizar
7. **Frontend service** — `getContratosFaturamento`, `faturarContrato`, (reusar `receberReceita`)
8. **Frontend UI** — seção "Faturamento" em `ReceitasScreen.tsx`
9. **Build** — `npx vite build` + `cd backend && npm run build`

## Regras de Negócio Identificadas

- Contrato `status = 'ativo'` aparece sempre, independente de previsão gerada
- Um contrato pode ter no máximo uma receita por mês/ano (determinado por `contrato_id` + data)
- "Faturar" = criar receita `faturada` (se não existir) ou mudar `prevista → faturada`
- "Recebido" = mudar `faturada → ativa` (reutiliza endpoint existente)
- Em atraso = sem receita (ou `prevista`/`faturada`) em mês anterior ao atual
- `valor_mensal` do contrato é o valor padrão da receita criada
- `descricao` da receita criada: `"Mensalidade — {nome do cliente}"`
- Filtro obrigatório por `usuario_id` em todas as queries

## Regras Multi-tenant e Segurança

- Todos os endpoints devem filtrar por `usuario_id = req.user.id` (extraído do token JWT)
- Nunca retornar contratos ou receitas de outros usuários
- Endpoint POST faturar deve verificar que o contrato pertence ao usuário antes de criar receita
- Nunca expor `usuario_id` em mensagens de erro

## Validações Necessárias

- `mes` e `ano` como query params: validar que são inteiros, `mes` entre 1-12
- `contratoId` no endpoint POST: validar que existe e pertence ao usuário
- Receita não pode ser "faturada" se já está `ativa` (recebida)
- Receita não pode ser "faturada" se está `cancelada`

## Riscos e Pontos de Atenção

| Risco | Impacto | Mitigação |
|---|---|---|
| Migration em produção | Médio | Confirmar antes; operação aditiva, não destrói dados |
| `IncomeStatus` usado em múltiplos places no TS | Baixo | Grep antes de alterar; TypeScript vai apontar erros de compilação |
| `ReceitasScreen.tsx` pode ser muito grande | Baixo | Alteração cirúrgica — nova seção no topo, sem tocar no restante |
| Contrato com `valor_mensal = 0` | Baixo | Exibir como R$ 0,00, não bloquear |
| Dois cliques simultâneos em "Faturar" | Baixo | Desabilitar botão durante mutation (`isPending`) |

## Critérios de Aceite

- [ ] Seção "Faturamento" aparece na tela de receitas com todos os contratos ativos
- [ ] Status **Pendente** para contrato sem receita no mês atual
- [ ] Status **Em atraso** para contrato sem receita em mês passado
- [ ] Status **Faturado** para contrato com receita `faturada` no mês
- [ ] Status **Recebido** para contrato com receita `ativa` no mês
- [ ] Botão "Faturar" cria receita com status `faturada` (ou muda de `prevista`)
- [ ] Botão "Recebido" muda para status `ativa`
- [ ] Troca de mês no seletor atualiza a seção automaticamente
- [ ] Não aparece seção se não houver contratos ativos
- [ ] Build passa sem erros de TypeScript

## Observações para a Skill Implementar

- Não executar migration sem confirmação explícita do usuário — apresentar o SQL e aguardar "sim"
- O banco **pode estar apontando para produção**
- Verificar se `receitas.ts` existe como rota separada ou se os endpoints de receitas ficam em outro arquivo
- Reutilizar o endpoint `/receitas/:id/receber` existente para "Marcar como Recebido"
- Usar `useQueryClient` + `invalidateQueries` ao mutar para sincronizar com a lista de receitas
- Checar se `ReceitasScreen` já tem um seletor de mês/ano para sincronizar com a nova seção
- Não alterar `.env`
