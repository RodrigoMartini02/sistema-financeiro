import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bot, Briefcase, CreditCard, KeyRound, Layers,
  Tag, UserCheck, Users, Activity, ShoppingBag,
} from 'lucide-react';
import { Drawer } from '../ui/drawer';
import { fetchMe } from '../services/usuariosService';
import { SecurityTab } from '../screens/config/SecurityTab';
import { ContasTab } from '../screens/config/ContasTab';
import { CategoriasTab } from '../screens/config/CategoriasTab';
import { CartaoTab } from '../screens/config/CartaoTab';
import { ServicosTab } from '../screens/config/ServicosTab';
import { RepresentantesTab } from '../screens/config/RepresentantesTab';
import { SociosTab } from '../screens/config/SociosTab';
import { UsuariosTab } from '../screens/config/UsuariosTab';
import { AcessosTab } from '../screens/config/AcessosTab';
import { IntegracoesIaTab } from '../screens/config/IntegracoesIaTab';
import { CatalogoTab } from '../screens/config/CatalogoTab';

export type ConfigItemId =
  | 'seguranca' | 'contas'
  | 'categorias' | 'cartoes' | 'servicos' | 'representantes' | 'socios' | 'usuarios'
  | 'acessos' | 'integracoes-ia' | 'catalogo';

const ANALYTICS_ALLOWED_DOCUMENT = '08996441988';

const ITEMS: { id: ConfigItemId; label: string; icon: React.ElementType }[] = [
  { id: 'contas',         label: 'Contas',         icon: Layers },
  { id: 'seguranca',      label: 'Segurança',      icon: KeyRound },
  { id: 'categorias',     label: 'Categorias',     icon: Tag },
  { id: 'cartoes',        label: 'Cartões',        icon: CreditCard },
  { id: 'servicos',       label: 'Catálogo de serviços', icon: Layers },
  { id: 'catalogo',       label: 'Catálogo de produtos', icon: ShoppingBag },
  { id: 'representantes', label: 'Representantes', icon: UserCheck },
  { id: 'socios',         label: 'Sócios',         icon: Briefcase },
  { id: 'usuarios',       label: 'Usuários',       icon: Users },
  { id: 'acessos',        label: 'Acessos',        icon: Activity },
  { id: 'integracoes-ia', label: 'Integrações de IA', icon: Bot },
];

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
  const isAdminOrMaster = meTipo === 'admin' || meTipo === 'master';
  const canViewAnalytics = meDocument === ANALYTICS_ALLOWED_DOCUMENT;
  const isMaster = meTipo === 'master';
  const contaTipo = localStorage.getItem('contaAtivaTipo');

  const [activeItem, setActiveItemState] = useResettableItem(open, initialItem);
  const setActiveItem = (item: ConfigItemId) => {
    setActiveItemState(item);
    onItemChange?.(item);
  };

  const visibleItems = ITEMS.filter((item) => {
    if (item.id === 'acessos') return canViewAnalytics;
    if (item.id === 'integracoes-ia') return isMaster;
    if (item.id === 'representantes' || item.id === 'socios') return contaTipo !== 'pessoal';
    return true;
  });

  const current = ITEMS.find((item) => item.id === activeItem) ?? ITEMS[0]!;

  return (
    <Drawer open={open} title="Configurações" subtitle={current.label} onClose={onClose} variant="centered" scrollBody={false}>
      <div className="flex h-full min-h-[420px] flex-col gap-4 sm:flex-row sm:gap-6">
        <nav className="scrollbar-thin flex shrink-0 gap-1 overflow-x-auto pb-2 sm:w-[188px] sm:flex-col sm:gap-0.5 sm:overflow-y-auto sm:overflow-x-visible sm:space-y-0.5 sm:border-r sm:border-slate-100 sm:pb-0 sm:pr-4 dark:sm:border-slate-800">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeItem;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveItem(item.id)}
                className={[
                  'flex h-9 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 text-left text-[13px] font-medium transition sm:w-full',
                  isActive
                    ? 'bg-brand-50 text-brand-700 font-semibold dark:bg-brand-900/30 dark:text-brand-300'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
                ].join(' ')}
              >
                <Icon size={15} className={isActive ? 'text-brand-600 dark:text-brand-300' : 'text-slate-400'} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto">
          {activeItem === 'seguranca' && <SecurityTab />}
          {activeItem === 'contas' && <ContasTab />}
          {activeItem === 'categorias' && <CategoriasTab />}
          {activeItem === 'cartoes' && <CartaoTab />}
          {activeItem === 'servicos' && <ServicosTab />}
          {activeItem === 'catalogo' && <CatalogoTab />}
          {activeItem === 'representantes' && <RepresentantesTab />}
          {activeItem === 'socios' && <SociosTab />}
          {activeItem === 'usuarios' && isAdminOrMaster && <UsuariosTab userTipo={meTipo ?? 'admin'} />}
          {activeItem === 'usuarios' && !isAdminOrMaster && (
            <p className="py-8 text-center text-sm text-slate-400">Acesso restrito a administradores.</p>
          )}
          {activeItem === 'acessos' && canViewAnalytics && <AcessosTab />}
          {activeItem === 'integracoes-ia' && isMaster && <IntegracoesIaTab />}
        </div>
      </div>
    </Drawer>
  );
}
