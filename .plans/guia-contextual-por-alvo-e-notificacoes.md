# Plano de Implementacao: Guia Contextual por Alvo e Painel de Notificacoes

## Origem

- Arquivo de especificacao: historico da conversa sobre evolucao do guia de primeiro acesso
- Data do planejamento: 2026-08-03
- Classificacao: frontend-only

## Resumo

Evoluir o guia de primeiro acesso do FinGerence para baloes contextuais por alvo, posicionados perto de botoes, campos, filtros e areas reais de acao. A mudanca tambem inclui revisar o painel de notificacoes para abrir como uma lateral vertical clara, ocupando a altura da tela, e ajustar as cores dos baloes para terem contraste melhor sobre o fundo claro do app.

## Escopo

### Dentro do escopo

- Criar um padrao de baloes por alvo, nao apenas por tela.
- Posicionar dicas perto dos botoes/campos reais onde a acao acontece.
- Ajustar texto dos baloes para instrucoes diretas, amigaveis e curtas.
- Mostrar no maximo 1 ou 2 baloes por tela ao mesmo tempo.
- Dar cor propria aos baloes para nao se misturarem com o fundo claro.
- Ajustar seta, sombra, borda e contraste dos baloes.
- Manter opcao de ocultar cada dica.
- Manter persistencia local por escopo no localStorage.
- Transformar o painel de notificacoes em drawer lateral direito.
- Fazer o painel de notificacoes ocupar a altura total da tela.
- Usar fundo branco ou muito claro no painel de notificacoes.
- Manter responsividade desktop/mobile.
- Corrigir textos quebrados por encoding quando aparecerem nos arquivos afetados.

### Fora do escopo

- Nao alterar backend.
- Nao alterar banco de dados.
- Nao alterar .env.
- Nao executar migrations.
- Nao alterar regras de notificacao no servidor.
- Nao criar tour bloqueante com overlay em tela inteira.
- Nao criar videos/tutorial externo.
- Nao alterar autenticacao, permissoes ou dados financeiros.

## Leitura de contexto

Arquivos de contexto lidos:

- /AGENT.md
- /CLAUDE.md
- src/components/FirstAccessGuideCard.tsx
- src/components/firstAccessGuideMessages.ts
- src/hooks/useFirstAccessGuide.ts
- src/styles/globals.css
- src/screens/finance/FinanceDashboard.tsx
- src/screens/receitas/ReceitasScreen.tsx
- src/screens/despesas/DespesasScreen.tsx
- src/screens/reservas/ReservasScreen.tsx
- src/screens/relatorios/RelatoriosScreen.tsx
- src/screens/config/ConfigScreen.tsx
- src/screens/config/MinhaContaTab.tsx
- src/screens/config/PerfisTab.tsx
- src/screens/config/UsuariosTab.tsx
- src/screens/config/ClientesTab.tsx
- src/screens/config/ServicosTab.tsx
- src/screens/config/CategoriasTab.tsx
- src/screens/config/CartaoTab.tsx
- arquivos do layout relacionados ao sino/painel de notificacoes devem ser localizados durante a implementacao

## Impacto por area

### Frontend

A implementacao afeta somente interface e experiencia do usuario. O componente de guia deve deixar de funcionar como aviso generico e passar a ser usado como balao contextual por alvo. O painel de notificacoes deve sair do popup compacto escuro e virar uma lateral clara de altura total.

Telas e areas afetadas:

- Painel financeiro
- Receitas
- Despesas
- Reservas
- Relatorios
- Minha conta
- Perfis
- Usuarios
- Clientes
- Servicos
- Categorias
- Cartoes
- Layout/AppShell ou componente equivalente de notificacoes

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

Atencao: migrations nao devem ser executadas sem confirmacao explicita do usuario, pois o ambiente atual pode estar apontando para producao.

### Infra/Deploy

Sem impacto esperado. A alteracao deve seguir o build frontend existente.

## Arquivos provavelmente afetados

- src/components/FirstAccessGuideCard.tsx
- src/components/firstAccessGuideMessages.ts
- src/hooks/useFirstAccessGuide.ts
- src/styles/globals.css
- src/layout/AppShell.tsx
- src/screens/finance/FinanceDashboard.tsx
- src/screens/receitas/ReceitasScreen.tsx
- src/screens/despesas/DespesasScreen.tsx
- src/screens/reservas/ReservasScreen.tsx
- src/screens/relatorios/RelatoriosScreen.tsx
- src/screens/config/ConfigScreen.tsx
- src/screens/config/MinhaContaTab.tsx
- src/screens/config/PerfisTab.tsx
- src/screens/config/UsuariosTab.tsx
- src/screens/config/ClientesTab.tsx
- src/screens/config/ServicosTab.tsx
- src/screens/config/CategoriasTab.tsx
- src/screens/config/CartaoTab.tsx

## Estrategia de implementacao

