-- Fluxo de conversa do assistente, editavel pela tela de fluxograma.
--
-- GLOBAL, nao por usuario: quem edita e o dono do sistema definindo como o
-- assistente conversa com todo mundo. Uma linha ativa por vez; as demais
-- ficam como historico do que ja esteve no ar.
--
-- A linha inicial NAO e inserida aqui: o backend semeia o fluxo padrao na
-- primeira leitura, a partir de assistantFlowDefault.ts. Duplicar aquele JSON
-- nesta migration criaria duas versoes do mesmo fluxo para manter em sincronia.
--
-- Do not execute automatically. Confirm the target database before applying.

CREATE TABLE IF NOT EXISTS assistente_fluxos (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  definicao JSONB NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT false,
  versao INTEGER NOT NULL DEFAULT 1,
  data_criacao TIMESTAMP NOT NULL DEFAULT NOW(),
  data_atualizacao TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistente_fluxos_ativo ON assistente_fluxos(ativo);
