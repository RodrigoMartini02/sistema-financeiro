# Plano de Implementação: Fundo Neon da Home

## Origem

- Pedido do usuário: `Planeje a troca do fundo da home usando a nova imagem`
- Imagem de referência: `C:\Users\marti\OneDrive\Ambiente de Trabalho\ChatGPT Image 12 de jul. de 2026, 23_17_57.png`
- Data do planejamento: 2026-07-13
- Classificação: `frontend-only`

## Resumo

Trocar o fundo principal da home por uma nova arte neon/futurista, mantendo a identidade visual existente do sistema nas demais áreas. A mudança deve ser restrita à seção hero da home, sem substituir `logo.png`, favicon, sidebar, modal de login ou logos internas.

A abordagem recomendada é copiar a nova imagem para um asset próprio do projeto e usá-la como background da home com camadas de gradiente para preservar legibilidade dos textos.

## Escopo

### Dentro do escopo

- Adicionar a nova imagem como asset próprio da home.
- Aplicar a imagem como fundo da seção hero da home.
- Manter texto, botões e estrutura principal da home.
- Adicionar overlays/gradientes para proteger a leitura do conteúdo.
- Ajustar comportamento responsivo para desktop, tablet e mobile.
- Validar build do frontend.

### Fora do escopo

- Trocar logos globais do sistema.
- Alterar favicon, manifest, PWA ou ícones internos.
- Alterar sidebar, login modal, footer ou header por causa dessa imagem.
- Alterar backend, banco de dados, migrations ou `.env`.
- Refatorar a landing inteira.

## Leitura de contexto

Arquivos e áreas analisados:

- `/AGENT.md`
- `/CLAUDE.md`
- `src/screens/public/HomePage.tsx`
- `src/screens/public/components/HeroLogoDecor.tsx`
- `src/screens/public/components/SitePageHero.tsx`
- `src/screens/public/components/SiteHeader.tsx`
- `vite.config.ts`
- `package.json`
- `icons/`

Observação importante: `HeroLogoDecor` é compartilhado entre a home e páginas públicas como Funcionalidades, Planos, Sobre e Contato. Por isso, a recomendação é não alterar esse componente diretamente para esta mudança.

## Impacto por área

### Frontend

Impacto restrito à home pública.

A seção hero de `HomePage.tsx` deverá receber a nova imagem como fundo, preferencialmente sem mudar a estrutura textual. O visual deve manter o conteúdo à esquerda e a arte neon à direita, usando gradientes para garantir contraste.

Cuidados esperados:

- Imagem com `background-position` à direita no desktop.
- Overlay escuro à esquerda para texto.
- Ajuste de opacidade/posição no mobile.
- Fallback visual caso a imagem demore a carregar.
- Evitar que a imagem dispute leitura com título, subtítulo e botões.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

Importante: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto estrutural esperado.

Pode haver impacto leve no tamanho do bundle/asset servido. Se a imagem for muito pesada, recomenda-se otimizar antes de concluir.

## Arquivos provavelmente afetados

- `icons/home-hero-bg.png` ou nome equivalente para o novo asset.
- `src/screens/public/HomePage.tsx`

Evitar alterar:

- `icons/logo.png`
- `icons/logo-hero.png`
- `manifest.json`
- `index.html`
- `app.html`
- `src/screens/public/components/HeroLogoDecor.tsx`, salvo se o usuário decidir aplicar o novo fundo em todas as páginas públicas.

## Estratégia de implementação

1. Copiar a imagem fornecida para dentro do projeto com nome canônico, por exemplo `icons/home-hero-bg.png`.
2. Verificar o peso da imagem e, se necessário, gerar uma versão otimizada mantendo qualidade visual.
3. Atualizar somente a seção hero em `HomePage.tsx`.
4. Aplicar a imagem como layer de background da home, posicionada à direita.
5. Inserir ou ajustar overlays escuros/ciano para preservar legibilidade.
6. Manter o conteúdo atual da home, incluindo título, subtítulo, texto auxiliar e CTAs.
7. Testar responsividade em desktop e mobile.
8. Rodar `npm run build`.
9. Conferir a home local em `http://localhost:5173/`.

## Regras de negócio identificadas

- A alteração é visual e pública.
- A home deve continuar comunicando o produto financeiro com clareza.
- A nova imagem deve funcionar como fundo, não como substituição geral da marca.
- A identidade interna do sistema não deve ser alterada por esta tarefa.

## Regras multi-tenant e segurança

Sem impacto multi-tenant esperado.

Como não há alteração de backend, banco, autenticação ou rotas protegidas, não há risco direto de vazamento entre perfis/tenants. Ainda assim, não alterar `.env`, endpoints ou regras de autenticação durante essa implementação.

## Validações necessárias

- Confirmar que a home renderiza sem imagem quebrada.
- Confirmar que o texto permanece legível sobre o fundo.
- Confirmar que a arte neon não cobre botões no desktop.
- Confirmar que o mobile não fica poluído ou com texto sobreposto.
- Confirmar que as demais páginas públicas não mudaram visualmente sem intenção.
- Confirmar que favicon e logos internas permanecem como estão.

## Testes necessários

### Frontend

- Validação visual manual da home em desktop.
- Validação visual manual da home em mobile.
- Conferir que navegação pública continua funcionando.
- Conferir que o modal de login ainda abre pelos CTAs.

### Backend

Sem testes backend necessários.

### E2E

Não obrigatório para esta alteração visual, mas útil se já houver fluxo automatizado para abrir home e login.

## Comandos de validação sugeridos

```bash
npm run build
```

Se o servidor local não estiver rodando:

```bash
npm run dev
```

URL esperada:

```txt
http://localhost:5173/
```

## Riscos e pontos de atenção

- Alterar `HeroLogoDecor.tsx` mudaria também páginas internas públicas, não apenas a home.
- Sobrescrever `logo.png` ou `logo-hero.png` pode reabrir o problema anterior das logos.
- A imagem pode estar pesada demais para a home e precisar de otimização.
- Em telas pequenas, a imagem pode competir com o conteúdo caso não receba overlay suficiente.
- Já existem alterações não commitadas em `icons/logo.png` e `icons/logo-hero.png`; a implementação deve evitar mexer nesses arquivos.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada para a implementação proposta, considerando que o usuário aprovou aplicar a nova imagem apenas no fundo da home.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- A nova imagem aparecer como fundo da hero da home.
- A home mantiver boa legibilidade em desktop e mobile.
- Nenhuma logo global for substituída por essa tarefa.
- As demais páginas públicas não forem alteradas sem intenção.
- `npm run build` concluir com sucesso.
- O app continuar acessível em `http://localhost:5173/`.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não alterar `.env`.
- Não executar migrations.
- Não alterar backend.
- Não substituir `logo.png`, `logo-hero.png`, favicon ou manifest.
- Preferir adicionar um asset novo específico para a home.
- Preservar as alterações não relacionadas já existentes no working tree.