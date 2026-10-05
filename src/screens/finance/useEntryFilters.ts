import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCategorias } from '../../services/configService';
import { fetchMembros } from '../../services/membrosService';
import { fetchMe } from '../../services/usuariosService';
import { queryKeys } from '../../services/queryKeys';
import { getActiveAccountId } from '../../services/apiClient';
import { useOwnPermissions } from '../../hooks/useOwnPermissions';
import { canReadCatalogList } from '../../utils/screenAccess';
import type { FilterGroup } from '../../ui/MultiFilterPanel';
import { categoryFilterOptions } from '../../utils/categorySuggestions';
import { TERMOS } from '../config/ContasTab';
import { getPaymentMethodLabel } from './entryTable';
import type { EntryType, ExpenseStatus, PaymentDateWindow } from '../../utils/expenseFilters';

export interface EntryFilterState {
  types: Set<EntryType>;
  statuses: Set<ExpenseStatus>;
  /** Ids das categorias; marcar o grupo marca o pai e as subcategorias. */
  categoryIds: Set<string>;
  paymentMethods: Set<string>;
  cardIds: Set<string>;
  paymentDates: Set<PaymentDateWindow>;
  /** Ids das pessoas; começa só com quem está logado. */
  memberIds: Set<string>;
}

interface EntryFilterOptions {
  /** Formas de pagamento que existem nos lançamentos carregados. */
  paymentMethods: string[];
  /** Cartões dos lançamentos carregados: [id, nome]. */
  cards: [string, string][];
}

const ALL_TYPES: EntryType[] = ['receita', 'despesa'];

/**
 * Botão de filtros dos lançamentos (Movimentações e Relatórios): o estado de
 * cada grupo, os grupos prontos para o MultiFilterPanel e o escopo de pessoas.
 * Quem usa decide onde aplicar (Movimentações na tela; Relatórios no backend).
 */
