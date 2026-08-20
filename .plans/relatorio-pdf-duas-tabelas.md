# Plano de Implementação: PDF do relatório com duas tabelas fiéis às telas (Despesas / Receitas)

## Origem

- Arquivo de especificação: pedido direto do usuário no chat, a partir de um print da tabela real de Despesas e da confirmação de que o PDF deve seguir as mesmas colunas das telas de Movimentações (Despesas/Receitas)
- Data do planejamento: 2026-08-20
- Classificação: `backend + database` (leitura adicional de colunas já existentes, sem migration)

## Resumo

O PDF gerado hoje (`.plans/relatorio-pdf-real-backend.md`, já implementado e em produção) usa uma única tabela genérica que mistura despesas e receitas na mesma linha, com colunas Data/Tipo(despesa-receita)/Descrição/Categoria/Forma/Status/Cliente-Repr./Parcela/Valor. O usuário mostrou a tabela real da tela de Despesas e pediu que o relatório reflita fielmente o que aparece no sistema.

A tela "Movimentações" não tem uma tabela própria — ela é um shell com abas que renderiza `DespesasScreen` ou `ReceitasScreen` conforme a aba ativa (`MovimentacoesScreen.tsx:368-371`). Portanto, "a mesma tabela de Movimentações" significa, na prática, duas tabelas distintas: a de Despesas e a de Receitas, cada uma com suas próprias colunas reais.

Colunas confirmadas por leitura direta do código de cada tela:

**Despesas** (`DespesasScreen.tsx:562-569`): Descrição, Tipo, Vencimento, Data compra, Categoria, Pagamento, Status, Valor.
- Tipo (`TipoBadge`, linhas 76-93): mostra a parcela (`item.parcela`, ex. "3/12") e/ou "Recorrente" (`item.recorrente`), lado a lado quando ambos existem; "—" quando nenhum.
- Status (`getStatus`, linhas 48-51): "Pago" se `item.pago`; senão "Atrasada" se `dataVencimento < hoje`; senão "Em dia".

**Receitas** (`ReceitasScreen.tsx:290-297` e linhas 301-353): Data, Descrição, Cliente/Representante, Tipo, Comissão, Valor.
- Coluna "Data" inclui, quando aplicável, um marcador inline: "Cancelada" (`status === 'cancelada'`), "Prevista" (`status === 'prevista'` e não atrasada), "Em atraso" (`status === 'prevista'` e `data < hoje`) — sem marcador quando `status === 'ativa'` (recebida normalmente).
- Coluna "Cliente/Representante": mostra `representanteNome` se houver; senão `cliente` se houver; senão "—".
- Coluna "Tipo": `tipoReceita` (badge de texto), "—" se ausente.
- Coluna "Comissão": `valorComissao` quando > 0; senão "—".

## Escopo

### Dentro do escopo

- Backend (`backend/src/services/reportPdf.ts`): substituir a tabela única (`ReportRow`/`generateReportPdf`) por duas tabelas distintas no mesmo documento — uma seção "Despesas" com as 8 colunas confirmadas, uma seção "Receitas" com as 6 colunas confirmadas
- Backend (`backend/src/routes/reports.ts`): ampliar `fetchDespesas()` para também selecionar `d.parcelado` e `d.recorrente` (campos já existentes na tabela `despesas`, hoje não buscados por esta rota) e ampliar `fetchReceitas()` para também selecionar `r.status` e `r.valor_comissao` (idem, já existentes na tabela `receitas`, hoje não buscados)
- Cada tabela recebe subtotal próprio (total de despesas / total de receitas), calculado a partir das linhas realmente exibidas naquela tabela
- Mantém o bloco de resumo geral no fim do documento (total receitas, total despesas, saldo do período), como já existe hoje
- Replicar textualmente (não visualmente) a mesma lógica de Tipo/Status já usada nas telas, para o PDF dizer exatamente o que a tela diria

### Fora do escopo

- Qualquer mudança nas telas `DespesasScreen.tsx`/`ReceitasScreen.tsx`/`MovimentacoesScreen.tsx` em si — são apenas a referência de colunas, não são alteradas
- Qualquer mudança na tela de Relatórios (`RelatoriosScreen.tsx`), nos filtros, no botão de exportar ou no texto do guia — já implementados e funcionando, não fazem parte deste plano
- Investigação do relato "não está puxando os valores" — não confirmado se é um bug real ou leitura equivocada do print; será reavaliado depois desta mudança, já que o novo código (tabelas simples, uma coluna por campo) deve tornar qualquer ausência de valor visualmente óbvia e fácil de diagnosticar
- Coluna "Comissão" com cálculo novo — usa o campo `valor_comissao` já existente e já calculado por outras rotas, sem nova lógica de negócio
- Anexos e Ações (colunas presentes nas telas mas sem sentido em um documento PDF estático) — não entram no relatório

