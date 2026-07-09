# Plano de Implementação: Anexos em Receitas e Despesas

## Origem

- Arquivo de especificação: conversa direta com o usuário (2026-06-29)
- Data do planejamento: 2026-06-29
- Classificação: `frontend-only`

## Resumo

Implementar o sistema de anexos (upload/visualização/download) nos modais de receita e despesa. O backend já recebe e persiste `anexos JSONB` em ambas as tabelas (`receitas` e `despesas`). As rotas TS de incomes e expenses já serializam e salvam `anexos`. Os types `Income` e `Expense` no frontend não têm o campo `anexos`. O trabalho é criar um componente reutilizável e integrá-lo nos dois modais e nas duas listas.

## Escopo

### Dentro do escopo

- Interface `Attachment` e campo `anexos` em `Income` e `Expense` em `src/types/finance.ts`
- Campo `anexos` em `IncomeFormValues` e `ExpenseFormValues`
- Componente reutilizável `src/ui/AttachmentSection.tsx`
  - Botão "Anexar arquivo" (clique para abrir seletor)
  - Lista: ícone por tipo + nome + tamanho + botão remover
  - Modo edição: botão de download de cada anexo já salvo
  - Limite: 10MB por arquivo
  - Tipos aceitos: PDF, imagens (JPG/PNG/GIF), Excel, Word, TXT
- Integração em `IncomeDialog.tsx`
- Integração em `ExpenseDialog.tsx`
- Badge discreto `📎 N` em `IncomePanel` quando `item.anexos?.length > 0`
- Badge discreto `📎 N` em `ExpensePanel` quando `item.anexos?.length > 0`
- Download: base64 → Blob → `URL.createObjectURL` → clique automático

### Fora do escopo

- Upload para S3 / storage externo
- Compressão de imagens
- Preview inline de imagem/PDF dentro do modal
- Comprovantes separados de pagamento (tipo `tipoAnexo: 'comprovante'` do sistema antigo)
- Drag-and-drop de arquivos
- Multi-upload simultâneo (múltiplos arquivos de uma vez já funciona via `<input multiple>`)

## Leitura de contexto

- `/AGENT.md` — lido
- `backend/src/db/schema/incomes.ts` — coluna `attachments: jsonb('anexos')` confirmada
- `backend/src/db/schema/expenses.ts` — coluna `attachments: jsonb('anexos')` confirmada
- `backend/src/routes/incomes.ts` — já serializa e salva `anexos` no POST e PUT
- `backend/src/routes/expenses.ts` — já serializa e salva `anexos` no POST e PUT
- `src/types/finance.ts` — `Income` e `Expense` sem campo `anexos`
- `src/screens/finance/IncomeDialog.tsx` — lido
- `src/screens/finance/ExpenseDialog.tsx` — lido
- `src/screens/finance/ExpensePanel.tsx` — lido
- `js/anexos.js` — lógica completa do sistema antigo analisada

## Impacto por área

### Frontend

**`src/types/finance.ts`**
- Adicionar interface:
  ```ts
  export interface Attachment {
    id: string;
    nome: string;
    tipo: string;
    tamanho: number;
    dados: string; // base64 sem prefixo data:
    dataUpload: string;
  }
  ```
- Adicionar `anexos?: Attachment[] | null` em `Income`
- Adicionar `anexos?: Attachment[] | null` em `Expense`
- Adicionar `anexos?: Attachment[]` em `IncomeFormValues`
- Adicionar `anexos?: Attachment[]` em `ExpenseFormValues`

**`src/ui/AttachmentSection.tsx`** (novo arquivo)
- Props: `value: Attachment[]`, `onChange: (v: Attachment[]) => void`, `readonly?: boolean`
- `<input type="file" multiple accept="...">` oculto, acionado por botão
- `FileReader` para converter para base64
- Validação: tipo + tamanho (10MB)
- Lista de anexos com ícone por MIME type, nome, tamanho formatado, botão remover
- Modo `readonly=true`: exibe apenas lista com botões de download (sem remover, sem adicionar)
- Função `downloadAttachment(anexo: Attachment)`: base64 → Blob → createObjectURL → clique

**`src/screens/finance/IncomeDialog.tsx`**
- Adicionar estado local: `const [anexos, setAnexos] = useState<Attachment[]>([])`
- Inicializar no `useEffect`: `setAnexos(income?.anexos ?? [])`
- Limpar no `useEffect` quando `!open`
- Adicionar `<AttachmentSection value={anexos} onChange={setAnexos} />` antes das observações
- Incluir `anexos` no objeto passado para `onSave`

