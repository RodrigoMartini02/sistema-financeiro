# Plano de Implementação: Seção de benefícios/venda na Home

## Origem

- Arquivo de especificação: `docs/features/home-secao-beneficios-vendas.md`
- Data do planejamento: `2026-08-15`
- Classificação: `frontend-only`

## Resumo

A Home ficou sem conteúdo de venda/benefício próprio depois que `HomeBenefitsSection.tsx` foi
removida junto com as demais seções antigas, sob a premissa incorreta de que a seção interativa
(`HomeInteractiveDemo`) supriria esse papel sozinha. Este plano adiciona uma nova seção de
benefícios — 3-4 blocos de ícone + título curto + descrição de 1-2 linhas, sem mockups visuais —
posicionada entre o Hero e a demo interativa, para comunicar a proposta de valor do produto antes
do visitante experimentar a demo.

## Escopo

### Dentro do escopo

- Novo componente `HomeBenefitsHighlights` (ou nome equivalente) com 3-4 blocos de benefício,
  cada um com ícone (`lucide-react`), título curto e descrição de 1-2 linhas.
- Copy focado em resultado/benefício para o usuário (organização, controle, rapidez, clareza),
  não em descrição técnica de funcionalidade.
- Layout em grid horizontal responsivo, reaproveitando a paleta `site-*`/`brand-*` já
  estabelecida na Home.
- Animação de entrada via `ScrollReveal` (já existente em
  `src/screens/public/components/ScrollReveal.tsx`), consistente com o resto da página.
- Inserção em `src/screens/public/HomePage.tsx`, entre `SitePageHero` e `HomeInteractiveDemo`.

### Fora do escopo

- Qualquer alteração na seção interativa (`HomeInteractiveDemo`) — permanece como está.
- Mudança de paleta de cores ou tokens do Tailwind.
- Reintrodução de `HeroDashboardPreview` ou qualquer mockup visual estático dentro dos blocos.
- Mudanças na seção de avaliações ou no bloco de CTA final já existentes.

## Leitura de contexto

- `/AGENT.md` (raiz do projeto) — lido em ciclos anteriores desta sessão. Majoritariamente
  backend/multi-tenant; sem impacto direto nesta feature frontend-only. Não existem
  `frontend/AGENT.md`/`backend/AGENT.md` separados.
- `docs/features/home-secao-beneficios-vendas.md` — especificação desta feature.
- `src/screens/public/HomePage.tsx` — estrutura atual confirmada: Header → `SitePageHero` →
  `HomeInteractiveDemo` → Avaliações (condicional) → CTA final → Footer.
- `src/screens/public/components/ScrollReveal.tsx` — helper de animação de entrada já existente e
  reaproveitável.
- Histórico do git (`c02a9ad~1:src/screens/public/components/HomeBenefitsSection.tsx`) — consultado
  como referência de paleta/estilo (tons `toneStyles`, `SectionIcon` com borda circular), não de
  estrutura — o formato pedido agora é deliberadamente mais simples (sem cards grandes, sem
  mockups internos).

## Impacto por área

### Frontend

- **Novo**: `src/screens/public/components/HomeBenefitsHighlights.tsx` — componente com 3-4 blocos
  (ícone circular com borda, no estilo já usado no projeto, + título + descrição curta), em grid
  responsivo (`grid-cols-1` mobile, `sm:grid-cols-2` ou `md:grid-cols-4` conforme o número final
  de blocos).
- **Editado**: `src/screens/public/HomePage.tsx` — import do novo componente e inserção entre
  `<SitePageHero />` e `<HomeInteractiveDemo />`.
- Conteúdo 100% estático — sem `useQuery`, sem chamadas de API, sem estado.
- Sem impacto em acessibilidade além do já padrão do projeto (ícones com `aria-hidden`, textos
  legíveis).

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- Novo: `src/screens/public/components/HomeBenefitsHighlights.tsx`
- `src/screens/public/HomePage.tsx`

## Estratégia de implementação

1. Definir a copy final dos 3-4 blocos de benefício (ícone + título + descrição), com foco em
   resultado para o usuário, não em feature técnica.
2. Criar `HomeBenefitsHighlights.tsx` com o layout em grid, ícones `lucide-react`, paleta
   `site-*`/`brand-*`.
3. Envolver os blocos (ou o bloco inteiro) com `ScrollReveal` para animação de entrada consistente
   com o resto da página.
4. Inserir o componente em `HomePage.tsx`, entre hero e demo interativa.
5. Rodar `npx tsc --noEmit` e `npx vite build`.
6. Validação visual via `/run`.

## Regras de negócio identificadas

- Copy deve comunicar benefício/resultado (o que o usuário ganha), não descrição de
  funcionalidade técnica.
- Sem mockups ou previews visuais dentro dos blocos — decisão explícita do usuário de manter o
  formato enxuto.

## Regras multi-tenant e segurança

Não aplicável — conteúdo estático de marketing, sem dados de tenant, sessão ou API.

## Validações necessárias

Não aplicável — sem formulários, inputs ou payloads.

## Testes necessários

### Frontend

- Verificação visual manual (via `/run`) em mobile, tablet e desktop.
- Verificar que a animação de entrada (`ScrollReveal`) funciona ao rolar até a seção.

### Backend

Não aplicável.

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npx vite build
```

## Riscos e pontos de atenção

- Risco baixo — seção nova, estática, isolada, sem dependência de outras partes já validadas da
  Home (demo interativa não é tocada).
- Sem ferramenta de screenshot automatizado neste ambiente — validação visual final depende do
  usuário conferir no navegador via `/run`.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. Posição (entre Hero e demo interativa) e formato (blocos
simples ícone + título + descrição, sem mockups) já foram confirmados pelo usuário em ciclo de
planejamento anterior.

## Critérios de aceite do plano

- Seção visível entre o Hero e a demo interativa, com 3-4 blocos de ícone + título + descrição.
- Copy comunica benefício/resultado, não é descrição funcional técnica.
- Nenhuma alteração na seção interativa, avaliações ou CTA final já existentes.
- Build (`vite build`) e checagem de tipos (`tsc --noEmit`) passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não alterar `HomeInteractiveDemo.tsx` nem qualquer arquivo relacionado à demo interativa —
  fora de escopo desta feature.
- Reaproveitar `ScrollReveal` já existente, não criar novo helper de animação.
- Manter o formato enxuto pedido (sem mockups/previews internos aos blocos).
- Validar visualmente com `/run` antes de considerar a implementação concluída.
