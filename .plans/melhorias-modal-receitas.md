# Plano de Implementação: Melhorias no Fluxo de Receitas (estilo + automações)

## Origem

- Arquivo de especificação: nenhum `.md` externo — plano derivado de análise interativa completa (comparação ExpenseDialog vs IncomeDialog + auditoria de fluxo end-to-end via agente Explore) validada com o usuário na mesma conversa.
- Data do planejamento: `2026-08-05`
- Classificação: `frontend + backend + database` (o rótulo "database" aqui é apenas porque queries backend mudam — nenhuma migration nova é necessária; todo campo usado já existe no schema).

## Resumo

Redesenha o `IncomeDialog` seguindo o padrão visual e de automação já validado no `ExpenseDialog`, e fecha lacunas identificadas em uma auditoria completa do fluxo de receita (Cliente → Contrato → Representante → Receita): automações que já existem no backend mas a UI não aciona, um bug de inconsistência de valor entre dois caminhos de faturamento, um side-effect silencioso de despesa-fantasma, e a ausência de UI para o endpoint de aditivo de contrato que já existe e funciona.

## Nota importante sobre o AGENT.md deste projeto

O `AGENT.md` da raiz descreve um sistema multi-prefeitura/multi-tenant genérico (RLS, `tenantId`, jobs de PDF) que não corresponde a este projeto — este é um sistema financeiro pessoal/PJ real, isolado por `perfil_id`/`usuario_id`. O arquivo não foi tocado desde o commit inicial de migração (`9739a73`, 08/07/2026) e parece ser um template que sobrou de outro contexto. Este plano segue os **princípios** aplicáveis do AGENT.md (Drizzle preferencial, sem `any`, validação no backend, nomes claros, isolamento por `perfil_id`/`usuario_id` como equivalente ao isolamento de tenant) mas ignora as referências literais a "prefeitura"/RLS. Fica sinalizado para o usuário decidir separadamente se vale atualizar/corrigir esse arquivo — não é parte deste plano.

## Escopo

### Dentro do escopo

1. Redesign visual do `IncomeDialog` replicando o sistema do `ExpenseDialog` (tokens de cor, `MoneyField`, chips, painéis condicionais, estrutura header/body/footer) — mesma paleta cyan, sem dark mode.
2. Automações portadas do Expense: autocomplete de descrição por histórico, sugestão de tipo de receita por histórico/palavra-chave, detecção de duplicata, máscara de moeda, atalhos de teclado.
3. Bloco Representante condicionado a perfil PJ (`tipo === 'empresa'`).
4. Auto-seleção de representante e auto-preenchimento de cliente a partir do contrato escolhido em "Horas a faturar".
5. Campo `cliente` migrado de texto livre para combobox com autocomplete + criação inline (padrão "+" do RepresentantesTab) — **passa a exigir vínculo com um `Cliente` cadastrado** (decisão aplicada, ver seção Regras de negócio).
6. Padrão "+" inline replicado em: representante dentro do `ContratoForm`, serviço dentro do sub-modal de discriminação de contrato.
7. Re-disparo de `gerarPrevistas` também na edição de contrato (não só criação).
8. Indicação textual de última geração de previstas no botão correspondente.
9. Auditoria (somente leitura) comparando `valor_mensal` vs soma de `contratos_servicos` em todos os contratos ativos, seguida da correção do bug de inconsistência de valor entre `/gerar-previstas` (soma serviços) e `/faturar` (usa `valor_mensal` direto) — ver "Etapa 0" na Estratégia de implementação.
10. Aviso de UI quando não há comissão configurada para o tipo de receita selecionado + ajuste no backend para não criar despesa-fantasma de R$0,01 sem match real.
11. UI para o endpoint de aditivo de contrato (`PUT /:id/aditivo`), hoje sem nenhum botão.
12. Campo `descricao` no `ContratoForm` (hoje consumido em Receitas mas nunca preenchível).
13. Remoção dos campos mortos `Cliente.tipo_empresa`, `Cliente.codigo` (interface TS) e `Contrato.valor_contrato` (interface TS).

### Fora do escopo

