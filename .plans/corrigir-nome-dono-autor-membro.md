# Plano de Implementação: Nome do dono nas telas de autor/membro

## Origem

- Arquivo de especificação: nenhum `.md` fornecido — especificação construída interativamente (pedido do usuário + investigação de código).
- Data do planejamento: `2026-09-17`
- Classificação: `backend-only`

## Resumo

Três rotas do backend (`GET /account-members/summary`, `GET /incomes`, `GET /expenses`) buscam o nome de exibição de autores/membros direto de `usuarios.nome`, ignorando que o dono/gestor pode ter editado um nome diferente em `contas.nome` (a conta padrão dele). `usuarios.nome` e `contas.nome` são colunas independentes, nunca sincronizadas — o primeiro vem do cadastro/login original (às vezes em caixa alta, de import), o segundo é o que a pessoa realmente digitou/editou na tela de Contas. Isso faz o dono aparecer com o nome bruto (ex: "RODRIGO MARTINI") nos gráficos/filtro por membro do painel financeiro e na coluna "Usuário" das tabelas de Receitas/Despesas, mesmo tendo corrigido o nome na própria conta (ex: "Rodrigo Martini").

## Escopo

### Dentro do escopo

- `backend/src/routes/accountMembers.ts`, rota `GET /summary`: query de nomes dos autores (por volta da linha 458-461) passa a preferir `contas.nome` (conta padrão) quando o usuário tiver uma.
- `backend/src/routes/incomes.ts`, rota `GET /` (por volta da linha 36-41): `autor_nome` passa a preferir `contas.nome` do autor quando ele for dono de uma conta.
- `backend/src/routes/expenses.ts`, rota `GET /` (por volta da linha 208-219): mesma correção em `autor_nome`.

### Fora do escopo

- Qualquer mudança em `usuarios.nome` no banco — não normalizar o dado em si, só a exibição.
- Qualquer mudança na tela de gestão de Membros dentro de Contas (`accountMembers.ts:84-97`, lista de `conta_membros`) — essa lista nunca inclui o dono, então não é afetada pelo bug.
- Qualquer mudança de frontend — os tipos (`autorNome?: string | null`) e o formato de resposta não mudam, só o valor.
- Qualquer mudança em Categorias, Contas ou Permissões além do necessário para esta correção pontual de nome.

## Leitura de contexto

- `/AGENT.md` (raiz) e `sistema financas/AGENT.md` — lidos (idênticos).
- Não existem `frontend/AGENT.md`/`backend/AGENT.md` dedicados.
- Arquivos investigados: `backend/src/routes/accountMembers.ts`, `backend/src/routes/incomes.ts`, `backend/src/routes/expenses.ts`, `backend/src/db/schema/accounts.ts`, `src/types/finance.ts`.
- Confirmado via grep que não há outros pontos no backend com o mesmo padrão de exibir nome de autor/membro direto de `usuarios.nome` sem considerar `contas.nome` (outros usos de `FROM usuarios` em `plans.ts`, `ratings.ts`, `analytics.ts`, `auth.ts`, `users.ts` são internos, não expõem "nome do autor" na UI de lançamentos/gráficos).

## Impacto por área

### Frontend

`Sem impacto esperado` — os tipos (`Income.autorNome`, `Expense.autorNome`, `membros: { usuario_id, nome }[]`) e o shape JSON de resposta permanecem idênticos; só o valor da string muda.

### Backend

- `backend/src/routes/accountMembers.ts`: na query `SELECT id AS usuario_id, nome FROM usuarios WHERE id = ANY($1)`, adicionar `LEFT JOIN contas ct ON ct.usuario_id = u.id AND ct.eh_padrao = true` e trocar a coluna de nome para `COALESCE(ct.nome, u.nome) AS nome`.
- `backend/src/routes/incomes.ts`: na query de `GET /`, adicionar o mesmo `LEFT JOIN contas` e trocar `u.nome AS autor_nome` por `COALESCE(ct.nome, u.nome) AS autor_nome`.
- `backend/src/routes/expenses.ts`: mesma alteração na query de `GET /`.
- Nenhuma mudança de permissão/autorização — a correção é só de exibição de nome, não afeta quem pode ver o quê.

### Banco de dados

