# Plano de Implementação: Redesign estrutural do modal de contrato

## Origem

- Arquivo de especificação: `sistema financas/.portal/tasks/Redesign estrutural do modal de contrato.md`
- Data do planejamento: 2026-08-27 (revisado após redução de escopo solicitada pelo usuário durante o planejamento — a task original propunha migração de schema para uma tabela genérica de itens; o usuário optou por descartar isso e manter os 4 campos fixos existentes)
- Classificação: `frontend-only`

## Resumo

Reestrutura a tabela de "Valores" do `ContratoModal` para o formato visual de proposta comercial (Item/Descrição/Und/Qtde/Valor unitário/Calculado), com fórmula única `valor_unitário × quantidade` em todas as 4 linhas — incluindo Implantação, que inverte seu fluxo de preenchimento (usuário passa a digitar o valor da parcela, não mais o total). As 4 linhas continuam sendo os mesmos campos fixos do `Contrato` já existentes hoje (sem tabela nova, sem migration). "Remover uma linha" significa zerar os campos correspondentes e ocultá-la visualmente da tabela; um controle "+ [nome da linha]" permite reincluí-la a qualquer momento. Inclui também: linha de totais (Total do contrato/Mensal/Faturando) dentro da própria tabela sem "SUBTOTAL", `<select>` para Reajuste/Representante sem criação inline, Observações ao lado, footer fixo (`scrollBody={false}`), e reposicionamento do botão de Discriminação de serviços para a linha do título "Valores".

## Escopo

### Dentro do escopo

- Tabela de Valores redesenhada: colunas Descrição/Und/Qtde/Valor unitário/Calculado, para as 4 linhas existentes (Mensalidade, Implantação, Hora presencial, Hora remoto).
- Fórmula única `valor_unitário × quantidade = calculado` para todas as 4 linhas; Implantação passa a receber valor da parcela + quantidade de parcelas (em vez de total + parcelas).
- Botão "remover" (`⊗`) por linha, que zera os campos correspondentes daquela linha e a oculta visualmente da tabela.
- Controle "+ [nome da linha]" (ex. "+ Implantação") para reincluir uma linha atualmente ausente/zerada, exibido apenas para as linhas que não estão presentes.
- Linha de totais (Total do contrato / Mensal / Faturando) dentro da tabela, sem "SUBTOTAL".
- Itens de banco de horas (Hora presencial/remoto) mostram saldo atual restante como linha secundária na célula "Calculado".
- Reajuste e Representante como `<select>` empilhados; Observações ao lado; remoção da criação inline de Representante.
- Footer do modal fixo (`scrollBody={false}` no `Dialog`), sem rolar com o conteúdo.
- Reposicionamento do botão "Discriminação de prestação de serviço" para a linha do título "Valores".

### Fora do escopo

- Qualquer tabela nova no banco, migration, ou mudança de schema em `contratos`.
- Itens livres/adicionáveis pelo usuário além das 4 linhas já existentes (descartado nesta rodada).
- Qualquer mudança em `contratos_servicos`, `CatalogoServicoRow`, `gerarPrevistas`, ou no sub-modal de Discriminação de serviços.
- Mudança no backend (`contracts.ts`, `incomes.ts`) — a rota `criarReceitaImplantacao` já calcula `parcelas × valorParcela`, que é exatamente a fórmula usada pelo novo fluxo do frontend, então não precisa de alteração.
- Remoção do campo `data_assinatura` — task separada.
- Alterações no filtro de período do dashboard — task separada.

## Leitura de contexto

- `/AGENT.md` (raiz) e `sistema financas/AGENT.md` — regras do projeto; sem impacto de banco/multi-tenant nesta versão do plano.
- `sistema financas/CLAUDE.md` — fluxo obrigatório planejar → aprovar → implementar → finalizar; nunca `.env`; nunca migrations sem confirmação.
- `sistema financas/.portal/tasks/Redesign estrutural do modal de contrato.md` — especificação de entrada (nota: a task original propunha tabela genérica de itens; este plano reflete a redução de escopo pedida pelo usuário durante o planejamento, mantendo o restante da task).
- `src/screens/config/ClienteDetail.tsx` — `ContratoModal`, `ContratoForm`, `AditivoModal` (inspecionados nesta sessão e em sessão anterior de redesign visual).
- `src/services/clientesService.ts` — tipo `Contrato` (sem alteração de campos nesta task).
- `backend/src/routes/contracts.ts` — `criarReceitaImplantacao` (linhas ~653-655): calcula `valorTotal = parcelas * valorParcela` a partir de `implantacao_parcelas`/`implantacao_valor_parcela` — com a inversão do fluxo de preenchimento no frontend (usuário digita valor da parcela em vez de total), essas mesmas duas colunas continuam existindo e recebendo os mesmos dados, então esta rota **não precisa de nenhuma alteração**.
- `backend/src/routes/incomes.ts` (linhas 143-152): débito transacional de saldo de horas via `UPDATE contratos SET horas_presenciais_saldo_atual = ...` — identificado em investigação anterior; **sem impacto nesta versão do plano**, pois as colunas de horas permanecem exatamente como estão hoje.

