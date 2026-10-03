import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bot, CreditCard, HandCoins, Layers,
  Tag, UserCheck, Activity, Crown, ShieldCheck, ShoppingBag,
} from 'lucide-react';
import { Drawer } from '../ui/drawer';
import { CFG, CONFIG_SCOPE_CLASS, cfgNavGroupLabelStyle } from '../ui/configTokens';
import { fetchMe } from '../services/usuariosService';
import { useOwnPermissions } from '../hooks/useOwnPermissions';
import {
  isAnalyticsViewer, isConfigItemVisible, type AccountType, type ConfigItemContext, type PermissionSet,
} from '../utils/screenAccess';
import { PlanosScreen } from '../screens/planos/PlanosScreen';
import { ContasTab } from '../screens/config/ContasTab';
import { CategoriasTab } from '../screens/config/CategoriasTab';
import { ClassificacoesReceitaTab } from '../screens/config/ClassificacoesReceitaTab';
import { CartaoTab } from '../screens/config/CartaoTab';
import { ServicosTab } from '../screens/config/ServicosTab';
import { RepresentantesTab } from '../screens/config/RepresentantesTab';
import { PermissoesTab } from '../screens/config/PermissoesTab';
import { AcessosTab } from '../screens/config/AcessosTab';
import { IntegracoesIaTab } from '../screens/config/IntegracoesIaTab';
import { CatalogoTab } from '../screens/config/CatalogoTab';

export type ConfigItemId =
  | 'contas' | 'assinatura'
  | 'categorias' | 'classificacoes-receita' | 'cartoes' | 'servicos' | 'representantes' | 'usuarios' | 'permissoes'
  | 'acessos' | 'integracoes-ia' | 'catalogo';

type ConfigGroupLabel = 'Geral' | 'Finanças' | 'Pessoas' | 'Avançado';

// `group` define apenas o agrupamento visual da navegação. A ordem dentro de
// cada grupo é a ordem desta lista; a visibilidade é decidida por
// isConfigItemVisible (utils/screenAccess.ts), sem qualquer relação com o grupo.
const ITEMS: { id: ConfigItemId; label: string; icon: React.ElementType; group: ConfigGroupLabel }[] = [
  { id: 'contas',         label: 'Contas',         icon: Layers,     group: 'Geral' },
  { id: 'assinatura',     label: 'Assinatura',     icon: Crown,      group: 'Geral' },
  { id: 'categorias',     label: 'Categorias Despesas', icon: Tag,        group: 'Finanças' },
  { id: 'classificacoes-receita', label: 'Categorias Receitas', icon: HandCoins, group: 'Finanças' },
  { id: 'cartoes',        label: 'Cartões',        icon: CreditCard, group: 'Finanças' },
  { id: 'servicos',       label: 'Catálogo de serviços', icon: Layers, group: 'Finanças' },
  { id: 'catalogo',       label: 'Produtos e estoque', icon: ShoppingBag, group: 'Finanças' },
  { id: 'representantes', label: 'Representantes', icon: UserCheck,  group: 'Pessoas' },
  { id: 'permissoes',     label: 'Permissões',         icon: ShieldCheck, group: 'Pessoas' },
  { id: 'acessos',        label: 'Acessos',        icon: Activity,   group: 'Pessoas' },
  { id: 'integracoes-ia', label: 'Integrações de IA', icon: Bot,     group: 'Avançado' },
];

const GROUP_ORDER: ConfigGroupLabel[] = ['Geral', 'Finanças', 'Pessoas', 'Avançado'];

/** Quem vê o painel: tipo de usuário e documento do cadastro, e o tipo da conta ativa. */
export function configItemContext(
  user: { tipo?: string; documento?: string } | undefined,
  accountType: AccountType | null,
): ConfigItemContext {
  const isAdmin = user?.tipo === 'admin';
  return {
    isOwner: user?.tipo === 'titular' || isAdmin,
    isAdmin,
    canViewAnalytics: isAnalyticsViewer(user),
    accountType,
  };
}

/** Algum item a mostrar: sem nenhum, o acesso às Configurações some. */
export function hasVisibleConfigItems(permissions: PermissionSet, context: ConfigItemContext): boolean {
  return ITEMS.some((item) => isConfigItemVisible(item.id, permissions, context));
}

interface ConfigPanelProps {
  open: boolean;
  initialItem?: ConfigItemId;
  onClose: () => void;
  onItemChange?: (item: ConfigItemId) => void;
}

