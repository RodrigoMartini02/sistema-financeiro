-- 0087c: módulo de Licitações: vencedores das licitações (plano
-- .plans/licitacoes-vencedores.md, Parte 3).
--
-- Os resultados das licitações da Lei 14.133 viram o quarto conjunto do
-- armazém Parquet do R2 (contractStore/winnerWriter.ts): não há tabela de
-- resultados no Postgres. Aqui entra só o que a coleta registra no banco:
--   coleta_execucao      o CHECK de tipo passa a aceitar as duas execuções novas
--                        (VENCEDORES_DIARIA e VENCEDORES_CARGA). Sem esta migration,
--                        o INSERT do início da execução falha;
--   resultado_carga_dia  os dias de resultado que a carga histórica já concluiu
--                        (só o dia lido por inteiro e publicado ganha linha), no
--                        mesmo molde de contrato_carga_dia da 0085. Cerca de
--                        2.000 linhas ao fim da carga.
--
-- Tabela global, como as outras do módulo: o resultado de licitação é dado
-- público, sem conta e sem RLS.
--
-- Só acrescenta: o código atual continua funcionando.
--
-- ORDEM: aplicar depois da 0087b e ANTES do deploy do código que a usa. Fica
-- antes da 0088, que espera a exportação do JSON dos editais: a ferramenta
-- aplica em ordem, e esta migration não depende dessa exportação. Aplicar
-- fora das 06:00 de Brasília: a rotina diária grava em coleta_execucao.
--
-- REVERSÃO (apagar as execuções dos tipos novos antes de restaurar o CHECK):
--   DROP TABLE licitacoes.resultado_carga_dia;
--   DELETE FROM licitacoes.coleta_execucao WHERE tipo LIKE 'VENCEDORES\_%';
--   ALTER TABLE licitacoes.coleta_execucao DROP CONSTRAINT coleta_execucao_tipo_check;
--   ALTER TABLE licitacoes.coleta_execucao ADD CONSTRAINT coleta_execucao_tipo_check
--     CHECK (tipo IN ('VARREDURA','INCREMENTAL','LEMBRETES','LIMPEZA','MANUAL',
--                     'CONTRATOS_DIARIA','CONTRATOS_CARGA','CONTRATOS_LIMPEZA','CONTRATOS_AVISOS'));
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

-- Global: dias de resultado que a carga histórica de vencedores já concluiu
CREATE TABLE licitacoes.resultado_carga_dia (
  dia              DATE PRIMARY KEY,
  concluido_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  registros_lidos  INT NOT NULL DEFAULT 0
);

-- Os tipos de execução cabem em varchar(20): VENCEDORES_DIARIA tem 17 caracteres.
ALTER TABLE licitacoes.coleta_execucao DROP CONSTRAINT coleta_execucao_tipo_check;
ALTER TABLE licitacoes.coleta_execucao ADD CONSTRAINT coleta_execucao_tipo_check
  CHECK (tipo IN ('VARREDURA','INCREMENTAL','LEMBRETES','LIMPEZA','MANUAL',
                  'CONTRATOS_DIARIA','CONTRATOS_CARGA','CONTRATOS_LIMPEZA','CONTRATOS_AVISOS',
                  'VENCEDORES_DIARIA','VENCEDORES_CARGA'));

-- O coletor roda com o usuário restrito licitacoes_coletor, se ele existir
-- (no banco local, o coletor usa o usuário do app).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licitacoes_coletor') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON licitacoes.resultado_carga_dia TO licitacoes_coletor;
  END IF;
END
$$;
