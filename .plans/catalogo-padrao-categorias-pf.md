# Plano de Implementação: Catálogo padrão de categorias PF com subcategorias e categoria obrigatória

## Origem

- Arquivo de especificação: `.portal/tasks/catalogo-padrao-categorias-pf.md`
- Complementos: bate-papo de 2026-10-18 (memória `catalogo_categorias_pf`) e as 4 decisões deste planejamento (ver "Decisões aplicadas").
- Data do planejamento: `2026-10-18`
- Classificação: `frontend + backend + database`
  - Motivo: muda a semeadura, as validações e as rotas (backend); os seletores, o assistente e as telas de configuração (frontend); e o schema, com migração de dados na produção.

## Resumo

O catálogo padrão pessoal hoje é plano: 10 nomes no seed e, na produção, 7 pais soltos mais cerca de 50 categorias personalizadas. Ele passa a ter **12 pais de despesa e 6 de receita, com subcategorias padrão** e uma sub "Outros de <pai>" em cada.

Em conta PF **só subcategoria recebe lançamento**, e a categoria passa a ser **obrigatória** em despesas e receitas (na API, na tela e, no fim, `NOT NULL` no banco). Juros e encargos de fatura viram **categoria de sistema oculta**.

A conta 17, única PF, é migrada na produção **reaproveitando as linhas existentes**, para preservar despesas, metas, favoritos e a receita fixa.

## Escopo

### Dentro do escopo

- Catálogos padrão PF de despesas (12 pais, 74 subs) e de receitas (6 pais, 30 subs) para contas novas. Raízes de receita com os nomes aprovados (decisão 1).
- Regra: em conta PF só subcategoria recebe lançamento. Categoria obrigatória em todas as contas. Categoria de sistema nunca escolhível.
- Pai novo exige ao menos uma subcategoria na mesma operação (decisão 2), no seletor e em Configurações. Nome único no catálogo inteiro.
- Coluna `categorias.sistema`. As categorias automáticas da fatura ("Encargos de cartão" e "Renegociação de fatura") passam a ser de sistema.
- IA e assistente sem o fallback "Outros", e card do assistente sem "Sem categoria".
- Frontend: seletor, diálogos, assistente, configurações, sugestões, ordenação e textos.
- Migração da conta 17: categorias, despesas, receitas, classificações, metas, favoritos e `aprendizado_categoria`.
- `NOT NULL` em despesas e receitas, em migration separada, no fim.
- Consolidar as regras de catálogo repetidas em despesas e receitas em um módulo único, apagando as cópias antigas (sem fundir as tabelas).

### Fora do escopo

- Valor bruto e líquido nas receitas e o gráfico de juros (task 2). Cadastro de Empréstimo (task 3).
- Catálogo e categorias da PJ, contratos e vitrine.
- Proteger categoria padrão contra renomear ou excluir (continua como hoje).
- Separar principal e juros dos 42 empréstimos antigos.
- Limpeza das branches e stashes antigos, e a conferência da possível duplicata "Casa Gustato" (id 19270).
- Campo legado `usuarios.categorias`. Demo e guias além do que quebrar.

## Leitura de contexto

- `/AGENT.md`, lido inteiro, e `/CLAUDE.md`. O `AGENT.md` é um template de backend multi-prefeitura: tenant e RLS não existem neste projeto. Valem as regras de Drizzle, inglês no código novo, validação no backend e nenhuma migration sem confirmação.
- `/frontend/AGENT.md`, `/backend/AGENT.md` e `/AGENTS.md`: **não existem** neste projeto.
- A task `.portal/tasks/catalogo-padrao-categorias-pf.md` e os planos `.plans/recategorizar-despesas-subcategoria.md` (modelo de ensaio e gravação) e `.plans/categoria-pai-e-receitas-assistente.md`.
- Código lido: `backend/src/services/defaultCategories.ts`, `incomeClassificationDefaults.ts`, `incomeClassificationCatalog.ts`, `expenseCategoryCatalog.ts`, `backend/src/routes/categories.ts`, `income-classifications.ts`, `expenses.ts`, `backend/src/services/categoryAI.ts`, `cardInvoiceService.ts`, `src/ui/CategoryFloatingSelect.tsx`, `src/utils/categorySuggestions.ts` e os diálogos de despesa e receita.
- Produção (somente leitura, 2026-10-18): FKs e índices, categorias, classificações, metas e favoritos da conta 17.

## Impacto por área

### Frontend

- **Seletor** (`src/ui/CategoryFloatingSelect.tsx`):
  - Usa a flag `selectable` calculada pelo backend (PF: só subcategoria; PJ: raiz sem sub ativa) e esconde grupos sem opção.
  - O "+ criar" vira dois campos: "em qual categoria?" (pai existente ou novo) e o nome da sub. O texto digitado vira o nome da sub, e a chamada é atômica.
  - O frontend já conhece o tipo da conta ativa (`contaAtivaTipo`); em PJ o "+ criar" continua como hoje.
  - **A decisão de "selecionável" vem só do servidor.** `groupSelectableCategories` (em `categorySuggestions.ts`) fica apenas para agrupar o cabeçalho, sem decidir seleção, e `selectableCategories` passa a ler a flag. `hasActiveSubcategory`, que hoje não tem nenhum chamador, é **apagada**.
