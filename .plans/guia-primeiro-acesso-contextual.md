# Plano de Implementacao: Guia de Primeiro Acesso Contextual

## Origem

- Arquivo de especificacao: `.plans/tasks/guia-primeiro-acesso-contextual.md`
- Data do planejamento: `2026-08-04`
- Classificacao: `frontend-only`

## Resumo

Implementar uma experiencia de primeiro acesso contextual no app do FinGerence para orientar novos usuarios sobre os primeiros cadastros e lancamentos. A solucao deve usar cards ou blocos discretos nas telas principais e em estados vazios, com chamadas de acao que levem o usuario diretamente para a secao ou aba correta.

A implementacao deve ser somente frontend, sem backend, banco de dados, migrations, alteracao de `.env` ou infraestrutura.

## Escopo

### Dentro do escopo

- Criar um componente reutilizavel de orientacao para primeiro acesso.
- Criar controle simples de exibicao/dispensa do guia usando `localStorage`.
- Considerar usuario/perfil ativo na chave local quando viavel, para evitar comportamento confuso entre perfis.
- Adicionar orientacoes contextuais nas telas principais quando ainda nao houver dados.
- Melhorar estados vazios com explicacoes objetivas e CTAs.
- Adicionar em Configuracoes um bloco explicando onde cadastrar categorias, cartoes, perfis e outros cadastros auxiliares.
- Adicionar botoes para navegar para abas internas de Configuracoes, como `cartoes` e `categorias`.
- Adicionar CTA para criar reserva/meta quando a tela de Reservas estiver vazia.
- Manter a interface limpa, responsiva e coerente com o visual atual.

### Fora do escopo

- Criar central completa de ajuda.
- Criar aba de videos.
- Criar ou incorporar videos explicativos.
- Criar tour modal bloqueante passo a passo.
- Criar chat de suporte ou assistente virtual.
- Alterar regras financeiras, calculos, relatorios ou modelos de dados.
- Criar endpoint para persistencia do onboarding.
- Alterar banco de dados ou executar migrations.
- Alterar `.env`, secrets, Render ou configuracoes de producao.

## Leitura de contexto

- `/AGENT.md`
- `/CLAUDE.md`
- `.plans/tasks/guia-primeiro-acesso-contextual.md`
- `src/App.tsx`
- `src/context/AppContext.tsx`
- `src/layout/AppShell.tsx`
- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/reservas/ReservasScreen.tsx`
- `src/screens/config/ConfigScreen.tsx`
- `src/screens/config/CategoriasTab.tsx`
- `src/screens/config/CartaoTab.tsx`
- `src/ui/states.tsx`
- `src/ui/button.tsx`
- `src/services/queryKeys.ts`
- `package.json`

Nao existe `AGENT.md` especifico em `src/` nem em `backend/`; portanto valem as regras da raiz.

## Impacto por area

### Frontend

- Criar componente reutilizavel para cards de orientacao contextual.
- Criar hook/helper para controle de primeira visualizacao e dispensa.
- Ajustar navegacao interna para que CTAs consigam abrir secoes e abas especificas.
- Atualizar estados vazios em Reservas, Cartoes, Categorias, Receitas e Despesas.
- Adicionar bloco de orientacao em Configuracoes.
- Garantir responsividade em mobile e desktop.
- Rodar build ao final.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

Atencao: migrations nao devem ser executadas sem confirmacao explicita do usuario, pois o ambiente atual pode estar apontando para producao.

### Infra/Deploy

Sem impacto esperado.

Producao roda no Render, mas este plano nao inclui deploy. Qualquer envio para producao deve pedir confirmacao explicita em etapa posterior.

## Arquivos provavelmente afetados

- `src/App.tsx`
- `src/context/AppContext.tsx`
- `src/layout/AppShell.tsx`
- `src/screens/finance/FinanceDashboard.tsx`
- `src/screens/receitas/ReceitasScreen.tsx`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/reservas/ReservasScreen.tsx`
- `src/screens/config/ConfigScreen.tsx`
- `src/screens/config/CategoriasTab.tsx`
- `src/screens/config/CartaoTab.tsx`
- Possivel novo arquivo: `src/components/FirstAccessGuideCard.tsx`
- Possivel novo arquivo: `src/hooks/useFirstAccessGuide.ts`

## Estrategia de implementacao

1. Criar `useFirstAccessGuide` para ler/gravar estado de guia visto/dispensado no `localStorage`.
2. Usar chave local estavel, idealmente considerando usuario/perfil ativo quando houver informacao disponivel.
3. Criar `FirstAccessGuideCard` com titulo, descricao, lista curta opcional, CTA principal, CTA secundario opcional e acao de dispensar.
4. Permitir que o componente receba icone via `lucide-react`, mantendo o padrao visual do app.
5. Ajustar `ConfigScreen` para usar o `onTabChange` recebido por props e permitir CTAs para `categorias`, `cartoes`, `perfis` e outras abas existentes.
6. Adicionar em Configuracoes um bloco introdutor discreto explicando a ordem sugerida: perfil/conta, categorias, cartoes, lancamentos e reservas.
7. Melhorar `CategoriasTab` quando nao houver categorias, com explicacao sobre classificacao e relatórios.
8. Melhorar `CartaoTab` quando nao houver cartoes, com explicacao sobre limite, vencimento e uso em despesas.
9. Melhorar `ReservasScreen` quando nao houver reservas, com CTA para abrir `ReservaDialog`.
10. Melhorar estados vazios em `ReceitasScreen` e `DespesasScreen` com texto de primeiro uso e CTA de novo lancamento.
11. Avaliar um bloco discreto no `FinanceDashboard` quando receitas e despesas estiverem zeradas, apontando para os primeiros passos.
12. Revisar mobile para evitar textos longos estourando cards ou botoes.
13. Rodar `npm run build`.

