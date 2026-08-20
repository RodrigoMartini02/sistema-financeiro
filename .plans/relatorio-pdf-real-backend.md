# Plano de Implementação: Relatório em PDF real (gerado no backend)

## Origem

- Arquivo de especificação: pedido direto do usuário no chat, seguido de investigação read-only (subagente Explore) na tela de Relatórios e schemas de despesas/receitas
- Data do planejamento: 2026-08-20
- Classificação: `fullstack` (nova dependência no backend)

## Resumo

Hoje o botão "Exportar PDF" em `RelatoriosScreen.tsx:404-408` apenas chama `window.print()`, contando com CSS de impressão (`:156-170`) para formatar a página — ou seja, é um "print da tela", não um documento real. Nenhuma biblioteca de geração de PDF está instalada em nenhum dos dois `package.json` (frontend/backend). Este plano substitui esse mecanismo por um PDF real gerado no backend, contendo todos os dados de receita/despesa disponíveis no banco (não só os campos resumidos hoje exibidos na grade), respeitando os mesmos filtros já aplicados na tela (período, tipo, forma de pagamento, status).

## Escopo

### Dentro do escopo

- Adicionar uma biblioteca de geração de PDF no backend, compatível com Node `22.17.0` (conferir `engines.node` antes de instalar, conforme regra do `AGENT.md`)
- Criar endpoint novo (ex. `POST /api/relatorios/pdf`) que recebe os mesmos filtros já usados na tela: `dataInicio`, `dataFim`, `tipoFiltro` (todos/despesas/receitas), `formaFiltro`, `statusFiltro`, `perfil_id`
- Backend replica a lógica de busca e filtro que `RelatoriosScreen.tsx` já usa no frontend (despesas + receitas do período, excluindo receitas com `status === 'cancelada'`, mesma regra do plano anterior de Relatórios)
- Documento gerado inclui **todos** os campos relevantes de cada lançamento disponíveis no schema (não só os exibidos na grade hoje): descrição, categoria, forma de pagamento, datas (vencimento/compra/pagamento/recebimento), valores (original/final/pago), status pago/pendente, parcelamento (parcela atual/total), cliente e representante (quando houver, despesas de perfil empresa), dados fiscais (número NF/data emissão) quando presentes
- Backend responde com o binário do PDF (`Content-Type: application/pdf`, `Content-Disposition: attachment`), seguindo o padrão de streaming de arquivo já usado em `contract-attachments.ts:145-147`
- Frontend: trocar o botão "Exportar PDF" de `window.print()` para chamar o novo endpoint e disparar o download do arquivo binário retornado
- Ordenação determinística no PDF (ex. por data), conforme regra do `AGENT.md` sobre PDFs determinísticos

### Fora do escopo

- Geração assíncrona via job/fila (dado o volume esperado — uso pessoal/pequena empresa — a geração síncrona dentro da própria request é aceitável; documentar como ponto de atenção, não implementar fila agora)
- Mudanças na lógica de filtros já existente na tela (herda o comportamento do plano anterior `revisar-relatorios-consulta-e-exportar.md`, já implementado)
- Remoção do CSS de impressão existente (`RelatoriosScreen.tsx:156-170`) — decisão de manter ou remover fica para a implementação, sem impacto funcional relevante
- Anexos (arquivos) vinculados a despesas/receitas não serão embutidos no PDF (apenas metadados textuais, se fizer sentido) — anexar os arquivos binários em si está fora de escopo

## Leitura de contexto

