-- 0065: uma vitrine pública por conta PJ, com link amigável (slug), nome,
-- descrição, WhatsApp e logo.
--
-- catalogo.contas é a VITRINE (o nome da tabela é anterior a ela); conta_id
-- aponta para a conta financeira (contas, PJ) dona dela. Até aqui havia uma
-- vitrine por titular; agora há no máximo uma por conta PJ.
--
-- A vitrine que já existe fica com a PJ do dono que tem mais produtos (a ativa
-- e padrão desempatam): o id dela, que é o código do link antigo
-- /catalogo/<id>, continua valendo. O slug nasce nulo e o código gera na
-- primeira leitura, porque tirar acento em SQL exigiria a extensão unaccent.
--
-- logo: data URL da imagem recortada na tela (mesmo formato de usuarios.foto).
-- whatsapp: só dígitos, com o 55 do Brasil.
--
-- ORDEM: aplicar DEPOIS da 0064 (usa a conta dos produtos) e ANTES do deploy
-- do código novo. O código anterior lê a vitrine por usuario_id com LIMIT 1 e
-- continua encontrando a linha migrada.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

ALTER TABLE catalogo.contas
  ADD COLUMN IF NOT EXISTS conta_id INTEGER REFERENCES contas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS slug VARCHAR(60),
  ADD COLUMN IF NOT EXISTS nome VARCHAR(100),
  ADD COLUMN IF NOT EXISTS descricao VARCHAR(280),
  ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(13),
  ADD COLUMN IF NOT EXISTS logo TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

UPDATE catalogo.contas v
   SET conta_id = (
     SELECT c.id
       FROM contas c
       LEFT JOIN catalogo.produtos p ON p.conta_id = c.id
      WHERE c.usuario_id = v.usuario_id AND c.tipo = 'empresa'
      GROUP BY c.id, c.ativo, c.eh_padrao
      ORDER BY COUNT(p.id) DESC, (c.ativo IS NOT FALSE) DESC, c.eh_padrao DESC, c.id
      LIMIT 1)
 WHERE v.conta_id IS NULL;

DROP INDEX IF EXISTS catalogo.idx_catalogo_contas_usuario_unique;
CREATE INDEX IF NOT EXISTS idx_catalogo_contas_usuario ON catalogo.contas (usuario_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_catalogo_contas_conta ON catalogo.contas (conta_id) WHERE conta_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_catalogo_contas_slug ON catalogo.contas (slug) WHERE slug IS NOT NULL;
