# Task: Reformular modal de despesa — separar valor da compra do valor pago e tornar status/forma de pagamento explícitos

## Contexto

O sistema `sistema financas` (frontend React + TypeScript + Vite + Tailwind, backend Express.js + TypeScript + PostgreSQL) possui um modal de criação/edição de despesa em [ExpenseDialog.tsx](sistema financas/src/screens/finance/ExpenseDialog.tsx).

Esse modal já possui lógica de juros/desconto (`jurosDescontoAberto`, `valor_final`, `efetivoFinal`) e de recorrência (`repeticao`: `'nao' | 'parcelas' | 'mensal'`), além de derivar automaticamente se a despesa está paga (`pagoDerivado`) e usar `'pix'` como forma de pagamento padrão.

Arquivos verificados:
- [sistema financas/src/screens/finance/ExpenseDialog.tsx](sistema financas/src/screens/finance/ExpenseDialog.tsx) — componente principal do modal (formulário, schema Zod, lógica de derivação de vencimento/status/valor).

## Problema

1. **Label do campo de valor é ambíguo.** O campo hoje rotulado "VALOR PAGO" (`valorLabel`, linha 356) na prática representa o valor original da compra/parcela/mensalidade (`valor_original`), não necessariamente o que foi efetivamente pago. Não existe, na tela principal, um campo distinto e visível para registrar quanto foi de fato pago quando esse valor diverge do valor da compra (ex: pagamento em atraso com juros, ou com desconto por antecipação). Hoje esse ajuste só existe via `jurosDescontoAberto`/`valor_final`, aberto automaticamente por heurística de datas (linhas 323-327), não como um campo do usuário claramente rotulado como "valor pago".

2. **Status "pago" é 100% derivado, sem controle manual.** Em `pagoDerivado = statusDerivado.label === 'Pago'` (linha 312), o sistema infere se a despesa está paga a partir de datas e forma de pagamento — não existe um checkbox para o usuário confirmar/forçar esse status manualmente. Isso é um problema especialmente ao registrar despesas retroativas (com atraso), onde o usuário sabe que já pagou mas o sistema pode não inferir corretamente.

3. **Forma de pagamento tem default automático para PIX.** Tanto no formulário em branco (`formaPagamento: 'pix'`, linha 106) quanto ao editar (`expense?.formaPagamento ?? 'pix'`, linha 261), o valor inicial é sempre PIX. Isso é problematico porque uma despesa pode ser registrada antes de ser paga, ou paga por outro meio (dinheiro, débito, crédito), e o preenchimento automático induz erro quando o usuário esquece de alterar.

4. **Botão "+ Adicionar ao lote" tem estilo visual inconsistente.** Nas linhas 946-955, o botão é renderizado sem preenchimento (`background: transparent, border: none, boxShadow: none`), parecendo um link de texto, enquanto o botão "Salvar alterações"/"Registrar despesa" (linhas 956+) tem estilo de botão preenchido. Isso cria inconsistência visual e hierarquia pouco clara entre as duas ações.

5. **Campo de data percebido como confuso.** O label "DATA DA COMPRA" (linha 792) já é estruturalmente separado do campo de descrição (são blocos distintos no formulário), mas visualmente algo no espaçamento/estilo está gerando confusão de que a data faz parte da descrição. O usuário sugeriu resolver isso via diferenciação de cor, não reestruturação do campo.

## Objetivo

Tornar o preenchimento de valor, status de pagamento e forma de pagamento explícitos e sob controle do usuário — sem automatismos que assumam PIX ou status "pago" — permitindo registrar corretamente despesas pagas em atraso (com juros/desconto) ou despesas ainda não pagas. Também alinhar a consistência visual dos botões de ação e reduzir a confusão percebida entre o campo de data e o campo de descrição.

## Decisão Técnica Desejada

- Renomear o campo atualmente rotulado "VALOR PAGO" para "VALOR DA COMPRA" (mapeado a `valor_original`), representando o valor de referência/original da despesa.
- Adicionar um campo distinto "VALOR PAGO" (mapeado a `valor_final`), para uso quando o valor efetivamente pago diverge do valor da compra (juros por atraso ou desconto por antecipação). A relação desse novo campo com a lógica já existente de `jurosDescontoAberto`/`efetivoFinal`/`jurosCalculado`/`descontoCalculado` deve ser avaliada durante o planejamento — o objetivo é que o usuário tenha um campo claro para isso, não necessariamente descartar a lógica de cálculo automático de diferença já existente.
- Adicionar um checkbox "Pago" que o usuário controla manualmente, substituindo (ou complementando, a decidir no planejamento) a inferência automática hoje feita em `pagoDerivado`/`statusDerivado`. Deve funcionar bem tanto para lançamento na hora quanto para registro retroativo de despesa já paga.
- Remover o valor padrão automático `'pix'` de `formaPagamento` — o campo deve iniciar sem seleção (ou em estado neutro), obrigando escolha explícita do usuário.
- Alinhar o botão "+ Adicionar ao lote" ao mesmo estilo visual (formato preenchido) do botão "Salvar alterações"/"Registrar despesa", mantendo a distinção de hierarquia (ex: cor/ênfase) mas com o mesmo formato de botão.
- Ajustar o campo "DATA DA COMPRA" para se diferenciar visualmente do campo de descrição por cor, sem alterar a estrutura/posição atual dos campos.

