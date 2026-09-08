# Plano de Implementação: Isolamento de conta e limpeza de resíduo

## Origem

- Solicitação do usuário: verificar se conta, usuários, membros e colaboradores estão bem definidos, e se há dados sensíveis vazando de uma conta para outra
- Descoberto ao planejar os gráficos por membro da família, quando a auditoria revelou que `conta_membros` está vazia mas há lançamentos de outros usuários na conta 17
- Data do planejamento: `2026-09-08`
- Classificação: `backend + correção de dados` (sem migration, sem frontend)

## Resumo

Duas frentes independentes que surgiram da mesma auditoria:

1. **Validar `conta_id` na escrita** — o backend aceita qualquer conta enviada pelo cliente, sem verificar se pertence ao usuário autenticado
2. **Limpar o resíduo** de outros usuários apontando para a conta 17, herdado da consolidação de contas feita anteriormente

## Classificação e motivo

`backend + correção de dados`.

Backend: validação de propriedade da conta em três rotas de escrita. Nenhuma mudança de schema, nenhuma migration. O frontend não é tocado — ele já envia `conta_id`, e passará a receber 400 quando enviar uma conta que não é sua.

## Resultado da auditoria de isolamento

### Não há vazamento na tela

As queries de despesas, receitas e categorias filtram por `usuario_id` **antes** de qualquer filtro de conta ([ownerAndAccountWhere.ts](../backend/src/utils/ownerAndAccountWhere.ts), [categories.ts:36-44](../backend/src/routes/categories.ts#L36-L44)).

Verificado com os dados reais: o usuário 1 vê 546 despesas e 38 categorias — as dele. Os dados dos outros usuários existem no banco mas não chegam à interface.

### Mas há resíduo no banco

Todos apontando para `conta_id = 17` (conta pessoal do usuário 1):

| Usuário | Despesas | Receitas | Categorias |
|---|---|---|---|
| Mirian Antonin (4) | 3 | 1 | 7 |
| teste (11) | — | — | 10 |
| Aether Software (12) | — | — | 14 |
| **Total** | **3** | **1** | **31** |

**Origem confirmada:** as 3 despesas da Mirian são de 05/01/2026, chamadas "Teste" e "teste 02", criadas com minutos de diferença. São dados de teste que a consolidação de contas arrastou para a conta 17 quando as demais contas foram apagadas.

**Não foi exploração da falha de validação** — foi a própria migração.

Das 31 categorias órfãs, **apenas uma tem uso**: id 501 ("Alimentação", da Mirian), referenciada pelas 3 despesas de teste.

### A falha de validação

`conta_id` vem do `localStorage` do navegador ([apiClient.ts:27](../src/services/apiClient.ts#L27)) e é enviada ao backend, que **grava sem verificar** se a conta pertence ao usuário:

| Rota | Valida propriedade da conta? |
|---|---|
| `POST/PUT /despesas` | **Não** |
| `POST/PUT /receitas` | **Não** |
| `POST/PUT /cartoes` | **Não** |
| `POST /categorias` | **Sim** — [categories.ts:183](../backend/src/routes/categories.ts#L183) |

Isso contraria a regra explícita do `AGENT.md`: "Nunca confiar no tenant vindo livremente do client".

**O padrão da correção já existe no projeto.** `categories.ts` faz:

```ts
const accountType = await resolveAccountType(conta_id, [req.user!.id]);
if (!accountType) {
  res.status(400).json({ success: false, message: 'Account not found' });
  return;
}
```

Trata-se de replicar esse comportamento, não de inventar solução nova.

### Os quatro conceitos

| Conceito | Tabela | Estado | Definição |
|---|---|---|---|
| **Usuário** | `usuarios` | 6 cadastrados | Quem faz login. Todos independentes |
| **Conta** | `contas` | 1 ativa (17, pessoal, dona: usuário 1) | O escopo dos lançamentos |
| **Membro da família** | `conta_membros` | **vazia** | Estrutura existe, nunca foi usada |
| **Colaborador** | `conta_membros` | mesma tabela | **É o mesmo que membro** — `MembrosTab` só troca o rótulo quando `contaTipo === 'empresa'` |

Membro e colaborador não são conceitos distintos no modelo. Isso é escolha de produto (mesma mecânica, nome adequado ao contexto), não uma falha.

## Escopo

### Dentro do escopo

- Helper compartilhado de validação de propriedade de conta no backend
- Aplicar a validação em `POST` e `PUT` de despesas, receitas e cartões
- Backup e remoção do resíduo: 3 despesas, 1 receita e 31 categorias órfãs
- Preservar o comportamento de `conta_id` nulo (registros antigos), que o `accountFilter` já trata como conta pessoal do dono

### Fora do escopo

- **Gráficos por membro da família** — adiados: `conta_membros` está vazia e o usuário não pretende criar membros agora
- Desativar os usuários 11 e 12, cujas contas foram apagadas — decisão do usuário, tratada como pergunta em aberto
- Alterar a lógica de leitura (`ownerAndAccountWhere`, `accountFilter`), que já isola corretamente
- Alterar o frontend — ele continua enviando `conta_id` como hoje
- Revisar isolamento em contratos, clientes, compromissos e representantes — não auditados nesta rodada
- Renomear ou unificar os conceitos de membro e colaborador

## Leitura de contexto

- `CLAUDE.md` (raiz e projeto) — fluxo obrigatório; nunca executar escrita em banco sem confirmação
- `AGENT.md` — a regra "nunca confiar no tenant vindo do client" **se aplica diretamente** aqui, mesmo o projeto não sendo multi-tenant de organizações: o isolamento por conta tem a mesma natureza
- `frontend/AGENT.md` e `backend/AGENT.md` — **não existem** neste projeto
- Arquivos inspecionados: `backend/src/routes/expenses.ts`, `incomes.ts`, `cards.ts`, `categories.ts`, `accountMembers.ts`, `accounts.ts`, `backend/src/utils/ownerAndAccountWhere.ts`, `accountFilter.ts`, `familyVisibility.ts`, `src/services/apiClient.ts`
- Schema real de `despesas`, `receitas`, `contas`, `usuarios` e `conta_membros` lido de produção

## Impacto por área

### Frontend

`Sem impacto esperado.`

O frontend já envia `conta_id` da conta ativa. Após a correção, enviar uma conta que não é sua passa a retornar 400 — situação que não ocorre no uso normal, já que a lista de contas vem filtrada pelo backend.

### Backend

**Novo helper** (local a definir na implementação — avaliar `backend/src/utils/`): recebe `conta_id` e `usuario_id`, retorna se o usuário pode gravar naquela conta.

Deve aceitar **dois casos**:
1. O usuário é dono da conta (`contas.usuario_id = userId`)
2. O usuário é membro vinculado ativo (`conta_membros` com `status = 'ativo'`)

O segundo caso é essencial: sem ele, a validação quebraria a carteira compartilhada da família quando ela passar a ser usada.

**Rotas alteradas:**

- `POST /despesas` e `PUT /despesas/:id`
- `POST /receitas` e `PUT /receitas/:id`
- `POST /cartoes` e `PUT /cartoes/:id`

**Comportamento:** retornar 400 com mensagem genérica quando a conta não for acessível. Não revelar se a conta existe ou pertence a outro usuário.

**Preservar:** `conta_id` nulo continua válido — significa "conta pessoal do dono", tratado pelo `accountFilter`.

### Banco de dados

**Sem alteração de schema. Nenhuma migration.**

Correção de dados, precedida de backup:

| O quê | Registros |
|---|---|
| Despesas de outros usuários na conta 17 | 3 |
| Receitas de outros usuários na conta 17 | 1 |
| Categorias de outros usuários na conta 17 | 31 |

**Ordem obrigatória:** as despesas referenciam a categoria 501; remover a categoria antes deixaria `categoria_id` órfão. Remover lançamentos primeiro, categorias depois.

**Atenção: nenhuma escrita em produção deve ser executada sem confirmação explícita do usuário.**

### Infra/Deploy

`Sem impacto esperado.`

## Arquivos provavelmente afetados

**Backend:**

- `backend/src/routes/expenses.ts`
- `backend/src/routes/incomes.ts`
- `backend/src/routes/cards.ts`
- Novo helper de validação (local a definir)

**Frontend:** nenhum.

**Banco:** sem migration; correção de dados.

## Estratégia de implementação

**Etapa 1 — Helper de validação**

1. Criar helper que valida se o usuário pode gravar na conta informada, cobrindo dono e membro vinculado ativo
2. Reaproveitar o padrão de `resolveAccountType` em `categories.ts`, sem duplicar a consulta

**Etapa 2 — Aplicar nas rotas de escrita**

3. `POST` e `PUT` de despesas
4. `POST` e `PUT` de receitas
5. `POST` e `PUT` de cartões
6. Conferir que `conta_id` nulo continua aceito

**Etapa 3 — Validação de código**

7. `npx vite build` e `npm run build` no backend
8. Testar no ambiente local: cadastro e edição nos três fluxos, com a conta ativa normal

**Etapa 4 — Limpeza de resíduo (local primeiro)**

9. Backup em tabela das linhas afetadas
10. Remover as 3 despesas e 1 receita de outros usuários na conta 17
11. Remover as 31 categorias órfãs
12. Conferir que os totais do usuário 1 não mudaram indevidamente

**Etapa 5 — Produção**

13. Repetir a limpeza em produção, com confirmação explícita, após o deploy do código

## Regras de negócio identificadas

- Um lançamento pertence a um **usuário** (`usuario_id`) e a uma **conta** (`conta_id`)
- `conta_id` nulo significa "conta pessoal do dono" — comportamento de compatibilidade com registros antigos
- Um usuário pode gravar numa conta se for **dono** dela ou **membro vinculado ativo**
- Membro vinculado não possui conta própria: enxerga apenas a conta do gestor ([accounts.ts:15-21](../backend/src/routes/accounts.ts#L15-L21))
- Colaborador é o mesmo que membro, com rótulo diferente em conta empresa
- A leitura já isola por `usuario_id`; a escrita é que não valida a conta

## Regras multi-tenant e segurança

Projeto não é multi-tenant de organizações, mas **o isolamento por conta tem a mesma natureza** — e é exatamente o que este plano corrige.

- **A origem confiável é o token autenticado** (`req.user!.id`), nunca o `conta_id` do corpo da requisição
- A validação deve consultar `contas` e `conta_membros` no backend, sem confiar em nada vindo do cliente
- A mensagem de erro deve ser genérica: não revelar se a conta existe nem a quem pertence
- Não alterar `resolveVisibleUserIds`, `resolveVisibleCardOwnerIds` nem `familyVisibility` — a visibilidade de leitura já está correta
- A limpeza de dados deve ser restrita por `WHERE` explícito, com backup antes

## Validações necessárias

- `conta_id` ausente ou nulo: aceito, significa conta pessoal do dono
- `conta_id` de conta do próprio usuário: aceito
- `conta_id` de conta onde o usuário é membro ativo: aceito
- `conta_id` de conta de terceiro: **rejeitado com 400**
- `conta_id` inexistente: **rejeitado com 400**, mesma mensagem do caso anterior

## Testes necessários

### Backend

- Criar despesa, receita e cartão com a conta ativa normal — deve funcionar
- Editar os três com a conta ativa normal — deve funcionar
- Criar com `conta_id` nulo — deve funcionar (compatibilidade)
- Criar com `conta_id` de outro usuário — deve retornar 400
- Confirmar que a mensagem não revela existência ou dono da conta

### Frontend

- Fluxo completo de cadastro e edição de despesa, receita e cartão via `/run`
- Confirmar que nenhum fluxo normal passou a receber 400

### E2E

Não aplicável — sem infraestrutura de E2E no projeto.

## Comandos de validação sugeridos

```bash
npx vite build
cd backend && npm run build
```

Validação funcional via `/run`, com o backend no banco local (`npm run dev` usa `.env.dev`).

## Riscos e pontos de atenção

| Risco | Gravidade | Mitigação |
|---|---|---|
| Validação quebrar a carteira compartilhada | **Alta** | O helper precisa aceitar membro vinculado, não só dono. Testar os dois casos |
| Validação rejeitar `conta_id` nulo | Média | Caso explícito nos testes; o `accountFilter` depende desse comportamento |
| Remover categoria ainda referenciada | Média | Remover lançamentos antes das categorias; só a 501 tem uso |
| Frontend receber 400 em fluxo normal | Baixa | A lista de contas já vem filtrada pelo backend |
| Outras rotas terem a mesma falha | **Não avaliado** | Contratos, clientes e compromissos não foram auditados |

## Perguntas em aberto

- As 3 despesas e 1 receita da Mirian somam **R$ 6.200,00** nos totais da conta 17. São reconhecidamente dados de teste de 05/01/2026 — confirmar a remoção antes de executar
- Os usuários 11 (`teste`) e 12 (`Aether Software`) tiveram suas contas apagadas na consolidação, mas os cadastros seguem ativos. Devem ser desativados?
- Contratos, clientes, compromissos e representantes não foram auditados quanto ao mesmo problema de validação — vale uma segunda rodada?

## Critérios de aceite do plano

- `POST` e `PUT` de despesas, receitas e cartões rejeitam `conta_id` de terceiros com 400
- Os mesmos endpoints continuam aceitando a conta do próprio usuário e `conta_id` nulo
- Um membro vinculado ativo consegue gravar na conta do gestor
- A mensagem de erro não revela existência nem propriedade da conta
- Nenhum registro de outro usuário permanece com `conta_id = 17`
- O total de despesas do usuário 1 permanece 546 após a limpeza
- Backup das linhas removidas existe antes da remoção
- `npx vite build` e o build do backend concluem sem erros
- `npx tsc --noEmit` continua limpo

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- **O helper precisa aceitar membro vinculado ativo**, não apenas o dono da conta — do contrário a carteira compartilhada quebra quando for usada
- Reaproveitar o padrão de `categories.ts:183`, não criar mecanismo paralelo
- **Rodar a limpeza no banco local primeiro**, conferir, e só então propor produção
- **Não executar nenhuma remoção em produção sem confirmação explícita do usuário no momento**
- Ordem da limpeza: lançamentos antes das categorias
- Não alterar a lógica de leitura nem `familyVisibility`
- Não alterar `.env`
- Manter as alterações focadas: sem refactor oportunista