- **Despesa e receita:** a despesa já exige categoria em `src/screens/finance/expense-dialog/draftRules.ts` (linha 385). A receita não exige: `income-dialog/draftRules.ts` e `IncomeRow.tsx` passam a exigir, com erro e marca de obrigatório. `createCategory` de `ExpenseDialog.tsx` e `IncomeDialog.tsx` segue o fluxo novo.
- **Assistente:** `src/components/financial-assistant/FinancialAssistant.tsx` (linhas 1702 e 1887) perde a opção "Sem categoria" e lista só opções selecionáveis. `categoryIdByName` em `cardDraft.ts` resolve só entre selecionáveis, e registrar exige categoria. Hoje o `<select>` lista também os pais.
- **Configurações:** `src/screens/config/CatalogoEmArvore.tsx`, `CategoriasTab.tsx` e `ClassificacoesReceitaTab.tsx`: "Nova categoria" pede a primeira sub, itens de sistema ficam ocultos e as subs padrão aparecem com o selo. Textos em `src/components/firstAccessGuideMessages.ts` (`categoriasNova`, `categoriasSub`).
- **Sugestões:** em `src/utils/categorySuggestions.ts`, `KEYWORD_RULES` aponta para pais (alimentacao, moradia, transporte…), que passam a ser só cabeçalho; sem troca, a sugestão por palavra-chave deixa de achar categoria. Trocar pelos nomes das subs. `compararNomesCatalogo` só põe "Outros" por último quando o nome é exatamente "Outros": estender a "Outros de …" (afeta também `classificacaoOpcoes.ts` e `incomeClassificationSuggestions.ts`).
- **Tipos** em `src/types/config.ts`: campos novos em inglês (`is_system`, `selectable`).
- **Estados:** loading e erro da criação atômica, e mensagem quando não houver subcategoria disponível. Demo (`src/services/demo/demoFakeDatabase.ts`) só se quebrar.

### Backend

- **Um módulo único de regras de catálogo**, compartilhado por categorias de despesa e classificações de receita (as tabelas continuam separadas). Hoje a mesma lógica existe duas vezes, em `expenseCategoryCatalog.ts` e `incomeClassificationCatalog.ts` e, nas rotas, em `routes/categories.ts` e `routes/income-classifications.ts`. O módulo concentra:
  - `canReceiveEntries`, usada pela validação e pelo `GET`. PF: só linha com `parent_id`, que não seja de sistema (inativas continuam aceitas). PJ: raiz sem sub ativa e não sistema. Sem `conta_id` na consulta, vale a regra atual (pai com sub ativa).
  - A unicidade de nome no catálogo inteiro (padrão + personalizadas).
  - A validação da criação atômica de pai + sub.
- **Sai do backend:** o aceite de categoria e de classificação nulas e as cópias da mesma regra em cada módulo e em cada rota.
- **Validação:** `expenseCategoryCatalog.ts` aceita nulo hoje (comentário na linha 10), e `isClassificationAllowed` em `incomeClassificationCatalog.ts` (linha 99) também. Passam a rejeitar nulo e a aplicar a regra acima.
  - A categoria atual continua aceita na edição. O PUT de despesa já faz isso (`routes/expenses.ts`). O PUT de receita (`routes/incomes.ts`, linha 135) **não faz**: replicar o padrão, senão lançamentos antigos ficam presos entre o deploy e a migração.
- `expenseInput.ts` e `incomeInput.ts`: `categoryId` obrigatório.
- **Rotas de catálogo** (`routes/categories.ts` e `routes/income-classifications.ts`):
  - `GET` devolve `is_system` e `selectable`.
  - `POST` de pai em conta PF só com subcategoria inicial, em transação (Drizzle).
  - Nome único em todo o catálogo, como as classificações já fazem (`belongsToCatalog`). Hoje as categorias só checam a própria conta.
  - Sub não pode nascer sob categoria de sistema, e categoria de sistema não é editável.
- **Seed:** `ensureDefaultCategories` passa a criar pai e subs, pelo mesmo padrão de `ensureDefaultIncomeClassifications`. PJ fica com a lista plana atual.
- `cardInvoiceService.ts` (linha 51): `findOrCreateInvoiceCategory` cria e usa categorias com `sistema = true`.
- **IA:** `utils/expenseNormalizer.ts` e `categoryAI.ts` sem fallback `/outros/i` (linha 111) e sem `'Outros'`. `assistantSlotSession.ts` e `financialAssistant.ts` só sugerem nome de sub que exista no catálogo da conta. Sem certeza, o card abre em branco e o usuário escolhe.
- Queries novas em Drizzle. SQL cru só onde o `ON CONFLICT` parcial exige, como no seed.

### Banco de dados

- **Migration 1 (aditiva):** `categorias.sistema boolean NOT NULL DEFAULT false`, mais um `UPDATE` que marca as automáticas já existentes ("Encargos de cartão" e "Renegociação de fatura" padrão, inclusive a da PJ).
- **Dados:** script de migração da conta 17.
- **Migration 2 (final):** `despesas.categoria_id` e `receitas.classificacao_id` como `NOT NULL`.
- Sem índice novo. O projeto não tem RLS, então não se aplica.
- Hoje os nulos são só da conta 17: 7 despesas e 70 receitas. A PJ está limpa.
- **Numeração:** a `main` vai até a 0084, e a branch de Licitações usa de 0085 a 0088 e vai avançar. Conferir o número livre na hora de criar.
- Chaves estrangeiras relevantes (lidas em produção): `despesas.categoria_id` sem ação de exclusão; `orcamento_metas.categoria_id` CASCADE; `recorrencias_ia.categoria_id` SET NULL (tabela vazia); `receitas.classificacao_id` SET NULL; `classificacoes_receita_fixas.classificacao_id` CASCADE; `comissoes.classificacao_id` CASCADE (só PJ); `classificacoes_receita.parent_id` CASCADE; contratos SET NULL (só PJ).