export function useEntryFilters({ paymentMethods, cards }: EntryFilterOptions) {
  const accountId = getActiveAccountId();
  const meQ = useQuery({ queryKey: ['usuario-me'], queryFn: fetchMe, staleTime: 5 * 60_000 });
  const membersQ = useQuery({
    queryKey: queryKeys.membros(accountId),
    queryFn: () => fetchMembros(accountId ?? undefined),
    staleTime: 5 * 60_000,
  });
  // Quem só lança receitas não lê categorias de despesa: o filtro fica sem elas.
  const canReadCategories = canReadCatalogList(useOwnPermissions() ?? {}, 'expenseCategories');
  const categoriesQ = useQuery({
    queryKey: queryKeys.categorias(accountId),
    queryFn: () => fetchCategorias(accountId),
    enabled: canReadCategories,
    staleTime: 5 * 60_000,
  });

  const [types, setTypes] = useState<Set<EntryType>>(new Set(ALL_TYPES));
  const [statuses, setStatuses] = useState<Set<ExpenseStatus>>(new Set());
  const [categoryIds, setCategoryIds] = useState<Set<string>>(new Set());
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<Set<string>>(new Set());
  const [cardIds, setCardIds] = useState<Set<string>>(new Set());
  const [paymentDates, setPaymentDates] = useState<Set<PaymentDateWindow>>(new Set());
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());

  const meId = meQ.data ? String(meQ.data.id) : null;
  useEffect(() => {
    if (!meId) return;
    setMemberIds((previous) => (previous.size === 0 ? new Set([meId]) : previous));
  }, [meId]);

  const otherMembers = (membersQ.data ?? []).filter((member) => member.usuario_id !== meQ.data?.id);
  const familyScope = [...memberIds].some((id) => id !== meId);
  // Nome completo (nome + sobrenome) para bater com os nomes que vêm do
  // backend nos lançamentos — só o primeiro nome nunca casaria.
  const visibleNames = new Set(
    [...memberIds]
      .map((id) => {
        if (id === meId) return meQ.data?.nomeExibicao ?? meQ.data?.nome;
        const member = otherMembers.find((item) => String(item.usuario_id) === id);
        return member ? `${member.nome} ${member.sobrenome ?? ''}`.trim() : undefined;
      })
      .filter(Boolean) as string[],
  );

  const categoryOptions = categoryFilterOptions(categoriesQ.data ?? []);

  const membersAreDefault = meId != null && memberIds.size === 1 && memberIds.has(meId);
  const hasActiveFilters = statuses.size > 0 || categoryIds.size > 0 || selectedPaymentMethods.size > 0
    || cardIds.size > 0 || paymentDates.size > 0 || !membersAreDefault || types.size !== ALL_TYPES.length;

  const groups: FilterGroup[] = [
    {
      id: 'tipo',
      label: 'Tipo',
      options: [
        { value: 'receita', label: 'Receita' },
        { value: 'despesa', label: 'Despesa' },
      ],
      selected: types,
      onChange: (next) => setTypes(next as Set<EntryType>),
    },
    // Grupos de despesa só aparecem com "Despesa" marcado: não fazem sentido para receita.
    ...(types.has('despesa') ? [
      {
        id: 'status',
        label: 'Status',
        options: [
          { value: 'pago', label: 'Pago' },
          { value: 'em_dia', label: 'Em dia' },
          { value: 'atrasada', label: 'Atrasada' },
        ],
        selected: statuses,
        onChange: (next: Set<string>) => setStatuses(next as Set<ExpenseStatus>),
      },
      { id: 'categoria', label: 'Categoria', options: categoryOptions, selected: categoryIds, onChange: setCategoryIds },
      {
        id: 'forma-pagamento',
        label: 'Forma de pagamento',
        options: paymentMethods.map((method) => ({ value: method, label: getPaymentMethodLabel(method) })),
        selected: selectedPaymentMethods,
        onChange: setSelectedPaymentMethods,
      },
      ...(cards.length > 0 ? [{
        id: 'cartao',
        label: 'Cartão',
        options: cards.map(([id, name]) => ({ value: id, label: name })),
        selected: cardIds,
        onChange: setCardIds,
      }] : []),
      {
        id: 'data-pagamento',
        label: 'Data de pagamento',
        options: [
          { value: 'hoje', label: 'Pago hoje' },
          { value: 'semana', label: 'Esta semana' },
          { value: 'mes', label: 'Este mês' },
        ],
        selected: paymentDates,
        onChange: (next: Set<string>) => setPaymentDates(next as Set<PaymentDateWindow>),
      },
    ] : []),
    // Pessoas sempre visível: não depende do filtro de Tipo.
    ...((membersQ.data?.length ?? 0) > 0 && meQ.data ? [{
      id: 'membros',
      label: TERMOS[(localStorage.getItem('contaAtivaTipo') === 'empresa' ? 'empresa' : 'pessoal')].plural,
      options: [
        { value: meId!, label: `${meQ.data.nomeExibicao ?? meQ.data.nome} (você)` },
        ...otherMembers.map((member) => ({ value: String(member.usuario_id), label: `${member.nome} ${member.sobrenome ?? ''}`.trim() })),
      ],
      selected: memberIds,
      onChange: setMemberIds,
    }] : []),
  ];

  const clear = () => {
    setTypes(new Set(ALL_TYPES));
    setStatuses(new Set());
    setCategoryIds(new Set());
    setSelectedPaymentMethods(new Set());
    setCardIds(new Set());
    setPaymentDates(new Set());
    if (meId) setMemberIds(new Set([meId]));
  };

  const state: EntryFilterState = {
    types, statuses, categoryIds, paymentMethods: selectedPaymentMethods, cardIds, paymentDates, memberIds,
  };

  return { state, groups, hasActiveFilters, clear, meId, familyScope, visibleNames };
}
