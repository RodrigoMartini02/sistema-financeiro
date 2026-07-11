# Plano de Implementação: Redesign ClienteDetail — Lista de Contratos + Modal de Edição

## Origem

- Data do planejamento: `2026-07-05`
- Classificação: `frontend-only`

## Resumo

A tela atual de detalhe do cliente mostra o contrato ativo diretamente como card inline, com formulário que abre na mesma tela. O usuário quer:
1. Lista de todos os contratos com o vigente em destaque visual
2. Edição via modal `Dialog size='lg'` — mesmo estilo do IncomeDialog/DespesaDialog
3. Consistência visual total com o restante do sistema

## Escopo

### Dentro do escopo

- Renderizar lista completa de contratos (contratosQ.data já retorna todos)
- Contrato vigente: destaque com borda brand/verde, badge "Em vigor"
- Contratos encerrados: visual muted, badge "Encerrado"
- Botão "+ Novo contrato" abre modal com form vazio
- Clicar num contrato abre ContratoModal (Dialog size='lg') com dados pré-preenchidos
- ContratoModal = wrapper Dialog em torno do ContratoForm existente (sem alterar o form)
- Aba Serviços: sem alteração

### Fora do escopo

- Alterações no backend
- Alterações no banco de dados
- Alterações na aba Serviços
- Alterações no ContratoForm (campos, validação, submit)

## Leitura de contexto

- `/AGENT.md`
- `src/screens/config/ClienteDetail.tsx`
- `src/screens/config/SociosTab.tsx` — padrão de lista
- `src/ui/ConfigListRow.tsx` — componente de linha do sistema
- `src/ui/dialog.tsx` — Dialog size='lg'
- `src/screens/finance/IncomeDialog.tsx` — referência de estilo de modal

## Impacto por área

### Frontend

**Tela:** `src/screens/config/ClienteDetail.tsx`

**Aba Contrato — nova estrutura:**
- Remover o `showContratoForm` state e o formulário inline
- Adicionar `selectedContrato` state (qual contrato está aberto no modal) e `modalMode: 'new' | 'edit'`
- Lista de contratos: mapear `contratosQ.data ?? []` em linhas clicáveis
  - Linha vigente: `border-brand-400 bg-brand-50/30`, badge verde "Em vigor"
  - Linha encerrada: `opacity-60`, badge cinza "Encerrado"
  - Cada linha mostra: número do contrato, vencimento, representante, status
  - Click → abre ContratoModal em modo edição
- Botão "+ Novo contrato" → abre ContratoModal em modo novo
- Estado loading/empty mantido (EmptyState quando sem contratos)

**ContratoModal (novo componente interno):**
```tsx
function ContratoModal({ open, contrato, representantes, clienteId, isSaving, onSave, onClose }) {
  return (
    <Dialog open={open} title={contrato ? 'Editar contrato' : 'Novo contrato'} onClose={onClose} size="lg">
      <ContratoForm ... />
    </Dialog>
  );
}
```

**States removidos:** `showContratoForm`
**States adicionados:** `contratoModal: { open: boolean; contrato?: Contrato }`

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/config/ClienteDetail.tsx` — único arquivo alterado

## Estratégia de implementação

1. Adicionar state `contratoModal: { open: boolean; contrato?: Contrato }` — remove `showContratoForm`
2. Criar componente interno `ContratoModal` que envolve `ContratoForm` em `Dialog size='lg'`
3. Reescrever a aba Contrato:
   - Mostrar lista de todos os contratos (contratosQ.data)
   - Linha clicável por contrato — estilo diferente para vigente vs encerrado
   - Botão "+ Novo contrato" no topo direito da aba
4. Conectar click na linha → `setContratoModal({ open: true, contrato: c })`
5. Conectar botão novo → `setContratoModal({ open: true })`
6. Conectar onSave/onClose do modal às mutations existentes
7. Rodar `npx vite build` para validar

## Regras de negócio identificadas

- Um cliente pode ter múltiplos contratos (um ativo + vários encerrados)
- O contrato ativo é identificado por `status === 'ativo'`
- A API já retorna todos os contratos ordenados por `criado_em DESC`
- A aba Serviços usa `contrato` (o ativo) — não muda

## Regras multi-tenant e segurança

- Sem impacto — toda query já filtra por `usuario_id` no backend
- Frontend não adiciona lógica de tenant

## Validações necessárias

- Nenhuma nova — o ContratoForm existente já valida

## Comandos de validação sugeridos

```bash
npx vite build
```

## Riscos e pontos de atenção

- Baixo risco — apenas reorganização visual do frontend
- `contratosQ.data` já existe e retorna todos os contratos — nenhuma query nova
- O `ContratoForm` não é alterado — apenas movido para dentro de um Dialog

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Lista de contratos exibe todos (vigente + encerrados) com visual diferenciado
- Clicar num contrato abre Dialog `size='lg'` com o form pré-preenchido
- Botão "+ Novo contrato" abre Dialog com form vazio
- Aba Serviços continua funcionando sem alteração
- Build sem erros TypeScript

## Observações para a skill implementar

- Único arquivo a alterar: `src/screens/config/ClienteDetail.tsx`
- Não executar migrations
- Não alterar ContratoForm (só movê-lo para dentro de Dialog)
- Não alterar aba Serviços
- Validar com `npx vite build` ao final
