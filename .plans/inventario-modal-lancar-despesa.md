# Inventário — Modal "Lançar despesa"

Levantamento do que o modal faz hoje (estado do código em 2026-09-28). Serve de referência antes de qualquer redesign.

**Arquivos principais**
- `src/screens/finance/ExpenseDialog.tsx` — casca do modal: seletor de conta, lote, rodapé, atalhos, salvamento.
- `src/screens/finance/ExpenseForm.tsx` — o formulário de uma despesa (usado no topo e em cada item do lote).
- Apoio: `ui/CategoryFloatingSelect.tsx`, `ui/AttachmentSection.tsx`, `utils/categorySuggestions.ts`, `utils/cardDueDate.ts`, `services/expenseSuggestionsService.ts`, `backend/src/routes/expenses.ts` (`GET /suggestions`, `POST /`).
- Consumidores: `DespesasScreen`, `CalendarView`, `LancamentosTable`, `App.tsx`.

---

## 1. Estrutura geral

| Área | Conteúdo |
|---|---|
| Cabeçalho | Título "Nova despesa" ou "Editar despesa" · subtítulo "Registre uma saída financeira" |
| Seletor de conta | Só aparece para quem tem mais de uma conta |
| Formulário do topo | Onde se digita a despesa atual (fundo azulado) |
| Lote | Despesas já adicionadas, empilhadas abaixo, cada uma editável |
| Erro | Mensagem de erro vinda do salvamento |
| Rodapé fixo | Aviso de duplicata, mensagem de status, botões "Adicionar ao lote" e "Registrar/Salvar" |
| Overlay | "Salvando despesa..." / "Salvando despesas... X de N" |

---

## 2. Seletor de conta (PF/PJ)

- Aparece só quando o usuário tem **mais de uma conta** (ex.: dono de PF + PJs).
- Opções mostram nome fantasia / razão social / nome + "(PF)" ou "(PJ)".
- Ao abrir o modal, volta sempre para a **conta ativa** (não guarda a escolha anterior).
- A conta escolhida vale para **o topo e todo o lote** (não há conta por item).
- Define:
  - quais **categorias** e **cartões** aparecem;
  - o `conta_id` gravado;
  - se a conta é **empresa** (libera o bloco de Nota Fiscal);
  - em qual conta nasce uma **categoria criada ali**.

---

## 3. Bloco "O quê" — descrição, categoria, anexos

### 3.1 Descrição (obrigatória)
- Placeholder "Ex: Conta de luz", com autofoco no formulário do topo.

### 3.2 Autocomplete de descrição (histórico real, servidor)
- Dispara com **2+ caracteres**, espera 220 ms.
- Busca no backend (`GET /expenses/suggestions`) as despesas com descrição parecida (`ILIKE`), ordenadas por frequência e data. Mostra até **4**.
- Cada sugestão mostra: descrição · valor · forma de pagamento.
- Ao clicar, a sugestão:
  - preenche a descrição;
  - preenche o **valor**, se ainda estiver vazio;
  - preenche a **categoria**, se ainda estiver vazia;
  - define a **forma de pagamento**.
- Clicar fora fecha a lista. Digitar de novo reabre.

### 3.3 Sugestão automática de categoria (local)
- Dispara com **3+ caracteres**, espera 250 ms, só se ainda **não houver categoria escolhida**.
- Ordem de tentativa:
  1. **Histórico**: uma despesa já carregada cuja descrição contém a digitada (ou o contrário) → usa a categoria dela.
  2. **Palavra-chave**: regras fixas (ex.: "mercado/ifood" → Alimentação; "uber/gasolina" → Transporte; "netflix" → Assinaturas; "das/inss" → Impostos e taxas etc.).
- Aparece como link "Sugerida: **X** · Tab aceita". O clique aplica a categoria.

### 3.4 Categoria
- Seletor flutuante com busca (`CategoryFloatingSelect`):
  - Seção **"Recentes"**: até 5 categorias mais usadas nas despesas carregadas.
  - Lista **A→Z**, com "Outros" sempre por último.
  - **Hierarquia**: uma categoria que tem subcategorias vira só cabeçalho de grupo, que abre e fecha. Nesse caso só as subcategorias podem ser escolhidas.
  - A busca ignora acentos e maiúsculas. Buscar pelo nome do pai traz todas as subs dele.
  - Botão **X** remove a categoria escolhida. Clicar de novo na mesma categoria também desmarca.
  - Fecha com Escape, com clique fora ou com a rolagem do modal.
- **Criar categoria inline**: quando a busca não encontra uma categoria com o nome exato, aparece `+ criar "<texto>"`.
  - Isso abre uma caixa com o nome editável e os botões "Criar" (ou Enter) e X.
  - Ao criar, a categoria já fica selecionada.

