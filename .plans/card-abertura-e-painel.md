# Card do assistente, abertura da conversa e ordem do painel

Substitui `.plans/card-tratamento-completo.md`, `.plans/assistente-abertura-e-tom.md`
e `.plans/card-do-assistente-caber-em-tela.md`, consolidando as três frentes.

---

## Frente A — Card do assistente

### A1. "Tipo" deixa de ser campo

O card tem um `<select>` "Despesa / Dinheiro que entrou". Em nenhum outro lugar
do sistema o tipo é escolhido dentro do formulário: despesa e receita são telas
separadas, escolhidas antes de abrir.

E não é campo do lançamento — é o que **decide qual lançamento é**, mudando
quais outros campos existem (receita não tem categoria, cartão, parcelas).
Trocar o tipo com o card preenchido descarta metade do deduzido, sem aviso.

Quando o card aparece, a decisão **já foi tomada** em `runSlotFlow`.

**Mudança:** o tipo vira o cabeçalho do card — "Despesa" ou "Dinheiro que
entrou" como título, não select. O card declara o que é.

### A2. Perguntar o tipo só quando houver dúvida

`inferKind` (`financialAssistant.ts:339`) termina com
`return context?.kind ?? 'expense'`: sem palavra-chave, assume despesa.

Verificado com frases reais:

| Frase | Hoje | Como chegou |
|---|---|---|
| "gastei 50 no mercado" | despesa | identificado |
| "recebi 1200 do freela" | receita | identificado |
| "vendi a bicicleta 300" | receita | identificado |
| "mercado 50" | despesa | palpite |
| "uber 25" | despesa | palpite |
| **"freela 800"** | **despesa** | **palpite — errado** |
| **"pix do cliente 500"** | **despesa** | **palpite — errado** |

O card mostra "Despesa" nos sete com a mesma aparência de certeza.

**Mudança:** `inferKind` passa a devolver o tipo **e a origem** — `'intencao'`
(botão do menu), `'texto'` (palavra-chave) ou `'padrao'` (nenhum sinal).

Na origem `'padrao'`, o assistente pergunta antes de montar o card: uma
pergunta, dois chips ("É despesa" / "É dinheiro que entrou"). Com verbo na
frase, o card abre direto, como hoje.

É a única pergunta do fluxo, e só aparece quando há dúvida real.

`inferKind` é usado em `financialAssistant.ts:281` e `:481` além do copilot: a
mudança de assinatura precisa manter os dois funcionando — preferir uma função
nova que devolva a origem, com `inferKind` delegando a ela.

### A3. Campos gravados que o card não deixa editar

`handleSave` grava `numero_nf` e `data_emissao_nf`, mas **não há campo para
eles**. Deduzido errado, não há como corrigir. No fluxo guiado eram
perguntados; ao trocar pelo card, a pergunta saiu e o campo não entrou.

Comparando com `ExpenseFormValues` (`types/finance.ts:95`), entram:

- **Nota fiscal** (número + data de emissão) — só em conta PJ, mesmo critério
  do modal (`ExpenseDialog.tsx:72`)
- **Conta/CNPJ** — só com mais de uma conta (`ExpenseDialog.tsx:232`)
- **Data da compra** — separada do vencimento

Fora: `observacoes` (campo livre, o parser não preencheria) e `anexos` (já
funciona pela foto enviada no chat).

### A4. O card cabe em tela

Pior caso hoje (despesa no crédito, parcelada e paga — 11 linhas):

| Parte | Altura |
|---|---|
| Cabeçalho (`py-3`) | 64px |
| 11 linhas (`py-3.5` + `h-8`) | 660px |
| Botões empilhados (52 + 44 + gap) | 110px |
| **Total** | **834px** |

Viewport útil no celular (844 − header 60 − composer 80): **704px**.

| Mudança | Economia |
|---|---|
| `py-3.5` → `py-2` nas linhas | −132px |
| `h-8` → `h-7` nos campos | −44px |
| Cabeçalho sem subtítulo, `py-2.5` | −24px |
| Botões lado a lado (`grid-cols-[1fr_auto]`, 44px) | −58px |
| Tipo vira título (uma linha a menos) | −60px |

O subtítulo "Nada entra na sua conta sem você confirmar" sai: repete o que o
botão "Não salvar" diz, e fazia sentido quando o card coroava um
interrogatório. O selo de confiança fica — diz quanto veio de dedução.

**Resultado:** 834px → ~636px com os três campos novos incluídos. Cabe com
68px de folga.

---

## Frente B — Abertura da conversa

