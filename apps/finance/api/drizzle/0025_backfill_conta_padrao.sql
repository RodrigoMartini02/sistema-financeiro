-- Cria a "Conta Padrão" retroativa para cada usuário já existente — a linha
-- que representa a Conta nascida no cadastro externo (vinculada à cobrança
-- do plano em `usuarios`), agora também presente como linha real em `contas`,
-- lado a lado com as demais Contas do usuário (sem mesclar dados existentes).
--
-- Idempotente: só insere para usuários que ainda não têm nenhuma conta com
-- eh_padrao = true.
--
-- Do not execute automatically. Confirm the target database before applying.
-- Must run AFTER 0024_renomear_perfis_para_contas.sql.

INSERT INTO contas (usuario_id, tipo, nome, documento, eh_padrao, ativo, data_criacao)
SELECT id, 'pessoal', nome, documento, true, true, data_cadastro
FROM usuarios
WHERE id NOT IN (SELECT usuario_id FROM contas WHERE eh_padrao = true);
