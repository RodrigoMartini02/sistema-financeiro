-- 0003: perfil da empresa (item 1C de Licitações, plano .plans/licitacoes-1c-perfil-da-empresa.md).
--
-- Só colunas novas e opcionais em contas (a empresa é a própria conta) e a cópia do enquadramento, que misturava porte
-- e tipo jurídico, para as duas colunas separadas. A coluna enquadramento continua até a 0004, que só roda depois do
-- deploy da API que deixa de usá-la. O código anterior continua funcionando sem estas colunas, então esta migration
-- pode ser aplicada antes do deploy da API que as lê.
--
-- Porte e tipo jurídico guardam o código da lista do módulo (src/domains.ts); as listas são validadas no código, sem
-- CHECK, para poder crescer sem nova migration. Os campos da consulta do CNPJ (situação, natureza jurídica e CNAEs)
-- só são gravados pela própria consulta; o resto é editável pelo titular.
--
-- Aplicar com o runner (o runner abre a transação; não colocar BEGIN/COMMIT aqui):
--   npm --prefix apps/tenders/api run migrations:aplicar -- 0003 --banco local --projeto tenders
--   npm --prefix apps/tenders/api run migrations:aplicar -- 0003 --banco producao --projeto tenders --confirmo
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente pode estar apontando para producao.
-- Nao editar depois de aplicada: o runner guarda a assinatura do arquivo.

ALTER TABLE public.contas
  ADD COLUMN porte VARCHAR(10),
  ADD COLUMN tipo_juridico VARCHAR(10),
  ADD COLUMN natureza_juridica_codigo VARCHAR(4),
  ADD COLUMN natureza_juridica VARCHAR(150),
  ADD COLUMN situacao_cadastral VARCHAR(10),
  ADD COLUMN situacao_cadastral_data DATE,
  ADD COLUMN cnae_principal VARCHAR(7),
  ADD COLUMN cnae_principal_descricao VARCHAR(255),
  ADD COLUMN cnaes_secundarios JSONB,
  ADD COLUMN cep VARCHAR(8),
  ADD COLUMN logradouro VARCHAR(200),
  ADD COLUMN numero VARCHAR(20),
  ADD COLUMN complemento VARCHAR(200),
  ADD COLUMN bairro VARCHAR(100),
  ADD COLUMN municipio VARCHAR(100),
  ADD COLUMN uf VARCHAR(2),
  ADD COLUMN telefone VARCHAR(20),
  ADD COLUMN email_contato VARCHAR(255),
  ADD COLUMN consulta_cnpj_em TIMESTAMPTZ;

-- O enquadramento antigo vira dois campos: MEI, ME e EPP são porte; SLU, EIRELI, LTDA e SA são tipo jurídico.
UPDATE public.contas SET porte = enquadramento WHERE enquadramento IN ('MEI', 'ME', 'EPP');
UPDATE public.contas SET tipo_juridico = enquadramento WHERE enquadramento IN ('SLU', 'EIRELI', 'LTDA', 'SA');
