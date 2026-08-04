# Plano de Implementacao: Simplificar Categorias e Automatizar Sugestoes em Despesas

## Origem

- Arquivo de especificacao: `.plans/tasks/simplificar-categorias-e-sugestoes-despesas.md`
- Data do planejamento: `2026-08-04`
- Classificacao: `fullstack`

## Resumo

Simplificar o cadastro de categorias e melhorar o cadastro de despesas com sugestoes automaticas simples, sem IA externa e sem migrations nesta etapa.

A categoria continua existindo pelo valor analitico em relatorios e filtros, mas deixa de ser uma barreira operacional. O usuario deve conseguir criar categorias rapidamente, salvar despesas sem categoria quando quiser e receber sugestoes por descricao, historico e uso recente.

Como o sistema ainda e novo, nao e necessario preservar customizacoes antigas de categoria como cor, OPEX/CAPEX, forma favorita ou cartao favorito no fluxo visual.

## Escopo

### Dentro do escopo

- Simplificar o modal de categoria para campos essenciais:
  - `Nome`;
  - `Categoria pai`, opcional, para criar subcategoria.
- Remover do fluxo visual de categoria:
  - cor manual;
  - classificacao OPEX/CAPEX;
  - forma favorita;
  - cartao favorito;
  - preview da categoria.
- Parar de enviar campos avancados de categoria pelo frontend no fluxo principal.
- Permitir salvar despesa sem categoria real.
- Corrigir backend para nao atribuir automaticamente a primeira categoria quando `categoria_id` nao for enviado.
- Exibir `Sem categoria` apenas como fallback de apresentacao em telas e relatorios.
- Melhorar sugestao no cadastro de despesa por:
  - palavras-chave da descricao;
  - historico/cache de despesas ja carregadas;
  - categorias recentes ou mais usadas.
- Manter e melhorar a criacao rapida de categoria dentro do modal de despesa.
- Revisar/criar categorias padrao para novos usuarios ou novos perfis.
- Categorias padrao para perfil pessoal:
  - Alimentacao;
  - Moradia;
  - Transporte;
  - Saude;
  - Educacao;
  - Lazer;
  - Assinaturas;
  - Vestuario;
  - Financas;
  - Outros.
- Categorias padrao para perfil empresa/MEI:
  - Fornecedores;
  - Impostos e Taxas;
  - Operacional;
  - Tecnologia;
  - Marketing;
  - Transporte;
  - Contabilidade;
  - Pro-labore/Retiradas;
  - Bancario;
  - Outros.

### Fora do escopo

- IA externa.
- Integracao bancaria.
- Leitura automatica de extrato.
- Migrations.
- Remocao de colunas do banco.
- Regras fiscais ou contabeis avancadas.
- Deploy/producao sem confirmacao explicita.
- Alterar `.env`, secrets ou configuracoes de producao.

## Leitura de contexto

Arquivos e pontos lidos durante o planejamento:

- `AGENT.md`
- `CLAUDE.md`
- `.plans/tasks/simplificar-categorias-e-sugestoes-despesas.md`
- `src/types/config.ts`
- `src/types/finance.ts`
- `src/services/configService.ts`
- `src/services/financeService.ts`
- `src/services/queryKeys.ts`
- `src/screens/config/CategoriasTab.tsx`
- `src/screens/finance/ExpenseDialog.tsx`
- `src/ui/CategoryChipSelector.tsx`
- `backend/src/db/schema/categories.ts`
- `backend/src/db/schema/expenses.ts`
- `backend/src/routes/categories.ts`
- `backend/src/routes/expenses.ts`
- `backend/src/services/categoryAI.ts`
- `backend/src/utils/expenseNormalizer.ts`

Nao existe `frontend/AGENT.md` ou `backend/AGENT.md` neste projeto; as regras aplicaveis estao na raiz.

## Impacto por area

### Frontend

- Simplificar a UX de `CategoriaDialog` em `CategoriasTab`.
- Remover dependencias visuais e estado local de cor, favoritos, cartoes e OPEX/CAPEX no cadastro de categoria.
- Ajustar `saveCategoria`/payload usado no frontend para enviar apenas o essencial.
- Ajustar `ExpenseDialog` para tratar categoria como opcional.
- Melhorar sugestao de categoria no modal de despesa.
- Possivel criacao de helper local para sugestoes, por exemplo `src/utils/categorySuggestions.ts`.
- Ajustar `CategoryChipSelector` se necessario para dar destaque a categorias recentes/mais usadas e manter acao de criar categoria.
- Garantir que estados vazios e labels deixem claro que categoria ajuda a organizar, mas nao bloqueia o lancamento.

