# Plano de Implementação: página do Finanças sem transbordo no celular

## Origem

- **Arquivo de especificação:** não há. O problema foi achado na conferência visual do plano `.plans/site-menu-textos-cards.md`, e o usuário pediu um plano separado.
- **Data do planejamento:** 2026-10-13.
- **Classificação:** `frontend-only`.

## Resumo

1. **O problema:** no celular (390 px), a página `/financas/` fica com 560 px de largura e arrasta para os lados. As outras 6 páginas do site ficam certas, com 390 px. As medições foram feitas na produção com o Chrome, simulando celular.
2. **A causa:** na tabela de comparação dos planos (`FinanceComparison`, em `PriceTables.tsx`), cada célula tem um texto para leitor de tela, "Incluído" ou "Não incluído", com a classe `sr-only`. Essa classe usa `position: absolute`. A caixa com rolagem da tabela (`overflow-x-auto`) não tem posição definida, então esses textos usam a página como referência, escapam da caixa e esticam a largura.
3. **A correção:** a classe `relative` na caixa da tabela. Ela foi testada no navegador, na produção: a página volta a 390 px, e a tabela continua rolando dentro da caixa (350 px de caixa para 600 px de tabela).

## Escopo

### Dentro do escopo

- A classe `relative` na caixa da tabela de comparação, com um comentário curto.
- O mesmo commit leva a revisão da decisão 2 do adendo 1, já escrita em `.plans/site-menu-textos-cards.md`, como o usuário aprovou.

### Fora do escopo

- Qualquer outra mudança na tabela, nos planos ou nos textos.
- As outras páginas, que já ficam certas no celular.

## Leitura de contexto

- `CLAUDE.md` e `AGENT.md` da raiz. Não existem `frontend/AGENT.md` nem `backend/AGENT.md`.
- `src/screens/public/components/PriceTables.tsx` (`FinanceComparison`).
- Medições de largura com o Chrome, simulando celular de 390 px, nas 7 páginas da produção: só `/financas/` passa da largura.

## Impacto por área

### Frontend

- **Componente afetado:** `FinanceComparison`, em `PriceTables.tsx`. A `div` da tabela passa de `overflow-x-auto rounded-[24px] border border-slate-200 bg-white` para `relative overflow-x-auto rounded-[24px] border border-slate-200 bg-white`.
- **O que muda de verdade:** só a referência dos elementos com posição absoluta dentro da caixa. São eles os textos `sr-only` das células e o `caption` `sr-only` da tabela.
- **O que não muda:** o visual e a leitura por leitor de tela.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. Este plano não tem migration.

### Infra/Deploy

Sem impacto esperado. O deploy é o de sempre, com o merge em `main`.

## Arquivos provavelmente afetados

- `src/screens/public/components/PriceTables.tsx`
- `.plans/site-menu-textos-cards.md`, com a revisão da decisão 2 já escrita
- `.plans/site-financas-tabela-celular.md`, este plano

## Estratégia de implementação

1. Usar a branch ativa `feat/R/site-menu-textos-cards`, porque é um pedido pequeno do mesmo assunto. Antes, atualizar a branch com a `main`, que tem o merge `e1b8ec1b`.
2. Em `FinanceComparison`, acrescentar `relative` na `div` da tabela, com o comentário: os textos `sr-only` das células têm posição absoluta e precisam ficar presos na caixa com rolagem.
3. Rodar `npm test`, `npx tsc --noEmit` e `npx vite build`.
4. Medir no ambiente local, com o Chrome simulando celular de 390 px:
   - `/financas/` com 390 px;
   - a caixa da tabela continua com rolagem própria;
   - as outras páginas continuam com 390 px.

## Regras de negócio identificadas

- Nenhuma regra nova.
- A tabela continua comparando Starter e Premium, com "Incluído" e "Não incluído" lidos pelo leitor de tela.

## Regras multi-tenant e segurança

Sem impacto: é o site público, sem dados de conta.

## Validações necessárias

Não há entrada de usuário nova. Sobre a largura, o `document.documentElement.scrollWidth` precisa ser igual à largura da tela (390 px) em `/financas/`.

## Testes necessários

### Frontend

- `npm test` e `npx tsc --noEmit`. O projeto não tem teste de layout.

### Backend

Sem impacto esperado.

### E2E

- Com o Chrome simulando celular de 390 px:
  - `/financas/` não arrasta para os lados;
  - a tabela de comparação rola dentro da própria caixa;
  - `/`, `/licitacoes/`, `/sobre/`, `/contato/`, `/termos/` e `/privacidade/` continuam com 390 px.
- No computador, a tabela continua igual, sem rolagem.

## Comandos de validação sugeridos

```bash
npm test
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- **Risco baixo:** a caixa não tem outros elementos com posição definida que o `relative` possa afetar.
- **Pasta compartilhada:** o outro chat usa a mesma pasta. Antes de trocar de branch, confirmar com o usuário.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- No celular (390 px), `/financas/` tem 390 px de largura.
- A tabela de comparação rola dentro da própria caixa.
- As outras páginas do site continuam com 390 px.
- `npm test`, `npx tsc --noEmit` e `npx vite build` passam.

## Observações para a skill implementar

- Usar este plano como fonte principal. A mudança é uma classe só, sem refatorar nada em volta.
- O commit leva junto a revisão da decisão 2 em `.plans/site-menu-textos-cards.md`.
- Não rodar migrations e não mexer no `.env`.