- `/CLAUDE.md` e `/AGENT.md` (raiz do projeto "sistema financas") — seção "Relatórios e PDFs" (evitar `.select()` amplo, evitar processamento pesado na request, PDFs determinísticos, cuidado com Node `22.17.0` em novas dependências)
- `src/screens/relatorios/RelatoriosScreen.tsx` (lido: linhas 1-420 — estrutura de dados `RawDespesa`/`RawReceita`, queries `despQuery`/`recQuery`, filtros, `allRows`, botão "Exportar PDF")
- `backend/src/db/schema/expenses.ts` e `backend/src/db/schema/incomes.ts` (mapeados na investigação — campos completos disponíveis)
- `backend/src/routes/contract-attachments.ts` (lido: linhas 142-147 — padrão de resposta binária com `Content-Disposition`)
- `package.json` (raiz) e `backend/package.json` (verificado: nenhuma lib de PDF instalada em nenhum dos dois)
- `.plans/revisar-relatorios-consulta-e-exportar.md` (plano anterior já implementado — introduziu `hasConsultado`, filtro de receita cancelada e reposicionamento do botão "Exportar PDF"; este plano assume esse estado como ponto de partida)
- `frontend/AGENT.md` e `backend/AGENT.md` dedicados: não existem como arquivos separados neste projeto; só o `AGENT.md` da raiz, genérico e voltado a um contexto multi-tenant/prefeitura não totalmente aplicável aqui, mas cuja seção de Relatórios/PDFs é diretamente relevante e será seguida

## Impacto por área

### Frontend

- `RelatoriosScreen.tsx`: botão "Exportar PDF" (linha ~403-408) passa de `onClick={() => window.print()}` para uma função que chama o novo endpoint com os filtros atuais e dispara o download do blob retornado
- Estado de loading no botão durante a geração (spinner ou desabilitar temporariamente), já que a geração no backend não é instantânea
- Sem mudança nas queries `despQuery`/`recQuery` existentes (continuam usadas para a visualização em tela)

### Backend

- Novo arquivo de rota (ex. `backend/src/routes/reports-pdf.ts`) ou extensão de rota existente de relatórios, registrada no `server.ts`
- Nova função/service de geração de PDF, separada do handler da rota (seguindo a regra de separação de responsabilidades do `AGENT.md`)
- Queries com `.select()` explícito dos campos necessários (evitar `SELECT *` amplo em relatório, conforme `AGENT.md`)
- Validação de input: `dataInicio`/`dataFim` obrigatórios e válidos, filtros opcionais validados
- `orderBy` explícito (ex. por data) para garantir PDF determinístico

### Banco de dados

Sem impacto esperado — apenas leitura das tabelas `despesas` e `receitas` já existentes.

### Infra/Deploy

- Nova dependência de geração de PDF precisa ser compatível com o ambiente de deploy do backend (mesma versão de Node) — validar após escolha da biblioteca

## Arquivos provavelmente afetados

- `backend/package.json` (nova dependência)
- `backend/src/routes/reports-pdf.ts` (novo arquivo, nome final a definir)
- `backend/src/server.ts` (registro da nova rota)
- `src/screens/relatorios/RelatoriosScreen.tsx`
- `src/services/` (novo service/helper de frontend para chamar o endpoint e disparar o download, se necessário)

## Estratégia de implementação

1. Escolher e instalar a biblioteca de PDF no backend, confirmando compatibilidade com Node `22.17.0` antes de finalizar a escolha
2. Criar o endpoint `POST /api/relatorios/pdf` (ou nome equivalente ao padrão do projeto), com validação de input (datas obrigatórias, filtros opcionais)
3. Implementar a busca de despesas e receitas do período com `.select()` explícito dos campos completos necessários, replicando a regra de excluir receitas com `status === 'cancelada'`
4. Implementar a função de geração do PDF (service separado do handler), com todos os campos relevantes por lançamento e `orderBy` determinístico
5. Retornar o binário com `Content-Type: application/pdf` e `Content-Disposition: attachment; filename="relatorio-{periodo}.pdf"`
6. No frontend, criar a função que chama o endpoint (via `fetch`/`apiRequest` com tratamento de resposta binária) e dispara o download do arquivo no navegador
7. Trocar o `onClick` do botão "Exportar PDF" para essa nova função, com estado de loading
8. Rodar `npx tsc --noEmit`/`npx vite build` (frontend) e typecheck/build do backend
9. Testar: gerar relatório com despesas e receitas variadas (parceladas, pagas, pendentes, com/sem cliente/representante) e confirmar que todos os campos aparecem corretamente no PDF baixado

