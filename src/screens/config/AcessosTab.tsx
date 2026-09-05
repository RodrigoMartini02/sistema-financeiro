import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, LogIn, RefreshCw, UserPlus, Users } from 'lucide-react';
import { fetchAnalyticsOverview } from '../../services/analyticsService';
import { Button } from '../../ui/button';
import { ErrorState } from '../../ui/states';
import { ToggleGroup } from '../../ui/form';
import { InfoBanner } from '../../ui/InfoBanner';
import { CFG } from '../../ui/configTokens';

const PERIOD_OPTIONS = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
];

function numberFormat(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString('pt-BR');
}

function dateFormat(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function AcessosTab() {
  const [days, setDays] = useState(30);

  const overviewQuery = useQuery({
    queryKey: ['analytics-overview', days],
    queryFn: () => fetchAnalyticsOverview(days),
    staleTime: 60_000,
  });

  const overview = overviewQuery.data;

  if (overviewQuery.isError) {
    return (
      <ErrorState
        title="Não foi possível carregar os acessos"
        description={overviewQuery.error.message}
      />
    );
  }

  const summary = overview?.summary;

  const cards = [
    {
      label: 'Logins',
      value: summary?.logins_in_period,
      total: summary?.logins_total,
      icon: LogIn,
      iconBg: CFG.successBg,
      iconFg: CFG.success,
    },
    {
      label: 'Contas criadas',
      value: summary?.accounts_in_period,
      total: summary?.total_accounts,
      icon: UserPlus,
      iconBg: CFG.primarySoft,
      iconFg: CFG.primaryDark,
    },
    {
      label: 'Usuários ativos',
      value: summary?.active_accounts,
      total: summary?.total_accounts,
      icon: Users,
      iconBg: CFG.chipBg,
      iconFg: CFG.chipText,
    },
  ];

  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, lineHeight: 1.2, color: CFG.text }}>
            Resumo dos últimos {days} dias
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11.5, fontWeight: 500, lineHeight: 1.3, color: CFG.muted }}>
            Logins e novas contas do sistema
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            value={String(days)}
            options={PERIOD_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
            onChange={(v) => setDays(Number(v))}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={14} className={overviewQuery.isFetching ? 'animate-spin' : ''} />}
            onClick={() => overviewQuery.refetch()}
          >
            Atualizar
          </Button>
        </div>
      </div>

      {overview && !overview.eventsAvailable && (
        <InfoBanner variant="warn">
          <AlertCircle size={13} style={{ flex: 'none' }} />
          Estatísticas de login ainda não disponíveis — contas criadas já aparecem abaixo.
        </InfoBanner>
      )}

      <div className="grid gap-2.5 sm:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                borderRadius: 12, border: `1px solid ${CFG.border}`, background: CFG.surface,
                padding: '10px 12px',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{
                  margin: 0, fontSize: 9.5, fontWeight: 700, lineHeight: 1,
                  letterSpacing: '.08em', textTransform: 'uppercase', color: CFG.faint,
                }}>
                  {card.label}
                </p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1, color: CFG.text }}>
                    {numberFormat(card.value)}
                  </span>
                  <span style={{ fontSize: 10.5, fontWeight: 500, lineHeight: 1, color: CFG.muted }}>
                    de {numberFormat(card.total)} no total
                  </span>
                </div>
              </div>
              <span style={{
                flex: 'none', display: 'grid', placeItems: 'center', width: 28, height: 28,
                borderRadius: '50%', background: card.iconBg, color: card.iconFg,
              }}>
                <Icon size={14} />
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1, color: CFG.text }}>Últimas contas criadas</span>
        <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1, color: CFG.muted }}>
          {(overview?.recentAccounts ?? []).length} registros
        </span>
      </div>

      <div className="grid gap-1.5">
        {(overview?.recentAccounts ?? []).length === 0 ? (
          <p style={{ padding: '24px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>
            Nenhuma conta encontrada.
          </p>
        ) : (
          overview!.recentAccounts.map((account) => (
            <div
              key={account.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, minHeight: 38, padding: '0 12px',
                borderRadius: 12, border: `1px solid ${CFG.border}`, background: CFG.surface,
                boxShadow: CFG.shadowRow,
              }}
            >
              <span style={{
                flex: 'none', display: 'grid', placeItems: 'center', width: 24, height: 24,
                borderRadius: '50%', background: CFG.chipBg,
                fontSize: 10, fontWeight: 700, color: CFG.chipText,
              }}>
                {account.nome.slice(0, 1).toUpperCase()}
              </span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: CFG.text, whiteSpace: 'nowrap' }}>
                  {account.nome}
                </span>
                <span style={{
                  fontSize: 11.5, fontWeight: 500, color: CFG.muted,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {account.email}
                </span>
              </span>
              <span style={{
                flex: 'none', padding: '4px 7px', borderRadius: 999,
                fontSize: 9.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
                background: account.tipo === 'admin' ? CFG.primarySoft : CFG.chipBg,
                color: account.tipo === 'admin' ? CFG.primaryDark : CFG.chipText,
              }}>
                {account.tipo}
              </span>
              <span style={{ flex: 'none', fontSize: 11.5, fontWeight: 500, color: CFG.muted }}>
                {dateFormat(account.data_cadastro)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
