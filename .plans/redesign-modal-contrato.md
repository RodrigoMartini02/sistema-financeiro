# Plano de Implementação: Redesign do modal de contrato

## Origem

- Arquivo de especificação: `sistema financas/.portal/tasks/Redesign do modal de contrato.md`
- Data do planejamento: 2026-08-26
- Classificação: `frontend-only`

## Resumo

Redesenhar visualmente o fluxo completo do modal de contrato — `ContratoModal`, `ContratoForm`, `CatalogoServicoRow` (+ sub-`Dialog` de discriminação de serviços), `ContratoAnexos` e `AditivoModal`, todos em `src/screens/config/ClienteDetail.tsx` — seguindo a estrutura visual do mockup fornecido pelo usuário. A base de cores/tipografia do mockup já corresponde aos tokens existentes em `src/ui/dialogFormTokens.tsx` e ao `Dialog` em `src/ui/dialog.tsx`; o trabalho é de realinhamento de markup (remover Tailwind solto que não usa os tokens, aplicar a nova estrutura), mais a promoção de alguns padrões visuais novos do mockup (linha de tabela valor/quantidade/calculado, layout de chips) para `dialogFormTokens.tsx` como tokens/componentes compartilhados. Nenhuma regra de negócio, endpoint ou schema é alterado.

## Escopo

### Dentro do escopo

- Redesign do `ContratoModal` (header, seção "Dados do contrato", seção "Valores", footer com resumo financeiro e ações).
- Redesign do `ContratoForm` (campos identificação/datas, chips de reajuste, chips de representante + criação inline, observações), nos modos edição e leitura.
- Redesign do `CatalogoServicoRow` e do sub-`Dialog` "Discriminação de prestação de serviço".
- Redesign do `ContratoAnexos` (upload, listagem, ver, excluir).
- Redesign do `AditivoModal`.
- Adoção literal dos textos/labels do mockup (ex. "Início fatur.") em vez dos textos atuais, onde divergirem.
- Promoção de novos padrões visuais reutilizáveis (linha de tabela valor/qtd/calculado; layout de chips do mockup) para `src/ui/dialogFormTokens.tsx`, como novos exports (estilos/pequenos componentes), sem alterar os exports existentes usados por `IncomeDialog`/`ExpenseDialog`.
- Preservação de toda a lógica de estado, handlers, `useEffect`, mutations e queries já existentes nesses componentes.
- Preservação dos pontos de ancoragem das guias de onboarding (`useFirstAccessGuide` / `FirstAccessGuideCard`) em todos os componentes redesenhados.

### Fora do escopo

- Qualquer alteração em `IncomeDialog.tsx`, `ExpenseDialog.tsx` ou outros consumidores de `dialogFormTokens.tsx`/`dialog.tsx` — eles não devem ser tocados, mesmo que os novos tokens fiquem disponíveis para uso futuro.
- Alterações em `clientesService.ts`, endpoints de contrato, schema de banco ou regras de cálculo (total anual, saldo de horas, faturando).
- Mudança de comportamento funcional (o que abre o quê, quando um botão fica desabilitado, validações de formulário) — só aparência.
- Testes automatizados novos (o projeto não possui suíte de testes/lint/typecheck configurada em `package.json`).

## Leitura de contexto

- `/AGENT.md` (raiz do repositório) — regras globais multi-tenant/PDF, aplicáveis ao repositório como um todo mas não a este módulo.
- `sistema financas/AGENT.md` — regras específicas deste projeto (mesmo conteúdo do AGENT.md raiz herdado; não há separação real `frontend/AGENT.md`/`backend/AGENT.md` como arquivos dedicados neste projeto — não existem, então não foram lidos).
- `sistema financas/CLAUDE.md` — fluxo obrigatório planejar → aprovar → implementar → finalizar; nunca alterar `.env`; nunca migrations sem confirmação; merge em main sempre requer confirmação explícita a cada vez.
- `sistema financas/.portal/tasks/Redesign do modal de contrato.md` — especificação de entrada desta task.
- `src/screens/config/ClienteDetail.tsx` — arquivo principal, inspecionado por completo (`ContratoForm`, `CatalogoServicoRow`, `ContratoAnexos`, `ContratoModal`, `AditivoModal`, `ClienteDetail`).
- `src/ui/dialog.tsx` — componente `Dialog` compartilhado.
- `src/ui/dialogFormTokens.tsx` — tokens de estilo compartilhados (`C`, `labelStyle`, `fieldInputStyle`, `chipStyle`, `cardStyle`, `MoneyField`, `MoneyFieldSmall`).
- `package.json` (raiz de `sistema financas`) — confirmado que só existem scripts `dev`, `build`, `preview` (sem `lint`/`typecheck`/`test`).

