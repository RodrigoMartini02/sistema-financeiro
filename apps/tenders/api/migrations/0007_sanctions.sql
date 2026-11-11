-- 0007: Sanções (item 6 de Licitações, plano .plans/licitacoes-6-sancoes.md).
--
-- Uma tabela nova, sempre de uma conta:
--   licitacoes.consulta_sancao  o resultado guardado da última consulta de uma base de sanções (CEIS, CNEP ou CEPIM) para a
--                               empresa da conta (`pessoa_id` nulo, pelo CNPJ) ou para uma pessoa do cofre (pelo CPF). Uma
--                               linha por conta, assunto e base; a consulta nova a substitui.
-- O que fica aqui é só o necessário: a base, a data da consulta, quem consultou e os registros já reduzidos (tipo da sanção,
-- órgão, datas, fundamento, processo e observações). NENHUMA coluna guarda CPF, CNPJ, nome do sancionado ou a resposta bruta
-- da fonte. A situação (sem registro, em vigor, encerrada) não é gravada: sai dos registros e do dia de hoje.
--
-- A pessoa é conferida pela chave estrangeira composta (pessoa_id, conta_id), como em `documento`: uma consulta nunca aponta
-- para uma pessoa de outra conta. Apagar a pessoa apaga as consultas dela; mudar o CPF dela também (a API as apaga na mesma
-- transação, porque o resultado guardado era de outro CPF).
--
-- O CEPIM só aceita CNPJ: pessoa não o consulta (CHECK). Sem RLS, como o resto do módulo: a API filtra a conta da sessão.
--
-- Sem bloco de permissões do coletor: a rotina diária (usuário restrito `licitacoes_coletor`) não lê esta tabela. Se um dia
-- ler (aviso de sanção nova), a migration que o trouxer tem de conceder o SELECT (README, "Usuário de banco restrito").
--
-- É aditiva: o código anterior continua funcionando sem ela. O código novo lê e grava a tabela nas rotas /sanctions, então esta
-- migration precisa estar aplicada no banco ANTES de a API que a usa ser publicada.
--
-- Aplicar com o runner (o runner abre a transação; não colocar BEGIN/COMMIT aqui):
--   npm --prefix apps/tenders/api run migrations:aplicar -- 0007 --banco local --projeto tenders
--   npm --prefix apps/tenders/api run migrations:aplicar -- 0007 --banco producao --projeto tenders --confirmo
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente pode estar apontando para producao.
-- Nao editar depois de aplicada: o runner guarda a assinatura do arquivo.

CREATE TABLE licitacoes.consulta_sancao (
  id BIGSERIAL PRIMARY KEY,
  conta_id INTEGER NOT NULL REFERENCES public.contas (id) ON DELETE CASCADE,
  -- Nulo: a consulta é da empresa da conta. Com valor: de uma pessoa do cofre (a chave composta confere a conta).
  pessoa_id BIGINT,
  base VARCHAR(5) NOT NULL,
  registros JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- A fonte tinha mais registros do que os guardados (a API lê até 3 páginas por base).
  truncado BOOLEAN NOT NULL DEFAULT FALSE,
  consultado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  consultado_por INTEGER REFERENCES public.usuarios (id) ON DELETE SET NULL,
  CONSTRAINT consulta_sancao_pessoa_fkey FOREIGN KEY (pessoa_id, conta_id)
    REFERENCES licitacoes.pessoa (id, conta_id) ON DELETE CASCADE,
  CONSTRAINT consulta_sancao_base_check CHECK (base IN ('CEIS', 'CNEP', 'CEPIM')),
  CONSTRAINT consulta_sancao_cepim_check CHECK (base <> 'CEPIM' OR pessoa_id IS NULL),
  CONSTRAINT consulta_sancao_registros_check CHECK (jsonb_typeof(registros) = 'array')
);

-- Uma consulta por conta, assunto e base. Os dois índices únicos parciais separam a empresa (sem pessoa) das pessoas; o
-- segundo também atende a procura da cascata ao apagar a pessoa (começa por conta e pessoa).
CREATE UNIQUE INDEX ux_consulta_sancao_empresa ON licitacoes.consulta_sancao (conta_id, base) WHERE pessoa_id IS NULL;
CREATE UNIQUE INDEX ux_consulta_sancao_pessoa ON licitacoes.consulta_sancao (conta_id, pessoa_id, base) WHERE pessoa_id IS NOT NULL;
