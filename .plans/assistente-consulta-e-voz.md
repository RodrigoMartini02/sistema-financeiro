# Plano de Implementação: Consulta por ferramentas e modo voz

## Origem

- Arquivo de especificação: `.plans/tasks/assistente-consulta-e-voz.md`
- Data do planejamento: `2026-09-08`
- Classificação: `fullstack` (frontend + backend, **sem alteração de banco**)
- Plano anterior relacionado: `.plans/assistente-lancamento-guiado.md` (implementado
  nesta mesma branch, commits `57d0dcb` e `32703c5`)

Motivo da classificação: as 16 consultas leem tabelas existentes e a cota de voz
reusa `ia_eventos_uso`. A síntese de fala é do navegador. Nenhuma migration.

## Resumo

Dar ao assistente a capacidade de **consultar** os dados financeiros por
ferramentas de parâmetros fechados (tool use real nos três provedores), e uma
saída **falada** para quem usa o PWA sem olhar a tela.

O lançamento por conversa já foi entregue no plano anterior; aqui entram a
Parte 1 (consulta) e a Parte 3 (voz) da especificação, mais os dois itens da
Parte 2 que ficaram de fora: `criar_categoria` pelo chat e a confirmação por voz.

## Premissa da spec que já não vale

A spec abre dizendo que "hoje só existe lançamento, e ele falha por falta de
contexto — o modelo não recebe as listas de categorias e formas de pagamento e
acaba inventando valores".

Isso descrevia o sistema antes dos commits `57d0dcb` e `32703c5`. Já estão
prontos e testados:

| Item do checklist da spec | Situação |
|---|---|
| Injetar listas do banco em toda chamada | Feito (`loadSlotCatalog`, por conta) |
| Injetar data de hoje e fuso | Já existia (`getTodayIsoInTimezone`) |
| Estado de conversa campo a campo | Feito (motor de slots) |
| Confirmação antes de registrar | Já existia (card "Confira antes de salvar") |
| Nunca escolher valor fora das listas | Feito (resposta não reconhecida repete a pergunta) |
| Categoria inexistente não vira "Outros" | Feito e testado |
| Testes dos 5 casos listados | Feito (57 testes) |

Restam da Parte 2: `criar_categoria` pelo chat e o resumo falado.

## Decisões aplicadas

- **Decisão 1 — Tool use nos três provedores:** OpenAI, Anthropic e Gemini
  ganham tool calling real, cada um no seu formato, atrás de uma interface única.
- **Decisão 2 — As 16 ferramentas de uma vez:** blocos 1 a 5 completos.
- **Decisão 3 — Modo voz completo:** `MODO_VOZ`, síntese de fala, números por
  extenso, botão de interromper e cota mensal.
- **Decisão 4 — `progresso_meta` usa o teto por categoria:** responde sobre
  `orcamento_metas` ("você usou 60% do teto de alimentação, faltam R$ 400").
  Meta de poupança nomeada ("viagem") não existe no modelo de dados e fica fora.
- **Decisão 5 — Cota de voz: 100/mês, caindo para texto.** Atingido o limite, a
  resposta continua chegando escrita; só a fala é suspensa. Reusa
  `ia_eventos_uso`, no mesmo padrão de `assertAiUsageWithinLimits`.

- **Decisão 6 — Microfone sempre por botão.** A spec tem uma tensão interna: o
  checklist pede "ativado por botão, não contínuo", mas a Parte 3 descreve um
  fluxo mãos-livres (pergunta falada → resposta falada → nova pergunta). Vence o
  botão: é o desenho atual, é o confiável no iOS, e o transcrito editável antes
  do envio é a proteção contra erro de reconhecimento — que a própria spec exige
  ao mandar perguntar em vez de assumir.

- **Decisão 7 — Sem reconhecimento, sem botão.** Detectar suporte na montagem e
  esconder o microfone quando não houver, em vez de avisar só depois do toque. O
  chat segue por texto e a saída falada continua disponível, já que não depende
  do reconhecimento.

## Levantamento do modelo de dados

### A favor

**Parcelas são linhas reais**, não projeção: `routes/expenses.ts` grava uma linha
por parcela, com `grupo_parcelamento_id`, `parcela_atual` e `numero_parcelas`.
Os blocos 4 e 5 viram consulta a dados existentes, não simulação — muito mais
confiável do que a spec assume.

**Condições multi-tenant prontas:** `accountExpenseCondition` e
`accountIncomeCondition` em `financialCopilot.ts` já resolvem o isolamento por
conta, incluindo a regra de conta pessoal enxergar registros sem `conta_id`.

