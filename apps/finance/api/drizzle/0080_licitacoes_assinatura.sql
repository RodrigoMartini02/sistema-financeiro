-- 0080: módulo de Licitações vendido à parte: assinatura da conta.
--
-- A conta tem o módulo por cortesia (dada pelo admin, sem cobrança e sem limite
-- de usuários) ou por assinatura (15 dias de teste e depois R$ 4,99/mês com 2
-- usuários, mais R$ 2,99 por usuário). Os dados ficam na própria
-- conta_habilitada (plano .plans/licitacoes-produto.md, decisão 6):
--   tipo_acesso          cortesia ou assinatura. O padrão, cortesia, faz as
--                        contas habilitadas até aqui seguirem sem cobrança;
--   teste_ate            fim do teste de 15 dias;
--   pago_ate             fim do período pago (Pix, cartão avulso ou checkout);
--   recorrente_id        assinatura recorrente ativa no Mercado Pago;
--   usuarios_cobrados    usuários contados na última cobrança;
--   ultimo_pagamento_id  último pagamento aplicado (o aviso pode chegar repetido).
--
-- A regra de acesso fica numa função só, usada pela trava da API e pelos avisos
-- do coletor. O coletor roda com o usuário restrito licitacoes_coletor, que
-- precisa de permissão para executar a função nova (concedida abaixo, se o
-- usuário existir; no banco local o coletor usa o usuário do app).
--
-- Só acrescenta: o código atual continua funcionando com as colunas novas.
--
-- ORDEM: aplicar depois da 0079 e ANTES do deploy do código que a usa (sem as
-- colunas e a função, a trava do módulo falha).
--
-- REVERSÃO:
--   DROP FUNCTION licitacoes.fn_conta_com_acesso(licitacoes.conta_habilitada);
--   ALTER TABLE licitacoes.conta_habilitada
--     DROP COLUMN tipo_acesso, DROP COLUMN teste_ate, DROP COLUMN pago_ate,
--     DROP COLUMN recorrente_id, DROP COLUMN usuarios_cobrados,
--     DROP COLUMN ultimo_pagamento_id, DROP COLUMN atualizada_em;
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

ALTER TABLE licitacoes.conta_habilitada
  ADD COLUMN tipo_acesso VARCHAR(12) NOT NULL DEFAULT 'cortesia'
    CHECK (tipo_acesso IN ('cortesia', 'assinatura')),
  ADD COLUMN teste_ate TIMESTAMPTZ,
  ADD COLUMN pago_ate TIMESTAMPTZ,
  ADD COLUMN recorrente_id VARCHAR(100),
  ADD COLUMN usuarios_cobrados INTEGER,
  ADD COLUMN ultimo_pagamento_id VARCHAR(40),
  ADD COLUMN atualizada_em TIMESTAMPTZ NOT NULL DEFAULT now();

-- Acesso ao módulo: conta ligada e com cortesia, assinatura recorrente ativa ou
-- teste ou período pago ainda valendo.
CREATE FUNCTION licitacoes.fn_conta_com_acesso(h licitacoes.conta_habilitada) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT h.ativa AND (
    h.tipo_acesso = 'cortesia'
    OR h.recorrente_id IS NOT NULL
    OR coalesce(greatest(h.teste_ate, h.pago_ate) > now(), false)
  )
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licitacoes_coletor') THEN
    GRANT EXECUTE ON FUNCTION licitacoes.fn_conta_com_acesso(licitacoes.conta_habilitada) TO licitacoes_coletor;
  END IF;
END
$$;