### Infra/Deploy

- Sem variável de ambiente nova. O `.env` da raiz é de **produção** e não é alterado.
- Ordem: migration 1 em produção antes do merge, e migration 2 só depois da migração de dados. Confirmar backup recente do Render antes da gravação.

## Arquivos provavelmente afetados

- **Backend:** `backend/src/services/defaultCategories.ts`, `incomeClassificationDefaults.ts` (e o `.test.ts`), `incomeClassificationCatalog.ts`, `expenseCategoryCatalog.ts`, `expenseInput.ts`, `incomeInput.ts`, `categoryAI.ts`, `financialAssistant.ts`, `assistantSlotSession.ts`, `cardInvoiceService.ts`, `backend/src/utils/expenseNormalizer.ts`, `backend/src/routes/categories.ts`, `income-classifications.ts`, `incomes.ts`, `expenses.ts`.
- **Frontend:** `src/ui/CategoryFloatingSelect.tsx`, `src/screens/finance/expense-dialog/` (`ExpenseDialog.tsx`, `ExpenseRow.tsx`, `draftRules.ts`), `src/screens/finance/income-dialog/` (`IncomeDialog.tsx`, `IncomeRow.tsx`, `draftRules.ts`), `src/components/financial-assistant/` (`FinancialAssistant.tsx`, `cardDraft.ts`), `src/screens/config/` (`CatalogoEmArvore.tsx`, `CategoriasTab.tsx`, `ClassificacoesReceitaTab.tsx`), `src/utils/categorySuggestions.ts`, `incomeClassificationSuggestions.ts`, `classificacaoOpcoes.ts`, `src/types/config.ts`, `src/components/firstAccessGuideMessages.ts`, `src/services/configService.ts`, `incomeClassificationsService.ts`.
- **Banco:** `backend/src/db/schema/categories.ts`, `expenses.ts`, `incomes.ts` e duas migrations novas em `backend/drizzle/`.

## Estratégia de implementação

**Fase 0: preparação**

0. Criar worktree e branch `feat/R/catalogo-categorias-pf` a partir da `main`. O diretório principal está na branch de Licitações do outro chat. Copiar este plano e a task para o worktree (estão sem commit no diretório principal; `.portal/` nunca entra em commit). Copiar o `.env` de produção para o worktree só com confirmação do usuário.

**Fase 1: código (local, nada em produção)**

1. Regra pura `canReceiveEntries` e seus testes.
2. Catálogos padrão PF (despesas e receitas), `ensure*` com subs, reescrita dos testes de receitas e teste novo de despesas.
3. Schema `sistema` mais o arquivo da migration 1 (**não aplicada** sem confirmação do usuário).
4. Validação de gravação (despesa e receita), entradas obrigatórias, "categoria atual aceita" também no PUT de receita.
5. Rotas de catálogo: flags no `GET`, `POST` atômico, nome único no catálogo, categoria de sistema protegida.
6. Fatura com categorias de sistema.
7. IA e assistente sem fallback.
8. Frontend base: tipos, sugestões, ordenação, seletor e criação em dois passos.
9. Frontend: diálogos (receita obrigatória), assistente, configurações e guias.
10. Validar: `npm test`, `npm run build`, `npm --prefix backend test`, `npm --prefix backend run build`.

**Fase 2: produção (após o `/finalizar`, fora do auto mode, cada comando com aprovação)**

11. Aplicar a migration `0084a` (local, depois produção, com `--confirmo`). É aditiva e o código atual a ignora.
    - **Ordem revista na implementação:** a migração de dados (passo 12) roda **antes** do merge e do deploy. O catálogo novo é compatível com o código atual, e o código novo esconde as categorias soltas de hoje (conta pessoal: só subcategoria recebe lançamento) até elas serem convertidas. Fazer o deploy primeiro deixaria Vestimenta, Academia, Telefonia, Empréstimo e outras sem poder receber lançamento novo até a migração.
12. **Script da conta 17** (temporário, fora do repositório, mapeamento por nome conforme o Anexo deste plano), numa transação:
    - **Pré-checagens:** URL da produção (`.render.com`), usuário 1 e conta 17, contagens esperadas (1.378 despesas, 94 receitas, 12 metas, 7 despesas e 70 receitas sem categoria) e mapeamento completo e sem colisão de nomes.
    - **Snapshot** em CSV no rascunho: categoria, classificação, metas, favoritos e `aprendizado_categoria`.
    - **Categorias, nesta ordem:**
      1. Criar os pais e converter pais existentes (ex.: Cuidados Pessoais, Trabalho, Streaming → Assinaturas).
      2. Converter **1:1 a própria linha** em sub padrão: renomear, reparentar, `conta_id` nulo e `tipo = pessoal`. Preserva despesas, metas e favoritos.
      3. Criar as que faltam pela regra do seed.
      4. Mesclar as que viram uma (Mecânica + Lava Car; IA + Banco de Dados + Registro + Estudos; "Encargos Cartão" 957 + "Encargos de cartão" 981, esta marcada como `sistema`): mover despesas e repontar metas e favoritos.
    - **Despesas:** mover as 108 do pai, as 166 do pai "Outros" e as 7 sem categoria, com as 3 travas (id, `conta_id`, categoria de origem). Estudos → Ferramentas e Software (decisão 4). Subs por serviço de Streaming ficam como personalizadas sob Assinaturas (decisão 3). "Ajuste" de R$ 8.250,04 em Empréstimo → Outros de Finanças e Impostos.
    - **Receitas:** converter em lugar, mover as receitas que estão em raízes que viram grupo e classificar as 70 conforme o Anexo. A receita fixa de Salário (id 1) fica intacta.
    - **Limpeza, no fim:** excluir só o que ficou vazio (Outros, Presentes, Lavanderia, Estudos, Sistema e afins) e apagar as 12 linhas antigas de `aprendizado_categoria` do usuário 1.
    - **Relatório e conferência:** contagens por etapa, puladas, equivalência de totais por mês e por pai (antigo → novo). `COMMIT` só com `--confirmo` e com tudo batendo. O usuário vê o **ensaio** (`ROLLBACK`) antes da gravação.