// Reseta para o item inicial sempre que o drawer é reaberto (transição fechado → aberto),
// mas preserva a navegação livre enquanto ele permanece aberto.
function useResettableItem(open: boolean, initialItem: ConfigItemId) {
  const [item, setItem] = useState<ConfigItemId>(initialItem);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setItem(initialItem);
    }
    wasOpen.current = open;
  }, [open, initialItem]);

  return [item, setItem] as const;
}

export function ConfigPanel({ open, initialItem = 'contas', onClose, onItemChange }: ConfigPanelProps) {
  const { data: me } = useQuery({ queryKey: ['usuario-me'], queryFn: fetchMe, enabled: open });
  const contaTipo = localStorage.getItem('contaAtivaTipo');
  const permissions = useOwnPermissions() ?? {};
  const context = configItemContext(me, contaTipo as AccountType | null);
  const { isAdmin, isOwner: isGestor, canViewAnalytics } = context;

  const [activeItem, setActiveItemState] = useResettableItem(open, initialItem);
  const setActiveItem = (item: ConfigItemId) => {
    setActiveItemState(item);
    onItemChange?.(item);
  };

  const visibleItems = ITEMS.filter((item) => isConfigItemVisible(item.id, permissions, context));

  const current = visibleItems.find((item) => item.id === activeItem) ?? visibleItems[0] ?? ITEMS[0]!;

  // Agrupamento puramente visual, aplicado sobre a lista já filtrada:
  // grupos sem itens visíveis não renderizam cabeçalho.
  const groupedItems = GROUP_ORDER
    .map((group) => ({ group, items: visibleItems.filter((item) => item.group === group) }))
    .filter((entry) => entry.items.length > 0);

  return (
    <Drawer open={open} title="Configurações" subtitle={current.label} onClose={onClose} variant="centered" scrollBody={false}>
      <div className={[CONFIG_SCOPE_CLASS, 'flex h-full min-h-[420px] flex-col gap-4 sm:flex-row sm:gap-6'].join(' ')}>
        <nav className="scrollbar-thin flex shrink-0 gap-1 overflow-x-auto pb-2 sm:w-[228px] sm:flex-col sm:gap-0 sm:overflow-y-auto sm:overflow-x-visible sm:border-r sm:pb-0 sm:pr-4"
          style={{ borderColor: CFG.borderSoft }}
        >
          {groupedItems.map(({ group, items }) => (
            <div key={group} className="flex shrink-0 gap-1 sm:block sm:w-full">
              <span style={cfgNavGroupLabelStyle} className="hidden sm:block">{group}</span>
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === activeItem;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveItem(item.id)}
                    className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[10px] text-left sm:w-full"
                    style={{
                      height: 30,
                      padding: '0 8px',
                      fontSize: 12.5,
                      lineHeight: 1.15,
                      fontWeight: isActive ? 600 : 500,
                      background: isActive ? CFG.primarySoft : 'transparent',
                      color: isActive ? CFG.primaryDark : CFG.chipText,
                      transition: 'background .13s ease, color .13s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = CFG.chipBg;
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <Icon size={13} style={{ flex: 'none' }} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto">
          {/* current.id, nao activeItem: current cai no primeiro item visivel
              quando o ativo deixa de existir para a conta. Sem isso, trocar de
              conta empresa para pessoal com o catalogo aberto continuaria
              renderizando uma tela que o menu ja escondeu. */}
          {current.id === 'contas' && <ContasTab isGestor={isGestor} meId={me?.id} me={me} />}
          {current.id === 'assinatura' && <PlanosScreen embedded />}
          {current.id === 'categorias' && <CategoriasTab />}
          {current.id === 'classificacoes-receita' && <ClassificacoesReceitaTab />}
          {current.id === 'cartoes' && <CartaoTab />}
          {current.id === 'servicos' && <ServicosTab />}
          {current.id === 'catalogo' && <CatalogoTab />}
          {current.id === 'representantes' && <RepresentantesTab />}
          {current.id === 'permissoes' && <PermissoesTab contaTipo={contaTipo === 'empresa' ? 'empresa' : 'pessoal'} />}
          {current.id === 'acessos' && canViewAnalytics && <AcessosTab />}
          {current.id === 'integracoes-ia' && isAdmin && <IntegracoesIaTab />}
        </div>
      </div>
    </Drawer>
  );
}
