import { ArrowLeft, FileSearch } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { EmptyState } from '../../ui/EmptyState';
import { NoticeDetailView } from '../components/NoticeDetailView';

/** Edital em página própria (/editais/:id), aberta também pelos links das notificações. */
export function NoticeScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const noticeId = id && /^\d+$/.test(id) && Number(id) > 0 ? Number(id) : null;
  // Chegou por link direto (primeira página aberta no app): voltar leva para Buscar.
  const canGoBack = location.key !== 'default';

  return (
    <section className="mx-auto max-w-4xl">
      <button
        type="button"
        onClick={() => (canGoBack ? navigate(-1) : navigate('/buscar'))}
        className="mb-3 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-slate-600 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-slate-300 dark:hover:text-brand-300"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Voltar
      </button>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
        {noticeId === null ? (
          <EmptyState
            icon={FileSearch}
            title="Edital não encontrado."
            action={
              <Link to="/buscar" className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
                Ir para Buscar
              </Link>
            }
          />
        ) : (
          <NoticeDetailView key={noticeId} noticeId={noticeId} inDrawer={false} />
        )}
      </div>
    </section>
  );
}
