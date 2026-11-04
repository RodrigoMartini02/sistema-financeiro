import { Building2, CalendarClock, Filter, Landmark, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../ui/EmptyState';
import type { DashboardView } from '../types';
import { agencyItems, deadlineWeekItems, funnelItems, sphereItems, stateItems } from '../utils/dashboard';
import { CountBars } from './CountBars';
import { DashboardCard, dashboardLinkClass } from './DashboardCard';

// Os blocos do Dashboard que são barras de contagem: funil, carga de prazos, UF, esfera e órgãos.

/** Funil dos últimos 30 dias: acompanhados, vou participar e participei, com a % de cada etapa sobre a anterior. */
export function FunnelCard({ funnel }: { funnel: DashboardView['funnel'] }) {
  return (
    <DashboardCard title="Funil de acompanhamento" subtitle="Editais que entraram em análise ou em Vou participar nos últimos 30 dias" className="h-full">
      {funnel.tracked === 0 ? (
        <EmptyState
          icon={Filter}
          title="Nenhum edital acompanhado nos últimos 30 dias."
          action={
            <Link to="/buscar" className={dashboardLinkClass}>
              Ver editais
            </Link>
          }
        />
      ) : (
        <CountBars label="Funil de acompanhamento" labelSize="wide" items={funnelItems(funnel)} />
      )}
    </DashboardCard>
  );
}

/** Carga de prazos: quantos acompanhados encerram em cada uma das próximas 4 semanas. */
export function DeadlineLoadCard({ load }: { load: DashboardView['deadlineLoad'] }) {
  return (
    <DashboardCard title="Carga de prazos" subtitle="Acompanhados com prazo aberto que encerram em cada semana, nas próximas 4" className="h-full">
      {load.every((week) => week.count === 0) ? (
        <EmptyState icon={CalendarClock} title="Nenhum prazo de edital acompanhado nas próximas 4 semanas." />
      ) : (
        <CountBars label="Carga de prazos por semana" labelSize="wide" items={deadlineWeekItems(load)} />
      )}
    </DashboardCard>
  );
}

/** Editais abertos por UF das buscas salvas ativas (top 10). */
export function StatesCard({ openByState }: { openByState: DashboardView['openByState'] }) {
  return (
    <DashboardCard title="Abertos por UF" subtitle="Das suas buscas salvas ativas (top 10)" className="h-full">
      {openByState.length === 0 ? (
        <EmptyState icon={MapPin} title="Sem dados ainda." description="O gráfico usa os editais abertos das suas buscas salvas." />
      ) : (
        <CountBars label="Editais abertos por UF" items={stateItems(openByState)} />
      )}
    </DashboardCard>
  );
}

/** Esfera (federal, estadual, municipal) dos editais abertos na base. */
export function SphereCard({ openBySphere }: { openBySphere: DashboardView['openBySphere'] }) {
  return (
    <DashboardCard title="Esfera dos abertos" subtitle="Editais abertos na base, por esfera do órgão" className="h-full">
      {openBySphere.length === 0 ? (
        <EmptyState icon={Landmark} title="Nenhum edital aberto na base." />
      ) : (
        <CountBars label="Editais abertos por esfera" labelSize="wide" items={sphereItems(openBySphere)} />
      )}
    </DashboardCard>
  );
}

/** Os órgãos que mais publicaram nos últimos 30 dias (top 10), com link para a página do CNPJ. */
export function AgenciesCard({ topAgencies }: { topAgencies: DashboardView['topAgencies'] }) {
  return (
    <DashboardCard title="Quem mais publica" subtitle="Órgãos com mais editais publicados nos últimos 30 dias (top 10)" className="h-full">
      {topAgencies.length === 0 ? (
        <EmptyState icon={Building2} title="Nenhum edital publicado nos últimos 30 dias." />
      ) : (
        <CountBars label="Órgãos que mais publicam" labelSize="stacked" items={agencyItems(topAgencies)} />
      )}
    </DashboardCard>
  );
}