13. Merge e deploy do código novo (via `/finalizar`), só depois da migração de dados.
14. Conferência pela tela, com o usuário.

**Fase 3: obrigatoriedade no banco**

15. Migration `0084b` (`NOT NULL`), aplicada só com **0 nulos** confirmados e depois do deploy, e `.notNull()` no Drizzle.
    - **Uma migration e uma janela de deploy por tabela.** A task 2 também mexe em `receitas` (renomear `valor` para `valor_liquido` e tornar `valor_bruto` obrigatório). Se a task 2 estiver pronta para entrar logo depois da migração de dados, a parte de `receitas` desta migration 2 é **fundida** com a da task 2, em um só arquivo. Caso contrário, aplica-se esta sozinha.
16. Registro de andamento no fim deste plano e atualização da memória.

## Regras de negócio identificadas

- Em conta PF só subcategoria recebe lançamento (despesa e receita). Categoria obrigatória em toda conta.
- Pai novo exige ao menos uma sub na criação. Todo pai padrão tem "Outros de <pai>". Nome único no catálogo.
- Juros e encargos nunca são categoria. "Encargos da fatura" e "Renegociação de fatura" são de sistema.
- A IA pergunta ao usuário quando não souber classificar.
- Metas acompanham a sub nova com o mesmo valor (Pedágio e Estacionamento, Manutenção do Veículo, Ferramentas e Software).
- Mapeamentos da conta 17: Anexo deste plano, mais as decisões 3 e 4.
- Categorias padrão continuam editáveis como hoje.

## Regras multi-tenant e segurança

- Projeto não é multi-prefeitura. O isolamento é por `usuario_id` do dono e por `conta_id`; na conta compartilhada o catálogo pertence ao dono (`resolveAccountOwnerId`).
- Toda checagem de categoria continua exigindo que ela pertença ao catálogo do dono da conta.
- A categoria de sistema não pode ser escolhida nem editada pelo usuário.
- Mensagens de erro sem vazar dados. A migração filtra por usuário 1 e conta 17.
- O `.env` não é alterado. Nenhum comando em produção roda sem aprovação.

## Validações necessárias

- `categoryId` inteiro positivo e obrigatório (despesa e receita).
- Criação atômica: nome (até 255 na categoria, 100 na classificação), ao menos 1 sub quando o pai é novo em conta PF, `parent_id` do dono e de nível 1, nome único sem diferenciar maiúsculas.
- Script: URL de produção, contagens esperadas, mapeamento único, 3 travas por `UPDATE`.

## Testes necessários

### Frontend

- `src/utils/categorySuggestions.test.ts`: `KEYWORD_RULES` novas e "Outros de" por último.
- `src/screens/finance/income-dialog/draftRules.test.ts`: categoria obrigatória.
- `src/components/financial-assistant/cardDraft.test.ts`: só selecionáveis e sem "Sem categoria".
- Regra de agrupamento do seletor com a flag `selectable`.

### Backend

- Catálogos: nomes únicos por tipo, 12 pais e 74 subs, "Outros de" em todo pai, PJ inalterada, receitas 6 e 30.
- `canReceiveEntries` (PF e PJ) e entradas obrigatórias.
- `categoryAI` e `expenseNormalizer` sem 'Outros'.
- Em `backend/src/services/incomeClassificationDefaults.test.ts`, o teste "uma palavra por raiz" sai (decisão 1) e "listas terminam em Outros" é reescrito para "Outros de <raiz>".

### E2E

- Manual, pelo usuário: criar despesa e receita pelas telas; tentar salvar sem categoria e no pai; testar o "+ criar" em dois campos.
- Conferir pela tela, na conta 17, metas, painel e filtros.

## Comandos de validação sugeridos

```bash
npm test
npm run build
npm --prefix backend test
npm --prefix backend run build
npm --prefix backend run migrations:status -- --banco local   # só leitura
```

Não existe script de lint nem de typecheck do frontend. O `build` do backend roda `tsc --noEmit`, e o `vite build` não checa tipos: conferir se `npx tsc --noEmit` funciona na raiz.

## Riscos e pontos de atenção

- **Dados de produção** (1.378 despesas, 94 receitas, 12 metas). Mitigação: snapshot, transação, ensaio, equivalência de totais, aprovação por comando e backup confirmado.
- **Cascatas:** apagar categoria apaga metas (CASCADE); apagar classificação apaga a receita fixa e as regras de comissão (CASCADE) e **anula** `receitas.classificacao_id` (SET NULL). Mitigação: reaproveitar linhas, repontar antes de apagar, `NOT NULL` como rede de segurança.
- A exclusão de categorias vazias é o único passo sem volta exata. Fica no fim da transação, depois das conferências.
- **Índices de nome único:** padrão e personalizada com o mesmo nome convivem e aparecem duplicadas; a ordem das operações evita colisão.
- **`NOT NULL`:** um caminho de gravação esquecido vira erro 500. Pontos mapeados: `expenseService`, `cardInvoiceService`, `commissionService`, `seriesRenewalService`, `incomeService`, `fixedIncomes`, `contractIncomes`, `orders`, `accountPartners`.
- **Janela entre o deploy e a migração de dados:** a validação aceita a categoria atual e a interface funciona com o catálogo antigo.
- **PJ:** "obrigatória" e "pai com sub ativa" valem também para ela. A Aether (25 despesas e 6 receitas, todas classificadas) não é afetada. `commissionService` cria uma raiz "Comissão" sem subs, de uso só da PJ.
- **Paridade da regra** entre frontend e backend: resolvida pela flag `selectable` vinda do servidor.
- **UX do "+ criar" em dois campos** muda um fluxo conhecido: validar manualmente.
- **Numeração de migration** colidindo com as Licitações. **Dois chats no mesmo repositório:** usar o worktree.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