Observação: este projeto é single-tenant (uso pessoal do usuário), apesar do texto genérico multi-prefeitura herdado nos arquivos `AGENT.md`. Não há isolamento de tenant a considerar aqui.

## Impacto por área

### Frontend

- **`ContratoModal`**: reestruturar JSX do header (já delegado ao `Dialog`, sem mudança aí), da seção "Dados do contrato" + "Valores" lado a lado, do botão "Discriminação de prestação de serviço", do bloco de anexos e do footer (resumo Mensal/Total do contrato/Faturando + ações Encerrar/Registrar aditivo/Cancelar/Salvar/Editar), seguindo a disposição do mockup. Preservar exatamente a lógica de `isEditing`, `showServicos`, `pendingServicos`, todas as mutations (`vincularMut`, `atualizarServicoMut`, `desvincularMut`, `criarRepresentanteMut`, `criarServicoMut`) e todos os `useFirstAccessGuide`.
- **`ContratoForm`**: reescrever o grid de campos (número, descrição, assinatura, vencimento, início faturamento), os chips de reajuste (Nada consta/IGPM/IPCA) e representante (Nenhum/lista/+ novo), textarea de observações — tanto no modo edição quanto no modo leitura (bloco de texto estático). Preservar `handleSubmit`, `set`, criação inline de representante e o `useEffect` que auto-seleciona o representante recém-criado.
- **`CatalogoServicoRow`**: redesenhar a linha da tabela (número/nome/valor/checkboxes Contratado-Implantado-Faturando) conforme o mockup, preservando `handleToggle`, `handleValorBlur`, `handleImplantado`, `handleFaturando` e os estados `disabled` (incluindo o tooltip de "Defina o valor/mês primeiro").
- **Sub-`Dialog` "Discriminação de prestação de serviço"**: redesenhar cabeçalho de colunas e área de listagem/scroll, preservando o fluxo de "sem serviços no catálogo" (criação inline de serviço) e a lógica `pendingServicos` vs. `vinculoMap` (contrato novo vs. existente).
- **`ContratoAnexos`**: redesenhar o cabeçalho "Anexos"/botão "Anexar arquivo", os cards de arquivo (nome, tamanho, Ver/Excluir) e os estados de loading/vazio, preservando `uploadMut`, `deleteMut`, `handleView` (blob + `window.open` + revoke).
- **`AditivoModal`**: redesenhar para acompanhar visualmente o novo `ContratoModal` (mesmo grid de campos, footer de ações), preservando `handleSubmit` e a mensagem de aviso ("Encerra o contrato atual e cria um novo...").
- **`dialogFormTokens.tsx`**: adicionar novos exports (estilo/pequeno componente) para os padrões visuais introduzidos pelo mockup sem equivalente hoje — provável linha de "tabela de valores" (rótulo + campo valor + campo quantidade + total calculado, como usado em Mensalidade/Implantação/Hora presencial/Hora remoto) e o layout específico de chip usado no mockup, caso divirja do `chipStyle` atual. Os exports existentes (`C`, `labelStyle`, `fieldInputStyle`, `chipStyle`, `cardStyle`, `MoneyField`, `MoneyFieldSmall`) não devem ser removidos nem ter sua assinatura alterada, para não impactar `IncomeDialog`/`ExpenseDialog`.
- Estados de loading/error/empty existentes (`catalogoQ.isLoading`, `anexosQ.isLoading`, listas vazias) devem ser preservados visualmente de forma consistente com o novo estilo.
- Testes: não aplicável (sem suíte configurada) — validação manual via `/run`.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `sistema financas/src/screens/config/ClienteDetail.tsx`
- `sistema financas/src/ui/dialogFormTokens.tsx` (adições aditivas apenas)

