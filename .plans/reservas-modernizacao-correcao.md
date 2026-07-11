# Plano de Implementação: Modernização e Correção de Reservas

## Origem

- Arquivo de especificação: conversa — análise direta dos arquivos de reservas
- Data do planejamento: `2026-06-25`
- Classificação: `frontend + backend + database`

## Resumo

Três camadas de problema identificadas e a corrigir:

1. **Bugs críticos (POST retorna 400):** backend exige `mes`/`ano` no body, frontend nunca envia. Campo `nome` do frontend não bate com coluna `observacoes` do banco. Campo `descricao` não existe na tabela.
2. **UX desatualizada:** toggle "Reserva livre / Com meta" não é o padrão do mercado. Campo `data` visível gera confusão. Sem ícone/cor para diferenciação visual. Sem cálculo de contribuição mensal.
3. **Banco:** faltam colunas `cor` e `icone` para identificação visual por reserva.

## Escopo

### Dentro do escopo

- Adicionar colunas `cor VARCHAR(7)` e `icone VARCHAR(10)` à tabela `reservas` via `ALTER TABLE IF NOT EXISTS` em `database.js`
- Corrigir backend: tornar `mes`/`ano` opcionais no validator (derivados do campo `data`); incluir `cor` e `icone` no INSERT/UPDATE
- Corrigir tipo `Reserva`: `nome` → `observacoes`, remover `descricao`, adicionar `cor?`/`icone?`
- Corrigir service: montar body correto com `observacoes`, `mes`, `ano` (derivados da data do dia), `cor`, `icone`
- Novo form de reserva: sem campo `data`, sem toggle de tipo, paleta de emoji (12 opções) + paleta de cor (10 opções), campos de meta opcionais que aparecem ao preencher valor-alvo, cálculo de "contribuição mensal" automático
- Cards de reserva atualizados: exibir emoji, indicador de cor, contribuição calculada, barra de progresso para qualquer reserva com meta

### Fora do escopo

- Alteração na lógica de movimentações (MovimentacaoDialog)
- Mudança no cálculo de saldo disponível do backend
- Alteração em `backend/src/` (TypeScript — não é a rota ativa)
- Testes automatizados

## Leitura de contexto

- `/AGENT.md` — lido
- `backend/config/database.js` — lido (padrão de migration via ALTER TABLE IF NOT EXISTS)
- `backend/routes/reservas.js` — lido (rota ativa em JS)
- `backend/server.js` — lido (estrutura inicial da tabela reservas)
- `backend/src/db/schema/reserves.ts` — lido (schema Drizzle confirma coluna `observacoes`, sem `nome`)
- `src/types/reservas.ts` — lido
- `src/services/reservasService.ts` — lido
- `src/screens/reservas/ReservaDialog.tsx` — lido
- `src/screens/reservas/ReservasScreen.tsx` — lido
- `src/services/financeService.ts` — lido (padrão de mes/ano em saveIncome/saveExpense)
- `src/context/AppContext.tsx` — lido

## Impacto por área

### Frontend

**Arquivo:** `src/types/reservas.ts`
- Renomear `nome: string` → `observacoes: string` em `Reserva` e `ReservaFormValues`
- Remover `descricao?: string` de ambas as interfaces
- Adicionar `cor?: string` e `icone?: string` em ambas

**Arquivo:** `src/services/reservasService.ts`
- `saveReserva`: montar body com `observacoes` (não `nome`), derivar `mes` e `ano` da data atual do sistema, incluir `cor` e `icone`
- Data usada: `new Date()` — dia atual, nunca exposta no form

**Arquivo:** `src/screens/reservas/ReservaDialog.tsx`
- Remover campo `data` do form (usado internamente, não exibido)
- Remover campo `descricao`
- Remover toggle `tipo_reserva` (tipo derivado automaticamente)
- Renomear campo `nome` → `observacoes` no schema Zod e nos `form.register()`
- Adicionar emoji picker inline (12 emojis fixos em grid)
- Adicionar paleta de cor (10 cores, mesmo padrão de `CategoriasTab.tsx`)
- Campos de meta (objetivo_valor + data_objetivo) aparecem sempre, são opcionais
- Exibir linha de contribuição mensal calculada quando ambos preenchidos:
  `Math.ceil((objetivo_valor - valor) / mesesRestantes)`