## Leitura de contexto

- `/CLAUDE.md` e `/AGENT.md` (raiz do projeto "sistema financas") — seção "Relatórios e PDFs": `.select()` explícito, evitar processamento pesado, `orderBy` determinístico
- `backend/src/services/reportPdf.ts` (lido integralmente — estrutura atual de `ReportRow`/`generateReportPdf`, já implementado nesta sessão)
- `backend/src/routes/reports.ts` (lido integralmente — `fetchDespesas`/`fetchReceitas`, já implementado nesta sessão)
- `src/screens/despesas/DespesasScreen.tsx` (lido: linhas 44-93 — `getStatus`, `StatusBadge`, `TipoBadge`; linhas 555-671 — cabeçalho e linhas da tabela real)
- `src/screens/receitas/ReceitasScreen.tsx` (lido: linhas 290-370 — cabeçalho e linhas da tabela real, incluindo os marcadores de status inline)
- `src/screens/finance/MovimentacoesScreen.tsx` (lido: linhas 16-17, 368-371 — confirmado que não existe tabela própria; a tela delega para `DespesasScreen`/`ReceitasScreen` conforme a aba)
- `backend/src/db/schema/expenses.ts` e `backend/src/db/schema/incomes.ts` (já mapeados em sessão anterior — confirmado que `parcelado`, `recorrente` (despesas) e `valor_comissao`/`status` (receitas, via SQL raw já usado em outras rotas) existem no banco)
- `frontend/AGENT.md` e `backend/AGENT.md` dedicados: não existem como arquivos separados neste projeto; só o `AGENT.md` da raiz, genérico e voltado a um contexto multi-tenant/prefeitura não totalmente aplicável aqui, mas cuja seção de Relatórios/PDFs é diretamente relevante e será seguida

## Impacto por área

### Frontend

Sem impacto esperado — a tela de Relatórios já chama o endpoint existente sem mudança de contrato (mesmos parâmetros de filtro).

### Backend

- `backend/src/routes/reports.ts`:
  - `DespesaRow`: adicionar `parcelado: boolean | null` e `recorrente: boolean | null`
  - `fetchDespesas()`: adicionar `d.parcelado, d.recorrente` ao `SELECT`
  - `ReceitaRow`: adicionar `status: string | null` e `valor_comissao: string | null`
  - `fetchReceitas()`: adicionar `r.status, r.valor_comissao` ao `SELECT` (nota: `valor_comissao` não está mapeado no schema Drizzle `incomes.ts`, mas existe na tabela `receitas` via SQL raw, mesmo padrão já usado por `status` nesta mesma rota)
  - Handler da rota `GET /pdf`: montar dois arrays de linhas tipados (despesas e receitas) em vez de um único `ReportRow[]` unificado, passando ambos para `generateReportPdf`
- `backend/src/services/reportPdf.ts`:
  - Substituir a interface `ReportRow` única por dois tipos: `DespesaReportRow` (8 colunas) e `ReceitaReportRow` (6 colunas)
  - `generateReportPdf` passa a receber `{ periodoLabel, filtrosLabel, despesas: DespesaReportRow[], receitas: ReceitaReportRow[] }`
  - `docDefinition.content` monta duas tabelas (título "Despesas" + tabela; título "Receitas" + tabela), cada uma com subtotal, seguidas do bloco de totais gerais já existente
  - Funções auxiliares para replicar `getStatus`/`TipoBadge` (despesas) e a lógica de status/cliente-representante (receitas) como texto simples

### Banco de dados

Sem impacto — todos os campos já existem nas tabelas `despesas` e `receitas`; a mudança é apenas incluir colunas já existentes nas queries `SELECT` que hoje não as buscam. Nenhuma migration necessária.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `backend/src/routes/reports.ts`
- `backend/src/services/reportPdf.ts`

## Estratégia de implementação

