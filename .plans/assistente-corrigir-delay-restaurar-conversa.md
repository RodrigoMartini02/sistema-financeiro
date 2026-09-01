# Plano de Implementação: Eliminar delay ao restaurar a última conversa do Assistente Financeiro

## Origem

- Arquivo de especificação: conversa com o usuário (feedback sobre delay perceptível ao abrir o chat)
- Data do planejamento: `2026-09-01`
- Classificação: `frontend-only`

## Resumo

Ao abrir o Assistente Financeiro, o usuário vê primeiro a mensagem de boas-vindas padrão ("Olá, Rodrigo! Como posso te ajudar?") e, alguns instantes depois, o conteúdo é trocado pela última conversa restaurada — um "pulo" visível de conteúdo. A causa raiz é que a busca da lista de conversas (`conversationsQuery`, `queryKeys.copilotConversations`) só é disparada quando o chat é aberto (`enabled: open`), então a restauração da última conversa (que depende dessa busca) só começa depois do clique do usuário, gerando o delay perceptível.

Este plano remove o `enabled: open` dessa query, fazendo a busca da lista de conversas começar assim que o componente `FinancialAssistant` monta (globalmente, em toda tela do app, já que ele é renderizado no `AppShell` fora do modo demo) — não apenas quando o usuário abre o chat. Na maioria das vezes, quando o usuário clicar para abrir o assistente, a lista já estará em cache e a restauração da última conversa ocorrerá sem delay perceptível.

## Escopo

### Dentro do escopo

- Remover `enabled: open` de `conversationsQuery` em `FinancialAssistant.tsx`, fazendo a busca da lista de conversas iniciar na montagem do componente, não apenas ao abrir o chat.
- Nenhuma outra mudança de comportamento — a lógica de restauração da última conversa (`useEffect` que chama `restoreConversation`) permanece igual, apenas passa a ter os dados disponíveis mais cedo.

### Fora do escopo

- Mudança de layout/posicionamento do assistente (ex.: formato compacto no header) — tratado como proposta separada, não faz parte deste plano.
- Adicionar estado de loading/skeleton para o caso raro em que a busca ainda não tenha completado quando o usuário abrir o chat — decisão do usuário de resolver apenas antecipando a busca, sem loading adicional.
- Buscar a lista de conversas apenas uma vez após autenticação (em vez de a cada montagem do componente) — alternativa considerada e descartada pelo usuário em favor da abordagem mais simples.
- Qualquer mudança em `categoriesQuery`/`dashboardQuery` (outras queries do mesmo componente, que continuam com `enabled: open`).

## Leitura de contexto

- `/AGENT.md`, `sistema financas/CLAUDE.md` — sequência obrigatória `/planejar → aprovação → /implementar → /finalizar`.
- Não há `frontend/AGENT.md`/`backend/AGENT.md` dedicados.
- `src/components/financial-assistant/FinancialAssistant.tsx`:
  - `conversationsQuery` (linhas ~300-305) — query a alterar.
  - `restoreConversation` (linhas 449-470) — busca as mensagens da conversa restaurada, sem mudança necessária.
  - `useEffect` de restauração automática (linhas 483-487) — depende de `conversationsQuery.data`, sem mudança necessária na lógica, só se beneficia dos dados chegarem mais cedo.
  - `open` (estado local, inicia `false` exceto em modo `standalone`) — controla hoje o `enabled` de `categoriesQuery`, `dashboardQuery` e `conversationsQuery`.
- `src/layout/AppShell.tsx:363` — `<FinancialAssistant />` é montado globalmente em toda tela do app (fora do modo demo), confirmando que a busca antecipada rodará em toda navegação, não apenas quando o assistente for aberto.
- `src/services/queryKeys.ts` — `queryKeys.copilotConversations`, já usada, sem necessidade de nova key.

## Impacto por área

### Frontend

- `src/components/financial-assistant/FinancialAssistant.tsx`:
  - `conversationsQuery`: remover `enabled: open`, mantendo `staleTime: 30_000` (evita refetch repetido em navegações próximas).
  - Nenhuma outra mudança de código — `restoreConversation`, o `useEffect` de auto-restauração e a UI da lista de histórico continuam iguais.
