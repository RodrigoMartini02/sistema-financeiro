# Plano: Corrigir tabelas do copiloto e planejamento em producao

## Origem

- Task/arquivo de origem: erros nas telas de Integracoes de IA e Planejamento apos a publicacao
- Classificacao: banco de dados e infra/deploy

## Resumo

Aplicar a migration existente `backend/drizzle/0016_copiloto_orcamento_integracoes.sql` no banco de producao. Ela cria as tabelas exigidas pelas rotas de Integracoes de IA e Planejamento, sem alterar receitas, despesas, categorias ou perfis existentes.

## Escopo

### Dentro do escopo

- Confirmar o destino do `DATABASE_URL` sem exibir credenciais.
- Aplicar apenas a migration 0016 no banco configurado para producao.
- Validar a existencia das tabelas criadas e as respostas das telas afetadas.

### Fora do escopo

- Alterar dados financeiros existentes.
- Alterar `.env`, chaves de IA ou configuracao do Render.
- Criar migrations novas ou mudar a interface.

## Leitura de Contexto

- `backend/src/routes/ai-integrations.ts` lista configuracoes em `ia_integracoes`.
- `backend/src/routes/budget.ts` consulta metas em `orcamento_metas` pelo `budgetService`.
- Ambas as rotas devolvem erro 500 generico quando as tabelas nao existem.
- A migration 0016 cria `ia_integracoes`, `copilot_conversas`, `copilot_mensagens`, `orcamento_metas` e `ia_eventos_uso` com `CREATE TABLE IF NOT EXISTS`.

## Impacto por Area

### Frontend

Nenhuma alteracao. As telas devem voltar a receber dados apos o schema estar disponivel.

### Backend

Nenhuma alteracao de codigo. As rotas ja estao publicadas no `main`.

### Banco de Dados

Criacao aditiva de cinco tabelas e indices associados. Nenhuma tabela financeira existente sera modificada.

### Infra/Deploy

Executar manualmente a migration no banco configurado para producao e validar as rotas autenticadas.

## Arquivos Provavelmente Afetados

- `backend/drizzle/0016_copiloto_orcamento_integracoes.sql` - somente executado, sem edicao.
- `.plans/corrigir-tabelas-copiloto-orcamento-producao.md` - registro deste plano.

## Estrategia de Implementacao

1. Exibir host, banco e schema de destino sem mostrar a URL ou credenciais.
2. Aplicar a migration 0016 uma unica vez pelo fluxo do Drizzle.
3. Conferir as cinco tabelas no schema configurado.
4. Reabrir Integracoes de IA e Planejamento e verificar respostas 200 nas rotas correspondentes.

## Seguranca, Dados e Multi-Tenant

- A migration nao atualiza nem remove registros existentes.
- As novas tabelas possuem chaves estrangeiras para usuarios, perfis e categorias quando aplicavel.
- Nenhuma credencial ou valor de `DATABASE_URL` sera exibido em log.

## Validacoes Necessarias

- Confirmacao mascarada de host, banco e schema antes da execucao.
- Aplicacao concluida sem erros.
- Tabelas e indices da migration existentes apos a execucao.
- `GET /api/ai-integracoes` e `GET /api/orcamento/resumo` deixam de responder 500 para usuario autorizado.

## Riscos e Pontos de Atencao

- A execucao ocorre no banco de producao e precisa usar o destino correto.
- O deploy do Render nao executa migrations automaticamente; futuras migrations tambem exigirao procedimento controlado.

## Criterios de Aceite

- As telas Integracoes de IA e Planejamento carregam sem mensagem de erro.
- Receitas, despesas, categorias e perfis previamente cadastrados permanecem inalterados.

## Instrucoes Para /implementar

- Nao editar a migration 0016.
- Confirmar o destino mascarado antes de aplicar.
- Nao executar seeds, resets ou qualquer migration alem da 0016.
