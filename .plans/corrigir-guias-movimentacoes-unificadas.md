# Plano de Implementacao: Corrigir Guias na Tela Unificada de Movimentacoes

## Origem

- Arquivo de especificacao: resumo/diagnostico informado no chat em 2026-08-10
- Contexto relacionado:
  - `.plans/reorganize-monthly-movements-and-reserves.md`
  - `.plans/corrigir-e-redesenhar-sistema-guias-primeiro-acesso.md`
  - `.plans/correcao-posicionamento-baloes-guia.md`
- Data do planejamento: `2026-08-10`
- Classificacao: `frontend-only`

## Resumo

Corrigir a regressao causada pela unificacao da tela mensal em `Movimentacoes`. A tela passou a renderizar `ReceitasScreen` e `DespesasScreen` sempre com `embedded=true`, deixando headers antigos escondidos com `display:none`; alguns guias de primeiro acesso continuam registrados nesses headers invisiveis e disputam o slot unico do coordenador global, enquanto os botoes reais de `MovimentacoesScreen.tsx` nao possuem guias associados.

A implementacao deve desativar os guias cujo alvo esta oculto em modo embedded e religar os guias equivalentes aos botoes realmente visiveis na tela de `Movimentacoes`, preservando o mecanismo atual de portal, z-index, coordenacao e persistencia por `localStorage`.

## Escopo

### Dentro do escopo

- Adicionar suporte a habilitacao condicional no hook `useFirstAccessGuide`, preservando a assinatura atual para chamadas existentes.
- Impedir que guias ancorados em headers ocultos de `ReceitasScreen` e `DespesasScreen` registrem elegibilidade quando `embedded=true`.
- Manter ativos os guias internos de tabelas, filtros, busca, contratos, lote e acoes que continuam visiveis em modo embedded.
- Adicionar guias aos controles reais do header de `MovimentacoesScreen.tsx`:
  - `Nova receita`
  - `Nova despesa`
  - `Fechar/Reabrir mes`
  - `Movimentar reserva`
- Reutilizar scopes e mensagens existentes quando o comportamento for equivalente, para manter historico de dismiss por perfil.
- Criar nova mensagem apenas se a copy existente nao servir para o contexto do botao visivel.
- Validar por build e revisar o diff para confirmar que nao ha guias invisiveis concorrendo no coordenador.

### Fora do escopo

- Reabrir a arquitetura de portal, posicionamento, z-index ou overflow dos baloes.
- Alterar a ordem global de prioridade do `FirstAccessGuideProvider`.
- Criar um sistema novo de onboarding ou analytics.
- Alterar backend, banco de dados, rotas, migrations ou regras financeiras.
- Refatorar a unificacao de `Movimentacoes` alem do necessario para os guias.
- Validar visualmente todos os demais usos de guias fora da tela de `Movimentacoes`, exceto por regressao evidente no codigo tocado.

## Leitura de contexto

- `/AGENT.md`
- `/CLAUDE.md`
- `sistema financas/AGENT.md`
- `.plans/reorganize-monthly-movements-and-reserves.md`
- `.plans/corrigir-e-redesenhar-sistema-guias-primeiro-acesso.md`
- `.plans/correcao-posicionamento-baloes-guia.md`
- `sistema financas/src/screens/finance/MovimentacoesScreen.tsx`
- `sistema financas/src/screens/receitas/ReceitasScreen.tsx`
- `sistema financas/src/screens/despesas/DespesasScreen.tsx`
- `sistema financas/src/hooks/useFirstAccessGuide.ts`
- `sistema financas/src/context/FirstAccessGuideContext.tsx`
- `sistema financas/src/components/FirstAccessGuideCard.tsx`
- `sistema financas/src/components/firstAccessGuideMessages.ts`
- `sistema financas/package.json`

## Impacto por area

### Frontend

O impacto e restrito ao fluxo de primeiro acesso na tela unificada de movimentacoes.

