# Plano de Implementação: Limpeza e Padronização — Módulo Clientes/Contratos

## Origem

- Data do planejamento: `2026-07-05`
- Classificação: `fullstack` — frontend + backend

## Resumo

Limpeza completa do módulo clientes/contratos: remoção de código morto e estado obsoleto, padronização de helpers para nível de módulo, tradução de variáveis/mensagens/comentários do Portuguese para English no backend, extração de SQL duplicado para helper, correção de bug no aditivo (campos financeiros não carregados), e nova versão do modal de cadastro de contrato.

## Escopo

### Dentro do escopo

- Remover dead state (`num_aditivo`, `data_aditivo`, `horas_presenciais_saldo_atual`, `horas_remotas_saldo_atual`) do `ContratoForm`
- Remover `isLinked` (nunca usado) e converter `checked` para valor derivado em `CatalogoServicoRow`
- Mover `fv()` e `n()` para constantes de módulo
- Tipar `set` como `keyof typeof form` no `ContratoForm`
- Renomear sufixo `_n` (`vMensal_n` → `vMensalNum` etc.) na aba Valores
- Extrair `modalTabs` para constante de módulo
- Achatar IIFE aninhado da aba Valores (extrair variáveis inline antes do JSX)
- Traduzir variáveis locais do `gerarPrevistas` (PT → EN)
- Traduzir variáveis locais da rota `PUT /:id/aditivo` (PT → EN)
- Traduzir mensagens de validação e erro em `contracts.ts` e `contract-services.ts`
- Traduzir comentários inline em `contracts.ts` e `contract-services.ts`
- Remover `void perfil_id` e tratar adequadamente
- Extrair helper `cancelContractRevenues(contratoId, userId)` para deduplicar o `UPDATE receitas SET status = 'cancelada'`
- Bug fix: aditivo deve copiar `valor_contrato`, `valor_mensal`, `implantacao_parcelas`, `implantacao_valor_parcela`, `horas_presenciais_valor`, `horas_presenciais_saldo_ini`, `horas_remotas_valor`, `horas_remotas_saldo_ini` para o novo contrato
- Nova versão do `ContratoForm`: remover campos mortos, adicionar nota sobre aba Valores, avaliar `Select` vs `ToggleGroup` para representante
- Verificar e remover dead code em `clientesService.ts` (`ModuloContrato`, `ServicoTecnico` e relacionados) e `queryKeys.ts` — somente após grep de confirmação

### Fora do escopo

- Migração de schema de banco de dados
- Alteração de `.env`
- Push / merge em main sem confirmação explícita
- Refactors em outras telas (financeiro, reservas, etc.)
- Novas features no módulo clientes

## Arquivos afetados

- `src/screens/config/ClienteDetail.tsx` — principal
- `src/services/clientesService.ts` — remoção de dead code (pós-grep)
- `src/services/queryKeys.ts` — remoção de keys mortas (pós-grep)
- `backend/src/routes/contracts.ts` — tradução + deduplicação SQL + bug fix aditivo
- `backend/src/routes/contract-services.ts` — tradução de mensagens e comentários

## Estratégia de implementação

### Passo 1 — Verificação de dead code (grep)

Antes de remover qualquer símbolo de `clientesService.ts`, confirmar que não são importados em outros arquivos:
```
grep -r "ModuloContrato\|fetchModulos\|saveModulo\|deleteModulo\|ServicoTecnico\|fetchServicosTecnicos\|saveServicoTecnico\|lancarHoras\|processarAditivo\|modulosContrato\|servicosTecnicos" src/
```
Se nenhum resultado fora de `clientesService.ts` → remover com segurança.

### Passo 2 — Backend: `contract-services.ts`

Escopo menor — apenas tradução de mensagens e comentários. Fazer primeiro por ser mais simples.

- `'contrato_id é obrigatório'` → `'contrato_id is required'`
- `'contrato_id e servico_id são obrigatórios'` → `'contrato_id and servico_id are required'`
- `'Este serviço já está vinculado a este contrato'` → `'Service already linked to this contract'`
- Comentários em PT → EN

### Passo 3 — Backend: `contracts.ts`

#### 3a. Extrair helper `cancelContractRevenues`

