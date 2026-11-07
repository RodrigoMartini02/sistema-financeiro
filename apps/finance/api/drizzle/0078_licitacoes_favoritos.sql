-- 0078: módulo de Licitações: favoritos de cada pessoa.
--
-- Cada pessoa marca editais como favoritos (coração no card, na tabela e no
-- edital), na conta em uso no módulo. O favorito é só da pessoa: os outros da
-- conta não o veem. A tela Favoritos e o filtro "Só favoritos" de Buscar leem
-- esta tabela, e a limpeza da coleta não apaga edital favoritado.
--
-- ORDEM: aplicar depois da 0077 e ANTES do deploy do código que a usa (a busca
-- e o detalhe do edital consultam a tabela e falham sem ela).
--
-- REVERSÃO: DROP TABLE licitacoes.favorito;
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

CREATE TABLE licitacoes.favorito (
  conta_id   INTEGER NOT NULL REFERENCES public.contas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  edital_id  BIGINT  NOT NULL REFERENCES licitacoes.edital(id) ON DELETE CASCADE,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conta_id, usuario_id, edital_id)
);

-- A limpeza da coleta e o detalhe procuram por edital.
CREATE INDEX ix_favorito_edital ON licitacoes.favorito (edital_id);
