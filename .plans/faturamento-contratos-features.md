# Plano de Implementação: Faturamento de Contratos — 3 Features

## Origem
- Data do planejamento: `2026-07-10`
- Classificação: `fullstack`

## Resumo
Três features interligadas para automatizar o ciclo de faturamento de contratos:
1. Auto-gerar receitas previstas ao criar contrato
2. Criar receita de implantação com status visual (pendente/atrasado/recebido)
3. Faturar horas no modal Nova Receita com dedução automática do saldo do contrato

---

## Feature 1 — Auto-gerar previstas ao criar contrato

### Escopo
- Ao salvar contrato NOVO com `data_inicio_faturamento` + `vencimento`, gerar receitas previstas automaticamente
- Edições de contrato NÃO alteram previstas existentes (confirmado pelo usuário)
- Usa `gerarPrevistas` já existente no backend

### Implementação
**`src/screens/config/ClienteDetail.tsx`** — `saveContratoMut.onSuccess`:
```tsx
onSuccess: (saved) => {
  void qc.invalidateQueries({ queryKey: queryKeys.contratos(cliente.id) });
  // Auto-gerar previstas apenas para contratos novos
  if (!contratoModal.contrato && saved.data_inicio_faturamento) {
    gerarMut.mutate(saved.id);
  }
  setContratoModal({ open: false });
}
```

---

## Feature 2 — Implantação como receita com status

### Escopo
- Ao criar contrato com `implantacao_valor_parcela > 0`, criar receita de implantação
- Usa colunas existentes: `tipo_receita = 'Implantação'`, `status = 'prevista'`, `contrato_id`
- Status visual calculado no frontend:
  - `pendente` = `prevista` + `data_recebimento >= hoje`
  - `atrasado` = `prevista` + `data_recebimento < hoje`
  - `recebido` = `ativa`

### Backend — `backend/src/routes/contracts.ts`
Novo endpoint `POST /api/contratos/:id/receita-implantacao`:
```typescript
router.post('/:id/receita-implantacao', authenticate, async (req, res) => {
  const contractId = parseInt(req.params['id']!);
  // Buscar contrato
  // Verificar se já existe receita de implantação para evitar duplicata
  // SELECT id FROM receitas WHERE contrato_id = $1 AND tipo_receita = 'Implantação' AND usuario_id = $2
  // Se não existe: INSERT com valor = implantacao_parcelas * implantacao_valor_parcela
  // data_recebimento = data_assinatura ou data_inicio_faturamento
});
```

### Frontend — `src/screens/config/ClienteDetail.tsx`
Em `saveContratoMut.onSuccess` (novo contrato):
```tsx
if (!contratoModal.contrato && saved.implantacao_valor_parcela > 0) {
  await criarReceitaImplantacao(saved.id);
}
```

### Frontend — `src/screens/finance/IncomePanel.tsx`
Para receitas com `tipo_receita = 'Implantação'` e `contratoId`:
- Mostrar pill de status (pendente/atrasado/recebido)
- Botão para marcar como recebido → PATCH status `prevista → ativa`

### Service — `src/services/clientesService.ts`
```typescript
export async function criarReceitaImplantacao(contratoId: number): Promise<void> {
  return apiRequest(`/contratos/${contratoId}/receita-implantacao`, { method: 'POST' });
}
```

---

## Feature 3 — Faturamento de horas no modal Nova Receita

### Backend — `backend/src/routes/contracts.ts`
Adicionar filtro `status=ativo` no GET:
```typescript
if (req.query.status) {
  where += ` AND ct.status = $${params.length + 1}`;
  params.push(req.query.status);
}
```

### Backend — `backend/src/routes/incomes.ts`
No POST, aceitar `contrato_id`, `tipo_hora`, `quantidade_horas`:
```typescript
// Dentro de uma transação:
// 1. INSERT receita normalmente
// 2. Se contrato_id + tipo_hora + quantidade_horas presentes:
//    UPDATE contratos SET horas_presenciais_saldo_atual = horas_presenciais_saldo_atual - $n
//    WHERE id = $contrato_id AND usuario_id = $userId
```

### Frontend — `src/services/clientesService.ts`
```typescript
export interface ContratoResumo {
  id: number;
  cliente_nome: string;
  numero?: string | null;
  horas_presenciais_valor?: number | null;
  horas_presenciais_saldo_atual?: number | null;
  horas_remotas_valor?: number | null;
  horas_remotas_saldo_atual?: number | null;
}

export async function fetchContratosAtivos(): Promise<ContratoResumo[]> {
  return apiRequest<ContratoResumo[]>('/contratos?status=ativo');
}
```

### `src/services/queryKeys.ts`
```typescript
contratosAtivos: ['contratos-ativos'] as const,
```

### `src/types/finance.ts`
`IncomeFormValues` recebe:
```typescript
contratoId?: number | null;
tipoHora?: 'presencial' | 'remoto' | null;
quantidadeHoras?: number | null;
```

### Frontend — `src/screens/finance/IncomeDialog.tsx`
Nova seção "Horas a faturar" ao final do form:
- Dropdown: selecionar contrato (fetcha `fetchContratosAtivos`)
- Pills: Presencial / Remoto
- Input: quantidade de horas
- Display: valor calculado + saldo atual de horas
- Quando contrato + tipo + quantidade preenchidos: preenche `valor` automaticamente

### `src/services/financeService.ts`
`saveIncome` passa: `contrato_id`, `tipo_hora`, `quantidade_horas`

---

## Arquivos afetados

**Backend:**
- `backend/src/routes/contracts.ts`
- `backend/src/routes/incomes.ts`

**Frontend:**
- `src/screens/config/ClienteDetail.tsx`
- `src/screens/finance/IncomePanel.tsx`
- `src/screens/finance/IncomeDialog.tsx`
- `src/services/clientesService.ts`
- `src/services/queryKeys.ts`
- `src/types/finance.ts`
- `src/services/financeService.ts`

---

## Riscos e atenções
- Feature 2: verificar duplicata antes de criar receita de implantação
- Feature 3: usar transação no backend para garantir atomicidade (receita + debit horas)
- Sem migrations de schema necessárias