Antes das rotas, definir:
```typescript
async function cancelContractRevenues(contratoId: number, userId: number): Promise<void> {
  await pool.query(
    `UPDATE receitas SET status = 'cancelada'
     WHERE contrato_id = $1 AND usuario_id = $2 AND status = 'prevista'`,
    [contratoId, userId],
  );
}
```
Substituir as 3 ocorrências inline pelo helper.

#### 3b. Traduzir `gerarPrevistas`

Variáveis a renomear:
- `dataInicio` → `startDate`
- `vencimento` → `endDate`
- `clienteNome` → `clientName`
- `contratoId` → `contractId`
- `usuarioId` → `userId`
- `perfilId` → `profileId`
- `currentYear`/`currentMonth` — já estão em inglês, manter
- `dataRecebimento` → `dueDate`
- `mesIndex` → `monthIndex`
- `valorMensal` → `monthlyAmount`

#### 3c. Traduzir rota aditivo

Variáveis locais:
- `contratoAtual` → `currentContract`
- `contratoAtualResult` → `currentContractResult`
- `novoContratoResult` → `newContractResult`
- `novoContrato` → `newContract`
- `novoContratoId` → `newContractId`

Body destructuring (nomes de campos da API — manter compatibilidade com frontend):
- Estes são nomes de campos do payload JSON — **não renomear** os nomes dos campos da API, apenas as variáveis locais onde necessário.

#### 3d. Corrigir bug do aditivo — carregar campos financeiros

No INSERT do novo contrato, adicionar as colunas:
```sql
valor_contrato, valor_mensal,
implantacao_parcelas, implantacao_valor_parcela,
horas_presenciais_valor, horas_presenciais_saldo_ini, horas_presenciais_saldo_atual,
horas_remotas_valor, horas_remotas_saldo_ini, horas_remotas_saldo_atual
```
Valores lidos de `currentContract[campo]`, com fallback para 0.

`horas_presenciais_saldo_atual` e `horas_remotas_saldo_atual` devem ser copiados como o saldo inicial novo (reset para `saldo_ini`), pois o novo período de contrato começa com o saldo cheio.

#### 3e. Remover `void perfil_id`

Verificar como `perfil_id` é obtido e se realmente não é usado. Se não for usado, remover a desestruturação do resultado. Se for usado em `gerarPrevistas`, passar corretamente.

#### 3f. Traduzir mensagens de validação e comentários

- `'Vencimento é obrigatório'` → `'vencimento is required'`
- `'Cliente é obrigatório'` → `'cliente_id is required'`
- Comentários inline: PT → EN

### Passo 4 — Frontend: `ClienteDetail.tsx`

#### 4a. Constantes de módulo (antes dos componentes)

```typescript
// Normalize postgres NUMERIC string → display string (zero → empty)
const fv = (v: number | string | null | undefined): string => {
  const x = parseFloat(String(v ?? 0));
  return x ? String(x) : '';
};

// Numeric field initializer for ContratoModal state
const n = (v: number | string | null | undefined): string => fv(v);

const MODAL_TABS = [
  { key: 'form',     label: 'Contrato'  },
  { key: 'servicos', label: 'Serviços'  },
  { key: 'valores',  label: 'Valores'   },
] as const;
```

#### 4b. `ContratoForm` — nova versão

State: remover `num_aditivo`, `data_aditivo`
```typescript
const [form, setForm] = useState({
  numero:                  initial?.numero ?? '',
  data_assinatura:         initial?.data_assinatura ?? '',
  vencimento:              initial?.vencimento ?? '',
  data_inicio_faturamento: initial?.data_inicio_faturamento ?? '',
  ajuste:                  initial?.ajuste ?? 'NADA CONSTA',
  observacoes:             initial?.observacoes ?? '',
  representante_id:        String(initial?.representante_id ?? ''),
});
```

Setter tipado:
```typescript
const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
```

`handleSubmit`: remover `num_aditivo`, `data_aditivo`, `horas_presenciais_saldo_atual`, `horas_remotas_saldo_atual`.

Representante: avaliar se há muitos representantes — se `representantes.length > 5`, usar `<Select>` em vez de `ToggleGroup`.

