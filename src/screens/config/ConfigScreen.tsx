import { useQuery } from '@tanstack/react-query';
import { fetchMe } from '../../services/usuariosService';
import { CategoriasTab } from './CategoriasTab';
import { CartaoTab } from './CartaoTab';
import { MinhaContaTab } from './MinhaContaTab';
import { UsuariosTab } from './UsuariosTab';
import { PerfisTab } from './PerfisTab';
import { RepresentantesTab } from './RepresentantesTab';
import { SociosTab } from './SociosTab';
import { ClientesTab } from './ClientesTab';
import { ServicosTab } from './ServicosTab';
import type { ConfigTab } from '../../layout/AppShell';

interface ConfigScreenProps {
  activeTab?: ConfigTab;
  onTabChange?: (tab: ConfigTab) => void;
}

const TAB_TITLES: Record<ConfigTab, string> = {
  conta:          'Minha conta',
  categorias:     'Categorias',
  cartoes:        'Cartões',
  perfis:         'Perfis',
  representantes: 'Representantes',
  socios:         'Sócios',
  usuarios:       'Usuários',
  clientes:       'Clientes',
  servicos:       'Serviços',
};

export function ConfigScreen({ activeTab = 'conta' }: ConfigScreenProps) {
  const { data: me } = useQuery({ queryKey: ['usuario-me'], queryFn: fetchMe });
  const isAdminOrMaster = me?.tipo === 'admin' || me?.tipo === 'master';

  return (
    <div className="mx-auto grid max-w-7xl gap-6">
      <div>
        <p className="text-sm font-semibold text-brand-700">Preferências do sistema</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-950">{TAB_TITLES[activeTab]}</h2>
      </div>

      <div>
        {activeTab === 'conta'          && <MinhaContaTab />}
        {activeTab === 'categorias'     && <CategoriasTab />}
        {activeTab === 'cartoes'        && <CartaoTab />}
        {activeTab === 'perfis'         && <PerfisTab />}
        {activeTab === 'representantes' && <RepresentantesTab />}
        {activeTab === 'socios'         && <SociosTab />}
        {activeTab === 'clientes'       && <ClientesTab />}
        {activeTab === 'servicos'       && <ServicosTab />}
        {activeTab === 'usuarios'       && isAdminOrMaster && <UsuariosTab userTipo={me?.tipo ?? 'admin'} />}
        {activeTab === 'usuarios'       && !isAdminOrMaster && (
          <p className="py-8 text-center text-sm text-slate-400">Acesso restrito a administradores.</p>
        )}
      </div>
    </div>
  );
}
