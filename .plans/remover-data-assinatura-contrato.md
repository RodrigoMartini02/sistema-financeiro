# Plano de Implementação: Remover campo data de assinatura do contrato

## Origem

- Arquivo de especificação: `sistema financas/.portal/tasks/Remover campo data de assinatura do contrato.md`
- Data do planejamento: 2026-08-27
- Classificação: `frontend + backend + database`

## Resumo

Remove o campo `data_assinatura` de ponta a ponta do fluxo de contrato: formulário (`ContratoForm`, `AditivoModal`), tipos TypeScript, payloads de API, queries SQL do backend, e a coluna correspondente no banco. Executado em duas fases: Fase 1 (código, reversível, sem migration) e Fase 2 (drop da coluna, destrutiva, só com confirmação explícita separada).

## Escopo

### Dentro do escopo

- Remover campo "Assinatura" de `ContratoForm` (modo edição e leitura).
- Remover campo "Nova assinatura" de `AditivoModal`.
- Remover `data_assinatura`/`nova_data_assinatura` dos tipos `Contrato`/`AditivoContratoValues`.
- Remover `data_assinatura`/`nova_data_assinatura` das queries de criar/editar contrato e registrar aditivo em `backend/src/routes/contracts.ts`.
- Simplificar o fallback `dataRef` da receita de implantação para `data_inicio_faturamento ?? hoje`.
- Migration de `DROP COLUMN data_assinatura` — descrita e revisável, execução só com confirmação explícita separada (Fase 2).

### Fora do escopo

- Qualquer mudança na tabela de Valores ou outros campos do modal — coberta pela task `Redesign estrutural do modal de contrato`.
- Preservação do dado histórico de `data_assinatura` em outro campo — usuário decidiu aceitar a perda.
- Verificação prévia de quantos contratos têm o campo preenchido — usuário decidiu não verificar.

## Leitura de contexto

- `/AGENT.md` (raiz) e `sistema financas/AGENT.md` — regras do projeto.
- `sistema financas/CLAUDE.md` — fluxo planejar → aprovar → implementar → finalizar; migrations nunca sem confirmação explícita a cada vez.
- `sistema financas/.portal/tasks/Remover campo data de assinatura do contrato.md` — especificação de entrada.
- `src/screens/config/ClienteDetail.tsx` — 8 ocorrências de `data_assinatura` mapeadas: `ContratoForm` (linhas 58, 94, 128, 180), `AditivoModal` (linhas 1180, 1188, 1201, 1225).
- `src/services/clientesService.ts` — tipos `Contrato` (campo `data_assinatura`) e `AditivoContratoValues` (campo `nova_data_assinatura`).
- `backend/src/routes/contracts.ts` — 4 pontos de uso: INSERT (linhas ~207-259), UPDATE (linhas ~269-314), rota de aditivo (linhas ~409-490, como `nova_data_assinatura`), fallback `dataRef` da receita de implantação (linha ~672), e o tipo inline de leitura (linha ~647).
- Investigação desta sessão confirmou, por busca em todo `backend/src` e todo `src`: **nenhuma outra rota** (relatórios, exports, PDF) referencia `data_assinatura` — os únicos 3 arquivos são os já mapeados.
- Investigação desta sessão confirmou: **não existe migration versionada** em `backend/drizzle/` que crie a tabela `contratos` — ela foi criada fora do sistema de migrations rastreado. A migration de remoção não pode se basear em uma definição original conhecida; o tipo da coluna (`DATE`, nullable, sem default) é inferido com alta confiança pelo padrão de uso nas queries (`?? null`, sem `parseInt`/`parseFloat`, mesmo tratamento de `vencimento`/`data_inicio_faturamento`).

## Impacto por área

### Frontend

