# Plano de Implementação: Eixo Y responsivo no gráfico "Despesas por categoria"

## Origem

- Arquivo de especificação: conversa direta com o usuário (follow-up da entrega `pwa-mobile-first-sistema-financas`)
- Data do planejamento: `2026-08-08`
- Classificação: `frontend-only`

## Resumo

Após a entrega do PWA mobile-first, uma revisão do Painel (`FinanceDashboard.tsx`) identificou que o gráfico de barras "Despesas por categoria" usa `YAxis width={120}` fixo em px. Em telas de smartphone (320-375px), esse eixo fixo consome uma fração desproporcional da largura útil do gráfico, deixando as barras espremidas. Este plano ajusta essa largura para ser responsiva, mantendo 120px em desktop e reduzindo em telas estreitas.

## Escopo

### Dentro do escopo

- Tornar a largura do `YAxis` do gráfico "Despesas por categoria" responsiva (menor em mobile, 120px em desktop)

### Fora do escopo

- Qualquer outro gráfico ou tela (já cobertos na entrega anterior ou fora do problema identificado)
- Mudança de dados, cores, ou lógica de agregação do gráfico
- Mudança de biblioteca de gráficos (permanece Recharts)

## Leitura de contexto

- `AGENT.md` e `CLAUDE.md` da raiz de `sistema financas/` (seção multi-tenant/RLS não aplicável a este domínio, conforme já registrado no plano anterior)
- `src/screens/finance/FinanceDashboard.tsx` (já lido integralmente na investigação anterior desta sessão)

## Impacto por área

### Frontend

- `src/screens/finance/FinanceDashboard.tsx`: o `<YAxis type="category" dataKey="name" width={120} .../>` (dentro do `BarChart` do card "Despesas por categoria", ~L491) passa a receber uma largura calculada em runtime: `84` em telas estreitas, `120` a partir do breakpoint `sm` (640px).
- Implementação técnica: como a prop `width` do `YAxis` do Recharts é numérica (não aceita classes Tailwind), a leitura do breakpoint deve ser feita via `window.matchMedia('(min-width: 640px)')` com um hook simples (`useState` + `useEffect` com listener de `resize`/`change` do `matchMedia`), evitando dependência nova.
- Sem impacto em hooks de dados, query keys, ou lógica de negócio — mudança isolada de apresentação.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/finance/FinanceDashboard.tsx`

## Estratégia de implementação

1. Em `FinanceDashboard.tsx`, adicionar um hook local (ou pequena função inline com `useState`/`useEffect`) que retorna `84` quando a viewport for menor que `640px` e `120` caso contrário, reagindo a mudanças de tamanho de tela (rotação de dispositivo, redimensionamento de janela).
2. Substituir o valor fixo `width={120}` do `YAxis` por esse valor dinâmico.
3. Validar visualmente (ou via build) que não há regressão em desktop (deve permanecer 120px) e que os rótulos de categoria continuam legíveis/truncados corretamente pelo Recharts em mobile.

## Regras de negócio identificadas

Nenhuma — mudança é puramente de apresentação/layout.

## Regras multi-tenant e segurança

Não aplicável — mudança isolada de UI, sem leitura/escrita de dados sensíveis ou lógica de permissão.

## Validações necessárias

Nenhuma validação de schema/input é alterada.

## Testes necessários

### Frontend

- Testes manuais em 320px, 375px, 414px e desktop (≥1024px) no card "Despesas por categoria" do Painel: confirmar que o eixo Y ocupa menos espaço em mobile e que as barras têm mais área útil, sem overflow.
- Confirmar que em desktop o comportamento permanece idêntico ao atual (120px).

### Backend

Não aplicável.

### E2E

Não aplicável — sem suíte de testes automatizados configurada no projeto.

## Comandos de validação sugeridos

```bash
npm run build
```

## Riscos e pontos de atenção

- Baixo risco: mudança isolada em uma única prop de um único gráfico.
- Recharts recalcula `ResponsiveContainer` automaticamente — não há risco de overflow horizontal, apenas risco estético caso a largura mínima escolhida (84px) corte rótulos de categoria de forma pouco legível. Ajustável facilmente se necessário após validação visual.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — largura mínima de 84px em mobile aprovada.

## Critérios de aceite do plano

- Em telas de 320-414px, o gráfico "Despesas por categoria" exibe o eixo Y com largura reduzida (84px), liberando mais espaço para as barras.
- Em desktop (≥640px), o comportamento é idêntico ao atual (120px), sem regressão visual.
- `npm run build` passa sem erros de TypeScript.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir `AGENT.md`/`CLAUDE.md` da raiz de `sistema financas/`, desconsiderando as seções multi-tenant/RLS.
- Mudança pequena e focada — não expandir escopo para outros gráficos ou telas.
- Criar branch de feature nova (`fix/R/dashboard-grafico-categoria-mobile` ou equivalente), já que a branch anterior (`feat/R/pwa-mobile-first`) já foi mergeada em `main`.
- Não executar migrations (não aplicável).
