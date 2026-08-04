# Task: Guia de primeiro acesso contextual

## Contexto

O FinGerence possui telas de gestao financeira com recursos como painel, receitas, despesas, reservas, relatorios, configuracoes, categorias e cartoes. Para novos usuarios, parte da dificuldade esta em entender que algumas telas dependem de configuracoes iniciais para exibirem dados ou funcionarem melhor.

A demanda e criar um guia de primeiro acesso dentro do sistema, com orientacoes curtas e contextuais. A experiencia deve explicar o que o usuario precisa configurar, onde cada coisa e criada e permitir que ele navegue diretamente para a tela correta por meio de botoes de acao.

## Problema

Novos usuarios podem entrar no sistema e encontrar telas vazias ou configuracoes sem entender a ordem natural de uso. Isso pode gerar duvidas como:

- onde cadastrar cartoes;
- onde criar categorias;
- por que uma reserva/meta ainda nao aparece;
- o que deve ser configurado primeiro;
- qual tela usar para cada acao financeira.

Sem orientacao dentro do proprio fluxo, o usuario pode depender de suporte externo ou abandonar a configuracao inicial.

## Objetivo

Criar uma experiencia de primeiro acesso guiada, discreta e profissional, que ajude o usuario a configurar os dados essenciais do FinGerence e entender o uso basico das principais telas, sem transformar o sistema em um manual longo.

## Escopo

### Dentro do escopo

- Criar orientacoes contextuais para usuarios novos ou telas sem dados.
- Explicar em Configuracoes que o usuario pode criar cartoes, categorias, perfis e outros cadastros auxiliares.
- Informar nas telas dependentes que o usuario precisa cadastrar itens para que eles aparecam ali.
- Adicionar chamadas de acao como `Criar agora`, `Ir para categorias`, `Ir para cartoes`, `Criar reserva` ou equivalentes.
- Direcionar o usuario para a secao ou aba correta do sistema quando clicar na acao.
- Permitir dispensar ou concluir o guia para que ele nao incomode em acessos seguintes.
- Avaliar persistencia simples do estado do guia, preferencialmente por usuario/perfil quando viavel, ou localmente quando o planejamento indicar que e suficiente.
- Manter o visual alinhado ao sistema atual, sem modal excessivo e sem bloquear o uso normal.

### Fora do escopo inicial

- Criar central completa de ajuda.
- Criar pagina ou aba de videos.
- Criar videos explicativos.
- Criar chat de suporte ou assistente virtual.
- Alterar regras financeiras, calculos, relatorios ou modelos de dados sem necessidade clara.
- Executar migrations sem aprovacao explicita.
- Alterar `.env`, secrets ou configuracoes de producao.

## Impacto Previsto

### Frontend

- Adicao de componentes de orientacao contextual, cards informativos ou banners discretos.
- Possivel ajuste em navegacao interna para permitir direcionamento para secoes e abas especificas.
- Possivel uso de estado local para controlar se o guia ja foi dispensado/concluido.
- Ajustes em telas com estados vazios para ensinar a proxima acao esperada.

### Backend

- Sem impacto backend identificado inicialmente.
- Durante o planejamento, avaliar se o estado de conclusao do guia deve ser salvo no perfil do usuario. Se exigir backend, tratar como decisao separada antes de implementar.

### Banco de Dados

- Sem alteracao de banco identificada inicialmente.
- Nao executar migrations sem confirmacao explicita.

### Infra/Deploy

- Sem impacto de infra/deploy identificado inicialmente.
- Producao roda no Render; qualquer envio para producao deve pedir confirmacao explicita.

## Seguranca e Dados

- Nao expor dados sensiveis em textos de onboarding.
- Respeitar o perfil ativo do usuario quando a orientacao depender de contexto pessoal ou empresarial.
- Nao alterar `.env`.
- Nao executar migrations sem confirmacao explicita.
- Caso a persistencia do guia seja feita no backend, garantir associacao ao usuario autenticado e evitar que um usuario altere estado de outro.

## Arquivos Provavelmente Afetados

- `src/App.tsx`
- `src/layout/AppShell.tsx`
- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/reservas/ReservasScreen.tsx`
- `src/screens/config/ConfigScreen.tsx`
- `src/screens/config/CategoriasTab.tsx`
- `src/screens/config/CartaoTab.tsx`
- `src/context/AppContext.tsx`

## Criterios de Aceite

- Um usuario novo encontra orientacoes claras nas telas principais quando ainda nao possui dados cadastrados.
- A tela de Configuracoes explica de forma objetiva onde criar cartoes, categorias e demais cadastros auxiliares.
- A tela de Reservas informa que e necessario criar uma reserva/meta para que ela apareca ali.
- As chamadas de acao levam o usuario para a tela ou aba correta do sistema.
- O usuario consegue dispensar ou concluir o guia, e essa escolha e respeitada em acessos seguintes conforme a estrategia definida no planejamento.
- A interface continua limpa, sem bloquear o uso normal do sistema.
- A implementacao nao altera banco, migrations, `.env`, secrets ou regras financeiras sem nova aprovacao.
- `npm run build` deve passar ao final da implementacao.

## Perguntas Para o Planejamento

- O guia deve aparecer automaticamente apenas no primeiro acesso ou tambem quando uma tela estiver vazia?
- O estado de guia visto deve ser salvo em `localStorage` ou no backend por usuario?
- Quais telas devem receber orientacao na primeira versao: painel, receitas, despesas, reservas e configuracoes, ou apenas configuracoes e reservas?
- O guia deve ser um checklist inicial, cards contextuais por tela, tooltips, ou uma combinacao simples desses formatos?
- Quais CTAs devem navegar para abas internas de Configuracoes, como `cartoes` e `categorias`?

## Instrucoes Para /planejar

- Usar esta task como especificacao de entrada.
- Ler `AGENT.md` e `CLAUDE.md`.
- Inspecionar os arquivos citados antes de propor alteracoes.
- Gerar plano em `.plans/`.
- Nao implementar codigo durante o planejamento.
- Nao assumir staging ou PR.
- Considerar que o projeto e de um unico desenvolvedor e que producao roda no Render.
- Qualquer acao de producao deve pedir confirmacao explicita.