- **`ContratoForm`** (`src/screens/config/ClienteDetail.tsx`): remover o campo "Assinatura" do `useState` do form (linha 58), do objeto enviado em `onSave` (linha 94), do bloco de exibição em modo leitura (linha 128), e do input em modo edição (linha 180). Ajustar o grid de identificação de 5 para 4 colunas (`gridTemplateColumns`), redistribuindo a largura entre Número, Descrição, Vencimento, Início fatur.
- **`AditivoModal`**: remover "Nova assinatura" do `useState` (linha 1180, 1188), do objeto enviado em `onSave` (linha 1201), e do input (linha 1225). Ajustar grid de 4 para 3 campos.
- **`clientesService.ts`**: remover `data_assinatura?: string | null` de `Contrato` e `nova_data_assinatura?: string | null` de `AditivoContratoValues`.

### Backend

- **`contracts.ts` — POST /api/contratos**: remover `data_assinatura` da desestruturação (linha ~207), da lista de colunas do INSERT (linha ~231), do placeholder `$4` (renumerando os subsequentes), e do array de valores (linha ~242).
- **`contracts.ts` — PUT /api/contratos/:id**: remover `data_assinatura` da desestruturação (linha ~272), do `SET` do UPDATE (linha ~286), do placeholder `$2` (renumerando), e do array de valores (linha ~304).
- **`contracts.ts` — PUT /api/contratos/:id/aditivo**: remover `nova_data_assinatura` da desestruturação (linha ~414), da lista de colunas do INSERT do novo contrato (linha ~453), do placeholder `$4` (renumerando), e do array de valores (linha ~465).
- **`contracts.ts` — receita de implantação**: simplificar `const dataRef = ct.data_assinatura ?? ct.data_inicio_faturamento ?? getTodayIsoInTimezone();` para `const dataRef = ct.data_inicio_faturamento ?? getTodayIsoInTimezone();`; remover `data_assinatura: string | null` do tipo inline de leitura do contrato (linha ~647).
- Todas as renumerações de placeholder `$N` devem ser feitas com cuidado para manter a correspondência exata com o array de valores — risco de erro silencioso de tipo se um placeholder for deslocado incorretamente (Postgres aceitaria o valor errado no campo errado se os tipos forem compatíveis, ex. duas strings).

### Banco de dados

- **Fase 2, migration nova** (`backend/drizzle/00XX_remover_data_assinatura_contratos.sql`, número seguinte a `0018b`):
  ```sql
  -- Migration reference: remove unused data_assinatura column from contratos
  -- Do not execute automatically. Confirm target environment before applying.
  ALTER TABLE contratos DROP COLUMN IF EXISTS data_assinatura;
  ```
