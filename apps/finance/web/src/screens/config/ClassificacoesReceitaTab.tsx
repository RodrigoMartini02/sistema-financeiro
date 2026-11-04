import {
  fetchClassificacoesReceita, saveClassificacaoReceita, toggleClassificacaoReceita,
} from '../../services/incomeClassificationsService';
import { getActiveAccountId } from '../../services/apiClient';
import { queryKeys } from '../../services/queryKeys';
import { CatalogoEmArvore, type TextosCatalogo } from './CatalogoEmArvore';

const DESTAQUE_RECEITA = '#059669';
const TEXTOS: TextosCatalogo = {
  singular: 'categoria', plural: 'categorias', exemploNome: 'Ex: Salário',
  descricaoVazio: 'Crie categorias para organizar receitas e relatórios.',
  ondeSomeAoDesativar: 'nas opções de categoria ao lançar receitas', tituloPadrao: 'Categoria padrão do sistema',
};

export function ClassificacoesReceitaTab() {
  const accountId = getActiveAccountId();
  return (
    <CatalogoEmArvore
      queryKey={queryKeys.classificacoesReceita(accountId)}
      invalidarPrefixo={['classificacoes-receita']}
      carregar={() => fetchClassificacoesReceita(accountId)}
      salvar={(values, id) => saveClassificacaoReceita(values, id, accountId)}
      alternar={id => toggleClassificacaoReceita(id, accountId)}
      destaque={DESTAQUE_RECEITA}
      textos={TEXTOS}
      exigeSubcategoria={localStorage.getItem('contaAtivaTipo') !== 'empresa'}
    />
  );
}