`Sem impacto esperado` — nenhuma coluna ou tabela nova, nenhuma migration.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/routes/accountMembers.ts`
- `backend/src/routes/incomes.ts`
- `backend/src/routes/expenses.ts`

## Estratégia de implementação

1. Em `accountMembers.ts`, ajustar a query de nomes em `GET /summary` para fazer `LEFT JOIN contas` pela condição `usuario_id = u.id AND eh_padrao = true`, e usar `COALESCE(contas.nome, usuarios.nome)`.
2. Em `incomes.ts`, aplicar o mesmo padrão de `LEFT JOIN` + `COALESCE` na query de `GET /` para `autor_nome`.
3. Em `expenses.ts`, aplicar o mesmo padrão na query de `GET /` para `autor_nome`.
4. Rodar `tsc --noEmit` no backend para confirmar que não há erro de tipos.
5. Validar manualmente: consultar como dono (autor com conta própria) e confirmar que o nome exibido é o de `contas.nome`; consultar como membro de família (sem conta própria) e confirmar que o nome continua vindo de `usuarios.nome`, sem regressão.

## Regras de negócio identificadas

- Um usuário só tem uma conta padrão (`eh_padrao = true`) por vez — o `LEFT JOIN` não deve multiplicar linhas, já que a condição é única por `usuario_id`.
- Membro de família (`conta_membros`, sem conta própria) nunca tem uma linha correspondente em `contas.usuario_id`, então o `COALESCE` sempre cai em `usuarios.nome` para ele, preservando o comportamento atual.
- O dono/gestor sempre tem pelo menos uma conta padrão (garantida por `ensureUserHasAccount`, já usada em `auth.ts`), então o `LEFT JOIN` deve sempre encontrar uma linha para ele.

## Regras multi-tenant e segurança

- Este projeto não é multi-tenant/multi-prefeitura (esse contexto pertence a outro subprojeto do monorepo).
- A correção não introduz nenhum acesso novo a dados — só troca a fonte do nome exibido, sem expor nenhuma informação adicional de outro usuário/conta.

## Validações necessárias

- Confirmar que o `LEFT JOIN contas ... eh_padrao = true` nunca retorna mais de uma linha por usuário (checagem de que a constraint de unicidade de conta padrão está garantida no schema/lógica de negócio existente).
- Confirmar que a resposta JSON de cada rota mantém exatamente os mesmos campos e tipos de antes.

## Testes necessários

### Frontend

Não aplicável — sem mudança de frontend.

### Backend

- `GET /account-members/summary` como dono: `membros` retorna o nome da conta padrão do dono, não o nome bruto do cadastro.
- `GET /incomes` e `GET /expenses` como dono: `autor_nome` reflete o nome da conta padrão.
- `GET /incomes` e `GET /expenses` com lançamento de um membro de família (sem conta própria): `autor_nome` continua vindo de `usuarios.nome`, sem regressão.

### E2E

- Fluxo: dono edita o nome da própria conta para algo diferente do cadastro original, lança uma despesa, e confirma que a coluna "Usuário" na tabela mostra o nome atualizado da conta, não o nome antigo do cadastro.

## Comandos de validação sugeridos

```bash
cd backend && npm run build
```

## Riscos e pontos de atenção

- Risco baixo: mudança pontual de SQL em 3 rotas, sem alterar formato de resposta.
- Atenção ao `LEFT JOIN` não introduzir N+1 nem duplicar linhas — a condição `eh_padrao = true` é única por usuário, então não deveria multiplicar resultados, mas vale conferir com uma consulta de teste antes de considerar concluído.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- O dono/gestor aparece com o nome da própria conta padrão (não o nome bruto do cadastro) nos gráficos e filtro por membro do painel financeiro.
- O dono/gestor aparece com o nome da própria conta padrão na coluna "Usuário" das tabelas de Receitas e Despesas.
- Membros de família (sem conta própria) continuam aparecendo com o nome de `usuarios.nome`, sem regressão.
- Nenhuma mudança de contrato de API (mesmos campos, mesmos tipos).

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations (não há necessidade).
- Mudança restrita às 3 rotas listadas — não tocar em `accountMembers.ts:84-97` (lista de gestão de membros, fora do escopo).
- Manter o padrão de SQL bruto (`pool.query`) já usado em cada rota, sem introduzir abstração/helper novo.
