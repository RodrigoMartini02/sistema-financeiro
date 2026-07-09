# Plano de Implementação: Landing Page — Rebuild de Conteúdo

## Origem

- Arquivo de especificação: análise direta do worktree `.claude/worktrees/agent-ab3b2adc/index.html` (versão antiga)
- Data do planejamento: `2026-06-25`
- Classificação: `frontend-only`

## Resumo

A versão React da LandingPage perdeu 5+ seções de conteúdo persuasivo em relação à versão antiga (FinGerence/HTML). Este plano rebuilda o conteúdo trazendo: stats strip dinâmica, features em bento grid com demos visuais estáticos, seção "Como Funciona", FAQ em accordion e botão WhatsApp flutuante. A seção Gen IA foi excluída pois não existe mais no sistema. O nav é corrigido para apontar a seções que realmente existem no DOM.

## Escopo

### Dentro do escopo

- **Hero**: adicionar lista de 4 benefícios com checkmarks + botão mobile `sm:hidden` para rolar ao painel de login
- **Nav**: atualizar links para Funcionalidades / Como Funciona / FAQ / Contato
- **Stats strip**: faixa horizontal com dados dinâmicos da API de avaliações + stats fixos do produto
- **Features Bento Grid**: substituir grid simples por 7 cards com demos visuais estáticos (chat bubbles, mini bar chart, progress bars, pills, avatar row)
- **Seção Como Funciona**: 3 passos com `id="como-funciona"`
- **FAQ**: 6 perguntas em accordion gerenciado por React state com `id="faq"`
- **WhatsApp flutuante**: botão fixo `bottom-6 right-6` com `href="https://wa.me/5549999554856"`

### Fora do escopo

- Seção Gen IA (não existe mais no sistema)
- Novos endpoints de backend
- Novas queries ou query keys
- Animações JavaScript complexas (apenas Tailwind/CSS)
- Alterações em outros componentes além de `LandingPage.tsx`

## Leitura de contexto

- `/AGENT.md` — lido
- `src/screens/public/LandingPage.tsx` — lido (estado atual, ~283 linhas)
- `.claude/worktrees/agent-ab3b2adc/index.html` — lido (versão antiga completa com todas as seções)

## Impacto por área

### Frontend

**Arquivo:** `src/screens/public/LandingPage.tsx`

**Novo estado local:**
- `faqOpen: number | null` — controla qual item do FAQ está aberto

**Queries existentes reutilizadas:**
- `avaliacoesQ` (já existe) — `media` e `totalAval` alimentam a stats strip

**Novos componentes inline (no mesmo arquivo):**
- `StatStrip` — faixa de stats
- `BentoGrid` — grid de features visuais
- `ComoFunciona` — 3 passos
- `FaqSection` — accordion
- `WhatsAppButton` — botão flutuante

**IDs de seção existentes (manter):**
- `id="funcionalidades"` — features section
- `id="avaliacoes"` — reviews section (condicional)
- `id="contato"` — footer

**Novos IDs de seção:**
- `id="como-funciona"` — seção de 3 passos
- `id="faq"` — seção de FAQ

**Nav atualizado (de 3 para 4 links):**
- Funcionalidades → `#funcionalidades`
- Como Funciona → `#como-funciona`
- FAQ → `#faq`
- Contato → `#contato`

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/public/LandingPage.tsx` — único arquivo

## Estratégia de implementação

### Etapa 1 — Atualizar imports e estado

Adicionar `useState` para FAQ (já importado). Verificar que `CheckCircle2` está no import (já está).

### Etapa 2 — Atualizar nav

Trocar os 3 links atuais por 4 links:
```
Funcionalidades | Como Funciona | FAQ | Contato
```

### Etapa 3 — Atualizar hero

Após o parágrafo de descrição, adicionar lista de benefícios:
```tsx
<ul className="mt-6 space-y-2">
  <li>✓ Abra e feche meses com saldo calculado automaticamente</li>
  <li>✓ Controle cartões, parcelas e recorrências em um lugar</li>
  <li>✓ Separe finanças pessoais das empresariais com perfis independentes</li>
  <li>✓ Visualize sua saúde financeira com relatórios e gráficos</li>
</ul>
```

Após o botão CTA, adicionar botão mobile:
```tsx
<a href="#login-panel" className="sm:hidden ...">
  Entrar na minha conta →
</a>
```

### Etapa 4 — Stats strip (nova seção após o grid hero/login)

Faixa horizontal com 4 itens separados por divisor vertical:
- `{Number(media).toFixed(1)}★` — avaliação média (dinâmica, fallback "—")
- `{totalAval}` — usuários avaliaram (dinâmico, fallback "")
- `Multi-empresa` — perfis separados
- `LGPD compliant` — dados protegidos

Remover os STATS cards do interior do hero (atualmente dentro da `<section>` hero como grid 2x4). A stats strip os substitui visualmente em posição melhor.

### Etapa 5 — Features Bento Grid (substituir grid simples atual)

Substituir o `<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">` atual por um bento grid com classes mistas. Layout:

```
[  Wide: Controle mensal + demo de entries  ] [  Cartões  ]
[  Reservas (progress bars)  ] [ Parcelas (pills) ] [ Multi-perfil ]
[  Wide: Relatórios + mini bar chart  ]
```