`useFirstAccessGuide` deve aceitar uma opcao opcional de habilitacao, por exemplo `useFirstAccessGuide(scope, { enabled })`, com `enabled=true` como padrao. Quando `enabled=false`, o hook nao deve registrar o scope no coordenador global e deve retornar `isVisible=false`, sem marcar o guia como dismissed.

`ReceitasScreen` e `DespesasScreen` devem usar essa opcao apenas nos guias que pertencem ao header antigo escondido por `embedded=true`:

- `receitas:novo-v1`
- `despesas:novo-v1`
- `despesas:fechar-mes-v1`

Os demais guias dessas telas devem continuar funcionando no modo embedded, pois seus alvos continuam visiveis na tabela ou cards internos:

- `receitas:busca-v1`
- `receitas:contratos-faturamento-v1`
- `despesas:filtros-v1`
- `despesas:lote-v1`
- `despesas:pagar-selecionadas-v1`
- `despesas:mover-mes-v1`

`MovimentacoesScreen.tsx` deve importar `FirstAccessGuideCard`, `firstAccessGuideMessages` e `useFirstAccessGuide`, criar os guias equivalentes e ancorar os baloes em wrappers `relative` ao redor dos botoes reais do header.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado. Nenhuma migration deve ser criada ou executada.

### Infra/Deploy

Sem impacto esperado. Nenhuma variavel de ambiente, job, CI/CD ou configuracao de deploy deve ser alterada.

## Arquivos provavelmente afetados

- `sistema financas/src/hooks/useFirstAccessGuide.ts`
- `sistema financas/src/screens/finance/MovimentacoesScreen.tsx`
- `sistema financas/src/screens/receitas/ReceitasScreen.tsx`
- `sistema financas/src/screens/despesas/DespesasScreen.tsx`
- `sistema financas/src/components/firstAccessGuideMessages.ts` somente se for necessaria uma mensagem especifica para `Movimentar reserva`

## Estrategia de implementacao

1. Atualizar `useFirstAccessGuide` para aceitar um segundo parametro opcional com `enabled?: boolean`.
2. Garantir que `enabled=false` faca o hook:
   - nao registrar o scope no `FirstAccessGuideProvider`;
   - remover registro anterior se o valor mudar de `true` para `false`;
   - retornar `isVisible=false`;
   - preservar `dismiss` e leitura/escrita do `localStorage` sem marcar dismissed automaticamente.
3. Em `ReceitasScreen`, passar `enabled: !embedded` apenas para o guia `receitas:novo-v1`.
4. Em `DespesasScreen`, passar `enabled: !embedded` para os guias `despesas:novo-v1` e `despesas:fechar-mes-v1`.
5. Em `MovimentacoesScreen`, criar hooks para os scopes visiveis no header:
   - `receitas:novo-v1`
   - `despesas:novo-v1`
   - `despesas:fechar-mes-v1`
   - `reservas:movimentar-v1`
6. Envolver cada botao real que precisa de guia com um wrapper `relative`, mantendo layout visual igual.
7. Renderizar `FirstAccessGuideCard` com `floating`, `placement` e largura seguindo os padroes atuais do projeto.
8. Reutilizar mensagens existentes:
   - `firstAccessGuideMessages.receitasNova`
   - `firstAccessGuideMessages.despesasNova`
   - `firstAccessGuideMessages.despesasFecharMes`
   - `firstAccessGuideMessages.reservasMovimentar` ou uma nova mensagem se o texto ficar inadequado ao contexto de botao global.
9. Revisar se nenhum guia oculto por `embedded=true` continua elegivel no coordenador.
10. Rodar validacoes e revisar o diff.

## Regras de negocio identificadas

- A tela `Movimentacoes` e o ponto principal de trabalho mensal para criar receitas, criar despesas, fechar/reabrir mes e movimentar reservas.
- Guias devem aparecer apenas quando o elemento orientado esta presente e visivel ao usuario.
- Nunca mais de um guia deve ficar visivel ao mesmo tempo, respeitando o `FirstAccessGuideProvider` existente.
- Dismiss continua sendo por scope e perfil ativo no `localStorage`.
- O modo embedded de Receitas/Despesas deve preservar guias de funcionalidades ainda visiveis na tabela.

