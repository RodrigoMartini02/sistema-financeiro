-- Executar pelo runner após publicar a 3C e conferir o backup e o banco próprio.
DO $$
DECLARE
  verification jsonb;
  collector_key bigint;
BEGIN
  verification := nullif(current_setting('fingerence.tenders_cleanup', true), '')::jsonb;
  IF verification IS NULL
     OR verification->>'database' IS DISTINCT FROM current_database()
     OR verification->>'tendersDatabase' IS NULL
     OR verification->>'tendersDatabase' = current_database()
     OR coalesce(verification->>'backupSha256', '') !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Limpeza recusada: backup e banco próprio precisam ser conferidos pelo runner.';
  END IF;

  FOREACH collector_key IN ARRAY ARRAY[7274001, 7274002, 7274003, 7274004]::bigint[] LOOP
    IF NOT pg_try_advisory_xact_lock(collector_key) THEN
      RAISE EXCEPTION 'Limpeza recusada: há um coletor usando o banco antigo.';
    END IF;
  END LOOP;
END $$;

LOCK TABLE public.usuarios IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.usuarios WHERE plano_status = 'sem_teste') THEN
    RAISE EXCEPTION 'Limpeza recusada: há usuários de Finanças com teste não iniciado.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class source ON source.oid = c.conrelid
    JOIN pg_namespace source_schema ON source_schema.oid = source.relnamespace
    JOIN pg_class target ON target.oid = c.confrelid
    JOIN pg_namespace target_schema ON target_schema.oid = target.relnamespace
    WHERE c.contype = 'f' AND target_schema.nspname = 'licitacoes'
      AND source_schema.nspname <> 'licitacoes'
  ) THEN
    RAISE EXCEPTION 'Limpeza recusada: outra área ainda referencia tabelas antigas de Licitações.';
  END IF;
END $$;

DROP SCHEMA licitacoes CASCADE;
