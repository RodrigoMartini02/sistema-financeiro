# Task: Corrigir sidebar espremida em telas de menor altura

## Contexto

Na sidebar principal (`src/layout/AppShell.tsx`), o usuário reportou que em telas de altura menor (ex: notebooks pequenos), o submenu expandido de "Configurações" (Cartões, Perfis, Usuários, Acessos, Clientes, Serviços) fica espremido em um espaço mínimo, cortando itens e exibindo uma scrollbar interna apertada entre o grupo SISTEMA e o card de usuário no rodapé.

## Diagnóstico

A causa é uma cadeia de `flex-1 min-h-0` aninhada dentro do `<nav>` da sidebar (linhas 284, 318, 320, 353), combinada com os grupos FINANÇAS/ANÁLISE marcados como `shrink-0` (linha 285) — ou seja, eles nunca encolhem. Todo o aperto de espaço recai sobre o bloco SISTEMA e, dentro dele, sobre o submenu de Configurações (`div.sidebar-config-scroll`, linha 353), que tem seu próprio `overflow-y-auto` isolado. Em viewports baixos, esse submenu fica com poucos pixels de altura antes de precisar rolar, cortando visualmente os itens (é o que aparece nas imagens enviadas pelo usuário).

Não há `max-height` fixo nem breakpoints (`sm:`/`md:`) tratando esse cenário — o único breakpoint (`lg:`) apenas alterna entre sidebar desktop fixa e drawer mobile.

## Objetivo

Substituir o scroll isolado do submenu de Configurações por um único scroll para toda a área de navegação da sidebar (`<nav>`), mantendo o rodapé do usuário sempre visível e colado embaixo — eliminando o aperto artificial no bloco SISTEMA sem alterar o comportamento de expandir/colapsar o submenu.

## Escopo

### Dentro do escopo

Arquivo: `src/layout/AppShell.tsx` (linhas 284–390, dentro da `const sidebar`)

1. Remover a cadeia de `flex-1 min-h-0` aninhada nos containers intermediários (linhas 284, 318, 320) que hoje forçam a divisão de espaço entre os grupos de navegação.
2. Mover o `overflow-y-auto` (hoje isolado no submenu, linha 353) para o `<nav>` como um todo, de forma que toda a lista de navegação (FINANÇAS, ANÁLISE, SISTEMA + submenu de Configurações) role em conjunto quando não couber na altura disponível.
3. Manter o rodapé do usuário (linhas 392-410) sempre visível fora da área de scroll — ele já fica naturalmente "colado" no fim por estar fora do `flex-1`, esse comportamento não muda.
4. Reaproveitar a classe de estilização de scrollbar já existente (`sidebar-config-scroll`, `src/styles/globals.css` linhas 355–376) aplicando-a ao `<nav>` em vez de ao submenu, para manter a aparência visual da barra de rolagem consistente.
5. Validar visualmente em ambos os modos: sidebar desktop (`lg:flex`, linha 417) e drawer mobile (linha 424), já que os dois reutilizam a mesma constante `sidebar`.

### Fora do escopo

- Qualquer mudança na lógica de abrir/fechar o submenu de Configurações (`configOpen`), nos itens de menu, ícones, cores ou no `PerfilSwitcher`.
- Mudanças em outras telas/componentes fora de `AppShell.tsx` e do trecho de CSS da scrollbar.
- Não implementar as abordagens alternativas descartadas (colapsar FINANÇAS/ANÁLISE automaticamente ao abrir Configurações, ou transformar o submenu em flyout/popover).

## Estratégia de implementação

1. Editar `src/layout/AppShell.tsx`:
   - `<nav className="flex min-h-0 flex-1 flex-col px-3 py-2">` (linha 284) passa a receber `overflow-y-auto` e a classe de scrollbar customizada.
   - Bloco SISTEMA (linha 318) e seu container interno (linha 320) deixam de usar `flex-1 min-h-0` — passam a ser blocos de altura natural (`shrink-0` ou sem flex), já que quem rola agora é o `<nav>` inteiro.
   - Submenu de Configurações (linha 353) perde o `min-h-0 flex-1 overflow-y-auto` próprio — vira um bloco de altura natural, listando todos os itens sem corte.
2. Ajustar `src/styles/globals.css` (linhas 355–376) se necessário, para que o seletor da classe de scrollbar customizada se aplique corretamente ao novo elemento alvo (`<nav>`), sem duplicar regras.
3. Rodar `npx vite build` para validar.
4. Pedir ao usuário para conferir visualmente em tela de altura reduzida (o cenário relatado) e no drawer mobile.

## Observações

- Mudança é puramente de CSS/estrutura de layout — sem impacto em backend, banco de dados ou lógica de negócio.
- Abordagem escolhida pelo usuário dentre 3 opções apresentadas: "sidebar rola inteira" (scroll único no `<nav>`, rodapé do usuário sempre fixo embaixo).
