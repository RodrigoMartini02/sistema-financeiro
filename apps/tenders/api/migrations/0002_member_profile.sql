-- 0002: perfil do usuário e dados de trabalho do colaborador (item 1A de Licitações, plano
-- .plans/licitacoes-1a-configuracoes-e-usuarios.md).
--
-- Só colunas novas e opcionais: o código anterior continua funcionando sem elas, então esta migration pode ser
-- aplicada antes do deploy da API que as lê.
--
-- Aplicar com o runner (o runner abre a transação; não colocar BEGIN/COMMIT aqui):
--   npm --prefix apps/tenders/api run migrations:aplicar -- 0002 --banco local --projeto tenders
--   npm --prefix apps/tenders/api run migrations:aplicar -- 0002 --banco producao --projeto tenders --confirmo
--
-- ATENCAO: nao executar sem confirmacao explicita do usuario. O ambiente pode estar apontando para producao.
-- Nao editar depois de aplicada: o runner guarda a assinatura do arquivo.

-- Chave do objeto da foto no R2 (relativa à pasta do ambiente): nunca o conteúdo da imagem nem um endereço.
ALTER TABLE public.usuarios ADD COLUMN foto_chave VARCHAR(255);

-- Dados de trabalho do colaborador, no vínculo com a empresa (não no cadastro da pessoa). Setor e cargo guardam o
-- código estável da lista padrão do módulo (src/domains.ts). A lista é validada no código, sem CHECK, para poder
-- crescer sem nova migration; vazio é "sem setor" e "sem cargo".
ALTER TABLE public.conta_membros
  ADD COLUMN setor VARCHAR(40),
  ADD COLUMN cargo VARCHAR(40),
  ADD COLUMN data_admissao DATE;