## Regras de negocio identificadas

- O guia deve ajudar o usuario a entender que alguns dados precisam ser cadastrados antes de aparecerem nas telas.
- Categorias organizam receitas/despesas e melhoram relatorios.
- Cartoes ajudam a controlar limite, vencimento e lancamentos vinculados.
- Reservas/metas precisam ser criadas antes de aparecerem na tela de Reservas.
- O guia deve ser dispensavel e nao deve bloquear o uso normal do sistema.
- O guia nao deve alterar dados financeiros automaticamente.

## Regras multi-tenant e seguranca

- A implementacao sera frontend-only e nao deve criar rotas ou queries novas.
- Nao alterar regras de autenticacao, permissao ou perfil ativo.
- Se usar `localStorage`, nao salvar dados sensiveis; salvar apenas flags de interface, como guia visto/dispensado.
- Se a chave do guia considerar perfil, usar identificadores ja disponiveis localmente, sem buscar dados extras sensiveis.
- Nao executar migrations.
- Nao alterar `.env`.

## Validacoes necessarias

- Verificar se os CTAs navegam corretamente para:
  - Configuracoes > Categorias;
  - Configuracoes > Cartoes;
  - Reservas;
  - Receitas;
  - Despesas.
- Verificar se a opcao de dispensar remove o guia em acessos seguintes.
- Verificar se os estados vazios continuam aparecendo corretamente quando nao ha dados.
- Verificar se telas com dados cadastrados nao ficam poluidas com orientacao desnecessaria.
- Verificar responsividade em mobile e desktop.

## Testes necessarios

### Frontend

- Validar manualmente o primeiro acesso com dados vazios.
- Validar manualmente o comportamento apos dispensar o guia.
- Validar navegacao dos CTAs para secoes e abas internas.
- Validar abertura dos dialogs de nova receita, nova despesa e nova reserva quando aplicavel.
- Validar que telas com dados continuam funcionando sem regressao visual.

### Backend

- Sem testes backend necessarios.

### E2E

- Opcional: testar fluxo completo de onboarding em navegador se houver infraestrutura local disponivel.

## Comandos de validacao sugeridos

```bash
npm run build
```

Se houver servidor local ativo para revisao visual:

```bash
npm run dev
```

## Riscos e pontos de atencao

- Excesso de texto pode deixar as telas com cara de manual; manter orientacoes curtas.
- Guia repetindo demais pode incomodar; persistencia de dispensa deve ser previsivel.
- Navegacao para abas internas depende de `section` e `configTab`; implementar de forma centralizada para evitar duplicacao.
- `ConfigScreen` recebe `onTabChange`, mas atualmente precisa ser revisado para garantir uso correto dessa prop.
- Estados vazios ja existem; a implementacao deve reaproveitar padroes em vez de duplicar UI demais.
- Nao misturar este escopo com videos, central de ajuda ou backend.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. Decisoes aplicadas neste plano:

- Persistencia inicial via `localStorage`.
- Guia em primeiro acesso e em estados vazios.
- UI por cards/blocos contextuais, sem tour modal bloqueante.
- Videos e manual completo fora do escopo inicial.

## Criterios de aceite do plano

A implementacao deve ser considerada pronta quando:

- O usuario novo recebe orientacoes claras nas telas principais sem bloquear o uso do sistema.
- Configuracoes apresenta orientacao objetiva sobre categorias, cartoes, perfis e cadastros auxiliares.
- Reservas, Cartoes e Categorias possuem estados vazios mais explicativos e com CTAs relevantes.
- Receitas e Despesas orientam o primeiro lancamento quando nao houver registros.
- Os CTAs direcionam corretamente para a tela ou aba adequada.
- O guia pode ser dispensado e essa decisao e respeitada em acessos seguintes.
- A interface permanece responsiva e visualmente alinhada ao app atual.
- `npm run build` passa.
- Nao ha alteracao de backend, banco, migrations, `.env`, secrets ou infra.

## Observacoes para a skill implementar

- Usar este plano como fonte principal de contexto.
- Ler `AGENT.md` e `CLAUDE.md` antes de alterar arquivos.
- Nao executar migrations.
- Nao alterar `.env`.
- Manter alteracoes pequenas e focadas em frontend.
- Reaproveitar componentes existentes (`Button`, `Card`, `EmptyState`) quando fizer sentido.
- Usar icones de `lucide-react` conforme padrao do projeto.
- Rodar `npm run build` ao final.
- Nao fazer commit, push ou deploy ate a etapa `/finalizar`.
