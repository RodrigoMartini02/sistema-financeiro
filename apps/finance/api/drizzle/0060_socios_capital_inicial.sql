-- 0060: capital inicial de cada sócio e o vínculo com a receita em que ele foi
-- lançado. O capital vira receita uma vez só (checkbox "Lançar como receita"
-- no modal da conta); depois disso fica travado. Se a receita for apagada na
-- tela de Receitas, o vínculo fica vazio e o capital destrava.
--
-- ORDEM: pode ir ANTES do deploy do código novo. Só acrescenta colunas com
-- padrão; o código anterior lê os sócios com SELECT * e ignora as novas.
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente
-- pode estar apontando para producao.
ALTER TABLE socios ADD COLUMN IF NOT EXISTS capital_inicial DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE socios ADD COLUMN IF NOT EXISTS receita_capital_id INTEGER REFERENCES receitas(id) ON DELETE SET NULL;
