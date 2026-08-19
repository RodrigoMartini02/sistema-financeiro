-- Migracao de DADOS (nao apenas schema) — classifica categorias existentes
-- que hoje tem tipo/perfil_id nulos (criadas antes deste modelo) em
-- PADRAO (batem por nome com a lista padrao do sistema) ou CUSTOM
-- (qualquer outra, atribuida ao perfil pessoal do proprio usuario).
--
-- Este script deve ser revisado e ajustado por usuario/ambiente antes de
-- rodar — os nomes da lista padrao abaixo precisam bater exatamente com
-- PERSONAL_DEFAULT_CATEGORIES em backend/src/services/defaultCategories.ts.
--
-- Do not execute automatically. Confirm the target database before applying.

-- 1) Promove a "padrao" as categorias sem tipo/perfil_id cujo nome bate
--    exatamente com a lista padrao pessoal.
UPDATE categorias
SET tipo = 'pessoal'
WHERE tipo IS NULL
  AND perfil_id IS NULL
  AND nome IN (
    'Alimentação', 'Moradia', 'Transporte', 'Saúde', 'Educação',
    'Lazer', 'Assinaturas', 'Vestuário', 'Finanças', 'Outros'
  );

-- 2) Todo o restante (sem tipo/perfil_id, nao bateu com a lista padrao)
--    vira custom, exclusiva do perfil pessoal do respectivo usuario.
UPDATE categorias c
SET perfil_id = p.id
FROM perfis p
WHERE c.tipo IS NULL
  AND c.perfil_id IS NULL
  AND p.usuario_id = c.usuario_id
  AND p.tipo = 'pessoal';
