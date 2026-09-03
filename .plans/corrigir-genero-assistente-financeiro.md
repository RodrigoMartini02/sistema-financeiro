# Plano de Implementação: Corrigir gênero do nome "Assistente Financeiro"

## Origem

- Arquivo de especificação: pedido direto do usuário no chat ("no assistente não é Assitente financeria, é 'Assitente Financeiro'")
- Data do planejamento: 2026-08-18
- Classificação: `frontend-only`

## Resumo

O componente do assistente financeiro usa hoje o texto "assistente financeira" (concordância no feminino) em aria-labels, título, alt de imagem e no label visível do painel. O usuário pediu a correção para "Assistente Financeiro" (masculino). Este plano corrige a concordância de gênero nas 6 ocorrências encontradas em `FinancialAssistant.tsx`, sem alterar nenhuma lógica.

## Escopo

### Dentro do escopo

- Corrigir "financeira" → "financeiro" (ou "Financeiro", conforme capitalização já usada em cada string) nas 6 ocorrências de `src/components/financial-assistant/FinancialAssistant.tsx`:
  - L596: `aria-label="Abrir assistente financeira"` → `"Abrir assistente financeiro"`
  - L597: `title="Assistente financeira"` → `"Assistente Financeiro"`
  - L610: `aria-label="Fechar assistente financeira"` → `"Fechar assistente financeiro"`
  - L618: `aria-label="Assistente financeira"` → `"Assistente Financeiro"`
  - L625: `alt="Avatar da assistente financeira"` → `"Avatar do assistente financeiro"` (ajusta também o artigo "da" → "do")
  - L630: `<p>Assistente financeira</p>` → `<p>Assistente Financeiro</p>`

### Fora do escopo

- Qualquer outra ocorrência de "financeira" no projeto que seja adjetivo correto em outro contexto (ex.: "gestão financeira", "saúde financeira", "rotina financeira") — confirmado via grep que essas não se referem ao nome do assistente
- Lógica, comportamento, dados ou qualquer outro componente do assistente financeiro
- Outros textos do painel/UI não relacionados ao nome do assistente

## Leitura de contexto

- `/AGENT.md` (raiz) — já lido em planejamento anterior nesta sessão. Focado em backend/multi-tenant; sem impacto aplicável a esta correção textual frontend-only.
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` como arquivos separados neste projeto.
- `src/components/financial-assistant/FinancialAssistant.tsx` — localizado via grep (`Assistente`/`financeira`, case-insensitive) e confirmado como único arquivo com as ocorrências relevantes.
- Grep amplo por "financeira" em todo `src/` confirmou que as demais ocorrências (TermosModal, SobrePage, PlanosPage, FuncionalidadesPage, FinanceDashboard, ExpenseDialog, IncomeDialog, HomePage) são adjetivo em outro contexto, não relacionadas ao nome do assistente — não devem ser tocadas.

## Impacto por área

### Frontend

- `src/components/financial-assistant/FinancialAssistant.tsx`: troca de 6 strings estáticas (aria-label, title, alt, texto visível). Sem mudança de props, hooks, query keys, estados ou lógica de renderização.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/components/financial-assistant/FinancialAssistant.tsx` (único arquivo)

## Estratégia de implementação

1. Editar as 6 linhas identificadas em `FinancialAssistant.tsx`, mantendo a capitalização já usada em cada contexto (title/label visível em "Assistente Financeiro"; aria-labels em minúsculo "assistente financeiro", exceto onde o texto já era só o nome próprio)
2. Rodar `npx tsc --noEmit`
3. Rodar `npx vite build`

## Regras de negócio identificadas

Nenhuma — correção puramente textual, sem regra de negócio associada.

## Regras multi-tenant e segurança

Não aplicável — mudança isolada de string estática no frontend, sem leitura/escrita de dados.

## Validações necessárias

Nenhuma validação de formulário nova.

## Testes necessários

### Frontend

- Verificação visual manual: abrir o assistente financeiro no painel e confirmar que o label "Assistente Financeiro" aparece corretamente no cabeçalho do painel de chat
- Confirmar via leitor de tela/inspeção que os aria-labels (abrir/fechar assistente) refletem o texto corrigido

### Backend

Sem impacto esperado.

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

(executados a partir de `c:\Users\rodri\Music\Particular\sistema financas`)

## Riscos e pontos de atenção

- Risco técnico nulo — mudança de string estática, sem lógica envolvida.
- Único ponto de atenção: garantir que todas as 6 ocorrências fiquem consistentes entre si (mesma forma "Assistente Financeiro"/"assistente financeiro" conforme o contexto de cada string), evitando misturar masculino e feminino no mesmo componente.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- As 6 ocorrências de "assistente financeira"/"Assistente financeira"/"da assistente financeira" em `FinancialAssistant.tsx` passam a usar a forma masculina correta
- Nenhum outro arquivo ou ocorrência de "financeira" (adjetivo em outros contextos) é alterado
- `npx tsc --noEmit` e `npx vite build` passam sem erros

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Único arquivo com mudança de código: `src/components/financial-assistant/FinancialAssistant.tsx`
- Não expandir escopo para outras ocorrências de "financeira" no projeto (são adjetivos corretos em outros contextos, não relacionados ao nome do assistente)
- Ao terminar localmente, seguir o fluxo padrão do projeto (`/finalizar`) e perguntar sobre envio a produção