### 3.5 Anexos (comprovantes)
- Botão de clipe ao lado da categoria. Fica colorido quando há anexo.
- Aceita vários arquivos: PDF, JPG, PNG, GIF, XLS/XLSX, DOC/DOCX, TXT. Máximo de **10 MB** por arquivo.
- Tipo inválido ou arquivo grande demais mostra mensagem de erro.
- Os anexos aparecem como chips com ícone por tipo, nome, tamanho, botão **baixar** e botão **remover**.
- Os arquivos são salvos em base64 junto com a despesa.

---

## 4. Bloco "Como" — forma de pagamento e cartão

### 4.1 Forma de pagamento (chips)
- **PIX · Dinheiro · Débito · Crédito**.
- **Sugestão automática** (sem travar a escolha manual). É aplicada enquanto o usuário ainda não tocou na forma de pagamento. Ordem de tentativa:
  1. a forma mais usada **na categoria escolhida**;
  2. a forma mais usada **no geral**.
- Depois que o usuário escolhe manualmente (ou aplica uma sugestão do autocomplete), a sugestão automática para.

### 4.2 Cartão (só para Débito ou Crédito)
- Chips com os cartões ativos **compatíveis com a forma** (tipo crédito, débito ou ambos).
- **Cartão sugerido**: o cartão mais usado com aquela forma de pagamento.
- No **crédito**, o rótulo mostra o **limite disponível** do cartão selecionado.
- Se o cartão escolhido deixar de ser compatível (ex.: trocou para débito e o cartão é só crédito), a seleção é limpa.
- Sem cartões cadastrados, mostra "Nenhum cartão cadastrado".
- **Crédito exige cartão**: ao salvar, se há cartões e nenhum foi escolhido, aparece o erro "Escolha o cartão de crédito" e o salvamento é bloqueado. Todos os formulários do lote são conferidos.

---

## 5. Bloco "Valores e datas"

### 5.1 Valor (obrigatório)
- O rótulo muda conforme o tipo de cobrança: **Valor da compra** / **Valor da parcela** / **Valor mensal**.
- Campo monetário com prefixo R$.
- **Modo "sei o preço à vista"** (só no parcelado):
  - o campo passa a receber o **preço à vista**;
  - o valor da parcela é calculado como preço à vista ÷ nº de parcelas;
  - o link "valor da parcela" volta ao modo normal.

### 5.2 Valor pago
- Só fica habilitado quando **"já foi paga"** está marcado. Desmarcar apaga o que foi digitado.

### 5.3 Data da compra
- Padrão: hoje.
- Se o modal foi aberto com **data pré-definida** (ex.: pelo calendário) e não é edição, o campo fica **travado**.

### 5.4 Data do pagamento (vencimento manual)
- Opcional. Quando preenchida, **manda** sobre qualquer cálculo.
- Em branco, o sistema calcula (ver §7).
- Texto de ajuda muda por situação:
  - **não crédito**: "Deixe em branco para o sistema calcular";
  - **crédito**: "A data vem da fatura do cartão — altere só se combinou outra";
  - **crédito já pago**: "o limite do cartão é liberado agora".

### 5.5 Checkbox "Assinale se a despesa já foi paga"

### 5.6 Sinalizações de valor (badges)
- **Juros embutido**: no modo à vista, mostra "+ R$ X de juros embutido (Y%)" = total parcelado − preço à vista.
- **Multa e juros**: pago com valor pago maior que o valor.
- **Desconto**: pago com valor pago menor que o valor.

### 5.7 "Última vez você pagou R$ X"
- Aparece quando a descrição é **exatamente igual** a uma do histórico.

---

## 6. Tipo de cobrança (radio)

| Opção | Campos extras | Efeito ao salvar |
|---|---|---|
| **Não repete** | — | 1 lançamento |
| **Parcelado** | nº de parcelas (2–360) · parcelas **já pagas** | Cria a parcela 1 + parcelas futuras (as "já pagas" entram como pagas) |
| **Recorrente** | "Todo dia __ de cada mês" (escondido no crédito, que segue a fatura) | Cria **12 ocorrências** mensais |

- Reduzir o nº de parcelas ajusta "já pagas" para caber (máx. = total − 1).
- Sair do parcelado desliga o modo "preço à vista".
- **Card de primeiro acesso** (guia) explicando as três opções. Aparece só no formulário do topo, fora da edição, e pode ser dispensado.

---

## 7. Faixa de resumo (aparece com descrição + valor preenchidos)

**Status** (badge):
- **Crédito**: "Entra na fatura" ou "Pago".
- **Outras formas**: "Agendado" (vencimento futuro) ou "Pago".

**Vencimento calculado** (texto), pela primeira regra que se aplica:
1. Data manual → "Vence dd/mm · data informada".
2. Crédito → pela **fatura do cartão**: compra até o fechamento entra na fatura do mês; depois do fechamento, na seguinte. Vence no próximo dia de vencimento → "Vence / Primeira vence dd/mm · fatura <cartão>".
3. Não repete → data da compra: "Pago na hora" (hoje), "Pago em dd/mm" (passado) ou "Vence dd/mm" (futuro).
4. Recorrente → dia escolhido no mês da compra (dias 29–31 caem no último dia em meses curtos).

