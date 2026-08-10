# Plano de Implementacao: Refinar Filtros e Acoes de Movimentacoes

## Origem

- Arquivo de especificacao: conversa do usuario e `.portal/tasks/reorganize-monthly-movements-and-reserves.md`
- Data do planejamento: 2026-08-08
- Classificacao: frontend-only

## Resumo

Refinar a tela de Movimentacoes para que o seletor entre Receitas e Despesas fique integrado a barra da tabela, no canto esquerdo e na mesma linha dos controles existentes. Tambem diferenciar visualmente os comandos de criacao: nova receita em verde e nova despesa em vermelho.

O ajuste preserva as tabelas, filtros, acoes, consultas e regras existentes. Nenhum contrato de backend, dado financeiro ou regra de fechamento sera alterado.

## Escopo

### Dentro do escopo

- Mover o seletor `Receitas | Despesas` da faixa propria de Movimentacoes para a barra de ferramentas da tabela ativa.
- Reutilizar o padrao visual dos controles de filtro existentes para o seletor de tabela.
- Manter o seletor no canto esquerdo da barra e preservar busca, filtros, selecao em lote e acoes atuais.
- Garantir quebra de linha organizada em telas pequenas.
- Aplicar tom verde ao botao `Nova receita` e tom vermelho ao botao `Nova despesa`.

### Fora do escopo

- Alterar filtros, colunas, dados ou acoes das tabelas de receitas e despesas.
- Criar novos endpoints, query keys, servicos ou mutations.
- Alterar backend, banco de dados, migrations, perfis, bloqueio mensal ou calculo financeiro.
- Mudar os botoes de atualizar, fechar/reabrir mes ou movimentar reserva.

## Leitura de Contexto

- `AGENT.md`
- `CLAUDE.md`
- `.portal/tasks/reorganize-monthly-movements-and-reserves.md`
- `src/screens/finance/MovimentacoesScreen.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`
- `src/screens/despesas/DespesasScreen.tsx`
- Nao existem `frontend/AGENT.md` ou `backend/AGENT.md` neste repositorio.

## Impacto por Area

### Frontend

- `MovimentacoesScreen` deixara de renderizar o seletor como faixa separada e passara o controle para a tabela ativa.
- Receitas e Despesas receberao uma extensao opcional e reutilizavel para montar o seletor na barra de ferramentas sem afetar uso standalone.
- A barra de Despesas deve acomodar o seletor junto da selecao em lote e dos filtros existentes, sem sobreposicao em desktop ou mobile.
- Os botoes de criacao receberao classes de cor sem mudar seus handlers, icones ou estados desabilitados.
- Nao ha novo server state, formulario, query key ou validacao de dados.

### Backend

Sem impacto esperado.

### Banco de Dados

Sem impacto esperado. Nenhuma migration deve ser criada ou executada.

### Infra/Deploy

Sem impacto esperado.

## Arquivos Provavelmente Afetados

- `src/screens/finance/MovimentacoesScreen.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`
- `src/screens/despesas/DespesasScreen.tsx`

## Estrategia de Implementacao

1. Identificar os pontos de montagem das barras de ferramentas de Receitas e Despesas no modo `embedded` atual.
2. Extrair o seletor Receitas/Despesas para um controle reutilizavel mantido por `MovimentacoesScreen`.
3. Expor uma propcional area de controles na barra de cada tabela e renderizar o seletor somente no modo integrado.
4. Em Receitas, posicionar o seletor no inicio da toolbar, preservando a busca e removendo o titulo redundante `Lancamentos` e sua contagem.
5. Em Despesas, posicionar o seletor antes da selecao em lote e manter os filtros existentes na mesma toolbar com `flex-wrap` responsivo.
6. Aplicar classes verdes/vermelhas apenas aos botoes de nova receita e nova despesa no cabecalho de Movimentacoes.
7. Validar renderizacao, alternancia de tabela, filtros atuais, selecao em lote e responsividade.

## Regras de Negocio Identificadas

- Receitas e Despesas continuam sendo tabelas distintas, com colunas e acoes proprias.
- O seletor muda somente qual tabela esta visivel; nao limpa busca, filtros ou selecoes da tela que ficou inativa.
- Os botoes de criacao mantem seus mesmos dialogos e mutations; a cor nao altera a semantica da operacao.
- O restante dos comandos do cabecalho permanece neutro.

## Regras Multi-tenant e Seguranca

Sem nova chamada, payload, permissao ou consulta. O isolamento atual por usuario e perfil permanece inalterado.

## Validacoes Necessarias

- O seletor aparece uma unica vez no canto esquerdo da barra da tabela ativa.
- Em Receitas, a busca continua funcional, nao e encoberta pelo seletor e o titulo `Lancamentos` nao e exibido.
- Em Despesas, selecao em lote, filtros e botao de limpar continuam funcionais.
- Em mobile, os controles quebram em linhas sem sobreposicao ou corte de texto.
- `Nova receita` usa estilo verde e `Nova despesa` usa estilo vermelho, mantendo acessibilidade e estados disabled.

## Testes Necessarios

### Frontend

- Verificar alternancia entre tabelas pelo controle inserido na toolbar.
- Verificar preservacao de busca de receitas e filtros/selecao em lote de despesas.
- Verificar estilos e abertura dos dois dialogos de criacao.

### Backend

Sem testes novos esperados.

### E2E

- Alternar entre Receitas e Despesas em desktop e mobile e confirmar que as acoes existentes continuam acessiveis.

## Comandos de Validacao Sugeridos

```bash
npx vite build
git diff --check
```

## Riscos e Pontos de Atencao

- A toolbar de Despesas ja possui muitos controles; manter `flex-wrap`, ordem visual e areas clicaveis claras.
- Props opcionais devem preservar possivel uso standalone de Receitas e Despesas.
- Nao alterar os componentes de filtro existentes apenas para acomodar o seletor.

## Perguntas em Aberto

Nenhuma pergunta em aberto identificada.

## Criterios de Aceite do Plano

- O seletor Receitas/Despesas nao aparece mais em faixa separada acima da tabela.
- O seletor aparece na barra da tabela, no lado esquerdo e com linguagem visual compativel com os filtros existentes.
- Busca de receitas, filtros de despesas e selecao em lote permanecem funcionais.
- Nova receita fica verde e nova despesa fica vermelha.
- Nenhuma alteracao de backend, banco ou migration e introduzida.

## Observacoes para a Skill Implementar

- Usar este plano como fonte principal de contexto.
- Seguir `AGENT.md` e `CLAUDE.md`.
- Manter o ajuste restrito aos tres arquivos de frontend previstos, salvo necessidade tecnica comprovada.
- Nao executar migrations, alterar `.env`, fazer commit, push ou merge sem a acao/aprovacao correspondente do usuario.