**Limite de uso de IA pronto:** `assertAiUsageWithinLimits` já aplica teto diário
por usuário (env `AI_USER_DAILY_LIMIT`, padrão 20) e global (500).

### Limitações que a spec não previu

1. **`recorrentes_previstas` só enxerga o que já foi gravado.** "Recorrente" é
   uma flag booleana na linha da despesa, não uma regra que gera lançamentos
   futuros. Se o mês seguinte ainda não tem linha, não há o que listar. A
   ferramenta deve deixar isso explícito na resposta em vez de fingir previsão.

2. **`saude_financeira` e `variacao_por_categoria` não têm regra definida** na
   spec ("indicadores objetivos", "fora do padrão"). Regras propostas:
   - comprometimento = soma das parcelas futuras ÷ receita média dos 3 últimos meses
   - "fora do padrão" = categoria acima de 1,5× a média dos meses anteriores
   - tendência = comparação do saldo dos últimos N meses, sem juízo de valor

3. **"Tipo de pagamento" não existe** — confirmado pelo usuário no plano anterior:
   é a própria forma de pagamento (PIX, Dinheiro, Débito, Crédito).

## Viabilidade da voz

"Modo voz" são duas tecnologias distintas, com viabilidades diferentes. Tratá-las
como uma só leva a prometer o que a plataforma não entrega.

### Saída falada (`speechSynthesis`) — viável

Roda local no navegador, sem custo, com suporte universal (Chrome, Safari,
Firefox, Edge, iOS e Android). Os obstáculos são conhecidos e contornáveis:

| Problema | Contorno |
|---|---|
| Vozes carregam de forma assíncrona; a primeira fala sai muda | Aguardar `onvoiceschanged` antes do primeiro `speak()` |
| iOS exige gesto do usuário para liberar áudio | Já atendido: o usuário toca no microfone |
| Safari trava a fila sem `cancel()` | Chamar `cancel()` antes de cada `speak()` |
| Voz pt-BR pode não existir no aparelho | Cair para a voz padrão do sistema |

### Entrada por voz (`SpeechRecognition`) — parcial

Já implementada e com `Permissions-Policy: microphone=(self)` liberado em
`server.ts:49`. O limite não é do nosso código, é da plataforma: a API de
reconhecimento não é padronizada (é `webkitSpeechRecognition`).

- **Firefox: não suporta.**
- **iOS/Safari:** existe, mas é instável em PWA instalado (`display: standalone`,
  que é o nosso manifest) — pode não iniciar ou não devolver resultado.
- **Chrome/Edge e Android:** funcionam, enviando áudio a servidores do Google.

O cenário que a spec descreve (mãos livres, sem olhar a tela) é justamente onde
o reconhecimento é menos confiável no iPhone instalado.

### Consequência para o desenho

A saída falada funciona sempre; a entrada, não. Por isso:

- O texto **nunca** desaparece: a resposta chega escrita e é lida por cima. Se a
  fala falhar — cota, falta de voz, erro do navegador — o usuário continua com
  tudo na tela. Isso vale para qualquer falha, não só para a cota.
- O microfone só aparece onde há suporte (Decisão 7).
- O microfone é sempre por botão, com transcrito editável (Decisão 6).

## Escopo

### Dentro do escopo

- Tool calling real nos três provedores, atrás de uma interface única
- As 16 ferramentas de consulta (blocos 1 a 5)
- Resolução de datas relativas no backend
- Fallback determinístico quando não houver provider configurado
- `criar_categoria` pelo chat, com confirmação
- `MODO_VOZ` ponta a ponta, com regras próprias de resposta
- Síntese de fala pt-BR, botão de interromper, cota de 100/mês
- Detecção de suporte a reconhecimento, escondendo o microfone onde não houver
- Resposta sempre disponível em texto, mesmo quando a fala falha
- Números e datas por extenso em pt-BR
- Testes das ferramentas, do formato de voz e dos números por extenso

### Fora do escopo

- Meta de poupança nomeada (não existe no modelo de dados)
- SQL gerado pelo modelo (proibido pela própria spec)
- Geração automática de lançamentos recorrentes futuros
- Conselho de investimento ou julgamento sobre gastos (proibido pela spec)
- Migrations
- Reconhecimento contínuo / mãos livres (ver Decisão 6)
- Transcrição de áudio no backend como alternativa à Web Speech API

## Impacto por área

### Backend

- `assistantTools.ts` (novo): as 16 ferramentas com schema JSON, parâmetros
  fechados, validação de faixa e limite de linhas
