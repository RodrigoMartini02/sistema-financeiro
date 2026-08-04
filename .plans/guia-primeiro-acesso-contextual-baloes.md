# Plano de Implementacao: Guia de Primeiro Acesso com Baloes Contextuais

## Origem

- Arquivo de especificacao: historico da conversa sobre guia de primeiro acesso
- Data do planejamento: 2026-08-03
- Classificacao: frontend-only

## Resumo

Refatorar o guia de primeiro acesso do FinGerence para substituir cards grandes com titulos, chips e botoes por baloes contextuais pequenos, amigaveis e proximos das acoes reais da interface. A experiencia deve orientar novos usuarios sem parecer manual formal e sem duplicar botoes que ja existem nas telas.

## Escopo

### Dentro do escopo

- Transformar o componente atual de guia em um balao contextual reutilizavel.
- Remover visualmente titulo grande, etapas em chips e botoes internos do guia.
- Manter a opcao de ocultar o guia.
- Manter persistencia por tela/perfil no localStorage.
- Corrigir textos quebrados com caracteres como ? no lugar de acentos.
- Adicionar ou ajustar dicas contextuais nas telas principais do sistema.
- Garantir responsividade em desktop e mobile.
- Adicionar movimento sutil no balao, respeitando prefers-reduced-motion.

### Fora do escopo

- Nao alterar backend.
- Nao alterar banco de dados.
- Nao alterar .env.
- Nao executar migrations.
- Nao criar tutorial em video.
- Nao criar tour passo a passo com overlay bloqueante nesta etapa.
- Nao alterar regras de autenticacao, permissoes ou dados financeiros.

## Leitura de contexto

Arquivos de contexto lidos:

- /AGENT.md
- /CLAUDE.md
- src/components/FirstAccessGuideCard.tsx
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

## Impacto por area

### Frontend

A implementacao afeta apenas interface e experiencia do usuario. O componente atual FirstAccessGuideCard deve ser convertido para um balao discreto. As telas que exibem ou devem exibir orientacoes de primeiro acesso precisam receber textos curtos e posicionamento mais contextual.

Telas afetadas:

- Painel financeiro
- Receitas
- Despesas
- Reservas
- Relatorios
- Configuracoes geral
- Minha conta
- Perfis
- Usuarios
- Clientes
- Servicos
- Categorias
- Cartoes

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

Atencao: migrations nao devem ser executadas sem confirmacao explicita do usuario, pois o ambiente atual pode estar apontando para producao.

### Infra/Deploy

Sem impacto esperado. A alteracao deve seguir o build frontend existente.

## Arquivos provavelmente afetados

- src/components/FirstAccessGuideCard.tsx
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

## Estrategia de implementacao

1. Refatorar FirstAccessGuideCard para renderizar um balao pequeno com icone opcional, texto simples e botao de ocultar.
2. Remover do componente a renderizacao de titulo grande, etapas/chips e acoes/botoes internos.
3. Criar estilos globais para o balao com sombra leve, seta, responsividade e movimento sutil.
4. Centralizar mensagens do guia em uma estrutura reutilizavel para evitar duplicacao e problemas de texto.
5. Ajustar as telas que ja usam o guia: painel, receitas, despesas, reservas, categorias e cartoes.
6. Adicionar guias nas abas ainda sem orientacao: minha conta, perfis, usuarios, clientes, servicos e relatorios.
7. Posicionar cada balao perto da acao principal da tela, sem ocupar grandes blocos de conteudo.
8. Corrigir textos corrompidos do guia e evitar salvar acentos com encoding incorreto.
9. Rodar build e validar visualmente no projeto local.

## Regras de negocio identificadas

- O guia deve aparecer apenas como apoio inicial, sem bloquear o uso do sistema.
- O usuario deve poder ocultar a dica.
- A ocultacao deve respeitar o perfil ativo, mantendo o comportamento atual do localStorage.
- Dicas devem aparecer preferencialmente em telas vazias ou de primeiro uso.
- As orientacoes devem apontar para a acao real ja existente na tela, nao criar novo fluxo paralelo.

## Regras multi-tenant e seguranca

Sem alteracao de regras multi-tenant. O guia usa somente estado local do navegador e nao deve ler, gravar ou expor dados de outros perfis/usuarios.

## Validacoes necessarias

- Confirmar que nenhum texto do guia aparece com caracteres quebrados.
- Confirmar que nenhum balao cobre botoes essenciais em desktop ou mobile.
- Confirmar que o fechamento do guia continua funcionando.
- Confirmar que o guia nao cria botoes duplicados.
- Confirmar que as telas continuam funcionando mesmo sem dados carregados.

## Testes necessarios

### Frontend

- Build TypeScript/Vite deve passar.
- Validacao visual manual nas principais telas.
- Verificacao de localStorage para ocultacao por escopo.

### Backend

- Sem testes backend necessarios.

### E2E

- Opcional nesta etapa: navegar entre telas e confirmar aparicao/ocultacao dos baloes.

## Comandos de validacao sugeridos

- npm run build
- npm run typecheck, se existir no package.json
- npm test, se existir no package.json

## Riscos e pontos de atencao

- Balao ficar mal posicionado em telas menores.
- Excesso de dicas tornar a interface poluida.
- Texto longo quebrar o layout em mobile.
- Caracteres acentuados serem salvos incorretamente se o arquivo for editado com encoding inadequado.
- Dicas aparecerem em telas onde o usuario ja possui muitos dados, se a condicao de exibicao nao for bem definida.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Criterios de aceite do plano

A implementacao deve ser considerada pronta quando:

- Nenhum card grande de guia aparecer nas telas.
- Nenhum botao ou chip aparecer dentro do guia.
- As dicas forem textos simples, amigaveis e contextuais.
- Receitas, despesas, reservas, relatorios, minha conta, perfis, usuarios, clientes, servicos, categorias e cartoes estiverem cobertos.
- Os textos estiverem corretos, sem caracteres quebrados.
- O usuario puder ocultar cada dica.
- O build passar.
- A tela for conferida visualmente em desktop e mobile.

## Observacoes para a skill implementar

- Usar este plano como fonte principal de contexto.
- Nao alterar backend, banco, .env ou migrations.
- Seguir /AGENT.md e /CLAUDE.md.
- Manter as alteracoes pequenas e focadas na experiencia do guia.
- Evitar novo pacote/dependencia.
- Preferir mensagens curtas e naturais, sem tom de manual formal.