**Cards detalhados:**

1. **Wide — Controle mensal** (col-span-2):
   - Demo de "lançamentos do mês" com 2-3 linhas de entry simuladas (receita verde, despesa vermelha)
   - Saldo exibido em destaque

2. **Card — Cartões de crédito**:
   - Ícone CreditCard
   - Barra de limite "disponível / total" simulada

3. **Card — Reservas**:
   - Ícone PiggyBank (ou BookOpen)
   - 2 progress bars: ex. "Emergência 80%" e "Viagem 40%"

4. **Card — Parcelas e recorrências**:
   - Pills: "Netflix · jun", "Tênis 2/3 · jul", "Academia · ago"

5. **Card — Multi-empresa**:
   - 3 "avatares" com letras (empresa1, empresa2, +)
   - Copy: "Perfis financeiros independentes"

6. **Wide — Relatórios** (col-span-2):
   - Mini bar chart em JSX puro com 5 barras de alturas diferentes
   - Labels: Alimentação, Transporte, Casa, Lazer, Saúde

### Etapa 6 — Seção Como Funciona

```tsx
<section id="como-funciona" className="border-t border-white/8 py-14">
  // 3 steps em grid 3 colunas com conectores entre eles (→)
  // Step 1: Crie conta — Step 2: Configure perfis — Step 3: Registre lançamentos
</section>
```

### Etapa 7 — Seção FAQ

```tsx
<section id="faq" className="border-t border-white/8 py-14">
  // Accordion com 6 perguntas
  // State: faqOpen (index | null)
</section>
```

**6 perguntas:**
1. O IGen é gratuito?
2. Posso separar finanças pessoais das empresariais?
3. Como funciona o controle por mês?
4. O IGen acessa minha conta bancária?
5. Meus dados financeiros ficam seguros?
6. Posso usar em vários dispositivos ao mesmo tempo?

### Etapa 8 — WhatsApp flutuante

Fora do `<main>`, antes de `<TermosModal>`:
```tsx
<a
  href="https://wa.me/5549999554856"
  target="_blank"
  rel="noopener noreferrer"
  className="fixed bottom-6 right-6 z-50 flex h-13 w-13 items-center justify-center rounded-full bg-green-500 shadow-lg shadow-green-500/30 hover:bg-green-600 transition"
  aria-label="Falar via WhatsApp"
>
  {/* WhatsApp SVG icon */}
</a>
```

Usar SVG inline do WhatsApp (sem dependência de ícone — lucide não tem WhatsApp).

### Etapa 9 — Validação

```bash
npm run build
```

## Regras de negócio identificadas

- Stats strip usa dados dinâmicos: esconde rating se `totalAval === 0`
- FAQ abre um item por vez (fechar o atual ao abrir outro)
- Seção avaliações já é condicional — manter assim
- WhatsApp link usa formato internacional: `5549999554856`

## Regras multi-tenant e segurança

Não aplicável — landing page pública sem dados de tenant.

## Validações necessárias

- TypeScript: nenhum tipo novo; apenas `useState<number | null>`
- Visual: stats strip oculta rating quando API retorna 0 avaliações
- Acessibilidade: FAQ accordion com `aria-expanded` correto

## Testes necessários

### Frontend
- FAQ: clicar no mesmo item fecha; clicar em outro abre e fecha o anterior
- Nav links levam às seções corretas no DOM
- WhatsApp button abre link externo

### Backend / E2E
Não aplicável.

## Comandos de validação sugeridos

```bash
npm run build
```

## Riscos e pontos de atenção

- **Tamanho do arquivo**: crescerá de ~283 para ~650-750 linhas — aceitável para componente de página pública
- **SVG WhatsApp**: usar inline para não adicionar dependência; garantir acessibilidade com `aria-label`
- **Stats strip com avaliações**: se API retornar `totalAval = 0`, não exibir o item de rating para não mostrar "0 avaliações"
- **Bento grid responsivo**: o layout 2-col/1-col precisa colapsar corretamente em mobile — usar `sm:col-span-2` com cuidado

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- Nav tem 4 links (Funcionalidades, Como Funciona, FAQ, Contato) que rolam para seções existentes no DOM
- Stats strip exibe rating dinâmico (ou oculta se sem avaliações)
- Features bento grid tem 6+ cards com elementos visuais distintos (demo entries, progress bars, pills, mini chart)
- Seção Como Funciona renderiza 3 passos com conectores visuais
- FAQ exibe 6 perguntas com accordion funcional (um item aberto por vez)
- Botão WhatsApp fixo visível em todas as resoluções
- `npm run build` passa sem erros de TypeScript

## Observações para a skill implementar

- Arquivo único: `src/screens/public/LandingPage.tsx`
- Não alterar nenhum outro arquivo
- SVG do WhatsApp: usar o path oficial do ícone WhatsApp (viewBox="0 0 24 24")
- Mini bar chart: implementar como divs com altura variável via `style={{ height: '...' }}` ou classes Tailwind arbitrárias
- Remover os STATS cards do interior do hero ao criar a stats strip (evitar duplicação)
- Manter avaliações condicionais como estão
- Não executar migrations
- Seguir `/AGENT.md`
