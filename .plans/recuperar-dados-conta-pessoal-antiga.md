# Plano de Implementação: Recuperar dados da conta pessoal antiga

## Origem

- Arquivo de especificação: relato do usuário no chat — categorias sumidas (screenshot com Barbearia, Vestimenta, Moradia, Transporte, Academia) e suspeita de exclusão de dados em produção
- Data do planejamento: 2026-09-06
- Classificação: `database` (correção de dados em produção; nenhum código alterado)
- Branch: `refactor/R/padronizar-modal-configuracoes`

## Resumo

Categorias, despesas e receitas do usuário 1 ficaram vinculadas a uma conta pessoal desativada (conta 3) quando ela foi substituída pela conta 17. Os dados estão íntegros no banco, mas invisíveis na interface porque o filtro por conta os exclui corretamente.

Este plano migra esses registros da conta 3 para a conta 17.

**Nenhuma alteração de código.** Apenas `UPDATE` de `conta_id` em três tabelas.

## Decisões aplicadas

- Decisão 1: **opção 1** — migrar tudo (categorias, despesas e receitas).
- Decisão 2: **opção 1** — a conta 3 permanece desativada e vazia, como registro histórico.

## Diagnóstico

Levantado por consulta somente-leitura ao banco de produção (sessão em `SET TRANSACTION READ ONLY`).

### As contas do usuário 1

| Conta | Nome | Tipo | Ativa |
|---|---|---|---|
| 3 | Pessoal | pessoal | **false** |
| 5 | PJ | empresa | true |
| 8 | Aether | empresa | true |
| 17 | RODRIGO MARTINI | pessoal | true |

### O que ficou preso na conta 3

| Item | Quantidade |
|---|---|
| Categorias | 18 |
| Despesas | 103 |
| Receitas | 8 |
| Cartões | 0 |
| Reservas | 0 |

Despesas por mês: 2026-04 (84), 2026-05 (18), 2026-07 (1). Isso corresponde ao relato anterior do usuário sobre lançamentos sumidos a partir de abril.

### Nada foi excluído

- Consulta de integridade referencial retornou **zero** despesas apontando para categoria inexistente. Se houvesse exclusão, essas linhas apareceriam.
- Nenhum commit desta sessão contém migration, `INSERT`, `UPDATE`, `DELETE` ou DDL — verificado nos sete commits.
- A migration `0018b` nunca foi executada; está registrada como fora de escopo em dois planos anteriores.

### Por que os dados sumiram da tela

O filtro de categorias exige `c.tipo = <tipo da conta> OR c.conta_id = <conta ativa>`. As 18 categorias têm `tipo` nulo e `conta_id = 3`, então não aparecem na conta 17 — comportamento correto do filtro, dado o estado dos dados.

Para despesas e receitas, `utils/accountFilter.ts` resgata registros com `conta_id` NULL na conta pessoal, mas **não** resgata `conta_id = 3` explícito quando a conta ativa é a 17.

## Escopo

### Dentro do escopo

- Migrar as 18 categorias da conta 3 para a conta 17.
- Migrar as 103 despesas da conta 3 para a conta 17.
- Migrar as 8 receitas da conta 3 para a conta 17.
- Verificar contagens antes e depois.
- Varrer todas as tabelas com coluna `conta_id` procurando sobras apontando para a conta 3.
- Registrar o comando de reversão.

### Fora do escopo

- Alteração de código, schema ou migrations de estrutura.
- Excluir ou reativar a conta 3 (permanece desativada e vazia).
- Dados de outros usuários (4, 11, 12) — verificados, sem órfãos.
- Reverter o commit `d9dbda3`: o resgate de órfãs que ele adiciona não tem efeito aqui (não há órfãs em produção), mas permanece como rede de segurança.
- Demais pendências de UI.

## Leitura de contexto

- `CLAUDE.md` da raiz e do `sistema financas`
- `backend/src/routes/categories.ts` (filtro de categorias)
- `backend/src/utils/accountFilter.ts` (filtro de despesas e receitas)
- `backend/src/services/cardLimitService.ts`
- Banco de produção, via consultas somente-leitura
- Não existem `frontend/AGENT.md` nem `backend/AGENT.md` neste projeto: o `CLAUDE.md` da raiz cobre todo o repositório.

## Impacto por área

### Frontend

Sem impacto esperado. Nenhum arquivo alterado.

### Backend

Sem impacto esperado. Nenhum arquivo alterado.

### Banco de dados

Três `UPDATE` na base de produção, todos alterando apenas a coluna `conta_id`:

```sql
UPDATE categorias SET conta_id = 17 WHERE usuario_id = 1 AND conta_id = 3;
UPDATE despesas   SET conta_id = 17 WHERE usuario_id = 1 AND conta_id = 3;
UPDATE receitas   SET conta_id = 17 WHERE usuario_id = 1 AND conta_id = 3;
```

Devem rodar em **transação única**: ou tudo aplica, ou nada.

Nenhuma alteração de schema. Nenhuma migration.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual aponta para produção — confirmado, o `DATABASE_URL` do `.env` aponta para o Render.

### Infra/Deploy

Sem impacto esperado. Não requer deploy: a mudança é de dados, visível na próxima consulta.

## Dados para reversão

Ids das 18 categorias:

```
823, 824, 825, 826, 827, 828, 829, 830, 831, 832,
833, 834, 835, 841, 849, 857, 858, 859
```

