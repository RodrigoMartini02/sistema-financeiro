-- Classificação de receitas (etapa 1 de 3 — .plans/classificacao-receitas-etapa-1.md).
--
-- Cria o catálogo de classificações de receita no mesmo molde de `categorias`:
-- PADRÃO do sistema (tipo preenchido, conta_id nulo), global entre as contas do
-- mesmo tipo do dono, OU criada pelo usuário (conta_id preenchido, tipo nulo),
-- exclusiva da conta onde foi criada. Subcategoria de um nível via parent_id.
--
-- Substitui o modelo antigo de "tipo de receita" da conta empresa: os dados de
-- `tipos_receita`, `receitas.tipo_receita` e `comissoes.tipo_receita` são ligados
-- ao catálogo pelo nome e o modelo antigo é apagado no fim (decisão 2 do plano).
--
-- ATENÇÃO: não executar sem confirmação explícita do usuário. O ambiente pode
-- estar apontando para produção. Rodar numa transação única: a conferência antes
-- dos DROPs desfaz tudo se alguma receita ou comissão ficar sem classificação.

CREATE TABLE IF NOT EXISTS classificacoes_receita (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo VARCHAR(10),
  conta_id INTEGER REFERENCES contas(id),
  nome VARCHAR(100) NOT NULL,
  parent_id INTEGER REFERENCES classificacoes_receita(id) ON DELETE CASCADE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  data_criacao TIMESTAMP NOT NULL DEFAULT NOW(),
  data_atualizacao TIMESTAMP NOT NULL DEFAULT NOW(),
  -- Padrão (tipo) ou da conta (conta_id), nunca os dois nem nenhum.
  CONSTRAINT chk_classificacoes_receita_padrao_ou_conta CHECK ((tipo IS NULL) <> (conta_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_classificacoes_receita_padrao
  ON classificacoes_receita (usuario_id, LOWER(nome), tipo)
  WHERE conta_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_classificacoes_receita_conta
  ON classificacoes_receita (usuario_id, LOWER(nome), conta_id)
  WHERE conta_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_classificacoes_receita_usuario ON classificacoes_receita (usuario_id);
CREATE INDEX IF NOT EXISTS idx_classificacoes_receita_conta_id ON classificacoes_receita (conta_id);
CREATE INDEX IF NOT EXISTS idx_classificacoes_receita_parent ON classificacoes_receita (parent_id);

ALTER TABLE receitas
  ADD COLUMN IF NOT EXISTS classificacao_id INTEGER REFERENCES classificacoes_receita(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_receitas_classificacao ON receitas (classificacao_id);

-- Limpar os dados de um usuário apaga o catálogo dele; a regra de comissão
-- vai junto (a exclusão pela tela é bloqueada enquanto houver uso).
ALTER TABLE comissoes
  ADD COLUMN IF NOT EXISTS classificacao_id INTEGER REFERENCES classificacoes_receita(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_comissoes_classificacao ON comissoes (classificacao_id);

ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS classificacao_mensalidade_id INTEGER REFERENCES classificacoes_receita(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classificacao_implantacao_id INTEGER REFERENCES classificacoes_receita(id) ON DELETE SET NULL;

-- Listas padrão (mesmas de backend/src/services/incomeClassificationDefaults.ts),
-- carregadas para cada dono de conta do tipo correspondente. A ordem garante que
-- a raiz exista antes das subcategorias.
DO $$
DECLARE
  dono RECORD;
  item RECORD;
  pai_id INTEGER;
BEGIN
  FOR dono IN SELECT DISTINCT usuario_id, tipo FROM contas WHERE tipo IN ('pessoal', 'empresa') LOOP
    FOR item IN
      SELECT v.nome, v.pai
        FROM (VALUES
          ('pessoal', 1, 'Salário', NULL),
          ('pessoal', 2, '13º', 'Salário'),
          ('pessoal', 3, 'Férias', 'Salário'),
          ('pessoal', 4, 'Benefícios', NULL),
          ('pessoal', 5, 'Aposentadoria', 'Benefícios'),
          ('pessoal', 6, 'Pensão', 'Benefícios'),
          ('pessoal', 7, 'Auxílio', 'Benefícios'),
          ('pessoal', 8, 'Freelance', NULL),
          ('pessoal', 9, 'Aluguéis', NULL),
          ('pessoal', 10, 'Investimentos', NULL),
          ('pessoal', 11, 'Juros', 'Investimentos'),
          ('pessoal', 12, 'Dividendos', 'Investimentos'),
          ('pessoal', 13, 'Vendas', NULL),
          ('pessoal', 14, 'Reembolsos', NULL),
          ('pessoal', 15, 'Outros', NULL),
          ('empresa', 1, 'Contratos', NULL),
          ('empresa', 2, 'Mensalidade', 'Contratos'),
          ('empresa', 3, 'Implantação', 'Contratos'),
          ('empresa', 4, 'Serviços', NULL),
          ('empresa', 5, 'Vendas', NULL),
          ('empresa', 6, 'Rendimentos', NULL),
          ('empresa', 7, 'Reembolsos', NULL),
          ('empresa', 8, 'Outros', NULL)
        ) AS v(tipo, ordem, nome, pai)
       WHERE v.tipo = dono.tipo
       ORDER BY v.ordem
    LOOP
      pai_id := NULL;
      IF item.pai IS NOT NULL THEN
        SELECT id INTO pai_id
          FROM classificacoes_receita
         WHERE usuario_id = dono.usuario_id AND tipo = dono.tipo AND conta_id IS NULL
           AND LOWER(nome) = LOWER(item.pai);
      END IF;
      INSERT INTO classificacoes_receita (usuario_id, tipo, nome, parent_id)
      VALUES (dono.usuario_id, dono.tipo, item.nome, pai_id)
      ON CONFLICT (usuario_id, LOWER(nome), tipo) WHERE conta_id IS NULL DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- Classificação pelo nome no catálogo do dono: prefere a padrão do tipo da
-- conta; senão a criada na conta; senão cria na conta (ou como padrão do tipo,
-- quando não há conta para prender a classificação).
CREATE FUNCTION pg_temp.classificacao_por_nome(p_dono INTEGER, p_tipo TEXT, p_conta INTEGER, p_nome TEXT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  achado INTEGER;
BEGIN
  SELECT id INTO achado
    FROM classificacoes_receita
   WHERE usuario_id = p_dono
     AND LOWER(nome) = LOWER(TRIM(p_nome))
     AND ((conta_id IS NULL AND tipo = p_tipo) OR (p_conta IS NOT NULL AND conta_id = p_conta))
   ORDER BY conta_id NULLS FIRST
   LIMIT 1;
  IF achado IS NOT NULL THEN
    RETURN achado;
  END IF;

  IF p_conta IS NOT NULL THEN
    INSERT INTO classificacoes_receita (usuario_id, conta_id, nome)
    VALUES (p_dono, p_conta, TRIM(p_nome))
    RETURNING id INTO achado;
  ELSE
    INSERT INTO classificacoes_receita (usuario_id, tipo, nome)
    VALUES (p_dono, p_tipo, TRIM(p_nome))
    RETURNING id INTO achado;
  END IF;
  RETURN achado;
END $$;

-- Tipos cadastrados (hoje por usuário) viram classificações de cada empresa dele.
-- Tipo desativado só desativa a classificação criada, nunca uma padrão.
DO $$
DECLARE
  tipo_antigo RECORD;
  conta_empresa RECORD;
  classificacao INTEGER;
BEGIN
  FOR tipo_antigo IN SELECT usuario_id, nome, ativo FROM tipos_receita WHERE TRIM(nome) <> '' LOOP
    FOR conta_empresa IN SELECT id FROM contas WHERE usuario_id = tipo_antigo.usuario_id AND tipo = 'empresa' LOOP
      classificacao := pg_temp.classificacao_por_nome(tipo_antigo.usuario_id, 'empresa', conta_empresa.id, tipo_antigo.nome);
      IF NOT tipo_antigo.ativo THEN
        UPDATE classificacoes_receita SET ativo = false WHERE id = classificacao AND conta_id IS NOT NULL;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Receitas com tipo: catálogo do dono da conta da receita (sem conta, a conta
-- pessoal do autor, como trata utils/accountFilter.ts).
UPDATE receitas r
   SET classificacao_id = pg_temp.classificacao_por_nome(
         COALESCE((SELECT c.usuario_id FROM contas c WHERE c.id = r.conta_id), r.usuario_id),
         COALESCE((SELECT c.tipo FROM contas c WHERE c.id = r.conta_id), 'pessoal'),
         COALESCE(r.conta_id, (SELECT c.id FROM contas c
                                WHERE c.usuario_id = r.usuario_id AND c.tipo = 'pessoal'
                                ORDER BY c.eh_padrao DESC, c.id LIMIT 1)),
         r.tipo_receita)
 WHERE r.tipo_receita IS NOT NULL AND TRIM(r.tipo_receita) <> '';

-- Receitas de contrato sem tipo são as mensalidades geradas pelo contrato.
UPDATE receitas r
   SET classificacao_id = pg_temp.classificacao_por_nome(
         COALESCE((SELECT c.usuario_id FROM contas c WHERE c.id = r.conta_id), r.usuario_id),
         COALESCE((SELECT c.tipo FROM contas c WHERE c.id = r.conta_id), 'empresa'),
         r.conta_id,
         'Mensalidade')
 WHERE r.contrato_id IS NOT NULL AND r.classificacao_id IS NULL;

-- Comissões: catálogo da conta do representante (sem conta, a primeira empresa do dono).
UPDATE comissoes cm
   SET classificacao_id = pg_temp.classificacao_por_nome(
         COALESCE((SELECT c.usuario_id FROM contas c WHERE c.id = rep.conta_id), rep.usuario_id),
         COALESCE((SELECT c.tipo FROM contas c WHERE c.id = rep.conta_id), 'empresa'),
         COALESCE(rep.conta_id, (SELECT c.id FROM contas c
                                  WHERE c.usuario_id = rep.usuario_id AND c.tipo = 'empresa'
                                  ORDER BY c.eh_padrao DESC, c.id LIMIT 1)),
         cm.tipo_receita)
  FROM representantes rep
 WHERE rep.id = cm.representante_id
   AND cm.tipo_receita IS NOT NULL AND TRIM(cm.tipo_receita) <> '';

-- Contratos existentes passam a apontar para Contratos › Mensalidade e › Implantação.
UPDATE contratos ct
   SET classificacao_mensalidade_id = pg_temp.classificacao_por_nome(
         COALESCE((SELECT c.usuario_id FROM contas c WHERE c.id = ct.conta_id), ct.usuario_id),
         COALESCE((SELECT c.tipo FROM contas c WHERE c.id = ct.conta_id), 'empresa'),
         ct.conta_id,
         'Mensalidade'),
       classificacao_implantacao_id = pg_temp.classificacao_por_nome(
         COALESCE((SELECT c.usuario_id FROM contas c WHERE c.id = ct.conta_id), ct.usuario_id),
         COALESCE((SELECT c.tipo FROM contas c WHERE c.id = ct.conta_id), 'empresa'),
         ct.conta_id,
         'Implantação');

-- Conferência antes de apagar o modelo antigo: nada que tinha tipo pode ficar
-- sem classificação. Qualquer sobra aborta a transação inteira.
DO $$
DECLARE
  receitas_sem INTEGER;
  comissoes_sem INTEGER;
BEGIN
  SELECT COUNT(*) INTO receitas_sem
    FROM receitas
   WHERE tipo_receita IS NOT NULL AND TRIM(tipo_receita) <> '' AND classificacao_id IS NULL;
  SELECT COUNT(*) INTO comissoes_sem
    FROM comissoes
   WHERE classificacao_id IS NULL;
  IF receitas_sem > 0 OR comissoes_sem > 0 THEN
    RAISE EXCEPTION '0051: % receita(s) e % comissao(oes) ficaram sem classificacao', receitas_sem, comissoes_sem;
  END IF;
END $$;

ALTER TABLE comissoes ALTER COLUMN classificacao_id SET NOT NULL;

DROP TABLE IF EXISTS tipos_receita;
ALTER TABLE receitas DROP COLUMN IF EXISTS tipo_receita;
ALTER TABLE comissoes DROP COLUMN IF EXISTS tipo_receita;