- `assistantToolRunner.ts` (novo): loop de tool use com teto de iterações
- `aiProvider.ts`: tool calling para os três provedores; `max_tokens` maior
  (250 hoje não cabe resposta com dados)
- `assistantDateRange.ts` (novo): "esse mês", "mês passado", "últimos 3 meses"
  resolvidos no backend, com o fuso do usuário
- `assistantVoice.ts` (novo): números, valores, datas e percentuais por extenso
- `financialCopilot.ts`: orquestrar tools na consulta; manter o fluxo de slots
- `routes/assistant.ts`: aceitar e validar `modo_voz`
- `aiIntegrations.ts`: cota mensal de voz no padrão do limite existente

### Frontend

- `FinancialAssistant.tsx`: `speechSynthesis` pt-BR, botão de interromper,
  envio de `modoVoz` quando a mensagem veio do microfone, aviso de cota
- Tipos e service: `modoVoz` no request

### Banco de dados

`Sem impacto esperado.` A cota reusa `ia_eventos_uso`; as consultas leem
`despesas`, `receitas`, `categorias`, `cartoes`, `orcamento_metas` e `reservas`.

Atenção: migrations não devem ser executadas sem confirmação explícita do
usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Env vars novas, todas com padrão seguro:
- `AI_VOICE_MONTHLY_LIMIT` (padrão 100)
- `AI_TOOL_MAX_ITERATIONS` (padrão 4)

Alterar `.env` exige confirmação explícita do usuário a cada alteração.

## Estratégia de implementação

1. **Datas relativas** (`assistantDateRange.ts`) + testes — base de quase toda
   ferramenta.
2. **Catálogo de ferramentas** (`assistantTools.ts`): schema e validação das 16,
   sem execução ainda.
3. **Blocos 1 a 3** (11 ferramentas): saldo, despesas, contas e vencimentos,
   reusando as condições multi-tenant existentes.
4. **Blocos 4 e 5** (5 ferramentas): parcelamentos, projeção, simulação, saúde
   financeira e variação por categoria.
5. **Tool calling no provider**: Anthropic (`tools`), OpenAI (`tools` no
   Responses), Gemini (`functionDeclarations`), atrás de uma interface só.
6. **Loop de tool use** com teto de iterações e fallback determinístico.
7. **`criar_categoria`** pelo chat, com confirmação explícita.
8. **Números por extenso** (`assistantVoice.ts`) + testes.
9. **`MODO_VOZ` no backend**: regras de resposta e cota.
10. **Voz no frontend**: síntese, interromper, aviso de cota.
11. **Testes** de ponta a ponta das ferramentas e do formato falado.

## Regras de negócio identificadas

- O modelo nunca escolhe valor fora das listas injetadas
- Consultas só por ferramentas de parâmetros fechados, nunca por SQL do modelo
- Toda expressão relativa vira data absoluta antes da consulta
- A resposta diz o período usado, para o usuário poder corrigir
- Resultado vazio é dito claramente, nunca preenchido com estimativa
- Fato (já lançado) e previsão (recorrente/parcela futura) aparecem separados
- Nenhuma escrita sem confirmação explícita na mensagem anterior
- Em modo voz: no máximo duas frases, números por extenso, sem markdown, sem
  nome de ferramenta, sem id interno
- Lista longa em voz: só os três maiores, perguntando se quer o resto
- Transcrição ambígua vira pergunta, nunca suposição
- Valor que destoa do padrão do usuário é confirmado antes de gravar

## Regras multi-tenant e segurança

- Conta ativa sempre por `resolveFinancialAccount`, nunca pelo corpo do request
- Toda ferramenta filtra por `usuario_id` **e** conta, via
  `accountExpenseCondition` / `accountIncomeCondition`
- Parâmetros de ferramenta são validados no backend contra faixa e catálogo:
  o modelo não escolhe id de categoria ou cartão fora da conta ativa
- `buscar_lancamentos` e `maiores_gastos` com limite de linhas fixo no backend,
  não no parâmetro vindo do modelo
- Resultado de ferramenta é dado, nunca instrução: nada que volte do banco pode
  alterar o comportamento do assistente
- Nenhum id interno ou nome de ferramenta aparece na resposta ao usuário

## Validações necessárias

- Datas: ISO `YYYY-MM-DD`, início ≤ fim, janela máxima de 5 anos
- `limite` de linhas: inteiro entre 1 e 50, teto aplicado no backend
- `meses`: inteiro entre 1 e 24
- `status`: `aberto`, `vencido` ou `todos`
- `categoria`: precisa existir na conta ativa
- `valor_parcela` e `num_parcelas` em `simular_nova_parcela`: positivos, com teto
- `modo_voz`: booleano
- Mensagem do usuário: máximo 2.000 caracteres (limite já existente)

