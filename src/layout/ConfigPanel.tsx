import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bot, Briefcase, CreditCard, KeyRound, Layers,
  Tag, UserCheck, Activity, Crown, UsersRound, ShieldCheck,
} from 'lucide-react';
import { Drawer } from '../ui/drawer';
import { CFG, CONFIG_SCOPE_CLASS, cfgNavGroupLabelStyle } from '../ui/configTokens';
import { fetchMe } from '../services/usuariosService';
import { PlanosScreen } from '../screens/planos/PlanosScreen';
import { SecurityTab } from '../screens/config/SecurityTab';
import { ContasTab } from '../screens/config/ContasTab';
import { CategoriasTab } from '../screens/config/CategoriasTab';
import { CartaoTab } from '../screens/config/CartaoTab';
import { ServicosTab } from '../screens/config/ServicosTab';
import { RepresentantesTab } from '../screens/config/RepresentantesTab';
import { SociosTab } from '../screens/config/SociosTab';
import { MembrosTab } from '../screens/config/MembrosTab';
import { PermissoesTab } from '../screens/config/PermissoesTab';
import { AcessosTab } from '../screens/config/AcessosTab';
import { IntegracoesIaTab } from '../screens/config/IntegracoesIaTab';

export type ConfigItemId =
  | 'seguranca' | 'contas' | 'assinatura'
  | 'categorias' | 'cartoes' | 'servicos' | 'representantes' | 'socios' | 'usuarios' | 'membros' | 'permissoes'
  | 'acessos' | 'integracoes-ia' | 'catalogo';

const ANALYTICS_ALLOWED_DOCUMENT = '08996441988';

type ConfigGroupLabel = 'Geral' | 'Finanças' | 'Pessoas' | 'Avançado';

// `group` define apenas o agrupamento visual da navegação. A ordem dentro de
// cada grupo é a ordem desta lista; a visibilidade continua sendo decidida
// pelo filtro em `visibleItems`, sem qualquer relação com o grupo.
const ITEMS: { id: ConfigItemId; label: string; icon: React.ElementType; group: ConfigGroupLabel }[] = [
  { id: 'contas',         label: 'Contas',         icon: Layers,     group: 'Geral' },
  { id: 'assinatura',     label: 'Assinatura',     icon: Crown,      group: 'Geral' },
  { id: 'seguranca',      label: 'Segurança',      icon: KeyRound,   group: 'Geral' },
  { id: 'categorias',     label: 'Categorias',     icon: Tag,        group: 'Finanças' },
  { id: 'cartoes',        label: 'Cartões',        icon: CreditCard, group: 'Finanças' },
  { id: 'servicos',       label: 'Catálogo de serviços', icon: Layers, group: 'Finanças' },
  { id: 'representantes', label: 'Representantes', icon: UserCheck,  group: 'Pessoas' },
  { id: 'socios',         label: 'Sócios',         icon: Briefcase,  group: 'Pessoas' },
  { id: 'membros',        label: 'Membros da família', icon: UsersRound, group: 'Pessoas' },
  { id: 'permissoes',     label: 'Permissões',         icon: ShieldCheck, group: 'Pessoas' },
  { id: 'acessos',        label: 'Acessos',        icon: Activity,   group: 'Pessoas' },
  { id: 'integracoes-ia', label: 'Integrações de IA', icon: Bot,     group: 'Avançado' },
];

const GROUP_ORDER: ConfigGroupLabel[] = ['Geral', 'Finanças', 'Pessoas', 'Avançado'];

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
  const meTipo = me?.tipo;
  const meDocument = (me?.documento ?? '').replace(/\D/g, '');
  const isAdmin = meTipo === 'admin';
  const isGestor = meTipo === 'gestor' || isAdmin;
  const canViewAnalytics = meDocument === ANALYTICS_ALLOWED_DOCUMENT;
  const contaTipo = localStorage.getItem('contaAtivaTipo');

  const [activeItem, setActiveItemState] = useResettableItem(open, initialItem);
  const setActiveItem = (item: ConfigItemId) => {
    setActiveItemState(item);
    onItemChange?.(item);
  };

  const visibleItems = ITEMS.filter((item) => {
    if (item.id === 'acessos') return canViewAnalytics;
    if (item.id === 'integracoes-ia') return isAdmin;
    // Membros da familia e as permissoes deles so existem em conta pessoal:
    // em conta empresa cada colaborador segue isolado.
    if (item.id === 'membros' || item.id === 'permissoes') return isGestor && contaTipo === 'pessoal';
    // PJ-only: catalogo alimenta contratos e faturamento; representantes e
    // socios nao existem em conta pessoal.
    if (item.id === 'representantes' || item.id === 'socios' || item.id === 'servicos') {
      return contaTipo !== 'pessoal';
    }
    return true;
  });

  const current = visibleItems.find((item) => item.id === activeItem) ?? visibleItems[0] ?? ITEMS[0]!;

  // Agrupamento puramente visual, aplicado sobre a lista já filtrada:
  // grupos sem itens visíveis não renderizam cabeçalho.
  const groupedItems = GROUP_ORDER
    .map((group) => ({ group, items: visibleItems.filter((item) => item.group === group) }))
    .filter((entry) => entry.items.length > 0);

  return (
    <Drawer open={open} title="Configurações" subtitle={current.label} onClose={onClose} variant="centered" scrollBody={false}>
      <div className={[CONFIG_SCOPE_CLASS, 'flex h-full min-h-[420px] flex-col gap-4 sm:flex-row sm:gap-6'].join(' ')}>
        <nav className="scrollbar-thin flex shrink-0 gap-1 overflow-x-auto pb-2 sm:w-[188px] sm:flex-col sm:gap-0 sm:overflow-y-auto sm:overflow-x-visible sm:border-r sm:pb-0 sm:pr-4"
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
          {current.id === 'seguranca' && <SecurityTab />}
          {current.id === 'contas' && <ContasTab />}
          {current.id === 'assinatura' && <PlanosScreen embedded />}
          {current.id === 'categorias' && <CategoriasTab />}
          {current.id === 'cartoes' && <CartaoTab />}
          {current.id === 'servicos' && <ServicosTab />}
          {current.id === 'representantes' && <RepresentantesTab />}
          {current.id === 'socios' && <SociosTab />}
          {current.id === 'membros' && <MembrosTab contaTipo={contaTipo === 'empresa' ? 'empresa' : 'pessoal'} />}
          {current.id === 'permissoes' && <PermissoesTab contaTipo={contaTipo === 'empresa' ? 'empresa' : 'pessoal'} />}
          {current.id === 'acessos' && canViewAnalytics && <AcessosTab />}
          {current.id === 'integracoes-ia' && isAdmin && <IntegracoesIaTab />}
        </div>
      </div>
    </Drawer>
  );
}
