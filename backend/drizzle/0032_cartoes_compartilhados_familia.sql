-- Cartoes na carteira compartilhada da familia.
--
-- Cartao continua pertencendo a quem o cadastrou — esta flag libera apenas
-- VER e USAR o cartao de outro membro ao registrar um lancamento. Editar ou
-- excluir cartao alheio segue fora de alcance.
--
-- O limite consumido acompanha o cartao, nao o autor: lancar no cartao de
-- outra pessoa consome o limite dela, porque a fatura e dela.
--
-- Nasce false, como as demais: membro novo nao acessa nada ate o gestor
-- liberar. Conta empresa nao e afetada.
--
-- Do not execute automatically. Confirm the target database before applying.

ALTER TABLE membro_permissoes
  ADD COLUMN IF NOT EXISTS acesso_cartoes_familia BOOLEAN NOT NULL DEFAULT false;