## Perguntas em aberto

Nenhuma pergunta de produto em aberto. Confirmações operacionais durante a execução:

- Backup recente do Render antes da gravação.
- Número livre da migration.
- Aprovação do usuário em cada comando de produção.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- Conta PF nova nasce com 86 categorias padrão (12 pais e 74 subs) e 36 classificações de receita (6 pais e 30 subs).
- Em PF, a API rejeita lançamento sem categoria, em pai e em categoria de sistema. Na PJ, rejeita sem categoria e em raiz com sub ativa. Aceita a categoria atual na edição.
- Pai novo em PF sem sub: 400. Com sub: cria os dois numa transação.
- Seletor, configurações e assistente: sem "Sem categoria", pai não selecionável, "+ criar" pergunta o pai. A IA nunca sugere pai nem "Outros".
- "Encargos de cartão" não aparece para escolha, e o pagamento da fatura continua gerando "Encargos da fatura".
- **Conta 17 após a migração:** 0 despesas em pai, 0 sem categoria, 0 receitas sem classificação. As categorias Outros (815), Presentes (979), Lavanderia (980), Estudos (827) e Sistema (849) deixam de existir. Totais por mês e por pai idênticos pela equivalência. As 12 metas, os favoritos e a receita fixa de Salário preservados. `aprendizado_categoria` sem nomes extintos.
- Migration 2 aplicada com 0 nulos. Testes e builds passam. Nomenclatura nova em inglês.
- PJ inalterada.

## Observações para a skill implementar

- Usar este plano e a task como fonte. Seguir `/AGENT.md` e `/CLAUDE.md`.
- Trabalhar no worktree, na branch `feat/R/catalogo-categorias-pf`, a partir da `main`.
- Alterações pequenas e focadas, uma etapa por vez, com os testes da etapa.
- **Migrations e comandos em produção só com confirmação explícita.**
- O script de produção é temporário, fora do repositório, e é apagado no fim.
- Registrar o andamento ao final deste plano a cada etapa.
- **Substituir, não sobrepor** (preferência do usuário, memória `sem-sobreposicao-reconstruir-existente`): o código deve ficar como se escrito uma única vez. Ao trocar uma regra, apagar a antiga na mesma entrega; sem fallback morto nem compatibilidade duplicada.
  - **O que sai:** o aceite de categoria e classificação nulas, `hasActiveSubcategory` (sem chamadores), a decisão de selecionável no frontend, as regras repetidas em dois módulos e em duas rotas, as constantes `INVOICE_CATEGORIES` como padrão visível, o `'Outros'` e o `/outros/i` da IA e a opção "Sem categoria" do card do assistente.
  - **O que é de fato novo:** a coluna `categorias.sistema`, a flag `selectable` na API (que substitui a lógica do frontend) e o módulo único de regras (que substitui duas cópias).

## Decisões aplicadas

- **Decisão 1:** raízes de receita PF mantêm os nomes aprovados (Renda Extra, Investimentos e Rendimentos, Reembolsos e Restituições, Outras Entradas). A regra "uma palavra por raiz" deixa de valer para as receitas PF.
- **Decisão 2:** o usuário pode criar categoria pai, mas deve criar ao menos uma subcategoria junto. Em conta PF só subcategoria recebe lançamento.
- **Decisão 3:** as subcategorias por serviço de Streaming (Disney, Netflix, Prime, Spotfy, YouTube) ficam como personalizadas sob Assinaturas.
- **Decisão 4:** Estudos (6 despesas de ferramentas: Claude, Claude IA, IA e Render) vai para Trabalho e Negócios › Ferramentas e Software.
- **Revisões pelo princípio "sem sobreposição" (aprovadas em 2026-10-18):** módulo único de regras de catálogo para despesas e receitas, com a lista do que sai; a coluna `sistema` e a flag `selectable` justificadas como as únicas peças novas; e uma migration e uma janela de deploy por tabela (fusão com a task 2 em `receitas`).

---

## Anexo: catálogos e mapeamento da conta 17

Ids lidos na produção em 2026-10-18. **Reler no banco (somente leitura) antes de fixar o mapeamento.**

### Catálogo de despesas PF (cada pai tem também "Outros de <pai>")