## Impacto por área

### Frontend

- **`ContratoModal`** (`src/screens/config/ClienteDetail.tsx`): reescrever a seção "Valores" como tabela com colunas Descrição/Und/Qtde/Valor unitário/Calculado para as 4 linhas fixas. Cada linha visível ganha um botão "remover" (`⊗`) que zera os `useState` correspondentes e a oculta da tabela (ex. clicar no `⊗` da linha Implantação zera `implValorParcela`/`implParc` e a linha some). Para cada linha ausente (valores zerados), exibir um controle "+ [nome da linha]" (ex. "+ Mensalidade", "+ Implantação", "+ Hora presencial", "+ Hora remoto") que a reinsere na tabela, pronta para edição.
- Inverter a semântica do estado de Implantação: `implValorParcela` (novo, valor da parcela) substitui `implTotal` como campo principal de entrada; `Calculado = implValorParcela × implParc` (total).
- Linha de totais (Total do contrato = soma dos "Calculado" das linhas atualmente visíveis/preenchidas; Mensal = `valMensal`; Faturando = inalterado, de `contratos_servicos`) movida para dentro da tabela, sem "SUBTOTAL", substituindo o footer numérico atual.
- **`ContratoForm`**: Reajuste e Representante viram `<select>` empilhados numa coluna; Observações move para coluna ao lado; remover `showRepForm`, `onCreateRepresentante`, `isCreatingRepresentante`, e a mutation `criarRepresentanteMut` em `ContratoModal`.
- **`Dialog` do `ContratoModal`**: `scrollBody={false}`; reestruturar JSX em área rolável (Dados do contrato + Valores + botão de serviços + Anexos) + footer fixo (ações), seguindo o padrão já usado no sub-modal de serviços no mesmo arquivo.
- Reposicionar o botão "Discriminação de prestação de serviço" para a linha do título "Valores" (canto direito), mantendo o badge de contagem.
- Preservar todos os pontos de ancoragem de `FirstAccessGuideCard` (reajuste, representante, implantação, horas, serviços, encerrar), reposicionando conforme o novo layout.
- `AditivoModal`: sem mudança — continua enviando os mesmos campos, sem alteração de payload.

### Backend

Sem impacto esperado. `criarReceitaImplantacao` já calcula `parcelas × valorParcela`, que é exatamente a fórmula que passa a valer no frontend — nenhuma mudança de rota necessária.

### Banco de dados