## Escopo Funcional

### Dentro do escopo

- Renomear label do campo de valor original para "Valor da compra".
- Criar/expor campo "Valor pago" distinto e vinculado a `valor_final`.
- Adicionar checkbox "Pago" controlado pelo usuário.
- Remover default automático de forma de pagamento (`'pix'`) nos dois pontos identificados (formulário novo e edição).
- Restyle do botão "+ Adicionar ao lote" para o mesmo formato do botão de salvar.
- Diferenciação visual por cor do campo "DATA DA COMPRA" em relação ao campo de descrição.

### Fora do escopo inicial

- Alterar a lógica de recorrência (`repeticao`: parcelas/mensal) além do necessário para o checkbox "Pago" funcionar corretamente por ocorrência, se aplicável.
- Alterar o backend/schema do banco de dados, salvo se o planejamento identificar que `pago`/`valor_final` precisam de ajuste de contrato — a ser avaliado.
- Redesenho completo do modal além dos pontos listados.
- Alterar a lógica de vencimento de fatura de cartão (`calcularVencimentoFatura`) ou o texto de recorrência mensal (`mensalTexto`).

## Requisitos de Frontend

- Ajustar [ExpenseDialog.tsx](sistema financas/src/screens/finance/ExpenseDialog.tsx): schema Zod (`schema`, linhas 28-44), `defaultValues` do `useForm` (linhas 102-109), `resetForm` (linhas 379-391), `toFormValues` (linhas 358-377) e o JSX dos campos afetados.
- Avaliar se `valorLabel` (linha 356) precisa ser reformulado para refletir os dois campos (valor da compra vs. valor pago) em vez de um único label condicional.
- Avaliar se `pagoDerivado`/`statusDerivado` (linhas 302-312) devem ser substituídos, ou mantidos como sugestão/default inicial do checkbox que o usuário pode sobrescrever.
- Garantir que a remoção do default `'pix'` não quebre a validação do schema (`formaPagamento: z.string().min(1)`, linha 37) — avaliar se o formulário deve bloquear submit sem forma de pagamento escolhida ou permitir vazio até o pagamento ser confirmado.
- Preservar o comportamento existente de sugestão de forma de pagamento vinda de `expenseSuggestionsService` (linhas 201-204), desde que não force PIX como fallback.

## Requisitos de Backend

Sem impacto backend identificado inicialmente. Os campos `valor_original`, `valor_final` e `pago` já existem no contrato (`ExpenseFormValues`, tipo em `src/types/finance.ts` — não verificado neste levantamento). Caso o planejamento identifique necessidade de novo campo ou mudança de contrato/validação no backend, isso deve ser tratado como sub-item explícito do plano.

## Requisitos de Banco de Dados

Sem alteração de banco identificada inicialmente. Caso `pago` deixe de ser um valor puramente derivado no frontend e passe a ser persistido de forma diferente, verificar se a coluna correspondente já existe e se aceita esse uso (a identificar durante o planejamento).

## Requisitos de Segurança e Multi-Tenant

Projeto não é multi-tenant; sem isolamento de tenant a considerar. O `AGENT.md` do `sistema financas` contém um template genérico de regras multi-tenant/prefeitura que não corresponde à realidade deste projeto (não há sinais de `tenant_id`, RLS ou isolamento por organização no código relevante) — isso deve ser desconsiderado para esta task. Considerar apenas validação normal de entrada (valores monetários não negativos, datas válidas) e permissão do usuário autenticado sobre a própria despesa.

## Requisitos de Migração ou Compatibilidade

- Despesas já existentes no banco possuem `formaPagamento` preenchido (histórico com PIX por default) — a remoção do default não deve afetar exibição/edição de despesas já salvas, apenas o formulário de preenchimento novo.
- Avaliar se despesas antigas sem `valor_final` continuam sendo exibidas corretamente com o novo campo "Valor pago" opcional.
- Manter compatibilidade com o fluxo de lote (`batch`/`+ Adicionar ao lote`) — o restyle do botão é apenas visual, não deve alterar a lógica de `doSave`/`podeSalvar`/`hasBatch`.

