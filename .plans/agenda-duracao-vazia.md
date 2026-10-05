# Plano de Implementação: Agenda grava sem duração e mostra os erros de Data e Duração

## Origem

- **Arquivo de especificação:** não há. O defeito foi achado no teste de tela do plano `.plans/datas-calendario.md` (etapa 9) e o usuário pediu a correção em 2026-10-05: "2 sim".
- **Data do planejamento:** `2026-10-05`
- **Classificação:** `frontend-only`

## Resumo

O formulário de compromisso da Agenda (`AppointmentDialog`) não grava quando a duração fica vazia, e não diz por quê:
- a regra `z.coerce.number().int().min(1).optional()` transforma o campo vazio em 0 e recusa;
- só o Título mostra mensagem de erro, então o botão "Criar compromisso" simplesmente não faz nada.

Com o campo de data novo (`IsoDateField`), a data incompleta chega vazia e também é recusada sem aviso.

A correção:
- a duração vazia grava o compromisso sem duração;
- a duração preenchida precisa ser de 1 minuto ou mais;
- Data e Duração mostram a mensagem embaixo do campo, como o Título.

## Escopo

### Dentro do escopo

- **Regra do formulário em arquivo próprio, com teste:**
  - duração vazia ou nula é "sem duração";
  - duração preenchida é um número inteiro ≥ 1;
  - data obrigatória.
- **Mensagens embaixo de Data e Duração.** A Data fica com a borda vermelha quando o valor não é válido.
- **Edição:** apagar a duração de um compromisso grava sem ela.

### Fora do escopo

- Horário, local e observações.
- Backend, que já aceita duração vazia (grava `null`) e exige 1 minuto ou mais quando ela vem.
- Banco.
- O resto da Agenda (calendário, lista, exclusão).

## Leitura de contexto

- `/AGENT.md` (lido) e `/CLAUDE.md`.
- `/frontend/AGENT.md` e `/backend/AGENT.md`: **não existem no projeto**.
- **Especificação:** conversa de 2026-10-05 e o registro da etapa 9 de `.plans/datas-calendario.md`.
- **Arquivos lidos:**
  - `src/screens/finance/AppointmentDialog.tsx`;
  - `src/types/appointments.ts`;
  - `backend/src/routes/appointments.ts` (`body('duracao_minutos').optional({ values: 'falsy' }).isInt({ min: 1 })`; grava `null` sem duração);
  - `src/screens/finance/calendar/CalendarView.tsx`, o único lugar que usa o diálogo.

## Impacto por área

### Frontend

- **Novo `src/utils/appointmentForm.ts`:**
  - `appointmentFormSchema` (zod), que sai de dentro do `AppointmentDialog`:
    - `titulo`: obrigatório, "Informe o título" (sem mudança);
    - `data`: obrigatória, "Informe a data" (sem mudança no texto);
    - `duracao_minutos`: vazio ('' ou nulo) vira `undefined` antes de converter; preenchido, inteiro ≥ 1, com a mensagem "A duração precisa ser de 1 minuto ou mais";
    - `hora`, `local` e `descricao`: sem mudança.
  - `AppointmentFormData`, o tipo do formulário.
  - Teste em `src/utils/appointmentForm.test.ts`.
