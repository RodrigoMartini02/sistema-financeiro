-- 0061: saem contas.aporte_inicial (o "Saldo inicial" da conta PJ — a conta
-- deixou de ter saldo de abertura; o capital dos sócios entra no saldo só
-- quando é lançado como receita) e membro_permissoes.acesso_socios (a tela
-- "Sócios" saiu: os sócios ficam no modal da conta, editados só pelo titular).
--
-- Diagnóstico prévio (2026-10-02, somente leitura, produção): nenhuma conta
-- com aporte_inicial preenchido e nenhum membro com acesso_socios = true.
--
-- ORDEM: aplicar só DEPOIS do deploy do código novo. O código anterior lê as
-- duas colunas (GET /api/contas e as permissões dos membros). Idempotente.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.
ALTER TABLE contas DROP COLUMN IF EXISTS aporte_inicial;

ALTER TABLE membro_permissoes DROP COLUMN IF EXISTS acesso_socios;
