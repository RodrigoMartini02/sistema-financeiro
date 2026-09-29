# Plano de Implementação: Correções de Segurança Críticas — Sistema Financeiro

## Origem

- Arquivo de especificação: `não fornecido; pedido direto no chat, a partir de auditoria completa do sistema de finanças feita nesta conversa (agentes de investigação + verificação manual do código real)`
- Data do planejamento: `2026-07-12`
- Classificação: `backend-only`

## Resumo

Corrigir 3 falhas de segurança confirmadas por leitura direta do código: (1) qualquer usuário autenticado pode se auto-ativar um plano pago sem pagar (`plans.ts`), (2) o webhook do PayPal ativa plano para qualquer usuário sem verificar se o pagamento é real (`paypal.ts`), (3) é possível cancelar receitas futuras de contrato de outra conta antes da checagem de dono acontecer (`contracts.ts`).

## Escopo

### Dentro do escopo

1. **`plans.ts:358`** — adicionar `requireAdmin` na rota `POST /api/plans/activate`, restringindo a ativação manual a admin/master.
2. **`paypal.ts:131`** — reescrever o webhook para, ao receber o evento `PAYMENT.CAPTURE.COMPLETED`, buscar os dados reais da captura direto na API da PayPal (`GET /v2/payments/captures/{id}`, reaproveitando `getAccessToken()`) e só ativar o plano com base nesses dados reconsultados — mesmo padrão já usado no webhook do Mercado Pago (`plans.ts:390-406`) e em `capture-order` (`paypal.ts:91-128`).
3. **`contracts.ts`** — em `PUT /:id/encerrar` (linha 361), mover a checagem de dono (`usuario_id`) para antes de `cancelFutureRevenues`, igual já é feito em `/aditivo` (linha 386+) e na rota de gerar previstas (linha ~300+). Adicionar `usuario_id` como parâmetro obrigatório na própria função `cancelFutureRevenues` (linha 8) e filtrar por ele no SQL, como defesa em profundidade — atualizar as 3 chamadas existentes (linhas 342, 366, 416).

### Fora do escopo

- Verificação de assinatura oficial da PayPal (decisão tomada: reconsulta via API, não assinatura HTTP).
- Qualquer outro achado da auditoria geral (bugs funcionais, código morto, versão antiga, duplicação) — cada frente vira plano separado.
- Migrar `plans.ts`/`paypal.ts` para Drizzle (usam `pool.query` cru hoje) — fora de escopo, não misturar refactor com fix de segurança.

## Leitura de contexto

- `/AGENT.md`
- Auditoria completa do sistema de finanças feita nesta conversa (3 agentes: legado, frontend, backend).
- Leitura direta e verificação manual de `plans.ts` (linhas 357-441), `paypal.ts` (arquivo completo), `contracts.ts` (linhas 1-40, 320-420).

## Impacto por área

### Frontend

Sem impacto esperado — nenhuma dessas rotas muda contrato de request/response para uso legítimo (admin continua conseguindo ativar plano manualmente; PayPal/webhook continuam funcionando para pagamentos reais; `/encerrar` continua funcionando igual para contratos do próprio usuário).

### Backend

- `plans.ts`: adicionar middleware `requireAdmin` (já existe em `middleware/auth.ts`) na rota `/activate`.
- `paypal.ts`: nova função auxiliar para buscar detalhes da captura na API da PayPal; webhook passa a usar os dados reconsultados em vez dos dados brutos do POST recebido.
- `contracts.ts`: reordenar `PUT /:id/encerrar`; adicionar parâmetro `userId` a `cancelFutureRevenues` e filtrar por `usuario_id` no UPDATE.

### Banco de dados

Sem impacto esperado — nenhuma mudança de schema.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `sistema financas/backend/src/routes/plans.ts`
- `sistema financas/backend/src/routes/paypal.ts`
- `sistema financas/backend/src/routes/contracts.ts`

## Estratégia de implementação