1. Em `backend/src/routes/reports.ts`, ampliar `DespesaRow` e o `SELECT` de `fetchDespesas()` para incluir `parcelado`, `recorrente`
2. Ampliar `ReceitaRow` e o `SELECT` de `fetchReceitas()` para incluir `status`, `valor_comissao`
3. Em `backend/src/services/reportPdf.ts`, definir `DespesaReportRow` e `ReceitaReportRow` com os campos necessários para as colunas confirmadas
4. Implementar função auxiliar `despesaTipoLabel(row)` replicando a lógica de `TipoBadge` em texto ("3/12 · Recorrente", "3/12", "Recorrente" ou "-")
5. Implementar função auxiliar `despesaStatusLabel(row)` replicando `getStatus` em texto ("Pago"/"Atrasada"/"Em dia")
6. Implementar função auxiliar `receitaStatusLabel(row)` e `receitaClienteLabel(row)` replicando a lógica de marcador de status e de cliente/representante da tela de Receitas
7. Reescrever `generateReportPdf` para receber despesas e receitas separadamente e montar duas tabelas no `docDefinition.content`, cada uma com seu próprio subtotal, mantendo o cabeçalho/período/filtros e o bloco de totais gerais já existentes
8. Atualizar o handler da rota `GET /pdf` em `reports.ts` para montar os dois arrays tipados e chamar `generateReportPdf` com a nova assinatura
9. Rodar `npm --prefix backend run build`
10. Testar: gerar PDF com despesas variadas (parceladas, recorrentes, pagas, atrasadas, em dia) e receitas variadas (ativas, previstas, atrasadas, canceladas — que devem continuar excluídas do relatório, com comissão e sem comissão), conferir que as colunas e valores batem exatamente com o que aparece nas telas de Despesas e Receitas para o mesmo período

## Regras de negócio identificadas

- Receitas com `status === 'cancelada'` continuam excluídas do relatório (regra já existente, mantida)
- O texto de "Tipo" e "Status" no PDF deve corresponder exatamente ao que a tela mostraria para o mesmo lançamento, sem introduzir uma lógica nova de classificação

## Regras multi-tenant e segurança

Não aplicável no sentido multi-prefeitura do `AGENT.md` genérico — projeto single-tenant por usuário autenticado. Nenhuma mudança nas cláusulas de filtro por `usuario_id`/`perfil_id` já existentes nas queries.

## Validações necessárias

Nenhuma validação nova de input — os parâmetros de filtro do endpoint (`data_inicio`, `data_fim`, `tipo`, `forma`, `status`, `perfil_id`) permanecem os mesmos já validados.

## Testes necessários

### Backend

- Gerar PDF de um período com despesas parceladas, recorrentes, pagas, atrasadas e em dia — confirmar que a coluna "Tipo" e "Status" de cada linha bate com o que a tela de Despesas mostraria
- Gerar PDF de um período com receitas ativas, previstas (atrasadas e não atrasadas) e com/sem comissão — confirmar que a coluna correspondente bate com o que a tela de Receitas mostraria
- Confirmar que receitas canceladas continuam fora do relatório
- Confirmar que os subtotais de cada tabela batem com a soma das linhas exibidas, e que o total geral bate com a soma dos dois subtotais

### Frontend

Sem impacto — não é necessário testar a tela de Relatórios além de confirmar visualmente o PDF baixado.

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
npm --prefix backend run build
```

## Riscos e pontos de atenção

- Risco baixo — mudança aditiva em queries já existentes (novas colunas `SELECT`) e reestruturação de uma função de geração de documento já isolada (`generateReportPdf`), sem tocar em rotas de escrita nem em outras telas
- `valor_comissao` não está no schema Drizzle de `incomes.ts` — usar SQL raw para esse campo, mesmo padrão já usado para `status` nesta mesma rota, evitando inconsistência de abordagem
- Layout das duas tabelas em uma página A4 paisagem precisa ser revisado visualmente para garantir legibilidade (menos colunas por tabela ajuda, mas vale conferir espaçamento)

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — colunas confirmadas por leitura direta do código de cada tela.

## Critérios de aceite do plano

- O PDF exportado tem duas tabelas distintas: Despesas e Receitas
- A tabela de Despesas tem exatamente as colunas Descrição, Tipo, Vencimento, Data compra, Categoria, Pagamento, Status, Valor, com os mesmos textos que a tela mostraria
- A tabela de Receitas tem exatamente as colunas Data, Descrição, Cliente/Representante, Tipo, Comissão, Valor, com os mesmos textos que a tela mostraria
- Cada tabela exibe seu subtotal; o documento mantém o resumo geral (receitas, despesas, saldo) no fim
- `npm --prefix backend run build` passa sem erros

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Reaproveitar a lógica de `getStatus`/`TipoBadge` (despesas) e da lógica de status/cliente-representante (receitas) como referência textual exata — não inventar uma classificação diferente da que já existe nas telas
- Nenhuma migration é necessária neste plano
- Ao finalizar localmente, perguntar ao usuário se deseja seguir para `/finalizar`