| Pai | Subcategorias |
|---|---|
| Moradia | Aluguel, Condomínio, Energia, Água e Gás, Internet, Telefone, IPTU e Taxas, Manutenção e Reparos, Móveis e Decoração, Eletrodomésticos, Lavanderia e Limpeza, Seguro Residencial/Fiança |
| Alimentação | Mercado, Restaurantes e Bares, Delivery, Padaria e Lanches |
| Transporte | Combustível, Aplicativo e Táxi, Pedágio e Estacionamento, Manutenção do Veículo, IPVA e Licenciamento, Multas, Seguro do Veículo, Financiamento do Veículo, Transporte Público |
| Saúde | Consultas, Exames, Farmácia, Plano de Saúde, Dentista, Terapia, Academia |
| Cuidados Pessoais | Salão, Barbearia, Estética, Cosméticos e Perfumaria |
| Vestuário e Compras | Roupas e Calçados, Acessórios, Eletrônicos, Compras Online |
| Lazer e Viagens | Viagens, Eventos e Passeios, Jogos, Esportes e Hobbies, Bares e Festas |
| Assinaturas | Streaming de Vídeo, Música, Software e Apps |
| Educação | Cursos, Livros e Material, Mensalidade |
| Trabalho e Negócios | Ferramentas e Software, Equipamentos, Despesas Profissionais |
| Família e Social | Presentes, Doações, Filhos, Pets |
| Finanças e Impostos | Empréstimos, Tarifas Bancárias, Impostos, Seguros Pessoais (sem sub de juros e encargos) |

### Catálogo de receitas PF (cada pai tem também "Outros de <pai>")

| Pai | Subcategorias |
|---|---|
| Emprego | Salário, 13º, Férias, Vale Refeição/Alimentação, Bônus e PLR |
| Renda Extra | Freelance, Serviços e Bicos, Vendas, Comissões |
| Benefícios | Aposentadoria, Pensão, Auxílios, Seguro-Desemprego, FGTS (uma sub só) |
| Investimentos e Rendimentos | Juros, Dividendos, Aluguéis, Venda de Ativos |
| Reembolsos e Restituições | Reembolso de Despesas, Restituição de IR, Cashback e Estornos |
| Outras Entradas | Presentes Recebidos, Venda de Bens Usados, Empréstimos Recebidos |

### Despesas: categoria atual → destino (converter a própria linha quando for 1:1)

Pais padrão atuais: Alimentação 809, Transporte 810, Moradia 811, Saúde 812, Lazer 814 (vira "Lazer e Viagens"), Outros 815 (166 despesas, deixa de existir), Encargos de cartão 981 (vira categoria de sistema).

| Origem | Destino |
|---|---|
| Alimentação › Mercado 948, Ifood 947 | Mercado, Delivery |
| Transporte › Combustível 929, Uber 928, Pedágio 937, Mecânica 930 (+ Lava Car 984), IPVA 954, Multas 991, Financiamento 953 | Combustível, Aplicativo e Táxi, Pedágio e Estacionamento, Manutenção do Veículo, IPVA e Licenciamento, Multas, Financiamento do Veículo |
| Moradia › Aluguel 931, Condomínio 933, Energia Elétrica 932, Internet 934, Manutenção 935, Móveis/Eletros/Decoração 936, Seguro Fiança 949, Lavanderias 992 | Aluguel, Condomínio, Energia, Internet, Manutenção e Reparos, Móveis e Decoração, Seguro Residencial/Fiança, Lavanderia e Limpeza |
| Telefonia 857 (pai, 11 despesas) | Moradia › Telefone |
| Saúde › Farmácia 938, Consultas 989, Exames 990; Academia 823 (pai, 23 despesas) | Farmácia, Consultas, Exames; Saúde › Academia |
| Cuidados Pessoais 824 › Salão 945, Barbearia 946 | continuam; o pai vira padrão |
| Vestimenta 835 (pai, 152 despesas) | Vestuário e Compras › Roupas e Calçados |
| Lazer › Futebol 985, Viagens 987, Xbox 943, Presente 995 (vazia) | Esportes e Hobbies, Viagens, Jogos; Presente é removida |
| Trabalho 833 › Bauhaus 955, Aether 956, Particular 994 | continuam como personalizadas sob Trabalho e Negócios |
| Sistema 849 › IA 950, Banco de Dados 951, Registro 952; Estudos 827 (6 despesas) | Trabalho e Negócios › Ferramentas e Software (decisão 4) |
| Streaming 832 (pai, 3 despesas diretas) › Disney 940, Netflix 941, Prime 939, YouTube 942, Spotfy 958 | o pai vira Assinaturas; as 5 subs continuam personalizadas (decisão 3) |
| Imposto 859 (pai, 1 despesa) › INSS 993 (vazia) | Finanças e Impostos › Impostos; INSS é removida |
| Empréstimo 826 (pai, 42 despesas) | Finanças e Impostos › Empréstimos |
| Encargos Cartão 957 (3 "Juros Cartão") e Encargos de cartão 981 | categoria de sistema "Encargos de cartão" |
| Presentes 979 (pai solto, 9 despesas) | Família e Social › Presentes (e a 979 é excluída) |
| Lavanderia 980 (pai solto, 1 despesa) | Moradia › Lavanderia e Limpeza (e a 980 é excluída) |

### Despesas hoje no pai (108), no "Outros" (166) e sem categoria (7): destinos decididos

