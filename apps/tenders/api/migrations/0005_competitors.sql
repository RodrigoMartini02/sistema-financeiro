-- 0005: concorrentes monitorados (item 4 de Licitações, plano .plans/licitacoes-4-concorrentes-monitorados.md).
--
-- Tabela nova, uma linha por concorrente que cada pessoa acompanha na conta: o CNPJ do fornecedor, um apelido opcional e
-- se ela quer ser avisada de contrato novo dele. O nome do concorrente não é gravado: vem do armazém de contratos.
-- `aviso_desde` é o instante em que o aviso passou a valer (na criação e quando o aviso é religado): só contratos
-- publicados no dia dele ou depois geram aviso, para o aviso não ser retroativo.
--
-- Amplia também o CHECK de `notificacao.tipo` com `CONTRATO_NOVO_CONCORRENTE`, o aviso do sino quando um concorrente
-- monitorado tem contrato novo (como a 0073 e a 0086 fizeram com os tipos que existiam).
--
-- É aditiva: o código anterior continua funcionando sem ela. O código novo, porém, lê a tabela nas rotas
-- /competitors e na etapa de avisos de contratos da rotina diária, e grava o tipo novo em `notificacao`, então esta
-- migration precisa estar aplicada no banco ANTES de a API e o coletor que a usam serem publicados.
--
-- O CNPJ é conferido no código (14 dígitos, com os dígitos verificadores); o CHECK só garante o formato, porque ele entra
-- como literal nas consultas do armazém. Nenhum índice além da chave primária: a lista de cada pessoa usa a chave e a
-- rotina lê todos os que notificam.
--
-- Aplicar com o runner (o runner abre a transação; não colocar BEGIN/COMMIT aqui):
--   npm --prefix apps/tenders/api run migrations:aplicar -- 0005 --banco local --projeto tenders
--   npm --prefix apps/tenders/api run migrations:aplicar -- 0005 --banco producao --projeto tenders --confirmo
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente pode estar apontando para producao.
-- Nao editar depois de aplicada: o runner guarda a assinatura do arquivo.

CREATE TABLE licitacoes.concorrente_monitorado (
  conta_id INTEGER NOT NULL REFERENCES public.contas (id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES public.usuarios (id) ON DELETE CASCADE,
  cnpj VARCHAR(14) NOT NULL,
  apelido VARCHAR(80),
  notificar BOOLEAN NOT NULL DEFAULT true,
  aviso_desde TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conta_id, usuario_id, cnpj),
  CONSTRAINT concorrente_monitorado_cnpj_check CHECK (cnpj ~ '^[0-9]{14}$')
);

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
      'CONTRATO_NOVO_CONCORRENTE'
    )
  );