Sem impacto esperado. Nenhuma migration, nenhuma tabela nova, nenhuma alteração de coluna.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/config/ClienteDetail.tsx` (`ContratoModal`, `ContratoForm`)
- `src/ui/dialogFormTokens.tsx` (possível extensão de tokens para o botão "remover"/controle "+ adicionar linha", se os tokens já existentes de `valuesRowStyle` não cobrirem esse padrão visual novo)

## Estratégia de implementação

1. Ajustar `ContratoModal`: inverter a semântica do estado de Implantação (`implValorParcela` como campo principal de entrada; `implTotal` deixa de existir como estado, vira derivado apenas para exibição do "Calculado").
2. Introduzir estado de visibilidade por linha (derivado dos valores: uma linha está "presente" se seus campos não estiverem todos zerados, ou controlada por um `Set`/flags explícitos definidos ao remover/adicionar) para as 4 linhas.
3. Reescrever a tabela de Valores com colunas Descrição/Und/Qtde/Valor unitário/Calculado, renderizando apenas as linhas presentes; adicionar botão "remover" (`⊗`) por linha visível.
4. Adicionar os controles "+ [nome da linha]" para as linhas ausentes, reinserindo a linha (visível, com campos zerados prontos para editar) ao clicar.
5. Mover a linha de totais (Total do contrato/Mensal/Faturando) para dentro da tabela, removendo o footer numérico atual.
6. `ContratoForm`: substituir chips de Reajuste/Representante por `<select>`; mover Observações para coluna ao lado; remover criação inline de representante.
7. Ajustar `Dialog` do `ContratoModal` para `scrollBody={false}` com footer fixo.
8. Reposicionar botão de Discriminação de serviços.
9. Rodar `npm run build` e validar manualmente via `/run`.

## Regras de negócio identificadas

- `calculado = valor_unitario × quantidade` para as 4 linhas.
- Implantação: `valor_unitario` = valor da parcela (novo), `quantidade` = número de parcelas; `calculado` = total (`parcela × parcelas`) — mesma matemática que `criarReceitaImplantacao` já usa no backend.
- "Remover" uma linha zera os campos correspondentes e a oculta visualmente; a linha pode ser reincluída a qualquer momento via controle "+ [nome]", sem perda de estrutura ou necessidade de nova query.
- "Total do contrato" = soma do "Calculado" das linhas atualmente visíveis/preenchidas.
- "Mensal" e "Faturando" continuam com suas origens atuais (`valor_mensal` e soma de `contratos_servicos` faturando, respectivamente).

## Regras multi-tenant e segurança

Projeto não é multi-tenant no sentido de organizações isoladas; sem isolamento de tenant a considerar. Sem mudança de permissão/autorização — task é puramente de frontend sobre dados já existentes.

## Requisitos de Migração ou Compatibilidade

Nenhuma migração de dado necessária — os mesmos campos do `Contrato` continuam sendo usados, só a apresentação e o fluxo de preenchimento de Implantação mudam.

## Testes necessários

### Frontend

- Criar contrato novo, preencher as 4 linhas, verificar "Calculado" e "Total do contrato" corretos.
- Editar contrato existente, "remover" uma linha (ex. Implantação) e confirmar que ela some da tabela e os campos zeram; confirmar que a receita de implantação não é mais gerada na próxima geração de receita.
- Reincluir uma linha removida via "+ [nome]" e confirmar que ela volta editável.
- Verificar `<select>` de Reajuste/Representante sem atalho de criação inline.
- Verificar footer fixo sem rolar com conteúdo extenso.
- Verificar nova posição do botão de Discriminação de serviços.
- Registrar aditivo e confirmar que os valores continuam sendo copiados corretamente (sem mudança de payload).

### Backend

Não aplicável — sem mudança de backend nesta task.

### E2E

Não aplicável — sem infraestrutura de E2E no projeto.

## Comandos de validação sugeridos

```bash
npm run build
```

(Projeto não possui scripts de `lint`/`typecheck`/`test` dedicados.)

## Riscos e pontos de atenção

- A inversão do fluxo de preenchimento da Implantação (parcela em vez de total) é uma mudança de UX que usuários acostumados ao formato antigo vão notar — mitigado pelo subtítulo "taxa única" e label claro sobre o que está sendo digitado.
- O estado de "linha presente/ausente" precisa de uma regra clara e sem ambiguidade (ex. distinguir "usuário removeu explicitamente" de "contrato novo, ainda não preenchido") para não esconder uma linha que o usuário só ainda não chegou a preencher em um contrato novo — a implementação deve tratar contrato novo com todas as 4 linhas visíveis por padrão, e só ocultar mediante clique explícito no botão remover.
- Sem impacto de backend/banco nesta versão — risco geral bem menor que a proposta original.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Tabela de Valores exibe Descrição/Und/Qtde/Valor unitário/Calculado para as 4 linhas.
- Fórmula `valor_unitário × quantidade` vale para todas as linhas, incluindo Implantação.
- Botão "remover" por linha zera os campos correspondentes e oculta a linha; controle "+ [nome]" reinclui.
- Linha de totais (Total do contrato/Mensal/Faturando) aparece dentro da tabela, sem "SUBTOTAL".
- Reajuste/Representante são `<select>` empilhados, sem criação inline; Observações ao lado.
- Footer do modal fixo, sem rolar com o conteúdo.
- Botão de Discriminação de serviços na linha do título "Valores".
- Nenhuma mudança de backend, schema ou migration.
- `npm run build` conclui sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir `sistema financas/AGENT.md` e `sistema financas/CLAUDE.md`.
- Nenhuma migration é necessária nesta task — não tocar em `backend/drizzle/`.
- Não alterar `contracts.ts`, `incomes.ts`, `contratos_servicos` ou `CatalogoServicoRow`.
- Manter alterações focadas em `ContratoModal`/`ContratoForm` dentro de `ClienteDetail.tsx`.
- Contrato novo (`!contrato`) deve iniciar com as 4 linhas visíveis por padrão; ocultação só ocorre por ação explícita do usuário no botão remover.
