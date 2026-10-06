import { Compass, Construction, Lock } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { EmptyState } from '../../ui/EmptyState';
import { useTenderAccess } from '../hooks/useTenderAccess';
import { canOpenSettings } from '../utils/navigation';

// Páginas provisórias da Fase 3: cada rota existe e abre dentro da moldura; as
// telas de verdade chegam na Fase 4.

const UNDER_CONSTRUCTION = 'Esta tela está em construção.';

function PageTitle({ title }: { title: string }) {
  return <h1 className="mb-4 text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>;
}

export function PlaceholderScreen({ title }: { title: string }) {
  return (
    <section>
      <PageTitle title={title} />
      <EmptyState icon={Construction} title={UNDER_CONSTRUCTION} />
    </section>
  );
}

/** Buscar: mostra o termo da busca rápida (`?q=`). */
export function SearchPlaceholderScreen() {
  const [params] = useSearchParams();
  const query = params.get('q')?.trim();
  return (
    <section>
      <PageTitle title="Buscar" />
      <EmptyState
        icon={Construction}
        title={UNDER_CONSTRUCTION}
        description={query ? `Termo recebido da busca rápida: "${query}"` : undefined}
      />
    </section>
  );
}

export function NoticePlaceholderScreen() {
  const { id } = useParams();
  return (
    <section>
      <PageTitle title="Edital" />
      <EmptyState icon={Construction} title={UNDER_CONSTRUCTION} description={id ? `Edital ${id}` : undefined} />
    </section>
  );
}

/** Configurações: equipe (titular) e coleta (titular ou admin). */
export function SettingsPlaceholderScreen() {
  const access = useTenderAccess(true);
  const allowed = access.data ? canOpenSettings(access.data.permissions) : false;
  return (
    <section>
      <PageTitle title="Configurações" />
      {allowed ? (
        <EmptyState icon={Construction} title={UNDER_CONSTRUCTION} />
      ) : (
        <EmptyState icon={Lock} title="Só o titular da conta acessa as configurações do módulo." />
      )}
    </section>
  );
}

export function NotFoundScreen() {
  return (
    <section>
      <PageTitle title="Página não encontrada" />
      <EmptyState
        icon={Compass}
        title="Este endereço não existe em Licitações."
        action={
          <Link to="/" className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400">
            Voltar para o Início
          </Link>
        }
      />
    </section>
  );
}
