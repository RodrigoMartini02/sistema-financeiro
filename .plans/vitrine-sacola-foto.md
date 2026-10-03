# Plano de Implementação: foto da sacola espremendo o item

## Origem

- **Arquivo de especificação:** não há `.md`. O pedido veio do chat em 2026-10-03: o usuário mandou um print da sacola da Aether em produção com o comentário "está estranho, dados cortados em tela".
- **Data do planejamento:** `2026-10-03`
- **Classificação:** `frontend-only`. Só a página da sacola da vitrine; sem backend, banco ou infra.
- **Plano anterior:** `.plans/vitrine-checkout-mercado-pago.md` (merge na `main` em `8244f7f7`), que criou a página da sacola.

## Resumo

- **O defeito:** na sacola (`/loja/<link>/sacola`), a foto do item aparece no tamanho original e espreme o resto do item. Nome, preço "de/por", seletor de quantidade e subtotal ficam cortados.
- **A causa:** a moldura da foto (`ProductThumb`, em `StorefrontSummary.tsx`) é um `span` sem `display: block`. Na sacola, ela fica dentro do link da foto, que não é flex. Ali a altura e a largura (80 px no celular, 96 px no computador) são ignoradas, e a imagem com `h-full w-full` ocupa o tamanho real.
- **Por que o checkout não tem o defeito:** lá a mesma moldura é filha direta de uma linha flex, e todo item de flex vira bloco.
- **A correção:** dar `block` à moldura e `flex-none` ao link da foto.

## Escopo

### Dentro do escopo

- Moldura da foto com `block` no `ProductThumb`. O componente é compartilhado pela sacola e pelo checkout.
- Link da foto no item da sacola com `flex-none`, para a foto não encolher quando o nome é longo.
- Conferência visual com print automático: computador e celular.

### Fora do escopo

- Qualquer outra mudança de layout, texto ou comportamento na sacola, no checkout ou no pedido.
- **Merge na `main`:** o usuário pediu só a branch. O merge fica para a pergunta do `/finalizar`.

## Leitura de contexto

- `/AGENT.md` (regras transversais) e `/CLAUDE.md` (fluxo `/planejar` → `/implementar` → `/finalizar`).
- **Arquivos que não existem neste projeto:** `/frontend/AGENT.md` e `/backend/AGENT.md`.
- **Arquivos lidos:**
  - `src/screens/public/storefront/StorefrontSummary.tsx` (`ProductThumb`, linhas 55 a 63);
  - `src/screens/public/storefront/StorefrontCartPage.tsx` (`CartItemCard`, linhas 51 a 89);
  - `src/screens/public/storefront/StorefrontCheckoutPage.tsx` (uso no resumo, linha 108).
- **Outras páginas novas:** conferidas, sem o mesmo problema. `StoreLogo`, os ícones das etapas e o andamento do pedido já usam `flex` ou ficam dentro de flex.

## Impacto por área

### Frontend

- **`ProductThumb`:** a classe da moldura ganha `block`. No checkout, o resultado visual não muda.
- **`CartItemCard`:** o `<Link>` que envolve a foto ganha `className="flex-none"`.
- **Testes:** nenhum teste unitário novo, porque não há lógica nova. A garantia vem da conferência visual.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado. Nenhuma migration.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado. Na produção, a correção só aparece depois do merge na `main`, que dispara o deploy do site.

## Arquivos provavelmente afetados

- `src/screens/public/storefront/StorefrontSummary.tsx`
- `src/screens/public/storefront/StorefrontCartPage.tsx`

## Estratégia de implementação

1. Na branch `feat/R/vitrine-checkout` (a ativa), adicionar `block` à classe da moldura em `ProductThumb`.
2. Em `CartItemCard`, colocar `className="flex-none"` no `<Link>` da foto.
3. Rodar `npx tsc --noEmit`, `npm test` e `npm run build`.
4. **Conferência visual automática:**
   - render temporário da sacola (`src/tmpclaude-*`, ignorado pelo git), com dois itens: um de nome longo e com desconto, outro sem foto;
   - usar o CSS gerado pelo build;
   - tirar print no Microsoft Edge em modo headless, nas larguras de computador (1200 px) e de celular (390 px);
   - conferir nos prints: foto de 96 px e 80 px, nome, "de/por", quantidade e subtotal inteiros e sem corte;
   - se o Edge headless não rodar, registrar no plano e deixar a conferência para o usuário no navegador.
5. Apagar os arquivos temporários e registrar o resultado neste plano.

## Regras de negócio identificadas

Nenhuma regra nova. A sacola continua igual; só o tamanho da foto passa a valer.

## Regras multi-tenant e segurança

Sem impacto: a mudança é só de CSS na página pública da sacola. Não muda dados, rotas nem permissões.

## Validações necessárias

Nenhuma validação nova de entrada.

## Testes necessários

### Frontend

- Os testes existentes continuam passando (`npm test`).

### Backend

- Sem impacto.

### E2E

- Print da sacola no computador e no celular, com o layout correto (estratégia, passo 4).

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npm run build
```

## Riscos e pontos de atenção

- **Risco baixo:** são duas classes de CSS, sem mudança de comportamento. O `ProductThumb` também é usado no checkout, onde `block` não muda nada, porque ali ele já é item de flex.
- **Produção:** segue com o defeito até o merge na `main`, que o usuário deixou para depois.
- **Lição do plano anterior:** o teste de tela no jsdom não mede layout. Por isso, aqui a validação é por print.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação estará pronta quando:

- na sacola, a foto do item tiver 80 px no celular e 96 px no computador, sem espremer o resto;
- nome, preço "de/por", selo de desconto, quantidade, "Excluir" e subtotal aparecerem inteiros;
- o resumo do checkout continuar igual;
- `tsc`, testes e build passarem e a conferência visual ficar registrada neste plano.

## Observações para a skill implementar

- Usar este plano como fonte principal; seguir `/AGENT.md` e `/CLAUDE.md`.
- Mudança pequena e focada: só as duas classes.
- **Branch:** a `feat/R/vitrine-checkout`, que já teve merge. Commit e push; o merge só se o usuário confirmar no `/finalizar`.
- Scripts temporários em `tmpclaude-*`, apagados no fim.
- Nada de migrations, `.env` ou backend.

## Registro da implementação (2026-10-03)

- **Branch:** `feat/R/vitrine-checkout`, sem commit ainda.
- **Mudanças:**
  - `ProductThumb` ganhou `block` na moldura;
  - o link da foto em `CartItemCard` ganhou `flex-none`.
- **Validação:** `tsc` sem erro, testes 106/106 e `npm run build` ok.
- **Conferência visual (Edge headless, com o CSS do build):**
  - **Montagem:** dois itens, um com nome longo, desconto e foto de 1200×800, e outro sem foto.
  - **Antes:** o print sem as duas classes reproduziu o defeito do print do usuário (foto gigante e item cortado). O item sem foto também quebrava: o ícone ficava fora da moldura.
  - **Depois, computador (1200 px):** foto de 96 px; nome em duas linhas; "de/por", -10%, quantidade, "Excluir" e subtotal inteiros.
  - **Depois, celular (390 px):** foto de 80 px e tudo inteiro, com e sem Mercado Pago. A barra fixa "Total · Continuar" aparece certa.
  - **Ajuste no método:** o Edge headless não abre janela com menos de ~500 px de largura. O print do celular foi feito com a página num quadro de 390 px.
- Scripts temporários apagados.
- **Desvios do plano:** nenhum.