**Total**:
- **Parcelado**: "Nx de R$ · total R$ · K pagas · próxima vence dd/mm".
- **Recorrente**: "R$ · todo dia N, até cancelar" (no crédito: "todo mês na fatura X").
- **Não repete**: "total R$".

---

## 8. Nota fiscal (só conta empresa)

- Link recolhível "informar nota fiscal" (opcional).
- Campos: **Número da NF** (até 50 caracteres) e **Data de emissão**.

---

## 9. Lote (várias despesas antes de salvar)

- **"+ Adicionar ao lote"** (ou **Shift+Enter** no formulário do topo) move a despesa para a lista abaixo.
- O topo é limpo **preservando data da compra, forma de pagamento e cartão**, e o foco volta para a descrição.
- Nada é gravado ao adicionar. Cada item do lote é um **formulário completo e editável**, com título "Despesa N" e botão **X** para remover.
- Cabeçalho do lote: "No lote · N despesas" + **soma dos valores**.
- O botão principal vira **"Salvar N despesas"** (lote + topo, se preenchido).
- **Fechar o modal descarta o lote.**
- O lote também aparece no modo edição (não é bloqueado).

---

## 10. Detecção de duplicata (aviso não bloqueante)

- Compara com as despesas **já carregadas na tela** (cache do painel), dos **últimos 7 dias**, pelos critérios:
  - mesma descrição (ignora maiúsculas);
  - mesmo valor final;
  - mesma forma de pagamento;
  - mesmo nº de parcelas, se for parcelado.
- Rodapé: "Você já lançou isso em dd/mm — é outra?".
- Um aviso por vez: o do topo; se o topo estiver limpo, o do último item do lote com duplicata.
- Não há botão de confirmação: dá para salvar normalmente.

---

## 11. Rodapé, salvamento e atalhos

- Mensagem "Preencha descrição e valor para registrar." enquanto não dá para salvar.
- Botão principal:
  - **Registrar despesa**;
  - **Salvar N despesas** (com lote);
  - **Salvar alterações** (edição).
- Salvamento **sequencial**, uma despesa por vez, com **overlay de progresso real** ("X de N").
- Depois de salvar: mensagem "✓ Despesa registrada" / "✓ N despesas registradas" e o modal fecha (pelo consumidor).
- **Atalhos**:
  - **Enter**: salva;
  - **Shift+Enter**: adiciona ao lote (só no topo);
  - **Esc**: fecha o modal.

### Regras aplicadas pelo backend ao gravar
- Mês/ano do lançamento vêm da **data de vencimento**.
- Forma **diferente de crédito** com vencimento hoje ou no passado → a despesa **já nasce paga**, mesmo sem marcar o checkbox.
- Pago sem valor pago informado → valor pago = valor.
- O cartão é validado: precisa estar liberado para a conta e ser compatível com a forma de pagamento.

---

## 12. Modo edição

- Carrega os dados da despesa, incluindo anexos, NF e valor pago (só quando ele difere do total).
- A sugestão automática de forma de pagamento fica **desligada** (não sobrescreve a escolha salva).
- O **cartão não é pré-carregado** (`cartao_id` volta vazio). Se for crédito, o cartão precisa ser escolhido de novo para salvar.
- Nº de parcelas e "já pagas" voltam ao padrão (2 / 0), sem refletir a despesa editada.

---

## 13. Comportamentos divergentes encontrados (para considerar no redesign)

Encontrados na leitura do código. Não foram testados na tela.

1. **"Tab aceita" não existe.** O texto da categoria sugerida promete Tab, mas não há tratamento de tecla: só o clique aplica.
2. **Autocomplete sem teclado.** Existe o estado `acIndex`, mas nada o altera: não há navegação por setas. E **Enter com a lista aberta salva a despesa**, em vez de escolher a sugestão. O comentário no `ExpenseDialog` diz o contrário.
3. **Validação zod nunca roda.** O schema exige categoria, mas o salvamento não chama `validate()`/`handleSubmit`. Na prática, **a categoria é opcional** e as mensagens de erro de categoria e valor nunca aparecem.
4. **Esc dentro da busca de categoria fecha o modal inteiro.** O evento sobe até o `onKeyDown` do form, além de fechar o menu.
5. **Rótulo "Data do pagamento"** grava na verdade o **vencimento** (`dataVencimentoManual` → `data_vencimento`).
6. **Duplicata só olha o que está em cache.** Meses não carregados na tela não são comparados.
7. **Props `month`/`year`** continuam na interface, mas não são usadas.
8. **Edição perde cartão, nº de parcelas e "já pagas"** (ver §12).
