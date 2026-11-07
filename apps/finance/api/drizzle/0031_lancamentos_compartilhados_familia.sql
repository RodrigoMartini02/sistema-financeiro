-- Carteira compartilhada da familia.
--
-- Em conta pessoal os lancamentos passam a pertencer a conta, nao ao usuario
-- que os cadastrou — `usuario_id` continua existindo, mas so como autoria.
-- Estas duas flags controlam quem enxerga e quem altera o que os outros
-- membros lancaram.
--
-- Ambas nascem false, seguindo a regra ja aplicada as demais: membro novo
-- nao acessa nada ate o gestor liberar.
--
-- Conta empresa nao e afetada: la o isolamento por usuario permanece.
--
-- Do not execute automatically. Confirm the target database before applying.

ALTER TABLE membro_permissoes
  ADD COLUMN IF NOT EXISTS acesso_lancamentos_familia BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS editar_lancamentos_familia BOOLEAN NOT NULL DEFAULT false;
