# Plano de Implementação: Amarrar clientes/contratos ao sistema de perfis

## Origem

- Investigação disparada pelo usuário ao perguntar "verifique se está bem amarrado com tipos de perfil" durante a correção do erro em `/api/contratos/faturamento`
- Data do planejamento: 2026-07-12
- Classificação: `backend + frontend + database`

## Resumo

O módulo de clientes/contratos/serviços foi construído sem nenhuma amarração ao sistema de perfis (Pessoal/PJ) usado pelo resto do app. Diferente de receitas, despesas, cartões, meses e reservas — que sempre filtram por `perfil_id` com fallback para o perfil `'pessoal'` quando nulo — clientes e contratos aparecem igual não importa qual perfil esteja ativo.

Investigação confirmou:
- `clientes` nunca teve coluna `perfil_id`.
- `contratos.perfil_id` existe (criada na migration `0003` desta sessão) mas nunca é lida em nenhum `WHERE`, nem aceita no `POST /contratos`, nem propagada corretamente no fluxo de aditivo.
- `servicos`, `contratos_servicos`, `contrato_anexos`, `servicos_tecnicos_contrato`, `modulos_contrato`, `consumo_horas` não têm e não precisam de `perfil_id` — por decisão do usuário, `servicos` fica compartilhado entre perfis, e as demais são tabelas filhas escopadas transitivamente via `contrato_id`.
- **Zero clientes e zero contratos cadastrados em produção hoje** (confirmado via consulta direta) — mudança de baixíssimo risco, sem necessidade de backfill/migração de dados existentes.

## Escopo

### Dentro do escopo

- Adicionar `perfil_id` em `clientes` (coluna + índice + FK para `perfis`).
- `backend/src/routes/clients.ts`: filtrar listagem por perfil (padrão fallback para `'pessoal'`), aceitar `perfil_id` no `POST`, permitir atualizar no `PUT`.
- `backend/src/routes/contracts.ts`: filtrar `GET /` e `GET /faturamento` por perfil; aceitar `perfil_id` no `POST /`; propagar `perfil_id` corretamente no `PUT /:id/aditivo` (hoje só repassa para as receitas geradas, não para o novo contrato criado).
- `src/services/clientesService.ts`: todas as funções passam a enviar `perfil_id` via `getActiveProfileId()`, mesmo padrão já usado em `financeService.ts` (`appendProfile`).

### Fora do escopo

- `servicos` (catálogo) — permanece compartilhado entre perfis, por decisão do usuário.
- Qualquer seletor de perfil novo na UI de criação de cliente/contrato — o perfil ativo é usado silenciosamente, sem mudança visual.
- Backfill de dados existentes — não há dados a migrar.
- Tabelas filhas (`contratos_servicos`, `contrato_anexos`, `servicos_tecnicos_contrato`, `modulos_contrato`, `consumo_horas`) — permanecem escopadas via `contrato_id`, sem coluna própria.

## Leitura de contexto

- `backend/src/routes/clients.ts`, `contracts.ts` (leitura completa)
- `backend/src/routes/months.ts`, `cards.ts`, `reserves.ts` — padrão de referência do filtro fallback (`perfil_id = $X OR (perfil_id IS NULL AND EXISTS (SELECT 1 FROM perfis pf WHERE pf.id = $X AND pf.tipo = 'pessoal' AND pf.usuario_id = $Y)))`)
- `src/services/apiClient.ts` (`getActiveProfileId`, lê `localStorage.perfilAtivoId`)
- `src/services/financeService.ts` (`appendProfile`, padrão de referência no frontend)
- `src/services/clientesService.ts` (leitura completa — confirma nenhuma função envia `perfil_id` hoje)
- Consulta read-only em produção: `contratos` com 0 linhas; `clientes`/`servicos` sem coluna `perfil_id`; `perfis.tipo` confirmado como `'pessoal'` ou `'empresa'`

## Impacto por área

### Frontend

- `src/services/clientesService.ts`: `fetchClientes`, `saveCliente`, `fetchContratos`, `fetchContratosAtivos`, `saveContrato` passam a incluir `perfil_id` (query param nas leituras, campo no body nas escritas), via `getActiveProfileId()`.
- Nenhuma tela nova, nenhum novo estado de loading/error — os componentes consumidores (`ClienteDetail.tsx`, `ClientesTab.tsx`, `IncomeDialog.tsx`) continuam chamando os services normalmente.
- Query keys existentes (`queryKeys.ts`) não precisam de novo campo — o padrão do app já invalida queries ao trocar de perfil.

### Backend

