-- 0006: Documentação › Cofre (item 5 de Licitações, plano .plans/licitacoes-5-cofre-de-documentos.md).
--
-- Duas tabelas novas, sempre de uma conta:
--   licitacoes.pessoa     as pessoas ligadas à empresa (sócios, representantes, procuradores, responsáveis técnicos),
--                         com CPF único na conta e os papéis (códigos da lista PERSON_ROLES do código);
--   licitacoes.documento  os documentos de habilitação, da empresa (sem pessoa) ou de uma pessoa, com emissão, validade e o
--                         arquivo no R2 (só a chave, o nome, o tipo e o tamanho ficam aqui; o arquivo nunca vai para o banco).
-- O tipo do documento (`tipo`) é um código do catálogo do código (DOCUMENT_TYPES), sem CHECK: como nas outras listas do
-- módulo, a API valida e a lista pode crescer sem migration. A situação (válido, vencendo, vencido) não é gravada: sai da
-- validade e do dia de hoje.
--
-- A pessoa do documento é conferida pela chave estrangeira composta (pessoa_id, conta_id): um documento nunca aponta para
-- uma pessoa de outra conta, nem por erro do código. Apagar a pessoa apaga os documentos dela (a API apaga os arquivos do
-- R2 depois).
--
-- Também em `notificacao`: a coluna `documento_id` (o aviso de vencimento de um documento, que se apaga com ele), o índice
-- único que impede repetir o aviso (conta, pessoa, tipo, documento, vencimento) e os tipos DOCUMENTO_VENCE_30D e
-- DOCUMENTO_VENCE_7D no CHECK de `notificacao.tipo` (como a 0005 fez com o de concorrente).
--
-- A rotina diária roda com o usuário restrito `licitacoes_coletor`, que não lê a identidade em `public`. Para avisar o
-- titular e os colaboradores com acesso, esta migration cria a view `licitacoes.usuario_com_acesso`, que só expõe
-- (conta, usuário, papel) de quem pode usar o módulo agora: o titular da conta e os colaboradores ativos com acesso. A view
-- roda com os direitos de quem a cria (o dono das tabelas), então o coletor lê só essas três colunas e nada mais da identidade.
--
-- Permissões do coletor (se o papel existir; no banco local o coletor usa o usuário do app): as tabelas criadas depois do
-- GRANT ... ON ALL TABLES do papel não herdam permissão (README, "Usuário de banco restrito"), então este bloco concede a leitura
-- das tabelas novas e da view. Inclui também a leitura de `concorrente_monitorado`, da 0005, que a rotina diária lê para o
-- aviso de contrato novo de concorrente e que ficou sem o GRANT: sem ele, a etapa de avisos de contratos falharia no banco de
-- produção depois de o coletor receber o código novo. Conceder de novo uma permissão que já existe não muda nada.
--
-- É aditiva: o código anterior continua funcionando sem ela. O código novo, porém, lê e grava as tabelas nas rotas /vault e na
-- etapa de lembretes da rotina diária, e a listagem de notificações lê a coluna nova, então esta migration precisa estar
-- aplicada no banco ANTES de a API e o coletor que a usam serem publicados.
--
-- Aplicar com o runner (o runner abre a transação; não colocar BEGIN/COMMIT aqui):
--   npm --prefix apps/tenders/api run migrations:aplicar -- 0006 --banco local --projeto tenders
--   npm --prefix apps/tenders/api run migrations:aplicar -- 0006 --banco producao --projeto tenders --confirmo
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente pode estar apontando para producao.
-- Nao editar depois de aplicada: o runner guarda a assinatura do arquivo.

