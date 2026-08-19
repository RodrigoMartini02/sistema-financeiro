-- Separa categorias por TIPO de perfil (pessoal/empresa), nao por perfil
-- individual: uma categoria 'empresa' e compartilhada entre TODAS as
-- empresas do usuario, nunca exclusiva de uma empresa especifica.
--
-- Nota: a tabela ja tinha uma coluna perfil_id em producao (adicionada fora
-- de controle de migrations versionadas, hoje 100% NULL) de uma tentativa
-- anterior que segmentava por perfil individual — modelo errado, abandonado.
-- Essa coluna NAO e removida aqui (fica como legado sem uso funcional) para
-- evitar mexer em algo cuja origem/dependencias nao estao mapeadas.
--
-- Do not execute automatically. Confirm the target database before applying.

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS tipo VARCHAR(10);

CREATE INDEX IF NOT EXISTS idx_categorias_tipo ON categorias (tipo);

-- Substitui a constraint de unicidade antiga (usuario_id, nome), que
-- bloquearia o mesmo nome em tipos diferentes (ex: "Transporte" pessoal e
-- "Transporte" empresa), por um indice unico que trata tipo NULL como um
-- tipo proprio ('pessoal') — mesmo nome so pode se repetir entre pessoal e
-- empresa, nunca duas vezes dentro do mesmo tipo.
ALTER TABLE categorias DROP CONSTRAINT IF EXISTS categorias_nome_usuario_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_categorias_usuario_nome_tipo
  ON categorias (usuario_id, LOWER(nome), COALESCE(tipo, 'pessoal'));
