import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/EmptyState';
import { LoadError, LoadingBlock } from '../components/LoadStates';
import { NoticeCard } from '../components/NoticeCard';
import { Pagination } from '../components/Pagination';
import { fetchNotices } from '../services/noticesService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { NoticeSearchResult } from '../types';
import { SCREEN_MIN_HEIGHT_CLASS } from '../utils/screenLayout';
import { DEFAULT_SEARCH_STATE, favoritesApiQuery, parseSearchParams, toSearchParams } from '../utils/searchFilters';

/**
 * Favoritos da pessoa logada: todos os editais marcados com o coração,
 * inclusive os encerrados e os descartados, pelo prazo. A página fica na URL
 * (`pagina` e `porPagina`, como em Buscar).
 */
export function FavoritesScreen() {
  const [params, setParams] = useSearchParams();
  const { page, perPage } = parseSearchParams(params);
  const apiQuery = favoritesApiQuery(page, perPage);
  const favorites = useQuery<NoticeSearchResult, TendersApiError>({
    queryKey: tendersQueryKeys.noticeSearch(apiQuery),
    queryFn: () => fetchNotices(apiQuery),
    placeholderData: keepPreviousData,
  });

  const goTo = (next: { page: number; perPage: number }) => {
    setParams(toSearchParams({ ...DEFAULT_SEARCH_STATE, ...next }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const data = favorites.data;
  let content;
  if (favorites.isPending) {
    content = <LoadingBlock label="Carregando os favoritos…" />;
  } else if (favorites.isError || !data) {
    content = (
      <LoadError
        title="Não foi possível carregar os favoritos"
        message={favorites.error?.message ?? 'Tente de novo em instantes.'}
        onRetry={() => void favorites.refetch()}
        retrying={favorites.isFetching}
      />
    );
  } else if (data.total === 0) {
    content = (
      <EmptyState
        icon={Heart}
        title="Você ainda não tem favoritos."
        description="Marque o coração de um edital, em Buscar ou na página dele, para encontrá-lo aqui."
        action={
          <Link to="/buscar" className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
            Ir para Buscar
          </Link>
        }
      />
    );
  } else if (data.items.length === 0) {
    content = (
      <EmptyState
        icon={Heart}
        title="Esta página não tem favoritos."
        action={
          <Button type="button" variant="secondary" size="sm" onClick={() => goTo({ page: 1, perPage })}>
            Voltar para a primeira página
          </Button>
        }
      />
    );
  } else {
    content = (
      <div className={`flex flex-1 flex-col gap-4 transition-opacity ${favorites.isPlaceholderData ? 'opacity-60' : ''}`}>
        <ul className="grid grid-cols-1 gap-3">
          {data.items.map((notice) => (
            <li key={notice.id}>
              <NoticeCard notice={notice} detailLink={`/editais/${notice.id}`} />
            </li>
          ))}
        </ul>
        {/* Lista curta: a paginação desce até o rodapé da tela. */}
        <div className="mt-auto">
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            perPage={data.perPage}
            onPage={(next) => goTo({ page: next, perPage })}
            onPerPage={(next) => goTo({ page: 1, perPage: next })}
          />
        </div>
      </div>
    );
  }

  return (
    <section className={`flex flex-col ${SCREEN_MIN_HEIGHT_CLASS}`}>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
        Os editais que você marcou com o coração, inclusive os encerrados, pela data de encerramento. Só você vê os seus favoritos.
      </p>
      {content}
    </section>
  );
}