- **`AppointmentDialog.tsx`:**
  - usa o esquema e o tipo novos;
  - mostra `errors.data` e `errors.duracao_minutos` embaixo dos campos, no mesmo estilo da mensagem do Título;
  - passa `invalid` ao `IsoDateField` quando há erro na data.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado. Nenhuma migration.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/utils/appointmentForm.ts` (novo)
- `src/utils/appointmentForm.test.ts` (novo)
- `src/screens/finance/AppointmentDialog.tsx`

## Estratégia de implementação

1. **Branch:** continuar na `feat/R/datas-calendario` (pedido do usuário: "nesta mesma branch").
2. **Regra com teste:**
   - criar `appointmentForm.ts`, com o esquema e o tipo, e o teste:
     - sem duração passa, com `undefined`;
     - "0" e "-5" são recusados com a mensagem;
     - "45" vira 45;
     - data vazia é recusada com "Informe a data";
     - título vazio é recusado.
   - Commit.
3. **Diálogo:**
   - `AppointmentDialog` usa o esquema;
   - mostra as mensagens de Data e Duração;
   - borda vermelha na Data com erro.
   - Commit.
4. **Validação:**
   - `tsc`, `npm test` e `npm run build`;
   - teste de tela no jsdom (`tmpclaude-*`):
     - grava sem duração (`duracao_minutos` ausente);
     - 0 mostra a mensagem e não grava;
     - 45 grava 45;
     - data incompleta mostra "Informe a data" e não grava;
     - edição: apagar a duração grava sem ela.
   - Registro neste plano.
5. **Print da Agenda** com as mensagens, junto da aprovação visual já pendente da branch (etapa 10 de `.plans/datas-calendario.md`). Depois, o `/finalizar` leva os dois planos juntos.

## Regras de negócio identificadas

- **Duração:** opcional. Vazia é "sem duração"; preenchida é um inteiro ≥ 1 em minutos.
- **Data:** obrigatória. Data incompleta ou inexistente conta como não informada.
- **Mensagem:** todo campo recusado mostra o motivo embaixo dele. O botão nunca fica sem resposta.

## Regras multi-tenant e segurança

- Só front: as rotas, a conta do compromisso e as permissões não mudam.
- A validação do backend continua valendo (`isInt({ min: 1 })` quando a duração vem).

## Validações necessárias

- `duracao_minutos`: '' ou nulo vira `undefined`. Com valor, número inteiro ≥ 1; senão, "A duração precisa ser de 1 minuto ou mais".
- `data`: texto aaaa-mm-dd com 10 caracteres; senão, "Informe a data".
- `titulo`: não vazio; senão, "Informe o título" (como hoje).

## Testes necessários

### Frontend

- `appointmentForm.test.ts`: os casos da etapa 2.
- Tela no jsdom: os casos da etapa 4.

### Backend

- Sem testes novos, porque não há mudança.

### E2E

- No navegador, criar compromisso sem duração e com duração, e editar apagando a duração.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit -p tsconfig.json
npm test
npm run build
npx tsx tmpclaude-<cenarios>.tsx
```

## Riscos e pontos de atenção

- **Edição:** apagar a duração de um compromisso passa a gravá-lo sem duração. É o esperado, e o backend já grava `null`.
- **Tipo do formulário:** o esquema com conversão (`preprocess`) muda o tipo inferido. É preciso manter o `defaultValues` e o `form.reset` compatíveis, sem `any`.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- **Sem duração:** criar compromisso só com título e data grava, sem duração.
- **Duração 0:** mostra "A duração precisa ser de 1 minuto ou mais" e não grava.
- **Duração 45:** grava 45.
- **Data incompleta:** mostra "Informe a data", a borda fica vermelha e não grava.
- **Edição:** editar e apagar a duração grava sem duração.
- **Checks:** `tsc`, testes e build sem erros; teste de tela passando; print aprovado pelo usuário.

## Observações para a skill implementar

- **Fonte:** usar este plano como fonte principal; seguir `/AGENT.md` e `/CLAUDE.md`.
- **Branch:** continuar na `feat/R/datas-calendario`. Um commit por etapa.
- **Código:** identificadores em inglês e textos de tela em português; nada de `any`; regra pura em `src/utils/`, com teste.
- **Migrations:** este plano não tem migration. Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.
- **Registro:** no fim deste plano, a cada etapa concluída.

## Registro de andamento

### Etapas 1 a 5 (2026-10-05)

- Branch `feat/R/datas-calendario` (a mesma do plano das datas).
- **Etapa 2** (commit `37d686e4`):
  - `src/utils/appointmentForm.ts`: `appointmentFormSchema`, `AppointmentFormData` e `DURATION_MESSAGE`;
  - duração vazia ou nula vira `undefined` (`z.preprocess`) antes de converter;
  - teste com 5 casos.
- **Etapa 3** (commit `9a09fa15`):
  - o `AppointmentDialog` usa o esquema novo;
  - `FieldError` mostra o motivo embaixo de Título, Data e Duração;
  - a Data recebe `invalid` do `fieldState`.
- **Desvio do plano:** o formulário ganhou `noValidate`. O `min={1}` do campo de duração fazia o navegador barrar o envio com o balão dele, antes da validação do formulário; o teste de tela mostrou que a mensagem não aparecia com 0.
- **Etapa 4:**
  - `tsc`, 152/152 e build;
  - Agenda no jsdom, 6/6: grava sem duração; 0 mostra a mensagem e não grava; 45 grava 45; data incompleta mostra "Informe a data", com borda vermelha, e não grava; a edição abre com a duração; apagar a duração na edição grava sem ela;
  - datas, 30/30, e telas, 10/10, de novo.
- **Etapa 5:** print da Agenda com as duas mensagens (`computador-06b-agenda-erros.png`). Aguardando a aprovação visual, junto do plano das datas.