1. Revisar o componente FirstAccessGuideCard para suportar posicoes por alvo: acima, abaixo, esquerda e direita.
2. Ajustar a seta do balao para acompanhar a posicao configurada.
3. Alterar o visual dos baloes para fundo ciano/azul claro, borda destacada, sombra suave e melhor contraste.
4. Criar ou organizar mensagens por alvo, com ids claros e textos objetivos.
5. Aplicar baloes nos alvos principais de cada tela, evitando mais de 1 ou 2 baloes simultaneos.
6. Em Minha conta, posicionar dicas perto de Salvar dados e Alterar senha.
7. Em Receitas, posicionar dica em Nova receita e, quando houver dados, dica na busca.
8. Em Despesas, posicionar dica em Nova despesa e, quando houver dados, dica nos filtros/selecao em lote.
9. Em Reservas, posicionar dica em Nova reserva e, quando houver reservas, dica em Movimentar.
10. Em Categorias, posicionar dica em Nova categoria e depois em subcategorias quando houver categorias.
11. Em Cartoes, posicionar dica em Novo cartao e dentro/ao lado do formulario para vencimento e limite quando fizer sentido.
12. Em Perfis, Usuarios, Clientes e Servicos, posicionar dicas nos botoes Novo perfil, Novo usuario, Novo cliente e Novo servico.
13. Em Relatorios, posicionar dicas nos campos De/Ate, no botao Consultar e em Exportar PDF.
14. Em Painel financeiro, posicionar dicas no seletor de mes, indicadores e areas vazias/graficos.
15. Localizar o componente do painel de notificacoes no layout.
16. Transformar o painel de notificacoes em drawer lateral direito com altura total.
17. Mudar o painel de notificacoes para fundo branco/claro, divisorias suaves e boa leitura.
18. Rodar build e validar visualmente desktop/mobile.

## Regras de negocio identificadas

- O guia deve orientar sem bloquear o uso do sistema.
- O balao deve apontar para uma acao real, nao para uma area vazia.
- A dica deve ser curta e indicar onde clicar ou o que preencher.
- Cada dica pode ser fechada pelo usuario.
- Dicas fechadas devem continuar respeitando localStorage por escopo.
- Dicas extras devem aparecer somente quando houver contexto, por exemplo busca apos existirem lancamentos ou movimentar apos existir reserva.
- Notificacoes continuam usando os mesmos dados atuais; a mudanca e apenas visual/posicionamento.

## Regras multi-tenant e seguranca

Sem alteracao de regras multi-tenant. O guia e o painel visual de notificacoes nao devem alterar contratos de backend, filtros de tenant, permissoes ou regras de acesso.

## Validacoes necessarias

- Confirmar que os baloes apontam para botoes/campos reais.
- Confirmar que nenhum balao cobre a acao principal.
- Confirmar que os baloes possuem contraste melhor que o estado atual.
- Confirmar que nao ha mais balao solto em area vazia sem contexto.
- Confirmar que Configuracoes nao quebra ao trocar abas.
- Confirmar que o painel de notificacoes abre em altura total.
- Confirmar que o painel de notificacoes tem fundo claro e leitura confortavel.
- Confirmar que mobile nao corta conteudo nem esconde botoes.

## Testes necessarios

### Frontend

- Build Vite deve passar.
- Validacao visual manual das telas afetadas.
- Verificacao manual de fechamento de dicas via localStorage.
- Teste manual do painel de notificacoes aberto/fechado.

### Backend

- Sem testes backend necessarios.

### E2E

- Opcional: navegar por telas principais, abrir notificacoes e fechar baloes.

## Comandos de validacao sugeridos

- npm run build
- npx tsc --noEmit somente se o tsconfig estiver compatibilizado; atualmente ha risco de falha por configuracao preexistente de ignoreDeprecations

## Riscos e pontos de atencao

- Balao ficar desalinhado quando o layout quebra em mobile.
- Excesso de dicas deixar a interface poluida.
- Drawer de notificacoes cobrir conteudo importante em telas pequenas.
- Notificacoes muito longas exigirem scroll interno no drawer.
- Chaves antigas do localStorage esconderem dicas novas; versionar escopos quando necessario.
- Caracteres acentuados serem salvos incorretamente se a edicao nao preservar UTF-8.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Criterios de aceite do plano

A implementacao deve ser considerada pronta quando:

- Baloes apontarem para botoes/campos reais.
- Nenhum balao ficar solto em area vazia sem contexto.
- Textos forem curtos, diretos e amigaveis.
- Os baloes tiverem cor propria e contraste com o fundo claro.
- Nenhum card grande, chip ou botao duplicado de guia aparecer.
- O painel de notificacoes abrir como lateral direita de altura total.
- O painel de notificacoes usar fundo claro e visual menos pesado.
- Desktop e mobile forem revisados.
- npm run build passar.

## Observacoes para a skill implementar

- Usar este plano como fonte principal de contexto.
- Nao alterar backend, banco, .env ou migrations.
- Seguir /AGENT.md e /CLAUDE.md.
- Manter mudancas focadas em UX do guia e painel de notificacoes.
- Evitar adicionar dependencias.
- Preferir CSS/Tailwind existente.
- Cuidar com UTF-8 nos textos em portugues.
