# Plano de Implementação: Ocultar Catálogo de Produtos (inacabado)

## Origem

- Arquivo de especificação: nenhum `.md` dedicado — escopo definido em conversa direta com o usuário.
- Data do planejamento: `2026-09-04`
- Classificação: `frontend-only`

## Resumo

A feature "Catálogo de produtos" (mesclada recentemente em `main` via `feat/R/catalogo-publico-produtos`) está inacabada. O usuário pediu para ocultá-la dos dois pontos onde está exposta hoje: a aba "Catálogo de produtos" em Configurações e a rota pública `/catalogo/:contaId`, sem apagar o código já escrito, para retomar depois.

## Escopo

### Dentro do escopo

- Remover a entrada `catalogo` de `ITEMS` em `ConfigPanel.tsx` (aba "Catálogo de produtos" some da navegação de Configurações).
- Remover a renderização condicional `{activeItem === 'catalogo' && <CatalogoTab />}` em `ConfigPanel.tsx`.
- Remover a rota `<Route path="/catalogo/:contaId" element={<CatalogoPublicoPage />} />` de `PublicSite` em `App.tsx` — path cai no catch-all `*` → `HomePage`.
- Remover imports que ficarem não utilizados como consequência direta (`CatalogoTab` em `ConfigPanel.tsx`, `CatalogoPublicoPage` em `App.tsx`), para não deixar erro de lint/build por import morto.

### Fora do escopo

- Apagar arquivos de código da feature (`CatalogoTab.tsx`, `CatalogoPublicoPage.tsx`, `catalogoService.ts`, `ProdutoImagensManager.tsx`) — ficam intactos no repositório para retomar depois.
- Remover o tipo `'catalogo'` de `ConfigItemId` — mantido por ora para minimizar o diff e facilitar reverter quando a feature for retomada (a menos que cause erro de tipo não usado, a confirmar durante implementação).
- Qualquer alteração de backend/rotas de API relacionadas a catálogo.
- Menção a "Catálogo de serviços" (`servicos`), que é uma feature diferente e já concluída — não deve ser tocada.

## Leitura de contexto

- `AGENT.md` e `CLAUDE.md` (raiz de `sistema financas`) — já lidos em conversas anteriores desta sessão; regras de workflow e ausência de `frontend/AGENT.md`/`backend/AGENT.md` dedicados já confirmadas.
- Arquivos inspecionados: `src/layout/ConfigPanel.tsx`, `src/App.tsx`.

## Impacto por área

### Frontend

- **`src/layout/ConfigPanel.tsx`**: remover item `catalogo` de `ITEMS` e sua renderização condicional; remover import de `CatalogoTab` se ficar não utilizado.
- **`src/App.tsx`**: remover rota `/catalogo/:contaId`; remover import de `CatalogoPublicoPage` se ficar não utilizado.
- Sem impacto em hooks, query keys ou services — a lógica de dados (`catalogoService.ts`) permanece intacta, apenas desconectada da UI.

### Backend

`Sem impacto esperado`

### Banco de dados

`Sem impacto esperado`

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

- `sistema financas/src/layout/ConfigPanel.tsx`
- `sistema financas/src/App.tsx`

## Estratégia de implementação

1. Em `ConfigPanel.tsx`: remover a linha `{ id: 'catalogo', label: 'Catálogo de produtos', icon: ShoppingBag }` de `ITEMS` e a linha `{activeItem === 'catalogo' && <CatalogoTab />}`. Remover o import de `CatalogoTab` e, se `ShoppingBag` ficar sem uso, remover do import de `lucide-react` também.
2. Em `App.tsx`: remover a rota `<Route path="/catalogo/:contaId" element={<CatalogoPublicoPage />} />` e o import de `CatalogoPublicoPage`.
3. Rodar `npm run build` para confirmar que não sobrou import não utilizado quebrando o build.

## Regras de negócio identificadas

- Nenhuma regra de negócio nova — é remoção de pontos de navegação/roteamento, sem alterar dados ou lógica.

## Regras multi-tenant e segurança

Não aplicável — mudança de UI/roteamento client-side.

## Validações necessárias

- Confirmar que nenhum outro ponto do app (menus, links internos, onboarding) referencia a aba `catalogo` ou a rota `/catalogo/:contaId` de forma que quebraria após a remoção.

## Testes necessários

### Frontend

- Validação manual: aba "Catálogo de produtos" não aparece mais em Configurações.
- Validação manual: acessar `/catalogo/:contaId` diretamente no navegador cai na Home (catch-all), sem erro.

### Backend

`Sem impacto esperado`

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
npm run build
```

## Riscos e pontos de atenção

- Links já compartilhados de `/catalogo/:contaId` deixam de funcionar (caem na Home) — aceitável, feature está incompleta.
- Nenhum dado é apagado; mudança é reversível restaurando as linhas removidas.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Aba "Catálogo de produtos" não aparece mais em Configurações.
- Rota `/catalogo/:contaId` não está mais registrada (cai no catch-all).
- `npm run build` passa sem erros.
- Código-fonte da feature (`CatalogoTab.tsx`, `CatalogoPublicoPage.tsx`, `catalogoService.ts`, `ProdutoImagensManager.tsx`) permanece intacto no repositório.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations — não há nenhuma nesta mudança.
- Manter alterações restritas aos 2 arquivos listados.
- Não apagar arquivos de componentes/services da feature de catálogo.
