-- 0084: remove o lançamento automático mês a mês da receita fixa (plano
-- .plans/receita-fixa-ano-previsto.md). Ligar a fixa já grava as previstas
-- do ano (0083), então lancar_automatico e automatico_desde não têm mais uso.
--
-- ORDEM: aplicar DEPOIS do deploy do código novo, que já não lê nem grava
-- essas colunas. Antes do deploy, o código anterior ainda as usa.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

ALTER TABLE classificacoes_receita_fixas
  DROP COLUMN IF EXISTS lancar_automatico,
  DROP COLUMN IF EXISTS automatico_desde;