### Backend

- Ajustar `backend/src/routes/expenses.ts` para remover fallback que busca a primeira categoria do usuario quando `categoria_id` vem vazio.
- Manter validacao de `cartao_id` como esta.
- Revisar fluxo de categorias padrao em `backend/src/routes/categories.ts` e/ou funcoes SQL existentes para garantir categorias base por tipo de perfil.
- Se categorias padrao por perfil ja existirem em outro fluxo, reaproveitar esse padrao em vez de criar arquitetura nova.
- Nao conectar `categoryAI.ts` nesta etapa; a melhoria deve ser local/simples.

### Banco de dados

Sem migrations nesta etapa.

Observacoes:

- `despesas.categoria_id` ja e nullable no schema Drizzle.
- `categorias` possui campos como cor, icone, forma_favorita e cartao_favorito_id, mas eles podem deixar de ser usados no frontend sem migration.
- `tipo_despesa` aparece no tipo frontend, mas nao esta persistido no schema de categorias lido. Evitar depender desse campo em categorias nesta etapa.

Atencao: migrations nao devem ser executadas sem confirmacao explicita do usuario, pois o ambiente atual pode estar apontando para producao.

### Infra/Deploy

Sem impacto esperado.

Producao roda no Render. Qualquer envio para producao deve pedir confirmacao explicita.

## Arquivos provavelmente afetados

- `src/screens/config/CategoriasTab.tsx`
- `src/screens/finance/ExpenseDialog.tsx`
- `src/ui/CategoryChipSelector.tsx`
- `src/services/configService.ts`
- `src/services/financeService.ts`
- `src/types/config.ts`
- `src/types/finance.ts`
- `backend/src/routes/expenses.ts`
- `backend/src/routes/categories.ts`
- Possivel novo helper: `src/utils/categorySuggestions.ts`

## Estrategia de implementacao

1. Simplificar `CategoriaDialog`:
   - manter campo `Nome da categoria`;
   - manter campo `Categoria pai`;
   - remover secoes de classificacao, cor, preview e padroes de pagamento;
   - remover query de cartoes do modal de categoria se nao for mais usada.
2. Ajustar submit de categoria:
   - enviar apenas `nome` e `parent_id`;
   - remover chamada de favorito de categoria no fluxo principal.
3. Ajustar tipos/frontend:
   - manter tipos existentes se ainda forem usados por retorno da API;
   - evitar exigir campos avancados no payload de criacao/edicao.
4. Ajustar backend de despesas:
   - remover logica que atribui primeira categoria quando `categoria_id` nao existe;
   - gravar `categoria_id` como `null` quando nao informado.
5. Criar helper de sugestoes local:
   - normalizar descricao sem acento e caixa;
   - mapear palavras-chave para categorias provaveis;
   - casar sugestao apenas com categorias existentes ativas;
   - priorizar historico/cache de despesas quando houver correspondencia.
6. Integrar helper no `ExpenseDialog`:
   - quando descricao tiver conteudo suficiente e categoria nao estiver selecionada, exibir sugestao discreta;
   - permitir aplicar sugestao com um clique;
   - permitir ignorar sugestao.
7. Melhorar categorias recentes/mais usadas:
   - calcular a partir das despesas carregadas no cache do dashboard quando disponivel;
   - exibir atalhos antes da lista completa se houver dados suficientes.
8. Manter criacao rapida de categoria no modal de despesa:
   - criar categoria apenas com `nome`;
   - selecionar automaticamente a categoria criada.
9. Revisar categorias padrao:
   - localizar fluxo existente de categorias padrao;
   - adaptar para pessoal e empresa/MEI conforme escopo;
   - evitar migration nesta etapa.
10. Validar telas dependentes:
   - despesas;
   - relatorios;
   - painel;
   - categorias;
   - qualquer exibicao de `Sem categoria`.
11. Rodar validacao com `npm run build`.

## Regras de negocio identificadas

- Categoria e opcional no lancamento de despesa.
- `Sem categoria` e fallback de exibicao, nao uma categoria obrigatoria no banco.
- Categoria deve continuar ajudando relatorios, filtros e analises.
- Criar categoria deve ser uma acao simples.
- Subcategoria deve existir por vinculo com categoria pai, sem exigir configuracao extra.
- Sugestao de categoria deve ajudar, mas nunca bloquear ou sobrescrever decisao manual do usuario.
- Historico do usuario deve ter prioridade sobre palavra-chave generica quando houver dados confiaveis.
- Novos usuarios/perfis devem comecar com categorias base uteis.

