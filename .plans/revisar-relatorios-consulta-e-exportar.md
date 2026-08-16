# Plano de Implementação: Revisão da tela de Relatórios

## Origem

- Arquivo de especificação: pedido direto do usuário no chat, seguido de investigação read-only (subagente Explore) na tela de Relatórios
- Data do planejamento: 2026-08-16
- Classificação: `frontend-only`

## Resumo

Três correções na tela de Relatórios (`RelatoriosScreen.tsx`):

1. **Bug de dados**: a busca de receitas (`fetchReceitasMes`, que chama `GET /api/incomes`) não filtra por `status`, então receitas canceladas são somadas nos totais e aparecem na grade de Relatórios. O Painel (`FinanceDashboard.tsx`, via `financeService.ts`) já filtra `status === 'ativa'` no frontend antes de somar — mesma rota de backend, mesmo padrão "backend retorna tudo, frontend filtra". A correção replica esse filtro dentro do Relatório, sem alterar o backend nem o contrato usado por outras telas.
2. **Carregamento sob demanda**: hoje as duas queries (`despQuery`, `recQuery`) rodam automaticamente ao montar o componente, pois não têm `enabled` condicionado. O usuário quer que a grade só carregue após clicar em "Consultar", tornando a abertura da tela mais leve.
3. **Reposicionamento visual**: mover o botão "Exportar PDF" (hoje no header da página, isolado) para o mesmo container do botão "Consultar" (dentro do card de filtros).

## Escopo

### Dentro do escopo

- Filtrar receitas com `status === 'cancelada'` (ou equivalente) fora dos totais e da grade do Relatório, replicando a regra já usada pelo Painel
- Adicionar `status?: string | null` à interface `RawReceita` (hoje não declara esse campo, embora o backend retorne via `SELECT r.*`)
- Tornar `despQuery` e `recQuery` condicionadas a um novo estado `hasConsultado` (`enabled: hasConsultado`), iniciando `false`
- Ajustar `handleConsultar` para setar `hasConsultado = true` além de atualizar `queryDataInicio`/`queryDataFim`
- Ajustar a condição `disabled` do botão "Consultar" — hoje é `!hasPendingChange`, que deixaria o botão travado no primeiro carregamento (pois não há "mudança pendente" antes da primeira consulta); precisa permitir o primeiro clique mesmo sem alteração de data
- Adicionar um terceiro estado visual na área da tabela: "ainda não consultado" (distinto de "carregando" e de "sem lançamentos"), exibido quando `!hasConsultado`
- Mover o bloco do botão "Exportar PDF" (incluindo seu `FirstAccessGuideCard` associado) do header da página para dentro do container onde já fica "Consultar" (`<div className="relative ml-auto flex flex-wrap items-center gap-3">`)
- Ajustar o header da página para não sobrar espaço vazio após a remoção do botão Exportar

### Fora do escopo

- Qualquer mudança no backend (`backend/src/routes/incomes.ts` permanece igual — a correção é só no consumo do frontend)
- Mudanças em outras telas que também consomem `/receitas` (ex.: Painel), já que essas já filtram corretamente
- Adicionar novos campos/colunas à grade além do necessário para o filtro de status (parcelamento, observações, anexos, etc. — identificados na investigação mas não pedidos pelo usuário)
- Qualquer mudança de layout/filtros além do reposicionamento do botão Exportar

## Leitura de contexto

- `/CLAUDE.md` (raiz do projeto)
- `src/screens/relatorios/RelatoriosScreen.tsx` (lido integralmente)
- `src/services/financeService.ts` (confirmado o padrão de filtro `status === 'ativa'` usado pelo Painel)
- `src/screens/finance/FinanceDashboard.tsx` (confirmado uso do filtro de status já existente)
- `backend/src/routes/incomes.ts` (confirmado: rota única `GET /`, sem filtro de status, usada tanto pelo Relatório quanto pelo Painel via `/receitas`)
- Investigação prévia via agente Explore (read-only), que localizou os números de linha exatos de queries, botões e estados de loading/vazio

## Impacto por área

### Frontend

