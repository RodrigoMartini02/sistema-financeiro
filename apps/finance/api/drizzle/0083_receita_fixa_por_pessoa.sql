-- 0083: receita fixa por pessoa, com o ano registrado como previsto (plano
-- .plans/receita-fixa-ano-previsto.md).
--
-- A receita fixa da categoria passa a ser de cada pessoa: a configuração vira
-- única por (classificação, conta, pessoa), e a que já existe fica com quem a
-- fez. Ligar a fixa grava as previstas até dezembro; ano_registrado guarda até
-- que ano elas foram gravadas, e a partir de 1º de dezembro desse ano o app
-- pergunta se a fixa continua. A fixa antiga fica com ano_registrado nulo: o
-- código grava o ano dela na rotina diária ou ao abrir o app.
--
-- As cópias do "Repetir até" passam a nascer previstas. A receita com data
-- futura gravada como recebida vira prevista: o dinheiro ainda não caiu.
--
-- ORDEM: aplicar ANTES do deploy do código novo. Funciona também com o código
-- anterior: a unicidade nova é mais larga, e ele não lê a coluna nova. As
-- colunas do lançamento automático saem depois do deploy, na 0084.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.

ALTER TABLE classificacoes_receita_fixas
  DROP CONSTRAINT IF EXISTS uq_classificacoes_receita_fixas_conta;
ALTER TABLE classificacoes_receita_fixas
  ADD CONSTRAINT uq_classificacoes_receita_fixas_conta_usuario UNIQUE (classificacao_id, conta_id, usuario_id);

ALTER TABLE classificacoes_receita_fixas
  ADD COLUMN IF NOT EXISTS ano_registrado INTEGER;

UPDATE receitas
SET status = 'prevista'
WHERE status = 'ativa'
  AND data_recebimento > CURRENT_DATE;