**`src/screens/finance/ExpenseDialog.tsx`**
- Mesmo padrão do IncomeDialog
- Adicionar `anexos` ao `toFormValues()` e ao `handleAddToBatch()`

**`src/screens/finance/IncomePanel.tsx`**
- Verificar se existe; se não, localizar onde receitas são listadas
- Adicionar badge `<Paperclip size={12} /> {n}` na linha quando `item.anexos?.length > 0`
- Clique no badge abre `AttachmentSection` em modo `readonly`

**`src/screens/finance/ExpensePanel.tsx`**
- Mesmo padrão do IncomePanel

### Backend

Sem impacto esperado. Rotas já preparadas.

### Banco de dados

Sem impacto esperado. Colunas `anexos JSONB` já existem em ambas as tabelas.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/types/finance.ts`
- `src/ui/AttachmentSection.tsx` (novo)
- `src/screens/finance/IncomeDialog.tsx`
- `src/screens/finance/ExpenseDialog.tsx`
- `src/screens/finance/IncomePanel.tsx` (ou arquivo equivalente)
- `src/screens/finance/ExpensePanel.tsx`

## Estratégia de implementação

1. Atualizar `src/types/finance.ts` — interface `Attachment`, campo `anexos` em `Income`, `Expense`, `IncomeFormValues`, `ExpenseFormValues`
2. Criar `src/ui/AttachmentSection.tsx` — componente completo com upload, lista, download
3. Integrar `AttachmentSection` em `IncomeDialog.tsx`
4. Integrar `AttachmentSection` em `ExpenseDialog.tsx`
5. Adicionar badge de anexos em `ExpensePanel.tsx`
6. Localizar e adicionar badge de anexos em `IncomePanel.tsx` (ou painel equivalente)
7. Rodar `npx vite build` para validar

## Regras de negócio identificadas

- Limite de 10MB por arquivo
- Tipos permitidos: `application/pdf`, `image/jpeg`, `image/jpg`, `image/png`, `image/gif`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain`
- `dados` armazena base64 puro (sem prefixo `data:type;base64,`)
- Em modo edição, anexos existentes são carregados e podem ser removidos ou adicionados novos
- Download converte base64 → Blob → URL temporária → clique simulado → revogação após 100ms

## Regras multi-tenant e segurança

- Sem novo endpoint — anexos trafegam dentro do corpo do POST/PUT existente
- Validação de `usuario_id` já feita nas rotas existentes de receitas/despesas
- Sem risco de vazamento adicional

## Validações necessárias

- Tipo de arquivo: validar contra whitelist de MIME types antes de converter
- Tamanho: `file.size <= 10 * 1024 * 1024`
- Exibir mensagem de erro inline se validação falhar (não bloquear o form inteiro)

## Testes necessários

### Frontend

- Badge aparece quando `item.anexos.length > 0`
- Badge não aparece quando sem anexos
- Upload de arquivo válido adiciona à lista
- Upload de arquivo inválido (tipo ou tamanho) exibe erro
- Remover anexo da lista funciona
- Download dispara corretamente
- Em modo edição, anexos existentes são pré-carregados
- Submit envia `anexos` junto com os outros campos

## Comandos de validação sugeridos

```bash
npx vite build
```

## Riscos e pontos de atenção

- Arquivos grandes (5-10MB) em base64 aumentam o payload em ~33% — aceitável para uso pessoal
- `IncomeFormValues` e `ExpenseFormValues` devem incluir `anexos` para o campo chegar ao submit
- O `ExpensFormValues` é passado para `onSave` via `toFormValues()` — garantir que `anexos` seja incluído ali
- No lote de despesas (`handleAddToBatch`): cada item do lote deve ter seu próprio array de `anexos`

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite

- Upload de arquivo funciona em ambos os modais
- Arquivo inválido exibe mensagem e não é adicionado
- Lista de anexos mostra nome, tamanho e botão remover
- Download funciona no modal de edição para anexos já salvos
- Badge `📎 N` aparece nas listas quando há anexos
- Build passa sem erros

## Observações para a skill implementar

- Sem migration necessária — não executar
- Sem alteração de backend — não tocar nas rotas
- Componente `AttachmentSection` deve ser independente e reutilizável
- Seguir padrão visual do projeto (rounded-xl, border-slate-200, text-sm, etc.)
- Usar `Paperclip` do lucide-react para ícone de anexo
- Alterar apenas os arquivos listados