- **Alimentação › Mercado:** Giassi, Bistek, Mercado, Distribuidora, Mercantil Araujo, Avila.
- **Alimentação › Restaurantes e Bares:** Restaurante ×2, Restaurante Rosso, Restaurante Soka, Bistek/bar, Café Bistro, Seu Bragança, Trapiche, Baiuka, Noboru, Engenho, Casa Gustato, Bauhaus Bistro, Combo ×3.
- **Alimentação › Delivery:** Ifood (id 19045, sem categoria hoje). **Padaria e Lanches:** Lanchonete.
- **Moradia › Móveis e Decoração:** Amazon ×100, Havan/Cadeiras ×3. **Eletrodomésticos:** Cooler. **Lavanderia e Limpeza:** Lavanderia ×2. **Manutenção e Reparos:** MIRIAN - LIXO. **Internet:** Engeplus (id 18645, sem categoria hoje).
- **Transporte › Pedágio e Estacionamento:** Estacionamento ×2, Gerestar. **Multas:** MULTA ×7.
- **Saúde › Consultas:** Solumed e Solumedi ×6.
- **Cuidados Pessoais › Barbearia:** DonPetine e Donperine ×11. **Cosméticos e Perfumaria:** Maquiagem.
- **Vestuário e Compras:** Roupas e Calçados para Inkieta ×10, Shein ×7, Camisa Mirian e BKKO ×3 (ids 19254 a 19256, sem categoria hoje); Compras Online para Mercado Livre ×9, Shopee, RM Ecommerce e Loja; Eletrônicos para Kit Fone ×3, Conserto celular ×2 e Capinha ×2.
- **Lazer e Viagens:** Viagens para Praia, Balsa 2X, Governador C. Ramos e Lazer 21/12 a 22/12; Esportes e Hobbies para Futebol ×8; Eventos e Passeios para Cinema, Boliche e Zanni Convites.
- **Trabalho e Negócios:** Particular para Stream e Streamyard; Bauhaus para Técnológica - Willian (id 18939, sem categoria hoje); Despesas Profissionais para FaceBook ×2; Ferramentas e Software para Registro Domínio.
- **Família e Social:** Presentes para PRESENTE MIRIAN ×3 e Presentes; Doações para Fundação Cultural de Criciúma, FUNDAI e realize sociedade; Outros de Família e Social para Mirian ×7, Fatura Mirian e as pessoas no pix (Gilberto Souza, Tania, GKM, Jim, Mana, Gabriel, Hudson, Amauri Goulart, RuanAlves, 64Pedro, Varela, Lorany).
- **Finanças e Impostos:** Impostos para Darf CNPJ; Tarifas Bancárias para Mercado pago e MP; Empréstimos para EMPRÉSTIMO ×9 e Empréstimo Juliano; Outros de Finanças e Impostos para os Ajustes (Moradia ×3, Alimentação ×8, Outros ×3, mais o de Empréstimo) e NuBank - Mirian.
- **Sem destino exato** (vão para o "Outros de" do pai mais próximo, e o usuário revisa depois): NÃO SEI, JOLOJADEVARI, TopSul Compressores, Multi 360 e Emergência.

### Metas de orçamento da conta 17 (12, mantêm o valor)

Ifood (R$ 100) e Mercado (R$ 1.300) vão para Delivery e Mercado; Aluguel (R$ 1.006,77), Condomínio (R$ 536,22) e Internet (R$ 120) ficam nas mesmas subs; IA (R$ 114) vai para Ferramentas e Software, junto com Banco de Dados; Combustível (R$ 300), Financiamento (R$ 0,50), IPVA (R$ 60), Mecânica (R$ 270, junto com Lava Car), Pedágio (R$ 5,33, junto com Estacionamento) e Uber (R$ 114,20) vão para as subs equivalentes de Transporte.

### Favoritos de forma e cartão (6)

Academia 823, Moradia 811, Transporte 810, Alimentação 809, Imposto 859 e Sistema 849. O favorito de Sistema (crédito, cartão 6) passa para Ferramentas e Software. Os demais ficam nas linhas convertidas.

### Receitas PF: classificações atuais → novas (converter em lugar)

| Atual | Destino |
|---|---|
| Emprego 16 (Salário 1, 13º 2, Férias 3, Vale refeição 17) | Emprego; Vale refeição vira "Vale Refeição/Alimentação"; criar "Bônus e PLR" |
| Benefícios 4 (Aposentadoria 5, Pensão 6, Auxílio 7) | Benefícios; Auxílio vira "Auxílios"; criar Seguro-Desemprego e FGTS |
| Freelance 8 e Comissões 13 (3 receitas) | viram subs da nova raiz "Renda Extra"; criar Serviços e Bicos e Vendas |
| Investimentos 10 (Juros 11, Dividendos 12) e Aluguéis 9 | Investimentos vira "Investimentos e Rendimentos"; Aluguéis vira sub dela; criar Venda de Ativos |
| Reembolsos 14 (3 receitas) | vira "Reembolsos e Restituições"; as 3 receitas vão para "Reembolso de Despesas"; criar Restituição de IR e Cashback e Estornos |
| Outros 15 (3 receitas) | vira "Outras Entradas"; as 3 receitas vão para "Outros de Outras Entradas"; criar Presentes Recebidos, Venda de Bens Usados e Empréstimos Recebidos |

A receita fixa existente (classificação Salário, id 1, conta 17) precisa continuar viva: **não recriar nem apagar a linha 1**.

### Receitas PF: 24 já classificadas e 70 sem classificação

- **Sem classificação (70):**
  - Salário, Salario, SALÁRIO, Sáraio (15) e reajuste (3) → Emprego › Salário.
  - Vale, Vale alimentação, VALE ALIMENTAÇÃO, BeeVale e Bee (11) → Vale Refeição/Alimentação.
  - FGTS (2) → Benefícios › FGTS.
  - Presente Pai (2) → Presentes Recebidos.
  - Reembolso Bauhaus (2) e Mirian (12, inclusive Mirian - Aluguel) → Reembolso de Despesas.
  - Meli (4) → Renda Extra › Vendas.
  - Empréstimo (1) → Empréstimos Recebidos.
  - Bauhaus, Adiantamento Bauhaus, Tecnológica, Tecnológica - viajem, Chat (4), Whats, Conta@, Agência (15), mais Next, Ajuste e Outros (3) → Renda Extra › Comissões.
