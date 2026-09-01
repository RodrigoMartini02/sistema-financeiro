-- Migracao de DADOS (nao apenas schema) — classifica cartoes existentes
-- como 'credito' quando ja ha despesas de credito vinculadas a eles.
--
-- Nao infere 'debito' para nenhum cartao: no levantamento realizado antes
-- desta migracao, todas as despesas com cartao_id preenchido eram de
-- credito (forma_pagamento IN ('credito', 'cartao_credito')) — nenhuma
-- despesa de debito tinha cartao vinculado na pratica. Cartoes sem uso de
-- credito comprovado ficam com tipo NULL, pendentes de classificacao
-- manual pelo usuario.
--
-- Do not execute automatically. Confirm the target database before applying.

UPDATE cartoes
SET tipo = 'credito'
WHERE tipo IS NULL
  AND id IN (
    SELECT DISTINCT cartao_id
    FROM despesas
    WHERE cartao_id IS NOT NULL
      AND forma_pagamento IN ('credito', 'cartao_credito')
  );