## Regras multi-tenant e seguranca

- O projeto usa autenticacao por usuario e perfis ativos no frontend.
- Toda leitura/escrita backend de categorias e despesas deve continuar filtrando por `req.user!.id`.
- `perfil_id` vindo do frontend ja e usado em alguns fluxos; nao ampliar escopo de seguranca nesta etapa.
- Nao permitir que criacao rapida ou sugestao selecione categoria de outro usuario.
- Sugestoes baseadas em cache devem usar apenas dados ja carregados do usuario/perfil atual.
- Nao expor dados sensiveis em mensagens de sugestao.

## Validacoes necessarias

- Categoria:
  - nome obrigatorio;
  - parent_id opcional;
  - impedir categoria pai invalida continua responsabilidade do backend.
- Despesa:
  - descricao obrigatoria;
  - valor obrigatorio;
  - data obrigatoria;
  - forma de pagamento obrigatoria;
  - categoria opcional.
- Sugestao:
  - nao sugerir se o usuario ja escolheu categoria;
  - nao sugerir categoria inativa;
  - nao criar categoria vazia;
  - nao duplicar categoria se ja existe nome igual.

## Testes necessarios

### Frontend

- Criar categoria apenas com nome.
- Criar subcategoria selecionando categoria pai.
- Abrir modal de despesa e salvar sem categoria.
- Digitar descricao com palavra-chave e receber sugestao.
- Aplicar sugestao e salvar despesa.
- Criar categoria rapida dentro do modal de despesa.
- Confirmar que categorias recentes/mais usadas aparecem quando ha historico.

### Backend

- POST `/despesas` sem `categoria_id` grava `categoria_id = null`.
- POST `/despesas` com `categoria_id` valido continua funcionando.
- GET `/despesas` retorna `categoria_nome = null` quando sem categoria.
- POST/PUT `/categorias` continuam validando nome e parent.
- Criacao de categorias padrao respeita usuario autenticado.

### E2E

- Fluxo novo usuario/perfil com categorias padrao.
- Fluxo criar despesa sem categoria e visualizar em relatorio como `Sem categoria`.
- Fluxo criar despesa com sugestao de categoria.

## Comandos de validacao sugeridos

```bash
npm run build
```

Se houver scripts adicionais adicionados futuramente, considerar tambem:

```bash
npm test
npm run typecheck
```

## Riscos e pontos de atencao

- O backend hoje forca fallback para primeira categoria; se isso nao for alterado, `Sem categoria` nao sera real.
- Existem servicos de IA/categorizacao no backend, mas eles nao parecem conectados ao fluxo principal. Evitar acoplar a eles nesta etapa.
- `tipo_despesa` em categoria parece existir no frontend, mas nao no schema de categorias lido. Evitar depender desse campo para categoria.
- Remover visualmente configuracoes avancadas pode deixar codigo morto; limpar o suficiente para nao manter complexidade escondida.
- Categorias padrao podem existir em funcao SQL; inspecionar antes de duplicar lista em outro lugar.
- Nao executar migrations.
- Nao alterar `.env`.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Criterios de aceite do plano

A implementacao deve ser considerada pronta quando:

- O modal de categoria estiver simples, com nome e categoria pai opcional.
- Campos avancados de categoria nao aparecerem no fluxo principal.
- Despesas puderem ser salvas sem categoria real.
- Telas e relatorios exibirem `Sem categoria` quando `categoria_id` for nulo.
- Sugestao por descricao funcionar com palavras-chave e categorias existentes.
- Historico/cache melhorar sugestoes quando houver dados anteriores.
- Categorias recentes/mais usadas aparecerem como atalho quando houver historico.
- Criacao rapida de categoria dentro da despesa continuar funcionando.
- Novos usuarios/perfis tiverem categorias padrao uteis.
- `npm run build` passar.

## Observacoes para a skill implementar

- Usar este plano como fonte principal de contexto.
- Nao executar migrations.
- Nao alterar `.env`.
- Nao adicionar IA externa.
- Nao fazer deploy/producao sem confirmacao explicita.
- Seguir `AGENT.md` e `CLAUDE.md`.
- Priorizar UX simples e direta.
- Manter alteracoes pequenas e focadas.