## Estratégia de implementação

Seguindo a decisão técnica de remover-então-aplicar, como passos separados e revisáveis:

1. **`dialogFormTokens.tsx` — adicionar tokens novos**: criar os exports novos (linha de tabela valor/qtd/calculado; ajuste de chip se necessário) sem tocar nos exports existentes. Passo isolado e de baixo risco, testável visualmente em isolamento antes de consumir no modal.
2. **`ContratoForm` — remover estilo antigo**: eliminar qualquer classe/estilo que não seja consistente com os tokens (`labelStyle`/`fieldInputStyle`/`chipStyle`/`C`), tanto no modo edição quanto leitura.
3. **`ContratoForm` — aplicar novo layout**: reescrever o grid de campos, chips e textarea conforme o mockup (incluindo labels literais do mockup), preservando handlers e estado.
4. **`ContratoModal` — remover estilo antigo**: eliminar classes Tailwind soltas (`text-slate-*`, `border-slate-*`, `rounded-xl`/`2xl` fora do padrão) do JSX principal (seção Valores, botão de serviços, footer).
5. **`ContratoModal` — aplicar novo layout**: reescrever a seção "Valores" (cards-resumo + tabela de Mensalidade/Implantação/Hora presencial/Hora remoto usando os tokens novos do passo 1), o footer (resumo financeiro + ações) e a estrutura geral, preservando todas as mutations/estado.
6. **`CatalogoServicoRow` + sub-`Dialog` de serviços — remover e aplicar**: mesmo padrão (remover Tailwind solto, aplicar tabela do mockup), preservando toggles e estados `disabled`.
7. **`ContratoAnexos` — remover e aplicar**: alinhar cards de anexo e botão de upload ao novo estilo.
8. **`AditivoModal` — remover e aplicar**: ajustar para acompanhar visualmente o novo `ContratoModal`, reaproveitando os tokens novos onde fizer sentido (ele já usa os tokens antigos corretamente, então o esforço aqui é menor).
9. **Validação manual via `/run`**: percorrer todos os fluxos listados em "Testes necessários" abaixo.

## Regras de negócio identificadas

Nenhuma regra de negócio nova. As regras existentes que devem ser preservadas (não reimplementadas, apenas mantidas):

- Total anual = `valor_mensal * 12 + implantacao_total + horas_presenciais_saldo_ini * horas_presenciais_valor + horas_remotas_saldo_ini * horas_remotas_valor`.
- "Faturando" = soma de `valor_mensal` dos serviços vinculados com `faturando = true`.
- Checkbox "Faturando" de um serviço só habilita se houver valor/mês > 0.
- Contrato novo usa `pendingServicos` (Map local) até salvar; contrato existente usa `vincularServico`/`atualizarServicoContrato`/`desvincularServico` diretamente.

## Regras multi-tenant e segurança

Projeto não é multi-tenant; sem isolamento de tenant a considerar. Nenhuma alteração de permissão, autorização ou exposição de dados — a task é puramente visual sobre dados já buscados pelos componentes existentes.

## Validações necessárias

Nenhuma validação nova de input é introduzida. As validações existentes devem ser preservadas visualmente (ex. `required` no campo Vencimento, `min`/`step` nos campos numéricos, desabilitar "Faturando" sem valor/mês).

## Testes necessários

### Frontend

Sem suíte automatizada configurada no projeto. Validação manual via `/run`, cobrindo:

- Criar novo contrato (com e sem serviços vinculados antes de salvar).
- Editar contrato existente (alternar leitura → edição → cancelar → editar → salvar).
- Reajuste (Nada consta/IGPM/IPCA) e Representante (chips, seleção, criação inline "+ novo").
- Seção Valores: mensalidade, implantação (total/parcelas/valor por parcela), hora presencial e hora remoto (valor/saldo inicial/saldo atual).
- Sub-modal "Discriminação de prestação de serviço": vincular/desvincular serviço, editar valor, alternar Implantado/Faturando, criar serviço novo quando catálogo vazio.
- Anexos: upload, visualizar (abre em nova aba), excluir.
- Registrar aditivo (abre `AditivoModal`, preenche e salva).
- Encerrar contrato.
- Guias de onboarding (`FirstAccessGuideCard`) continuam aparecendo ancoradas nos campos certos.

