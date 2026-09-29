# Plano de Implementação: CSS crítico no fallback público (elimina flash sem estilo)

## Origem

- Arquivo de especificação: solicitação direta do usuário no chat (sem `.md` de feature associado)
- Data do planejamento: 2026-08-04
- Classificação: `frontend-only`

## Resumo

Ao abrir/recarregar a raiz (`/`), um HTML estático sem CSS (fallback de SEO/crawlers gerado por `scripts/generate-public-route-html.mjs`, injetado dentro de `#root`) fica visível por uma fração de segundo antes do React montar `PublicSite`/`HomePage` por cima. Isso causa o "flash de descrição sem customização" relatado.

A correção adiciona CSS crítico inline no `<head>` de `index.html`, escopado ao fallback público, para que ele já apareça com aparência coerente com a landing real (fundo escuro `#040E12`, tipografia clara, espaçamento básico) em vez de HTML cru, eliminando a sensação de flash sem depender do carregamento da folha de estilos completa da aplicação.

## Escopo

### Dentro do escopo

- Adicionar `<style>` crítico inline no `<head>` de `index.html`, escopado ao container do fallback (`#root > main[aria-label="Conteúdo público do FINGERENCE"]` ou seletor equivalente).
- Garantir que `scripts/generate-public-route-html.mjs` preserve esse `<style>` ao gerar as demais páginas públicas (`funcionalidades/`, `sobre/`, `planos/`, `contato/`, `termos/`, `privacidade/`).
- Validar visualmente que o flash desaparece.

### Fora do escopo

- Alteração de conteúdo/textos do fallback (usados para SEO).
- Alteração do componente React `HomePage`/`PublicSite` ou de qualquer tela autenticada.
- Mudança de arquitetura de SSR/prerendering.

## Leitura de contexto

- `/AGENT.md`
- `sistema financas/AGENT.md`
- `sistema financas/index.html`
- `sistema financas/app.html`
- `sistema financas/src/main.tsx`
- `sistema financas/src/App.tsx` (componentes `PublicSite`, `HomePage`)
- `sistema financas/src/screens/public/HomePage.tsx` (paleta de cores real da landing)
- `sistema financas/scripts/generate-public-route-html.mjs`

## Impacto por área

### Frontend

- CSS crítico inline adicionado ao `<head>` de `index.html`, escopado ao fallback público via seletor específico, sem vazar para a aplicação React após o mount.
- Nenhuma mudança de componente React.

### Backend / Banco de dados / Infra

Sem impacto esperado.

## Arquivos provavelmente afetados

- `sistema financas/index.html`
- `sistema financas/scripts/generate-public-route-html.mjs` (se necessário garantir que o `<style>` sobrevive à reescrita do template por rota)

## Estratégia de implementação

1. Definir no `<head>` de `index.html` um bloco `<style>` com regras mínimas para o seletor do fallback: `background`, `color`, `max-width`/centralização, tipografia de título/parágrafo e estilo simples da `nav`/links — usando as cores reais do tema (`#040E12` de fundo, tons de ciano `rgba(14,196,216,...)` para acentos, texto claro).
2. Conferir em `scripts/generate-public-route-html.mjs` se o `<style>` sobrevive à leitura/reescrita do template (`readFile(dist/index.html)` + substituições regex) — como o script só mexe em `<title>`, metas e no bloco `PUBLIC_FALLBACK`, o `<style>` no `<head>` deve ser preservado automaticamente; validar isso no build.
3. Rodar `npm run build` e inspecionar `dist/index.html`, `dist/sobre/index.html` etc. para confirmar que o `<style>` está presente em todas as rotas geradas.
4. Testar visualmente com throttling de rede (DevTools) recarregando `/` para confirmar que o flash de HTML cru não ocorre mais.

## Regras de negócio identificadas

- O fallback estático deve continuar existindo com o mesmo conteúdo textual (usado para SEO/crawlers) — este plano não altera textos.
- O CSS crítico deve ficar escopado ao fallback, sem interferir na aplicação React montada.

## Validações necessárias

- Inspeção visual do fallback estilizado antes do JS carregar (via throttling).
- Inspeção dos HTMLs gerados em `dist/` após o build, confirmando presença do `<style>` em todas as rotas públicas.

## Testes necessários

### Frontend

- Recarregar `/` com throttling de rede para observar o fallback já estilizado.
- Conferir transição limpa do fallback para `HomePage` real (sem "salto" visual abrupto de cor/fundo).
- Conferir as demais rotas públicas geradas.

### Backend / E2E

Sem impacto esperado / não aplicável.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
```

## Riscos e pontos de atenção

- Baixo risco: mudança puramente visual/CSS.
- Atenção para escopar corretamente o seletor CSS, evitando que ele afete a aplicação autenticada.
- Atenção para manter consistência cromática com `HomePage.tsx`, evitando criar uma segunda aparência divergente que também cause estranheza na transição.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Flash de HTML sem estilo não é mais perceptível ao abrir/recarregar `/`.
- Fallback aparece com fundo escuro e tipografia coerente com a landing real antes do React montar.
- Conteúdo textual do fallback permanece inalterado.
- Build gera o CSS crítico corretamente em todas as rotas públicas.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Alterar apenas `index.html` (e `scripts/generate-public-route-html.mjs` somente se a validação do build mostrar que o `<style>` não sobrevive à reescrita).
- Não alterar componentes React, backend, schema, migrations ou `.env`.
- Manter alterações pequenas e focadas.
- Rodar o build do frontend ao final e inspecionar os HTMLs gerados.