Nomes correspondentes: Academia, Barbearia, Combustível, Empréstimo, Estudos, Farmácia, Mecânica, Móveis, Salão, Streaming, Trabalho, Uber, Vestimenta, Energético, Sistema, Telefonia, Pedágio, Imposto.

Os ids de despesas e receitas devem ser capturados na etapa 1 da execução, antes do `UPDATE`, e registrados no resumo final.

Comando de reversão das categorias:

```sql
UPDATE categorias SET conta_id = 3
 WHERE id IN (823,824,825,826,827,828,829,830,831,832,833,834,835,841,849,857,858,859);
```

## Estratégia de implementação

1. Capturar e registrar as contagens antes: categorias, despesas e receitas com `conta_id = 3` e com `conta_id = 17`, para o usuário 1. Capturar os ids das despesas e receitas afetadas.
2. Abrir transação e executar os três `UPDATE`.
3. Conferir as contagens dentro da transação: a conta 3 deve zerar e a 17 deve receber exatamente o que saiu.
4. Se as contagens baterem, confirmar a transação; caso contrário, desfazer e reportar.
5. Varrer todas as tabelas que possuem coluna `conta_id` procurando registros remanescentes apontando para a conta 3.
6. Reportar no resumo: contagens antes e depois, ids capturados, sobras encontradas e o comando de reversão pronto.

## Regras de negócio identificadas

- Categoria com `conta_id` preenchido é exclusiva daquela conta (categoria CUSTOM).
- Categoria com `tipo` preenchido e `conta_id` nulo é global por tipo de conta (categoria PADRÃO).
- Despesa e receita sem `conta_id` são tratadas como da conta pessoal do dono; com `conta_id` explícito, pertencem apenas àquela conta.
- Uma conta desativada não aparece na troca de contas, mas seus dados continuam no banco.
- A categoria 823 (Academia) é subcategoria da 809 (Alimentação), que é global (`tipo = 'pessoal'`, `conta_id` nulo). O vínculo `parent_id` permanece válido após a migração.

## Regras multi-tenant e segurança

O projeto não é multi-tenant por organização: o isolamento é por `usuario_id`.

Todos os `UPDATE` incluem `usuario_id = 1` além de `conta_id = 3`, garantindo que nenhum dado de outro usuário seja tocado. As contas 3 e 17 pertencem ambas ao usuário 1 — verificado.

Dados dos usuários 4, 11 e 12 foram verificados e estão íntegros; nenhum será alterado.

## Validações necessárias

- Índice único `idx_categorias_usuario_nome_conta_custom` cobre `(usuario_id, LOWER(nome), conta_id)`. Verificado: **nenhum conflito de nome** entre as categorias da conta 3 e as da conta 17. A migração não viola o índice.
- As contagens antes e depois devem bater exatamente.

## Testes necessários

### Frontend

Verificação manual após a migração, com a conta 17 ativa:
- As 18 categorias aparecem no select de categorias.
- As despesas de abril, maio e julho de 2026 aparecem na tabela.
- As receitas migradas aparecem na tela de receitas.

### Backend

Nenhum teste automatizado aplicável — a alteração é de dados, não de código. A suíte existente (23 testes) não é afetada.

### E2E

Não aplicável — projeto não tem E2E configurado.

## Comandos de validação sugeridos

Não há build a rodar: nenhum arquivo de código é alterado.

A validação é a conferência de contagens descrita na estratégia, mais a verificação manual na interface.

## Riscos e pontos de atenção

- **Alto: escrita no banco de produção.** Mitigado por transação única (tudo ou nada) e conferência de contagens antes do commit.
- **Médio:** despesas e receitas são identificadas por `conta_id = 3` no momento da execução, não por lista fixa de ids. Se algo mudar entre o diagnóstico e a execução, a conferência de contagens denuncia a diferença.
- **Médio:** a operação não tem "desfazer" automático. A reversão depende dos ids capturados na etapa 1 — se essa etapa falhar, não executar os `UPDATE`.
- **Baixo:** índice único verificado, sem conflito.
- **Observação:** o usuário deve estar ciente de que, após a migração, os lançamentos de abril, maio e julho passarão a aparecer na conta ativa, alterando saldos e totais exibidos. Isso é o resultado correto, mas muda números que ele vê hoje.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada. As duas decisões pendentes foram respondidas e estão registradas em "Decisões aplicadas".

## Critérios de aceite do plano

- As 18 categorias passam a ter `conta_id = 17`.
- As 103 despesas passam a ter `conta_id = 17`.
- As 8 receitas passam a ter `conta_id = 17`.
- A conta 3 fica sem nenhum registro nas três tabelas.
- Nenhum dado de outro usuário é alterado.
- As contagens antes e depois batem exatamente.
- A varredura por sobras apontando para a conta 3 é executada e reportada.
- O comando de reversão está registrado no resumo final, com os ids reais.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- **Pedir confirmação explícita do usuário antes de executar os `UPDATE`**, mesmo com este plano aprovado: a regra do projeto exige confirmação a cada escrita em produção.
- Executar os três `UPDATE` em transação única.
- Capturar os ids de despesas e receitas ANTES do `UPDATE`; sem isso, não há reversão possível.
- Abortar e reportar se as contagens não baterem.
- Não excluir nem reativar a conta 3.
- Não alterar nenhum arquivo de código.
- Não executar migrations de schema.
- Não alterar `.env`.
- Registrar no resumo final as contagens antes/depois, os ids capturados e o comando de reversão.