- Atenção: o Ajuste de R$ 5.366,78 (dez/2025) entra em Comissões por decisão do usuário e merece conferência pela tela depois da migração.

---

## Registro de andamento

- **2026-10-18:** plano aprovado e salvo. Nenhuma etapa implementada.
- **2026-10-18:** revisões 1 a 3 pelo princípio "sem sobreposição" aplicadas ao plano (só o arquivo do plano; nenhum código alterado).
- **2026-10-18, implementação da Fase 1 (worktree `feat/R/catalogo-categorias-pf`, sem commit):** passos 1 a 9 prontos e validados. Backend: `tsc` limpo e 522 testes. Frontend: `tsc` limpo, 288 testes e `vite build`. Migration `0084a_categorias_sistema.sql` criada e **não aplicada** (a letra a mantém depois da 0084 e fora das 0085 a 0090 das Licitações; a do `NOT NULL` será a `0084b`). Fora do plano escrito, pelo mesmo princípio de regra única: `budgetService` passou a usar `canReceiveEntries` (campo `hasActiveSubcategories` virou `isGroup` e a categoria de sistema sai do planejamento), e `opcoesDeClassificacao` e as sugestões de receita obedecem `selectable`, o que tirou o filtro próprio do assistente de contratos. Ordem da Fase 2 revista (passo 11). Pendente: `/finalizar` e a Fase 2.
- **2026-10-18/19, Fase 2 preparada (nada gravado em produção):** scripts descartáveis fora do repositório (C:/Users/rodri/.claude/projects/c--Users-rodri-Music-sistema-financas/f2-conta17-scripts/, com LEIA-ME). Mapeamento conferido contra a produção ao vivo: 1.378 despesas e 94 receitas da conta 17, nenhuma sem destino. Ensaio em Postgres em memória (PGlite) com cópia só de leitura das linhas de produção: 19 cenários passaram (recusas, plano somente leitura, ensaio com ROLLBACK, gravação, desfazer que devolve as tabelas idênticas às de antes). Achado fora do plano: a despesa 19952 (encargos da fatura do Nubank da Mirian, 2026-10-18) usa a categoria 982 do catálogo DELA (usuário 15), porque `findOrCreateInvoiceCategory` em `cardInvoiceService.ts` usa `card.userId` e não o titular da conta; a migração passa essa despesa para a categoria de sistema 981 do titular e não apaga a 982; a correção no código (usar `resolveAccountOwnerId(card.userId, card.accountId)`) depende de decisão. Pendente: ok para aplicar a 0084a (local e produção) e para o ensaio e a gravação em produção.
- **2026-10-19, Fase 2 em andamento:** `0084a` aplicada no banco local e na produção (aprovado por ele; produção com 79 registros e nenhuma pendente; marcadas como sistema só as duas "Encargos de cartão", ids 981 e 982). Ensaio em produção (`f2-prod.mts --ensaio`, ROLLBACK) passou em todas as conferências: 1.378/1.378 despesas e 94/94 receitas nos destinos esperados, totais por mês idênticos, 12 metas com os mesmos ids e valores, receita fixa intacta, catálogo igual ao do app (36 categorias convertidas no lugar, 46 criadas, 10 apagadas, 304 despesas e 76 receitas movidas); depois do ensaio a produção conferida de novo e sem alteração. Correção da categoria de sistema da fatura (cartão de membro) feita no worktree, sem commit: `invoiceCatalogOf` em `cardInvoiceRules.ts` (função pura, 2 testes), usada em `cardInvoiceService.ts`; backend com 524 testes e `tsc` limpo. Falta: ok dele para a gravação (depois de conferir o backup do Render), merge/deploy pelo `/finalizar` (que commita a correção), conferência na tela, `0084b`.
- **2026-10-19, gravação da conta 17 feita em produção (COMMIT, 11:50 UTC):** todas as conferências passaram (1.378/1.378 despesas, 94/94 receitas, totais por mês idênticos, 12 metas intactas, receita fixa intacta). Conferido depois, só leitura: 0 despesas e 0 receitas sem categoria/classificação em todas as contas (pré-requisito da `0084b`), 0 despesas da conta 17 em categoria de outro usuário, 95 categorias no catálogo da conta. Desfazer disponível e validado (`antes.json` copiado para f2-conta17-scripts/antes-2026-10-19-gravacao.json; só vale enquanto ninguém usar categoria nova). Backup do Render (export) criado por ele antes. Falta: `/finalizar` (commita a correção da fatura) com merge e deploy, conferência na tela, `0084b`.
- **2026-10-19, Fase 3 (`0084b`):** aplicada na produção (aprovado por ele) com zero lançamentos sem categoria/classificação em todas as contas: `despesas.categoria_id` e `receitas.classificacao_id` NOT NULL, e a FK de `receitas.classificacao_id` passou de ON DELETE SET NULL para NO ACTION (a rota já recusa excluir classificação em uso). Ensaio em PGlite com a cópia de produção: recusa com um nulo plantado, aplicação, inserts sem categoria recusados, exclusão de classificação em uso recusada, reaplicar inofensivo. Código na branch `feat/R/categoria-obrigatoria-banco` (sem commit): `.notNull()` no Drizzle de despesas e receitas, o fallback morto `?? null` de `contractIncomes.ts` virou erro explícito, tipos da série de despesas sem `null`; backend com 524 testes e `tsc` limpo. O banco local tem 53 receitas sem classificação (dados de desenvolvimento): a `0084b` só se aplica lá depois de classificá-las. Falta: `/finalizar` dessa branch (commita a migration e o schema) e a conferência dele na tela.
