import {
  fetchClassificacoesReceita,
  saveClassificacaoReceita,
  toggleClassificacaoReceita,
} from '../../services/incomeClassificationsService';
import { getActiveAccountId } from '../../services/apiClient';
import { queryKeys } from '../../services/queryKeys';
import { CatalogoEmArvore, type TextosCatalogo } from './CatalogoEmArvore';

const DESTAQUE_RECEITA = '#059669'; // classificações representam receitas

const TEXTOS: TextosCatalogo = {
  singular: 'classificação',
  plural: 'classificações',
  exemploNome: 'Ex: Salário',
  descricaoVazio: 'Crie classificações para organizar receitas e relatórios.',
  ondeSomeAoDesativar: 'nas opções de classificação ao lançar receitas',
  tituloPadrao: 'Classificação padrão do sistema',
};

export function ClassificacoesReceitaTab() {
  const accountId = getActiveAccountId();
  return (
    <CatalogoEmArvore
      queryKey={queryKeys.classificacoesReceita(accountId)}
      invalidarPrefixo={['classificacoes-receita']}
      carregar={() => fetchClassificacoesReceita(accountId)}
      salvar={(values, id) => saveClassificacaoReceita(values, id, accountId)}
      alternar={(id) => toggleClassificacaoReceita(id, accountId)}
      destaque={DESTAQUE_RECEITA}
      textos={TEXTOS}
    />
  );
}