- Geração automática/agendada de receitas via cron (a arquitetura atual é intencionalmente manual/on-demand, conforme `.plans/clientes-contratos-receitas-previstas.md` — mudar isso é decisão de arquitetura separada, não parte deste plano).
- Sistema paralelo `modulos_contrato` (parece órfão/não usado pela UI atual) — fica registrado como achado, não é tratado aqui; se quiser, vira um plano de limpeza à parte (`/limpar`).
- Correção do `AGENT.md` genérico da raiz.
- Dedupe de comissão "única" para não gerar mais de uma vez (achado do `.plans/comissao-representante-preview.md`, é lacuna real mas não foi pedida neste escopo).
- Migrations novas — nenhum campo de schema novo é necessário; tudo que este plano usa já existe nas tabelas `receitas`, `contratos`, `perfis`.

## Leitura de contexto

- `AGENT.md` (raiz) — lido; genérico/desatualizado, ver nota acima.
- Não há `frontend/AGENT.md` nem `backend/AGENT.md` — estrutura real é `src/` + `backend/` na raiz, cobertos pelo `AGENT.md` único.
- Arquivos lidos integralmente ou em trechos relevantes nesta sessão: `IncomeDialog.tsx`, `PerfisTab.tsx`, `clientesService.ts`, `apiClient.ts`, `RepresentantesTab.tsx`, `backend/src/routes/profiles.ts`, `backend/src/routes/contracts.ts` (quase integral), `backend/src/routes/incomes.ts` (trecho POST).
- Mapeamento anterior via agente Explore (mesma conversa): `ExpenseDialog.tsx`, `ClienteDetail.tsx`, `ServicosTab.tsx`, `ReceitasScreen.tsx`, schemas (`incomes.ts`, `representatives.ts`), planos antigos relevantes (`receitas-campos-completos.md`, `categorias-receita-e-fix-representantes.md`, `comissao-representante-preview.md`, `clientes-contratos-receitas-previstas.md`).

## Impacto por área

### Frontend

**`src/screens/finance/IncomeDialog.tsx`** (reescrita quase total, seguindo estrutura do `ExpenseDialog.tsx`):

- Sistema de tokens de cor inline (`C.*`), reaproveitando a mesma paleta cyan já definida no Expense (avaliar extrair para um módulo compartilhado, ex. `src/ui/dialogTokens.ts`, na hora de implementar, já que os dois dialogs usarão valores idênticos — decisão de implementação).
- `MoneyField`/`MoneyFieldSmall` reaproveitados do Expense (mesma decisão de extração compartilhada se ainda não existir como módulo próprio).
- Estrutura header/body(scroll)/footer fixos, `maxHeight: '92vh'`.
- Campo `cliente`: novo componente combobox (busca em `fetchClientes()`, já existente em `clientesService.ts`) + botão "+" inline seguindo o padrão de `RepresentantesTab.tsx:34-92` (estado local `creating`/`newName`/`saving`, autoFocus, Enter/Escape, seleção automática pós-criação, invalidação de query). **Validação de vínculo (aplicada apenas no frontend, sem migration):** o form só pode ser submetido se o texto em `cliente` corresponder exatamente ao nome de um `Cliente` já cadastrado (existente ou recém-criado inline pelo "+") — validação Zod/react-hook-form contra a lista de `fetchClientes()`, análoga a um `refine()`. A coluna `receitas.cliente` continua sendo `varchar` solto no banco (sem FK, sem `cliente_id` novo) — a garantia de vínculo é só de UI/validação de formulário, não de schema.
- Novo `useQuery` para perfil ativo (via `fetchPerfis()` já existente em `configService.ts`, filtrando pelo id de `getActiveProfileId()`) — usado para condicionar bloco Representante a `tipo === 'empresa'`.
- Novo `useEffect` de auto-seleção de representante ao escolher contrato em "Horas a faturar" (espelha o padrão já existente em `IncomeDialog.tsx:91-95` para `valorCalculado`).
- Novo `useEffect` de auto-preenchimento de `cliente` a partir de `contratoSelecionado.cliente_nome`, só quando campo ainda vazio.
- Novo serviço `incomeSuggestionsService.ts` (análogo a `expenseSuggestionsService.ts`) para autocomplete de descrição.
- Reaproveitar/adaptar `categorySuggestions.ts` para sugestão de tipo de receita (ou criar `incomeTypeSuggestions.ts` análogo — decidir na implementação quanto a lógica é realmente compartilhável).
- Detecção de duplicata: nova lógica local, mesma janela de 7 dias do Expense, critérios: descrição + valor + cliente.
- Preview de comissão (`IncomeDialog.tsx:250-264`): adicionar branch para quando `repSelecionado` existe mas `comissaoMatch` é `undefined` — aviso textual "Nenhuma comissão configurada para este tipo de receita".
- Atalhos de teclado: Enter salva, Esc fecha, setas navegam autocomplete de descrição (reaproveitar handler do Expense adaptado).
- **Preservar sem alteração de comportamento:** bloco "Horas a faturar" (cálculo automático), preview de comissão (lógica de cálculo em si), bloco "Replicar até...", `FirstAccessGuideCard`/`useFirstAccessGuide` nos 3 pontos existentes.