### Backend

Não aplicável.

### E2E

Não aplicável — sem infraestrutura de E2E no projeto.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
```

Não há `lint`/`typecheck`/`test` configurados como scripts npm neste projeto — `build` já roda `vite build`, que inclui verificação de tipos via Vite/esbuild na prática de bundling, mas não é um `tsc --noEmit` dedicado. Validação principal será manual via `/run` (que sobe o Vite dev server) e inspeção visual comparando com o mockup.

## Riscos e pontos de atenção

- `dialogFormTokens.tsx` é compartilhado por `IncomeDialog.tsx`, `ExpenseDialog.tsx` e (após este redesign) `AditivoModal`. Qualquer adição deve ser estritamente aditiva (novos exports), nunca alterando assinatura/comportamento dos exports existentes, para não causar regressão visual nesses outros modais.
- `ContratoForm`, `CatalogoServicoRow` e `ContratoAnexos` têm estado local sincronizado via `useEffect` com dependências específicas (ex. `[contrato?.id]`, `[vinculo?.id, servico.id]`) — o redesign deve preservar esses efeitos exatamente, mudando apenas a apresentação, para não introduzir bugs de sincronização de estado.
- Sem suíte de testes automatizados: risco de regressão funcional só ser percebido em teste manual — por isso a lista de fluxos a validar manualmente é extensa e deve ser seguida integralmente antes de considerar a task concluída.
- Ampliar o escopo para `AditivoModal` e `ContratoAnexos` (decisão do usuário) aumenta a superfície tocada nesta entrega frente ao plano inicial mais conservador — mitigado por manter as etapas remover→aplicar pequenas e por componente.
- Usuário ausente durante a execução: `/finalizar` deve parar antes do merge em `main` e aguardar confirmação explícita numa próxima interação, conforme regra absoluta do `CLAUDE.md` deste projeto — mesmo com autorização geral de "faça tudo sozinho".

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — todas as decisões pendentes foram resolvidas nesta rodada.

## Critérios de aceite do plano

- `ContratoModal`, `ContratoForm`, `CatalogoServicoRow`, sub-`Dialog` de serviços, `ContratoAnexos` e `AditivoModal` refletem o layout, hierarquia visual, espaçamento e textos literais do mockup.
- Todos os fluxos funcionais listados em "Testes necessários" continuam operando sem regressão.
- Nenhuma classe/estilo do padrão antigo (Tailwind solto fora dos tokens) permanece nos trechos redesenhados.
- `dialogFormTokens.tsx` só recebeu adições; nenhum export existente foi removido ou teve assinatura alterada.
- `IncomeDialog.tsx` e `ExpenseDialog.tsx` permanecem visualmente inalterados.
- `npm --prefix "sistema financas" run build` conclui sem erros novos.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir `sistema financas/AGENT.md` e `sistema financas/CLAUDE.md`.
- Implementar na ordem: tokens novos → `ContratoForm` (remover/aplicar) → `ContratoModal` (remover/aplicar) → `CatalogoServicoRow`/sub-modal (remover/aplicar) → `ContratoAnexos` (remover/aplicar) → `AditivoModal` (remover/aplicar).
- Cada componente deve ter seu passo de remoção do estilo antigo concluído antes de aplicar o novo estilo — não sobrepor os dois.
- Não alterar `IncomeDialog.tsx`, `ExpenseDialog.tsx` ou qualquer export existente de `dialogFormTokens.tsx`/`dialog.tsx`.
- Não executar migrations (não aplicável nesta task).
- Manter alterações por commit pequenas e focadas por componente, facilitando revisão.
- Validar manualmente via `/run` seguindo a lista de fluxos antes de considerar a task pronta para `/finalizar`.
- Ao chegar em `/finalizar`: fazer commit e push da branch de feature normalmente, mas **parar antes do merge em `main`** — reportar que está pronto para merge e aguardar confirmação explícita do usuário em uma próxima interação, mesmo tendo recebido autorização geral para "fazer tudo sozinho" nesta sessão.