CREATE TABLE licitacoes.pessoa (
  id BIGSERIAL PRIMARY KEY,
  conta_id INTEGER NOT NULL REFERENCES public.contas (id) ON DELETE CASCADE,
  nome VARCHAR(120) NOT NULL,
  cpf VARCHAR(11) NOT NULL,
  papeis TEXT[] NOT NULL,
  cargo VARCHAR(80),
  email VARCHAR(255),
  telefone VARCHAR(20),
  criado_por INTEGER REFERENCES public.usuarios (id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pessoa_conta_cpf_key UNIQUE (conta_id, cpf),
  -- Alvo da chave estrangeira composta de `documento`.
  CONSTRAINT pessoa_id_conta_key UNIQUE (id, conta_id),
  CONSTRAINT pessoa_cpf_check CHECK (cpf ~ '^[0-9]{11}$'),
  CONSTRAINT pessoa_papeis_check CHECK (cardinality(papeis) >= 1)
);

CREATE TABLE licitacoes.documento (
  id BIGSERIAL PRIMARY KEY,
  conta_id INTEGER NOT NULL REFERENCES public.contas (id) ON DELETE CASCADE,
  tipo VARCHAR(30) NOT NULL,
  pessoa_id BIGINT,
  descricao VARCHAR(120),
  emitido_em DATE,
  valido_ate DATE,
  arquivo_chave VARCHAR(255) NOT NULL,
  arquivo_nome VARCHAR(200) NOT NULL,
  arquivo_tipo VARCHAR(100) NOT NULL,
  arquivo_bytes INTEGER NOT NULL,
  criado_por INTEGER REFERENCES public.usuarios (id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Sem pessoa (pessoa_id nulo), a chave não é conferida: é o documento da empresa.
  CONSTRAINT documento_pessoa_fkey FOREIGN KEY (pessoa_id, conta_id)
    REFERENCES licitacoes.pessoa (id, conta_id) ON DELETE CASCADE,
  CONSTRAINT documento_datas_check CHECK (emitido_em IS NULL OR valido_ate IS NULL OR emitido_em <= valido_ate),
  CONSTRAINT documento_arquivo_bytes_check CHECK (arquivo_bytes > 0)
);

-- A lista da conta, por tipo e pessoa (a ordem em que a tela agrupa), e os avisos, que leem só o que tem validade.
CREATE INDEX ix_documento_conta_tipo ON licitacoes.documento (conta_id, tipo, pessoa_id);
CREATE INDEX ix_documento_validade ON licitacoes.documento (valido_ate) WHERE valido_ate IS NOT NULL;
-- Apagar uma pessoa procura os documentos dela pela chave composta.
CREATE INDEX ix_documento_pessoa ON licitacoes.documento (pessoa_id, conta_id) WHERE pessoa_id IS NOT NULL;

-- O aviso de vencimento de documento: de um documento, nunca de um edital ou de um contrato.
ALTER TABLE licitacoes.notificacao
  ADD COLUMN documento_id BIGINT REFERENCES licitacoes.documento (id) ON DELETE CASCADE;

ALTER TABLE licitacoes.notificacao
  ADD CONSTRAINT ck_notificacao_documento_exclusivo
  CHECK (documento_id IS NULL OR (edital_id IS NULL AND contrato_chave IS NULL));

-- Um aviso por pessoa, tipo, documento e vencimento: o vencimento novo (a data muda na edição) avisa de novo.
CREATE UNIQUE INDEX ux_notificacao_documento_unica
  ON licitacoes.notificacao (conta_id, usuario_id, tipo, documento_id, COALESCE(referencia, ''))
  WHERE documento_id IS NOT NULL;

-- Apagar o documento procura os avisos dele.
CREATE INDEX ix_notificacao_documento ON licitacoes.notificacao (documento_id) WHERE documento_id IS NOT NULL;

ALTER TABLE licitacoes.notificacao DROP CONSTRAINT notificacao_tipo_check;

ALTER TABLE licitacoes.notificacao
  ADD CONSTRAINT notificacao_tipo_check CHECK (
    tipo IN (
      'NOVO_EDITAL',
      'EDITAL_ALTERADO',
      'PRAZO_3D',
      'PRAZO_1D',
      'CONTRATO_VENCE_90D',
      'CONTRATO_VENCE_30D',
      'CONTRATO_ALTERADO',
      'CONTRATO_NOVO_CONCORRENTE',
      'DOCUMENTO_VENCE_30D',
      'DOCUMENTO_VENCE_7D'
    )
  );

-- Quem pode usar o módulo em cada conta agora (a regra de services/access.ts): o titular (dono da conta, usuário ativo) e o
-- colaborador ativo, com vínculo ativo na conta e linha em `acesso_membro`. Só (conta, usuário, papel): nada mais da identidade.
CREATE VIEW licitacoes.usuario_com_acesso AS
SELECT c.id AS conta_id, c.usuario_id AS usuario_id, 'TITULAR'::varchar(12) AS papel
  FROM public.contas c
  JOIN public.usuarios u ON u.id = c.usuario_id AND u.status = 'ativo'
 WHERE COALESCE(c.ativo, true)
UNION ALL
SELECT a.conta_id, a.usuario_id, 'COLABORADOR'::varchar(12)
  FROM licitacoes.acesso_membro a
  JOIN public.conta_membros m ON m.conta_id = a.conta_id AND m.usuario_id = a.usuario_id AND m.status = 'ativo'
  JOIN public.usuarios u ON u.id = a.usuario_id AND u.status = 'ativo';

-- O coletor roda com o usuário restrito licitacoes_coletor, se ele existir (no banco local, usa o usuário do app): lê as
-- tabelas novas e a view para os avisos de vencimento e a tabela de concorrentes da 0005 (ver o cabeçalho). Ele já grava em
-- `notificacao` (a coluna nova entra no mesmo INSERT).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licitacoes_coletor') THEN
    GRANT SELECT ON licitacoes.pessoa, licitacoes.documento, licitacoes.usuario_com_acesso TO licitacoes_coletor;
    GRANT SELECT ON licitacoes.concorrente_monitorado TO licitacoes_coletor;
  END IF;
END
$$;