- Efeito colateral aceito e confirmado com o usuário: a query de lista de conversas passa a rodar em toda montagem do `FinancialAssistant` (ou seja, em praticamente toda tela do app, já que ele é global), mesmo que o usuário nunca abra o chat naquela sessão — trade-off aceito em troca de eliminar o delay percebido ao abrir.
- Sem novos estados de loading/error além dos já existentes.
- Sem testes automatizados nesta área do projeto — validação manual obrigatória.

### Backend

`Sem impacto esperado` — nenhuma rota alterada, apenas o momento em que o frontend a consulta.

### Banco de dados

`Sem impacto esperado`. Nenhuma migration necessária.

## Arquivos provavelmente afetados

- `sistema financas/src/components/financial-assistant/FinancialAssistant.tsx`

## Estratégia de implementação

1. Em `FinancialAssistant.tsx`, remover a propriedade `enabled: open` do objeto de configuração de `conversationsQuery`.
2. Rodar `npx tsc --noEmit` e `npm run build`.
3. Validação manual: navegar pelo app sem abrir o assistente e confirmar (via aba de rede do navegador) que a requisição de conversas já ocorre antes do clique; abrir o assistente e confirmar que a última conversa aparece imediatamente, sem a mensagem de boas-vindas piscando antes; testar em uma sessão nova (sem cache) para confirmar que, mesmo se a requisição ainda estiver em voo no primeiro clique, o comportamento não regride (mostra a mensagem padrão até os dados chegarem, como já acontece hoje).

## Regras de negócio identificadas

- A última conversa só é restaurada automaticamente na primeira vez que o chat é aberto em uma sessão (`hasRestoredLatest`), e apenas se não houver nenhuma mensagem além da inicial (`messages.length !== 1`) — essa regra não muda, só o momento em que os dados necessários ficam disponíveis.

## Regras multi-tenant e segurança

Projeto não é multi-tenant; sem isolamento de tenant a considerar. A mudança não expõe dados novos — apenas antecipa uma busca que já ocorria, para um usuário que já está autenticado.

## Validações necessárias

Nenhuma validação de input nova — mudança de timing de uma query já existente.

## Testes necessários

### Frontend

Não há suíte de testes automatizados nesta área do projeto — validação manual obrigatória, conforme detalhado no passo 3 da estratégia de implementação.

### Backend

`Sem impacto esperado`.

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
cd "sistema financas"
npx tsc --noEmit
npm run build
```

## Riscos e pontos de atenção

- A busca de conversas passa a rodar em toda tela do app (não só ao abrir o assistente) — é uma requisição leve e cacheada por 30 segundos, mas representa mais tráfego de rede constante; efeito colateral já discutido e aceito pelo usuário.
- Se o usuário abrir o assistente muito rapidamente após o carregamento da página (antes da requisição completar), o delay ainda pode ocorrer nesse caso específico — a mudança reduz a frequência do problema, não o elimina em 100% dos casos, já que não foi solicitado nenhum estado de loading adicional para cobrir esse cenário raro.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisões já confirmadas com o usuário (buscar mais cedo sem loading adicional, aceitar a requisição extra em toda navegação, redesign de layout tratado separadamente).

## Critérios de aceite do plano

- A lista de conversas do assistente é buscada assim que o componente `FinancialAssistant` monta, não apenas quando o chat é aberto.
- Ao abrir o assistente em uma sessão normal de uso (não a primeira requisição da página), a última conversa aparece sem a mensagem de boas-vindas piscando antes.
- Nenhuma outra funcionalidade do assistente é alterada.
- `npx tsc --noEmit` e `npm run build` passam sem erros novos.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir `sistema financas/CLAUDE.md` (sequência `/planejar → aprovação → /implementar → /finalizar`).
- Não implementar o redesign de layout (formato compacto no header) — fora do escopo deste plano.
- Não adicionar estado de loading/skeleton — fora do escopo, conforme decisão do usuário.
- Nenhuma migration ou alteração de `.env` é necessária ou permitida neste plano.
