import { apiRequest } from './apiClient';

export interface AnalyticsSummary {
  total_accounts: number;
  accounts_in_period: number;
  active_accounts: number;
  cancelled_accounts: number;
  page_views_total: number;
  page_views_in_period: number;
  logins_total: number;
  logins_in_period: number;
  login_users_in_period: number;
}

export interface AnalyticsDailyItem {
  date: string;
  page_views: number;
  logins: number;
  accounts: number;
}

export interface AnalyticsTopPage {
  path: string | null;
  views: number;
}

export interface AnalyticsRecentAccount {
  id: number;
  nome: string;
  email: string;
  tipo: string;
  status: string;
  data_cadastro: string;
}

export interface AnalyticsOverview {
  days: number;
  eventsAvailable: boolean;
  summary: AnalyticsSummary;
  daily: AnalyticsDailyItem[];
  topPages: AnalyticsTopPage[];
  recentAccounts: AnalyticsRecentAccount[];
}

export async function fetchAnalyticsOverview(days: number): Promise<AnalyticsOverview> {
  return apiRequest<AnalyticsOverview>(`/analytics/overview?days=${days}`);
}

export function trackPageView(path: string): void {
  void apiRequest('/analytics/page-view', {
    method: 'POST',
    body: JSON.stringify({ path }),
  }).catch(() => {
    // Analytics must never block the public page experience.
  });
}