1. `plans.ts`: importar `requireAdmin` de `../middleware/auth` (se ainda não importado) e adicionar como segundo middleware na rota `/activate`.
2. `paypal.ts`: criar `fetchCaptureDetails(captureId)` usando `getAccessToken()` + `GET /v2/payments/captures/{id}`. No handler do webhook, extrair o `id` da captura do `resource` recebido, chamar `fetchCaptureDetails`, validar `status === 'COMPLETED'`, e só então extrair `amount`/`custom_id`/`reference_id` **dos dados reconsultados** (não do body do webhook) antes de chamar `activatePlan`. Validar cuidadosamente o formato real da resposta da API da PayPal durante a implementação (log temporário se necessário) antes de finalizar a extração de campos.
3. `contracts.ts`: alterar assinatura de `cancelFutureRevenues(contractId, userId)` e adicionar `AND usuario_id = $2` ao UPDATE. Atualizar as 3 chamadas para passar `req.user!.id`. Em `/encerrar`, mover a query de checagem de dono (ou a própria UPDATE com `usuario_id`) para antes da chamada a `cancelFutureRevenues`, retornando 404 cedo se o contrato não pertencer ao usuário.
4. Rodar `npm run build` do backend.
5. Testes manuais (local, com conta de teste): tentar `/activate` como usuário comum (esperar 403); tentar `/encerrar` com ID de contrato de outra conta (esperar 404 sem cancelar nada); revisar visualmente a lógica do webhook do PayPal (sem conseguir testar webhook real sem sandbox configurado — sinalizar isso no resumo final).

## Regras de negócio identificadas

- Ativação manual de plano deve continuar disponível para admin/master, só não para usuário comum.
- Webhooks de pagamento só devem ativar plano com base em dados confirmados pela própria processadora de pagamento, nunca confiando cegamente no corpo do POST recebido.
- Toda operação de escrita sobre um contrato deve confirmar que o contrato pertence ao usuário autenticado antes de qualquer mutação, não só antes da resposta final.

## Regras multi-tenant e segurança

- Este plano é inteiramente sobre isolamento multi-tenant e prevenção de fraude financeira — é o núcleo do que está sendo corrigido.
- `cancelFutureRevenues` passa a exigir `usuario_id`, eliminando a possibilidade de reuso futuro sem esse filtro.

## Validações necessárias

- `POST /api/plans/activate` com usuário não-admin retorna 403.
- `POST /api/plans/activate` com usuário admin continua funcionando.
- `PUT /api/contratos/:id/encerrar` com ID de contrato de outra conta retorna 404 e não altera nenhuma receita.
- Webhook da PayPal só ativa plano quando a captura é confirmada via API real da PayPal.

## Testes necessários

### Frontend

Não aplicável.

### Backend

- Testar `/activate` com token de usuário comum vs admin.
- Testar `/encerrar` com contrato próprio vs de outra conta (usando duas contas de teste).
- Revisar (sem poder testar webhook real) a lógica de reconsulta do PayPal.

### E2E

Não aplicável — mudanças de segurança backend-only.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas/backend" run build
```

## Riscos e pontos de atenção

- Médio: a resposta exata da API da PayPal para o endpoint de captura precisa ser conferida com cuidado durante a implementação — validar antes de finalizar a extração de campos, não assumir que o formato é idêntico ao body do webhook.
- Baixo: `requireAdmin` em `/activate` pode quebrar algum fluxo de teste manual que dependia do comportamento atual — aceitável dado que é uma falha de segurança real.
- Não há como testar o webhook do PayPal de ponta a ponta sem um ambiente sandbox configurado; a correção será validada por revisão de código cuidadosa, não por teste end-to-end real.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — decisão sobre abordagem do webhook já coletada.

## Critérios de aceite do plano

- Usuário comum não consegue mais chamar `/api/plans/activate` com sucesso (403).
- Webhook da PayPal só ativa plano se a captura for confirmada como real na API da PayPal.
- `PUT /:id/encerrar` retorna 404 para contrato de outra conta sem cancelar nenhuma receita.
- Build do backend passa.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Manter alterações pequenas e focadas nos 3 arquivos listados.
- Não executar migrations (não há nenhuma neste plano).
- Não alterar `.env`.
- Validar cuidadosamente o formato de resposta da API da PayPal antes de finalizar a extração de campos no webhook.