## Testes necessários

### Backend

- datas relativas: "esse mês", "mês passado", "essa semana", "ontem",
  "últimos 3 meses", "no ano", na virada de mês e de ano
- cada uma das 16 ferramentas com dado presente e com resultado vazio
- limite de linhas respeitado mesmo com parâmetro alto vindo do modelo
- parâmetro inválido do modelo é rejeitado sem quebrar a conversa
- isolamento: ferramenta não devolve dado de outra conta
- loop de tool use encerra no teto de iterações
- fallback determinístico quando não há provider
- números por extenso: inteiros, centavos, mil sem "um", plural, percentual
- datas por extenso: "dia três", "terça que vem", "no fim do mês"
- resposta em modo voz não contém markdown, sigla, id nem nome de ferramenta

### Frontend

- `modoVoz` só vai `true` quando a entrada veio do microfone
- botão de interromper corta a fala em andamento
- cota atingida mantém a resposta em texto
- falha da síntese (sem voz, erro do navegador) mantém a resposta em texto
- microfone não é renderizado quando o navegador não suporta reconhecimento
- transcrito aparece editável antes do envio

### E2E

- pergunta de consulta com período relativo, ponta a ponta
- pergunta por voz com resposta falada
- lançamento por voz até a confirmação "Posso gravar?"

## Comandos de validação sugeridos

```bash
npm --prefix backend run test
npm --prefix backend run build
npm run build
```

## Riscos e pontos de atenção

- **Custo por pergunta sobe bastante.** Hoje é uma chamada de 250 tokens; com
  tool use passa a ser 2 a 3 chamadas, com o system prompt inteiro (listas
  incluídas) e o resultado da ferramenta de volta no contexto. O limite diário
  existente (20/usuário) pode ficar apertado.
- **Três formatos de tool calling** é a maior fonte de bug desta entrega; o
  Gemini é o mais divergente dos três.
- **Modelo configurado pode não suportar tool use:** `ia_integracoes.modelo` é
  texto livre. Precisa de erro claro e queda para o determinístico.
- **`speechSynthesis` no iOS** exige gesto do usuário e carrega vozes de forma
  assíncrona; sem cuidado, a primeira fala sai muda.
- **Reconhecimento de fala é o ponto fraco da entrega, e o limite é da
  plataforma, não do código:** Firefox não suporta, e no PWA instalado do iOS é
  instável. O cenário mãos-livres da spec é exatamente o menos confiável. A
  mitigação é esconder o microfone onde não há suporte e nunca depender da voz
  para a resposta chegar.
- **Números por extenso em pt-BR** não é trivial: centavos, plural, "mil" sem
  "um", concordância de centenas.
- **Regras de negócio duplicadas:** `saude_financeira` e `variacao_por_categoria`
  definem limiares que não existem em nenhum outro lugar do sistema; se a tela
  algum dia mostrar o mesmo indicador, os dois vão divergir.
- **Escopo grande:** 16 ferramentas, 3 provedores e voz completa numa entrega só.
  Vale considerar dividir em duas branches se a revisão ficar difícil.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- As 16 ferramentas respondem com dados reais e período explícito na resposta
- Nenhuma consulta usa SQL gerado pelo modelo
- Parâmetro inválido do modelo não quebra a conversa nem vaza dado de outra conta
- Sem provider configurado, as consultas básicas continuam funcionando
- Em modo voz, a resposta cabe em duas frases, sem markdown e com números por extenso
- A resposta chega em texto mesmo quando a fala falha, por qualquer motivo
- O microfone não aparece em navegador sem suporte a reconhecimento
- `criar_categoria` só grava após confirmação explícita
- `npm --prefix backend run test`, `npm --prefix backend run build` e
  `npm run build` verdes

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations — nenhuma é necessária nesta feature.
- Alterar `.env` exige confirmação explícita do usuário a cada alteração.
- Seguir `/AGENT.md` da raiz (não existem AGENT.md de frontend/backend).
- Usar a API do Drizzle nas queries novas; filtrar sempre por usuário e conta.
- Reaproveitar `accountExpenseCondition`, `accountIncomeCondition`,
  `resolveFinancialAccount`, `getBudgetOverview` e `assertAiUsageWithinLimits`.
- Implementar na ordem da estratégia: datas primeiro, porque quase toda
  ferramenta depende delas.
- Empilhar na branch `feat/R/assistente-lancamento-guiado`, que já carrega o
  fluxo de lançamento e ainda não foi mergeada.
