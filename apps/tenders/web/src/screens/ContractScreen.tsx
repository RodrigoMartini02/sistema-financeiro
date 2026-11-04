import { ArrowLeft, FileSearch } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { EmptyState } from '../../ui/EmptyState';
import { ContractDetailView } from '../components/ContractDetailView';
import { contractKeyFromParam } from '../utils/contractKey';

/** Contrato em página própria (/contratos/:chave), aberta também pelos links das notificações. */
export function ContractScreen() {
  const { chave } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const contractKey = contractKeyFromParam(chave);
  // Chegou por link direto (primeira página aberta no app): voltar leva para Contratos a vencer.
  const canGoBack = location.key !== 'default';

  return (
    <section>
      <button
        type="button"
        onClick={() => (canGoBack ? navigate(-1) : navigate('/contratos'))}
        className="mb-3 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-slate-600 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-slate-300 dark:hover:text-brand-300"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Voltar
      </button>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
        {contractKey === null ? (
          <EmptyState
            icon={FileSearch}
            title="Contrato não encontrado."
            action={
              <Link to="/contratos" className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
                Ir para Contratos a vencer
              </Link>
            }
          />
        ) : (
          <ContractDetailView key={contractKey} contractKey={contractKey} inDrawer={false} />
        )}
      </div>
    </section>
  );
}