- `DROP COLUMN IF EXISTS` (em vez de `DROP COLUMN` puro) para tolerar re-execução segura, seguindo o padrão `IF NOT EXISTS`/`IF EXISTS` já usado nas migrations existentes do projeto (ex. `0003_schema_completo_contratos_servicos.sql`).
- Operação destrutiva e irreversível para dados já preenchidos — usuário já confirmou aceitar a perda, sem necessidade de preservação prévia.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção. A Fase 2 desta task fica condicionada a essa confirmação, separada da aprovação deste plano.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/config/ClienteDetail.tsx`
- `src/services/clientesService.ts`
- `backend/src/routes/contracts.ts`
- `backend/drizzle/00XX_remover_data_assinatura_contratos.sql` (novo, Fase 2)

## Estratégia de implementação

**Fase 1 — Código (frontend + backend), sem tocar no banco:**
1. `ContratoForm`: remover campo Assinatura (state, save, leitura, input), ajustar grid para 4 colunas.
2. `AditivoModal`: remover campo Nova assinatura (state, save, input), ajustar grid.
3. `clientesService.ts`: remover `data_assinatura`/`nova_data_assinatura` dos tipos.
4. `contracts.ts`: remover dos 3 pontos de INSERT/UPDATE (criar, editar, aditivo), renumerando placeholders com cuidado.
5. `contracts.ts`: simplificar `dataRef`, remover do tipo inline de leitura.
6. Rodar `npm run build` (frontend) e o build do backend.
7. Validar manualmente via `/run`: criar contrato, editar contrato, registrar aditivo, gerar receita de implantação — confirmar ausência do campo e funcionamento correto do fallback.

**Fase 2 — Banco (só após confirmação explícita separada):**
8. Apresentar o SQL da migration ao usuário.
9. Aguardar confirmação explícita para executar.
10. Executar a migration somente após "sim"/"pode"/equivalente do usuário, direcionado especificamente a essa execução.

## Regras de negócio identificadas

- Fallback de data de referência da receita de implantação passa de `data_assinatura ?? data_inicio_faturamento ?? hoje` para `data_inicio_faturamento ?? hoje`.
- Nenhuma outra regra de negócio depende de `data_assinatura` (confirmado: cálculo de total/período já não usa esse campo desde antes desta task).

## Regras multi-tenant e segurança

Projeto não é multi-tenant no sentido de organizações isoladas; sem isolamento de tenant a considerar. Nenhuma mudança de permissão/autorização.

## Validações necessárias

Nenhuma validação nova — a remoção não introduz novo campo obrigatório nem nova regra de formulário.

## Testes necessários

### Frontend

- Criar contrato, editar contrato, registrar aditivo — confirmar ausência visual do campo em todos os modos.
- Confirmar que salvar continua funcionando sem erro de payload.

### Backend

- Criar/editar contrato e registrar aditivo continuam funcionando sem `data_assinatura` no payload.
- Gerar receita de implantação usa `data_inicio_faturamento` como fallback corretamente quando presente, e `hoje` quando ambos ausentes.

### E2E

Não aplicável.

## Comandos de validação sugeridos

```bash
npm run build
npm --prefix backend run build
```

## Riscos e pontos de atenção

- Renumeração de placeholders SQL (`$N`) nas 3 queries de `contracts.ts` é o ponto de maior risco de erro silencioso — um placeholder deslocado incorretamente pode gravar o valor errado em uma coluna compatível de tipo sem gerar erro. Exige revisão cuidadosa linha a linha durante a implementação.
- Sem migration original conhecida para `contratos`, o tipo exato da coluna é inferido (não confirmado por schema) — baixo risco, já que `DROP COLUMN IF EXISTS` funciona independente do tipo.
- Fase 2 é destrutiva e irreversível — usuário já ciente e optou por não preservar o dado.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — as três perguntas da task original foram resolvidas: (1) usuário aceita a perda de dado sem verificação prévia; (2) confirmado por investigação que nenhuma outra rota usa o campo; (3) plano único com as duas fases, Fase 2 aguardando confirmação separada.

## Critérios de aceite do plano

- Campo "Assinatura"/"Nova assinatura" não aparece mais em `ContratoForm` nem `AditivoModal`, em nenhum modo.
- Tipos `Contrato` e `AditivoContratoValues` sem `data_assinatura`/`nova_data_assinatura`.
- Rotas de contrato no backend não referenciam mais `data_assinatura`.
- Receita de implantação usa `data_inicio_faturamento ?? hoje` corretamente.
- Fase 2 (drop da coluna) só executada mediante confirmação explícita separada, não incluída automaticamente na aprovação deste plano.
- Builds de frontend e backend concluem sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir `sistema financas/AGENT.md` e `sistema financas/CLAUDE.md`.
- Executar apenas a Fase 1 (código) automaticamente após aprovação do plano.
- Ao chegar na Fase 2, parar e apresentar o SQL da migration explicitamente, aguardando confirmação nova e específica do usuário antes de executar — a aprovação deste plano não vale como aprovação da execução da migration.
- Revisar com atenção especial a renumeração de placeholders SQL nas 3 queries de `contracts.ts`.
- Não executar nenhuma migration sem essa confirmação separada.