- Emoji set: `['💰','🏠','🚗','✈️','📚','🛡️','🎓','💊','🎮','💻','👶','🐾']`
- Cor set: `['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6']`

**Arquivo:** `src/screens/reservas/ReservasScreen.tsx`
- Substituir `r.nome` → `r.observacoes`
- Remover exibição de `r.descricao`
- Adicionar emoji no card (canto superior esquerdo, tamanho 2xl)
- Adicionar borda esquerda colorida no card usando `r.cor`
- Progress bar para qualquer reserva com `objetivo_valor > 0` (não apenas tipo 'objetivo')
- Linha "R$ X/mês necessários" quando há `objetivo_valor` e `data_objetivo`

### Backend

**Arquivo:** `backend/routes/reservas.js`

POST — validator:
- `mes` e `ano`: tornar opcionais com `.optional().isInt(...)`
- Derivar valores efetivos de `data` se ausentes:
  ```js
  const dataObj = new Date(data);
  const mesEfetivo = mes !== undefined ? parseInt(mes) : dataObj.getUTCMonth();
  const anoEfetivo = ano !== undefined ? parseInt(ano) : dataObj.getUTCFullYear();
  ```
- Incluir `cor` e `icone` no destructuring e no INSERT
- `tipo_reserva` derivado automaticamente: `objetivo_valor > 0 ? 'objetivo' : 'normal'`

PUT — atualização:
- Incluir `cor` e `icone` no SET dinâmico (mesma lógica dos outros campos)

GET — sem alteração (SELECT * já retorna `cor` e `icone` após migration)

### Banco de dados

**Arquivo:** `backend/config/database.js`

