# Plano de Implementação: Renomear categorias padrão de empresa (Consultoria e Estabelecimento)

## Origem

- Arquivo de especificação: nenhum `.md` de feature fornecido — plano originado de pedido direto do usuário.
- Data do planejamento: `2026-08-19`
- Classificação: `backend-only (código) + atualização pontual de dados em produção`

## Resumo

Renomear duas categorias padrão de empresa: "Jurídico/Consultoria" → "Consultoria" e "Aluguel/Condomínio" → "Estabelecimento". Isso muda a constante `BUSINESS_DEFAULT_CATEGORIES` (afeta perfis empresa criados a partir de agora) e atualiza via `UPDATE` os dois registros já existentes no banco real (criados nesta sessão para `usuario_id=1`, perfis "Aether"/"PJ").

## Escopo

### Dentro do escopo

- `backend/src/services/defaultCategories.ts`: alterar as duas strings na constante `BUSINESS_DEFAULT_CATEGORIES`.
- `UPDATE categorias SET nome = 'Consultoria' WHERE id = 871` e `UPDATE categorias SET nome = 'Estabelecimento' WHERE id = 863` no banco de produção real — confirmando o `DATABASE_URL` ativo antes de rodar, e reconfirmando os ids/nomes atuais imediatamente antes do UPDATE.

### Fora do escopo

- `PERSONAL_DEFAULT_CATEGORIES` — não muda.
- Qualquer outra categoria (padrão ou custom) — não afetada.
- Schema, endpoints, frontend — sem mudança.

## Leitura de contexto

- `AGENT.md`/`CLAUDE.md` da raiz — lidos (mesma ressalva de sempre: seções multi-tenant/prefeitura não se aplicam a este projeto).
- `backend/src/services/defaultCategories.ts` — lido, conteúdo atual confirmado (14 categorias em `BUSINESS_DEFAULT_CATEGORIES`, incluindo "Jurídico/Consultoria" e "Aluguel/Condomínio").

## Impacto por área

### Frontend

`Sem impacto esperado`.

### Backend

- `backend/src/services/defaultCategories.ts`: duas linhas de string alteradas em `BUSINESS_DEFAULT_CATEGORIES` — `'Jurídico/Consultoria'` → `'Consultoria'`, `'Aluguel/Condomínio'` → `'Estabelecimento'`.

### Banco de dados

- Dois `UPDATE` pontuais nos registros já criados nesta sessão (id 871 = "Jurídico/Consultoria", id 863 = "Aluguel/Condomínio", ambos `usuario_id=1`, `tipo='empresa'`), sem mudança de schema — apenas conteúdo do campo `nome`.

Atenção: nenhuma migration de schema envolvida — é UPDATE de conteúdo, mas ainda assim só será executado após confirmação explícita e verificação do banco-alvo (produção real), pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `backend/src/services/defaultCategories.ts`

## Estratégia de implementação

1. Editar `BUSINESS_DEFAULT_CATEGORIES` em `defaultCategories.ts`: trocar `'Jurídico/Consultoria'` por `'Consultoria'` e `'Aluguel/Condomínio'` por `'Estabelecimento'`.
2. Rodar build do backend (`tsc --noEmit`).
3. Confirmar `DATABASE_URL` ativo antes de qualquer execução no banco.
4. Reconfirmar via `SELECT` que os ids 871/863 ainda correspondem aos nomes esperados antes do UPDATE.
5. Aplicar os dois `UPDATE` nos registros existentes.
6. Confirmar visualmente (nova consulta) que os nomes foram atualizados corretamente.

## Regras de negócio identificadas

- Categorias padrão de empresa recém-criadas (a partir desta mudança) usam os nomes "Consultoria" e "Estabelecimento".
- Registros já existentes no banco (criados antes desta mudança) são corrigidos manualmente via UPDATE pontual — não há migração automática retroativa geral, só os dois registros conhecidos desta sessão.

## Validações necessárias

- Confirmar que os ids 871/863 realmente correspondem aos nomes "Jurídico/Consultoria"/"Aluguel/Condomínio" imediatamente antes do UPDATE (evitar atualizar registro errado caso algo tenha mudado entre a criação e este plano).

## Testes necessários

### Backend

- `tsc --noEmit` passa sem erros após a alteração da constante.

### E2E

- Criar um novo perfil empresa (teste manual, fora deste plano se não solicitado) e confirmar que nasce com "Consultoria" e "Estabelecimento" em vez dos nomes antigos.
- Verificar na tela de Categorias, com perfil PJ/Aether ativo, que os dois nomes aparecem atualizados.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas/backend" run build
```

## Riscos e pontos de atenção

- Baixo risco técnico — mudança de string isolada, sem afetar lógica de negócio.
- Os ids 871/863 são específicos desta sessão (categorias criadas há pouco); serão reconfirmados por nome antes do UPDATE para evitar atualizar o registro errado caso a suposição de id esteja desatualizada.
- Ambiente é produção real (confirmado em sessões anteriores) — UPDATE só roda após confirmação explícita do banco-alvo.

## Perguntas em aberto

`Nenhuma pergunta em aberto identificada.`

## Critérios de aceite do plano

- Novos perfis empresa nascem com "Consultoria" e "Estabelecimento" em vez dos nomes antigos.
- Os dois registros já existentes (ids 871/863) refletem os novos nomes no banco real.
- Build do backend passa sem erros.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Confirmar `DATABASE_URL` ativo antes de qualquer UPDATE.
- Reconfirmar por nome (não só por id) os registros antes de atualizar.
- Mudança pequena e isolada — não expandir escopo para outras categorias.