Adicionar nota no final do form (antes dos botões):
```tsx
<p className="text-xs text-slate-400 text-center">
  Valores financeiros e horas técnicas são configurados na aba <strong>Valores</strong> após criar o contrato.
</p>
```

#### 4c. `CatalogoServicoRow` — remover dead code e derivar `checked`

- Remover `const isLinked = !!vinculo` (não usado)
- Remover `const [checked, setChecked] = useState(!!vinculo)`
- Usar `const checked = !!vinculo` (valor derivado)
- Remover `setChecked(!!vinculo)` do `useEffect` (mantendo apenas os setters restantes)
- Usar `fv` de módulo (remover definição local)

#### 4d. `ContratoModal` — renomear `_n` e achatar IIFE

Renomear no Valores tab:
- `vMensal_n`  → `vMensalNum`
- `implTotal_n` → `implTotalNum`
- `hpIni_n`    → `hpIniNum`
- `hpValor_n`  → `hpValorNum`
- `hrIni_n`    → `hrIniNum`
- `hrValor_n`  → `hrValorNum`
- `valTotal_n` → `valTotalNum`

Usar `n` de módulo (remover definição local).

Usar `MODAL_TABS` de módulo (remover declaração inline).

Achatar o IIFE aninhado: extrair variáveis de "Cards de confronto" como `const` normais antes do `return` do IIFE externo, mantendo o IIFE externo apenas para o bloco de JSX da aba.

### Passo 5 — Service layer (se grep confirmar dead code)

Em `clientesService.ts`: remover:
- `ModuloContrato` interface
- `ServicoTecnico` interface
- `fetchModulos`, `saveModulo`, `deleteModulo`
- `fetchServicosTecnicos`, `saveServicoTecnico`, `lancarHoras`

Em `queryKeys.ts`: remover:
- `modulosContrato`
- `servicosTecnicos`

### Passo 6 — Validação

```bash
npx tsc --noEmit
cd backend && npx tsc --noEmit
npx vite build
```

## Regras de negócio identificadas

- `saldo_atual` de horas: ao criar novo contrato via aditivo, deve resetar para `saldo_ini` (novo período começa com saldo cheio)
- `num_aditivo`, `data_aditivo` pertencem ao fluxo de aditivo, nunca ao cadastro inicial
- Campos financeiros do contrato são gerenciados pela aba Valores; o form de cadastro os inicializa em 0

## Segurança e multi-tenant

- Toda query já filtra por `usuario_id` — manter em todas as queries existentes e no helper `cancelContractRevenues`
- Não vazar dados entre usuários

## Riscos e pontos de atenção

- **Aditivo bug fix**: verificar que os campos financeiros copiados chegam corretamente (`contratoAtual[campo]` pode ser string NUMERIC do postgres — aplicar `parseFloat(String(...)) || 0`)
- **Dead code grep**: se algum dos símbolos for usado em arquivo não listado, não remover sem análise
- **Nomes de campos da API no aditivo**: `novo_vencimento`, `nova_data_assinatura` etc. são recebidos do frontend — **não renomear** os nomes dos campos JSON, apenas as variáveis TypeScript locais onde o nome colide com a convenção English
- **`void perfil_id`**: verificar se é realmente não usado ou se deveria ser passado para `gerarPrevistas` no fluxo do aditivo

## Critérios de aceite

- `tsc --noEmit` sem erros em frontend e backend
- `vite build` sem erros
- Nenhuma variável PT restante em `contracts.ts` e `contract-services.ts` (exceto nomes de campos de API)
- `fv` e `n` definidos apenas uma vez, no nível de módulo
- `ContratoForm` sem state `num_aditivo` e `data_aditivo`
- Aditivo cria novo contrato com todos os campos financeiros copiados do anterior
- SQL `UPDATE receitas SET status = 'cancelada'` aparece apenas no helper, não inline

## Observações para implementação

- Nunca alterar `.env`
- Nunca executar migrations sem confirmação explícita — nenhuma migration é necessária neste plano
- O banco pode estar apontando para produção
- Criar branch: `refactor/R/limpeza-clientes-contratos` a partir da branch atual (`fix/R/receitas-campos-completos`)
- Não fazer push sem confirmação do usuário
