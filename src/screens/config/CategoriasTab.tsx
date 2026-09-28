import { fetchCategorias, saveCategoria, toggleCategoria } from '../../services/configService';
import { getActiveAccountId } from '../../services/apiClient';
import { queryKeys } from '../../services/queryKeys';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { CatalogoEmArvore, type GuiasCatalogo, type TextosCatalogo } from './CatalogoEmArvore';

const DESTAQUE_DESPESA = '#dc2626'; // categorias representam despesas

const TEXTOS: TextosCatalogo = {
  singular: 'categoria',
  plural: 'categorias',
  exemploNome: 'Ex: Alimentação',
  descricaoVazio: 'Crie categorias para organizar despesas e relatórios.',
  ondeSomeAoDesativar: 'nas opções de categoria ao lançar receitas e despesas',
  tituloPadrao: 'Categoria padrão do sistema',
};

const GUIAS: GuiasCatalogo = {
  nova: { chave: 'categorias:nova-v1', mensagem: firstAccessGuideMessages.categoriasNova },
  sub: { chave: 'categorias:sub-v1', mensagem: firstAccessGuideMessages.categoriasSub },
  desativar: { chave: 'categorias:desativar-v1', mensagem: firstAccessGuideMessages.categoriasDesativar },
};

export function CategoriasTab() {
  const accountId = getActiveAccountId();
  return (
    <CatalogoEmArvore
      queryKey={queryKeys.categorias(accountId)}
      // Só o prefixo (sem o segmento de conta): invalida TODAS as variantes
      // por conta, não só a da conta ativa.
      invalidarPrefixo={['categorias']}
      carregar={() => fetchCategorias(accountId)}
      salvar={(values, id) => saveCategoria(values, id)}
      alternar={toggleCategoria}
      destaque={DESTAQUE_DESPESA}
      textos={TEXTOS}
      guias={GUIAS}
    />
  );
}