### B1. Reabrir começa conversa nova

Um efeito (`FinancialAssistant.tsx:607`) restaura a última conversa ao abrir e
faz `setMessages` com o histórico, **substituindo a saudação**. O usuário
reabre e cai no meio de uma conversa antiga, sem saudação e sem chips.

**Mudança:** remover a restauração automática e o estado `hasRestoredLatest`
que só existe para ela. `restoreConversation` fica — é o que o menu do
cabeçalho usa, e o histórico continua a um toque.

### B2. Saudação que reconhece o retorno

Hoje é sempre "Olá! O que vamos fazer hoje?".

Passa a variar pelo tempo desde a última conversa, lido de
`conversationsQuery.data[0]` — já carregado, sem request novo:

| Situação | Saudação |
|---|---|
| Primeira vez | "Oi! Sou seu assistente. O que vamos lançar?" |
| Menos de 1h | "Voltou! O que mais?" |
| Mesmo dia | "Oi de novo! O que vamos lançar?" |
| Dias depois | "Que bom que voltou! O que vamos lançar hoje?" |

Uma linha, seguida dos chips. A variação evita o robô que repete a mesma frase
e o oposto — saudação longa atrasando quem quer lançar e sair.

**Sem o nome do usuário:** repetido a cada abertura cansa e soa automatizado. O
reconhecimento vem do "voltou", que é específico e verdadeiro.

As frases continuam vindo do fluxo, como dado editável:

```ts
interface FlowAbertura {
  saudacao: string;              // fallback e primeira vez
  saudacaoRetorno?: string;      // mesmo dia
  saudacaoRetornoLongo?: string; // dias depois
  opcoes: FlowIntentOption[];
}
```

Opcionais: fluxo gravado sem elas cai na `saudacao` de sempre.

---

## Frente C — Painel

### C1. Cascata vai para depois das categorias

Hoje a cascata está na linha 535 e `MonthCategoriesOverview` na 970, com
contratos, análise do período, série temporal e vários cards entre elas.

`MonthCategoriesOverview` já é o último bloco do painel, então a cascata passa
a encerrar a tela, logo depois dele.

Mover o bloco inteiro (`Card` da cascata, linhas 535-555) para depois de
`MonthCategoriesOverview`. `waterfallSteps` é calculado no topo do componente e
não depende da posição no JSX.

### C2. Categorias começam com as 5 maiores

`MonthCategoriesOverview` lista **todas** as categorias com valor. A lista já
vem ordenada por valor decrescente (linha 44), então o corte é um `slice`.

**Mudança:** mostra 5 por padrão, com botão "Ver todas (N)" que expande, e
"Ver menos" que recolhe. Estado local no componente.

O rodapé já informa "{total} em {N} categorias" — o número continua sendo o
total real, não o exibido, para o corte não esconder a dimensão do gasto.

---

## Testes

Backend (144 atuais):

- inferência devolve origem `'texto'` com verbo e `'padrao'` sem sinal
- "freela 800" e "pix do cliente 500" caem em `'padrao'`
- botão do menu devolve `'intencao'` e vence a frase
- `parseAbertura` preserva `saudacaoRetorno` e `saudacaoRetornoLongo`
- abertura sem os campos novos continua válida
- `inferKind` mantém o comportamento atual nos dois outros chamadores

Frontend: sem runner. `tsc --noEmit`, `vite build`, e na tela: altura do card
em viewport de celular, ordem do painel, expandir/recolher categorias.

---

## Riscos

1. **A2 reintroduz uma ida e volta** — mas só quando a frase não diz o tipo. É
   o oposto do interrogatório que acabou de sair.
2. **`inferKind` tem três chamadores** — mudar a assinatura sem cuidado quebra
   a leitura de anexos (`:481`) e o rascunho direto (`:281`).
3. **`h-7` é o limite de alvo de toque.** Se ficar impreciso no dedo, volta
   para `h-8` — 44px não valem um card difícil de acertar.
4. **B1 muda hábito**: quem reabria e encontrava a conversa anterior vai
   estranhar. Mitigado pelo histórico seguir no menu.
5. **Commit grande**, misturando assistente e painel. Serão commits separados
   por frente, ainda que planejados juntos.

## Fora do escopo

- `observacoes` e `anexos` no card
- Nome do usuário na saudação
- Retomar rascunho não salvo ao reabrir (exige persistir estado não confirmado)
- Reagrupar campos do card em duas colunas
- Mudar o modal de despesa fora do chat
- Reordenar outros blocos do painel
