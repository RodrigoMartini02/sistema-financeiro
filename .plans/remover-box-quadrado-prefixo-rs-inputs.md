# Plano de Implementação: Remover box quadrado do prefixo "R$" nos inputs de valor

## Origem

- Data do planejamento: `2026-09-06`
- Classificação: `frontend`
- Projeto: `sistema financas` (não afeta `escalacao futebol`)

## Resumo

O usuário considera feia e desnecessária a customização visual atual do prefixo "R$" nos campos de valor monetário: um container com borda (`border: 1px solid`) envolvendo o `<span>R$</span>` e o `<input>` juntos, criando um efeito de "caixa" em volta do texto digitado. Pedido explícito: **eliminar completamente** essa customização do sistema — não trocar por outro estilo, apenas remover o wrapper/box e deixar o campo o mais simples possível (input padrão do sistema, com "R$" como prefixo textual simples, sem container próprio).

## Escopo

### Dentro do escopo

- `src/ui/dialogFormTokens.tsx`:
  - `MoneyField` (linhas 129-145) e `MoneyFieldSmall` (linhas 147-168): remover o `<div className="money-field" style={{ border, borderRadius, padding, background, ... }}>` que envolve `<span>R$</span>` + `<input>`. Substituir por uma estrutura sem box próprio, usando o input padrão do sistema (mesma borda/estilo dos demais campos de texto do formulário) com "R$" como prefixo simples.
  - `valuesInlineFieldStyle` / `valuesInlineInputStyle` (linhas ~200-208): mesma remoção de conceito, usada em `ClienteDetail.tsx`.
- `src/screens/config/ClienteDetail.tsx`: remover o wrapper `valuesInlineFieldStyle` + `<span>R$</span>` duplicado manualmente em 4 pontos (Mensalidade, Implantação, Hora presencial, Hora remoto), substituindo pela mesma estrutura simplificada.
- Nenhuma mudança de comportamento/dados — só remoção da customização visual (box/borda) do prefixo "R$". Formatação de moeda, cálculo de centavos e validações permanecem intactos.

### Fora do escopo

- `ExpenseDialog.tsx`, `IncomeDialog.tsx`, `PaymentModal.tsx`, `ReservasPanel.tsx`, `CatalogoTab.tsx`: **não precisam de edição direta** — todos consomem `MoneyField`/`MoneyFieldSmall`, então herdam a correção automaticamente ao mudar a origem em `dialogFormTokens.tsx`.
- Textos/labels/opções com "R$" que não têm box (ex: `CartaoTab.tsx:214`, `BudgetPanel.tsx:212`, valores exibidos em dashboards/gráficos) — já são texto simples, nada a remover.
- Projeto `escalacao futebol` — investigado e confirmado que não tem essa customização (único "R$" lá é um placeholder de texto em `Sorteio.jsx`, fora de escopo).
- Qualquer alteração de banco de dados, backend ou `.env`.

## Leitura de contexto

- `src/ui/dialogFormTokens.tsx` — definição de `MoneyField`, `MoneyFieldSmall`, `moneyInputStyle`, `valuesInlineFieldStyle`, `valuesInlineInputStyle`
- `src/screens/config/ClienteDetail.tsx` — 4 usos manuais do padrão duplicado

## Impacto por área

### Frontend

- **`src/ui/dialogFormTokens.tsx:129-168`**: reescrever `MoneyField` e `MoneyFieldSmall` sem o `<div>` com borda própria — usar o mesmo padrão visual dos outros inputs de texto do formulário (provavelmente reaproveitando a classe/estilo de input padrão já usado em `dialogFormTokens.tsx` para campos de texto simples, mantendo consistência com o resto do form).
- **`src/ui/dialogFormTokens.tsx:200-208`**: remover ou simplificar `valuesInlineFieldStyle`/`valuesInlineInputStyle` de forma equivalente.
- **`src/screens/config/ClienteDetail.tsx:783-790, 824-831, 865-872, 900-907`**: atualizar as 4 ocorrências para a nova estrutura sem box, evitando repetir manualmente o mesmo JSX 4x — se fizer sentido, extrair um pequeno helper compartilhado em vez de copiar/colar novamente.
- Nenhum outro arquivo precisa de edição (consumidores de `MoneyField`/`MoneyFieldSmall` herdam a mudança automaticamente): `ExpenseDialog.tsx`, `IncomeDialog.tsx`, `PaymentModal.tsx`, `ReservasPanel.tsx` (x2), `CatalogoTab.tsx`.

### Backend / Banco de dados / Infra

Sem impacto. Mudança puramente visual no frontend.

## Arquivos afetados

- `src/ui/dialogFormTokens.tsx` (edição direta)
- `src/screens/config/ClienteDetail.tsx` (edição direta, 4 pontos)

## Estratégia de implementação

Seguindo a regra de "redesign: remover então aplicar" — remover completamente a estilização antiga antes de aplicar a nova, sem deixar código morto/sobreposto:

```
1. Em dialogFormTokens.tsx: remover o wrapper com borda de MoneyField e MoneyFieldSmall,
   e o par valuesInlineFieldStyle/valuesInlineInputStyle equivalente
2. Aplicar a nova estrutura simplificada (input único com prefixo "R$" textual, sem box),
   reaproveitando o estilo padrão de input já existente no arquivo
3. Em ClienteDetail.tsx: remover as 4 ocorrências do wrapper antigo (span R$ + valuesInlineFieldStyle)
4. Aplicar a nova estrutura nos 4 pontos, evitando duplicação (helper único se fizer sentido)
5. Rodar npx vite build para validar
6. Testar visualmente no navegador: ExpenseDialog, IncomeDialog, PaymentModal,
   ReservasPanel, CatalogoTab, ClienteDetail — conferir que o "R$" aparece sem box
   e o campo mantém alinhamento/legibilidade
```

## Validações necessárias

- Nenhuma mudança de comportamento: valor digitado, máscara de centavos e onChange devem continuar funcionando exatamente como antes
- Visual: "R$" deve aparecer como prefixo simples (sem borda/box separado), input com aparência consistente com os demais campos do formulário
- Conferir em todos os 8 pontos de consumo de `MoneyField`/`MoneyFieldSmall` + 4 pontos do `ClienteDetail.tsx`

## Comandos de validação sugeridos

```bash
npx vite build
```

## Riscos e pontos de atenção

- **Baixo:** é mudança puramente visual/CSS, sem tocar em lógica de formatação de valor ou submissão de formulário
- **Médio:** `moneyInputStyle` atual tem `border: 'none'` porque a borda vem do container pai — ao remover o container, o input precisa ganhar sua própria borda (reaproveitar estilo de input padrão do sistema para não quebrar consistência visual)
- Testar especialmente o campo "Valor pago" (`MoneyFieldSmall`, com estado `disabled`) para garantir que o visual de desabilitado continue claro sem o box

## Critérios de aceite

- Nenhum `<div>`/container com `border` envolvendo `<span>R$</span>` + `<input>` restante no código
- "R$" aparece como prefixo textual simples em todos os campos de valor do sistema
- Nenhuma duplicação de JSX do padrão antigo ou novo (ClienteDetail.tsx não deve repetir manualmente 4x se puder reaproveitar um único ponto)
- Build do frontend passa sem erros
- Validação visual manual nos 6 componentes que usam esses campos
