# Task: Padronizar visual e largura da home publica

## Contexto

O sistema FINGERENCE possui paginas publicas em React, TypeScript, Vite e Tailwind. A home publica usa os mesmos componentes compartilhados de cabecalho, hero, rodape, modal de login, modal de termos e banner de cookies das demais paginas publicas.

Durante a analise inicial, foram verificados os seguintes arquivos:

- `sistema financas/src/screens/public/HomePage.tsx`
- `sistema financas/src/screens/public/FuncionalidadesPage.tsx`
- `sistema financas/src/screens/public/SobrePage.tsx`
- `sistema financas/src/screens/public/PlanosPage.tsx`
- `sistema financas/src/screens/public/ContatoPage.tsx`
- `sistema financas/src/screens/public/components/SitePageHero.tsx`
- `sistema financas/src/screens/public/components/HeroDashboardPreview.tsx`
- `sistema financas/src/screens/public/components/HomeBenefitsSection.tsx`
- `sistema financas/src/screens/public/components/HomeHowItWorksSection.tsx`
- `sistema financas/src/styles/globals.css`
- `sistema financas/tailwind.config.cjs`

O arquivo `tailwind.config.cjs` ja define tokens de tema para a area publica, incluindo `site.bg`, `site.bgAlt`, `site.text`, `site.textSub`, `site.textMuted` e `site.accent`. Apesar disso, a home ainda usa varios valores hexadecimais diretos para fundos e superficies.

## Problema

A home publica apresenta tres problemas visuais percebidos pelo usuario:

- O fundo da home nao esta consistente com as outras abas publicas.
- A interface esta sendo percebida como escura, morta e pouco viva, apesar de manter uma identidade visual premium em tons escuros.
- Os cards visuais/demonstrativos da home ficam centralizados e menores que a area horizontal disponivel da tela.

Tecnicamente, a inconsistencia aparece porque a home e seus componentes especificos usam fundos diretos como `#040E12`, `#061419`, `#041A22` e `#03161D`, em vez de padronizar o uso dos tokens `site.bg` e `site.bgAlt`.

A sensacao de cards menores aparece especialmente em:

- `HeroDashboardPreview.tsx`, que limita a previa principal a `max-w-[1320px]`, mesmo quando o container externo permite ate `max-w-[1800px]`.
- `HomeBenefitsSection.tsx` e `HomeHowItWorksSection.tsx`, que usam containers com `max-w-[1520px]`.
- `HomeHowItWorksSection.tsx`, onde os cards da timeline possuem larguras fixas em torno de `390px` a `430px` em telas grandes.

## Objetivo

Padronizar a home publica para que ela use a mesma base visual das demais paginas publicas, mantendo a identidade de cor atual do FINGERENCE, mas com uma apresentacao mais viva, luminosa e melhor aproveitamento horizontal em telas largas.

O objetivo nao e redesenhar completamente a landing page, mas corrigir consistencia de fundo, melhorar contraste/energia visual dentro da mesma tonalidade e fazer os blocos demonstrativos ocuparem melhor a area util da tela.

## Decisao Tecnica Desejada

Preferir os tokens de tema ja existentes (`bg-site-bg`, `bg-site-bgAlt`, `text-site-*`, `border-site-*`) em vez de novos valores hexadecimais espalhados.

Quando for necessario manter nuances visuais especificas da home, avaliar durante o planejamento se os valores devem:

- ser substituidos diretamente por tokens existentes;
- ser convertidos para novos tokens semanticamente claros;
- ou permanecer locais apenas quando houver justificativa visual forte.

A direcao visual desejada e clarear e revitalizar a interface dentro da paleta atual, sem mudar a identidade para outra cor principal.

## Escopo Funcional

### Dentro do escopo

- Padronizar fundos da home publica para ficarem consistentes com as demais abas publicas.
- Revisar o uso de `#040E12`, `#061419`, `#041A22` e `#03161D` nos componentes da home.
- Melhorar a percepcao visual de vitalidade mantendo a mesma tonalidade principal.
- Ajustar contraste, transparencia, bordas e sombras dos cards da home quando necessario.
- Fazer os cards e previews visuais da home aproveitarem melhor a largura disponivel em desktop.
- Preservar responsividade mobile e tablet.
- Preservar textos, fluxo de login, links, modais e comportamento funcional existente.

### Fora do escopo inicial

- Redesenhar todas as paginas publicas.
- Alterar navegacao, copy, precos, planos ou regras comerciais.
- Alterar funcionalidades internas do sistema financeiro.
- Alterar backend, banco de dados, autenticacao ou APIs.
- Adicionar novas dependencias visuais.
- Criar uma nova identidade visual ou trocar a paleta principal.
- Alterar logo, assets ou branding sem pedido especifico.

## Requisitos de Frontend

- A home deve usar a mesma base de fundo das outras abas publicas.
- A alternancia entre secoes deve parecer intencional e padronizada.
- O visual deve continuar em tons escuros/ciano, mas com superficies menos apagadas.
- Os cards demonstrativos devem ocupar melhor a largura horizontal em telas grandes.
- O `HeroDashboardPreview` deve deixar de parecer estreito no centro quando ha espaco horizontal disponivel.
- As secoes `HomeBenefitsSection` e `HomeHowItWorksSection` devem manter boa leitura em desktop, tablet e mobile.
- Cards com conteudo demonstrativo nao devem deformar, sobrepor textos ou quebrar a timeline em telas largas.
- Nao deve haver texto cortado, sobreposto ou fora dos containers.
- Preferir classes Tailwind ja usadas no projeto e evitar abstracoes desnecessarias.