Adicionar após o bloco de colunas de metas existente (linha ~82):
```js
await pool.query(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cor VARCHAR(7) DEFAULT '#6366f1'`);
await pool.query(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS icone VARCHAR(10) DEFAULT '💰'`);
```

- Colunas com DEFAULT são safe para tabelas com dados existentes — não precisam de backfill manual
- Reservas existentes receberão `cor = '#6366f1'` e `icone = '💰'` automaticamente

**Atenção:** A migration roda automaticamente na próxima inicialização do servidor via `database.js`. O ambiente atual pode ser produção — confirmar antes de reiniciar o backend.

### Infra/Deploy

Sem impacto esperado. A migration é idempotente (`IF NOT EXISTS`).

## Arquivos provavelmente afetados

- `backend/config/database.js`
- `backend/routes/reservas.js`
- `src/types/reservas.ts`
- `src/services/reservasService.ts`
- `src/screens/reservas/ReservaDialog.tsx`
- `src/screens/reservas/ReservasScreen.tsx`

## Estratégia de implementação

### Etapa 1 — Banco (database.js)

Localizar o bloco `// Adicionar colunas de objetivos/metas na tabela reservas` (linha ~77) e adicionar após:
```js
await pool.query(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cor VARCHAR(7) DEFAULT '#6366f1'`);
await pool.query(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS icone VARCHAR(10) DEFAULT '💰'`);
console.log('✅ Colunas cor e icone verificadas em reservas');
```

### Etapa 2 — Backend (routes/reservas.js)

**POST:**
- Tornar `mes` e `ano` opcionais no array de validators
- Após a validação, derivar `mesEfetivo` e `anoEfetivo` de `data` se não enviados
- Adicionar `cor` e `icone` ao destructuring de `req.body`
- Adicionar `cor` e `icone` ao INSERT SQL e seus parâmetros
- Remover a lógica de `tipo_reserva` do body — calcular automaticamente:
  `const tipoReserva = objValor > 0 ? 'objetivo' : 'normal';`

**PUT:**
- Adicionar `cor` e `icone` ao destructuring de `req.body`
- Adicionar ao SET dinâmico:
  ```js
  if (cor !== undefined) { setClauses.push(`cor = $${paramIdx++}`); params.push(cor); }
  if (icone !== undefined) { setClauses.push(`icone = $${paramIdx++}`); params.push(icone); }
  ```

### Etapa 3 — Tipos (src/types/reservas.ts)

```ts
export interface Reserva {
  id: number;
  observacoes: string;   // era nome
  valor: number;
  data: string;
  mes: number;
  ano: number;
  tipo_reserva: 'normal' | 'objetivo';
  objetivo_valor?: number | null;
  objetivo_atingido?: boolean;
  data_objetivo?: string | null;
  cor?: string | null;
  icone?: string | null;
  perfil_id?: number | null;
}

export interface ReservaFormValues {
  observacoes: string;   // era nome
  valor: number;
  tipo_reserva: 'normal' | 'objetivo';
  objetivo_valor?: number;
  data_objetivo?: string;
  cor?: string;
  icone?: string;
}
```

### Etapa 4 — Service (src/services/reservasService.ts)

```ts
export async function saveReserva(values: ReservaFormValues, id?: number): Promise<Reserva> {
  const profileId = getActiveProfileId();
  const hoje = new Date();
  const body = {
    observacoes: values.observacoes,
    valor: values.valor,
    data: hoje.toISOString().slice(0, 10),
    mes: hoje.getMonth(),        // 0-indexed, ex: junho = 5
    ano: hoje.getFullYear(),
    tipo_reserva: values.objetivo_valor ? 'objetivo' : 'normal',
    objetivo_valor: values.objetivo_valor ?? null,
    data_objetivo: values.data_objetivo ?? null,
    cor: values.cor ?? '#6366f1',
    icone: values.icone ?? '💰',
    perfil_id: profileId,
  };
  return apiRequest<Reserva>(id ? `/reservas/${id}` : '/reservas', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(body),
  });
}
```

### Etapa 5 — Dialog (src/screens/reservas/ReservaDialog.tsx)

Schema Zod atualizado:
```ts
const schema = z.object({
  observacoes: z.string().min(2, 'Informe o nome'),
  valor: z.coerce.number().min(0),
  icone: z.string().default('💰'),
  cor: z.string().default('#6366f1'),
  objetivo_valor: z.coerce.number().optional(),
  data_objetivo: z.string().optional(),
});
```

Layout do form:
```
Row 1: [ Emoji Picker (grid 6x2) ] | [ Nome da reserva ] | [ Valor inicial ]
Row 2: [ Paleta de cores (10 bolinhas) ]
Divider: "Meta (opcional)"
Row 3: [ Valor-alvo (R$) ] | [ Prazo da meta ]
Row 4: [ ⏱ Você precisa guardar ~R$ X/mês ] ← condicional
```

Cálculo de contribuição (função inline):
```ts
function calcContribuicao(valorAtual: number, meta: number, prazo: string): number | null {
  if (!meta || !prazo) return null;
  const hoje = new Date();
  const dataPrazo = new Date(prazo);
  const meses = (dataPrazo.getFullYear() - hoje.getFullYear()) * 12
    + (dataPrazo.getMonth() - hoje.getMonth());
  if (meses <= 0) return null;
  return Math.ceil((meta - valorAtual) / meses);
}
```

### Etapa 6 — Screen (src/screens/reservas/ReservasScreen.tsx)

Cards atualizados:
```tsx
<Card key={r.id} style={{ borderLeftColor: r.cor ?? '#6366f1' }}
  className="p-4 flex flex-col gap-3 border-l-4">
  <div className="flex items-start gap-3">
    <span className="text-2xl">{r.icone ?? '💰'}</span>
    <div className="flex-1">
      <p className="font-semibold text-slate-950">{r.observacoes}</p>
      ...
    </div>
  </div>
  ...
  {r.objetivo_valor && <ProgressBar valor={r.valor} objetivo={r.objetivo_valor} />}
  {contribuicao && <p className="text-xs text-slate-500">~R$ {contribuicao}/mês necessários</p>}
</Card>
```

### Etapa 7 — Validação

```bash
npm run build
```

## Regras de negócio identificadas

- `mes`/`ano` da reserva = sempre mês/ano do sistema no momento da criação (não do form, não do AppContext)
- `tipo_reserva` derivado automaticamente de `objetivo_valor`: > 0 → 'objetivo', caso contrário → 'normal'
- Saldo check no backend usa `usuario_id` sem filtro de `perfil_id` — saldo é global do usuário (comportamento correto, mantido)
- Reservas existentes sem `cor`/`icone` recebem defaults via SQL DEFAULT na migration
- Reservas existentes com `observacoes = NULL` aparecerão com nome vazio — usuário pode editar para corrigir
- Contribuição mensal é calculada apenas no frontend, não persistida

## Regras multi-tenant e segurança

- `usuario_id` vem do token JWT via `authMiddleware` (`req.usuario.id`) — confiável
- `perfil_id` vem do client mas é apenas para filtro de exibição, não afeta saldo ou isolamento de dados
- Não há vazamento entre usuários — todas as queries filtram por `usuario_id`

## Validações necessárias

- `observacoes`: min 2 caracteres (Zod)
- `valor`: `>= 0` (Zod, coerce)
- `objetivo_valor`: opcional, se preenchido `>= 0`
- `data_objetivo`: opcional, string ISO date
- `cor`: opcional, default '#6366f1'
- `icone`: opcional, default '💰'
- Backend: `data` ainda validada como ISO8601 (obrigatória)
- Backend: `valor` ainda validada como float >= 0

## Testes necessários

### Frontend
- Dialog abre com defaults (💰, cor índigo)
- Salvar sem meta → tipo_reserva = 'normal' no payload
- Salvar com objetivo_valor preenchido → tipo_reserva = 'objetivo' no payload
- Cálculo de contribuição aparece apenas quando objetivo_valor e data_objetivo preenchidos
- Card exibe emoji e borda colorida

### Backend
- POST sem mes/ano → deve aceitar (derivar de data)
- POST com mes/ano → deve usar os valores enviados
- PUT com cor/icone → deve atualizar

### E2E
Não aplicável.

## Comandos de validação sugeridos

```bash
npm run build
```

## Riscos e pontos de atenção

- **Migration em produção:** ALTER TABLE roda automaticamente no próximo restart do backend. Colunas com DEFAULT são safe para tabelas populadas.
- **Dados existentes:** reservas existentes têm `observacoes = NULL` (nome nunca foi gravado corretamente pelo frontend React). Cards aparecerão com nome vazio — não é regressão nova, era bug já existente.
- **Sem perda de dados:** nenhuma coluna é removida ou renomeada no banco. Apenas adição de colunas com DEFAULT.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite

A implementação deve ser considerada pronta quando:

- POST `/api/reservas` retorna 201 sem erro 400
- Nome da reserva é gravado corretamente em `observacoes`
- Colunas `cor` e `icone` existem no banco com DEFAULT
- Form não exibe campo `data`, `descricao` ou toggle de tipo
- Emoji picker e paleta de cor funcionam no dialog
- Contribuição mensal aparece quando meta + prazo preenchidos
- Cards exibem emoji e borda colorida
- `npm run build` passa sem erros

## Observações para a skill implementar

- **Rota ativa é JS:** alterar `backend/routes/reservas.js`, NÃO `backend/src/routes/reserves.ts`
- **Migration:** adicionar em `backend/config/database.js` junto ao bloco existente de reservas (linha ~77)
- **Padrão de cor:** reutilizar o mesmo visual de `CategoriasTab.tsx` (bolinhas com ring ao selecionar)
- **Não alterar** MovimentacaoDialog — fora do escopo
- **Não executar migrations manualmente** — elas rodam via `database.js` no restart do servidor
- Seguir `/AGENT.md`
