-- 0053: classificações de receita padrão das contas pessoais (PF). Só dados, idempotente.
--
-- Uma classificação principal com subclassificações é só o nome do grupo: ela
-- não se escolhe ao lançar receita (mesma regra das categorias de despesa).
-- Por isso:
--   * "Salário" deixa de ser principal e vira subclassificação do grupo novo
--     "Emprego", ao lado de 13º e Férias. Continua sendo a mesma linha (mesmo
--     id): receitas e fixas que estiverem nela continuam nela.
--   * "Vendas" passa a se chamar "Comissões".
--
-- A lista padrão do código (incomeClassificationDefaults.ts) já traz "Emprego"
-- e "Comissões". Se ela rodar para um dono antes desta migration, o "Emprego"
-- criado é reaproveitado e a "Comissões" criada recebe o que estava na
-- "Vendas" (que então é apagada), sem duplicar nome.
DO $$
DECLARE
  dono RECORD;
  emprego_id INTEGER;
  salario_id INTEGER;
  vendas_id INTEGER;
  comissoes_id INTEGER;
BEGIN
  FOR dono IN
    SELECT DISTINCT usuario_id
      FROM classificacoes_receita
     WHERE conta_id IS NULL AND tipo = 'pessoal'
  LOOP
    -- ── Emprego › Salário, 13º, Férias ──────────────────────────────────────
    emprego_id := NULL;
    SELECT id INTO emprego_id
      FROM classificacoes_receita
     WHERE usuario_id = dono.usuario_id AND tipo = 'pessoal' AND conta_id IS NULL AND LOWER(nome) = 'emprego';
    IF emprego_id IS NULL THEN
      INSERT INTO classificacoes_receita (usuario_id, tipo, nome)
      VALUES (dono.usuario_id, 'pessoal', 'Emprego')
      RETURNING id INTO emprego_id;
    END IF;

    salario_id := NULL;
    SELECT id INTO salario_id
      FROM classificacoes_receita
     WHERE usuario_id = dono.usuario_id AND tipo = 'pessoal' AND conta_id IS NULL AND LOWER(nome) = 'salário';
    IF salario_id IS NULL THEN
      INSERT INTO classificacoes_receita (usuario_id, tipo, nome, parent_id)
      VALUES (dono.usuario_id, 'pessoal', 'Salário', emprego_id);
    ELSE
      -- Filhas da Salário (13º, Férias e as criadas pelo usuário) sobem para
      -- Emprego: continua havendo um nível só de subclassificação.
      UPDATE classificacoes_receita
         SET parent_id = emprego_id, data_atualizacao = CURRENT_TIMESTAMP
       WHERE parent_id = salario_id;
      UPDATE classificacoes_receita
         SET parent_id = emprego_id, data_atualizacao = CURRENT_TIMESTAMP
       WHERE id = salario_id AND parent_id IS DISTINCT FROM emprego_id;
    END IF;

    -- 13º e Férias que estejam fora do grupo (ex.: criadas soltas) também entram nele.
    UPDATE classificacoes_receita
       SET parent_id = emprego_id, data_atualizacao = CURRENT_TIMESTAMP
     WHERE usuario_id = dono.usuario_id AND tipo = 'pessoal' AND conta_id IS NULL
       AND LOWER(nome) IN ('13º', 'férias') AND parent_id IS DISTINCT FROM emprego_id;

    -- ── Vendas → Comissões ──────────────────────────────────────────────────
    vendas_id := NULL;
    comissoes_id := NULL;
    SELECT id INTO vendas_id
      FROM classificacoes_receita
     WHERE usuario_id = dono.usuario_id AND tipo = 'pessoal' AND conta_id IS NULL AND LOWER(nome) = 'vendas';
    SELECT id INTO comissoes_id
      FROM classificacoes_receita
     WHERE usuario_id = dono.usuario_id AND tipo = 'pessoal' AND conta_id IS NULL AND LOWER(nome) = 'comissões';

    IF vendas_id IS NOT NULL AND comissoes_id IS NULL THEN
      UPDATE classificacoes_receita
         SET nome = 'Comissões', data_atualizacao = CURRENT_TIMESTAMP
       WHERE id = vendas_id;
    ELSIF vendas_id IS NOT NULL THEN
      -- As duas existem: tudo o que aponta para "Vendas" passa para "Comissões"
      -- antes de apagar (comissoes.classificacao_id apagaria em cascata).
      UPDATE receitas SET classificacao_id = comissoes_id WHERE classificacao_id = vendas_id;
      UPDATE comissoes SET classificacao_id = comissoes_id WHERE classificacao_id = vendas_id;
      UPDATE contratos SET classificacao_mensalidade_id = comissoes_id WHERE classificacao_mensalidade_id = vendas_id;
      UPDATE contratos SET classificacao_implantacao_id = comissoes_id WHERE classificacao_implantacao_id = vendas_id;
      UPDATE classificacoes_receita SET parent_id = comissoes_id WHERE parent_id = vendas_id;
      UPDATE classificacoes_receita_fixas f
         SET classificacao_id = comissoes_id
       WHERE f.classificacao_id = vendas_id
         AND NOT EXISTS (
           SELECT 1 FROM classificacoes_receita_fixas g
            WHERE g.classificacao_id = comissoes_id AND g.conta_id = f.conta_id
         );
      DELETE FROM classificacoes_receita WHERE id = vendas_id;
    END IF;
  END LOOP;
END $$;
