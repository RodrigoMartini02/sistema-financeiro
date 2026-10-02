-- 0057: registro das migrations aplicadas em cada banco, usado por
-- backend/scripts/migrations.ts. Uma linha por arquivo de backend/drizzle:
-- o nome, a assinatura SHA-256 do conteúdo (com quebras de linha LF) e quando
-- foi aplicada. O app não lê nem grava nesta tabela.
--
-- Aplicar com o próprio script (cria a tabela e já registra esta migration):
--   npm --prefix backend run migrations:aplicar -- 0057 --banco local
--   npm --prefix backend run migrations:aplicar -- 0057 --banco producao --confirmo
-- Depois, registrar as que já estavam aplicadas antes do controle:
--   npm --prefix backend run migrations:registrar-existentes -- --ate 0056 --banco ...
--
-- Do not execute automatically. Confirm the target database before applying.

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  checksum CHAR(64) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