## Regras multi-tenant e seguranca

Nao aplicavel a esta alteracao, pois e uma mudanca de frontend/UX sem novas queries, endpoints, permisssoes, payloads ou persistencia no backend.

Mesmo assim, preservar a regra atual de escopo por perfil no `localStorage`:

- `fingerence:first-access-guide:{perfilAtivoId|global}:{scope}`

## Validacoes necessarias

- `enabled=false` no hook nao registra scope no coordenador global.
- Ao alternar `embedded`, o hook registra/desregistra corretamente sem deixar scope preso em `eligible`.
- Guias de `Nova receita`, `Nova despesa`, `Fechar/Reabrir mes` e `Movimentar reserva` aparecem na tela `Movimentacoes` apenas quando seus scopes estao ativos e nao dismissed.
- Guias internos de Receitas/Despesas continuam aptos em modo embedded quando seus alvos estao visiveis.
- Nenhum guia ancorado em `display:none` compete pelo slot unico.
- Dismiss continua persistindo no `localStorage` por perfil.

## Testes necessarios

### Frontend

- Rodar build TypeScript/Vite.
- Validar no navegador a tela `Movimentacoes` em modo lista:
  - header com guias nos botoes visiveis;
  - alternancia Receitas/Despesas sem guias invisiveis;
  - guia de busca de receitas ainda aparece quando ha receitas;
  - guia de filtros/lote de despesas ainda aparece quando ha despesas elegiveis.
- Validar que um scope dismissed nao reaparece ao alternar entre Movimentacoes, Receitas embedded e Despesas embedded.

### Backend

Nao aplicavel.

### E2E

Nao ha suite E2E identificada para este fluxo. Validacao visual/manual recomendada.

## Comandos de validacao sugeridos

```bash
npm --prefix "sistema financas" run build
git -C "sistema financas" diff --check
```

## Riscos e pontos de atencao

- Reutilizar scopes existentes preserva dismiss, mas tambem significa que dispensar o guia em `Movimentacoes` dispensara o mesmo guia em telas/fluxos equivalentes.
- Se o hook for alterado sem cuidado, um scope pode ficar registrado no coordenador apos `enabled` mudar para `false`.
- A ordem entre guias de mesma prioridade ainda depende da ordem de registro do `Set` no provider atual; este plano nao altera essa politica.
- Build nao garante posicionamento visual perfeito, entao a validacao manual da tela e importante.
- Ha uma alteracao nao relacionada no worktree (`.plans/corrigir-scroll-horizontal-mobile.md`); nao tocar nem reverter.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Criterios de aceite do plano

A implementacao deve ser considerada pronta quando:

- `MovimentacoesScreen.tsx` exibe guias nos botoes reais de `Nova receita`, `Nova despesa`, `Fechar/Reabrir mes` e `Movimentar reserva`.
- Guias dos headers antigos de Receitas/Despesas nao entram no coordenador quando as telas estao em `embedded=true`.
- Guias internos de tabela/filtro/busca/lote continuam funcionando em modo embedded.
- O hook preserva compatibilidade com todas as chamadas existentes sem segundo parametro.
- Dismiss por perfil continua funcionando.
- `npm --prefix "sistema financas" run build` passa.
- `git -C "sistema financas" diff --check` passa.
- Nenhum arquivo fora do escopo e alterado.

## Observacoes para a skill implementar

- Usar este plano como fonte principal de contexto.
- Nao reimplementar portal, z-index ou posicionamento global dos baloes; esse mecanismo ja foi corrigido anteriormente.
- Nao alterar backend, banco, `.env`, migrations, deploy, commit ou push nesta etapa.
- Seguir `/AGENT.md`, `/CLAUDE.md` e `sistema financas/AGENT.md`.
- Antes de editar codigo, confirmar que o usuario pediu `/implementar` ou aprovou explicitamente a implementacao.
- Manter alteracoes pequenas e focadas nos guias da tela unificada de `Movimentacoes`.