- **Tipos**: `RawReceita` (linha ~22-26) ganha campo `status?: string | null`
- **Dados**: filtro de status aplicado no ponto onde `receitas` é derivado de `recQuery.data` (linha ~235), ou dentro de `fetchReceitasMes`/no `queryFn` de `recQuery` — decisão de onde exatamente filtrar fica para a implementação, mantendo o padrão mais próximo do já usado no projeto
- **Queries**: `despQuery` e `recQuery` (linhas ~211-225) ganham `enabled: hasConsultado`
- **Estado novo**: `hasConsultado` (`useState(false)`)
- **Botão Consultar**: `handleConsultar` (linha ~229-232) passa a setar `hasConsultado(true)`; `disabled` do botão (linha ~395) ajustado para permitir o primeiro clique
- **Estado vazio da tabela**: ternário em torno da linha ~463-466 ganha um terceiro ramo para `!hasConsultado`
- **Layout dos botões**: bloco do botão "Exportar PDF" (linhas ~296-314) movido para dentro do container de "Consultar" (linha ~383-416); header da página (linhas ~293-315) simplificado
- Sem novas query keys além das já existentes (`rel-desp-range`, `rel-rec-range`)
- Sem mudança em formulários, validações ou permissões

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/relatorios/RelatoriosScreen.tsx` (único arquivo)

## Estratégia de implementação

1. Adicionar `status?: string | null` à interface `RawReceita`
2. Aplicar o filtro de status ativo nas receitas antes de somar/exibir (mesma regra do Painel: só contar quando `status` for `'ativa'` ou equivalente ausente/indefinido, replicando exatamente o critério já usado em `financeService`/`FinanceDashboard`)
3. Criar estado `hasConsultado` (`useState(false)`)
4. Adicionar `enabled: hasConsultado` em `despQuery` e `recQuery`
5. Atualizar `handleConsultar` para setar `hasConsultado(true)` junto com as datas de query
6. Ajustar a condição `disabled` do botão "Consultar" para habilitar o primeiro clique mesmo sem alteração de data (ex.: `disabled={hasConsultado && !hasPendingChange}`)
7. Adicionar o terceiro ramo visual "ainda não consultado" na área da tabela, antes dos ramos de "carregando" e "sem lançamentos"
8. Mover o botão "Exportar PDF" (e seu guia de primeiro acesso) para o container do botão "Consultar"
9. Ajustar o header da página para não deixar espaço vazio
10. Rodar `npx tsc --noEmit` e `npx vite build`
11. Testar visualmente: abrir a tela (grade deve estar vazia/estado "não consultado"), clicar Consultar (grade carrega), trocar datas e clicar Consultar de novo, verificar que receita cancelada (se houver dado de teste) não aparece nos totais, conferir posição dos botões

## Regras de negócio identificadas

- Receitas com `status === 'cancelada'` não devem ser contabilizadas em relatórios financeiros — regra já estabelecida no Painel, sendo replicada aqui por consistência
- A tela de Relatórios não deve fazer requisições ao backend antes do usuário confirmar a intenção de consultar (clique em "Consultar")

## Regras multi-tenant e segurança

Não aplicável — mudança isolada de lógica de exibição/filtro no frontend, sem alteração de queries de backend, permissões ou isolamento de dados. O filtro de status é aplicado sobre dados que o usuário já está autorizado a ver.

## Validações necessárias

Nenhuma validação de formulário nova — mudança de comportamento de carregamento e filtro de dados já buscados.

## Testes necessários

### Frontend

- Abrir a tela de Relatórios: confirmar que nenhuma requisição de despesas/receitas é feita antes do clique em "Consultar" (via Network tab ou log)
- Confirmar que o botão "Consultar" está clicável no primeiro carregamento (não travado)
- Clicar "Consultar": confirmar que a grade carrega normalmente
- Trocar período e clicar "Consultar" novamente: confirmar que os dados atualizam
- Confirmar que receitas com status cancelado (se houver dado de teste) não aparecem nos totais nem na grade
- Confirmar posição final dos botões "Exportar PDF" e "Consultar" lado a lado
- Confirmar que "Exportar PDF" (impressão) continua funcionando normalmente após o reposicionamento

### Backend

Sem impacto esperado.

### E2E

Não aplicável inicialmente.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Ajuste na condição `disabled` do botão "Consultar" tem risco de regressão (botão travado permanentemente ou sempre habilitado incorretamente) — precisa validação visual cuidadosa
- Mudar o estado vazio da tabela exige garantir que a nova mensagem "ainda não consultado" não seja confundida com "sem lançamentos" ou "carregando"
- Baixo risco geral — mudança isolada em um único arquivo de tela, sem tocar em backend, schema ou outras telas

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Receitas canceladas não são somadas nos totais nem aparecem na grade de Relatórios
- A grade de Relatórios não carrega automaticamente ao abrir a tela — só após o clique em "Consultar"
- O botão "Consultar" está habilitado e funcional desde o primeiro carregamento da tela
- O botão "Exportar PDF" fica visualmente ao lado do botão "Consultar"
- `npx tsc --noEmit` e `npx vite build` passam sem erros
- Nenhuma outra tela ou fluxo é afetado

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Único arquivo afetado: `src/screens/relatorios/RelatoriosScreen.tsx` — manter a mudança pequena e focada, sem expandir escopo
- Prestar atenção especial à lógica do botão "Consultar" (item de maior risco deste plano)
- Ao finalizar localmente, perguntar ao usuário se deseja enviar para produção, seguindo o fluxo padrão do projeto (`/finalizar`)