## Requisitos de Testes

### Frontend

- Testar que o formulário não pré-seleciona forma de pagamento ao abrir em branco.
- Testar que o checkbox "Pago" pode ser marcado/desmarcado manualmente e que o valor enviado em `toFormValues` reflete a escolha do usuário, não apenas a inferência automática.
- Testar preenchimento de "Valor da compra" e "Valor pago" com valores diferentes (cenário de juros por atraso e cenário de desconto).
- Testar que o botão "+ Adicionar ao lote" mantém a função de adicionar ao lote após o restyle.

### Backend

Não aplicável inicialmente.

### E2E

Não aplicável inicialmente.

## Arquivos Provavelmente Afetados

### Frontend

- `sistema financas/src/screens/finance/ExpenseDialog.tsx`
- Possivelmente `sistema financas/src/types/finance.ts` (tipo `ExpenseFormValues`) — a identificar durante o planejamento.
- Possivelmente `sistema financas/src/ui/dialogFormTokens.ts` (tokens de estilo `chipStyle`, `cardStyle` etc. usados no restyle do botão e do campo de data) — a identificar durante o planejamento.

### Backend

- A identificar durante o planejamento, se o contrato de `pago`/`valor_final` precisar de ajuste.

### Banco de Dados

- A identificar durante o planejamento, se necessário.

## Critérios de Aceite

- O campo antes rotulado "VALOR PAGO" agora exibe "VALOR DA COMPRA" e continua mapeado ao valor original da despesa.
- Existe um campo "VALOR PAGO" distinto, usável para registrar valor com juros ou desconto em relação ao valor da compra.
- Existe um checkbox "Pago" que o usuário controla manualmente, funcional tanto para lançamento na hora quanto para registro retroativo.
- O formulário não seleciona PIX (nem qualquer forma de pagamento) automaticamente por padrão.
- O botão "+ Adicionar ao lote" tem o mesmo formato visual (preenchido) do botão "Salvar alterações"/"Registrar despesa".
- O campo "DATA DA COMPRA" é visualmente diferenciado por cor do campo de descrição, sem mudança de posição/estrutura.
- Nenhuma regressão nos fluxos existentes de recorrência (parcelas/mensal), sugestão de categoria/forma de pagamento, ou salvamento em lote.

## Perguntas Para o Planejamento

- O campo "Valor pago" deve reaproveitar a lógica existente de `jurosDescontoAberto`/`valor_final`/`jurosCalculado`/`descontoCalculado`, ou deve ser um campo simples e independente dessa lógica de auto-abertura por diferença de data?
- O checkbox "Pago" deve substituir totalmente `pagoDerivado`, ou usar `statusDerivado` apenas como valor inicial sugerido (pré-marcado) que o usuário pode desmarcar/marcar livremente?
- Para despesas recorrentes ("Parcelas" ou "Todo mês" — nomenclatura a ser trocada para "Recorrente" conforme decisão já tomada em conversa com o usuário, fora desta task específica caso já tratada separadamente), o checkbox "Pago" e o campo "Valor pago" se aplicam à ocorrência atual ou à despesa inteira?
- Sem default de forma de pagamento, o submit deve ficar bloqueado até o usuário escolher, ou deve permitir salvar sem forma de pagamento quando a despesa ainda não foi paga (`Pago` desmarcado)?
- Existe um design/mockup de referência para a diferenciação de cor do campo "DATA DA COMPRA", ou fica a critério do planejamento/implementação seguir os tokens de cor já usados em `dialogFormTokens.ts`?

## Instruções Para a Skill Planejar

- Use este arquivo como especificação de entrada.
- Leia `sistema financas/AGENT.md` e `sistema financas/CLAUDE.md`, mas desconsidere as seções de multi-tenant/prefeitura do `AGENT.md`, que não se aplicam a este projeto (ver "Requisitos de Segurança e Multi-Tenant" acima).
- Inspecione `sistema financas/src/screens/finance/ExpenseDialog.tsx` e os arquivos relacionados (`src/types/finance.ts`, `src/ui/dialogFormTokens.ts`) antes de escrever o plano.
- Classifique a implementação como `frontend`, salvo se a investigação mostrar necessidade de mudança de contrato/backend.
- Não implemente código durante o planejamento.
- Não instale dependências durante o planejamento.
- Não execute migrations.
- Gere um plano em `.plans/` (padrão já usado neste projeto) com etapas pequenas, revisáveis e seguras — considerando que o banco pode estar apontando para produção.