## Requisitos de Backend

Sem impacto backend identificado inicialmente.

## Requisitos de Banco de Dados

Sem alteracao de banco identificada inicialmente.

Nao executar migrations, seeds, alteracoes de schema ou comandos destrutivos de banco para esta task.

## Requisitos de Seguranca e Multi-Tenant

A mudanca identificada e visual/publica e nao deve alterar regras de autenticacao, autorizacao, sessao, tenant isolation ou leitura/escrita de dados.

Mesmo sendo uma alteracao frontend, o planejamento deve confirmar que:

- nenhum payload de API sera alterado;
- nenhum dado sensivel sera exposto na home;
- os dados demonstrativos da home continuarao ficticios;
- componentes autenticados ou informacoes reais de usuarios nao serao introduzidos na area publica.

## Requisitos de Migracao ou Compatibilidade

Nao ha migracao de dados identificada.

A implementacao deve preservar compatibilidade com:

- rotas publicas existentes;
- layout mobile existente;
- componentes compartilhados de header/footer/modais;
- tokens de tema ja definidos no Tailwind;
- build atual do Vite/Tailwind.

Se novos tokens de tema forem propostos, eles devem ser pequenos, sem quebrar o uso atual das demais telas.

## Requisitos de Testes

### Frontend

- Validar build frontend apos as alteracoes.
- Verificar visualmente a home em desktop largo, desktop comum e mobile.
- Conferir que fundos da home estao consistentes com as outras abas publicas.
- Conferir que cards/previews da home ocupam melhor a largura disponivel sem quebrar conteudo.

### Backend

- Nao aplicavel inicialmente.

### E2E

- Avaliar durante o planejamento se basta validacao visual/manual ou se ha testes automatizados existentes para rotas publicas.

## Arquivos Provavelmente Afetados

### Frontend

- `sistema financas/src/screens/public/HomePage.tsx`
- `sistema financas/src/screens/public/components/HeroDashboardPreview.tsx`
- `sistema financas/src/screens/public/components/HomeBenefitsSection.tsx`
- `sistema financas/src/screens/public/components/HomeHowItWorksSection.tsx`
- `sistema financas/src/screens/public/components/SitePageHero.tsx`
- `sistema financas/tailwind.config.cjs`, se o planejamento decidir que novos tokens sao realmente necessarios
- `sistema financas/src/styles/globals.css`, se ajustes globais de estados/animacoes forem necessarios

### Backend

- Nenhum arquivo backend previsto inicialmente.

### Banco de Dados

- Nenhuma migration ou schema previsto inicialmente.

## Criterios de Aceite

- A home publica usa uma base de fundo consistente com as demais abas publicas.
- Valores de fundo especificos da home sao substituidos por tokens existentes ou justificados no plano.
- A home continua visualmente alinhada a paleta atual do FINGERENCE.
- A interface fica menos escura/morta sem trocar a identidade principal do produto.
- O preview principal da home aproveita melhor a largura horizontal disponivel.
- Os cards visuais da home nao ficam artificialmente pequenos em telas largas.
- A responsividade mobile/tablet permanece correta.
- Nao ha alteracao funcional em login, modais, links, APIs ou dados.
- Build/check frontend relevante passa apos implementacao.

## Perguntas Para o Planejamento

- A padronizacao deve usar somente os tokens atuais `site.bg` e `site.bgAlt` ou vale criar novos tokens para superficies da home?
- A area visual principal deve ocupar ate `1800px`, igual aos containers das demais paginas, ou outro limite visual e mais adequado?
- A timeline do `HomeHowItWorksSection` deve continuar com cards absolutos em desktop ou migrar para grid responsivo em telas largas?
- O objetivo visual e apenas clarear superficies/bordas ou tambem reduzir sombras pretas pesadas?
- Deve haver validacao visual com screenshot em desktop/mobile antes de considerar a implementacao concluida?

## Instrucoes Para a Skill Planejar

- Use este arquivo como especificacao de entrada.
- Leia `sistema financas/AGENT.md` e `sistema financas/CLAUDE.md` antes de planejar.
- Considere que `frontend/AGENT.md` e `backend/AGENT.md` nao foram encontrados na raiz do projeto durante a criacao desta task.
- Inspecione os arquivos citados antes de escrever o plano.
- Classifique a implementacao como `frontend`.
- Nao implemente codigo durante o planejamento.
- Nao instale dependencias durante o planejamento.
- Nao execute migrations.
- Gere um plano em `.plans/` com etapas pequenas, revisaveis e seguras.

## Instrucoes Consideradas

- `C:\Users\rodri\Music\Particular\sistema financas\AGENT.md`
- `C:\Users\rodri\Music\Particular\sistema financas\CLAUDE.md`
- `C:\Users\rodri\Music\Particular\skills\criar-task\SKILL.md`

