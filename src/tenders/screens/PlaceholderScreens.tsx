import { Compass, Construction, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../ui/EmptyState';
import { useTenderAccess } from '../hooks/useTenderAccess';
import { canOpenSettings } from '../utils/navigation';

// Páginas provisórias da Fase 3 para as rotas que ainda não têm a tela de
// verdade (Acompanhamento, Notificações e Configurações, na Parte 4B).

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