**`src/services/clientesService.ts`**:

- `ContratoResumo` (linhas 75-83): adicionar `representante_id?: number | null` e `representante_nome?: string | null` ao tipo (o dado já vem do backend via `SELECT ct.*` + join, só falta o tipo TS reconhecer).
- Interface `Contrato` (linhas 19-45): remover `valor_contrato` (campo morto, nunca editável/exibido, não usado no INSERT/UPDATE do backend).

**`src/screens/config/ClientesTab.tsx`**:

- Remover `tipo_empresa` e `codigo` da interface `Cliente` (ou do objeto de submit, dependendo de onde fica mais claro) — confirmar na implementação que nenhum outro consumidor depende desses campos antes de remover.

**`src/screens/config/ClienteDetail.tsx`**:

- `ContratoForm` (linhas 36-216): adicionar campo `<Field label="Descrição">` para `descricao` do contrato.
- `ContratoForm`: adicionar botão "+" inline no seletor de `representante_id` (linhas 169-207), mesmo padrão do RepresentantesTab, reaproveitando `saveRepresentante`/mutation equivalente.
- Sub-modal "Discriminação de prestação de serviço" (linhas 804-882): adicionar botão "+" inline para criar serviço no catálogo sem sair do sub-modal, quando `ServicosTab` estiver vazio ou o usuário quiser um novo.
- `onSuccess` de `saveContratoMut` (linhas 985-998): estender a condição de disparo de `gerarMut.mutate()` para também cobrir edição (`contratoModal.contrato` já existia), condicionado a `data_inicio_faturamento` preenchida — igual já faz para criação.
- Botão "Gerar previstas" (linhas 1040-1049): adicionar indicação textual pequena de última geração / previstas futuras (requer novo dado vindo do backend — ver seção Backend).
- Novo botão "Registrar aditivo" próximo a "Encerrar contrato", abrindo modal com os campos aceitos por `PUT /:id/aditivo`: `novo_numero`, `nova_data_assinatura`, `novo_vencimento` (obrigatório), `novo_num_aditivo`, `nova_data_aditivo`, `novo_ajuste`, `nova_data_inicio_faturamento`, `observacoes`.

**Novo serviço ou extensão de `clientesService.ts`**:

- Função `registrarAditivo(contratoId, dados)` chamando `PUT /api/contratos/:id/aditivo`.

### Backend

**`backend/src/routes/contracts.ts`**:

