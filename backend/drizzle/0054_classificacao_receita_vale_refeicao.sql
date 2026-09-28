-- 0054: "Vale refeição" entra no grupo "Emprego" das classificações de receita
-- padrão das contas pessoais (PF), ao lado de Salário, 13º e Férias. Só dados,
-- idempotente.
--
-- A lista padrão do código (incomeClassificationDefaults.ts) já traz o item para
-- contas novas; aqui ele chega às contas que já existem. Não inclui quando o dono
-- já tem um item com esse nome no catálogo pessoal (padrão ou criado na conta),
-- para não aparecer duplicado.
INSERT INTO classificacoes_receita (usuario_id, tipo, nome, parent_id)
SELECT emprego.usuario_id, 'pessoal', 'Vale refeição', emprego.id
  FROM classificacoes_receita emprego
 WHERE emprego.conta_id IS NULL
   AND emprego.tipo = 'pessoal'
   AND emprego.parent_id IS NULL
   AND LOWER(emprego.nome) = 'emprego'
   AND NOT EXISTS (
     SELECT 1
       FROM classificacoes_receita existente
      WHERE existente.usuario_id = emprego.usuario_id
        AND LOWER(existente.nome) = 'vale refeição'
        AND (
          (existente.conta_id IS NULL AND existente.tipo = 'pessoal')
          OR existente.conta_id IN (SELECT id FROM contas WHERE tipo = 'pessoal')
        )
   )
ON CONFLICT (usuario_id, LOWER(nome), tipo) WHERE conta_id IS NULL DO NOTHING;