## Regras de negócio identificadas

- Receitas com `status === 'cancelada'` não entram no relatório (regra herdada do plano anterior de Relatórios, já validada no Painel)
- O documento deve refletir exatamente os mesmos filtros que o usuário aplicou na tela antes de exportar

## Regras multi-tenant e segurança

Não aplicável no sentido multi-prefeitura do `AGENT.md` genérico. O cuidado real aqui é: a query do PDF deve filtrar estritamente pelo `usuario_id` da sessão autenticada (nunca confiar em `perfil_id`/`usuario_id` vindos livremente do client sem validar contra a sessão), seguindo o mesmo padrão de autenticação já usado nas demais rotas do backend.

## Validações necessárias

- `dataInicio`/`dataFim`: obrigatórios, formato ISO válido, `dataInicio <= dataFim`
- Filtros opcionais (`tipoFiltro`, `formaFiltro`, `statusFiltro`, `perfil_id`): validados contra os valores permitidos já usados no frontend

## Testes necessários

### Backend

- Gerar PDF com período contendo despesas e receitas variadas, confirmar todos os campos presentes
- Gerar PDF com período vazio (sem lançamentos), confirmar que não quebra e retorna um documento válido (mesmo que vazio)
- Confirmar que receitas canceladas não aparecem no PDF
- Confirmar que a query filtra corretamente por `usuario_id` da sessão

### Frontend

- Clicar em "Exportar PDF" após consultar um período, confirmar que o download inicia e o arquivo abre corretamente
- Confirmar estado de loading visível durante a geração
- Confirmar que os filtros aplicados na tela (tipo/forma/status) são os mesmos refletidos no PDF

### E2E

Não aplicável inicialmente.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build

npm --prefix backend run typecheck
npm --prefix backend run build
```

## Riscos e pontos de atenção

- Geração de PDF síncrona dentro da request: se o volume de lançamentos crescer muito no futuro, pode se aproximar de timeout — aceitável para o volume atual (uso pessoal/pequena empresa), mas vale registrar para revisão futura
- Escolha de biblioteca precisa respeitar a faixa `engines.node` do projeto (`22.17.0`) — não instalar uma versão que exija Node maior
- Layout do PDF (fontes, formatação de moeda/data em pt-BR) precisa ser revisado visualmente antes de considerar concluído

## Perguntas em aberto

- Qual biblioteca de PDF usar no backend (ex. `pdfmake` vs. `@react-pdf/renderer` vs. outra) — decisão técnica a ser tomada na implementação, priorizando compatibilidade com Node `22.17.0` e simplicidade de manutenção
- Layout exato do documento (logo, cabeçalho, agrupamento por mês ou lista única) — a definir durante a implementação, podendo pedir preferência visual ao usuário

## Critérios de aceite do plano

- O botão "Exportar PDF" gera um documento PDF real, não mais `window.print()`
- O PDF contém todos os campos relevantes de cada despesa/receita do período filtrado, não apenas os campos resumidos da grade
- Os filtros aplicados na tela (período, tipo, forma, status) são respeitados no documento gerado
- `npx tsc --noEmit` e builds de frontend/backend passam sem erros

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Antes de instalar a dependência de PDF, confirmar a faixa `engines.node` publicada, conforme regra do `AGENT.md`
- Seguir a seção "Relatórios e PDFs" do `AGENT.md` da raiz: `.select()` explícito, evitar processamento pesado sem necessidade, `orderBy` determinístico
- Manter o service de geração de PDF separado do handler da rota
- Ao finalizar localmente, perguntar ao usuário se deseja seguir para `/finalizar`