- `POST /:id/faturar` (linha 520-610): corrigir para calcular o valor como: se houver `contratos_servicos` vinculados com `faturando=true`, usar a soma (mesma lógica de `gerarPrevistas`); caso contrário, usar `contrato.valor_mensal` como fallback (linha 584) — preserva contratos que faturam só por `valor_mensal` sem nenhum serviço vinculado (confirmado necessário pela auditoria da Etapa 0: contrato de teste #3 fatura R$5.000 via `valor_mensal` com R$0 em soma de serviços — trocar sem fallback zeraria esse contrato). **Ponto de maior risco do plano** — ver seção Riscos.
- `GET /` (linha 87-123): já retorna `representante_id` via `ct.*` — nenhuma mudança de query necessária aqui, só o tipo TS do frontend precisa reconhecer o campo (já coberto acima).
- Opcional/complementar ao item "última geração de previstas": avaliar se vale adicionar um campo derivado na resposta de `GET /:id` ou uma sub-query simples (`COUNT(*) FROM receitas WHERE contrato_id = X AND status = 'prevista'` + `MAX` de alguma data de referência) — decidir formato exato na implementação, mantendo a query simples e explícita conforme AGENT.md.

**`backend/src/routes/incomes.ts`**:

- `POST /` (linhas 132-183): alterar a condição de criação da despesa de comissão — hoje roda sempre que há `representanteIdInt`; ajustar para só criar quando há match real de comissão (ou seja, quando o client já envia um `valor_comissao` positivo genuíno, não o fallback). Remover o fallback de `0.01` (linha 161-164) e, em vez disso, pular a criação da despesa quando `valor_comissao` não é um número positivo válido.

### Banco de dados

`Sem impacto esperado` — nenhuma migration nova. Todos os campos usados (`representante_id` em contratos, `descricao` em contratos, `status`/`contrato_id` em receitas) já existem no schema atual.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

**Frontend:**

- `src/screens/finance/IncomeDialog.tsx` (reescrita majoritária)
- `src/screens/config/ClienteDetail.tsx` (adições pontuais)
- `src/screens/config/ClientesTab.tsx` (remoção de campos mortos)
- `src/services/clientesService.ts` (tipos + nova função `registrarAditivo`)
- Novo: `src/services/incomeSuggestionsService.ts` (ou nome equivalente)
- Possível novo módulo compartilhado: tokens de cor / `MoneyField` (se extraídos do Expense)

**Backend:**

- `backend/src/routes/contracts.ts` (`/faturar`, possível campo de "última geração")
- `backend/src/routes/incomes.ts` (`POST /`, lógica de despesa de comissão)

## Estratégia de implementação

Ordem recomendada, por dependência e risco crescente:

0. **Auditoria somente leitura (pré-requisito da etapa 3):** antes de tocar em `/faturar`, rodar uma query read-only comparando, para todo contrato com `status = 'ativo'`, `valor_mensal` vs `SUM(contratos_servicos.valor_mensal WHERE faturando = true)`. Reportar ao usuário quais contratos divergem e por quanto, antes de aplicar a correção da etapa 3 — nenhuma alteração de dado nesta etapa, só leitura/relatório.
1. **Correções de tipo/campos mortos** (baixo risco, independentes): `ContratoResumo` com `representante_id`/`representante_nome`; remoção de `valor_contrato`, `tipo_empresa`, `codigo` das interfaces TS.
2. **Campo `descricao` no `ContratoForm`** (isolado, sem dependência).
3. **Backend: correção do bug de valor em `/faturar`** (ponto de maior risco — só prosseguir após reportar o resultado da etapa 0 ao usuário; implementar e testar isoladamente antes de seguir).
4. **Backend: ajuste do fallback de despesa-fantasma em `POST /incomes`**.
5. **Backend: re-disparo de `gerarPrevistas` em edição de contrato** (frontend `ClienteDetail.tsx`, consumindo rota já existente).
6. **Indicação de "última geração de previstas"** (pode exigir pequeno ajuste de query backend).
7. **Redesign visual do `IncomeDialog`** — reescrita de estilo, preservando toda lógica/automação existente intacta nesta etapa (não misturar redesign visual com automação nova no mesmo commit, para isolar regressões).
8. **Automações portadas do Expense** (autocomplete descrição, sugestão tipo receita, detecção duplicata, máscara moeda, atalhos teclado) — sobre a base já restilizada.
9. **Automações específicas de receita**: combobox de cliente com "+", auto-seleção de representante via contrato, auto-preenchimento de cliente via contrato, condicional de perfil PJ para bloco Representante, aviso de comissão sem match.
10. **Padrão "+" inline replicado**: representante no `ContratoForm`, serviço no sub-modal.
11. **UI de aditivo de contrato**.

## Regras de negócio identificadas

- Bloco Representante no `IncomeDialog` só deve renderizar quando o perfil ativo tem `tipo === 'empresa'`.
- Bloco Tipo de receita (pills + sugestão automática) também só deve renderizar quando o perfil ativo tem `tipo === 'empresa'` — decisão tomada após revisão visual da implementação (2026-08-05), revertendo a suposição inicial do plano de que seria campo livre para qualquer perfil.
- O modal de receita nunca deve virar cadastro completo de representante — cadastro de representante com comissão continua exclusivamente em Configurações → Representantes.
- Representante do contrato deve ser refletido automaticamente no modal de receita quando o contrato é selecionado, sem exigir re-seleção manual.
- Despesa de comissão só deve ser criada quando há match real de comissão configurada — não deve haver criação de despesa "fantasma" de valor simbólico.
- `/gerar-previstas` e `/faturar` devem produzir o mesmo valor para o mesmo contrato, independente de qual caminho o usuário usa.

## Regras multi-tenant e segurança

Este projeto isola dados por `usuario_id` (dono da conta) e `perfil_id` (sub-conta PF/PJ dentro da mesma conta), não por "tenant"/prefeitura. Todas as rotas tocadas já filtram por `req.user!.id` — nenhuma mudança deste plano introduz uma rota nova sem esse filtro; as alterações são em rotas já existentes e já protegidas por `authenticate`. Ao implementar:

- Confirmar que a correção de `/faturar` mantém o filtro `usuario_id` já existente na query de `contratos_servicos`.
- Confirmar que `registrarAditivo` (chamada a rota já existente) não precisa de mudança de autorização — a rota já valida posse do contrato via `usuario_id`.
- Nenhuma alteração aqui expõe dado de um `usuario_id`/`perfil_id` para outro.

## Validações necessárias

- Campo `cliente` (combobox): **exige vínculo com `Cliente` cadastrado** — validação no frontend (Zod `refine`/equivalente) rejeitando submit se o texto não corresponder a um `Cliente` existente (via `fetchClientes()`) ou recém-criado pelo "+" inline. Sem mudança de schema — a coluna `receitas.cliente` permanece `varchar`, a garantia é só de formulário.
- Receitas antigas com texto livre que não bate com nenhum `Cliente` cadastrado **não são afetadas retroativamente** — a validação só se aplica a novos submits do formulário, não a dados já salvos.
- `registrarAditivo`: validar `novo_vencimento` obrigatório no frontend antes de submeter (já é validado no backend, mas replicar no form evita round-trip desnecessário).
- Descrição do contrato: campo opcional, sem validação especial.

## Testes necessários

### Frontend

- `IncomeDialog`: renderização condicional do bloco Representante por tipo de perfil.
- `IncomeDialog`: auto-preenchimento de cliente/representante ao selecionar contrato.
- `IncomeDialog`: combobox de cliente cria e seleciona novo cliente corretamente.
- `IncomeDialog`: detecção de duplicata não bloqueia salvamento, só avisa.
- `IncomeDialog`: preview de comissão exibe aviso quando não há match.

### Backend

- `/faturar`: valor gerado passa a bater com `/gerar-previstas` para o mesmo contrato com serviços vinculados.
- `POST /incomes`: despesa de comissão não é criada quando não há `valor_comissao` válido.
- `/aditivo`: fluxo completo (fecha contrato antigo, cria novo, migra serviços, regenera previstas) continua funcionando após qualquer ajuste tangencial.

### E2E

- Fluxo completo: criar cliente → criar contrato com serviços e representante → gerar previstas → editar contrato → confirmar que previstas são regeneradas → lançar receita manual via modal com contrato selecionado → confirmar auto-preenchimento.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run lint
npm --prefix "sistema financas" run typecheck
npm --prefix "sistema financas" run build

npm --prefix "sistema financas/backend" run lint
npm --prefix "sistema financas/backend" run typecheck
npm --prefix "sistema financas/backend" run build
```

Nomes de script não confirmados nesta sessão de planejamento — ajustar conforme `package.json` real de cada pacote na hora de implementar.

## Riscos e pontos de atenção

- **Risco alto — correção de `/faturar` (item 9 do escopo):** mudar a fonte de valor de `valor_mensal` para soma de `contratos_servicos` pode alterar o valor de receitas futuras para contratos onde os dois números hoje divergem. Recomendação: antes de implementar, rodar uma consulta de auditoria (só leitura) comparando `valor_mensal` vs soma de serviços para todos os contratos ativos, e decidir com o usuário caso a caso se algum precisa de ajuste manual de dado antes do deploy da correção — isso pode justificar quebrar esse item em uma entrega separada do resto.
- **Risco médio — mudança de contrato de tipo `ContratoResumo`:** adicionar campos ao tipo é seguro (aditivo), mas qualquer lugar que hoje faça `Object.keys()` ou serialização estrita sobre esse tipo pode se comportar diferente — checar consumidores antes de alterar.
- **Risco médio — remoção de despesa-fantasma de comissão:** mudar o comportamento de "sempre cria despesa" para "só cria com match" é uma mudança de comportamento visível ao usuário — despesas de R$0,01 que hoje aparecem deixarão de aparecer para lançamentos novos (as antigas continuam existindo até serem limpas manualmente, o que está fora deste escopo).
- **Risco baixo-médio — extração de tokens/MoneyField compartilhados entre Expense e Income:** se decidir extrair para módulo comum na implementação, checar que isso não introduz regressão visual no Expense (que já está em produção e aprovado).
- **Escopo grande:** este plano toca ~13 itens em camadas diferentes. Recomendação: considerar quebrar em pelo menos 2 branches/entregas sequenciais — (A) correções backend + campos mortos + descrição de contrato (baixo risco, pequeno), (B) redesign visual + automações do IncomeDialog (maior, mais visível). A decisão de quebrar ou não fica com o usuário.

## Decisões aplicadas

- **Correção de `/faturar`:** auditar antes — rodar consulta somente leitura (Etapa 0) comparando `valor_mensal` vs soma de serviços em todos os contratos ativos, reportar ao usuário, só então aplicar a correção.
- **Resultado da auditoria (rodada em 2026-08-05, ambiente local `localhost:5433/sistema_financas`):** 3 contratos ativos, 2 divergentes. Contrato #1 (teste): `valor_mensal=R$0`, soma serviços=R$12.000 (diferença -R$12.000). Contrato #3 (teste): `valor_mensal=R$5.000`, soma serviços=R$0 (diferença +R$5.000, nenhum serviço vinculado com `faturando=true`).
- **Lógica de correção definida a partir do achado:** somar `contratos_servicos` (`faturando=true`) quando houver algum vinculado; caso contrário, fallback para `contrato.valor_mensal`. Decisão tomada porque uma troca sem fallback zeraria contratos como o #3, que faturam só por `valor_mensal` sem nenhum serviço vinculado.
- **Quebra em entregas:** uma única branch/entrega, seguindo a ordem completa da Estratégia de implementação (Etapa 0 em diante).
- **Campo `cliente`:** passa a exigir vínculo com `Cliente` cadastrado — mas só como validação de frontend (Zod/form), sem criar `cliente_id`/FK nova no banco. Coluna `receitas.cliente` continua `varchar` solto, zero migration.

## Perguntas em aberto

1. Extrair tokens de cor/`MoneyField` do Expense para um módulo compartilhado, ou duplicar no Income (mais simples agora, mais dívida técnica depois)? Recomendação: extrair — mas é decisão de implementação.
2. Formato exato da indicação "última geração de previstas" — texto simples, badge, tooltip? Fica a critério da implementação, a menos que haja preferência.

## Critérios de aceite do plano

- `IncomeDialog` visualmente equivalente ao padrão do `ExpenseDialog` (mesma paleta, estrutura, componentes de campo).
- Todas as automações exclusivas do Income (horas, comissão, replicação, guias) continuam funcionando sem regressão.
- Bloco Representante só aparece para perfil PJ.
- Selecionar um contrato em "Horas a faturar" preenche cliente e representante automaticamente.
- `/gerar-previstas` e `/faturar` produzem o mesmo valor para o mesmo contrato.
- Despesa de comissão só é criada quando há match real de comissão.
- Botão de aditivo de contrato funcional em `ClienteDetail`.
- Nenhum campo morto (`tipo_empresa`, `codigo`, `valor_contrato`) restante nas interfaces TS.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto — não é derivado de um `.md` de spec externo, mas de análise interativa completa já validada com o usuário.
- Seguir a ordem da seção "Estratégia de implementação" — especialmente não misturar o redesign visual (etapa 7) com novas automações (etapas 8-9) no mesmo commit.
- Tratar a correção de `/faturar` (etapa 3) com cautela extra — ver seção Riscos antes de implementar, e considerar consultar o usuário sobre auditoria de dados existentes antes de aplicar.
- Não executar migrations — nenhuma é necessária neste plano.
- Manter alterações pequenas e revisáveis por etapa, mesmo que o plano cubra escopo grande.
- Perguntar ao usuário sobre as "Perguntas em aberto" se a resposta não ficar óbvia durante a implementação.
