import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../ui/EmptyState';

/** Endereço que não existe dentro do app do módulo. */
export function NotFoundScreen() {
  return (
    <section>
      <h1 className="mb-4 text-xl font-bold text-slate-900 dark:text-slate-100">Página não encontrada</h1>
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