- `clients.ts`: `GET /` filtra por perfil (fallback); `POST /` grava `perfil_id`; `PUT /:id` aceita atualizar `perfil_id`.
- `contracts.ts`: `GET /` e `GET /faturamento` filtram por perfil (fallback); `POST /` passa a aceitar e gravar `perfil_id`; `PUT /:id/aditivo` propaga `perfil_id` do contrato anterior para o novo contrato criado (hoje só repassa para as receitas geradas via `gerarPrevistas`, não para o `INSERT INTO contratos` do aditivo).
- Todas as queries seguem o padrão de segurança do projeto: `usuario_id` sempre filtrado primeiro, `perfil_id` como filtro adicional.

### Banco de dados

```sql
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS perfil_id INTEGER REFERENCES perfis(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clientes_perfil ON clientes(perfil_id);
```

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual é produção. Este plano não autoriza a execução automática.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `backend/drizzle/0005_perfil_clientes.sql` (novo)
- `backend/src/routes/clients.ts`
- `backend/src/routes/contracts.ts`
- `src/services/clientesService.ts`

## Estratégia de implementação

1. Criar a migration `0005_perfil_clientes.sql`.
2. Atualizar `clients.ts`: filtro fallback no `GET /`, aceitar/gravar `perfil_id` no `POST`/`PUT`.
3. Atualizar `contracts.ts`: filtro fallback no `GET /` e `GET /faturamento`; aceitar/gravar `perfil_id` no `POST /`; corrigir `PUT /:id/aditivo` para propagar `perfil_id` ao novo contrato.
4. Atualizar `clientesService.ts` para enviar `perfil_id` em todas as chamadas relevantes.
5. Rodar `cd backend && npm run build` e `npx vite build`.
6. Aplicar a migration contra produção mediante confirmação explícita separada.
7. Pedir para o usuário testar: criar um cliente/contrato em cada perfil e confirmar que cada um só aparece no perfil onde foi criado.

## Regras de negócio identificadas

- `perfil_id` nulo em `clientes`/`contratos` cai automaticamente no perfil do tipo `'pessoal'` do usuário (decisão 1 do usuário).
- `servicos` permanece global, sem filtro de perfil (decisão 2 do usuário).

## Regras multi-tenant e segurança

- Toda query continua filtrando por `usuario_id` primeiro — o filtro de `perfil_id` é adicional, nunca substitui a checagem de propriedade.
- Sem risco de vazamento entre usuários; o risco corrigido aqui é vazamento entre perfis do mesmo usuário.

## Validações necessárias

- `POST /clientes` e `POST /contratos` gravam `perfil_id` corretamente quando enviado.
- `GET /clientes` e `GET /contratos` só retornam registros do perfil ativo (ou órfãos que caem no fallback pessoal).
- `PUT /:id/aditivo` do contrato preserva o `perfil_id` do contrato original no novo contrato gerado.

## Testes necessários

### Frontend

- Criar cliente com perfil "Pessoal" ativo, trocar para "PJ", confirmar que o cliente não aparece na listagem.

### Backend

- Testar `POST /clientes` e `POST /contratos` com e sem `perfil_id` no body.
- Testar `GET /contratos/faturamento` com `perfil_id` de cada tipo.

### E2E

- Fluxo completo: criar contrato em "PJ", trocar para "Pessoal", confirmar que a carteira de faturamento não mostra o contrato.

## Comandos de validação sugeridos

```bash
cd backend && npm run build
npx vite build
```

## Riscos e pontos de atenção

- Risco muito baixo — zero dados existentes para migrar.
- `PUT /:id/aditivo` é o ponto mais fácil de esquecer, já que hoje só propaga `perfil_id` para receitas, não para o contrato novo — precisa de atenção extra na implementação.

## Perguntas em aberto

Nenhuma — ambas as decisões (padrão de fallback e escopo de `servicos`) foram resolvidas com o usuário.

## Critérios de aceite do plano

- `clientes.perfil_id` existe em produção.
- `GET /clientes`, `GET /contratos`, `GET /contratos/faturamento` filtram por perfil com fallback para `'pessoal'`.
- `POST /clientes` e `POST /contratos` gravam `perfil_id`.
- `PUT /:id/aditivo` propaga `perfil_id` corretamente.
- Builds de frontend e backend passam sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir exatamente o padrão de filtro fallback já usado em `months.ts`/`cards.ts`/`reserves.ts` — não inventar um padrão novo.
- Confirmar explicitamente com o usuário antes de executar a migration contra produção.
- Isolar o commit de qualquer alteração pendente não relacionada já presente no working tree.
