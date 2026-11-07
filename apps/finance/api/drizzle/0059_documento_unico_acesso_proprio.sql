-- 0059: o CPF/CNPJ continua único entre os acessos próprios (titular e admin)
-- e passa a poder repetir em acesso de membro/colaborador (tipo 'membro'): a
-- pessoa que já tem conta própria pode ser colaboradora de outra conta com um
-- login separado, que entra pelo e-mail. Substitui o índice da 0028, que
-- valia para todos os usuários. A regra "não repetir na mesma conta" fica no
-- código (cruza conta_membros).
--
-- ORDEM: aplicar ANTES do deploy do código novo. Só afrouxa a regra — o
-- código anterior continua conferindo o documento em todos os usuários —, e
-- sem ela o código novo falha ao criar colaborador com CPF repetido.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_documento_acesso_proprio_unique
  ON usuarios(documento)
  WHERE documento IS NOT NULL AND (tipo IS NULL OR tipo <> 'membro');

DROP INDEX IF EXISTS usuarios_documento_unique_partial;
