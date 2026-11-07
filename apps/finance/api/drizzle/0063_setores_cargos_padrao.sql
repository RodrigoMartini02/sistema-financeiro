-- 0063: setores e cargos padrão nas contas PJ que já existem. Só dados,
-- idempotente.
--
-- A lista do código (accountNameCatalogDefaults.ts) já cuida das contas novas,
-- gravada na criação da conta; aqui ela chega às que já existiam. Pula o nome
-- que a conta já tiver, ativo ou desativado: não duplica nem traz de volta um
-- item desativado de propósito.
--
-- ORDEM: aplicar DEPOIS do deploy, para cobrir também as contas criadas antes
-- dele. As tabelas são da 0062.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.
INSERT INTO setores (usuario_id, conta_id, nome)
SELECT c.usuario_id, c.id, padrao.nome
  FROM contas c
 CROSS JOIN (VALUES ('Administrativo'), ('Financeiro'), ('Comercial'), ('Marketing'),
                    ('Recursos Humanos'), ('Operacional'), ('Atendimento'), ('TI')) AS padrao(nome)
 WHERE c.tipo = 'empresa'
   AND NOT EXISTS (
     SELECT 1 FROM setores existente
      WHERE existente.conta_id = c.id AND LOWER(existente.nome) = LOWER(padrao.nome)
   );

INSERT INTO cargos (usuario_id, conta_id, nome)
SELECT c.usuario_id, c.id, padrao.nome
  FROM contas c
 CROSS JOIN (VALUES ('Diretor'), ('Gerente'), ('Coordenador'), ('Supervisor'), ('Analista'),
                    ('Assistente'), ('Auxiliar'), ('Estagiário'), ('Vendedor'), ('Atendente')) AS padrao(nome)
 WHERE c.tipo = 'empresa'
   AND NOT EXISTS (
     SELECT 1 FROM cargos existente
      WHERE existente.conta_id = c.id AND LOWER(existente.nome) = LOWER(padrao.nome)
   );
