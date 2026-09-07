import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Users } from 'lucide-react';
import { fetchMembros, type MembroListItem } from '../../services/membrosService';
import {
  fetchMemberPermissions, updateMemberPermissions, PERMISSION_GROUPS,
  type PermissionFlag, type MemberPermissionsData,
} from '../../services/permissoesService';
import { C } from '../../ui/dialogFormTokens';
import { CFG } from '../../ui/configTokens';
import { ToggleRow } from '../../ui/form';
import { EmptyState } from '../../ui/EmptyState';

/**
 * Libera telas do sistema para cada membro da conta.
 *
 * Antes isso era um modal aberto por um badge discreto na lista de membros —
 * um <span> com a mesma aparência dos rótulos informativos ao lado. Virou tela
 * própria porque a funcionalidade existia mas não era encontrada.
 *
 * Só lista membros ativos: convite pendente ainda não tem a quem atribuir, e
 * membro desativado não acessa nada de qualquer forma.
 */
export function PermissoesTab({ contaTipo }: { contaTipo: 'pessoal' | 'empresa' }) {
  const qc = useQueryClient();
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [error, setError] = useState('');

  const membrosQuery = useQuery({ queryKey: ['membros'], queryFn: fetchMembros });
  const ativos = (membrosQuery.data ?? []).filter((m) => m.membro_status === 'ativo');

  // Seleciona o primeiro assim que a lista chega, para a tela não abrir com o
  // painel da direita vazio sem motivo aparente.
  useEffect(() => {
    if (selecionado === null && ativos.length > 0) setSelecionado(ativos[0]!.usuario_id);
  }, [ativos, selecionado]);

  const membro = ativos.find((m) => m.usuario_id === selecionado);

  const permissionsQuery = useQuery({
    queryKey: ['membro-permissoes', selecionado],
    queryFn: () => fetchMemberPermissions(selecionado!),
    enabled: selecionado !== null,
  });

  const toggleMut = useMutation({
    mutationFn: ({ flag, value }: { flag: PermissionFlag; value: boolean }) =>
      updateMemberPermissions(selecionado!, { [flag]: value }),
    onSuccess: (data) => {
      qc.setQueryData(['membro-permissoes', selecionado], data);
      setError('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const permissions: MemberPermissionsData | undefined = permissionsQuery.data;
  // O grupo comercial trata de clientes e contratos: não existe em conta pessoal.
  const visibleGroups = PERMISSION_GROUPS.filter((g) => g.id !== 'comercial' || contaTipo === 'empresa');

  if (membrosQuery.isLoading) {
    return <p style={{ padding: 20, fontSize: 12.5, color: CFG.muted }}>Carregando membros...</p>;
  }

  if (ativos.length === 0) {
    return (
      <div style={{ padding: 20 }}>
        <EmptyState
          icon={Users}
          title="Nenhum membro para configurar"
          description={`Cadastre alguém em ${contaTipo === 'empresa' ? 'Colaboradores' : 'Membros da família'} para liberar telas do sistema.`}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: CFG.muted }}>
        Por padrão um membro não acessa nenhuma tela. Escolha a pessoa e libere o que ela pode usar.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]" style={{ alignItems: 'start' }}>

        {/* Pessoas */}
        <div role="listbox" aria-label="Membros" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ativos.map((m) => (
            <PessoaBotao
              key={m.usuario_id}
              membro={m}
              ativo={m.usuario_id === selecionado}
              onSelect={() => { setSelecionado(m.usuario_id); setError(''); }}
            />
          ))}
        </div>

        {/* Permissões da pessoa selecionada */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 12,
          background: CFG.surface, border: `1px solid ${CFG.border}`, borderRadius: 12, padding: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <ShieldCheck size={14} style={{ flex: 'none', color: CFG.primary }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: CFG.text }}>
              {membro?.nome ?? 'Selecione um membro'}
            </span>
          </div>

          {permissionsQuery.isLoading ? (
            <p style={{ padding: '20px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>
              Carregando permissões...
            </p>
          ) : permissions ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {visibleGroups.map((group) => (
                <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <p style={{ margin: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: CFG.faint }}>
                    {group.label} · {group.items.length} permiss{group.items.length !== 1 ? 'ões' : 'ão'}
                  </p>
                  {group.items.map(({ flag, label }) => (
                    <ToggleRow
                      key={flag}
                      label={label}
                      checked={permissions[flag]}
                      disabled={toggleMut.isPending}
                      onChange={() => toggleMut.mutate({ flag, value: !permissions[flag] })}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : null}

          {error && (
            <div role="alert" style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PessoaBotao({ membro, ativo, onSelect }: { membro: MembroListItem; ativo: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={ativo}
      onClick={onSelect}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
        width: '100%', textAlign: 'left', cursor: 'pointer',
        borderRadius: 10, padding: '8px 10px',
        border: `1px solid ${ativo ? CFG.primary : CFG.border}`,
        background: ativo ? CFG.primarySoft : CFG.surface,
        transition: 'all .13s ease',
      }}
    >
      <span style={{
        fontSize: 13, fontWeight: 600, color: ativo ? CFG.primaryDark : CFG.text,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%',
      }}>
        {membro.nome}
      </span>
      <span style={{
        fontSize: 11, color: CFG.faint,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%',
      }}>
        {membro.email}
      </span>
    </button>
  );
}
